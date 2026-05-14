import { eq, and, or, sql, inArray, isNull, asc } from "drizzle-orm";
import {
  pokemon,
  pokemonForms,
  pokemonFormTypes,
  pokemonFormImages,
  pokemonFormAbilities,
  pokemonLearnsets,
  moves,
  moveGenerationRecords,
  abilities,
  abilityGenerationRecords,
  items,
  itemGenerationRecords,
} from "@pokemon-localdex/drizzle-schema";
import type { AbilityEntry, ItemEntry, MoveEntry } from "@pokemon-localdex/store-types";
import { buildSource, hydrateGenRecord } from "./hydration.ts";

async function hydrateMoveRow(db: any, row: any): Promise<MoveEntry> {
  const genRows = await db
    .select({
      generation: moveGenerationRecords.generation,
      gameVersionCode: moveGenerationRecords.gameVersionCode,
      description: moveGenerationRecords.description,
      notes: moveGenerationRecords.notes,
      versionExclusive: moveGenerationRecords.versionExclusive,
    })
    .from(moveGenerationRecords)
    .where(eq(moveGenerationRecords.moveId, Number(row.id)))
    .orderBy(asc(moveGenerationRecords.generation));

  return {
    id: String(row.id),
    number: row.number != null ? Number(row.number) : undefined,
    nameZh: String(row.nameZh),
    nameJa: row.nameJa ? String(row.nameJa) : undefined,
    nameEn: row.nameEn ? String(row.nameEn) : undefined,
    type: row.typeName ? String(row.typeName) : undefined,
    category: row.category ? String(row.category) : undefined,
    power: row.power != null ? Number(row.power) : undefined,
    accuracy: row.accuracy != null ? Number(row.accuracy) : undefined,
    pp: row.pp != null ? Number(row.pp) : undefined,
    description: row.description ? String(row.description) : undefined,
    effectDetail: row.effectDetail ? String(row.effectDetail) : undefined,
    introducedGeneration: row.introducedGeneration != null ? Number(row.introducedGeneration) : undefined,
    generations: genRows.map((g: any) => hydrateGenRecord(g)),
    source: buildSource(row),
  };
}

async function hydrateAbilityRow(db: any, row: any): Promise<AbilityEntry> {
  const genRows = await db
    .select({
      generation: abilityGenerationRecords.generation,
      gameVersionCode: abilityGenerationRecords.gameVersionCode,
      description: abilityGenerationRecords.description,
      notes: abilityGenerationRecords.notes,
      versionExclusive: abilityGenerationRecords.versionExclusive,
    })
    .from(abilityGenerationRecords)
    .where(eq(abilityGenerationRecords.abilityId, Number(row.id)))
    .orderBy(asc(abilityGenerationRecords.generation));

  return {
    id: String(row.id),
    number: row.number != null ? Number(row.number) : undefined,
    nameZh: String(row.nameZh),
    nameJa: row.nameJa ? String(row.nameJa) : undefined,
    nameEn: row.nameEn ? String(row.nameEn) : undefined,
    description: row.description ? String(row.description) : undefined,
    effectDetail: row.effectDetail ? String(row.effectDetail) : undefined,
    introducedGeneration: row.introducedGeneration != null ? Number(row.introducedGeneration) : undefined,
    generations: genRows.map((g: any) => hydrateGenRecord(g)),
    source: buildSource(row),
  };
}

async function hydrateItemRow(db: any, row: any): Promise<ItemEntry> {
  const genRows = await db
    .select({
      generation: itemGenerationRecords.generation,
      gameVersionCode: itemGenerationRecords.gameVersionCode,
      description: itemGenerationRecords.description,
      notes: itemGenerationRecords.notes,
      versionExclusive: itemGenerationRecords.versionExclusive,
    })
    .from(itemGenerationRecords)
    .where(eq(itemGenerationRecords.itemId, Number(row.id)))
    .orderBy(asc(itemGenerationRecords.generation));

  return {
    id: String(row.id),
    slug: String(row.slug),
    nameZh: String(row.nameZh),
    nameJa: row.nameJa ? String(row.nameJa) : undefined,
    nameEn: row.nameEn ? String(row.nameEn) : undefined,
    category: row.category ? String(row.category) : undefined,
    effectSummary: row.effectSummary ? String(row.effectSummary) : undefined,
    effectDetail: row.effectDetail ? String(row.effectDetail) : undefined,
    introducedGeneration: row.introducedGeneration ? Number(row.introducedGeneration) : undefined,
    imageUrl: row.imageUrl ? String(row.imageUrl) : undefined,
    generations: genRows.map((g: any) => hydrateGenRecord(g)),
    source: buildSource(row),
  };
}

async function hydratePokemonReferenceRows(db: any, rows: any[], includeLearnMethods = false) {
  if (rows.length === 0) return [];
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
    }).from(pokemonFormImages)
      .where(and(inArray(pokemonFormImages.formId, formIds), eq(pokemonFormImages.imageKind, "official"))),
  ]);

  const typeMap = new Map<number, string[]>();
  for (const r of typeRows) {
    const fid = Number(r.formId);
    if (!typeMap.has(fid)) typeMap.set(fid, []);
    typeMap.get(fid)!.push(String(r.typeName));
  }

  const imageMap = new Map<number, string>();
  for (const r of imageRows) {
    imageMap.set(Number(r.formId), String(r.url));
  }

  return rows.map((row: any) => {
    const fid = Number(row.formId);
    const types = typeMap.get(fid) || [];
    const result: Record<string, unknown> = {
      id: Number(row.id),
      dexNumber: Number(row.dexNumber),
      slug: String(row.slug),
      nameZh: String(row.nameZh),
      nameJa: row.nameJa ? String(row.nameJa) : undefined,
      nameEn: row.nameEn ? String(row.nameEn) : undefined,
      primaryType: types[0],
      secondaryType: types[1],
      image: imageMap.get(fid),
    };
    if (includeLearnMethods) {
      result.learnMethods = row.learnMethods ? String(row.learnMethods).split(",") : [];
    }
    if (row.isHidden !== undefined) {
      result.isHidden = !!Number(row.isHidden);
    }
    return result;
  });
}

