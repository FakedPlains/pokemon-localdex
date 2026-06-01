import { calculateDamage } from "./index.ts";
import type { NameLookup, DamageModifierInfo } from "./types.ts";

// ══════════════════════════════════════════════════════════════════════════════
// 基础名称映射 mock
// ══════════════════════════════════════════════════════════════════════════════

const pokemonNames: Record<string, string> = {
  皮卡丘: "Pikachu",
  喷火龙: "Charizard",
  暴鲤龙: "Gyarados",
  水箭龟: "Blastoise",
  妙蛙种子: "Bulbasaur",
  玛力露丽: "Azumarill",
};

const entityNames: Record<string, Record<string, string>> = {
  move: {
    十万伏特: "Thunderbolt",
    冲浪: "Surf",
    火焰放射: "Flamethrower",
    飞叶快刀: "Razor Leaf",
    龙爪: "Dragon Claw",
    水流喷射: "Aqua Jet",
    气象球: "Weather Ball",
  },
  ability: {
    硬爪: "Tough Claws",
    厚脂肪: "Thick Fat",
    大力士: "Huge Power",
  },
  item: {
    命玉: "Life Orb",
    突击背心: "Assault Vest",
    烛火果: "Occa Berry",
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// 基础 lookup（无 getDamageModifier）
// ══════════════════════════════════════════════════════════════════════════════

const basicLookup: NameLookup = {
  async pokemonNameEn(opts) {
    return pokemonNames[String(opts.name || "")];
  },
  async entityNameEn(kind, _id, nameZh) {
    return entityNames[kind]?.[String(nameZh || "")];
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// 带 getDamageModifier 的 lookup mock
// ══════════════════════════════════════════════════════════════════════════════

const modifierData: Record<string, DamageModifierInfo> = {
  "ability:硬爪": { value: 1.3, effectType: 201, affectedStat: undefined },  // BASE_POWER_MULTIPLY
  "ability:大力士": { value: 2, effectType: 101, affectedStat: 2 },          // STAT_MULTIPLY, 攻击
  "ability:厚脂肪": { value: 0.5, effectType: 201, affectedStat: undefined }, // 减弱（防守方）
  "item:命玉": { value: 1.3, effectType: 202, affectedStat: undefined },      // FINAL_DAMAGE_MULTIPLY
  "item:突击背心": { value: 1.5, effectType: 101, affectedStat: 5 },          // STAT_MULTIPLY, 特防
};

const lookupWithModifier: NameLookup = {
  async pokemonNameEn(opts) {
    return pokemonNames[String(opts.name || "")];
  },
  async entityNameEn(kind, _id, nameZh) {
    return entityNames[kind]?.[String(nameZh || "")];
  },
  async getDamageModifier(kind, _id, nameZh) {
    const key = `${kind}:${nameZh || ""}`;
    return modifierData[key] || undefined;
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// 测试辅助
// ══════════════════════════════════════════════════════════════════════════════

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Test 1: 基础计算（min/max 有效）
// ══════════════════════════════════════════════════════════════════════════════

console.log("Test 1: 基础伤害计算");
const result1 = await calculateDamage({
  generation: 9,
  attacker: { name: "皮卡丘", level: 50 },
  defender: { name: "喷火龙", level: 50 },
  move: { name: "十万伏特" },
}, basicLookup);

assert(result1.min > 0, "min > 0");
assert(result1.max >= result1.min, "max >= min");
assert(result1.defenderHp > 0, "defenderHp > 0");
assert(result1.damageRolls.length === 16, "damageRolls has 16 entries");
assert(typeof result1.descriptionZh === "string" && result1.descriptionZh.length > 0, "descriptionZh non-empty");

// ══════════════════════════════════════════════════════════════════════════════
// Test 2: STAB（本属性加成）— 电属性皮卡丘用电招
// ══════════════════════════════════════════════════════════════════════════════

console.log("Test 2: STAB 本属性加成");
assert(result1.breakdown != null, "breakdown exists");
const stabFactor = result1.breakdown?.factors.find(f => f.category === "stab");
assert(stabFactor != null, "STAB factor present for Electric move on Electric Pokémon");
assert(stabFactor?.effect === "boost", "STAB effect is boost");
assert(stabFactor?.value === "×1.5", "STAB value is ×1.5");

// ══════════════════════════════════════════════════════════════════════════════
// Test 3: 属性克制（电 vs 飞行/火 = ×2）
// ══════════════════════════════════════════════════════════════════════════════

console.log("Test 3: 属性克制");
const typeFactor = result1.breakdown?.factors.find(f => f.category === "type");
assert(typeFactor != null, "type effectiveness factor present");
assert(typeFactor?.effect === "boost", "type effectiveness is boost (super effective)");
assert(typeFactor?.value === "×2", "type effectiveness value is ×2");

// ══════════════════════════════════════════════════════════════════════════════
// Test 4: 天气加成（晴天 + 火招）
// ══════════════════════════════════════════════════════════════════════════════

console.log("Test 4: 天气加成（晴天+火招）");
const result4 = await calculateDamage({
  generation: 9,
  attacker: { name: "喷火龙", level: 50 },
  defender: { name: "水箭龟", level: 50 },
  move: { name: "火焰放射" },
  field: { weather: "sun" },
}, basicLookup);

const weatherFactor = result4.breakdown?.factors.find(f => f.category === "weather");
assert(weatherFactor != null, "weather factor present under sun");
assert(weatherFactor?.effect === "boost", "sun boosts fire move");
assert(weatherFactor?.value === "×1.5", "sun boost value is ×1.5");

// ══════════════════════════════════════════════════════════════════════════════
// Test 5: 天气削弱（雨天 + 火招）
// ══════════════════════════════════════════════════════════════════════════════

console.log("Test 5: 天气削弱（雨天+火招）");
const result5 = await calculateDamage({
  generation: 9,
  attacker: { name: "喷火龙", level: 50 },
  defender: { name: "水箭龟", level: 50 },
  move: { name: "火焰放射" },
  field: { weather: "rain" },
}, basicLookup);

const weatherFactor5 = result5.breakdown?.factors.find(f => f.category === "weather");
assert(weatherFactor5 != null, "weather factor present under rain");
assert(weatherFactor5?.effect === "reduce", "rain reduces fire move");
assert(weatherFactor5?.value === "×0.5", "rain reduce value is ×0.5");

// ══════════════════════════════════════════════════════════════════════════════
// Test 6: 场地 neutral 不显示错误 value
// ══════════════════════════════════════════════════════════════════════════════

console.log("Test 6: 场地 neutral 无错误 value");
const result6 = await calculateDamage({
  generation: 9,
  attacker: { name: "皮卡丘", level: 50 },
  defender: { name: "喷火龙", level: 50 },
  move: { name: "十万伏特" },
  field: { terrain: "grassy" },  // 草地对电招 = neutral
}, basicLookup);

// 草地对电招 = neutral，不应生成 terrain factor chip
const terrainFactor6 = result6.breakdown?.factors.find(f => f.category === "terrain");
assert(terrainFactor6 == null, "neutral terrain should not generate a factor chip");

// ══════════════════════════════════════════════════════════════════════════════
// Test 7: 暴击
// ══════════════════════════════════════════════════════════════════════════════

console.log("Test 7: 暴击");
const result7 = await calculateDamage({
  generation: 9,
  attacker: { name: "皮卡丘", level: 50 },
  defender: { name: "喷火龙", level: 50 },
  move: { name: "十万伏特", isCrit: true },
}, basicLookup);

const critFactor = result7.breakdown?.factors.find(f => f.category === "critical");
assert(critFactor != null, "critical factor present when isCrit=true");
assert(critFactor?.effect === "boost", "critical effect is boost");
assert(critFactor?.value === "×1.5", "critical value is ×1.5");
// 暴击伤害应高于非暴击
assert(result7.min > result1.min, "crit min > non-crit min");

// ══════════════════════════════════════════════════════════════════════════════
// Test 8: getDamageModifier 路径 — 攻击方特性（威力倍率）
// ══════════════════════════════════════════════════════════════════════════════

console.log("Test 8: getDamageModifier — 攻击方特性（硬爪 ×1.3, 接触类招式）");
const result8 = await calculateDamage({
  generation: 9,
  attacker: { name: "喷火龙", level: 50, ability: "硬爪" },
  defender: { name: "水箭龟", level: 50 },
  move: { name: "龙爪" },  // 接触类物理招式，硬爪生效
}, lookupWithModifier);

const atkAbilityFactor = result8.breakdown?.factors.find(
  f => f.category === "ability" && f.name === "硬爪"
);
assert(atkAbilityFactor != null, "attacker ability factor present (contact move)");
assert(atkAbilityFactor?.value === "×1.3", "硬爪 shows ×1.3 (BASE_POWER_MULTIPLY)");

// ══════════════════════════════════════════════════════════════════════════════
// Test 9: getDamageModifier 路径 — STAT_MULTIPLY 显示格式
// ══════════════════════════════════════════════════════════════════════════════

console.log("Test 9: getDamageModifier — STAT_MULTIPLY（大力士 攻击×2）");
const result9 = await calculateDamage({
  generation: 9,
  attacker: { name: "玛力露丽", level: 50, ability: "大力士" },
  defender: { name: "喷火龙", level: 50 },
  move: { name: "水流喷射" },  // 玛力露丽 + 大力士 + 物理水招 = rawDesc 记录
}, lookupWithModifier);

const hugePowerFactor = result9.breakdown?.factors.find(
  f => f.category === "ability" && f.name === "大力士"
);
assert(hugePowerFactor != null, "大力士 ability factor present");
assert(hugePowerFactor?.value === "攻击×2", "大力士 shows 攻击×2 (STAT_MULTIPLY format)");

// ══════════════════════════════════════════════════════════════════════════════
// Test 10: getDamageModifier 路径 — 攻击方道具 effect 方向由倍率决定
// ══════════════════════════════════════════════════════════════════════════════

console.log("Test 10: getDamageModifier — 攻击方道具（命玉 ×1.3, boost）");
const result10 = await calculateDamage({
  generation: 9,
  attacker: { name: "皮卡丘", level: 50, item: "命玉" },
  defender: { name: "喷火龙", level: 50 },
  move: { name: "十万伏特" },
}, lookupWithModifier);

const atkItemFactor = result10.breakdown?.factors.find(
  f => f.category === "item" && f.name === "命玉"
);
assert(atkItemFactor != null, "attacker item factor present");
assert(atkItemFactor?.effect === "boost", "命玉 effect is boost (value > 1)");
assert(atkItemFactor?.value === "×1.3", "命玉 shows ×1.3");

// ══════════════════════════════════════════════════════════════════════════════
// Test 11: getDamageModifier 路径 — 防守方道具 effect 方向
// ══════════════════════════════════════════════════════════════════════════════

console.log("Test 11: getDamageModifier — 防守方道具（突击背心, reduce）");
const result11 = await calculateDamage({
  generation: 9,
  attacker: { name: "皮卡丘", level: 50 },
  defender: { name: "喷火龙", level: 50, item: "突击背心" },
  move: { name: "十万伏特" },
}, lookupWithModifier);

const defItemFactor = result11.breakdown?.factors.find(
  f => f.category === "item" && f.name === "突击背心"
);
assert(defItemFactor != null, "defender item factor present");
assert(defItemFactor?.effect === "reduce", "突击背心 effect is reduce (value > 1, defender side)");
assert(defItemFactor?.value === "特防×1.5", "突击背心 shows 特防×1.5 (STAT_MULTIPLY format)");

// ══════════════════════════════════════════════════════════════════════════════
// Test 12: 壁类倍率 — 单打 vs 双打
// ══════════════════════════════════════════════════════════════════════════════

console.log("Test 12: 壁类倍率（单打 ×0.5, 双打 ×0.67）");
const result12s = await calculateDamage({
  generation: 9,
  attacker: { name: "皮卡丘", level: 50 },
  defender: { name: "喷火龙", level: 50 },
  move: { name: "十万伏特" },
  field: { defenderSide: { isLightScreen: true } },
}, basicLookup);

const screenSingles = result12s.breakdown?.factors.find(f => f.name === "光墙");
assert(screenSingles != null, "光墙 factor present in singles");
assert(screenSingles?.value === "×0.5", "光墙 singles value is ×0.5");

const result12d = await calculateDamage({
  generation: 9,
  attacker: { name: "皮卡丘", level: 50 },
  defender: { name: "喷火龙", level: 50 },
  move: { name: "十万伏特" },
  field: { gameType: "doubles", defenderSide: { isLightScreen: true } },
}, basicLookup);

const screenDoubles = result12d.breakdown?.factors.find(f => f.name === "光墙");
assert(screenDoubles != null, "光墙 factor present in doubles");
assert(screenDoubles?.value === "×0.67", "光墙 doubles value is ×0.67");

// ══════════════════════════════════════════════════════════════════════════════
// Test 13: 天气球变属性 — 晴天下气象球应为火属性
// ══════════════════════════════════════════════════════════════════════════════

console.log("Test 13: 天气球变属性（晴天→火属性）");
const result13 = await calculateDamage({
  generation: 9,
  attacker: { name: "皮卡丘", level: 50 },
  defender: { name: "妙蛙种子", level: 50 },  // 草/毒，火克草
  move: { name: "气象球" },  // Weather Ball
  field: { weather: "sun" },
}, basicLookup);

// 晴天下气象球变为火属性，对草系应该效果拔群
const typeFactor13 = result13.breakdown?.factors.find(f => f.category === "type");
assert(typeFactor13 != null, "type factor exists (Weather Ball → Fire vs Grass)");
assert(typeFactor13?.effect === "boost", "Weather Ball in sun is super effective vs Grass");
// 天气加成（晴天+火招）也应该出现
const weatherFactor13 = result13.breakdown?.factors.find(f => f.category === "weather");
assert(weatherFactor13 != null, "weather boost present for Weather Ball in sun");
assert(weatherFactor13?.effect === "boost", "sun boosts fire-type Weather Ball");

// ══════════════════════════════════════════════════════════════════════════════
// Test 14: 减伤树果 — 防守方携带减伤树果展示 ×0.5 倍率
// ══════════════════════════════════════════════════════════════════════════════

console.log("Test 14: 减伤树果（烛火果 ×0.5）");
const result14 = await calculateDamage({
  generation: 9,
  attacker: { name: "喷火龙", level: 50 },
  defender: { name: "妙蛙种子", level: 50, item: "烛火果" },  // Occa Berry: 火属性减伤
  move: { name: "火焰放射" },
}, basicLookup);

const berryFactor14 = result14.breakdown?.factors.find(
  f => f.category === "item" && f.name === "烛火果"
);
assert(berryFactor14 != null, "resist berry factor present");
assert(berryFactor14?.effect === "reduce", "resist berry effect is reduce");
assert(berryFactor14?.value === "×0.5", "resist berry shows ×0.5 multiplier");

// ══════════════════════════════════════════════════════════════════════════════
// 结果汇总
// ══════════════════════════════════════════════════════════════════════════════

console.log(`\n${"═".repeat(50)}`);
console.log(`damage smoke: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
