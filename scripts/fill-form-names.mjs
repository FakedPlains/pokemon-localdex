/**
 * 批量填充 pokemon_forms.name_en
 * 
 * 策略：
 * 1. 从 @smogon/calc 获取所有世代的 SPECIES 名称
 * 2. 对数据库中每个非默认形态，通过中文关键词推导 smogon 后缀
 * 3. 拼接 BaseName-Suffix 并验证是否存在于 SPECIES 中
 * 4. 默认形态直接使用基础宝可梦的 name_en
 */

import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const calc = require("@smogon/calc");

const DB_PATH = resolve(import.meta.dirname, "../data/sqlite/localdex.sqlite");
const db = new DatabaseSync(DB_PATH, { open: true });

// ── 收集 @smogon/calc 所有世代的物种名 ──
const allSmogonNames = new Set();
for (let gen = 0; gen <= 9; gen++) {
  const species = calc.SPECIES[gen] || {};
  for (const name of Object.keys(species)) {
    allSmogonNames.add(name);
  }
}
console.log(`@smogon/calc 共有 ${allSmogonNames.size} 个物种名`);

// ── 中文形态前缀/关键词 → smogon 后缀映射 ──
const FORM_SUFFIX_RULES = [
  // Mega
  { pattern: /^超级.+[xXＸ]$/u, suffix: "Mega-X" },
  { pattern: /^超级.+[yYＹ]$/u, suffix: "Mega-Y" },
  { pattern: /^超级.+[zZＺ]$/u, suffix: "Mega-Z" },
  { pattern: /^超级/, suffix: "Mega" },
  // Regional
  { pattern: /^阿罗拉/, suffix: "Alola" },
  { pattern: /^伽勒尔/, suffix: "Galar" },
  { pattern: /^洗翠/, suffix: "Hisui" },
  { pattern: /^帕底亚/, suffix: "Paldea" },
  // Gmax
  { pattern: /^超极巨化/, suffix: "Gmax" },
  // Primal
  { pattern: /^原始/, suffix: "Primal" },
  // Origin
  { pattern: /^起源/, suffix: "Origin" },
  // Therian
  { pattern: /^灵兽/, suffix: "Therian" },
  // Black/White Kyurem
  { pattern: /^暗黑/, suffix: "Black" },
  { pattern: /^焰白/, suffix: "White" },
  // Crowned
  { pattern: /^王者/, suffix: "Crowned" },
  // Eternamax
  { pattern: /^无极巨化/, suffix: "Eternamax" },
  // Rapid-Strike / Single-Strike (Urshifu)
  { pattern: /连击/, suffix: "Rapid-Strike" },
  { pattern: /一击/, suffix: "" }, // 一击流是默认形态
  // Ice/Shadow Rider (Calyrex)
  { pattern: /冰骑/, suffix: "Ice" },
  { pattern: /灵骑|幽骑/, suffix: "Shadow" },
  // Ogerpon
  { pattern: /磐岩/, suffix: "Cornerstone" },
  { pattern: /水井/, suffix: "Wellspring" },
  { pattern: /火灶/, suffix: "Hearthflame" },
  // Ursaluna
  { pattern: /血月/, suffix: "Bloodmoon" },
  // Terapagos
  { pattern: /星晶/, suffix: "Stellar" },
  { pattern: /太晶/, suffix: "Terastal" },
];

