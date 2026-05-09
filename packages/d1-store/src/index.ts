/**
 * @pokemon-localdex/d1-store
 *
 * Cloudflare D1 数据访问层。
 * 将 sqlite-store 的同步 DatabaseSync API 改写为 D1 的异步 API，
 * SQL 语句与类型定义完全复用。
 *
 * 使用方式：
 *   import { createD1Store } from "@pokemon-localdex/d1-store";
 *   const store = createD1Store(env.DB);
 *   const list = await store.listPokemon({ query: "皮卡丘" });
 */

// ── Re-export all shared types ──

export type StatBlock = {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
};

export type SourceMeta = {
  url: string;
  title: string;
  fetchedAt: string;
};

export type ImageAsset = {
  url: string;
  alt?: string;
};

export type FormStatVariant = {
  generationStart?: number;
  generationEnd?: number;
  baseStats: StatBlock;
};

export type FormTypeVariant = {
  generationStart?: number;
  generationEnd?: number;
  primaryType?: string;
  secondaryType?: string;
};

export type FormAbilityVariant = {
  generationStart?: number;
  generationEnd?: number;
  abilities: Array<{ nameZh: string; isHidden: boolean; abilityId?: number; description?: string }>;
};

export type PokemonFormEntry = {
  id: number;
  formKey: string;
  nameZh: string;
  formType: string;
  isDefault: boolean;
  sortOrder: number;
  primaryType?: string;
  secondaryType?: string;
  abilities: Array<{ nameZh: string; isHidden: boolean; abilityId?: number; description?: string }>;
  baseStats?: StatBlock;
  images: Record<string, ImageAsset>;
  requiredItem?: { id: string; nameZh: string; slug: string; imageUrl?: string };
  statVariants?: FormStatVariant[];
  typeVariants?: FormTypeVariant[];
  abilityVariants?: FormAbilityVariant[];
};

export type EvolutionStep = {
  fromPokemonId?: number;
  fromNameZh?: string;
  fromFormKey?: string;
  toPokemonId: number;
  toNameZh: string;
  toFormKey?: string;
  stage: number;
  method?: string;
  condition?: string;
  item?: string;
  level?: number;
  toTypes?: string[];
  toImage?: ImageAsset;
};

export type PokemonSummary = {
  id: number;
  dexNumber: number;
  slug: string;
  nameZh: string;
  nameJa?: string;
  nameEn?: string;
  primaryType?: string;
  secondaryType?: string;
  abilities: string[];
  hiddenAbility?: string;
  baseStats?: StatBlock;
  image?: ImageAsset;
  shinyImage?: ImageAsset;
  generations: number[];
};

export type PokemonEntry = PokemonSummary & {
  category?: string;
  heightM?: number;
  weightKg?: number;
  forms: PokemonFormEntry[];
  evolutionChain: EvolutionStep[];
  source?: SourceMeta;
};

export type MoveGenerationRecord = {
  generation: number;
  gameVersionCode?: string;
  gameVersionName?: string;
  versionExclusive?: boolean;
  type?: string;
  category?: string;
  power?: number;
  accuracy?: number;
  pp?: number;
  description: string;
  notes?: string;
};

export type MoveEntry = {
  id: string;
  number?: number;
  nameZh: string;
  nameJa?: string;
  nameEn?: string;
  type?: string;
  category?: string;
  power?: number;
  accuracy?: number;
  pp?: number;
  description?: string;
  effectDetail?: string;
  introducedGeneration?: number;
  generations: MoveGenerationRecord[];
  source?: SourceMeta;
};

export type AbilityGenerationRecord = {
  generation: number;
  gameVersionCode?: string;
  gameVersionName?: string;
  versionExclusive?: boolean;
  description: string;
  notes?: string;
};

export type AbilityEntry = {
  id: string;
  number?: number;
  nameZh: string;
  nameJa?: string;
  nameEn?: string;
  description?: string;
  effectDetail?: string;
  introducedGeneration?: number;
  generations: AbilityGenerationRecord[];
  source?: SourceMeta;
};

export type ItemGenerationRecord = {
  generation: number;
  gameVersionCode?: string;
  gameVersionName?: string;
  versionExclusive?: boolean;
  description: string;
  notes?: string;
};

export type ItemEntry = {
  id: string;
  slug: string;
  nameZh: string;
  nameJa?: string;
  nameEn?: string;
  category?: string;
  effectSummary?: string;
  effectDetail?: string;
  introducedGeneration?: number;
  imageUrl?: string;
  generations: ItemGenerationRecord[];
  source?: SourceMeta;
};

export type LearnsetRecord = {
  moveId?: number;
  moveNameZh: string;
  learnMethod: string;
  level?: number;
  tmNumber?: string;
  moveType?: string;
  moveCategory?: string;
  movePower?: number;
  moveAccuracy?: number;
  movePP?: number;
  moveDescription?: string;
};

export type BattleTeam = {
  id: string;
  name: string;
  format: string;
  members: TeamMember[];
  createdAt: string;
  updatedAt: string;
};

export type TeamMember = {
  slot: number;
  pokemonId: number;
  formKey: string;
  nameZh?: string;
  level: number;
  itemId?: number;
  abilityId?: number;
  nature?: string;
  moves: (number | null)[];
  ivs: Partial<StatBlock>;
  evs: Partial<StatBlock>;
};

export type PaginationParams = { offset?: number; limit?: number };
export type PaginatedResult<T> = { items: T[]; total: number };

