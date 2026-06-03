import {
  NATURES,
  NATURE_EFFECTS_BY_ID,
  STAT_LABELS_BY_ID,
  TYPE_OPTIONS,
} from "@pokemon-localdex/store-types/constants";

export const BOOST_STATS = ["atk", "def", "spa", "spd", "spe"] as const;
export const DEFAULT_BOOSTS: Record<string, number> = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

export { EV_MAX, EV_TOTAL_MAX, IV_MAX, SP_MAX, SP_TOTAL_MAX, spToEv } from "../../utils/statCalcModel";

export const NATURE_SELECT_OPTIONS = NATURES.map((nature) => {
  const eff = NATURE_EFFECTS_BY_ID[nature.id];
  return {
    id: nature.id,
    value: nature.nameZh,
    label: nature.nameZh,
    sublabel: eff ? `+${STAT_LABELS_BY_ID[eff.up]} -${STAT_LABELS_BY_ID[eff.down]}` : "无修正",
  };
});

export const TERA_TYPE_OPTIONS = [
  { value: "none", label: "无" },
  ...TYPE_OPTIONS.map((type) => ({ id: type.id, value: type.nameZh, label: type.nameZh })),
  { id: 99, value: "星晶", label: "星晶" },
];

/**
 * 特性 ID → 自动设置的天气/场地 key 映射
 * 用于伤害计算页面：选择含天气/场地特性的宝可梦时，自动联动 FieldControlPanel。
 * 数据源：field_effect_sources 表 (source_type=1, trigger_method=1 即登场设置)
 *
 * key 对应 useFieldState 的 field.weather / field.terrain 值
 */
export interface AbilityFieldMapping {
  type: "weather" | "terrain";
  value: string;
  /** 该映射生效的起始世代（含），未指定表示无下限 */
  generationStart?: number;
  /** 该映射生效的结束世代（含），未指定表示持续有效 */
  generationEnd?: number;
}

// 内部结构：abilityId → 映射条目数组（含世代范围，与 field_effect_sources seed 一致）
const ABILITY_FIELD_RAW: Record<string, AbilityFieldMapping[]> = {
  // ── 天气类特性 ──
  "70":  [{ type: "weather", value: "sun", generationStart: 3 }],                 // 日照 Drought (Gen3+)
  "288": [{ type: "weather", value: "sun", generationStart: 9 }],                 // 绯红脉动 Orichalcum Pulse (Gen9+)
  "2":   [{ type: "weather", value: "rain", generationStart: 3 }],                // 降雨 Drizzle (Gen3+)
  "45":  [{ type: "weather", value: "sand", generationStart: 3 }],                // 扬沙 Sand Stream (Gen3+)
  "117": [
    { type: "weather", value: "hail", generationStart: 3, generationEnd: 8 },     // 降雪 Snow Warning (Gen3-8 = hail)
    { type: "weather", value: "snow", generationStart: 9 },                       // 降雪 Snow Warning (Gen9+ = snow)
  ],
  "190": [{ type: "weather", value: "harshSunlight", generationStart: 6 }],       // 终结之地 Desolate Land (Gen6+)
  "189": [{ type: "weather", value: "heavyRain", generationStart: 6 }],           // 始源之海 Primordial Sea (Gen6+)
  "191": [{ type: "weather", value: "strongWinds", generationStart: 6 }],         // 德尔塔气流 Delta Stream (Gen6+)
  // ── 场地类特性 ──
  "226": [{ type: "terrain", value: "electric", generationStart: 7 }],            // 电气制造者 Electric Surge (Gen7+)
  "289": [{ type: "terrain", value: "electric", generationStart: 9 }],            // 强子引擎 Hadron Engine (Gen9+)
  "229": [{ type: "terrain", value: "grassy", generationStart: 7 }],              // 青草制造者 Grassy Surge (Gen7+)
  "228": [{ type: "terrain", value: "misty", generationStart: 7 }],               // 薄雾制造者 Misty Surge (Gen7+)
  "227": [{ type: "terrain", value: "psychic", generationStart: 7 }],             // 精神制造者 Psychic Surge (Gen7+)
};

/**
 * 根据特性 ID 和当前世代获取对应的天气/场地映射。
 * generation 为 "0" 或 0 表示 Champions 模式，视为最新世代（Gen9）。
 * 返回 null 表示该特性在指定世代无对应天气/场地。
 */
export function getAbilityFieldMapping(
  abilityId: string | number,
  generation: string | number = 0,
): AbilityFieldMapping | null {
  const entries = ABILITY_FIELD_RAW[String(abilityId)];
  if (!entries) return null;

  // Champions 模式 (gen=0) 按最新世代处理
  const gen = Number(generation) || 9;

  for (const entry of entries) {
    const start = entry.generationStart ?? 1;
    const end = entry.generationEnd ?? 99;
    if (gen >= start && gen <= end) {
      return entry;
    }
  }
  return null;
}
