import { calculateDamage } from "../../../packages/battle-core/src/index.ts";
import {
  getAbilityFromSqlite,
  getItemFromSqlite,
  getPokemonFromSqlite,
  hasSqliteData,
  listAbilitiesFromSqlite,
  listItemsFromSqlite,
  listMovesFromSqlite,
  listPokemonFromSqlite
} from "../../../packages/sqlite-store/src/index.ts";

if (!hasSqliteData()) {
  console.error("No SQLite data found. Run the crawler first: python3 scripts/crawl-52poke-db.py all");
  process.exit(1);
}

console.log("pokemon count:", listPokemonFromSqlite().length);
console.log("item count:", listItemsFromSqlite().length);
console.log("move count:", listMovesFromSqlite().length);
console.log("ability count:", listAbilitiesFromSqlite().length);

const pikachu = getPokemonFromSqlite("皮卡丘");
console.log("pokemon detail sample:", pikachu?.baseStats);
console.log("pokemon image sample:", pikachu?.images?.official?.url);
console.log("pokemon forms sample:", pikachu?.forms?.map((item) => item.nameZh));
console.log(
  "pokemon learnset sample:",
  pikachu?.generationRecords?.find((record) => record.generation === 1)
    ?.learnset?.map((item) => `${item.moveNameZh || item.moveId}:${item.learnMethod || "unknown"}`)
);

const charizard = getPokemonFromSqlite("喷火龙");
console.log(
  "charizard gen1 moves:",
  charizard?.generationRecords?.find((record) => record.generation === 1)?.moveIds
);

console.log("pokemon search sample:", listPokemonFromSqlite({ query: "皮卡", type: "电", generation: 1 }).map((item) => item.nameZh));
console.log("move search sample:", listMovesFromSqlite({ query: "十万", type: "电", generation: 1 }).map((item) => item.nameZh));
console.log("ability search sample:", listAbilitiesFromSqlite({ query: "静电", generation: 3 }).map((item) => item.nameZh));
console.log("pokemon detail:", getPokemonFromSqlite("皮卡丘")?.generationAvailability?.map((item) => item.generation));
console.log("item detail:", getItemFromSqlite("气势披带")?.nameEn);
console.log("ability detail:", getAbilityFromSqlite("静电")?.effectDetail?.slice(0, 50));

const damage = calculateDamage({
  generation: 9,
  attacker: { name: "皮卡丘", level: 50 },
  defender: { name: "喷火龙", level: 50 },
  move: { name: "十万伏特" },
});
console.log("damage sample:", damage);
