/**
 * 共享 API 路由注册。
 *
 * app.ts（Node.js / SQLite）和 worker.ts（Cloudflare Workers / D1）
 * 都调用此函数注册完全相同的路由，区别仅在于传入的 getStore 实现不同。
 */

import { Hono } from "hono";
import type { RegisterRoutesOptions } from "./route-utils.ts";
import { registerBattleRoutes } from "./routes/battle.ts";
import { registerAbilityRoutes, registerItemRoutes, registerMoveRoutes } from "./routes/catalog.ts";
import { registerChampionsRoutes, registerPokemonRoutes } from "./routes/pokemon.ts";

export type { RegisterRoutesOptions } from "./route-utils.ts";

/**
 * 将所有 API 路由注册到给定的 Hono 实例上。
 * 返回该实例以便链式调用。
 */
export function registerApiRoutes<E extends object = object>(
  api: Hono<any>,
  opts: RegisterRoutesOptions<E>,
): Hono<any> {
  registerPokemonRoutes(api, opts);
  registerChampionsRoutes(api, opts);
  registerItemRoutes(api, opts);
  registerMoveRoutes(api, opts);
  registerAbilityRoutes(api, opts);
  registerBattleRoutes(api, opts);
  return api;
}
