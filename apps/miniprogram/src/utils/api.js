/**
 * 数据 API 层 —— 小程序端
 *
 * 通过 Supabase REST API 获取数据，返回格式与 Web 端保持一致。
 */

import { query, queryOne } from './supabase'

const GAME_VERSION_NAMES = {
  RG: '红/绿', B: '蓝', Y: '黄',
  GS: '金/银', C: '水晶',
  RS: '红宝石/蓝宝石', E: '绿宝石', FRLG: '火红/叶绿',
  DP: '钻石/珍珠', Pt: '白金', HGSS: '心金/魂银',
  BW: '黑/白', B2W2: '黑2/白2',
  XY: 'X/Y', ORAS: '欧米伽红宝石/阿尔法蓝宝石',
  SM: '太阳/月亮', USUM: '究极之日/究极之月', LPLE: "Let's Go 皮卡丘/伊布",
  SWSH: '剑/盾', SWSHE: '剑/盾 铠之孤岛+冠之雪原', BDSP: '晶灿钻石/明亮珍珠', LA: '传说 阿尔宙斯',
  SV: '朱/紫', SVT: '朱/紫 零之秘宝', ZA: '传说 Z-A',
  CHAMP: '冠军'
}

// ── Pokemon 列表 ──

export async function fetchPokemonList({ q, type, generation, limit, offset } = {}) {
  const select = [
    'id,dex_number,slug,name_zh,name_ja,name_en',
    'pokemon_forms!inner(id,pokemon_form_stats(hp,atk,def,spa,spd,spe,generation_end),pokemon_form_types(type_name,slot),pokemon_form_abilities(ability_name_zh,is_hidden,slot),pokemon_form_images(image_kind,url,alt))',
    'pokemon_generation_regions(generation)'
  ].join(',')

  const filters = { 'pokemon_forms.is_default': 'eq.1' }
  let or = undefined
  if (q) {
    or = `name_zh.ilike.%${q}%,name_ja.ilike.%${q}%,name_en.ilike.%${q}%,slug.ilike.%${q}%`
  }

  const { data: rows, total } = await query('pokemon', {
    select,
    filters,
    or,
    order: 'dex_number.asc',
    limit,
    offset,
    count: limit !== undefined
  })

  let filtered = rows || []

  // 客户端过滤属性（PostgREST 不支持嵌套表过滤）
  if (type) {
    const types = type.split(',')
    filtered = filtered.filter(row => {
      const formTypes = row.pokemon_forms?.[0]?.pokemon_form_types?.map(t => t.type_name) || []
      return types.some(t => formTypes.includes(t))
    })
  }

  if (generation) {
    const gen = Number(generation)
    filtered = filtered.filter(row => {
      const gens = row.pokemon_generation_regions?.map(g => g.generation) || []
      return gens.includes(gen)
    })
  }

  const items = filtered.map(mapPokemonRow)

  if (limit !== undefined) {
    const t = total ?? items.length
    return { data: items, total: t, offset: offset || 0, limit, hasMore: (offset || 0) + items.length < t }
  }
  return { data: items }
}

function mapPokemonRow(row) {
  const form = row.pokemon_forms?.[0]
  const typeRows = (form?.pokemon_form_types || []).sort((a, b) => a.slot - b.slot)
  const types = typeRows.map(t => t.type_name)

  const statRows = form?.pokemon_form_stats || []
  const latestStat = statRows.find(s => s.generation_end === null) || statRows[0]

  const imageRows = form?.pokemon_form_images || []
  const officialImg = imageRows.find(i => i.image_kind === 'official')

  return {
    id: row.id,
    dexNumber: row.dex_number,
    slug: row.slug,
    nameZh: row.name_zh,
    nameEn: row.name_en || undefined,
    primaryType: types[0],
    secondaryType: types[1],
    baseStats: latestStat ? {
      hp: latestStat.hp, atk: latestStat.atk, def: latestStat.def,
      spa: latestStat.spa, spd: latestStat.spd, spe: latestStat.spe
    } : undefined,
    image: officialImg ? { url: officialImg.url, alt: officialImg.alt || undefined } : undefined
  }
}

// ── Pokemon 详情 ──

