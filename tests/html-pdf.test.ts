import { afterAll, describe, expect, it } from "vitest";
import { DEFAULT_RENDER_OPTIONS, type ArticleDocument } from "../src/core/types.js";
import { computeDocumentDiagnostics } from "../src/extractor/index.js";
import { buildArticleHtml } from "../src/renderer/html-builder.js";
import { buildArticleMarkdown } from "../src/renderer/markdown.js";
import { closePdfBrowser, findBrowserExecutable, generateArticlePdf } from "../src/renderer/pdf-generator.js";

// 1x1 PNG pixel for deterministic offline image tests
const TINY_PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function makeSampleDocument(): ArticleDocument {
  const doc: ArticleDocument = {
    id: "1900000000000000123",
    canonicalUrl: "https://x.com/editorial/status/1900000000000000123",
    title: "Designing Resilient Systems <script>alert(1)</script>",
    subtitle: "A structured deep dive into clean architecture.",
    author: {
      name: "Jane Doe",
      handle: "janedoe",
      verifiedType: "blue",
      avatarDataUri: TINY_PNG_DATA_URI
    },
    publishedAt: "2026-10-15T10:00:00.000Z",
    coverMedia: {
      url: "https://pbs.twimg.com/media/cover.png",
      dataUri: TINY_PNG_DATA_URI
    },
    blocks: [
      {
        type: "heading",
        level: 2,
        id: "section-one",
        runs: [{ text: "1. Core Principles" }]
      },
      {
        type: "paragraph",
        runs: [
          { text: "Always separate " },
          { text: "extraction", bold: true },
          { text: " from " },
          { text: "presentation", italic: true },
          { text: "." }
        ]
      },
      {
        type: "video_link",
        video: {
          url: "https://x.com/editorial/status/1900000000000000123",
          label: "Video in article",
          isGif: false,
          durationText: "2:15",
          caption: "Walkthrough demo",
          posterDataUri: TINY_PNG_DATA_URI
        }
      },
      {
        type: "image",
        image: {
          url: "https://pbs.twimg.com/media/diagram.png",
          dataUri: TINY_PNG_DATA_URI,
          caption: "Figure 1: Pipeline"
        }
      },
      {
        type: "embedded_post",
        post: {
          id: "1900000000000000456",
          url: "https://x.com/textonlyauthor/status/1900000000000000456",
          author: {
            name: "Text Only Author",
            handle: "textonlyauthor",
            verifiedType: "business"
          },
          createdAt: "2026-10-14T08:00:00.000Z",
          text: "This embedded post has zero images, only crisp text and a quote!",
          runs: [{ text: "This embedded post has zero images, only crisp text and a quote!" }],
          images: [],
          videoLinks: [],
          quotedPost: {
            id: "1900000000000000789",
            url: "https://x.com/quoted/status/1900000000000000789",
            author: { name: "Quoted Author", handle: "quoted" },
            text: "Nested text-only quote post.",
            runs: [{ text: "Nested text-only quote post." }],
            images: [],
            videoLinks: []
          }
        }
      },
      {
        type: "embedded_post",
        post: {
          id: "1900000000000000999",
          url: "https://x.com/vidposter/status/1900000000000000999",
          author: { name: "Video Poster", handle: "vidposter" },
          text: "Post containing a video inside the article.",
          runs: [{ text: "Post containing a video inside the article." }],
          images: [],
          videoLinks: [
            {
              url: "https://x.com/vidposter/status/1900000000000000999/video/1",
              label: "Video in embedded post",
              isGif: false,
              durationText: "0:42"
            }
          ]
        }
      },
      {
        type: "code",
        language: "typescript",
        code: "export function greet(name: string) {\n  return `Hello, ${name}`;\n}"
      }
    ],
    diagnostics: {
      source: "fxtwitter",
      extractedAt: "2026-11-12T00:00:00.000Z",
      wordCount: 0,
      readingTimeMinutes: 1,
      imageCount: 0,
      videoLinkCount: 0,
      embeddedPostCount: 0,
      embeddedPostsWithoutImagesCount: 0,
      warnings: []
    }
  };
  computeDocumentDiagnostics(doc);
  return doc;
}

afterAll(async () => {
  await closePdfBrowser();
});

describe("buildArticleHtml & PDF generation", () => {
  it("escapes XSS, renders text-only embedded posts without empty image grids, and omits video poster by default", () => {
    const doc = makeSampleDocument();
    expect(doc.diagnostics.embeddedPostCount).toBe(2);
    expect(doc.diagnostics.embeddedPostsWithoutImagesCount).toBe(2);
    expect(doc.diagnostics.videoLinkCount).toBe(2);

    const htmlDefault = buildArticleHtml(doc, { ...DEFAULT_RENDER_OPTIONS, includeToc: true });
    expect(htmlDefault).not.toContain("<script>alert(1)</script>");
    expect(htmlDefault).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(htmlDefault).toContain("Embedded Video");
    expect(htmlDefault).toContain("Watch on X");
    expect(htmlDefault).not.toContain('<img class="video-poster-thumb"');
    expect(htmlDefault).toContain("This embedded post has zero images, only crisp text and a quote!");
    expect(htmlDefault).toContain("Nested text-only quote post.");
    expect(htmlDefault).not.toContain('<div class="embedded-media-grid');

    const htmlWithPoster = buildArticleHtml(doc, {
      ...DEFAULT_RENDER_OPTIONS,
      includeVideoPoster: true
    });
    expect(htmlWithPoster).toContain('<img class="video-poster-thumb"');

    const md = buildArticleMarkdown(doc);
    expect(md).toContain("[Embedded Video](https://x.com/editorial/status/1900000000000000123)");
    expect(md).toContain("Text Only Author");
  });

  it("generates a real PDF buffer using local Chromium when available", async () => {
    const browserPath = findBrowserExecutable();
    if (!browserPath) {
      throw new Error("Expected local Chrome or Edge for PDF integration test.");
    }
    const doc = makeSampleDocument();
    const pdf = await generateArticlePdf(doc, { ...DEFAULT_RENDER_OPTIONS, includeToc: true });
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(10_000);
    // Chromium printToPDF embeds clickable PDF Link annotations (/URI)
    expect(pdf.toString("latin1")).toContain("/URI (https://x.com/");
  });
});
