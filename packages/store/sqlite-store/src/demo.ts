import {
  getDatabasePath,
  hasDatabaseFile,
  hasSqliteData,
  createSqliteStore,
} from "./index.ts";

console.log("sqlite db:", getDatabasePath());
console.log("db file exists:", hasDatabaseFile());
console.log("has data:", hasSqliteData());

if (hasSqliteData()) {
  const store = createSqliteStore();

  async function main() {
    const searchResult = await store.listPokemon({ query: "皮卡", type: "电", generation: 1 });
    const searchItems = Array.isArray(searchResult) ? searchResult : searchResult.items;
    console.log("pokemon search:", searchItems.map((item) => item.nameZh));

    const pikachu = await store.getPokemon("皮卡丘");
    console.log("pokemon detail forms:", pikachu?.forms?.map((item) => item.nameZh));

    const item = await store.getItem("气势披带");
    console.log("item detail:", item?.nameEn);

    const allItems = await store.listItems();
    console.log("item count:", Array.isArray(allItems) ? allItems.length : allItems.items.length);

    const allMoves = await store.listMoves();
    console.log("move count:", Array.isArray(allMoves) ? allMoves.length : allMoves.items.length);

    const allAbilities = await store.listAbilities();
    console.log("ability count:", Array.isArray(allAbilities) ? allAbilities.length : allAbilities.items.length);
  }

  main().catch(console.error);
} else {
  console.log("No SQLite data found. Run the crawler first: python3 scripts/crawl-52poke-db.py all");
}
