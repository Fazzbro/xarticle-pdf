import { existsSync } from "node:fs";
import { chromium, type Browser } from "playwright-core";
import type { ArticleDocument, RenderOptions } from "../core/types.js";
import { buildArticleHtml, escapeHtml } from "./html-builder.js";
import { getMarginMm } from "./styles.js";

const CANDIDATE_BROWSER_PATHS = [
  process.env.CHROMIUM_PATH,
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  // Windows Chrome & Edge
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  // macOS
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  // Linux
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/microsoft-edge"
].filter((p): p is string => Boolean(p));

export function findBrowserExecutable(): string | undefined {
  for (const candidate of CANDIDATE_BROWSER_PATHS) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

let sharedBrowser: Browser | null = null;
let browserLaunchPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (sharedBrowser && sharedBrowser.isConnected()) {
    return sharedBrowser;
  }
  if (browserLaunchPromise) {
    return browserLaunchPromise;
  }

  browserLaunchPromise = (async () => {
    const executablePath = findBrowserExecutable();
    if (!executablePath) {
      throw new Error(
        "No local Chromium-based browser (Chrome or Edge) was found. Set CHROMIUM_PATH to a Chrome/Edge executable."
      );
    }
    const browser = await chromium.launch({
      executablePath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--font-render-hinting=none"
      ]
    });
    browser.on("disconnected", () => {
      sharedBrowser = null;
    });
    sharedBrowser = browser;
    return browser;
  })();

  try {
    return await browserLaunchPromise;
  } finally {
    browserLaunchPromise = null;
  }
}

export async function closePdfBrowser(): Promise<void> {
  if (sharedBrowser) {
    await sharedBrowser.close().catch(() => {});
    sharedBrowser = null;
  }
}

export function buildPdfFilename(doc: ArticleDocument): string {
  const handle = doc.author.handle.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "x";
  const slug =
    doc.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || doc.id;
  return `${handle}-${slug}.pdf`;
}

export async function generateArticlePdf(
  doc: ArticleDocument,
  options: RenderOptions
): Promise<Buffer> {
  const html = buildArticleHtml(doc, options);
  const browser = await getBrowser();
  const context = await browser.newContext({ viewport: { width: 900, height: 1200 } });
  const page = await context.newPage();

  try {
    await page.setContent(html, { waitUntil: "load" });
    await page.emulateMedia({ media: "print" });

    // Ensure all bundled WOFF2 fonts & base64/remote images are decoded before printing
    await page.evaluate(async () => {
      await document.fonts.ready;
      const imgs = Array.from(document.images);
      await Promise.all(
        imgs.map((img) =>
          img.complete
            ? img.decode().catch(() => {})
            : new Promise<void>((resolve) => {
                img.addEventListener("load", () => resolve(), { once: true });
                img.addEventListener("error", () => resolve(), { once: true });
                setTimeout(resolve, 4000);
              })
        )
      );
    });

    const margins = getMarginMm(options.margins);
    const shortTitle = escapeHtml(
      doc.title.length > 68 ? `${doc.title.slice(0, 65)}...` : doc.title
    );
    const authorTag = escapeHtml(`@${doc.author.handle}`);
    const mutedColor = options.paper === "dark" ? "#94A3B8" : "#64748B";

    const headerTemplate = options.includeRunningHeaderFooter
      ? `<div style="width:100%;font-family:Inter,Arial,sans-serif;font-size:8px;color:${mutedColor};padding:0 ${margins.right} 0 ${margins.left};display:flex;justify-content:space-between;align-items:center;">
          <span>${shortTitle}</span>
          <span>${authorTag}</span>
        </div>`
      : "<span></span>";

    const footerTemplate = options.includeRunningHeaderFooter
      ? `<div style="width:100%;font-family:Inter,Arial,sans-serif;font-size:8px;color:${mutedColor};padding:0 ${margins.right} 0 ${margins.left};display:flex;justify-content:space-between;align-items:center;">
          <span>x.com/${authorTag.replace(/^@/, "")}</span>
          <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
        </div>`
      : "<span></span>";

    const pdfBytes = await page.pdf({
      format: options.pageSize,
      printBackground: true,
      displayHeaderFooter: options.includeRunningHeaderFooter,
      headerTemplate,
      footerTemplate,
      margin: {
        top: margins.top,
        right: margins.right,
        bottom: margins.bottom,
        left: margins.left
      }
    });

    return Buffer.from(pdfBytes);
  } finally {
    await context.close().catch(() => {});
  }
}
