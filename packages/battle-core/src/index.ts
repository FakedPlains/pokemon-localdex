/**
 * battle-core: 伤害计算引擎
 *
 * 使用 @smogon/calc 作为底层计算库，通过实时查询 SQLite 数据库
 * 将中文名称映射为英文名称，再传入 @smogon/calc 进行精确计算。
 */
import { calculate, Pokemon, Move, Field } from "@smogon/calc";
import type { GenerationNum } from "@smogon/calc/src/data/interface";

// ── 中英文名称映射（性格是固定的，不需要查数据库） ──

const NATURE_ZH_TO_EN: Record<string, string> = {
  勤奋: "Hardy",
  怕寂寞: "Lonely",
  固执: "Adamant",
  顽皮: "Naughty",
  勇敢: "Brave",
  大胆: "Bold",
  坦率: "Docile",
  淘气: "Impish",
  乐天: "Lax",
  悠闲: "Relaxed",
  胆小: "Timid",
  急躁: "Hasty",
  认真: "Serious",
  爽朗: "Jolly",
  天真: "Naive",
  内敛: "Modest",
  慢吞吞: "Mild",
  害羞: "Bashful",
  马虎: "Rash",
  冷静: "Quiet",
  温和: "Calm",
  温顺: "Gentle",
  慎重: "Careful",
  浮躁: "Quirky",
  自大: "Sassy",
};

// ── SQLite 名称查询工具 ──

import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

const DB_PATH = process.env.LOCALDEX_DB_PATH
  ? resolve(process.env.LOCALDEX_DB_PATH)
  : resolve(import.meta.dirname, "../../../data/sqlite/localdex.sqlite");

function openDb(): DatabaseSync {
  return new DatabaseSync(DB_PATH, { open: true });
}

/**
 * 通过中文名查询宝可梦英文名
 */
function queryPokemonNameEn(nameZh: string): string | undefined {
  const db = openDb();
  const row = db.prepare(
    "SELECT name_en FROM pokemon WHERE name_zh = ? LIMIT 1"
  ).get(nameZh) as { name_en: string } | undefined;
  db.close();
  return row?.name_en || undefined;
}

/**
 * 通过中文名查询招式英文名
 */
function queryMoveNameEn(nameZh: string): string | undefined {
  const db = openDb();
  const row = db.prepare(
    "SELECT name_en FROM moves WHERE name_zh = ? LIMIT 1"
  ).get(nameZh) as { name_en: string } | undefined;
  db.close();
  return row?.name_en || undefined;
}

/**
 * 通过中文名查询特性英文名
 */
function queryAbilityNameEn(nameZh: string): string | undefined {
  const db = openDb();
  const row = db.prepare(
    "SELECT name_en FROM abilities WHERE name_zh = ? LIMIT 1"
  ).get(nameZh) as { name_en: string } | undefined;
  db.close();
  return row?.name_en || undefined;
}

/**
 * 通过中文名查询道具英文名
 */
function queryItemNameEn(nameZh: string): string | undefined {
  const db = openDb();
  const row = db.prepare(
    "SELECT name_en FROM items WHERE name_zh = ? LIMIT 1"
  ).get(nameZh) as { name_en: string } | undefined;
  db.close();
  return row?.name_en || undefined;
}

/**
 * 性格中文转英文
 */
function natureZhToEn(natureZh: string): string {
  return NATURE_ZH_TO_EN[natureZh] || "Serious";
}

// ── 类型定义 ──

export type StatsTable = {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
};

