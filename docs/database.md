# 数据库设计

## 概述

Pokemon LocalDex 使用单个 SQLite 数据库文件 `data/sqlite/localdex.sqlite` 存储所有结构化数据。数据库由 Python 爬虫创建和写入，由 Node.js API 层只读查询。

所有主表的主键使用 `INTEGER PRIMARY KEY AUTOINCREMENT`，外键关系使用自增整数 ID。API 查询兼容数字 ID 和中文名多种方式。

## 表结构总览

数据库包含主实体表、形态相关表、世代记录表、关联表、Champions 专用表和使用率数据表。

### 主实体表

**pokemon** — 宝可梦主表，每只宝可梦一条记录。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| dex_number | INTEGER | 全国图鉴编号 |
| name_zh | TEXT | 中文名 |
| name_ja | TEXT | 日文名 |
| name_en | TEXT | 英文名 |
| category | TEXT | 分类（如"种子宝可梦"） |
| height_m | REAL | 身高（米） |
| weight_kg | REAL | 体重（千克） |
| introduced_generation | INTEGER | 初登场世代 |
| source_url | TEXT | 数据来源页面 URL |
| source_title | TEXT | 来源页面标题 |
| source_fetched_at | TEXT | 抓取时间 |

索引：`dex_number`、`name_zh`。

**moves** — 招式表。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| number | INTEGER | 招式编号 |
| name_zh | TEXT | 中文名 |
| name_ja | TEXT | 日文名 |
| name_en | TEXT | 英文名 |
| type_name | TEXT | 属性名称 |
| category | TEXT | 分类（物理/特殊/变化） |
| power | INTEGER | 威力 |
| accuracy | INTEGER | 命中率 |
| pp | INTEGER | PP 值 |
| description | TEXT | 效果描述 |
| effect_detail | TEXT | 详细效果说明 |
| introduced_generation | INTEGER | 初登场世代 |

唯一约束：`(number, name_zh)`。索引：`number`、`name_zh`、`type_name`。

**abilities** — 特性表。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| number | INTEGER | 特性编号 |
| name_zh | TEXT | 中文名 |
| name_ja | TEXT | 日文名 |
| name_en | TEXT | 英文名 |
| description | TEXT | 效果描述 |
| effect_detail | TEXT | 详细效果说明 |
| introduced_generation | INTEGER | 初登场世代 |

唯一约束：`(number, name_zh)`。索引：`number`、`name_zh`。

**items** — 道具表。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| legacy_id | TEXT UNIQUE | 旧版标识 |
| name_zh | TEXT | 中文名 |
| name_ja | TEXT | 日文名 |
| name_en | TEXT | 英文名 |
| category | TEXT | 道具分类 |
| effect_summary | TEXT | 效果摘要 |

索引：`name_zh`、`category`。

### 形态相关表

宝可梦的形态数据采用"一主多从"的设计：`pokemon_forms` 是形态主表，每个形态的属性、种族值、特性和图片分别存储在独立的子表中，通过 `form_id` 关联。

**pokemon_forms** — 形态主表，每只宝可梦至少有一个 `default` 形态。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| pokemon_id | INTEGER FK | 关联 pokemon.id |
| form_type | TEXT | 同一宝可梦内稳定形态标识，默认形态为 `default`；优先由英文名相对物种英文名的前/后缀推导，如 `mega-x`、`alola` |
| form_category | TEXT | 形态大类，如 `default`、`mega`、`gigantamax`、`regional-alola`、`alternate` |
| name_zh | TEXT | 规范形态中文全名，与 Champions 可用池格式一致，如 `雷丘(阿罗拉的样子)` |
| display_name_zh | TEXT | 宝可梦详情中展示的形态名，保存爬虫原始展示名，如 `阿罗拉雷丘` |
| name_en | TEXT | 形态英文名，由爬虫按共享规则填充为可与对战计算库对应的 canonical 物种名 |
| is_default | INTEGER | 是否为默认形态 |
| sort_order | INTEGER | 排序序号 |
| required_item_id | INTEGER FK | 形态必需道具，如 Mega 石 |

唯一约束：`(pokemon_id, form_type)`。

**pokemon_form_stats** — 形态种族值表，支持世代范围。当某个形态的种族值在不同世代有变化时（如皮可西在第六世代特攻从 85 变为 95），会有多条记录，通过 `generation_start` 和 `generation_end` 区分。

| 字段 | 类型 | 说明 |
|------|------|------|
| form_id | INTEGER FK | 关联 pokemon_forms.id |
| generation_start | INTEGER | 生效起始世代（含） |
| generation_end | INTEGER | 生效结束世代（含），NULL 表示至今 |
| hp, atk, def, spa, spd, spe | INTEGER | 六项种族值 |

