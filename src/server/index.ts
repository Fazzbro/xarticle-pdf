import { closePdfBrowser } from "../renderer/pdf-generator.js";
import { createApp } from "./server.js";

const PORT = Number(process.env.PORT ?? 3456);
const HOST = process.env.HOST ?? "127.0.0.1";

const app = createApp();
const server = app.listen(PORT, HOST, () => {
  console.log(`XArticle PDF server running at http://${HOST}:${PORT}`);
});

async function shutdown() {
  server.close();
  await closePdfBrowser();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
