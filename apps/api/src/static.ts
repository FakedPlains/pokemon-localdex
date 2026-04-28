import { existsSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../../../");
const STATIC_ROOTS = [
  resolve(ROOT, "dist"),
  resolve(ROOT, "apps/web/public")
];
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon"
};

export function staticResponse(pathname) {
  let requestedPath;
  try {
    requestedPath = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  } catch {
    return undefined;
  }

  const safePath = requestedPath.replace(/\.\./g, "");
  for (const root of STATIC_ROOTS) {
    const filePath = resolve(root, `.${safePath}`);
    if (!filePath.startsWith(root) || !existsSync(filePath)) {
      continue;
    }

    const extension = extname(filePath);
    const contentType = CONTENT_TYPES[extension] ?? "application/octet-stream";
    return new Response(readFileSync(filePath), {
      headers: { "Content-Type": contentType }
    });
  }

  return undefined;
}
