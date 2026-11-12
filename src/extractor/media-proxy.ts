const ALLOWED_IMAGE_HOST_SUFFIXES = [".twimg.com"];
const ALLOWED_IMAGE_EXACT_HOSTS = new Set(["pbs.twimg.com", "abs.twimg.com", "ton.twimg.com", "video.twimg.com"]);
const MAX_PROXY_BYTES = 8 * 1024 * 1024;
const PROXY_TIMEOUT_MS = 10000;

export function isAllowedMediaUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return null;
    const host = parsed.hostname.toLowerCase();
    if (ALLOWED_IMAGE_EXACT_HOSTS.has(host)) return parsed;
    if (ALLOWED_IMAGE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export interface ProxiedImageResult {
  ok: true;
  contentType: string;
  bytes: Uint8Array;
}

export interface ProxiedImageError {
  ok: false;
  status: number;
  error: string;
}

function sniffImageMime(url: string, headerType: string | null, bytes: Uint8Array): string | null {
  if (headerType && headerType.toLowerCase().startsWith("image/")) {
    return headerType.split(";")[0].trim();
  }
  if (bytes.length >= 4) {
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
    if (
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return "image/webp";
    }
  }
  if (/\.png(\?|$)/i.test(url)) return "image/png";
  if (/\.webp(\?|$)/i.test(url)) return "image/webp";
  if (/\.gif(\?|$)/i.test(url)) return "image/gif";
  if (/\.jpe?g(\?|$)/i.test(url)) return "image/jpeg";
  return null;
}

async function fetchUpstreamImage(targetUrl: string): Promise<ProxiedImageResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
  try {
    const res = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8"
      }
    });
    if (!res.ok) return null;

    const declaredLen = Number(res.headers.get("content-length") || "0");
    if (declaredLen > MAX_PROXY_BYTES) return null;

    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_PROXY_BYTES) return null;

    const contentType = sniffImageMime(targetUrl, res.headers.get("content-type"), buf);
    if (!contentType) return null;

    return { ok: true, contentType, bytes: buf };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchProxiedMedia(rawUrl: string): Promise<ProxiedImageResult | ProxiedImageError> {
  const parsed = isAllowedMediaUrl(rawUrl);
  if (!parsed) {
    return {
      ok: false,
      status: 400,
      error: "Invalid or disallowed media URL host."
    };
  }

  let result = await fetchUpstreamImage(parsed.toString());
  if (!result && parsed.hostname.endsWith("twimg.com") && parsed.search.includes("name=")) {
    const fallbackUrl = parsed.toString().replace(/name=[^&]+/, "name=medium");
    result = await fetchUpstreamImage(fallbackUrl);
  }

  if (!result) {
    return {
      ok: false,
      status: 502,
      error: "Failed to fetch upstream image."
    };
  }

  return result;
}
