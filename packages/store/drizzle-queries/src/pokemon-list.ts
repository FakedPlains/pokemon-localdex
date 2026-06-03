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
