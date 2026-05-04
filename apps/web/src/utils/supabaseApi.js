/**
 * Supabase 直连 API —— 前端直接查询 Supabase，绕过 Hono API。
 *
 * 每个函数的返回格式与 Hono API 的 JSON 响应保持一致，
 * 这样 useApi / useInfiniteApi 等 hook 无需修改。
 */

import { getSupabase } from "./supabase.js";

const GAME_VERSION_NAMES = new Map([
  ["RG", "红/绿"], ["B", "蓝"], ["Y", "黄"],
  ["GS", "金/银"], ["C", "水晶"],
  ["RS", "红宝石/蓝宝石"], ["E", "绿宝石"], ["FRLG", "火红/叶绿"],
  ["DP", "钻石/珍珠"], ["Pt", "白金"], ["HGSS", "心金/魂银"],
  ["BW", "黑/白"], ["B2W2", "黑2/白2"],
  ["XY", "X/Y"], ["ORAS", "欧米伽红宝石/阿尔法蓝宝石"],
  ["SM", "太阳/月亮"], ["USUM", "究极之日/究极之月"], ["LPLE", "Let's Go 皮卡丘/伊布"],
  ["SWSH", "剑/盾"], ["SWSHE", "剑/盾 铠之孤岛+冠之雪原"], ["BDSP", "晶灿钻石/明亮珍珠"], ["LA", "传说 阿尔宙斯"],
  ["SV", "朱/紫"], ["SVT", "朱/紫 零之秘宝"], ["ZA", "传说 Z-A"],
  ["CHAMP", "冠军"],
]);

// ── Pokemon ──

export async function fetchPokemonList({ query, type, generation, limit, offset } = {}) {
  const sb = getSupabase();
  const usePagination = limit !== undefined;

  let q = sb
    .from("pokemon")
    .select([
      "id, dex_number, slug, name_zh, name_ja, name_en",
      "pokemon_forms!inner ( id, pokemon_form_stats ( hp, atk, def, spa, spd, spe, generation_end ), pokemon_form_types ( type_name, slot ), pokemon_form_abilities ( ability_name_zh, is_hidden, slot ), pokemon_form_images ( image_kind, url, alt ) )",
      "pokemon_generation_regions ( generation )",
      "evolution_chains!evolution_chains_to_pokemon_id_fkey ( chain_id )"
    ].join(", "), { count: usePagination ? "exact" : undefined })
    .eq("pokemon_forms.is_default", 1)
    .order("dex_number", { ascending: true });

  if (query) {
    q = q.or("name_zh.ilike.%" + query + "%,name_ja.ilike.%" + query + "%,name_en.ilike.%" + query + "%,slug.ilike.%" + query + "%");
  }

  if (usePagination) {
    q = q.range(offset || 0, (offset || 0) + limit - 1);
  }

  const { data: rows, count, error } = await q;
  if (error) throw error;

  let filtered = rows || [];

  if (type) {
    const types = Array.isArray(type) ? type : [type];
    filtered = filtered.filter((row) => {
      const formTypes = row.pokemon_forms?.[0]?.pokemon_form_types?.map((t) => t.type_name) || [];
      return types.some((t) => formTypes.includes(t));
    });
  }

  if (generation) {
    filtered = filtered.filter((row) => {
      const gens = row.pokemon_generation_regions?.map((g) => g.generation) || [];
      return gens.includes(Number(generation));
    });
  }

  const items = filtered.map(mapPokemonRow);

  if (usePagination) {
    const total = count ?? items.length;
    return { data: items, total, offset: offset || 0, limit, hasMore: (offset || 0) + items.length < total };
  }
  return { data: items };
}

