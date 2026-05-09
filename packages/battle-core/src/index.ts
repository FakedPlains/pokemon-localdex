/**
 * @pokemon-localdex/battle-core
 *
 * 统一伤害计算引擎。
 *
 * 对外提供两个入口：
 *   - calculateDamage(resolver, input)     — 同步版，配合 sqlite-store 的 NameResolver
 *   - calculateDamageAsync(adapter, input) — 异步版，配合 d1-store 的 DbAdapter
 *
 * 调用方自行从 store 包创建 resolver/adapter 传入。
 */

import { calculate, Pokemon, Move, Field } from "@fakedplains/smogon-calc";
import type { GenerationNum } from "@fakedplains/smogon-calc/dist/data/interface";

import type {
  DamageCalcInput,
  DamageCalcResult,
  NameResolver,
  DbAdapter,
  ResolvedNames,
} from "./types.ts";

// 重新导出所有类型
export type {
  StatsTable,
  PokemonCalcInput,
  SideInput,
  DamageCalcInput,
  DamageCalcResult,
  PokemonNameQuery,
  EntityNameQuery,
  NameResolver,
  DbAdapter,
  ResolvedNames,
} from "./types.ts";

// ══════════════════════════════════════════════════════════════════════════════
// 常量映射
// ══════════════════════════════════════════════════════════════════════════════

