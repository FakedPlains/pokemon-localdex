# 斩杀线 / 防守线分析器 — 产品设计文档

> 本文档是「KO Calculator」功能的产品设计与技术方案权威文档。后续开发、迭代和变更均以此为基准，任何需求变化必须同步更新本文档。

---

## 一、功能定位

### 1.1 概述

KO Calculator（斩杀线/防守线分析器）是一个独立页面功能，路由为 `#/ko`。与现有伤害计算器（`#/damage`，单招式对单目标的精确数值计算）不同，KO Calculator 的目标是：

> 给定用户配置的宝可梦，分析它在当前对战环境中的**进攻覆盖能力**（斩杀线）和**防御承受能力**（防守线），并给出配置优化建议。

### 1.2 核心概念

**斩杀线（KO Threshold）**：在当前对战条件下，攻击方使用某招式能否击倒目标列表中的热门宝可梦，以及需要几次攻击才能确保击倒。这是进攻视角的核心指标。

**防守线（Survival Threshold）**：目标列表中的热门宝可梦使用其主流招式攻击时，防守方是否能存活，以及能稳定承受几次攻击。这是防御视角的核心指标。

两者本质是同一组数据的正反面解读，对应对战中"我能不能杀掉它"和"它能不能打死我"的博弈判断。

### 1.3 与现有伤害计算器的关系

| 维度 | 伤害计算器 (`#/damage`) | KO 分析器 (`#/ko`) |
|------|------------------------|-------------------|
| 交互模式 | 1v1 精确计算 | 1vN 环境扫描 |
| 数据输入 | 双方完整手动配置 | 我方手动 + 对方从 meta 数据自动填充 |
| 输出内容 | 伤害数值、百分比、描述 | N-HKO 判定、分组排序、优化建议 |
| 目标用户 | 精确验证某个对局 | 组队阶段的环境适配分析 |

KO 分析器底层复用现有 `POST /battle/damage` API，不需要修改 battle-core 引擎。

---

## 二、数据源设计

### 2.1 对战 Meta 数据来源

