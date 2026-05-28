/**
 * 战斗效果结构化数据 — 枚举常量与中文标签
 *
 * 数据库中所有枚举字段存储为整数，代码中通过此文件映射为语义标识和 UI 展示文案。
 * 编号规则：按功能域分段，每段预留空间便于扩展。
 *
 * 设计模式：每个枚举域使用 DEFS 数组作为 source of truth，
 * 再从中派生出 ID 常量对象和 LABELS 映射，避免重复维护。
 * 与 constants.ts 中已有定义重复的部分（如招式分类）直接复用，不重复定义。
 */

import { CATEGORY_OPTIONS } from "./constants.ts";

// ══════════════════════════════════════════════════════════════════════════════
// 工具函数
// ══════════════════════════════════════════════════════════════════════════════

type EnumDef = { readonly id: number; readonly key: string; readonly label: string };

/** 从定义数组生成 { KEY: id } 常量对象 */
function buildEnum<T extends readonly EnumDef[]>(defs: T): { [K in T[number]["key"]]: number } {
  return Object.fromEntries(defs.map((d) => [d.key, d.id])) as any;
}

/** 从定义数组生成 { [id]: label } 映射 */
function buildLabels<T extends readonly EnumDef[]>(defs: T): Record<number, string> {
  return Object.fromEntries(defs.map((d) => [d.id, d.label]));
}

// ══════════════════════════════════════════════════════════════════════════════
// effect_type — 效果类别（做了什么）
// ══════════════════════════════════════════════════════════════════════════════

const EFFECT_TYPE_DEFS = [
  // 能力值修正 (1xx)
  { id: 101, key: "STAT_MULTIPLY", label: "能力值倍率修正" },
  { id: 102, key: "STAT_STAGE", label: "能力等级变化" },
  { id: 103, key: "STAT_SWAP", label: "能力值互换" },
  // 招式威力修正 (2xx)
  { id: 201, key: "BASE_POWER_MULTIPLY", label: "基础威力倍率" },
  { id: 202, key: "FINAL_DAMAGE_MULTIPLY", label: "最终伤害倍率" },
  { id: 203, key: "SUPER_EFFECTIVE_MODIFY", label: "超效伤害修正" },
  { id: 204, key: "NOT_EFFECTIVE_MODIFY", label: "抵抗伤害修正" },
  { id: 205, key: "WEATHER_POWER_MODIFY", label: "天气威力修正" },
  { id: 206, key: "TERRAIN_POWER_MODIFY", label: "场地威力修正" },
  // 属性/STAB (3xx)
  { id: 301, key: "TYPE_IMMUNITY", label: "属性免疫" },
  { id: 302, key: "TYPE_ABSORB", label: "属性吸收" },
  { id: 303, key: "TYPE_CHANGE_MOVE", label: "改变招式属性" },
  { id: 304, key: "TYPE_CHANGE_SELF", label: "改变自身属性" },
  { id: 305, key: "STAB_MODIFY", label: "本系加成修正" },
  // 天气/场地 (4xx)
  { id: 401, key: "WEATHER_SET", label: "设置天气" },
  { id: 402, key: "TERRAIN_SET", label: "设置场地" },
  // 暴击 (5xx)
  { id: 501, key: "CRIT_STAGE", label: "暴击率修正" },
  { id: 502, key: "CRIT_DAMAGE_MULTIPLY", label: "暴击伤害倍率" },
  { id: 503, key: "CRIT_PREVENT", label: "防止暴击" },
  { id: 504, key: "CRIT_GUARANTEE", label: "必定暴击" },
  // 优先度 (6xx)
  { id: 601, key: "PRIORITY_MODIFY", label: "优先度修正" },
  // 防御/减伤 (7xx)
  { id: 701, key: "SCREEN_REDUCE", label: "屏障减伤" },
  { id: 702, key: "MOVE_BLOCK", label: "阻挡招式" },
  { id: 703, key: "SURVIVAL", label: "存活保证" },
  // 反击/附带效果 (8xx)
  { id: 801, key: "CONTACT_PUNISH", label: "接触反击" },
  { id: 802, key: "RECOIL", label: "反作用力" },
  { id: 803, key: "DRAIN", label: "吸收回复" },
  { id: 804, key: "HP_FRACTION_DAMAGE", label: "HP比例伤害" },
  // 招式特殊机制 (9xx)
  { id: 901, key: "MULTI_HIT", label: "多段攻击" },
  { id: 902, key: "SPECIAL_FORMULA", label: "特殊伤害公式" },
  // 其他 (10xx)
  { id: 1001, key: "FORM_CHANGE", label: "形态变化" },
  { id: 1002, key: "ABILITY_NEGATE", label: "无视特性" },
  { id: 1003, key: "CONSUMABLE_TYPE_RESIST", label: "消耗性属性减伤" },
] as const;

