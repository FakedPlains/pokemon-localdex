/**
 * KO 分析核心算法模块
 * - N-HKO 概率计算（基于 16 个等概率乱数）
 * - 属性免疫预判
 * - 批量伤害计算并发控制
 */

// ═══════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════

export interface KOResult {
  /** 需要的攻击次数（1=OHKO, 2=2HKO, ...） */
  n: number;
  /** 是否确定（最差乱数也能达成） */
  guaranteed: boolean;
  /** 概率百分比 */
  percent: number | null;
}

export interface ImmunityCheckResult {
  immune: boolean;
  reason: string;
}

export interface DamageData {
  min: number;
  max: number;
  damageRolls: number[];
  defenderHp: number;
  minPercent: number;
  maxPercent: number;
  description: string;
}

export interface PokemonMember {
  pokemonId: string;
  formId?: string;
  nameZh: string;
  configName?: string;
  level: number;
  itemId: string;
  itemName?: string;
  abilityId: string;
  abilityName?: string;
  nature: string;
  moves?: string[];
  ivs?: Record<string, number>;
  evs?: Record<string, number>;
  sps?: Record<string, number>;
  statMode?: "champions" | "classic";
  primaryType?: string;
  secondaryType?: string;
  imageUrl?: string;
}

export interface MoveInfo {
  id: string;
  nameZh: string;
  name?: string;
  type?: string;
  category?: string;
  power?: number;
}

export interface AttackResultItem {
  target: PokemonMember;
  immuneInfo: ImmunityCheckResult;
  koResult: KOResult | null;
  damageData: DamageData | null;
  error?: string;
}

export interface DefenseResultItem {
  source: PokemonMember;
  moveName: string;
  moveType: string;
  immuneInfo: ImmunityCheckResult;
  koResult: KOResult | null;
  damageData: DamageData | null;
  error?: string;
}

export interface TargetEntry {
  member: PokemonMember;
  moves: MoveInfo[];
}

// ═══════════════════════════════════════════════
// 属性免疫表
// ═══════════════════════════════════════════════

/** 属性免疫：招式属性 → 被免疫的防守属性列表 */
const TYPE_IMMUNITIES: Record<string, string[]> = {
  普通: ["幽灵"],
  格斗: ["幽灵"],
  毒: ["钢"],
  地面: ["飞行"],
  幽灵: ["普通"],
  电: ["地面"],
  超能力: ["恶"],
  龙: ["妖精"],
};

/** 常见特性免疫：特性中文名 → 免疫的招式属性列表 */
const ABILITY_IMMUNITIES: Record<string, string[]> = {
  浮游: ["地面"],
  蓄电: ["电"],
  避雷针: ["电"],
  储水: ["水"],
  引水: ["水"],
  引火: ["火"],
  食草: ["草"],
  干燥皮肤: ["水"],
  电气引擎: ["电"],
};

// ═══════════════════════════════════════════════
// N-HKO 概率计算
// ═══════════════════════════════════════════════

/**
 * 计算 OHKO 概率
 */
export function calcOhkoPercent(damageRolls: number[], defenderHp: number): number {
  if (!damageRolls || damageRolls.length === 0 || defenderHp <= 0) return 0;
  const koRolls = damageRolls.filter((r) => r >= defenderHp).length;
  return (koRolls / damageRolls.length) * 100;
}

/**
 * 计算 2HKO 概率（枚举 16×16 = 256 种组合）
 */
export function calc2hkoPercent(damageRolls: number[], defenderHp: number): number {
  if (!damageRolls || damageRolls.length === 0 || defenderHp <= 0) return 0;
  let koCount = 0;
  for (const r1 of damageRolls) {
    for (const r2 of damageRolls) {
      if (r1 + r2 >= defenderHp) koCount++;
    }
  }
  return (koCount / (damageRolls.length * damageRolls.length)) * 100;
}

/**
 * 计算 3HKO 概率（枚举 16^3 = 4096 种组合）
 */
