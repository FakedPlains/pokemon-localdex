import type { Context } from "hono";
import type { IStore } from "../../../packages/store/shared-types/src/index.ts";

type AnyContext = Context<any>;

export interface RegisterRoutesOptions<E extends object = object> {
  /** 每次请求获取 store 实例（worker 从 c.env.DB 创建，app 返回单例） */
  getStore: (c: AnyContext) => IStore;
}

export function numberQuery(c: AnyContext, key: string): number | undefined {
  const v = c.req.query(key);
  return v ? Number(v) : undefined;
}

export function paginatedJson(c: AnyContext, result: unknown, offset: number, limit: number) {
  const { items, hasMore, total } = result as { items: unknown[]; hasMore: boolean; total?: number };
  const body: Record<string, unknown> = { data: items, offset, limit, hasMore };
  if (total !== undefined) body.total = total;
  return c.json(body);
}

function pokemonSortQuery(c: AnyContext): { sort?: "speed" | "usage"; order?: "asc" | "desc" } {
  const sortRaw = c.req.query("sort");
  if (sortRaw === "usage") return { sort: "usage" };
  const sort = sortRaw === "speed" || sortRaw === "spe" ? "speed" : undefined;
  if (!sort) return {};
  return {
    sort,
    order: c.req.query("order") === "asc" ? "asc" : "desc",
  };
}

export function pokemonListQuery(c: AnyContext) {
  const query = c.req.query("q") || undefined;
  const typeRaw = c.req.query("type") || undefined;
  const type = typeRaw
    ? typeRaw.includes(",") ? typeRaw.split(",") : typeRaw
    : undefined;
  const generation = numberQuery(c, "generation");
  const championsSeasonId = numberQuery(c, "seasonId");
  const formatRaw = c.req.query("format");
  const battleFormat = formatRaw === "single" || formatRaw === "double" ? formatRaw : undefined;
  const sortOptions = pokemonSortQuery(c);
  const limit = numberQuery(c, "limit");
  const offset = numberQuery(c, "offset") ?? 0;
  return { query, type, generation, championsSeasonId, battleFormat, sortOptions, limit, offset };
}
