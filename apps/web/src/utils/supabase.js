/**
 * 前端 Supabase 客户端 —— 直连模式
 *
 * 当 VITE_DATA_SOURCE=supabase 时，前端直接通过 supabase-js 查询数据，
 * 不再经过 Hono API 中间层。
 *
 * 需要在 .env 中配置：
 *   VITE_SUPABASE_URL=https://xxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
 *   VITE_DATA_SOURCE=supabase
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const isSupabaseMode =
  (import.meta.env.VITE_DATA_SOURCE || "api").toLowerCase() === "supabase" &&
  SUPABASE_URL &&
  SUPABASE_ANON_KEY;

let _client = null;

export function getSupabase() {
  if (!_client && isSupabaseMode) {
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _client;
}
