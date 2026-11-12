import type {
  ArticleBlock,
  ArticleDocument,
  AuthorProfile,
  EmbeddedPost,
  ImageAsset,
  LinkCardAsset,
  PollOption,
  TextRun,
  VideoLinkAsset
} from "../core/types.js";
import {
  compileDraftContentState,
  formatDurationMillis,
  upgradeTwitterImageUrl,
  type DraftContentState
} from "./draftjs.js";
import { parseXUrl, resolveShortUrlsInText, type ParsedXUrl } from "./url.js";

const FXTWITTER_BASE = "https://api.fxtwitter.com";
const VXTWITTER_BASE = "https://api.vxtwitter.com";
const SYNDICATION_BASE = "https://cdn.syndication.twimg.com/tweet-result";
const REQUEST_TIMEOUT_MS = 15000;

interface FxFacet {
  type: string;
  indices: [number, number];
  original?: string;
  replacement?: string;
  display?: string;
  id?: string;
}

interface FxAuthor {
  id?: string;
  name?: string;
  screen_name?: string;
  avatar_url?: string;
  verification?: {
    verified?: boolean;
    type?: string;
  };
}

interface FxPhoto {
  url?: string;
  width?: number;
  height?: number;
  altText?: string;
}

interface FxVideo {
  url?: string;
  thumbnail_url?: string;
  duration?: number;
  width?: number;
  height?: number;
  type?: string;
}

interface FxPoll {
  choices?: Array<{ label?: string; count?: number; percentage?: number }>;
  total_votes?: number;
}

interface FxTweet {
  id?: string;
  url?: string;
  text?: string;
  raw_text?: {
    text?: string;
    facets?: FxFacet[];
  };
  created_at?: string;
  created_timestamp?: number;
  replying_to?: string | null;
  replying_to_status?: string | null;
  is_note_tweet?: boolean;
  author?: FxAuthor;
  replies?: number;
  retweets?: number;
  likes?: number;
  views?: number;
  bookmarks?: number;
  media?: {
    photos?: FxPhoto[];
    videos?: FxVideo[];
    external?: { url?: string };
  };
  quote?: FxTweet;
  poll?: FxPoll;
  card?: {
    url?: string;
    title?: string;
    description?: string;
    domain?: string;
    image?: { url?: string };
  };
  article?: {
    id?: string;
    title?: string;
    preview_text?: string;
    created_at?: string;
    modified_at?: string;
    cover_media?: {
      media_id?: string;
      media_key?: string;
      media_info?: {
        __typename?: string;
        original_img_url?: string;
        original_img_width?: number;
        original_img_height?: number;
      };
      url?: string;
    };
    content?: DraftContentState;
    media_entities?: unknown;
  };
}

interface FxApiResponse {
  code?: number;
  message?: string;
  tweet?: FxTweet;
}

async function fetchJsonWithTimeout<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "xarticle-pdf/1.0 (Editorial PDF Exporter)",
        Accept: "application/json"
      }
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${url}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchFxTweet(handle: string, id: string): Promise<FxTweet | null> {
  const cleanHandle = handle && handle !== "i" ? handle : "i";
  const url = `${FXTWITTER_BASE}/${encodeURIComponent(cleanHandle)}/status/${encodeURIComponent(id)}`;
  try {
    const data = await fetchJsonWithTimeout<FxApiResponse>(url);
    if (data.code === 200 && data.tweet) {
      return data.tweet;
    }
    return null;
  } catch {
    return null;
  }
}

interface SyndicationPayload {
  text?: string;
  note_tweet?: {
    note_tweet_results?: {
      result?: {
        text?: string;
      };
    };
  };
  article?: {
    id?: string;
    title?: string;
    preview_text?: string;
    content_state?: DraftContentState;
    content?: DraftContentState;
    media_entities?: unknown;
  };
}

function computeSyndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}

async function fetchSyndicationFallback(id: string): Promise<SyndicationPayload | null> {
  try {
    const token = computeSyndicationToken(id);
    const url = `${SYNDICATION_BASE}?id=${encodeURIComponent(id)}&lang=en&token=${encodeURIComponent(token)}`;
    return await fetchJsonWithTimeout<SyndicationPayload>(url);
  } catch {
    return null;
  }
}

