export type ParsedXUrlKind = "status" | "article" | "i_article";

export interface ParsedXUrl {
  raw: string;
  normalizedUrl: string;
  kind: ParsedXUrlKind;
  handle: string;
  id: string;
}

const ALLOWED_HOSTS = new Set([
  "x.com",
  "www.x.com",
  "mobile.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
  "fxtwitter.com",
  "www.fxtwitter.com",
  "fixupx.com",
  "www.fixupx.com",
  "vxtwitter.com",
  "www.vxtwitter.com",
  "fixvx.com",
  "www.fixvx.com"
]);

/**
 * Parses a single X/Twitter status or article URL into a normalized descriptor.
 */
export function parseXUrl(input: string): ParsedXUrl | null {
  const trimmed = input.trim().replace(/^[<("'`]+|[>)"'`,.;!?]+$/g, "");
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);

  // Format: /i/article/<id> or /i/articles/<id>
  if (
    segments.length >= 3 &&
    segments[0].toLowerCase() === "i" &&
    (segments[1].toLowerCase() === "article" || segments[1].toLowerCase() === "articles") &&
    /^\d{1,25}$/.test(segments[2])
  ) {
    const id = segments[2];
    return {
      raw: input.trim(),
      normalizedUrl: `https://x.com/i/article/${id}`,
      kind: "i_article",
      handle: "i",
      id
    };
  }

  // Format: /i/status/<id> or /<handle>/status/<id> or /<handle>/statuses/<id>
  if (
    segments.length >= 3 &&
    (segments[1].toLowerCase() === "status" || segments[1].toLowerCase() === "statuses") &&
    /^\d{1,25}$/.test(segments[2])
  ) {
    const handle = segments[0].replace(/^@/, "");
    const id = segments[2];
    return {
      raw: input.trim(),
      normalizedUrl: `https://x.com/${handle}/status/${id}`,
      kind: "status",
      handle,
      id
    };
  }

  // Format: /<handle>/article/<id>
  if (
    segments.length >= 3 &&
    (segments[1].toLowerCase() === "article" || segments[1].toLowerCase() === "articles") &&
    /^\d{1,25}$/.test(segments[2])
  ) {
    const handle = segments[0].replace(/^@/, "");
    const id = segments[2];
    return {
      raw: input.trim(),
      normalizedUrl: `https://x.com/${handle}/article/${id}`,
      kind: "article",
      handle,
      id
    };
  }

  return null;
}

/**
 * Extracts and deduplicates all valid X/Twitter article or status URLs from arbitrary pasted text.
 */
export function extractXUrlsFromText(text: string): {
  urls: ParsedXUrl[];
  invalidLines: string[];
} {
  const seenIds = new Set<string>();
  const urls: ParsedXUrl[] = [];
  const invalidLines: string[] = [];

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    // Support pasting multiple space-separated or prose-embedded URLs on one line
    const urlTokens = line.match(/https?:\/\/[^\s]+/gi);
    if (urlTokens && urlTokens.length > 0) {
      let matchedAny = false;
      for (const token of urlTokens) {
        const parsed = parseXUrl(token);
        if (parsed) {
          matchedAny = true;
          const dedupeKey = `${parsed.kind === "i_article" ? "article" : "item"}:${parsed.id}`;
          if (!seenIds.has(dedupeKey)) {
            seenIds.add(dedupeKey);
            urls.push(parsed);
          }
        }
      }
      if (!matchedAny) {
        invalidLines.push(line);
      }
    } else {
      const parsed = parseXUrl(line);
      if (parsed) {
        const dedupeKey = `${parsed.kind === "i_article" ? "article" : "item"}:${parsed.id}`;
        if (!seenIds.has(dedupeKey)) {
          seenIds.add(dedupeKey);
          urls.push(parsed);
        }
      } else {
        invalidLines.push(line);
      }
    }
  }

  return { urls, invalidLines };
}

/**
 * Extract a tweet ID from an arbitrary URL if it points to an X status.
 */
export function extractStatusIdFromUrl(url: string): string | null {
  const parsed = parseXUrl(url);
  if (parsed && parsed.kind === "status") {
    return parsed.id;
  }
  return null;
}
