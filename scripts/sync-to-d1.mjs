/**
 * 本地 SQLite -> 远程 D1 全量同步脚本
 *
 * 流程：
 * 1. 从本地 SQLite 导出所有表数据为 SQL 文件
 * 2. 远程 D1 drop 所有旧表
 * 3. 用 d1-schema.sql 重建表结构
 * 4. 分批导入数据（wrangler d1 execute 有大小限制，每批约 10000 条）
 *
 * Usage:
 *   node --experimental-sqlite scripts/sync-to-d1.mjs
 *
 * 前置条件：
 *   - wrangler 已登录（npx wrangler login）
 *   - data/sqlite/localdex.sqlite 存在且是最新数据
 */

import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { execSync } from "node:child_process";

const ROOT = resolve(import.meta.dirname, "..");
const DB_PATH = join(ROOT, "data", "sqlite", "localdex.sqlite");
const SCHEMA_PATH = join(ROOT, "schema", "d1-schema.sql");
const WRANGLER_CONFIG = join(ROOT, "wrangler.worker.toml");
const OUTPUT_DIR = join(ROOT, "data", "d1-sync");
const D1_DB_NAME = "pokemon-localdex-d1";

// D1 远程执行支持文件上传模式，可处理较大文件
// 每表整体导入（wrangler 文件上传模式支持大文件），只在超大表时分批
const BATCH_SIZE = 50000;

// 需要同步的表（按依赖顺序排列：被引用的表在前）
const TABLES_IN_ORDER = [
  "pokemon",
  "items",
  "moves",
  "abilities",
  "pokemon_forms",
  "pokemon_form_stats",
  "pokemon_form_types",
  "pokemon_form_abilities",
  "pokemon_form_images",
  "evolution_chains",
  "pokemon_moves",
  "move_generation_records",
  "move_flags",
  "move_battle_effects",
  "ability_generation_records",
  "ability_battle_effects",
  "item_generation_records",
  "item_battle_effects",
  "field_effects",
  "field_effect_modifiers",
  "field_effect_generation_records",
  "field_effect_sources",
  "champions_regulations",
  "champions_seasons",
  "champions_regulation_pokemon",
  "champions_regulation_items",
];