function mapPokemonRow(row) {
  const form = row.pokemon_forms?.[0];
  const typeRows = (form?.pokemon_form_types || []).sort((a, b) => a.slot - b.slot);
  const types = typeRows.map((t) => t.type_name);
  const abilityRows = (form?.pokemon_form_abilities || []).sort((a, b) => a.slot - b.slot);
  const abilities = abilityRows.filter((a) => !a.is_hidden).map((a) => a.ability_name_zh);
  const hidden = abilityRows.find((a) => a.is_hidden)?.ability_name_zh;

  const statRows = form?.pokemon_form_stats || [];
  const latestStat = statRows.find((s) => s.generation_end === null) || statRows[0];

  const imageRows = form?.pokemon_form_images || [];
  const officialImg = imageRows.find((i) => i.image_kind === "official");
  const shinyImg = imageRows.find((i) => i.image_kind === "shiny");

  const genRegions = row.pokemon_generation_regions || [];
  const generations = [...new Set(genRegions.map((g) => g.generation))].sort((a, b) => a - b);

  return {
    id: row.id,
    dexNumber: row.dex_number,
    slug: row.slug,
    nameZh: row.name_zh,
    nameJa: row.name_ja || undefined,
    nameEn: row.name_en || undefined,
    primaryType: types[0],
    secondaryType: types[1],
    abilities,
    hiddenAbility: hidden,
    baseStats: latestStat ? {
      hp: latestStat.hp, atk: latestStat.atk, def: latestStat.def,
      spa: latestStat.spa, spd: latestStat.spd, spe: latestStat.spe,
    } : undefined,
    image: officialImg ? { url: officialImg.url, alt: officialImg.alt || undefined } : undefined,
    shinyImage: shinyImg ? { url: shinyImg.url, alt: shinyImg.alt || undefined } : undefined,
    generations,
    _chainId: row.evolution_chains?.[0]?.chain_id,
  };
}

// ── Pokemon Detail ──

