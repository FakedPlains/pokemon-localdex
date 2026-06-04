/**
 * @pokemon-localdex/store-types — 共享常量
 *
 * 属性、能力值、性格、世代、学习方式、招式分类等全局常量的 source of truth。
 * 所有数据定义集中于此，其他包通过 @pokemon-localdex/store-types/constants 导入。
 */

// ══════════════════════════════════════════════════════════════════════════════
// 工具函数
// ══════════════════════════════════════════════════════════════════════════════

const toMap = <V>(entries: [string | number, V][]): Record<string, V> =>
  Object.fromEntries(entries) as Record<string, V>;

// ══════════════════════════════════════════════════════════════════════════════
// 属性 (Types)
// ══════════════════════════════════════════════════════════════════════════════

export type TypeDef = {
  id: number;
  key: string;
  nameZh: string;
  nameEn: string;
  color: string;
  rgb: string;
  effectiveness: number[];
};

const TYPE_DEFS: TypeDef[] = [
  { id: 1, key: "normal", nameZh: "一般", nameEn: "Normal", color: "#a8a878", rgb: "187,187,170", effectiveness: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.5, 0, 1, 1, 0.5, 1] },
  { id: 2, key: "fire", nameZh: "火", nameEn: "Fire", color: "#f08030", rgb: "255,68,34", effectiveness: [1, 0.5, 0.5, 1, 2, 2, 1, 1, 1, 1, 1, 2, 0.5, 1, 0.5, 1, 2, 1] },
  { id: 3, key: "water", nameZh: "水", nameEn: "Water", color: "#6890f0", rgb: "51,153,255", effectiveness: [1, 2, 0.5, 1, 0.5, 1, 1, 1, 2, 1, 1, 1, 2, 1, 0.5, 1, 1, 1] },
  { id: 4, key: "electric", nameZh: "电", nameEn: "Electric", color: "#f8d030", rgb: "255,204,51", effectiveness: [1, 1, 2, 0.5, 0.5, 1, 1, 1, 0, 2, 1, 1, 1, 1, 0.5, 1, 1, 1] },
  { id: 5, key: "grass", nameZh: "草", nameEn: "Grass", color: "#78c850", rgb: "119,204,85", effectiveness: [1, 0.5, 2, 1, 0.5, 1, 1, 0.5, 2, 0.5, 1, 0.5, 2, 1, 0.5, 1, 0.5, 1] },
  { id: 6, key: "ice", nameZh: "冰", nameEn: "Ice", color: "#98d8d8", rgb: "119,221,255", effectiveness: [1, 0.5, 0.5, 1, 2, 0.5, 1, 1, 2, 2, 1, 1, 1, 1, 2, 1, 0.5, 1] },
  { id: 7, key: "fighting", nameZh: "格斗", nameEn: "Fighting", color: "#c03028", rgb: "187,85,68", effectiveness: [2, 1, 1, 1, 1, 2, 1, 0.5, 1, 0.5, 0.5, 0.5, 2, 0, 1, 2, 2, 0.5] },
  { id: 8, key: "poison", nameZh: "毒", nameEn: "Poison", color: "#a040a0", rgb: "170,85,153", effectiveness: [1, 1, 1, 1, 2, 1, 1, 0.5, 0.5, 1, 1, 1, 0.5, 0.5, 1, 1, 0, 2] },
  { id: 9, key: "ground", nameZh: "地面", nameEn: "Ground", color: "#e0c068", rgb: "221,187,85", effectiveness: [1, 2, 1, 2, 0.5, 1, 1, 2, 1, 0, 1, 0.5, 2, 1, 1, 1, 2, 1] },
  { id: 10, key: "flying", nameZh: "飞行", nameEn: "Flying", color: "#a890f0", rgb: "102,153,255", effectiveness: [1, 1, 1, 0.5, 2, 1, 2, 1, 1, 1, 1, 2, 0.5, 1, 1, 1, 0.5, 1] },
  { id: 11, key: "psychic", nameZh: "超能力", nameEn: "Psychic", color: "#f85888", rgb: "255,85,153", effectiveness: [1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 0.5, 1, 1, 1, 1, 0, 0.5, 1] },
  { id: 12, key: "bug", nameZh: "虫", nameEn: "Bug", color: "#a8b820", rgb: "170,187,34", effectiveness: [1, 0.5, 1, 1, 2, 1, 0.5, 0.5, 1, 0.5, 2, 1, 1, 0.5, 1, 2, 0.5, 0.5] },
  { id: 13, key: "rock", nameZh: "岩石", nameEn: "Rock", color: "#b8a038", rgb: "187,170,102", effectiveness: [1, 2, 1, 1, 1, 2, 0.5, 1, 0.5, 2, 1, 2, 1, 1, 1, 1, 0.5, 1] },
  { id: 14, key: "ghost", nameZh: "幽灵", nameEn: "Ghost", color: "#705898", rgb: "102,102,187", effectiveness: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 0.5, 1, 1] },
  { id: 15, key: "dragon", nameZh: "龙", nameEn: "Dragon", color: "#7038f8", rgb: "119,102,238", effectiveness: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 0.5, 0] },
  { id: 16, key: "dark", nameZh: "恶", nameEn: "Dark", color: "#705848", rgb: "119,85,68", effectiveness: [1, 1, 1, 1, 1, 1, 0.5, 1, 1, 1, 2, 1, 1, 2, 1, 0.5, 1, 0.5] },
  { id: 17, key: "steel", nameZh: "钢", nameEn: "Steel", color: "#b8b8d0", rgb: "170,170,187", effectiveness: [1, 0.5, 0.5, 0.5, 1, 2, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 0.5, 2] },
  { id: 18, key: "fairy", nameZh: "妖精", nameEn: "Fairy", color: "#ee99ac", rgb: "255,170,255", effectiveness: [1, 0.5, 1, 1, 1, 1, 2, 0.5, 1, 1, 1, 1, 1, 1, 2, 2, 0.5, 1] },
];

