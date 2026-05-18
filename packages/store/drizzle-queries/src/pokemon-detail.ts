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
  EvolutionStep,
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

// ────────────────────────────────────────────────────────────────────────────
// 内部共享辅助函数
// ────────────────────────────────────────────────────────────────────────────

async function lookupPokemonRow(db: any, idOrSlug: string) {
  // 优先精确匹配 pokemon.id，避免 OR + LIMIT 1 在 id 与 dex_number 不一致时
  // 返回错误的行（SQLite 按 ROWID 顺序扫描，dex_number 匹配可能先于 id 匹配）
  const numericId = Number(idOrSlug) || 0;
  if (numericId > 0) {
    const byId = await db
      .select()
      .from(pokemon)
      .where(eq(pokemon.id, numericId))
      .limit(1);
    if (byId[0]) return byId[0];
  }

  // Fallback: slug / 中文名 / 图鉴编号
  const rows = await db
    .select()
    .from(pokemon)
    .where(
      or(
        eq(pokemon.slug, idOrSlug),
        eq(pokemon.nameZh, idOrSlug),
        eq(sql`CAST(${pokemon.dexNumber} AS TEXT)`, idOrSlug),
      ),
    )
    .limit(1);
  return rows[0] || undefined;
}

/**
 * 查询指定宝可梦的所有形态并构建 PokemonFormEntry[]。
 * 返回 undefined 表示没有形态数据。
 */
async function queryFormsAndBuild(
  db: any,
  row: any,
  pokemonId: number,
  championRows?: any[],
): Promise<PokemonFormEntry[] | undefined> {
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
  if (formIds.length === 0) return undefined;

  // 并行批量查询形态详情（种族值/属性/特性/图片）
  const [fsRows, ftRows, faRows, fiRows] = await Promise.all([
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
  return formRows.map((f: any) => {
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
}

function buildBaseFields(row: any, pokemonId: number, forms: PokemonFormEntry[]) {
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
    category: row.category ? String(row.category) : undefined,
    heightM: row.heightM != null ? Number(row.heightM) : undefined,
    weightKg: row.weightKg != null ? Number(row.weightKg) : undefined,
    forms,
    source: buildSource(row),
  };
}

function buildEmptyEntry(row: any, pokemonId: number): PokemonEntry {
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

// ────────────────────────────────────────────────────────────────────────────
// getPokemonSummaryRow — 轻量摘要，跳过 evolutionChain 和 generations
// 用于抽屉初始加载，减少 4 次 D1 查询
// ────────────────────────────────────────────────────────────────────────────

export type PokemonSummaryResult = Omit<PokemonEntry, "evolutionChain" | "generations">;

export async function getPokemonSummaryRow(
  db: any,
  idOrSlug: string,
  filters?: { championsSeasonId?: number },
): Promise<PokemonSummaryResult | undefined> {
  const row = await lookupPokemonRow(db, idOrSlug);
  if (!row) return undefined;

  const pokemonId = Number(row.id);
  const dexNumber = Number(row.dexNumber);

  const championRows = filters?.championsSeasonId !== undefined
    ? await championRegulationPokemonRows(db, filters.championsSeasonId, pokemonId, dexNumber)
    : undefined;
  if (filters?.championsSeasonId !== undefined && championRows?.length === 0) return undefined;

  const forms = await queryFormsAndBuild(db, row, pokemonId, championRows);
  if (!forms) {
    const { evolutionChain: _e, generations: _g, ...rest } = buildEmptyEntry(row, pokemonId);
    return rest;
  }

  return buildBaseFields(row, pokemonId, forms);
}

// ────────────────────────────────────────────────────────────────────────────
// getPokemonEvolutionRow — 独立的进化链查询
// ────────────────────────────────────────────────────────────────────────────

export async function getPokemonEvolutionRow(
  db: any,
  pokemonId: number,
): Promise<EvolutionStep[]> {
  return getPokemonEvolutionChainRows(db, pokemonId);
}

// ────────────────────────────────────────────────────────────────────────────
// getPokemonGenerationsRow — 独立的世代地区查询
// ────────────────────────────────────────────────────────────────────────────

export async function getPokemonGenerationsRow(
  db: any,
  pokemonId: number,
): Promise<number[]> {
  const genRows = await db.select({ generation: pokemonGenerationRegions.generation })
    .from(pokemonGenerationRegions)
    .where(eq(pokemonGenerationRegions.pokemonId, pokemonId))
    .orderBy(asc(pokemonGenerationRegions.generation));
  return [...new Set(genRows.map((r: any) => Number(r.generation)))];
}

// ────────────────────────────────────────────────────────────────────────────
// getPokemonRow — 完整详情（保留向后兼容，含 evolutionChain + generations）
// ────────────────────────────────────────────────────────────────────────────

export async function getPokemonRow(
  db: any,
  idOrSlug: string,
  filters?: { championsSeasonId?: number },
): Promise<PokemonEntry | undefined> {
  const row = await lookupPokemonRow(db, idOrSlug);
  if (!row) return undefined;

  const pokemonId = Number(row.id);
  const dexNumber = Number(row.dexNumber);

  const championRows = filters?.championsSeasonId !== undefined
    ? await championRegulationPokemonRows(db, filters.championsSeasonId, pokemonId, dexNumber)
    : undefined;
  if (filters?.championsSeasonId !== undefined && championRows?.length === 0) return undefined;

  const forms = await queryFormsAndBuild(db, row, pokemonId, championRows);
  if (!forms) return buildEmptyEntry(row, pokemonId);

  // 进化链和世代地区并行查询
  const [evolutionChain, generations] = await Promise.all([
    getPokemonEvolutionRow(db, pokemonId),
    getPokemonGenerationsRow(db, pokemonId),
  ]);

  return {
    ...buildBaseFields(row, pokemonId, forms),
    generations,
    evolutionChain,
  };
}
