import { describe, expect, it } from "vitest";
import { buildTextRuns, compileDraftContentState, normalizeEntityMap } from "../src/extractor/draftjs.js";

describe("buildTextRuns", () => {
  it("handles overlapping inline styles, links, and UTF-16 emojis accurately", () => {
    // "Hi 🚀 bold link end" -> 🚀 is 2 UTF-16 code units
    const text = "Hi 🚀 bold link end";
    const entityMap = normalizeEntityMap([
      {
        key: "0",
        value: {
          type: "LINK",
          data: { url: "https://example.com" }
        }
      }
    ]);
    const runs = buildTextRuns(
      text,
      [
        { offset: 6, length: 9, style: "BOLD" }, // "bold link"
        { offset: 11, length: 4, style: "ITALIC" } // "link"
      ],
      [{ offset: 11, length: 4, key: "0" }], // "link"
      entityMap
    );

    expect(runs).toEqual([
      { text: "Hi 🚀 " },
      { text: "bold ", bold: true },
      { text: "link", bold: true, italic: true, href: "https://example.com" },
      { text: " end" }
    ]);
  });
});

describe("compileDraftContentState", () => {
  it("compiles headings, nested lists, code blocks, images, video links, and embedded tweets", () => {
    const contentState = {
      blocks: [
        { key: "h1", text: "Architecture Overview", type: "header-two" },
        { key: "p1", text: "Intro paragraph.", type: "unstyled" },
        { key: "l1", text: "Parent bullet", type: "unordered-list-item", depth: 0 },
        { key: "l2", text: "Child bullet", type: "unordered-list-item", depth: 1 },
        { key: "c1", text: "const x = 1;", type: "code-block", data: { language: "ts" } },
        { key: "c2", text: "console.log(x);", type: "code-block" },
        {
          key: "a1",
          text: " ",
          type: "atomic",
          entityRanges: [{ offset: 0, length: 1, key: 0 }]
        },
        {
          key: "a2",
          text: " ",
          type: "atomic",
          entityRanges: [{ offset: 0, length: 1, key: 1 }]
        },
        {
          key: "a3",
          text: " ",
          type: "atomic",
          entityRanges: [{ offset: 0, length: 1, key: 2 }]
        },
        {
          key: "p2",
          text: "https://x.com/someone/status/1900000000000000099",
          type: "unstyled"
        }
      ],
      entityMap: {
        "0": {
          type: "MEDIA",
          data: {
            caption: "System diagram",
            mediaItems: [{ mediaId: "img1" }]
          }
        },
        "1": {
          type: "MEDIA",
          data: {
            caption: "Demo clip",
            mediaItems: [{ mediaId: "vid1" }]
          }
        },
        "2": {
          type: "TWEET",
          data: {
            tweetId: "1900000000000000088"
          }
        }
      }
    };

    const mediaEntities = [
      {
        media_id: "img1",
        media_info: {
          __typename: "ApiImage",
          original_img_url: "https://pbs.twimg.com/media/sample.png"
        }
      },
      {
        media_id: "vid1",
        media_info: {
          __typename: "ApiVideo",
          duration_millis: 84000,
          preview_image: { original_img_url: "https://pbs.twimg.com/media/poster.jpg" },
          variants: [{ content_type: "video/mp4", bit_rate: 832000, url: "https://video.twimg.com/demo.mp4" }]
        }
      }
    ];

    const compiled = compileDraftContentState(
      contentState,
      mediaEntities,
      "https://x.com/author/status/1900000000000000000"
    );

    expect(compiled.referencedTweetIds).toEqual([
      "1900000000000000088",
      "1900000000000000099"
    ]);

    expect(compiled.blocks.map((b) => b.type)).toEqual([
      "heading",
      "paragraph",
      "list",
      "code",
      "image",
      "video_link",
      "embedded_post",
      "embedded_post"
    ]);

    const listBlock = compiled.blocks[2];
    expect(listBlock.type === "list" && listBlock.items[0].children?.items[0].runs[0].text).toBe("Child bullet");

    const codeBlock = compiled.blocks[3];
    expect(codeBlock.type === "code" && codeBlock.language).toBe("ts");
    expect(codeBlock.type === "code" && codeBlock.code).toBe("const x = 1;\nconsole.log(x);");

    const videoBlock = compiled.blocks[5];
    expect(videoBlock.type).toBe("video_link");
    if (videoBlock.type === "video_link") {
      expect(videoBlock.video.durationText).toBe("1:24");
      expect(videoBlock.video.caption).toBe("Demo clip");
      expect(videoBlock.video.isGif).toBe(false);
    }
  });
});
