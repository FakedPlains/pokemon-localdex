/**
 * battle-core 内部辅助函数和常量映射。
 */

import {
  NATURE_ZH_TO_EN,
} from "@pokemon-localdex/store-types/constants";

import { EFFECT_TYPE, BATTLE_STAT_LABELS } from "@pokemon-localdex/store-types/battle-effects";

import type { DamageFactor, DamageModifierInfo } from "./types.ts";

// ══════════════════════════════════════════════════════════════════════════════
// 对战倍率常量（替代 magic number）
// ══════════════════════════════════════════════════════════════════════════════

/** STAB 本属性加成倍率 */
export const STAB_MULTIPLIER = "×1.5";
/** 天气增强倍率 */
export const WEATHER_BOOST = "×1.5";
/** 天气削弱倍率 */
export const WEATHER_REDUCE = "×0.5";
/** 场地增强倍率 */
export const TERRAIN_BOOST = "×1.3";
/** 场地削弱倍率 */
export const TERRAIN_REDUCE = "×0.5";
/** 暴击倍率 */
export const CRITICAL_MULTIPLIER = "×1.5";
/** 壁类（单打）减伤倍率 */
export const SCREEN_SINGLES = "×0.5";
/** 壁类（双打）减伤倍率 */
export const SCREEN_DOUBLES = "×0.67";
/** 烧伤减伤倍率 */
export const BURN_MULTIPLIER = "×0.5";
/** 守住减伤倍率 */
export const PROTECT_MULTIPLIER = "×0.25";
/** 帮助增强倍率 */
export const HELPING_HAND_MULTIPLIER = "×1.5";

// ══════════════════════════════════════════════════════════════════════════════
// 常量映射
// ══════════════════════════════════════════════════════════════════════════════

