import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { calculateDamage } from "../../../packages/battle-core/src/index.ts";
import { createNameResolver, createSqliteStore } from "../../../packages/store/sqlite-store/src/index.ts";
import { registerApiRoutes } from "./routes.ts";

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

// ── 创建 IStore 实例（SQLite + 文件 Teams） ──

const sqliteStore = createSqliteStore({
  listTeams: readTeams,
  saveTeam: saveTeamToFile,
  deleteTeam: (id: string) => {
    const teams = readTeams().filter((t) => t.id !== id);
    mkdirSync(dirname(TEAMS_FILE), { recursive: true });
    writeFileSync(TEAMS_FILE, JSON.stringify(teams, null, 2));
  },
});

console.log("[API] Data source: SQLite (local)");

// ── Hono app ──

export const app = new Hono();

app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type"]
}));

app.get("/", (c) => staticResponse("/") ?? c.notFound());
app.get("/assets/*", (c) => staticResponse(c.req.path) ?? c.notFound());

app.get("/health", (c) => c.json({ ok: true, service: "pokemon-localdex-api", dataSource: "sqlite" }));

// ── API 路由（共享） ──

const apiRoutes = new Hono();

registerApiRoutes(apiRoutes, {
  getStore: () => sqliteStore,
  damageHandler: async (c) => {
    const result = calculateDamage(createNameResolver(), await c.req.json());
    return c.json({ data: result });
  },
});

// 挂载到根路径（Vite dev proxy 模式）和 /api 前缀（生产模式）
app.route("/", apiRoutes);
app.route("/api", apiRoutes);

app.get("*", (c) => staticResponse("/index.html") ?? c.text("Not Found", 404));
