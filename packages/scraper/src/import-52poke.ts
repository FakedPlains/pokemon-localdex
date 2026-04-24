import { importFrom52poke } from "./index.ts";

const pokemonLimit = process.env.POKEMON_LIMIT ? Number(process.env.POKEMON_LIMIT) : undefined;
const startDex = process.env.START_DEX ? Number(process.env.START_DEX) : undefined;
const endDex = process.env.END_DEX ? Number(process.env.END_DEX) : undefined;
const checkpointEvery = process.env.CHECKPOINT_EVERY ? Number(process.env.CHECKPOINT_EVERY) : undefined;
const onlyMissing = process.env.ONLY_MISSING === "1" || process.env.ONLY_MISSING === "true";
const refreshRaw = process.env.REFRESH_RAW === "1" || process.env.REFRESH_RAW === "true";
const preferCache = process.env.PREFER_CACHE === "0" || process.env.PREFER_CACHE === "false" ? false : undefined;

const result = await importFrom52poke({
  pokemonLimit,
  startDex,
  endDex,
  checkpointEvery,
  onlyMissing,
  refreshRaw,
  preferCache
});
console.log("52poke import:", result);
