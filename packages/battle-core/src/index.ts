/**
 * @pokemon-localdex/battle-core
 *
 * 统一伤害计算引擎。
 *
 * 对外提供唯一入口：
 *   calculateDamage(input, lookup) — 名称解析 + 伤害计算一步完成
 *
 * 调用方只需传入 DamageCalcInput 和实现了 NameLookup 的 store 实例即可。
 */

import { calculate, Pokemon, Move, Field } from "@fakedplains/smogon-calc";
import type { GenerationNum } from "@fakedplains/smogon-calc/dist/data/interface";
import { NATURE_ZH_TO_EN, TYPE_ZH_TO_EN } from "@pokemon-localdex/store-types/constants";

import type {
  DamageCalcInput,
  DamageCalcResult,
  ResolvedNames,
  NameLookup,
} from "./types.ts";

// 重新导出所有类型
export type {
  StatsTable,
  PokemonCalcInput,
  SideInput,
  DamageCalcInput,
  DamageCalcResult,
  ResolvedNames,
  NameLookup,
} from "./types.ts";


// ══════════════════════════════════════════════════════════════════════════════
// 常量映射
// ══════════════════════════════════════════════════════════════════════════════

const WEATHER_MAP: Record<string, string | undefined> = {
  none: undefined,
  sun: "Sun",
  rain: "Rain",
  sand: "Sand",
  hail: "Snow",           // Gen 9 中 hail 变为 snow
  snow: "Snow",
  harshSunlight: "Harsh Sunshine",  // 始源固拉多 终结之地
  heavyRain: "Heavy Rain",          // 始源盖欧卡 始源之海
  strongWinds: "Strong Winds",      // Mega 裂空座 德尔塔气流
};

const TERRAIN_MAP: Record<string, string | undefined> = {
  none: undefined,
  electric: "Electric",
  grassy: "Grassy",
  misty: "Misty",
  psychic: "Psychic",
};

const STATUS_MAP: Record<string, string> = {
  burn: "brn",
  paralysis: "par",
  poison: "psn",
  sleep: "slp",
  freeze: "frz",
  tox: "tox",
  烧伤: "brn",
  麻痹: "par",
  中毒: "psn",
  剧毒: "tox",
  睡眠: "slp",
  冰冻: "frz",
};

// ══════════════════════════════════════════════════════════════════════════════
// 工具函数
// ══════════════════════════════════════════════════════════════════════════════

function natureZhToEn(natureZh: string): string {
  return NATURE_ZH_TO_EN[natureZh] || "Serious";
}

// ══════════════════════════════════════════════════════════════════════════════
// resolveNames — 内部名称解析
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 将伤害计算输入中的中文名/数据库 ID 解析为 @smogon/calc 所需的英文名。
 * 由 calculateDamage 内部调用，不对外暴露。
 */
