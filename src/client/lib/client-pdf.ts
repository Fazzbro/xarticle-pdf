import fontkit from "@pdf-lib/fontkit";
import JSZip from "jszip";
import { PDFDocument, PDFString, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import type {
  ArticleBlock,
  ArticleDocument,
  EmbeddedPost,
  ImageAsset,
  LinkCardAsset,
  ListItem,
  RenderOptions,
  TextRun,
  VideoLinkAsset
} from "../../core/types.js";
import { buildPdfFilename } from "../../renderer/filename.js";
import type { ClientPdfFontBuffers } from "./client-pdf-fonts.js";

export type { ClientPdfFontBuffers };

interface PdfPalette {
  pageBg: RGB;
  cardBg: RGB;
  cardNestedBg: RGB;
  codeBg: RGB;
  textPrimary: RGB;
  textSecondary: RGB;
  textMuted: RGB;
  borderSubtle: RGB;
  borderStrong: RGB;
  ctaBg: RGB;
  ctaText: RGB;
  quoteBar: RGB;
  linkColor: RGB;
}

interface FontSuite {
  display: PDFFont;
  displayBold: PDFFont;
  body: PDFFont;
  bodyBold: PDFFont;
  bodyItalic: PDFFont;
  ui: PDFFont;
  uiBold: PDFFont;
  mono: PDFFont;
}

interface StyledToken {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  strikethrough?: boolean;
  href?: string;
}

interface WrappedSegment {
  text: string;
  font: PDFFont;
  size: number;
  width: number;
  color: RGB;
  href?: string;
  strikethrough?: boolean;
  codeBg?: boolean;
}

interface WrappedLine {
  segments: WrappedSegment[];
}

function hexRgb(hex: string): RGB {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
}

function getPdfPalette(paper: RenderOptions["paper"]): PdfPalette {
  if (paper === "dark") {
    return {
      pageBg: hexRgb("#09090B"),
      cardBg: hexRgb("#121215"),
      cardNestedBg: hexRgb("#18181C"),
      codeBg: hexRgb("#0E0E11"),
      textPrimary: hexRgb("#FAFAFA"),
      textSecondary: hexRgb("#D4D4D8"),
      textMuted: hexRgb("#A1A1AA"),
      borderSubtle: hexRgb("#27272A"),
      borderStrong: hexRgb("#3F3F46"),
      ctaBg: hexRgb("#FAFAFA"),
      ctaText: hexRgb("#09090B"),
      quoteBar: hexRgb("#FAFAFA"),
      linkColor: hexRgb("#FAFAFA")
    };
  }
  if (paper === "ivory") {
    return {
      pageBg: hexRgb("#FAF8F3"),
      cardBg: hexRgb("#F3EFE6"),
      cardNestedBg: hexRgb("#ECE6D9"),
      codeBg: hexRgb("#F1EDE4"),
      textPrimary: hexRgb("#1C1917"),
      textSecondary: hexRgb("#57534E"),
      textMuted: hexRgb("#78716C"),
      borderSubtle: hexRgb("#E2DDD2"),
      borderStrong: hexRgb("#C9C1B2"),
      ctaBg: hexRgb("#09090B"),
      ctaText: hexRgb("#FFFFFF"),
      quoteBar: hexRgb("#09090B"),
      linkColor: hexRgb("#0F62FE")
    };
  }
  return {
    pageBg: hexRgb("#FFFFFF"),
    cardBg: hexRgb("#F7F7F8"),
    cardNestedBg: hexRgb("#EFEFF1"),
    codeBg: hexRgb("#F4F4F6"),
    textPrimary: hexRgb("#09090B"),
    textSecondary: hexRgb("#3F3F46"),
    textMuted: hexRgb("#71717A"),
    borderSubtle: hexRgb("#E4E4E7"),
    borderStrong: hexRgb("#D4D4D8"),
    ctaBg: hexRgb("#09090B"),
    ctaText: hexRgb("#FFFFFF"),
    quoteBar: hexRgb("#09090B"),
    linkColor: hexRgb("#09090B")
  };
}

function getPageDimensions(pageSize: RenderOptions["pageSize"]): { width: number; height: number } {
  if (pageSize === "Letter") {
    return { width: 612, height: 792 };
  }
  return { width: 595.28, height: 841.89 };
}

function getMarginPts(margins: RenderOptions["margins"]): number {
  switch (margins) {
    case "compact":
      return 39.7; // ~14mm
    case "generous":
      return 62.4; // ~22mm
    case "balanced":
    default:
      return 51.0; // ~18mm
  }
}

const CHAR_FALLBACKS: Record<string, string> = {
  "↗": "->",
  "→": "->",
  "←": "<-",
  "•": "-",
  "·": "-",
  "—": "--",
  "–": "-",
  "…": "...",
  "“": "\"",
  "”": "\"",
  "‘": "'",
  "’": "'"
};

function sanitizeTextForFont(text: string, font: PDFFont): string {
  const normalized = text.replace(/[\r\n]+/g, " ");
  try {
    font.encodeText(normalized);
    font.widthOfTextAtSize(normalized, 10);
    return normalized;
  } catch {
    let out = "";
    for (const ch of normalized) {
      try {
        font.encodeText(ch);
        font.widthOfTextAtSize(ch, 10);
        out += ch;
      } catch {
        const rep = CHAR_FALLBACKS[ch];
        if (rep) {
          try {
            font.encodeText(rep);
            font.widthOfTextAtSize(rep, 10);
            out += rep;
            continue;
          } catch {
            // ignore
          }
        }
      }
    }
    return out;
  }
}

function measureWidth(font: PDFFont, text: string, size: number): number {
  const safe = sanitizeTextForFont(text, font);
  if (!safe) return 0;
  return font.widthOfTextAtSize(safe, size);
}

function addLinkAnnotation(page: PDFPage, rect: [number, number, number, number], href: string): void {
  try {
    const parsed = new URL(href);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:" && parsed.protocol !== "mailto:") {
      return;
    }
    const annot = page.doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: rect,
      Border: [0, 0, 0],
      A: {
        Type: "Action",
        S: "URI",
        URI: PDFString.of(parsed.toString())
      }
    });
    const ref = page.doc.context.register(annot);
    page.node.addAnnot(ref);
  } catch {
    // Skip invalid URLs cleanly
  }
}

