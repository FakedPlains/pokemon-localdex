/**
 * API 配置 —— 小程序端
 *
 * 通过后端 API 获取数据，不再直连 Supabase。
 * API_BASE_URL 通过 Taro defineConstants 在编译时注入。
 *
 * 使用方式：
 *   1. 复制 apps/miniprogram/.env.example 为 .env 并填入 API 地址
 *   2. 运行 npm run dev:weapp 或 npm run build:weapp
 *
 * 注意：需要在微信小程序后台将 API 域名添加到「request 合法域名」列表中。
 */

/* global API_BASE_URL */

// 由 Taro config/index.js 的 defineConstants 在编译时替换为实际值
export const apiBaseUrl = API_BASE_URL

// 每页加载条数
export const PAGE_SIZE = 40
