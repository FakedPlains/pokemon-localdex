/**
 * 形态绑定道具 — 静态映射表 Migration 脚本
 *
 * 本脚本将已知的形态-道具绑定关系写入 pokemon_forms.required_item_id 字段。
 * 包含：Mega 进化石、原始宝珠、Z 水晶形态、其他特殊道具绑定。
 *
 * ⚠️ 注意：本脚本仅生成 SQL 语句并打印，不会自动执行。
 * 如需执行，请取消末尾注释或手动运行生成的 SQL。
 *
 * 使用方式：
 *   npx tsx src/migrate-form-required-items.ts [--dry-run | --execute]
 */

import { openDatabase } from "./index";

// ══════════════════════════════════════════════════════════════
// 形态-道具绑定关系静态映射表
// key: { pokemonNameZh, formNameZh }
// value: itemNameZh（道具中文名，用于匹配 items 表）
// ══════════════════════════════════════════════════════════════

const FORM_REQUIRED_ITEMS: Array<{
  pokemonNameZh: string;
  formNameZh: string;
  itemNameZh: string;
}> = [
  // ══════════════════════════════════════════════════════════════
  // Mega 进化（超级进化）
  // 注意：数据库中 X/Y/Z 使用全角字符 Ｘ/Ｙ/Ｚ
  // ══════════════════════════════════════════════════════════════

  // ── 第一世代 ──
  { pokemonNameZh: "妙蛙花", formNameZh: "超级妙蛙花", itemNameZh: "妙蛙花进化石" },
  { pokemonNameZh: "喷火龙", formNameZh: "超级喷火龙Ｘ", itemNameZh: "喷火龙进化石Ｘ" },
  { pokemonNameZh: "喷火龙", formNameZh: "超级喷火龙Ｙ", itemNameZh: "喷火龙进化石Ｙ" },
  { pokemonNameZh: "水箭龟", formNameZh: "超级水箭龟", itemNameZh: "水箭龟进化石" },
  { pokemonNameZh: "大针蜂", formNameZh: "超级大针蜂", itemNameZh: "大针蜂进化石" },
  { pokemonNameZh: "大比鸟", formNameZh: "超级大比鸟", itemNameZh: "大比鸟进化石" },
  { pokemonNameZh: "胡地", formNameZh: "超级胡地", itemNameZh: "胡地进化石" },
  { pokemonNameZh: "呆壳兽", formNameZh: "超级呆壳兽", itemNameZh: "呆壳兽进化石" },
  { pokemonNameZh: "耿鬼", formNameZh: "超级耿鬼", itemNameZh: "耿鬼进化石" },
  { pokemonNameZh: "袋兽", formNameZh: "超级袋兽", itemNameZh: "袋兽进化石" },
  { pokemonNameZh: "凯罗斯", formNameZh: "超级凯罗斯", itemNameZh: "凯罗斯进化石" },
  { pokemonNameZh: "暴鲤龙", formNameZh: "超级暴鲤龙", itemNameZh: "暴鲤龙进化石" },
  { pokemonNameZh: "化石翼龙", formNameZh: "超级化石翼龙", itemNameZh: "化石翼龙进化石" },
  { pokemonNameZh: "超梦", formNameZh: "超级超梦Ｘ", itemNameZh: "超梦进化石Ｘ" },
  { pokemonNameZh: "超梦", formNameZh: "超级超梦Ｙ", itemNameZh: "超梦进化石Ｙ" },

  // ── 第二世代 ──
  { pokemonNameZh: "电龙", formNameZh: "超级电龙", itemNameZh: "电龙进化石" },
  { pokemonNameZh: "大钢蛇", formNameZh: "超级大钢蛇", itemNameZh: "大钢蛇进化石" },
  { pokemonNameZh: "巨钳螳螂", formNameZh: "超级巨钳螳螂", itemNameZh: "巨钳螳螂进化石" },
  { pokemonNameZh: "赫拉克罗斯", formNameZh: "超级赫拉克罗斯", itemNameZh: "赫拉克罗斯进化石" },
  { pokemonNameZh: "黑鲁加", formNameZh: "超级黑鲁加", itemNameZh: "黑鲁加进化石" },
  { pokemonNameZh: "班基拉斯", formNameZh: "超级班基拉斯", itemNameZh: "班基拉斯进化石" },

  // ── 第三世代 ──
  { pokemonNameZh: "蜥蜴王", formNameZh: "超级蜥蜴王", itemNameZh: "蜥蜴王进化石" },
  { pokemonNameZh: "火焰鸡", formNameZh: "超级火焰鸡", itemNameZh: "火焰鸡进化石" },
  { pokemonNameZh: "巨沼怪", formNameZh: "超级巨沼怪", itemNameZh: "巨沼怪进化石" },
  { pokemonNameZh: "沙奈朵", formNameZh: "超级沙奈朵", itemNameZh: "沙奈朵进化石" },
  { pokemonNameZh: "勾魂眼", formNameZh: "超级勾魂眼", itemNameZh: "勾魂眼进化石" },
  { pokemonNameZh: "大嘴娃", formNameZh: "超级大嘴娃", itemNameZh: "大嘴娃进化石" },
  { pokemonNameZh: "波士可多拉", formNameZh: "超级波士可多拉", itemNameZh: "波士可多拉进化石" },
  { pokemonNameZh: "恰雷姆", formNameZh: "超级恰雷姆", itemNameZh: "恰雷姆进化石" },
  { pokemonNameZh: "雷电兽", formNameZh: "超级雷电兽", itemNameZh: "雷电兽进化石" },
  { pokemonNameZh: "巨牙鲨", formNameZh: "超级巨牙鲨", itemNameZh: "巨牙鲨进化石" },
  { pokemonNameZh: "喷火驼", formNameZh: "超级喷火驼", itemNameZh: "喷火驼进化石" },
  { pokemonNameZh: "七夕青鸟", formNameZh: "超级七夕青鸟", itemNameZh: "七夕青鸟进化石" },
  { pokemonNameZh: "阿勃梭鲁", formNameZh: "超级阿勃梭鲁", itemNameZh: "阿勃梭鲁进化石" },
  { pokemonNameZh: "冰鬼护", formNameZh: "超级冰鬼护", itemNameZh: "冰鬼护进化石" },
  { pokemonNameZh: "暴飞龙", formNameZh: "超级暴飞龙", itemNameZh: "暴飞龙进化石" },
  { pokemonNameZh: "巨金怪", formNameZh: "超级巨金怪", itemNameZh: "巨金怪进化石" },
  { pokemonNameZh: "拉帝亚斯", formNameZh: "超级拉帝亚斯", itemNameZh: "拉帝亚斯进化石" },
  { pokemonNameZh: "拉帝欧斯", formNameZh: "超级拉帝欧斯", itemNameZh: "拉帝欧斯进化石" },
  // 注意：烈空坐的 Mega 进化不需要道具（通过招式"画龙点睛"触发），不绑定

  // ── 第四世代 ──
  { pokemonNameZh: "烈咬陆鲨", formNameZh: "超级烈咬陆鲨", itemNameZh: "烈咬陆鲨进化石" },
  { pokemonNameZh: "路卡利欧", formNameZh: "超级路卡利欧", itemNameZh: "路卡利欧进化石" },
  { pokemonNameZh: "暴雪王", formNameZh: "超级暴雪王", itemNameZh: "暴雪王进化石" },
  { pokemonNameZh: "艾路雷朵", formNameZh: "超级艾路雷朵", itemNameZh: "艾路雷朵进化石" },

  // ── 第五世代 ──
  { pokemonNameZh: "长耳兔", formNameZh: "超级长耳兔", itemNameZh: "长耳兔进化石" },
  { pokemonNameZh: "差不多娃娃", formNameZh: "超级差不多娃娃", itemNameZh: "差不多娃娃进化石" },

  // ── 第六世代 ──
  { pokemonNameZh: "蒂安希", formNameZh: "超级蒂安希", itemNameZh: "蒂安希进化石" },

  // ══════════════════════════════════════════════════════════════
  // 扩展 Mega 进化（项目自定义）
  // ══════════════════════════════════════════════════════════════

  // ── 带后缀的扩展 Mega ──
  { pokemonNameZh: "烈咬陆鲨", formNameZh: "超级烈咬陆鲨Ｚ", itemNameZh: "烈咬陆鲨进化石Ｚ" },
  { pokemonNameZh: "路卡利欧", formNameZh: "超级路卡利欧Ｚ", itemNameZh: "路卡利欧进化石Ｚ" },
  { pokemonNameZh: "阿勃梭鲁", formNameZh: "超级阿勃梭鲁Ｚ", itemNameZh: "阿勃梭鲁进化石Ｚ" },
  { pokemonNameZh: "雷丘", formNameZh: "超级雷丘Ｘ", itemNameZh: "雷丘进化石Ｘ" },
  { pokemonNameZh: "雷丘", formNameZh: "超级雷丘Ｙ", itemNameZh: "雷丘进化石Ｙ" },

  // ── 多形态绑定同一进化石 ──
  { pokemonNameZh: "玛机雅娜", formNameZh: "超级玛机雅娜（现在的颜色）", itemNameZh: "玛机雅娜进化石" },
  { pokemonNameZh: "玛机雅娜", formNameZh: "超级玛机雅娜（５００年前的颜色）", itemNameZh: "玛机雅娜进化石" },
  { pokemonNameZh: "米立龙", formNameZh: "超级米立龙（上弓姿势）", itemNameZh: "米立龙进化石" },
  { pokemonNameZh: "米立龙", formNameZh: "超级米立龙（下垂姿势）", itemNameZh: "米立龙进化石" },
  { pokemonNameZh: "米立龙", formNameZh: "超级米立龙（平挺姿势）", itemNameZh: "米立龙进化石" },

  // ── 普通扩展 Mega（按五十音序）──
  { pokemonNameZh: "乌贼王", formNameZh: "超级乌贼王", itemNameZh: "乌贼王进化石" },
  { pokemonNameZh: "具甲武者", formNameZh: "超级具甲武者", itemNameZh: "具甲武者进化石" },
  { pokemonNameZh: "列阵兵", formNameZh: "超级列阵兵", itemNameZh: "列阵兵进化石" },
  { pokemonNameZh: "基格尔德", formNameZh: "超级基格尔德", itemNameZh: "基格尔德进化石" },
  { pokemonNameZh: "大力鳄", formNameZh: "超级大力鳄", itemNameZh: "大力鳄进化石" },
  { pokemonNameZh: "大竺葵", formNameZh: "超级大竺葵", itemNameZh: "大竺葵进化石" },
  { pokemonNameZh: "大食花", formNameZh: "超级大食花", itemNameZh: "大食花进化石" },
  { pokemonNameZh: "头巾混混", formNameZh: "超级头巾混混", itemNameZh: "头巾混混进化石" },
  { pokemonNameZh: "好胜毛蟹", formNameZh: "超级好胜毛蟹", itemNameZh: "好胜毛蟹进化石" },
  { pokemonNameZh: "妖火红狐", formNameZh: "超级妖火红狐", itemNameZh: "妖火红狐进化石" },
  { pokemonNameZh: "姆克鹰", formNameZh: "超级姆克鹰", itemNameZh: "姆克鹰进化石" },
  { pokemonNameZh: "宝石海星", formNameZh: "超级宝石海星", itemNameZh: "宝石海星进化石" },
  { pokemonNameZh: "布里卡隆", formNameZh: "超级布里卡隆", itemNameZh: "布里卡隆进化石" },
  { pokemonNameZh: "席多蓝恩", formNameZh: "超级席多蓝恩", itemNameZh: "席多蓝恩进化石" },
  { pokemonNameZh: "快龙", formNameZh: "超级快龙", itemNameZh: "快龙进化石" },
  { pokemonNameZh: "戟脊龙", formNameZh: "超级戟脊龙", itemNameZh: "戟脊龙进化石" },
  { pokemonNameZh: "捷拉奥拉", formNameZh: "超级捷拉奥拉", itemNameZh: "捷拉奥拉进化石" },
  { pokemonNameZh: "摔角鹰人", formNameZh: "超级摔角鹰人", itemNameZh: "摔角鹰人进化石" },
  { pokemonNameZh: "晶光花", formNameZh: "超级晶光花", itemNameZh: "晶光花进化石" },
  { pokemonNameZh: "毒藻龙", formNameZh: "超级毒藻龙", itemNameZh: "毒藻龙进化石" },
  { pokemonNameZh: "水晶灯火灵", formNameZh: "超级水晶灯火灵", itemNameZh: "水晶灯火灵进化石" },
  { pokemonNameZh: "泥偶巨人", formNameZh: "超级泥偶巨人", itemNameZh: "泥偶巨人进化石" },
  { pokemonNameZh: "火炎狮", formNameZh: "超级火炎狮", itemNameZh: "火炎狮进化石" },
  { pokemonNameZh: "炎武王", formNameZh: "超级炎武王", itemNameZh: "炎武王进化石" },
  { pokemonNameZh: "狠辣椒", formNameZh: "超级狠辣椒", itemNameZh: "狠辣椒进化石" },
  { pokemonNameZh: "甲贺忍蛙", formNameZh: "超级甲贺忍蛙", itemNameZh: "甲贺忍蛙进化石" },
  { pokemonNameZh: "皮可西", formNameZh: "超级皮可西", itemNameZh: "皮可西进化石" },
  { pokemonNameZh: "盔甲鸟", formNameZh: "超级盔甲鸟", itemNameZh: "盔甲鸟进化石" },
  { pokemonNameZh: "老翁龙", formNameZh: "超级老翁龙", itemNameZh: "老翁龙进化石" },
  { pokemonNameZh: "花叶蒂", formNameZh: "超级花叶蒂", itemNameZh: "花叶蒂进化石" },
  { pokemonNameZh: "蜈蚣王", formNameZh: "超级蜈蚣王", itemNameZh: "蜈蚣王进化石" },
  { pokemonNameZh: "诅咒娃娃", formNameZh: "超级诅咒娃娃", itemNameZh: "诅咒娃娃进化石" },
  { pokemonNameZh: "超能妙喵", formNameZh: "超级超能妙喵", itemNameZh: "超能妙喵进化石" },
  { pokemonNameZh: "达克莱伊", formNameZh: "超级达克莱伊", itemNameZh: "达克莱伊进化石" },
  { pokemonNameZh: "雪妖女", formNameZh: "超级雪妖女", itemNameZh: "雪妖女进化石" },
  { pokemonNameZh: "风铃铃", formNameZh: "超级风铃铃", itemNameZh: "风铃铃进化石" },
  { pokemonNameZh: "麻麻鳗鱼王", formNameZh: "超级麻麻鳗鱼王", itemNameZh: "麻麻鳗鱼王进化石" },
  { pokemonNameZh: "龙头地鼠", formNameZh: "超级龙头地鼠", itemNameZh: "龙头地鼠进化石" },
  { pokemonNameZh: "龟足巨铠", formNameZh: "超级龟足巨铠", itemNameZh: "龟足巨铠进化石" },

  // ══════════════════════════════════════════════════════════════
  // 原始回归
  // ══════════════════════════════════════════════════════════════
  { pokemonNameZh: "盖欧卡", formNameZh: "原始盖欧卡", itemNameZh: "靛蓝色宝珠" },
  { pokemonNameZh: "固拉多", formNameZh: "原始固拉多", itemNameZh: "朱红色宝珠" },

  // ══════════════════════════════════════════════════════════════
  // 以下形态/道具在当前数据库中尚未拆分，暂时注释
  // 待数据库补充形态数据后可取消注释
  // ══════════════════════════════════════════════════════════════

  // ── 盖诺赛克特（卡带）── 数据库中形态未拆分
  // { pokemonNameZh: "盖诺赛克特", formNameZh: "火焰驱动形态", itemNameZh: "火焰卡带" },
  // { pokemonNameZh: "盖诺赛克特", formNameZh: "闪电驱动形态", itemNameZh: "闪电卡带" },
  // { pokemonNameZh: "盖诺赛克特", formNameZh: "冰冻驱动形态", itemNameZh: "冰冻卡带" },
  // { pokemonNameZh: "盖诺赛克特", formNameZh: "水流驱动形态", itemNameZh: "水流卡带" },

  // ── 银伴战兽（记忆碟）── 数据库中形态未拆分、道具未录入
  // ── 阿尔宙斯（石板）── 数据库中形态未拆分
];