export type TypeOption = { id: number; key: string; nameZh: string; nameEn: string; color: string };

export const TYPE_OPTIONS: TypeOption[] = TYPE_DEFS.map(({ id, key, nameZh, nameEn, color }) => ({ id, key, nameZh, nameEn, color }));
export const TYPE_IDS: number[] = TYPE_OPTIONS.map(({ id }) => id);
export const TYPE_NAMES: string[] = TYPE_OPTIONS.map(({ nameZh }) => nameZh);
export const ALL_TYPE_OPTIONS: string[] = TYPE_NAMES;

export const TYPE_ID_BY_NAME: Record<string, number> = toMap(
  TYPE_OPTIONS.flatMap(({ id, key, nameZh, nameEn }) => [[nameZh, id], [nameEn, id], [key, id], [String(id), id]] as [string, number][]),
);
export const TYPE_NAME_BY_ID: Record<string, string> = toMap(TYPE_OPTIONS.map(({ id, nameZh }) => [id, nameZh] as [number, string]));
export const TYPE_ZH_TO_EN: Record<string, string> = toMap(TYPE_OPTIONS.map(({ nameZh, nameEn }) => [nameZh, nameEn] as [string, string]));
export const TYPE_EN_TO_ZH: Record<string, string> = toMap(TYPE_OPTIONS.map(({ nameEn, nameZh }) => [nameEn, nameZh] as [string, string]));
export const TYPE_COLORS: Record<string, string> = toMap(TYPE_OPTIONS.map(({ nameZh, color }) => [nameZh, color] as [string, string]));
export const TYPE_COLORS_BY_ID: Record<string, string> = toMap(TYPE_OPTIONS.map(({ id, color }) => [id, color] as [number, string]));
export const TYPE_BG_RGB: Record<string, string> = toMap(TYPE_DEFS.map(({ nameZh, rgb }) => [nameZh, rgb] as [string, string]));
export const TYPE_BG_RGB_BY_ID: Record<string, string> = toMap(TYPE_DEFS.map(({ id, rgb }) => [id, rgb] as [number, string]));
export const TYPE_CHART: Record<string, number[]> = toMap(TYPE_DEFS.map(({ nameZh, effectiveness }) => [nameZh, effectiveness] as [string, number[]]));
export const TYPE_CHART_BY_ID: Record<string, number[]> = toMap(TYPE_DEFS.map(({ id, effectiveness }) => [id, effectiveness] as [number, number[]]));

