const toMap = (entries: Array<[string | number, unknown]>) => Object.fromEntries(entries);

const TYPE_DEFS = [
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
export const TYPE_IDS = TYPE_OPTIONS.map(({ id }) => id);
export const TYPE_NAMES = TYPE_OPTIONS.map(({ nameZh }) => nameZh);
export const ALL_TYPE_OPTIONS = TYPE_NAMES;
export const TYPE_ID_BY_NAME = toMap(TYPE_OPTIONS.flatMap(({ id, key, nameZh, nameEn }) => [[nameZh, id], [nameEn, id], [key, id], [String(id), id]])) as Record<string, number>;
export const TYPE_NAME_BY_ID = toMap(TYPE_OPTIONS.map(({ id, nameZh }) => [id, nameZh])) as Record<number, string>;
export const TYPE_ZH_TO_EN = toMap(TYPE_OPTIONS.map(({ nameZh, nameEn }) => [nameZh, nameEn])) as Record<string, string>;
export const TYPE_COLORS = toMap(TYPE_OPTIONS.map(({ nameZh, color }) => [nameZh, color])) as Record<string, string>;
export const TYPE_COLORS_BY_ID = toMap(TYPE_OPTIONS.map(({ id, color }) => [id, color])) as Record<number, string>;
export const TYPE_BG_RGB = toMap(TYPE_DEFS.map(({ nameZh, rgb }) => [nameZh, rgb])) as Record<string, string>;
export const TYPE_BG_RGB_BY_ID = toMap(TYPE_DEFS.map(({ id, rgb }) => [id, rgb])) as Record<number, string>;
export const TYPE_CHART = toMap(TYPE_DEFS.map(({ nameZh, effectiveness }) => [nameZh, effectiveness])) as Record<string, number[]>;
export const TYPE_CHART_BY_ID = toMap(TYPE_DEFS.map(({ id, effectiveness }) => [id, effectiveness])) as Record<number, number[]>;

export const TYPE_ALIASES: Record<string, string> = {
  電: "电",
  飛行: "飞行",
  蟲: "虫",
  龍: "龙",
  惡: "恶",
  鋼: "钢",
  格鬥: "格斗",
  幽靈: "幽灵",
};

export function typeNameToId(type: string | undefined): number | undefined {
  const normalized = TYPE_ALIASES[String(type || "").trim()] || String(type || "").trim();
  return TYPE_ID_BY_NAME[normalized];
}

export function typeIdToName(typeId: number | string | undefined): string {
  if (typeof typeId === "number") return TYPE_NAME_BY_ID[typeId] || String(typeId);
  return String(typeId);
}

export function makeTypeBgColors(alpha = 0.10): Record<string, string> {
  return toMap(TYPE_DEFS.map(({ nameZh, rgb }) => [nameZh, `rgba(${rgb},${alpha})`])) as Record<string, string>;
}

export function makeTypeBgColorsById(alpha = 0.10): Record<number, string> {
  return toMap(TYPE_DEFS.map(({ id, rgb }) => [id, `rgba(${rgb},${alpha})`])) as Record<number, string>;
}

export const TYPE_BG_COLORS = makeTypeBgColors(0.10);
export const TYPE_BG_COLORS_CARD = makeTypeBgColors(0.18);
export const TYPE_BG_COLORS_BY_ID = makeTypeBgColorsById(0.10);
export const TYPE_BG_COLORS_CARD_BY_ID = makeTypeBgColorsById(0.18);

const STAT_DEFS = [
  { id: 1, key: "hp", label: "HP", shortLabel: "HP", compactLabel: "HP", color: "#8AC654" },
  { id: 2, key: "atk", label: "攻击", shortLabel: "ATK", compactLabel: "攻", color: "#F8CB3C" },
  { id: 3, key: "def", label: "防御", shortLabel: "DEF", compactLabel: "防", color: "#D98837" },
  { id: 4, key: "spa", label: "特攻", shortLabel: "SPA", compactLabel: "特攻", color: "#59C3D0" },
  { id: 5, key: "spd", label: "特防", shortLabel: "SPD", compactLabel: "特防", color: "#5890CD" },
  { id: 6, key: "spe", label: "速度", shortLabel: "SPE", compactLabel: "速", color: "#A456D0" },
];

export const STAT_OPTIONS = STAT_DEFS.map((stat) => ({ ...stat }));
export const STAT_IDS = STAT_OPTIONS.map(({ id }) => id);
export const STAT_KEYS: readonly ("hp" | "atk" | "def" | "spa" | "spd" | "spe")[] = ["hp", "atk", "def", "spa", "spd", "spe"];
export const STAT_ID_BY_KEY = toMap(STAT_OPTIONS.map(({ id, key }) => [key, id])) as Record<string, number>;
export const STAT_KEY_BY_ID = toMap(STAT_OPTIONS.map(({ id, key }) => [id, key])) as Record<number, string>;
export const STAT_LABELS = toMap(STAT_OPTIONS.map(({ key, label }) => [key, label])) as Record<string, string>;
export const STAT_LABELS_BY_ID = toMap(STAT_OPTIONS.map(({ id, label }) => [id, label])) as Record<number, string>;
export const STAT_LABELS_SHORT = toMap(STAT_OPTIONS.map(({ key, shortLabel }) => [key, shortLabel])) as Record<string, string>;
export const STAT_LABELS_SHORT_BY_ID = toMap(STAT_OPTIONS.map(({ id, shortLabel }) => [id, shortLabel])) as Record<number, string>;
export const STAT_LABELS_COMPACT = toMap(STAT_OPTIONS.map(({ key, compactLabel }) => [key, compactLabel])) as Record<string, string>;
export const STAT_LABELS_COMPACT_BY_ID = toMap(STAT_OPTIONS.map(({ id, compactLabel }) => [id, compactLabel])) as Record<number, string>;
export const STAT_COLORS = toMap(STAT_OPTIONS.map(({ key, color }) => [key, color])) as Record<string, string>;
export const STAT_COLORS_BY_ID = toMap(STAT_OPTIONS.map(({ id, color }) => [id, color])) as Record<number, string>;

const NATURE_DEFS = [
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

export const NATURES = NATURE_DEFS.map((nature) => ({ ...nature }));
export const NATURE_OPTIONS = NATURES.map(({ nameZh }) => nameZh);
export const NATURE_ID_BY_NAME = toMap(NATURES.flatMap(({ id, key, nameZh, nameEn }) => [[nameZh, id], [nameEn, id], [key, id], [String(id), id]])) as Record<string, number>;
export const NATURE_NAME_BY_ID = toMap(NATURES.map(({ id, nameZh }) => [id, nameZh])) as Record<number, string>;
export const NATURE_ZH_TO_EN = toMap(NATURES.map(({ nameZh, nameEn }) => [nameZh, nameEn])) as Record<string, string>;
export const NATURE_EFFECTS_BY_ID = toMap(
  NATURES
    .filter(({ upStatId, downStatId }) => upStatId && downStatId)
    .map(({ id, upStatId, downStatId }) => [id, { up: upStatId, down: downStatId }])
) as Record<number, { up: number; down: number }>;
export const NATURE_EFFECTS = toMap(
  NATURES
    .filter(({ nameZh, upStatId, downStatId }) => nameZh && upStatId && downStatId)
    .map(({ nameZh, upStatId, downStatId }) => [nameZh, { up: STAT_KEY_BY_ID[upStatId!], down: STAT_KEY_BY_ID[downStatId!] }])
) as Record<string, { up: string; down: string }>;

export function natureNameToId(nature: string | undefined): number | undefined {
  return NATURE_ID_BY_NAME[String(nature || "").trim()];
}

export function natureIdToName(natureId: number | string | undefined): string {
  if (typeof natureId === "number") return NATURE_NAME_BY_ID[natureId] || String(natureId);
  return String(natureId);
}

export const GENERATION_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export const GENERATION_OPTION_OBJECTS = GENERATION_OPTIONS.map((id) => ({ id, label: String(id) }));

export const LEARN_METHOD_OPTIONS = [
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

export const LEARN_METHOD_IDS = LEARN_METHOD_OPTIONS.map(({ id }) => id);
export const LEARN_METHOD_ID_BY_KEY = toMap(LEARN_METHOD_OPTIONS.map(({ id, key }) => [key, id])) as Record<string, number>;
export const LEARN_METHOD_KEY_BY_ID = toMap(LEARN_METHOD_OPTIONS.map(({ id, key }) => [id, key])) as Record<number, string>;
export const LEARN_METHOD_LABELS = toMap(LEARN_METHOD_OPTIONS.map(({ key, label }) => [key, label])) as Record<string, string>;
export const LEARN_METHOD_LABELS_BY_ID = toMap(LEARN_METHOD_OPTIONS.map(({ id, label }) => [id, label])) as Record<number, string>;

export type CategoryOption = { id: number; key: string; nameZh: string; colors: { bg: string; text: string } };
export const CATEGORY_OPTIONS: CategoryOption[] = [
  { id: 1, key: "physical", nameZh: "物理", colors: { bg: "#FF4400", text: "#FFCC00" } },
  { id: 2, key: "special", nameZh: "特殊", colors: { bg: "#2266CC", text: "#BBEEFF" } },
  { id: 3, key: "status", nameZh: "变化", colors: { bg: "#999999", text: "#EEEEEE" } },
];

export const CATEGORY_ID_BY_NAME = toMap(CATEGORY_OPTIONS.flatMap(({ id, key, nameZh }) => [[nameZh, id], [key, id], [String(id), id]])) as Record<string, number>;
export const CATEGORY_NAME_BY_ID = toMap(CATEGORY_OPTIONS.map(({ id, nameZh }) => [id, nameZh])) as Record<number, string>;
export const CATEGORY_KEY_BY_ID = toMap(CATEGORY_OPTIONS.map(({ id, key }) => [id, key])) as Record<number, string>;
export const CATEGORY_COLORS = toMap(CATEGORY_OPTIONS.map(({ nameZh, colors }) => [nameZh, colors])) as Record<string, { bg: string; text: string }>;
export const CATEGORY_COLORS_BY_ID = toMap(CATEGORY_OPTIONS.map(({ id, colors }) => [id, colors])) as Record<number, { bg: string; text: string }>;
export const CATEGORY_BG_COLORS = toMap(CATEGORY_OPTIONS.map(({ nameZh, colors }) => [nameZh, colors.bg])) as Record<string, string>;
export const CATEGORY_BG_COLORS_BY_ID = toMap(CATEGORY_OPTIONS.map(({ id, colors }) => [id, colors.bg])) as Record<number, string>;

export function calcTypeEffectiveness(moveType: string | undefined, defPrimaryType: string | undefined, defSecondaryType?: string | undefined): number {
  const moveTypeId = typeNameToId(moveType);
  const defPrimaryTypeId = typeNameToId(defPrimaryType);
  if (!moveTypeId || !defPrimaryTypeId) return 1;

  const row = TYPE_CHART_BY_ID[moveTypeId];
  if (!row) return 1;
  const idx1 = TYPE_IDS.indexOf(defPrimaryTypeId);
  let mult: number = idx1 >= 0 ? (row[idx1] ?? 1) : 1;

  const defSecondaryTypeId = typeNameToId(defSecondaryType);
  if (defSecondaryTypeId && defSecondaryTypeId !== defPrimaryTypeId) {
    const idx2 = TYPE_IDS.indexOf(defSecondaryTypeId);
    if (idx2 >= 0) mult *= row[idx2] ?? 1;
  }

  return mult;
}
