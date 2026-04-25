import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import {
  listAbilities,
  listItems,
  listMoves,
  listPokemonEntries,
  listPokemonSummaries,
  readTeams,
  searchAbilities,
  searchMoves,
  searchPokemonEntries,
  saveTeam
} from "../../../packages/data-model/src/index.ts";
import { calculateDamage } from "../../../packages/battle-core/src/index.ts";
import {
  getItemFromSqlite,
  getPokemonFromSqlite,
  hasSqliteData,
  listItemsFromSqlite,
  listPokemonFromSqlite
} from "../../../packages/sqlite-store/src/index.ts";

const port = Number(process.env.PORT ?? 3030);
const host = process.env.HOST ?? "127.0.0.1";
const WEB_ROOT = resolve(import.meta.dirname, "../../web/public");
const contentTypes = {
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

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(data, null, 2));
}

function sendText(res, statusCode, text, contentType) {
  res.writeHead(statusCode, {
    "Content-Type": contentType
  });
  res.end(text);
}

function serveStaticFile(pathname, res) {
  let requestedPath;
  try {
    requestedPath = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  } catch {
    return false;
  }
  const safePath = requestedPath.replace(/\.\./g, "");
  const filePath = resolve(WEB_ROOT, `.${safePath}`);

  if (!filePath.startsWith(WEB_ROOT) || !existsSync(filePath)) {
    return false;
  }

  const extension = extname(filePath);
  const contentType = contentTypes[extension] ?? "application/octet-stream";
  const body = readFileSync(filePath);
  res.writeHead(200, { "Content-Type": contentType });
  res.end(body);
  return true;
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { ok: true, service: "pokemon-localdex-api" });
    return;
  }

  if (req.method === "GET" && (url.pathname === "/" || url.pathname.startsWith("/assets/"))) {
    if (serveStaticFile(url.pathname, res)) {
      return;
    }
  }

  if (req.method === "GET" && url.pathname === "/pokemon") {
    const query = url.searchParams.get("q") ?? undefined;
    const type = url.searchParams.get("type") ?? undefined;
    const generationValue = url.searchParams.get("generation");
    const generation = generationValue ? Number(generationValue) : undefined;
    const useSqlite = hasSqliteData();
    const data = useSqlite
      ? listPokemonFromSqlite({ query, type, generation })
      : query || type || generation
        ? searchPokemonEntries({ query, type, generation })
        : listPokemonSummaries();

    sendJson(res, 200, { data });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/pokemon/")) {
    const id = decodeURIComponent(url.pathname.replace("/pokemon/", ""));
    const entry = hasSqliteData()
      ? getPokemonFromSqlite(id)
      : listPokemonEntries().find((item) => item.id === id || item.slug === id);
    if (!entry) {
      sendJson(res, 404, { error: "Pokemon not found" });
      return;
    }
    sendJson(res, 200, { data: entry });
    return;
  }

  if (req.method === "GET" && url.pathname === "/items") {
    sendJson(res, 200, { data: hasSqliteData() ? listItemsFromSqlite() : listItems() });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/items/")) {
    const id = decodeURIComponent(url.pathname.replace("/items/", ""));
    const entry = hasSqliteData()
      ? getItemFromSqlite(id)
      : listItems().find((item) => item.id === id || item.slug === id);
    if (!entry) {
      sendJson(res, 404, { error: "Item not found" });
      return;
    }
    sendJson(res, 200, { data: entry });
    return;
  }

  if (req.method === "GET" && url.pathname === "/moves") {
    const query = url.searchParams.get("q") ?? undefined;
    const type = url.searchParams.get("type") ?? undefined;
    const generationValue = url.searchParams.get("generation");
    const generation = generationValue ? Number(generationValue) : undefined;
    const data = query || type || generation
      ? searchMoves({ query, type, generation })
      : listMoves();
    sendJson(res, 200, { data });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/moves/")) {
    const id = decodeURIComponent(url.pathname.replace("/moves/", ""));
    const entry = listMoves().find((item) => item.id === id || item.slug === id);
    if (!entry) {
      sendJson(res, 404, { error: "Move not found" });
      return;
    }
    sendJson(res, 200, { data: entry });
    return;
  }

  if (req.method === "GET" && url.pathname === "/abilities") {
    const query = url.searchParams.get("q") ?? undefined;
    const generationValue = url.searchParams.get("generation");
    const generation = generationValue ? Number(generationValue) : undefined;
    const data = query || generation
      ? searchAbilities({ query, generation })
      : listAbilities();
    sendJson(res, 200, { data });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/abilities/")) {
    const id = decodeURIComponent(url.pathname.replace("/abilities/", ""));
    const entry = listAbilities().find((item) => item.id === id || item.slug === id);
    if (!entry) {
      sendJson(res, 404, { error: "Ability not found" });
      return;
    }
    sendJson(res, 200, { data: entry });
    return;
  }

  if (req.method === "GET" && url.pathname === "/teams") {
    sendJson(res, 200, { data: readTeams() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/teams") {
    const rawBody = await collectBody(req);
    const payload = JSON.parse(String(rawBody || "{}"));
    const saved = saveTeam(payload);
    sendJson(res, 201, { data: saved });
    return;
  }

  if (req.method === "POST" && url.pathname === "/battle/damage") {
    const rawBody = await collectBody(req);
    const payload = JSON.parse(String(rawBody || "{}"));
    const result = calculateDamage(payload);
    sendJson(res, 200, { data: result });
    return;
  }

  if (req.method === "GET" && serveStaticFile("/index.html", res)) {
    return;
  }

  sendText(res, 404, "Not Found", "text/plain; charset=utf-8");
});

server.listen(port, host, () => {
  const displayHost = host === "0.0.0.0" ? "localhost" : host;
  console.log(`Pokemon LocalDex API listening on http://${displayHost}:${port}`);
});
