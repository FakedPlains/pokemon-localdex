# 爬虫指南

## 概述

Pokemon LocalDex 的数据采集由一个 Python 爬虫完成，数据源为 [52Poké Wiki](https://wiki.52poke.com/)。爬虫从 Wiki 页面抓取 HTML，解析出结构化数据后写入 SQLite 数据库。

爬虫支持增量更新和全量重建两种模式，内置本地页面缓存以避免重复请求，并提供丰富的筛选参数用于只采集部分数据。

## 环境准备

爬虫需要 Python 3.10 或更高版本。安装依赖：

```bash
pip install -r packages/crawler_py/requirements.txt
```

主要依赖包括 `requests`（HTTP 请求）、`beautifulsoup4`（HTML 解析）和 `opencc`（繁简转换，作为补充处理）。

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
写入形态后，爬虫会自动刷新 `pokemon_forms.required_item_id`：先读取 Wiki 汇总页提取原始回归等显式绑定，再根据数据库中的 Mega 形态和道具命名规则推导进化石绑定。

```bash
npm run crawl:pokemon
# 或
python3 scripts/crawl-52poke-db.py pokemon
```

**form-items** — 手动刷新形态必需道具绑定。它和 `pokemon` 子命令自动执行的逻辑完全一致，用于单独修复 `pokemon_forms.required_item_id`。

```bash
python3 packages/crawler_py/crawl-52poke-db.py form-items --dry-run
python3 packages/crawler_py/crawl-52poke-db.py form-items
```

**pokemon-abilities** — 仅刷新宝可梦的特性关联数据。这个命令不会重新抓取详情页，而是从已缓存的页面中重新解析特性信息并更新数据库。适用于特性解析逻辑修改后的快速刷新。

```bash
python3 scripts/crawl-52poke-db.py pokemon-abilities
```

**learnsets** — 采集宝可梦的世代可学招式表。每只宝可梦的每个世代对应一个独立的 Wiki 页面，因此这是最耗时的采集任务。

```bash
python3 scripts/crawl-52poke-db.py learnsets
```

**champions** — 采集 Pokémon Champions 的赛季、赛制、赛制可用宝可梦和可用道具。赛季页提供赛季到赛制的映射，赛制页提供可用宝可梦和持有物规则，道具页用于定位 Champions 道具池；写库时只把主 `items` 表中已存在的对战道具关联到赛制。

```bash
npm run crawl:champions
# 或
python3 scripts/crawl-52poke-db.py champions
```

**catalog** — 采集招式、特性和道具的详情页。从各自的列表页获取条目，然后逐一抓取详情页解析完整数据。

```bash
npm run crawl:catalog
# 或
python3 scripts/crawl-52poke-db.py catalog
```

**all** — 依次执行 catalog、pokemon（包含 form-items 自动刷新）、learnsets、champions 四个子命令，完成全量采集。

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
| `--champions / --no-champions` | `all` 子命令中是否采集 Champions 数据（默认开启） |
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

## 模块结构

爬虫代码位于 `packages/crawler_py/localdex_crawler/`，按职责分为四层：

### 基础工具层（顶层模块）

| 文件 | 职责 |
|------|------|
| `constants.py` | 属性列表（`POKEMON_TYPES`）、版本信息（`GAME_VERSION_INFO`）、URL 常量、世代常量（`CHINESE_GENERATIONS`） |
| `text.py` | 文本处理：`to_simplified()`、`clean_inline_text()`、`slugify()`、`normalize_type_name()`、`unique_by_key()`、`format_accuracy()` |
| `urls.py` | URL 构建与规范化：`build_*_page_url()`、`normalize_media_url()`、`to_absolute_url()` |
| `images.py` | 图片资源提取：`ImageAsset`、`extract_image_candidates()`、`extract_file_name()` |
| `generations.py` | 世代解析：`generation_from_*()`、`detect_generation_marker()`、`extract_generation_changes()`、`extract_battle_effect()` |
| `form_type.py` | 形态类型推导：`_derive_form_type()`、`_derive_form_category()`、`_canonical_form_name_zh()`（读取 `form_name_rules.json`） |
| `form_name_resolver.py` | 形态英文名推导：`resolve_form_name_en()`（读取 `form_name_rules.json`） |
| `form_items.py` | 形态绑定道具：`extract_all_form_item_bindings()`、`apply_form_item_bindings()` |
| `fetcher.py` | 缓存优先的 HTTP 获取：`PageFetcher`、`RawPage`、`PageNotFoundError` |
| `config.py` | 路径配置：`CrawlerPaths`（db_path、raw_dir） |

这一层是纯函数（`fetcher.py` 除外），不含数据库写入逻辑。`form_type.py` 和 `form_name_resolver.py` 在模块加载时各读取一次 `form_name_rules.json`。

### 解析层（`parsers/` 目录）

每个 parser 只负责将 `RawPage` 的 HTML 转换为结构化 Python dict，不写数据库。

| 文件 | 主要导出 | 说明 |
|------|---------|------|
| `pokemon_detail.py` | `parse_pokemon_list_page()`、`normalize_pokemon_detail_page()` | 宝可梦列表与详情解析 |
| `learnset.py` | `parse_learnset_page()` | 招式学习表解析 |
| `evolution.py` | `parse_evolution_chain()` | 进化链解析 |
| `pokemon_images.py` | `resolve_pokemon_image_assets()` | 宝可梦图片匹配 |
| `pokemon_abilities.py` | `parse_pokemon_abilities()` | 宝可梦特性解析 |
| `moves.py` | `parse_move_list_page()`、`normalize_move_detail_page()` | 招式列表与详情解析 |
| `abilities.py` | `parse_ability_list_page()`、`normalize_ability_detail_page()` | 特性列表与详情解析 |
| `items.py` | `parse_item_list_page()`、`normalize_item_detail_page()` | 道具列表与详情解析 |
| `champions.py` | `normalize_champions_pages()` | Champions 赛制/赛季/道具整合解析 |
| `field_effects.py` | `ALL_FIELD_EFFECT_SEEDS`、`normalize_field_effect_detail_page()` | 场地效果种子定义与详情解析 |

### 写库层（`upsert/` 目录）

只接收结构化 dict 写入 SQLite，不做 HTML 解析。

| 文件 | 主要导出 | 说明 |
|------|---------|------|
| `base.py` | `connect()`、`_lookup_*`、`_safe_count()` | 数据库连接与公共查找函数 |
| `clear.py` | `clear_moves()`、`clear_abilities()`、`clear_items()`、`clear_pokemon()`、`clear_champions()`、`clear_field_effects()`、`clear_all()` | DROP + CREATE 重建各表 |
| `pokemon.py` | `upsert_pokemon_detail()`、`upsert_evolution_chains()`、`generate_form_change_chains()`、`select_pokemon()` | 宝可梦主表/形态/子表/进化链 |
| `catalog.py` | `ensure_move()`、`upsert_move_detail()`、`upsert_ability_detail()`、`upsert_item_detail()` | 招式/特性/道具 upsert |
| `learnset.py` | `upsert_pokemon_moves()`、`_resolve_learnset_form_id()` | 招式学习表写入，形态解析（被 champions 复用） |
| `champions.py` | `upsert_champions_data()` | Champions 赛制/赛季/可用宝可梦/道具写入 |
| `field_effects.py` | `upsert_field_effect_detail()` | 场地效果写入 |

### CLI 调度层

`cli.py` 是唯一的入口文件，将 fetcher → parser → upsert 串联成管道。各子命令定义在此文件中。

## 模块依赖关系

```text
cli.py (调度层)
├── config.py
├── fetcher.py
├── form_items.py ─── text.py, upsert/base.py, fetcher.py
│
├── parsers/
│    ├── pokemon_detail.py ─── pokemon_abilities.py, pokemon_images.py,
│    │                         generations.py, text.py, urls.py
│    ├── learnset.py ────────── fetcher.py, text.py
│    ├── evolution.py ──────── text.py
│    ├── moves.py ─────────── fetcher, constants, generations, images, text, urls
│    ├── abilities.py ─────── fetcher, constants, generations, images, text, urls
│    ├── items.py ─────────── fetcher, constants, generations, images, text, urls
│    ├── champions.py ─────── fetcher, text, urls
│    └── field_effects.py ─── fetcher, generations, text
│
└── upsert/
     ├── base.py ─────────── (无包内依赖)
     ├── clear.py ────────── base.py
     ├── pokemon.py ──────── base.py, form_type.py, form_name_resolver.py, text.py
     ├── catalog.py ──────── base.py, text.py
     ├── learnset.py ─────── base.py, catalog.py, form_type.py
     ├── champions.py ────── base.py, learnset.py, form_type.py
     └── field_effects.py ── base.py
```

基础工具层内部链条：`images.py` → `urls.py` → `generations.py` → `constants.py` / `text.py`

## 层间调用规则

| 规则 | 说明 |
|------|------|
| Parser 不写库 | `parsers/` 只做 HTML → dict 转换，绝不调用 `upsert/` |
| Upsert 不解析 HTML | `upsert/` 只接收结构化 dict，不 import BeautifulSoup |
| Fetcher 是网络唯一入口 | 所有 HTTP 请求必须通过 `PageFetcher.load_or_fetch()`，本地缓存优先 |
| 基础工具层无 I/O | `constants`/`text`/`urls`/`images`/`generations`/`form_type` 是纯函数 |
| CLI 是唯一调度者 | `cli.py` 组装管道，parser 和 upsert 不直接互调 |
| Upsert 层内可横向复用 | 如 `learnset._resolve_learnset_form_id()` 被 `champions.py` 直接导入复用 |

## 运行流程

### `crawl all` 全量采集顺序

```text
items → abilities → moves → catalog → pokemon → learnsets → evolution → champions → field-effects → form-items
```

### `crawl pokemon`（宝可梦详情）

```text
cli.py: crawl_pokemon()
  ├─ upsert/base.connect()                      → 打开 SQLite
  ├─ upsert/pokemon.select_pokemon()            → 从 DB 取待爬列表
  └─ 循环每条 PokemonRow：
       ├─ fetcher.load_or_fetch(url)             → RawPage
       ├─ parsers/pokemon_detail.normalize_*()   → payload dict
       │    ├── parsers/pokemon_abilities.parse_*()
       │    ├── parsers/pokemon_images.resolve_*()
       │    └── generations.extract_generation_changes()
       └─ upsert/pokemon.upsert_pokemon_detail()
            ├── INSERT/UPDATE pokemon 主表
            └── _upsert_pokemon_forms()
                 ├── form_type._derive_form_type()
                 ├── form_type._derive_form_category()
                 ├── form_name_resolver.resolve_form_name_en()
                 └── INSERT pokemon_forms / stats / types / abilities / images
```

### `crawl learnsets`（招式学习表）

```text
cli.py: crawl_learnsets()
  ├─ upsert/pokemon.select_pokemon()
  └─ 循环 PokemonRow × 目标世代：
       ├─ fetcher.load_or_fetch(learnset_url)
       ├─ parsers/learnset.parse_learnset_page() → {form: [moves]}
       └─ upsert/learnset.upsert_pokemon_moves()
            ├── _resolve_learnset_form_id() (多级模糊匹配)
            ├── 去重：形态与默认形态完全一致时跳过
            └── upsert/catalog.ensure_move() + INSERT pokemon_moves
```

### `crawl moves` / `abilities` / `items`

```text
cli.py: crawl_moves() / crawl_abilities() / crawl_items()
  ├─ 可选 clear_*()                             → DROP + CREATE 重建
  ├─ parsers/*.parse_*_list_page()               → [{name_zh, url}]
  └─ 循环每条：
       ├─ parsers/*.normalize_*_detail_page()    → payload
       │    └── generations.extract_generation_changes()
       └─ upsert/catalog.upsert_*_detail()
            └── INSERT/UPDATE + generation_records
```

### `crawl evolution`（进化链）

```text
cli.py: crawl_evolution()
  ├─ upsert/pokemon.select_pokemon()
  └─ 循环每条 PokemonRow：
       ├─ fetcher.load_or_fetch(pokemon_url)
       ├─ parsers/evolution.parse_evolution_chain() → [step dict]
       └─ upsert/pokemon.upsert_evolution_chains()
            └── _lookup_form_id_by_name() (5 级匹配策略)
  └─ 可选：generate_form_change_chains()
       → 从 pokemon_forms 推导超级进化/极巨化形态变化链
```

### `crawl champions`（冠军赛制）

```text
cli.py: crawl_champions()
  ├─ parsers/champions.normalize_champions_pages(fetcher) → 整合 payload
  └─ upsert/champions.upsert_champions_data()
       ├── _upsert_champions_regulation()
       ├── _replace_champions_regulation_pokemon()
       │    └── _resolve_learnset_form_id() (复用 learnset 的形态解析)
       ├── INSERT champions_regulation_items
       └── _upsert_champions_season()
```

### `crawl field-effects`（场地效果）

```text
cli.py: crawl_field_effects()
  ├─ 遍历 parsers/field_effects.ALL_FIELD_EFFECT_SEEDS (静态种子)
  └─ 循环每个 seed：
       ├─ fetcher.load_or_fetch(seed.url)
       ├─ parsers/field_effects.normalize_*() → payload
       │    └── generations.extract_battle_effect()
       └─ upsert/field_effects.upsert_field_effect_detail()
```

### `crawl form-items`（形态绑定道具）

```text
cli.py: crawl_form_items()
  ├─ form_items.extract_all_form_item_bindings(fetcher) → bindings
  └─ form_items.apply_form_item_bindings(conn, bindings)
       └── UPDATE pokemon_forms SET required_item_id = ?
```

## 形态图片匹配

爬虫在采集宝可梦图片时，需要将不同形态匹配到正确的图片文件。52Poké Wiki 的图片命名规则是在基础文件名后添加后缀，例如 `HOME_1024.png`（普通形态）、`HOME_1024M.png`（超级进化）、`HOME_1024T.png`（太晶形态）。

爬虫通过 `_form_hints()` 函数为每个形态生成匹配提示词（hints）和排除词（anti_hints）。例如太乐巴戈斯的太晶形态会生成 hints=`["t", "terastal"]` 和 anti_hints=`["s", "stellar"]`，确保它匹配到 `HOME_1024T.png` 而不是 `HOME_1024S.png`。

如果某个形态的图片匹配不正确，通常需要在 `_form_hints()` 函数中为该形态添加正确的提示词。

## 形态英文名映射

爬虫写入 `pokemon_forms` 时会同步填充 `name_en`。默认形态会规范化为对战计算库可识别的 canonical 物种名；非默认形态会根据中文形态名、物种英文名和 `packages/crawler_py/localdex_crawler/form_name_rules.json` 中的规则推导，例如 `伽勒尔达摩狒狒（达摩模式）` → `Darmanitan-Galar-Zen`。

`scripts/fill-form-names.mjs` 是历史数据回填和校准工具，也读取同一份 `form_name_rules.json`。新增或修正形态英文名映射时，只维护这份规则文件，避免爬虫写库逻辑和回填脚本产生差异。

### formTypeKeywords 规则

`form_name_rules.json` 中的 `formTypeKeywords` 字段定义了从中文形态名推导 `form_type` 的关键词映射。该规则被 Python 爬虫（`_derive_form_type()`）和 JS 端（`scripts/fill-form-names.mjs` 的 `deriveFormType()`）共享。规则结构如下：

- `megaPatterns`：匹配超级进化形态，推导为 `mega`、`mega-x`、`mega-y`
- `gmaxPatterns`：匹配超极巨化形态，推导为 `gmax`
- `keywordMap`：关键词到 formType 的直接映射（如 `"阿罗拉"` → `"alola"`）

修改 `formTypeKeywords` 时必须同时验证 Python 和 JS 两端的行为一致性。

### name_en 保护机制

`_upsert_pokemon_forms` 对 `name_en` 字段实施保护：当数据库中已存在非空的 `name_en` 值，而本次 upsert 的 payload 中 `name_en` 为空或 None 时，保留数据库现有值不覆盖。这防止了因 `form_name_rules.json` 规则不完整而意外清空已由人工校准或历史回填得到的英文名。

具体实现：`_upsert_pokemon_forms` 在构建数据库现有记录的查找映射时，同时以 `form_type` 和 `display_name_zh` 为 key 建立双重索引，确保无论 payload 使用哪种标识都能正确匹配到已有记录。当匹配到已有记录且其 `name_en` 非空时，如果新 payload 的 `name_en` 为空，则自动回填为数据库现有值。

---

## 数据采集规范

以下规范定义了爬虫在数据采集过程中必须遵守的约定，包括数据源、请求行为、文本处理、字段格式和数据质量要求。新增或修改爬虫逻辑时应严格遵循这些规范。

### 数据源约定

爬虫唯一的数据源是 [52Poké Wiki](https://wiki.52poke.com/)（神奇宝贝百科）。所有数据均从该站点的 HTML 页面中解析获取，不使用任何第三方 API 或其他数据源。

采集入口页面包括：

| 数据类型 | 入口页面 | 说明 |
|---------|---------|------|
| 宝可梦 | 宝可梦列表（按全国图鉴编号）/简单版 | 全国图鉴列表，包含编号、中日英名称 |
| 招式 | 招式列表 | 按世代分组的招式表格 |
| 特性 | 特性列表 | 按世代分组的特性表格 |
| 道具 | 道具列表 | 按分类分组的道具表格 |
| Champions 赛季 | 赛季（Champions） | 赛季、举办日期、赛制映射 |
| Champions 赛制 | 赛制（Champions） | 赛制期间、特殊要素、持有物规则、可用宝可梦 |
| Champions 道具 | 道具列表（Champions） | Champions 中的树果、对战影响道具、属性增强道具、超级石和票券 |

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
| Champions 赛季 | `champions-seasons` | `champions-seasons.json` |
| Champions 赛制 | `champions-regulations` | `champions-regulations.json` |
| Champions 道具 | `champions-items` | `champions-items.json` |

`slugify()` 函数将文本进行 NFKC 标准化后，用连字符替换非字母数字和非中文字符，并转为小写。

### 文本处理规范

**简体中文优先**：爬虫在发起请求时会自动为 52Poké Wiki 的 URL 追加 `variant=zh-hans` 参数（通过 `PageFetcher._ensure_zh_hans()` 方法），这样 Wiki 服务器会直接返回简体中文版本的页面内容，包括正确的简体译名（如“深渊突刺”而非“地狱突刺”）。这避免了仅依赖 OpenCC `t2s` 字符级转换时无法处理语义级译名差异的问题。

**补充繁简转换**：尽管请求时已指定简体变体，爬虫仍保留 `opencc` 的 `t2s` 转换作为安全网。所有面向用户的文本字段（名称、描述、效果说明等）仍经过 `to_simplified()` 处理，确保即使 Wiki 返回了残留繁体字符也能被正确转换。

**Unicode 标准化**：所有从 HTML 提取的文本都经过 NFKC 标准化（`unicodedata.normalize("NFKC", ...)`），将全角字符转为半角，统一字符编码。例如全角的"ＰＰ"会被标准化为半角"PP"。

**空白清理**：使用 `clean_inline_text()` 将连续空白字符压缩为单个空格，并去除首尾空白。使用 `clean_summary()` 对摘要文本进行额外清理：移除方括号标注（如 `[编辑]`）、截断"返回"链接文本、限制最大长度（默认 700 字符，效果详情 2000 字符）。

**HTML 标签清理**：使用 BeautifulSoup 解析 HTML 时，先移除 `<script>` 和 `<style>` 标签，再提取纯文本内容。

### 字段格式规范

#### 通用字段

| 字段 | 格式要求 | 示例 |
|------|---------|------|
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
| `form_id` | 整数 | 对应 `pokemon_forms.id`；解析页中的中文形态标签会先映射到具体形态 |
| `learn_method` | 枚举字符串 | `level-up`（升级）、`tm`（招式学习器）、`egg`（遗传）、`tutor`（教授）、`pre-evolution`（进化前）、`form-change`（形态变化） |
| `level` | 正整数或 NULL | 仅 `level-up` 方式有值，"进化"/"—" 转为 NULL |
| `game_version_code` | 版本代码或 NULL | 如 `SV`、`BDSP`、`SWSH` 等，从页面 h4 标题推断 |
| `tm_number` | 字符串或 NULL | 招式学习器编号，如 `TM001`、`TR01` |

招式学习数据写入 `pokemon_moves`。如果非默认形态解析出的招式集合与默认形态完全一致，爬虫只保留默认形态记录，查询层负责对该形态回退。

#### Champions 字段

| 字段 | 格式要求 | 说明 |
|------|---------|------|
| `season_code` | 字符串 | 赛季编号，如 `M-1` |
| `regulation_code` | 字符串 | 赛制编号，如 `M-A` |
| `period_text` | 简体中文原文 | Wiki 页面中的举办期间原文 |
| `start_at` / `end_at` | `YYYY-MM-DD` 或 `YYYY-MM-DDTHH:mm` | 从期间文本解析出的起止时间；无时间时只存日期 |
| `msp_code` | 字符串 | 52Poké `data-msp` 中的形态代码，如 `0006MX` |
| `dex_number` | 整数或 NULL | 从 `msp_code` 前四位解析出的全国图鉴编号 |
| `form_code` | 字符串或 NULL | `msp_code` 的形态后缀，用于解析 `pokemon_forms.form_id` |
| `item_id` | 整数 | `champions_regulation_items` 直接关联主 `items.id`；Champions 专用道具或票券不写入 |

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

**Upsert 语义**：数据库写入统一使用 upsert 模式——先查询是否存在（通过编号或中文名匹配），存在则 UPDATE，不存在则 INSERT。UPDATE 时使用 `COALESCE(?, existing_value)` 语法，确保新值为 NULL 时不覆盖已有数据。

**外键完整性**：招式学习表写入时，如果引用的招式不存在于 `moves` 表，会通过 `ensure_move()` 自动创建一条只有中文名的占位记录。特性关联写入时，如果引用的特性不存在，`ability_id` 字段设为 NULL，但 `ability_name_zh` 冗余字段保证数据不丢失。

**清除策略**：`--clean` 模式下，各子命令只清除自己负责的数据表。`all --clean` 会一次性清除所有表后再采集，子命令不再重复清除。清除操作遵循外键约束，先删除子表再删除主表。

**错误容忍**：道具采集和招式学习表采集对单条记录的失败采取跳过策略（记录日志后继续），不会因为个别页面的问题中断整个采集流程。宝可梦详情采集则要求每条记录都成功。

### 新增数据类型的开发规范

当需要采集新的数据类型时，应遵循以下步骤和约定：

**解析模块**：在 `parsers/` 下创建新文件（如 `parsers/natures.py`），定义 `Seed` 数据类（如 `NatureSeed`）和解析函数（如 `parse_nature_list_page()`、`normalize_nature_detail_page()`）。Seed 类使用 `@dataclass(frozen=True)` 定义，包含列表页可获取的基础字段和详情页 URL。解析模块只负责 HTML → dict 转换，不做数据库写入。

**写库模块**：在 `upsert/` 下创建新文件（如 `upsert/natures.py`），添加 `upsert_xxx_detail()` 函数。在 `upsert/clear.py` 中添加对应的 `clear_xxx()` 函数。写入函数必须使用 upsert 语义（存在则更新，不存在则插入），确保多次运行幂等。清除函数使用 DROP + CREATE 重建模式。

**CLI 集成**：在 `cli.py` 中注册新的子命令，添加对应的 `crawl_xxx()` 函数。新子命令应支持 `--refresh-raw`、`--dry-run`、`--clean` 三个通用标志。如果数据与宝可梦关联，还应支持宝可梦筛选参数。CLI 负责组装 fetcher → parser → upsert 管道。

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
