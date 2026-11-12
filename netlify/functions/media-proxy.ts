import { fetchProxiedMedia } from "../../src/extractor/media-proxy.js";

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const reqUrl = new URL(req.url);
  const rawUrl = reqUrl.searchParams.get("url") ?? "";
  const result = await fetchProxiedMedia(rawUrl);

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return new Response(Buffer.from(result.bytes), {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
