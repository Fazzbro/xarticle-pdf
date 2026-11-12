import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(__dirname, "src/client"),
  publicDir: path.resolve(__dirname, "src/client/public"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/client")
    }
  },
  build: {
    outDir: path.resolve(__dirname, "dist/web"),
    emptyOutDir: true
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3456"
    }
  }
});
