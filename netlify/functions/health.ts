export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  return Response.json(
    {
      ok: true,
      mode: "netlify",
      browserReady: false,
      clientPdfReady: true,
      browserFallbackAvailable: false,
      browserExecutable: null
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
