/**
 * 统一 API 层 —— 根据 VITE_DATA_SOURCE 环境变量自动选择数据源。
 *
 * VITE_DATA_SOURCE=supabase → 前端直连 Supabase（需配置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY）
 * VITE_DATA_SOURCE=api      → 通过 Hono API 中间层（默认）
 */

import { isSupabaseMode } from "./supabase.js";
import * as supabaseApi from "./supabaseApi.js";

/**
 * 通过 Hono API 请求数据（默认模式）
 */
export async function api(path, options) {
  const response = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Supabase 直连模式的路由分发器。
 * 解析 API 路径并调用对应的 supabaseApi 函数。
 * GitHub Pages 部署时没有后端，所有 GET 查询都走这里。
 */
async function supabaseDispatch(path) {
  const url = new URL(path, "http://localhost");
  const pathname = url.pathname;
  const params = Object.fromEntries(url.searchParams);

  // /pokemon/:id/learnset/meta
  const learnsetMetaMatch = pathname.match(/^\/pokemon\/(\d+)\/learnset\/meta$/);
  if (learnsetMetaMatch) {
    return supabaseApi.fetchLearnsetMeta(Number(learnsetMetaMatch[1]));
  }

  // /pokemon/:id/learnset?generation=xxx&form=xxx&version=xxx
  const learnsetMatch = pathname.match(/^\/pokemon\/(\d+)\/learnset$/);
  if (learnsetMatch) {
    return supabaseApi.fetchPokemonLearnset(
      Number(learnsetMatch[1]),
      Number(params.generation || 9),
      params.form || "default",
      params.version,
    );
  }

  // /pokemon/:id (详情)
  const pokemonDetailMatch = pathname.match(/^\/pokemon\/(.+)$/);
  if (pokemonDetailMatch) {
    return supabaseApi.fetchPokemonDetail(decodeURIComponent(pokemonDetailMatch[1]));
  }

  // /pokemon?q=xxx&type=xxx&generation=xxx&limit=xxx&offset=xxx
  if (pathname === "/pokemon") {
    return supabaseApi.fetchPokemonList({
      query: params.q,
      type: params.type,
      generation: params.generation ? Number(params.generation) : undefined,
      limit: params.limit ? Number(params.limit) : undefined,
      offset: params.offset ? Number(params.offset) : undefined,
    });
  }

  // /items/:id
  const itemMatch = pathname.match(/^\/items\/(.+)$/);
  if (itemMatch) {
    return supabaseApi.fetchItemDetail(decodeURIComponent(itemMatch[1]));
  }

  // /items?q=xxx&category=xxx&limit=xxx&offset=xxx
  if (pathname === "/items") {
    return supabaseApi.fetchItemsList({
      query: params.q,
      category: params.category,
      limit: params.limit ? Number(params.limit) : undefined,
      offset: params.offset ? Number(params.offset) : undefined,
    });
  }

  // /moves/:id
  const moveMatch = pathname.match(/^\/moves\/(.+)$/);
  if (moveMatch) {
    return supabaseApi.fetchMoveDetail(decodeURIComponent(moveMatch[1]));
  }

  // /moves?q=xxx&type=xxx&category=xxx&generation=xxx&limit=xxx&offset=xxx
  if (pathname === "/moves") {
    return supabaseApi.fetchMovesList({
      query: params.q,
      type: params.type,
      category: params.category,
      generation: params.generation ? Number(params.generation) : undefined,
      limit: params.limit ? Number(params.limit) : undefined,
      offset: params.offset ? Number(params.offset) : undefined,
    });
  }

  // /abilities/:id
  const abilityMatch = pathname.match(/^\/abilities\/(.+)$/);
  if (abilityMatch) {
    return supabaseApi.fetchAbilityDetail(decodeURIComponent(abilityMatch[1]));
  }

  // /abilities?q=xxx&generation=xxx&limit=xxx&offset=xxx
  if (pathname === "/abilities") {
    return supabaseApi.fetchAbilitiesList({
      query: params.q,
      generation: params.generation ? Number(params.generation) : undefined,
      limit: params.limit ? Number(params.limit) : undefined,
      offset: params.offset ? Number(params.offset) : undefined,
    });
  }

  // teams — 纯前端模式下使用 localStorage
  if (pathname === "/teams") {
    return { data: JSON.parse(localStorage.getItem("localdex_teams") || "[]") };
  }

  // 未匹配的路由
  throw new Error(`[Supabase direct] No handler for path: ${pathname}`);
}

/**
 * Supabase 直连模式下处理 POST 请求的降级逻辑。
 * GitHub Pages 没有后端，teams 用 localStorage，battle/damage 不可用。
 */
function supabasePostDispatch(path, options) {
  const url = new URL(path, "http://localhost");
  const pathname = url.pathname;

  // POST /teams — 保存到 localStorage
  if (pathname === "/teams") {
    const body = typeof options.body === "string" ? JSON.parse(options.body) : options.body;
    const teams = JSON.parse(localStorage.getItem("localdex_teams") || "[]");
    // 简单追加或替换（按 name 去重）
    const idx = teams.findIndex((t) => t.name === body.name);
    if (idx >= 0) teams[idx] = body;
    else teams.push(body);
    localStorage.setItem("localdex_teams", JSON.stringify(teams));
    return { success: true, data: body };
  }

  // POST /battle/damage — 纯前端无法计算，返回提示
  if (pathname.startsWith("/battle")) {
    throw new Error("Battle damage calculation is not available in static deployment mode.");
  }

  throw new Error(`[Supabase direct] No POST handler for path: ${pathname}`);
}

/**
 * 统一入口 —— 自动选择数据源
 */
export async function unifiedApi(path, options) {
  // Supabase 直连模式
  if (isSupabaseMode) {
    // POST 请求也需要在纯前端模式下降级处理
    if (options?.method === "POST") {
      try {
        return supabasePostDispatch(path, options);
      } catch (err) {
        console.warn("[Supabase direct] POST fallback failed:", err.message);
        // 尝试走 API（如果有后端的话）
        return api(path, options).catch(() => {
          throw err; // 后端也不可用，抛出原始错误
        });
      }
    }

    try {
      return await supabaseDispatch(path);
    } catch (err) {
      console.warn("[Supabase direct] Failed, falling back to API:", err.message);
      return api(path, options);
    }
  }

  // 默认走 Hono API
  return api(path, options);
}
