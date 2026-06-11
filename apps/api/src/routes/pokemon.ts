import type { Hono } from "hono";
import type { RegisterRoutesOptions } from "../route-utils.ts";
import { numberQuery, paginatedJson, pokemonListQuery } from "../route-utils.ts";

export function registerPokemonRoutes(api: Hono<any>, opts: RegisterRoutesOptions): void {
  const { getStore } = opts;

  api.get("/pokemon", async (c) => {
    const s = getStore(c);
    const { query, type, generation, championsSeasonId, battleFormat, sortOptions, limit, offset } = pokemonListQuery(c);

    if (limit !== undefined) {
      const result = await s.listPokemon({ query, type, generation, championsSeasonId, battleFormat, ...sortOptions, limit, offset });
      return paginatedJson(c, result, offset, limit);
    }
    const data = await s.listPokemon({ query, type, generation, championsSeasonId, battleFormat, ...sortOptions });
    return c.json({ data });
  });

  api.get("/pokemon/cards", async (c) => {
    const s = getStore(c);
    const { query, type, generation, championsSeasonId, battleFormat, sortOptions, limit, offset } = pokemonListQuery(c);

    if (limit !== undefined) {
      const result = await s.listPokemonCards({ query, type, generation, championsSeasonId, battleFormat, ...sortOptions, limit, offset });
      return paginatedJson(c, result, offset, limit);
    }
    const data = await s.listPokemonCards({ query, type, generation, championsSeasonId, battleFormat, ...sortOptions });
    return c.json({ data });
  });

  api.get("/pokemon/table", async (c) => {
    const s = getStore(c);
    const { query, type, generation, championsSeasonId, battleFormat, sortOptions, limit, offset } = pokemonListQuery(c);

    if (limit !== undefined) {
      const result = await s.listPokemonTable({ query, type, generation, championsSeasonId, battleFormat, ...sortOptions, limit, offset });
      return paginatedJson(c, result, offset, limit);
    }
    const data = await s.listPokemonTable({ query, type, generation, championsSeasonId, battleFormat, ...sortOptions });
    return c.json({ data });
  });

  api.get("/pokemon/cards/:id/position", async (c) => {
    const id = Number(c.req.param("id"));
    if (isNaN(id)) return c.json({ error: "Invalid pokemon ID" }, 400);
    const query = c.req.query("q") || undefined;
    const typeRaw = c.req.query("type") || undefined;
    const type = typeRaw
      ? typeRaw.includes(",") ? typeRaw.split(",") : typeRaw
      : undefined;
    const generation = numberQuery(c, "generation");
    const championsSeasonId = numberQuery(c, "seasonId");
    const formatRaw = c.req.query("format");
    const battleFormat = formatRaw === "single" || formatRaw === "double" ? formatRaw : undefined;
    const formId = numberQuery(c, "formId");
    const position = await getStore(c).getPokemonCardPosition(id, { query, type, generation, championsSeasonId, battleFormat }, formId);
    if (position === undefined) return c.json({ error: "Pokemon not found in current list" }, 404);
    return c.json({ data: { position } });
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

  api.get("/pokemon/:id/learnset", async (c) => {
    const s = getStore(c);
    const entry = await s.getPokemonIdentity(c.req.param("id"));
    if (!entry) return c.json({ error: "Pokemon not found" }, 404);
    const generation = numberQuery(c, "generation") ?? 9;
    const formId = numberQuery(c, "formId");
    const gameVersion = c.req.query("version");
    const learnMethod = c.req.query("method") || undefined;
    const search = c.req.query("search") || undefined;
    const limit = numberQuery(c, "limit");
    const offset = numberQuery(c, "offset") ?? 0;
    const pagination = limit !== undefined ? { limit, offset } : undefined;
    const result = await s.getPokemonLearnset(
      entry.id,
      generation,
      { formId, gameVersionCode: gameVersion },
      pagination,
      learnMethod,
      search,
    );
    const body: Record<string, unknown> = {
      data: result.moves,
      pokemonId: entry.id,
      generation,
      formId: result.formId,
      effectiveFormId: result.effectiveFormId,
      usesDefaultLearnset: result.usesDefaultLearnset,
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

  // 对战使用率数据
  api.get("/pokemon/:id/usage", async (c) => {
    const s = getStore(c);
    const entry = await s.getPokemonIdentity(c.req.param("id"));
    if (!entry) return c.json({ error: "Pokemon not found" }, 404);
    const seasonId = numberQuery(c, "seasonId");
    const formId = numberQuery(c, "formId");
    const format = c.req.query("format") || "double";
    if (!seasonId) return c.json({ error: "seasonId is required" }, 400);
    const data = await s.getPokemonUsage(entry.id, seasonId, format, formId || undefined);
    if (!data) return c.json({ error: "No usage data found" }, 404);
    return c.json({ data });
  });
}

export function registerChampionsRoutes(api: Hono<any>, opts: RegisterRoutesOptions): void {
  const { getStore } = opts;

  api.get("/champions/seasons", async (c) => {
    const data = await getStore(c).listChampionsSeasons();
    return c.json({ data });
  });
}
