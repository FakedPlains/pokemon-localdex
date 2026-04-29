import {
  getDatabasePath,
  hasDatabaseFile,
  hasSqliteData,
  listPokemonFromSqlite,
  getPokemonFromSqlite,
  listItemsFromSqlite,
  getItemFromSqlite,
  listMovesFromSqlite,
  listAbilitiesFromSqlite
} from "./index.ts";

console.log("sqlite db:", getDatabasePath());
console.log("db file exists:", hasDatabaseFile());
console.log("has data:", hasSqliteData());

if (hasSqliteData()) {
  console.log("pokemon search:", listPokemonFromSqlite({ query: "皮卡", type: "电", generation: 1 }).map((item) => item.nameZh));
  console.log("pokemon detail forms:", getPokemonFromSqlite("皮卡丘")?.forms?.map((item) => item.nameZh));
  console.log("item detail:", getItemFromSqlite("气势披带")?.nameEn);
  console.log("item count:", listItemsFromSqlite().length);
  console.log("move count:", listMovesFromSqlite().length);
  console.log("ability count:", listAbilitiesFromSqlite().length);
} else {
  console.log("No SQLite data found. Run the crawler first: python3 scripts/crawl-52poke-db.py all");
}
