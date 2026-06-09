import { eq, like, and, or, sql, inArray, isNull, asc, desc } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import {
  pokemon,
  pokemonForms,
  pokemonFormAbilities,
  pokemonFormImages,
  pokemonFormStats,
  pokemonFormTypes,
  championsUsagePokemon,
} from "@pokemon-localdex/drizzle-schema";
import type {
  ImageAsset,
  PaginatedResult,
  PaginationParams,
  PokemonCardSummary,
  PokemonListSortKey,
  PokemonTableSummary,
  SortOrder,
} from "@pokemon-localdex/store-types";
import { buildStatBlock } from "./hydration.ts";

export type PokemonListFilters = {
  query?: string;
  type?: string | string[];
  generation?: number;
  championsSeasonId?: number;
  /** 对战格式：single | double，仅在 sort=usage 时生效 */
  battleFormat?: string;
  sort?: PokemonListSortKey;
  order?: SortOrder;
} & PaginationParams;

function buildPokemonListWhere(filters?: PokemonListFilters): SQL | undefined {
  const conditions: SQL[] = [];

  if (filters?.query) {
    const v = `%${filters.query}%`;
    conditions.push(
      or(
        like(pokemon.nameZh, v),
        like(pokemon.nameJa, v),
        like(pokemon.nameEn, v),
        like(sql`CAST(${pokemon.dexNumber} AS TEXT)`, v),
      )!,
    );
  }

  if (filters?.type) {
    const types = Array.isArray(filters.type) ? filters.type : [filters.type];
    if (types.length === 1) {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM pokemon_form_types pft2 WHERE pft2.form_id = ${pokemonForms.id} AND pft2.type_name = ${types[0]})`,
      );
    } else if (types.length > 1) {
      const placeholders = types.map((t) => sql`${t}`);
      conditions.push(
        sql`EXISTS (SELECT 1 FROM pokemon_form_types pft2 WHERE pft2.form_id = ${pokemonForms.id} AND pft2.type_name IN (${sql.join(placeholders, sql`, `)}))`,
      );
    }
  }

  if (filters?.generation) {
    conditions.push(eq(pokemon.introducedGeneration, filters.generation));
  }

  if (filters?.championsSeasonId !== undefined) {
    conditions.push(
      sql`EXISTS (
        SELECT 1
        FROM champions_seasons cs
        INNER JOIN champions_regulation_pokemon crp ON crp.regulation_id = cs.regulation_id
        WHERE cs.id = ${filters.championsSeasonId}
          AND (
            crp.pokemon_id = ${pokemon.id}
            OR (crp.pokemon_id IS NULL AND crp.dex_number = ${pokemon.dexNumber})
          )
      )`,
    );
  }

  return conditions.length ? and(...conditions) : undefined;
}

function pokemonListOrderBy(filters?: PokemonListFilters): SQL[] {
  if (filters?.sort === "speed") {
    return [
      sql`${pokemonFormStats.spe} IS NULL`,
      filters.order === "asc" ? asc(pokemonFormStats.spe) : desc(pokemonFormStats.spe),
      asc(pokemon.dexNumber),
    ];
  }
  return [asc(pokemon.dexNumber)];
}

/**
 * 按使用率排序时的形态级卡片查询。
 * 从 champions_usage_pokemon 出发，JOIN pokemon_forms 获取对应形态的图片/属性/名字。
 * 每条 usage 记录对应一张独立卡片（同物种不同形态分别展示）。
 */
async function listPokemonCardsByUsage(
  db: any,
  filters: PokemonListFilters,
): Promise<PaginatedResult<PokemonCardSummary> | PokemonCardSummary[]> {
  const usePagination = filters.limit !== undefined;
  const seasonId = filters.championsSeasonId!;
  const format = filters.battleFormat || "double";

  // 构建 WHERE 条件（搜索、属性、世代筛选仍然生效）
  const conditions: SQL[] = [
    eq(championsUsagePokemon.seasonId, seasonId),
    eq(championsUsagePokemon.format, format),
    eq(championsUsagePokemon.eventId, ""),
  ];

  if (filters.query) {
    const v = `%${filters.query}%`;
    conditions.push(
      or(
        like(pokemon.nameZh, v),
        like(pokemon.nameJa, v),
        like(pokemon.nameEn, v),
        like(pokemonForms.nameZh, v),
        like(sql`CAST(${pokemon.dexNumber} AS TEXT)`, v),
      )!,
    );
  }

  if (filters.type) {
    const types = Array.isArray(filters.type) ? filters.type : [filters.type];
    if (types.length === 1) {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM pokemon_form_types pft2 WHERE pft2.form_id = ${championsUsagePokemon.formId} AND pft2.type_name = ${types[0]})`,
      );
    } else if (types.length > 1) {
      const placeholders = types.map((t) => sql`${t}`);
      conditions.push(
        sql`EXISTS (SELECT 1 FROM pokemon_form_types pft2 WHERE pft2.form_id = ${championsUsagePokemon.formId} AND pft2.type_name IN (${sql.join(placeholders, sql`, `)}))`,
      );
    }
  }

  if (filters.generation) {
    conditions.push(eq(pokemon.introducedGeneration, filters.generation));
  }

  let query = db
    .select({
      pokemonId: pokemon.id,
      dexNumber: pokemon.dexNumber,
      pokemonNameZh: pokemon.nameZh,
      pokemonNameEn: pokemon.nameEn,
      formId: championsUsagePokemon.formId,
      formType: pokemonForms.formType,
      formNameZh: pokemonForms.nameZh,
      isDefault: pokemonForms.isDefault,
      usageRank: championsUsagePokemon.rank,
    })
    .from(championsUsagePokemon)
    .innerJoin(pokemon, eq(pokemon.id, championsUsagePokemon.pokemonId))
    .innerJoin(pokemonForms, eq(pokemonForms.id, championsUsagePokemon.formId))
    .where(and(...conditions))
    .orderBy(asc(championsUsagePokemon.rank), asc(pokemon.dexNumber));

  if (usePagination) {
    query = query.limit(Number(filters.limit) + 1).offset(Number(filters.offset ?? 0));
  }

  const rows: any[] = await query;
  if (rows.length === 0) return usePagination ? { items: [], hasMore: false } : [];

  const requestedLimit = Number(filters.limit ?? 0);
  const hasMore = usePagination && rows.length > requestedLimit;
  const effectiveRows = usePagination ? rows.slice(0, requestedLimit) : rows;

  // 批量获取形态的属性和图片
  const formIds = effectiveRows.map((r: any) => Number(r.formId));
  const [typeRows, imageRows] = await Promise.all([
    db.select({
      formId: pokemonFormTypes.formId,
      typeName: pokemonFormTypes.typeName,
      slot: pokemonFormTypes.slot,
    }).from(pokemonFormTypes)
      .where(and(inArray(pokemonFormTypes.formId, formIds), isNull(pokemonFormTypes.generationEnd)))
      .orderBy(asc(pokemonFormTypes.formId), asc(pokemonFormTypes.slot)),

    db.select({
      formId: pokemonFormImages.formId,
      url: pokemonFormImages.url,
      alt: pokemonFormImages.alt,
    }).from(pokemonFormImages)
      .where(and(inArray(pokemonFormImages.formId, formIds), eq(pokemonFormImages.imageKind, "official"))),
  ]);

  const typeMap = new Map<number, string[]>();
  for (const r of typeRows) {
    const fid = Number(r.formId);
    if (!typeMap.has(fid)) typeMap.set(fid, []);
    typeMap.get(fid)!.push(String(r.typeName));
  }

  const imageMap = new Map<number, ImageAsset>();
  for (const r of imageRows) {
    imageMap.set(Number(r.formId), {
      url: String(r.url),
      alt: r.alt ? String(r.alt) : undefined,
    });
  }

  const items = effectiveRows.map((row: any) => {
    const fid = Number(row.formId);
    const types = typeMap.get(fid) || [];
    const isDefault = Number(row.isDefault) === 1;
    const card: PokemonCardSummary = {
      id: Number(row.pokemonId),
      dexNumber: Number(row.dexNumber),
      nameZh: String(row.pokemonNameZh),
      nameEn: row.pokemonNameEn ? String(row.pokemonNameEn) : undefined,
      primaryType: types[0],
      secondaryType: types[1],
      image: imageMap.get(fid),
      usageRank: Number(row.usageRank),
      formId: fid,
    };
    if (!isDefault) {
      card.formType = String(row.formType);
      card.formName = String(row.formNameZh);
    }
    return card;
  });

  return usePagination ? { items, hasMore } : items;
}