export const NATURE_ZH_TO_EN: Record<string, string> = {
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

export const WEATHER_MAP: Record<string, string | undefined> = {
  none: undefined,
  sun: "Sun",
  rain: "Rain",
  sand: "Sand",
  hail: "Snow",   // Gen 9 中 hail 变为 snow
  snow: "Snow",
};

export const TERRAIN_MAP: Record<string, string | undefined> = {
  none: undefined,
  electric: "Electric",
  grassy: "Grassy",
  misty: "Misty",
  psychic: "Psychic",
};

export const TYPE_ZH_TO_EN: Record<string, string> = {
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

export const STATUS_MAP: Record<string, string> = {
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

// ══════════════════════════════════════════════════════════════════════════════
// 工具函数
// ══════════════════════════════════════════════════════════════════════════════

export function natureZhToEn(natureZh: string): string {
  return NATURE_ZH_TO_EN[natureZh] || "Serious";
}

// ══════════════════════════════════════════════════════════════════════════════
// 核心计算逻辑（纯函数，与数据库无关）
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 执行伤害计算。接受已解析的英文名称，不涉及任何数据库操作。
 */
export function executeCalc(input: DamageCalcInput, names: ResolvedNames): DamageCalcResult {
  const gen = input.generation as GenerationNum;

  // ── 构建攻击方 ──
  const atkTeraType = input.attacker.teraType
    ? (TYPE_ZH_TO_EN[input.attacker.teraType] || input.attacker.teraType)
    : undefined;
  const atkStatus = input.attacker.status
    ? (STATUS_MAP[input.attacker.status] || "")
    : "";

  const attacker = new Pokemon(gen, names.atkNameEn, {
    level: input.attacker.level || 50,
    nature: natureZhToEn(input.attacker.nature || "认真"),
    ability: names.atkAbilityEn || undefined,
    item: names.atkItemEn || undefined,
    evs: input.attacker.evs as any,
    ivs: input.attacker.ivs as any,
    boosts: input.attacker.boosts as any,
    status: atkStatus as any,
    teraType: atkTeraType as any,
  });

  // ── 构建防守方 ──
  const defTeraType = input.defender.teraType
    ? (TYPE_ZH_TO_EN[input.defender.teraType] || input.defender.teraType)
    : undefined;
  const defStatus = input.defender.status
    ? (STATUS_MAP[input.defender.status] || "")
    : "";

  const defender = new Pokemon(gen, names.defNameEn, {
    level: input.defender.level || 50,
    nature: natureZhToEn(input.defender.nature || "认真"),
    ability: names.defAbilityEn || undefined,
    item: names.defItemEn || undefined,
    evs: input.defender.evs as any,
    ivs: input.defender.ivs as any,
    boosts: input.defender.boosts as any,
    status: defStatus as any,
    teraType: defTeraType as any,
  });

  // ── 构建招式 ──
  const move = new Move(gen, names.moveNameEn, {
    isCrit: input.move.isCrit || false,
    hits: input.move.hits,
  });

  // ── 构建场地 ──
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

// ══════════════════════════════════════════════════════════════════════════════
// 同步版入口
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 同步伤害计算函数。
 * 接受一个 NameResolver 实例（同步），解析所有名称后执行计算。
 * 配合 sqlite-store 的 createNameResolver() 使用。
 *
 * @example
 * ```ts
 * import { calculateDamage } from "@pokemon-localdex/battle-core";
 * import { createNameResolver } from "@pokemon-localdex/sqlite-store";
 * const result = calculateDamage(createNameResolver(), input);
 * ```
 */
export function calculateDamage(
  resolver: NameResolver,
  input: DamageCalcInput
): DamageCalcResult {
  const atkNameEn = resolver.queryPokemonFormNameEn({
    pokemonId: input.attacker.pokemonId,
    formId: input.attacker.formId,
    formKey: input.attacker.formKey,
    nameZh: input.attacker.name,
  }) || input.attacker.name || "Pikachu";

  const atkAbilityEn = (input.attacker.abilityId || input.attacker.ability)
    ? (resolver.queryAbilityNameEn({ id: input.attacker.abilityId, nameZh: input.attacker.ability }) || input.attacker.ability)
    : undefined;

  const atkItemEn = (input.attacker.itemId || input.attacker.item)
    ? (resolver.queryItemNameEn({ id: input.attacker.itemId, nameZh: input.attacker.item }) || input.attacker.item)
    : undefined;

  const defNameEn = resolver.queryPokemonFormNameEn({
    pokemonId: input.defender.pokemonId,
    formId: input.defender.formId,
    formKey: input.defender.formKey,
    nameZh: input.defender.name,
  }) || input.defender.name || "Pikachu";

  const defAbilityEn = (input.defender.abilityId || input.defender.ability)
    ? (resolver.queryAbilityNameEn({ id: input.defender.abilityId, nameZh: input.defender.ability }) || input.defender.ability)
    : undefined;

  const defItemEn = (input.defender.itemId || input.defender.item)
    ? (resolver.queryItemNameEn({ id: input.defender.itemId, nameZh: input.defender.item }) || input.defender.item)
    : undefined;

  const moveNameEn = resolver.queryMoveNameEn({ id: input.move.id, nameZh: input.move.name }) || input.move.name || "Tackle";

  return executeCalc(input, {
    atkNameEn,
    atkAbilityEn,
    atkItemEn,
    defNameEn,
    defAbilityEn,
    defItemEn,
    moveNameEn,
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// 异步版入口
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 异步伤害计算函数。
 * 接受一个 DbAdapter 实例（异步），并行查询所有名称映射后执行计算。
 * 配合 d1-store 的 createDbAdapter() 使用。
 *
 * @example
 * ```ts
 * import { calculateDamageAsync } from "@pokemon-localdex/battle-core";
 * import { createDbAdapter } from "@pokemon-localdex/d1-store";
 * const result = await calculateDamageAsync(createDbAdapter(env.DB), input);
 * ```
 */
export async function calculateDamageAsync(
  adapter: DbAdapter,
  input: DamageCalcInput
): Promise<DamageCalcResult> {
  const [
    atkNameEn,
    atkAbilityEn,
    atkItemEn,
    defNameEn,
    defAbilityEn,
    defItemEn,
    moveNameEn,
  ] = await Promise.all([
    adapter.queryPokemonFormNameEn({
      pokemonId: input.attacker.pokemonId,
      formId: input.attacker.formId,
      formKey: input.attacker.formKey,
      nameZh: input.attacker.name,
    }),
    (input.attacker.abilityId || input.attacker.ability)
      ? adapter.queryAbilityNameEn({ id: input.attacker.abilityId, nameZh: input.attacker.ability })
      : Promise.resolve(undefined),
    (input.attacker.itemId || input.attacker.item)
      ? adapter.queryItemNameEn({ id: input.attacker.itemId, nameZh: input.attacker.item })
      : Promise.resolve(undefined),
    adapter.queryPokemonFormNameEn({
      pokemonId: input.defender.pokemonId,
      formId: input.defender.formId,
      formKey: input.defender.formKey,
      nameZh: input.defender.name,
    }),
    (input.defender.abilityId || input.defender.ability)
      ? adapter.queryAbilityNameEn({ id: input.defender.abilityId, nameZh: input.defender.ability })
      : Promise.resolve(undefined),
    (input.defender.itemId || input.defender.item)
      ? adapter.queryItemNameEn({ id: input.defender.itemId, nameZh: input.defender.item })
      : Promise.resolve(undefined),
    adapter.queryMoveNameEn({ id: input.move.id, nameZh: input.move.name }),
  ]);

  return executeCalc(input, {
    atkNameEn: atkNameEn || input.attacker.name || "Pikachu",
    atkAbilityEn: atkAbilityEn || input.attacker.ability || undefined,
    atkItemEn: atkItemEn || input.attacker.item || undefined,
    defNameEn: defNameEn || input.defender.name || "Pikachu",
    defAbilityEn: defAbilityEn || input.defender.ability || undefined,
    defItemEn: defItemEn || input.defender.item || undefined,
    moveNameEn: moveNameEn || input.move.name || "Tackle",
  });
}
