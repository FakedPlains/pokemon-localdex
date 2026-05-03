# 系统架构

## 设计目标

Pokemon LocalDex 的架构围绕四个核心目标展开：数据必须完全来自 52Poké Wiki；数据要能本地离线使用；查询、队伍构筑、伤害计算必须在多个端上共用一套核心逻辑；项目可以零后端部署到 GitHub Pages 等静态托管平台。

## 整体架构

项目支持两种运行模式，通过环境变量切换。

**本地模式**采用 Python 爬虫 → SQLite 存储 → Hono API → React SPA 的四层结构：

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  采集层      │     │  存储层       │     │  API 层       │     │  展示层       │
│  crawler_py  │────▶│  SQLite DB   │◀────│  Hono API    │◀────│  React SPA   │
│  (Python)    │     │  (sqlite-    │     │  (apps/api)  │     │  (apps/web)  │
│              │     │   store)     │     │              │     │              │
└─────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

**在线模式**（GitHub Pages 部署）前端直连 Supabase，跳过 API 层：

```
┌──────────────┐     ┌──────────────┐
│  展示层       │     │  云端存储     │
│  React SPA   │────▶│  Supabase    │
│  (apps/web)  │     │  (PostgreSQL)│
│              │     │              │
└──────────────┘     └──────────────┘
```

后端 API 也支持 Supabase 作为数据源（设置 `DATA_SOURCE=supabase`），此时链路为 React SPA → Hono API → supabase-store → Supabase。

## 目录结构

```
pokemon-localdex/
├── apps/
│   ├── api/              Hono API 服务（托管 SPA 静态资源）
│   └── web/              React SPA 客户端（Vite 构建）
│       ├── .env          本地开发环境变量（VITE_DATA_SOURCE 留空）
│       └── .env.production  生产构建模板（凭证由 CI Secrets 注入）
├── packages/
│   ├── battle-core/      伤害计算与队伍规则核心
│   ├── crawler_py/       Python 爬虫（52Poké 数据采集 → SQLite）
│   ├── sqlite-store/     SQLite 建表、查询适配与类型定义
│   └── supabase-store/   Supabase 查询适配（与 sqlite-store 同接口）
├── supabase/
│   └── schema.sql        Supabase 数据库 schema（与 SQLite 表结构对应）
├── scripts/
│   ├── crawl-52poke-db.py    爬虫入口脚本
│   └── fetch_type_icons.py   属性图标采集脚本
├── data/
│   ├── raw/              原始抓取页面缓存（gitignored）
│   └── sqlite/           本地 SQLite 数据库
├── .github/
│   └── workflows/
│       └── deploy-pages.yml  GitHub Pages 自动部署工作流
├── .npmrc                npm registry 配置（指向公共 registry）
└── docs/                 技术文档
```

## 分层详解

### 采集层（crawler_py）

采集层是一个独立的 Python 包，负责从 52Poké Wiki 抓取页面、解析 HTML 并将结构化数据写入 SQLite。

核心职责包括：抓取 52Poké 页面并缓存原始 HTML 到 `data/raw/`，便于追溯和断点续跑；解析页面提取结构化数据，繁体中文自动转换为简体；通过 upsert 语义写入 SQLite，支持增量更新和全量重建（`--clean`）两种模式。

采集层的模块划分如下：`cli.py` 提供命令行入口和参数解析；`fetcher.py` 负责 HTTP 请求和本地缓存管理；`pokemon.py` 处理宝可梦列表和详情页的解析；`catalog.py` 处理招式、特性、道具的列表和详情页解析；`html_tools.py` 提供通用的 HTML 解析工具函数；`sqlite_upsert.py` 封装所有数据库写入操作；`config.py` 管理路径配置；`utils.py` 提供 URL 构建和文本处理工具。

### 存储层

存储层提供两个可互换的数据访问包，对外暴露相同的函数签名（`listPokemonFromXxx`、`getPokemonFromXxx` 等），API 层通过环境变量动态选择。

**sqlite-store** 是一个 TypeScript 包，定义了 SQLite schema、类型和查询适配函数。核心职责包括：定义所有数据类型（`StatBlock`、`PokemonFormEntry`、`BattleTeam` 等）；提供查询函数，支持按数字 ID、slug 和中文名多种方式查询；处理形态数据的聚合，将数据库中的扁平行组装为嵌套的形态结构（包含 `statVariants`、`typeVariants`、`abilityVariants`）。项目使用 Node.js 22 的实验性 `node:sqlite` 模块，无需额外的 SQLite 绑定依赖。

**supabase-store** 是一个 TypeScript 包，通过 `@supabase/supabase-js` 客户端访问 Supabase（PostgreSQL）。它与 sqlite-store 导出相同的类型和函数签名，但底层使用 Supabase REST API 查询。Supabase 的表结构与 SQLite 完全对应（schema 定义在 `supabase/schema.sql`），数据通过 SQLite 导出后导入 Supabase。

### API 层（apps/api）

API 层基于 Hono 框架，提供统一的 RESTful 查询入口。启动时根据 `DATA_SOURCE` 环境变量（默认 `sqlite`）动态导入对应的存储层包。

核心职责包括：提供宝可梦、招式、特性、道具的查询接口（支持分页）；提供队伍保存和伤害计算接口；在生产模式下同时托管 React SPA 的静态资源。