export function calc3hkoPercent(damageRolls: number[], defenderHp: number): number {
  if (!damageRolls || damageRolls.length === 0 || defenderHp <= 0) return 0;
  let koCount = 0;
  for (const r1 of damageRolls) {
    for (const r2 of damageRolls) {
      for (const r3 of damageRolls) {
        if (r1 + r2 + r3 >= defenderHp) koCount++;
      }
    }
  }
  return (koCount / (damageRolls.length ** 3)) * 100;
}

/**
 * 综合 N-HKO 判定
 */
export function determineKO(damageRolls: number[], defenderHp: number): KOResult | null {
  if (!damageRolls || damageRolls.length === 0 || defenderHp <= 0) return null;

  const min = Math.min(...damageRolls);
  const max = Math.max(...damageRolls);

  // 伤害为 0 → 无法击杀
  if (max === 0) return null;

  // 1HKO
  if (min >= defenderHp) return { n: 1, guaranteed: true, percent: 100 };
  if (max >= defenderHp) return { n: 1, guaranteed: false, percent: calcOhkoPercent(damageRolls, defenderHp) };

  // 2HKO
  if (min * 2 >= defenderHp) return { n: 2, guaranteed: true, percent: 100 };
  if (max * 2 >= defenderHp) return { n: 2, guaranteed: false, percent: calc2hkoPercent(damageRolls, defenderHp) };

  // 3HKO
  if (min * 3 >= defenderHp) return { n: 3, guaranteed: true, percent: 100 };
  if (max * 3 >= defenderHp) return { n: 3, guaranteed: false, percent: calc3hkoPercent(damageRolls, defenderHp) };

  // 4HKO
  if (min * 4 >= defenderHp) return { n: 4, guaranteed: true, percent: 100 };
  if (max * 4 >= defenderHp) return { n: 4, guaranteed: false, percent: null }; // 4HKO 概率不精确计算

  // 5HKO+
  if (max > 0) {
    const minN = Math.ceil(defenderHp / max);
    const maxN = Math.ceil(defenderHp / min);
    return { n: minN, guaranteed: minN === maxN, percent: minN === maxN ? 100 : null };
  }

  return null;
}

/**
 * 生成 KO 判定的文字描述
 */
export function describeKO(koResult: KOResult | null): string {
  if (!koResult) return "无法击杀";

  const { n, guaranteed, percent } = koResult;
  const nText = n === 1 ? "OHKO" : `${n}HKO`;

  if (guaranteed) return `确定 ${nText}`;
  if (percent !== null) return `${nText} (${percent.toFixed(1)}%)`;
  return `${nText} (概率)`;
}

/**
 * 生成 KO 判定的简短标签
 */
export function koLabel(koResult: KOResult | null): string {
  if (!koResult) return "无效";
  const { n, guaranteed } = koResult;
  const nText = n === 1 ? "OHKO" : `${n}HKO`;
  return guaranteed ? `确定${nText}` : `概率${nText}`;
}

// ═══════════════════════════════════════════════
// 属性免疫预判
// ═══════════════════════════════════════════════

/**
 * 判断招式是否对目标免疫
 */
export function checkImmunity(
  moveType: string,
  primaryType: string,
  secondaryType: string,
  abilityName: string
): ImmunityCheckResult {
  // 属性免疫检查
  const immuneTypes = TYPE_IMMUNITIES[moveType];
  if (immuneTypes) {
    if (immuneTypes.includes(primaryType)) {
      return { immune: true, reason: `${primaryType}属性免疫${moveType}招式` };
    }
    if (secondaryType && immuneTypes.includes(secondaryType)) {
      return { immune: true, reason: `${secondaryType}属性免疫${moveType}招式` };
    }
  }

  // 特性免疫检查
  if (abilityName) {
    const abilityImmuneTypes = ABILITY_IMMUNITIES[abilityName];
    if (abilityImmuneTypes && abilityImmuneTypes.includes(moveType)) {
      return { immune: true, reason: `特性「${abilityName}」免疫${moveType}招式` };
    }
  }

  return { immune: false, reason: "" };
}

// ═══════════════════════════════════════════════
// 批量并发控制
// ═══════════════════════════════════════════════

/**
 * 并发控制的批量请求执行器
 */
