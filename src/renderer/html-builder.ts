import type {
  ArticleBlock,
  ArticleDocument,
  AuthorProfile,
  EmbeddedPost,
  ImageAsset,
  LinkCardAsset,
  ListItem,
  RenderOptions,
  TextRun,
  VideoLinkAsset
} from "../core/types.js";
import { buildArticleStylesheet } from "./styles.js";

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeHref(url: string | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (trimmed.startsWith("#")) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "mailto:") {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}

function sanitizeImgSrc(img: { dataUri?: string; url?: string }): string | null {
  if (img.dataUri && img.dataUri.startsWith("data:image/")) {
    return img.dataUri;
  }
  if (img.url) {
    return sanitizeHref(img.url);
  }
  return null;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "X";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatCompactNumber(n?: number): string | undefined {
  if (typeof n !== "number" || !Number.isFinite(n)) return undefined;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function renderVerifiedSvg(type: AuthorProfile["verifiedType"]): string {
  if (!type) return "";
  return `<svg class="verified-badge" viewBox="0 0 24 24" aria-label="Verified">
    <path fill="currentColor" d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z"/>
  </svg>`;
}

function renderTextRuns(runs: TextRun[]): string {
  return runs
    .map((run) => {
      let html = escapeHtml(run.text).replace(/\n/g, "<br>");
      if (run.code) html = `<code class="inline-code">${html}</code>`;
      if (run.strikethrough) html = `<s>${html}</s>`;
      if (run.italic) html = `<em>${html}</em>`;
      if (run.bold) html = `<strong>${html}</strong>`;
      const safeHref = sanitizeHref(run.href);
      if (safeHref) {
        html = `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer">${html}</a>`;
      }
      return html;
    })
    .join("");
}

function renderList(ordered: boolean, items: ListItem[]): string {
  const tag = ordered ? "ol" : "ul";
  const inner = items
    .map((item) => {
      const content = renderTextRuns(item.runs);
      const child = item.children ? renderList(item.children.ordered, item.children.items) : "";
      return `<li>${content}${child}</li>`;
    })
    .join("");
  return `<${tag} class="article-list">${inner}</${tag}>`;
}

function renderVideoLinkCard(video: VideoLinkAsset, includePoster: boolean, compact = false): string {
  const href = sanitizeHref(video.url) ?? sanitizeHref(video.directUrl) ?? "#";
  const badge = video.isGif ? "Animated GIF" : "Embedded Video";
  const durationHtml = video.durationText ? `<span class="video-duration">${escapeHtml(video.durationText)}</span>` : "";
  const captionHtml = video.caption ? `<div class="video-caption">${escapeHtml(video.caption)}</div>` : "";
  const posterSrc = includePoster
    ? sanitizeImgSrc({ dataUri: video.posterDataUri, url: video.posterUrl })
    : null;
  const posterHtml = posterSrc
    ? `<img class="video-poster-thumb" src="${escapeHtml(posterSrc)}" alt="${escapeHtml(badge)} preview">`
    : "";

  return `<div class="video-link-card${compact ? " compact" : ""}">
  <div class="video-link-left">
    ${
      posterHtml ||
      `<span class="video-play-icon" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5.14v14l11-7-11-7z"/>
        </svg>
      </span>`
    }
    <div class="video-link-meta">
      <div class="video-badge-row">
        <span class="video-badge">${badge}</span>
        ${durationHtml}
      </div>
      ${captionHtml}
      <a class="video-url-sub" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(href)}</a>
    </div>
  </div>
  <a class="video-cta" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">Watch on X ↗</a>
</div>`;
}

function renderLinkCard(card: LinkCardAsset, nested = false): string {
  const href = sanitizeHref(card.url) ?? "#";
  const imgSrc = sanitizeImgSrc({ dataUri: card.imageDataUri, url: card.imageUrl });
  return `<a class="link-card${nested ? " nested" : ""}" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">
  ${imgSrc ? `<img class="link-card-thumb" src="${escapeHtml(imgSrc)}" alt="">` : ""}
  <div class="link-card-info">
    <div class="link-card-domain">${escapeHtml(card.domain)}</div>
    <div class="link-card-title">${escapeHtml(card.title)}</div>
    ${card.description ? `<div class="link-card-desc">${escapeHtml(card.description)}</div>` : ""}
  </div>
</a>`;
}

function renderEmbeddedPost(post: EmbeddedPost, options: RenderOptions, nested = false): string {
  const postHref = sanitizeHref(post.url) ?? "#";
  const avatarSrc = sanitizeImgSrc({ dataUri: post.author.avatarDataUri, url: post.author.avatarUrl });
  const avatarHtml = avatarSrc
    ? `<img class="embedded-avatar" src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(post.author.name)}">`
    : `<span class="embedded-avatar-initials">${escapeHtml(getInitials(post.author.name))}</span>`;
  const dateStr = formatDate(post.createdAt);

  const bodyHtml =
    post.runs.length > 0
      ? renderTextRuns(post.runs)
      : post.text
        ? escapeHtml(post.text)
        : post.unavailableReason
          ? `<em>${escapeHtml(post.unavailableReason)}</em>`
          : "";

  let imagesHtml = "";
  if (post.images.length > 0) {
    const countClass = `count-${Math.min(4, post.images.length)}`;
    const imgs = post.images
      .slice(0, 4)
      .map((img) => {
        const src = sanitizeImgSrc(img);
        if (!src) return "";
        return `<img src="${escapeHtml(src)}" alt="${escapeHtml(img.alt ?? "Embedded post image")}">`;
      })
      .filter(Boolean)
      .join("");
    if (imgs) {
      imagesHtml = `<div class="embedded-media-grid ${countClass}">${imgs}</div>`;
    }
  }

  const videoLinksHtml = post.videoLinks
    .map((v) => renderVideoLinkCard(v, options.includeVideoPoster, true))
    .join("");

  let pollHtml = "";
  if (post.poll && post.poll.choices.length > 0) {
    const rows = post.poll.choices
      .map((c) => {
        const pct = Math.max(0, Math.min(100, Math.round(c.percentage)));
        return `<div class="poll-row">
          <span class="poll-bar" style="width: ${pct}%"></span>
          <span class="poll-label">${escapeHtml(c.label)}</span>
          <span class="poll-pct">${pct}%</span>
        </div>`;
      })
      .join("");
    pollHtml = `<div class="embedded-poll">${rows}</div>`;
  }

  const linkCardHtml = post.linkCard ? renderLinkCard(post.linkCard, true) : "";
  const quoteHtml = post.quotedPost ? renderEmbeddedPost(post.quotedPost, options, true) : "";

  const header = `<div class="embedded-post-header">
    <div class="embedded-author">
      ${avatarHtml}
      <div class="embedded-author-names">
        <div class="embedded-name-row">
          <span>${escapeHtml(post.author.name)}</span>
          ${renderVerifiedSvg(post.author.verifiedType)}
        </div>
        <span class="embedded-handle">@${escapeHtml(post.author.handle)}</span>
      </div>
    </div>
    ${dateStr ? `<span class="embedded-date">${escapeHtml(dateStr)}</span>` : ""}
  </div>`;

  const footer = nested
    ? ""
    : `<div class="embedded-post-footer">
        <span>Embedded X Post${post.images.length === 0 && post.videoLinks.length === 0 ? "" : ""}</span>
        <a href="${escapeHtml(postHref)}" target="_blank" rel="noopener noreferrer">View post on X ↗</a>
      </div>`;

  return `<div class="${nested ? "embedded-quote" : "embedded-post"}">
  ${header}
  ${bodyHtml ? `<div class="embedded-body">${bodyHtml}</div>` : ""}
  ${imagesHtml}
  ${videoLinksHtml}
  ${pollHtml}
  ${linkCardHtml}
  ${quoteHtml}
  ${footer}
</div>`;
}

function renderImageFigure(img: ImageAsset): string {
  const src = sanitizeImgSrc(img);
  if (!src) return "";
  const caption = img.caption ? `<figcaption class="media-caption">${escapeHtml(img.caption)}</figcaption>` : "";
  return `<figure class="article-figure">
  <img src="${escapeHtml(src)}" alt="${escapeHtml(img.alt ?? "")}">
  ${caption}
</figure>`;
}

function renderBlock(block: ArticleBlock, options: RenderOptions): string {
  switch (block.type) {
    case "paragraph":
      return `<p>${renderTextRuns(block.runs)}</p>`;
    case "heading": {
      const tag = `h${block.level}`;
      return `<${tag} id="${escapeHtml(block.id)}" class="body-h${block.level}">${renderTextRuns(block.runs)}</${tag}>`;
    }
    case "blockquote":
      return `<blockquote class="article-quote"><p>${renderTextRuns(block.runs)}</p></blockquote>`;
    case "list":
      return renderList(block.ordered, block.items);
    case "code": {
      const langHeader = block.language
        ? `<div class="code-header">${escapeHtml(block.language)}</div>`
        : "";
      return `<div class="code-block">${langHeader}<pre><code>${escapeHtml(block.code)}</code></pre></div>`;
    }
    case "divider":
      return `<hr class="article-divider">`;
    case "image":
      return renderImageFigure(block.image);
    case "image_grid": {
      const cols = block.images.length === 2 ? "cols-2" : "cols-3";
      const imgs = block.images
        .map((img) => {
          const src = sanitizeImgSrc(img);
          return src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(img.alt ?? "")}">` : "";
        })
        .filter(Boolean)
        .join("");
      if (!imgs) return "";
      const caption = block.caption ? `<figcaption class="media-caption">${escapeHtml(block.caption)}</figcaption>` : "";
      return `<figure class="article-figure">
  <div class="image-grid ${cols}">${imgs}</div>
  ${caption}
</figure>`;
    }
    case "video_link":
      return renderVideoLinkCard(block.video, options.includeVideoPoster, false);
    case "embedded_post":
      return renderEmbeddedPost(block.post, options, false);
    case "link_card":
      return renderLinkCard(block.card, false);
  }
}

export function buildArticleHtml(doc: ArticleDocument, options: RenderOptions): string {
  const css = buildArticleStylesheet(options);
  const canonicalHref = sanitizeHref(doc.canonicalUrl) ?? "https://x.com";

  // Cover media
  let coverHtml = "";
  if (options.includeCover && doc.coverMedia) {
    const coverSrc = sanitizeImgSrc(doc.coverMedia);
    if (coverSrc) {
      coverHtml = `<figure class="cover-figure"><img src="${escapeHtml(coverSrc)}" alt="${escapeHtml(doc.title)}"></figure>`;
    }
  }

  // Header
  let headerHtml = "";
  if (options.includeHeader) {
    const avatarSrc = sanitizeImgSrc({ dataUri: doc.author.avatarDataUri, url: doc.author.avatarUrl });
    const avatarHtml = avatarSrc
      ? `<img class="avatar-img" src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(doc.author.name)}">`
      : `<span class="avatar-initials">${escapeHtml(getInitials(doc.author.name))}</span>`;
    const dateStr = formatDate(doc.publishedAt);
    const metaParts = [
      `@${escapeHtml(doc.author.handle)}`,
      dateStr ? escapeHtml(dateStr) : null,
      `${doc.diagnostics.readingTimeMinutes} min read`,
      `${doc.diagnostics.wordCount.toLocaleString()} words`
    ].filter(Boolean);

    let statsHtml = "";
    if (options.includeStats && doc.stats) {
      const items = [
        doc.stats.likes !== undefined ? `${formatCompactNumber(doc.stats.likes)} Likes` : null,
        doc.stats.reposts !== undefined ? `${formatCompactNumber(doc.stats.reposts)} Reposts` : null,
        doc.stats.replies !== undefined ? `${formatCompactNumber(doc.stats.replies)} Replies` : null,
        doc.stats.views !== undefined ? `${formatCompactNumber(doc.stats.views)} Views` : null
      ].filter(Boolean);
      if (items.length > 0) {
        statsHtml = `<div class="stats-strip">${items.map((x) => `<span>${escapeHtml(x!)}</span>`).join("")}</div>`;
      }
    }

    headerHtml = `<header class="article-header">
      <div class="article-kicker">X Article</div>
      <h1 class="article-title">${escapeHtml(doc.title)}</h1>
      ${doc.subtitle ? `<p class="article-subtitle">${escapeHtml(doc.subtitle)}</p>` : ""}
      <div class="byline-row">
        <div class="author-block">
          ${avatarHtml}
          <div class="author-meta">
            <div class="author-name-line">
              <span>${escapeHtml(doc.author.name)}</span>
              ${renderVerifiedSvg(doc.author.verifiedType)}
            </div>
            <div class="author-sub-line">${metaParts.join(" &middot; ")}</div>
          </div>
        </div>
        <a class="source-pill" href="${escapeHtml(canonicalHref)}" target="_blank" rel="noopener noreferrer">Original on X ↗</a>
      </div>
      ${statsHtml}
    </header>`;
  }

  // Optional Table of Contents
  let tocHtml = "";
  if (options.includeToc) {
    const headings = doc.blocks.filter(
      (b): b is Extract<ArticleBlock, { type: "heading" }> => b.type === "heading"
    );
    if (headings.length >= 2) {
      const tocItems = headings
        .map((h) => {
          const text = h.runs.map((r) => r.text).join("").trim();
          return `<li class="toc-l${h.level}"><a href="#${escapeHtml(h.id)}">${escapeHtml(text)}</a></li>`;
        })
        .join("");
      tocHtml = `<nav class="toc-box" aria-label="Contents">
        <div class="toc-title">Contents</div>
        <ul class="toc-list">${tocItems}</ul>
      </nav>`;
    }
  }

  const bodyHtml = doc.blocks.map((block) => renderBlock(block, options)).join("\n");
  const exportedOn = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(doc.title)}</title>
  <style>${css}</style>
</head>
<body>
  <article class="article-shell">
    ${coverHtml}
    ${headerHtml}
    ${tocHtml}
    <main class="article-body">
      ${bodyHtml}
    </main>
    <footer class="article-colophon">
      <span>Source: <a href="${escapeHtml(canonicalHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(canonicalHref)}</a></span>
      <span>Exported ${escapeHtml(exportedOn)}</span>
    </footer>
  </article>
</body>
</html>`;
}
