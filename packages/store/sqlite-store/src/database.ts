import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { migrateOldSchema } from "./migrations.ts";

const ROOT = resolve(import.meta.dirname, "../../../../");

// ══════════════════════════════════════════════════════════════════════════════
// 数据库文件管理
// ══════════════════════════════════════════════════════════════════════════════

function resolveDatabasePath() {
  return process.env.LOCALDEX_DB_PATH
    ? resolve(process.env.LOCALDEX_DB_PATH)
    : resolve(ROOT, "data/sqlite/localdex.sqlite");
}

function ensureDbDir() {
  mkdirSync(dirname(resolveDatabasePath()), { recursive: true });
}

export function getDatabasePath() { return resolveDatabasePath(); }
export function hasDatabaseFile() { return existsSync(resolveDatabasePath()); }

let _migrationDone = false;

export function openDatabase() {
  ensureDbDir();
  const db = new DatabaseSync(resolveDatabasePath(), { timeout: 3000 });
  if (!_migrationDone) {
    _migrationDone = true;
    migrateOldSchema(db);
  }
  return db;
}
