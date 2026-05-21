import type { Context } from "hono";
import type { IStore } from "../../../packages/store/shared-types/src/index.ts";

type AnyContext = Context<any>;

export interface RegisterRoutesOptions<E extends object = object> {
  /** 每次请求获取 store 实例（worker 从 c.env.DB 创建，app 返回单例） */
  getStore: (c: AnyContext) => IStore;
}

export function numberQuery(c: AnyContext, key: string): number | undefined {
  const v = c.req.query(key);
  if (!v) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

/** 读取并 clamp limit 参数：确保 >= 1 且不超过 max（默认 200） */
export function limitQuery(c: AnyContext, max = 200): number | undefined {
  const v = numberQuery(c, "limit");
  if (v === undefined) return undefined;
  return Math.min(Math.max(1, Math.round(v)), max);
}

/** 读取并 clamp offset 参数：确保 >= 0 */
export function offsetQuery(c: AnyContext): number {
  const v = numberQuery(c, "offset");
  return v !== undefined ? Math.max(0, Math.round(v)) : 0;
}

/** 读取并校验 generation 参数：确保 >= 1（上限宽松，兼容未来世代） */
export function generationQuery(c: AnyContext): number | undefined {
  const v = numberQuery(c, "generation");
  if (v === undefined) return undefined;
  const g = Math.round(v);
  if (g < 1) return undefined;
  return g;
}

export function paginatedJson(c: AnyContext, result: unknown, offset: number, limit: number) {
  const { items, hasMore, total } = result as { items: unknown[]; hasMore: boolean; total?: number };
  const body: Record<string, unknown> = { data: items, offset, limit, hasMore };
  if (total !== undefined) body.total = total;
  return c.json(body);
}

function pokemonSortQuery(c: AnyContext): { sort?: "speed"; order?: "asc" | "desc" } {
  const sortRaw = c.req.query("sort");
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
  const generation = generationQuery(c);
  const championsSeasonId = numberQuery(c, "seasonId");
  const sortOptions = pokemonSortQuery(c);
  const limit = limitQuery(c);
  const offset = offsetQuery(c);
  return { query, type, generation, championsSeasonId, sortOptions, limit, offset };
}