export async function fetchPokemonDetail(idOrSlug) {
  const numId = Number(idOrSlug)
  const isNum = !isNaN(numId) && numId > 0

  // 构建 or 条件，只包含有意义的匹配项
  const orParts = [`slug.eq.${idOrSlug}`, `name_zh.eq.${idOrSlug}`]
  if (isNum) {
    orParts.push(`id.eq.${numId}`, `dex_number.eq.${numId}`)
  }

  const { data: rows } = await query('pokemon', {
    select: '*',
    or: orParts.join(','),
    limit: 1
  })

  const pokemonRow = rows?.[0]
  if (!pokemonRow) return { data: null }
  const pokemonId = pokemonRow.id

  // 获取所有形态
  const { data: formRows } = await query('pokemon_forms', {
    select: [
      'id,form_key,name_zh,form_type,is_default,sort_order',
      'pokemon_form_stats(generation_start,generation_end,hp,atk,def,spa,spd,spe)',
      'pokemon_form_types(type_name,slot,generation_start,generation_end)',
      'pokemon_form_abilities(ability_name_zh,is_hidden,slot,ability_id,generation_start,generation_end)',
      'pokemon_form_images(image_kind,url,alt)'
    ].join(','),
    filters: { pokemon_id: `eq.${pokemonId}` },
    order: 'sort_order.asc'
  })

  // 获取进化链
  const { data: chainRef } = await query('evolution_chains', {
    select: 'chain_id',
    filters: { to_pokemon_id: `eq.${pokemonId}` },
    limit: 1
  })

  let evolutionChain = []
  if (chainRef && chainRef.length > 0) {
    const chainId = chainRef[0].chain_id
    const { data: evoRows } = await query('evolution_chains', {
      select: '*',
      filters: { chain_id: `eq.${chainId}` },
      order: 'sort_order.asc'
    })

    if (evoRows) {
      evolutionChain = await Promise.all(evoRows.map(async e => {
        let fromNameZh
        if (e.from_pokemon_id) {
          const { data: fp } = await queryOne('pokemon', {
            select: 'name_zh',
            filters: { id: `eq.${e.from_pokemon_id}` }
          })
          fromNameZh = fp?.name_zh
        }
        const { data: tp } = await queryOne('pokemon', {
          select: 'name_zh',
          filters: { id: `eq.${e.to_pokemon_id}` }
        })

        // 获取目标宝可梦的默认形态图片
        const { data: toFormArr } = await query('pokemon_forms', {
          select: 'id',
          filters: { pokemon_id: `eq.${e.to_pokemon_id}`, is_default: 'eq.1' },
          limit: 1
        })
        const toForm = toFormArr?.[0]

        let toImage
        let toTypes = []
        if (toForm) {
          const { data: imgArr } = await query('pokemon_form_images', {
            select: 'url,alt',
            filters: { form_id: `eq.${toForm.id}`, image_kind: 'eq.official' },
            limit: 1
          })
          if (imgArr?.[0]) toImage = { url: imgArr[0].url, alt: imgArr[0].alt || undefined }

          const { data: typeArr } = await query('pokemon_form_types', {
            select: 'type_name',
            filters: { form_id: `eq.${toForm.id}` },
            order: 'slot.asc'
          })
          toTypes = (typeArr || []).map(t => t.type_name)
        }

        return {
          fromPokemonId: e.from_pokemon_id || undefined,
          fromNameZh,
          toPokemonId: e.to_pokemon_id,
          toNameZh: tp?.name_zh || '',
          stage: e.stage,
          method: e.evolution_method || undefined,
          condition: e.evolution_condition || undefined,
          item: e.evolution_item || undefined,
          level: e.evolution_level ?? undefined,
          toTypes,
          toImage
        }
      }))
    }
  }

  // 世代可用性
  const { data: genRows } = await query('pokemon_generation_regions', {
    select: 'generation',
    filters: { pokemon_id: `eq.${pokemonId}` },
    order: 'generation.asc'
  })
  const generations = [...new Set((genRows || []).map(r => r.generation))]

  // 组装形态
  const forms = (formRows || []).map(f => {
    const statEntries = (f.pokemon_form_stats || []).sort((a, b) => (a.generation_start ?? 0) - (b.generation_start ?? 0))
    const typeEntries = (f.pokemon_form_types || []).sort((a, b) => (a.generation_start ?? 0) - (b.generation_start ?? 0))
    const abilityEntries = (f.pokemon_form_abilities || []).sort((a, b) => (a.generation_start ?? 0) - (b.generation_start ?? 0))
    const imageEntries = f.pokemon_form_images || []

    const latestStat = statEntries.find(s => s.generation_end === null) || statEntries[0]
    const latestTypes = typeEntries.filter(t => t.generation_end === null)
    const typesSorted = (latestTypes.length > 0 ? latestTypes : typeEntries).sort((a, b) => a.slot - b.slot)
    const latestAbilities = abilityEntries.filter(a => a.generation_end === null)
    const abilitiesSorted = (latestAbilities.length > 0 ? latestAbilities : abilityEntries).sort((a, b) => a.slot - b.slot)

    const images = {}
    for (const img of imageEntries) {
      images[img.image_kind] = { url: img.url, alt: img.alt || undefined }
    }

    const entry = {
      formKey: f.form_key,
      nameZh: f.name_zh,
      formType: f.form_type,
      isDefault: Boolean(f.is_default),
      sortOrder: f.sort_order,
      primaryType: typesSorted[0]?.type_name,
      secondaryType: typesSorted[1]?.type_name,
      abilities: abilitiesSorted.map(a => ({
        nameZh: a.ability_name_zh,
        isHidden: Boolean(a.is_hidden),
        abilityId: a.ability_id || undefined
      })),
      baseStats: latestStat ? {
        hp: latestStat.hp, atk: latestStat.atk, def: latestStat.def,
        spa: latestStat.spa, spd: latestStat.spd, spe: latestStat.spe
      } : undefined,
      images
    }

    if (statEntries.length > 1) {
      entry.statVariants = statEntries.map(s => ({
        generationStart: s.generation_start ?? undefined,
        generationEnd: s.generation_end ?? undefined,
        baseStats: { hp: s.hp, atk: s.atk, def: s.def, spa: s.spa, spd: s.spd, spe: s.spe }
      }))
    }

    return entry
  })

  const defaultForm = forms.find(f => f.isDefault) || forms[0]

  return {
    data: {
      id: pokemonId,
      dexNumber: pokemonRow.dex_number,
      slug: pokemonRow.slug,
      nameZh: pokemonRow.name_zh,
      nameJa: pokemonRow.name_ja || undefined,
      nameEn: pokemonRow.name_en || undefined,
      primaryType: defaultForm?.primaryType,
      secondaryType: defaultForm?.secondaryType,
      abilities: defaultForm?.abilities.filter(a => !a.isHidden).map(a => a.nameZh) || [],
      hiddenAbility: defaultForm?.abilities.find(a => a.isHidden)?.nameZh,
      baseStats: defaultForm?.baseStats,
      image: defaultForm?.images.official,
      shinyImage: defaultForm?.images.shiny,
      generations,
      category: pokemonRow.category || undefined,
      heightM: pokemonRow.height_m ?? undefined,
      weightKg: pokemonRow.weight_kg ?? undefined,
      forms,
      evolutionChain,
      source: pokemonRow.source_url ? {
        url: pokemonRow.source_url,
        title: pokemonRow.source_title || ''
      } : undefined
    }
  }
}