export async function getMoveRow(db: any, idOrSlug: string): Promise<MoveEntry | undefined> {
  const rows = await db
    .select()
    .from(moves)
    .where(or(eq(moves.id, Number(idOrSlug) || 0), eq(moves.nameZh, idOrSlug)))
    .limit(1);

  return rows[0] ? hydrateMoveRow(db, rows[0]) : undefined;
}

export async function getPokemonByMoveRows(
  db: any,
  moveId: number,
  pagination?: { limit?: number; offset?: number },
): Promise<any[] | { items: any[]; total: number }> {
  const usePagination = pagination?.limit !== undefined;
  const baseWhere = eq(pokemonLearnsets.moveId, moveId);

  let total = 0;
  if (usePagination) {
    const countRows: any[] = await db
      .select({ cnt: sql<number>`COUNT(DISTINCT ${pokemon.id})` })
      .from(pokemonLearnsets)
      .innerJoin(pokemon, eq(pokemon.id, pokemonLearnsets.pokemonId))
      .where(baseWhere);
    total = Number(countRows[0]?.cnt ?? 0);
    if (total === 0) return { items: [], total: 0 };
  }

  let query = db
    .select({
      id: pokemon.id,
      dexNumber: pokemon.dexNumber,
      slug: pokemon.slug,
      nameZh: pokemon.nameZh,
      nameJa: pokemon.nameJa,
      nameEn: pokemon.nameEn,
      formId: pokemonForms.id,
      learnMethods: sql<string>`GROUP_CONCAT(DISTINCT ${pokemonLearnsets.learnMethod})`,
    })
    .from(pokemonLearnsets)
    .innerJoin(pokemon, eq(pokemon.id, pokemonLearnsets.pokemonId))
    .innerJoin(pokemonForms, and(eq(pokemonForms.pokemonId, pokemon.id), eq(pokemonForms.isDefault, 1)))
    .where(baseWhere)
    .groupBy(pokemon.id)
    .orderBy(asc(pokemon.dexNumber));

  if (usePagination) {
    query = query.limit(Number(pagination!.limit)).offset(Number(pagination?.offset ?? 0));
  }

  const rows: any[] = await query;
  if (rows.length === 0) return usePagination ? { items: [], total } : [];

  const entries = await hydratePokemonReferenceRows(db, rows, true);
  return usePagination ? { items: entries, total } : entries;
}

export async function getAbilityRow(db: any, idOrName: string): Promise<AbilityEntry | undefined> {
  const rows = await db
    .select()
    .from(abilities)
    .where(or(eq(abilities.id, Number(idOrName) || 0), eq(abilities.nameZh, idOrName)))
    .limit(1);

  return rows[0] ? hydrateAbilityRow(db, rows[0]) : undefined;
}

export async function getPokemonByAbilityRows(
  db: any,
  abilityId: number,
  pagination?: { limit?: number; offset?: number },
): Promise<any[] | { items: any[]; total: number }> {
  const usePagination = pagination?.limit !== undefined;
  const baseWhere = eq(pokemonFormAbilities.abilityId, abilityId);

  let total = 0;
  if (usePagination) {
    const countRows: any[] = await db
      .select({ cnt: sql<number>`COUNT(DISTINCT ${pokemon.id})` })
      .from(pokemonFormAbilities)
      .innerJoin(pokemonForms, and(eq(pokemonForms.id, pokemonFormAbilities.formId), eq(pokemonForms.isDefault, 1)))
      .innerJoin(pokemon, eq(pokemon.id, pokemonForms.pokemonId))
      .where(baseWhere);
    total = Number(countRows[0]?.cnt ?? 0);
    if (total === 0) return { items: [], total: 0 };
  }

  let query = db
    .selectDistinct({
      id: pokemon.id,
      dexNumber: pokemon.dexNumber,
      slug: pokemon.slug,
      nameZh: pokemon.nameZh,
      nameJa: pokemon.nameJa,
      nameEn: pokemon.nameEn,
      isHidden: pokemonFormAbilities.isHidden,
      formId: pokemonForms.id,
    })
    .from(pokemonFormAbilities)
    .innerJoin(pokemonForms, and(eq(pokemonForms.id, pokemonFormAbilities.formId), eq(pokemonForms.isDefault, 1)))
    .innerJoin(pokemon, eq(pokemon.id, pokemonForms.pokemonId))
    .where(baseWhere)
    .orderBy(asc(pokemon.dexNumber));

  if (usePagination) {
    query = query.limit(Number(pagination!.limit)).offset(Number(pagination?.offset ?? 0));
  }

  const rows: any[] = await query;
  if (rows.length === 0) return usePagination ? { items: [], total } : [];

  const entries = await hydratePokemonReferenceRows(db, rows);
  return usePagination ? { items: entries, total } : entries;
}

export async function getItemRow(db: any, idOrSlug: string): Promise<ItemEntry | undefined> {
  const rows = await db
    .select()
    .from(items)
    .where(
      or(
        eq(items.id, Number(idOrSlug) || 0),
        eq(items.slug, idOrSlug),
        eq(items.nameZh, idOrSlug),
      ),
    )
    .limit(1);

  return rows[0] ? hydrateItemRow(db, rows[0]) : undefined;
}
