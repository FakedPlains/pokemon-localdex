import { importFrom52poke } from "./index.ts";

const pokemonLimit = process.env.POKEMON_LIMIT ? Number(process.env.POKEMON_LIMIT) : undefined;
const startDex = process.env.START_DEX ? Number(process.env.START_DEX) : undefined;
const endDex = process.env.END_DEX ? Number(process.env.END_DEX) : undefined;
const checkpointEvery = process.env.CHECKPOINT_EVERY ? Number(process.env.CHECKPOINT_EVERY) : undefined;
const concurrency = process.env.CONCURRENCY ? Number(process.env.CONCURRENCY) : undefined;
const onlyMissing = process.env.ONLY_MISSING === "1" || process.env.ONLY_MISSING === "true";
const importItems = process.env.IMPORT_ITEMS === "0" || process.env.IMPORT_ITEMS === "false" ? false : undefined;
const refreshRaw = process.env.REFRESH_RAW === "1" || process.env.REFRESH_RAW === "true";
const preferCache = process.env.PREFER_CACHE === "0" || process.env.PREFER_CACHE === "false" ? false : undefined;

const result = await importFrom52poke({
  pokemonLimit,
  startDex,
  endDex,
  checkpointEvery,
  concurrency,
  onlyMissing,
  importItems,
  refreshRaw,
  preferCache
});
console.log("52poke import:", result);
