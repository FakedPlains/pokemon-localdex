export const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];

export const NATURE_OPTIONS = [
  "勤奋", "怕寂寞", "固执", "顽皮", "勇敢",
  "大胆", "坦率", "淘气", "乐天", "悠闲",
  "胆小", "急躁", "认真", "爽朗", "天真",
  "内敛", "慢吞吞", "害羞", "马虎", "冷静",
  "温和", "温顺", "慎重", "浮躁", "自大"
];

export const ALL_TYPE_OPTIONS = [
  "一般", "火", "水", "电", "草", "冰", "格斗", "毒", "地面",
  "飞行", "超能力", "虫", "岩石", "幽灵", "龙", "恶", "钢", "妖精"
];

export const TYPE_ALIASES = {
  電: "电",
  飛行: "飞行",
  蟲: "虫",
  龍: "龙",
  惡: "恶",
  鋼: "钢",
  格鬥: "格斗",
  幽靈: "幽灵"
};

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
  other: "其他"
};

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
  自大: { up: "spd", down: "spe" }
};

export const GENERATION_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * 完整 18 属性相克表（第六世代起）
 * 行 = 攻击方属性，列 = 防守方属性
 * 值: 0 = 无效, 0.5 = 效果不好, 1 = 普通, 2 = 效果拔群
 */
export const TYPE_CHART = {
  "一般":   [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.5, 0, 1, 1, 0.5, 1],
  "火":     [1, 0.5, 0.5, 1, 2, 2, 1, 1, 1, 1, 1, 2, 0.5, 1, 0.5, 1, 2, 1],
  "水":     [1, 2, 0.5, 1, 0.5, 1, 1, 1, 2, 1, 1, 1, 2, 1, 0.5, 1, 1, 1],
  "电":     [1, 1, 2, 0.5, 0.5, 1, 1, 1, 0, 2, 1, 1, 1, 1, 0.5, 1, 1, 1],
  "草":     [1, 0.5, 2, 1, 0.5, 1, 1, 0.5, 2, 0.5, 1, 0.5, 2, 1, 0.5, 1, 0.5, 1],
  "冰":     [1, 0.5, 0.5, 1, 2, 0.5, 1, 1, 2, 2, 1, 1, 1, 1, 2, 1, 0.5, 1],
  "格斗":   [2, 1, 1, 1, 1, 2, 1, 0.5, 1, 0.5, 0.5, 0.5, 2, 0, 1, 2, 2, 0.5],
  "毒":     [1, 1, 1, 1, 2, 1, 1, 0.5, 0.5, 1, 1, 1, 0.5, 0.5, 1, 1, 0, 2],
  "地面":   [1, 2, 1, 2, 0.5, 1, 1, 2, 1, 0, 1, 0.5, 2, 1, 1, 1, 2, 1],
  "飞行":   [1, 1, 1, 0.5, 2, 1, 2, 1, 1, 1, 1, 2, 0.5, 1, 1, 1, 0.5, 1],
  "超能力": [1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 0.5, 1, 1, 1, 1, 0, 0.5, 1],
  "虫":     [1, 0.5, 1, 1, 2, 1, 0.5, 0.5, 1, 0.5, 2, 1, 1, 0.5, 1, 2, 0.5, 0.5],
  "岩石":   [1, 2, 1, 1, 1, 2, 0.5, 1, 0.5, 2, 1, 2, 1, 1, 1, 1, 0.5, 1],
  "幽灵":   [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 0.5, 1, 1],
  "龙":     [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 0.5, 0],
  "恶":     [1, 1, 1, 1, 1, 1, 0.5, 1, 1, 1, 2, 1, 1, 2, 1, 0.5, 1, 0.5],
  "钢":     [1, 0.5, 0.5, 0.5, 1, 2, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 0.5, 2],
  "妖精":   [1, 0.5, 1, 1, 1, 1, 2, 0.5, 1, 1, 1, 1, 1, 1, 2, 2, 0.5, 1],
};

/**
 * 计算招式属性对防守方的克制倍率
 * @param {string} moveType - 招式属性（如 "火"）
 * @param {string} defPrimaryType - 防守方主属性
 * @param {string} [defSecondaryType] - 防守方副属性（可选）
 * @returns {number} 克制倍率（0, 0.25, 0.5, 1, 2, 4）
 */
export function calcTypeEffectiveness(moveType, defPrimaryType, defSecondaryType) {
  if (!moveType || !defPrimaryType) return 1;
  const row = TYPE_CHART[moveType];
  if (!row) return 1;

  const getIndex = (type) => ALL_TYPE_OPTIONS.indexOf(type);

  const idx1 = getIndex(defPrimaryType);
  let mult = idx1 >= 0 ? row[idx1] : 1;

  if (defSecondaryType && defSecondaryType !== defPrimaryType) {
    const idx2 = getIndex(defSecondaryType);
    if (idx2 >= 0) mult *= row[idx2];
  }

  return mult;
}