export async function listPokemonCardRows(
  db: any,
  filters?: PokemonListFilters,
): Promise<PaginatedResult<PokemonCardSummary> | PokemonCardSummary[]> {
  // 按使用率排序时走形态级查询路径
  if (filters?.sort === "usage" && filters?.championsSeasonId !== undefined) {
    return listPokemonCardsByUsage(db, filters);
  }

  const where = buildPokemonListWhere(filters);
  const usePagination = filters?.limit !== undefined;
  const needsSpeedJoin = filters?.sort === "speed";

  let query = db
    .select({
      id: pokemon.id,
      dexNumber: pokemon.dexNumber,
      nameZh: pokemon.nameZh,
      nameEn: pokemon.nameEn,
      formId: pokemonForms.id,
      spe: needsSpeedJoin ? pokemonFormStats.spe : sql<number>`NULL`,
    })
    .from(pokemon)
    .innerJoin(pokemonForms, and(eq(pokemonForms.pokemonId, pokemon.id), eq(pokemonForms.isDefault, 1)));

  if (needsSpeedJoin) {
    query = query.leftJoin(pokemonFormStats, and(eq(pokemonFormStats.formId, pokemonForms.id), isNull(pokemonFormStats.generationEnd)));
  }

  query = query.where(where).orderBy(...pokemonListOrderBy(filters));

  if (usePagination) {
    query = query.limit(Number(filters!.limit) + 1).offset(Number(filters?.offset ?? 0));
  }

  const rows: any[] = await query;
  if (rows.length === 0) return usePagination ? { items: [], hasMore: false } : [];

  // limit+1: 截断多余行并计算 hasMore
  const requestedLimit = Number(filters?.limit ?? 0);
  const hasMore = usePagination && rows.length > requestedLimit;
  const effectiveRows = usePagination ? rows.slice(0, requestedLimit) : rows;

  const formIds = effectiveRows.map((r: any) => Number(r.formId));
  const [typeRows, imageRows] = await Promise.all([
    db.select({
      formId: pokemonFormTypes.formId,
      typeName: pokemonFormTypes.typeName,
      slot: pokemonFormTypes.slot,
    }).from(pokemonFormTypes)
      .where(and(inArray(pokemonFormTypes.formId, formIds), isNull(pokemonFormTypes.generationEnd)))
      .orderBy(asc(pokemonFormTypes.formId), asc(pokemonFormTypes.slot)),

    db.select({
      formId: pokemonFormImages.formId,
      url: pokemonFormImages.url,
      alt: pokemonFormImages.alt,
    }).from(pokemonFormImages)
      .where(and(inArray(pokemonFormImages.formId, formIds), eq(pokemonFormImages.imageKind, "official"))),
  ]);

  const typeMap = new Map<number, string[]>();
  for (const r of typeRows) {
    const fid = Number(r.formId);
    if (!typeMap.has(fid)) typeMap.set(fid, []);
    typeMap.get(fid)!.push(String(r.typeName));
  }

  const imageMap = new Map<number, ImageAsset>();
  for (const r of imageRows) {
    imageMap.set(Number(r.formId), {
      url: String(r.url),
      alt: r.alt ? String(r.alt) : undefined,
    });
  }

  const items = effectiveRows.map((row: any) => {
    const fid = Number(row.formId);
    const types = typeMap.get(fid) || [];
    return {
      id: Number(row.id),
      dexNumber: Number(row.dexNumber),
      nameZh: String(row.nameZh),
      nameEn: row.nameEn ? String(row.nameEn) : undefined,
      primaryType: types[0],
      secondaryType: types[1],
      image: imageMap.get(fid),
    } as PokemonCardSummary;
  });

  return usePagination ? { items, hasMore } : items;
}

