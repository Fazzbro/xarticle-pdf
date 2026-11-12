import type { MarginPreset, PaperPreset, RenderOptions, ThemePreset } from "../core/types.js";

export function getMarginMm(preset: MarginPreset): { top: string; right: string; bottom: string; left: string } {
  switch (preset) {
    case "compact":
      return { top: "14mm", right: "14mm", bottom: "15mm", left: "14mm" };
    case "generous":
      return { top: "22mm", right: "22mm", bottom: "22mm", left: "22mm" };
    case "balanced":
    default:
      return { top: "18mm", right: "18mm", bottom: "19mm", left: "18mm" };
  }
}

function getThemeVars(theme: ThemePreset): string {
  switch (theme) {
    case "sans":
      return `
  --font-display: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-body: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-ui: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --body-line-height: 1.68;
  --heading-tracking: -0.025em;
`;
    case "technical":
      return `
  --font-display: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-body: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-ui: 'JetBrains Mono', 'Inter', monospace;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --body-line-height: 1.65;
  --heading-tracking: -0.02em;
`;
    case "editorial":
    default:
      return `
  --font-display: 'Newsreader', Georgia, 'Times New Roman', serif;
  --font-body: 'Newsreader', Georgia, 'Times New Roman', serif;
  --font-ui: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --body-line-height: 1.72;
  --heading-tracking: -0.02em;
`;
  }
}

function getPaperVars(paper: PaperPreset): string {
  switch (paper) {
    case "ivory":
      return `
  --bg-page: #FAF8F3;
  --bg-card: #F3EFE6;
  --bg-card-nested: #ECE6D9;
  --bg-code: #F1EDE4;
  --text-primary: #1C1917;
  --text-secondary: #57534E;
  --text-muted: #78716C;
  --border-subtle: #E2DDD2;
  --border-strong: #C9C1B2;
  --accent: #0F62FE;
  --accent-soft: #E8F0FE;
  --quote-bar: #B45309;
`;
    case "dark":
      return `
  --bg-page: #09090B;
  --bg-card: #121215;
  --bg-card-nested: #18181C;
  --bg-code: #0E0E11;
  --text-primary: #FAFAFA;
  --text-secondary: #D4D4D8;
  --text-muted: #A1A1AA;
  --border-subtle: #27272A;
  --border-strong: #3F3F46;
  --accent: #FAFAFA;
  --accent-soft: #27272A;
  --quote-bar: #FAFAFA;
`;
    case "light":
    default:
      return `
  --bg-page: #FFFFFF;
  --bg-card: #F7F7F8;
  --bg-card-nested: #EFEFF1;
  --bg-code: #F4F4F6;
  --text-primary: #09090B;
  --text-secondary: #3F3F46;
  --text-muted: #71717A;
  --border-subtle: #E4E4E7;
  --border-strong: #D4D4D8;
  --accent: #09090B;
  --accent-soft: #E4E4E7;
  --quote-bar: #09090B;
`;
  }
}