export async function batchExecute<T>(tasks: Array<() => Promise<T>>, concurrency = 6): Promise<T[]> {
  const results: Promise<T>[] = [];
  const executing = new Set<Promise<T>>();

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const p: Promise<T> = task().then((result) => {
      executing.delete(p);
      return result;
    }).catch((err) => {
      executing.delete(p);
      return { error: err.message || "计算失败" } as unknown as T;
    });

    executing.add(p);
    results.push(p);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
}

// ═══════════════════════════════════════════════
// 结果分组
// ═══════════════════════════════════════════════

/**
 * KO 分析结果分组类型
 */
export const KO_GROUPS = {
  GUARANTEED_KO: "guaranteed_ko",     // 确定 OHKO
  PROBABLE_KO: "probable_ko",         // 概率 OHKO
  MULTI_HKO: "multi_hko",            // 2HKO 及以上
  IMMUNE: "immune",                   // 免疫/无效
} as const;

export const DEFENSE_GROUPS = {
  FATAL: "fatal",           // 确定被 OHKO
  HIGH_RISK: "high_risk",   // 概率被 OHKO
  SAFE: "safe",             // 可以稳定承受
  IMMUNE: "immune",         // 免疫
} as const;

export type KOGroupKey = typeof KO_GROUPS[keyof typeof KO_GROUPS];
export type DefenseGroupKey = typeof DEFENSE_GROUPS[keyof typeof DEFENSE_GROUPS];

export type AttackResultGroups = Record<KOGroupKey, AttackResultItem[]>;
export type DefenseResultGroups = Record<DefenseGroupKey, DefenseResultItem[]>;

/**
 * 对斩杀线分析结果进行分组
 */
export function groupAttackResults(results: AttackResultItem[]): AttackResultGroups {
  const groups: AttackResultGroups = {
    [KO_GROUPS.GUARANTEED_KO]: [],
    [KO_GROUPS.PROBABLE_KO]: [],
    [KO_GROUPS.MULTI_HKO]: [],
    [KO_GROUPS.IMMUNE]: [],
  };

  for (const item of results) {
    if (item.immuneInfo?.immune) {
      groups[KO_GROUPS.IMMUNE].push(item);
    } else if (!item.koResult) {
      groups[KO_GROUPS.IMMUNE].push(item);
    } else if (item.koResult.n === 1 && item.koResult.guaranteed) {
      groups[KO_GROUPS.GUARANTEED_KO].push(item);
    } else if (item.koResult.n === 1 && !item.koResult.guaranteed) {
      groups[KO_GROUPS.PROBABLE_KO].push(item);
    } else {
      groups[KO_GROUPS.MULTI_HKO].push(item);
    }
  }

  return groups;
}

/**
 * 对防守线分析结果进行分组
 */
export function groupDefenseResults(results: DefenseResultItem[]): DefenseResultGroups {
  const groups: DefenseResultGroups = {
    [DEFENSE_GROUPS.FATAL]: [],
    [DEFENSE_GROUPS.HIGH_RISK]: [],
    [DEFENSE_GROUPS.SAFE]: [],
    [DEFENSE_GROUPS.IMMUNE]: [],
  };

  for (const item of results) {
    if (item.immuneInfo?.immune) {
      groups[DEFENSE_GROUPS.IMMUNE].push(item);
    } else if (!item.koResult) {
      groups[DEFENSE_GROUPS.IMMUNE].push(item);
    } else if (item.koResult.n === 1 && item.koResult.guaranteed) {
      groups[DEFENSE_GROUPS.FATAL].push(item);
    } else if (item.koResult.n === 1 && !item.koResult.guaranteed) {
      groups[DEFENSE_GROUPS.HIGH_RISK].push(item);
    } else {
      groups[DEFENSE_GROUPS.SAFE].push(item);
    }
  }

  // 致命威胁按伤害百分比降序排
  groups[DEFENSE_GROUPS.FATAL].sort((a, b) => (b.damageData?.maxPercent || 0) - (a.damageData?.maxPercent || 0));
  groups[DEFENSE_GROUPS.HIGH_RISK].sort((a, b) => (b.damageData?.maxPercent || 0) - (a.damageData?.maxPercent || 0));

  return groups;
}