export async function fetchPokemonDetail(idOrSlug) {
  const sb = getSupabase();
  const numId = isNaN(Number(idOrSlug)) ? 0 : Number(idOrSlug);
  const { data: pokemonRow } = await sb
    .from("pokemon")
    .select("*")
    .or("id.eq." + numId + ",slug.eq." + idOrSlug + ",name_zh.eq." + idOrSlug + ",dex_number.eq." + numId)
    .limit(1)
    .single();

  if (!pokemonRow) return { data: null };
  const pokemonId = pokemonRow.id;

  // 获取所有形态及其子数据
  const { data: formRows } = await sb
    .from("pokemon_forms")
    .select([
      "id, form_key, name_zh, form_type, is_default, sort_order",
      "pokemon_form_stats ( generation_start, generation_end, hp, atk, def, spa, spd, spe )",
      "pokemon_form_types ( type_name, slot, generation_start, generation_end )",
      "pokemon_form_abilities ( ability_name_zh, is_hidden, slot, ability_id, generation_start, generation_end )",
      "pokemon_form_images ( image_kind, url, alt )"
    ].join(", "))
    .eq("pokemon_id", pokemonId)
    .order("sort_order", { ascending: true });

  // 获取进化链
  const { data: chainRef } = await sb
    .from("evolution_chains")
    .select("chain_id")
    .eq("to_pokemon_id", pokemonId)
    .limit(1);

  let evolutionChain = [];
  if (chainRef && chainRef.length > 0) {
    const chainId = chainRef[0].chain_id;
    const { data: evoRows } = await sb
      .from("evolution_chains")
      .select("*")
      .eq("chain_id", chainId)
      .order("sort_order", { ascending: true });

    if (evoRows) {
      evolutionChain = await Promise.all(evoRows.map(async (e) => {
        let fromNameZh;
        if (e.from_pokemon_id) {
          const { data: fp } = await sb.from("pokemon").select("name_zh").eq("id", e.from_pokemon_id).single();
          fromNameZh = fp?.name_zh;
        }
        const { data: tp } = await sb.from("pokemon").select("name_zh").eq("id", e.to_pokemon_id).single();

        const { data: toForm } = await sb
          .from("pokemon_forms").select("id")
          .eq("pokemon_id", e.to_pokemon_id).eq("is_default", 1).limit(1).single();

        let toImage;
        let toTypes = [];
        if (toForm) {
          const { data: imgRow } = await sb
            .from("pokemon_form_images").select("url, alt")
            .eq("form_id", toForm.id).eq("image_kind", "official").limit(1).single();
          if (imgRow) toImage = { url: imgRow.url, alt: imgRow.alt || undefined };

          const { data: typeRows } = await sb
            .from("pokemon_form_types").select("type_name")
            .eq("form_id", toForm.id).order("slot", { ascending: true });
          toTypes = (typeRows || []).map((t) => t.type_name);
        }

        return {
          fromPokemonId: e.from_pokemon_id || undefined,
          fromNameZh,
          fromFormKey: e.from_form_key || undefined,
          toPokemonId: e.to_pokemon_id,
          toNameZh: tp?.name_zh || "",
          toFormKey: e.to_form_key || undefined,
          stage: e.stage,
          method: e.evolution_method || undefined,
          condition: e.evolution_condition || undefined,
          item: e.evolution_item || undefined,
          level: e.evolution_level ?? undefined,
          toTypes,
          toImage,
        };
      }));
    }
  }

  // 世代可用性
  const { data: genRows } = await sb
    .from("pokemon_generation_regions").select("generation")
    .eq("pokemon_id", pokemonId).order("generation", { ascending: true });
  const generations = [...new Set((genRows || []).map((r) => r.generation))];

  // 组装形态
  const forms = (formRows || []).map((f) => {
    const statEntries = (f.pokemon_form_stats || []).sort((a, b) => (a.generation_start ?? 0) - (b.generation_start ?? 0));
    const typeEntries = (f.pokemon_form_types || []).sort((a, b) => (a.generation_start ?? 0) - (b.generation_start ?? 0));
    const abilityEntries = (f.pokemon_form_abilities || []).sort((a, b) => (a.generation_start ?? 0) - (b.generation_start ?? 0));
    const imageEntries = f.pokemon_form_images || [];

    const latestStat = statEntries.find((s) => s.generation_end === null) || statEntries[0];
    const latestTypes = typeEntries.filter((t) => t.generation_end === null);
    const typesSorted = (latestTypes.length > 0 ? latestTypes : typeEntries).sort((a, b) => a.slot - b.slot);
    const latestAbilities = abilityEntries.filter((a) => a.generation_end === null);
    const abilitiesSorted = (latestAbilities.length > 0 ? latestAbilities : abilityEntries).sort((a, b) => a.slot - b.slot);

    const images = {};
    for (const img of imageEntries) {
      images[img.image_kind] = { url: img.url, alt: img.alt || undefined };
    }

    const entry = {
      formKey: f.form_key,
      nameZh: f.name_zh,
      formType: f.form_type,
      isDefault: Boolean(f.is_default),
      sortOrder: f.sort_order,
      primaryType: typesSorted[0]?.type_name,
      secondaryType: typesSorted[1]?.type_name,
      abilities: abilitiesSorted.map((a) => ({
        nameZh: a.ability_name_zh,
        isHidden: Boolean(a.is_hidden),
        abilityId: a.ability_id || undefined,
        description: undefined,
      })),
      baseStats: latestStat ? {
        hp: latestStat.hp, atk: latestStat.atk, def: latestStat.def,
        spa: latestStat.spa, spd: latestStat.spd, spe: latestStat.spe,
      } : undefined,
      images,
    };

    if (statEntries.length > 1) {
      entry.statVariants = statEntries.map((s) => ({
        generationStart: s.generation_start ?? undefined,
        generationEnd: s.generation_end ?? undefined,
        baseStats: { hp: s.hp, atk: s.atk, def: s.def, spa: s.spa, spd: s.spd, spe: s.spe },
      }));
    }

    return entry;
  });

  const defaultForm = forms.find((f) => f.isDefault) || forms[0];

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
      abilities: defaultForm?.abilities.filter((a) => !a.isHidden).map((a) => a.nameZh) || [],
      hiddenAbility: defaultForm?.abilities.find((a) => a.isHidden)?.nameZh,
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
        url: pokemonRow.source_url, title: pokemonRow.source_title || "", fetchedAt: pokemonRow.source_fetched_at || "",
      } : undefined,
    }
  };
}

// ── Pokemon Learnset ──

