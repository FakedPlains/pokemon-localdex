import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // GitHub Pages 部署在 /pokemon-localdex/ 路径下
  base: process.env.GITHUB_PAGES === "true" ? "/pokemon-localdex/" : "/",
  publicDir: "public",
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
  },
  server: {
    host: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3030",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
