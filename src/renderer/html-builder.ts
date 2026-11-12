import type { ArticleDocument, RenderOptions } from "../core/types.js";
import { getBundledFontFaceCss } from "./fonts.js";
import { buildArticleHtmlCore, escapeHtml } from "./html-builder-core.js";

export { escapeHtml };

export function buildArticleHtml(doc: ArticleDocument, options: RenderOptions): string {
  return buildArticleHtmlCore(doc, options, getBundledFontFaceCss());
}
