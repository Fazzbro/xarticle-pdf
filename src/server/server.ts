import path from "node:path";
import { fileURLToPath } from "node:url";
import archiver from "archiver";
import express, { type Express } from "express";
import { z } from "zod";
import { DEFAULT_RENDER_OPTIONS, type ArticleDocument, type RenderOptions } from "../core/types.js";
import { extractArticle } from "../extractor/index.js";
import { fetchProxiedMedia } from "../extractor/media-proxy.js";
import { extractXUrlsFromText, resolveShortUrlsInText } from "../extractor/url.js";
import { buildArticleHtml } from "../renderer/html-builder.js";
import { buildArticleMarkdown } from "../renderer/markdown.js";
import { buildPdfFilename, findBrowserExecutable, generateArticlePdf } from "../renderer/pdf-generator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(__dirname, "..", "web");

const RenderOptionsSchema = z
  .object({
    theme: z.enum(["editorial", "sans", "technical"]).optional(),
    paper: z.enum(["light", "ivory", "dark"]).optional(),
    pageSize: z.enum(["A4", "Letter"]).optional(),
    margins: z.enum(["compact", "balanced", "generous"]).optional(),
    fontScale: z.number().min(0.8).max(1.3).optional(),
    includeCover: z.boolean().optional(),
    includeHeader: z.boolean().optional(),
    includeRunningHeaderFooter: z.boolean().optional(),
    includeToc: z.boolean().optional(),
    includeVideoPoster: z.boolean().optional(),
    includeStats: z.boolean().optional()
  })
  .optional();

function mergeOptions(partial?: z.infer<typeof RenderOptionsSchema>): RenderOptions {
  return {
    ...DEFAULT_RENDER_OPTIONS,
    ...(partial ?? {})
  };
}

// Simple bounded in-memory cache of recently extracted documents so preview & export stay fast
const DOCUMENT_CACHE = new Map<string, ArticleDocument>();
function cacheDocument(doc: ArticleDocument) {
  if (DOCUMENT_CACHE.size >= 40) {
    const oldest = DOCUMENT_CACHE.keys().next().value;
    if (oldest) DOCUMENT_CACHE.delete(oldest);
  }
  DOCUMENT_CACHE.set(doc.id, doc);
}

function resolveDocument(payload: { documentId?: string; document?: unknown }): ArticleDocument | null {
  if (payload.document && typeof payload.document === "object") {
    return payload.document as ArticleDocument;
  }
  if (payload.documentId && DOCUMENT_CACHE.has(payload.documentId)) {
    return DOCUMENT_CACHE.get(payload.documentId)!;
  }
  return null;
}