**pokemon_form_types** — 形态属性表，同样支持世代范围。

| 字段 | 类型 | 说明 |
|------|------|------|
| form_id | INTEGER FK | 关联 pokemon_forms.id |
| type_name | TEXT | 属性名称 |
| slot | INTEGER | 属性槽位（1=第一属性，2=第二属性） |
| generation_start | INTEGER | 生效起始世代 |
| generation_end | INTEGER | 生效结束世代 |

**pokemon_form_abilities** — 形态特性表，支持世代范围。

| 字段 | 类型 | 说明 |
|------|------|------|
| form_id | INTEGER FK | 关联 pokemon_forms.id |
| ability_id | INTEGER FK | 关联 abilities.id |
| ability_name_zh | TEXT | 特性中文名（冗余，便于查询） |
| slot | INTEGER | 特性槽位 |
| is_hidden | INTEGER | 是否为隐藏特性 |
| generation_start | INTEGER | 生效起始世代 |
| generation_end | INTEGER | 生效结束世代 |

**pokemon_form_images** — 形态图片表，每个形态可有多种图片。

| 字段 | 类型 | 说明 |
|------|------|------|
| form_id | INTEGER FK | 关联 pokemon_forms.id |
| image_kind | TEXT | 图片类型（official/shinyOfficial/sprite/shinySprite） |
| url | TEXT | 图片 URL |
| alt | TEXT | 替代文本 |

唯一约束：`(form_id, image_kind)`。

### 世代记录表

**move_generation_records** — 招式世代差异记录，记录招式在不同世代的效果描述变化。

| 字段 | 类型 | 说明 |
|------|------|------|
| move_id | INTEGER FK | 关联 moves.id |
| generation | INTEGER | 世代编号 |
| game_version_code | TEXT | 游戏版本代码 |
| description | TEXT | 该世代的效果描述 |
| notes | TEXT | 备注 |

**ability_generation_records** — 特性世代差异记录。

| 字段 | 类型 | 说明 |
|------|------|------|
| ability_id | INTEGER FK | 关联 abilities.id |
| generation | INTEGER | 世代编号 |
| description | TEXT | 该世代的效果描述 |
| notes | TEXT | 备注 |

### 关联表

**evolution_chains** — 进化链表，记录宝可梦之间的进化关系。

| 字段 | 类型 | 说明 |
|------|------|------|
| chain_id | INTEGER | 进化链编号（同一进化链共享） |
| from_pokemon_id | INTEGER FK | 进化前宝可梦（NULL 表示链起点） |
| to_pokemon_id | INTEGER FK | 进化后宝可梦 |
| from_form_id | INTEGER FK | 进化前形态 ID（关联 pokemon_forms.id） |
| to_form_id | INTEGER FK | 进化后形态 ID（关联 pokemon_forms.id） |
| stage | INTEGER | 进化阶段（0=基础，1=一阶，2=二阶） |
| evolution_method | TEXT | 进化方式 |
| evolution_condition | TEXT | 进化条件 |
| evolution_item | TEXT | 进化道具 |
| evolution_level | INTEGER | 进化等级 |

**pokemon_moves** — 宝可梦可学招式表，按形态、世代、版本和学习方式记录。

| 字段 | 类型 | 说明 |
|------|------|------|
| pokemon_id | INTEGER FK | 关联 pokemon.id |
| form_id | INTEGER FK | 关联 pokemon_forms.id |
| move_id | INTEGER FK | 关联 moves.id |
| move_name_zh | TEXT | 招式中文名 |
| generation | INTEGER | 世代编号 |
| game_version_code | TEXT | 游戏版本代码 |
| learn_method | TEXT | 学习方式（level-up/tm/egg/tutor 等） |
| level | INTEGER | 学习等级（仅升级学习） |
| tm_number | TEXT | 招式学习器编号 |

唯一索引：`(form_id, move_name_zh, generation, game_version_code, learn_method, level, tm_number)`（NULL 通过表达式归一化）。如果非默认形态与默认形态的招式表完全一致，只存默认形态记录；查询指定形态无自有记录时会回退到默认形态。

### Champions 专用表

Champions 数据来自 52Poké 的 `赛季（Champions）`、`赛制（Champions）` 和 `道具列表（Champions）`。赛季通过 `regulation_id` 关联到赛制；赛制下挂可使用的宝可梦，并通过主 `items` 表关联可用的对战道具。道具列表页中只用于定位 Champions 道具池，不单独落 Champions 专用道具表。

**champions_regulations** — Champions 赛制表。

