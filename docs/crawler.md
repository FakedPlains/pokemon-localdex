# 爬虫指南

## 概述

Pokemon LocalDex 的数据采集由一个 Python 爬虫完成，数据源为 [52Poké Wiki](https://wiki.52poke.com/)。爬虫从 Wiki 页面抓取 HTML，解析出结构化数据后写入 SQLite 数据库。

爬虫支持增量更新和全量重建两种模式，内置本地页面缓存以避免重复请求，并提供丰富的筛选参数用于只采集部分数据。

## 环境准备

爬虫需要 Python 3.10 或更高版本。安装依赖：

```bash
pip install -r packages/crawler_py/requirements.txt
```

主要依赖包括 `requests`（HTTP 请求）和 `beautifulsoup4`（HTML 解析）。

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