// ── Pokemon Learnset Meta ──

export async function fetchLearnsetMeta(pokemonId) {
  const { data: genRows } = await query('pokemon_learnsets', {
    select: 'generation',
    filters: { pokemon_id: `eq.${pokemonId}` }
  })
  const generations = [...new Set((genRows || []).map(r => r.generation))].sort((a, b) => a - b)

  const { data: formRows } = await query('pokemon_learnsets', {
    select: 'form_key',
    filters: { pokemon_id: `eq.${pokemonId}` }
  })
  const formKeys = [...new Set((formRows || []).map(r => r.form_key))].sort()

  const { data: versionRows } = await query('pokemon_learnsets', {
    select: 'generation,game_version_code',
    filters: {
      pokemon_id: `eq.${pokemonId}`,
      game_version_code: 'not.is.null'
    }
  })

  const versionsByGen = {}
  for (const r of (versionRows || [])) {
    if (!r.game_version_code) continue
    const gen = r.generation
    const code = r.game_version_code
    if (!versionsByGen[gen]) versionsByGen[gen] = []
    if (!versionsByGen[gen].find(v => v.code === code)) {
      versionsByGen[gen].push({ code, name: GAME_VERSION_NAMES[code] || code })
    }
  }

  return { data: { generations, formKeys, versionsByGen }, pokemonId }
}

// ── Pokemon Learnset ──

