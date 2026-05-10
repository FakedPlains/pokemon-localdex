/**
 * @pokemon-localdex/drizzle-queries
 *
 * 统一的数据库查询逻辑，基于 Drizzle ORM。
 * sqlite-store 和 d1-store 只需传入各自的 drizzle 实例即可复用全部查询。
 *
 * 所有方法均为 async（Drizzle 的 node:sqlite driver 也支持 async API）。
 */

import { eq, like, and, or, sql, inArray, isNull, desc, asc } from "drizzle-orm";
import type { SQL, SQLiteColumn } from "drizzle-orm";
import type { SQLiteSelectQueryBuilder } from "drizzle-orm/sqlite-core";

import {
  pokemon,
  pokemonForms,
  pokemonFormStats,
  pokemonFormTypes,
  pokemonFormAbilities,
  pokemonFormImages,
  evolutionChains,
  pokemonGenerationRegions,
  pokemonLearnsets,
  moves,
  moveGenerationRecords,
  abilities,
  abilityGenerationRecords,
  items,
  itemGenerationRecords,
  battleTeams,
} from "@pokemon-localdex/drizzle-schema";

import type {
  StatBlock,
  ImageAsset,
  PokemonFormEntry,
  EvolutionStep,
  PokemonSummary,
  PokemonEntry,
  MoveEntry,
  MoveGenerationRecord,
  AbilityEntry,
  AbilityGenerationRecord,
  ItemEntry,
  ItemGenerationRecord,
  LearnsetRecord,
  BattleTeam,
  PaginationParams,
  PaginatedResult,
  IStore,
} from "@pokemon-localdex/store-types";

import {
  GAME_VERSION_NAMES,
  statBlockFromRow,
  sourceFromRow,
} from "@pokemon-localdex/store-types";

// ══════════════════════════════════════════════════════════════════════════════
// 辅助函数
// ══════════════════════════════════════════════════════════════════════════════

function buildStatBlock(row: Record<string, unknown>): StatBlock | undefined {
  if (row.hp == null) return undefined;
  return {
    hp: Number(row.hp), atk: Number(row.atk), def: Number(row.def),
    spa: Number(row.spa), spd: Number(row.spd), spe: Number(row.spe),
  };
}

function buildSource(row: Record<string, unknown>) {
  return (row.sourceUrl || row.sourceTitle || row.sourceFetchedAt)
    ? {
        url: String(row.sourceUrl ?? ""),
        title: String(row.sourceTitle ?? ""),
        fetchedAt: String(row.sourceFetchedAt ?? ""),
      }
    : undefined;
}

