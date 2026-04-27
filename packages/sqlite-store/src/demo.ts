import { importFromFixtures } from "../../scraper/src/index.ts";
import {
  listAbilities,
  listItems,
  listMoves,
  listPokemonEntries,
  replaceAbilities,
  replaceItems,
  replaceMoves,
  replacePokemonEntries
} from "../../data-model/src/index.ts";
import {
  getItemFromSqlite,
  getPokemonFromSqlite,
  getDatabasePath,
  importNormalizedDataToSqlite,
  listItemsFromSqlite,
  listPokemonFromSqlite
} from "./index.ts";

const originalPokemon = listPokemonEntries();
const originalItems = listItems();
const originalMoves = listMoves();
const originalAbilities = listAbilities();

try {
  await importFromFixtures();
  const imported = importNormalizedDataToSqlite();

  console.log("sqlite db:", getDatabasePath());
  console.log("imported counts:", imported);
  console.log("pokemon search:", listPokemonFromSqlite({ query: "皮卡", type: "电", generation: 1 }).map((item) => item.nameZh));
  console.log("pokemon detail forms:", getPokemonFromSqlite("皮卡丘")?.forms?.map((item) => item.nameZh));
  console.log("item detail:", getItemFromSqlite("气势披带")?.nameEn);
  console.log("item count:", listItemsFromSqlite().length);
} finally {
  replacePokemonEntries(originalPokemon);
  replaceItems(originalItems);
  replaceMoves(originalMoves);
  replaceAbilities(originalAbilities);
}
