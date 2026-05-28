/**
 * @pokemon-localdex/drizzle-queries
 *
 * 统一的数据库查询逻辑，基于 Drizzle ORM。
 * sqlite-store 和 d1-store 只需传入各自的 drizzle 实例即可复用全部查询。
 *
 * 所有方法均为 async（Drizzle 的 node:sqlite driver 也支持 async API）。
 */

import type {
  PokemonSummary,
  PokemonCardSummary,
  PokemonTableSummary,
  PokemonEntry,
  PokemonIdentity,
  EvolutionStep,
  ChampionsSeasonSummary,
  MoveEntry,
  AbilityEntry,
  ItemEntry,
  LearnsetRecord,
  LearnsetMeta,
  LearnsetQueryOptions,
  LearnsetResult,
  PokemonByMoveSummary,
  PokemonByAbilitySummary,
  PaginatedResult,
  PaginationParams,
  IStore,
} from "@pokemon-localdex/store-types";
import type {
  AbilityBattleEffect,
  ItemBattleEffect,
  MoveBattleEffect,
  MoveFlag,
} from "@pokemon-localdex/store-types/battle-effects";

import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

import {
  listAbilityRows,
  listItemRows,
  listMoveRows,
  type AbilityListFilters,
  type ItemListFilters,
  type MoveListFilters,
} from "./catalog-list.ts";
import {
  getAbilityRow,
  getItemRow,
  getMoveRow,
  getPokemonByAbilityRows,
  getPokemonByMoveRows,
} from "./catalog-detail.ts";
import { entityNameEnRow, pokemonNameEnRow, getDamageModifierRow } from "./battle-lookup.ts";
import {
  getAbilityBattleEffectRows,
  getItemBattleEffectRows,
  getMoveBattleEffectRows,
  getMoveFlagRows,
  getMoveFlagsBatch,
} from "./battle-effects.ts";
import {
  listPokemonCardRows,
  listPokemonTableRows,
  type PokemonListFilters,
} from "./pokemon-list.ts";
import {
  listPokemonRows,
  type PokemonSummaryListFilters,
} from "./pokemon-summary.ts";
import { listChampionsSeasonRows } from "./champions.ts";
import {
  getLearnsetMetaRows,
  getPokemonLearnsetRows,
} from "./learnsets.ts";
import {
  getPokemonIdentityRow,
  getPokemonRow,
  getPokemonSummaryRow,
  getPokemonEvolutionRow,
  type PokemonSummaryResult,
} from "./pokemon-detail.ts";

// ══════════════════════════════════════════════════════════════════════════════
// DrizzleStore — 实现 IStore 接口
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 基于 Drizzle ORM 的统一 Store 实现。
 * 构造时传入 drizzle() 返回的 db 实例（node-sqlite 或 d1 均可）。
 */
/** Drizzle db 实例类型，兼容 node:sqlite (sync) 和 D1 (async) 两种运行时 */
type DrizzleDb = BaseSQLiteDatabase<"sync" | "async", unknown>;