// ── D1 type shim ──
// Cloudflare D1 Database binding interface (subset used here)
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  exec(query: string): Promise<D1ExecResult>;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  raw<T = unknown[]>(): Promise<T[]>;
}

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: Record<string, unknown>;
}

export interface D1ExecResult {
  count: number;
  duration: number;
}

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

// ── Helpers ──

function statBlockFromRow(row: Record<string, unknown>): StatBlock | undefined {
  if (row.hp === null || row.hp === undefined) return undefined;
  return {
    hp: Number(row.hp), atk: Number(row.atk), def: Number(row.def),
    spa: Number(row.spa), spd: Number(row.spd), spe: Number(row.spe),
  };
}

function sourceFromRow(row: Record<string, unknown>): SourceMeta | undefined {
  return row.source_url || row.source_title || row.source_fetched_at
    ? {
        url: String(row.source_url ?? ""),
        title: String(row.source_title ?? ""),
        fetchedAt: String(row.source_fetched_at ?? ""),
      }
    : undefined;
}

// ── D1Store class ──

export class D1Store {
  constructor(private readonly db: D1Database) {}

  // ── Pokemon queries ──

  async listPokemon(
    filters?: { query?: string; type?: string | string[]; generation?: number } & PaginationParams
  ): Promise<PaginatedResult<PokemonSummary & { _chainId?: number }> | Array<PokemonSummary & { _chainId?: number }>> {
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (filters?.query) {
      conditions.push(
        "(p.name_zh LIKE ? OR p.name_ja LIKE ? OR p.name_en LIKE ? OR p.slug LIKE ? OR CAST(p.dex_number AS TEXT) LIKE ?)"
      );
      const v = `%${filters.query}%`;
      params.push(v, v, v, v, v);
    }

    if (filters?.type) {
      const types = Array.isArray(filters.type) ? filters.type : [filters.type];
      if (types.length === 1) {
        conditions.push(
          `EXISTS (SELECT 1 FROM pokemon_form_types pft2 WHERE pft2.form_id = pf.id AND pft2.type_name = ?)`
        );
        params.push(types[0]);
      } else if (types.length > 1) {
        const placeholders = types.map(() => "?").join(", ");
        conditions.push(
          `EXISTS (SELECT 1 FROM pokemon_form_types pft2 WHERE pft2.form_id = pf.id AND pft2.type_name IN (${placeholders}))`
        );
        params.push(...types);
      }
    }

    if (filters?.generation) {
      conditions.push(
        `EXISTS (SELECT 1 FROM pokemon_generation_regions pgr WHERE pgr.pokemon_id = p.id AND pgr.generation = ?)`
      );
      params.push(filters.generation);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const usePagination = filters?.limit !== undefined;

    let total = 0;
    if (usePagination) {
      const countResult = await this.db
        .prepare(
          `SELECT COUNT(*) AS cnt FROM pokemon p JOIN pokemon_forms pf ON pf.pokemon_id = p.id AND pf.is_default = 1 ${where}`
        )
        .bind(...params)
        .first<{ cnt: number }>();
      total = Number(countResult?.cnt ?? 0);
    }

    const limitClause = usePagination
      ? `LIMIT ${Number(filters!.limit)} OFFSET ${Number(filters?.offset ?? 0)}`
      : "";

    const { results: rows } = await this.db
      .prepare(
        `SELECT p.id, p.dex_number, p.slug, p.name_zh, p.name_ja, p.name_en,
          pf.id AS form_id,
          pfs.hp, pfs.atk, pfs.def, pfs.spa, pfs.spd, pfs.spe
        FROM pokemon p
        JOIN pokemon_forms pf ON pf.pokemon_id = p.id AND pf.is_default = 1
        LEFT JOIN pokemon_form_stats pfs ON pfs.form_id = pf.id AND pfs.generation_end IS NULL
        ${where}
        ORDER BY p.dex_number ASC
        ${limitClause}`
      )
      .bind(...params)
      .all<Record<string, unknown>>();

    if (rows.length === 0) {
      return usePagination ? { items: [], total } : [];
    }

    const formIds = rows.map((r) => Number(r.form_id));
    const pokemonIds = rows.map((r) => Number(r.id));
    const fPlaceholders = formIds.map(() => "?").join(",");
    const pPlaceholders = pokemonIds.map(() => "?").join(",");

    // 批量查询：属性、特性、图片、世代、进化链
    const [typeResult, abilityResult, imageResult, genResult, evoResult] = await Promise.all([
      this.db
        .prepare(
          `SELECT pft.form_id, pft.type_name, pft.slot FROM pokemon_form_types pft WHERE pft.form_id IN (${fPlaceholders}) ORDER BY pft.form_id, pft.slot`
        )
        .bind(...formIds)
        .all<Record<string, unknown>>(),
      this.db
        .prepare(
          `SELECT pfa.form_id, pfa.ability_name_zh, pfa.is_hidden FROM pokemon_form_abilities pfa WHERE pfa.form_id IN (${fPlaceholders}) ORDER BY pfa.form_id, pfa.slot`
        )
        .bind(...formIds)
        .all<Record<string, unknown>>(),
      this.db
        .prepare(
          `SELECT pfi.form_id, pfi.image_kind, pfi.url, pfi.alt FROM pokemon_form_images pfi WHERE pfi.form_id IN (${fPlaceholders})`
        )
        .bind(...formIds)
        .all<Record<string, unknown>>(),
      this.db
        .prepare(
          `SELECT pgr.pokemon_id, pgr.generation FROM pokemon_generation_regions pgr WHERE pgr.pokemon_id IN (${pPlaceholders}) ORDER BY pgr.pokemon_id, pgr.generation`
        )
        .bind(...pokemonIds)
        .all<Record<string, unknown>>(),
      this.db
        .prepare(
          `SELECT ec.chain_id, ec.to_pokemon_id FROM evolution_chains ec WHERE ec.to_pokemon_id IN (${pPlaceholders})`
        )
        .bind(...pokemonIds)
        .all<Record<string, unknown>>(),
    ]);

    // 构建 Map
    const typeMap = new Map<number, string[]>();
    for (const r of typeResult.results) {
      const fid = Number(r.form_id);
      if (!typeMap.has(fid)) typeMap.set(fid, []);
      typeMap.get(fid)!.push(String(r.type_name));
    }

    const abilityMap = new Map<number, { abilities: string[]; hidden?: string }>();
    for (const r of abilityResult.results) {
      const fid = Number(r.form_id);
      if (!abilityMap.has(fid)) abilityMap.set(fid, { abilities: [] });
      const entry = abilityMap.get(fid)!;
      if (Number(r.is_hidden)) {
        entry.hidden = String(r.ability_name_zh);
      } else {
        entry.abilities.push(String(r.ability_name_zh));
      }
    }

    const imageMap = new Map<number, Record<string, ImageAsset>>();
    for (const r of imageResult.results) {
      const fid = Number(r.form_id);
      if (!imageMap.has(fid)) imageMap.set(fid, {});
      imageMap.get(fid)![String(r.image_kind)] = {
        url: String(r.url),
        alt: r.alt ? String(r.alt) : undefined,
      };
    }

    const genMap = new Map<number, number[]>();
    for (const r of genResult.results) {
      const pid = Number(r.pokemon_id);
      if (!genMap.has(pid)) genMap.set(pid, []);
      const num = Number(r.generation);
      if (!genMap.get(pid)!.includes(num)) genMap.get(pid)!.push(num);
    }

    const chainMap = new Map<number, number>();
    for (const r of evoResult.results) {
      chainMap.set(Number(r.to_pokemon_id), Number(r.chain_id));
    }

    const items = rows.map((row) => {
      const fid = Number(row.form_id);
      const pid = Number(row.id);
      const types = typeMap.get(fid) || [];
      const ab = abilityMap.get(fid) || { abilities: [] };
      const imgs = imageMap.get(fid) || {};
      return {
        id: pid,
        dexNumber: Number(row.dex_number),
        slug: String(row.slug),
        nameZh: String(row.name_zh),
        nameJa: row.name_ja ? String(row.name_ja) : undefined,
        nameEn: row.name_en ? String(row.name_en) : undefined,
        primaryType: types[0],
        secondaryType: types[1],
        abilities: ab.abilities,
        hiddenAbility: ab.hidden,
        baseStats: statBlockFromRow(row),
        image: imgs.official,
        shinyImage: imgs.shiny,
        generations: genMap.get(pid) || [],
        _chainId: chainMap.get(pid),
      } as PokemonSummary & { _chainId?: number };
    });

    return usePagination ? { items, total } : items;
  }

  async getPokemon(idOrSlug: string): Promise<PokemonEntry | undefined> {
    const row = await this.db
      .prepare(
        `SELECT p.* FROM pokemon p WHERE p.id = ? OR p.slug = ? OR p.name_zh = ? OR CAST(p.dex_number AS TEXT) = ? LIMIT 1`
      )
      .bind(idOrSlug, idOrSlug, idOrSlug, idOrSlug)
      .first<Record<string, unknown>>();

    if (!row) return undefined;

    const pokemonId = Number(row.id);

    // 查询所有形态（含绑定道具）
    const { results: formRows } = await this.db
      .prepare(
        `SELECT pf.*, i.id AS req_item_id, i.name_zh AS req_item_name_zh, i.slug AS req_item_slug, i.image_url AS req_item_image_url
        FROM pokemon_forms pf
        LEFT JOIN items i ON i.id = pf.required_item_id
        WHERE pf.pokemon_id = ?
        ORDER BY pf.sort_order ASC`
      )
      .bind(pokemonId)
      .all<Record<string, unknown>>();

    const formIds = formRows.map((f) => Number(f.id));

    if (formIds.length === 0) {
      return {
        id: pokemonId,
        dexNumber: Number(row.dex_number),
        slug: String(row.slug),
        nameZh: String(row.name_zh),
        nameJa: row.name_ja ? String(row.name_ja) : undefined,
        nameEn: row.name_en ? String(row.name_en) : undefined,
        primaryType: undefined,
        secondaryType: undefined,
        abilities: [],
        generations: [],
        forms: [],
        evolutionChain: [],
        source: sourceFromRow(row),
      };
    }

    const fPlaceholders = formIds.map(() => "?").join(",");

    // 并行批量查询形态详情
    const [fsResult, ftResult, faResult, fiResult, chainResult, genResult] = await Promise.all([
      this.db
        .prepare(
          `SELECT pfs.form_id, pfs.generation_start, pfs.generation_end, pfs.hp, pfs.atk, pfs.def, pfs.spa, pfs.spd, pfs.spe
          FROM pokemon_form_stats pfs WHERE pfs.form_id IN (${fPlaceholders}) ORDER BY pfs.form_id, pfs.generation_start ASC`
        )
        .bind(...formIds)
        .all<Record<string, unknown>>(),
      this.db
        .prepare(
          `SELECT pft.form_id, pft.type_name, pft.slot, pft.generation_start, pft.generation_end
          FROM pokemon_form_types pft WHERE pft.form_id IN (${fPlaceholders}) ORDER BY pft.form_id, pft.generation_start ASC, pft.slot`
        )
        .bind(...formIds)
        .all<Record<string, unknown>>(),
      this.db
        .prepare(
          `SELECT pfa.form_id, pfa.ability_name_zh, pfa.is_hidden, pfa.slot, pfa.generation_start, pfa.generation_end,
            a.id AS ability_id, a.description AS ability_description
          FROM pokemon_form_abilities pfa
          LEFT JOIN abilities a ON a.id = pfa.ability_id
          WHERE pfa.form_id IN (${fPlaceholders}) ORDER BY pfa.form_id, pfa.generation_start ASC, pfa.slot`
        )
        .bind(...formIds)
        .all<Record<string, unknown>>(),
      this.db
        .prepare(
          `SELECT pfi.form_id, pfi.image_kind, pfi.url, pfi.alt FROM pokemon_form_images pfi WHERE pfi.form_id IN (${fPlaceholders})`
        )
        .bind(...formIds)
        .all<Record<string, unknown>>(),
      this.db
        .prepare(`SELECT chain_id FROM evolution_chains WHERE to_pokemon_id = ? LIMIT 1`)
        .bind(pokemonId)
        .first<{ chain_id: number }>(),
      this.db
        .prepare(
          `SELECT pgr.generation FROM pokemon_generation_regions pgr WHERE pgr.pokemon_id = ? ORDER BY pgr.generation`
        )
        .bind(pokemonId)
        .all<{ generation: number }>(),
    ]);

    // 构建形态种族值 Map
    const fsMap = new Map<number, Array<{ genStart?: number; genEnd?: number; stats: StatBlock }>>();
    for (const r of fsResult.results) {
      const fid = Number(r.form_id);
      if (!fsMap.has(fid)) fsMap.set(fid, []);
      fsMap.get(fid)!.push({
        genStart: r.generation_start != null ? Number(r.generation_start) : undefined,
        genEnd: r.generation_end != null ? Number(r.generation_end) : undefined,
        stats: statBlockFromRow(r)!,
      });
    }

    // 构建形态属性 Map（按世代分组）
    const ftMap = new Map<number, Array<{ genStart?: number; genEnd?: number; types: string[] }>>();
    for (const r of ftResult.results) {
      const fid = Number(r.form_id);
      const genStart = r.generation_start != null ? Number(r.generation_start) : undefined;
      const genEnd = r.generation_end != null ? Number(r.generation_end) : undefined;
      if (!ftMap.has(fid)) ftMap.set(fid, []);
      const arr = ftMap.get(fid)!;
      let group = arr.find((g) => g.genStart === genStart && g.genEnd === genEnd);
      if (!group) {
        group = { genStart, genEnd, types: [] };
        arr.push(group);
      }
      group.types.push(String(r.type_name));
    }

    // 构建形态特性 Map（按世代分组）
    const faMap = new Map<
      number,
      Array<{
        genStart?: number;
        genEnd?: number;
        abilities: Array<{ nameZh: string; isHidden: boolean; abilityId?: number; description?: string }>;
      }>
    >();
    for (const r of faResult.results) {
      const fid = Number(r.form_id);
      const genStart = r.generation_start != null ? Number(r.generation_start) : undefined;
      const genEnd = r.generation_end != null ? Number(r.generation_end) : undefined;
      if (!faMap.has(fid)) faMap.set(fid, []);
      const arr = faMap.get(fid)!;
      let group = arr.find((g) => g.genStart === genStart && g.genEnd === genEnd);
      if (!group) {
        group = { genStart, genEnd, abilities: [] };
        arr.push(group);
      }
      group.abilities.push({
        nameZh: String(r.ability_name_zh),
        isHidden: Boolean(Number(r.is_hidden)),
        abilityId: r.ability_id != null ? Number(r.ability_id) : undefined,
        description: r.ability_description ? String(r.ability_description) : undefined,
      });
    }

    // 构建形态图片 Map
    const fiMap = new Map<number, Record<string, ImageAsset>>();
    for (const r of fiResult.results) {
      const fid = Number(r.form_id);
      if (!fiMap.has(fid)) fiMap.set(fid, {});
      fiMap.get(fid)![String(r.image_kind)] = {
        url: String(r.url),
        alt: r.alt ? String(r.alt) : undefined,
      };
    }

    // 组装形态列表
    const forms: PokemonFormEntry[] = formRows.map((f) => {
      const fid = Number(f.id);
      const statEntries = fsMap.get(fid) || [];
      const latestStat = statEntries.find((s) => s.genEnd === undefined) || statEntries[0];
      const typeEntries = ftMap.get(fid) || [];
      const latestType = typeEntries.find((t) => t.genEnd === undefined) || typeEntries[0];
      const abilityEntries = faMap.get(fid) || [];
      const latestAbility = abilityEntries.find((a) => a.genEnd === undefined) || abilityEntries[0];

      const entry: PokemonFormEntry = {
        id: fid,
        formKey: String(f.form_key),
        nameZh: String(f.name_zh),
        formType: String(f.form_type),
        isDefault: Boolean(Number(f.is_default)),
        sortOrder: Number(f.sort_order),
        primaryType: latestType?.types[0],
        secondaryType: latestType?.types[1],
        abilities: latestAbility?.abilities || [],
        baseStats: latestStat?.stats,
        images: fiMap.get(fid) || {},
      };

      if (f.req_item_id) {
        entry.requiredItem = {
          id: String(f.req_item_id),
          nameZh: String(f.req_item_name_zh),
          slug: String(f.req_item_slug),
          imageUrl: f.req_item_image_url ? String(f.req_item_image_url) : undefined,
        };
      }

      if (statEntries.length > 1) {
        entry.statVariants = statEntries.map((s) => ({
          generationStart: s.genStart,
          generationEnd: s.genEnd,
          baseStats: s.stats,
        }));
      }
      if (typeEntries.length > 1) {
        entry.typeVariants = typeEntries.map((t) => ({
          generationStart: t.genStart,
          generationEnd: t.genEnd,
          primaryType: t.types[0],
          secondaryType: t.types[1],
        }));
      }
      if (abilityEntries.length > 1) {
        entry.abilityVariants = abilityEntries.map((a) => ({
          generationStart: a.genStart,
          generationEnd: a.genEnd,
          abilities: a.abilities,
        }));
      }

      return entry;
    });

    // 进化链
    let evolutionChain: EvolutionStep[] = [];
    if (chainResult) {
      const chainId = Number(chainResult.chain_id);
      const { results: evoRows } = await this.db
        .prepare(
          `SELECT ec.*,
            pf.name_zh AS from_name, pt.name_zh AS to_name,
            fi_to.url AS to_image_url, fi_to.alt AS to_image_alt
          FROM evolution_chains ec
          LEFT JOIN pokemon pf ON pf.id = ec.from_pokemon_id
          LEFT JOIN pokemon pt ON pt.id = ec.to_pokemon_id
          LEFT JOIN pokemon_forms pf_to ON pf_to.pokemon_id = ec.to_pokemon_id AND pf_to.is_default = 1
          LEFT JOIN pokemon_form_images fi_to ON fi_to.form_id = pf_to.id AND fi_to.image_kind = 'official'
          WHERE ec.chain_id = ?
          ORDER BY ec.sort_order ASC`
        )
        .bind(chainId)
        .all<Record<string, unknown>>();

      // 批量获取进化链中所有 to_pokemon 的属性
      const toPokemonIds = [...new Set(evoRows.map((e) => Number(e.to_pokemon_id)))];
      const tpPlaceholders = toPokemonIds.map(() => "?").join(",");

      const { results: evoTypeRows } = toPokemonIds.length
        ? await this.db
            .prepare(
              `SELECT pf.pokemon_id, pft.type_name
              FROM pokemon_forms pf
              JOIN pokemon_form_types pft ON pft.form_id = pf.id
              WHERE pf.pokemon_id IN (${tpPlaceholders}) AND pf.is_default = 1
              ORDER BY pf.pokemon_id, pft.slot`
            )
            .bind(...toPokemonIds)
            .all<Record<string, unknown>>()
        : { results: [] };

      const evoTypeMap = new Map<number, string[]>();
      for (const r of evoTypeRows) {
        const pid = Number(r.pokemon_id);
        if (!evoTypeMap.has(pid)) evoTypeMap.set(pid, []);
        evoTypeMap.get(pid)!.push(String(r.type_name));
      }

      evolutionChain = evoRows.map((e) => ({
        fromPokemonId: e.from_pokemon_id ? Number(e.from_pokemon_id) : undefined,
        fromNameZh: e.from_name ? String(e.from_name) : undefined,
        fromFormKey: e.from_form_key ? String(e.from_form_key) : undefined,
        toPokemonId: Number(e.to_pokemon_id),
        toNameZh: String(e.to_name),
        toFormKey: e.to_form_key ? String(e.to_form_key) : undefined,
        stage: Number(e.stage),
        method: e.evolution_method ? String(e.evolution_method) : undefined,
        condition: e.evolution_condition ? String(e.evolution_condition) : undefined,
        item: e.evolution_item ? String(e.evolution_item) : undefined,
        level: e.evolution_level != null ? Number(e.evolution_level) : undefined,
        toTypes: evoTypeMap.get(Number(e.to_pokemon_id)) || [],
        toImage: e.to_image_url
          ? { url: String(e.to_image_url), alt: e.to_image_alt ? String(e.to_image_alt) : undefined }
          : undefined,
      }));
    }

    const generations = [...new Set(genResult.results.map((r) => Number(r.generation)))];
    const defaultForm = forms.find((f) => f.isDefault) || forms[0];

    return {
      id: pokemonId,
      dexNumber: Number(row.dex_number),
      slug: String(row.slug),
      nameZh: String(row.name_zh),
      nameJa: row.name_ja ? String(row.name_ja) : undefined,
      nameEn: row.name_en ? String(row.name_en) : undefined,
      primaryType: defaultForm?.primaryType,
      secondaryType: defaultForm?.secondaryType,
      abilities: defaultForm?.abilities.filter((a) => !a.isHidden).map((a) => a.nameZh) || [],
      hiddenAbility: defaultForm?.abilities.find((a) => a.isHidden)?.nameZh,
      baseStats: defaultForm?.baseStats,
      image: defaultForm?.images.official,
      shinyImage: defaultForm?.images.shiny,
      generations,
      category: row.category ? String(row.category) : undefined,
      heightM: row.height_m != null ? Number(row.height_m) : undefined,
      weightKg: row.weight_kg != null ? Number(row.weight_kg) : undefined,
      forms,
      evolutionChain,
      source: sourceFromRow(row),
    };
  }

  async getLearnsetMeta(pokemonId: number) {
    const [genResult, formResult, versionResult] = await Promise.all([
      this.db
        .prepare(`SELECT DISTINCT generation FROM pokemon_learnsets WHERE pokemon_id = ? ORDER BY generation`)
        .bind(pokemonId)
        .all<{ generation: number }>(),
      this.db
        .prepare(`SELECT DISTINCT form_key FROM pokemon_learnsets WHERE pokemon_id = ? ORDER BY form_key`)
        .bind(pokemonId)
        .all<{ form_key: string }>(),
      this.db
        .prepare(
          `SELECT DISTINCT generation, game_version_code FROM pokemon_learnsets WHERE pokemon_id = ? AND game_version_code IS NOT NULL AND game_version_code != '' ORDER BY generation, game_version_code`
        )
        .bind(pokemonId)
        .all<{ generation: number; game_version_code: string }>(),
    ]);

    const versionsByGen: Record<number, Array<{ code: string; name: string }>> = {};
    for (const r of versionResult.results) {
      const gen = Number(r.generation);
      const code = String(r.game_version_code);
      if (!versionsByGen[gen]) versionsByGen[gen] = [];
      versionsByGen[gen].push({ code, name: GAME_VERSION_NAMES.get(code) || code });
    }

    return {
      generations: genResult.results.map((r) => Number(r.generation)),
      formKeys: formResult.results.map((r) => String(r.form_key)),
      versionsByGen,
    };
  }

  async getPokemonLearnset(
    pokemonId: number,
    generation: number,
    formKey = "default",
    gameVersionCode?: string
  ) {
    const versionCondition =
      gameVersionCode !== undefined
        ? gameVersionCode === ""
          ? "AND (pl.game_version_code IS NULL OR pl.game_version_code = '')"
          : "AND pl.game_version_code = ?"
        : "";
    const versionParams =
      gameVersionCode !== undefined && gameVersionCode !== "" ? [gameVersionCode] : [];

    const queryLearnset = async (pid: number, gen: number, fk: string) => {
      const { results } = await this.db
        .prepare(
          `SELECT pl.move_name_zh, pl.learn_method, pl.level, pl.tm_number, pl.notes,
            pl.game_version_code,
            m.type_name, m.category AS move_category,
            m.power AS move_power, m.accuracy AS move_accuracy, m.pp AS move_pp, m.id AS move_id,
            m.description AS move_description
          FROM pokemon_learnsets pl
          LEFT JOIN moves m ON m.id = pl.move_id
          WHERE pl.pokemon_id = ? AND pl.generation = ? AND pl.form_key = ?
          ${versionCondition}
          ORDER BY pl.learn_method, pl.sort_order`
        )
        .bind(pid, gen, fk, ...versionParams)
        .all<Record<string, unknown>>();
      return results;
    };

    let rows = await queryLearnset(pokemonId, generation, formKey);
    let usedFormKey = formKey;

    if (rows.length === 0 && formKey !== "default") {
      rows = await queryLearnset(pokemonId, generation, "default");
      if (rows.length > 0) usedFormKey = "default";
    }

    if (rows.length === 0) {
      const firstForm = await this.db
        .prepare(
          `SELECT DISTINCT form_key FROM pokemon_learnsets WHERE pokemon_id = ? AND generation = ? LIMIT 1`
        )
        .bind(pokemonId, generation)
        .first<{ form_key: string }>();
      if (firstForm) {
        const fallbackKey = String(firstForm.form_key);
        rows = await queryLearnset(pokemonId, generation, fallbackKey);
        if (rows.length > 0) usedFormKey = fallbackKey;
      }
    }

    return {
      formKey: usedFormKey,
      gameVersionCode: gameVersionCode ?? null,
      moves: rows.map((r) => ({
        moveId: r.move_id != null ? Number(r.move_id) : undefined,
        moveNameZh: String(r.move_name_zh),
        learnMethod: String(r.learn_method),
        level: r.level != null ? Number(r.level) : undefined,
        tmNumber: r.tm_number ? String(r.tm_number) : undefined,
        moveType: r.type_name ? String(r.type_name) : undefined,
        moveCategory: r.move_category ? String(r.move_category) : undefined,
        movePower: r.move_power != null ? Number(r.move_power) : undefined,
        moveAccuracy: r.move_accuracy != null ? Number(r.move_accuracy) : undefined,
        movePP: r.move_pp != null ? Number(r.move_pp) : undefined,
        moveDescription: r.move_description ? String(r.move_description) : undefined,
      } as LearnsetRecord)),
    };
  }

  // ── Move queries ──

  private async hydrateMoveRow(row: Record<string, unknown>): Promise<MoveEntry> {
    const { results: generations } = await this.db
      .prepare(
        `SELECT mgr.* FROM move_generation_records mgr WHERE mgr.move_id = ? ORDER BY mgr.generation ASC`
      )
      .bind(String(row.id))
      .all<Record<string, unknown>>();

    return {
      id: String(row.id),
      number: row.number != null ? Number(row.number) : undefined,
      nameZh: String(row.name_zh),
      nameJa: row.name_ja ? String(row.name_ja) : undefined,
      nameEn: row.name_en ? String(row.name_en) : undefined,
      type: row.type_name ? String(row.type_name) : undefined,
      category: row.category ? String(row.category) : undefined,
      power: row.power != null ? Number(row.power) : undefined,
      accuracy: row.accuracy != null ? Number(row.accuracy) : undefined,
      pp: row.pp != null ? Number(row.pp) : undefined,
      description: row.description ? String(row.description) : undefined,
      effectDetail: row.effect_detail ? String(row.effect_detail) : undefined,
      introducedGeneration: row.introduced_generation != null ? Number(row.introduced_generation) : undefined,
      generations: generations.map((g) => {
        const code = g.game_version_code ? String(g.game_version_code) : undefined;
        return {
          generation: Number(g.generation),
          gameVersionCode: code,
          gameVersionName: code ? GAME_VERSION_NAMES.get(code) : undefined,
          versionExclusive: g.version_exclusive === 1,
          description: g.description ? String(g.description) : "",
          notes: g.notes ? String(g.notes) : undefined,
        };
      }),
      source: sourceFromRow(row),
    };
  }

  async listMoves(
    filters?: { query?: string; type?: string; category?: string; generation?: number } & PaginationParams
  ): Promise<PaginatedResult<MoveEntry> | MoveEntry[]> {
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (filters?.query) {
      conditions.push(
        "(m.name_zh LIKE ? OR m.name_ja LIKE ? OR m.name_en LIKE ? OR CAST(m.id AS TEXT) LIKE ?)"
      );
      const v = `%${filters.query}%`;
      params.push(v, v, v, v);
    }
    if (filters?.type) {
      conditions.push("m.type_name = ?");
      params.push(filters.type);
    }
    if (filters?.category) {
      conditions.push("m.category = ?");
      params.push(filters.category);
    }
    if (filters?.generation) {
      conditions.push(
        "EXISTS (SELECT 1 FROM move_generation_records mgr WHERE mgr.move_id = m.id AND mgr.generation = ?)"
      );
      params.push(filters.generation);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const usePagination = filters?.limit !== undefined;

    let total = 0;
    if (usePagination) {
      const countResult = await this.db
        .prepare(`SELECT COUNT(*) AS cnt FROM moves m ${where}`)
        .bind(...params)
        .first<{ cnt: number }>();
      total = Number(countResult?.cnt ?? 0);
    }

    const limitClause = usePagination
      ? `LIMIT ${Number(filters!.limit)} OFFSET ${Number(filters?.offset ?? 0)}`
      : "";

    const { results: rows } = await this.db
      .prepare(`SELECT m.* FROM moves m ${where} ORDER BY m.name_zh ASC ${limitClause}`)
      .bind(...params)
      .all<Record<string, unknown>>();

    const items = await Promise.all(rows.map((r) => this.hydrateMoveRow(r)));
    return usePagination ? { items, total } : items;
  }

  async getMove(idOrSlug: string): Promise<MoveEntry | undefined> {
    const row = await this.db
      .prepare(`SELECT m.* FROM moves m WHERE m.id = ? OR m.name_zh = ? LIMIT 1`)
      .bind(idOrSlug, idOrSlug)
      .first<Record<string, unknown>>();
    return row ? this.hydrateMoveRow(row) : undefined;
  }

  // ── Ability queries ──

  private async hydrateAbilityRow(row: Record<string, unknown>): Promise<AbilityEntry> {
    const { results: generations } = await this.db
      .prepare(
        `SELECT agr.* FROM ability_generation_records agr WHERE agr.ability_id = ? ORDER BY agr.generation ASC`
      )
      .bind(String(row.id))
      .all<Record<string, unknown>>();

    return {
      id: String(row.id),
      number: row.number != null ? Number(row.number) : undefined,
      nameZh: String(row.name_zh),
      nameJa: row.name_ja ? String(row.name_ja) : undefined,
      nameEn: row.name_en ? String(row.name_en) : undefined,
      description: row.description ? String(row.description) : undefined,
      effectDetail: row.effect_detail ? String(row.effect_detail) : undefined,
      introducedGeneration: row.introduced_generation != null ? Number(row.introduced_generation) : undefined,
      generations: generations.map((g) => {
        const code = g.game_version_code ? String(g.game_version_code) : undefined;
        return {
          generation: Number(g.generation),
          gameVersionCode: code,
          gameVersionName: code ? GAME_VERSION_NAMES.get(code) : undefined,
          versionExclusive: g.version_exclusive === 1,
          description: g.description ? String(g.description) : "",
          notes: g.notes ? String(g.notes) : undefined,
        };
      }),
      source: sourceFromRow(row),
    };
  }

  async listAbilities(
    filters?: { query?: string; generation?: number } & PaginationParams
  ): Promise<PaginatedResult<AbilityEntry> | AbilityEntry[]> {
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (filters?.query) {
      conditions.push("(a.name_zh LIKE ? OR a.name_ja LIKE ? OR a.name_en LIKE ?)");
      const v = `%${filters.query}%`;
      params.push(v, v, v);
    }
    if (filters?.generation) {
      conditions.push(
        "EXISTS (SELECT 1 FROM ability_generation_records agr WHERE agr.ability_id = a.id AND agr.generation = ?)"
      );
      params.push(filters.generation);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const usePagination = filters?.limit !== undefined;

    let total = 0;
    if (usePagination) {
      const countResult = await this.db
        .prepare(`SELECT COUNT(*) AS cnt FROM abilities a ${where}`)
        .bind(...params)
        .first<{ cnt: number }>();
      total = Number(countResult?.cnt ?? 0);
    }

    const limitClause = usePagination
      ? `LIMIT ${Number(filters!.limit)} OFFSET ${Number(filters?.offset ?? 0)}`
      : "";

    const { results: rows } = await this.db
      .prepare(
        `SELECT a.* FROM abilities a ${where} ORDER BY a.number ASC, a.name_zh ASC ${limitClause}`
      )
      .bind(...params)
      .all<Record<string, unknown>>();

    const items = await Promise.all(rows.map((r) => this.hydrateAbilityRow(r)));
    return usePagination ? { items, total } : items;
  }

  async getAbility(idOrName: string): Promise<AbilityEntry | undefined> {
    const row = await this.db
      .prepare(`SELECT a.* FROM abilities a WHERE a.id = ? OR a.name_zh = ? LIMIT 1`)
      .bind(idOrName, idOrName)
      .first<Record<string, unknown>>();
    return row ? this.hydrateAbilityRow(row) : undefined;
  }

  // ── Item queries ──

  private async hydrateItemRow(row: Record<string, unknown>): Promise<ItemEntry> {
    const { results: genRows } = await this.db
      .prepare(
        `SELECT generation, game_version_code, description, notes, version_exclusive FROM item_generation_records WHERE item_id = ? ORDER BY generation ASC`
      )
      .bind(Number(row.id))
      .all<Record<string, unknown>>();

    return {
      id: String(row.id),
      slug: String(row.slug),
      nameZh: String(row.name_zh),
      nameJa: row.name_ja ? String(row.name_ja) : undefined,
      nameEn: row.name_en ? String(row.name_en) : undefined,
      category: row.category ? String(row.category) : undefined,
      effectSummary: row.effect_summary ? String(row.effect_summary) : undefined,
      effectDetail: row.effect_detail ? String(row.effect_detail) : undefined,
      introducedGeneration: row.introduced_generation ? Number(row.introduced_generation) : undefined,
      imageUrl: row.image_url ? String(row.image_url) : undefined,
      generations: genRows.map((r) => {
        const code = r.game_version_code ? String(r.game_version_code) : undefined;
        return {
          generation: Number(r.generation),
          gameVersionCode: code,
          gameVersionName: code ? GAME_VERSION_NAMES.get(code) : undefined,
          versionExclusive: r.version_exclusive === 1,
          description: String(r.description ?? ""),
          notes: r.notes ? String(r.notes) : undefined,
        };
      }),
      source: sourceFromRow(row),
    };
  }

  async listItems(
    filters?: { query?: string; category?: string } & PaginationParams
  ): Promise<PaginatedResult<ItemEntry> | ItemEntry[]> {
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (filters?.query) {
      conditions.push(
        "(name_zh LIKE ? OR name_ja LIKE ? OR name_en LIKE ? OR slug LIKE ? OR effect_summary LIKE ?)"
      );
      const v = `%${filters.query}%`;
      params.push(v, v, v, v, v);
    }
    if (filters?.category) {
      conditions.push("category = ?");
      params.push(filters.category);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const usePagination = filters?.limit !== undefined;

    let total = 0;
    if (usePagination) {
      const countResult = await this.db
        .prepare(`SELECT COUNT(*) AS cnt FROM items ${where}`)
        .bind(...params)
        .first<{ cnt: number }>();
      total = Number(countResult?.cnt ?? 0);
    }

    const limitClause = usePagination
      ? `LIMIT ${Number(filters!.limit)} OFFSET ${Number(filters?.offset ?? 0)}`
      : "";

    const { results: rows } = await this.db
      .prepare(`SELECT * FROM items ${where} ORDER BY id ASC ${limitClause}`)
      .bind(...params)
      .all<Record<string, unknown>>();

    const items = await Promise.all(rows.map((r) => this.hydrateItemRow(r)));
    return usePagination ? { items, total } : items;
  }

  async getItem(idOrSlug: string): Promise<ItemEntry | undefined> {
    const row = await this.db
      .prepare(`SELECT * FROM items WHERE id = ? OR slug = ? OR name_zh = ? LIMIT 1`)
      .bind(idOrSlug, idOrSlug, idOrSlug)
      .first<Record<string, unknown>>();
    return row ? this.hydrateItemRow(row) : undefined;
  }

  // ── Teams (D1 backed) ──

  async listTeams(): Promise<BattleTeam[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM battle_teams ORDER BY created_at DESC`)
      .all<Record<string, unknown>>();
    return results.map(this.rowToTeam);
  }

  async saveTeam(input: Partial<BattleTeam>): Promise<BattleTeam> {
    const now = new Date().toISOString();
    const id = input.id ?? `team_${Date.now()}`;
    const name = input.name ?? "未命名队伍";
    const format = input.format ?? "singles";
    const members = JSON.stringify(input.members ?? []);
    const createdAt = input.createdAt ?? now;

    // UPSERT
    await this.db
      .prepare(
        `INSERT INTO battle_teams (id, name, format, members_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          format = excluded.format,
          members_json = excluded.members_json,
          updated_at = excluded.updated_at`
      )
      .bind(id, name, format, members, createdAt, now)
      .run();

    return { id, name, format, members: input.members ?? [], createdAt, updatedAt: now };
  }

  async deleteTeam(id: string): Promise<void> {
    await this.db.prepare(`DELETE FROM battle_teams WHERE id = ?`).bind(id).run();
  }

  private rowToTeam(row: Record<string, unknown>): BattleTeam {
    return {
      id: String(row.id),
      name: String(row.name),
      format: String(row.format),
      members: JSON.parse(String(row.members_json || "[]")),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }
}

/**
 * 工厂函数：创建 D1Store 实例。
 * 在 Workers 入口中使用：
 *   const store = createD1Store(env.DB);
 */
export function createD1Store(db: D1Database): D1Store {
  return new D1Store(db);
}
