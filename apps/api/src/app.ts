import { Hono } from "hono";
import { cors } from "hono/cors";
import { createSqliteStore } from "../../../packages/store/sqlite-store/src/index.ts";
import { registerApiRoutes } from "./routes.ts";

// 导入静态文件服务
import { staticResponse } from "./static.ts";

// ── 创建 IStore 实例（SQLite） ──

const sqliteStore = createSqliteStore();

console.log("[API] Data source: SQLite (local)");

// ── Hono app ──

export const app = new Hono();

app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type"]
}));

app.get("/", (c) => staticResponse("/") ?? c.notFound());
app.get("/assets/*", (c) => staticResponse(c.req.path) ?? c.notFound());

app.get("/health", (c) => c.json({ ok: true, service: "pokemon-localdex-api", dataSource: "sqlite" }));

// ── API 路由（共享） ──

const apiRoutes = new Hono();

registerApiRoutes(apiRoutes, {
  getStore: () => sqliteStore,
});

// 挂载到根路径（Vite dev proxy 模式）和 /api 前缀（生产模式）
app.route("/", apiRoutes);
app.route("/api", apiRoutes);

app.get("*", (c) => staticResponse("/index.html") ?? c.text("Not Found", 404));