export async function fetchLearnsetMeta(pokemonId) {
  const sb = getSupabase();

  const { data: genRows } = await sb
    .from("pokemon_learnsets").select("generation")
    .eq("pokemon_id", pokemonId);
  const generations = [...new Set((genRows || []).map((r) => r.generation))].sort((a, b) => a - b);

  const { data: formRows } = await sb
    .from("pokemon_learnsets").select("form_key")
    .eq("pokemon_id", pokemonId);
  const formKeys = [...new Set((formRows || []).map((r) => r.form_key))].sort();

  const { data: versionRows } = await sb
    .from("pokemon_learnsets")
    .select("generation, game_version_code")
    .eq("pokemon_id", pokemonId)
    .not("game_version_code", "is", null)
    .neq("game_version_code", "");

  const versionsByGen = {};
  for (const r of (versionRows || [])) {
    const gen = r.generation;
    const code = r.game_version_code;
    if (!versionsByGen[gen]) versionsByGen[gen] = [];
    if (!versionsByGen[gen].find((v) => v.code === code)) {
      versionsByGen[gen].push({ code, name: GAME_VERSION_NAMES.get(code) || code });
    }
  }

  return { data: { generations, formKeys, versionsByGen }, pokemonId };
}

export async function fetchPokemonLearnset(pokemonId, generation, formKey = "default", gameVersionCode) {
  const sb = getSupabase();

  async function queryLearnset(pid, gen, fk) {
    let q = sb
      .from("pokemon_learnsets")
      .select([
        "move_name_zh, learn_method, level, tm_number, notes, game_version_code, move_id",
        "moves!left ( type_name, category, power, accuracy, pp, description )"
      ].join(", "))
      .eq("pokemon_id", pid)
      .eq("generation", gen)
      .eq("form_key", fk)
      .order("learn_method", { ascending: true })
      .order("sort_order", { ascending: true });

    if (gameVersionCode !== undefined) {
      if (gameVersionCode === "") {
        q = q.or("game_version_code.is.null,game_version_code.eq.");
      } else {
        q = q.eq("game_version_code", gameVersionCode);
      }
    }

    const { data } = await q;
    return data || [];
  }

  let rows = await queryLearnset(pokemonId, generation, formKey);
  let usedFormKey = formKey;

  if (rows.length === 0 && formKey !== "default") {
    rows = await queryLearnset(pokemonId, generation, "default");
    if (rows.length > 0) usedFormKey = "default";
  }

  if (rows.length === 0) {
    const { data: firstForm } = await sb
      .from("pokemon_learnsets").select("form_key")
      .eq("pokemon_id", pokemonId).eq("generation", generation).limit(1);
    if (firstForm && firstForm.length > 0) {
      const fallbackKey = firstForm[0].form_key;
      rows = await queryLearnset(pokemonId, generation, fallbackKey);
      if (rows.length > 0) usedFormKey = fallbackKey;
    }
  }

  const moves = rows.map((r) => {
    const m = r.moves;
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
      moveDescription: m?.description || undefined,
    };
  });

  return {
    data: moves,
    pokemonId,
    generation,
    formKey: usedFormKey,
    gameVersionCode: gameVersionCode ?? null,
  };
}

// ── Ability Detail ──

export async function fetchAbilityDetail(idOrSlug) {
  const sb = getSupabase();
  const numId = Number(idOrSlug);
  const orFilters = [];
  if (!isNaN(numId) && Number.isInteger(numId)) orFilters.push("id.eq." + numId);
  orFilters.push("name_zh.eq." + idOrSlug);
  const { data: row, error } = await sb
    .from("abilities")
    .select("*")
    .or(orFilters.join(","))
    .limit(1)
    .single();
  if (error || !row) return { data: null };

  const { data: genRows } = await sb
    .from("ability_generation_records")
    .select("*")
    .eq("ability_id", row.id)
    .order("generation", { ascending: true });

  return {
    data: {
      id: String(row.id), number: row.number ?? undefined,
      nameZh: row.name_zh, nameJa: row.name_ja || undefined, nameEn: row.name_en || undefined,
      description: row.description || undefined, effectDetail: row.effect_detail || undefined,
      introducedGeneration: row.introduced_generation ?? undefined,
      generations: (genRows || []).map((g) => ({
        generation: g.generation,
        gameVersionCode: g.game_version_code || undefined,
        gameVersionName: g.game_version_code ? GAME_VERSION_NAMES.get(g.game_version_code) : undefined,
        description: g.description || "", notes: g.notes || undefined,
      })),
    }
  };
}

