import { defineConfig } from "vite";

export default defineConfig({
  root: "public",
  publicDir: false,
  build: {
    outDir: "../../../dist",
    emptyOutDir: true
  },
  server: {
    proxy: {
      "/health": "http://127.0.0.1:3030",
      "/pokemon": "http://127.0.0.1:3030",
      "/items": "http://127.0.0.1:3030",
      "/moves": "http://127.0.0.1:3030",
      "/abilities": "http://127.0.0.1:3030",
      "/teams": "http://127.0.0.1:3030",
      "/battle": "http://127.0.0.1:3030"
    }
  }
});
