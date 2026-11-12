import type { ArticleBlock, ArticleDocument, TextRun } from "../core/types.js";
import { extractViaFxTwitter } from "./fxtwitter.js";
import { inlineDocumentMedia } from "./media.js";
import { parseXUrl, type ParsedXUrl } from "./url.js";

function countRunWords(runs: TextRun[]): number {
  const joined = runs.map((r) => r.text).join(" ").trim();
  if (!joined) return 0;
  return joined.split(/\s+/).filter(Boolean).length;
}

export function computeDocumentDiagnostics(doc: ArticleDocument): void {
  let words = 0;
  let images = doc.coverMedia ? 1 : 0;
  let videoLinks = 0;
  let embeddedPosts = 0;
  let embeddedWithoutImages = 0;

  words += doc.title.split(/\s+/).filter(Boolean).length;

  const countBlock = (block: ArticleBlock) => {
    switch (block.type) {
      case "paragraph":
      case "heading":
      case "blockquote":
        words += countRunWords(block.runs);
        break;
      case "list":
        for (const item of block.items) {
          words += countRunWords(item.runs);
          if (item.children) {
            for (const sub of item.children.items) {
              words += countRunWords(sub.runs);
            }
          }
        }
        break;
      case "code":
        words += block.code.split(/\s+/).filter(Boolean).length;
        break;
      case "image":
        images += 1;
        break;
      case "image_grid":
        images += block.images.length;
        break;
      case "video_link":
        videoLinks += 1;
        break;
      case "embedded_post":
        embeddedPosts += 1;
        if (block.post.images.length === 0) {
          embeddedWithoutImages += 1;
        } else {
          images += block.post.images.length;
        }
        videoLinks += block.post.videoLinks.length;
        words += block.post.text.split(/\s+/).filter(Boolean).length;
        if (block.post.quotedPost) {
          images += block.post.quotedPost.images.length;
          videoLinks += block.post.quotedPost.videoLinks.length;
          words += block.post.quotedPost.text.split(/\s+/).filter(Boolean).length;
        }
        break;
      default:
        break;
    }
  };

  for (const b of doc.blocks) {
    countBlock(b);
  }

  doc.diagnostics.wordCount = words;
  doc.diagnostics.readingTimeMinutes = Math.max(1, Math.round(words / 220));
  doc.diagnostics.imageCount = images;
  doc.diagnostics.videoLinkCount = videoLinks;
  doc.diagnostics.embeddedPostCount = embeddedPosts;
  doc.diagnostics.embeddedPostsWithoutImagesCount = embeddedWithoutImages;
}

export interface ExtractCloudOptions {
  inlineMedia?: boolean;
}

/**
 * Pure HTTP article extraction safe for serverless runtimes (no child_process or local browser).
 */
export async function extractArticleCloud(
  rawUrl: string,
  options: ExtractCloudOptions = {}
): Promise<ArticleDocument> {
  const { inlineMedia = false } = options;
  const parsed: ParsedXUrl | null = parseXUrl(rawUrl);

  if (!parsed) {
    throw new Error(`Invalid X/Twitter URL: "${rawUrl}"`);
  }

  const fxResult = await extractViaFxTwitter(parsed);
  if (!fxResult.document) {
    throw new Error(fxResult.reason || `Unable to extract article from ${parsed.normalizedUrl}`);
  }

  const doc = fxResult.document;
  if (inlineMedia) {
    await inlineDocumentMedia(doc);
  }

  computeDocumentDiagnostics(doc);
  return doc;
}
