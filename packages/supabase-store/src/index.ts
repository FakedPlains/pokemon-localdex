/**
 * Supabase 数据访问层 —— 与 sqlite-store 导出相同的类型和函数签名，
 * 但底层使用 Supabase (PostgreSQL) 作为数据源。
 *
 * 环境变量：
 *   SUPABASE_URL      — Supabase 项目 URL
 *   SUPABASE_ANON_KEY — Supabase anon/public key
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ── Re-export shared types (与 sqlite-store 保持一致) ──

export type StatBlock = {
  hp: number; atk: number; def: number;
  spa: number; spd: number; spe: number;
};

export type SourceMeta = { url: string; title: string; fetchedAt: string };
export type ImageAsset = { url: string; alt?: string };

export type FormStatVariant = {
  generationStart?: number; generationEnd?: number; baseStats: StatBlock;
};
export type FormTypeVariant = {
  generationStart?: number; generationEnd?: number;
  primaryType?: string; secondaryType?: string;
};
export type FormAbilityVariant = {
  generationStart?: number; generationEnd?: number;
  abilities: Array<{ nameZh: string; isHidden: boolean; abilityId?: number; description?: string }>;
};

export type PokemonFormEntry = {
  formKey: string; nameZh: string; formType: string;
  isDefault: boolean; sortOrder: number;
  primaryType?: string; secondaryType?: string;
  abilities: Array<{ nameZh: string; isHidden: boolean; abilityId?: number; description?: string }>;
  baseStats?: StatBlock;
  images: Record<string, ImageAsset>;
  statVariants?: FormStatVariant[];
  typeVariants?: FormTypeVariant[];
  abilityVariants?: FormAbilityVariant[];
};

export type EvolutionStep = {
  fromPokemonId?: number; fromNameZh?: string; fromFormKey?: string;
  toPokemonId: number; toNameZh: string; toFormKey?: string;
  stage: number; method?: string; condition?: string;
  item?: string; level?: number; toTypes?: string[]; toImage?: ImageAsset;
};

export type PokemonSummary = {
  id: number; dexNumber: number; slug: string;
  nameZh: string; nameJa?: string; nameEn?: string;
  primaryType?: string; secondaryType?: string;
  abilities: string[]; hiddenAbility?: string;
  baseStats?: StatBlock; image?: ImageAsset; shinyImage?: ImageAsset;
  generations: number[];
};

export type PokemonEntry = PokemonSummary & {
  category?: string; heightM?: number; weightKg?: number;
  forms: PokemonFormEntry[]; evolutionChain: EvolutionStep[];
  source?: SourceMeta;
};

export type MoveGenerationRecord = {
  generation: number; gameVersionCode?: string; gameVersionName?: string;
  description: string; notes?: string;
};

export type MoveEntry = {
  id: string; number?: number; nameZh: string; nameJa?: string; nameEn?: string;
  type?: string; category?: string; power?: number; accuracy?: number; pp?: number;
  description?: string; effectDetail?: string; introducedGeneration?: number;
  generations: MoveGenerationRecord[]; source?: SourceMeta;
};

export type AbilityGenerationRecord = {
  generation: number; gameVersionCode?: string; gameVersionName?: string;
  description: string; notes?: string;
};

export type AbilityEntry = {
  id: string; number?: number; nameZh: string; nameJa?: string; nameEn?: string;
  description?: string; effectDetail?: string; introducedGeneration?: number;
  generations: AbilityGenerationRecord[]; source?: SourceMeta;
};

export type ItemGenerationRecord = {
  generation: number; gameVersionCode?: string; description: string; notes?: string;
};

export type ItemEntry = {
  id: string; slug: string; nameZh: string; nameJa?: string; nameEn?: string;
  category?: string; effectSummary?: string; effectDetail?: string;
  introducedGeneration?: number; imageUrl?: string;
  generations: ItemGenerationRecord[]; source?: SourceMeta;
};

export type LearnsetRecord = {
  moveId?: number; moveNameZh: string; learnMethod: string;
  level?: number; tmNumber?: string; moveType?: string;
  moveCategory?: string; movePower?: number; moveAccuracy?: number;
  movePP?: number; moveDescription?: string;
};

export type TeamMember = {
  slot: number; pokemonId: number; formKey: string; nameZh?: string;
  level: number; itemId?: number; abilityId?: number; nature?: string;
  moves: (number | null)[]; ivs: Partial<StatBlock>; evs: Partial<StatBlock>;
};

export type BattleTeam = {
  id: string; name: string; format: string;
  members: TeamMember[]; createdAt: string; updatedAt: string;
};

export type PaginationParams = { offset?: number; limit?: number };
export type PaginatedResult<T> = { items: T[]; total: number };

// ── Constants ──

const GAME_VERSIONS: Array<[string, string, number]> = [
  ["RG", "红/绿", 1], ["B", "蓝", 1], ["Y", "黄", 1],
  ["GS", "金/银", 2], ["C", "水晶", 2],
  ["RS", "红宝石/蓝宝石", 3], ["E", "绿宝石", 3], ["FRLG", "火红/叶绿", 3],
  ["DP", "钻石/珍珠", 4], ["Pt", "白金", 4], ["HGSS", "心金/魂银", 4],
  ["BW", "黑/白", 5], ["B2W2", "黑2/白2", 5],
  ["XY", "X/Y", 6], ["ORAS", "欧米伽红宝石/阿尔法蓝宝石", 6],
  ["SM", "太阳/月亮", 7], ["USUM", "究极之日/究极之月", 7], ["LPLE", "Let's Go 皮卡丘/伊布", 7],
  ["SWSH", "剑/盾", 8], ["SWSHE", "剑/盾 铠之孤岛+冠之雪原", 8], ["BDSP", "晶灿钻石/明亮珍珠", 8], ["LA", "传说 阿尔宙斯", 8],
  ["SV", "朱/紫", 9], ["SVT", "朱/紫 零之秘宝", 9], ["ZA", "传说 Z-A", 9],
  ["CHAMP", "冠军", 99],
];

const GAME_VERSION_NAMES = new Map<string, string>(
  GAME_VERSIONS.map(([code, nameZh]) => [code, nameZh])
);

// ── Supabase client singleton ──

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  // 服务端优先使用 SERVICE_ROLE_KEY（绕过 RLS），回退到 ANON_KEY（前端/公开读）
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY environment variables. " +
      "Please set them in .env or environment."
    );
  }
  _client = createClient(url, key);
  return _client;
}

/** 允许外部注入 client（用于前端直连场景） */
export function setSupabaseClient(client: SupabaseClient) {
  _client = client;
}

