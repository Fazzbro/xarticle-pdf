import type { ArticleDocument } from "../core/types.js";

export function buildPdfFilename(doc: ArticleDocument): string {
  const handle = doc.author.handle.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "x";
  const slug =
    doc.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || doc.id;
  return `${handle}-${slug}.pdf`;
}
