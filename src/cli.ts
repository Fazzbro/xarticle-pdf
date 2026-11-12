#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_RENDER_OPTIONS, type RenderOptions } from "./core/types.js";
import { extractArticle } from "./extractor/index.js";
import { extractXUrlsFromText } from "./extractor/url.js";
import { buildArticleMarkdown } from "./renderer/markdown.js";
import { buildPdfFilename, closePdfBrowser, generateArticlePdf } from "./renderer/pdf-generator.js";

function printHelp() {
  console.log(`
xarticle-pdf — Export X (Twitter) Articles as structured PDFs

Usage:
  xarticle-pdf <url...> [options]
  xarticle-pdf --file <urls.txt> [options]

Options:
  --out <dir>          Output directory (default: ./exports)
  --theme <preset>     editorial | sans | technical (default: editorial)
  --paper <preset>     light | ivory | dark (default: light)
  --size <preset>      A4 | Letter (default: A4)
  --margins <preset>   compact | balanced | generous (default: balanced)
  --toc                Include Table of Contents
  --video-poster       Include static video thumbnail beside video link
  --stats              Include likes/reposts/views strip
  --markdown           Also save .md alongside .pdf
  --no-browser         Disable ego-browser fallback for gated/internal links
  --help, -h           Show this help
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  let outDir = path.resolve(process.cwd(), "exports");
  let allowBrowserFallback = true;
  let saveMarkdown = false;
  const options: RenderOptions = { ...DEFAULT_RENDER_OPTIONS };
  const rawInputs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--out" && args[i + 1]) {
      outDir = path.resolve(process.cwd(), args[++i]);
    } else if (arg === "--file" && args[i + 1]) {
      const content = await readFile(args[++i], "utf8");
      rawInputs.push(content);
    } else if (arg === "--theme" && args[i + 1]) {
      const val = args[++i];
      if (val === "editorial" || val === "sans" || val === "technical") options.theme = val;
    } else if (arg === "--paper" && args[i + 1]) {
      const val = args[++i];
      if (val === "light" || val === "ivory" || val === "dark") options.paper = val;
    } else if (arg === "--size" && args[i + 1]) {
      const val = args[++i];
      if (val === "A4" || val === "Letter") options.pageSize = val;
    } else if (arg === "--margins" && args[i + 1]) {
      const val = args[++i];
      if (val === "compact" || val === "balanced" || val === "generous") options.margins = val;
    } else if (arg === "--toc") {
      options.includeToc = true;
    } else if (arg === "--video-poster") {
      options.includeVideoPoster = true;
    } else if (arg === "--stats") {
      options.includeStats = true;
    } else if (arg === "--markdown") {
      saveMarkdown = true;
    } else if (arg === "--no-browser") {
      allowBrowserFallback = false;
    } else if (!arg.startsWith("-")) {
      rawInputs.push(arg);
    }
  }

  const { urls } = extractXUrlsFromText(rawInputs.join("\n"));
  if (urls.length === 0) {
    console.error("Error: No valid X/Twitter article or status URLs found.");
    process.exitCode = 1;
    return;
  }

  await mkdir(outDir, { recursive: true });

  for (const item of urls) {
    console.log(`Extracting: ${item.normalizedUrl}`);
    const doc = await extractArticle(item.normalizedUrl, { allowBrowserFallback, inlineMedia: true });
    const pdf = await generateArticlePdf(doc, options);
    const filename = buildPdfFilename(doc);
    const pdfPath = path.join(outDir, filename);
    await writeFile(pdfPath, pdf);
    console.log(
      `Saved PDF: ${pdfPath} (${doc.diagnostics.wordCount} words, ${doc.diagnostics.imageCount} images, ${doc.diagnostics.videoLinkCount} video links, ${doc.diagnostics.embeddedPostCount} embedded posts)`
    );

    if (saveMarkdown) {
      const mdPath = pdfPath.replace(/\.pdf$/i, ".md");
      await writeFile(mdPath, buildArticleMarkdown(doc), "utf8");
      console.log(`Saved Markdown: ${mdPath}`);
    }
  }
}

main()
  .catch((err) => {
    console.error("Fatal:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePdfBrowser();
  });