export const EFFECT_TYPE = buildEnum(EFFECT_TYPE_DEFS);
export type EffectType = typeof EFFECT_TYPE_DEFS[number]["id"];
export const EFFECT_TYPE_LABELS: Record<number, string> = buildLabels(EFFECT_TYPE_DEFS);

// ══════════════════════════════════════════════════════════════════════════════
// trigger — 触发条件（什么时候触发）
// ══════════════════════════════════════════════════════════════════════════════

const TRIGGER_DEFS = [
  { id: 1, key: "ALWAYS", label: "始终生效" },
  { id: 2, key: "ON_SWITCH_IN", label: "登场时" },
  { id: 3, key: "HP_BELOW_THRESHOLD", label: "HP低于阈值时" },
  { id: 4, key: "HP_FULL", label: "HP满时" },
  { id: 5, key: "IN_WEATHER", label: "特定天气中" },
  { id: 6, key: "IN_TERRAIN", label: "特定场地中" },
  { id: 7, key: "ON_ATTACK", label: "攻击时" },
  { id: 8, key: "ON_DEFEND", label: "被攻击时" },
  { id: 9, key: "ON_CONTACT_RECEIVED", label: "被接触招式命中时" },
  { id: 10, key: "ON_SUPER_EFFECTIVE_RECEIVED", label: "受到超效伤害时" },
  { id: 11, key: "ON_STATUS", label: "处于异常状态时" },
  { id: 12, key: "WHEN_HIT_BY_TYPE", label: "被特定属性命中时" },
  { id: 13, key: "ON_USE_MOVE_TYPE", label: "使用特定属性招式时" },
  { id: 14, key: "ON_CONSECUTIVE_USE", label: "连续使用同招式时" },
  { id: 15, key: "MOVE_BP_THRESHOLD", label: "招式威力在阈值内" },
  { id: 16, key: "ON_LAST_MOVE", label: "后手攻击时" },
  { id: 17, key: "ALLIES_FAINTED", label: "队友倒下后" },
  { id: 18, key: "ON_OPPONENT_STAT_DROP", label: "己方能力被降低时" },
] as const;

export const TRIGGER = buildEnum(TRIGGER_DEFS);
export type Trigger = typeof TRIGGER_DEFS[number]["id"];
export const TRIGGER_LABELS: Record<number, string> = buildLabels(TRIGGER_DEFS);

// ══════════════════════════════════════════════════════════════════════════════
// target — 效果目标（对谁生效）
// ══════════════════════════════════════════════════════════════════════════════

const TARGET_DEFS = [
  { id: 1, key: "SELF", label: "自身" },
  { id: 2, key: "OPPONENT", label: "对手" },
  { id: 3, key: "ALL_OPPONENTS", label: "所有对手" },
  { id: 4, key: "ALLY", label: "队友" },
  { id: 5, key: "SELF_SIDE", label: "己方场地" },
  { id: 6, key: "OPPONENT_SIDE", label: "对方场地" },
  { id: 7, key: "FIELD", label: "全场" },
] as const;

export const TARGET = buildEnum(TARGET_DEFS);
export type Target = typeof TARGET_DEFS[number]["id"];
export const TARGET_LABELS: Record<number, string> = buildLabels(TARGET_DEFS);

// ══════════════════════════════════════════════════════════════════════════════
// modifier_type — 修正方式（怎么修正）
// ══════════════════════════════════════════════════════════════════════════════

const MODIFIER_TYPE_DEFS = [
  { id: 1, key: "MULTIPLY", label: "倍率修正" },
  { id: 2, key: "ADD_STAGE", label: "等级增减" },
  { id: 3, key: "SET_IMMUNITY", label: "完全免疫" },
  { id: 4, key: "SET_WEATHER", label: "设置天气" },
  { id: 5, key: "SET_TERRAIN", label: "设置场地" },
  { id: 6, key: "BLOCK", label: "阻挡" },
  { id: 7, key: "REPLACE_STAT", label: "能力值替代" },
  { id: 8, key: "FIXED_VALUE", label: "固定数值" },
  { id: 9, key: "FRACTION", label: "HP比例" },
] as const;

