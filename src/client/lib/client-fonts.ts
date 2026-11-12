import inter400Url from "@fontsource/inter/files/inter-latin-400-normal.woff2?url";
import inter500Url from "@fontsource/inter/files/inter-latin-500-normal.woff2?url";
import inter600Url from "@fontsource/inter/files/inter-latin-600-normal.woff2?url";
import inter700Url from "@fontsource/inter/files/inter-latin-700-normal.woff2?url";
import mono400Url from "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2?url";
import mono500Url from "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2?url";
import newsreader400ItalicUrl from "@fontsource/newsreader/files/newsreader-latin-400-italic.woff2?url";
import newsreader400Url from "@fontsource/newsreader/files/newsreader-latin-400-normal.woff2?url";
import newsreader600Url from "@fontsource/newsreader/files/newsreader-latin-600-normal.woff2?url";
import newsreader700Url from "@fontsource/newsreader/files/newsreader-latin-700-normal.woff2?url";

function absUrl(url: string): string {
  if (typeof window === "undefined") return url;
  try {
    return new URL(url, window.location.origin).toString();
  } catch {
    return url;
  }
}

export function getClientPreviewFontCss(): string {
  const defs = [
    { family: "Newsreader", weight: 400, style: "normal", url: absUrl(newsreader400Url) },
    { family: "Newsreader", weight: 400, style: "italic", url: absUrl(newsreader400ItalicUrl) },
    { family: "Newsreader", weight: 600, style: "normal", url: absUrl(newsreader600Url) },
    { family: "Newsreader", weight: 700, style: "normal", url: absUrl(newsreader700Url) },
    { family: "Inter", weight: 400, style: "normal", url: absUrl(inter400Url) },
    { family: "Inter", weight: 500, style: "normal", url: absUrl(inter500Url) },
    { family: "Inter", weight: 600, style: "normal", url: absUrl(inter600Url) },
    { family: "Inter", weight: 700, style: "normal", url: absUrl(inter700Url) },
    { family: "JetBrains Mono", weight: 400, style: "normal", url: absUrl(mono400Url) },
    { family: "JetBrains Mono", weight: 500, style: "normal", url: absUrl(mono500Url) }
  ];

  return defs
    .map(
      (d) => `@font-face {
  font-family: '${d.family}';
  font-style: ${d.style};
  font-weight: ${d.weight};
  font-display: swap;
  src: url('${d.url}') format('woff2');
}`
    )
    .join("\n");
}