export type DamageCalcInput = {
  generation: number;  // 世代 1-9

  // 攻击方
  attacker: {
    name: string;           // 宝可梦中文名
    level?: number;         // 等级，默认 50
    nature?: string;        // 性格中文名，默认 "认真"
    ability?: string;       // 特性中文名
    item?: string;          // 道具中文名
    evs?: Partial<StatsTable>;
    ivs?: Partial<StatsTable>;
    boosts?: Partial<StatsTable>;
    status?: string;        // 状态: "burn" | "paralysis" | "poison" | "sleep" | ""
    teraType?: string;      // 太晶属性中文名
  };

  // 防守方
  defender: {
    name: string;
    level?: number;
    nature?: string;
    ability?: string;
    item?: string;
    evs?: Partial<StatsTable>;
    ivs?: Partial<StatsTable>;
    boosts?: Partial<StatsTable>;
    status?: string;
    teraType?: string;
  };

  // 招式
  move: {
    name: string;           // 招式中文名
    isCrit?: boolean;       // 是否暴击
    hits?: number;          // 连续攻击次数
  };

  // 场地
  field?: {
    gameType?: "singles" | "doubles";
    weather?: string;       // "none" | "sun" | "rain" | "sand" | "hail" | "snow"
    terrain?: string;       // "none" | "electric" | "grassy" | "misty" | "psychic"
    isGravity?: boolean;
    isMagicRoom?: boolean;
    isWonderRoom?: boolean;

    // 攻击方场地效果
    attackerSide?: {
      isSR?: boolean;
      spikes?: number;
      isReflect?: boolean;
      isLightScreen?: boolean;
      isAuroraVeil?: boolean;
      isProtected?: boolean;
      isSeeded?: boolean;
      isSaltCured?: boolean;
      isTailwind?: boolean;
      isHelpingHand?: boolean;
      isPowerTrick?: boolean;
      isFriendGuard?: boolean;
      isSwitching?: "in" | "out";
    };

    // 防守方场地效果
    defenderSide?: {
      isSR?: boolean;
      spikes?: number;
      isReflect?: boolean;
      isLightScreen?: boolean;
      isAuroraVeil?: boolean;
      isProtected?: boolean;
      isSeeded?: boolean;
      isSaltCured?: boolean;
      isTailwind?: boolean;
      isHelpingHand?: boolean;
      isPowerTrick?: boolean;
      isFriendGuard?: boolean;
      isSwitching?: "in" | "out";
    };
  };
};

export type DamageCalcResult = {
  min: number;
  max: number;
  average: number;
  minPercent: number;
  maxPercent: number;
  defenderHp: number;
  description: string;      // @smogon/calc 生成的完整描述
  damageRolls: number[];    // 所有 16 个乱数伤害值
};

// ── 天气/场地/属性 中文→英文映射 ──

const WEATHER_MAP: Record<string, string | undefined> = {
  none: undefined,
  sun: "Sun",
  rain: "Rain",
  sand: "Sand",
  hail: "Snow",   // Gen 9 中 hail 变为 snow
  snow: "Snow",
};

const TERRAIN_MAP: Record<string, string | undefined> = {
  none: undefined,
  electric: "Electric",
  grassy: "Grassy",
  misty: "Misty",
  psychic: "Psychic",
};

const TYPE_ZH_TO_EN: Record<string, string> = {
  一般: "Normal",
  火: "Fire",
  水: "Water",
  电: "Electric",
  草: "Grass",
  冰: "Ice",
  格斗: "Fighting",
  毒: "Poison",
  地面: "Ground",
  飞行: "Flying",
  超能力: "Psychic",
  虫: "Bug",
  岩石: "Rock",
  幽灵: "Ghost",
  龙: "Dragon",
  恶: "Dark",
  钢: "Steel",
  妖精: "Fairy",
};

const STATUS_MAP: Record<string, string> = {
  burn: "brn",
  paralysis: "par",
  poison: "psn",
  sleep: "slp",
  freeze: "frz",
  烧伤: "brn",
  麻痹: "par",
  中毒: "psn",
  睡眠: "slp",
  冰冻: "frz",
};

// ── 主计算函数 ──

/**
 * 使用 @smogon/calc 进行伤害计算
 *
 * 接收中文名称，实时查询数据库获取英文名，然后调用 @smogon/calc
 */
