import type { ArticleDocument } from "../core/types.js";
import { extractViaEgoBrowser } from "./browser-fallback.js";
import { computeDocumentDiagnostics } from "./cloud.js";
import { extractViaFxTwitter } from "./fxtwitter.js";
import { inlineDocumentMedia } from "./media.js";
import { parseXUrl, type ParsedXUrl } from "./url.js";

export { computeDocumentDiagnostics, extractArticleCloud } from "./cloud.js";

export interface ExtractArticleOptions {
  allowBrowserFallback?: boolean;
  inlineMedia?: boolean;
}

export async function extractArticle(
  rawUrl: string,
  options: ExtractArticleOptions = {}
): Promise<ArticleDocument> {
  const { allowBrowserFallback = true, inlineMedia = true } = options;
  const parsed: ParsedXUrl | null = parseXUrl(rawUrl);

  if (!parsed) {
    throw new Error(`Invalid X/Twitter URL: "${rawUrl}"`);
  }

  // Layer 1: Fast structured extraction via FxTwitter
  const fxResult = await extractViaFxTwitter(parsed);
  let doc = fxResult.document;

  // Layer 2: Browser extraction fallback via ego-browser if needed
  if (!doc && allowBrowserFallback) {
    const browserResult = await extractViaEgoBrowser(parsed);
    doc = browserResult.document;
    if (!doc) {
      throw new Error(
        browserResult.reason ||
          fxResult.reason ||
          `Unable to extract article from ${parsed.normalizedUrl}`
      );
    }
  } else if (!doc) {
    throw new Error(fxResult.reason || `Unable to extract article from ${parsed.normalizedUrl}`);
  }

  if (inlineMedia) {
    await inlineDocumentMedia(doc);
  }

  computeDocumentDiagnostics(doc);
  return doc;
}
