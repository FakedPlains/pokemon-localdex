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