**最终决策**：采用 [Pikalytics AI Markdown API](https://www.pikalytics.com/ai-sitemap.md) 作为唯一的对战 meta 数据源。

**选型理由**：

- Pikalytics 的数据上游是 Pokemon Champions 游戏官方服务器的 Battle Data 统计，等同于间接获取官方对战数据。
- 直接从游戏内 Battle Data 获取数据需要抓包/逆向游戏客户端协议，维护成本极高（每次版本更新可能失效），且存在违反 ToS 的合规风险。
- PokéChamp DB / eurekaffeine scraper 实际上也是从 Pikalytics 转采，缺少 SP/spread 数据，且使用 Showdown num ID 体系需要额外映射。
- Pikalytics 提供免费的 AI Markdown API，数据已结构化，直接返回英文名（无需 ID 映射），延迟约一天，完全满足斩杀线计算器的时效需求。

**与 52Poké Wiki 数据源的关系**：52Poké Wiki 继续作为宝可梦基础数据（种族值、招式列表、特性效果等资料库数据）的唯一来源。Pikalytics 作为对战 meta 统计数据（使用率、配置分布、胜率）的来源。两者职责不重叠。

### 2.2 可用 API 端点

**格式索引**（获取 TOP 50 使用率排名）：

```
GET https://www.pikalytics.com/ai/pokedex/{format_code}
```

示例：`https://www.pikalytics.com/ai/pokedex/gen9championsvgc2026regma`

返回内容（Markdown 格式）：TOP 50 宝可梦的 rank、name、usage%、win_rate、record，以及常见队伍核心组合。

**单只宝可梦详情**（获取主流配置）：

```
GET https://www.pikalytics.com/ai/pokedex/{format_code}/{pokemon_name_en}
```

示例：`https://www.pikalytics.com/ai/pokedex/gen9championsvgc2026regma/Garchomp`

返回内容（Markdown 格式）：

- 使用率、胜率、战绩
- 常见招式及使用率百分比（如 Earthquake 91.4%）
- 常见特性及使用率（如 Rough Skin 93.8%）
- 常见道具及使用率（如 Choice Scarf 27.9%）
- 最热门 EV/SP 分配和性格（如 Jolly, 2/32/0/0/0/32, 占 18.9%）
- 常见队友
- 种族值
- 锦标赛冠军队伍中的具体配置

### 2.3 当前支持的赛制格式

| 格式代码 | 名称 | 说明 |
|----------|------|------|
| `gen9championsvgc2026regma` | Pokemon Champions VGC 2026 Reg M-A | 当前主要赛制（双打） |
| `gen9championsou` | Pokemon Champions OU | 单打 OU |
| `gen9championsbssregma` | Pokemon Champions BSS Reg M-A | 单打排位 |

后续赛制更新时，新增格式代码即可，不需要改动功能逻辑。

### 2.4 数据更新策略

Pikalytics 数据大约每月更新一次（标注 `Data Date: YYYY-MM`）。采集策略：

- 定期采集：每周执行一次，检查数据是否有更新
- 赛制切换时手动触发全量采集
- 缓存中间 Markdown 结果到 `data/raw/meta/`（不提交到 Git）

---

## 三、数据库设计

### 3.1 新增表结构

```sql
-- ============================================================
-- 对战环境 Meta 数据（Pikalytics 来源）
-- ============================================================

-- 数据快照（按格式 + 数据日期唯一）
CREATE TABLE IF NOT EXISTS meta_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  format_code TEXT NOT NULL,            -- 'gen9championsvgc2026regma'
  format_name TEXT NOT NULL,            -- 'Pokemon Champions VGC 2026 Reg M-A'
  data_date TEXT NOT NULL,              -- '2026-04'（Pikalytics 标注的数据月份）
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  source_url TEXT,
  UNIQUE(format_code, data_date)
);

-- 宝可梦使用率排名
CREATE TABLE IF NOT EXISTS meta_pokemon_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER NOT NULL REFERENCES meta_snapshots(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,                -- 使用率排名（1~50）
  pokemon_name_en TEXT NOT NULL,        -- 'Garchomp'、'Charizard-Mega-Y'
  pokemon_id INTEGER REFERENCES pokemon(id),    -- 关联本地数据库（可为 NULL）
  form_id INTEGER REFERENCES pokemon_forms(id), -- 关联形态（可为 NULL）
  usage_percent REAL NOT NULL,          -- 40.40
  win_rate REAL,                        -- 52.163
  record_wins INTEGER,
  record_losses INTEGER,
  record_ties INTEGER,
  UNIQUE(snapshot_id, rank)
);

-- 宝可梦主流配置（每只可能有多套，按热门度排序）
CREATE TABLE IF NOT EXISTS meta_pokemon_spreads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usage_id INTEGER NOT NULL REFERENCES meta_pokemon_usage(id) ON DELETE CASCADE,
  spread_rank INTEGER NOT NULL DEFAULT 1,  -- 第几热门配置
  nature TEXT,                             -- 'Jolly'
  ev_hp INTEGER DEFAULT 0,
  ev_atk INTEGER DEFAULT 0,
  ev_def INTEGER DEFAULT 0,
  ev_spa INTEGER DEFAULT 0,
  ev_spd INTEGER DEFAULT 0,
  ev_spe INTEGER DEFAULT 0,
  spread_usage_percent REAL,               -- 该配置占比，如 18.938
  UNIQUE(usage_id, spread_rank)
);

-- 宝可梦常用招式
CREATE TABLE IF NOT EXISTS meta_pokemon_moves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usage_id INTEGER NOT NULL REFERENCES meta_pokemon_usage(id) ON DELETE CASCADE,
  move_name_en TEXT NOT NULL,              -- 'Earthquake'
  move_id INTEGER REFERENCES moves(id),   -- 关联本地数据库（可为 NULL）
  usage_percent REAL NOT NULL,             -- 91.473
  sort_order INTEGER DEFAULT 0
);

-- 宝可梦常用道具
CREATE TABLE IF NOT EXISTS meta_pokemon_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usage_id INTEGER NOT NULL REFERENCES meta_pokemon_usage(id) ON DELETE CASCADE,
  item_name_en TEXT NOT NULL,              -- 'Choice Scarf'
  item_id INTEGER REFERENCES items(id),   -- 关联本地数据库（可为 NULL）
  usage_percent REAL NOT NULL,
  sort_order INTEGER DEFAULT 0
);

-- 宝可梦常用特性
CREATE TABLE IF NOT EXISTS meta_pokemon_abilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usage_id INTEGER NOT NULL REFERENCES meta_pokemon_usage(id) ON DELETE CASCADE,
  ability_name_en TEXT NOT NULL,           -- 'Rough Skin'
  ability_id INTEGER REFERENCES abilities(id),
  usage_percent REAL NOT NULL,
  sort_order INTEGER DEFAULT 0
);
```

### 3.2 与现有表的关联

- `meta_pokemon_usage.pokemon_id` → `pokemon.id`：通过英文名匹配本地数据库
- `meta_pokemon_usage.form_id` → `pokemon_forms.id`：通过英文名 + 形态后缀匹配
- `meta_pokemon_moves.move_id` → `moves.id`：通过英文名匹配
- `meta_pokemon_items.item_id` → `items.id`：通过英文名匹配
- `meta_pokemon_abilities.ability_id` → `abilities.id`：通过英文名匹配

关联字段均可为 NULL，允许 meta 数据中的宝可梦/招式/道具/特性暂时无法匹配本地数据库（新增宝可梦、本地数据未同步等情况）。

### 3.3 索引

```sql
CREATE INDEX idx_meta_usage_snapshot ON meta_pokemon_usage(snapshot_id);
CREATE INDEX idx_meta_usage_pokemon ON meta_pokemon_usage(pokemon_id);
CREATE INDEX idx_meta_spreads_usage ON meta_pokemon_spreads(usage_id);
CREATE INDEX idx_meta_moves_usage ON meta_pokemon_moves(usage_id);
CREATE INDEX idx_meta_items_usage ON meta_pokemon_items(usage_id);
CREATE INDEX idx_meta_abilities_usage ON meta_pokemon_abilities(usage_id);
```

---

## 四、爬虫设计

### 4.1 模块位置

新增 `packages/crawler_py/localdex_crawler/meta.py`，遵循现有爬虫架构。

### 4.2 采集流程

```
1. 请求格式索引页 → 解析 Markdown 表格 → 获取 TOP 50 列表
2. 对每只宝可梦请求详情页 → 解析招式/道具/特性/配置
3. 英文名 → 本地数据库 ID 映射（查询 pokemon_forms.name_en、moves.name_en 等）
4. Upsert 到 meta_* 表
```

### 4.3 Markdown 解析要点

Pikalytics AI API 返回的是结构化 Markdown，关键数据在表格和列表中：

- 使用率排名：Markdown 表格，列为 `| Rank | Pokemon | Usage % | Win Rate | Record |`
- 常见招式：Markdown 列表，格式为 `- **Move Name**: XX.XXX%`
- 常见道具/特性：同招式格式
- EV 分配：FAQ 区块，格式为 `**Nature** nature with an EV spread of \`H/A/D/SA/SD/S\``

### 4.4 CLI 命令

```bash
# 采集当前赛制 meta 数据（默认格式）
npm run crawl:meta

# 采集指定赛制
npm run crawl:meta -- --format gen9championsvgc2026regma

# 仅采集使用率排名（不采集单只详情）
npm run crawl:meta -- --format gen9championsvgc2026regma --ranking-only

# 仅采集 TOP N（开发调试用）
npm run crawl:meta -- --limit 10

# 采集指定宝可梦的详情
npm run crawl:meta -- --format gen9championsvgc2026regma --pokemon Garchomp

# 干跑模式（不写库）
npm run crawl:meta -- --dry-run
```

### 4.5 请求规范

- 使用 `fetcher.py` 的缓存优先流程
- 请求间隔：每次请求间隔 2 秒（尊重 Pikalytics 服务）
- 缓存路径：`data/raw/meta/{format_code}/{pokemon_name}.md`
- User-Agent：保持项目统一的自定义 UA

### 4.6 英文名映射

Pikalytics 返回的宝可梦名为英文（如 `Garchomp`、`Charizard-Mega-Y`）。需要建立与本地数据库的映射：

```
Pikalytics name → pokemon_forms.name_en → form_id / pokemon_id
```

对于形态名（如 `Charizard-Mega-Y`），需要解析形态后缀并匹配 `form_type`。此映射逻辑应集中在爬虫的 `_resolve_pokemon_identity()` 函数中。

### 4.7 数据新鲜度策略

- Pikalytics 数据标注 `Data Date`（如 `2026-04`），通常每月更新
- 爬虫应检查 `meta_snapshots` 中是否已有同 `format_code + data_date` 的记录
- 若已存在且 `fetched_at` 在 7 天内，跳过采集
- 赛制切换时（Regulation 变更），手动触发全量采集

---

## 五、API 设计

### 5.1 新增接口总览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/meta/formats` | 返回可用的对战格式列表 |
| GET | `/meta/:formatCode/usage` | 返回指定格式的宝可梦使用率排名 |
| GET | `/meta/:formatCode/pokemon/:name` | 返回指定宝可梦的详细 meta 数据（含主流配置） |

路由同现有规则，同时挂载到 `/` 和 `/api` 前缀。

### 5.2 接口详情

#### GET `/meta/formats`

```json
{
  "data": [
    {
      "formatCode": "gen9championsvgc2026regma",
      "formatName": "Pokemon Champions VGC 2026 Reg M-A",
      "dataDate": "2026-04",
      "pokemonCount": 50
    }
  ]
}
```

#### GET `/meta/:formatCode/usage?limit=20`

```json
{
  "data": [
    {
      "rank": 1,
      "pokemonNameEn": "Sneasler",
      "pokemonId": 123,
      "formId": 456,
      "nameZh": "苍响",
      "usagePercent": 43.80,
      "winRate": 49.417,
      "primaryType": "格斗",
      "secondaryType": "毒",
      "imageUrl": "..."
    }
  ],
  "total": 50,
  "format": { "code": "gen9championsvgc2026regma", "name": "...", "dataDate": "2026-04" }
}
```

#### GET `/meta/:formatCode/pokemon/:name`

```json
{
  "data": {
    "pokemonNameEn": "Garchomp",
    "pokemonId": 445,
    "formId": 789,
    "nameZh": "烈咬陆鲨",
    "usagePercent": 40.40,
    "winRate": 52.163,
    "spreads": [
      {
        "rank": 1,
        "nature": "Jolly",
        "evs": { "hp": 2, "atk": 32, "def": 0, "spa": 0, "spd": 0, "spe": 32 },
        "usagePercent": 18.938
      }
    ],
    "moves": [
      { "nameEn": "Earthquake", "moveId": 101, "nameZh": "地震", "usagePercent": 91.473 },
      { "nameEn": "Rock Slide", "moveId": 102, "nameZh": "岩崩", "usagePercent": 81.635 }
    ],
    "items": [
      { "nameEn": "Choice Scarf", "itemId": 201, "nameZh": "讲究围巾", "usagePercent": 27.890 }
    ],
    "abilities": [
      { "nameEn": "Rough Skin", "abilityId": 301, "nameZh": "鲨鱼皮", "usagePercent": 93.852 }
    ],
    "teammates": [
      { "name": "Sneasler", "usagePercent": 46.767 }
    ]
  }
}
```

### 5.3 与现有 API 的关系

KO 分析的伤害计算仍然使用现有 `POST /battle/damage` 端点，前端负责批量调用和结果聚合。初期不新增批量伤害计算端点。

---

## 六、前端页面设计

### 6.1 页面结构

```
┌─────────────────────────────────────────────────────────────┐
│  顶部导航                                           [#/ko]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─── 我的宝可梦配置 ──────────────────────────────────┐   │
│  │  [PokemonConfigPanel 复用]                           │   │
│  │  宝可梦选择 | 性格 | EV/SP | 道具 | 特性 | 4招式    │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─── 分析设置 ────────────────────────────────────────┐   │
│  │  模式: [🗡️ 斩杀线] [🛡️ 防守线]                      │   │
│  │  赛制: [Reg M-A ▼]    目标范围: [TOP 20 ▼]          │   │
│  │  [开始分析]                                          │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─── 分析结果 ────────────────────────────────────────┐   │
│  │  （见 6.2 / 6.3 详细设计）                            │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─── 优化建议 ────────────────────────────────────────┐   │
│  │  （见 6.4 详细设计）                                  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 斩杀线分析结果

用户选择一个招式后，展示该招式对所有目标宝可梦（使用其主流配置）的击杀判定，按结果分组：

**分组 1：✅ 确定 OHKO**
- 条件：`minPercent >= 100`（最小乱数也能击杀）
- 展示：目标名（排名）、主流配置简述、伤害百分比区间

**分组 2：⚡ 概率 OHKO**
- 条件：`minPercent < 100 <= maxPercent`
- 展示：同上 + 概率（如 "14/16 乱数击杀，87.5%"）
- 附带建议：换什么道具/多少攻击 EV 可以达成确定 OHKO

**分组 3：❌ 无法 OHKO（展示 N-HKO）**
- 条件：`maxPercent < 100`
- 展示：确定 2HKO / 概率 2HKO / 确定 3HKO / 更多
- 计算方法：累计多次攻击的伤害组合

**分组 4：🚫 免疫/无效**
- 条件：属性免疫或特性免疫导致伤害为 0
- 展示：免疫原因（属性/特性名）

每组内按使用率排名升序排列（高使用率目标排在前面）。

### 6.3 防守线分析结果

系统获取目标列表中每只宝可梦的主流招式（取使用率最高的攻击招式），计算对用户宝可梦的伤害：

**分组 1：🔴 致命威胁 — 确定被 OHKO**
- 展示：威胁来源、招式名、伤害百分比
- 附带建议：需要多少耐久才能存活

**分组 2：🟡 高风险 — 概率被 OHKO**
- 展示：概率（如 "10/16 乱数击杀"）
- 附带建议：加多少 EV 可以降到安全区

**分组 3：🟢 可以稳定承受**
- 展示：伤害百分比，承受后剩余 HP

每组内按威胁程度（伤害百分比）降序排列。

### 6.4 优化建议模块

基于分析结果，自动生成配置调整建议：

**斩杀线优化**：
- "攻击 SP 从 32 降到 28，仍可确定 OHKO 上述 X 只目标，省下的 4 SP 可分配到速度（+Y 速度实数值）"
- "换持有物从 XX 到 YY 时，可额外确定 OHKO: ZZ"

**防守线优化**：
- "当前配置可稳定承受 X/Y 只热门宝可梦的最强打击"
- "如果将 HP SP 从 N 改为 M，可新增稳定承受: BB 的 CC 招式"
- "推荐耐久分配: HP=X, Def=Y（以最少 SP 总量达成最多存活）"

### 6.5 交互流程

```
用户选择宝可梦 → 配置性格/EV(SP)/道具/特性/招式
         ↓
选择分析模式（斩杀线 or 防守线）
         ↓
选择赛制格式 + 目标范围（TOP 20/50/自定义）
         ↓
点击"开始分析"
         ↓
前端从 meta API 获取目标列表 + 主流配置
         ↓
前端并发调用 POST /battle/damage（每个目标一次或多次）
         ↓
汇总结果 → 计算 N-HKO 概率 → 分组排序 → 展示
         ↓
用户调整配置 → 可重新分析
```

---

## 七、核心算法

### 7.1 N-HKO 概率计算

基于 `damageRolls`（16 个等概率乱数值）和 `defenderHp` 精确计算：

**1HKO 概率**：

```javascript
const koRolls = damageRolls.filter(r => r >= defenderHp).length;
const ohkoPercent = koRolls / 16 * 100;
// 16/16 = 确定 OHKO, 0/16 = 无法 OHKO, 中间 = 概率 OHKO
```

**2HKO 概率**（暴力枚举 16×16=256 种组合）：

```javascript
let koCount = 0;
for (const r1 of damageRolls) {
  for (const r2 of damageRolls) {
    if (r1 + r2 >= defenderHp) koCount++;
  }
}
const twoHkoPercent = koCount / 256 * 100;
```

**3HKO 概率**（16^3=4096 种组合，仍可暴力计算）：

```javascript
let koCount = 0;
for (const r1 of damageRolls) {
  for (const r2 of damageRolls) {
    for (const r3 of damageRolls) {
      if (r1 + r2 + r3 >= defenderHp) koCount++;
    }
  }
}
const threeHkoPercent = koCount / 4096 * 100;
```

**综合 N-HKO 判定**：

```javascript
function determineKO(damageRolls, defenderHp) {
  const min = Math.min(...damageRolls);
  const max = Math.max(...damageRolls);

  if (min >= defenderHp) return { n: 1, guaranteed: true, percent: 100 };
  if (max >= defenderHp) return { n: 1, guaranteed: false, percent: calcOhkoPercent(damageRolls, defenderHp) };
  if (min * 2 >= defenderHp) return { n: 2, guaranteed: true, percent: 100 };
  if (max * 2 >= defenderHp) return { n: 2, guaranteed: false, percent: calc2hkoPercent(damageRolls, defenderHp) };
  if (min * 3 >= defenderHp) return { n: 3, guaranteed: true, percent: 100 };
  if (max * 3 >= defenderHp) return { n: 3, guaranteed: false, percent: calc3hkoPercent(damageRolls, defenderHp) };
  // 继续到 4HKO / 5HKO，超过 5 次标记为"无法有效击杀"
}
```

### 7.2 属性免疫预判

在发起伤害计算 API 调用前，先在前端做属性免疫检查，减少无效请求：

```javascript
// 属性免疫表（招式属性 → 被免疫的防守属性）
const TYPE_IMMUNITIES = {
  Normal: ['Ghost'],
  Fighting: ['Ghost'],
  Poison: ['Steel'],
  Ground: ['Flying'],
  Ghost: ['Normal'],
  Electric: ['Ground'],
  Psychic: ['Dark'],
  Dragon: ['Fairy'],
};

// 特性免疫（常见的需要预判的特性）
const ABILITY_IMMUNITIES = {
  'Levitate': ['Ground'],
  'Volt Absorb': ['Electric'],
  'Lightning Rod': ['Electric'],
  'Water Absorb': ['Water'],
  'Storm Drain': ['Water'],
  'Flash Fire': ['Fire'],
  'Sap Sipper': ['Grass'],
};
```

### 7.3 耐久 EV 反推算法

给定目标"稳定承受某招式"，反算最小耐久 EV/SP 分配：

```
输入: 攻击方配置、招式、当前防守方配置
输出: 最小 HP + Def/SpD EV 组合使得 max(damageRolls) < HP

算法:
1. 目标条件: max(damageRolls) < HP 实数值
2. HP 实数值 = floor((baseHP * 2 + IV + floor(EV/4)) * level / 100) + level + 10
3. 防御实数值影响 damageRolls 的每个值
4. 搜索策略: 逐步增加 HP EV 和 Def/SpD EV，每步重新调用伤害计算
5. 优化原则: HP 和防御的乘积最大化时物理/特殊耐久最高
6. 约束: 单项 EV ≤ 252（经典模式）或 SP ≤ 32（Champions 模式），总 EV ≤ 510 或总 SP ≤ 128
```

### 7.4 攻击 EV 最低斩杀线反推

```
目标: 找到最小攻击 EV/SP，使 min(damageRolls) >= defenderHp（确定 OHKO）

方法: 二分搜索
- low = 0, high = 当前攻击 EV
- 每步重新调用伤害计算，判断是否仍能确定 OHKO
- 返回最小满足条件的 EV 值
- 省下的 EV = 当前 EV - 最小 EV → 可重新分配
```

### 7.5 批量计算并发控制

```javascript
async function batchDamageCalc(requests, concurrency = 6) {
  const results = [];
  const executing = new Set();

  for (const req of requests) {
    const p = api('/battle/damage', { method: 'POST', body: req })
      .then(result => { executing.delete(p); return result; });
    executing.add(p);
    results.push(p);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
}
```

---

## 八、前端技术实现

### 8.1 文件结构

```
apps/web/src/
├── pages/
│   └── KoAnalysisPage.jsx            新增页面主组件
├── components/
│   └── ko/
│       ├── KoConfigPanel.jsx         我方宝可梦配置（复用 PokemonConfigPanel）
│       ├── KoAnalysisSettings.jsx    分析设置（模式/赛制/范围选择）
│       ├── KoResultPanel.jsx         分析结果总面板
│       ├── KoResultGroup.jsx         单个结果分组（确定KO/概率KO/无法KO/免疫）
│       ├── KoResultRow.jsx           单条结果行
│       └── KoOptimizationPanel.jsx   优化建议面板
├── hooks/
│   └── useKoAnalysis.js              KO 分析核心 hook（批量计算、结果聚合）
├── utils/
│   └── koCalculation.js              N-HKO 计算、免疫预判、EV 反推算法
└── styles/
    └── ko-analysis.css               样式（ko- 前缀）
```

### 8.2 复用现有组件与工具

| 现有资源 | 用途 |
|---------|------|
| `PokemonConfigPanel` | 我方宝可梦配置面板（含形态、特性、道具、EV/IV/SP 编辑） |
| `useDamageSideState()` | 战斗状态管理 |
| `usePokemonDetails()` | 宝可梦详情异步加载 |
| `useDamageStatMode()` | EV/SP 自动转换（经典↔Champions） |
| `useFieldState()` | 场地状态管理 |
| `buildDamageRequest()` | 构建伤害计算请求 payload |
| `buildDamageResult()` | 伤害计算结果格式化 |
| `createDraftMember()` | 初始化宝可梦配置对象 |
| `TYPE_BG_COLORS` | 属性背景色映射 |
| `typeIconSrc()` / `categoryIconSrc()` | 图标 URL 生成 |

### 8.3 状态管理

```javascript
// KoAnalysisPage 顶层 state
const [myPokemon, setMyPokemon] = useState(createDraftMember());
const [analysisMode, setAnalysisMode] = useState('attack');  // 'attack' | 'defense'
const [formatCode, setFormatCode] = useState('gen9championsvgc2026regma');
const [targetRange, setTargetRange] = useState(20);          // TOP N
const [selectedMoveIndex, setSelectedMoveIndex] = useState(0);
const [results, setResults] = useState(null);
const [loading, setLoading] = useState(false);
```

### 8.4 分析执行流程

```javascript
async function runAnalysis() {
  setLoading(true);

  // 1. 获取目标列表（从 meta API）
  const { data: targets } = await api(`/meta/${formatCode}/usage?limit=${targetRange}`);

  // 2. 对每个目标获取主流配置（可批量或缓存）
  const targetDetails = await Promise.all(
    targets.map(t => api(`/meta/${formatCode}/pokemon/${t.pokemonNameEn}`))
  );

  // 3. 预判免疫，过滤无效目标
  const { validTargets, immuneTargets } = filterImmune(myPokemon, targetDetails, selectedMove);

  // 4. 构建伤害计算请求并批量执行
  const requests = validTargets.map(t => buildCalcRequest(myPokemon, t, selectedMove));
  const calcResults = await batchDamageCalc(requests, 6);

  // 5. 计算 N-HKO 概率，分组排序
  const grouped = groupResults(calcResults, validTargets, immuneTargets);

  setResults(grouped);
  setLoading(false);
}
```

---

## 九、迭代计划

### Phase 1：核心可用（约 1 周）

目标：最小可用产品。用户可以配置一只宝可梦，手动添加若干目标，立即得到斩杀线/防守线分析结果。不依赖 meta 数据采集，不依赖爬虫和新增数据库表。

| 任务 | 产出 |
|------|------|
| 新增页面路由 | `#/ko` 路由注册到 `App.jsx` |
| 页面框架 | `apps/web/src/pages/KoAnalysisPage.jsx`，复用 `PokemonConfigPanel` |
| 目标管理 | 支持手动逐个选择目标宝可梦 + 简单配置（性格/EV/道具/特性） |
| 分析引擎 | `apps/web/src/utils/koCalculation.js`（N-HKO 概率计算） |
| 批量计算 | 前端并发调用现有 `POST /battle/damage` API，含并发控制 |
| 斩杀线结果表格 | 按分组展示：✅ 确定 KO / ⚡ 概率 KO / ❌ 无法 KO / 🚫 免疫 |
| 防守线结果表格 | 按分组展示：🔴 扛不住 / 🟡 概率存活 / 🟢 能扛住 |
| 样式 | `apps/web/src/styles/ko-analysis.css`（前缀 `ko-`） |
| 验证 | 手动配置 2~3 个目标，确认伤害结果和分组正确 |

### Phase 2：预设与建议（约 1~2 周）

目标：提供预设热门目标列表和配置优化建议，减少手动配置成本。引入 meta 数据基建（数据库 + 爬虫 + API）。

| 任务 | 产出 |
|------|------|
| 预设热门目标列表 | JSON 维护，按赛制分组（可从 Pikalytics 采集或手动整理） |
| 目标典型配置 | 每只宝可梦 1~3 套主流 spread（性格/EV/道具/特性/招式） |
| 一键加载目标 | "加载 Reg M-A TOP 20" 按钮，自动填充目标列表和配置 |
| 数据库表 | `schema/d1-schema.sql` 新增 6 张 `meta_*` 表 |
| Drizzle Schema + Queries | `packages/store/drizzle-schema/src/meta.ts`、`drizzle-queries/src/meta.ts` |
| 爬虫模块 | `packages/crawler_py/localdex_crawler/meta.py`（Pikalytics 采集） |
| Meta API | `apps/api/src/routes/meta.ts`（formats / usage / pokemon 三接口） |
| EV 优化建议 | "降低 X 攻击 EV 仍能 OHKO，省下的 EV 可分配到速度/耐久" |
| 耐久 EV 反推 | "需要 XX HP / XX Def SP 才能稳定接住 YY 的 ZZ 招式" |
| 建议展示 UI | `KoOptimizationPanel` 组件 |
| 验证 | 爬虫成功写入 TOP 50 数据，预设目标一键加载后分析结果正确 |

### Phase 3：高级功能（约 2~3 周）

目标：进阶分析能力和用户体验优化。

| 任务 | 产出 |
|------|------|
| 多招式覆盖分析 | 4 招全算，展示最佳打击面组合 |
| 速度线整合 | "加到 XXX 速度实数值可以先手这些目标" |
| 配置导出/分享 | 生成分析报告的文本或图片 |
| 队伍联动 | 从队伍页面直接跳转 KO 分析，自动填充配置 |
| 回复/损耗修正 | 剩饭、中毒、天气等每回合 HP 变动对 N-HKO 的影响 |

---

## 十、注意事项与约束

### 10.1 数据源边界

- **宝可梦基础数据**（种族值、招式列表、特性效果、图片等）：唯一来源为 52Poké Wiki，由现有爬虫维护
- **对战 meta 统计数据**（使用率、配置分布、胜率等）：来源为 Pikalytics AI API，由新增爬虫维护
- 两者职责明确不重叠，不互相替代

### 10.2 性能约束

- 单次分析最多涉及 50 个目标 × 4 招式 = 200 次伤害计算请求
- 前端并发控制在 5~10 个同时请求，避免压垮本地 API
- 结果应缓存，相同配置下的重复分析不重新请求
- 考虑添加 Web Worker 处理 N-HKO 概率计算（3HKO 的 4096 次循环不应阻塞主线程）

### 10.3 Champions 模式兼容

- Champions 世代的内部值为 `0`（非 9），通过 `Number(generation) === 0` 判断
- Champions 模式使用 SP（Skill Points，值域 0~32）而非传统 EV（值域 0~252）
- Pikalytics 返回的 spread 数据已经是 SP 格式
- KO 分析页面需要正确处理 SP 与 EV 的转换（使用现有 `useDamageStatMode` hook）
- 默认配置应为 `generation="0"` 和 `battleMode="doubles"`

### 10.4 Battle-Core 边界

- `packages/battle-core` 保持纯计算，不引入 meta 数据依赖
- KO 分析的批量调度、结果聚合、建议生成均在前端完成
- 如果未来需要 batch 端点，在 `apps/api` 层做循环调用，不在 battle-core 中实现批量逻辑

### 10.5 样式规范

- CSS 前缀统一使用 `ko-`
- 样式文件路径：`apps/web/src/styles/ko-analysis.css`
- 在 `apps/web/src/styles/index.css` 中追加 `@import` 导入
- 响应式断点优先集中到 `responsive.css`

---

## 十一、变更记录

| 日期 | 版本 | 变更内容 | 作者 |
|------|------|---------|------|
| 2025-05-28 | v1.0 | 初始版本：完成产品定位、数据源选型、数据库设计、爬虫设计、API 设计、前端页面设计、核心算法、迭代计划 | - |
| 2025-05-28 | v1.1 | 迭代计划调整为 3 Phase：Phase 1 核心可用（手动添加目标，不依赖数据基建），Phase 2 预设与建议（引入 meta 数据 + 优化建议），Phase 3 高级功能 | - |
| 2025-05-28 | v1.2 | 数据源最终决策：确认 Pikalytics AI Markdown API 为唯一 meta 数据源，记录排除游戏内 Battle Data 直采和 PokéChamp DB 的理由 | - |

---

> **本文档为 KO 分析功能的 source of truth。所有需求变更、设计调整、技术决策均须同步更新本文档后再开始开发。**