export function buildArticleStylesheetCore(options: RenderOptions, fontFaceCss = ""): string {
  const margins = getMarginMm(options.margins);
  const scale = Math.max(0.82, Math.min(1.3, options.fontScale || 1));
  const baseBodyPt = (options.theme === "editorial" ? 11.2 : 10.4) * scale;

  return `
${fontFaceCss}

:root {
  ${getThemeVars(options.theme)}
  ${getPaperVars(options.paper)}
  --base-size: ${baseBodyPt.toFixed(2)}pt;
}

@page {
  size: ${options.pageSize};
  margin: ${margins.top} ${margins.right} ${margins.bottom} ${margins.left};
}

@page :first {
  margin-top: ${margins.top};
}

*, *::before, *::after {
  box-sizing: border-box;
}

html, body {
  margin: 0;
  padding: 0;
  background: var(--bg-page);
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: var(--base-size);
  line-height: var(--body-line-height);
  -webkit-font-smoothing: antialiased;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* Screen preview presentation wrapper */
@media screen {
  html {
    min-height: 100%;
    background: ${options.paper === "dark" ? "#050506" : "#EAECEF"};
  }
  body {
    min-height: 100%;
    padding: 36px 24px 64px;
    background: ${options.paper === "dark" ? "#050506" : "#EAECEF"};
  }
  .article-shell {
    max-width: 760px;
    margin: 0 auto;
    background: var(--bg-page);
    padding: 48px 56px;
    border-radius: 8px;
    box-shadow: 0 12px 36px rgba(15, 23, 42, 0.1);
  }
}

@media screen and (max-width: 560px) {
  body {
    padding: 14px 10px 32px;
  }
  .article-shell {
    padding: 26px 20px;
    border-radius: 6px;
  }
  .video-link-card {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
  .video-cta {
    text-align: center;
  }
}

@media print {
  body {
    background: var(--bg-page);
  }
  .article-shell {
    width: 100%;
    max-width: none;
    margin: 0;
    padding: 0;
  }
}

/* Cover image */
.cover-figure {
  margin: 0 0 22px 0;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  break-inside: avoid;
  page-break-inside: avoid;
}

.cover-figure img {
  display: block;
  width: 100%;
  max-height: 92mm;
  object-fit: cover;
}

/* Header & Author Byline */
.article-header {
  margin-bottom: 24px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--border-subtle);
}

.article-kicker {
  font-family: var(--font-ui);
  font-size: 0.72em;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
  margin: 0 0 10px 0;
}

.article-title {
  font-family: var(--font-display);
  font-size: 2.15em;
  font-weight: 700;
  line-height: 1.18;
  letter-spacing: var(--heading-tracking);
  margin: 0 0 12px 0;
  color: var(--text-primary);
  break-after: avoid;
}

.article-subtitle {
  font-family: var(--font-body);
  font-size: 1.15em;
  line-height: 1.48;
  color: var(--text-secondary);
  margin: 0 0 16px 0;
}

.byline-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  font-family: var(--font-ui);
}

.author-block {
  display: flex;
  align-items: center;
  gap: 11px;
}

.avatar-img, .avatar-initials {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  flex-shrink: 0;
}

.avatar-img {
  object-fit: cover;
  border: 1px solid var(--border-subtle);
}

.avatar-initials {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 700;
  font-size: 0.85em;
}

.author-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.author-name-line {
  display: flex;
  align-items: center;
  gap: 5px;
  font-weight: 600;
  font-size: 0.9em;
  color: var(--text-primary);
}

.verified-badge {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.author-sub-line {
  font-size: 0.78em;
  color: var(--text-muted);
}

.source-pill {
  font-family: var(--font-ui);
  font-size: 0.76em;
  font-weight: 500;
  color: var(--accent);
  text-decoration: none;
  padding: 5px 10px;
  border-radius: 999px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-card);
  white-space: nowrap;
}

.stats-strip {
  display: flex;
  gap: 16px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--border-subtle);
  font-family: var(--font-ui);
  font-size: 0.75em;
  color: var(--text-muted);
}

/* Table of Contents */
.toc-box {
  margin: 0 0 24px 0;
  padding: 14px 18px;
  border-radius: 8px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  break-inside: avoid;
  page-break-inside: avoid;
}

.toc-title {
  font-family: var(--font-ui);
  font-size: 0.74em;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin: 0 0 8px 0;
}

.toc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  font-family: var(--font-ui);
  font-size: 0.84em;
}

.toc-list li {
  margin: 4px 0;
}

.toc-list li.toc-l2 {
  padding-left: 14px;
}

.toc-list li.toc-l3 {
  padding-left: 28px;
}

.toc-list a {
  color: var(--text-secondary);
  text-decoration: none;
}

/* Body Typography */
.article-body > *:first-child {
  margin-top: 0;
}

p {
  margin: 0 0 13px 0;
  orphans: 3;
  widows: 3;
  overflow-wrap: break-word;
}

h1, h2, h3 {
  font-family: var(--font-display);
  color: var(--text-primary);
  letter-spacing: var(--heading-tracking);
  break-after: avoid;
  page-break-after: avoid;
}

h1.body-h1 {
  font-size: 1.55em;
  font-weight: 700;
  line-height: 1.25;
  margin: 28px 0 12px 0;
  padding-bottom: 5px;
  border-bottom: 1px solid var(--border-subtle);
}

h2.body-h2 {
  font-size: 1.32em;
  font-weight: 700;
  line-height: 1.28;
  margin: 24px 0 10px 0;
}

h3.body-h3 {
  font-size: 1.12em;
  font-weight: 600;
  line-height: 1.32;
  margin: 18px 0 8px 0;
}

a {
  color: var(--accent);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
  overflow-wrap: anywhere;
}

code.inline-code {
  font-family: var(--font-mono);
  font-size: 0.86em;
  background: var(--bg-code);
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid var(--border-subtle);
}

blockquote.article-quote {
  margin: 16px 0;
  padding: 10px 16px;
  border-left: 3px solid var(--quote-bar);
  background: var(--bg-card);
  border-radius: 0 6px 6px 0;
  color: var(--text-secondary);
  font-style: italic;
  orphans: 3;
  widows: 3;
}

blockquote.article-quote p:last-child {
  margin-bottom: 0;
}

ul.article-list, ol.article-list {
  margin: 0 0 14px 0;
  padding-left: 22px;
}

ul.article-list li, ol.article-list li {
  margin: 5px 0;
  orphans: 3;
  widows: 3;
}

ul.article-list ul, ol.article-list ol, ul.article-list ol, ol.article-list ul {
  margin: 4px 0 4px 0;
}

hr.article-divider {
  border: none;
  height: 1px;
  background: var(--border-subtle);
  margin: 24px auto;
  width: 40%;
}

/* Code Blocks */
.code-block {
  margin: 16px 0;
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-code);
  overflow: hidden;
  break-inside: avoid;
  page-break-inside: avoid;
}

.code-header {
  font-family: var(--font-mono);
  font-size: 0.72em;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-subtle);
}

.code-block pre {
  margin: 0;
  padding: 12px 14px;
  font-family: var(--font-mono);
  font-size: 0.82em;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  color: var(--text-primary);
}

/* Images & Grids */
figure.article-figure {
  margin: 18px 0;
  break-inside: avoid;
  page-break-inside: avoid;
}

figure.article-figure img {
  display: block;
  width: 100%;
  max-height: 165mm;
  object-fit: contain;
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-card);
}

.image-grid {
  display: grid;
  gap: 8px;
  margin: 18px 0;
  break-inside: avoid;
  page-break-inside: avoid;
}

.image-grid.cols-2 {
  grid-template-columns: repeat(2, 1fr);
}

.image-grid.cols-3 {
  grid-template-columns: repeat(3, 1fr);
}

.image-grid img {
  display: block;
  width: 100%;
  height: 58mm;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--border-subtle);
}

figcaption.media-caption {
  font-family: var(--font-ui);
  font-size: 0.78em;
  color: var(--text-muted);
  text-align: center;
  margin-top: 7px;
  line-height: 1.4;
}

/* Video Link Replacement Card */
.video-link-card {
  margin: 16px 0;
  padding: 12px 15px;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  background: var(--bg-card);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  break-inside: avoid;
  page-break-inside: avoid;
  font-family: var(--font-ui);
}

.video-link-card.compact {
  margin: 10px 0 0 0;
  padding: 9px 12px;
}

.video-link-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.video-play-icon {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.video-link-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.video-badge-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.video-badge {
  font-size: 0.68em;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent);
}

.video-duration {
  font-size: 0.7em;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.video-caption {
  font-size: 0.8em;
  color: var(--text-secondary);
  line-height: 1.35;
}

.video-url-sub {
  font-size: 0.73em;
  color: var(--text-muted);
  overflow-wrap: anywhere;
  text-decoration: none;
}

.video-cta {
  font-size: 0.78em;
  font-weight: 600;
  color: var(--bg-page);
  background: var(--accent);
  text-decoration: none;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid var(--accent);
  white-space: nowrap;
  flex-shrink: 0;
}

.video-poster-thumb {
  width: 96px;
  height: 56px;
  border-radius: 6px;
  object-fit: cover;
  border: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

/* Embedded Post Card (Text-only & Media-rich) */
.embedded-post {
  margin: 18px 0;
  padding: 15px 17px;
  border-radius: 10px;
  border: 1px solid var(--border-strong);
  background: var(--bg-card);
  break-inside: avoid;
  page-break-inside: avoid;
  font-family: var(--font-ui);
}

.embedded-post-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 9px;
}

.embedded-author {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.embedded-avatar, .embedded-avatar-initials {
  width: 30px;
  height: 30px;
  border-radius: 999px;
  flex-shrink: 0;
}

.embedded-avatar {
  object-fit: cover;
  border: 1px solid var(--border-subtle);
}

.embedded-avatar-initials {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 0.75em;
  font-weight: 700;
}

.embedded-author-names {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  min-width: 0;
}

.embedded-name-row {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.86em;
  font-weight: 600;
  color: var(--text-primary);
}

.embedded-handle {
  font-size: 0.76em;
  color: var(--text-muted);
}

.embedded-date {
  font-size: 0.74em;
  color: var(--text-muted);
  white-space: nowrap;
}

.embedded-body {
  font-size: 0.9em;
  line-height: 1.55;
  color: var(--text-primary);
  white-space: pre-line;
  overflow-wrap: break-word;
}

.embedded-media-grid {
  display: grid;
  gap: 6px;
  margin-top: 10px;
}

.embedded-media-grid.count-1 {
  grid-template-columns: 1fr;
}

.embedded-media-grid.count-2 {
  grid-template-columns: 1fr 1fr;
}

.embedded-media-grid.count-3, .embedded-media-grid.count-4 {
  grid-template-columns: 1fr 1fr;
}

.embedded-media-grid img {
  display: block;
  width: 100%;
  max-height: 95mm;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--border-subtle);
}

.embedded-quote {
  margin-top: 10px;
  padding: 11px 13px;
  border-radius: 0 8px 8px 0;
  border: 1px solid var(--border-subtle);
  border-left: 3px solid var(--accent);
  background: var(--bg-card-nested);
}

.embedded-poll {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.poll-row {
  position: relative;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--border-subtle);
  overflow: hidden;
  display: flex;
  justify-content: space-between;
  font-size: 0.8em;
}

.poll-bar {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  background: var(--accent-soft);
  z-index: 0;
}

.poll-label, .poll-pct {
  position: relative;
  z-index: 1;
}

.poll-pct {
  font-weight: 600;
  font-family: var(--font-mono);
}

.embedded-post-footer {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.74em;
  color: var(--text-muted);
}

.embedded-post-footer a {
  text-decoration: none;
  font-weight: 500;
}

/* Link Preview Card */
.link-card {
  margin: 14px 0;
  padding: 11px 14px;
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-card);
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
  color: inherit;
  break-inside: avoid;
  page-break-inside: avoid;
  font-family: var(--font-ui);
}

.link-card.nested {
  margin: 10px 0 0 0;
  background: var(--bg-card-nested);
}

.link-card-thumb {
  width: 68px;
  height: 68px;
  border-radius: 6px;
  object-fit: cover;
  border: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.link-card-info {
  min-width: 0;
}

.link-card-domain {
  font-size: 0.72em;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 2px;
}

.link-card-title {
  font-size: 0.86em;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 3px;
}

.link-card-desc {
  font-size: 0.78em;
  color: var(--text-secondary);
  line-height: 1.38;
}

.article-colophon {
  margin-top: 28px;
  padding-top: 14px;
  border-top: 1px solid var(--border-subtle);
  font-family: var(--font-ui);
  font-size: 0.76em;
  color: var(--text-muted);
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
`;
}