export function getSupabaseClient(): SupabaseClient {
  return getClient();
}

// ── Helper functions ──

function sourceFromRow(row: Record<string, unknown>): SourceMeta | undefined {
  return row.source_url || row.source_title || row.source_fetched_at
    ? { url: String(row.source_url ?? ""), title: String(row.source_title ?? ""), fetchedAt: String(row.source_fetched_at ?? "") }
    : undefined;
}

// ── Pokemon queries ──

export async function listPokemonFromSupabase(
  filters?: { query?: string; type?: string | string[]; generation?: number } & PaginationParams
): Promise<PaginatedResult<PokemonSummary & { _chainId?: number }> | Array<PokemonSummary & { _chainId?: number }>> {
  const sb = getClient();
  const usePagination = filters?.limit !== undefined;

  // 基础查询：pokemon + 默认形态 + 子表
  let query = sb
    .from("pokemon")
    .select([
      "id, dex_number, slug, name_zh, name_ja, name_en",
      "pokemon_forms!inner ( id, pokemon_form_stats ( hp, atk, def, spa, spd, spe, generation_end ), pokemon_form_types ( type_name, slot ), pokemon_form_abilities ( ability_name_zh, is_hidden, slot ), pokemon_form_images ( image_kind, url, alt ) )",
      "pokemon_generation_regions ( generation )",
      "evolution_chains!evolution_chains_to_pokemon_id_fkey ( chain_id )"
    ].join(", "), { count: usePagination ? "exact" : undefined })
    .eq("pokemon_forms.is_default", 1)
    .order("dex_number", { ascending: true });

  if (filters?.query) {
    const q = filters.query;
    query = query.or("name_zh.ilike.%" + q + "%,name_ja.ilike.%" + q + "%,name_en.ilike.%" + q + "%,slug.ilike.%" + q + "%");
  }

  if (usePagination) {
    const offset = filters?.offset ?? 0;
    const limit = filters!.limit!;
    query = query.range(offset, offset + limit - 1);
  }

  const { data: rows, count, error } = await query;
  if (error) throw error;
  if (!rows || rows.length === 0) {
    return usePagination ? { items: [], total: 0 } : [];
  }

  let filtered = rows as any[];

  // 属性筛选（应用层过滤）
  if (filters?.type) {
    const types = Array.isArray(filters.type) ? filters.type : [filters.type];
    filtered = filtered.filter((row: any) => {
      const formTypes = row.pokemon_forms?.[0]?.pokemon_form_types?.map((t: any) => t.type_name) || [];
      return types.some((t: string) => formTypes.includes(t));
    });
  }

  // 世代筛选
  if (filters?.generation) {
    const gen = filters.generation;
    filtered = filtered.filter((row: any) => {
      const gens = row.pokemon_generation_regions?.map((g: any) => g.generation) || [];
      return gens.includes(gen);
    });
  }

  const items = filtered.map((row: any) => {
    const form = row.pokemon_forms?.[0];
    const typeRows = (form?.pokemon_form_types || []).sort((a: any, b: any) => a.slot - b.slot);
    const types = typeRows.map((t: any) => t.type_name);
    const abilityRows = (form?.pokemon_form_abilities || []).sort((a: any, b: any) => a.slot - b.slot);
    const abilitiesNormal = abilityRows.filter((a: any) => !a.is_hidden).map((a: any) => a.ability_name_zh);
    const hidden = abilityRows.find((a: any) => a.is_hidden)?.ability_name_zh;

    const statRows = form?.pokemon_form_stats || [];
    const latestStat = statRows.find((s: any) => s.generation_end === null) || statRows[0];

    const imageRows = form?.pokemon_form_images || [];
    const officialImg = imageRows.find((i: any) => i.image_kind === "official");
    const shinyImg = imageRows.find((i: any) => i.image_kind === "shiny");

    const genRegions = row.pokemon_generation_regions || [];
    const generations = [...new Set(genRegions.map((g: any) => g.generation as number))].sort((a: number, b: number) => a - b);

    const chainRow = row.evolution_chains?.[0];

    return {
      id: row.id,
      dexNumber: row.dex_number,
      slug: row.slug,
      nameZh: row.name_zh,
      nameJa: row.name_ja || undefined,
      nameEn: row.name_en || undefined,
      primaryType: types[0],
      secondaryType: types[1],
      abilities: abilitiesNormal,
      hiddenAbility: hidden,
      baseStats: latestStat ? {
        hp: latestStat.hp, atk: latestStat.atk, def: latestStat.def,
        spa: latestStat.spa, spd: latestStat.spd, spe: latestStat.spe,
      } : undefined,
      image: officialImg ? { url: officialImg.url, alt: officialImg.alt || undefined } : undefined,
      shinyImage: shinyImg ? { url: shinyImg.url, alt: shinyImg.alt || undefined } : undefined,
      generations,
      _chainId: chainRow?.chain_id,
    } as PokemonSummary & { _chainId?: number };
  });

  if (usePagination) {
    return { items, total: count ?? items.length };
  }
  return items;
}