function escapeValue(val) {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return String(val);
  // 字符串：转义单引号
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

function exportTableToSql(db, tableName) {
  console.log(`  Exporting: ${tableName}...`);
  const rows = db.prepare(`SELECT * FROM ${tableName}`).all();
  if (rows.length === 0) {
    console.log(`    (empty table, skipping)`);
    return [];
  }

  const columns = Object.keys(rows[0]);
  const batches = [];
  let currentBatch = [];

  for (const row of rows) {
    const values = columns.map((col) => escapeValue(row[col]));
    currentBatch.push(
      `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${values.join(", ")});`
    );

    if (currentBatch.length >= BATCH_SIZE) {
      batches.push(currentBatch);
      currentBatch = [];
    }
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  console.log(`    ${rows.length} rows -> ${batches.length} batch(es)`);
  return batches;
}

function wranglerExec(sql, description) {
  const tmpFile = join(OUTPUT_DIR, "_tmp_exec.sql");
  writeFileSync(tmpFile, sql, "utf8");
  try {
    execSync(
      `npx wrangler d1 execute ${D1_DB_NAME} --remote --file="${tmpFile}" --config="${WRANGLER_CONFIG}"`,
      { cwd: ROOT, stdio: "pipe", maxBuffer: 50 * 1024 * 1024 }
    );
    console.log(`  ✓ ${description}`);
  } catch (e) {
    const stderr = e.stderr ? e.stderr.toString() : "";
    const stdout = e.stdout ? e.stdout.toString() : "";
    console.error(`  ✗ FAILED: ${description}`);
    console.error(`    stderr: ${stderr.substring(0, 500)}`);
    console.error(`    stdout: ${stdout.substring(0, 500)}`);
    throw new Error(`Wrangler execution failed: ${description}`);
  }
}

async function main() {
  console.log("=== Pokemon LocalDex: SQLite -> D1 Full Sync ===\n");

  // 准备输出目录
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // Step 1: 打开本地数据库，导出数据
  console.log("Step 1: Exporting data from local SQLite...");
  const db = new DatabaseSync(DB_PATH);

  const allBatches = []; // { tableName, batchIndex, sql }
  for (const table of TABLES_IN_ORDER) {
    // 检查表是否存在
    const exists = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
      )
      .get(table);
    if (!exists) {
      console.log(`  (table ${table} does not exist locally, skipping)`);
      continue;
    }
    const batches = exportTableToSql(db, table);
    batches.forEach((batch, idx) => {
      allBatches.push({ tableName: table, batchIndex: idx, sql: batch.join("\n") });
    });
  }
  db.close();
  console.log(`\nTotal batches to import: ${allBatches.length}\n`);

  // Step 2: Drop all tables in remote D1
  console.log("Step 2: Dropping all existing tables in remote D1...");
  // 先获取远程所有表
  const listResult = execSync(
    `npx wrangler d1 execute ${D1_DB_NAME} --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%'" --config="${WRANGLER_CONFIG}"`,
    { cwd: ROOT, stdio: "pipe", maxBuffer: 10 * 1024 * 1024 }
  ).toString();

  // 解析表名
  const tableNames = [];
  const nameRegex = /"name":\s*"([^"]+)"/g;
  let match;
  while ((match = nameRegex.exec(listResult)) !== null) {
    tableNames.push(match[1]);
  }
  console.log(`  Found ${tableNames.length} tables to drop: ${tableNames.join(", ")}`);

  if (tableNames.length > 0) {
    const dropSql = "PRAGMA foreign_keys = OFF;\n" +
      tableNames.map((t) => `DROP TABLE IF EXISTS ${t};`).join("\n") +
      "\nPRAGMA foreign_keys = ON;";
    wranglerExec(dropSql, `Drop ${tableNames.length} tables`);
  }

  // Step 3: Recreate schema (strip expression-based UNIQUE constraints for D1 compatibility)
  console.log("\nStep 3: Recreating schema from d1-schema.sql...");
  let schemaSql = readFileSync(SCHEMA_PATH, "utf8");

  // D1 不支持 UNIQUE/INDEX 中的表达式（COALESCE / CASE WHEN 等）
  // 逐行处理，移除包含 COALESCE 的 UNIQUE 约束行和上面的逗号，以及表达式索引语句
  const lines = schemaSql.split("\n");
  const outputLines = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 跳过含 COALESCE 或 CASE WHEN 的 CREATE INDEX / CREATE UNIQUE INDEX 整条语句
    if (/^CREATE\s+(UNIQUE\s+)?INDEX/i.test(trimmed) && (line.includes("COALESCE") || line.includes("CASE WHEN"))) {
      // 跳到分号结尾
      while (i < lines.length && !lines[i].includes(";")) i++;
      i++; // 跳过分号所在行
      continue;
    }

    // 多行 CREATE INDEX：开始行是 CREATE INDEX 但没分号，需要积累
    if (/^CREATE\s+(UNIQUE\s+)?INDEX/i.test(trimmed) && !line.includes(";")) {
      let fullStmt = line;
      let j = i + 1;
      while (j < lines.length && !lines[j].includes(";")) {
        fullStmt += "\n" + lines[j];
        j++;
      }
      if (j < lines.length) fullStmt += "\n" + lines[j];
      if (fullStmt.includes("COALESCE") || fullStmt.includes("CASE WHEN")) {
        i = j + 1;
        continue;
      }
    }

    // 跳过含 COALESCE 的 UNIQUE 约束行（在 CREATE TABLE 内部）
    if (/^\s*UNIQUE\s*\(/i.test(line) && line.includes("COALESCE")) {
      // 可能跨多行，找到闭合括号
      let constraint = line;
      let j = i;
      while (!constraint.includes(")") || (constraint.match(/\(/g) || []).length > (constraint.match(/\)/g) || []).length) {
        j++;
        if (j >= lines.length) break;
        constraint += "\n" + lines[j];
      }
      // 移除前一行末尾的逗号
      if (outputLines.length > 0) {
        const prev = outputLines[outputLines.length - 1];
        outputLines[outputLines.length - 1] = prev.replace(/,\s*$/, "");
      }
      i = j + 1;
      continue;
    }

    outputLines.push(line);
    i++;
  }

  schemaSql = outputLines.join("\n");
  wranglerExec(schemaSql, "Create all tables and indexes");

  // Step 4: Import data in batches
  console.log(`\nStep 4: Importing data (${allBatches.length} batches)...`);
  for (let i = 0; i < allBatches.length; i++) {
    const batch = allBatches[i];
    const description = `[${i + 1}/${allBatches.length}] ${batch.tableName} (batch ${batch.batchIndex + 1})`;

    // 对每批数据加 PRAGMA
    const batchSql = `PRAGMA foreign_keys = OFF;\n${batch.sql}\nPRAGMA foreign_keys = ON;`;
    wranglerExec(batchSql, description);
  }

  // 清理临时文件
  try {
    rmSync(join(OUTPUT_DIR, "_tmp_exec.sql"), { force: true });
  } catch {}

  console.log("\n=== Sync completed successfully! ===");

  // Step 5: 验证远端数据
  console.log("\nStep 5: Verifying remote data...");
  for (const table of TABLES_IN_ORDER.slice(0, 5)) {
    try {
      const result = execSync(
        `npx wrangler d1 execute ${D1_DB_NAME} --remote --command "SELECT COUNT(*) as c FROM ${table}" --config="${WRANGLER_CONFIG}"`,
        { cwd: ROOT, stdio: "pipe", maxBuffer: 10 * 1024 * 1024 }
      ).toString();
      const countMatch = result.match(/"c":\s*(\d+)/);
      if (countMatch) {
        console.log(`  ${table}: ${countMatch[1]} rows`);
      }
    } catch (e) {
      console.log(`  ${table}: (verification failed)`);
    }
  }
}

main().catch((e) => {
  console.error("\nFATAL ERROR:", e.message);
  process.exit(1);
});
