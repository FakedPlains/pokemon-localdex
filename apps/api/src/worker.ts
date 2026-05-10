/**
 * Cloudflare Workers 入口（纯 Workers 版，不依赖 Node.js API）
 *
 * 运行时：workerd（Cloudflare Workers）
 * 绑定：
 *   - DB: D1Database（pokemon-localdex-d1）
 *   - ASSETS: Cloudflare Pages 静态资源（可选）
 *
 * 注意：此文件不导入任何依赖 node:sqlite / node:fs / node:path 的模块。
 * battle/damage 接口在 Workers 环境下使用异步版（查询 D1 做名称映射）。
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { createD1Store } from "../../../packages/store/d1-store/src/index.ts";
import type { D1Store, D1Database } from "../../../packages/store/d1-store/src/index.ts";
import { registerApiRoutes } from "./routes.ts";

// Cloudflare Workers Env 类型
export interface Env {
  DB: D1Database;
  ASSETS?: { fetch: (req: Request) => Promise<Response> };
  DATA_SOURCE?: string;
}

// ── D1Store 单例缓存 ──
// D1Store 是无状态的（只持有 db 引用），同一个 Worker isolate
// 的 env.DB 绑定在请求间保持不变，因此可以安全复用同一个实例。
let cachedStore: D1Store | null = null;
let cachedDb: D1Database | null = null;

function getOrCreateStore(db: D1Database): D1Store {
  if (cachedStore && cachedDb === db) return cachedStore;
  cachedStore = createD1Store(db);
  cachedDb = db;
  return cachedStore;
}

// ── Hono app（Workers 专用） ──

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type"],
}));

app.get("/health", (c) =>
  c.json({ ok: true, service: "pokemon-localdex-api", dataSource: "d1" })
);

// ── API 路由（共享） ──

const api = new Hono<{ Bindings: Env }>();

registerApiRoutes(api, {
  getStore: (c) => getOrCreateStore(c.env.DB),
});

// 挂载路由
app.route("/api", api);
app.route("/", api);

// ── Workers 导出 ──

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 静态资源：交给 Cloudflare Pages ASSETS 绑定处理
    if (env.ASSETS) {
      const isApiPath =
        url.pathname.startsWith("/api/") ||
        url.pathname === "/health";
      if (!isApiPath) {
        return env.ASSETS.fetch(request);
      }
    }

    return app.fetch(request, env, ctx);
  },
};
