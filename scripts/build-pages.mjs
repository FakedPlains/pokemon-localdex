import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const DIST_DIR = resolve(ROOT, "dist");
const WEB_PUBLIC_DIR = resolve(ROOT, "apps/web/public");
const NORMALIZED_DATA_DIR = resolve(ROOT, "data/normalized");

rmSync(DIST_DIR, { recursive: true, force: true });
mkdirSync(DIST_DIR, { recursive: true });

cpSync(WEB_PUBLIC_DIR, DIST_DIR, { recursive: true });
mkdirSync(resolve(DIST_DIR, "data/normalized"), { recursive: true });
cpSync(NORMALIZED_DATA_DIR, resolve(DIST_DIR, "data/normalized"), { recursive: true });

writeFileSync(resolve(DIST_DIR, ".nojekyll"), "");

console.log(`Built GitHub Pages static site at ${DIST_DIR}`);