/**
 * 按使用率排序时的形态级表格查询（与 listPokemonCardsByUsage 对应）。
 */
async function listPokemonTableByUsage(
  db: any,
  filters: PokemonListFilters,
): Promise<PaginatedResult<PokemonTableSummary> | PokemonTableSummary[]> {
  const usePagination = filters.limit !== undefined;
  const seasonId = filters.championsSeasonId!;
  const format = filters.battleFormat || "double";

  const conditions: SQL[] = [
    eq(championsUsagePokemon.seasonId, seasonId),
    eq(championsUsagePokemon.format, format),
    eq(championsUsagePokemon.eventId, ""),
  ];

  if (filters.query) {
    const v = `%${filters.query}%`;
    conditions.push(
      or(
        like(pokemon.nameZh, v),
        like(pokemon.nameJa, v),
        like(pokemon.nameEn, v),
        like(pokemonForms.nameZh, v),
        like(sql`CAST(${pokemon.dexNumber} AS TEXT)`, v),
      )!,
    );
  }

  if (filters.type) {
    const types = Array.isArray(filters.type) ? filters.type : [filters.type];
    if (types.length === 1) {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM pokemon_form_types pft2 WHERE pft2.form_id = ${championsUsagePokemon.formId} AND pft2.type_name = ${types[0]})`,
      );
    } else if (types.length > 1) {
      const placeholders = types.map((t) => sql`${t}`);
      conditions.push(
        sql`EXISTS (SELECT 1 FROM pokemon_form_types pft2 WHERE pft2.form_id = ${championsUsagePokemon.formId} AND pft2.type_name IN (${sql.join(placeholders, sql`, `)}))`,
      );
    }
  }

  if (filters.generation) {
    conditions.push(eq(pokemon.introducedGeneration, filters.generation));
  }

  let query = db
    .select({
      pokemonId: pokemon.id,
      dexNumber: pokemon.dexNumber,
      pokemonNameZh: pokemon.nameZh,
      pokemonNameEn: pokemon.nameEn,
      formId: championsUsagePokemon.formId,
      formType: pokemonForms.formType,
      formNameZh: pokemonForms.nameZh,
      isDefault: pokemonForms.isDefault,
      usageRank: championsUsagePokemon.rank,
      hp: pokemonFormStats.hp,
      atk: pokemonFormStats.atk,
      def: pokemonFormStats.def,
      spa: pokemonFormStats.spa,
      spd: pokemonFormStats.spd,
      spe: pokemonFormStats.spe,
    })
    .from(championsUsagePokemon)
    .innerJoin(pokemon, eq(pokemon.id, championsUsagePokemon.pokemonId))
    .innerJoin(pokemonForms, eq(pokemonForms.id, championsUsagePokemon.formId))
    .leftJoin(pokemonFormStats, and(eq(pokemonFormStats.formId, pokemonForms.id), isNull(pokemonFormStats.generationEnd)))
    .where(and(...conditions))
    .orderBy(asc(championsUsagePokemon.rank), asc(pokemon.dexNumber));

  if (usePagination) {
    query = query.limit(Number(filters.limit) + 1).offset(Number(filters.offset ?? 0));
  }

  const rows: any[] = await query;
  if (rows.length === 0) return usePagination ? { items: [], hasMore: false } : [];

  const requestedLimit = Number(filters.limit ?? 0);
  const hasMore = usePagination && rows.length > requestedLimit;
  const effectiveRows = usePagination ? rows.slice(0, requestedLimit) : rows;

  const formIds = effectiveRows.map((r: any) => Number(r.formId));
  const [typeRows, abilityRows, imageRows] = await Promise.all([
    db.select({
      formId: pokemonFormTypes.formId,
      typeName: pokemonFormTypes.typeName,
      slot: pokemonFormTypes.slot,
    }).from(pokemonFormTypes)
      .where(and(inArray(pokemonFormTypes.formId, formIds), isNull(pokemonFormTypes.generationEnd)))
      .orderBy(asc(pokemonFormTypes.formId), asc(pokemonFormTypes.slot)),

    db.select({
      formId: pokemonFormAbilities.formId,
      abilityNameZh: pokemonFormAbilities.abilityNameZh,
      isHidden: pokemonFormAbilities.isHidden,
    }).from(pokemonFormAbilities)
      .where(and(inArray(pokemonFormAbilities.formId, formIds), isNull(pokemonFormAbilities.generationEnd)))
      .orderBy(asc(pokemonFormAbilities.formId), asc(pokemonFormAbilities.slot)),

    db.select({
      formId: pokemonFormImages.formId,
      url: pokemonFormImages.url,
      alt: pokemonFormImages.alt,
    }).from(pokemonFormImages)
      .where(and(inArray(pokemonFormImages.formId, formIds), eq(pokemonFormImages.imageKind, "official"))),
  ]);

  const typeMap = new Map<number, string[]>();
  for (const r of typeRows) {
    const fid = Number(r.formId);
    if (!typeMap.has(fid)) typeMap.set(fid, []);
    typeMap.get(fid)!.push(String(r.typeName));
  }

  const abilityMap = new Map<number, { abilities: string[]; hidden?: string }>();
  for (const r of abilityRows) {
    const fid = Number(r.formId);
    if (!abilityMap.has(fid)) abilityMap.set(fid, { abilities: [] });
    const entry = abilityMap.get(fid)!;
    if (Number(r.isHidden)) entry.hidden = String(r.abilityNameZh);
    else entry.abilities.push(String(r.abilityNameZh));
  }

  const imageMap = new Map<number, ImageAsset>();
  for (const r of imageRows) {
    imageMap.set(Number(r.formId), {
      url: String(r.url),
      alt: r.alt ? String(r.alt) : undefined,
    });
  }

  const items = effectiveRows.map((row: any) => {
    const fid = Number(row.formId);
    const types = typeMap.get(fid) || [];
    const ab = abilityMap.get(fid) || { abilities: [] };
    const isDefault = Number(row.isDefault) === 1;
    const entry: PokemonTableSummary = {
      id: Number(row.pokemonId),
      dexNumber: Number(row.dexNumber),
      nameZh: String(row.pokemonNameZh),
      nameEn: row.pokemonNameEn ? String(row.pokemonNameEn) : undefined,
      primaryType: types[0],
      secondaryType: types[1],
      abilities: ab.abilities,
      hiddenAbility: ab.hidden,
      baseStats: buildStatBlock(row),
      image: imageMap.get(fid),
      usageRank: Number(row.usageRank),
      formId: fid,
    };
    if (!isDefault) {
      entry.formType = String(row.formType);
      entry.formName = String(row.formNameZh);
    }
    return entry;
  });

  return usePagination ? { items, hasMore } : items;
}

// ══════════════════════════════════════════════════════════════════════════════
// Position Query — 计算目标宝可梦在卡片列表中的 0-based offset
// ══════════════════════════════════════════════════════════════════════════════

/**
 * usage（赛季使用率）排序下的位置计算。
 * 列表来自 champions_usage_pokemon，是形态级拆卡，排序为 ORDER BY rank ASC, dexNumber ASC。
 *
 * 定位目标优先级：
 * 1. 若传入 formId 且该形态卡存在于当前 usage 列表，则精确定位到该形态卡（队友常常是特定形态）。
 * 2. 否则取该 pokemonId 在 usage 列表中排名最靠前（rank 最小、dexNumber 最小）的那张卡，
 *    与前端 list.find 命中第一张的行为保持一致。
 */
async function getPokemonCardPositionByUsage(
  db: any,
  pokemonId: number,
  filters?: Omit<PokemonListFilters, "limit" | "offset" | "sort" | "order">,
  formId?: number,
): Promise<number | undefined> {
  const seasonId = filters!.championsSeasonId!;
  const format = filters?.battleFormat || "double";

  // 复用 usage 列表的过滤条件（赛季、格式、搜索、属性、世代）
  const conditions: SQL[] = [
    eq(championsUsagePokemon.seasonId, seasonId),
    eq(championsUsagePokemon.format, format),
    eq(championsUsagePokemon.eventId, ""),
  ];

  if (filters?.query) {
    const v = `%${filters.query}%`;
    conditions.push(
      or(
        like(pokemon.nameZh, v),
        like(pokemon.nameJa, v),
        like(pokemon.nameEn, v),
        like(pokemonForms.nameZh, v),
        like(sql`CAST(${pokemon.dexNumber} AS TEXT)`, v),
      )!,
    );
  }

  if (filters?.type) {
    const types = Array.isArray(filters.type) ? filters.type : [filters.type];
    if (types.length === 1) {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM pokemon_form_types pft2 WHERE pft2.form_id = ${championsUsagePokemon.formId} AND pft2.type_name = ${types[0]})`,
      );
    } else if (types.length > 1) {
      const placeholders = types.map((t) => sql`${t}`);
      conditions.push(
        sql`EXISTS (SELECT 1 FROM pokemon_form_types pft2 WHERE pft2.form_id = ${championsUsagePokemon.formId} AND pft2.type_name IN (${sql.join(placeholders, sql`, `)}))`,
      );
    }
  }

  if (filters?.generation) {
    conditions.push(eq(pokemon.introducedGeneration, filters.generation));
  }

  // 找到定位目标卡的排序键：优先精确匹配 formId，命中则用该形态卡；否则取 pokemonId 排名最靠前的卡
  const baseSelect = () =>
    db
      .select({ rank: championsUsagePokemon.rank, dexNumber: pokemon.dexNumber })
      .from(championsUsagePokemon)
      .innerJoin(pokemon, eq(pokemon.id, championsUsagePokemon.pokemonId))
      .innerJoin(pokemonForms, eq(pokemonForms.id, championsUsagePokemon.formId));

  let target: { rank: number; dexNumber: number } | undefined;
  if (formId !== undefined) {
    [target] = await baseSelect()
      .where(and(...conditions, eq(championsUsagePokemon.formId, formId)))
      .limit(1);
  }
  if (!target) {
    // 无 formId 或该形态不在列表：回退到 pokemonId 排名最靠前的卡
    [target] = await baseSelect()
      .where(and(...conditions, eq(championsUsagePokemon.pokemonId, pokemonId)))
      .orderBy(asc(championsUsagePokemon.rank), asc(pokemon.dexNumber))
      .limit(1);
  }

  if (!target) return undefined;

  // 计算排在目标前面的卡片数（与列表 ORDER BY rank ASC, dexNumber ASC 一致）
  const positionCondition = or(
    sql`${championsUsagePokemon.rank} < ${target.rank}`,
    and(
      eq(championsUsagePokemon.rank, target.rank),
      sql`${pokemon.dexNumber} < ${target.dexNumber}`,
    ),
  )!;

  const [result] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(championsUsagePokemon)
    .innerJoin(pokemon, eq(pokemon.id, championsUsagePokemon.pokemonId))
    .innerJoin(pokemonForms, eq(pokemonForms.id, championsUsagePokemon.formId))
    .where(and(...conditions, positionCondition));

  return result.count;
}

