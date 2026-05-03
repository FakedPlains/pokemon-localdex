# 爬虫指南

## 概述

Pokemon LocalDex 的数据采集由一个 Python 爬虫完成，数据源为 [52Poké Wiki](https://wiki.52poke.com/)。爬虫从 Wiki 页面抓取 HTML，解析出结构化数据后写入 SQLite 数据库。

爬虫支持增量更新和全量重建两种模式，内置本地页面缓存以避免重复请求，并提供丰富的筛选参数用于只采集部分数据。

## 环境准备

爬虫需要 Python 3.10 或更高版本。安装依赖：

```bash
pip install -r packages/crawler_py/requirements.txt
```

主要依赖包括 `requests`（HTTP 请求）、`beautifulsoup4`（HTML 解析）和 `opencc`（繁简转换）。

## 快速开始

最常用的命令是全量采集，它会依次采集招式、特性、道具、宝可梦详情和可学招式表：

```bash
npm run crawl:all
```

这等价于：

```bash
python3 scripts/crawl-52poke-db.py all
```

全量采集大约需要数小时（取决于网络状况），因为需要抓取上千个 Wiki 页面。首次运行后，页面会缓存到 `data/raw/` 目录，后续运行会直接读取缓存，速度大幅提升。

## 子命令

爬虫提供以下子命令，可以单独采集某一类数据：

**pokemon** — 采集宝可梦列表和详情页。从全国图鉴列表页获取所有宝可梦的基础信息，然后逐一抓取详情页，解析出形态、属性、种族值、图片、进化链等数据。

```bash
npm run crawl:pokemon
# 或
python3 scripts/crawl-52poke-db.py pokemon
```

**pokemon-abilities** — 仅刷新宝可梦的特性关联数据。这个命令不会重新抓取详情页，而是从已缓存的页面中重新解析特性信息并更新数据库。适用于特性解析逻辑修改后的快速刷新。

```bash
python3 scripts/crawl-52poke-db.py pokemon-abilities
```

**learnsets** — 采集宝可梦的世代可学招式表。每只宝可梦的每个世代对应一个独立的 Wiki 页面，因此这是最耗时的采集任务。

```bash
python3 scripts/crawl-52poke-db.py learnsets
```

**catalog** — 采集招式、特性和道具的详情页。从各自的列表页获取条目，然后逐一抓取详情页解析完整数据。

```bash
npm run crawl:catalog
# 或
python3 scripts/crawl-52poke-db.py catalog
```

**all** — 依次执行 catalog、pokemon、learnsets 三个子命令，完成全量采集。

## 通用参数

以下参数适用于所有子命令：

| 参数 | 说明 |
|------|------|
| `--db-path PATH` | 指定 SQLite 数据库路径，默认 `data/sqlite/localdex.sqlite` |
| `--raw-dir PATH` | 指定页面缓存目录，默认 `data/raw/` |
| `--refresh-raw` | 强制重新抓取页面，忽略本地缓存 |
| `--dry-run` | 只解析不写入数据库，用于调试和预览 |
| `--clean` | 写入前先清空对应的数据表，实现全量重建 |

## 宝可梦筛选参数

以下参数适用于 pokemon、pokemon-abilities、learnsets 和 all 子命令，用于只采集部分宝可梦：

| 参数 | 说明 |
|------|------|
| `--start-dex N` | 起始图鉴编号（含） |
| `--end-dex N` | 结束图鉴编号（含） |
| `--limit N` | 最多采集 N 只 |
| `--pokemon NAME` | 按中文名筛选，可重复使用或逗号分隔 |
| `--generations LIST` | 逗号分隔的世代编号，仅用于 learnsets |

示例：

```bash
# 只采集第一世代的宝可梦
python3 scripts/crawl-52poke-db.py pokemon --start-dex 1 --end-dex 151

# 只采集皮卡丘和喷火龙
python3 scripts/crawl-52poke-db.py pokemon --pokemon 皮卡丘 --pokemon 喷火龙

# 只采集皮卡丘在第一和第九世代的招式表
python3 scripts/crawl-52poke-db.py learnsets --pokemon 皮卡丘 --generations 1,9

# 预览前 5 只宝可梦的解析结果，不写入数据库
python3 scripts/crawl-52poke-db.py pokemon --limit 5 --dry-run
```

## Catalog 筛选参数

以下参数适用于 catalog 和 all 子命令：

| 参数 | 说明 |
|------|------|
| `--moves / --no-moves` | 是否采集招式（默认开启） |
| `--abilities / --no-abilities` | 是否采集特性（默认开启） |
| `--items / --no-items` | 是否采集道具（默认开启） |
| `--move-limit N` | 最多采集 N 个招式 |
| `--ability-limit N` | 最多采集 N 个特性 |
| `--item-limit N` | 最多采集 N 个道具 |
| `--name NAME` | 按中文名筛选，可重复使用 |

示例：

```bash
# 只采集招式，跳过特性和道具
python3 scripts/crawl-52poke-db.py catalog --no-abilities --no-items

# 只采集"十万伏特"这一个招式
python3 scripts/crawl-52poke-db.py catalog --no-abilities --no-items --name 十万伏特
```

## 页面缓存机制

爬虫内置了本地页面缓存，每个抓取的 Wiki 页面会以 JSON 格式保存到 `data/raw/` 目录。JSON 文件包含原始 URL、页面标题、抓取时间和完整 HTML 内容。

缓存的好处是：首次采集后，后续运行直接读取本地文件，无需再次请求 Wiki；如果解析逻辑有 bug，修复后可以直接重跑而不需要重新抓取；支持断点续跑，中途中断后再次运行会跳过已缓存的页面。

使用 `--refresh-raw` 参数可以强制重新抓取，覆盖本地缓存。`data/raw/` 目录已被 `.gitignore` 排除，不会提交到版本库。

## 数据写入

爬虫使用 upsert 语义写入数据库：如果记录已存在则更新，不存在则插入。这意味着多次运行同一命令是安全的，不会产生重复数据。

使用 `--clean` 参数可以在写入前先清空对应的数据表，实现全量重建。`all --clean` 会一次性清空所有表，然后依次重新采集。

## 运行流程

以 `all` 命令为例，完整的采集流程如下：

1. 抓取招式列表页，解析出所有招式的名称和详情页 URL
2. 逐一抓取招式详情页，解析威力、命中、PP、效果描述和世代变化记录，写入 `moves` 和 `move_generation_records` 表
3. 抓取特性列表页，逐一抓取详情页，写入 `abilities` 和 `ability_generation_records` 表
4. 抓取道具列表页，逐一抓取详情页，写入 `items` 表
5. 抓取宝可梦全国图鉴列表页，获取所有宝可梦的编号、名称和详情页 URL
6. 逐一抓取宝可梦详情页，解析形态、属性、种族值、图片、进化链等数据，写入 `pokemon`、`pokemon_forms`、`pokemon_form_stats`、`pokemon_form_types`、`pokemon_form_images`、`evolution_chains` 等表
7. 从详情页解析特性信息，写入 `pokemon_form_abilities` 表
8. 逐一抓取每只宝可梦在各世代的招式学习页面，写入 `pokemon_learnsets` 表

## 形态图片匹配

爬虫在采集宝可梦图片时，需要将不同形态匹配到正确的图片文件。52Poké Wiki 的图片命名规则是在基础文件名后添加后缀，例如 `HOME_1024.png`（普通形态）、`HOME_1024M.png`（超级进化）、`HOME_1024T.png`（太晶形态）。

爬虫通过 `_form_hints()` 函数为每个形态生成匹配提示词（hints）和排除词（anti_hints）。例如太乐巴戈斯的太晶形态会生成 hints=`["t", "terastal"]` 和 anti_hints=`["s", "stellar"]`，确保它匹配到 `HOME_1024T.png` 而不是 `HOME_1024S.png`。

如果某个形态的图片匹配不正确，通常需要在 `_form_hints()` 函数中为该形态添加正确的提示词。

---

## 数据采集规范

以下规范定义了爬虫在数据采集过程中必须遵守的约定，包括数据源、请求行为、文本处理、字段格式和数据质量要求。新增或修改爬虫逻辑时应严格遵循这些规范。

### 数据源约定

爬虫唯一的数据源是 [52Poké Wiki](https://wiki.52poke.com/)（神奇宝贝百科）。所有数据均从该站点的 HTML 页面中解析获取，不使用任何第三方 API 或其他数据源。

采集入口页面共四个：

| 数据类型 | 入口页面 | 说明 |
|---------|---------|------|
| 宝可梦 | 宝可梦列表（按全国图鉴编号）/简单版 | 全国图鉴列表，包含编号、中日英名称 |
| 招式 | 招式列表 | 按世代分组的招式表格 |
| 特性 | 特性列表 | 按世代分组的特性表格 |
| 道具 | 道具列表 | 按分类分组的道具表格 |

每个条目的详情数据通过列表页中的超链接跳转到对应的详情页获取。详情页 URL 的构造规则为 `https://wiki.52poke.com/wiki/{名称}（{类型后缀}）`，其中类型后缀为"招式"、"特性"或"道具"。宝可梦详情页直接使用中文名作为路径，不带后缀。

招式学习表（learnset）页面的 URL 格式为 `https://wiki.52poke.com/wiki/{宝可梦名}/第{X}世代招式表`，Champions 赛制使用 `{宝可梦名}/Champions招式表`。

### 请求行为规范

**User-Agent**：所有 HTTP 请求必须携带自定义 User-Agent 标识 `PokemonLocalDexCrawler/0.1 (local research cache; source https://wiki.52poke.com/)`，表明爬虫身份和用途。

**请求间隔**：两次网络请求之间必须保持至少 1 秒的间隔（`request_interval=1.0`），避免对 Wiki 服务器造成过大压力。这个间隔通过 `PageFetcher._rate_limit()` 方法强制执行。

**超时控制**：单次请求的超时时间默认为 30 秒。

**降级策略**：当 Python `requests` 库因 DNS 或网络问题请求失败时，爬虫会自动降级到系统 `curl` 命令重试。这是为了兼容某些 macOS 沙箱环境下 Python 的 DNS 解析问题。

**404 处理**：当页面返回 404 时，爬虫抛出 `PageNotFoundError` 异常。调用方根据上下文决定是跳过该条目还是终止采集。对于道具和招式学习表，404 通常意味着该条目不存在于 Wiki 中，应跳过并记录日志。

**缓存优先**：每次请求前先检查本地缓存（`data/raw/{cache_key}.json`），只有缓存不存在或显式指定 `--refresh-raw` 时才发起网络请求。缓存文件使用 JSON 格式存储，包含四个字段：`url`（原始 URL）、`title`（页面标题）、`fetchedAt`（ISO 8601 格式的抓取时间）、`html`（完整 HTML 内容）。

### 缓存文件命名规范

缓存文件的 key 遵循以下命名规则：

| 数据类型 | 缓存 key 格式 | 示例 |
|---------|-------------|------|
| 宝可梦列表 | `pokemon-list-simple` | `pokemon-list-simple.json` |
| 招式列表 | `move-list` | `move-list.json` |
| 特性列表 | `ability-list` | `ability-list.json` |
| 道具列表 | `item-list` | `item-list.json` |
| 宝可梦详情 | `pokemon-{dex_number:04d}` | `pokemon-0025.json` |
| 招式详情 | `move-{slugify(name_zh)}` | `move-十万伏特.json` |
| 特性详情 | `ability-{slugify(name_zh)}` | `ability-静电.json` |
| 道具详情 | `item-{slugify(name_zh)}` | `item-光之石.json` |
| 招式学习表 | `pokemon-{dex_number:04d}-learnset-gen{N}` | `pokemon-0025-learnset-gen9.json` |

`slugify()` 函数将文本进行 NFKC 标准化后，用连字符替换非字母数字和非中文字符，并转为小写。

### 文本处理规范

**繁简转换**：52Poké Wiki 的内容以繁体中文为主。爬虫使用 `opencc`（OpenCC）库的 `t2s` 配置将所有繁体中文文本转换为简体中文后再存入数据库。所有面向用户的文本字段（名称、描述、效果说明等）都必须经过 `to_simplified()` 处理。

**Unicode 标准化**：所有从 HTML 提取的文本都经过 NFKC 标准化（`unicodedata.normalize("NFKC", ...)`），将全角字符转为半角，统一字符编码。例如全角的"ＰＰ"会被标准化为半角"PP"。

**空白清理**：使用 `clean_inline_text()` 将连续空白字符压缩为单个空格，并去除首尾空白。使用 `clean_summary()` 对摘要文本进行额外清理：移除方括号标注（如 `[编辑]`）、截断"返回"链接文本、限制最大长度（默认 700 字符，效果详情 2000 字符）。

**HTML 标签清理**：使用 BeautifulSoup 解析 HTML 时，先移除 `<script>` 和 `<style>` 标签，再提取纯文本内容。

### 字段格式规范

#### 通用字段

| 字段 | 格式要求 | 示例 |
|------|---------|------|
| `slug` | NFKC 标准化 → 非字母数字非中文替换为连字符 → 小写 | `皮卡丘` → `皮卡丘`，`Mr. Mime` → `mr-mime` |
| `name_zh` | 简体中文，经 `to_simplified()` 处理 | `皮卡丘` |
| `name_ja` | 原始日文，不做转换 | `ピカチュウ` |
| `name_en` | 原始英文，不做转换 | `Pikachu` |
| `source_url` | 完整的 HTTPS URL | `https://wiki.52poke.com/wiki/皮卡丘` |
| `source_fetched_at` | ISO 8601 格式的 UTC 时间 | `2024-01-15T08:30:00+00:00` |

#### 宝可梦字段

| 字段 | 格式要求 | 说明 |
|------|---------|------|
| `dex_number` | 正整数 | 全国图鉴编号，从列表页 `#NNNN` 格式解析 |
| `primary_type` / `secondary_type` | 简体中文属性名 | 18 种标准属性之一：一般、火、水、电、草、冰、格斗、毒、地面、飞行、超能力、虫、岩石、幽灵、龙、恶、钢、妖精 |
| `category` | 简体中文 | 如"种子宝可梦"，从详情页"分类"字段提取 |
| `height_m` | 浮点数或 NULL | 身高（米），从文本中提取数字部分 |
| `weight_kg` | 浮点数或 NULL | 体重（千克），从文本中提取数字部分 |
| `introduced_generation` | 1-9 的整数 | 初登场世代，从世代可用性列表中取最小值 |

属性名称的繁简映射：電→电、飛行→飞行、蟲→虫、龍→龙、惡→恶、鋼→钢、格鬥→格斗、幽靈→幽灵。

#### 招式字段

| 字段 | 格式要求 | 说明 |
|------|---------|------|
| `number` | 正整数 | 招式编号，从列表页表格解析 |
| `type` | 简体中文属性名 | 同宝可梦属性名规范 |
| `category` | `物理` / `特殊` / `变化` | 招式分类，繁体"變化"统一转为"变化" |
| `power` | 正整数或 NULL | 威力，非数字值（如"—"）转为 NULL |
| `accuracy` | 正整数或 NULL | 命中率（不含百分号），非数字值转为 NULL |
| `pp` | 正整数或 NULL | PP 值，非数字值转为 NULL |
| `description` | 简体中文，≤700 字符 | 列表页的简短说明 |
| `effect_detail` | 简体中文或 NULL | 详情页"招式附加效果"章节的完整描述 |
| `introduced_generation` | 1-9 的整数 | 从列表页表格所在的世代标题推断 |

#### 特性字段

| 字段 | 格式要求 | 说明 |
|------|---------|------|
| `number` | 三位数整数 | 特性编号，从列表页表格"编号"列解析 |
| `description` | 简体中文 | 列表页"说明"列的文本 |
| `effect_detail` | 简体中文或 NULL | 详情页"特性效果 > 对战中"子章节的描述 |
| `introduced_generation` | 3-9 的整数 | 从列表页表格所在的世代推断（特性从第三世代引入） |

#### 道具字段

| 字段 | 格式要求 | 说明 |
|------|---------|------|
| `category` | 简体中文 | 道具分类，目前采集四类：携带物品、超级石、Z纯晶、树果 |
| `effect_summary` | 简体中文，≤700 字符 | 列表页"道具说明"列的文本 |
| `effect_detail` | 简体中文，≤2000 字符或 NULL | 详情页"效果"章节的描述；树果类道具只取"携带"子章节 |
| `introduced_generation` | 整数或 NULL | 从详情页"第X世代"文本推断 |
| `image_url` | 完整 HTTPS URL 或 NULL | 道具图标，优先选择 `Bag_` 开头的 Sprite 图片 |

#### 招式学习表字段

| 字段 | 格式要求 | 说明 |
|------|---------|------|
| `generation` | 1-9 或 99 | 世代编号，99 表示 Champions 赛制 |
| `form_key` | 字符串 | 形态标识，默认形态为 `default` |
| `learn_method` | 枚举字符串 | `level-up`（升级）、`tm`（招式学习器）、`egg`（遗传）、`tutor`（教授）、`pre-evolution`（进化前）、`form-change`（形态变化） |
| `level` | 正整数或 NULL | 仅 `level-up` 方式有值，"进化"/"—" 转为 NULL |
| `game_version_code` | 版本代码或 NULL | 如 `SV`、`BDSP`、`SWSH` 等，从页面 h4 标题推断 |
| `tm_number` | 字符串或 NULL | 招式学习器编号，如 `TM001`、`TR01` |

#### 世代变更记录字段

| 字段 | 格式要求 | 说明 |
|------|---------|------|
| `generation` | 1-9 的整数 | 变更发生的世代 |
| `game_version_code` | 版本代码或 NULL | 如 `SV`、`LA`、`BDSP`，仅特定版本变更时有值 |
| `description` | 简体中文，≤500 字符 | 变更内容描述 |

游戏版本代码的完整映射：RG（红绿蓝）、Y（皮卡丘/黄）、GS（金银）、C（水晶）、RS（红蓝宝石）、E（绿宝石）、FRLG（火红叶绿）、DP（钻石珍珠）、Pt（白金）、HGSS（心金魂银）、BW（黑白）、B2W2（黑2白2）、XY（XY）、ORAS（欧米伽红蓝宝石）、SM（太阳月亮）、USUM（究极之日月）、LPLE（Let's Go）、SWSH（剑盾）、BDSP（晶灿钻石明亮珍珠）、LA（传说阿尔宙斯）、SV（朱紫）、SVT（零之秘宝）、CHAMP（Champions）。

### 图片采集规范

**URL 标准化**：所有图片 URL 必须经过 `normalize_media_url()` 处理，将 Wiki 的缩略图 URL（包含 `/thumb/` 路径和尺寸后缀）还原为原始图片 URL。

**过滤规则**：只采集 png、jpg、jpeg、webp、gif、svg 格式的图片。排除网站通用图标（favicon、logo、spritecss、wiki.png、commons-logo、poweredby_mediawiki、blank.png）。

**宝可梦图片类型**：每个形态最多采集四种图片：`official`（官方立绘）、`shinyOfficial`（异色立绘）、`sprite`（像素图标）、`shinySprite`（异色像素图标）。图片通过文件名中的关键词匹配到对应类型。

**道具图片选择**：道具图片通过评分机制选择最佳匹配。优先选择文件名包含道具英文名或中文名的图片，`Bag_` 开头的 Sprite 图标加分，通用分类图标（`pocket_icon`）扣分。

### 数据质量规范

**去重**：所有列表解析结果都通过 `unique_by_key()` 函数去重。招式按中文名去重，特性按编号去重（编号重复时保留最后一条），道具按中文名去重，宝可梦按"编号|名称"组合去重。招式学习表在写入前通过 `_dedupe_learnset()` 去重。

**Upsert 语义**：数据库写入统一使用 upsert 模式——先查询是否存在（通过 slug、编号或中文名匹配），存在则 UPDATE，不存在则 INSERT。UPDATE 时使用 `COALESCE(?, existing_value)` 语法，确保新值为 NULL 时不覆盖已有数据。

**外键完整性**：招式学习表写入时，如果引用的招式不存在于 `moves` 表，会通过 `ensure_move()` 自动创建一条只有中文名的占位记录。特性关联写入时，如果引用的特性不存在，`ability_id` 字段设为 NULL，但 `ability_name_zh` 冗余字段保证数据不丢失。

**清除策略**：`--clean` 模式下，各子命令只清除自己负责的数据表。`all --clean` 会一次性清除所有表后再采集，子命令不再重复清除。清除操作遵循外键约束，先删除子表再删除主表。

**错误容忍**：道具采集和招式学习表采集对单条记录的失败采取跳过策略（记录日志后继续），不会因为个别页面的问题中断整个采集流程。宝可梦详情采集则要求每条记录都成功。

### 新增数据类型的开发规范

当需要采集新的数据类型时，应遵循以下步骤和约定：

**模块结构**：在 `packages/crawler_py/localdex_crawler/` 下创建新的解析模块（如 `nature.py`），定义 `Seed` 数据类（如 `NatureSeed`）和解析函数（如 `parse_nature_list_page()`、`normalize_nature_detail_page()`）。Seed 类使用 `@dataclass(frozen=True)` 定义，包含列表页可获取的基础字段和详情页 URL。

**CLI 集成**：在 `cli.py` 中注册新的子命令，添加对应的 `crawl_xxx()` 函数。新子命令应支持 `--refresh-raw`、`--dry-run`、`--clean` 三个通用标志。如果数据与宝可梦关联，还应支持宝可梦筛选参数。

**数据库写入**：在 `sqlite_upsert.py` 中添加 `upsert_xxx_detail()` 和 `clear_xxx()` 函数。写入函数必须使用 upsert 语义（存在则更新，不存在则插入），确保多次运行幂等。清除函数应先删除子表数据再删除主表数据，遵循外键约束。

## 新增数据类型检查清单

在添加新的数据采集类型时，按以下清单逐项确认：

1. 数据源页面是否稳定可用，URL 格式是否可预测
2. 列表页 Seed 类是否包含所有必要字段
3. 详情页解析函数是否处理了繁简体差异
4. 缓存 key 是否唯一且可读
5. 数据库表是否已在 schema 中创建
6. upsert 函数是否正确处理了新增和更新两种情况
7. clear 函数是否正确处理了外键级联删除
8. CLI 子命令是否支持所有通用标志
9. `--dry-run` 模式是否输出了足够的调试信息
10. 是否在 `all` 子命令中注册了新的采集步骤