export function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: "35mb" }));

  app.get("/api/health", (_req, res) => {
    const browserExecutable = findBrowserExecutable();
    res.json({
      ok: true,
      mode: "local",
      browserReady: Boolean(browserExecutable),
      clientPdfReady: true,
      browserFallbackAvailable: true,
      browserExecutable: browserExecutable ?? null
    });
  });

  app.get("/api/media-proxy", async (req, res) => {
    const rawUrl = typeof req.query.url === "string" ? req.query.url : "";
    const result = await fetchProxiedMedia(rawUrl);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(Buffer.from(result.bytes));
  });

  app.post("/api/extract", async (req, res) => {
    const schema = z.object({
      input: z.string().min(1, "Please paste at least one X link."),
      allowBrowserFallback: z.boolean().optional()
    });

    const parsedBody = schema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ error: parsedBody.error.issues[0]?.message ?? "Invalid request." });
      return;
    }

    const expandedInput = await resolveShortUrlsInText(parsedBody.data.input);
    const { urls, invalidLines } = extractXUrlsFromText(expandedInput);
    if (urls.length === 0) {
      res.status(400).json({
        error: "No valid X/Twitter article or post links found.",
        invalidLines
      });
      return;
    }

    const articles: ArticleDocument[] = [];
    const errors: Array<{ url: string; message: string }> = [];

    // Bounded concurrency (3 articles at a time)
    const queue = [...urls];
    const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        try {
          const doc = await extractArticle(item.normalizedUrl, {
            allowBrowserFallback: parsedBody.data.allowBrowserFallback ?? true,
            inlineMedia: true
          });
          cacheDocument(doc);
          articles.push(doc);
        } catch (err) {
          errors.push({
            url: item.normalizedUrl,
            message: err instanceof Error ? err.message : String(err)
          });
        }
      }
    });
    await Promise.all(workers);

    // Preserve user input order
    const orderMap = new Map(urls.map((u, idx) => [u.id, idx]));
    articles.sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999));

    res.json({ articles, errors, invalidLines });
  });

  app.post("/api/preview", (req, res) => {
    const schema = z.object({
      documentId: z.string().optional(),
      document: z.unknown().optional(),
      options: RenderOptionsSchema
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid preview request." });
      return;
    }
    const doc = resolveDocument(parsed.data);
    if (!doc) {
      res.status(404).json({ error: "Article document not found in session cache." });
      return;
    }
    const html = buildArticleHtml(doc, mergeOptions(parsed.data.options));
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  });

  app.post("/api/export-pdf", async (req, res) => {
    const schema = z.object({
      items: z
        .array(
          z.object({
            documentId: z.string().optional(),
            document: z.unknown().optional()
          })
        )
        .min(1),
      options: RenderOptionsSchema
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid export request." });
      return;
    }

    const docs = parsed.data.items.map(resolveDocument).filter((d): d is ArticleDocument => d !== null);
    if (docs.length === 0) {
      res.status(404).json({ error: "No extracted articles available to export." });
      return;
    }

    const options = mergeOptions(parsed.data.options);

    try {
      if (docs.length === 1) {
        const doc = docs[0];
        const pdf = await generateArticlePdf(doc, options);
        const filename = buildPdfFilename(doc);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Content-Length", String(pdf.length));
        res.send(pdf);
        return;
      }

      // Batch ZIP archive of PDFs
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="x-articles-export.zip"`);

      const archive = archiver("zip", { zlib: { level: 6 } });
      archive.on("error", (err) => {
        if (!res.headersSent) {
          res.status(500).json({ error: err.message });
        }
      });
      archive.pipe(res);

      const usedNames = new Set<string>();
      for (const doc of docs) {
        const pdf = await generateArticlePdf(doc, options);
        let name = buildPdfFilename(doc);
        if (usedNames.has(name)) {
          name = name.replace(/\.pdf$/i, `-${doc.id}.pdf`);
        }
        usedNames.add(name);
        archive.append(pdf, { name });
      }

      await archive.finalize();
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({
          error: err instanceof Error ? err.message : "Failed to generate PDF."
        });
      }
    }
  });

  app.post("/api/export-markdown", (req, res) => {
    const schema = z.object({
      documentId: z.string().optional(),
      document: z.unknown().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request." });
      return;
    }
    const doc = resolveDocument(parsed.data);
    if (!doc) {
      res.status(404).json({ error: "Article document not found." });
      return;
    }
    const md = buildArticleMarkdown(doc);
    const filename = buildPdfFilename(doc).replace(/\.pdf$/i, ".md");
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(md);
  });

  app.post("/api/export-html", (req, res) => {
    const schema = z.object({
      documentId: z.string().optional(),
      document: z.unknown().optional(),
      options: RenderOptionsSchema
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request." });
      return;
    }
    const doc = resolveDocument(parsed.data);
    if (!doc) {
      res.status(404).json({ error: "Article document not found." });
      return;
    }
    const html = buildArticleHtml(doc, mergeOptions(parsed.data.options));
    const filename = buildPdfFilename(doc).replace(/\.pdf$/i, ".html");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(html);
  });

  app.use(express.static(webDir));
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(webDir, "index.html"));
  });

  return app;
}
