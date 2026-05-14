import { eq, like, and, or, sql, inArray, isNull, asc, desc } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import {
  pokemon,
  pokemonForms,
  pokemonFormStats,
  pokemonFormTypes,
  pokemonFormAbilities,
  pokemonFormImages,
} from "@pokemon-localdex/drizzle-schema";
import type {
  ImageAsset,
  PaginationParams,
  PaginatedResult,
  PokemonListSortKey,
  PokemonSummary,
  SortOrder,
} from "@pokemon-localdex/store-types";
import { buildStatBlock } from "./hydration.ts";

export type PokemonSummaryListFilters = {
  query?: string;
  type?: string | string[];
  generation?: number;
  championsSeasonId?: number;
  sort?: PokemonListSortKey;
  order?: SortOrder;
} & PaginationParams;

export async function listPokemonRows(
  db: any,
  filters?: PokemonSummaryListFilters,
): Promise<PaginatedResult<PokemonSummary> | PokemonSummary[]> {
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
      // 手动构建 IN 子句
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

  const where = conditions.length ? and(...conditions) : undefined;
  const usePagination = filters?.limit !== undefined;

  let total = 0;
  if (usePagination) {
    const countRows = await db
      .select({ cnt: sql<number>`COUNT(*)` })
      .from(pokemon)
      .innerJoin(pokemonForms, and(eq(pokemonForms.pokemonId, pokemon.id), eq(pokemonForms.isDefault, 1)))
      .where(where);
    total = Number(countRows[0]?.cnt ?? 0);
  }

  const orderByClauses: SQL[] = filters?.sort === "speed"
    ? [
        sql`${pokemonFormStats.spe} IS NULL`,
        filters.order === "asc" ? asc(pokemonFormStats.spe) : desc(pokemonFormStats.spe),
        asc(pokemon.dexNumber),
      ]
    : [asc(pokemon.dexNumber)];

  let query = db
    .select({
      id: pokemon.id,
      dexNumber: pokemon.dexNumber,
      slug: pokemon.slug,
      nameZh: pokemon.nameZh,
      nameJa: pokemon.nameJa,
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
    .orderBy(...orderByClauses);

  if (usePagination) {
    query = query.limit(Number(filters!.limit)).offset(Number(filters?.offset ?? 0));
  }

  const rows: any[] = await query;

  if (rows.length === 0) {
    return usePagination ? { items: [], total } : [];
  }

  const formIds = rows.map((r: any) => Number(r.formId));

  // 批量查询：属性、特性、图片
  const [typeRows, abilityRows, imageRows] = await Promise.all([
    db.select({
      formId: pokemonFormTypes.formId,
      typeName: pokemonFormTypes.typeName,
      slot: pokemonFormTypes.slot,
    }).from(pokemonFormTypes)
      .where(inArray(pokemonFormTypes.formId, formIds))
      .orderBy(asc(pokemonFormTypes.formId), asc(pokemonFormTypes.slot)),

    db.select({
      formId: pokemonFormAbilities.formId,
      abilityNameZh: pokemonFormAbilities.abilityNameZh,
      isHidden: pokemonFormAbilities.isHidden,
    }).from(pokemonFormAbilities)
      .where(inArray(pokemonFormAbilities.formId, formIds))
      .orderBy(asc(pokemonFormAbilities.formId), asc(pokemonFormAbilities.slot)),

    db.select({
      formId: pokemonFormImages.formId,
      imageKind: pokemonFormImages.imageKind,
      url: pokemonFormImages.url,
      alt: pokemonFormImages.alt,
    }).from(pokemonFormImages)
      .where(inArray(pokemonFormImages.formId, formIds)),

  ]);

  // 构建 Map
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
    if (Number(r.isHidden)) {
      entry.hidden = String(r.abilityNameZh);
    } else {
      entry.abilities.push(String(r.abilityNameZh));
    }
  }

  const imageMap = new Map<number, Record<string, ImageAsset>>();
  for (const r of imageRows) {
    const fid = Number(r.formId);
    if (!imageMap.has(fid)) imageMap.set(fid, {});
    imageMap.get(fid)![String(r.imageKind)] = {
      url: String(r.url),
      alt: r.alt ? String(r.alt) : undefined,
    };
  }

  const resultItems = rows.map((row: any) => {
    const fid = Number(row.formId);
    const pid = Number(row.id);
    const types = typeMap.get(fid) || [];
    const ab = abilityMap.get(fid) || { abilities: [] };
    const imgs = imageMap.get(fid) || {};
    return {
      id: pid,
      dexNumber: Number(row.dexNumber),
      slug: String(row.slug),
      nameZh: String(row.nameZh),
      nameJa: row.nameJa ? String(row.nameJa) : undefined,
      nameEn: row.nameEn ? String(row.nameEn) : undefined,
      primaryType: types[0],
      secondaryType: types[1],
      abilities: ab.abilities,
      hiddenAbility: ab.hidden,
      baseStats: buildStatBlock(row),
      image: imgs.official,
      shinyImage: imgs.shiny,
      generations: [],
    } as PokemonSummary;
  });

  return usePagination ? { items: resultItems, total } : resultItems;
}
