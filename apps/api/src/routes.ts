/**
 * 共享 API 路由注册。
 *
 * app.ts（Node.js / SQLite）和 worker.ts（Cloudflare Workers / D1）
 * 都调用此函数注册完全相同的路由，区别仅在于传入的 getStore 实现不同。
 *
 * 这样新增 API 端点只需改一处，两端自动同步。
 */

import { Hono } from "hono";
import type { IStore } from "../../../packages/store/shared-types/src/index.ts";
import { calculateDamage } from "../../../packages/battle-core/src/index.ts";

// ── 辅助 ──

function numberQuery(c: any, key: string): number | undefined {
  const v = c.req.query(key);
  return v ? Number(v) : undefined;
}

// ── 路由注册 ──

export interface RegisterRoutesOptions<E extends object = object> {
  /** 每次请求获取 store 实例（worker 从 c.env.DB 创建，app 返回单例） */
  getStore: (c: any) => IStore;
}

/**
 * 将所有 API 路由注册到给定的 Hono 实例上。
 * 返回该实例以便链式调用。
 */
export function registerApiRoutes<E extends object = object>(
  api: Hono<any>,
  opts: RegisterRoutesOptions<E>,
): Hono<any> {
  const { getStore } = opts;

  // ── Pokemon ──

  api.get("/pokemon", async (c) => {
    const s = getStore(c);
    const query = c.req.query("q") || undefined;
    const typeRaw = c.req.query("type") || undefined;
    const type = typeRaw
      ? typeRaw.includes(",") ? typeRaw.split(",") : typeRaw
      : undefined;
    const generation = numberQuery(c, "generation");
    const championsSeasonId = numberQuery(c, "seasonId");
    const limit = numberQuery(c, "limit");
    const offset = numberQuery(c, "offset") ?? 0;

    if (limit !== undefined) {
      const result = await s.listPokemon({ query, type, generation, championsSeasonId, limit, offset });
      const { items, total } = result as { items: unknown[]; total: number };
      return c.json({ data: items, total, offset, limit, hasMore: offset + items.length < total });
    }
    const data = await s.listPokemon({ query, type, generation, championsSeasonId });
    return c.json({ data });
  });

  api.get("/pokemon/:id", async (c) => {
    const championsSeasonId = numberQuery(c, "seasonId");
    const entry = await getStore(c).getPokemon(c.req.param("id"), { championsSeasonId });
    return entry ? c.json({ data: entry }) : c.json({ error: "Pokemon not found" }, 404);
  });

  api.get("/pokemon/:id/learnset", async (c) => {
    const s = getStore(c);
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
    const s = getStore(c);
    const entry = await s.getPokemon(c.req.param("id"));
    if (!entry) return c.json({ error: "Pokemon not found" }, 404);
    const meta = await s.getLearnsetMeta(entry.id);
    return c.json({ data: meta, pokemonId: entry.id });
  });

  // ── Champions ──

  api.get("/champions/seasons", async (c) => {
    const data = await getStore(c).listChampionsSeasons();
    return c.json({ data });
  });

  // ── Items ──

  api.get("/items", async (c) => {
    const s = getStore(c);
    const query = c.req.query("q") || undefined;
    const category = c.req.query("category") || undefined;
    const limit = numberQuery(c, "limit");
    const offset = numberQuery(c, "offset") ?? 0;

    if (limit !== undefined) {
      const result = await s.listItems({ query, category, limit, offset });
      const { items, total } = result as { items: unknown[]; total: number };
      return c.json({ data: items, total, offset, limit, hasMore: offset + items.length < total });
    }
    const data = await s.listItems({ query, category });
    return c.json({ data });
  });

  api.get("/items/:id", async (c) => {
    const entry = await getStore(c).getItem(c.req.param("id"));
    return entry ? c.json({ data: entry }) : c.json({ error: "Item not found" }, 404);
  });

  // ── Moves ──

  api.get("/moves", async (c) => {
    const s = getStore(c);
    const query = c.req.query("q") || undefined;
    const type = c.req.query("type") || undefined;
    const category = c.req.query("category") || undefined;
    const generation = numberQuery(c, "generation");
    const limit = numberQuery(c, "limit");
    const offset = numberQuery(c, "offset") ?? 0;

    if (limit !== undefined) {
      const result = await s.listMoves({ query, type, category, generation, limit, offset });
      const { items, total } = result as { items: unknown[]; total: number };
      return c.json({ data: items, total, offset, limit, hasMore: offset + items.length < total });
    }
    const data = await s.listMoves({ query, type, category, generation });
    return c.json({ data });
  });

  api.get("/moves/:id", async (c) => {
    const entry = await getStore(c).getMove(c.req.param("id"));
    return entry ? c.json({ data: entry }) : c.json({ error: "Move not found" }, 404);
  });

  api.get("/moves/:id/pokemon", async (c) => {
    const id = Number(c.req.param("id"));
    if (isNaN(id)) return c.json({ data: [] });
    const limit = numberQuery(c, "limit");
    const offset = numberQuery(c, "offset") ?? 0;
    if (limit !== undefined) {
      const result = await getStore(c).getPokemonByMove(id, { limit, offset });
      const { items, total } = result as { items: unknown[]; total: number };
      return c.json({ data: items, total, offset, limit, hasMore: offset + items.length < total });
    }
    const data = await getStore(c).getPokemonByMove(id);
    return c.json({ data });
  });

  // ── Abilities ──

  api.get("/abilities", async (c) => {
    const s = getStore(c);
    const query = c.req.query("q") || undefined;
    const generation = numberQuery(c, "generation");
    const limit = numberQuery(c, "limit");
    const offset = numberQuery(c, "offset") ?? 0;

    if (limit !== undefined) {
      const result = await s.listAbilities({ query, generation, limit, offset });
      const { items, total } = result as { items: unknown[]; total: number };
      return c.json({ data: items, total, offset, limit, hasMore: offset + items.length < total });
    }
    const data = await s.listAbilities({ query, generation });
    return c.json({ data });
  });

  api.get("/abilities/:id", async (c) => {
    const entry = await getStore(c).getAbility(c.req.param("id"));
    return entry ? c.json({ data: entry }) : c.json({ error: "Ability not found" }, 404);
  });

  api.get("/abilities/:id/pokemon", async (c) => {
    const id = Number(c.req.param("id"));
    if (isNaN(id)) return c.json({ data: [] });
    const limit = numberQuery(c, "limit");
    const offset = numberQuery(c, "offset") ?? 0;
    if (limit !== undefined) {
      const result = await getStore(c).getPokemonByAbility(id, { limit, offset });
      const { items, total } = result as { items: unknown[]; total: number };
      return c.json({ data: items, total, offset, limit, hasMore: offset + items.length < total });
    }
    const data = await getStore(c).getPokemonByAbility(id);
    return c.json({ data });
  });

  // ── Battle damage（统一实现，两端共享） ──

  api.post("/battle/damage", async (c) => {
    try {
      const input = await c.req.json();
      const store = getStore(c);
      const result = await calculateDamage(input, store);
      return c.json({ data: result });
    } catch (err: any) {
      return c.json({ error: err?.message ?? "Calculation failed" }, 400);
    }
  });

  return api;
}