export function calculateDamage(input: DamageCalcInput): DamageCalcResult {
  const gen = (input.generation || 9) as GenerationNum;

  // ── 解析攻击方 ──
  const atkNameEn = queryPokemonNameEn(input.attacker.name) || input.attacker.name;
  const atkAbilityEn = input.attacker.ability
    ? (queryAbilityNameEn(input.attacker.ability) || input.attacker.ability)
    : undefined;
  const atkItemEn = input.attacker.item
    ? (queryItemNameEn(input.attacker.item) || input.attacker.item)
    : undefined;
  const atkNatureEn = natureZhToEn(input.attacker.nature || "认真");
  const atkTeraType = input.attacker.teraType
    ? (TYPE_ZH_TO_EN[input.attacker.teraType] || input.attacker.teraType)
    : undefined;
  const atkStatus = input.attacker.status
    ? (STATUS_MAP[input.attacker.status] || "")
    : "";

  const attacker = new Pokemon(gen, atkNameEn, {
    level: input.attacker.level || 50,
    nature: atkNatureEn,
    ability: atkAbilityEn,
    item: atkItemEn,
    evs: input.attacker.evs as any,
    ivs: input.attacker.ivs as any,
    boosts: input.attacker.boosts as any,
    status: atkStatus as any,
    teraType: atkTeraType as any,
  });

  // ── 解析防守方 ──
  const defNameEn = queryPokemonNameEn(input.defender.name) || input.defender.name;
  const defAbilityEn = input.defender.ability
    ? (queryAbilityNameEn(input.defender.ability) || input.defender.ability)
    : undefined;
  const defItemEn = input.defender.item
    ? (queryItemNameEn(input.defender.item) || input.defender.item)
    : undefined;
  const defNatureEn = natureZhToEn(input.defender.nature || "认真");
  const defTeraType = input.defender.teraType
    ? (TYPE_ZH_TO_EN[input.defender.teraType] || input.defender.teraType)
    : undefined;
  const defStatus = input.defender.status
    ? (STATUS_MAP[input.defender.status] || "")
    : "";

  const defender = new Pokemon(gen, defNameEn, {
    level: input.defender.level || 50,
    nature: defNatureEn,
    ability: defAbilityEn,
    item: defItemEn,
    evs: input.defender.evs as any,
    ivs: input.defender.ivs as any,
    boosts: input.defender.boosts as any,
    status: defStatus as any,
    teraType: defTeraType as any,
  });

  // ── 解析招式 ──
  const moveNameEn = queryMoveNameEn(input.move.name) || input.move.name;
  const move = new Move(gen, moveNameEn, {
    isCrit: input.move.isCrit || false,
    hits: input.move.hits,
  });

  // ── 解析场地 ──
  const fieldInput = input.field || {};
  const field = new Field({
    gameType: fieldInput.gameType === "doubles" ? "Doubles" : "Singles",
    weather: WEATHER_MAP[fieldInput.weather || "none"] as any,
    terrain: TERRAIN_MAP[fieldInput.terrain || "none"] as any,
    isGravity: fieldInput.isGravity || false,
    isMagicRoom: fieldInput.isMagicRoom || false,
    isWonderRoom: fieldInput.isWonderRoom || false,
    attackerSide: fieldInput.attackerSide || {},
    defenderSide: fieldInput.defenderSide || {},
  });

  // ── 执行计算 ──
  const result = calculate(gen, attacker, defender, move, field);

  // ── 解析结果 ──
  const [min, max] = result.range();
  const defenderHp = defender.originalCurHP || defender.rawStats.hp;

  // 获取所有 16 个乱数伤害值
  let damageRolls: number[] = [];
  if (Array.isArray(result.damage)) {
    if (Array.isArray(result.damage[0])) {
      // 多段攻击：取第一段
      damageRolls = (result.damage as number[][])[0];
    } else {
      damageRolls = result.damage as number[];
    }
  } else {
    damageRolls = [result.damage as number];
  }

  const average = damageRolls.length > 0
    ? Number((damageRolls.reduce((a, b) => a + b, 0) / damageRolls.length).toFixed(1))
    : Number(((min + max) / 2).toFixed(1));

  const minPercent = defenderHp > 0 ? Number(((min / defenderHp) * 100).toFixed(1)) : 0;
  const maxPercent = defenderHp > 0 ? Number(((max / defenderHp) * 100).toFixed(1)) : 0;

  // 获取描述文本
  let description = "";
  try {
    description = result.fullDesc();
  } catch {
    description = `${min} - ${max} (${minPercent}% - ${maxPercent}%)`;
  }

  return {
    min,
    max,
    average,
    minPercent,
    maxPercent,
    defenderHp,
    description,
    damageRolls,
  };
}

