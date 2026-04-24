import {
  listItems,
  listPokemonEntries,
  listPokemonSummaries,
  readTeams,
  replaceItems,
  replacePokemonEntries,
  replaceTeams,
  saveTeam
} from "../../../packages/data-model/src/index.ts";
import { importFromFixtures } from "../../../packages/scraper/src/index.ts";
import { calculateDamage } from "../../../packages/battle-core/src/index.ts";

const originalTeams = readTeams();
const originalPokemon = listPokemonEntries();
const originalItems = listItems();

try {
  await importFromFixtures();

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
  console.log("pokemon detail sample:", listPokemonEntries().find((item) => item.nameZh === "皮卡丘")?.baseStats);
  console.log("team count during smoke:", readTeams().length);
  console.log("last saved team:", saved.name);
  console.log("damage sample:", damage);
} finally {
  replaceTeams(originalTeams);
  replacePokemonEntries(originalPokemon);
  replaceItems(originalItems);
}
