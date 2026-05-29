import type { Hono } from "hono";
import type { RegisterRoutesOptions } from "../route-utils.ts";
import { numberQuery } from "../route-utils.ts";

export function registerFieldEffectRoutes(api: Hono<any>, opts: RegisterRoutesOptions): void {
  const { getStore } = opts;

  api.get("/field-effects", async (c) => {
    const s = getStore(c);
    const kind = numberQuery(c, "kind");
    const data = await s.listFieldEffects(kind != null ? { kind } : undefined);
    return c.json({ data });
  });

  api.get("/field-effects/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (isNaN(id)) return c.json({ error: "Invalid id" }, 400);
    const data = await getStore(c).getFieldEffect(id);
    return data ? c.json({ data }) : c.json({ error: "Field effect not found" }, 404);
  });
}
