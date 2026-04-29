import { ensureSchema, getDatabasePath, hasSqliteData } from "./index.ts";

ensureSchema();
console.log("schema ensured at:", getDatabasePath());
console.log("has data:", hasSqliteData());
