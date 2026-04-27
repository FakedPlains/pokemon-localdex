import { importCatalogDetailsFrom52poke } from "./index.ts";

const moveLimit = process.env.MOVE_LIMIT ? Number(process.env.MOVE_LIMIT) : undefined;
const abilityLimit = process.env.ABILITY_LIMIT ? Number(process.env.ABILITY_LIMIT) : undefined;
const itemLimit = process.env.ITEM_LIMIT ? Number(process.env.ITEM_LIMIT) : undefined;
const checkpointEvery = process.env.CHECKPOINT_EVERY ? Number(process.env.CHECKPOINT_EVERY) : undefined;
const concurrency = process.env.CONCURRENCY ? Number(process.env.CONCURRENCY) : undefined;
const importMoves = process.env.IMPORT_MOVES === "0" || process.env.IMPORT_MOVES === "false" ? false : undefined;
const importAbilities = process.env.IMPORT_ABILITIES === "0" || process.env.IMPORT_ABILITIES === "false" ? false : undefined;
const importItems = process.env.IMPORT_ITEMS === "0" || process.env.IMPORT_ITEMS === "false" ? false : undefined;
const refreshRaw = process.env.REFRESH_RAW === "1" || process.env.REFRESH_RAW === "true";
const preferCache = process.env.PREFER_CACHE === "0" || process.env.PREFER_CACHE === "false" ? false : undefined;

const result = await importCatalogDetailsFrom52poke({
  moveLimit,
  abilityLimit,
  itemLimit,
  checkpointEvery,
  concurrency,
  importMoves,
  importAbilities,
  importItems,
  refreshRaw,
  preferCache
});

console.log("52poke catalog import:", result);