export async function fetchPokemonLearnset(pokemonId, generation, formKey = 'default', gameVersionCode) {
  async function doQuery(pid, gen, fk) {
    const filters = {
      pokemon_id: `eq.${pid}`,
      generation: `eq.${gen}`,
      form_key: `eq.${fk}`
    }
    if (gameVersionCode !== undefined) {
      if (gameVersionCode === '') {
        // 空字符串或 null
        filters.game_version_code = 'is.null'
      } else {
        filters.game_version_code = `eq.${gameVersionCode}`
      }
    }

    const { data } = await query('pokemon_learnsets', {
      select: 'move_name_zh,learn_method,level,tm_number,notes,game_version_code,move_id,moves!left(type_name,category,power,accuracy,pp,description)',
      filters,
      order: 'learn_method.asc,sort_order.asc'
    })
    return data || []
  }

  let rows = await doQuery(pokemonId, generation, formKey)
  let usedFormKey = formKey

  if (rows.length === 0 && formKey !== 'default') {
    rows = await doQuery(pokemonId, generation, 'default')
    if (rows.length > 0) usedFormKey = 'default'
  }

  if (rows.length === 0) {
    const { data: firstForm } = await query('pokemon_learnsets', {
      select: 'form_key',
      filters: { pokemon_id: `eq.${pokemonId}`, generation: `eq.${generation}` },
      limit: 1
    })
    if (firstForm && firstForm.length > 0) {
      const fallbackKey = firstForm[0].form_key
      rows = await doQuery(pokemonId, generation, fallbackKey)
      if (rows.length > 0) usedFormKey = fallbackKey
    }
  }

  const moves = rows.map(r => {
    const m = r.moves
    return {
      moveId: r.move_id ?? undefined,
      moveNameZh: r.move_name_zh,
      learnMethod: r.learn_method,
      level: r.level ?? undefined,
      tmNumber: r.tm_number || undefined,
      moveType: m?.type_name || undefined,
      moveCategory: m?.category || undefined,
      movePower: m?.power ?? undefined,
      moveAccuracy: m?.accuracy ?? undefined,
      movePP: m?.pp ?? undefined,
      moveDescription: m?.description || undefined
    }
  })

  return { data: moves, pokemonId, generation, formKey: usedFormKey }
}

// ── Moves 列表 ──

export async function fetchMovesList({ q, type, category, generation, limit, offset } = {}) {
  const filters = {}
  if (type) filters.type_name = `eq.${type}`
  if (category) filters.category = `eq.${category}`

  let or = undefined
  if (q) {
    or = `name_zh.ilike.%${q}%,name_ja.ilike.%${q}%,name_en.ilike.%${q}%`
  }

  const { data: rows, total } = await query('moves', {
    select: '*',
    filters,
    or,
    order: 'name_zh.asc',
    limit,
    offset,
    count: limit !== undefined
  })

  const items = (rows || []).map(row => ({
    id: String(row.id),
    number: row.number ?? undefined,
    nameZh: row.name_zh,
    nameJa: row.name_ja || undefined,
    nameEn: row.name_en || undefined,
    type: row.type_name || undefined,
    category: row.category || undefined,
    power: row.power ?? undefined,
    accuracy: row.accuracy ?? undefined,
    pp: row.pp ?? undefined,
    description: row.description || undefined,
    effectDetail: row.effect_detail || undefined,
    introducedGeneration: row.introduced_generation ?? undefined
  }))

  if (limit !== undefined) {
    const t = total ?? items.length
    return { data: items, total: t, offset: offset || 0, limit, hasMore: (offset || 0) + items.length < t }
  }
  return { data: items }
}

// ── Move 详情 ──

export async function fetchMoveDetail(idOrSlug) {
  const { data: rows } = await query('moves', {
    select: '*',
    or: `id.eq.${idOrSlug},name_zh.eq.${idOrSlug}`,
    limit: 1
  })
  const row = rows?.[0]
  if (!row) return { data: null }

  const { data: genRows } = await query('move_generation_records', {
    select: '*',
    filters: { move_id: `eq.${row.id}` },
    order: 'generation.asc'
  })

  return {
    data: {
      id: String(row.id),
      number: row.number ?? undefined,
      nameZh: row.name_zh,
      nameJa: row.name_ja || undefined,
      nameEn: row.name_en || undefined,
      type: row.type_name || undefined,
      category: row.category || undefined,
      power: row.power ?? undefined,
      accuracy: row.accuracy ?? undefined,
      pp: row.pp ?? undefined,
      description: row.description || undefined,
      effectDetail: row.effect_detail || undefined,
      introducedGeneration: row.introduced_generation ?? undefined,
      generations: (genRows || []).map(g => ({
        generation: g.generation,
        gameVersionCode: g.game_version_code || undefined,
        gameVersionName: GAME_VERSION_NAMES[g.game_version_code] || undefined,
        description: g.description || '',
        notes: g.notes || undefined
      }))
    }
  }
}

// ── Abilities 列表 ──