export async function getPokemonFromSupabase(idOrSlug: string): Promise<PokemonEntry | undefined> {
  const sb = getClient();

  // 查找 pokemon 主记录
  const numId = isNaN(Number(idOrSlug)) ? 0 : Number(idOrSlug);
  const { data: pokemonRow } = await sb
    .from("pokemon")
    .select("*")
    .or("id.eq." + numId + ",slug.eq." + idOrSlug + ",name_zh.eq." + idOrSlug + ",dex_number.eq." + numId)
    .limit(1)
    .single();

  if (!pokemonRow) return undefined;
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

  let evolutionChain: EvolutionStep[] = [];
  if (chainRef && chainRef.length > 0) {
    const chainId = chainRef[0].chain_id;
    const { data: evoRows } = await sb
      .from("evolution_chains")
      .select("*")
      .eq("chain_id", chainId)
      .order("sort_order", { ascending: true });

    if (evoRows) {
      evolutionChain = await Promise.all(evoRows.map(async (e: any) => {
        let fromNameZh: string | undefined;
        if (e.from_pokemon_id) {
          const { data: fp } = await sb.from("pokemon").select("name_zh").eq("id", e.from_pokemon_id).single();
          fromNameZh = fp?.name_zh;
        }
        const { data: tp } = await sb.from("pokemon").select("name_zh").eq("id", e.to_pokemon_id).single();

        const { data: toForm } = await sb
          .from("pokemon_forms")
          .select("id")
          .eq("pokemon_id", e.to_pokemon_id)
          .eq("is_default", 1)
          .limit(1)
          .single();

        let toImage: ImageAsset | undefined;
        let toTypes: string[] = [];
        if (toForm) {
          const { data: imgRow } = await sb
            .from("pokemon_form_images")
            .select("url, alt")
            .eq("form_id", toForm.id)
            .eq("image_kind", "official")
            .limit(1)
            .single();
          if (imgRow) toImage = { url: imgRow.url, alt: imgRow.alt || undefined };

          const { data: typeRows } = await sb
            .from("pokemon_form_types")
            .select("type_name")
            .eq("form_id", toForm.id)
            .order("slot", { ascending: true });
          toTypes = (typeRows || []).map((t: any) => t.type_name);
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
        } as EvolutionStep;
      }));
    }
  }

  // 世代可用性
  const { data: genRows } = await sb
    .from("pokemon_generation_regions")
    .select("generation")
    .eq("pokemon_id", pokemonId)
    .order("generation", { ascending: true });
  const generations = [...new Set((genRows || []).map((r: any) => r.generation as number))];

  // 组装形态
  const forms: PokemonFormEntry[] = (formRows || []).map((f: any) => {
    const statEntries = (f.pokemon_form_stats || []).sort((a: any, b: any) => (a.generation_start ?? 0) - (b.generation_start ?? 0));
    const typeEntries = (f.pokemon_form_types || []).sort((a: any, b: any) => (a.generation_start ?? 0) - (b.generation_start ?? 0));
    const abilityEntries = (f.pokemon_form_abilities || []).sort((a: any, b: any) => (a.generation_start ?? 0) - (b.generation_start ?? 0));
    const imageEntries = f.pokemon_form_images || [];

    const latestStat = statEntries.find((s: any) => s.generation_end === null) || statEntries[0];
    const latestTypes = typeEntries.filter((t: any) => t.generation_end === null);
    const typesSorted = (latestTypes.length > 0 ? latestTypes : typeEntries).sort((a: any, b: any) => a.slot - b.slot);
    const latestAbilities = abilityEntries.filter((a: any) => a.generation_end === null);
    const abilitiesSorted = (latestAbilities.length > 0 ? latestAbilities : abilityEntries).sort((a: any, b: any) => a.slot - b.slot);

    const images: Record<string, ImageAsset> = {};
    for (const img of imageEntries) {
      images[img.image_kind] = { url: img.url, alt: img.alt || undefined };
    }

    const entry: PokemonFormEntry = {
      formKey: f.form_key,
      nameZh: f.name_zh,
      formType: f.form_type,
      isDefault: Boolean(f.is_default),
      sortOrder: f.sort_order,
      primaryType: typesSorted[0]?.type_name,
      secondaryType: typesSorted[1]?.type_name,
      abilities: abilitiesSorted.map((a: any) => ({
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
      entry.statVariants = statEntries.map((s: any) => ({
        generationStart: s.generation_start ?? undefined,
        generationEnd: s.generation_end ?? undefined,
        baseStats: { hp: s.hp, atk: s.atk, def: s.def, spa: s.spa, spd: s.spd, spe: s.spe },
      }));
    }

    return entry;
  });

  const defaultForm = forms.find((f) => f.isDefault) || forms[0];

  return {
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
    source: sourceFromRow(pokemonRow),
  };
}

// ── Learnset queries ──

export async function getLearnsetMeta(pokemonId: number) {
  const sb = getClient();

  const { data: genRows } = await sb
    .from("pokemon_learnsets").select("generation")
    .eq("pokemon_id", pokemonId);
  const generations = [...new Set((genRows || []).map((r: any) => r.generation as number))].sort((a, b) => a - b);

  const { data: formRows } = await sb
    .from("pokemon_learnsets").select("form_key")
    .eq("pokemon_id", pokemonId);
  const formKeys = [...new Set((formRows || []).map((r: any) => r.form_key as string))].sort();

  const { data: versionRows } = await sb
    .from("pokemon_learnsets")
    .select("generation, game_version_code")
    .eq("pokemon_id", pokemonId)
    .not("game_version_code", "is", null)
    .neq("game_version_code", "");

  const versionsByGen: Record<number, Array<{ code: string; name: string }>> = {};
  for (const r of (versionRows || []) as any[]) {
    const gen = r.generation;
    const code = r.game_version_code;
    if (!versionsByGen[gen]) versionsByGen[gen] = [];
    if (!versionsByGen[gen].find((v: any) => v.code === code)) {
      versionsByGen[gen].push({ code, name: GAME_VERSION_NAMES.get(code) || code });
    }
  }

  return { generations, formKeys, versionsByGen };
}

export async function getPokemonLearnset(
  pokemonId: number, generation: number, formKey = "default", gameVersionCode?: string
) {
  const sb = getClient();

  async function queryLearnset(pid: number, gen: number, fk: string) {
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
      .from("pokemon_learnsets")
      .select("form_key")
      .eq("pokemon_id", pokemonId)
      .eq("generation", generation)
      .limit(1);
    if (firstForm && firstForm.length > 0) {
      const fallbackKey = firstForm[0].form_key;
      rows = await queryLearnset(pokemonId, generation, fallbackKey);
      if (rows.length > 0) usedFormKey = fallbackKey;
    }
  }

  return {
    formKey: usedFormKey,
    gameVersionCode: gameVersionCode ?? null,
    moves: rows.map((r: any) => {
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
      } as LearnsetRecord;
    }),
  };
}

// ── Move queries ──

async function hydrateMoveRow(sb: SupabaseClient, row: any): Promise<MoveEntry> {
  const { data: genRows } = await sb
    .from("move_generation_records")
    .select("*")
    .eq("move_id", row.id)
    .order("generation", { ascending: true });

  return {
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
    generations: (genRows || []).map((g: any) => {
      const code = g.game_version_code || undefined;
      return {
        generation: g.generation,
        gameVersionCode: code,
        gameVersionName: code ? GAME_VERSION_NAMES.get(code) : undefined,
        description: g.description || "",
        notes: g.notes || undefined,
      };
    }),
    source: sourceFromRow(row),
  };
}

export async function listMovesFromSupabase(
  filters?: { query?: string; type?: string; category?: string; generation?: number } & PaginationParams
): Promise<PaginatedResult<MoveEntry> | MoveEntry[]> {
  const sb = getClient();
  const usePagination = filters?.limit !== undefined;

  let query = sb.from("moves").select("*", { count: usePagination ? "exact" : undefined })
    .order("name_zh", { ascending: true });

  if (filters?.query) {
    const q = filters.query;
    query = query.or("name_zh.ilike.%" + q + "%,name_ja.ilike.%" + q + "%,name_en.ilike.%" + q + "%");
  }
  if (filters?.type) query = query.eq("type_name", filters.type);
  if (filters?.category) query = query.eq("category", filters.category);

  if (usePagination) {
    const offset = filters?.offset ?? 0;
    const limit = filters!.limit!;
    query = query.range(offset, offset + limit - 1);
  }

  const { data: rows, count, error } = await query;
  if (error) throw error;

  const items = await Promise.all((rows || []).map((r: any) => hydrateMoveRow(sb, r)));

  if (usePagination) {
    return { items, total: count ?? 0 } as PaginatedResult<MoveEntry>;
  }
  return items;
}

export async function getMoveFromSupabase(idOrSlug: string): Promise<MoveEntry | undefined> {
  const sb = getClient();
  const { data: row, error } = await sb
    .from("moves")
    .select("*")
    .or("id.eq." + idOrSlug + ",name_zh.eq." + idOrSlug)
    .limit(1)
    .single();
  if (error || !row) return undefined;
  return hydrateMoveRow(sb, row);
}

// ── Ability queries ──

async function hydrateAbilityRow(sb: SupabaseClient, row: any): Promise<AbilityEntry> {
  const { data: genRows } = await sb
    .from("ability_generation_records")
    .select("*")
    .eq("ability_id", row.id)
    .order("generation", { ascending: true });

  return {
    id: String(row.id),
    number: row.number ?? undefined,
    nameZh: row.name_zh,
    nameJa: row.name_ja ?? undefined,
    nameEn: row.name_en ?? undefined,
    description: row.description ?? undefined,
    effectDetail: row.effect_detail ?? undefined,
    introducedGeneration: row.introduced_generation ?? undefined,
    generations: (genRows || []).map((g: any) => ({
      generation: g.generation,
      gameVersionCode: g.game_version_code ?? undefined,
      gameVersionName: g.game_version_code ? GAME_VERSION_NAMES.get(g.game_version_code) : undefined,
      description: g.description ?? "",
      notes: g.notes ?? undefined,
    })),
    source: sourceFromRow(row),
  };
}

export async function listAbilitiesFromSupabase(
  filters?: { query?: string; generation?: number } & PaginationParams
): Promise<PaginatedResult<AbilityEntry> | AbilityEntry[]> {
  const sb = getClient();
  const usePagination = filters?.limit !== undefined;

  let query = sb.from("abilities").select("*", { count: usePagination ? "exact" : undefined });

  if (filters?.query) {
    const q = filters.query;
    query = query.or("name_zh.ilike.%" + q + "%,name_ja.ilike.%" + q + "%,name_en.ilike.%" + q + "%");
  }

  query = query.order("number", { ascending: true }).order("name_zh", { ascending: true });

  if (usePagination) {
    const offset = filters?.offset ?? 0;
    const limit = filters!.limit!;
    query = query.range(offset, offset + limit - 1);
  }

  const { data: rows, count, error } = await query;
  if (error) throw error;

  const items = await Promise.all((rows || []).map((r: any) => hydrateAbilityRow(sb, r)));

  if (usePagination) {
    return { items, total: count ?? 0 } as PaginatedResult<AbilityEntry>;
  }
  return items;
}

export async function getAbilityFromSupabase(idOrName: string): Promise<AbilityEntry | undefined> {
  const sb = getClient();
  const { data: row, error } = await sb
    .from("abilities")
    .select("*")
    .or("id.eq." + idOrName + ",name_zh.eq." + idOrName)
    .limit(1)
    .single();
  if (error || !row) return undefined;
  return hydrateAbilityRow(sb, row);
}

// ── Item queries ──

async function hydrateItemRow(sb: SupabaseClient, row: any): Promise<ItemEntry> {
  const { data: genRows } = await sb
    .from("item_generation_records")
    .select("*")
    .eq("item_id", row.id)
    .order("generation", { ascending: true });

  return {
    id: String(row.id),
    slug: row.slug,
    nameZh: row.name_zh,
    nameJa: row.name_ja ?? undefined,
    nameEn: row.name_en ?? undefined,
    category: row.category ?? undefined,
    effectSummary: row.effect_summary ?? undefined,
    effectDetail: row.effect_detail ?? undefined,
    introducedGeneration: row.introduced_generation ?? undefined,
    imageUrl: row.image_url ?? undefined,
    generations: (genRows || []).map((r: any) => ({
      generation: r.generation,
      gameVersionCode: r.game_version_code ?? undefined,
      description: r.description ?? "",
      notes: r.notes ?? undefined,
    })),
    source: sourceFromRow(row),
  };
}

export async function listItemsFromSupabase(
  filters?: { query?: string; category?: string } & PaginationParams
): Promise<PaginatedResult<ItemEntry> | ItemEntry[]> {
  const sb = getClient();
  const usePagination = filters?.limit !== undefined;

  let query = sb.from("items").select("*", { count: usePagination ? "exact" : undefined });

  if (filters?.query) {
    const q = filters.query;
    query = query.or("name_zh.ilike.%" + q + "%,name_ja.ilike.%" + q + "%,name_en.ilike.%" + q + "%,slug.ilike.%" + q + "%,effect_summary.ilike.%" + q + "%");
  }
  if (filters?.category) {
    query = query.eq("category", filters.category);
  }

  query = query.order("id", { ascending: true });

  if (usePagination) {
    const offset = filters?.offset ?? 0;
    const limit = filters!.limit!;
    query = query.range(offset, offset + limit - 1);
  }

  const { data: rows, count, error } = await query;
  if (error) throw error;

  const items = await Promise.all((rows || []).map((r: any) => hydrateItemRow(sb, r)));

  if (usePagination) {
    return { items, total: count ?? 0 } as PaginatedResult<ItemEntry>;
  }
  return items;
}

export async function getItemFromSupabase(idOrSlug: string): Promise<ItemEntry | undefined> {
  const sb = getClient();
  const { data: row, error } = await sb
    .from("items")
    .select("*")
    .or("id.eq." + idOrSlug + ",slug.eq." + idOrSlug + ",name_zh.eq." + idOrSlug)
    .limit(1)
    .single();
  if (error || !row) return undefined;
  return hydrateItemRow(sb, row);
}

// ── Utility ──

export async function hasSupabaseData(): Promise<boolean> {
  try {
    const sb = getClient();
    const { count } = await sb.from("pokemon").select("id", { count: "exact", head: true });
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}
