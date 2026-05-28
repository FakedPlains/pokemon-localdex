/**
 * @pokemon-localdex/sqlite-store
 *
 * Node.js SQLite 数据访问层（薄包装）。
 *
 * 查询逻辑全部委托给 @pokemon-localdex/drizzle-queries（DrizzleStore），
 * 本模块只负责：
 *   1. 数据库文件管理（路径、打开、关闭）
 *   2. 创建 Drizzle 实例并包装为 IStore
 */


// ── Re-export shared types ──

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
  PokemonCardSummary,
  PokemonTableSummary,
  PokemonEntry,
  PokemonIdentity,
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

// ── Re-export helpers for crawler ──

export {
  normalizeTypeName,
  splitTypeNames,
  GAME_VERSION_NAMES,
  TYPE_NAMES,
  statBlockFromRow,
  sourceFromRow,
} from "@pokemon-localdex/store-types";

// ── Drizzle ──

import { drizzle } from "drizzle-orm/sqlite-proxy";
import { createDrizzleStore } from "@pokemon-localdex/drizzle-queries";
import type { IStore } from "@pokemon-localdex/store-types";
import { hasDatabaseFile, openDatabase } from "./database.ts";
export { getDatabasePath, hasDatabaseFile, openDatabase } from "./database.ts";

// ══════════════════════════════════════════════════════════════════════════════
// 数据检测
// ══════════════════════════════════════════════════════════════════════════════

export function hasSqliteData() {
  if (!hasDatabaseFile()) return false;
  const db = openDatabase();
  try {
    const row = db.prepare(
      "SELECT (SELECT COUNT(*) FROM pokemon) + (SELECT COUNT(*) FROM moves) + (SELECT COUNT(*) FROM abilities) AS total"
    ).get() as { total: number };
    db.close();
    return row.total > 0;
  } catch {
    db.close();
    return false;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Drizzle 实例创建（sqlite-proxy 包装 node:sqlite）
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 用 sqlite-proxy 包装 node:sqlite 的 DatabaseSync。
 *
 * sqlite-proxy 需要一个 async 回调 (sql, params, method) => { rows }，
 * 我们在回调内部同步执行 DatabaseSync 的 prepare/all/get/run。
 *
 * 重要：Drizzle 的 mapResultRow 使用数字索引（row[columnIndex]）访问行数据，
 * 因此回调必须返回二维数组格式（每行是值数组，按 SELECT 列顺序排列）。
 *
 * 使用 stmt.setReturnArrays(true) 直接获取原生数组格式，
 * 避免 stmt.all() 返回对象时同名列被覆盖的问题（如 LEFT JOIN 时两表有同名列）。
 */
function createDrizzleDb() {
  const rawDb = openDatabase();

  const db = drizzle(async (sql, params, method) => {
    try {
      const stmt = rawDb.prepare(sql);

      if (method === "run") {
        stmt.run(...params);
        return { rows: [] };
      }

      // 使用 setReturnArrays(true) 直接获取二维数组格式
      // 这样即使有同名列（如 JOIN 时），也能保持正确的列顺序和值
      stmt.setReturnArrays(true);
      const rows = stmt.all(...params) as unknown[][];

      return { rows };
    } catch (e: any) {
      console.error("[sqlite-proxy] SQL error:", e.message, "\nSQL:", sql);
      throw e;
    }
  });

  return { db, rawDb };
}

// ══════════════════════════════════════════════════════════════════════════════
// IStore 工厂（统一接口）
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 创建符合 IStore 接口的 SQLite 适配器。
 */
export function createSqliteStore(): IStore {
  const { db } = createDrizzleDb();
  return createDrizzleStore(db);
}
