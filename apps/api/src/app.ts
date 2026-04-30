import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { calculateDamage } from "../../../packages/battle-core/src/index.ts";
import {
  getAbilityFromSqlite,
  getItemFromSqlite,
  getMoveFromSqlite,
  getPokemonFromSqlite,
  getPokemonLearnset,
  listAbilitiesFromSqlite,
  listItemsFromSqlite,
  listMovesFromSqlite,
  listPokemonFromSqlite,
  type BattleTeam
} from "../../../packages/sqlite-store/src/index.ts";
import { staticResponse } from "./static.ts";

const TEAMS_FILE = resolve(import.meta.dirname, "../../../data/teams.json");

function readTeams(): BattleTeam[] {
  if (!existsSync(TEAMS_FILE)) return [];
  return JSON.parse(readFileSync(TEAMS_FILE, "utf8"));
}

function saveTeam(input: Partial<BattleTeam>): BattleTeam {
  const teams = readTeams();
  const now = new Date().toISOString();
  const team: BattleTeam = {
    id: input.id ?? `team_${Date.now()}`,
    name: input.name ?? "未命名队伍",
    format: input.format ?? "singles",
    members: input.members ?? [],
    createdAt: input.createdAt ?? now,
    updatedAt: now
  };
  const index = teams.findIndex((item) => item.id === team.id);
  if (index >= 0) {
    teams[index] = { ...teams[index], ...team, updatedAt: now };
  } else {
    teams.push(team);
  }
  mkdirSync(dirname(TEAMS_FILE), { recursive: true });
  writeFileSync(TEAMS_FILE, JSON.stringify(teams, null, 2));
  return team;
}

export const app = new Hono();

app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type"]
}));

app.get("/", (c) => staticResponse("/") ?? c.notFound());
app.get("/assets/*", (c) => staticResponse(c.req.path) ?? c.notFound());

app.get("/health", (c) => c.json({ ok: true, service: "pokemon-localdex-api" }));

// ── API 路由（同时支持 /xxx 和 /api/xxx 两种路径）──
// Vite 开发模式下前端通过 proxy 把 /api/xxx 转发为 /xxx；
// 生产模式下由本服务器直接提供静态文件，前端请求 /api/xxx 需要直接匹配。

const apiRoutes = new Hono();

apiRoutes.get("/pokemon", (c) => {
  const query = c.req.query("q") || undefined;
  const type = c.req.query("type") || undefined;
  const generation = numberQuery(c, "generation");
  const data = listPokemonFromSqlite({ query, type, generation });
  return c.json({ data });
});

apiRoutes.get("/pokemon/:id", (c) => {
  const id = c.req.param("id");
  const entry = getPokemonFromSqlite(id);
  return entry ? c.json({ data: entry }) : c.json({ error: "Pokemon not found" }, 404);
});

apiRoutes.get("/pokemon/:id/learnset", (c) => {
  const id = c.req.param("id");
  const generation = numberQuery(c, "generation") ?? 9;
  const formKey = c.req.query("form") || "default";
  // 先确认 pokemon 存在
  const entry = getPokemonFromSqlite(id);
  if (!entry) return c.json({ error: "Pokemon not found" }, 404);
  const data = getPokemonLearnset(entry.id, generation, formKey);
  return c.json({ data, pokemonId: entry.id, generation, formKey });
});

apiRoutes.get("/items", (c) => c.json({ data: listItemsFromSqlite() }));

apiRoutes.get("/items/:id", (c) => {
  const id = c.req.param("id");
  const entry = getItemFromSqlite(id);
  return entry ? c.json({ data: entry }) : c.json({ error: "Item not found" }, 404);
});

apiRoutes.get("/moves", (c) => {
  const query = c.req.query("q") || undefined;
  const type = c.req.query("type") || undefined;
  const generation = numberQuery(c, "generation");
  const data = listMovesFromSqlite({ query, type, generation });
  return c.json({ data });
});

apiRoutes.get("/moves/:id", (c) => {
  const id = c.req.param("id");
  const entry = getMoveFromSqlite(id);
  return entry ? c.json({ data: entry }) : c.json({ error: "Move not found" }, 404);
});

apiRoutes.get("/abilities", (c) => {
  const query = c.req.query("q") || undefined;
  const generation = numberQuery(c, "generation");
  const data = listAbilitiesFromSqlite({ query, generation });
  return c.json({ data });
});

apiRoutes.get("/abilities/:id", (c) => {
  const id = c.req.param("id");
  const entry = getAbilityFromSqlite(id);
  return entry ? c.json({ data: entry }) : c.json({ error: "Ability not found" }, 404);
});

apiRoutes.get("/teams", (c) => c.json({ data: readTeams() }));

apiRoutes.post("/teams", async (c) => {
  const saved = saveTeam(await c.req.json());
  return c.json({ data: saved }, 201);
});

apiRoutes.post("/battle/damage", async (c) => {
  const result = calculateDamage(await c.req.json());
  return c.json({ data: result });
});

// 挂载到根路径（Vite dev proxy 模式）和 /api 前缀（生产模式）
app.route("/", apiRoutes);
app.route("/api", apiRoutes);

app.get("*", (c) => staticResponse("/index.html") ?? c.text("Not Found", 404));

function numberQuery(c, key) {
  const value = c.req.query(key);
  return value ? Number(value) : undefined;
}
