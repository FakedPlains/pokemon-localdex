/**
 * Supabase REST API 封装 —— 小程序端
 *
 * 使用 Taro.request 直接调用 Supabase PostgREST API，
 * 不依赖 @supabase/supabase-js（它需要浏览器 API）。
 */

import Taro from '@tarojs/taro'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config'

const REST_URL = `${SUPABASE_URL}/rest/v1`

const DEFAULT_HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation'
}

/**
 * 发起 Supabase REST 请求
 * @param {string} table 表名
 * @param {object} options 查询选项
 * @param {string} options.select PostgREST select 参数
 * @param {object} options.filters 过滤条件 { column: 'eq.value' }
 * @param {string} options.order 排序 'column.asc' 或 'column.desc'
 * @param {number} options.limit 限制条数
 * @param {number} options.offset 偏移量
 * @param {boolean} options.count 是否返回总数（使用 exact count）
 * @param {string} options.or PostgREST or 条件
 * @param {boolean} options.single 是否只返回单条记录
 */
export async function query(table, options = {}) {
  const { select, filters = {}, order, limit, offset, count, or, single } = options

  const params = {}
  if (select) params.select = select
  if (or) params.or = or.startsWith('(') ? or : `(${or})`
  if (order) params.order = order
  if (limit !== undefined) params.limit = String(limit)
  if (offset !== undefined) params.offset = String(offset)

  // 添加过滤条件
  for (const [key, value] of Object.entries(filters)) {
    params[key] = value
  }

  const queryString = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')

  const url = `${REST_URL}/${table}${queryString ? '?' + queryString : ''}`

  const headers = { ...DEFAULT_HEADERS }
  if (count) {
    headers.Prefer = 'count=exact'
  }
  if (single) {
    headers.Accept = 'application/vnd.pgrst.object+json'
  }

  try {
    const res = await Taro.request({
      url,
      method: 'GET',
      header: headers
    })

    if (res.statusCode >= 400) {
      console.error('[Supabase]', res.statusCode, res.data)
      throw new Error(`Supabase error: ${res.statusCode}`)
    }

    let total = undefined
    if (count) {
      const range = res.header?.['content-range'] || res.header?.['Content-Range'] || ''
      const match = range.match(/\/(\d+)/)
      if (match) total = Number(match[1])
    }

    return { data: res.data, total }
  } catch (err) {
    console.error('[Supabase request failed]', err)
    throw err
  }
}

/**
 * 查询单条记录
 */
export async function queryOne(table, options = {}) {
  const result = await query(table, { ...options, single: true, limit: 1 })
  return { data: result.data }
}