| 字段 | 类型 | 说明 |
|------|------|------|
| regulation_code | TEXT UNIQUE | 赛制编号，如 `M-A` |
| name | TEXT | 赛制名称 |
| start_at / end_at | TEXT | 解析后的期间起止日期/时间 |
| period_text | TEXT | Wiki 原始期间文本 |
| special_feature | TEXT | 特别要素 |
| held_item_rule | TEXT | 持有物规则 |
| battle_time | TEXT | 对战时间规则 |

**champions_seasons** — Champions 赛季表。

| 字段 | 类型 | 说明 |
|------|------|------|
| season_code | TEXT UNIQUE | 赛季编号，如 `M-1` |
| regulation_id | INTEGER FK | 关联 champions_regulations.id |
| regulation_code | TEXT | 冗余赛制编号，便于排查源数据 |
| start_at / end_at | TEXT | 解析后的赛季起止日期/时间 |
| period_text | TEXT | Wiki 原始日期文本 |

**champions_regulation_pokemon** — 每个赛制可使用的宝可梦/形态。

| 字段 | 类型 | 说明 |
|------|------|------|
| regulation_id | INTEGER FK | 关联 champions_regulations.id |
| pokemon_id | INTEGER FK | 可选关联 pokemon.id |
| form_id | INTEGER FK | 关联 pokemon_forms.id；爬虫会用 `msp_code/name_zh/form_code` 解析到具体形态 |
| dex_number | INTEGER | 全国图鉴编号 |
| msp_code | TEXT | 52Poké `data-msp` 形态代码 |
| form_code | TEXT | `msp_code` 的形态后缀 |
| name_zh | TEXT | Champions 可用形态显示名 |
| sort_order | INTEGER | 源页面顺序 |

**champions_regulation_items** — 每个赛制可使用的主系列道具池。

| 字段 | 类型 | 说明 |
|------|------|------|
| regulation_id | INTEGER FK | 关联 champions_regulations.id |
| item_id | INTEGER FK | 关联主 items.id；Champions 道具页中找不到主表记录的条目不写入 |
| sort_order | INTEGER | Champions 道具源页面顺序 |

### 使用率数据表

使用率数据来自 pokechamdb.com，记录 Champions 赛季各格式下宝可梦的排名和配置统计。以 `champions_usage_pokemon` 为核心，通过 `usage_pokemon_id` 外键关联各维度子表。

**champions_usage_pokemon** — 使用率排名主表，每条记录对应一只宝可梦在某赛季某格式下的排名。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| season_id | INTEGER FK | 关联 champions_seasons.id |
| format | TEXT | 对战格式（`single` / `double`） |
| event_id | TEXT | 赛事 ID（ranked 为空字符串，预留锦标赛格式） |
| pokemon_id | INTEGER FK | 关联 pokemon.id（可 NULL） |
| form_id | INTEGER FK | 关联 pokemon_forms.id（可 NULL） |
| pokemon_slug | TEXT | 宝可梦标识（中文名，用于匹配和去重） |
| rank | INTEGER | 使用率排名 |
| fetched_at | TEXT | 数据抓取时间 |

唯一约束：`(season_id, format, event_id, pokemon_slug)`。索引：`(season_id, format)`、`pokemon_id`。

**champions_usage_moves** — 招式使用率。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| usage_pokemon_id | INTEGER FK | 关联 champions_usage_pokemon.id |
| move_id | INTEGER FK | 关联 moves.id（可 NULL） |
| move_name_zh | TEXT | 招式中文名 |
| rank | INTEGER | 使用率排名 |
| percentage | REAL | 使用率百分比 |

唯一约束：`(usage_pokemon_id, move_name_zh)`。

**champions_usage_items** — 道具使用率。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| usage_pokemon_id | INTEGER FK | 关联 champions_usage_pokemon.id |
| item_id | INTEGER FK | 关联 items.id（可 NULL） |
| item_name_zh | TEXT | 道具中文名 |
| rank | INTEGER | 使用率排名 |
| percentage | REAL | 使用率百分比 |

唯一约束：`(usage_pokemon_id, item_name_zh)`。

**champions_usage_abilities** — 特性使用率。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| usage_pokemon_id | INTEGER FK | 关联 champions_usage_pokemon.id |
| ability_id | INTEGER FK | 关联 abilities.id（可 NULL） |
| ability_name_zh | TEXT | 特性中文名 |
| rank | INTEGER | 使用率排名 |
| percentage | REAL | 使用率百分比 |

唯一约束：`(usage_pokemon_id, ability_name_zh)`。

**champions_usage_natures** — 性格使用率。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| usage_pokemon_id | INTEGER FK | 关联 champions_usage_pokemon.id |
| nature_id | INTEGER | 性格编号（对应 shared-types NATURE_DEFS 枚举 1-25） |
| rank | INTEGER | 使用率排名 |
| percentage | REAL | 使用率百分比 |