export function typeNameToId(type: string | number | undefined | null): number | undefined {
  return TYPE_ID_BY_NAME[String(type || "").trim()];
}

export function typeIdToName(typeId: number | string): string {
  return TYPE_NAME_BY_ID[typeId as any] || String(typeId);
}

export function makeTypeBgColors(alpha: number = 0.10): Record<string, string> {
  return toMap(TYPE_DEFS.map(({ nameZh, rgb }) => [nameZh, `rgba(${rgb},${alpha})`] as [string, string]));
}

export function makeTypeBgColorsById(alpha: number = 0.10): Record<string, string> {
  return toMap(TYPE_DEFS.map(({ id, rgb }) => [id, `rgba(${rgb},${alpha})`] as [number, string]));
}

export const TYPE_BG_COLORS: Record<string, string> = makeTypeBgColors(0.10);
export const TYPE_BG_COLORS_CARD: Record<string, string> = makeTypeBgColors(0.18);
export const TYPE_BG_COLORS_BY_ID: Record<string, string> = makeTypeBgColorsById(0.10);
export const TYPE_BG_COLORS_CARD_BY_ID: Record<string, string> = makeTypeBgColorsById(0.18);

// ══════════════════════════════════════════════════════════════════════════════
// 能力值 (Stats)
// ══════════════════════════════════════════════════════════════════════════════

export type StatDef = {
  id: number;
  key: string;
  label: string;
  shortLabel: string;
  compactLabel: string;
  color: string;
};

const STAT_DEFS: StatDef[] = [
  { id: 1, key: "hp", label: "HP", shortLabel: "HP", compactLabel: "HP", color: "#8AC654" },
  { id: 2, key: "atk", label: "攻击", shortLabel: "ATK", compactLabel: "攻", color: "#F8CB3C" },
  { id: 3, key: "def", label: "防御", shortLabel: "DEF", compactLabel: "防", color: "#D98837" },
  { id: 4, key: "spa", label: "特攻", shortLabel: "SPA", compactLabel: "特攻", color: "#59C3D0" },
  { id: 5, key: "spd", label: "特防", shortLabel: "SPD", compactLabel: "特防", color: "#5890CD" },
  { id: 6, key: "spe", label: "速度", shortLabel: "SPE", compactLabel: "速", color: "#A456D0" },
];

export const STAT_OPTIONS: StatDef[] = STAT_DEFS.map((stat) => ({ ...stat }));
export const STAT_IDS: number[] = STAT_OPTIONS.map(({ id }) => id);
export const STAT_KEYS: string[] = STAT_OPTIONS.map(({ key }) => key);
export const STAT_ID_BY_KEY: Record<string, number> = toMap(STAT_OPTIONS.map(({ id, key }) => [key, id] as [string, number]));
export const STAT_KEY_BY_ID: Record<string, string> = toMap(STAT_OPTIONS.map(({ id, key }) => [id, key] as [number, string]));
export const STAT_LABELS: Record<string, string> = toMap(STAT_OPTIONS.map(({ key, label }) => [key, label] as [string, string]));
export const STAT_LABELS_BY_ID: Record<string, string> = toMap(STAT_OPTIONS.map(({ id, label }) => [id, label] as [number, string]));
export const STAT_LABELS_SHORT: Record<string, string> = toMap(STAT_OPTIONS.map(({ key, shortLabel }) => [key, shortLabel] as [string, string]));
export const STAT_LABELS_SHORT_BY_ID: Record<string, string> = toMap(STAT_OPTIONS.map(({ id, shortLabel }) => [id, shortLabel] as [number, string]));
export const STAT_LABELS_COMPACT: Record<string, string> = toMap(STAT_OPTIONS.map(({ key, compactLabel }) => [key, compactLabel] as [string, string]));
export const STAT_LABELS_COMPACT_BY_ID: Record<string, string> = toMap(STAT_OPTIONS.map(({ id, compactLabel }) => [id, compactLabel] as [number, string]));
export const STAT_COLORS: Record<string, string> = toMap(STAT_OPTIONS.map(({ key, color }) => [key, color] as [string, string]));
export const STAT_COLORS_BY_ID: Record<string, string> = toMap(STAT_OPTIONS.map(({ id, color }) => [id, color] as [number, string]));

