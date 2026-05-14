import { eq, and, or, sql, inArray, asc } from "drizzle-orm";
import {
  pokemon,
  pokemonForms,
  pokemonFormStats,
  pokemonFormTypes,
  pokemonFormAbilities,
  pokemonFormImages,
  pokemonGenerationRegions,
  abilities,
  items,
} from "@pokemon-localdex/drizzle-schema";
import type {
  StatBlock,
  ImageAsset,
  PokemonFormEntry,
  PokemonEntry,
  PokemonIdentity,
} from "@pokemon-localdex/store-types";
import {
  buildSource,
  buildStatBlock,
  championFormNameMatches,
} from "./hydration.ts";
import { championRegulationPokemonRows } from "./champions.ts";
import { getPokemonEvolutionChainRows } from "./pokemon-evolution.ts";

export async function getPokemonIdentityRow(db: any, idOrSlug: string): Promise<PokemonIdentity | undefined> {
  const rows = await db
    .select({
      id: pokemon.id,
      dexNumber: pokemon.dexNumber,
      slug: pokemon.slug,
      nameZh: pokemon.nameZh,
    })
    .from(pokemon)
    .where(
      or(
        eq(pokemon.id, Number(idOrSlug) || 0),
        eq(pokemon.slug, idOrSlug),
        eq(pokemon.nameZh, idOrSlug),
        eq(sql`CAST(${pokemon.dexNumber} AS TEXT)`, idOrSlug),
      ),
    )
    .limit(1);

  const row = rows[0];
  return row
    ? {
        id: Number(row.id),
        dexNumber: Number(row.dexNumber),
        slug: String(row.slug),
        nameZh: String(row.nameZh),
      }
    : undefined;
}

