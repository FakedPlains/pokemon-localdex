# 系统架构

## 设计目标

Pokemon LocalDex 的架构围绕四个核心目标展开：数据必须完全来自 52Poké Wiki；数据要能本地离线使用；查询、队伍构筑、伤害计算必须在多个端上共用一套核心逻辑；项目可以零后端部署到 Cloudflare Pages，通过 Service Binding 代理到 Worker 完成 API 调用，同时提供微信小程序端作为移动端入口。

## 整体架构

项目支持三种运行模式，通过环境变量和客户端类型切换。

**本地模式**采用 Python 爬虫 → SQLite 存储 → Hono API → React SPA 的四层结构：

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  采集层      │     │  存储层       │     │  API 层       │     │  展示层       │
│  crawler_py  │────▶│  SQLite DB   │◀────│  Hono API    │◀────│  React SPA   │
│  (Python)    │     │  (sqlite-    │     │  (apps/api)  │     │  (apps/web)  │
│              │     │   store)     │     │              │     │              │
└─────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

**生产模式**（Cloudflare Pages 部署）前端通过 Pages Functions Service Binding 代理到 Worker，Worker 从 D1 读取数据：

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  展示层       │     │  Pages       │     │  Worker 层    │     │  D1 存储     │
│  React SPA   │────▶│  Functions   │────▶│  pokemon-    │────▶│  D1 Database │
│  (CF Pages)  │     │  (Service    │     │  localdex-api│     │  (SQLite     │
│              │     │   Binding)   │     │  (Hono)      │     │   兼容)      │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

