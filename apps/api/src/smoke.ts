import { calculateDamage } from "../../../packages/battle-core/src/index.ts";
import {
  createSqliteStore,
  hasSqliteData,
} from "../../../packages/store/sqlite-store/src/index.ts";

if (!hasSqliteData()) {
  console.error("No SQLite data found. Run the crawler first: python3 scripts/crawl-52poke-db.py all");
  process.exit(1);
}

const store = createSqliteStore();

async function main() {
  const allPokemon = await store.listPokemon();
  console.log("pokemon count:", Array.isArray(allPokemon) ? allPokemon.length : allPokemon.items.length);

  const allItems = await store.listItems();
  console.log("item count:", Array.isArray(allItems) ? allItems.length : allItems.items.length);

  const allMoves = await store.listMoves();
  console.log("move count:", Array.isArray(allMoves) ? allMoves.length : allMoves.items.length);

  const allAbilities = await store.listAbilities();
  console.log("ability count:", Array.isArray(allAbilities) ? allAbilities.length : allAbilities.items.length);

  const pikachu = await store.getPokemon("皮卡丘");
  console.log("pokemon detail sample:", pikachu?.baseStats);
  console.log("pokemon image sample:", pikachu?.image?.url);
  console.log("pokemon forms sample:", pikachu?.forms?.map((item) => item.nameZh));

  const searchResult = await store.listPokemon({ query: "皮卡", type: "电", generation: 1 });
  const searchItems = Array.isArray(searchResult) ? searchResult : searchResult.items;
  console.log("pokemon search sample:", searchItems.map((item) => item.nameZh));

  const moveSearch = await store.listMoves({ query: "十万", type: "电", generation: 1 });
  const moveItems = Array.isArray(moveSearch) ? moveSearch : moveSearch.items;
  console.log("move search sample:", moveItems.map((item) => item.nameZh));

  const abilitySearch = await store.listAbilities({ query: "静电", generation: 3 });
  const abilityItems = Array.isArray(abilitySearch) ? abilitySearch : abilitySearch.items;
  console.log("ability search sample:", abilityItems.map((item) => item.nameZh));

  const item = await store.getItem("气势披带");
  console.log("item detail:", item?.nameEn);

  const ability = await store.getAbility("静电");
  console.log("ability detail:", ability?.effectDetail?.slice(0, 50));

  const damageInput = {
    generation: 9,
    attacker: { name: "皮卡丘", level: 50 },
    defender: { name: "喷火龙", level: 50 },
    move: { name: "十万伏特" },
  };
  const damage = await calculateDamage(damageInput, store);
  console.log("damage sample:", damage);
}

main().catch(console.error);
