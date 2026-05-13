export const TYPE_NAMES = [
  "一般", "火", "水", "电", "草", "冰", "格斗", "毒", "地面",
  "飞行", "超能力", "虫", "岩石", "幽灵", "龙", "恶", "钢", "妖精",
];

export const ALL_TYPE_OPTIONS = TYPE_NAMES;

export const TYPE_ALIASES = {
  電: "电", 飛行: "飞行", 蟲: "虫", 龍: "龙",
  惡: "恶", 鋼: "钢", 格鬥: "格斗", 幽靈: "幽灵",
};

export const TYPE_ZH_TO_EN = {
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

export const TYPE_COLORS = {
  一般: "#a8a878",
  火: "#f08030",
  水: "#6890f0",
  电: "#f8d030",
  草: "#78c850",
  冰: "#98d8d8",
  格斗: "#c03028",
  毒: "#a040a0",
  地面: "#e0c068",
  飞行: "#a890f0",
  超能力: "#f85888",
  虫: "#a8b820",
  岩石: "#b8a038",
  幽灵: "#705898",
  龙: "#7038f8",
  恶: "#705848",
  钢: "#b8b8d0",
  妖精: "#ee99ac",
};

export const TYPE_BG_RGB = {
  一般: "187,187,170",
  火: "255,68,34",
  水: "51,153,255",
  电: "255,204,51",
  草: "119,204,85",
  冰: "119,221,255",
  格斗: "187,85,68",
  毒: "170,85,153",
  地面: "221,187,85",
  飞行: "102,153,255",
  超能力: "255,85,153",
  虫: "170,187,34",
  岩石: "187,170,102",
  幽灵: "102,102,187",
  龙: "119,102,238",
  恶: "119,85,68",
  钢: "170,170,187",
  妖精: "255,170,255",
};

export function makeTypeBgColors(alpha = 0.10) {
  return Object.fromEntries(
    Object.entries(TYPE_BG_RGB).map(([k, rgb]) => [k, `rgba(${rgb},${alpha})`])
  );
}

export const TYPE_BG_COLORS = makeTypeBgColors(0.10);

export const TYPE_BG_COLORS_CARD = makeTypeBgColors(0.18);

export const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];

export const STAT_LABELS = {
  hp: "HP",
  atk: "攻击",
  def: "防御",
  spa: "特攻",
  spd: "特防",
  spe: "速度",
};

export const STAT_LABELS_SHORT = {
  hp: "HP",
  atk: "ATK",
  def: "DEF",
  spa: "SPA",
  spd: "SPD",
  spe: "SPE",
};

export const STAT_LABELS_COMPACT = {
  hp: "HP",
  atk: "攻",
  def: "防",
  spa: "特攻",
  spd: "特防",
  spe: "速",
};

export const STAT_COLORS = {
  hp: "#8AC654",
  atk: "#F8CB3C",
  def: "#D98837",
  spa: "#59C3D0",
  spd: "#5890CD",
  spe: "#A456D0",
};

export const NATURE_OPTIONS = [
  "勤奋", "怕寂寞", "固执", "顽皮", "勇敢",
  "大胆", "坦率", "淘气", "乐天", "悠闲",
  "胆小", "急躁", "认真", "爽朗", "天真",
  "内敛", "慢吞吞", "害羞", "马虎", "冷静",
  "温和", "温顺", "慎重", "浮躁", "自大",
];

export const NATURE_EFFECTS = {
  怕寂寞: { up: "atk", down: "def" },
  固执: { up: "atk", down: "spa" },
  顽皮: { up: "atk", down: "spd" },
  勇敢: { up: "atk", down: "spe" },
  大胆: { up: "def", down: "atk" },
  淘气: { up: "def", down: "spa" },
  乐天: { up: "def", down: "spd" },
  悠闲: { up: "def", down: "spe" },
  胆小: { up: "spe", down: "atk" },
  急躁: { up: "spe", down: "def" },
  爽朗: { up: "spe", down: "spa" },
  天真: { up: "spe", down: "spd" },
  内敛: { up: "spa", down: "atk" },
  马虎: { up: "spa", down: "def" },
  冷静: { up: "spa", down: "spe" },
  温和: { up: "spd", down: "atk" },
  温顺: { up: "spd", down: "def" },
  慎重: { up: "spd", down: "spa" },
  自大: { up: "spd", down: "spe" },
};

