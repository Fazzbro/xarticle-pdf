import type { ArticleBlock, ArticleDocument, EmbeddedPost, ListItem, TextRun } from "../core/types.js";

function runsToMarkdown(runs: TextRun[]): string {
  return runs
    .map((r) => {
      let s = r.text;
      if (r.code) s = `\`${s}\``;
      if (r.strikethrough) s = `~~${s}~~`;
      if (r.italic) s = `*${s}*`;
      if (r.bold) s = `**${s}**`;
      if (r.href) s = `[${s}](${r.href})`;
      return s;
    })
    .join("");
}

function listToMarkdown(ordered: boolean, items: ListItem[], indent = 0): string {
  const pad = "  ".repeat(indent);
  return items
    .map((item, idx) => {
      const marker = ordered ? `${idx + 1}. ` : "- ";
      const line = `${pad}${marker}${runsToMarkdown(item.runs)}`;
      const child = item.children
        ? "\n" + listToMarkdown(item.children.ordered, item.children.items, indent + 1)
        : "";
      return line + child;
    })
    .join("\n");
}

function embeddedPostToMarkdown(post: EmbeddedPost, prefix = "> "): string {
  const lines = [
    `${prefix}**${post.author.name}** (@${post.author.handle})`,
    `${prefix}`,
    ...post.text.split(/\r?\n/).map((l) => `${prefix}${l}`)
  ];
  for (const img of post.images) {
    lines.push(`${prefix}![${img.alt ?? "Post image"}](${img.url})`);
  }
  for (const v of post.videoLinks) {
    lines.push(`${prefix}[${v.isGif ? "Animated GIF" : "Embedded Video"}](${v.url})`);
  }
  if (post.quotedPost) {
    lines.push(`${prefix}`);
    lines.push(embeddedPostToMarkdown(post.quotedPost, `${prefix}> `));
  }
  lines.push(`${prefix}[View post on X](${post.url})`);
  return lines.join("\n");
}

export function buildArticleMarkdown(doc: ArticleDocument): string {
  const out: string[] = [];
  out.push(`# ${doc.title}`);
  out.push("");
  out.push(`By **${doc.author.name}** (@${doc.author.handle}) · [Original on X](${doc.canonicalUrl})`);
  out.push("");

  if (doc.coverMedia) {
    out.push(`![Cover](${doc.coverMedia.url})`);
    out.push("");
  }

  for (const block of doc.blocks) {
    out.push(blockToMarkdown(block));
    out.push("");
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function blockToMarkdown(block: ArticleBlock): string {
  switch (block.type) {
    case "paragraph":
      return runsToMarkdown(block.runs);
    case "heading":
      return `${"#".repeat(block.level)} ${runsToMarkdown(block.runs)}`;
    case "blockquote":
      return `> ${runsToMarkdown(block.runs)}`;
    case "list":
      return listToMarkdown(block.ordered, block.items);
    case "code":
      return `\`\`\`${block.language ?? ""}\n${block.code}\n\`\`\``;
    case "divider":
      return "---";
    case "image":
      return `![${block.image.alt ?? block.image.caption ?? "Image"}](${block.image.url})`;
    case "image_grid":
      return block.images
        .map((i) => `![${i.alt ?? block.caption ?? "Image"}](${i.url})`)
        .join("\n");
    case "video_link":
      return `> **[${block.video.isGif ? "Animated GIF" : "Embedded Video"}](${block.video.url})**${block.video.caption ? ` — ${block.video.caption}` : ""}`;
    case "embedded_post":
      return embeddedPostToMarkdown(block.post);
    case "link_card":
      return `> **[${block.card.title}](${block.card.url})** (${block.card.domain})`;
  }
}
