import type { Hono } from "hono";
import { calculateDamage } from "../../../../packages/battle-core/src/index.ts";
import type { RegisterRoutesOptions } from "../route-utils.ts";

export function registerBattleRoutes(api: Hono<any>, opts: RegisterRoutesOptions): void {
  const { getStore } = opts;

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
}
