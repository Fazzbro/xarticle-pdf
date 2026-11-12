import inter400ItalicUrl from "@fontsource/inter/files/inter-latin-400-italic.woff?url";
import inter400Url from "@fontsource/inter/files/inter-latin-400-normal.woff?url";
import inter600Url from "@fontsource/inter/files/inter-latin-600-normal.woff?url";
import mono400Url from "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff?url";
import newsreader400ItalicUrl from "@fontsource/newsreader/files/newsreader-latin-400-italic.woff?url";
import newsreader400Url from "@fontsource/newsreader/files/newsreader-latin-400-normal.woff?url";
import newsreader600Url from "@fontsource/newsreader/files/newsreader-latin-600-normal.woff?url";

export interface ClientPdfFontBuffers {
  serifRegular: Uint8Array;
  serifItalic: Uint8Array;
  serifBold: Uint8Array;
  sansRegular: Uint8Array;
  sansItalic: Uint8Array;
  sansBold: Uint8Array;
  monoRegular: Uint8Array;
}

let cachedFontPromise: Promise<ClientPdfFontBuffers> | null = null;

async function fetchFontBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load font asset: ${url}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

export function loadBrowserPdfFonts(): Promise<ClientPdfFontBuffers> {
  if (!cachedFontPromise) {
    cachedFontPromise = (async () => {
      const [
        serifRegular,
        serifItalic,
        serifBold,
        sansRegular,
        sansItalic,
        sansBold,
        monoRegular
      ] = await Promise.all([
        fetchFontBytes(newsreader400Url),
        fetchFontBytes(newsreader400ItalicUrl),
        fetchFontBytes(newsreader600Url),
        fetchFontBytes(inter400Url),
        fetchFontBytes(inter400ItalicUrl),
        fetchFontBytes(inter600Url),
        fetchFontBytes(mono400Url)
      ]);
      return {
        serifRegular,
        serifItalic,
        serifBold,
        sansRegular,
        sansItalic,
        sansBold,
        monoRegular
      };
    })();
  }
  return cachedFontPromise;
}