export const MODIFIER_TYPE = buildEnum(MODIFIER_TYPE_DEFS);
export type ModifierType = typeof MODIFIER_TYPE_DEFS[number]["id"];
export const MODIFIER_TYPE_LABELS: Record<number, string> = buildLabels(MODIFIER_TYPE_DEFS);

// ══════════════════════════════════════════════════════════════════════════════
// affected_stat — 受影响的能力值
// 复用 constants.ts 中 STAT_DEFS 的 id（1~6），此处扩展命中/闪避
// ══════════════════════════════════════════════════════════════════════════════

const BATTLE_STAT_DEFS = [
  { id: 1, key: "HP", label: "HP" },
  { id: 2, key: "ATK", label: "攻击" },
  { id: 3, key: "DEF", label: "防御" },
  { id: 4, key: "SPA", label: "特攻" },
  { id: 5, key: "SPD", label: "特防" },
  { id: 6, key: "SPE", label: "速度" },
  { id: 7, key: "ACCURACY", label: "命中率" },
  { id: 8, key: "EVASION", label: "闪避率" },
] as const;

export const BATTLE_STAT = buildEnum(BATTLE_STAT_DEFS);
export type BattleStat = typeof BATTLE_STAT_DEFS[number]["id"];
export const BATTLE_STAT_LABELS: Record<number, string> = buildLabels(BATTLE_STAT_DEFS);

// ══════════════════════════════════════════════════════════════════════════════
// move_flag — 招式标签
// ══════════════════════════════════════════════════════════════════════════════

const MOVE_FLAG_DEFS = [
  { id: 1, key: "CONTACT", label: "接触" },
  { id: 2, key: "SOUND", label: "声音" },
  { id: 3, key: "PUNCH", label: "拳类" },
  { id: 4, key: "BITE", label: "咬类" },
  { id: 5, key: "PULSE", label: "波动/脉冲类" },
  { id: 6, key: "BALL", label: "球/弹类" },
  { id: 7, key: "POWDER", label: "粉尘类" },
  { id: 8, key: "WIND", label: "风类" },
  { id: 9, key: "SLICING", label: "切割类" },
  { id: 10, key: "RECOIL", label: "反作用力类" },
] as const;

export const MOVE_FLAG = buildEnum(MOVE_FLAG_DEFS);
export type MoveFlag = typeof MOVE_FLAG_DEFS[number]["id"];
export const MOVE_FLAG_LABELS: Record<number, string> = buildLabels(MOVE_FLAG_DEFS);

// ══════════════════════════════════════════════════════════════════════════════
// move_category — 招式分类筛选（物理/特殊/变化）
// 直接复用 constants.ts 中 CATEGORY_OPTIONS（1=物理, 2=特殊, 3=变化）
// ══════════════════════════════════════════════════════════════════════════════

export const MOVE_CATEGORY = Object.fromEntries(
  CATEGORY_OPTIONS.map(({ id, key }) => [key.toUpperCase(), id])
) as { PHYSICAL: 1; SPECIAL: 2; STATUS: 3 };
export type MoveCategory = 1 | 2 | 3;

// ══════════════════════════════════════════════════════════════════════════════
// weather / terrain — 天气与场地类型
// 定义已收口到 constants.ts 的 WEATHER_DEFS / TERRAIN_DEFS，此处仅复用类型 ID。
// ══════════════════════════════════════════════════════════════════════════════

export type Weather = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Terrain = 1 | 2 | 3 | 4;

// ══════════════════════════════════════════════════════════════════════════════
// 战斗效果记录类型（对应数据库行）
// ══════════════════════════════════════════════════════════════════════════════

export type BattleEffectRow = {
  id: number;
  entityId: number;
  effectType: EffectType;
  trigger: Trigger;
  target: Target;
  modifierType: ModifierType;
  modifierValue: number | null;
  affectedStat: BattleStat | null;
  affectedType: number | null;       // 属性 ID（复用 TYPE_DEFS 的 id）
  affectedMoveFlag: MoveFlag | null;
  affectedMoveCategory: MoveCategory | null;
  params: string | null;             // JSON 扩展参数
  generationStart: number;
  generationEnd: number | null;
  priority: number;
  note: string | null;
};

export type AbilityBattleEffect = BattleEffectRow & { abilityId: number };
export type ItemBattleEffect = BattleEffectRow & {
  itemId: number;
  consumable: boolean;
  speciesRestriction: string | null;  // JSON 数组
};
export type MoveBattleEffect = BattleEffectRow & { moveId: number };
