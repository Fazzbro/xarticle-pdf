import type { ArticleBlock, ImageAsset, ListItem, TextRun, VideoLinkAsset } from "../core/types.js";
import { extractStatusIdFromUrl } from "./url.js";

export interface DraftInlineStyleRange {
  offset: number;
  length: number;
  style: string;
}

export interface DraftEntityRange {
  offset: number;
  length: number;
  key: number | string;
}

export interface DraftBlock {
  key?: string;
  text: string;
  type: string;
  depth?: number;
  inlineStyleRanges?: DraftInlineStyleRange[];
  entityRanges?: DraftEntityRange[];
  data?: Record<string, unknown>;
}

export interface DraftEntity {
  type: string;
  mutability?: string;
  data?: Record<string, unknown>;
}

export interface RawVideoVariant {
  url?: string;
  content_type?: string;
  bit_rate?: number;
  bitrate?: number;
}

export interface RawMediaEntity {
  media_id?: string;
  media_key?: string;
  id?: string;
  type?: string;
  url?: string;
  original_img_url?: string;
  media_url_https?: string;
  preview_image_url?: string;
  thumbnail_url?: string;
  alt_text?: string;
  ext_alt_text?: string;
  width?: number;
  height?: number;
  duration_millis?: number;
  duration?: number;
  media_info?: {
    __typename?: string;
    original_img_url?: string;
    preview_image?: {
      original_img_url?: string;
    };
    original_img_width?: number;
    original_img_height?: number;
    duration_millis?: number;
    variants?: RawVideoVariant[];
  };
  video_info?: {
    duration_millis?: number;
    variants?: RawVideoVariant[];
  };
  variants?: RawVideoVariant[];
}

export interface DraftContentState {
  blocks: DraftBlock[];
  entityMap?: unknown;
}

export interface CompiledDraftResult {
  blocks: ArticleBlock[];
  referencedTweetIds: string[];
}

export function normalizeEntityMap(rawEntityMap: unknown): Map<string, DraftEntity> {
  const map = new Map<string, DraftEntity>();
  if (!rawEntityMap) return map;

  if (Array.isArray(rawEntityMap)) {
    rawEntityMap.forEach((entry, index) => {
      if (!entry || typeof entry !== "object") return;
      const obj = entry as Record<string, unknown>;
      if ("key" in obj && "value" in obj && obj.value && typeof obj.value === "object") {
        map.set(String(obj.key), obj.value as DraftEntity);
      } else if ("type" in obj) {
        map.set(String(index), obj as unknown as DraftEntity);
      }
    });
    return map;
  }

  if (typeof rawEntityMap === "object") {
    for (const [k, v] of Object.entries(rawEntityMap as Record<string, unknown>)) {
      if (v && typeof v === "object") {
        const obj = v as Record<string, unknown>;
        if ("value" in obj && obj.value && typeof obj.value === "object") {
          map.set(String(k), obj.value as DraftEntity);
        } else {
          map.set(String(k), obj as unknown as DraftEntity);
        }
      }
    }
  }

  return map;
}

export function buildMediaLookup(rawMediaEntities: unknown): Map<string, RawMediaEntity> {
  const map = new Map<string, RawMediaEntity>();
  if (!rawMediaEntities) return map;

  const register = (item: RawMediaEntity, fallbackKey?: string) => {
    const keys = [item.media_id, item.media_key, item.id, fallbackKey].filter(
      (k): k is string => typeof k === "string" && k.length > 0
    );
    for (const key of keys) {
      map.set(key, item);
      // Twitter media_keys are often "3_12345" or "7_12345" while mediaId is "12345"
      const suffix = key.includes("_") ? key.split("_").pop() : undefined;
      if (suffix && !map.has(suffix)) {
        map.set(suffix, item);
      }
    }
  };

  if (Array.isArray(rawMediaEntities)) {
    for (const entry of rawMediaEntities) {
      if (entry && typeof entry === "object") {
        register(entry as RawMediaEntity);
      }
    }
  } else if (typeof rawMediaEntities === "object") {
    for (const [key, val] of Object.entries(rawMediaEntities as Record<string, unknown>)) {
      if (val && typeof val === "object") {
        register(val as RawMediaEntity, key);
      }
    }
  }

  return map;
}

function sameRunFormatting(a: TextRun, b: TextRun): boolean {
  return (
    Boolean(a.bold) === Boolean(b.bold) &&
    Boolean(a.italic) === Boolean(b.italic) &&
    Boolean(a.strikethrough) === Boolean(b.strikethrough) &&
    Boolean(a.code) === Boolean(b.code) &&
    (a.href ?? "") === (b.href ?? "")
  );
}

