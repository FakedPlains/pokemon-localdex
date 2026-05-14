import { eq, like, and, or, sql, inArray, isNull, asc, desc } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import {
  pokemon,
  pokemonForms,
  pokemonFormAbilities,
  pokemonFormImages,
  pokemonFormStats,
  pokemonFormTypes,
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
        like(pokemon.slug, v),
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
  return filters?.sort === "speed"
    ? [
        sql`${pokemonFormStats.spe} IS NULL`,
        filters.order === "asc" ? asc(pokemonFormStats.spe) : desc(pokemonFormStats.spe),
        asc(pokemon.dexNumber),
      ]
    : [asc(pokemon.dexNumber)];
}

async function countDefaultPokemonRows(db: any, where: SQL | undefined): Promise<number> {
  const countRows = await db
    .select({ cnt: sql<number>`COUNT(*)` })
    .from(pokemon)
    .innerJoin(pokemonForms, and(eq(pokemonForms.pokemonId, pokemon.id), eq(pokemonForms.isDefault, 1)))
    .where(where);
  return Number(countRows[0]?.cnt ?? 0);
}

export async function listPokemonCardRows(
  db: any,
  filters?: PokemonListFilters,
): Promise<PaginatedResult<PokemonCardSummary> | PokemonCardSummary[]> {
  const where = buildPokemonListWhere(filters);
  const usePagination = filters?.limit !== undefined;
  const needsSpeedJoin = filters?.sort === "speed";

  const total = usePagination ? await countDefaultPokemonRows(db, where) : 0;

  let query = db
    .select({
      id: pokemon.id,
      dexNumber: pokemon.dexNumber,
      slug: pokemon.slug,
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
    query = query.limit(Number(filters!.limit)).offset(Number(filters?.offset ?? 0));
  }

  const rows: any[] = await query;
  if (rows.length === 0) return usePagination ? { items: [], total } : [];

  const formIds = rows.map((r: any) => Number(r.formId));
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

  const items = rows.map((row: any) => {
    const fid = Number(row.formId);
    const types = typeMap.get(fid) || [];
    return {
      id: Number(row.id),
      dexNumber: Number(row.dexNumber),
      slug: String(row.slug),
      nameZh: String(row.nameZh),
      nameEn: row.nameEn ? String(row.nameEn) : undefined,
      primaryType: types[0],
      secondaryType: types[1],
      image: imageMap.get(fid),
    } as PokemonCardSummary;
  });

  return usePagination ? { items, total } : items;
}

export async function listPokemonTableRows(
  db: any,
  filters?: PokemonListFilters,
): Promise<PaginatedResult<PokemonTableSummary> | PokemonTableSummary[]> {
  const where = buildPokemonListWhere(filters);
  const usePagination = filters?.limit !== undefined;
  const total = usePagination ? await countDefaultPokemonRows(db, where) : 0;

  let query = db
    .select({
      id: pokemon.id,
      dexNumber: pokemon.dexNumber,
      slug: pokemon.slug,
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
    .leftJoin(pokemonFormStats, and(eq(pokemonFormStats.formId, pokemonForms.id), isNull(pokemonFormStats.generationEnd)))
    .where(where)
    .orderBy(...pokemonListOrderBy(filters));

  if (usePagination) {
    query = query.limit(Number(filters!.limit)).offset(Number(filters?.offset ?? 0));
  }

  const rows: any[] = await query;
  if (rows.length === 0) return usePagination ? { items: [], total } : [];

  const formIds = rows.map((r: any) => Number(r.formId));
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

  const items = rows.map((row: any) => {
    const fid = Number(row.formId);
    const types = typeMap.get(fid) || [];
    const ab = abilityMap.get(fid) || { abilities: [] };
    return {
      id: Number(row.id),
      dexNumber: Number(row.dexNumber),
      slug: String(row.slug),
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

  return usePagination ? { items, total } : items;
}