// ── Move Detail ──

export async function fetchMoveDetail(idOrSlug) {
  const sb = getSupabase();
  const numId = Number(idOrSlug);
  const orFilters = [];
  if (!isNaN(numId) && Number.isInteger(numId)) orFilters.push("id.eq." + numId);
  orFilters.push("name_zh.eq." + idOrSlug);
  const { data: row, error } = await sb
    .from("moves")
    .select("*")
    .or(orFilters.join(","))
    .limit(1)
    .single();
  if (error || !row) return { data: null };

  const { data: genRows } = await sb
    .from("move_generation_records")
    .select("*")
    .eq("move_id", row.id)
    .order("generation", { ascending: true });

  return {
    data: {
      id: String(row.id), number: row.number ?? undefined,
      nameZh: row.name_zh, nameJa: row.name_ja || undefined, nameEn: row.name_en || undefined,
      type: row.type_name || undefined, category: row.category || undefined,
      power: row.power ?? undefined, accuracy: row.accuracy ?? undefined, pp: row.pp ?? undefined,
      description: row.description || undefined, effectDetail: row.effect_detail || undefined,
      introducedGeneration: row.introduced_generation ?? undefined,
      generations: (genRows || []).map((g) => ({
        generation: g.generation,
        gameVersionCode: g.game_version_code || undefined,
        gameVersionName: g.game_version_code ? GAME_VERSION_NAMES.get(g.game_version_code) : undefined,
        description: g.description || "", notes: g.notes || undefined,
      })),
    }
  };
}

// ── Items ──

export async function fetchItemsList({ query, category, limit, offset } = {}) {
  const sb = getSupabase();
  const usePagination = limit !== undefined;

  let q = sb.from("items").select("*", { count: usePagination ? "exact" : undefined })
    .order("id", { ascending: true });

  if (query) {
    q = q.or("name_zh.ilike.%" + query + "%,name_ja.ilike.%" + query + "%,name_en.ilike.%" + query + "%,slug.ilike.%" + query + "%,effect_summary.ilike.%" + query + "%");
  }
  if (category) q = q.eq("category", category);

  if (usePagination) {
    q = q.range(offset || 0, (offset || 0) + limit - 1);
  }

  const { data: rows, count, error } = await q;
  if (error) throw error;

  const items = await Promise.all((rows || []).map(async (row) => {
    const { data: genRows } = await sb
      .from("item_generation_records")
      .select("*")
      .eq("item_id", row.id)
      .order("generation", { ascending: true });

    return {
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
      generations: (genRows || []).map((r) => ({
        generation: r.generation,
        gameVersionCode: r.game_version_code || undefined,
        description: r.description || "",
        notes: r.notes || undefined,
      })),
    };
  }));

  if (usePagination) {
    const total = count ?? items.length;
    return { data: items, total, offset: offset || 0, limit, hasMore: (offset || 0) + items.length < total };
  }
  return { data: items };
}

export async function fetchItemDetail(idOrSlug) {
  const sb = getSupabase();
  const numId = Number(idOrSlug);
  const orFilters = [];
  if (!isNaN(numId) && Number.isInteger(numId)) orFilters.push("id.eq." + numId);
  orFilters.push("slug.eq." + idOrSlug, "name_zh.eq." + idOrSlug);
  const { data: row, error } = await sb
    .from("items")
    .select("*")
    .or(orFilters.join(","))
    .limit(1)
    .single();
  if (error || !row) return { data: null };

  const { data: genRows } = await sb
    .from("item_generation_records")
    .select("*")
    .eq("item_id", row.id)
    .order("generation", { ascending: true });

  return {
    data: {
      id: String(row.id), slug: row.slug, nameZh: row.name_zh,
      nameJa: row.name_ja || undefined, nameEn: row.name_en || undefined,
      category: row.category || undefined,
      effectSummary: row.effect_summary || undefined,
      effectDetail: row.effect_detail || undefined,
      introducedGeneration: row.introduced_generation || undefined,
      imageUrl: row.image_url || undefined,
      generations: (genRows || []).map((r) => ({
        generation: r.generation, gameVersionCode: r.game_version_code || undefined,
        description: r.description || "", notes: r.notes || undefined,
      })),
    }
  };
}