function resolveEntityHref(entity: DraftEntity | undefined): string | undefined {
  if (!entity) return undefined;
  const type = String(entity.type ?? "").toUpperCase();
  const data = entity.data ?? {};

  if (type === "LINK" || type === "URL") {
    const url = data.url ?? data.href;
    return typeof url === "string" ? url : undefined;
  }
  if (type === "MENTION") {
    const handle = data.screenName ?? data.screen_name ?? data.handle ?? data.username;
    return typeof handle === "string" ? `https://x.com/${handle.replace(/^@/, "")}` : undefined;
  }
  if (type === "HASHTAG") {
    const tag = data.text ?? data.hashtag;
    return typeof tag === "string" ? `https://x.com/hashtag/${encodeURIComponent(tag.replace(/^#/, ""))}` : undefined;
  }
  if (type === "CASHTAG") {
    const tag = data.text ?? data.cashtag;
    return typeof tag === "string" ? `https://x.com/search?q=${encodeURIComponent("$" + tag.replace(/^\$/, ""))}` : undefined;
  }
  return undefined;
}

/**
 * Splits a Draft.js block text string into non-overlapping styled TextRun[]
 * using UTF-16 code-unit offsets (matching Draft.js & JS string indices).
 */
export function buildTextRuns(
  text: string,
  inlineStyleRanges: DraftInlineStyleRange[] = [],
  entityRanges: DraftEntityRange[] = [],
  entityMap: Map<string, DraftEntity> = new Map()
): TextRun[] {
  if (!text) return [];
  const len = text.length;
  const boundaries = new Set<number>([0, len]);

  const clamp = (n: number) => Math.max(0, Math.min(len, n));

  for (const r of inlineStyleRanges) {
    if (r.length <= 0) continue;
    boundaries.add(clamp(r.offset));
    boundaries.add(clamp(r.offset + r.length));
  }
  for (const e of entityRanges) {
    if (e.length <= 0) continue;
    boundaries.add(clamp(e.offset));
    boundaries.add(clamp(e.offset + e.length));
  }

  const points = Array.from(boundaries).sort((a, b) => a - b);
  const runs: TextRun[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    if (end <= start) continue;

    const slice = text.slice(start, end);
    const run: TextRun = { text: slice };

    for (const r of inlineStyleRanges) {
      if (r.offset <= start && r.offset + r.length >= end) {
        const style = String(r.style).toUpperCase();
        if (style === "BOLD") run.bold = true;
        else if (style === "ITALIC") run.italic = true;
        else if (style === "STRIKETHROUGH") run.strikethrough = true;
        else if (style === "CODE" || style === "MONOSPACE") run.code = true;
      }
    }

    for (const e of entityRanges) {
      if (e.offset <= start && e.offset + e.length >= end) {
        const entity = entityMap.get(String(e.key));
        const href = resolveEntityHref(entity);
        if (href) {
          run.href = href;
        }
      }
    }

    const prev = runs[runs.length - 1];
    if (prev && sameRunFormatting(prev, run)) {
      prev.text += run.text;
    } else {
      runs.push(run);
    }
  }

  return runs;
}

export function formatDurationMillis(ms: number | undefined): string | undefined {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return undefined;
  const totalSeconds = Math.round(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function upgradeTwitterImageUrl(url: string): string {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "pbs.twimg.com" && parsed.pathname.startsWith("/media/")) {
      const currentName = parsed.searchParams.get("name");
      if (!currentName || currentName === "small" || currentName === "medium" || currentName === "900x900") {
        parsed.searchParams.set("name", "large");
      }
      return parsed.toString();
    }
  } catch {
    // ignore malformed url
  }
  return url;
}

