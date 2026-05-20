import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getDatabasePath, hasSqliteData, openDatabase } from "./index.ts";

const ROOT = resolve(import.meta.dirname, "../../../../");
const schemaPath = resolve(ROOT, "schema/d1-schema.sql");

const db = openDatabase();
const sql = readFileSync(schemaPath, "utf-8");
db.exec(sql);
db.close();

console.log("schema ensured at:", getDatabasePath());
console.log("(from:", schemaPath, ")");
console.log("has data:", hasSqliteData());