唯一约束：`(usage_pokemon_id, nature_id)`。

**champions_usage_partners** — 队友排名。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| usage_pokemon_id | INTEGER FK | 关联 champions_usage_pokemon.id |
| partner_pokemon_id | INTEGER FK | 关联 pokemon.id（通过中文名多级匹配） |
| partner_slug | TEXT | 队友标识（中文名） |
| rank | INTEGER | 队友匹配率排名 |

唯一约束：`(usage_pokemon_id, partner_slug)`。

**champions_usage_ev_spreads** — EV（努力值）分布排名。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| usage_pokemon_id | INTEGER FK | 关联 champions_usage_pokemon.id |
| rank | INTEGER | 排名 |
| percentage | REAL | 使用率百分比 |
| hp | INTEGER | HP 努力值 |
| atk | INTEGER | 攻击努力值 |
| def | INTEGER | 防御努力值 |
| sp_atk | INTEGER | 特攻努力值 |
| sp_def | INTEGER | 特防努力值 |
| speed | INTEGER | 速度努力值 |

唯一约束：`(usage_pokemon_id, hp, atk, def, sp_atk, sp_def, speed)`。

## ER 关系

```mermaid
erDiagram
    pokemon ||--o{ pokemon_forms : "has forms"
    pokemon_forms ||--o{ pokemon_form_stats : "has stats"
    pokemon_forms ||--o{ pokemon_form_types : "has types"
    pokemon_forms ||--o{ pokemon_form_abilities : "has abilities"
    pokemon_forms ||--o{ pokemon_form_images : "has images"
    pokemon ||--o{ evolution_chains : "evolves"
    pokemon ||--o{ pokemon_moves : "learns"
    pokemon_forms ||--o{ pokemon_moves : "learns as form"
    moves ||--o{ move_generation_records : "changes across"
    moves ||--o{ pokemon_moves : "learned by"
    abilities ||--o{ ability_generation_records : "changes across"
    abilities ||--o{ pokemon_form_abilities : "possessed by"
    champions_regulations ||--o{ champions_seasons : "used by"
    champions_regulations ||--o{ champions_regulation_pokemon : "allows"
    champions_regulations ||--o{ champions_regulation_items : "allows"
    items ||--o{ champions_regulation_items : "available in"
    pokemon ||--o{ champions_regulation_pokemon : "matched by dex"
    pokemon_forms ||--o{ champions_regulation_pokemon : "matched by form"
    champions_seasons ||--o{ champions_usage_pokemon : "has usage"
    champions_usage_pokemon ||--o{ champions_usage_moves : "uses moves"
    champions_usage_pokemon ||--o{ champions_usage_items : "uses items"
    champions_usage_pokemon ||--o{ champions_usage_abilities : "uses abilities"
    champions_usage_pokemon ||--o{ champions_usage_natures : "uses natures"
    champions_usage_pokemon ||--o{ champions_usage_partners : "paired with"
    champions_usage_pokemon ||--o{ champions_usage_ev_spreads : "ev distribution"
    pokemon ||--o{ champions_usage_pokemon : "ranked in"
    pokemon_forms ||--o{ champions_usage_pokemon : "ranked as form"
```

## 设计要点

**形态优先**：宝可梦的属性、种族值、特性和图片都挂在形态（`pokemon_forms`）下而非宝可梦主表上。这样可以自然地表达超级进化、地区形态、面具形态等不同形态各自独立的数据。

**世代范围**：形态子表（stats/types/abilities）使用 `generation_start` 和 `generation_end` 表示生效范围，而非为每个世代创建一条记录。这样既节省空间，又能方便地查询"第 N 世代时这个形态的种族值是多少"。

**冗余中文名**：`pokemon_form_abilities.ability_name_zh` 和 `pokemon_moves.move_name_zh` 冗余存储了中文名。这是因为爬虫解析时可能还没有对应的 abilities/moves 记录（采集顺序不固定），冗余字段保证数据完整性，同时也简化了查询。

**使用率数据中文名匹配**：`champions_usage_pokemon` 和 `champions_usage_partners` 通过中文名多级匹配关联到 `pokemon.id`。pokechamdb 仅提供日文 `name` 字段和中文 `displayNames`，爬虫以中文名为主键进行匹配（`pokemon.name_zh` → `pokemon_forms.name_zh` → `display_name_zh` → 括号拆解 → 别名映射）。`pokemon_slug` / `partner_slug` 冗余存储中文名作为去重键，即使 ID 匹配失败数据仍可保留。