function classifyMediaItem(
  raw: RawMediaEntity | undefined,
  articleUrl: string,
  caption?: string
): { kind: "image"; image: ImageAsset } | { kind: "video"; video: VideoLinkAsset } | null {
  if (!raw) return null;

  const typename = raw.media_info?.__typename ?? "";
  const typeLower = String(raw.type ?? "").toLowerCase();
  const variants = raw.media_info?.variants ?? raw.video_info?.variants ?? raw.variants ?? [];
  const mp4Variants = variants
    .filter((v) => v.url && (!v.content_type || v.content_type.includes("mp4")))
    .sort((a, b) => ((b.bit_rate ?? b.bitrate ?? 0) - (a.bit_rate ?? a.bitrate ?? 0)));

  const isGif =
    typename === "ApiGif" ||
    typename === "AnimatedGif" ||
    typeLower === "gif" ||
    typeLower === "animated_gif";

  const isVideo =
    !isGif &&
    (typename === "ApiVideo" ||
      typename === "Video" ||
      typeLower === "video" ||
      mp4Variants.length > 0 ||
      Boolean(raw.video_info) ||
      Boolean(raw.media_info?.duration_millis));

  if (isVideo || isGif) {
    const posterUrl =
      raw.media_info?.preview_image?.original_img_url ??
      raw.preview_image_url ??
      raw.thumbnail_url ??
      raw.media_info?.original_img_url ??
      raw.url;
    const durationMs = raw.media_info?.duration_millis ?? raw.video_info?.duration_millis ?? raw.duration_millis ?? (raw.duration ? raw.duration * 1000 : undefined);
    const directUrl = mp4Variants[0]?.url;

    return {
      kind: "video",
      video: {
        url: articleUrl,
        directUrl,
        label: isGif ? "Animated GIF in article" : "Video in article",
        isGif,
        durationText: isGif ? undefined : formatDurationMillis(durationMs),
        caption,
        posterUrl: posterUrl ? upgradeTwitterImageUrl(posterUrl) : undefined
      }
    };
  }

  const imageUrl =
    raw.media_info?.original_img_url ??
    raw.original_img_url ??
    raw.media_url_https ??
    raw.url;

  if (!imageUrl) return null;

  return {
    kind: "image",
    image: {
      url: upgradeTwitterImageUrl(imageUrl),
      alt: raw.ext_alt_text ?? raw.alt_text,
      caption,
      width: raw.media_info?.original_img_width ?? raw.width,
      height: raw.media_info?.original_img_height ?? raw.height
    }
  };
}

function slugifyHeading(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 64) || "section"
  );
}

function parseMarkdownEntity(
  markdown: string,
  articleUrl: string,
  referencedTweetIds: Set<string>
): ArticleBlock[] {
  const trimmed = markdown.trim();
  if (!trimmed) return [];

  // Fenced code block: ```lang\n...\n```
  const codeMatch = trimmed.match(/^```([a-zA-Z0-9_+-]*)\r?\n([\s\S]*?)\r?\n```$/);
  if (codeMatch) {
    return [
      {
        type: "code",
        language: codeMatch[1] || undefined,
        code: codeMatch[2]
      }
    ];
  }

  // Divider
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
    return [{ type: "divider" }];
  }

  // Standalone tweet URL inside markdown entity
  const tweetId = extractStatusIdFromUrl(trimmed);
  if (tweetId) {
    referencedTweetIds.add(tweetId);
    return [
      {
        type: "embedded_post",
        post: {
          id: tweetId,
          url: trimmed,
          author: { name: "X Post", handle: "x" },
          text: trimmed,
          runs: [{ text: trimmed, href: trimmed }],
          images: [],
          videoLinks: []
        }
      }
    ];
  }

  // Fallback: split lines as paragraphs or code
  return [
    {
      type: "paragraph",
      runs: [{ text: trimmed }]
    }
  ];
}

function groupListItems(
  flatItems: Array<{ depth: number; ordered: boolean; runs: TextRun[] }>
): ArticleBlock[] {
  if (flatItems.length === 0) return [];

  const rootBlocks: ArticleBlock[] = [];
  let i = 0;

  function buildList(minDepth: number, ordered: boolean): { ordered: boolean; items: ListItem[] } {
    const items: ListItem[] = [];
    while (i < flatItems.length) {
      const current = flatItems[i];
      if (current.depth < minDepth || (current.depth === minDepth && current.ordered !== ordered)) {
        break;
      }
      if (current.depth > minDepth) {
        // Attach nested list to the previous item if present
        const nested = buildList(current.depth, current.ordered);
        const last = items[items.length - 1];
        if (last) {
          last.children = nested;
        } else {
          items.push({ runs: [], children: nested });
        }
        continue;
      }
      i++;
      const item: ListItem = { runs: current.runs };
      if (i < flatItems.length && flatItems[i].depth > minDepth) {
        item.children = buildList(flatItems[i].depth, flatItems[i].ordered);
      }
      items.push(item);
    }
    return { ordered, items };
  }

  while (i < flatItems.length) {
    const current = flatItems[i];
    const list = buildList(current.depth, current.ordered);
    rootBlocks.push({ type: "list", ordered: list.ordered, items: list.items });
  }

  return rootBlocks;
}