// ── 特殊形态的手动映射 (form_key → smogon suffix) ──
const MANUAL_FORM_MAPPINGS = {
  // Farfetch'd
  "伽勒尔大葱鸭": { base: "Farfetch'd", suffix: "Galar" },
  // Tauros Paldea
  "帕底亚的样子斗战种": { base: "Tauros", suffix: "Paldea-Combat" },
  "帕底亚的样子火炽种": { base: "Tauros", suffix: "Paldea-Blaze" },
  "帕底亚的样子水澜种": { base: "Tauros", suffix: "Paldea-Aqua" },
  // Zacian / Zamazenta
  "剑之王": { suffix: "Crowned" },
  "盾之王": { suffix: "Crowned" },
  // Floette Eternal
  "永恒之花": { suffix: "Eternal" },
  // Eiscue
  "解冻头": { suffix: "Noice" },
  // Morpeko
  "空腹花纹": { suffix: "Hangry" },
  // Cramorant
  "一口吞的样子": { suffix: "Gulping" },
  "大口吞的样子": { suffix: "Gorging" },
  // Palafin
  "全能形态": { suffix: "Hero" },
  // Dudunsparce
  "三节形态": { suffix: "Three-Segment" },
  // Ogerpon
  "础石面具": { suffix: "Cornerstone" },
  // Minior
  "核心": { suffix: "" }, // 核心形态在 smogon 中是默认 Minior
  // Gimmighoul
  "徒步形态": { suffix: "Roaming" },
  // Calyrex riding forms
  "骑白马的样子": { suffix: "Ice" },
  "骑黑马的样子": { suffix: "Shadow" },
  // Ursaluna
  "赫月": { suffix: "Bloodmoon" },
  // Oricorio
  "啪滋啪滋风格": { suffix: "Pom-Pom" },
  "呼拉呼拉风格": { suffix: "Pa'u" },
  // Castform
  "太阳的样子": { suffix: "Sunny" },
  "雨水的样子": { suffix: "Rainy" },
  "雪云的样子": { suffix: "Snowy" },
  // Deoxys
  "攻击形态": { suffix: "Attack" },
  "防御形态": { suffix: "Defense" },
  "速度形态": { suffix: "Speed" },
  // Wormadam / Burmy
  "砂土蓑衣": { suffix: "Sandy" },
  "垃圾蓑衣": { suffix: "Trash" },
  // Cherrim
  "晴天形态": { suffix: "Sunshine" },
  // Rotom
  "加热洛托姆": { suffix: "Heat" },
  "清洗洛托姆": { suffix: "Wash" },
  "结冰洛托姆": { suffix: "Frost" },
  "旋转洛托姆": { suffix: "Fan" },
  "切割洛托姆": { suffix: "Mow" },
  // Shaymin
  "天空形态": { suffix: "Sky" },
  // Basculin
  "蓝条纹的样子": { suffix: "Blue-Striped" },
  "白条纹的样子": { suffix: "White-Striped" },
  // Darmanitan
  "达摩狒狒-达摩模式": { suffix: "Zen" },
  "达摩狒狒（达摩模式）": { suffix: "Zen" },
  "伽勒尔达摩模式": { suffix: "Galar-Zen" },
  // Keldeo
  "觉悟的样子": { suffix: "Resolute" },
  // Meloetta
  "舞步形态": { suffix: "Pirouette" },
  // Greninja
  "牵绊变身甲贺忍蛙": { suffix: "Ash" },
  // Meowstic
  "雌性的样子": { suffix: "F" },
  "超级超能妙喵": { suffix: "F-Mega" },
  // Pumpkaboo / Gourgeist
  "小颗种": { suffix: "Small" },
  "大颗种": { suffix: "Large" },
  "巨颗种": { suffix: "Super" },
  // Zygarde
  "10-形态": { suffix: "10%" },
  "完全体形态": { suffix: "Complete" },
  // Hoopa
  "解放胡帕": { suffix: "Unbound" },
  // Oricorio
  "热辣热辣风格": { suffix: "Pom-Pom" },
  "轻盈轻盈风格": { suffix: "Pa'u" },
  "幽幽幽幽风格": { suffix: "Sensu" },
  // Lycanroc
  "黄昏的样子": { suffix: "Dusk" },
  "黑夜的样子": { suffix: "Midnight" },
  // Wishiwashi
  "鱼群的样子": { suffix: "School" },
  // Necrozma
  "黄昏之鬃": { suffix: "Dusk-Mane" },
  "拂晓之翼": { suffix: "Dawn-Wings" },
  "究极奈克洛兹玛": { suffix: "Ultra" },
  // Toxtricity
  "低调的样子": { suffix: "Low-Key" },
  // Indeedee
  "雌性": { suffix: "F" },
  // Calyrex
  "冰骑士": { suffix: "Ice" },
  "幽骑士": { suffix: "Shadow" },
  // Palafin
  "英雄形态": { suffix: "Hero" },
  // Basculegion
  "雌性的样子basculegion": { suffix: "F" },
  // Enamorus
  "灵兽形态": { suffix: "Therian" },
  // Aegislash
  "刀剑形态": { suffix: "Blade" },
  // Xerneas
  "放松模式": { suffix: "" }, // 放松模式是默认外观，战斗中才变
  // Giratina
  "起源形态": { suffix: "Origin" },
  // Dialga/Palkia
  "起源形态dialga": { suffix: "Origin" },
  "起源形态palkia": { suffix: "Origin" },
};

