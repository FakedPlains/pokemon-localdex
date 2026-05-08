/**
 * Cloudflare Workers 入口（纯 Workers 版，不依赖 Node.js API）
 *
 * 运行时：workerd（Cloudflare Workers）
 * 绑定：
 *   - DB: D1Database（pokemon-localdex-d1）
 *   - ASSETS: Cloudflare Pages 静态资源（可选）
 *
 * 注意：此文件不导入任何依赖 node:sqlite / node:fs / node:path 的模块。
 * battle/damage 接口在 Workers 环境下使用简化版（不查询数据库做名称映射）。
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { createD1Store } from "../../../packages/d1-store/src/index.ts";
import type { D1Database } from "../../../packages/d1-store/src/index.ts";

// Cloudflare Workers Env 类型
export interface Env {
  DB: D1Database;
  ASSETS?: { fetch: (req: Request) => Promise<Response> };
  DATA_SOURCE?: string;
}

// ── Hono app（Workers 专用） ──

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type"],
}));

app.get("/health", (c) =>
  c.json({ ok: true, service: "pokemon-localdex-api", dataSource: "d1" })
);

// ── API 路由 ──

const api = new Hono<{ Bindings: Env }>();

// 每个请求通过 c.env.DB 获取 D1 绑定，创建 store 实例
function store(c: { env: Env }) {
  return createD1Store(c.env.DB);
}

function numberQuery(c: any, key: string): number | undefined {
  const v = c.req.query(key);
  return v ? Number(v) : undefined;
}

// ── Pokemon ──

api.get("/pokemon", async (c) => {
  const query = c.req.query("q") || undefined;
  const typeRaw = c.req.query("type") || undefined;
  const type = typeRaw
    ? typeRaw.includes(",") ? typeRaw.split(",") : typeRaw
    : undefined;
  const generation = numberQuery(c, "generation");
  const limit = numberQuery(c, "limit");
  const offset = numberQuery(c, "offset") ?? 0;

  if (limit !== undefined) {
    const result = await store(c).listPokemon({ query, type, generation, limit, offset });
    const { items, total } = result as { items: unknown[]; total: number };
    return c.json({ data: items, total, offset, limit, hasMore: offset + items.length < total });
  }
  const data = await store(c).listPokemon({ query, type, generation });
  return c.json({ data });
});

api.get("/pokemon/:id", async (c) => {
  const entry = await store(c).getPokemon(c.req.param("id"));
  return entry ? c.json({ data: entry }) : c.json({ error: "Pokemon not found" }, 404);
});

api.get("/pokemon/:id/learnset", async (c) => {
  const s = store(c);
  const entry = await s.getPokemon(c.req.param("id"));
  if (!entry) return c.json({ error: "Pokemon not found" }, 404);
  const generation = numberQuery(c, "generation") ?? 9;
  const formKey = c.req.query("form") || "default";
  const gameVersion = c.req.query("version");
  const result = await s.getPokemonLearnset(entry.id, generation, formKey, gameVersion);
  return c.json({
    data: result.moves,
    pokemonId: entry.id,
    generation,
    formKey: result.formKey,
    gameVersionCode: result.gameVersionCode,
  });
});

api.get("/pokemon/:id/learnset/meta", async (c) => {
  const s = store(c);
  const entry = await s.getPokemon(c.req.param("id"));
  if (!entry) return c.json({ error: "Pokemon not found" }, 404);
  const meta = await s.getLearnsetMeta(entry.id);
  return c.json({ data: meta, pokemonId: entry.id });
});

// ── Items ──

api.get("/items", async (c) => {
  const query = c.req.query("q") || undefined;
  const category = c.req.query("category") || undefined;
  const limit = numberQuery(c, "limit");
  const offset = numberQuery(c, "offset") ?? 0;

  if (limit !== undefined) {
    const result = await store(c).listItems({ query, category, limit, offset });
    const { items, total } = result as { items: unknown[]; total: number };
    return c.json({ data: items, total, offset, limit, hasMore: offset + items.length < total });
  }
  const data = await store(c).listItems({ query, category });
  return c.json({ data });
});

api.get("/items/:id", async (c) => {
  const entry = await store(c).getItem(c.req.param("id"));
  return entry ? c.json({ data: entry }) : c.json({ error: "Item not found" }, 404);
});

// ── Moves ──

api.get("/moves", async (c) => {
  const query = c.req.query("q") || undefined;
  const type = c.req.query("type") || undefined;
  const category = c.req.query("category") || undefined;
  const generation = numberQuery(c, "generation");
  const limit = numberQuery(c, "limit");
  const offset = numberQuery(c, "offset") ?? 0;

  if (limit !== undefined) {
    const result = await store(c).listMoves({ query, type, category, generation, limit, offset });
    const { items, total } = result as { items: unknown[]; total: number };
    return c.json({ data: items, total, offset, limit, hasMore: offset + items.length < total });
  }
  const data = await store(c).listMoves({ query, type, category, generation });
  return c.json({ data });
});

api.get("/moves/:id", async (c) => {
  const entry = await store(c).getMove(c.req.param("id"));
  return entry ? c.json({ data: entry }) : c.json({ error: "Move not found" }, 404);
});

// ── Abilities ──

api.get("/abilities", async (c) => {
  const query = c.req.query("q") || undefined;
  const generation = numberQuery(c, "generation");
  const limit = numberQuery(c, "limit");
  const offset = numberQuery(c, "offset") ?? 0;

  if (limit !== undefined) {
    const result = await store(c).listAbilities({ query, generation, limit, offset });
    const { items, total } = result as { items: unknown[]; total: number };
    return c.json({ data: items, total, offset, limit, hasMore: offset + items.length < total });
  }
  const data = await store(c).listAbilities({ query, generation });
  return c.json({ data });
});

api.get("/abilities/:id", async (c) => {
  const entry = await store(c).getAbility(c.req.param("id"));
  return entry ? c.json({ data: entry }) : c.json({ error: "Ability not found" }, 404);
});

// ── Teams（D1 持久化） ──

api.get("/teams", async (c) => {
  const teams = await store(c).listTeams();
  return c.json({ data: teams });
});

api.post("/teams", async (c) => {
  const saved = await store(c).saveTeam(await c.req.json());
  return c.json({ data: saved }, 201);
});

api.delete("/teams/:id", async (c) => {
  await store(c).deleteTeam(c.req.param("id"));
  return c.json({ ok: true });
});

// ── Battle damage（Workers 版：不查询数据库，直接透传英文名） ──
// 如需中文名映射，可在前端传入英文名，或后续扩展为 D1 查询版本

api.post("/battle/damage", async (c) => {
  // 动态导入 battle-core 的纯计算部分（不含 SQLite 查询）
  // 暂时返回 501，待 battle-core 拆分后启用
  return c.json({ error: "Battle damage calculation not yet available in Workers mode" }, 501);
});

// 挂载路由
app.route("/api", api);
app.route("/", api);

// ── Workers 导出 ──

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 静态资源：交给 Cloudflare Pages ASSETS 绑定处理
    if (env.ASSETS) {
      const isApiPath =
        url.pathname.startsWith("/api/") ||
        url.pathname === "/health";
      if (!isApiPath) {
        return env.ASSETS.fetch(request);
      }
    }

    return app.fetch(request, env, ctx);
  },
};