function pickFont(token: StyledToken, suite: FontSuite): PDFFont {
  if (token.code) return suite.mono;
  if (token.bold) return suite.bodyBold;
  if (token.italic) return suite.bodyItalic;
  return suite.body;
}

function tokenizeRuns(runs: TextRun[]): StyledToken[][] {
  const paragraphs: StyledToken[][] = [[]];
  for (const run of runs) {
    const parts = run.text.split(/\r?\n/);
    parts.forEach((part, idx) => {
      if (idx > 0) {
        paragraphs.push([]);
      }
      if (!part) return;
      const pieces = part.split(/(\s+)/).filter(Boolean);
      for (const piece of pieces) {
        paragraphs[paragraphs.length - 1].push({
          text: piece,
          bold: run.bold,
          italic: run.italic,
          code: run.code,
          strikethrough: run.strikethrough,
          href: run.href
        });
      }
    });
  }
  return paragraphs;
}

function wrapTokens(
  tokens: StyledToken[],
  maxWidth: number,
  fontSize: number,
  suite: FontSuite,
  baseColor: RGB,
  linkColor: RGB,
  overrideFont?: PDFFont
): WrappedLine[] {
  const lines: WrappedLine[] = [];
  let current: WrappedSegment[] = [];
  let currentWidth = 0;

  const pushLine = () => {
    while (current.length > 0 && !current[current.length - 1].text.trim()) {
      current.pop();
    }
    lines.push({ segments: current });
    current = [];
    currentWidth = 0;
  };

  for (const tok of tokens) {
    const font = overrideFont ?? pickFont(tok, suite);
    const size = tok.code ? fontSize * 0.88 : fontSize;
    const isSpace = !tok.text.trim();
    if (isSpace && current.length === 0) continue;

    const safe = sanitizeTextForFont(tok.text, font);
    if (!safe && !isSpace) continue;

    const segWidth = measureWidth(font, safe, size);
    const color = tok.href ? linkColor : baseColor;

    // Hard split oversized unbroken words (long URLs/identifiers)
    if (segWidth > maxWidth && !isSpace) {
      if (current.length > 0) pushLine();
      let chunk = "";
      for (const ch of safe) {
        const nextW = measureWidth(font, chunk + ch, size);
        if (nextW > maxWidth && chunk.length > 0) {
          current.push({
            text: chunk,
            font,
            size,
            width: measureWidth(font, chunk, size),
            color,
            href: tok.href,
            strikethrough: tok.strikethrough,
            codeBg: tok.code
          });
          pushLine();
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      if (chunk) {
        const w = measureWidth(font, chunk, size);
        current.push({
          text: chunk,
          font,
          size,
          width: w,
          color,
          href: tok.href,
          strikethrough: tok.strikethrough,
          codeBg: tok.code
        });
        currentWidth = w;
      }
      continue;
    }

    if (!isSpace && currentWidth + segWidth > maxWidth && current.length > 0) {
      pushLine();
    }

    if (isSpace && current.length === 0) continue;

    current.push({
      text: safe,
      font,
      size,
      width: segWidth,
      color,
      href: tok.href,
      strikethrough: tok.strikethrough,
      codeBg: tok.code
    });
    currentWidth += segWidth;
  }

  if (current.length > 0) {
    pushLine();
  }
  return lines;
}

function wrapPlainText(
  text: string,
  maxWidth: number,
  font: PDFFont,
  fontSize: number,
  color: RGB,
  href?: string
): WrappedLine[] {
  const split = text.split(/\r?\n/);
  const result: WrappedLine[] = [];
  for (const para of split) {
    if (!para.trim()) {
      result.push({ segments: [] });
      continue;
    }
    const tokens: StyledToken[] = para
      .split(/(\s+)/)
      .filter(Boolean)
      .map((part) => ({ text: part, href }));
    const dummySuite: FontSuite = {
      display: font,
      displayBold: font,
      body: font,
      bodyBold: font,
      bodyItalic: font,
      ui: font,
      uiBold: font,
      mono: font
    };
    const wrapped = wrapTokens(tokens, maxWidth, fontSize, dummySuite, color, color, font);
    result.push(...wrapped);
  }
  return result;
}

function isPngBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

function isJpegBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function decodeDataUri(dataUri: string): { bytes: Uint8Array; mime: string } | null {
  const match = dataUri.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!match) return null;
  const binStr = atob(match[2]);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return { mime: match[1], bytes };
}

async function transcodeToJpegInBrowser(blob: Blob): Promise<Uint8Array | null> {
  if (typeof document === "undefined" || typeof createImageBitmap === "undefined") {
    return null;
  }
  try {
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0);
    bmp.close?.();
    const outBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9)
    );
    if (!outBlob) return null;
    return new Uint8Array(await outBlob.arrayBuffer());
  } catch {
    return null;
  }
}

