# 系统架构

## 设计目标

Pokemon LocalDex 的架构围绕三个核心目标展开：数据必须完全来自 52Poké Wiki；数据要能本地离线使用；查询、队伍构筑、伤害计算必须在多个端上共用一套核心逻辑。

## 整体架构

项目采用 **Python 爬虫 → SQLite 存储 → Hono API → React SPA** 的四层结构，各层职责清晰、单向依赖。

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  采集层      │     │  存储层       │     │  API 层       │     │  展示层       │
│  crawler_py  │────▶│  SQLite DB   │◀────│  Hono API    │◀────│  React SPA   │
│  (Python)    │     │  (sqlite-    │     │  (apps/api)  │     │  (apps/web)  │
│              │     │   store)     │     │              │     │              │
└─────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

## 目录结构

```
pokemon-localdex/
├── apps/
│   ├── api/          Hono API 服务（托管 SPA 静态资源）
│   └── web/          React SPA 客户端（Vite 构建）
├── packages/
│   ├── battle-core/  伤害计算与队伍规则核心
│   ├── crawler_py/   Python 爬虫（52Poké 数据采集 → SQLite）
│   └── sqlite-store/ SQLite 建表、查询适配与类型定义
├── scripts/
│   ├── crawl-52poke-db.py   爬虫入口脚本
│   └── fetch_type_icons.py  属性图标采集脚本
├── data/
│   ├── raw/          原始抓取页面缓存（gitignored）
│   ├── sqlite/       本地 SQLite 数据库
│   └── type-icons/   属性和分类图标资源
└── docs/             技术文档
```

## 分层详解

### 采集层（crawler_py）

采集层是一个独立的 Python 包，负责从 52Poké Wiki 抓取页面、解析 HTML 并将结构化数据写入 SQLite。

核心职责包括：抓取 52Poké 页面并缓存原始 HTML 到 `data/raw/`，便于追溯和断点续跑；解析页面提取结构化数据，繁体中文自动转换为简体；通过 upsert 语义写入 SQLite，支持增量更新和全量重建（`--clean`）两种模式。

采集层的模块划分如下：`cli.py` 提供命令行入口和参数解析；`fetcher.py` 负责 HTTP 请求和本地缓存管理；`pokemon.py` 处理宝可梦列表和详情页的解析；`catalog.py` 处理招式、特性、道具的列表和详情页解析；`html_tools.py` 提供通用的 HTML 解析工具函数；`sqlite_upsert.py` 封装所有数据库写入操作；`config.py` 管理路径配置；`utils.py` 提供 URL 构建和文本处理工具。

### 存储层（sqlite-store）

存储层是一个 TypeScript 包，定义了 SQLite schema、类型和查询适配函数，供 API 层使用。

核心职责包括：定义所有数据类型（`StatBlock`、`PokemonFormEntry`、`BattleTeam` 等）；提供查询函数（`listPokemonFromSqlite`、`getPokemonFromSqlite` 等），支持按数字 ID、slug 和中文名多种方式查询；处理形态数据的聚合，将数据库中的扁平行组装为嵌套的形态结构（包含 `statVariants`、`typeVariants`、`abilityVariants`）。

项目使用 Node.js 22 的实验性 `node:sqlite` 模块，无需额外的 SQLite 绑定依赖。

### API 层（apps/api）

API 层基于 Hono 框架，提供统一的 RESTful 查询入口。

核心职责包括：提供宝可梦、招式、特性、道具的 CRUD 接口；提供队伍保存和伤害计算接口；在生产模式下同时托管 React SPA 的静态资源。

API 同时挂载在根路径 `/` 和 `/api` 前缀下：Vite 开发模式下前端通过 proxy 把 `/api/xxx` 转发为 `/xxx`；生产模式下由 API 服务器直接提供静态文件，前端请求 `/api/xxx` 直接匹配。

### 展示层（apps/web）

展示层是一个 React SPA，由 Vite 构建，通过 API 获取数据。

当前包含六个页面：图鉴页（PokedexPage）提供宝可梦列表搜索和详情展示；招式页（MovesPage）提供招式列表和世代差异查看；特性页（AbilitiesPage）提供特性列表和世代差异查看；道具页（ItemsPage）提供道具列表和详情；队伍页（TeamsPage）提供 6 槽队伍编辑器；伤害页（DamagePage）提供独立的伤害计算器。

前端采用"形态优先"的数据模型：`resolvePokemonDisplayVariant()` 函数根据当前选中的形态和世代，从 API 返回的嵌套数据中解析出正确的属性、种族值、特性和图片，是整个展示层的核心数据转换逻辑。

### 核心库（battle-core）

battle-core 是一个纯 TypeScript 库，实现伤害计算公式。当前实现了基础伤害公式（含本系加成、属性克制、天气、急所、乱数范围），后续将扩展道具和特性对伤害的影响。

## 数据流

整个系统的数据流是单向的：

1. **采集**：Python 爬虫从 52Poké Wiki 抓取 HTML 页面，缓存到 `data/raw/`
2. **解析**：爬虫解析 HTML，提取结构化数据
3. **存储**：解析结果通过 upsert 写入 `data/sqlite/localdex.sqlite`
4. **查询**：Hono API 通过 sqlite-store 读取数据库，返回 JSON
5. **展示**：React SPA 调用 API，渲染界面

队伍数据是唯一的例外，它保存在 `data/teams.json` 文件中，通过 API 的 POST 接口写入。

## 数据存储

- **主数据库**：`data/sqlite/localdex.sqlite`，存储所有宝可梦、招式、特性、道具数据
- **队伍数据**：`data/teams.json`，存储用户保存的队伍
- **页面缓存**：`data/raw/`，存储爬虫抓取的原始 HTML（gitignored）