API 同时挂载在根路径 `/` 和 `/api` 前缀下：Vite 开发模式下前端通过 proxy 把 `/api/xxx` 转发为 `/xxx`；生产模式下由 API 服务器直接提供静态文件，前端请求 `/api/xxx` 直接匹配。

### 展示层（apps/web）

展示层是一个 React SPA，由 Vite 构建。前端通过 `VITE_DATA_SOURCE` 环境变量决定数据获取方式。

当 `VITE_DATA_SOURCE` 为空或 `api` 时，所有请求通过 `fetch("/api/...")` 发送到 Hono API。当 `VITE_DATA_SOURCE=supabase` 时，前端通过 `supabaseApi.js` 中的函数直接查询 Supabase，GET 请求完全绕过后端。这一切换逻辑封装在 `api.js` 的 `unifiedApi()` 函数中，上层组件和 hook 无需感知数据源差异。

Supabase 直连模式下的降级处理：队伍数据保存在浏览器 localStorage 中；伤害计算功能不可用（计算逻辑在后端 battle-core 中执行）。

当前包含六个页面：图鉴页（PokedexPage）提供宝可梦列表搜索和详情展示；招式页（MovesPage）提供招式列表和世代差异查看；特性页（AbilitiesPage）提供特性列表和世代差异查看；道具页（ItemsPage）提供道具列表和详情；队伍页（TeamsPage）提供 6 槽队伍编辑器；伤害页（DamagePage）提供独立的伤害计算器。

前端采用"形态优先"的数据模型：`resolvePokemonDisplayVariant()` 函数根据当前选中的形态和世代，从 API 返回的嵌套数据中解析出正确的属性、种族值、特性和图片，是整个展示层的核心数据转换逻辑。

### 核心库（battle-core）

battle-core 是一个纯 TypeScript 库，实现伤害计算公式。当前实现了基础伤害公式（含本系加成、属性克制、天气、急所、乱数范围），后续将扩展道具和特性对伤害的影响。

## 数据流

### 本地模式

1. **采集**：Python 爬虫从 52Poké Wiki 抓取 HTML 页面，缓存到 `data/raw/`
2. **解析**：爬虫解析 HTML，提取结构化数据
3. **存储**：解析结果通过 upsert 写入 `data/sqlite/localdex.sqlite`
4. **查询**：Hono API 通过 sqlite-store 读取数据库，返回 JSON
5. **展示**：React SPA 调用 API，渲染界面

### 在线模式（GitHub Pages）

1. **数据同步**：SQLite 数据导出为 SQL，导入 Supabase（PostgreSQL）
2. **查询**：React SPA 通过 `@supabase/supabase-js` 直连 Supabase
3. **展示**：SPA 渲染界面，无需后端服务

队伍数据在本地模式下保存在 `data/teams.json` 文件中，通过 API 的 POST 接口写入；在线模式下保存在浏览器 localStorage 中。

## 部署架构

### GitHub Pages 部署

GitHub Actions 工作流（`.github/workflows/deploy-pages.yml`）在每次推送到 `main` 分支时自动触发：

1. 安装依赖（删除 lockfile 后重新 `npm install`，以解析正确平台的 native binding）
2. 执行 `npm run build:web`，Supabase 凭证通过 GitHub Repository Secrets 注入为环境变量
3. 环境变量 `GITHUB_PAGES=true` 使 Vite `base` 设为 `/pokemon-localdex/`
4. 构建产物通过 `peaceiris/actions-gh-pages` 推送到 `gh-pages` 分支
5. GitHub Pages 从 `gh-pages` 分支提供静态文件服务

前端使用 hash 路由（`#/pokedex`、`#/items` 等），因此不需要 404.html 回退配置。

### 凭证管理

Supabase 凭证不存储在代码仓库中，而是通过 GitHub Repository Secrets 在 CI 构建时注入。需要配置的 Secret：`VITE_SUPABASE_URL`（项目 URL）和 `VITE_SUPABASE_ANON_KEY`（anon/public key）。CI 中通过 `env:` 将 Secret 注入为系统环境变量，Vite 构建时系统环境变量优先级高于 `.env.production` 文件，因此会覆盖文件中的空占位符。

### 环境变量文件

| 文件 | 用途 | 关键配置 |
|------|------|----------|
| `apps/web/.env` | 本地开发 | `VITE_DATA_SOURCE=`（空，走 API） |
| `apps/web/.env.production` | 生产构建模板 | `VITE_DATA_SOURCE=supabase`，凭证留空由 CI 注入 |
| `apps/web/.env.example` | 前端配置模板 | 所有可用变量的说明和占位符 |
| `apps/api/.env.example` | API 配置模板 | `DATA_SOURCE=sqlite` |

`.env` 和 `.env.*` 被 `.gitignore` 排除，但 `.env.production` 和 `.env.example` 例外。`.env.production` 中只包含空占位符，真实凭证通过 CI Secrets 注入。

## 数据存储

- **主数据库**：`data/sqlite/localdex.sqlite`，存储所有宝可梦、招式、特性、道具数据
- **云端数据库**：Supabase（PostgreSQL），表结构与 SQLite 对应，schema 定义在 `supabase/schema.sql`
- **队伍数据**：本地模式存储在 `data/teams.json`，在线模式存储在浏览器 localStorage
- **页面缓存**：`data/raw/`，存储爬虫抓取的原始 HTML（gitignored）