export async function getPokemonRow(
  db: any,
  idOrSlug: string,
  filters?: { championsSeasonId?: number },
): Promise<PokemonEntry | undefined> {
  const rows = await db
    .select()
    .from(pokemon)
    .where(
      or(
        eq(pokemon.id, Number(idOrSlug) || 0),
        eq(pokemon.slug, idOrSlug),
        eq(pokemon.nameZh, idOrSlug),
        eq(sql`CAST(${pokemon.dexNumber} AS TEXT)`, idOrSlug),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return undefined;

  const pokemonId = Number(row.id);
  const dexNumber = Number(row.dexNumber);

  const championRows = filters?.championsSeasonId !== undefined
    ? await championRegulationPokemonRows(db, filters.championsSeasonId, pokemonId, dexNumber)
    : undefined;
  if (filters?.championsSeasonId !== undefined && championRows?.length === 0) return undefined;

  // 查询所有形态（含绑定道具）
  let formRows: any[] = await db
    .select({
      id: pokemonForms.id,
      pokemonId: pokemonForms.pokemonId,
      formKey: pokemonForms.formKey,
      nameZh: pokemonForms.nameZh,
      formType: pokemonForms.formType,
      isDefault: pokemonForms.isDefault,
      sortOrder: pokemonForms.sortOrder,
      requiredItemId: pokemonForms.requiredItemId,
      reqItemId: items.id,
      reqItemNameZh: items.nameZh,
      reqItemSlug: items.slug,
      reqItemImageUrl: items.imageUrl,
    })
    .from(pokemonForms)
    .leftJoin(items, eq(items.id, pokemonForms.requiredItemId))
    .where(eq(pokemonForms.pokemonId, pokemonId))
    .orderBy(asc(pokemonForms.sortOrder));

  if (championRows) {
    const allowedFormIds = new Set<number>();
    const defaultFormId = Number(formRows.find((form: any) => Number(form.isDefault) === 1)?.id ?? formRows[0]?.id);

    for (const champion of championRows) {
      if (champion.formId != null) {
        allowedFormIds.add(champion.formId);
        continue;
      }

      const matchedForms = formRows.filter((form: any) =>
        championFormNameMatches(form, champion.nameZh, String(row.nameZh)),
      );
      if (matchedForms.length > 0) {
        for (const form of matchedForms) allowedFormIds.add(Number(form.id));
      } else if (Number.isFinite(defaultFormId)) {
        allowedFormIds.add(defaultFormId);
      }
    }

    formRows = formRows.filter((form: any) => allowedFormIds.has(Number(form.id)));
  }

  const formIds = formRows.map((f: any) => Number(f.id));

  if (formIds.length === 0) {
    return {
      id: pokemonId,
      dexNumber: Number(row.dexNumber),
      slug: String(row.slug),
      nameZh: String(row.nameZh),
      nameJa: row.nameJa ? String(row.nameJa) : undefined,
      nameEn: row.nameEn ? String(row.nameEn) : undefined,
      primaryType: undefined,
      secondaryType: undefined,
      abilities: [],
      generations: [],
      forms: [],
      evolutionChain: [],
      source: buildSource(row),
    };
  }

  // 并行批量查询形态详情
  const [fsRows, ftRows, faRows, fiRows, evolutionChainResult, genRows] = await Promise.all([
    db.select({
      formId: pokemonFormStats.formId,
      generationStart: pokemonFormStats.generationStart,
      generationEnd: pokemonFormStats.generationEnd,
      hp: pokemonFormStats.hp, atk: pokemonFormStats.atk, def: pokemonFormStats.def,
      spa: pokemonFormStats.spa, spd: pokemonFormStats.spd, spe: pokemonFormStats.spe,
    }).from(pokemonFormStats)
      .where(inArray(pokemonFormStats.formId, formIds))
      .orderBy(asc(pokemonFormStats.formId), asc(pokemonFormStats.generationStart)),

    db.select({
      formId: pokemonFormTypes.formId,
      typeName: pokemonFormTypes.typeName,
      slot: pokemonFormTypes.slot,
      generationStart: pokemonFormTypes.generationStart,
      generationEnd: pokemonFormTypes.generationEnd,
    }).from(pokemonFormTypes)
      .where(inArray(pokemonFormTypes.formId, formIds))
      .orderBy(asc(pokemonFormTypes.formId), asc(pokemonFormTypes.generationStart), asc(pokemonFormTypes.slot)),

    db.select({
      formId: pokemonFormAbilities.formId,
      abilityNameZh: pokemonFormAbilities.abilityNameZh,
      isHidden: pokemonFormAbilities.isHidden,
      slot: pokemonFormAbilities.slot,
      generationStart: pokemonFormAbilities.generationStart,
      generationEnd: pokemonFormAbilities.generationEnd,
      abilityId: abilities.id,
      abilityDescription: abilities.description,
    }).from(pokemonFormAbilities)
      .leftJoin(abilities, eq(abilities.id, pokemonFormAbilities.abilityId))
      .where(inArray(pokemonFormAbilities.formId, formIds))
      .orderBy(asc(pokemonFormAbilities.formId), asc(pokemonFormAbilities.generationStart), asc(pokemonFormAbilities.slot)),

    db.select({
      formId: pokemonFormImages.formId,
      imageKind: pokemonFormImages.imageKind,
      url: pokemonFormImages.url,
      alt: pokemonFormImages.alt,
    }).from(pokemonFormImages)
      .where(inArray(pokemonFormImages.formId, formIds)),

    getPokemonEvolutionChainRows(db, pokemonId),

    db.select({ generation: pokemonGenerationRegions.generation })
      .from(pokemonGenerationRegions)
      .where(eq(pokemonGenerationRegions.pokemonId, pokemonId))
      .orderBy(asc(pokemonGenerationRegions.generation)),
  ]);

  // 构建形态种族值 Map
  const fsMap = new Map<number, Array<{ genStart?: number; genEnd?: number; stats: StatBlock }>>();
  for (const r of fsRows) {
    const fid = Number(r.formId);
    if (!fsMap.has(fid)) fsMap.set(fid, []);
    fsMap.get(fid)!.push({
      genStart: r.generationStart != null ? Number(r.generationStart) : undefined,
      genEnd: r.generationEnd != null ? Number(r.generationEnd) : undefined,
      stats: buildStatBlock(r)!,
    });
  }

  // 构建形态属性 Map（按世代分组）
  const ftMap = new Map<number, Array<{ genStart?: number; genEnd?: number; types: string[] }>>();
  for (const r of ftRows) {
    const fid = Number(r.formId);
    const genStart = r.generationStart != null ? Number(r.generationStart) : undefined;
    const genEnd = r.generationEnd != null ? Number(r.generationEnd) : undefined;
    if (!ftMap.has(fid)) ftMap.set(fid, []);
    const arr = ftMap.get(fid)!;
    let group = arr.find((g) => g.genStart === genStart && g.genEnd === genEnd);
    if (!group) { group = { genStart, genEnd, types: [] }; arr.push(group); }
    group.types.push(String(r.typeName));
  }

  // 构建形态特性 Map（按世代分组）
  const faMap = new Map<number, Array<{
    genStart?: number; genEnd?: number;
    abilities: Array<{ nameZh: string; isHidden: boolean; abilityId?: number; description?: string }>;
  }>>();
  for (const r of faRows) {
    const fid = Number(r.formId);
    const genStart = r.generationStart != null ? Number(r.generationStart) : undefined;
    const genEnd = r.generationEnd != null ? Number(r.generationEnd) : undefined;
    if (!faMap.has(fid)) faMap.set(fid, []);
    const arr = faMap.get(fid)!;
    let group = arr.find((g) => g.genStart === genStart && g.genEnd === genEnd);
    if (!group) { group = { genStart, genEnd, abilities: [] }; arr.push(group); }
    group.abilities.push({
      nameZh: String(r.abilityNameZh),
      isHidden: Boolean(Number(r.isHidden)),
      abilityId: r.abilityId != null ? Number(r.abilityId) : undefined,
      description: r.abilityDescription ? String(r.abilityDescription) : undefined,
    });
  }

  // 构建形态图片 Map
  const fiMap = new Map<number, Record<string, ImageAsset>>();
  for (const r of fiRows) {
    const fid = Number(r.formId);
    if (!fiMap.has(fid)) fiMap.set(fid, {});
    fiMap.get(fid)![String(r.imageKind)] = {
      url: String(r.url),
      alt: r.alt ? String(r.alt) : undefined,
    };
  }

  // 组装形态列表
  const forms: PokemonFormEntry[] = formRows.map((f: any) => {
    const fid = Number(f.id);
    const statEntries = fsMap.get(fid) || [];
    const latestStat = statEntries.find((s) => s.genEnd === undefined) || statEntries[0];
    const typeEntries = ftMap.get(fid) || [];
    const latestType = typeEntries.find((t) => t.genEnd === undefined) || typeEntries[0];
    const abilityEntries = faMap.get(fid) || [];
    const latestAbility = abilityEntries.find((a) => a.genEnd === undefined) || abilityEntries[0];

    const entry: PokemonFormEntry = {
      id: fid,
      formKey: String(f.formKey),
      nameZh: String(f.nameZh),
      formType: String(f.formType),
      isDefault: Boolean(Number(f.isDefault)),
      sortOrder: Number(f.sortOrder),
      primaryType: latestType?.types[0],
      secondaryType: latestType?.types[1],
      abilities: latestAbility?.abilities || [],
      baseStats: latestStat?.stats,
      images: fiMap.get(fid) || {},
    };

    if (f.reqItemId) {
      entry.requiredItem = {
        id: String(f.reqItemId),
        nameZh: String(f.reqItemNameZh),
        slug: String(f.reqItemSlug),
        imageUrl: f.reqItemImageUrl ? String(f.reqItemImageUrl) : undefined,
      };
    }

    if (statEntries.length > 1) {
      entry.statVariants = statEntries.map((s) => ({
        generationStart: s.genStart, generationEnd: s.genEnd, baseStats: s.stats,
      }));
    }
    if (typeEntries.length > 1) {
      entry.typeVariants = typeEntries.map((t) => ({
        generationStart: t.genStart, generationEnd: t.genEnd,
        primaryType: t.types[0], secondaryType: t.types[1],
      }));
    }
    if (abilityEntries.length > 1) {
      entry.abilityVariants = abilityEntries.map((a) => ({
        generationStart: a.genStart, generationEnd: a.genEnd, abilities: a.abilities,
      }));
    }

    return entry;
  });

  const generations = [...new Set(genRows.map((r: any) => Number(r.generation)))];
  const defaultForm = forms.find((f) => f.isDefault) || forms[0];

  return {
    id: pokemonId,
    dexNumber: Number(row.dexNumber),
    slug: String(row.slug),
    nameZh: String(row.nameZh),
    nameJa: row.nameJa ? String(row.nameJa) : undefined,
    nameEn: row.nameEn ? String(row.nameEn) : undefined,
    primaryType: defaultForm?.primaryType,
    secondaryType: defaultForm?.secondaryType,
    abilities: defaultForm?.abilities.filter((a: any) => !a.isHidden).map((a: any) => a.nameZh) || [],
    hiddenAbility: defaultForm?.abilities.find((a: any) => a.isHidden)?.nameZh,
    baseStats: defaultForm?.baseStats,
    image: defaultForm?.images.official,
    shinyImage: defaultForm?.images.shiny,
    generations,
    category: row.category ? String(row.category) : undefined,
    heightM: row.heightM != null ? Number(row.heightM) : undefined,
    weightKg: row.weightKg != null ? Number(row.weightKg) : undefined,
    forms,
    evolutionChain: evolutionChainResult,
    source: buildSource(row),
  };
}