// ══════════════════════════════════════════════════════════════════════════════
// 性格 (Natures)
// ══════════════════════════════════════════════════════════════════════════════

export type NatureDef = {
  id: number;
  key: string;
  nameZh: string;
  nameEn: string;
  upStatId?: number;
  downStatId?: number;
};

const NATURE_DEFS: NatureDef[] = [
  { id: 1, key: "hardy", nameZh: "勤奋", nameEn: "Hardy" },
  { id: 2, key: "lonely", nameZh: "怕寂寞", nameEn: "Lonely", upStatId: 2, downStatId: 3 },
  { id: 3, key: "adamant", nameZh: "固执", nameEn: "Adamant", upStatId: 2, downStatId: 4 },
  { id: 4, key: "naughty", nameZh: "顽皮", nameEn: "Naughty", upStatId: 2, downStatId: 5 },
  { id: 5, key: "brave", nameZh: "勇敢", nameEn: "Brave", upStatId: 2, downStatId: 6 },
  { id: 6, key: "bold", nameZh: "大胆", nameEn: "Bold", upStatId: 3, downStatId: 2 },
  { id: 7, key: "docile", nameZh: "坦率", nameEn: "Docile" },
  { id: 8, key: "impish", nameZh: "淘气", nameEn: "Impish", upStatId: 3, downStatId: 4 },
  { id: 9, key: "lax", nameZh: "乐天", nameEn: "Lax", upStatId: 3, downStatId: 5 },
  { id: 10, key: "relaxed", nameZh: "悠闲", nameEn: "Relaxed", upStatId: 3, downStatId: 6 },
  { id: 11, key: "timid", nameZh: "胆小", nameEn: "Timid", upStatId: 6, downStatId: 2 },
  { id: 12, key: "hasty", nameZh: "急躁", nameEn: "Hasty", upStatId: 6, downStatId: 3 },
  { id: 13, key: "serious", nameZh: "认真", nameEn: "Serious" },
  { id: 14, key: "jolly", nameZh: "爽朗", nameEn: "Jolly", upStatId: 6, downStatId: 4 },
  { id: 15, key: "naive", nameZh: "天真", nameEn: "Naive", upStatId: 6, downStatId: 5 },
  { id: 16, key: "modest", nameZh: "内敛", nameEn: "Modest", upStatId: 4, downStatId: 2 },
  { id: 17, key: "mild", nameZh: "慢吞吞", nameEn: "Mild" },
  { id: 18, key: "bashful", nameZh: "害羞", nameEn: "Bashful" },
  { id: 19, key: "rash", nameZh: "马虎", nameEn: "Rash", upStatId: 4, downStatId: 3 },
  { id: 20, key: "quiet", nameZh: "冷静", nameEn: "Quiet", upStatId: 4, downStatId: 6 },
  { id: 21, key: "calm", nameZh: "温和", nameEn: "Calm", upStatId: 5, downStatId: 2 },
  { id: 22, key: "gentle", nameZh: "温顺", nameEn: "Gentle", upStatId: 5, downStatId: 3 },
  { id: 23, key: "careful", nameZh: "慎重", nameEn: "Careful", upStatId: 5, downStatId: 4 },
  { id: 24, key: "quirky", nameZh: "浮躁", nameEn: "Quirky" },
  { id: 25, key: "sassy", nameZh: "自大", nameEn: "Sassy", upStatId: 5, downStatId: 6 },
];