// ══════════════════════════════════════════════════════════════
// 生成 SQL 语句
// ══════════════════════════════════════════════════════════════

function generateSQL(): string[] {
  const statements: string[] = [];

  statements.push("-- ═══════════════════════════════════════════════════════════");
  statements.push("-- 形态绑定道具 Migration（静态映射表）");
  statements.push("-- 生成时间: " + new Date().toISOString());
  statements.push("-- ═══════════════════════════════════════════════════════════");
  statements.push("");
  statements.push("BEGIN TRANSACTION;");
  statements.push("");

  for (const mapping of FORM_REQUIRED_ITEMS) {
    const { pokemonNameZh, formNameZh, itemNameZh } = mapping;
    // 使用子查询匹配 pokemon_forms.id 和 items.id
    statements.push(
      `UPDATE pokemon_forms SET required_item_id = (SELECT id FROM items WHERE name_zh = '${itemNameZh}' LIMIT 1)` +
      ` WHERE id = (SELECT pf.id FROM pokemon_forms pf JOIN pokemon p ON p.id = pf.pokemon_id` +
      ` WHERE p.name_zh = '${pokemonNameZh}' AND pf.name_zh = '${formNameZh}' LIMIT 1);`
    );
  }

  statements.push("");
  statements.push("COMMIT;");
  statements.push("");
  statements.push("-- 验证：查看已绑定道具的形态");
  statements.push(
    "SELECT p.name_zh AS pokemon, pf.name_zh AS form, i.name_zh AS item " +
    "FROM pokemon_forms pf " +
    "JOIN pokemon p ON p.id = pf.pokemon_id " +
    "JOIN items i ON i.id = pf.required_item_id " +
    "WHERE pf.required_item_id IS NOT NULL " +
    "ORDER BY p.dex_number, pf.sort_order;"
  );

  return statements;
}

