import { importFrom52poke } from "./index.ts";

const pokemonLimit = process.env.POKEMON_LIMIT ? Number(process.env.POKEMON_LIMIT) : undefined;
const result = await importFrom52poke({ pokemonLimit });
console.log("52poke import:", result);