function hydrateGenRecord(r: Record<string, unknown>) {
  const code = r.gameVersionCode ? String(r.gameVersionCode) : undefined;
  return {
    generation: Number(r.generation),
    gameVersionCode: code,
    gameVersionName: code ? GAME_VERSION_NAMES.get(code) : undefined,
    versionExclusive: Number(r.versionExclusive) === 1,
    description: r.description ? String(r.description) : "",
    notes: r.notes ? String(r.notes) : undefined,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// DrizzleStore — 实现 IStore 接口
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 基于 Drizzle ORM 的统一 Store 实现。
 * 构造时传入 drizzle() 返回的 db 实例（node-sqlite 或 d1 均可）。
 */
export class DrizzleStore implements IStore {
  private db: any;
  constructor(db: any) {
    this.db = db;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Pokemon: listPokemon
  // ────────────────────────────────────────────────────────────────────────────

  async listPokemon(
    filters?: { query?: string; type?: string | string[]; generation?: number } & PaginationParams,
  ): Promise<PaginatedResult<PokemonSummary & { _chainId?: number }> | Array<PokemonSummary & { _chainId?: number }>> {
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
      conditions.push(
        sql`EXISTS (SELECT 1 FROM pokemon_generation_regions pgr WHERE pgr.pokemon_id = ${pokemon.id} AND pgr.generation = ${filters.generation})`,
      );
    }

    const where = conditions.length ? and(...conditions) : undefined;
    const usePagination = filters?.limit !== undefined;

    let total = 0;
    if (usePagination) {
      const countRows = await this.db
        .select({ cnt: sql<number>`COUNT(*)` })
        .from(pokemon)
        .innerJoin(pokemonForms, and(eq(pokemonForms.pokemonId, pokemon.id), eq(pokemonForms.isDefault, 1)))
        .where(where);
      total = Number(countRows[0]?.cnt ?? 0);
    }

    let query = this.db
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
      .orderBy(asc(pokemon.dexNumber));

    if (usePagination) {
      query = query.limit(Number(filters!.limit)).offset(Number(filters?.offset ?? 0));
    }

    const rows: any[] = await query;

    if (rows.length === 0) {
      return usePagination ? { items: [], total } : [];
    }

    const formIds = rows.map((r: any) => Number(r.formId));
    const pokemonIds = rows.map((r: any) => Number(r.id));

    // 批量查询：属性、特性、图片、世代、进化链
    const [typeRows, abilityRows, imageRows, genRows, evoRows] = await Promise.all([
      this.db.select({
        formId: pokemonFormTypes.formId,
        typeName: pokemonFormTypes.typeName,
        slot: pokemonFormTypes.slot,
      }).from(pokemonFormTypes)
        .where(inArray(pokemonFormTypes.formId, formIds))
        .orderBy(asc(pokemonFormTypes.formId), asc(pokemonFormTypes.slot)),

      this.db.select({
        formId: pokemonFormAbilities.formId,
        abilityNameZh: pokemonFormAbilities.abilityNameZh,
        isHidden: pokemonFormAbilities.isHidden,
      }).from(pokemonFormAbilities)
        .where(inArray(pokemonFormAbilities.formId, formIds))
        .orderBy(asc(pokemonFormAbilities.formId), asc(pokemonFormAbilities.slot)),

      this.db.select({
        formId: pokemonFormImages.formId,
        imageKind: pokemonFormImages.imageKind,
        url: pokemonFormImages.url,
        alt: pokemonFormImages.alt,
      }).from(pokemonFormImages)
        .where(inArray(pokemonFormImages.formId, formIds)),

      this.db.select({
        pokemonId: pokemonGenerationRegions.pokemonId,
        generation: pokemonGenerationRegions.generation,
      }).from(pokemonGenerationRegions)
        .where(inArray(pokemonGenerationRegions.pokemonId, pokemonIds))
        .orderBy(asc(pokemonGenerationRegions.pokemonId), asc(pokemonGenerationRegions.generation)),

      this.db.select({
        chainId: evolutionChains.chainId,
        toPokemonId: evolutionChains.toPokemonId,
      }).from(evolutionChains)
        .where(inArray(evolutionChains.toPokemonId, pokemonIds)),
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

    const genMap = new Map<number, number[]>();
    for (const r of genRows) {
      const pid = Number(r.pokemonId);
      if (!genMap.has(pid)) genMap.set(pid, []);
      const num = Number(r.generation);
      if (!genMap.get(pid)!.includes(num)) genMap.get(pid)!.push(num);
    }

    const chainMap = new Map<number, number>();
    for (const r of evoRows) {
      chainMap.set(Number(r.toPokemonId), Number(r.chainId));
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
        generations: genMap.get(pid) || [],
        _chainId: chainMap.get(pid),
      } as PokemonSummary & { _chainId?: number };
    });

    return usePagination ? { items: resultItems, total } : resultItems;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Pokemon: getPokemon
  // ────────────────────────────────────────────────────────────────────────────

  async getPokemon(idOrSlug: string): Promise<PokemonEntry | undefined> {
    const rows = await this.db
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

    // 查询所有形态（含绑定道具）
    const formRows: any[] = await this.db
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
    const [fsRows, ftRows, faRows, fiRows, chainRows, genRows] = await Promise.all([
      this.db.select({
        formId: pokemonFormStats.formId,
        generationStart: pokemonFormStats.generationStart,
        generationEnd: pokemonFormStats.generationEnd,
        hp: pokemonFormStats.hp, atk: pokemonFormStats.atk, def: pokemonFormStats.def,
        spa: pokemonFormStats.spa, spd: pokemonFormStats.spd, spe: pokemonFormStats.spe,
      }).from(pokemonFormStats)
        .where(inArray(pokemonFormStats.formId, formIds))
        .orderBy(asc(pokemonFormStats.formId), asc(pokemonFormStats.generationStart)),

      this.db.select({
        formId: pokemonFormTypes.formId,
        typeName: pokemonFormTypes.typeName,
        slot: pokemonFormTypes.slot,
        generationStart: pokemonFormTypes.generationStart,
        generationEnd: pokemonFormTypes.generationEnd,
      }).from(pokemonFormTypes)
        .where(inArray(pokemonFormTypes.formId, formIds))
        .orderBy(asc(pokemonFormTypes.formId), asc(pokemonFormTypes.generationStart), asc(pokemonFormTypes.slot)),

      this.db.select({
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

      this.db.select({
        formId: pokemonFormImages.formId,
        imageKind: pokemonFormImages.imageKind,
        url: pokemonFormImages.url,
        alt: pokemonFormImages.alt,
      }).from(pokemonFormImages)
        .where(inArray(pokemonFormImages.formId, formIds)),

      this.db.select({ chainId: evolutionChains.chainId })
        .from(evolutionChains)
        .where(eq(evolutionChains.toPokemonId, pokemonId))
        .limit(1),

      this.db.select({ generation: pokemonGenerationRegions.generation })
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

    // 进化链
    let evolutionChainResult: EvolutionStep[] = [];
    if (chainRows.length > 0) {
      const chainId = Number(chainRows[0].chainId);

      // 进化链查询：使用 Drizzle query builder 进行多表 JOIN
      // pokemon 表出现两次（from/to），通过 sql 模板别名区分
      const evoRows: any[] = await this.db
        .select({
          fromPokemonId: evolutionChains.fromPokemonId,
          toPokemonId: evolutionChains.toPokemonId,
          fromFormKey: evolutionChains.fromFormKey,
          toFormKey: evolutionChains.toFormKey,
          stage: evolutionChains.stage,
          evolutionMethod: evolutionChains.evolutionMethod,
          evolutionCondition: evolutionChains.evolutionCondition,
          evolutionItem: evolutionChains.evolutionItem,
          evolutionLevel: evolutionChains.evolutionLevel,
          fromName: sql<string>`pf_from.name_zh`,
          toName: sql<string>`pt_to.name_zh`,
          toImageUrl: sql<string>`fi_to.url`,
          toImageAlt: sql<string>`fi_to.alt`,
        })
        .from(evolutionChains)
        .leftJoin(sql`pokemon pf_from`, sql`pf_from.id = ${evolutionChains.fromPokemonId}`)
        .leftJoin(sql`pokemon pt_to`, sql`pt_to.id = ${evolutionChains.toPokemonId}`)
        .leftJoin(
          sql`pokemon_forms pf_to_form`,
          sql`pf_to_form.pokemon_id = ${evolutionChains.toPokemonId} AND pf_to_form.is_default = 1`,
        )
        .leftJoin(
          sql`pokemon_form_images fi_to`,
          sql`fi_to.form_id = pf_to_form.id AND fi_to.image_kind = 'official'`,
        )
        .where(eq(evolutionChains.chainId, chainId))
        .orderBy(asc(evolutionChains.sortOrder));

      // 批量获取进化链中所有 to_pokemon 的属性
      const toPokemonIds = [...new Set(evoRows.map((e: any) => Number(e.toPokemonId)))];

      let evoTypeRows: any[] = [];
      if (toPokemonIds.length > 0) {
        evoTypeRows = await this.db
          .select({
            pokemonId: pokemonForms.pokemonId,
            typeName: pokemonFormTypes.typeName,
          })
          .from(pokemonForms)
          .innerJoin(pokemonFormTypes, eq(pokemonFormTypes.formId, pokemonForms.id))
          .where(and(inArray(pokemonForms.pokemonId, toPokemonIds), eq(pokemonForms.isDefault, 1)))
          .orderBy(asc(pokemonForms.pokemonId), asc(pokemonFormTypes.slot));
      }

      const evoTypeMap = new Map<number, string[]>();
      for (const r of evoTypeRows) {
        const pid = Number(r.pokemonId);
        if (!evoTypeMap.has(pid)) evoTypeMap.set(pid, []);
        evoTypeMap.get(pid)!.push(String(r.typeName));
      }

      evolutionChainResult = evoRows.map((e: any) => ({
        fromPokemonId: e.fromPokemonId ? Number(e.fromPokemonId) : undefined,
        fromNameZh: e.fromName ? String(e.fromName) : undefined,
        fromFormKey: e.fromFormKey ? String(e.fromFormKey) : undefined,
        toPokemonId: Number(e.toPokemonId),
        toNameZh: String(e.toName),
        toFormKey: e.toFormKey ? String(e.toFormKey) : undefined,
        stage: Number(e.stage),
        method: e.evolutionMethod ? String(e.evolutionMethod) : undefined,
        condition: e.evolutionCondition ? String(e.evolutionCondition) : undefined,
        item: e.evolutionItem ? String(e.evolutionItem) : undefined,
        level: e.evolutionLevel != null ? Number(e.evolutionLevel) : undefined,
        toTypes: evoTypeMap.get(Number(e.toPokemonId)) || [],
        toImage: e.toImageUrl
          ? { url: String(e.toImageUrl), alt: e.toImageAlt ? String(e.toImageAlt) : undefined }
          : undefined,
      }));
    }

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

  // ────────────────────────────────────────────────────────────────────────────
  // Pokemon: getLearnsetMeta
  // ────────────────────────────────────────────────────────────────────────────

  async getLearnsetMeta(pokemonId: number) {
    const [genRows, formRows, versionRows] = await Promise.all([
      this.db.selectDistinct({ generation: pokemonLearnsets.generation })
        .from(pokemonLearnsets)
        .where(eq(pokemonLearnsets.pokemonId, pokemonId))
        .orderBy(asc(pokemonLearnsets.generation)),

      this.db.selectDistinct({ formKey: pokemonLearnsets.formKey })
        .from(pokemonLearnsets)
        .where(eq(pokemonLearnsets.pokemonId, pokemonId))
        .orderBy(asc(pokemonLearnsets.formKey)),

      this.db.selectDistinct({
        generation: pokemonLearnsets.generation,
        gameVersionCode: pokemonLearnsets.gameVersionCode,
      })
        .from(pokemonLearnsets)
        .where(and(
          eq(pokemonLearnsets.pokemonId, pokemonId),
          sql`${pokemonLearnsets.gameVersionCode} IS NOT NULL AND ${pokemonLearnsets.gameVersionCode} != ''`,
        ))
        .orderBy(asc(pokemonLearnsets.generation), asc(pokemonLearnsets.gameVersionCode)),
    ]);

    const versionsByGen: Record<number, Array<{ code: string; name: string }>> = {};
    for (const r of versionRows) {
      const gen = Number(r.generation);
      const code = String(r.gameVersionCode);
      if (!versionsByGen[gen]) versionsByGen[gen] = [];
      versionsByGen[gen].push({ code, name: GAME_VERSION_NAMES.get(code) || code });
    }

    return {
      generations: genRows.map((r: any) => Number(r.generation)),
      formKeys: formRows.map((r: any) => String(r.formKey)),
      versionsByGen,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Pokemon: getPokemonLearnset
  // ────────────────────────────────────────────────────────────────────────────

  async getPokemonLearnset(
    pokemonId: number,
    generation: number,
    formKey = "default",
    gameVersionCode?: string,
  ): Promise<{ moves: LearnsetRecord[]; formKey: string; gameVersionCode?: string }> {
    const queryLearnset = async (pid: number, gen: number, fk: string) => {
      const conditions: SQL[] = [
        eq(pokemonLearnsets.pokemonId, pid),
        eq(pokemonLearnsets.generation, gen),
        eq(pokemonLearnsets.formKey, fk),
      ];

      if (gameVersionCode !== undefined) {
        if (gameVersionCode === "") {
          conditions.push(
            sql`(${pokemonLearnsets.gameVersionCode} IS NULL OR ${pokemonLearnsets.gameVersionCode} = '')`,
          );
        } else {
          conditions.push(eq(pokemonLearnsets.gameVersionCode, gameVersionCode));
        }
      }

      return this.db
        .select({
          moveNameZh: pokemonLearnsets.moveNameZh,
          learnMethod: pokemonLearnsets.learnMethod,
          level: pokemonLearnsets.level,
          tmNumber: pokemonLearnsets.tmNumber,
          gameVersionCode: pokemonLearnsets.gameVersionCode,
          moveId: moves.id,
          typeName: moves.typeName,
          moveCategory: moves.category,
          movePower: moves.power,
          moveAccuracy: moves.accuracy,
          movePP: moves.pp,
          moveDescription: moves.description,
        })
        .from(pokemonLearnsets)
        .leftJoin(moves, eq(moves.id, pokemonLearnsets.moveId))
        .where(and(...conditions))
        .orderBy(asc(pokemonLearnsets.learnMethod), asc(pokemonLearnsets.sortOrder));
    };

    // 先尝试指定的 formKey
    let rows = await queryLearnset(pokemonId, generation, formKey);
    let usedFormKey = formKey;

    // Fallback: 如果指定形态没有数据，尝试 default
    if (rows.length === 0 && formKey !== "default") {
      rows = await queryLearnset(pokemonId, generation, "default");
      if (rows.length > 0) usedFormKey = "default";
    }

    // Fallback: 如果 default 也没有数据，取该宝可梦在该世代的第一个可用 form_key
    if (rows.length === 0) {
      const firstFormRows = await this.db
        .selectDistinct({ formKey: pokemonLearnsets.formKey })
        .from(pokemonLearnsets)
        .where(and(eq(pokemonLearnsets.pokemonId, pokemonId), eq(pokemonLearnsets.generation, generation)))
        .limit(1);

      if (firstFormRows.length > 0) {
        const fallbackKey = String(firstFormRows[0].formKey);
        rows = await queryLearnset(pokemonId, generation, fallbackKey);
        if (rows.length > 0) usedFormKey = fallbackKey;
      }
    }

    return {
      formKey: usedFormKey,
      gameVersionCode: gameVersionCode ?? null as any,
      moves: rows.map((r: any) => ({
        moveId: r.moveId != null ? Number(r.moveId) : undefined,
        moveNameZh: String(r.moveNameZh),
        learnMethod: String(r.learnMethod),
        level: r.level != null ? Number(r.level) : undefined,
        tmNumber: r.tmNumber ? String(r.tmNumber) : undefined,
        moveType: r.typeName ? String(r.typeName) : undefined,
        moveCategory: r.moveCategory ? String(r.moveCategory) : undefined,
        movePower: r.movePower != null ? Number(r.movePower) : undefined,
        moveAccuracy: r.moveAccuracy != null ? Number(r.moveAccuracy) : undefined,
        movePP: r.movePP != null ? Number(r.movePP) : undefined,
        moveDescription: r.moveDescription ? String(r.moveDescription) : undefined,
      } as LearnsetRecord)),
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Moves: hydrateMoveRow (private)
  // ────────────────────────────────────────────────────────────────────────────

  private async hydrateMoveRow(row: any): Promise<MoveEntry> {
    const genRows = await this.db
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

  // ────────────────────────────────────────────────────────────────────────────
  // Moves: listMoves
  // ────────────────────────────────────────────────────────────────────────────

  async listMoves(
    filters?: { query?: string; type?: string; category?: string; generation?: number } & PaginationParams,
  ): Promise<PaginatedResult<MoveEntry> | MoveEntry[]> {
    const conditions: SQL[] = [];

    if (filters?.query) {
      const v = `%${filters.query}%`;
      conditions.push(
        or(
          like(moves.nameZh, v),
          like(moves.nameJa, v),
          like(moves.nameEn, v),
          like(sql`CAST(${moves.id} AS TEXT)`, v),
        )!,
      );
    }
    if (filters?.type) {
      conditions.push(eq(moves.typeName, filters.type));
    }
    if (filters?.category) {
      conditions.push(eq(moves.category, filters.category));
    }
    if (filters?.generation) {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM move_generation_records mgr WHERE mgr.move_id = ${moves.id} AND mgr.generation = ${filters.generation})`,
      );
    }

    const where = conditions.length ? and(...conditions) : undefined;
    const usePagination = filters?.limit !== undefined;

    let total = 0;
    if (usePagination) {
      const countRows = await this.db
        .select({ cnt: sql<number>`COUNT(*)` })
        .from(moves)
        .where(where);
      total = Number(countRows[0]?.cnt ?? 0);
    }

    let query = this.db
      .select()
      .from(moves)
      .where(where)
      .orderBy(asc(moves.nameZh));

    if (usePagination) {
      query = query.limit(Number(filters!.limit)).offset(Number(filters?.offset ?? 0));
    }

    const rows: any[] = await query;
    const items = await Promise.all(rows.map((r: any) => this.hydrateMoveRow(r)));
    return usePagination ? { items, total } : items;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Moves: getMove
  // ────────────────────────────────────────────────────────────────────────────

  async getMove(idOrSlug: string): Promise<MoveEntry | undefined> {
    const rows = await this.db
      .select()
      .from(moves)
      .where(or(eq(moves.id, Number(idOrSlug) || 0), eq(moves.nameZh, idOrSlug)))
      .limit(1);

    return rows[0] ? this.hydrateMoveRow(rows[0]) : undefined;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Moves: getPokemonByMove
  // ────────────────────────────────────────────────────────────────────────────

  async getPokemonByMove(moveId: number, pagination?: { limit?: number; offset?: number }): Promise<any[] | { items: any[]; total: number }> {
    const usePagination = pagination?.limit !== undefined;

    // 基础查询（不含 LIMIT/OFFSET，用于 count 和全量）
    const baseWhere = eq(pokemonLearnsets.moveId, moveId);

    // 如果需要分页，先查 total
    let total = 0;
    if (usePagination) {
      const countRows: any[] = await this.db
        .select({ cnt: sql<number>`COUNT(DISTINCT ${pokemon.id})` })
        .from(pokemonLearnsets)
        .innerJoin(pokemon, eq(pokemon.id, pokemonLearnsets.pokemonId))
        .where(baseWhere);
      total = Number(countRows[0]?.cnt ?? 0);
      if (total === 0) return { items: [], total: 0 };
    }

    // 使用 Drizzle query builder + sql 片段处理 GROUP_CONCAT
    let query = this.db
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

    const formIds = rows.map((r: any) => Number(r.formId));

    const [typeRows, imageRows] = await Promise.all([
      this.db.select({
        formId: pokemonFormTypes.formId,
        typeName: pokemonFormTypes.typeName,
        slot: pokemonFormTypes.slot,
      }).from(pokemonFormTypes)
        .where(and(inArray(pokemonFormTypes.formId, formIds), isNull(pokemonFormTypes.generationEnd)))
        .orderBy(asc(pokemonFormTypes.formId), asc(pokemonFormTypes.slot)),

      this.db.select({
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

    const items = rows.map((row: any) => {
      const fid = Number(row.formId);
      const types = typeMap.get(fid) || [];
      return {
        id: Number(row.id),
        dexNumber: Number(row.dexNumber),
        slug: String(row.slug),
        nameZh: String(row.nameZh),
        nameJa: row.nameJa ? String(row.nameJa) : undefined,
        nameEn: row.nameEn ? String(row.nameEn) : undefined,
        primaryType: types[0],
        secondaryType: types[1],
        learnMethods: row.learnMethods ? String(row.learnMethods).split(",") : [],
        image: imageMap.get(fid),
      };
    });

    return usePagination ? { items, total } : items;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Abilities: hydrateAbilityRow (private)
  // ────────────────────────────────────────────────────────────────────────────

  private async hydrateAbilityRow(row: any): Promise<AbilityEntry> {
    const genRows = await this.db
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

  // ────────────────────────────────────────────────────────────────────────────
  // Abilities: listAbilities
  // ────────────────────────────────────────────────────────────────────────────

  async listAbilities(
    filters?: { query?: string; generation?: number } & PaginationParams,
  ): Promise<PaginatedResult<AbilityEntry> | AbilityEntry[]> {
    const conditions: SQL[] = [];

    if (filters?.query) {
      const v = `%${filters.query}%`;
      conditions.push(
        or(
          like(abilities.nameZh, v),
          like(abilities.nameJa, v),
          like(abilities.nameEn, v),
        )!,
      );
    }
    if (filters?.generation) {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM ability_generation_records agr WHERE agr.ability_id = ${abilities.id} AND agr.generation = ${filters.generation})`,
      );
    }

    const where = conditions.length ? and(...conditions) : undefined;
    const usePagination = filters?.limit !== undefined;

    let total = 0;
    if (usePagination) {
      const countRows = await this.db
        .select({ cnt: sql<number>`COUNT(*)` })
        .from(abilities)
        .where(where);
      total = Number(countRows[0]?.cnt ?? 0);
    }

    let query = this.db
      .select()
      .from(abilities)
      .where(where)
      .orderBy(asc(abilities.number), asc(abilities.nameZh));

    if (usePagination) {
      query = query.limit(Number(filters!.limit)).offset(Number(filters?.offset ?? 0));
    }

    const rows: any[] = await query;
    const items = await Promise.all(rows.map((r: any) => this.hydrateAbilityRow(r)));
    return usePagination ? { items, total } : items;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Abilities: getAbility
  // ────────────────────────────────────────────────────────────────────────────

  async getAbility(idOrName: string): Promise<AbilityEntry | undefined> {
    const rows = await this.db
      .select()
      .from(abilities)
      .where(or(eq(abilities.id, Number(idOrName) || 0), eq(abilities.nameZh, idOrName)))
      .limit(1);

    return rows[0] ? this.hydrateAbilityRow(rows[0]) : undefined;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Abilities: getPokemonByAbility
  // ────────────────────────────────────────────────────────────────────────────

  async getPokemonByAbility(abilityId: number, pagination?: { limit?: number; offset?: number }): Promise<any[] | { items: any[]; total: number }> {
    const usePagination = pagination?.limit !== undefined;
    const baseWhere = eq(pokemonFormAbilities.abilityId, abilityId);

    // 如果需要分页，先查 total
    let total = 0;
    if (usePagination) {
      const countRows: any[] = await this.db
        .select({ cnt: sql<number>`COUNT(DISTINCT ${pokemon.id})` })
        .from(pokemonFormAbilities)
        .innerJoin(pokemonForms, and(eq(pokemonForms.id, pokemonFormAbilities.formId), eq(pokemonForms.isDefault, 1)))
        .innerJoin(pokemon, eq(pokemon.id, pokemonForms.pokemonId))
        .where(baseWhere);
      total = Number(countRows[0]?.cnt ?? 0);
      if (total === 0) return { items: [], total: 0 };
    }

    let query = this.db
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

    const formIds = rows.map((r: any) => Number(r.formId));

    const [typeRows, imageRows] = await Promise.all([
      this.db.select({
        formId: pokemonFormTypes.formId,
        typeName: pokemonFormTypes.typeName,
        slot: pokemonFormTypes.slot,
      }).from(pokemonFormTypes)
        .where(and(inArray(pokemonFormTypes.formId, formIds), isNull(pokemonFormTypes.generationEnd)))
        .orderBy(asc(pokemonFormTypes.formId), asc(pokemonFormTypes.slot)),

      this.db.select({
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

    const items = rows.map((row: any) => {
      const fid = Number(row.formId);
      const types = typeMap.get(fid) || [];
      return {
        id: Number(row.id),
        dexNumber: Number(row.dexNumber),
        slug: String(row.slug),
        nameZh: String(row.nameZh),
        nameJa: row.nameJa ? String(row.nameJa) : undefined,
        nameEn: row.nameEn ? String(row.nameEn) : undefined,
        primaryType: types[0],
        secondaryType: types[1],
        isHidden: !!Number(row.isHidden),
        image: imageMap.get(fid),
      };
    });

    return usePagination ? { items, total } : items;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Items: hydrateItemRow (private)
  // ────────────────────────────────────────────────────────────────────────────

  private async hydrateItemRow(row: any): Promise<ItemEntry> {
    const genRows = await this.db
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

  // ────────────────────────────────────────────────────────────────────────────
  // Items: listItems
  // ────────────────────────────────────────────────────────────────────────────

  async listItems(
    filters?: { query?: string; category?: string } & PaginationParams,
  ): Promise<PaginatedResult<ItemEntry> | ItemEntry[]> {
    const conditions: SQL[] = [];

    if (filters?.query) {
      const v = `%${filters.query}%`;
      conditions.push(
        or(
          like(items.nameZh, v),
          like(items.nameJa, v),
          like(items.nameEn, v),
          like(items.slug, v),
          like(items.effectSummary, v),
        )!,
      );
    }
    if (filters?.category) {
      conditions.push(eq(items.category, filters.category));
    }

    const where = conditions.length ? and(...conditions) : undefined;
    const usePagination = filters?.limit !== undefined;

    let total = 0;
    if (usePagination) {
      const countRows = await this.db
        .select({ cnt: sql<number>`COUNT(*)` })
        .from(items)
        .where(where);
      total = Number(countRows[0]?.cnt ?? 0);
    }

    let query = this.db
      .select()
      .from(items)
      .where(where)
      .orderBy(asc(items.id));

    if (usePagination) {
      query = query.limit(Number(filters!.limit)).offset(Number(filters?.offset ?? 0));
    }

    const rows: any[] = await query;
    const resultItems = await Promise.all(rows.map((r: any) => this.hydrateItemRow(r)));
    return usePagination ? { items: resultItems, total } : resultItems;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Items: getItem
  // ────────────────────────────────────────────────────────────────────────────

  async getItem(idOrSlug: string): Promise<ItemEntry | undefined> {
    const rows = await this.db
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

    return rows[0] ? this.hydrateItemRow(rows[0]) : undefined;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Teams: listTeams / saveTeam / deleteTeam
  // ────────────────────────────────────────────────────────────────────────────

  async listTeams(): Promise<BattleTeam[]> {
    const rows = await this.db
      .select()
      .from(battleTeams)
      .orderBy(desc(battleTeams.createdAt));

    return rows.map((r: any) => ({
      id: String(r.id),
      name: String(r.name),
      format: String(r.format),
      members: JSON.parse(String(r.membersJson || "[]")),
      createdAt: String(r.createdAt),
      updatedAt: String(r.updatedAt),
    }));
  }

  async saveTeam(input: Partial<BattleTeam>): Promise<BattleTeam> {
    const now = new Date().toISOString();
    const id = input.id ?? `team_${Date.now()}`;
    const name = input.name ?? "未命名队伍";
    const format = input.format ?? "singles";
    const membersJson = JSON.stringify(input.members ?? []);
    const createdAt = input.createdAt ?? now;

    // UPSERT via raw sql (Drizzle's onConflictDoUpdate)
    await this.db
      .insert(battleTeams)
      .values({
        id,
        name,
        format,
        membersJson,
        createdAt,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: battleTeams.id,
        set: {
          name,
          format,
          membersJson,
          updatedAt: now,
        },
      });

    return { id, name, format, members: input.members ?? [], createdAt, updatedAt: now };
  }

  async deleteTeam(id: string): Promise<void> {
    await this.db.delete(battleTeams).where(eq(battleTeams.id, id));
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 工厂函数
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 创建 DrizzleStore 实例。
 * @param db - drizzle() 返回的数据库实例（node-sqlite 或 d1 均可）
 */
export function createDrizzleStore(db: any): DrizzleStore {
  return new DrizzleStore(db);
}
