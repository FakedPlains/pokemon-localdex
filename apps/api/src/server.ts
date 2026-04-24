import { createServer } from "node:http";
import {
  listItems,
  listPokemonEntries,
  listPokemonSummaries,
  readTeams,
  saveTeam
} from "../../../packages/data-model/src/index.ts";
import { calculateDamage } from "../../../packages/battle-core/src/index.ts";

const port = Number(process.env.PORT ?? 3030);

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(data, null, 2));
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

  if (req.method === "GET" && url.pathname === "/pokemon") {
    sendJson(res, 200, { data: listPokemonSummaries() });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/pokemon/")) {
    const id = decodeURIComponent(url.pathname.replace("/pokemon/", ""));
    const entry = listPokemonEntries().find((item) => item.id === id || item.slug === id);
    if (!entry) {
      sendJson(res, 404, { error: "Pokemon not found" });
      return;
    }
    sendJson(res, 200, { data: entry });
    return;
  }

  if (req.method === "GET" && url.pathname === "/items") {
    sendJson(res, 200, { data: listItems() });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/items/")) {
    const id = decodeURIComponent(url.pathname.replace("/items/", ""));
    const entry = listItems().find((item) => item.id === id || item.slug === id);
    if (!entry) {
      sendJson(res, 404, { error: "Item not found" });
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

  sendJson(res, 404, { error: "Not Found" });
});

server.listen(port, () => {
  console.log(`Pokemon LocalDex API listening on http://localhost:${port}`);
});
