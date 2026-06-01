/**
 * 通用 SQL seed 文件执行器
 * Usage: node --experimental-sqlite scripts/run-seed.mjs <sql-file-path>
 *
 * 将指定 SQL 文件中的语句逐条执行到本地 SQLite 数据库。
 * 支持 DROP/CREATE/INSERT/DELETE 等语句，按分号拆分。
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error("Usage: node --experimental-sqlite scripts/run-seed.mjs <sql-file>");
  process.exit(1);
}

const dbPath = resolve(import.meta.dirname, "..", "data", "sqlite", "localdex.sqlite");
const sqlPath = resolve(sqlFile);

console.log(`Database: ${dbPath}`);
console.log(`SQL file: ${sqlPath}`);

const db = new DatabaseSync(dbPath);
const sql = readFileSync(sqlPath, "utf8");

// 移除单行注释，按分号拆分
const statements = sql
  .replace(/--[^\n]*/g, "")
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

console.log(`Found ${statements.length} statements to execute.`);

let executed = 0;
for (const stmt of statements) {
  try {
    db.exec(stmt + ";");
    executed++;
  } catch (e) {
    console.error(`\nERROR at statement ${executed + 1}:`);
    console.error(e.message);
    console.error("SQL:", stmt.substring(0, 200));
    process.exit(1);
  }
}

console.log(`Successfully executed ${executed} statements.`);
db.close();
