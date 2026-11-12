import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

interface FontDef {
  family: string;
  pkg: string;
  file: string;
  weight: number;
  style: "normal" | "italic";
}

const FONT_DEFS: FontDef[] = [
  { family: "Newsreader", pkg: "@fontsource/newsreader", file: "files/newsreader-latin-400-normal.woff2", weight: 400, style: "normal" },
  { family: "Newsreader", pkg: "@fontsource/newsreader", file: "files/newsreader-latin-400-italic.woff2", weight: 400, style: "italic" },
  { family: "Newsreader", pkg: "@fontsource/newsreader", file: "files/newsreader-latin-600-normal.woff2", weight: 600, style: "normal" },
  { family: "Newsreader", pkg: "@fontsource/newsreader", file: "files/newsreader-latin-700-normal.woff2", weight: 700, style: "normal" },
  { family: "Inter", pkg: "@fontsource/inter", file: "files/inter-latin-400-normal.woff2", weight: 400, style: "normal" },
  { family: "Inter", pkg: "@fontsource/inter", file: "files/inter-latin-500-normal.woff2", weight: 500, style: "normal" },
  { family: "Inter", pkg: "@fontsource/inter", file: "files/inter-latin-600-normal.woff2", weight: 600, style: "normal" },
  { family: "Inter", pkg: "@fontsource/inter", file: "files/inter-latin-700-normal.woff2", weight: 700, style: "normal" },
  { family: "JetBrains Mono", pkg: "@fontsource/jetbrains-mono", file: "files/jetbrains-mono-latin-400-normal.woff2", weight: 400, style: "normal" },
  { family: "JetBrains Mono", pkg: "@fontsource/jetbrains-mono", file: "files/jetbrains-mono-latin-500-normal.woff2", weight: 500, style: "normal" }
];

let cachedFontFaceCss: string | null = null;

export function getBundledFontFaceCss(): string {
  if (cachedFontFaceCss !== null) return cachedFontFaceCss;

  const rules: string[] = [];
  for (const def of FONT_DEFS) {
    try {
      const pkgJsonPath = require.resolve(`${def.pkg}/package.json`);
      const fontPath = path.join(path.dirname(pkgJsonPath), def.file);
      const b64 = readFileSync(fontPath).toString("base64");
      rules.push(`@font-face {
  font-family: '${def.family}';
  font-style: ${def.style};
  font-weight: ${def.weight};
  font-display: block;
  src: url('data:font/woff2;base64,${b64}') format('woff2');
}`);
    } catch {
      // Fall back gracefully to system fonts if a font file is unavailable
    }
  }

  cachedFontFaceCss = rules.join("\n");
  return cachedFontFaceCss;
}
