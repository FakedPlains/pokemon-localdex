/**
 * @pokemon-localdex/d1-store
 *
 * Cloudflare D1 数据访问层（薄包装）。
 *
 * 查询逻辑全部委托给 @pokemon-localdex/drizzle-queries（DrizzleStore），
 * 本模块只负责：
 *   1. D1 类型定义
 *   2. 创建 Drizzle D1 实例并包装为 IStore
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
  ChampionsSeasonSummary,
  MoveGenerationRecord,
  MoveEntry,
  AbilityGenerationRecord,
  AbilityEntry,
  ItemGenerationRecord,
  ItemEntry,
  LearnsetRecord,
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
