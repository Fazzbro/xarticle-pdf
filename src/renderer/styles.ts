import type { RenderOptions } from "../core/types.js";
import { getBundledFontFaceCss } from "./fonts.js";
import { buildArticleStylesheetCore, getMarginMm } from "./styles-core.js";

export { getMarginMm };

export function buildArticleStylesheet(options: RenderOptions): string {
  return buildArticleStylesheetCore(options, getBundledFontFaceCss());
}