/**
 * 获取某宝可梦在卡片列表排序中的 0-based 位置。
 * 默认排序键：dexNumber ASC（与 listPokemonCardRows 一致）。
 * 选了赛季（championsSeasonId）时走 usage 形态级排序路径。
 *
 * @param pokemonId pokemon.id
 * @param filters 与列表相同的过滤条件（不含分页和排序）
 * @param formId 可选，目标形态卡 id；usage 路径下用于精确定位到具体形态（如队友的特定形态）
 */
export async function getPokemonCardPosition(
  db: any,
  pokemonId: number,
  filters?: Omit<PokemonListFilters, "limit" | "offset" | "sort" | "order">,
  formId?: number,
): Promise<number | undefined> {
  // 选了赛季时，图鉴列表走 usage 形态级排序（ORDER BY rank ASC, dexNumber ASC），
  // 与默认的 dexNumber 排序完全不同。此处必须用同一套排序规则计算位置，
  // 否则跳转目标（尤其是排名靠后的形态宝可梦）会定位到错误的列表区域。
  if (filters?.championsSeasonId !== undefined) {
    return getPokemonCardPositionByUsage(db, pokemonId, filters, formId);
  }

  // 先查目标行的排序键值
  const [target] = await db
    .select({ id: pokemon.id, dexNumber: pokemon.dexNumber })
    .from(pokemon)
    .where(eq(pokemon.id, pokemonId))
    .limit(1);

  if (!target) return undefined;

  // 构建与 listPokemonCardRows 一致的过滤条件
  const where = buildPokemonListWhere(filters as PokemonListFilters);

  // 验证目标行满足过滤条件
  // 需要加入 pokemonForms JOIN，因为 buildPokemonListWhere 可能引用 pokemonForms.id
  const existConditions: SQL[] = [eq(pokemon.id, pokemonId)];
  if (where) existConditions.push(where);
  const existQuery = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(pokemon)
    .innerJoin(pokemonForms, and(eq(pokemonForms.pokemonId, pokemon.id), eq(pokemonForms.isDefault, 1)))
    .where(and(...existConditions));
  const [exists] = await existQuery;
  if (!exists || exists.count === 0) return undefined;

  // 计算排在 target 前面的行数（dexNumber ASC）
  const targetDex = target.dexNumber;
  const positionCondition = sql`${pokemon.dexNumber} < ${targetDex}`;
  const allConditions: SQL[] = [positionCondition];
  if (where) allConditions.push(where);

  const [result] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(pokemon)
    .innerJoin(pokemonForms, and(eq(pokemonForms.pokemonId, pokemon.id), eq(pokemonForms.isDefault, 1)))
    .where(and(...allConditions));

  return result.count;
}