export const NATURES: NatureDef[] = NATURE_DEFS.map((nature) => ({ ...nature }));
export const NATURE_OPTIONS: string[] = NATURES.map(({ nameZh }) => nameZh);
export const NATURE_ID_BY_NAME: Record<string, number> = toMap(NATURES.flatMap(({ id, key, nameZh, nameEn }) => [[nameZh, id], [nameEn, id], [key, id], [String(id), id]] as [string, number][]));
export const NATURE_NAME_BY_ID: Record<string, string> = toMap(NATURES.map(({ id, nameZh }) => [id, nameZh] as [number, string]));
export const NATURE_ZH_TO_EN: Record<string, string> = toMap(NATURES.map(({ nameZh, nameEn }) => [nameZh, nameEn] as [string, string]));
export const NATURE_EFFECTS_BY_ID: Record<string, { up: number; down: number }> = toMap(
  NATURES
    .filter(({ upStatId, downStatId }): boolean => !!(upStatId && downStatId))
    .map(({ id, upStatId, downStatId }) => [id, { up: upStatId!, down: downStatId! }] as [number, { up: number; down: number }])
);
export const NATURE_EFFECTS: Record<string, { up: string; down: string }> = toMap(
  NATURES
    .filter(({ upStatId, downStatId }): boolean => !!(upStatId && downStatId))
    .map(({ nameZh, upStatId, downStatId }) => [nameZh, { up: STAT_KEY_BY_ID[upStatId!], down: STAT_KEY_BY_ID[downStatId!] }] as [string, { up: string; down: string }])
);

export function natureNameToId(nature: string | number | undefined | null): number | undefined {
  return NATURE_ID_BY_NAME[String(nature || "").trim()];
}

export function natureIdToName(natureId: number | string): string {
  return NATURE_NAME_BY_ID[natureId as any] || String(natureId);
}

// ══════════════════════════════════════════════════════════════════════════════
// 世代 (Generations)
// ══════════════════════════════════════════════════════════════════════════════

export const GENERATION_OPTIONS: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export const GENERATION_OPTION_OBJECTS: Array<{ id: number; label: string }> = GENERATION_OPTIONS.map((id) => ({ id, label: String(id) }));

/** 世代完整定义：[id, 中文名, 英文名] */
export const GENERATIONS = [
  [1, "第一世代", "Generation I"],
  [2, "第二世代", "Generation II"],
  [3, "第三世代", "Generation III"],
  [4, "第四世代", "Generation IV"],
  [5, "第五世代", "Generation V"],
  [6, "第六世代", "Generation VI"],
  [7, "第七世代", "Generation VII"],
  [8, "第八世代", "Generation VIII"],
  [9, "第九世代", "Generation IX"],
  [99, "Champions", "Champions"],
] as const;

/** 游戏版本：[代码, 中文名, 世代] */
export const GAME_VERSIONS: Array<[string, string, number]> = [
  ["RG", "红/绿", 1], ["B", "蓝", 1], ["Y", "黄", 1],
  ["GS", "金/银", 2], ["C", "水晶", 2],
  ["RS", "红宝石/蓝宝石", 3], ["E", "绿宝石", 3], ["FRLG", "火红/叶绿", 3],
  ["DP", "钻石/珍珠", 4], ["Pt", "白金", 4], ["HGSS", "心金/魂银", 4],
  ["BW", "黑/白", 5], ["B2W2", "黑2/白2", 5],
  ["XY", "X/Y", 6], ["ORAS", "欧米伽红宝石/阿尔法蓝宝石", 6],
  ["SM", "太阳/月亮", 7], ["USUM", "究极之日/究极之月", 7], ["LPLE", "Let's Go 皮卡丘/伊布", 7],
  ["SWSH", "剑/盾", 8], ["SWSHE", "剑/盾 铠之孤岛+冠之雪原", 8], ["BDSP", "晶灿钻石/明亮珍珠", 8], ["LA", "传说 阿尔宙斯", 8],
  ["SV", "朱/紫", 9], ["SVT", "朱/紫 零之秘宝", 9], ["ZA", "传说 Z-A", 9],
  ["CHAMP", "冠军", 99],
];

