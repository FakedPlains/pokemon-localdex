import type { Hono } from "hono";
import type { RegisterRoutesOptions } from "../route-utils.ts";
import { numberQuery, paginatedJson } from "../route-utils.ts";

export function registerItemRoutes(api: Hono<any>, opts: RegisterRoutesOptions): void {
  const { getStore } = opts;

  api.get("/items", async (c) => {
    const s = getStore(c);
    const query = c.req.query("q") || undefined;
    const category = c.req.query("category") || undefined;
    const limit = numberQuery(c, "limit");
    const offset = numberQuery(c, "offset") ?? 0;

    if (limit !== undefined) {
      const result = await s.listItems({ query, category, limit, offset });
      return paginatedJson(c, result, offset, limit);
    }
    const data = await s.listItems({ query, category });
    return c.json({ data });
  });

  api.get("/items/:id/position", async (c) => {
    const id = Number(c.req.param("id"));
    if (isNaN(id)) return c.json({ error: "Invalid item ID" }, 400);
    const query = c.req.query("q") || undefined;
    const category = c.req.query("category") || undefined;
    const position = await getStore(c).getItemPosition(id, { query, category });
    if (position === undefined) return c.json({ error: "Item not found in current list" }, 404);
    return c.json({ data: { position } });
  });

  api.get("/items/:id", async (c) => {
    const entry = await getStore(c).getItem(c.req.param("id"));
    return entry ? c.json({ data: entry }) : c.json({ error: "Item not found" }, 404);
  });
}

export function registerMoveRoutes(api: Hono<any>, opts: RegisterRoutesOptions): void {
  const { getStore } = opts;

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
      return paginatedJson(c, result, offset, limit);
    }
    const data = await s.listMoves({ query, type, category, generation });
    return c.json({ data });
  });

  api.get("/moves/:id/position", async (c) => {
    const id = Number(c.req.param("id"));
    if (isNaN(id)) return c.json({ error: "Invalid move ID" }, 400);
    const query = c.req.query("q") || undefined;
    const type = c.req.query("type") || undefined;
    const category = c.req.query("category") || undefined;
    const generation = numberQuery(c, "generation");
    const position = await getStore(c).getMovePosition(id, { query, type, category, generation });
    if (position === undefined) return c.json({ error: "Move not found in current list" }, 404);
    return c.json({ data: { position } });
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
      return paginatedJson(c, result, offset, limit);
    }
    const data = await getStore(c).getPokemonByMove(id);
    return c.json({ data });
  });
}

export function registerAbilityRoutes(api: Hono<any>, opts: RegisterRoutesOptions): void {
  const { getStore } = opts;

  api.get("/abilities", async (c) => {
    const s = getStore(c);
    const query = c.req.query("q") || undefined;
    const generation = numberQuery(c, "generation");
    const limit = numberQuery(c, "limit");
    const offset = numberQuery(c, "offset") ?? 0;

    if (limit !== undefined) {
      const result = await s.listAbilities({ query, generation, limit, offset });
      return paginatedJson(c, result, offset, limit);
    }
    const data = await s.listAbilities({ query, generation });
    return c.json({ data });
  });

  api.get("/abilities/:id/position", async (c) => {
    const id = Number(c.req.param("id"));
    if (isNaN(id)) return c.json({ error: "Invalid ability ID" }, 400);
    const query = c.req.query("q") || undefined;
    const generation = numberQuery(c, "generation");
    const position = await getStore(c).getAbilityPosition(id, { query, generation });
    if (position === undefined) return c.json({ error: "Ability not found in current list" }, 404);
    return c.json({ data: { position } });
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
      return paginatedJson(c, result, offset, limit);
    }
    const data = await getStore(c).getPokemonByAbility(id);
    return c.json({ data });
  });
}
