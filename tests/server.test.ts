import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/server/server.js";
import { closePdfBrowser } from "../src/renderer/pdf-generator.js";
import { DEFAULT_RENDER_OPTIONS, type ArticleDocument } from "../src/core/types.js";

const SAMPLE_DOC: ArticleDocument = {
  id: "test-server-doc",
  canonicalUrl: "https://x.com/test/status/1900000000000000555",
  title: "Server API Verification Article",
  author: { name: "Test Author", handle: "test" },
  blocks: [
    { type: "paragraph", runs: [{ text: "Server integration body text." }] },
    {
      type: "video_link",
      video: {
        url: "https://x.com/test/status/1900000000000000555",
        label: "Video in article",
        isGif: false
      }
    },
    {
      type: "embedded_post",
      post: {
        id: "1900000000000000666",
        url: "https://x.com/embedded/status/1900000000000000666",
        author: { name: "Embedded Author", handle: "embedded" },
        text: "Text-only post inside article.",
        runs: [{ text: "Text-only post inside article." }],
        images: [],
        videoLinks: []
      }
    }
  ],
  diagnostics: {
    source: "fxtwitter",
    extractedAt: new Date().toISOString(),
    wordCount: 15,
    readingTimeMinutes: 1,
    imageCount: 0,
    videoLinkCount: 1,
    embeddedPostCount: 1,
    embeddedPostsWithoutImagesCount: 1,
    warnings: []
  }
};

let server: ReturnType<ReturnType<typeof createApp>["listen"]> | null = null;

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
  }
  await closePdfBrowser();
});

describe("Express server endpoints", () => {
  it("serves health, preview HTML, markdown, and PDF export binary", async () => {
    const app = createApp();
    server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("Failed to bind test server.");
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    const healthRes = await fetch(`${baseUrl}/api/health`);
    expect(healthRes.status).toBe(200);
    const health = (await healthRes.json()) as { ok: boolean; browserReady: boolean };
    expect(health.ok).toBe(true);
    expect(health.browserReady).toBe(true);

    const previewRes = await fetch(`${baseUrl}/api/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document: SAMPLE_DOC, options: DEFAULT_RENDER_OPTIONS })
    });
    expect(previewRes.status).toBe(200);
    const previewHtml = await previewRes.text();
    expect(previewHtml).toContain("Server API Verification Article");
    expect(previewHtml).toContain("Text-only post inside article.");
    expect(previewHtml).toContain("Watch on X");

    const pdfRes = await fetch(`${baseUrl}/api/export-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ document: SAMPLE_DOC }],
        options: DEFAULT_RENDER_OPTIONS
      })
    });
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers.get("content-type")).toContain("application/pdf");
    const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
    expect(pdfBuf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(pdfBuf.length).toBeGreaterThan(8000);
  });
});