export const NATURE_ZH_TO_EN = {
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

export const GENERATION_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export const LEARN_METHOD_LABELS = {
  "level-up": "升级",
  tm: "招式学习器",
  hm: "秘传学习器",
  egg: "蛋招式",
  tutor: "教学",
  event: "活动",
  evolution: "进化",
  "pre-evolution": "进化前",
  "form-change": "形态变化",
  other: "其他",
};

export const CATEGORY_COLORS = {
  物理: { bg: "#FF4400", text: "#FFCC00" },
  特殊: { bg: "#2266CC", text: "#BBEEFF" },
  变化: { bg: "#999999", text: "#EEEEEE" },
};

export const CATEGORY_BG_COLORS = Object.fromEntries(
  Object.entries(CATEGORY_COLORS).map(([category, colors]) => [category, colors.bg])
);

export const TYPE_CHART = {
  一般: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.5, 0, 1, 1, 0.5, 1],
  火: [1, 0.5, 0.5, 1, 2, 2, 1, 1, 1, 1, 1, 2, 0.5, 1, 0.5, 1, 2, 1],
  水: [1, 2, 0.5, 1, 0.5, 1, 1, 1, 2, 1, 1, 1, 2, 1, 0.5, 1, 1, 1],
  电: [1, 1, 2, 0.5, 0.5, 1, 1, 1, 0, 2, 1, 1, 1, 1, 0.5, 1, 1, 1],
  草: [1, 0.5, 2, 1, 0.5, 1, 1, 0.5, 2, 0.5, 1, 0.5, 2, 1, 0.5, 1, 0.5, 1],
  冰: [1, 0.5, 0.5, 1, 2, 0.5, 1, 1, 2, 2, 1, 1, 1, 1, 2, 1, 0.5, 1],
  格斗: [2, 1, 1, 1, 1, 2, 1, 0.5, 1, 0.5, 0.5, 0.5, 2, 0, 1, 2, 2, 0.5],
  毒: [1, 1, 1, 1, 2, 1, 1, 0.5, 0.5, 1, 1, 1, 0.5, 0.5, 1, 1, 0, 2],
  地面: [1, 2, 1, 2, 0.5, 1, 1, 2, 1, 0, 1, 0.5, 2, 1, 1, 1, 2, 1],
  飞行: [1, 1, 1, 0.5, 2, 1, 2, 1, 1, 1, 1, 2, 0.5, 1, 1, 1, 0.5, 1],
  超能力: [1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 0.5, 1, 1, 1, 1, 0, 0.5, 1],
  虫: [1, 0.5, 1, 1, 2, 1, 0.5, 0.5, 1, 0.5, 2, 1, 1, 0.5, 1, 2, 0.5, 0.5],
  岩石: [1, 2, 1, 1, 1, 2, 0.5, 1, 0.5, 2, 1, 2, 1, 1, 1, 1, 0.5, 1],
  幽灵: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 0.5, 1, 1],
  龙: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 0.5, 0],
  恶: [1, 1, 1, 1, 1, 1, 0.5, 1, 1, 1, 2, 1, 1, 2, 1, 0.5, 1, 0.5],
  钢: [1, 0.5, 0.5, 0.5, 1, 2, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 0.5, 2],
  妖精: [1, 0.5, 1, 1, 1, 1, 2, 0.5, 1, 1, 1, 1, 1, 1, 2, 2, 0.5, 1],
};

export function calcTypeEffectiveness(moveType, defPrimaryType, defSecondaryType) {
  if (!moveType || !defPrimaryType) return 1;
  const row = TYPE_CHART[moveType];
  if (!row) return 1;

  const getIndex = (type) => TYPE_NAMES.indexOf(type);
  const idx1 = getIndex(defPrimaryType);
  let mult = idx1 >= 0 ? row[idx1] : 1;

  if (defSecondaryType && defSecondaryType !== defPrimaryType) {
    const idx2 = getIndex(defSecondaryType);
    if (idx2 >= 0) mult *= row[idx2];
  }

  return mult;
}
