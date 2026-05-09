#!/usr/bin/env node
/**
 * SQLite → Supabase 数据迁移脚本
 *
 * 两种模式：
 *   1. --dump   生成 SQL INSERT 文件（supabase/seed.sql），可直接在 Supabase SQL Editor 执行
 *   2. --push   通过 @supabase/supabase-js 直接推送到 Supabase（需要 service_role key）
 *
 * 用法：
 *   node scripts/migrate-to-supabase.mjs --dump
 *   SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/migrate-to-supabase.mjs --push
 *
 * 环境变量：
 *   LOCALDEX_DB_PATH  — SQLite 数据库路径（默认 data/sqlite/localdex.sqlite）
 *   SUPABASE_URL      — Supabase 项目 URL（--push 模式必需）
 *   SUPABASE_SERVICE_ROLE_KEY — Supabase service_role key（--push 模式必需，绕过 RLS）
 */

import { DatabaseSync } from "node:sqlite";
import { resolve, dirname } from "node:path";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── 配置 ──

const DB_PATH = process.env.LOCALDEX_DB_PATH
  ? resolve(process.env.LOCALDEX_DB_PATH)
  : resolve(ROOT, "data/sqlite/localdex.sqlite");

const mode = process.argv.includes("--push") ? "push" : "dump";

// ── 表定义（按依赖顺序排列） ──

const TABLES = [
  // 无外键依赖
  "moves",
  "abilities",
  "items",
  "pokemon",
  // 依赖上面的表
  "move_generation_records",
  "ability_generation_records",
  "item_generation_records",
  "pokemon_forms",
  // 依赖 pokemon_forms
  "pokemon_form_stats",
  "pokemon_form_types",
  "pokemon_form_abilities",
  "pokemon_form_images",
  // 依赖 pokemon
  "evolution_chains",
  "pokemon_generation_regions",
  "pokemon_learnsets",
];

// ── 工具函数 ──

function escapeSQL(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  // 字符串：转义单引号
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function readAllRows(db, table) {
  const stmt = db.prepare(`SELECT * FROM "${table}"`);
  return stmt.all();
}

function getColumns(db, table) {
  const info = db.prepare(`PRAGMA table_info("${table}")`).all();
  return info.map((col) => String(col.name));
}

// ── Dump 模式：生成 SQL 文件 ──

function generateSQLDump(db) {
  const lines = [];
  lines.push("-- ============================================================");
  lines.push("-- Pokemon LocalDex — Supabase Seed Data");
  lines.push("-- 从 SQLite 自动导出，请先执行 supabase/schema.sql 建表");
  lines.push("-- ============================================================");
  lines.push("");
  lines.push("BEGIN;");
  lines.push("");

  for (const table of TABLES) {
    const rows = readAllRows(db, table);
    if (rows.length === 0) {
      lines.push(`-- ${table}: 0 rows (跳过)`);
      lines.push("");
      continue;
    }

    const columns = getColumns(db, table);
    lines.push(`-- ${table}: ${rows.length} rows`);

    // Supabase 使用 SERIAL 自增，需要显式插入 id 并在之后重置序列
    const hasId = columns.includes("id");

    // 批量插入，每 500 行一个 INSERT
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      lines.push(`INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES`);
      const valueLines = batch.map((row) => {
        const vals = columns.map((col) => escapeSQL(row[col]));
        return `  (${vals.join(", ")})`;
      });
      lines.push(valueLines.join(",\n") + ";");
    }

    // 重置序列到最大 id
    if (hasId) {
      lines.push(`SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 1));`);
    }

    lines.push("");
  }

  lines.push("COMMIT;");
  return lines.join("\n");
}

// ── Push 模式：通过 supabase-js 直接推送 ──

async function pushToSupabase(db) {
  const { createClient } = await import("@supabase/supabase-js");

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("错误：--push 模式需要设置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY 环境变量");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false },
  });

  for (const table of TABLES) {
    const rows = readAllRows(db, table);
    if (rows.length === 0) {
      console.log(`  ⏭  ${table}: 0 rows，跳过`);
      continue;
    }

    console.log(`  ⬆  ${table}: ${rows.length} rows ...`);

    // 分批 upsert，每批 1000 行
    const BATCH = 1000;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const { error } = await supabase.from(table).upsert(batch, {
        onConflict: "id",
        ignoreDuplicates: false,
      });
      if (error) {
        console.error(`    ❌ ${table} batch ${i}-${i + batch.length}: ${error.message}`);
        // 继续尝试下一批
      } else {
        console.log(`    ✅ ${table} batch ${i + 1}-${i + batch.length} 完成`);
      }
    }
  }

  console.log("\n🎉 数据推送完成！");
}

// ── 主流程 ──

async function main() {
  if (!existsSync(DB_PATH)) {
    console.error(`错误：找不到 SQLite 数据库文件 ${DB_PATH}`);
    process.exit(1);
  }

  console.log(`📂 SQLite 数据库: ${DB_PATH}`);
  console.log(`📋 模式: ${mode}`);
  console.log("");

  const db = new DatabaseSync(DB_PATH, { readOnly: true });

  if (mode === "dump") {
    console.log("正在生成 SQL dump ...");
    const sql = generateSQLDump(db);
    const outPath = resolve(ROOT, "schema/seed.sql");
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, sql, "utf-8");
    console.log(`\n✅ 已生成: ${outPath}`);
    console.log(`   文件大小: ${(Buffer.byteLength(sql) / 1024 / 1024).toFixed(1)} MB`);
    console.log("\n使用方法:");
    console.log("  1. 在 Supabase Dashboard → SQL Editor 中先执行 schema/supabase-schema.sql");
    console.log("  2. 再执行 schema/seed.sql 导入数据");
    console.log("  或使用 supabase CLI:");
    console.log("  supabase db reset  (会自动执行 migrations + seed)");
  } else {
    await pushToSupabase(db);
  }

  db.close();
}

main().catch((err) => {
  console.error("迁移失败:", err);
  process.exit(1);
});
