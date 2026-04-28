import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const DIST_DIR = resolve(ROOT, "dist");
const NORMALIZED_DATA_DIR = resolve(ROOT, "data/normalized");

if (!existsSync(resolve(DIST_DIR, "index.html"))) {
  throw new Error("dist/index.html not found. Run `npm run build:web` before post-processing pages data.");
}

mkdirSync(resolve(DIST_DIR, "data/normalized"), { recursive: true });
cpSync(NORMALIZED_DATA_DIR, resolve(DIST_DIR, "data/normalized"), { recursive: true });

function toPagesAssetUrl(url) {
  if (!url) return url;
  if (/^https?:\/\//.test(url)) return url;
  if (url.startsWith("/")) return url.slice(1);
  return url;
}

function normalizePagesAssets(value) {
  if (Array.isArray(value)) {
    return value.map(normalizePagesAssets);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const next = Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, normalizePagesAssets(entry)])
  );

  if (typeof value.url === "string") {
    next.url = toPagesAssetUrl(value.url);
  }

  return next;
}

const distDataDir = resolve(DIST_DIR, "data/normalized");
for (const fileName of readdirSync(distDataDir)) {
  if (!fileName.endsWith(".json")) continue;
  const filePath = resolve(distDataDir, fileName);
  const data = JSON.parse(readFileSync(filePath, "utf8"));
  writeFileSync(filePath, JSON.stringify(normalizePagesAssets(data), null, 2));
}

writeFileSync(resolve(DIST_DIR, ".nojekyll"), "");

console.log(`Built GitHub Pages static site at ${DIST_DIR}`);