// ── 查询所有形态 ──
const forms = db.prepare(`
  SELECT pf.id, pf.form_key, pf.name_zh, pf.is_default, pf.form_type,
         p.name_en AS base_name_en, p.name_zh AS base_name_zh
  FROM pokemon_forms pf
  JOIN pokemon p ON pf.pokemon_id = p.id
  ORDER BY pf.id
`).all();

console.log(`数据库共有 ${forms.length} 个形态记录`);

// 先清空所有 name_en
db.prepare("UPDATE pokemon_forms SET name_en = NULL").run();

const updateStmt = db.prepare("UPDATE pokemon_forms SET name_en = ? WHERE id = ?");

let matched = 0;
let unmatched = 0;
const unmatchedList = [];

for (const form of forms) {
  const baseEn = form.base_name_en;
  if (!baseEn) continue;

  // 默认形态直接用基础名
  if (form.is_default === 1 || form.form_key === "default") {
    updateStmt.run(baseEn, form.id);
    matched++;
    continue;
  }

  let nameEn = null;
  const nameZh = form.name_zh || "";
  const formKey = form.form_key || "";

  // 1. 先检查手动映射（用 form_key）
  if (MANUAL_FORM_MAPPINGS[formKey]) {
    const mapping = MANUAL_FORM_MAPPINGS[formKey];
    const base = mapping.base || baseEn;
    if (mapping.suffix === "") {
      nameEn = base; // 默认形态
    } else {
      const candidate = `${base}-${mapping.suffix}`;
      if (allSmogonNames.has(candidate)) {
        nameEn = candidate;
      }
    }
  }

  // 2. 再检查手动映射（用 name_zh）
  if (!nameEn && MANUAL_FORM_MAPPINGS[nameZh]) {
    const mapping = MANUAL_FORM_MAPPINGS[nameZh];
    const base = mapping.base || baseEn;
    if (mapping.suffix === "") {
      nameEn = base;
    } else {
      const candidate = `${base}-${mapping.suffix}`;
      if (allSmogonNames.has(candidate)) {
        nameEn = candidate;
      }
    }
  }

  // 3. 尝试通过规则匹配
  if (!nameEn) {
    for (const rule of FORM_SUFFIX_RULES) {
      if (rule.pattern.test(nameZh)) {
        if (rule.suffix === "") {
          nameEn = baseEn;
        } else {
          const candidate = `${baseEn}-${rule.suffix}`;
          if (allSmogonNames.has(candidate)) {
            nameEn = candidate;
          }
        }
        break;
      }
    }
  }

  // 4. 对于 Gmax 形态，即使 smogon 中没有也设置名称（计算时可以 fallback）
  if (!nameEn && form.form_type === "gmax") {
    nameEn = `${baseEn}-Gmax`;
    // 不验证是否在 smogon 中存在，因为 Gmax 在计算中通常用基础形态
  }

  // 5. 对于雌性形态的特殊处理
  if (!nameEn && (nameZh === "雌性的样子" || formKey === "雌性的样子")) {
    const candidate = `${baseEn}-F`;
    if (allSmogonNames.has(candidate)) {
      nameEn = candidate;
    }
  }

  // 6. 对于纯外观差异的形态（季节、颜色、性别等），使用基础名称
  // 这些形态在 @smogon/calc 中没有独立条目，种族值与基础形态相同
  if (!nameEn) {
    nameEn = baseEn; // fallback 到基础名称
  }

  if (nameEn) {
    updateStmt.run(nameEn, form.id);
    matched++;
  } else {
    unmatched++;
    unmatchedList.push({ id: form.id, nameZh: form.name_zh, formKey: form.form_key, baseEn });
  }
}

db.close();

console.log(`\n匹配完成: ${matched} 成功, ${unmatched} 未匹配`);
if (unmatchedList.length > 0) {
  console.log("\n未匹配的形态:");
  for (const item of unmatchedList) {
    console.log(`  [${item.id}] ${item.nameZh} (form_key: ${item.formKey}, base: ${item.baseEn})`);
  }
}