async function loadEmbeddableImage(
  pdfDoc: PDFDocument,
  asset?: { dataUri?: string; url?: string }
): Promise<PDFImage | null> {
  if (!asset) return null;

  let bytes: Uint8Array | null = null;
  let mime = "";

  if (asset.dataUri) {
    const decoded = decodeDataUri(asset.dataUri);
    if (decoded) {
      bytes = decoded.bytes;
      mime = decoded.mime;
    }
  }

  if (!bytes && asset.url) {
    const candidates: string[] = [];
    if (typeof window !== "undefined") {
      candidates.push(`/api/media-proxy?url=${encodeURIComponent(asset.url)}`);
    }
    candidates.push(asset.url);

    for (const candidate of candidates) {
      try {
        const res = await fetch(candidate);
        if (!res.ok) continue;
        const arr = new Uint8Array(await res.arrayBuffer());
        if (arr.byteLength > 0) {
          bytes = arr;
          mime = res.headers.get("content-type") || "";
          break;
        }
      } catch {
        // try next
      }
    }
  }

  if (!bytes || bytes.byteLength === 0) return null;

  try {
    if (isPngBytes(bytes)) {
      return await pdfDoc.embedPng(bytes);
    }
    if (isJpegBytes(bytes)) {
      return await pdfDoc.embedJpg(bytes);
    }
    // WebP, GIF, AVIF: transcode via browser canvas to JPEG cleanly
    const jpegBytes = await transcodeToJpegInBrowser(
      new Blob([bytes.buffer as ArrayBuffer], { type: mime || "image/webp" })
    );
    if (jpegBytes && isJpegBytes(jpegBytes)) {
      return await pdfDoc.embedJpg(jpegBytes);
    }
  } catch {
    return null;
  }
  return null;
}

class PdfCursor {
  readonly pdfDoc: PDFDocument;
  readonly options: RenderOptions;
  readonly palette: PdfPalette;
  readonly suite: FontSuite;
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly margin: number;
  readonly contentWidth: number;
  readonly topY: number;
  readonly bottomY: number;

  page: PDFPage;
  y: number;

  constructor(pdfDoc: PDFDocument, options: RenderOptions, palette: PdfPalette, suite: FontSuite) {
    this.pdfDoc = pdfDoc;
    this.options = options;
    this.palette = palette;
    this.suite = suite;

    const dims = getPageDimensions(options.pageSize);
    this.pageWidth = dims.width;
    this.pageHeight = dims.height;
    this.margin = getMarginPts(options.margins);
    this.contentWidth = this.pageWidth - this.margin * 2;
    const hfReserve = options.includeRunningHeaderFooter ? 16 : 0;
    this.topY = this.pageHeight - this.margin - hfReserve;
    this.bottomY = this.margin + hfReserve;

    this.page = this.createBlankPage();
    this.y = this.topY;
  }

  private createBlankPage(): PDFPage {
    const p = this.pdfDoc.addPage([this.pageWidth, this.pageHeight]);
    p.drawRectangle({
      x: 0,
      y: 0,
      width: this.pageWidth,
      height: this.pageHeight,
      color: this.palette.pageBg
    });
    return p;
  }

  newPage(): void {
    this.page = this.createBlankPage();
    this.y = this.topY;
  }

  ensureSpace(requiredHeight: number): void {
    if (this.y - requiredHeight < this.bottomY) {
      this.newPage();
    }
  }

  drawWrappedLines(
    lines: WrappedLine[],
    xStart: number,
    lineHeight: number,
    drawCodePill = true
  ): void {
    for (const line of lines) {
      this.ensureSpace(lineHeight);
      let cursorX = xStart;
      const baseline = this.y - lineHeight * 0.78;
      for (const seg of line.segments) {
        if (seg.codeBg && seg.text.trim() && drawCodePill) {
          this.page.drawRectangle({
            x: cursorX - 1.5,
            y: baseline - 2.5,
            width: seg.width + 3,
            height: seg.size + 4,
            color: this.palette.codeBg
          });
        }
        if (seg.text) {
          this.page.drawText(seg.text, {
            x: cursorX,
            y: baseline,
            font: seg.font,
            size: seg.size,
            color: seg.color
          });
        }
        if (seg.href && seg.text.trim()) {
          this.page.drawLine({
            start: { x: cursorX, y: baseline - 1.6 },
            end: { x: cursorX + seg.width, y: baseline - 1.6 },
            thickness: 0.6,
            color: seg.color
          });
          addLinkAnnotation(
            this.page,
            [cursorX, baseline - 3, cursorX + seg.width, baseline + seg.size + 1],
            seg.href
          );
        }
        if (seg.strikethrough && seg.text.trim()) {
          this.page.drawLine({
            start: { x: cursorX, y: baseline + seg.size * 0.3 },
            end: { x: cursorX + seg.width, y: baseline + seg.size * 0.3 },
            thickness: 0.7,
            color: seg.color
          });
        }
        cursorX += seg.width;
      }
      this.y -= lineHeight;
    }
  }
}

