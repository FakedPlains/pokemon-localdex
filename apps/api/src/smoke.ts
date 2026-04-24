import {
  listAbilities,
  listItems,
  listMoves,
  listPokemonEntries,
  listPokemonSummaries,
  readTeams,
  replaceAbilities,
  replaceItems,
  replaceMoves,
  replacePokemonEntries,
  replaceTeams,
  searchAbilities,
  searchMoves,
  searchPokemonEntries,
  saveTeam
} from "../../../packages/data-model/src/index.ts";
import { importFromFixtures } from "../../../packages/scraper/src/index.ts";
import { calculateDamage } from "../../../packages/battle-core/src/index.ts";
import {
  getItemFromSqlite,
  getPokemonFromSqlite,
  importNormalizedDataToSqlite,
  listPokemonFromSqlite
} from "../../../packages/sqlite-store/src/index.ts";

const originalTeams = readTeams();
const originalPokemon = listPokemonEntries();
const originalItems = listItems();
const originalMoves = listMoves();
const originalAbilities = listAbilities();

try {
  const fixtureImport = await importFromFixtures();
  const sqliteImport = importNormalizedDataToSqlite();

  const saved = saveTeam({
    name: "示例队伍",
    format: "singles",
    members: [
      {
        slot: 1,
        pokemonId: "demo-pokemon",
        level: 50,
        moves: ["demo-move"],
        ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
        evs: { atk: 252, spe: 252 }
      }
    ]
  });

  const damage = calculateDamage({
    level: 50,
    power: 80,
    attack: 150,
    defense: 100,
    stab: 1.5,
    typeEffectiveness: 1
  });

  console.log("pokemon count:", listPokemonSummaries().length);
  console.log("item count:", listItems().length);
  console.log("move count:", listMoves().length);
  console.log("ability count:", listAbilities().length);
  console.log("fixture import sample:", fixtureImport);
  console.log("pokemon detail sample:", listPokemonEntries().find((item) => item.nameZh === "皮卡丘")?.baseStats);
  console.log("pokemon image sample:", listPokemonEntries().find((item) => item.nameZh === "皮卡丘")?.images?.official?.url);
  console.log("pokemon forms sample:", listPokemonEntries().find((item) => item.nameZh === "皮卡丘")?.forms?.map((item) => item.nameZh));
  console.log(
    "pokemon learnset sample:",
    listPokemonEntries()
      .find((item) => item.nameZh === "皮卡丘")
      ?.generationRecords?.find((record) => record.generation === 1)
      ?.learnset?.map((item) => `${item.moveNameZh || item.moveId}:${item.learnMethod || "unknown"}`)
  );
  console.log(
    "charizard gen1 moves:",
    listPokemonEntries()
      .find((item) => item.nameZh === "喷火龙")
      ?.generationRecords?.find((record) => record.generation === 1)
      ?.moveIds
  );
  console.log("pokemon search sample:", searchPokemonEntries({ query: "皮卡", type: "电", generation: 1 }).map((item) => item.nameZh));
  console.log("move search sample:", searchMoves({ query: "十万", type: "电", generation: 1 }).map((item) => item.nameZh));
  console.log("ability search sample:", searchAbilities({ query: "静电", generation: 3 }).map((item) => item.nameZh));
  console.log("sqlite import sample:", sqliteImport);
  console.log("sqlite pokemon search:", listPokemonFromSqlite({ query: "皮卡", type: "电", generation: 1 }).map((item) => item.nameZh));
  console.log("sqlite pokemon detail:", getPokemonFromSqlite("皮卡丘")?.generationAvailability?.map((item) => item.generation));
  console.log("sqlite item detail:", getItemFromSqlite("气势披带")?.nameEn);
  console.log("team count during smoke:", readTeams().length);
  console.log("last saved team:", saved.name);
  console.log("damage sample:", damage);
} finally {
  replaceTeams(originalTeams);
  replacePokemonEntries(originalPokemon);
  replaceItems(originalItems);
  replaceMoves(originalMoves);
  replaceAbilities(originalAbilities);
}
