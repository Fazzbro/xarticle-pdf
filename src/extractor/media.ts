import type { ArticleBlock, ArticleDocument, EmbeddedPost, ImageAsset } from "../core/types.js";

const IMAGE_CACHE = new Map<string, string>();
const MAX_CACHE_SIZE = 250;
const FETCH_TIMEOUT_MS = 12000;

function cacheSet(key: string, value: string) {
  if (IMAGE_CACHE.size >= MAX_CACHE_SIZE) {
    const firstKey = IMAGE_CACHE.keys().next().value;
    if (firstKey) IMAGE_CACHE.delete(firstKey);
  }
  IMAGE_CACHE.set(key, value);
}

function sniffMimeType(url: string, headerType: string | null, bytes: Buffer): string {
  if (headerType && headerType.startsWith("image/")) {
    return headerType.split(";")[0].trim();
  }
  if (bytes.length >= 4) {
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
    if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
      return "image/webp";
    }
  }
  if (/\.png(\?|$)/i.test(url)) return "image/png";
  if (/\.webp(\?|$)/i.test(url)) return "image/webp";
  if (/\.gif(\?|$)/i.test(url)) return "image/gif";
  return "image/jpeg";
}

async function fetchImageAsDataUri(url: string): Promise<string | undefined> {
  if (!url || url.startsWith("data:")) return url;
  const cached = IMAGE_CACHE.get(url);
  if (cached) return cached;

  const tryFetch = async (targetUrl: string): Promise<string | undefined> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8"
        }
      });
      if (!res.ok) return undefined;
      const arrBuf = await res.arrayBuffer();
      const buf = Buffer.from(arrBuf);
      if (buf.length === 0) return undefined;
      const mime = sniffMimeType(targetUrl, res.headers.get("content-type"), buf);
      return `data:${mime};base64,${buf.toString("base64")}`;
    } catch {
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  };

  let dataUri = await tryFetch(url);
  // If pbs.twimg.com ?name=orig or ?name=large failed, try default/medium fallback
  if (!dataUri && url.includes("pbs.twimg.com") && url.includes("name=")) {
    const fallbackUrl = url.replace(/name=[^&]+/, "name=medium");
    dataUri = await tryFetch(fallbackUrl);
  }

  if (dataUri) {
    cacheSet(url, dataUri);
  }
  return dataUri;
}

function collectImageTasks(
  doc: ArticleDocument,
  tasks: Array<{ url: string; apply: (dataUri: string) => void }>
) {
  const queueAsset = (img?: ImageAsset) => {
    if (!img?.url || img.dataUri) return;
    tasks.push({
      url: img.url,
      apply: (uri) => {
        img.dataUri = uri;
      }
    });
  };

  if (doc.author.avatarUrl && !doc.author.avatarDataUri) {
    tasks.push({
      url: doc.author.avatarUrl,
      apply: (uri) => {
        doc.author.avatarDataUri = uri;
      }
    });
  }

  queueAsset(doc.coverMedia);

  const collectEmbedded = (post?: EmbeddedPost) => {
    if (!post) return;
    if (post.author.avatarUrl && !post.author.avatarDataUri) {
      tasks.push({
        url: post.author.avatarUrl,
        apply: (uri) => {
          post.author.avatarDataUri = uri;
        }
      });
    }
    for (const img of post.images) {
      queueAsset(img);
    }
    for (const vid of post.videoLinks) {
      if (vid.posterUrl && !vid.posterDataUri) {
        tasks.push({
          url: vid.posterUrl,
          apply: (uri) => {
            vid.posterDataUri = uri;
          }
        });
      }
    }
    if (post.linkCard?.imageUrl && !post.linkCard.imageDataUri) {
      const card = post.linkCard;
      tasks.push({
        url: card.imageUrl!,
        apply: (uri) => {
          card.imageDataUri = uri;
        }
      });
    }
    if (post.quotedPost) {
      collectEmbedded(post.quotedPost);
    }
  };

  for (const block of doc.blocks) {
    if (block.type === "image") {
      queueAsset(block.image);
    } else if (block.type === "image_grid") {
      for (const img of block.images) {
        queueAsset(img);
      }
    } else if (block.type === "video_link") {
      if (block.video.posterUrl && !block.video.posterDataUri) {
        const video = block.video;
        tasks.push({
          url: video.posterUrl!,
          apply: (uri) => {
            video.posterDataUri = uri;
          }
        });
      }
    } else if (block.type === "link_card") {
      if (block.card.imageUrl && !block.card.imageDataUri) {
        const card = block.card;
        tasks.push({
          url: card.imageUrl!,
          apply: (uri) => {
            card.imageDataUri = uri;
          }
        });
      }
    } else if (block.type === "embedded_post") {
      collectEmbedded(block.post);
    }
  }
}

/**
 * Fetches and embeds all images in an ArticleDocument as base64 Data URIs
 * so Chromium PDF generation is 100% deterministic with zero broken/lazy images.
 */
export async function inlineDocumentMedia(doc: ArticleDocument): Promise<void> {
  const tasks: Array<{ url: string; apply: (dataUri: string) => void }> = [];
  collectImageTasks(doc, tasks);

  if (tasks.length === 0) return;

  // Deduplicate network fetches by URL
  const uniqueUrls = Array.from(new Set(tasks.map((t) => t.url)));
  const resolved = new Map<string, string>();
  const queue = [...uniqueUrls];

  const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
    while (queue.length > 0) {
      const url = queue.shift();
      if (!url) break;
      const dataUri = await fetchImageAsDataUri(url);
      if (dataUri) {
        resolved.set(url, dataUri);
      }
    }
  });
  await Promise.all(workers);

  for (const task of tasks) {
    const uri = resolved.get(task.url);
    if (uri) {
      task.apply(uri);
    } else {
      doc.diagnostics.warnings.push(`Failed to inline image asset: ${task.url}`);
    }
  }
}