function buildFontSuite(
  fonts: {
    serifRegular: PDFFont;
    serifItalic: PDFFont;
    serifBold: PDFFont;
    sansRegular: PDFFont;
    sansItalic: PDFFont;
    sansBold: PDFFont;
    monoRegular: PDFFont;
  },
  theme: RenderOptions["theme"]
): FontSuite {
  if (theme === "sans") {
    return {
      display: fonts.sansBold,
      displayBold: fonts.sansBold,
      body: fonts.sansRegular,
      bodyBold: fonts.sansBold,
      bodyItalic: fonts.sansItalic,
      ui: fonts.sansRegular,
      uiBold: fonts.sansBold,
      mono: fonts.monoRegular
    };
  }
  if (theme === "technical") {
    return {
      display: fonts.sansBold,
      displayBold: fonts.sansBold,
      body: fonts.sansRegular,
      bodyBold: fonts.sansBold,
      bodyItalic: fonts.sansItalic,
      ui: fonts.monoRegular,
      uiBold: fonts.sansBold,
      mono: fonts.monoRegular
    };
  }
  return {
    display: fonts.serifBold,
    displayBold: fonts.serifBold,
    body: fonts.serifRegular,
    bodyBold: fonts.serifBold,
    bodyItalic: fonts.serifItalic,
    ui: fonts.sansRegular,
    uiBold: fonts.sansBold,
    mono: fonts.monoRegular
  };
}

function drawVideoCard(
  cursor: PdfCursor,
  video: VideoLinkAsset,
  x: number,
  width: number,
  posterImg: PDFImage | null
): void {
  const padding = 10;
  const innerW = width - padding * 2;
  const ctaWidth = 92;
  const ctaHeight = 20;
  const textW = innerW - ctaWidth - 10;

  const badgeLabel = `${video.isGif ? "GIF" : "EMBEDDED VIDEO"}${video.durationText ? `  ${video.durationText}` : ""}`;
  const urlLines = wrapPlainText(
    video.url,
    textW,
    cursor.suite.mono,
    8.2,
    cursor.palette.textSecondary
  ).slice(0, 2);

  let posterHeight = 0;
  let posterWidth = 0;
  if (cursor.options.includeVideoPoster && posterImg) {
    const scale = Math.min(innerW / posterImg.width, 160 / posterImg.height, 1);
    posterWidth = posterImg.width * scale;
    posterHeight = posterImg.height * scale;
  }

  const textBlockH = 14 + urlLines.length * 11.5;
  const bodyH = Math.max(textBlockH, ctaHeight);
  const cardH = padding * 2 + (posterHeight > 0 ? posterHeight + 8 : 0) + bodyH;

  cursor.ensureSpace(cardH + 6);
  const cardTop = cursor.y;
  const cardBottom = cardTop - cardH;

  cursor.page.drawRectangle({
    x,
    y: cardBottom,
    width,
    height: cardH,
    color: cursor.palette.cardBg,
    borderColor: cursor.palette.borderSubtle,
    borderWidth: 0.85
  });

  let innerY = cardTop - padding;
  if (posterHeight > 0 && posterImg) {
    cursor.page.drawImage(posterImg, {
      x: x + padding,
      y: innerY - posterHeight,
      width: posterWidth,
      height: posterHeight
    });
    innerY -= posterHeight + 8;
  }

  // Badge label
  cursor.page.drawText(sanitizeTextForFont(badgeLabel, cursor.suite.uiBold), {
    x: x + padding,
    y: innerY - 9,
    font: cursor.suite.uiBold,
    size: 7.5,
    color: cursor.palette.textMuted
  });

  // URL lines
  let urlY = innerY - 21;
  for (const l of urlLines) {
    const lineStr = l.segments.map((s) => s.text).join("");
    cursor.page.drawText(lineStr, {
      x: x + padding,
      y: urlY,
      font: cursor.suite.mono,
      size: 8.2,
      color: cursor.palette.textSecondary
    });
    urlY -= 11;
  }

  // Solid monochrome Watch on X button
  const ctaX = x + width - padding - ctaWidth;
  const ctaY = cardBottom + (cardH - posterHeight - (posterHeight > 0 ? 8 : 0) - ctaHeight) / 2;
  cursor.page.drawRectangle({
    x: ctaX,
    y: ctaY,
    width: ctaWidth,
    height: ctaHeight,
    color: cursor.palette.ctaBg
  });
  const ctaText = sanitizeTextForFont("Watch on X ->", cursor.suite.uiBold);
  const ctaTextW = measureWidth(cursor.suite.uiBold, ctaText, 8.2);
  cursor.page.drawText(ctaText, {
    x: ctaX + (ctaWidth - ctaTextW) / 2,
    y: ctaY + 6.8,
    font: cursor.suite.uiBold,
    size: 8.2,
    color: cursor.palette.ctaText
  });

  // Make the entire card clickable in PDF viewers so tapping anywhere opens X
  addLinkAnnotation(cursor.page, [x, cardBottom, x + width, cardTop], video.url);
  cursor.y = cardBottom - 10;
}