async function fetchVxTweetArticle(handle: string, id: string): Promise<FxTweet["article"] | null> {
  const cleanHandle = handle && handle !== "i" ? handle : "i";
  try {
    const data = await fetchJsonWithTimeout<{ article?: FxTweet["article"] }>(
      `${VXTWITTER_BASE}/${encodeURIComponent(cleanHandle)}/status/${encodeURIComponent(id)}`
    );
    return data.article ?? null;
  } catch {
    return null;
  }
}

function mapVerifiedType(author?: FxAuthor): AuthorProfile["verifiedType"] {
  if (!author?.verification?.verified) return null;
  const t = String(author.verification.type ?? "blue").toLowerCase();
  if (t.includes("business") || t.includes("gold")) return "business";
  if (t.includes("gov") || t.includes("gray") || t.includes("grey")) return "government";
  return "blue";
}

function parsePlainTweetTextRuns(text: string, facets?: FxFacet[]): TextRun[] {
  if (!text) return [];
  if (facets && facets.length > 0) {
    const sorted = [...facets]
      .filter((f) => Array.isArray(f.indices) && f.indices.length === 2 && f.indices[1] > f.indices[0])
      .sort((a, b) => a.indices[0] - b.indices[0]);

    const runs: TextRun[] = [];
    let cursor = 0;

    for (const facet of sorted) {
      const start = Math.max(cursor, Math.min(text.length, facet.indices[0]));
      const end = Math.max(start, Math.min(text.length, facet.indices[1]));
      if (start > cursor) {
        runs.push({ text: text.slice(cursor, start) });
      }
      const slice = text.slice(start, end);
      const t = String(facet.type ?? "").toLowerCase();
      if (t === "url" || t === "media") {
        const href = facet.replacement ?? facet.original ?? slice;
        const displayText = facet.display ?? (t === "media" ? "" : slice);
        if (displayText) {
          runs.push({ text: displayText, href });
        }
      } else if (t === "mention") {
        const handle = slice.replace(/^@/, "");
        runs.push({ text: slice, href: `https://x.com/${encodeURIComponent(handle)}` });
      } else if (t === "hashtag") {
        const tag = slice.replace(/^#/, "");
        runs.push({ text: slice, href: `https://x.com/hashtag/${encodeURIComponent(tag)}` });
      } else if (t === "cashtag") {
        const tag = slice.replace(/^\$/, "");
        runs.push({ text: slice, href: `https://x.com/search?q=${encodeURIComponent("$" + tag)}` });
      } else if (t === "bold") {
        runs.push({ text: slice, bold: true });
      } else if (t === "italic") {
        runs.push({ text: slice, italic: true });
      } else {
        runs.push({ text: slice });
      }
      cursor = end;
    }

    if (cursor < text.length) {
      runs.push({ text: text.slice(cursor) });
    }
    return runs.filter((r) => r.text.length > 0);
  }

  // Fallback lightweight tokenizer for URLs, @mentions, #hashtags
  const tokenRegex = /(https?:\/\/[^\s]+|@[A-Za-z0-9_]{1,15}|#[A-Za-z0-9_]+)/g;
  const runs: TextRun[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push({ text: text.slice(lastIndex, match.index) });
    }
    const token = match[0];
    if (token.startsWith("http")) {
      runs.push({ text: token, href: token });
    } else if (token.startsWith("@")) {
      runs.push({ text: token, href: `https://x.com/${encodeURIComponent(token.slice(1))}` });
    } else if (token.startsWith("#")) {
      runs.push({ text: token, href: `https://x.com/hashtag/${encodeURIComponent(token.slice(1))}` });
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    runs.push({ text: text.slice(lastIndex) });
  }

  return runs;
}

export function fxTweetToEmbeddedPost(tweet: FxTweet, depth = 0): EmbeddedPost {
  const handle = tweet.author?.screen_name ?? "x";
  const id = tweet.id ?? "";
  const canonicalUrl = tweet.url
    ? tweet.url.replace(/^https?:\/\/(twitter\.com|fxtwitter\.com|vxtwitter\.com)/i, "https://x.com")
    : `https://x.com/${handle}/status/${id}`;

  const rawText = tweet.raw_text?.text ?? tweet.text ?? "";
  const runs = parsePlainTweetTextRuns(rawText, tweet.raw_text?.facets);

  const images: ImageAsset[] = (tweet.media?.photos ?? [])
    .filter((p) => Boolean(p.url))
    .map((p) => ({
      url: upgradeTwitterImageUrl(p.url!),
      alt: p.altText,
      width: p.width,
      height: p.height
    }));

  const videoLinks: VideoLinkAsset[] = (tweet.media?.videos ?? []).map((v) => {
    const isGif = String(v.type ?? "").toLowerCase().includes("gif");
    return {
      url: canonicalUrl,
      directUrl: v.url,
      label: isGif ? "Animated GIF in embedded post" : "Video in embedded post",
      isGif,
      durationText: isGif ? undefined : formatDurationMillis(v.duration ? v.duration * 1000 : undefined),
      posterUrl: v.thumbnail_url ? upgradeTwitterImageUrl(v.thumbnail_url) : undefined
    };
  });

  let linkCard: LinkCardAsset | undefined;
  if (tweet.card?.url && tweet.card.title) {
    let domain = tweet.card.domain ?? "";
    if (!domain) {
      try {
        domain = new URL(tweet.card.url).hostname.replace(/^www\./, "");
      } catch {
        domain = tweet.card.url;
      }
    }
    linkCard = {
      url: tweet.card.url,
      title: tweet.card.title,
      description: tweet.card.description,
      domain,
      imageUrl: tweet.card.image?.url
    };
  }

  let poll: EmbeddedPost["poll"];
  if (tweet.poll?.choices && tweet.poll.choices.length > 0) {
    const choices: PollOption[] = tweet.poll.choices.map((c) => ({
      label: c.label ?? "",
      percentage: c.percentage ?? 0,
      votes: c.count
    }));
    poll = { choices, totalVotes: tweet.poll.total_votes };
  }

  const quotedPost =
    depth < 2 && tweet.quote ? fxTweetToEmbeddedPost(tweet.quote, depth + 1) : undefined;

  return {
    id,
    url: canonicalUrl,
    author: {
      name: tweet.author?.name ?? handle,
      handle,
      avatarUrl: tweet.author?.avatar_url,
      verifiedType: mapVerifiedType(tweet.author)
    },
    createdAt: tweet.created_at,
    text: rawText,
    runs,
    images,
    videoLinks,
    quotedPost,
    linkCard,
    poll
  };
}

/**
 * Hydrates all `embedded_post` blocks inside an ArticleBlock[] array by fetching
 * referenced tweets concurrently via FxTwitter.
 */
export async function hydrateEmbeddedPosts(
  blocks: ArticleBlock[],
  referencedTweetIds: string[],
  warnings: string[]
): Promise<ArticleBlock[]> {
  if (referencedTweetIds.length === 0) return blocks;

  const uniqueIds = Array.from(new Set(referencedTweetIds));
  const resolvedMap = new Map<string, EmbeddedPost>();

  // Bounded concurrency (5 at a time)
  const queue = [...uniqueIds];
  const workers = Array.from({ length: Math.min(5, queue.length) }, async () => {
    while (queue.length > 0) {
      const id = queue.shift();
      if (!id) break;
      const fx = await fetchFxTweet("i", id);
      if (fx) {
        resolvedMap.set(id, fxTweetToEmbeddedPost(fx, 0));
      } else {
        warnings.push(`Could not hydrate embedded post ${id}; rendered fallback link card.`);
      }
    }
  });
  await Promise.all(workers);

  return blocks.map((block) => {
    if (block.type !== "embedded_post") return block;
    const hydrated = resolvedMap.get(block.post.id);
    if (hydrated) {
      return { type: "embedded_post", post: hydrated };
    }
    return {
      type: "embedded_post",
      post: {
        ...block.post,
        unavailableReason: "Post preview unavailable; click to view original on X."
      }
    };
  });
}

function splitParagraphsToBlocks(text: string): ArticleBlock[] {
  const parts = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.map((p) => ({
    type: "paragraph",
    runs: parsePlainTweetTextRuns(p)
  }));
}

async function buildDocumentFromFxArticle(
  article: NonNullable<FxTweet["article"]>,
  tweet: FxTweet,
  canonicalUrl: string,
  author: AuthorProfile,
  handle: string,
  parsedId: string,
  warnings: string[]
): Promise<ArticleDocument> {
  const compiled = compileDraftContentState(article.content!, article.media_entities, canonicalUrl);
  const hydratedBlocks = await hydrateEmbeddedPosts(
    compiled.blocks,
    compiled.referencedTweetIds,
    warnings
  );

  let coverMedia: ImageAsset | undefined;
  const coverUrl =
    article.cover_media?.media_info?.original_img_url ?? article.cover_media?.url;
  if (coverUrl) {
    coverMedia = {
      url: upgradeTwitterImageUrl(coverUrl),
      width: article.cover_media?.media_info?.original_img_width,
      height: article.cover_media?.media_info?.original_img_height
    };
  }

  return {
    id: article.id ?? tweet.id ?? parsedId,
    canonicalUrl,
    title: article.title?.trim() || `Article by @${handle}`,
    subtitle: undefined,
    author,
    publishedAt: article.created_at ?? tweet.created_at,
    coverMedia,
    blocks: hydratedBlocks,
    stats: {
      likes: tweet.likes,
      reposts: tweet.retweets,
      replies: tweet.replies,
      views: tweet.views,
      bookmarks: tweet.bookmarks
    },
    diagnostics: {
      source: "fxtwitter",
      extractedAt: new Date().toISOString(),
      wordCount: 0,
      readingTimeMinutes: 1,
      imageCount: 0,
      videoLinkCount: 0,
      embeddedPostCount: 0,
      embeddedPostsWithoutImagesCount: 0,
      warnings
    }
  };
}

function collectCandidateXLinksFromTweet(tweet: FxTweet, rawText: string): string[] {
  const candidates: string[] = [];
  if (tweet.card?.url) candidates.push(tweet.card.url);
  for (const f of tweet.raw_text?.facets ?? []) {
    if (f.type === "url") {
      if (f.replacement) candidates.push(f.replacement);
      else if (f.original) candidates.push(f.original);
    }
  }
  const urlMatches = rawText.match(/https?:\/\/[^\s]+/gi);
  if (urlMatches) candidates.push(...urlMatches);
  return Array.from(new Set(candidates));
}

function countRoughWords(blocks: ArticleBlock[]): number {
  let words = 0;
  for (const b of blocks) {
    if ("runs" in b && Array.isArray(b.runs)) {
      words += b.runs
        .map((r) => r.text)
        .join(" ")
        .trim()
        .split(/\s+/)
        .filter(Boolean).length;
    }
  }
  return words;
}

export async function extractViaFxTwitter(
  parsed: ParsedXUrl,
  depth = 0,
  visitedIds = new Set<string>()
): Promise<{
  document: ArticleDocument | null;
  reason?: string;
}> {
  if (visitedIds.has(parsed.id)) {
    return { document: null, reason: "Cyclic X URL reference detected." };
  }
  visitedIds.add(parsed.id);

  const warnings: string[] = [];
  let tweet = await fetchFxTweet(parsed.handle, parsed.id);

  if (!tweet) {
    return { document: null, reason: "FxTwitter returned no data for this URL." };
  }

  const handle = tweet.author?.screen_name ?? parsed.handle;
  const canonicalUrl = `https://x.com/${handle}/status/${tweet.id ?? parsed.id}`;
  const author: AuthorProfile = {
    name: tweet.author?.name ?? handle,
    handle,
    avatarUrl: tweet.author?.avatar_url,
    verifiedType: mapVerifiedType(tweet.author)
  };

  // If FxTwitter returned article metadata without content blocks, enrich via Syndication / VxTwitter
  if (tweet.article && !tweet.article.content?.blocks?.length) {
    const [synd, vxArticle] = await Promise.all([
      fetchSyndicationFallback(tweet.id ?? parsed.id),
      fetchVxTweetArticle(handle, tweet.id ?? parsed.id)
    ]);
    const syndContent = synd?.article?.content ?? synd?.article?.content_state;
    if (syndContent?.blocks?.length) {
      tweet = {
        ...tweet,
        article: {
          ...tweet.article,
          title: tweet.article.title ?? synd?.article?.title,
          content: syndContent,
          media_entities: tweet.article.media_entities ?? synd?.article?.media_entities
        }
      };
    } else if (vxArticle?.content?.blocks?.length) {
      tweet = {
        ...tweet,
        article: {
          ...tweet.article,
          title: tweet.article.title ?? vxArticle.title,
          content: vxArticle.content,
          media_entities: tweet.article.media_entities ?? vxArticle.media_entities
        }
      };
    }
  }

  // Case 1: Native X Article attached to status
  if (tweet.article?.content?.blocks?.length) {
    const doc = await buildDocumentFromFxArticle(
      tweet.article,
      tweet,
      canonicalUrl,
      author,
      handle,
      parsed.id,
      warnings
    );
    return { document: doc };
  }

  // Case 1b: Quoted status contains a full Native X Article (outer post is just a teaser/comment)
  if (tweet.quote?.article?.content?.blocks?.length) {
    const qHandle = tweet.quote.author?.screen_name ?? handle;
    const qCanonical = `https://x.com/${qHandle}/status/${tweet.quote.id ?? parsed.id}`;
    const qAuthor: AuthorProfile = {
      name: tweet.quote.author?.name ?? qHandle,
      handle: qHandle,
      avatarUrl: tweet.quote.author?.avatar_url,
      verifiedType: mapVerifiedType(tweet.quote.author)
    };
    const doc = await buildDocumentFromFxArticle(
      tweet.quote.article,
      tweet.quote,
      qCanonical,
      qAuthor,
      qHandle,
      tweet.quote.id ?? parsed.id,
      warnings
    );
    return { document: doc };
  }

  // If URL was explicitly /article/ or /i/article/, we shouldn't settle for a teaser tweet — signal fallback!
  if (parsed.kind === "article" || parsed.kind === "i_article") {
    return {
      document: null,
      reason: "Status response did not include full native article content blocks."
    };
  }

  // Case 2: Long-form status / note_tweet OR teaser linking to an X Article OR self-thread
  let rawText = tweet.raw_text?.text ?? tweet.text ?? "";

  // Check if short post links to an embedded/referenced X Article (via t.co or x.com URL)
  const rawWords = rawText.trim().split(/\s+/).filter(Boolean).length;
  if (depth < 1 && rawWords < 200) {
    const candidates = collectCandidateXLinksFromTweet(tweet, rawText);
    if (candidates.length > 0) {
      const expandedText = await resolveShortUrlsInText(candidates.join("\n"));
      for (const candidateLine of expandedText.split(/\r?\n/)) {
        const linkedParsed = parseXUrl(candidateLine);
        if (linkedParsed && !visitedIds.has(linkedParsed.id)) {
          const linkedResult = await extractViaFxTwitter(linkedParsed, depth + 1, visitedIds);
          if (linkedResult.document) {
            const linkedWords = countRoughWords(linkedResult.document.blocks);
            if (linkedWords > rawWords * 1.4 || linkedResult.document.blocks.some((b) => b.type === "heading")) {
              return linkedResult;
            }
          }
        }
      }
    }
  }

  // Check X Syndication for fuller note_tweet text if FxTwitter returned a short/truncated body
  if (rawWords < 140) {
    const synd = await fetchSyndicationFallback(tweet.id ?? parsed.id);
    const noteText = synd?.note_tweet?.note_tweet_results?.result?.text;
    if (noteText && noteText.length > rawText.length + 20) {
      rawText = noteText;
    }
  }

  // If tweet.article metadata existed with only preview_text (login-gated / incomplete public payload),
  // surface full preview + explicit warning instead of silently truncating
  if (tweet.article?.preview_text && !rawText.includes(tweet.article.preview_text.slice(0, 30))) {
    rawText = [rawText, tweet.article.preview_text].filter(Boolean).join("\n\n");
    warnings.push(
      "X only exposed an article preview snippet publicly without authentication; full article blocks may require local browser fallback."
    );
  }

  if (!rawText && !tweet.media?.photos?.length && !tweet.media?.videos?.length) {
    return { document: null, reason: "Tweet has no extractable article or text content." };
  }

  // Unroll self-thread ancestors if pasted link points to a reply in an author's thread
  const ancestorTweets: FxTweet[] = [];
  if (depth === 0 && tweet.replying_to_status && tweet.replying_to?.toLowerCase() === handle.toLowerCase()) {
    let curReplyId: string | null | undefined = tweet.replying_to_status;
    let steps = 0;
    while (curReplyId && steps < 15 && !visitedIds.has(curReplyId)) {
      visitedIds.add(curReplyId);
      const parent = await fetchFxTweet(handle, curReplyId);
      if (!parent) break;
      if ((parent.author?.screen_name ?? "").toLowerCase() !== handle.toLowerCase()) break;
      ancestorTweets.unshift(parent);
      curReplyId =
        parent.replying_to_status && parent.replying_to?.toLowerCase() === handle.toLowerCase()
          ? parent.replying_to_status
          : null;
      steps += 1;
    }
  }

  if (ancestorTweets.length > 0) {
    warnings.push(`Stitched ${ancestorTweets.length + 1} sequential thread posts by @${handle}.`);
  } else {
    warnings.push(
      "This link resolved to a standard/long-form X post rather than a native X Article container; formatted cleanly as an article."
    );
  }

  const blocks: ArticleBlock[] = [];
  for (const prevTweet of ancestorTweets) {
    const prevText = prevTweet.raw_text?.text ?? prevTweet.text ?? "";
    if (prevText) {
      blocks.push(...splitParagraphsToBlocks(prevText));
    }
    if (prevTweet.media?.photos?.length) {
      const imgs: ImageAsset[] = prevTweet.media.photos
        .filter((p) => Boolean(p.url))
        .map((p) => ({
          url: upgradeTwitterImageUrl(p.url!),
          alt: p.altText,
          width: p.width,
          height: p.height
        }));
      if (imgs.length === 1) blocks.push({ type: "image", image: imgs[0] });
      else if (imgs.length > 1) blocks.push({ type: "image_grid", images: imgs });
    }
    blocks.push({ type: "divider" });
  }

  blocks.push(...splitParagraphsToBlocks(rawText));

  if (tweet.media?.photos?.length) {
    const imgs: ImageAsset[] = tweet.media.photos
      .filter((p) => Boolean(p.url))
      .map((p) => ({
        url: upgradeTwitterImageUrl(p.url!),
        alt: p.altText,
        width: p.width,
        height: p.height
      }));
    if (imgs.length === 1) {
      blocks.push({ type: "image", image: imgs[0] });
    } else if (imgs.length > 1) {
      blocks.push({ type: "image_grid", images: imgs });
    }
  }

  if (tweet.media?.videos?.length) {
    tweet.media.videos.forEach((v) => {
      const isGif = String(v.type ?? "").toLowerCase().includes("gif");
      blocks.push({
        type: "video_link",
        video: {
          url: canonicalUrl,
          directUrl: v.url,
          label: isGif ? "Animated GIF in post" : "Video in post",
          isGif,
          durationText: isGif ? undefined : formatDurationMillis(v.duration ? v.duration * 1000 : undefined),
          posterUrl: v.thumbnail_url ? upgradeTwitterImageUrl(v.thumbnail_url) : undefined
        }
      });
    });
  }

  if (tweet.quote) {
    blocks.push({
      type: "embedded_post",
      post: fxTweetToEmbeddedPost(tweet.quote, 0)
    });
  }

  const firstLine = rawText.split(/\r?\n/)[0]?.trim() ?? "";
  const title =
    firstLine.length > 0 && firstLine.length <= 90
      ? firstLine
      : `Post by ${author.name} (@${author.handle})`;

  return {
    document: {
      id: tweet.id ?? parsed.id,
      canonicalUrl,
      title,
      author,
      publishedAt: tweet.created_at,
      blocks,
      stats: {
        likes: tweet.likes,
        reposts: tweet.retweets,
        replies: tweet.replies,
        views: tweet.views,
        bookmarks: tweet.bookmarks
      },
      diagnostics: {
        source: "fxtwitter",
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
}
