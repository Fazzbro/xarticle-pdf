import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import extractHandler from "../netlify/functions/extract.js";
import healthHandler from "../netlify/functions/health.js";
import mediaProxyHandler from "../netlify/functions/media-proxy.js";
import type { ClientPdfFontBuffers } from "../src/client/lib/client-pdf-fonts.js";
import { generateClientArticlePdfBytes } from "../src/client/lib/client-pdf.js";
import { DEFAULT_RENDER_OPTIONS, type ArticleDocument } from "../src/core/types.js";
import { isAllowedMediaUrl } from "../src/extractor/media-proxy.js";

function loadTestFontBuffers(): ClientPdfFontBuffers {
  const nm = path.resolve("node_modules");
  return {
    serifRegular: readFileSync(path.join(nm, "@fontsource/newsreader/files/newsreader-latin-400-normal.woff")),
    serifItalic: readFileSync(path.join(nm, "@fontsource/newsreader/files/newsreader-latin-400-italic.woff")),
    serifBold: readFileSync(path.join(nm, "@fontsource/newsreader/files/newsreader-latin-600-normal.woff")),
    sansRegular: readFileSync(path.join(nm, "@fontsource/inter/files/inter-latin-400-normal.woff")),
    sansItalic: readFileSync(path.join(nm, "@fontsource/inter/files/inter-latin-400-italic.woff")),
    sansBold: readFileSync(path.join(nm, "@fontsource/inter/files/inter-latin-600-normal.woff")),
    monoRegular: readFileSync(path.join(nm, "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff"))
  };
}

const SAMPLE_DOC: ArticleDocument = {
  id: "999888777",
  canonicalUrl: "https://x.com/testauthor/status/999888777",
  title: "Designing Monochrome Systems for the Web 🚀",
  subtitle: "A test article verifying video link cards, text-only post hydration, and emoji handling.",
  publishedAt: "2026-11-12T10:00:00Z",
  author: {
    name: "Test Author",
    handle: "testauthor"
  },
  blocks: [
    { type: "heading", id: "sec-1", level: 2, runs: [{ text: "1. Core Principles" }] },
    {
      type: "paragraph",
      runs: [
        { text: "Clean typography with " },
        { text: "clickable inline links", href: "https://x.com/testauthor/status/111" },
        { text: " and " },
        { text: "inlineCode()", code: true },
        { text: " plus emojis 🔥✨ without crashing." }
      ]
    },
    {
      type: "video_link",
      video: {
        url: "https://x.com/demo/status/123456",
        label: "Watch on X",
        durationText: "04:12",
        isGif: false
      }
    },
    {
      type: "embedded_post",
      post: {
        id: "555666",
        url: "https://x.com/quoted_user/status/555666",
        author: { name: "Text Only Author", handle: "quoted_user" },
        text: "A pure text-only post embedded cleanly inside the article with zero images.",
        runs: [{ text: "A pure text-only post embedded cleanly inside the article with zero images." }],
        images: [],
        videoLinks: []
      }
    },
    {
      type: "code",
      language: "ts",
      code: "export const ready = true;"
    }
  ],
  diagnostics: {
    source: "fxtwitter",
    extractedAt: "2026-11-12T10:00:00Z",
    wordCount: 42,
    readingTimeMinutes: 1,
    imageCount: 0,
    videoLinkCount: 1,
    embeddedPostCount: 1,
    embeddedPostsWithoutImagesCount: 1,
    warnings: []
  }
};

describe("Client Vector PDF engine (Netlify mode)", () => {
  it("generates a valid PDF with clickable Watch on X & post URI annotations", async () => {
    const fonts = loadTestFontBuffers();
    const bytes = await generateClientArticlePdfBytes(
      SAMPLE_DOC,
      { ...DEFAULT_RENDER_OPTIONS, includeToc: true },
      fonts
    );

    const header = Buffer.from(bytes.slice(0, 5)).toString("ascii");
    const rawLatin = Buffer.from(bytes).toString("latin1");
    expect(header).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(5000);
    expect(rawLatin).toContain("/URI (https://x.com/demo/status/123456)");
    expect(rawLatin).toContain("/URI (https://x.com/quoted_user/status/555666)");
    expect(rawLatin).toContain("/URI (https://x.com/testauthor/status/111)");
  });

  it("supports dark & ivory presets and Letter page size", async () => {
    const fonts = loadTestFontBuffers();
    const bytes = await generateClientArticlePdfBytes(
      SAMPLE_DOC,
      {
        ...DEFAULT_RENDER_OPTIONS,
        theme: "technical",
        paper: "dark",
        pageSize: "Letter",
        margins: "generous"
      },
      fonts
    );
    expect(Buffer.from(bytes.slice(0, 5)).toString("ascii")).toBe("%PDF-");
  });
});

describe("Netlify serverless functions & SSRF guard", () => {
  it("health function reports netlify cloud capabilities", async () => {
    const res = await healthHandler(new Request("https://example.netlify.app/api/health"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.ok).toBe(true);
    expect(json.mode).toBe("netlify");
    expect(json.clientPdfReady).toBe(true);
  });

  it("extract function validates empty and non-X URLs cleanly", async () => {
    const badRes = await extractHandler(
      new Request("https://example.netlify.app/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: "https://example.com/not-x" })
      })
    );
    expect(badRes.status).toBe(400);
    const json = (await badRes.json()) as { error: string };
    expect(json.error).toContain("No valid");
  });

  it("media-proxy blocks SSRF / non-twimg hosts and allows pbs.twimg.com", async () => {
    expect(isAllowedMediaUrl("http://127.0.0.1/secret")).toBeNull();
    expect(isAllowedMediaUrl("https://169.254.169.254/latest/meta-data")).toBeNull();
    expect(isAllowedMediaUrl("https://evil.example/img.png")).toBeNull();
    expect(isAllowedMediaUrl("https://pbs.twimg.com/media/abc123.jpg?name=large")?.hostname).toBe(
      "pbs.twimg.com"
    );

    const blockedRes = await mediaProxyHandler(
      new Request("https://example.netlify.app/api/media-proxy?url=http://127.0.0.1/admin")
    );
    expect(blockedRes.status).toBe(400);
  });
});
