import { z } from "zod";
import type { ArticleDocument } from "../../src/core/types.js";
import { extractArticleCloud } from "../../src/extractor/cloud.js";
import { extractXUrlsFromText } from "../../src/extractor/url.js";

const RequestSchema = z.object({
  input: z.string().min(1, "Please paste at least one X link."),
  allowBrowserFallback: z.boolean().optional()
});

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }

  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const parsedBody = RequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return Response.json(
      { error: parsedBody.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  const { urls, invalidLines } = extractXUrlsFromText(parsedBody.data.input);
  if (urls.length === 0) {
    return Response.json(
      {
        error: "No valid X/Twitter article or post links found.",
        invalidLines
      },
      { status: 400 }
    );
  }

  const articles: ArticleDocument[] = [];
  const errors: Array<{ url: string; message: string }> = [];

  const queue = [...urls];
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      try {
        // Keep image URLs instead of base64 blobs so serverless payload stays well under 6 MB
        const doc = await extractArticleCloud(item.normalizedUrl, { inlineMedia: false });
        articles.push(doc);
      } catch (err) {
        errors.push({
          url: item.normalizedUrl,
          message: err instanceof Error ? err.message : String(err)
        });
      }
    }
  });
  await Promise.all(workers);

  const orderMap = new Map(urls.map((u, idx) => [u.id, idx]));
  articles.sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999));

  return Response.json(
    {
      articles,
      errors,
      invalidLines,
      serverless: true
    },
    { status: 200 }
  );
}
