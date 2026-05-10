/**
 * @pokemon-localdex/d1-store
 *
 * Cloudflare D1 数据访问层（薄包装）。
 *
 * 查询逻辑全部委托给 @pokemon-localdex/drizzle-queries（DrizzleStore），
 * 本模块只负责：
 *   1. D1 类型定义
 *   2. 创建 Drizzle D1 实例并包装为 IStore
 *   3. 异步名称解析器（createDbAdapter，供 battle-core 使用）
 *
 * 使用方式：
 *   import { createD1Store } from "@pokemon-localdex/d1-store";
 *   const store = createD1Store(env.DB);
 *   const list = await store.listPokemon({ query: "皮卡丘" });
 */

// ── Re-export all shared types ──

export type {
  StatBlock,
  SourceMeta,
  ImageAsset,
  FormStatVariant,
  FormTypeVariant,
  FormAbilityVariant,
  PokemonFormEntry,
  EvolutionStep,
  PokemonSummary,
  PokemonEntry,
  MoveGenerationRecord,
  MoveEntry,
  AbilityGenerationRecord,
  AbilityEntry,
  ItemGenerationRecord,
  ItemEntry,
  LearnsetRecord,
  TeamMember,
  BattleTeam,
  PaginationParams,
  PaginatedResult,
} from "@pokemon-localdex/store-types";

// ── D1 type shim ──

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

// ── Drizzle ──

import { drizzle } from "drizzle-orm/d1";
import { createDrizzleStore, DrizzleStore } from "@pokemon-localdex/drizzle-queries";
import type { IStore } from "@pokemon-localdex/store-types";

// ══════════════════════════════════════════════════════════════════════════════
// D1Store 类型别名（保持 worker.ts 的导入兼容性）
// ══════════════════════════════════════════════════════════════════════════════

export type D1Store = DrizzleStore;

// ══════════════════════════════════════════════════════════════════════════════
// IStore 工厂
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 工厂函数：创建 D1Store 实例。
 * 在 Workers 入口中使用：
 *   const store = createD1Store(env.DB);
 */
export function createD1Store(db: D1Database): D1Store {
  const drizzleDb = drizzle(db as any);
  return createDrizzleStore(drizzleDb);
}

// ══════════════════════════════════════════════════════════════════════════════
// DbAdapter 实现（异步名称解析，供 battle-core 使用）
// ══════════════════════════════════════════════════════════════════════════════

import type {
  DbAdapter,
  PokemonNameQuery,
  EntityNameQuery,
} from "@pokemon-localdex/battle-core";

class D1DbAdapter implements DbAdapter {
  private db: D1Database;
  constructor(db: D1Database) {
    this.db = db;
  }

  async queryPokemonFormNameEn(opts: PokemonNameQuery): Promise<string | undefined> {
    if (opts.formId) {
      const row = await this.db
        .prepare("SELECT name_en FROM pokemon_forms WHERE id = ? AND name_en IS NOT NULL LIMIT 1")
        .bind(String(opts.formId))
        .first<{ name_en: string }>();
      if (row?.name_en) return row.name_en;
    }

    if (opts.pokemonId && opts.formKey && opts.formKey !== "default") {
      const row = await this.db
        .prepare("SELECT name_en FROM pokemon_forms WHERE pokemon_id = ? AND form_key = ? AND name_en IS NOT NULL LIMIT 1")
        .bind(String(opts.pokemonId), opts.formKey)
        .first<{ name_en: string }>();
      if (row?.name_en) return row.name_en;
    }

    if (opts.formKey && opts.formKey !== "default") {
      const row = await this.db
        .prepare("SELECT name_en FROM pokemon_forms WHERE form_key = ? AND name_en IS NOT NULL LIMIT 1")
        .bind(opts.formKey)
        .first<{ name_en: string }>();
      if (row?.name_en) return row.name_en;
    }

    if (opts.pokemonId) {
      const row = await this.db
        .prepare("SELECT name_en FROM pokemon_forms WHERE pokemon_id = ? AND is_default = 1 AND name_en IS NOT NULL LIMIT 1")
        .bind(String(opts.pokemonId))
        .first<{ name_en: string }>();
      if (row?.name_en) return row.name_en;
      const pkRow = await this.db
        .prepare("SELECT name_en FROM pokemon WHERE id = ? LIMIT 1")
        .bind(String(opts.pokemonId))
        .first<{ name_en: string }>();
      if (pkRow?.name_en) return pkRow.name_en;
    }

    if (opts.nameZh) {
      const row = await this.db
        .prepare("SELECT name_en FROM pokemon_forms WHERE name_zh = ? AND name_en IS NOT NULL LIMIT 1")
        .bind(opts.nameZh)
        .first<{ name_en: string }>();
      if (row?.name_en) return row.name_en;

      const pkRow = await this.db
        .prepare("SELECT name_en FROM pokemon WHERE name_zh = ? LIMIT 1")
        .bind(opts.nameZh)
        .first<{ name_en: string }>();
      if (pkRow?.name_en) return pkRow.name_en;
    }

    return undefined;
  }

  async queryMoveNameEn(opts: EntityNameQuery): Promise<string | undefined> {
    if (opts.id) {
      const row = await this.db
        .prepare("SELECT name_en FROM moves WHERE id = ? LIMIT 1")
        .bind(String(opts.id))
        .first<{ name_en: string }>();
      if (row?.name_en) return row.name_en;
    }
    if (opts.nameZh) {
      const row = await this.db
        .prepare("SELECT name_en FROM moves WHERE name_zh = ? LIMIT 1")
        .bind(opts.nameZh)
        .first<{ name_en: string }>();
      if (row?.name_en) return row.name_en;
    }
    return undefined;
  }

  async queryAbilityNameEn(opts: EntityNameQuery): Promise<string | undefined> {
    if (opts.id) {
      const row = await this.db
        .prepare("SELECT name_en FROM abilities WHERE id = ? LIMIT 1")
        .bind(String(opts.id))
        .first<{ name_en: string }>();
      if (row?.name_en) return row.name_en;
    }
    if (opts.nameZh) {
      const row = await this.db
        .prepare("SELECT name_en FROM abilities WHERE name_zh = ? LIMIT 1")
        .bind(opts.nameZh)
        .first<{ name_en: string }>();
      if (row?.name_en) return row.name_en;
    }
    return undefined;
  }

  async queryItemNameEn(opts: EntityNameQuery): Promise<string | undefined> {
    if (opts.id) {
      const row = await this.db
        .prepare("SELECT name_en FROM items WHERE id = ? LIMIT 1")
        .bind(String(opts.id))
        .first<{ name_en: string }>();
      if (row?.name_en) return row.name_en;
    }
    if (opts.nameZh) {
      const row = await this.db
        .prepare("SELECT name_en FROM items WHERE name_zh = ? LIMIT 1")
        .bind(opts.nameZh)
        .first<{ name_en: string }>();
      if (row?.name_en) return row.name_en;
    }
    return undefined;
  }
}

/**
 * 工厂函数：创建 DbAdapter 实例（异步名称解析器）。
 * 供 d1-battle-core 使用：
 *   import { createDbAdapter } from "@pokemon-localdex/d1-store";
 *   const adapter = createDbAdapter(env.DB);
 *   const result = await calculateDamageWithAdapter(adapter, input);
 */
export function createDbAdapter(db: D1Database): DbAdapter {
  return new D1DbAdapter(db);
}

export type { DbAdapter, PokemonNameQuery, EntityNameQuery } from "@pokemon-localdex/battle-core";
