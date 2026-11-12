import { execFile } from "node:child_process";
import { unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { ArticleBlock, ArticleDocument, TextRun } from "../core/types.js";
import { hydrateEmbeddedPosts } from "./fxtwitter.js";
import { extractStatusIdFromUrl, type ParsedXUrl } from "./url.js";

const execFileAsync = promisify(execFile);

interface BrowserDomPayload {
  ok: boolean;
  reason?: string;
  canonicalUrl?: string;
  title?: string;
  authorName?: string;
  authorHandle?: string;
  authorAvatar?: string;
  publishedAt?: string;
  coverImageUrl?: string;
  blocks?: Array<{
    type: string;
    level?: 1 | 2 | 3;
    ordered?: boolean;
    items?: Array<{ runs: TextRun[] }>;
    runs?: TextRun[];
    code?: string;
    language?: string;
    url?: string;
    alt?: string;
    caption?: string;
    isGif?: boolean;
    tweetId?: string;
    tweetUrl?: string;
    authorName?: string;
    authorHandle?: string;
    text?: string;
    images?: string[];
  }>;
}

function buildEgoExtractionScript(targetUrl: string, spaceName: string): string {
  return `
const TARGET_URL = ${JSON.stringify(targetUrl)};
const SPACE_NAME = ${JSON.stringify(spaceName)};

let task;
try {
  task = await taskSpace(SPACE_NAME);
  const page = task.page("p1");
  await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30000 });

  await page.waitForFunction(() => {
    const hasArticle = Boolean(document.querySelector('[data-testid="twitterArticleRichTextView"]'));
    const hasTweet = Boolean(document.querySelector('[data-testid="tweetText"]'));
    const hasLoginWall = Boolean(document.querySelector('a[href="/login"], input[name="text"]'));
    const bodyLen = (document.body?.innerText || "").trim().length;
    return hasArticle || hasTweet || (hasLoginWall && bodyLen > 50);
  }, undefined, { timeout: 20000 }).catch(() => {});

  // Let lazy-loaded media/embeds settle briefly
  await page.waitForTimeout(1800);

  const payload = await page.evaluate(() => {
    const cleanUrl = (u) => {
      if (!u) return "";
      try {
        const parsed = new URL(u, location.origin);
        return parsed.toString();
      } catch {
        return u;
      }
    };

    const articleRoot = document.querySelector('[data-testid="twitterArticleRichTextView"]');
    const primaryColumn = document.querySelector('[data-testid="primaryColumn"]') || document.body;

    // Check if login wall blocked viewing
    const hasLoginInput = Boolean(document.querySelector('input[autocomplete="username"], input[name="text"]'));
    if (!articleRoot && !document.querySelector('[data-testid="tweetText"]') && hasLoginInput) {
      return {
        ok: false,
        reason: "X requires login to view this article. Sign into x.com in ego-browser and retry."
      };
    }

    const extractRuns = (el) => {
      const runs = [];
      const walk = (node, fmt) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent || "";
          if (text) {
            runs.push({ text, ...fmt });
          }
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const tag = node.tagName.toLowerCase();
        if (tag === "br") {
          runs.push({ text: "\\n" });
          return;
        }
        const nextFmt = { ...fmt };
        if (tag === "strong" || tag === "b" || Number(getComputedStyle(node).fontWeight) >= 600) {
          nextFmt.bold = true;
        }
        if (tag === "em" || tag === "i" || getComputedStyle(node).fontStyle === "italic") {
          nextFmt.italic = true;
        }
        if (tag === "s" || tag === "del") {
          nextFmt.strikethrough = true;
        }
        if (tag === "code") {
          nextFmt.code = true;
        }
        if (tag === "a") {
          const href = node.getAttribute("href");
          if (href) nextFmt.href = cleanUrl(href);
        }
        for (const child of node.childNodes) {
          walk(child, nextFmt);
        }
      };
      walk(el, {});
      return runs;
    };

    // Header / author metadata
    const authorAnchor = primaryColumn.querySelector('[data-testid="User-Name"] a[href^="/"]');
    const authorHandle = authorAnchor ? authorAnchor.getAttribute("href").replace(/^\\//, "").split("/")[0] : "x";
    const authorNameEl = primaryColumn.querySelector('[data-testid="User-Name"] span');
    const authorName = authorNameEl?.textContent?.trim() || authorHandle;
    const avatarImg = primaryColumn.querySelector('[data-testid="Tweet-User-Avatar"] img');
    const authorAvatar = avatarImg?.getAttribute("src") || undefined;
    const timeEl = primaryColumn.querySelector("time");
    const publishedAt = timeEl?.getAttribute("datetime") || timeEl?.textContent?.trim() || undefined;

    const titleEl =
      primaryColumn.querySelector('[data-testid="twitter-article-title"]') ||
      primaryColumn.querySelector("article h1") ||
      primaryColumn.querySelector("h1");
    const title = titleEl?.textContent?.trim() || document.title.replace(/\\s*\\/\\s*X$/, "").trim();

    const coverImg = primaryColumn.querySelector('[data-testid="tweetPhoto"] img, [data-testid="articleCoverImage"] img');
    const coverImageUrl = coverImg && (!articleRoot || !articleRoot.contains(coverImg))
      ? coverImg.getAttribute("src") || undefined
      : undefined;

    const blocks = [];
    const seenTweets = new Set();

    if (articleRoot) {
      const children = Array.from(articleRoot.children);
      for (const node of children) {
        const tag = node.tagName.toLowerCase();

        // Embedded Tweet card inside article
        const embeddedTweet = node.matches('[data-testid="tweet"]')
          ? node
          : node.querySelector('[data-testid="tweet"]');
        if (embeddedTweet) {
          const statusLink = Array.from(embeddedTweet.querySelectorAll('a[href*="/status/"]'))
            .map((a) => cleanUrl(a.getAttribute("href")))
            .find((h) => /\\/status\\/\\d+/.test(h));
          const idMatch = statusLink?.match(/\\/status\\/(\\d+)/);
          const tweetId = idMatch ? idMatch[1] : "";
          if (tweetId && !seenTweets.has(tweetId)) {
            seenTweets.add(tweetId);
            const embText = embeddedTweet.querySelector('[data-testid="tweetText"]')?.innerText?.trim() || "";
            const embName = embeddedTweet.querySelector('[data-testid="User-Name"] span')?.textContent?.trim() || "X Post";
            const embHandleAnchor = embeddedTweet.querySelector('[data-testid="User-Name"] a[href^="/"]');
            const embHandle = embHandleAnchor ? embHandleAnchor.getAttribute("href").replace(/^\\//, "").split("/")[0] : "x";
            const embImgs = Array.from(embeddedTweet.querySelectorAll('[data-testid="tweetPhoto"] img'))
              .map((img) => img.getAttribute("src"))
              .filter(Boolean);
            blocks.push({
              type: "embedded_post",
              tweetId,
              tweetUrl: statusLink,
              authorName: embName,
              authorHandle: embHandle,
              text: embText,
              images: embImgs
            });
          }
          continue;
        }

        // Video player -> replace with video_link
        if (node.querySelector('[data-testid="videoPlayer"], video')) {
          blocks.push({
            type: "video_link",
            url: location.href,
            isGif: Boolean(node.querySelector('[aria-label*="GIF" i]'))
          });
          continue;
        }

        if (tag === "hr") {
          blocks.push({ type: "divider" });
          continue;
        }

        if (tag === "h1" || tag === "h2" || tag === "h3") {
          const level = tag === "h1" ? 1 : tag === "h2" ? 2 : 3;
          const runs = extractRuns(node);
          if (runs.length) blocks.push({ type: "heading", level, runs });
          continue;
        }

        if (tag === "blockquote") {
          const runs = extractRuns(node);
          if (runs.length) blocks.push({ type: "blockquote", runs });
          continue;
        }

        if (tag === "pre") {
          blocks.push({ type: "code", code: node.innerText || "" });
          continue;
        }

        if (tag === "ul" || tag === "ol") {
          const items = Array.from(node.querySelectorAll(":scope > li")).map((li) => ({
            runs: extractRuns(li)
          }));
          if (items.length) blocks.push({ type: "list", ordered: tag === "ol", items });
          continue;
        }

        const imgs = Array.from(node.querySelectorAll("img"))
          .map((img) => ({ url: img.getAttribute("src") || "", alt: img.getAttribute("alt") || "" }))
          .filter((i) => i.url && !i.url.includes("emoji"));
        if (imgs.length === 1 && !(node.innerText || "").trim()) {
          blocks.push({ type: "image", url: imgs[0].url, alt: imgs[0].alt });
          continue;
        }
        if (imgs.length > 1) {
          for (const im of imgs) {
            blocks.push({ type: "image", url: im.url, alt: im.alt });
          }
          continue;
        }

        const runs = extractRuns(node);
        const plain = (node.innerText || "").trim();
        if (plain) {
          blocks.push({ type: "paragraph", runs: runs.length ? runs : [{ text: plain }] });
        }
      }
    } else {
      const tweetTextEl = primaryColumn.querySelector('[data-testid="tweetText"]');
      if (tweetTextEl) {
        const text = tweetTextEl.innerText || "";
        for (const para of text.split(/\\n{2,}/)) {
          if (para.trim()) blocks.push({ type: "paragraph", runs: [{ text: para.trim() }] });
        }
      }
    }

    return {
      ok: blocks.length > 0,
      reason: blocks.length === 0 ? "No article content blocks were found on the rendered page." : undefined,
      canonicalUrl: location.href,
      title,
      authorName,
      authorHandle,
      authorAvatar,
      publishedAt,
      coverImageUrl,
      blocks
    };
  });

  console.log("__XARTICLE_JSON__" + JSON.stringify(payload));
} catch (err) {
  console.log("__XARTICLE_JSON__" + JSON.stringify({
    ok: false,
    reason: err instanceof Error ? err.message : String(err)
  }));
} finally {
  if (task) {
    await task.finish({ keep: false }).catch(() => {});
  }
}
`;
}

export async function extractViaEgoBrowser(parsed: ParsedXUrl): Promise<{
  document: ArticleDocument | null;
  reason?: string;
}> {
  const spaceName = `xarticle-extract-${parsed.id}-${Date.now()}`;
  const scriptPath = path.join(os.tmpdir(), `xarticle-ego-${parsed.id}-${Date.now()}.mjs`);
  const scriptSource = buildEgoExtractionScript(parsed.normalizedUrl, spaceName);

  try {
    await writeFile(scriptPath, scriptSource, "utf8");

    const isWindows = process.platform === "win32";
    const cmd = isWindows ? "cmd.exe" : "sh";
    const args = isWindows
      ? ["/c", `ego-browser nodejs < "${scriptPath}"`]
      : ["-c", `ego-browser nodejs < "${scriptPath}"`];

    const { stdout } = await execFileAsync(cmd, args, {
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024
    });

    const marker = "__XARTICLE_JSON__";
    const idx = stdout.lastIndexOf(marker);
    if (idx === -1) {
      return {
        document: null,
        reason: "Browser extraction completed without returning structured output."
      };
    }

    const jsonLine = stdout.slice(idx + marker.length).trim().split(/\r?\n/)[0];
    const payload = JSON.parse(jsonLine) as BrowserDomPayload;

    if (!payload.ok || !payload.blocks?.length) {
      return {
        document: null,
        reason: payload.reason ?? "Could not extract article from browser page."
      };
    }

    const warnings: string[] = [];
    const referencedTweetIds: string[] = [];
    const canonicalUrl = payload.canonicalUrl || parsed.normalizedUrl;

    const rawBlocks: ArticleBlock[] = [];
    for (const b of payload.blocks) {
      if (b.type === "heading" && b.runs) {
        const titleStr = b.runs.map((r) => r.text).join("").trim();
        rawBlocks.push({
          type: "heading",
          level: b.level ?? 2,
          id: titleStr.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section",
          runs: b.runs
        });
      } else if (b.type === "blockquote" && b.runs) {
        rawBlocks.push({ type: "blockquote", runs: b.runs });
      } else if (b.type === "list" && b.items) {
        rawBlocks.push({ type: "list", ordered: Boolean(b.ordered), items: b.items });
      } else if (b.type === "code") {
        rawBlocks.push({ type: "code", language: b.language, code: b.code ?? "" });
      } else if (b.type === "divider") {
        rawBlocks.push({ type: "divider" });
      } else if (b.type === "image" && b.url) {
        rawBlocks.push({
          type: "image",
          image: { url: b.url, alt: b.alt, caption: b.caption }
        });
      } else if (b.type === "video_link") {
        rawBlocks.push({
          type: "video_link",
          video: {
            url: b.url || canonicalUrl,
            label: b.isGif ? "Animated GIF in article" : "Video in article",
            isGif: Boolean(b.isGif)
          }
        });
      } else if (b.type === "embedded_post") {
        const tweetId = b.tweetId || (b.tweetUrl ? extractStatusIdFromUrl(b.tweetUrl) : null) || "";
        if (tweetId) referencedTweetIds.push(tweetId);
        rawBlocks.push({
          type: "embedded_post",
          post: {
            id: tweetId,
            url: b.tweetUrl || canonicalUrl,
            author: {
              name: b.authorName || "X Post",
              handle: b.authorHandle || "x"
            },
            text: b.text || "",
            runs: b.text ? [{ text: b.text }] : [],
            images: (b.images ?? []).map((u) => ({ url: u })),
            videoLinks: []
          }
        });
      } else if (b.runs?.length) {
        rawBlocks.push({ type: "paragraph", runs: b.runs });
      }
    }

    const hydratedBlocks = await hydrateEmbeddedPosts(rawBlocks, referencedTweetIds, warnings);

    return {
      document: {
        id: parsed.id,
        canonicalUrl,
        title: payload.title || `Article by @${payload.authorHandle || parsed.handle}`,
        author: {
          name: payload.authorName || payload.authorHandle || "X Author",
          handle: payload.authorHandle || parsed.handle || "x",
          avatarUrl: payload.authorAvatar
        },
        publishedAt: payload.publishedAt,
        coverMedia: payload.coverImageUrl ? { url: payload.coverImageUrl } : undefined,
        blocks: hydratedBlocks,
        diagnostics: {
          source: "ego-browser",
          extractedAt: new Date().toISOString(),
          wordCount: 0,
          readingTimeMinutes: 1,
          imageCount: 0,
          videoLinkCount: 0,
          embeddedPostCount: 0,
          embeddedPostsWithoutImagesCount: 0,
          warnings
        }
      }
    };
  } catch (err) {
    return {
      document: null,
      reason: `ego-browser fallback failed: ${err instanceof Error ? err.message : String(err)}`
    };
  } finally {
    await unlink(scriptPath).catch(() => {});
  }
}
