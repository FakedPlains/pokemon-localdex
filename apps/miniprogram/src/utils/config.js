/**
 * Supabase 配置
 *
 * 小程序端直连 Supabase REST API，不使用 supabase-js SDK。
 * 凭证通过 Taro defineConstants 在编译时注入，源码中不包含任何密钥。
 *
 * 使用方式：
 *   1. 复制 apps/miniprogram/.env.example 为 .env 并填入真实值
 *   2. 运行 npm run dev:weapp 或 npm run build:weapp
 *
 * 注意：需要在微信小程序后台将 SUPABASE_URL 添加到「request 合法域名」列表中。
 */

/* global SUPABASE_URL, SUPABASE_ANON_KEY */

// 由 Taro config/index.js 的 defineConstants 在编译时替换为实际值
export const supabaseUrl = SUPABASE_URL
export const supabaseAnonKey = SUPABASE_ANON_KEY

// 每页加载条数
export const PAGE_SIZE = 40
