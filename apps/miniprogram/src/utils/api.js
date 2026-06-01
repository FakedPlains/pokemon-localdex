/**
 * 数据 API 层 —— 小程序端
 *
 * 通过后端 Hono API 获取数据，返回格式与页面组件期望的一致。
 */

import Taro from '@tarojs/taro'
import { apiBaseUrl } from './config'

/**
 * 通用 API 请求封装
 * @param {string} path API 路径（如 /api/pokemon）
 * @param {object} options 请求选项
 * @returns {Promise<any>} 解析后的 JSON 响应
 */
async function request(path, options = {}) {
  const { method = 'GET', params, body } = options

  // 构建查询参数
  let url = `${apiBaseUrl}/api${path}`
  if (params) {
    const query = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')
    if (query) url += `?${query}`
  }

  const header = { 'Content-Type': 'application/json' }

  try {
    const res = await Taro.request({
      url,
      method,
      header,
      data: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
    })

    if (res.statusCode >= 400) {
      console.error('[API]', res.statusCode, res.data)
      throw new Error(`API error: ${res.statusCode}`)
    }

    return res.data
  } catch (err) {
    console.error('[API request failed]', path, err)
    throw err
  }
}

// ── Pokemon 列表 ──

function buildPokemonListParams({ q, type, generation, limit, offset } = {}) {
  const params = {}
  if (q) params.q = q
  if (type) params.type = type
  if (generation) params.generation = generation
  if (limit !== undefined) params.limit = limit
  if (offset !== undefined) params.offset = offset
  return params
}

export async function fetchPokemonList({ q, type, generation, limit, offset } = {}) {
  const params = buildPokemonListParams({ q, type, generation, limit, offset })
  const res = await request('/pokemon', { params })
  return res
}

export async function fetchPokemonCards({ q, type, generation, limit, offset } = {}) {
  const params = buildPokemonListParams({ q, type, generation, limit, offset })
  const res = await request('/pokemon/cards', { params })
  return res
}

// ── Pokemon 详情 ──

export async function fetchPokemonDetail(idOrSlug) {
  const res = await request(`/pokemon/${encodeURIComponent(idOrSlug)}`)
  return res
}

/** 轻量摘要（不含 evolutionChain、generations） */
export async function fetchPokemonSummary(idOrSlug) {
  const res = await request(`/pokemon/${encodeURIComponent(idOrSlug)}/summary`)
  return res
}

/** 独立进化链 */
export async function fetchPokemonEvolution(pokemonId) {
  const res = await request(`/pokemon/${pokemonId}/evolution`)
  return res
}

// ── Pokemon Learnset Meta ──

export async function fetchLearnsetMeta(pokemonId) {
  const res = await request(`/pokemon/${pokemonId}/learnset/meta`)
  return res
}

// ── Pokemon Learnset ──

export async function fetchPokemonLearnset(pokemonId, generation, formId, gameVersionCode, { limit, offset, method } = {}) {
  const params = {}
  if (generation !== undefined) params.generation = generation
  if (formId != null) params.formId = formId
  if (gameVersionCode !== undefined) params.version = gameVersionCode
  if (limit !== undefined) params.limit = limit
  if (offset !== undefined) params.offset = offset
  if (method) params.method = method

  const res = await request(`/pokemon/${pokemonId}/learnset`, { params })
  return res
}

// ── Moves 列表 ──

export async function fetchMovesList({ q, type, category, generation, limit, offset } = {}) {
  const params = {}
  if (q) params.q = q
  if (type) params.type = type
  if (category) params.category = category
  if (generation) params.generation = generation
  if (limit !== undefined) params.limit = limit
  if (offset !== undefined) params.offset = offset

  const res = await request('/moves', { params })
  return res
}

// ── Move 详情 ──

export async function fetchMoveDetail(idOrSlug) {
  const res = await request(`/moves/${encodeURIComponent(idOrSlug)}`)
  return res
}

// ── Abilities 列表 ──

export async function fetchAbilitiesList({ q, generation, limit, offset } = {}) {
  const params = {}
  if (q) params.q = q
  if (generation) params.generation = generation
  if (limit !== undefined) params.limit = limit
  if (offset !== undefined) params.offset = offset

  const res = await request('/abilities', { params })
  return res
}

// ── Ability 详情 ──

export async function fetchAbilityDetail(idOrSlug) {
  const res = await request(`/abilities/${encodeURIComponent(idOrSlug)}`)
  return res
}

// ── Items 列表 ──

export async function fetchItemsList({ q, category, limit, offset } = {}) {
  const params = {}
  if (q) params.q = q
  if (category) params.category = category
  if (limit !== undefined) params.limit = limit
  if (offset !== undefined) params.offset = offset

  const res = await request('/items', { params })
  return res
}

// ── Item 详情 ──

export async function fetchItemDetail(idOrSlug) {
  const res = await request(`/items/${encodeURIComponent(idOrSlug)}`)
  return res
}

// ── 招式反查宝可梦 ──

export async function fetchPokemonByMove(moveId, { limit, offset } = {}) {
  const params = {}
  if (limit !== undefined) params.limit = limit
  if (offset !== undefined) params.offset = offset
  const res = await request(`/moves/${moveId}/pokemon`, { params })
  return res
}

// ── 特性反查宝可梦 ──

export async function fetchPokemonByAbility(abilityId, { limit, offset } = {}) {
  const params = {}
  if (limit !== undefined) params.limit = limit
  if (offset !== undefined) params.offset = offset
  const res = await request(`/abilities/${abilityId}/pokemon`, { params })
  return res
}