/** 版本代码到中文名的映射 */
export const GAME_VERSION_NAMES: Map<string, string> = new Map(
  GAME_VERSIONS.map(([code, nameZh]) => [code, nameZh])
);

// ══════════════════════════════════════════════════════════════════════════════
// 学习方式 (Learn Methods)
// ══════════════════════════════════════════════════════════════════════════════

export type LearnMethodOption = { id: number; key: string; label: string };

export const LEARN_METHOD_OPTIONS: LearnMethodOption[] = [
  { id: 1, key: "level-up", label: "升级" },
  { id: 2, key: "tm", label: "招式学习器" },
  { id: 3, key: "hm", label: "秘传学习器" },
  { id: 4, key: "egg", label: "蛋招式" },
  { id: 5, key: "tutor", label: "教学" },
  { id: 6, key: "event", label: "活动" },
  { id: 7, key: "evolution", label: "进化" },
  { id: 8, key: "pre-evolution", label: "进化前" },
  { id: 9, key: "form-change", label: "形态变化" },
  { id: 10, key: "other", label: "其他" },
];

export const LEARN_METHOD_IDS: number[] = LEARN_METHOD_OPTIONS.map(({ id }) => id);
export const LEARN_METHOD_ID_BY_KEY: Record<string, number> = toMap(LEARN_METHOD_OPTIONS.map(({ id, key }) => [key, id] as [string, number]));
export const LEARN_METHOD_KEY_BY_ID: Record<string, string> = toMap(LEARN_METHOD_OPTIONS.map(({ id, key }) => [id, key] as [number, string]));
export const LEARN_METHOD_LABELS: Record<string, string> = toMap(LEARN_METHOD_OPTIONS.map(({ key, label }) => [key, label] as [string, string]));
export const LEARN_METHOD_LABELS_BY_ID: Record<string, string> = toMap(LEARN_METHOD_OPTIONS.map(({ id, label }) => [id, label] as [number, string]));

// ══════════════════════════════════════════════════════════════════════════════
// 招式分类 (Categories)
// ══════════════════════════════════════════════════════════════════════════════

export type CategoryOption = {
  id: number;
  key: string;
  nameZh: string;
  colors: { bg: string; text: string };
};

export const CATEGORY_OPTIONS: CategoryOption[] = [
  { id: 1, key: "physical", nameZh: "物理", colors: { bg: "#FF4400", text: "#FFCC00" } },
  { id: 2, key: "special", nameZh: "特殊", colors: { bg: "#2266CC", text: "#BBEEFF" } },
  { id: 3, key: "status", nameZh: "变化", colors: { bg: "#999999", text: "#EEEEEE" } },
];

export const CATEGORY_ID_BY_NAME: Record<string, number> = toMap(CATEGORY_OPTIONS.flatMap(({ id, key, nameZh }) => [[nameZh, id], [key, id], [String(id), id]] as [string, number][]));
export const CATEGORY_NAME_BY_ID: Record<string, string> = toMap(CATEGORY_OPTIONS.map(({ id, nameZh }) => [id, nameZh] as [number, string]));
export const CATEGORY_KEY_BY_ID: Record<string, string> = toMap(CATEGORY_OPTIONS.map(({ id, key }) => [id, key] as [number, string]));
export const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = toMap(CATEGORY_OPTIONS.map(({ nameZh, colors }) => [nameZh, colors] as [string, { bg: string; text: string }]));
export const CATEGORY_COLORS_BY_ID: Record<string, { bg: string; text: string }> = toMap(CATEGORY_OPTIONS.map(({ id, colors }) => [id, colors] as [number, { bg: string; text: string }]));
export const CATEGORY_BG_COLORS: Record<string, string> = toMap(CATEGORY_OPTIONS.map(({ nameZh, colors }) => [nameZh, colors.bg] as [string, string]));
export const CATEGORY_BG_COLORS_BY_ID: Record<string, string> = toMap(CATEGORY_OPTIONS.map(({ id, colors }) => [id, colors.bg] as [number, string]));

