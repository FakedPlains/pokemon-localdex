import type { Hono } from "hono";
import { calculateDamage } from "../../../../packages/battle-core/src/index.ts";
import type { RegisterRoutesOptions } from "../route-utils.ts";

export function registerBattleRoutes(api: Hono<any>, opts: RegisterRoutesOptions): void {
  const { getStore } = opts;

  api.post("/battle/damage", async (c) => {
    try {
      const input = await c.req.json();

      // 基本结构校验
      if (!input || typeof input !== "object") {
        return c.json({ error: "请求体必须是 JSON 对象" }, 400);
      }
      if (input.generation === undefined || input.generation === null || !input.attacker || !input.defender || !input.move) {
        return c.json({ error: "缺少必填字段：generation, attacker, defender, move" }, 400);
      }
      if (!input.attacker.pokemonId && !input.attacker.name) {
        return c.json({ error: "attacker 必须提供 pokemonId 或 name" }, 400);
      }
      if (!input.defender.pokemonId && !input.defender.name) {
        return c.json({ error: "defender 必须提供 pokemonId 或 name" }, 400);
      }

      const store = getStore(c);
      const result = await calculateDamage(input, store);
      return c.json({ data: result });
    } catch (err: any) {
      return c.json({ error: err?.message ?? "Calculation failed" }, 400);
    }
  });
}