export async function fetchAbilitiesList({ q, generation, limit, offset } = {}) {
  let or = undefined
  if (q) {
    or = `name_zh.ilike.%${q}%,name_ja.ilike.%${q}%,name_en.ilike.%${q}%`
  }

  const { data: rows, total } = await query('abilities', {
    select: '*',
    or,
    order: 'number.asc,name_zh.asc',
    limit,
    offset,
    count: limit !== undefined
  })

  const items = (rows || []).map(row => ({
    id: String(row.id),
    number: row.number ?? undefined,
    nameZh: row.name_zh,
    nameJa: row.name_ja || undefined,
    nameEn: row.name_en || undefined,
    description: row.description || undefined,
    effectDetail: row.effect_detail || undefined,
    introducedGeneration: row.introduced_generation ?? undefined
  }))

  if (limit !== undefined) {
    const t = total ?? items.length
    return { data: items, total: t, offset: offset || 0, limit, hasMore: (offset || 0) + items.length < t }
  }
  return { data: items }
}

// ── Ability 详情 ──

export async function fetchAbilityDetail(idOrSlug) {
  const { data: rows } = await query('abilities', {
    select: '*',
    or: `id.eq.${idOrSlug},name_zh.eq.${idOrSlug}`,
    limit: 1
  })
  const row = rows?.[0]
  if (!row) return { data: null }

  const { data: genRows } = await query('ability_generation_records', {
    select: '*',
    filters: { ability_id: `eq.${row.id}` },
    order: 'generation.asc'
  })

  return {
    data: {
      id: String(row.id),
      number: row.number ?? undefined,
      nameZh: row.name_zh,
      nameJa: row.name_ja || undefined,
      nameEn: row.name_en || undefined,
      description: row.description || undefined,
      effectDetail: row.effect_detail || undefined,
      introducedGeneration: row.introduced_generation ?? undefined,
      generations: (genRows || []).map(g => ({
        generation: g.generation,
        gameVersionCode: g.game_version_code || undefined,
        gameVersionName: GAME_VERSION_NAMES[g.game_version_code] || undefined,
        description: g.description || '',
        notes: g.notes || undefined
      }))
    }
  }
}

// ── Items 列表 ──

export async function fetchItemsList({ q, category, limit, offset } = {}) {
  const filters = {}
  if (category) filters.category = `eq.${category}`

  let or = undefined
  if (q) {
    or = `name_zh.ilike.%${q}%,name_ja.ilike.%${q}%,name_en.ilike.%${q}%,slug.ilike.%${q}%,effect_summary.ilike.%${q}%`
  }

  const { data: rows, total } = await query('items', {
    select: '*',
    filters,
    or,
    order: 'id.asc',
    limit,
    offset,
    count: limit !== undefined
  })

  const items = (rows || []).map(row => ({
    id: String(row.id),
    slug: row.slug,
    nameZh: row.name_zh,
    nameJa: row.name_ja || undefined,
    nameEn: row.name_en || undefined,
    category: row.category || undefined,
    effectSummary: row.effect_summary || undefined,
    imageUrl: row.image_url || undefined,
    introducedGeneration: row.introduced_generation || undefined
  }))

  if (limit !== undefined) {
    const t = total ?? items.length
    return { data: items, total: t, offset: offset || 0, limit, hasMore: (offset || 0) + items.length < t }
  }
  return { data: items }
}

// ── Item 详情 ──

export async function fetchItemDetail(idOrSlug) {
  const { data: rows } = await query('items', {
    select: '*',
    or: `id.eq.${idOrSlug},slug.eq.${idOrSlug},name_zh.eq.${idOrSlug}`,
    limit: 1
  })
  const row = rows?.[0]
  if (!row) return { data: null }

  const { data: genRows } = await query('item_generation_records', {
    select: '*',
    filters: { item_id: `eq.${row.id}` },
    order: 'generation.asc'
  })

  return {
    data: {
      id: String(row.id),
      slug: row.slug,
      nameZh: row.name_zh,
      nameJa: row.name_ja || undefined,
      nameEn: row.name_en || undefined,
      category: row.category || undefined,
      effectSummary: row.effect_summary || undefined,
      effectDetail: row.effect_detail || undefined,
      introducedGeneration: row.introduced_generation || undefined,
      imageUrl: row.image_url || undefined,
      generations: (genRows || []).map(r => ({
        generation: r.generation,
        gameVersionCode: r.game_version_code || undefined,
        description: r.description || '',
        notes: r.notes || undefined
      }))
    }
  }
}