export async function listPokemonTableRows(
  db: any,
  filters?: PokemonListFilters,
): Promise<PaginatedResult<PokemonTableSummary> | PokemonTableSummary[]> {
  // 按使用率排序时走形态级查询路径
  if (filters?.sort === "usage" && filters?.championsSeasonId !== undefined) {
    return listPokemonTableByUsage(db, filters);
  }

  const where = buildPokemonListWhere(filters);
  const usePagination = filters?.limit !== undefined;

  let query = db
    .select({
      id: pokemon.id,
      dexNumber: pokemon.dexNumber,
      nameZh: pokemon.nameZh,
      nameEn: pokemon.nameEn,
      formId: pokemonForms.id,
      hp: pokemonFormStats.hp,
      atk: pokemonFormStats.atk,
      def: pokemonFormStats.def,
      spa: pokemonFormStats.spa,
      spd: pokemonFormStats.spd,
      spe: pokemonFormStats.spe,
    })
    .from(pokemon)
    .innerJoin(pokemonForms, and(eq(pokemonForms.pokemonId, pokemon.id), eq(pokemonForms.isDefault, 1)))
    .leftJoin(pokemonFormStats, and(eq(pokemonFormStats.formId, pokemonForms.id), isNull(pokemonFormStats.generationEnd)));

  query = query.where(where).orderBy(...pokemonListOrderBy(filters));

  if (usePagination) {
    query = query.limit(Number(filters!.limit) + 1).offset(Number(filters?.offset ?? 0));
  }

  const rows: any[] = await query;
  if (rows.length === 0) return usePagination ? { items: [], hasMore: false } : [];

  // limit+1: 截断多余行并计算 hasMore
  const requestedLimit = Number(filters?.limit ?? 0);
  const hasMore = usePagination && rows.length > requestedLimit;
  const effectiveRows = usePagination ? rows.slice(0, requestedLimit) : rows;

  const formIds = effectiveRows.map((r: any) => Number(r.formId));
  const [typeRows, abilityRows, imageRows] = await Promise.all([
    db.select({
      formId: pokemonFormTypes.formId,
      typeName: pokemonFormTypes.typeName,
      slot: pokemonFormTypes.slot,
    }).from(pokemonFormTypes)
      .where(and(inArray(pokemonFormTypes.formId, formIds), isNull(pokemonFormTypes.generationEnd)))
      .orderBy(asc(pokemonFormTypes.formId), asc(pokemonFormTypes.slot)),

    db.select({
      formId: pokemonFormAbilities.formId,
      abilityNameZh: pokemonFormAbilities.abilityNameZh,
      isHidden: pokemonFormAbilities.isHidden,
    }).from(pokemonFormAbilities)
      .where(and(inArray(pokemonFormAbilities.formId, formIds), isNull(pokemonFormAbilities.generationEnd)))
      .orderBy(asc(pokemonFormAbilities.formId), asc(pokemonFormAbilities.slot)),

    db.select({
      formId: pokemonFormImages.formId,
      url: pokemonFormImages.url,
      alt: pokemonFormImages.alt,
    }).from(pokemonFormImages)
      .where(and(inArray(pokemonFormImages.formId, formIds), eq(pokemonFormImages.imageKind, "official"))),
  ]);

  const typeMap = new Map<number, string[]>();
  for (const r of typeRows) {
    const fid = Number(r.formId);
    if (!typeMap.has(fid)) typeMap.set(fid, []);
    typeMap.get(fid)!.push(String(r.typeName));
  }

  const abilityMap = new Map<number, { abilities: string[]; hidden?: string }>();
  for (const r of abilityRows) {
    const fid = Number(r.formId);
    if (!abilityMap.has(fid)) abilityMap.set(fid, { abilities: [] });
    const entry = abilityMap.get(fid)!;
    if (Number(r.isHidden)) entry.hidden = String(r.abilityNameZh);
    else entry.abilities.push(String(r.abilityNameZh));
  }

  const imageMap = new Map<number, ImageAsset>();
  for (const r of imageRows) {
    imageMap.set(Number(r.formId), {
      url: String(r.url),
      alt: r.alt ? String(r.alt) : undefined,
    });
  }

  const items = effectiveRows.map((row: any) => {
    const fid = Number(row.formId);
    const types = typeMap.get(fid) || [];
    const ab = abilityMap.get(fid) || { abilities: [] };
    return {
      id: Number(row.id),
      dexNumber: Number(row.dexNumber),
      nameZh: String(row.nameZh),
      nameEn: row.nameEn ? String(row.nameEn) : undefined,
      primaryType: types[0],
      secondaryType: types[1],
      abilities: ab.abilities,
      hiddenAbility: ab.hidden,
      baseStats: buildStatBlock(row),
      image: imageMap.get(fid),
    } as PokemonTableSummary;
  });

  return usePagination ? { items, hasMore } : items;
}