// ══════════════════════════════════════════════════════════════════════════════
// 天气 (Weather)
// ══════════════════════════════════════════════════════════════════════════════

export type WeatherDef = {
  id: number;
  key: string;
  label: string;
  shortLabel: string;
  nameEn: string;
};

/**
 * 天气 source of truth。
 * - id: 数据库枚举 ID（battle-effects 使用）
 * - key: 传递给 battle-core / 前端 state 的 camelCase 标识
 * - label: 中文全称（图鉴/详情展示用）
 * - shortLabel: 按钮短标签（Web FieldControlPanel 使用）
 * - nameEn: smogon-calc 接受的英文天气名
 */
export const WEATHER_DEFS: readonly WeatherDef[] = [
  { id: 1, key: "sun",           label: "晴天",   shortLabel: "晴天", nameEn: "Sun" },
  { id: 2, key: "rain",          label: "雨天",   shortLabel: "雨天", nameEn: "Rain" },
  { id: 3, key: "sand",          label: "沙暴",   shortLabel: "沙暴", nameEn: "Sand" },
  { id: 4, key: "snow",          label: "雪",     shortLabel: "雪",   nameEn: "Snow" },
  { id: 5, key: "harshSunlight", label: "大日照", shortLabel: "大日照", nameEn: "Harsh Sunshine" },
  { id: 6, key: "heavyRain",     label: "大雨",   shortLabel: "大雨", nameEn: "Heavy Rain" },
  { id: 7, key: "strongWinds",   label: "乱流",   shortLabel: "乱流", nameEn: "Strong Winds" },
] as const;

/** key → smogon-calc 英文名 (battle-core 使用)。包含 "hail" 作为 "snow" 的旧世代别名 */
export const WEATHER_KEY_TO_EN: Record<string, string | undefined> = Object.fromEntries(
  [["none", undefined] as [string, string | undefined], ["hail", "Snow"], ...WEATHER_DEFS.map(({ key, nameEn }) => [key, nameEn] as [string, string])]
);
/** smogon-calc 英文名 → 中文 label (breakdown 展示) */
export const WEATHER_EN_TO_ZH: Record<string, string> = toMap(WEATHER_DEFS.map(({ nameEn, label }) => [nameEn, label]));
/** id → key */
export const WEATHER_KEY_BY_ID: Record<number, string> = toMap(WEATHER_DEFS.map(({ id, key }) => [id, key] as [number, string]));
/** id → label */
export const WEATHER_LABEL_BY_ID: Record<number, string> = toMap(WEATHER_DEFS.map(({ id, label }) => [id, label] as [number, string]));

/** Web FieldControlPanel 使用的选项数组。按 UI 分组：晴/强晴、雨/强雨、沙、雪、风 */
const WEATHER_UI_ORDER = ["sun", "harshSunlight", "rain", "heavyRain", "sand", "snow", "strongWinds"] as const;
export const WEATHER_UI_OPTIONS: { v: string; l: string }[] = WEATHER_UI_ORDER.map(
  (k) => { const d = WEATHER_DEFS.find((w) => w.key === k)!; return { v: d.key, l: d.shortLabel }; }
);

// ══════════════════════════════════════════════════════════════════════════════
// 场地 (Terrain)
// ══════════════════════════════════════════════════════════════════════════════

export type TerrainDef = {
  id: number;
  key: string;
  label: string;
  shortLabel: string;
  nameEn: string;
};

/**
 * 场地 source of truth。
 * - id: 数据库枚举 ID（battle-effects 使用）
 * - key: 传递给 battle-core / 前端 state 的小写标识
 * - label: 中文全称
 * - shortLabel: 按钮短标签（Web FieldControlPanel 使用）
 * - nameEn: smogon-calc 接受的英文场地名
 */
