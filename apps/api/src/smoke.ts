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
import { importFromFixtures, parseLearnsetPage, resolvePokemonImageCandidateUrls } from "../../../packages/scraper/src/index.ts";
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
  const parsedLearnset = parseLearnsetPage(
    {
      url: "https://example.com/pikachu/gen1",
      title: "皮卡丘/第一世代招式表",
      fetchedAt: new Date().toISOString(),
      html: `
        <h2>可学会的招式</h2>
        <table>
          <tr><th>等级</th><th>招式</th><th>属性</th><th>威力</th><th>命中</th><th>PP</th></tr>
          <tr><td>11</td><td>电光一闪</td><td>一般</td><td>40</td><td>100</td><td>30</td></tr>
        </table>
        <h2>能使用的招式学习器</h2>
        <table>
          <tr><th>学习器</th><th>招式</th><th>属性</th><th>威力</th><th>命中</th><th>PP</th></tr>
          <tr><td>招式学习器24</td><td>十万伏特</td><td>电</td><td>95</td><td>100</td><td>15</td></tr>
        </table>
      `
    },
    1
  );
  const pikachuImageCandidates = resolvePokemonImageCandidateUrls(
    `
      <img src="https://media.52poke.com/wiki/thumb/a/a7/025Pikachu.png/250px-025Pikachu.png" />
      <img src="https://media.52poke.com/wiki/thumb/b/b4/Spr_9s_025.png/250px-Spr_9s_025.png" />
      <img src="https://media.52poke.com/wiki/thumb/c/c8/Spr_9_025.png/250px-Spr_9_025.png" />
    `,
    {
      dexNumber: 25,
      nameZh: "皮卡丘",
      nameEn: "Pikachu",
      generations: [1, 9],
      detailUrl: "https://wiki.52poke.com/wiki/皮卡丘"
    }
  );
  const charizardImageCandidates = resolvePokemonImageCandidateUrls(
    `
      <img src="https://media.52poke.com/wiki/thumb/d/d0/006Charizard-Mega_X.png/250px-006Charizard-Mega_X.png" />
      <img src="https://media.52poke.com/wiki/thumb/e/e5/006Charizard-Mega_X_s.png/250px-006Charizard-Mega_X_s.png" />
    `,
    {
      dexNumber: 6,
      nameZh: "喷火龙",
      nameEn: "Charizard",
      generations: [1, 9],
      detailUrl: "https://wiki.52poke.com/wiki/喷火龙"
    },
    [
      {
        id: "charizard-mega-x",
        nameZh: "超级喷火龙X"
      }
    ]
  );

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
  console.log("image candidate sample:", {
    official: pikachuImageCandidates.official?.includes("025Pikachu.png"),
    shinySprite: pikachuImageCandidates.shinySprite?.includes("Spr_9s_025.png"),
    formOfficial: charizardImageCandidates.forms?.["charizard-mega-x"]?.official?.includes("Mega_X.png"),
    formShiny: charizardImageCandidates.forms?.["charizard-mega-x"]?.shinyOfficial?.includes("Mega_X_s.png")
  });
  console.log("learnset parser sample:", parsedLearnset.learnset.map((item) => `${item.moveNameZh}:${item.learnMethod}`));
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
