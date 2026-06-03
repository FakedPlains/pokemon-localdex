import type { Hono } from "hono";
import type { RegisterRoutesOptions } from "../route-utils.ts";

export function registerSearchRoutes(api: Hono<any>, opts: RegisterRoutesOptions): void {
  const { getStore } = opts;

  /**
   * GET /search?q=xxx&limit=5
   * 全局聚合搜索：并行搜索宝可梦、招式、特性、道具、场地效果，每类返回最多 limit 条结果。
   */
  api.get("/search", async (c) => {
    const query = c.req.query("q");
    if (!query || query.trim().length === 0) {
      return c.json({ data: { pokemon: [], moves: [], abilities: [], items: [], fieldEffects: [] } });
    }

    const limitRaw = c.req.query("limit");
    const limit = limitRaw ? Math.min(Math.max(Number(limitRaw), 1), 20) : 5;

    const results = await getStore(c).globalSearch(query.trim(), limit);
    return c.json({ data: results });
  });
}
