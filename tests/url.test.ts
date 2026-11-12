import { describe, expect, it } from "vitest";
import { extractXUrlsFromText, parseXUrl } from "../src/extractor/url.js";

describe("parseXUrl", () => {
  it("parses standard x.com status URLs with query params", () => {
    const res = parseXUrl("https://x.com/elonmusk/status/1895149257824633229?s=20&t=xyz");
    expect(res).toEqual({
      raw: "https://x.com/elonmusk/status/1895149257824633229?s=20&t=xyz",
      normalizedUrl: "https://x.com/elonmusk/status/1895149257824633229",
      kind: "status",
      handle: "elonmusk",
      id: "1895149257824633229"
    });
  });

  it("parses user article URLs and proxy domains", () => {
    const a = parseXUrl("https://twitter.com/paulg/article/1900000000000000001");
    expect(a?.kind).toBe("article");
    expect(a?.normalizedUrl).toBe("https://x.com/paulg/article/1900000000000000001");

    const b = parseXUrl("https://fxtwitter.com/levelsio/status/1900000000000000002");
    expect(b?.kind).toBe("status");
    expect(b?.normalizedUrl).toBe("https://x.com/levelsio/status/1900000000000000002");
  });

  it("parses /i/article and /i/articles internal URLs", () => {
    const res = parseXUrl("https://x.com/i/articles/1900000000000000003");
    expect(res).toEqual({
      raw: "https://x.com/i/articles/1900000000000000003",
      normalizedUrl: "https://x.com/i/article/1900000000000000003",
      kind: "i_article",
      handle: "i",
      id: "1900000000000000003"
    });
  });

  it("parses short historic numeric status IDs", () => {
    const res = parseXUrl("https://x.com/jack/status/20");
    expect(res?.id).toBe("20");
    expect(res?.handle).toBe("jack");
  });

  it("strips zero-width mobile copy/paste characters and parses mobile.twitter.com links", () => {
    const res = parseXUrl("\u200Bhttps://mobile.twitter.com/user/status/1895149257824633229?s=46\u200E");
    expect(res?.normalizedUrl).toBe("https://x.com/user/status/1895149257824633229");
    expect(res?.id).toBe("1895149257824633229");
  });

  it("rejects non-X domains and profile-only URLs", () => {
    expect(parseXUrl("https://example.com/user/status/123456789")).toBeNull();
    expect(parseXUrl("https://x.com/elonmusk")).toBeNull();
    expect(parseXUrl("not a url")).toBeNull();
  });
});

describe("extractXUrlsFromText", () => {
  it("deduplicates across domains and collects invalid lines", () => {
    const input = `
      https://x.com/user1/status/1800000000000000001
      https://twitter.com/user1/status/1800000000000000001?s=46
      Check out https://vxtwitter.com/user2/status/1800000000000000002!
      https://badsite.com/foo
    `;
    const result = extractXUrlsFromText(input);
    expect(result.urls).toHaveLength(2);
    expect(result.urls[0].id).toBe("1800000000000000001");
    expect(result.urls[1].id).toBe("1800000000000000002");
    expect(result.invalidLines).toEqual(["https://badsite.com/foo"]);
  });
});
