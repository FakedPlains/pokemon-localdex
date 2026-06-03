/**
 * Stat Calculation Model
 * 能力值计算公式的唯一来源。所有计算器组件和辅助函数共同引用此文件。
 */
import { STAT_KEYS, NATURE_EFFECTS } from "@pokemon-localdex/store-types/constants";

/* ── Constants ── */
export const EV_MAX = 252;
export const EV_TOTAL_MAX = 510;
export const IV_MAX = 31;
export const SP_MAX = 32;
export const SP_TOTAL_MAX = 66;

/* ── Utility ── */
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/* ── Nature Multiplier ── */
export function getNatureMultiplier(nature: string, statKey: string): number {
  const effect = NATURE_EFFECTS[nature];
  if (!effect) return 1;
  if (effect.up === statKey) return 1.1;
  if (effect.down === statKey) return 0.9;
  return 1;
}

/* ── Classic stat formula (any level, any IV, any EV) ── */
export function calcClassicStat(base: number, iv: number, ev: number, level: number, nature: string, key: string): number {
  if (base === undefined || base === null) return 0;
  if (key === "hp") {
    return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
  }
  const raw = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5;
  return Math.floor(raw * getNatureMultiplier(nature, key));
}

/* ── Champions simplified formula (Lv.50, IV=31 fixed) ── */
export function calcChampionsStat(base: number, sp: number, nature: string, key: string): number {
  if (base === undefined || base === null) return 0;
  if (key === "hp") return base + sp + 75;
  return Math.floor((base + sp + 20) * getNatureMultiplier(nature, key));
}

/* ── EV ↔ SP conversion ── */
/**
 * 经典 EV → Champions SP 转换
 * Lv.50 时 EV 的实际能力值增量 = ceil(floor(EV/4) / 2)
 * Champions 的 SP 直接就是能力值加成，所以 SP = 该增量
 */
export function evToSp(ev: number): number {
  if (ev <= 0) return 0;
  return clamp(Math.ceil(Math.floor(ev / 4) / 2), 0, SP_MAX);
}

/**
 * SP → 最小 EV 转换
 * SP=1 → 4, SP=2 → 12, SP=32 → 252
 */
export function spToEv(sp: number): number {
  if (sp <= 0) return 0;
  return clamp(4 + (sp - 1) * 8, 0, EV_MAX);
}

/* ── High-level convenience functions ── */

interface MemberConfig {
  statMode?: "classic" | "champions";
  level?: number | string;
  nature?: string;
  champNature?: string;
  ivs?: Record<string, number>;
  evs?: Record<string, number>;
  sps?: Record<string, number>;
}

interface DetailWithStats {
  baseStats?: Record<string, number>;
}

/**
 * 根据完整的 member 配置对象计算某项最终能力值
 * 自动判断 Classic / Champions 模式
 */
export function calculateFinalStat(member: MemberConfig, detail: DetailWithStats, statKey: string): number | undefined {
  const base = detail?.baseStats?.[statKey];
  if (base === undefined) return undefined;

  // Champions 模式：SP 直接加算公式
  if (member.statMode === "champions") {
    const sp = Number(member.sps?.[statKey] ?? 0);
    const nature = member.champNature || member.nature || "认真";
    return calcChampionsStat(base, sp, nature, statKey);
  }

  // 经典模式：IV + EV 公式
  const level = Number(member.level || 50);
  const iv = Number(member.ivs?.[statKey] ?? 31);
  const ev = Number(member.evs?.[statKey] ?? 0);
  return calcClassicStat(base, iv, ev, level, member.nature || "认真", statKey);
}

/**
 * 经典公式的便捷包装（参数用 options 对象）
 */
export function calculateClassicStatValue(
  base: number,
  statKey: string,
  { iv = 31, ev = 0, level = 50, nature = "认真" }: { iv?: number; ev?: number; level?: number; nature?: string } = {}
): number | undefined {
  if (base === undefined || base === null) return undefined;
  return calcClassicStat(base, iv, ev, level, nature, statKey);
}

/**
 * 计算速度线（极速/满速/无投资三档）
 */
export function calculateSpeedLine(baseSpe: number, level = 50) {
  return {
    noInvestment: calculateClassicStatValue(baseSpe, "spe", { iv: 31, ev: 0, level, nature: "认真" }),
    full: calculateClassicStatValue(baseSpe, "spe", { iv: 31, ev: 252, level, nature: "认真" }),
    max: calculateClassicStatValue(baseSpe, "spe", { iv: 31, ev: 252, level, nature: "爽朗" }),
  };
}

/* ── Mode conversion: Classic ↔ Champions ── */

/**
 * 经典 EV 分配 → Champions SP 分配
 * 逐项转换后，若总量超过 SP_TOTAL_MAX 则按比例缩减
 */
export function convertEvsToSps(evs: Record<string, number>): Record<string, number> {
  const converted: Record<string, number> = {};
  for (const k of STAT_KEYS) {
    converted[k] = evToSp(evs[k] || 0);
  }
  const total = STAT_KEYS.reduce((s, k) => s + converted[k], 0);
  if (total > SP_TOTAL_MAX) {
    const scale = SP_TOTAL_MAX / total;
    for (const k of STAT_KEYS) {
      converted[k] = Math.floor(converted[k] * scale);
    }
  }
  return converted;
}

/**
 * Champions SP 分配 → 经典 EV 分配
 * 按 SP 值从大到小排序，贪心分配 EV_TOTAL_MAX 预算
 */
export function convertSpsToEvs(sps: Record<string, number>): Record<string, number> {
  const converted: Record<string, number> = Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
  const sorted = [...STAT_KEYS]
    .filter((k) => (sps[k] || 0) > 0)
    .sort((a, b) => (sps[b] || 0) - (sps[a] || 0));
  let budget = EV_TOTAL_MAX;
  for (const k of sorted) {
    const ideal = spToEv(sps[k] || 0);
    if (ideal <= budget) {
      converted[k] = ideal;
      budget -= ideal;
    } else {
      converted[k] = Math.min(EV_MAX, Math.floor(budget / 4) * 4);
      budget -= converted[k];
    }
  }
  return converted;
}