async function resolveNames(
  input: DamageCalcInput,
  lookup: NameLookup,
): Promise<ResolvedNames> {
  const [atkNameEn, atkAbilityEn, atkItemEn, defNameEn, defAbilityEn, defItemEn, moveNameEn] =
    await Promise.all([
      lookup.pokemonNameEn(input.attacker),
      lookup.entityNameEn("ability", input.attacker.abilityId, input.attacker.ability),
      lookup.entityNameEn("item", input.attacker.itemId, input.attacker.item),
      lookup.pokemonNameEn(input.defender),
      lookup.entityNameEn("ability", input.defender.abilityId, input.defender.ability),
      lookup.entityNameEn("item", input.defender.itemId, input.defender.item),
      lookup.entityNameEn("move", input.move.id, input.move.name),
    ]);

  return {
    atkNameEn: atkNameEn || input.attacker.name || "Pikachu",
    atkAbilityEn: atkAbilityEn || input.attacker.ability || undefined,
    atkItemEn: atkItemEn || input.attacker.item || undefined,
    defNameEn: defNameEn || input.defender.name || "Pikachu",
    defAbilityEn: defAbilityEn || input.defender.ability || undefined,
    defItemEn: defItemEn || input.defender.item || undefined,
    moveNameEn: moveNameEn || input.move.name || "Tackle",
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// calculateDamage — 唯一入口
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 执行伤害计算（名称解析 + smogon-calc 计算一步完成）。
 *
 * @param input  - 伤害计算输入（中文名/数据库 ID 均可）
 * @param lookup - 实现了 NameLookup 的 store 实例，用于查询英文名
 *
 * @example
 * ```ts
 * import { calculateDamage } from "@pokemon-localdex/battle-core";
 * const result = await calculateDamage(input, store);
 * ```
 */
export async function calculateDamage(
  input: DamageCalcInput,
  lookup: NameLookup,
): Promise<DamageCalcResult> {
  const names = await resolveNames(input, lookup);
  const gen = input.generation as GenerationNum;

  // ── 通用宝可梦构建器 ──
  function buildPokemonOpts(poke: typeof input.attacker, nameEn: string, abilityEn: string | undefined, itemEn: string | undefined) {
    const teraType = poke.teraType
      ? (TYPE_ZH_TO_EN[poke.teraType] || poke.teraType)
      : undefined;
    const status = poke.status
      ? (STATUS_MAP[poke.status] || "")
      : "";

    // 属性覆盖：中文转英文
    let overrideTypes: [string, string?] | undefined;
    if (poke.overrides?.types) {
      overrideTypes = poke.overrides.types.map(
        (t) => (t ? (TYPE_ZH_TO_EN[t] || t) : undefined)
      ).filter(Boolean) as [string, string?];
    }

    const opts: Record<string, any> = {
      level: poke.level || 50,
      nature: natureZhToEn(poke.nature || "认真"),
      ability: abilityEn || undefined,
      abilityOn: poke.abilityOn !== false,  // 默认 true
      item: itemEn || undefined,
      gender: poke.gender || undefined,
      evs: poke.evs,
      ivs: poke.ivs,
      boosts: poke.boosts,
      curHP: poke.curHP,
      status: status || undefined,
      toxicCounter: poke.status === "tox" ? (poke.toxicCounter || 0) : undefined,
      teraType: teraType,
      isDynamaxed: poke.isDynamaxed || false,
      alliesFainted: poke.alliesFainted,
      boostedStat: poke.boostedStat || undefined,
    };

    // 种族值/属性覆盖
    if (poke.overrides?.baseStats || overrideTypes) {
      opts.overrides = {};
      if (poke.overrides?.baseStats) opts.overrides.baseStats = poke.overrides.baseStats;
      if (overrideTypes) opts.overrides.types = overrideTypes;
    }

    return opts;
  }

  // ── 构建攻击方 ──
  const attacker = new Pokemon(gen, names.atkNameEn,
    buildPokemonOpts(input.attacker, names.atkNameEn, names.atkAbilityEn, names.atkItemEn) as any
  );

  // ── 构建防守方 ──
  const defender = new Pokemon(gen, names.defNameEn,
    buildPokemonOpts(input.defender, names.defNameEn, names.defAbilityEn, names.defItemEn) as any
  );

  // ── 构建招式 ──
  const moveOpts: Record<string, any> = {
    ability: names.atkAbilityEn || undefined,
    item: names.atkItemEn || undefined,
    isCrit: input.move.isCrit || false,
    hits: input.move.hits,
    timesUsed: input.move.timesUsed,
    timesUsedWithMetronome: input.move.timesUsedWithMetronome,
    useZ: input.move.useZ || false,
    useMax: input.attacker.isDynamaxed || input.move.useMax || false,
    isStellarFirstUse: input.move.isStellarFirstUse || false,
    species: names.atkNameEn,
  };
  // 招式属性覆盖
  if (input.move.overrides) {
    const mo = input.move.overrides;
    moveOpts.overrides = {};
    if (mo.basePower !== undefined) moveOpts.overrides.basePower = mo.basePower;
    if (mo.type) moveOpts.overrides.type = TYPE_ZH_TO_EN[mo.type] || mo.type;
    if (mo.category) moveOpts.overrides.category = mo.category;
  }
  const move = new Move(gen, names.moveNameEn, moveOpts);

  // ── 构建场地 ──
  const fieldInput = input.field || {};
  const field = new Field({
    gameType: fieldInput.gameType === "doubles" ? "Doubles" : "Singles",
    weather: WEATHER_MAP[fieldInput.weather || "none"] as any,
    terrain: TERRAIN_MAP[fieldInput.terrain || "none"] as any,
    isGravity: fieldInput.isGravity || false,
    isMagicRoom: fieldInput.isMagicRoom || false,
    isWonderRoom: fieldInput.isWonderRoom || false,
    isBeadsOfRuin: fieldInput.isBeadsOfRuin || false,
    isTabletsOfRuin: fieldInput.isTabletsOfRuin || false,
    isSwordOfRuin: fieldInput.isSwordOfRuin || false,
    isVesselOfRuin: fieldInput.isVesselOfRuin || false,
    attackerSide: fieldInput.attackerSide || {},
    defenderSide: fieldInput.defenderSide || {},
  });

  // ── 执行计算 ──
  const result = calculate(gen, attacker, defender, move, field);

  // ── 解析结果 ──
  const [min, max] = result.range();
  const defenderHp = defender.originalCurHP || defender.rawStats.hp;

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
