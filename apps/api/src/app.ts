import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { calculateDamage } from "../../../packages/battle-core/src/index.ts";

// ── 数据源选择：通过 DATA_SOURCE 环境变量切换 ──
// DATA_SOURCE=supabase  → 使用 Supabase (PostgreSQL)
// DATA_SOURCE=d1        → 使用 Cloudflare D1（Workers 环境）
// DATA_SOURCE=sqlite    → 使用本地 SQLite（默认）

const DATA_SOURCE = (process.env.DATA_SOURCE || "sqlite").toLowerCase();
const useSupabase = DATA_SOURCE === "supabase";
const useD1 = DATA_SOURCE === "d1";

// ── 数据层接口（统一签名，兼容三种数据源） ──
let listPokemon: any;
let getPokemon: any;
let getLearnsetMetaFn: any;
let getPokemonLearnsetFn: any;
let listItems: any;
let getItem: any;
let listMoves: any;
let getMove: any;
let listAbilities: any;
let getAbility: any;

// Teams 存储（Node.js 模式使用文件，D1 模式由 worker.ts 注入）
let listTeamsFn: (() => any) | null = null;
let saveTeamFn: ((input: any) => any) | null = null;
let deleteTeamFn: ((id: string) => any) | null = null;

if (useSupabase) {
  const sb = await import("../../../packages/supabase-store/src/index.ts");
  listPokemon = sb.listPokemonFromSupabase;
  getPokemon = sb.getPokemonFromSupabase;
  getLearnsetMetaFn = sb.getLearnsetMeta;
  getPokemonLearnsetFn = sb.getPokemonLearnset;
  listItems = sb.listItemsFromSupabase;
  getItem = sb.getItemFromSupabase;
  listMoves = sb.listMovesFromSupabase;
  getMove = sb.getMoveFromSupabase;
  listAbilities = sb.listAbilitiesFromSupabase;
  getAbility = sb.getAbilityFromSupabase;
  console.log("[API] Data source: Supabase (PostgreSQL)");
} else if (!useD1) {
  // SQLite 模式（默认，Node.js 本地开发）
  const sq = await import("../../../packages/sqlite-store/src/index.ts");
  listPokemon = sq.listPokemonFromSqlite;
  getPokemon = sq.getPokemonFromSqlite;
  getLearnsetMetaFn = sq.getLearnsetMeta;
  getPokemonLearnsetFn = sq.getPokemonLearnset;
  listItems = sq.listItemsFromSqlite;
  getItem = sq.getItemFromSqlite;
  listMoves = sq.listMovesFromSqlite;
  getMove = sq.getMoveFromSqlite;
  listAbilities = sq.listAbilitiesFromSqlite;
  getAbility = sq.getAbilityFromSqlite;
  console.log("[API] Data source: SQLite (local)");
}
// D1 模式：函数由 worker.ts 通过 injectD1Store() 注入，此处留空

// 导入静态文件服务
import { staticResponse } from "./static.ts";

// ── Teams 文件存储（Node.js 模式） ──
const TEAMS_FILE = resolve(import.meta.dirname, "../../../data/teams.json");

type BattleTeam = {
  id: string; name: string; format: string;
  members: any[]; createdAt: string; updatedAt: string;
};

function readTeams(): BattleTeam[] {
  if (!existsSync(TEAMS_FILE)) return [];
  return JSON.parse(readFileSync(TEAMS_FILE, "utf8"));
}

function saveTeamToFile(input: Partial<BattleTeam>): BattleTeam {
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

// 默认使用文件存储（Node.js 模式）
if (!useD1) {
  listTeamsFn = () => readTeams();
  saveTeamFn = (input: any) => saveTeamToFile(input);
  deleteTeamFn = (id: string) => {
    const teams = readTeams().filter((t) => t.id !== id);
    mkdirSync(dirname(TEAMS_FILE), { recursive: true });
    writeFileSync(TEAMS_FILE, JSON.stringify(teams, null, 2));
  };
}

// ── D1 注入接口（供 worker.ts 调用） ──
export function injectD1Store(store: {
  listPokemon: any;
  getPokemon: any;
  getLearnsetMeta: any;
  getPokemonLearnset: any;
  listItems: any;
  getItem: any;
  listMoves: any;
  getMove: any;
  listAbilities: any;
  getAbility: any;
  listTeams: () => any;
  saveTeam: (input: any) => any;
  deleteTeam: (id: string) => any;
}) {
  listPokemon = store.listPokemon;
  getPokemon = store.getPokemon;
  getLearnsetMetaFn = store.getLearnsetMeta;
  getPokemonLearnsetFn = store.getPokemonLearnset;
  listItems = store.listItems;
  getItem = store.getItem;
  listMoves = store.listMoves;
  getMove = store.getMove;
  listAbilities = store.listAbilities;
  getAbility = store.getAbility;
  listTeamsFn = store.listTeams;
  saveTeamFn = store.saveTeam;
  deleteTeamFn = store.deleteTeam;
}

// ── Hono app ──

export const app = new Hono();

app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type"]
}));

app.get("/", (c) => staticResponse("/") ?? c.notFound());
app.get("/assets/*", (c) => staticResponse(c.req.path) ?? c.notFound());

app.get("/health", (c) => c.json({ ok: true, service: "pokemon-localdex-api", dataSource: DATA_SOURCE }));

// ── API 路由 ──

const apiRoutes = new Hono();

