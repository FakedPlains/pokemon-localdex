import type { Hono } from "hono";
import type { RegisterRoutesOptions } from "../route-utils.ts";
import { numberQuery, paginatedJson, pokemonListQuery } from "../route-utils.ts";

export function registerPokemonRoutes(api: Hono<any>, opts: RegisterRoutesOptions): void {
  const { getStore } = opts;

  api.get("/pokemon", async (c) => {
    const s = getStore(c);
    const { query, type, generation, championsSeasonId, sortOptions, limit, offset } = pokemonListQuery(c);

    if (limit !== undefined) {
      const result = await s.listPokemon({ query, type, generation, championsSeasonId, ...sortOptions, limit, offset });
      return paginatedJson(c, result, offset, limit);
    }
    const data = await s.listPokemon({ query, type, generation, championsSeasonId, ...sortOptions });
    return c.json({ data });
  });

  api.get("/pokemon/cards", async (c) => {
    const s = getStore(c);
    const { query, type, generation, championsSeasonId, sortOptions, limit, offset } = pokemonListQuery(c);

    if (limit !== undefined) {
      const result = await s.listPokemonCards({ query, type, generation, championsSeasonId, ...sortOptions, limit, offset });
      return paginatedJson(c, result, offset, limit);
    }
    const data = await s.listPokemonCards({ query, type, generation, championsSeasonId, ...sortOptions });
    return c.json({ data });
  });

  api.get("/pokemon/table", async (c) => {
    const s = getStore(c);
    const { query, type, generation, championsSeasonId, sortOptions, limit, offset } = pokemonListQuery(c);

    if (limit !== undefined) {
      const result = await s.listPokemonTable({ query, type, generation, championsSeasonId, ...sortOptions, limit, offset });
      return paginatedJson(c, result, offset, limit);
    }
    const data = await s.listPokemonTable({ query, type, generation, championsSeasonId, ...sortOptions });
    return c.json({ data });
  });

  api.get("/pokemon/:id", async (c) => {
    const championsSeasonId = numberQuery(c, "seasonId");
    const entry = await getStore(c).getPokemon(c.req.param("id"), { championsSeasonId });
    return entry ? c.json({ data: entry }) : c.json({ error: "Pokemon not found" }, 404);
  });

  // 轻量摘要：跳过 evolutionChain 和 generations，减少 D1 查询
  api.get("/pokemon/:id/summary", async (c) => {
    const championsSeasonId = numberQuery(c, "seasonId");
    const entry = await getStore(c).getPokemonSummary(c.req.param("id"), { championsSeasonId });
    return entry ? c.json({ data: entry }) : c.json({ error: "Pokemon not found" }, 404);
  });

  // 独立的进化链接口
  api.get("/pokemon/:id/evolution", async (c) => {
    const s = getStore(c);
    const entry = await s.getPokemonIdentity(c.req.param("id"));
    if (!entry) return c.json({ error: "Pokemon not found" }, 404);
    const data = await s.getPokemonEvolution(entry.id);
    return c.json({ data, pokemonId: entry.id });
  });

  // 独立的世代地区接口
  api.get("/pokemon/:id/generations", async (c) => {
    const s = getStore(c);
    const entry = await s.getPokemonIdentity(c.req.param("id"));
    if (!entry) return c.json({ error: "Pokemon not found" }, 404);
    const data = await s.getPokemonGenerations(entry.id);
    return c.json({ data, pokemonId: entry.id });
  });

  api.get("/pokemon/:id/learnset", async (c) => {
    const s = getStore(c);
    const entry = await s.getPokemonIdentity(c.req.param("id"));
    if (!entry) return c.json({ error: "Pokemon not found" }, 404);
    const generation = numberQuery(c, "generation") ?? 9;
    const formKey = c.req.query("form") || "default";
    const gameVersion = c.req.query("version");
    const learnMethod = c.req.query("method") || undefined;
    const limit = numberQuery(c, "limit");
    const offset = numberQuery(c, "offset") ?? 0;
    const pagination = limit !== undefined ? { limit, offset } : undefined;
    const result = await s.getPokemonLearnset(entry.id, generation, formKey, gameVersion, pagination, learnMethod);
    const body: Record<string, unknown> = {
      data: result.moves,
      pokemonId: entry.id,
      generation,
      formKey: result.formKey,
      gameVersionCode: result.gameVersionCode,
    };
    // methodCounts 仅在首次请求（offset=0）时返回，追加加载时省略以减少负载
    if (result.methodCounts) body.methodCounts = result.methodCounts;
    if (pagination) {
      body.hasMore = result.hasMore ?? false;
      body.offset = offset;
      body.limit = limit;
    }
    return c.json(body);
  });

  api.get("/pokemon/:id/learnset/meta", async (c) => {
    const s = getStore(c);
    const entry = await s.getPokemonIdentity(c.req.param("id"));
    if (!entry) return c.json({ error: "Pokemon not found" }, 404);
    const meta = await s.getLearnsetMeta(entry.id);
    return c.json({ data: meta, pokemonId: entry.id });
  });
}

export function registerChampionsRoutes(api: Hono<any>, opts: RegisterRoutesOptions): void {
  const { getStore } = opts;

  api.get("/champions/seasons", async (c) => {
    const data = await getStore(c).listChampionsSeasons();
    return c.json({ data });
  });
}