export const TERRAIN_DEFS: readonly TerrainDef[] = [
  { id: 1, key: "electric", label: "电气场地", shortLabel: "电气", nameEn: "Electric" },
  { id: 2, key: "grassy",   label: "青草场地", shortLabel: "青草", nameEn: "Grassy" },
  { id: 3, key: "misty",    label: "薄雾场地", shortLabel: "薄雾", nameEn: "Misty" },
  { id: 4, key: "psychic",  label: "精神场地", shortLabel: "精神", nameEn: "Psychic" },
] as const;

/** key → smogon-calc 英文名 (battle-core 使用) */
export const TERRAIN_KEY_TO_EN: Record<string, string | undefined> = Object.fromEntries(
  [["none", undefined] as [string, string | undefined], ...TERRAIN_DEFS.map(({ key, nameEn }) => [key, nameEn] as [string, string])]
);
/** smogon-calc 英文名 → 中文 label (breakdown 展示) */
export const TERRAIN_EN_TO_ZH: Record<string, string> = toMap(TERRAIN_DEFS.map(({ nameEn, label }) => [nameEn, label]));
/** id → key */
export const TERRAIN_KEY_BY_ID: Record<number, string> = toMap(TERRAIN_DEFS.map(({ id, key }) => [id, key] as [number, string]));
/** id → label */
export const TERRAIN_LABEL_BY_ID: Record<number, string> = toMap(TERRAIN_DEFS.map(({ id, label }) => [id, label] as [number, string]));

/** Web FieldControlPanel 使用的选项数组 */
export const TERRAIN_UI_OPTIONS: { v: string; l: string }[] = TERRAIN_DEFS.map(({ key, shortLabel }) => ({ v: key, l: shortLabel }));

/**
 * 小程序 Picker 使用的天气选项（含"无"条目，仅常见天气子集）。
 * "hail" 为旧世代冰雹别名，smogon-calc 同样映射到 Snow。
 */
const WEATHER_PICKER_KEYS = ["sun", "rain", "sand", "hail", "snow"] as const;
const WEATHER_PICKER_LABEL_OVERRIDES: Record<string, string> = { sun: "大晴天", rain: "下雨", hail: "冰雹", snow: "大雪" };
export const WEATHER_PICKER_OPTIONS: { key: string; label: string }[] = [
  { key: "", label: "无" },
  ...WEATHER_PICKER_KEYS.map((k) => {
    const def = WEATHER_DEFS.find((w) => w.key === k);
    return { key: k, label: WEATHER_PICKER_LABEL_OVERRIDES[k] || def?.label || k };
  }),
];

/** 小程序 Picker 使用的场地选项（含"无"条目）。 */
export const TERRAIN_PICKER_OPTIONS: { key: string; label: string }[] = [
  { key: "", label: "无" },
  ...TERRAIN_DEFS.map(({ key, label }) => ({ key, label })),
];

// ══════════════════════════════════════════════════════════════════════════════
// 属性克制计算
// ══════════════════════════════════════════════════════════════════════════════

export function calcTypeEffectiveness(moveType: string | number, defPrimaryType: string | number, defSecondaryType?: string | number | null): number {
  const moveTypeId = typeNameToId(moveType);
  const defPrimaryTypeId = typeNameToId(defPrimaryType);
  if (!moveTypeId || !defPrimaryTypeId) return 1;

  const row = TYPE_CHART_BY_ID[moveTypeId];
  const idx1 = TYPE_IDS.indexOf(defPrimaryTypeId);
  let mult = idx1 >= 0 ? row[idx1] : 1;

  const defSecondaryTypeId = typeNameToId(defSecondaryType);
  if (defSecondaryTypeId && defSecondaryTypeId !== defPrimaryTypeId) {
    const idx2 = TYPE_IDS.indexOf(defSecondaryTypeId);
    if (idx2 >= 0) mult *= row[idx2];
  }

  return mult;
}