// ══════════════════════════════════════════════════════════════
// 执行模式（可选）
// ══════════════════════════════════════════════════════════════

function execute() {
  const db = openDatabase();

  let successCount = 0;
  let skipCount = 0;

  for (const mapping of FORM_REQUIRED_ITEMS) {
    const { pokemonNameZh, formNameZh, itemNameZh } = mapping;

    // 查找道具 ID
    const itemRow = db.prepare("SELECT id FROM items WHERE name_zh = ? LIMIT 1").get(itemNameZh) as Record<string, unknown> | undefined;
    if (!itemRow) {
      console.warn(`  ⚠ 道具未找到: "${itemNameZh}" (${pokemonNameZh} - ${formNameZh})`);
      skipCount++;
      continue;
    }

    // 查找形态 ID
    const formRow = db.prepare(`
      SELECT pf.id FROM pokemon_forms pf
      JOIN pokemon p ON p.id = pf.pokemon_id
      WHERE p.name_zh = ? AND pf.name_zh = ?
      LIMIT 1
    `).get(pokemonNameZh, formNameZh) as Record<string, unknown> | undefined;
    if (!formRow) {
      console.warn(`  ⚠ 形态未找到: "${pokemonNameZh}" - "${formNameZh}"`);
      skipCount++;
      continue;
    }

    // 更新
    db.prepare("UPDATE pokemon_forms SET required_item_id = ? WHERE id = ?").run(Number(itemRow.id), Number(formRow.id));
    successCount++;
  }

  db.close();
  console.log(`\n✅ 完成: ${successCount} 条绑定成功, ${skipCount} 条跳过`);
}

// ══════════════════════════════════════════════════════════════
// CLI 入口
// ══════════════════════════════════════════════════════════════

const args = process.argv.slice(2);
const mode = args[0] || "--dry-run";

if (mode === "--execute") {
  console.log("🔧 执行形态-道具绑定 migration...\n");
  execute();
} else {
  console.log("📋 形态-道具绑定 SQL（dry-run 模式，不执行）\n");
  const sql = generateSQL();
  console.log(sql.join("\n"));
  console.log("\n💡 如需执行，请运行: npx tsx src/migrate-form-required-items.ts --execute");
}