export const STATUS_MAP: Record<string, string> = {
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

/** 能力值英文缩写到中文的映射 */
export const STAT_ZH: Record<string, string> = {
  hp: "HP", atk: "攻击", def: "防御", spa: "特攻", spd: "特防", spe: "速度",
  HP: "HP", Atk: "攻击", Def: "防御", SpA: "特攻", SpD: "特防", Spe: "速度",
};

// ══════════════════════════════════════════════════════════════════════════════
// 工具函数
// ══════════════════════════════════════════════════════════════════════════════

export function natureZhToEn(natureZh: string): string {
  return NATURE_ZH_TO_EN[natureZh] || "Serious";
}

/** 将 "252 SpA" 格式的 EV 描述转为中文 "252 特攻" */
export function evDescToZh(evDesc: string | undefined): string {
  if (!evDesc) return "";
  const match = evDesc.match(/^(\d+\+?)\s*(\w+)$/);
  if (!match) return evDesc;
  const [, value, stat] = match;
  return `${value} ${STAT_ZH[stat] || stat}`;
}

export function nToZh(n: number): string {
  const map: Record<number, string> = { 1: "一", 2: "两", 3: "三", 4: "四", 5: "五", 6: "六" };
  return map[n] || String(n);
}

// ══════════════════════════════════════════════════════════════════════════════
// 天气/场地/特性判断
// ══════════════════════════════════════════════════════════════════════════════

export function getWeatherEffect(weather: string, moveType: string): "boost" | "reduce" | "neutral" {
  if ((weather === "Sun" || weather === "Harsh Sunshine") && moveType === "Fire") return "boost";
  if ((weather === "Sun" || weather === "Harsh Sunshine") && moveType === "Water") return "reduce";
  if ((weather === "Rain" || weather === "Heavy Rain") && moveType === "Water") return "boost";
  if ((weather === "Rain" || weather === "Heavy Rain") && moveType === "Fire") return "reduce";
  return "neutral";
}

export function getTerrainEffect(terrain: string, moveType: string, defenderTypes: string[]): "boost" | "reduce" | "neutral" {
  if (terrain === "Electric" && moveType === "Electric") return "boost";
  if (terrain === "Grassy" && moveType === "Grass") return "boost";
  if (terrain === "Psychic" && moveType === "Psychic") return "boost";
  if (terrain === "Misty" && moveType === "Dragon") return "reduce";
  if (terrain === "Grassy" && (moveType === "Ground")) return "reduce";
  return "neutral";
}

/**
 * 特性的默认 effect 方向：攻击方增强、防守方减弱。
 * 注意：当 getDamageModifier 返回具体倍率后，pushModifierFactor
 * 会根据倍率值覆盖此默认方向（value>1 → boost, <1 → reduce）。
 * 此函数仅在没有倍率数据时提供合理的 fallback。
 */
export function getAbilityEffect(_ability: string, side: "attacker" | "defender"): "boost" | "reduce" | "neutral" {
  if (side === "attacker") return "boost";
  return "reduce";
}

// ══════════════════════════════════════════════════════════════════════════════
// formatModifierValue / pushModifierFactor
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 格式化伤害修正倍率的显示文本。
 * - 能力值倍率 (STAT_MULTIPLY, 101): 显示为 "攻击×2"、"特攻×1.5" 等
 * - 其他伤害倍率 (威力/最终伤害/属性修正等): 显示为 "×1.3"
 */
export function formatModifierValue(mod: DamageModifierInfo): string {
  if (mod.effectType === EFFECT_TYPE.STAT_MULTIPLY && mod.affectedStat) {
    const statLabel = BATTLE_STAT_LABELS[mod.affectedStat] || "能力";
    return `${statLabel}×${mod.value}`;
  }
  return `×${mod.value}`;
}

/**
 * 将 modifier 查询结果转为 factor 并推入数组。
 * 统一处理 effect 方向推断和 value 格式化逻辑。
 */
export function pushModifierFactor(
  factors: DamageFactor[],
  mod: DamageModifierInfo | null | undefined,
  opts: {
    name: string;
    defaultEffect: "boost" | "reduce" | "neutral";
    category: "ability" | "item";
    side: "attacker" | "defender";
  },
): void {
  let value: string | undefined;
  let effect = opts.defaultEffect;

  if (mod != null && mod.value !== 1) {
    value = formatModifierValue(mod);
    // 根据实际倍率推断 effect 方向
    if (opts.side === "defender") {
      // 防守方：倍率>1 表示增强防御 → 对攻击方是"减伤"
      effect = mod.value > 1 ? "reduce" : "boost";
    } else {
      effect = mod.value > 1 ? "boost" : "reduce";
    }
  }

  factors.push({
    name: opts.name,
    effect,
    value,
    category: opts.category,
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// KO 翻译
// ══════════════════════════════════════════════════════════════════════════════

/** KO 概率文本翻译 */
export function translateKoChance(result: any): string {
  let koResult: { chance?: number; n: number; text: string };
  try {
    koResult = result.kochance();
  } catch {
    return "";
  }
  const text = koResult.text;
  if (!text) return "";

  if (text === "guaranteed OHKO") return "确定一击必杀";
  if (/^guaranteed (\d)HKO/.test(text)) {
    const n = text.match(/(\d)HKO/)?.[1];
    return `确定${nToZh(Number(n))}次击杀`;
  }
  if (/^guaranteed KO in (\d+) turns/.test(text)) {
    const n = text.match(/KO in (\d+) turns/)?.[1];
    return `确定${n}回合击杀`;
  }
  if (/^(?:approx\. )?(\d+\.?\d*)% chance to OHKO/.test(text)) {
    const pct = text.match(/(\d+\.?\d*)% chance to OHKO/)?.[1];
    return `${pct}%概率一击必杀`;
  }
  if (/^(?:approx\. )?(\d+\.?\d*)% chance to (\d)HKO/.test(text)) {
    const m = text.match(/(\d+\.?\d*)% chance to (\d)HKO/);
    if (m) return `${m[1]}%概率${nToZh(Number(m[2]))}次击杀`;
  }
  if (/possible (\d)HKO/.test(text)) {
    const n = text.match(/possible (\d)HKO/)?.[1];
    return `可能${nToZh(Number(n))}次击杀`;
  }
  if (text.includes("not a KO")) return "无法击杀";

  return text;
}
