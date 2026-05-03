/**
 * Supabase 配置
 *
 * 小程序端直连 Supabase REST API，不使用 supabase-js SDK。
 *
 * 注意：需要在微信小程序后台将 SUPABASE_URL 添加到「request 合法域名」列表中。
 */

// TODO: 发布前将凭证移至安全存储，此处为开发便利直接内联
export const SUPABASE_URL = 'https://lonaljgaevutlyswrelm.supabase.co'
export const SUPABASE_ANON_KEY = 'SUPABASE_ANON_KEY_REDACTED'

// 每页加载条数
export const PAGE_SIZE = 40