export class DrizzleStore implements IStore {
  private db: DrizzleDb;
  constructor(db: DrizzleDb) {
    this.db = db;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Pokemon: listPokemon
  // ────────────────────────────────────────────────────────────────────────────

  async listPokemonCards(filters?: PokemonListFilters): Promise<PaginatedResult<PokemonCardSummary> | PokemonCardSummary[]> {
    return listPokemonCardRows(this.db, filters);
  }

  async listPokemonTable(filters?: PokemonListFilters): Promise<PaginatedResult<PokemonTableSummary> | PokemonTableSummary[]> {
    return listPokemonTableRows(this.db, filters);
  }

  async listPokemon(filters?: PokemonSummaryListFilters): Promise<PaginatedResult<PokemonSummary> | PokemonSummary[]> {
    return listPokemonRows(this.db, filters);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Champions: listChampionsSeasons
  // ────────────────────────────────────────────────────────────────────────────

  async listChampionsSeasons(): Promise<ChampionsSeasonSummary[]> {
    return listChampionsSeasonRows(this.db);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Pokemon: getPokemon
  // ────────────────────────────────────────────────────────────────────────────

  async getPokemonIdentity(idOrName: string): Promise<PokemonIdentity | undefined> {
    return getPokemonIdentityRow(this.db, idOrName);
  }

  async getPokemon(
    idOrName: string,
    filters?: { championsSeasonId?: number },
  ): Promise<PokemonEntry | undefined> {
    return getPokemonRow(this.db, idOrName, filters);
  }

  async getPokemonSummary(
    idOrName: string,
    filters?: { championsSeasonId?: number },
  ): Promise<PokemonSummaryResult | undefined> {
    return getPokemonSummaryRow(this.db, idOrName, filters);
  }

  async getPokemonEvolution(pokemonId: number): Promise<EvolutionStep[]> {
    return getPokemonEvolutionRow(this.db, pokemonId);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Pokemon: getLearnsetMeta
  // ────────────────────────────────────────────────────────────────────────────

  async getLearnsetMeta(pokemonId: number): Promise<LearnsetMeta> {
    return getLearnsetMetaRows(this.db, pokemonId);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Pokemon: getPokemonLearnset
  // ────────────────────────────────────────────────────────────────────────────

  async getPokemonLearnset(
    pokemonId: number,
    generation: number,
    options?: LearnsetQueryOptions,
    pagination?: PaginationParams,
    learnMethod?: string,
  ): Promise<LearnsetResult> {
    return getPokemonLearnsetRows(this.db, pokemonId, generation, options, pagination, learnMethod);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Moves: listMoves
  // ────────────────────────────────────────────────────────────────────────────

  async listMoves(filters?: MoveListFilters): Promise<PaginatedResult<MoveEntry> | MoveEntry[]> {
    return listMoveRows(this.db, filters);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Moves: getMove
  // ────────────────────────────────────────────────────────────────────────────

  async getMove(idOrName: string): Promise<MoveEntry | undefined> {
    return getMoveRow(this.db, idOrName);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Moves: getPokemonByMove
  // ────────────────────────────────────────────────────────────────────────────

  async getPokemonByMove(moveId: number, pagination?: { limit?: number; offset?: number }): Promise<PokemonByMoveSummary[] | PaginatedResult<PokemonByMoveSummary>> {
    return getPokemonByMoveRows(this.db, moveId, pagination);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Abilities: listAbilities
  // ────────────────────────────────────────────────────────────────────────────

  async listAbilities(filters?: AbilityListFilters): Promise<PaginatedResult<AbilityEntry> | AbilityEntry[]> {
    return listAbilityRows(this.db, filters);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Abilities: getAbility
  // ────────────────────────────────────────────────────────────────────────────

  async getAbility(idOrName: string): Promise<AbilityEntry | undefined> {
    return getAbilityRow(this.db, idOrName);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Abilities: getPokemonByAbility
  // ────────────────────────────────────────────────────────────────────────────

  async getPokemonByAbility(abilityId: number, pagination?: { limit?: number; offset?: number }): Promise<PokemonByAbilitySummary[] | PaginatedResult<PokemonByAbilitySummary>> {
    return getPokemonByAbilityRows(this.db, abilityId, pagination);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Items: listItems
  // ────────────────────────────────────────────────────────────────────────────

  async listItems(filters?: ItemListFilters): Promise<PaginatedResult<ItemEntry> | ItemEntry[]> {
    return listItemRows(this.db, filters);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Items: getItem
  // ────────────────────────────────────────────────────────────────────────────

  async getItem(idOrName: string): Promise<ItemEntry | undefined> {
    return getItemRow(this.db, idOrName);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Battle: 结构化效果查询
  // ────────────────────────────────────────────────────────────────────────────

  async getAbilityBattleEffects(abilityId: number, generation?: number): Promise<AbilityBattleEffect[]> {
    return getAbilityBattleEffectRows(this.db, abilityId, generation);
  }

  async getItemBattleEffects(itemId: number, generation?: number): Promise<ItemBattleEffect[]> {
    return getItemBattleEffectRows(this.db, itemId, generation);
  }

  async getMoveBattleEffects(moveId: number, generation?: number): Promise<MoveBattleEffect[]> {
    return getMoveBattleEffectRows(this.db, moveId, generation);
  }

  async getMoveFlags(moveId: number): Promise<MoveFlag[]> {
    return getMoveFlagRows(this.db, moveId);
  }

  async getMoveFlagsBatch(moveIds: number[]): Promise<Map<number, MoveFlag[]>> {
    return getMoveFlagsBatch(this.db, moveIds);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Battle: 原子名称查询（供 battle-core 的 resolveNames 使用）
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * 解析宝可梦英文名。
   * 查询优先级：formId > pokemonId 默认形态 > nameZh
   */
  async pokemonNameEn(opts: {
    pokemonId?: string | number;
    formId?: string | number;
    name?: string;
  }): Promise<string | undefined> {
    return pokemonNameEnRow(this.db, opts);
  }

  /**
   * 解析实体（招式/特性/道具）英文名。
   * 查询优先级：id > nameZh
   */
  async entityNameEn(
    kind: "move" | "ability" | "item",
    id?: string | number,
    nameZh?: string,
  ): Promise<string | undefined> {
    return entityNameEnRow(this.db, kind, id, nameZh);
  }

  /**
   * 查询特性/道具在伤害计算中的倍率修正值。
   * 返回结构体包含 value、effectType、affectedStat。
   */
  async getDamageModifier(
    kind: "ability" | "item",
    id?: string | number,
    nameZh?: string,
    generation?: number,
  ) {
    return getDamageModifierRow(this.db, kind, id, nameZh, generation);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 工厂函数
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 创建 DrizzleStore 实例。
 * @param db - drizzle() 返回的数据库实例（node-sqlite 或 d1 均可）
 */
export function createDrizzleStore(db: DrizzleDb): DrizzleStore {
  return new DrizzleStore(db);
}

export type { DrizzleDb };