**小程序模式**通过 Taro 编译为微信小程序，调用后端 Hono API：

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  小程序端     │     │  图片代理     │     │  后端 API    │
│  Taro React  │────▶│  wsrv.nl     │     │  Hono API    │
│  (apps/      │     │  (图片加载)   │     │  (Worker/    │
│  miniprogram)│─────┼──────────────┼────▶│   本地)      │
└──────────────┘     └──────────────┘     └──────────────┘
```

## 目录结构

```
pokemon-localdex/
├── apps/
│   ├── api/              Hono API 服务（本地 SQLite / Worker D1）
│   │   └── src/
│   │       ├── app.ts    路由定义、数据源切换
│   │       ├── server.ts HTTP 服务器入口（本地模式）
│   │       └── worker.ts Cloudflare Workers 入口
│   ├── web/              React SPA 客户端（Vite 构建）
│   │   ├── src/
│   │   │   ├── styles/       模块化 CSS（Vite 打包合并）
│   │   │   ├── pages/        七个页面（Pokedex、Moves、Abilities、Items、Teams、Damage、TypeChart）
│   │   │   ├── components/   公共组件（TypeChip、CustomSelect、SearchSelect、StatCalculator 等）
│   │   │   ├── hooks/        数据请求 hook（useApi、useInfiniteApi）
│   │   │   └── utils/        工具函数（api、constants、helpers、statCalcModel、teamStorage、migrateStorage）
│   │   ├── .env          本地开发环境变量（VITE_DATA_SOURCE 留空）
│   │   └── vite.config.js  base: "/" 固定，无需条件切换
│   └── miniprogram/      微信小程序客户端（Taro + React）
│       ├── config/       Taro 构建配置（Webpack 5）
│       ├── src/
│       │   ├── components/   公共组件（SafeImage、TypeChip、StatBar、Loading）
│       │   ├── pages/        页面（pokedex、pokemon-detail、moves、abilities、items）
│       │   ├── utils/        工具函数（api.js、config.js、constants.js）
│       │   ├── assets/       静态资源（TabBar 图标）
│       │   ├── app.js        应用入口
│       │   ├── app.config.js 小程序路由和 TabBar 配置
│       │   └── app.less      全局样式
│       ├── project.config.json  微信开发者工具项目配置
│       └── dist/             编译产物（微信开发者工具打开此目录）
├── packages/
│   ├── battle-core/     统一伤害计算引擎（单一异步入口）
│   │   ├── src/index.ts     calculateDamage(input, lookup) — 名称解析 + 计算一步完成
│   │   └── src/types.ts     类型定义（DamageCalcInput、NameLookup 等）
│   ├── store/           数据存储层
│   │   ├── shared-types/    共享类型、常量和辅助函数（@pokemon-localdex/store-types）
│   │   ├── drizzle-schema/  Drizzle ORM 表定义（共享 schema）
│   │   ├── drizzle-queries/ Drizzle ORM 统一查询逻辑（DrizzleStore 实现 IStore + NameLookup）
│   │   ├── sqlite-store/    SQLite 薄封装（node:sqlite → drizzle-queries）
│   │   └── d1-store/        D1 薄封装（Cloudflare D1 → drizzle-queries）
│   ├── crawler_py/      Python 爬虫（52Poké 数据采集 → SQLite）
│   │   ├── crawl-52poke-db.py   爬虫入口脚本
│   │   ├── fetch_type_icons.py  属性图标采集脚本
│   │   ├── localdex_crawler/    爬虫核心包
│   │   └── requirements.txt     Python 依赖
├── functions/
│   └── api/[[path]].ts   Pages Function：通过 Service Binding 代理 /api/* 到 Worker
├── schema/               所有数据库 schema 统一管理
│   └── d1-schema.sql         D1/SQLite 数据库 schema
├── scripts/              Node.js 数据工具脚本
│   └── fill-form-names.mjs       按爬虫共享规则回填/校准形态英文名
├── data/
│   ├── raw/              原始抓取页面缓存（gitignored）
│   └── sqlite/           本地 SQLite 数据库
├── .github/
│   └── workflows/
│       └── deploy-cf.yml   Cloudflare Pages + Worker 自动部署工作流
├── wrangler.toml           Pages 配置（Service Binding 声明）
├── wrangler.worker.toml    Worker 配置（D1 绑定）
├── .npmrc                npm registry 配置（指向公共 registry + GitHub Packages）
└── docs/                 技术文档
```

## 分层详解

### 采集层（crawler_py）

采集层是一个独立的 Python 包，位于 `packages/crawler_py/`，负责从 52Poké Wiki 抓取页面、解析 HTML 并将结构化数据写入 SQLite。

核心职责包括：抓取 52Poké 页面并缓存原始 HTML 到 `data/raw/`，便于追溯和断点续跑；解析页面提取结构化数据，繁体中文自动转换为简体；通过 upsert 语义写入 SQLite，支持增量更新和全量重建（`--clean`）两种模式。

采集层的代码按四层组织：`cli.py` 提供命令行入口和参数解析，是唯一的调度层；`fetcher.py` 负责 HTTP 请求和本地缓存管理；`parsers/` 目录按数据领域拆分解析模块（`pokemon_detail.py`、`learnset.py`、`evolution.py`、`moves.py`、`abilities.py`、`items.py`、`champions.py`、`field_effects.py` 等），只做 HTML → dict 转换不写库；`upsert/` 目录按数据领域拆分写库模块（`pokemon.py`、`catalog.py`、`learnset.py`、`champions.py`、`field_effects.py`、`clear.py`、`base.py`），只接收结构化 dict 写入 SQLite 不解析 HTML；基础工具层（`constants.py`、`text.py`、`urls.py`、`images.py`、`generations.py`、`form_type.py`、`form_name_resolver.py`、`config.py`）提供纯函数的文本处理、URL 构建和形态推导能力。

### 存储层

存储层采用四层结构：shared-types 定义类型和常量，drizzle-schema 定义 Drizzle ORM 表结构，drizzle-queries 实现全部查询逻辑，sqlite-store 和 d1-store 作为薄封装层仅负责创建数据库连接。API 层通过 `IStore` 接口统一访问，无需关心底层数据源。

**shared-types**（`packages/store/shared-types`）是共享类型包（`@pokemon-localdex/store-types`），集中定义了所有 store 包共用的类型（`StatBlock`、`PokemonEntry`、`MoveEntry`、`IStore` 接口等）、常量（`GENERATIONS`、`GAME_VERSIONS`、`TYPE_NAMES`、`TYPE_ALIASES` 等）和辅助函数（`normalizeTypeName`、`splitTypeNames`、`statBlockFromRow`、`sourceFromRow` 等）。

**drizzle-schema**（`packages/store/drizzle-schema`）定义了所有数据库表的 Drizzle ORM schema，供 drizzle-queries 使用。表定义与 `schema/d1-schema.sql` 保持一致。

**drizzle-queries**（`packages/store/drizzle-queries`）是核心查询包，`DrizzleStore` 类实现了 `IStore` 和 `NameLookup` 两个接口，包含全部数据库查询逻辑（宝可梦、招式、特性、道具的列表/详情/搜索，以及名称解析）。sqlite-store 和 d1-store 均通过 `createDrizzleStore(db)` 创建实例，共享同一套查询代码。

**sqlite-store**（`packages/store/sqlite-store`）是 SQLite 薄封装，使用 Node.js 22 的实验性 `node:sqlite` 模块创建数据库连接，然后委托给 drizzle-queries 处理所有查询。无需额外的 SQLite 绑定依赖。

**d1-store**（`packages/store/d1-store`）是 D1 薄封装，接收 Cloudflare D1 binding 创建数据库连接，然后委托给 drizzle-queries 处理所有查询。D1 是 Cloudflare 提供的 SQLite 兼容边缘数据库，表结构与本地 SQLite 完全一致。

### 伤害计算层

伤害计算统一在 `packages/battle-core` 中，提供单一异步入口：

**battle-core** 是唯一的伤害计算包，类型定义集中在 `src/types.ts`（`DamageCalcInput`、`DamageCalcResult`、`NameLookup`、`ResolvedNames` 等），计算逻辑和入口函数在 `src/index.ts`。包内包含常量映射（性格/天气/地形/属性/状态的中英文对照）和纯计算函数 `executeCalc()`。

**唯一入口 `calculateDamage(input, lookup)`**：接收 `DamageCalcInput` 和实现了 `NameLookup` 接口的 store 实例，内部自动完成名称解析（中文→英文）和伤害计算。`NameLookup` 接口定义了两个方法：`pokemonNameEn()` 和 `entityNameEn()`，由 `DrizzleStore` 统一实现。本地模式和 Worker 模式使用同一个入口函数，无需区分同步/异步。

SQL 查询逻辑已下沉到 drizzle-queries 包中，battle-core 不包含任何 SQL。

### API 层（apps/api）

API 层基于 Hono 框架，提供统一的 RESTful 查询入口。根据运行环境有两种模式：

**本地模式**（`server.ts` 入口）：启动时使用 sqlite-store，监听 `0.0.0.0:3030`。

**Worker 模式**（`worker.ts` 入口）：在 Cloudflare Workers 运行时中执行，使用 D1 binding 通过 `d1-store` 查询数据。Hono 的 `app.fetch()` 适配 Workers 的 `fetch` handler 接口。

核心职责包括：提供宝可梦、招式、特性、道具的查询接口（支持分页）；提供伤害计算接口；在本地生产模式下同时托管 React SPA 的静态资源。路由定义集中在 `routes.ts` 中，`app.ts` 和 `worker.ts` 只需传入各自的 `getStore` 实现即可共享全部路由逻辑。

API 同时挂载在根路径 `/` 和 `/api` 前缀下：Vite 开发模式下前端通过 proxy 把 `/api/xxx` 转发为 `/xxx`；Cloudflare Pages 生产模式下 Pages Functions 捕获 `/api/*` 并通过 Service Binding 转发到 Worker。

### Pages Functions 代理层

`functions/api/[[path]].ts` 是 Cloudflare Pages 的 catch-all Function，负责将所有 `/api/*` 请求通过 Service Binding 转发给 Worker。这种 Service Binding 模式的优势：Pages Function 和 Worker 之间通信走 Cloudflare 内部网络，零延迟；Worker 独立部署，可单独更新和扩展。

Service Binding 配置在 `wrangler.toml` 中声明：
```toml
[[services]]
binding = "API_WORKER"
service = "pokemon-localdex-api"
```

### Web 展示层（apps/web）

展示层是一个 React SPA，由 Vite 构建。样式采用模块化 CSS 架构，所有样式文件位于 `src/styles/` 目录下，按页面/功能拆分为独立模块，通过 `index.css` 统一汇总，再由 `main.jsx` 中的 `import "./styles/index.css"` 引入。Vite 在构建时会将所有 CSS 合并、压缩为单个文件，生产环境零额外 HTTP 请求。前端通过 `VITE_DATA_SOURCE` 环境变量决定数据获取方式。

所有请求通过 `fetch("/api/...")` 发送到后端（本地走 Hono API，生产走 Pages Functions 代理到 Worker）。

**Vite base 路径**：固定为 `"/"`，Cloudflare Pages 在根路径提供服务，无需子路径前缀。

**ID 使用规范**：前端所有 API 请求和 localStorage 存储均使用数据库数字 ID（如 `pokemonId: "25"`、`itemId: "123"`），不使用中文名称作为标识符。中文名称仅用于界面显示，通过 `nameZh`、`itemName` 等字段保存。

**abilityId 数字化**：特性使用 `abilityId`（数字 ID）+ `abilityName`（中文名称）双字段存储。`abilityId` 用于数据标识，`abilityName` 用于界面显示。PokemonEditor 的特性选择返回 `{id, name}` 对象，同时写入两个字段。

**数据迁移**：`migrateStorage.js` 提供了从旧格式到新格式的自动迁移逻辑。当前迁移版本为 v4（标记：`localdex_migration_v4`），支持 pokemonId、itemId、abilityId 的中文名 → 数字 ID 迁移，以及旧 slug 形中文 formKey → formId 解析（通过 `resolveFormId()` 多级匹配）。迁移是异步的、不阻塞渲染、幂等的。

**招式搜索**：DamagePage 中的招式搜索采用按需搜索模式（`onSearch` 回调 + 200ms 防抖），使用独立的 `moveSearching` 状态，不会触发全页面 loading。

**能力值计算**：`utils/statCalcModel.ts` 是能力值计算的单一来源（single source of truth），集中定义了所有相关常量（`EV_MAX`、`EV_TOTAL_MAX`、`SP_MAX`、`SP_TOTAL_MAX`、`IV_MAX`、`STAT_KEYS` 等）、计算函数（`calculateFinalStat`、`calculateHpStat`、`evToSp`、`spToEv`、`getNatureMultiplier`）以及模式转换函数（`convertEvsToSps`、`convertSpsToEvs`）。所有需要能力值计算或 EV/SP 常量的组件均直接从 `statCalcModel.ts` 导入，不通过 `helpers.js` 中转。

当前包含七个页面：图鉴页（PokedexPage）提供宝可梦列表搜索和详情展示，支持赛季使用率排行模式（按形态级卡片展示排名，支持单打/双打格式切换）；招式页（MovesPage）提供招式列表和世代差异查看；特性页（AbilitiesPage）提供特性列表和世代差异查看；道具页（ItemsPage）提供道具列表和详情；队伍页（TeamsPage）提供 6 槽队伍编辑器；伤害页（DamagePage）提供完整的伤害计算器，支持性格搜索选择、特性内联选择、道具图片预览、形态切换（自动绑定道具/特性）、天气和场地分段切换、EV↔SP 自动转换等；属性克制表页（TypeChartPage）展示 18 属性相克关系。

前端采用"形态优先"的数据模型：`resolvePokemonDisplayVariant()` 函数根据当前选中的形态和世代，从 API 返回的嵌套数据中解析出正确的属性、种族值、特性和图片，是整个展示层的核心数据转换逻辑。

### 小程序展示层（apps/miniprogram）

小程序端基于 Taro 4.2.0 框架开发，使用 React 语法编写，通过 Webpack 5 编译为微信小程序原生代码。

**数据获取**：小程序端通过 `Taro.request` 调用后端 Hono API（与 Web 端共用同一套 API 接口），API 基址通过编译时 `defineConstants` 注入。

**图片加载**：微信小程序对网络请求有严格的域名白名单限制。宝可梦图片托管在 `s1.52poke.com`、`s2.52poke.com` 等域名上，无法直接添加到白名单。小程序端通过 `SafeImage` 组件将这些外部图片 URL 代理到 `wsrv.nl` 图片代理服务加载，格式为 `https://wsrv.nl/?url={encodedUrl}`。

**页面结构**：小程序包含五个页面，其中四个为 TabBar 页面。图鉴页（pokedex）展示宝可梦列表，支持搜索和属性筛选；宝可梦详情页（pokemon-detail）展示完整信息，包括属性、种族值、特性和进化链；招式页（moves）展示招式列表；特性页（abilities）展示特性列表；道具页（items）展示道具列表和图标。

**公共组件**：`SafeImage` 处理图片代理和加载失败降级；`TypeChip` 渲染属性标签（带颜色）；`StatBar` 渲染种族值条形图；`Loading` 提供加载状态指示。

### 核心库

**battle-core**：统一的伤害计算包，类型定义在 `src/types.ts`，计算逻辑在 `src/index.ts`。提供唯一入口函数 `calculateDamage(input, lookup)`，接收 `DamageCalcInput` 和实现了 `NameLookup` 接口的 store 实例，内部自动完成名称解析和伤害计算。本地模式和 Worker 模式共用同一个入口，不依赖任何运行时特定 API。

## 数据流

### 本地模式

1. **采集**：Python 爬虫从 52Poké Wiki 抓取 HTML 页面，缓存到 `data/raw/`
2. **解析**：爬虫解析 HTML，提取结构化数据
3. **存储**：解析结果通过 upsert 写入 `data/sqlite/localdex.sqlite`
4. **查询**：Hono API 通过 sqlite-store 读取数据库，返回 JSON
5. **展示**：React SPA 调用 API，渲染界面

### 生产模式（Cloudflare Pages）

```
React SPA (Cloudflare Pages CDN)
    │ fetch("/api/...")
    ▼
Pages Functions (functions/api/[[path]].ts)
    │ Service Binding → env.API_WORKER.fetch(request)
    ▼
Worker (pokemon-localdex-api, wrangler.worker.toml)
    │ D1 binding → env.DB
    ▼
Cloudflare D1 (pokemon-localdex-d1)
```

1. **数据导入**：SQLite 数据导出为 SQL，通过 `wrangler d1 execute` 导入 D1
2. **查询**：Pages Function 通过 Service Binding 将请求转发给 Worker
3. **计算**：Worker 使用 d1-store 查询数据，battle-core（异步入口）执行伤害计算
4. **展示**：SPA 渲染界面

### 小程序模式

1. **查询**：Taro 小程序通过 `Taro.request` 调用后端 Hono API
2. **图片加载**：外部图片通过 `wsrv.nl` 代理服务加载，绕过微信域名白名单限制
3. **展示**：Taro 编译为微信小程序原生组件，渲染界面

队伍数据保存在浏览器 localStorage 中。小程序端暂不支持队伍功能。

## 部署架构

### Cloudflare Pages 部署

GitHub Actions 工作流（`.github/workflows/deploy-cf.yml`）在每次推送到 `main` 分支时自动触发：

1. 安装依赖（删除 lockfile 后重新 `npm install`，以确保 native binding 匹配 CI 平台——解决 rolldown 等原生模块在 Linux 环境的兼容问题）
2. 执行 `npm run build:web`，构建 React SPA 到 `dist/` 目录
3. 部署 Worker：`wrangler deploy --config wrangler.worker.toml`（将 API Worker 部署到 Cloudflare）
4. 部署 Pages：`wrangler pages deploy dist --project-name=pokemon-localdex --branch=main`（将前端静态资源 + Pages Functions 部署到 Cloudflare Pages）

工作流还包含一个可选的 D1 Schema Migration job，仅在 `schema/d1-schema.sql` 文件变更时触发，自动执行 `wrangler d1 execute` 更新远程数据库 schema。

### 分支保护

`main` 分支设置了保护规则：

- 禁止强制推送（force push）
- 所有代码变更必须通过 Pull Request 合并
- 确保部署的可追溯性和代码审查流程

### 小程序部署

小程序端通过微信开发者工具上传代码包，在微信公众平台提交审核后发布。构建流程：

1. 在 `apps/miniprogram/` 目录下执行 `npx taro build --type weapp` 生产构建
2. 用微信开发者工具打开 `apps/miniprogram/dist/` 目录
3. 在开发者工具中上传代码包
4. 在微信公众平台提交审核并发布

小程序 AppID 为 `wx6f183945e108152a`，配置在 `project.config.json` 中。

### 凭证管理

**Cloudflare 部署凭证**通过 GitHub Repository Secrets 管理：

| Secret 名称 | 用途 |
|-------------|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token（Workers/Pages/D1 权限）|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID |


### 环境变量文件

| 文件 | 用途 | 关键配置 |
|------|------|----------|
| `apps/web/.env` | 本地开发 | `VITE_DATA_SOURCE=`（空，走 API） |
| `apps/web/vite.config.js` | 构建配置 | `base: "/"` 固定 |
| `apps/api/.env.example` | API 配置模板 | `DATA_SOURCE=sqlite` |
| `wrangler.toml` | Pages 配置 | Service Binding 声明 |
| `wrangler.worker.toml` | Worker 配置 | D1 binding、`DATA_SOURCE=d1` |
| `apps/miniprogram/src/utils/config.js` | 小程序配置 | API 基址、分页大小 |
| GitHub Secrets | CI 部署 | `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID` |

`.env` 和 `.env.*` 被 `.gitignore` 排除，但 `.env.production` 和 `.env.example` 例外。

### 微信小程序域名配置

小程序端需要在微信公众平台的「开发管理 → 开发设置 → 服务器域名」中配置以下合法域名：

| 域名类型 | 域名 | 用途 |
|---------|------|------|
| request 合法域名 | 后端 API 部署域名 | API 请求 |
| downloadFile 合法域名 | `https://wsrv.nl` | 图片代理服务 |

开发阶段可在微信开发者工具中勾选「不校验合法域名」跳过此限制。

## React 版本统一

项目采用 npm workspaces 管理的 monorepo 结构，所有应用统一使用 React 18.3.1。这是因为 Taro 4.2.0 依赖 React 18 和 `react-reconciler@0.29.x`，而 React 19 的 reconciler 接口有破坏性变更，会导致运行时错误（如 `ReactCurrentBatchConfig` 未定义、React Error #327 等）。

Web 端使用 `@vitejs/plugin-react@5.2.0`（而非 v6.x），因为 v6.x 要求 React 19 作为 peer dependency。

## 数据存储

- **本地数据库**：`data/sqlite/localdex.sqlite`，存储所有宝可梦、招式、特性、道具数据
- **生产数据库**：Cloudflare D1（`pokemon-localdex-d1`），SQLite 兼容，表结构与本地 SQLite 一致
- **队伍数据**：完全存储在浏览器 localStorage 中，不涉及数据库
- **页面缓存**：`data/raw/`，存储爬虫抓取的原始 HTML（gitignored）
