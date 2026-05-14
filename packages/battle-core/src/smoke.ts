import { calculateDamage } from "./index.ts";
import type { NameLookup } from "./types.ts";

const pokemonNames: Record<string, string> = {
  皮卡丘: "Pikachu",
  喷火龙: "Charizard",
};

const entityNames: Record<string, Record<string, string>> = {
  move: {
    十万伏特: "Thunderbolt",
  },
  ability: {},
  item: {},
};

const lookup: NameLookup = {
  async pokemonNameEn(opts) {
    return pokemonNames[String(opts.name || "")];
  },
  async entityNameEn(kind, _id, nameZh) {
    return entityNames[kind]?.[String(nameZh || "")];
  },
};

const result = await calculateDamage({
  generation: 9,
  attacker: { name: "皮卡丘", level: 50 },
  defender: { name: "喷火龙", level: 50 },
  move: { name: "十万伏特" },
}, lookup);

if (!Number.isFinite(result.min) || !Number.isFinite(result.max) || result.min <= 0 || result.max < result.min) {
  throw new Error(`Unexpected damage result: ${JSON.stringify(result)}`);
}

console.log("damage smoke:", {
  min: result.min,
  max: result.max,
  defenderHp: result.defenderHp,
  rolls: result.damageRolls.length,
});