async function drawImageAssetBlock(
  pdfDoc: PDFDocument,
  cursor: PdfCursor,
  imgAsset: ImageAsset,
  x: number,
  maxW: number,
  maxH: number,
  caption?: string
): Promise<void> {
  const img = await loadEmbeddableImage(pdfDoc, imgAsset);
  if (!img) return;

  const scale = Math.min(maxW / img.width, maxH / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const captionLines = caption
    ? wrapPlainText(caption, maxW, cursor.suite.ui, 8.5, cursor.palette.textMuted)
    : [];
  const totalH = drawH + (captionLines.length > 0 ? captionLines.length * 11 + 6 : 0);

  cursor.ensureSpace(totalH + 6);
  cursor.page.drawImage(img, {
    x,
    y: cursor.y - drawH,
    width: drawW,
    height: drawH
  });
  cursor.y -= drawH + 4;

  if (captionLines.length > 0) {
    cursor.drawWrappedLines(captionLines, x, 11, false);
  }
  cursor.y -= 8;
}

async function drawEmbeddedPostCard(
  pdfDoc: PDFDocument,
  cursor: PdfCursor,
  post: EmbeddedPost,
  x: number,
  width: number,
  isNested = false
): Promise<void> {
  const pad = 11;
  const innerW = width - pad * 2;
  const textLines = post.text.trim()
    ? wrapPlainText(post.text, innerW, cursor.suite.ui, 9.5, cursor.palette.textPrimary)
    : [];

  // Pre-estimate minimum header + text box so post header isn't orphaned
  const headerH = 22;
  const textH = textLines.length * 13.5;
  const footerH = 18;
  cursor.ensureSpace(Math.min(headerH + textH + footerH + pad * 2, 180));

  const cardTop = cursor.y;
  const bg = isNested ? cursor.palette.cardNestedBg : cursor.palette.cardBg;

  // Draw top border/header manually then flow interior cleanly
  cursor.y -= pad;

  const authorText = sanitizeTextForFont(
    `${post.author.name}  @${post.author.handle}`,
    cursor.suite.uiBold
  );
  cursor.page.drawText(authorText, {
    x: x + pad,
    y: cursor.y - 10,
    font: cursor.suite.uiBold,
    size: 9.2,
    color: cursor.palette.textPrimary
  });
  cursor.y -= 18;

  if (textLines.length > 0) {
    cursor.drawWrappedLines(textLines, x + pad, 13.5, false);
    cursor.y -= 4;
  }

  for (const img of post.images) {
    await drawImageAssetBlock(pdfDoc, cursor, img, x + pad, innerW, 240);
  }

  for (const vid of post.videoLinks) {
    const posterImg = cursor.options.includeVideoPoster
      ? await loadEmbeddableImage(pdfDoc, {
          dataUri: vid.posterDataUri,
          url: vid.posterUrl
        })
      : null;
    drawVideoCard(cursor, vid, x + pad, innerW, posterImg);
  }

  if (post.quotedPost && !isNested) {
    await drawEmbeddedPostCard(pdfDoc, cursor, post.quotedPost, x + pad, innerW, true);
  }

  // Card footer link
  cursor.ensureSpace(16);
  const footerLabel = sanitizeTextForFont(
    post.images.length === 0 && post.videoLinks.length === 0
      ? "Embedded X Post (Text)  |  View post on X ->"
      : "Embedded X Post  |  View post on X ->",
    cursor.suite.ui
  );
  const footerBaseline = cursor.y - 9;
  cursor.page.drawText(footerLabel, {
    x: x + pad,
    y: footerBaseline,
    font: cursor.suite.ui,
    size: 8.2,
    color: cursor.palette.textMuted
  });
  addLinkAnnotation(
    cursor.page,
    [x + pad, footerBaseline - 2, x + width - pad, footerBaseline + 10],
    post.url
  );
  cursor.y -= 16 + pad;

  // Draw crisp frame border on current page region if stayed on same page
  const bottomNow = cursor.y;
  if (cardTop > bottomNow) {
    // Draw subtle left accent rule marking the card span cleanly
    cursor.page.drawRectangle({
      x,
      y: bottomNow + 4,
      width: 2.2,
      height: Math.max(20, cardTop - bottomNow - 4),
      color: isNested ? cursor.palette.borderStrong : cursor.palette.quoteBar
    });
    cursor.page.drawLine({
      start: { x, y: bottomNow + 4 },
      end: { x: x + width, y: bottomNow + 4 },
      thickness: 0.7,
      color: cursor.palette.borderSubtle
    });
    cursor.page.drawLine({
      start: { x, y: cardTop },
      end: { x: x + width, y: cardTop },
      thickness: 0.7,
      color: cursor.palette.borderSubtle
    });
    // Tinted subtle fill would cover text if drawn after, so clean vertical & horizontal rules frame it cleanly
    void bg;
  }
  cursor.y -= 8;
}

function drawLinkCard(cursor: PdfCursor, card: LinkCardAsset, x: number, width: number): void {
  const pad = 10;
  const innerW = width - pad * 2;
  const domain = card.domain ?? "";
  const titleLines = wrapPlainText(card.title, innerW, cursor.suite.uiBold, 9.5, cursor.palette.textPrimary).slice(0, 2);
  const descLines = card.description
    ? wrapPlainText(card.description, innerW, cursor.suite.ui, 8.5, cursor.palette.textSecondary).slice(0, 2)
    : [];

  const cardH = pad * 2 + (domain ? 12 : 0) + titleLines.length * 13 + descLines.length * 11.5;
  cursor.ensureSpace(cardH + 8);
  const top = cursor.y;
  const bottom = top - cardH;

  cursor.page.drawRectangle({
    x,
    y: bottom,
    width,
    height: cardH,
    color: cursor.palette.cardBg,
    borderColor: cursor.palette.borderSubtle,
    borderWidth: 0.85
  });

  cursor.y = top - pad;
  if (domain) {
    cursor.page.drawText(sanitizeTextForFont(domain.toUpperCase(), cursor.suite.mono), {
      x: x + pad,
      y: cursor.y - 8,
      font: cursor.suite.mono,
      size: 7.4,
      color: cursor.palette.textMuted
    });
    cursor.y -= 12;
  }
  cursor.drawWrappedLines(titleLines, x + pad, 13, false);
  if (descLines.length > 0) {
    cursor.drawWrappedLines(descLines, x + pad, 11.5, false);
  }
  addLinkAnnotation(cursor.page, [x, bottom, x + width, top], card.url);
  cursor.y = bottom - 10;
}

function drawListItems(
  cursor: PdfCursor,
  items: ListItem[],
  ordered: boolean,
  baseSize: number,
  lineHeight: number,
  indentLevel: number
): void {
  const indent = indentLevel * 16;
  const bulletOffset = 14;
  items.forEach((item, idx) => {
    const marker = ordered ? `${idx + 1}.` : "-";
    const markerX = cursor.margin + indent;
    const textX = markerX + bulletOffset;
    const maxW = cursor.contentWidth - indent - bulletOffset;
    const paragraphs = tokenizeRuns(item.runs);
    const lines = wrapTokens(
      paragraphs[0] ?? [],
      maxW,
      baseSize,
      cursor.suite,
      cursor.palette.textPrimary,
      cursor.palette.linkColor
    );
    cursor.ensureSpace(lineHeight);
    cursor.page.drawText(marker, {
      x: markerX,
      y: cursor.y - lineHeight * 0.78,
      font: cursor.suite.uiBold,
      size: baseSize * 0.92,
      color: cursor.palette.textSecondary
    });
    cursor.drawWrappedLines(lines, textX, lineHeight);
    if (item.children) {
      drawListItems(cursor, item.children.items, item.children.ordered, baseSize, lineHeight, indentLevel + 1);
    }
  });
}

async function renderBlock(
  pdfDoc: PDFDocument,
  cursor: PdfCursor,
  block: ArticleBlock,
  baseBodyPt: number
): Promise<void> {
  const lineHeight = baseBodyPt * 1.48;

  switch (block.type) {
    case "heading": {
      const sizes = { 1: baseBodyPt * 1.68, 2: baseBodyPt * 1.38, 3: baseBodyPt * 1.15 };
      const hSize = sizes[block.level];
      const hLeading = hSize * 1.24;
      const text = block.runs.map((r) => r.text).join("").trim();
      const lines = wrapPlainText(text, cursor.contentWidth, cursor.suite.displayBold, hSize, cursor.palette.textPrimary);
      // Prevent orphan heading stranded at bottom of page
      cursor.ensureSpace(lines.length * hLeading + 36);
      cursor.y -= 6;
      cursor.drawWrappedLines(lines, cursor.margin, hLeading, false);
      cursor.y -= 4;
      break;
    }

    case "paragraph": {
      const paras = tokenizeRuns(block.runs);
      for (const para of paras) {
        if (para.length === 0) continue;
        const lines = wrapTokens(
          para,
          cursor.contentWidth,
          baseBodyPt,
          cursor.suite,
          cursor.palette.textPrimary,
          cursor.palette.linkColor
        );
        cursor.drawWrappedLines(lines, cursor.margin, lineHeight);
        cursor.y -= 6;
      }
      break;
    }

    case "blockquote": {
      const innerW = cursor.contentWidth - 18;
      const paras = tokenizeRuns(block.runs);
      for (const para of paras) {
        const lines = wrapTokens(
          para,
          innerW,
          baseBodyPt,
          cursor.suite,
          cursor.palette.textSecondary,
          cursor.palette.linkColor,
          cursor.suite.bodyItalic
        );
        const startY = cursor.y;
        cursor.drawWrappedLines(lines, cursor.margin + 14, lineHeight, false);
        const endY = cursor.y;
        if (startY > endY) {
          cursor.page.drawRectangle({
            x: cursor.margin + 2,
            y: endY + 3,
            width: 2.2,
            height: startY - endY - 4,
            color: cursor.palette.quoteBar
          });
        }
      }
      cursor.y -= 8;
      break;
    }

    case "list": {
      drawListItems(cursor, block.items, block.ordered, baseBodyPt, lineHeight, 0);
      cursor.y -= 6;
      break;
    }

    case "code": {
      const codeSize = Math.max(8, baseBodyPt * 0.82);
      const codeLeading = codeSize * 1.42;
      const rawLines = block.code.split(/\r?\n/);
      const pad = 10;
      const boxLines: string[] = [];
      for (const line of rawLines) {
        const safe = sanitizeTextForFont(line, cursor.suite.mono);
        const wrapped = wrapPlainText(safe, cursor.contentWidth - pad * 2, cursor.suite.mono, codeSize, cursor.palette.textPrimary);
        if (wrapped.length === 0) boxLines.push("");
        else boxLines.push(...wrapped.map((wl) => wl.segments.map((s) => s.text).join("")));
      }

      if (block.language) {
        cursor.ensureSpace(24);
        cursor.page.drawText(sanitizeTextForFont(block.language.toUpperCase(), cursor.suite.mono), {
          x: cursor.margin,
          y: cursor.y - 9,
          font: cursor.suite.mono,
          size: 7.4,
          color: cursor.palette.textMuted
        });
        cursor.y -= 13;
      }

      for (const codeLine of boxLines) {
        cursor.ensureSpace(codeLeading + 4);
        cursor.page.drawRectangle({
          x: cursor.margin,
          y: cursor.y - codeLeading,
          width: cursor.contentWidth,
          height: codeLeading,
          color: cursor.palette.codeBg
        });
        cursor.page.drawText(codeLine, {
          x: cursor.margin + pad,
          y: cursor.y - codeLeading * 0.76,
          font: cursor.suite.mono,
          size: codeSize,
          color: cursor.palette.textPrimary
        });
        cursor.y -= codeLeading;
      }
      cursor.y -= 10;
      break;
    }

    case "image": {
      await drawImageAssetBlock(pdfDoc, cursor, block.image, cursor.margin, cursor.contentWidth, 340, block.image.caption);
      break;
    }

    case "image_grid": {
      for (const img of block.images) {
        await drawImageAssetBlock(pdfDoc, cursor, img, cursor.margin, cursor.contentWidth, 260);
      }
      if (block.caption) {
        const lines = wrapPlainText(block.caption, cursor.contentWidth, cursor.suite.ui, 8.5, cursor.palette.textMuted);
        cursor.drawWrappedLines(lines, cursor.margin, 11, false);
        cursor.y -= 6;
      }
      break;
    }

    case "video_link": {
      const posterImg = cursor.options.includeVideoPoster
        ? await loadEmbeddableImage(pdfDoc, {
            dataUri: block.video.posterDataUri,
            url: block.video.posterUrl
          })
        : null;
      drawVideoCard(cursor, block.video, cursor.margin, cursor.contentWidth, posterImg);
      break;
    }

    case "embedded_post": {
      await drawEmbeddedPostCard(pdfDoc, cursor, block.post, cursor.margin, cursor.contentWidth, false);
      break;
    }

    case "link_card": {
      drawLinkCard(cursor, block.card, cursor.margin, cursor.contentWidth);
      break;
    }

    case "divider": {
      cursor.ensureSpace(16);
      cursor.y -= 6;
      cursor.page.drawLine({
        start: { x: cursor.margin + cursor.contentWidth * 0.25, y: cursor.y },
        end: { x: cursor.margin + cursor.contentWidth * 0.75, y: cursor.y },
        thickness: 0.75,
        color: cursor.palette.borderSubtle
      });
      cursor.y -= 10;
      break;
    }
  }
}

export async function generateClientArticlePdfBytes(
  doc: ArticleDocument,
  options: RenderOptions,
  providedFonts?: ClientPdfFontBuffers
): Promise<Uint8Array> {
  const fontData = providedFonts ?? (await (await import("./client-pdf-fonts.js")).loadBrowserPdfFonts());
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  pdfDoc.setTitle(doc.title);
  pdfDoc.setAuthor(`${doc.author.name} (@${doc.author.handle})`);
  pdfDoc.setCreator("XArticle PDF");

  const noLigatures = { features: { calt: false, liga: false, dlig: false } };
  const [serifRegular, serifItalic, serifBold, sansRegular, sansItalic, sansBold, monoRegular] =
    await Promise.all([
      pdfDoc.embedFont(fontData.serifRegular, noLigatures),
      pdfDoc.embedFont(fontData.serifItalic, noLigatures),
      pdfDoc.embedFont(fontData.serifBold, noLigatures),
      pdfDoc.embedFont(fontData.sansRegular, noLigatures),
      pdfDoc.embedFont(fontData.sansItalic, noLigatures),
      pdfDoc.embedFont(fontData.sansBold, noLigatures),
      pdfDoc.embedFont(fontData.monoRegular, noLigatures)
    ]);

  const palette = getPdfPalette(options.paper);
  const suite = buildFontSuite(
    { serifRegular, serifItalic, serifBold, sansRegular, sansItalic, sansBold, monoRegular },
    options.theme
  );
  const cursor = new PdfCursor(pdfDoc, options, palette, suite);
  const scale = Math.max(0.82, Math.min(1.3, options.fontScale || 1));
  const baseBodyPt = (options.theme === "editorial" ? 11.2 : 10.4) * scale;

  // Cover image
  if (options.includeCover && doc.coverMedia) {
    await drawImageAssetBlock(pdfDoc, cursor, doc.coverMedia, cursor.margin, cursor.contentWidth, 260);
  }

  // Title & Author Header
  if (options.includeHeader) {
    cursor.page.drawText("X ARTICLE", {
      x: cursor.margin,
      y: cursor.y - 8,
      font: suite.uiBold,
      size: 7.5,
      color: palette.textMuted
    });
    cursor.y -= 16;

    const titleSize = 21 * scale;
    const titleLines = wrapPlainText(doc.title, cursor.contentWidth, suite.displayBold, titleSize, palette.textPrimary);
    cursor.drawWrappedLines(titleLines, cursor.margin, titleSize * 1.18, false);
    cursor.y -= 4;

    if (doc.subtitle) {
      const subLines = wrapPlainText(doc.subtitle, cursor.contentWidth, suite.ui, 10.5 * scale, palette.textSecondary);
      cursor.drawWrappedLines(subLines, cursor.margin, 14.5 * scale, false);
      cursor.y -= 4;
    }

    const byline = sanitizeTextForFont(
      `${doc.author.name} (@${doc.author.handle})  |  ${doc.diagnostics.readingTimeMinutes} min read  |  ${doc.diagnostics.wordCount.toLocaleString()} words`,
      suite.ui
    );
    cursor.page.drawText(byline, {
      x: cursor.margin,
      y: cursor.y - 10,
      font: suite.ui,
      size: 8.8,
      color: palette.textMuted
    });
    const origLabel = sanitizeTextForFont("Original on X ->", suite.uiBold);
    const origW = measureWidth(suite.uiBold, origLabel, 8.5);
    const origX = cursor.margin + cursor.contentWidth - origW;
    cursor.page.drawText(origLabel, {
      x: origX,
      y: cursor.y - 10,
      font: suite.uiBold,
      size: 8.5,
      color: palette.textPrimary
    });
    addLinkAnnotation(cursor.page, [origX, cursor.y - 13, origX + origW, cursor.y], doc.canonicalUrl);
    cursor.y -= 18;

    cursor.page.drawLine({
      start: { x: cursor.margin, y: cursor.y },
      end: { x: cursor.margin + cursor.contentWidth, y: cursor.y },
      thickness: 0.85,
      color: palette.borderSubtle
    });
    cursor.y -= 14;
  }

  // Optional Table of Contents
  if (options.includeToc) {
    const headings = doc.blocks.filter((b): b is Extract<ArticleBlock, { type: "heading" }> => b.type === "heading");
    if (headings.length >= 2) {
      cursor.ensureSpace(headings.length * 14 + 28);
      cursor.page.drawText("CONTENTS", {
        x: cursor.margin,
        y: cursor.y - 9,
        font: suite.uiBold,
        size: 8,
        color: palette.textMuted
      });
      cursor.y -= 16;
      for (const h of headings) {
        const text = sanitizeTextForFont(h.runs.map((r) => r.text).join("").trim(), suite.ui);
        const indent = (h.level - 1) * 10;
        const lines = wrapPlainText(text, cursor.contentWidth - indent, suite.ui, 9.2, palette.textSecondary);
        cursor.drawWrappedLines(lines, cursor.margin + indent, 13, false);
      }
      cursor.y -= 10;
    }
  }

  // Article body blocks
  for (const block of doc.blocks) {
    await renderBlock(pdfDoc, cursor, block, baseBodyPt);
  }

  // Colophon
  cursor.ensureSpace(26);
  cursor.y -= 8;
  cursor.page.drawLine({
    start: { x: cursor.margin, y: cursor.y },
    end: { x: cursor.margin + cursor.contentWidth, y: cursor.y },
    thickness: 0.7,
    color: palette.borderSubtle
  });
  cursor.y -= 13;
  const colophonText = sanitizeTextForFont(`Source: ${doc.canonicalUrl}`, suite.ui);
  cursor.page.drawText(colophonText, {
    x: cursor.margin,
    y: cursor.y,
    font: suite.ui,
    size: 8,
    color: palette.textMuted
  });
  addLinkAnnotation(cursor.page, [cursor.margin, cursor.y - 3, cursor.margin + cursor.contentWidth, cursor.y + 10], doc.canonicalUrl);

  // Running headers and footers across all pages
  if (options.includeRunningHeaderFooter) {
    const pages = pdfDoc.getPages();
    const total = pages.length;
    const shortTitle = sanitizeTextForFont(
      doc.title.length > 64 ? `${doc.title.slice(0, 61)}...` : doc.title,
      suite.ui
    );
    const authorTag = sanitizeTextForFont(`@${doc.author.handle}`, suite.ui);
    const sourceTag = sanitizeTextForFont(`x.com/${doc.author.handle}`, suite.ui);

    pages.forEach((p, idx) => {
      const topLineY = cursor.pageHeight - cursor.margin * 0.58;
      const botLineY = cursor.margin * 0.45;
      p.drawText(shortTitle, {
        x: cursor.margin,
        y: topLineY,
        font: suite.ui,
        size: 7.5,
        color: palette.textMuted
      });
      const authW = measureWidth(suite.ui, authorTag, 7.5);
      p.drawText(authorTag, {
        x: cursor.pageWidth - cursor.margin - authW,
        y: topLineY,
        font: suite.ui,
        size: 7.5,
        color: palette.textMuted
      });

      p.drawText(sourceTag, {
        x: cursor.margin,
        y: botLineY,
        font: suite.ui,
        size: 7.5,
        color: palette.textMuted
      });
      const pageLabel = `Page ${idx + 1} of ${total}`;
      const pageW = measureWidth(suite.ui, pageLabel, 7.5);
      p.drawText(pageLabel, {
        x: cursor.pageWidth - cursor.margin - pageW,
        y: botLineY,
        font: suite.ui,
        size: 7.5,
        color: palette.textMuted
      });
    });
  }

  return pdfDoc.save({ useObjectStreams: false });
}

export async function buildClientPdfExportBlob(
  articles: ArticleDocument[],
  options: RenderOptions,
  providedFonts?: ClientPdfFontBuffers
): Promise<{ blob: Blob; filename: string }> {
  if (articles.length === 1) {
    const doc = articles[0];
    const pdfBytes = await generateClientArticlePdfBytes(doc, options, providedFonts);
    const filename = buildPdfFilename(doc);
    return {
      blob: new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" }),
      filename
    };
  }

  const zip = new JSZip();
  const usedNames = new Set<string>();
  for (const doc of articles) {
    const pdfBytes = await generateClientArticlePdfBytes(doc, options, providedFonts);
    let name = buildPdfFilename(doc);
    if (usedNames.has(name)) {
      name = name.replace(/\.pdf$/i, `-${doc.id}.pdf`);
    }
    usedNames.add(name);
    zip.file(name, pdfBytes);
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  return {
    blob: zipBlob,
    filename: "x-articles-export.zip"
  };
}