apiRoutes.get("/pokemon", async (c) => {
  const query = c.req.query("q") || undefined;
  const typeRaw = c.req.query("type") || undefined;
  const type = typeRaw ? (typeRaw.includes(",") ? typeRaw.split(",") : typeRaw) : undefined;
  const generation = numberQuery(c, "generation");
  const limit = numberQuery(c, "limit");
  const offset = numberQuery(c, "offset") ?? 0;

  if (limit !== undefined) {
    const result = await listPokemon({ query, type, generation, limit, offset });
    const { items, total } = result as { items: unknown[]; total: number };
    return c.json({ data: items, total, offset, limit, hasMore: offset + items.length < total });
  }
  const data = await listPokemon({ query, type, generation });
  return c.json({ data });
});

apiRoutes.get("/pokemon/:id", async (c) => {
  const id = c.req.param("id");
  const entry = await getPokemon(id);
  return entry ? c.json({ data: entry }) : c.json({ error: "Pokemon not found" }, 404);
});

apiRoutes.get("/pokemon/:id/learnset", async (c) => {
  const id = c.req.param("id");
  const generation = numberQuery(c, "generation") ?? 9;
  const formKey = c.req.query("form") || "default";
  const gameVersion = c.req.query("version");
  const entry = await getPokemon(id);
  if (!entry) return c.json({ error: "Pokemon not found" }, 404);
  const result = await getPokemonLearnsetFn(entry.id, generation, formKey, gameVersion);
  return c.json({ data: result.moves, pokemonId: entry.id, generation, formKey: result.formKey, gameVersionCode: result.gameVersionCode });
});

apiRoutes.get("/pokemon/:id/learnset/meta", async (c) => {
  const id = c.req.param("id");
  const entry = await getPokemon(id);
  if (!entry) return c.json({ error: "Pokemon not found" }, 404);
  const meta = await getLearnsetMetaFn(entry.id);
  return c.json({ data: meta, pokemonId: entry.id });
});

apiRoutes.get("/items", async (c) => {
  const query = c.req.query("q") || undefined;
  const category = c.req.query("category") || undefined;
  const limit = numberQuery(c, "limit");
  const offset = numberQuery(c, "offset") ?? 0;

  if (limit !== undefined) {
    const result = await listItems({ query, category, limit, offset });
    const { items, total } = result as { items: unknown[]; total: number };
    return c.json({ data: items, total, offset, limit, hasMore: offset + items.length < total });
  }
  const data = await listItems({ query, category });
  return c.json({ data });
});

apiRoutes.get("/items/:id", async (c) => {
  const id = c.req.param("id");
  const entry = await getItem(id);
  return entry ? c.json({ data: entry }) : c.json({ error: "Item not found" }, 404);
});

apiRoutes.get("/moves", async (c) => {
  const query = c.req.query("q") || undefined;
  const type = c.req.query("type") || undefined;
  const category = c.req.query("category") || undefined;
  const generation = numberQuery(c, "generation");
  const limit = numberQuery(c, "limit");
  const offset = numberQuery(c, "offset") ?? 0;

  if (limit !== undefined) {
    const result = await listMoves({ query, type, category, generation, limit, offset });
    const { items, total } = result as { items: unknown[]; total: number };
    return c.json({ data: items, total, offset, limit, hasMore: offset + items.length < total });
  }
  const data = await listMoves({ query, type, category, generation });
  return c.json({ data });
});

apiRoutes.get("/moves/:id", async (c) => {
  const id = c.req.param("id");
  const entry = await getMove(id);
  return entry ? c.json({ data: entry }) : c.json({ error: "Move not found" }, 404);
});

apiRoutes.get("/abilities", async (c) => {
  const query = c.req.query("q") || undefined;
  const generation = numberQuery(c, "generation");
  const limit = numberQuery(c, "limit");
  const offset = numberQuery(c, "offset") ?? 0;

  if (limit !== undefined) {
    const result = await listAbilities({ query, generation, limit, offset });
    const { items, total } = result as { items: unknown[]; total: number };
    return c.json({ data: items, total, offset, limit, hasMore: offset + items.length < total });
  }
  const data = await listAbilities({ query, generation });
  return c.json({ data });
});

apiRoutes.get("/abilities/:id", async (c) => {
  const id = c.req.param("id");
  const entry = await getAbility(id);
  return entry ? c.json({ data: entry }) : c.json({ error: "Ability not found" }, 404);
});

apiRoutes.get("/teams", async (c) => {
  const teams = await listTeamsFn?.() ?? [];
  return c.json({ data: teams });
});

apiRoutes.post("/teams", async (c) => {
  if (!saveTeamFn) return c.json({ error: "Teams storage not available" }, 503);
  const saved = await saveTeamFn(await c.req.json());
  return c.json({ data: saved }, 201);
});

apiRoutes.delete("/teams/:id", async (c) => {
  if (!deleteTeamFn) return c.json({ error: "Teams storage not available" }, 503);
  await deleteTeamFn(c.req.param("id"));
  return c.json({ ok: true });
});

apiRoutes.post("/battle/damage", async (c) => {
  const result = calculateDamage(await c.req.json());
  return c.json({ data: result });
});

// 挂载到根路径（Vite dev proxy 模式）和 /api 前缀（生产模式）
app.route("/", apiRoutes);
app.route("/api", apiRoutes);

app.get("*", (c) => staticResponse("/index.html") ?? c.text("Not Found", 404));

function numberQuery(c: any, key: string) {
  const value = c.req.query(key);
  return value ? Number(value) : undefined;
}
