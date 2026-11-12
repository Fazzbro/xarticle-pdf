import { afterEach, describe, expect, it, vi } from "vitest";
import { extractViaFxTwitter } from "../src/extractor/fxtwitter.js";
import { parseXUrl } from "../src/extractor/url.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("extractViaFxTwitter mobile/teaser/thread resilience", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts quoted native X Article when outer post is a short teaser", async () => {
    const outerUrl = parseXUrl("https://x.com/teaseruser/status/1000000000000000001")!;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("api.fxtwitter.com/teaseruser/status/1000000000000000001")) {
        return jsonResponse({
          code: 200,
          tweet: {
            id: "1000000000000000001",
            text: "New deep dive just dropped! Read the full breakdown inside.",
            author: { name: "Teaser User", screen_name: "teaseruser" },
            quote: {
              id: "1000000000000000002",
              author: { name: "Article Author", screen_name: "articleauthor" },
              article: {
                title: "Full Quoted Native Article Title",
                preview_text: "Short preview snippet",
                content: {
                  blocks: [
                    { key: "h1", type: "header-two", text: "Section One" },
                    {
                      key: "p1",
                      type: "unstyled",
                      text: "This is the full body of the quoted native X Article with detailed insights beyond sixty nine words so we know extraction did not stop at the teaser."
                    },
                    {
                      key: "p2",
                      type: "unstyled",
                      text: "Second paragraph ensuring multi-paragraph structure is preserved cleanly."
                    }
                  ],
                  entityMap: []
                }
              }
            }
          }
        });
      }
      return jsonResponse({}, 404);
    });

    const result = await extractViaFxTwitter(outerUrl);
    expect(result.document).not.toBeNull();
    expect(result.document?.title).toBe("Full Quoted Native Article Title");
    expect(result.document?.author.handle).toBe("articleauthor");
    expect(result.document?.blocks.some((b) => b.type === "heading")).toBe(true);
    expect(result.document?.blocks.length).toBeGreaterThanOrEqual(3);
  });

  it("follows t.co shortlink inside a short teaser post to an X Article", async () => {
    const teaserUrl = parseXUrl("https://x.com/sharer/status/2000000000000000001")!;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("api.fxtwitter.com/sharer/status/2000000000000000001")) {
        return jsonResponse({
          code: 200,
          tweet: {
            id: "2000000000000000001",
            text: "Bookmark this guide before it gets buried https://t.co/AbCdEfGh12",
            author: { name: "Sharer", screen_name: "sharer" },
            card: { url: "https://t.co/AbCdEfGh12", title: "Full Guide" }
          }
        });
      }
      if (url === "https://t.co/AbCdEfGh12") {
        return new Response(null, {
          status: 302,
          headers: { location: "https://x.com/writer/status/2000000000000000099" }
        });
      }
      if (url.includes("api.fxtwitter.com/writer/status/2000000000000000099")) {
        return jsonResponse({
          code: 200,
          tweet: {
            id: "2000000000000000099",
            author: { name: "Original Writer", screen_name: "writer" },
            article: {
              title: "Expanded Linked Article",
              content: {
                blocks: [
                  { key: "h1", type: "header-two", text: "Chapter 1" },
                  {
                    key: "p1",
                    type: "unstyled",
                    text: "This full article was linked via a t.co redirect inside a short teaser post and contains complete multi-section text."
                  }
                ],
                entityMap: []
              }
            }
          }
        });
      }
      return jsonResponse({}, 404);
    });

    const result = await extractViaFxTwitter(teaserUrl);
    expect(result.document).not.toBeNull();
    expect(result.document?.title).toBe("Expanded Linked Article");
    expect(result.document?.author.handle).toBe("writer");
  });

  it("unrolls self-thread ancestors in chronological order", async () => {
    const childUrl = parseXUrl("https://x.com/threader/status/3000000000000000002")!;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("api.fxtwitter.com/threader/status/3000000000000000002")) {
        return jsonResponse({
          code: 200,
          tweet: {
            id: "3000000000000000002",
            text: "Part 2 of the architecture breakdown with conclusion.",
            replying_to: "threader",
            replying_to_status: "3000000000000000001",
            author: { name: "Thread Author", screen_name: "threader" }
          }
        });
      }
      if (url.includes("api.fxtwitter.com/threader/status/3000000000000000001")) {
        return jsonResponse({
          code: 200,
          tweet: {
            id: "3000000000000000001",
            text: "Part 1 of the architecture breakdown introducing the system.",
            replying_to: null,
            replying_to_status: null,
            author: { name: "Thread Author", screen_name: "threader" }
          }
        });
      }
      return jsonResponse({}, 404);
    });

    const result = await extractViaFxTwitter(childUrl);
    expect(result.document).not.toBeNull();
    const paragraphTexts = result.document?.blocks
      .filter((b) => b.type === "paragraph")
      .map((b) => b.runs.map((r) => r.text).join(""));
    expect(paragraphTexts?.[0]).toContain("Part 1");
    expect(paragraphTexts?.[1]).toContain("Part 2");
    expect(result.document?.blocks.some((b) => b.type === "divider")).toBe(true);
  });

  it("upgrades short FxTwitter text using Syndication note_tweet text", async () => {
    const statusUrl = parseXUrl("https://x.com/notewriter/status/4000000000000000001")!;
    const fullNoteText =
      "First full paragraph of a long note_tweet that got truncated in a short summary response.\n\nSecond full paragraph with concrete details, numbers, and examples continuing well past one hundred words so nothing gets cut short on mobile or desktop.";

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("api.fxtwitter.com/notewriter/status/4000000000000000001")) {
        return jsonResponse({
          code: 200,
          tweet: {
            id: "4000000000000000001",
            text: "First full paragraph of a long note_tweet...",
            author: { name: "Note Writer", screen_name: "notewriter" }
          }
        });
      }
      if (url.includes("cdn.syndication.twimg.com/tweet-result")) {
        return jsonResponse({
          note_tweet: {
            note_tweet_results: {
              result: {
                text: fullNoteText
              }
            }
          }
        });
      }
      return jsonResponse({}, 404);
    });

    const result = await extractViaFxTwitter(statusUrl);
    expect(result.document).not.toBeNull();
    const combinedText = result.document?.blocks
      .filter((b) => b.type === "paragraph")
      .map((b) => b.runs.map((r) => r.text).join(""))
      .join("\n\n");
    expect(combinedText).toContain("Second full paragraph with concrete details");
  });
});