/**
 * Compiles a Draft.js content_state payload (plus media_entities) into a clean ArticleBlock AST.
 */
export function compileDraftContentState(
  contentState: DraftContentState,
  rawMediaEntities: unknown,
  articleUrl: string
): CompiledDraftResult {
  const entityMap = normalizeEntityMap(contentState.entityMap);
  const mediaLookup = buildMediaLookup(rawMediaEntities);
  const blocks: ArticleBlock[] = [];
  const referencedTweetIds = new Set<string>();
  const headingSlugCounts = new Map<string, number>();

  let pendingListItems: Array<{ depth: number; ordered: boolean; runs: TextRun[] }> = [];
  let pendingCodeLines: string[] = [];
  let pendingCodeLang: string | undefined;

  const flushList = () => {
    if (pendingListItems.length > 0) {
      blocks.push(...groupListItems(pendingListItems));
      pendingListItems = [];
    }
  };

  const flushCode = () => {
    if (pendingCodeLines.length > 0) {
      blocks.push({
        type: "code",
        language: pendingCodeLang,
        code: pendingCodeLines.join("\n")
      });
      pendingCodeLines = [];
      pendingCodeLang = undefined;
    }
  };

  for (const block of contentState.blocks ?? []) {
    const blockType = String(block.type ?? "unstyled");

    if (blockType === "unordered-list-item" || blockType === "ordered-list-item") {
      flushCode();
      const runs = buildTextRuns(
        block.text ?? "",
        block.inlineStyleRanges,
        block.entityRanges,
        entityMap
      );
      pendingListItems.push({
        depth: block.depth ?? 0,
        ordered: blockType === "ordered-list-item",
        runs
      });
      continue;
    }

    flushList();

    if (blockType === "code-block") {
      if (pendingCodeLines.length === 0 && block.data && typeof block.data.language === "string") {
        pendingCodeLang = block.data.language;
      }
      pendingCodeLines.push(block.text ?? "");
      continue;
    }

    flushCode();

    if (blockType === "atomic") {
      const entityRange = block.entityRanges?.[0];
      const entity = entityRange !== undefined ? entityMap.get(String(entityRange.key)) : undefined;

      if (!entity) {
        if (block.text?.trim()) {
          blocks.push({ type: "paragraph", runs: [{ text: block.text.trim() }] });
        }
        continue;
      }

      const entityType = String(entity.type ?? "").toUpperCase();
      const data = (entity.data ?? {}) as Record<string, unknown>;

      if (entityType === "DIVIDER" || entityType === "HORIZONTAL_RULE") {
        blocks.push({ type: "divider" });
        continue;
      }

      if (entityType === "MARKDOWN") {
        const md = typeof data.markdown === "string" ? data.markdown : block.text ?? "";
        blocks.push(...parseMarkdownEntity(md, articleUrl, referencedTweetIds));
        continue;
      }

      if (entityType === "TWEET") {
        const rawTweetId = data.tweetId ?? data.tweet_id ?? data.id;
        const tweetUrl =
          typeof data.url === "string"
            ? data.url
            : rawTweetId
              ? `https://x.com/i/status/${String(rawTweetId)}`
              : "";
        const tweetId = rawTweetId ? String(rawTweetId) : extractStatusIdFromUrl(tweetUrl);
        if (tweetId) {
          referencedTweetIds.add(tweetId);
          blocks.push({
            type: "embedded_post",
            post: {
              id: tweetId,
              url: tweetUrl || `https://x.com/i/status/${tweetId}`,
              author: { name: "X Post", handle: "x" },
              text: tweetUrl || `https://x.com/i/status/${tweetId}`,
              runs: [
                {
                  text: tweetUrl || `https://x.com/i/status/${tweetId}`,
                  href: tweetUrl || `https://x.com/i/status/${tweetId}`
                }
              ],
              images: [],
              videoLinks: []
            }
          });
        }
        continue;
      }

      if (entityType === "MEDIA" || entityType === "IMAGE" || entityType === "VIDEO") {
        const caption = typeof data.caption === "string" && data.caption.trim() ? data.caption.trim() : undefined;
        const mediaItems = Array.isArray(data.mediaItems) ? data.mediaItems : [];
        const resolvedMedia: RawMediaEntity[] = [];

        if (mediaItems.length > 0) {
          for (const item of mediaItems) {
            if (!item || typeof item !== "object") continue;
            const obj = item as Record<string, unknown>;
            const idCandidates = [obj.mediaId, obj.media_id, obj.mediaKey, obj.media_key, obj.localMediaId]
              .filter((v): v is string | number => typeof v === "string" || typeof v === "number")
              .map(String);
            let found: RawMediaEntity | undefined;
            for (const cand of idCandidates) {
              found = mediaLookup.get(cand);
              if (found) break;
            }
            if (!found && typeof obj.url === "string") {
              found = { url: obj.url, type: entityType === "VIDEO" ? "video" : "photo" };
            }
            if (found) resolvedMedia.push(found);
          }
        } else {
          const singleId = data.mediaId ?? data.media_id ?? data.mediaKey ?? data.media_key;
          if (singleId !== undefined) {
            const found = mediaLookup.get(String(singleId));
            if (found) resolvedMedia.push(found);
          } else if (typeof data.url === "string" || typeof data.src === "string") {
            resolvedMedia.push({
              url: String(data.url ?? data.src),
              type: entityType === "VIDEO" ? "video" : "photo"
            });
          }
        }

        const images: ImageAsset[] = [];
        for (const rawItem of resolvedMedia) {
          const classified = classifyMediaItem(rawItem, articleUrl, caption);
          if (!classified) continue;
          if (classified.kind === "video") {
            if (images.length > 0) {
              blocks.push(
                images.length === 1
                  ? { type: "image", image: { ...images[0], caption } }
                  : { type: "image_grid", images: images.splice(0), caption }
              );
              images.length = 0;
            }
            blocks.push({ type: "video_link", video: classified.video });
          } else {
            images.push(classified.image);
          }
        }

        if (images.length === 1) {
          blocks.push({ type: "image", image: { ...images[0], caption } });
        } else if (images.length > 1) {
          blocks.push({ type: "image_grid", images, caption });
        }
        continue;
      }

      if (entityType === "LINK_PREVIEW" || entityType === "CARD") {
        const url = typeof data.url === "string" ? data.url : "";
        if (url) {
          let domain = "";
          try {
            domain = new URL(url).hostname.replace(/^www\./, "");
          } catch {
            domain = url;
          }
          blocks.push({
            type: "link_card",
            card: {
              url,
              title: typeof data.title === "string" ? data.title : url,
              description: typeof data.description === "string" ? data.description : undefined,
              domain,
              imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : undefined
            }
          });
        }
        continue;
      }

      continue;
    }

    // Standard text blocks
    const rawText = block.text ?? "";
    if (!rawText.trim()) {
      continue;
    }

    const runs = buildTextRuns(
      rawText,
      block.inlineStyleRanges,
      block.entityRanges,
      entityMap
    );

    if (blockType === "header-one" || blockType === "header-two" || blockType === "header-three") {
      const level = blockType === "header-one" ? 1 : blockType === "header-two" ? 2 : 3;
      const baseSlug = slugifyHeading(rawText);
      const count = (headingSlugCounts.get(baseSlug) ?? 0) + 1;
      headingSlugCounts.set(baseSlug, count);
      const id = count === 1 ? baseSlug : `${baseSlug}-${count}`;
      blocks.push({ type: "heading", level, id, runs });
      continue;
    }

    if (blockType === "blockquote") {
      blocks.push({ type: "blockquote", runs });
      continue;
    }

    // Detect if a paragraph consists solely of a standalone X status URL -> promote to embedded post
    const trimmedText = rawText.trim();
    const standaloneHref =
      runs.length === 1 && runs[0].href && runs[0].text.trim() === trimmedText
        ? runs[0].href
        : trimmedText;
    const standaloneTweetId = extractStatusIdFromUrl(standaloneHref);
    if (standaloneTweetId && /^https?:\/\/\S+$/i.test(standaloneHref)) {
      referencedTweetIds.add(standaloneTweetId);
      blocks.push({
        type: "embedded_post",
        post: {
          id: standaloneTweetId,
          url: standaloneHref,
          author: { name: "X Post", handle: "x" },
          text: standaloneHref,
          runs: [{ text: standaloneHref, href: standaloneHref }],
          images: [],
          videoLinks: []
        }
      });
      continue;
    }

    blocks.push({ type: "paragraph", runs });
  }

  flushList();
  flushCode();

  return {
    blocks,
    referencedTweetIds: Array.from(referencedTweetIds)
  };
}