// ── Moves ──

export async function fetchMovesList({ query, type, category, generation, limit, offset } = {}) {
  const sb = getSupabase();
  const usePagination = limit !== undefined;

  let q = sb.from("moves").select("*", { count: usePagination ? "exact" : undefined })
    .order("name_zh", { ascending: true });

  if (query) {
    q = q.or("name_zh.ilike.%" + query + "%,name_ja.ilike.%" + query + "%,name_en.ilike.%" + query + "%");
  }
  if (type) q = q.eq("type_name", type);
  if (category) q = q.eq("category", category);

  if (usePagination) {
    q = q.range(offset || 0, (offset || 0) + limit - 1);
  }

  const { data: rows, count, error } = await q;
  if (error) throw error;

  const items = await Promise.all((rows || []).map(async (row) => {
    const { data: genRows } = await sb
      .from("move_generation_records")
      .select("*")
      .eq("move_id", row.id)
      .order("generation", { ascending: true });

    return {
      id: String(row.id), number: row.number ?? undefined,
      nameZh: row.name_zh, nameJa: row.name_ja || undefined, nameEn: row.name_en || undefined,
      type: row.type_name || undefined, category: row.category || undefined,
      power: row.power ?? undefined, accuracy: row.accuracy ?? undefined, pp: row.pp ?? undefined,
      description: row.description || undefined, effectDetail: row.effect_detail || undefined,
      introducedGeneration: row.introduced_generation ?? undefined,
      generations: (genRows || []).map((g) => ({
        generation: g.generation,
        gameVersionCode: g.game_version_code || undefined,
        gameVersionName: g.game_version_code ? GAME_VERSION_NAMES.get(g.game_version_code) : undefined,
        description: g.description || "", notes: g.notes || undefined,
      })),
    };
  }));

  if (usePagination) {
    const total = count ?? items.length;
    return { data: items, total, offset: offset || 0, limit, hasMore: (offset || 0) + items.length < total };
  }
  return { data: items };
}

// ── Abilities ──

export async function fetchAbilitiesList({ query, generation, limit, offset } = {}) {
  const sb = getSupabase();
  const usePagination = limit !== undefined;

  let q = sb.from("abilities").select("*", { count: usePagination ? "exact" : undefined })
    .order("number", { ascending: true })
    .order("name_zh", { ascending: true });

  if (query) {
    q = q.or("name_zh.ilike.%" + query + "%,name_ja.ilike.%" + query + "%,name_en.ilike.%" + query + "%");
  }

  if (usePagination) {
    q = q.range(offset || 0, (offset || 0) + limit - 1);
  }

  const { data: rows, count, error } = await q;
  if (error) throw error;

  const items = await Promise.all((rows || []).map(async (row) => {
    const { data: genRows } = await sb
      .from("ability_generation_records")
      .select("*")
      .eq("ability_id", row.id)
      .order("generation", { ascending: true });

    return {
      id: String(row.id), number: row.number ?? undefined,
      nameZh: row.name_zh, nameJa: row.name_ja || undefined, nameEn: row.name_en || undefined,
      description: row.description || undefined, effectDetail: row.effect_detail || undefined,
      introducedGeneration: row.introduced_generation ?? undefined,
      generations: (genRows || []).map((g) => ({
        generation: g.generation,
        gameVersionCode: g.game_version_code || undefined,
        gameVersionName: g.game_version_code ? GAME_VERSION_NAMES.get(g.game_version_code) : undefined,
        description: g.description || "", notes: g.notes || undefined,
      })),
    };
  }));

  if (usePagination) {
    const total = count ?? items.length;
    return { data: items, total, offset: offset || 0, limit, hasMore: (offset || 0) + items.length < total };
  }
  return { data: items };
}
