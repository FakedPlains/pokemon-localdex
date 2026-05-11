# Pokemon LocalDex 项目总览

> 本文档是项目的权威结构说明，描述整个项目的目录组织、各层职责、数据流向和运行模式。后续所有开发均以此为基准。

---

## 一、项目定位

Pokemon LocalDex 是一个宝可梦图鉴应用，数据完全来自 [52Poké Wiki](https://wiki.52poke.com/)，支持三种运行模式：

| 模式 | 前端 | 数据源 | 适用场景 |
|------|------|--------|---------|
| **本地模式** | React SPA（Vite dev server） | 本地 SQLite → Hono API | 本地开发、离线使用 |
| **生产模式** | React SPA（Cloudflare Pages） | D1 → Worker（Service Binding 代理） | 公开访问，全球 CDN |
| **小程序模式** | Taro + React（微信小程序） | 后端 Hono API（Worker/本地） | 移动端入口 |

---

## 二、Monorepo 目录结构

```
pokemon-localdex/
├── apps/
│   ├── api/                    Hono API 服务（本地 SQLite / Worker D1）
│   │   ├── src/
│   │   │   ├── app.ts          本地模式入口（SQLite store 初始化）
│   │   │   ├── worker.ts       Cloudflare Workers 入口（D1 store 初始化）
│   │   │   ├── routes.ts       统一路由定义（app/worker 共享）
│   │   │   ├── server.ts       HTTP 服务器入口（本地模式，监听 0.0.0.0:3030）
│   │   │   ├── static.ts       静态文件服务（dist/ → apps/web/public/）
│   │   │   └── smoke.ts        启动自检脚本
│   │   └── .env.example        API 环境变量模板
│   │
│   ├── web/                    React SPA（Vite 构建）
│   │   ├── src/
│   │   │   ├── App.jsx         路由入口（hash 路由）
│   │   │   ├── main.jsx        React 挂载点（含启动时数据迁移 + CSS 入口导入）
│   │   │   ├── styles/          模块化 CSS（Vite 打包合并）
│   │   │   │   ├── index.css            入口文件（@import 所有模块）
│   │   │   │   ├── base.css             CSS 变量、reset、body
│   │   │   │   ├── nav.css              顶部导航栏、搜索框、过滤面板
│   │   │   │   ├── pokedex.css          图鉴页面 Master-Detail 布局
│   │   │   │   ├── stat-calculator.css  能力值计算器
│   │   │   │   ├── abilities.css        特性页面
│   │   │   │   ├── moves.css            招式页面
│   │   │   │   ├── items.css            道具页面
│   │   │   │   ├── responsive.css       响应式断点
│   │   │   │   ├── teams.css            盒子 & 队伍管理
│   │   │   │   ├── box-card.css         盒子卡片 + 属性底色
│   │   │   │   ├── modal.css            通用弹窗
│   │   │   │   ├── pokemon-editor.css   配置编辑器
│   │   │   │   ├── common.css           Toast、Version Tags、视图切换
│   │   │   │   ├── damage-v1.css        旧版伤害计算器
│   │   │   │   ├── damage.css           新版伤害计算器（dc- 前缀）
│   │   │   │   └── type-chart.css       属性克制表
│   │   │   ├── pages/          七个页面组件
│   │   │   │   ├── PokedexPage.jsx      图鉴页（列表 + 详情抽屉）
│   │   │   │   ├── MovesPage.jsx        招式页
│   │   │   │   ├── AbilitiesPage.jsx    特性页
│   │   │   │   ├── ItemsPage.jsx        道具页
│   │   │   │   ├── TeamsPage.jsx        队伍编辑器
│   │   │   │   ├── DamagePage.jsx       伤害计算器
│   │   │   │   └── TypeChartPage.jsx    属性克制表
│   │   │   ├── components/     公共 UI 组件
│   │   │   │   ├── TypeChip.jsx         属性标签（带颜色）
│   │   │   │   ├── CustomSelect.jsx     自定义下拉选择框
│   │   │   │   ├── StatCalculator.jsx   能力值计算器
│   │   │   │   ├── Loading.jsx          加载状态
│   │   │   │   ├── Toast.jsx            Toast 通知
│   │   │   │   ├── SearchSelect.jsx     搜索下拉框（带异步搜索）
│   │   │   │   ├── MoveSearch.jsx       招式按需搜索组件（200ms 防抖）
│   │   │   │   ├── PokemonConfigCard.jsx 宝可梦配置卡片
│   │   │   │   ├── PokemonEditor.jsx    宝可梦编辑器
│   │   │   │   └── PokemonPickerList.jsx 宝可梦选择列表
│   │   │   ├── hooks/
│   │   │   │   ├── useApi.js            单次请求 hook
│   │   │   │   └── useInfiniteApi.js    无限滚动分页 hook
│   │   │   └── utils/
│   │   │       ├── api.js               统一 API 入口（unifiedApi / api）
│   │   │       ├── constants.js         全局常量（属性、性格、招式学习方式等）
│   │   │       ├── helpers.js           数据转换工具函数
│   │   │       ├── teamStorage.js       队伍/盒子本地存储（abilityId + abilityName 双字段）
│   │   │       └── migrateStorage.js    localStorage 数据迁移（v3：中文名→数字ID，含 abilityId）
│   │   ├── public/
│   │   │   └── assets/
│   │   │       └── type-icons/          属性图标（PNG）
│   │   ├── .env                本地开发（VITE_DATA_SOURCE 留空，走 API）
│   │   └── vite.config.js      Vite 配置（proxy、base:"/"、outDir:"../../dist"）
│   │
│   └── miniprogram/            微信小程序（Taro 4.2.0 + React 18）
│       ├── src/
│       │   ├── app.js          应用入口
│       │   ├── app.config.js   路由和 TabBar 配置
│       │   ├── app.less        全局样式
│       │   ├── pages/          五个页面
│       │   │   ├── pokedex/             图鉴列表页
│       │   │   ├── pokemon-detail/      宝可梦详情页
│       │   │   ├── moves/               招式列表页
│       │   │   ├── abilities/           特性列表页
│       │   │   └── items/               道具列表页
│       │   ├── components/     公共组件
│       │   │   ├── safe-image/          图片代理组件（wsrv.nl）
│       │   │   ├── type-chip/           属性标签
│       │   │   ├── stat-bar/            种族值条形图
│       │   │   └── loading/             加载状态
│       │   └── utils/
│       │       ├── api.js               业务查询函数（调用后端 API）
│       │       ├── config.js            API 基址配置（编译时注入）
│       │       └── constants.js         常量
│       ├── config/             Taro 构建配置（Webpack 5）
│       │   ├── index.js        公共配置（defineConstants 注入凭证）
│       │   ├── dev.js          开发配置
│       │   └── prod.js         生产配置
│       └── project.config.json 微信开发者工具项目配置（AppID: wx6f183945e108152a）
│
├── packages/
│   ├── battle-core/            统一伤害计算引擎（单一异步入口）
│   │   ├── src/index.ts        calculateDamage(input, lookup)
│   │   └── src/types.ts        类型定义（DamageCalcInput、NameLookup 等）
│   ├── store/                  数据存储层
│   │   ├── shared-types/       共享类型、常量和辅助函数（@pokemon-localdex/store-types）
│   │   │   └── src/index.ts    StatBlock、PokemonEntry、IStore、GENERATIONS 等
│   │   ├── drizzle-schema/     Drizzle ORM 表定义（共享 schema）
│   │   ├── drizzle-queries/    Drizzle ORM 统一查询逻辑（DrizzleStore）
│   │   ├── sqlite-store/       SQLite 薄封装（node:sqlite → drizzle-queries）
│   │   └── d1-store/           D1 薄封装（Cloudflare D1 → drizzle-queries）
│   ├── crawler_py/             Python 爬虫（52Poké → SQLite）
│   │   └── localdex_crawler/   爬虫核心模块
│
├── functions/                  Cloudflare Pages Functions
│   └── api/[[path]].ts         catch-all：通过 Service Binding 代理 /api/* 到 Worker
│
├── schema/
│   └── d1-schema.sql           D1/SQLite 数据库 schema
│
├── scripts/
│   ├── crawl-52poke-db.py      爬虫入口脚本（npm run crawl:* 的实际执行文件）
│   └── fetch_type_icons.py     属性图标采集脚本
│
├── data/
│   ├── raw/                    爬虫页面缓存（gitignored）
│   └── sqlite/
│       └── localdex.sqlite     本地主数据库
│
├── .github/
│   └── workflows/
│       └── deploy-cf.yml       Cloudflare Pages + Worker 自动部署工作流
│
├── wrangler.toml               Cloudflare Pages 配置（Service Binding 声明）
├── wrangler.worker.toml        Cloudflare Worker 配置（D1 绑定）
├── docs/                       技术文档（本目录）
├── package.json                Monorepo 根配置（npm workspaces）
└── .npmrc                      npm registry 配置（公共 registry + GitHub Packages）
```

---

## 三、架构分层

### 3.1 采集层（crawler_py）

Python 爬虫，唯一数据源为 52Poké Wiki。核心职责：

- 抓取 HTML 页面并缓存到 `data/raw/`（JSON 格式，含 url/title/fetchedAt/html）
- 解析 HTML，繁体中文自动转简体（请求时追加 `variant=zh-hans`，辅以 opencc）
- 通过 upsert 语义写入 SQLite，支持增量更新和全量重建

模块分工：`cli.py`（命令行入口）→ `fetcher.py`（HTTP + 缓存）→ `pokemon.py` / `catalog.py`（页面解析）→ `sqlite_upsert.py`（数据库写入）

### 3.2 存储层（packages/store/）

存储层采用四层结构，通过 `IStore` 接口统一对外暴露查询能力，API 层无需关心底层数据源。

**shared-types**（`packages/store/shared-types`，包名 `@pokemon-localdex/store-types`）集中定义了所有 store 包共用的类型（`StatBlock`、`PokemonEntry`、`MoveEntry`、`IStore` 接口等）、常量（`GENERATIONS`、`GAME_VERSIONS`、`TYPE_NAMES`、`TYPE_ALIASES` 等）和辅助函数（`normalizeTypeName`、`splitTypeNames`、`statBlockFromRow`、`sourceFromRow` 等）。

**drizzle-schema**（`packages/store/drizzle-schema`）定义了所有数据库表的 Drizzle ORM schema，供 drizzle-queries 使用。表定义与 `schema/d1-schema.sql` 保持一致。

**drizzle-queries**（`packages/store/drizzle-queries`）是核心查询包，`DrizzleStore` 类实现了 `IStore` 和 `NameLookup` 两个接口，包含全部数据库查询逻辑。sqlite-store 和 d1-store 均通过 `createDrizzleStore(db)` 创建实例，共享同一套查询代码。

**sqlite-store**（`packages/store/sqlite-store`）是 SQLite 薄封装，使用 Node.js 22 内置的 `node:sqlite` 创建数据库连接，然后委托给 drizzle-queries 处理所有查询。无需额外依赖。

**d1-store**（`packages/store/d1-store`）是 D1 薄封装，接收 Cloudflare D1 binding 创建数据库连接，然后委托给 drizzle-queries 处理所有查询。D1 是 SQLite 兼容的边缘数据库，表结构与本地 SQLite 完全一致。

### 3.3 API 层（apps/api）

基于 Hono 框架，支持两种运行模式：

**本地模式**（`server.ts` 入口）：运行在 Node.js 22，默认监听 `0.0.0.0:3030`，使用 sqlite-store 查询数据。

**Worker 模式**（`worker.ts` 入口）：运行在 Cloudflare Workers，使用 D1 binding 通过 d1-store 查询数据。

关键设计：
- 路由定义集中在 `routes.ts`，`app.ts` 和 `worker.ts` 只需传入各自的 `getStore` 实现即可共享全部路由
- 所有路由**同时挂载在 `/` 和 `/api` 前缀**下，兼容 Vite dev proxy 和 Pages Functions 代理两种模式
- 本地生产模式下同时托管 React SPA 静态资源
- 全局启用 CORS，允许任意来源

### 3.4 Pages Functions 代理层

`functions/api/[[path]].ts` 是 Cloudflare Pages 的 catch-all Function，通过 Service Binding 将所有 `/api/*` 请求转发给 Worker：

```typescript
export const onRequest: PagesFunction<Env> = async (context) => {
  return context.env.API_WORKER.fetch(context.request);
};
```

Service Binding 在 `wrangler.toml` 中声明，Pages 和 Worker 之间走 Cloudflare 内部网络，无额外延迟。

### 3.5 Web 展示层（apps/web）

React 18 SPA，Vite 构建，使用 **hash 路由**（`#/pokedex`、`#/moves` 等）。

数据获取通过 `fetch("/api/...")` 统一发送到后端（本地走 Hono API，生产走 Pages Functions 代理到 Worker）。

核心数据转换函数 `resolvePokemonDisplayVariant()`：根据当前选中的形态和世代，从 API 返回的嵌套数据中解析出正确的属性、种族值、特性和图片。

### 3.6 小程序展示层（apps/miniprogram）

Taro 4.2.0 + React 18，编译为微信小程序原生代码。

关键特点：
- 通过 `Taro.request` 调用后端 Hono API（与 Web 端共用同一套 API 接口）
- API 基址通过 Taro `defineConstants` 在编译时注入
- 图片通过 `SafeImage` 组件代理到 `wsrv.nl`，绕过微信域名白名单限制

### 3.7 核心库

**battle-core**：统一的伤害计算包，类型定义在 `src/types.ts`，计算逻辑在 `src/index.ts`。提供唯一入口函数 `calculateDamage(input, lookup)`，接收 `DamageCalcInput` 和实现了 `NameLookup` 接口的 store 实例，内部自动完成名称解析和伤害计算。本地模式和 Worker 模式共用同一个入口。基于 `@fakedplains/smogon-calc` 计算引擎，支持完整的伤害计算（含本系加成、属性克制、天气、急所、乱数范围、道具和特性影响）。SQL 查询逻辑已下沉到 drizzle-queries 包中，battle-core 不包含任何 SQL。

---

## 四、数据流

### 本地模式数据流

```
52Poké Wiki
    │ HTTP（requests + curl 降级）
    ▼
data/raw/*.json（页面缓存）
    │ BeautifulSoup 解析
    ▼
data/sqlite/localdex.sqlite
    │ node:sqlite（DatabaseSync）
    ▼
Hono API（apps/api，:3030）
    │ fetch("/api/...")
    ▼
React SPA（apps/web，:5173 dev / :3030 prod）
```

### 生产模式数据流（Cloudflare Pages）

```
React SPA（Cloudflare Pages CDN）
    │ fetch("/api/...")
    ▼
Pages Functions（functions/api/[[path]].ts）
    │ Service Binding → env.API_WORKER.fetch(request)
    ▼
Worker（pokemon-localdex-api）
    │ D1 binding → env.DB
    ▼
Cloudflare D1（pokemon-localdex-d1）
```

### 小程序模式数据流

```
后端 Hono API（Worker / 本地）
    │ Taro.request（HTTP API）
    ▼
微信小程序（Taro 编译产物）
    │ wsrv.nl 代理
    ▼
宝可梦图片（s1.52poke.com 等）
```

---

## 五、环境变量一览

| 文件 | 作用域 | 关键变量 |
|------|--------|---------|
| `apps/api/.env` | API 服务（本地） | `DATA_SOURCE`（sqlite）、`HOST`、`PORT` |
| `apps/web/.env` | Web 本地开发 | `VITE_DATA_SOURCE`（留空走 API） |
| `apps/web/vite.config.js` | 构建配置 | `base: "/"`（固定，不再条件切换） |
| `wrangler.worker.toml` | Worker 配置 | `DATA_SOURCE=d1`、D1 binding |
| `apps/miniprogram/.env` | 小程序构建 | `API_BASE_URL` |
| GitHub Secrets | CI 部署 | `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID` |

`.env` 和 `.env.*`（除 `.env.production` 和 `.env.example`）均被 `.gitignore` 排除。

---

## 六、常用命令

```bash
# 本地开发
npm run dev:api          # 启动 Hono API（:3030，SQLite 数据源）
npm run dev:web          # 启动 Vite dev server（:5173，proxy 到 :3030）

# 构建
npm run build:web        # 构建 React SPA（产物输出到 dist/）

# 数据采集
npm run crawl:all        # 全量采集（catalog + pokemon + learnsets）
npm run crawl:pokemon    # 仅采集宝可梦
npm run crawl:catalog    # 仅采集招式/特性/道具

# 调试
npm run check:api        # API 冒烟测试
npm run check:sqlite     # SQLite 查询测试
npm run check:damage     # 伤害计算测试

# 小程序
cd apps/miniprogram
npx taro build --type weapp          # 生产构建
npx taro build --type weapp --watch  # 开发构建（监听模式）
```

---

## 七、部署

### Cloudflare Pages（生产环境）

推送到 `main` 分支自动触发 `.github/workflows/deploy-cf.yml`：

1. 删除 `package-lock.json` 后重新 `npm install`（确保 native binding 匹配 CI 平台）
2. 执行 `npm run build:web` 构建前端
3. 部署 API Worker（`wrangler deploy --config wrangler.worker.toml`）
4. 部署 Pages（`wrangler pages deploy dist --project-name=pokemon-localdex --branch=main`）

部署架构：

```
用户 → Cloudflare Pages (CDN + Pages Functions)
              │ /api/* Service Binding
              ▼
       Worker (pokemon-localdex-api)
              │ D1 binding
              ▼
       D1 Database (pokemon-localdex-d1)
```

GitHub Secrets 配置：

| Secret 名称 | 用途 |
|-------------|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token（Workers/Pages/D1 权限）|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID |

### 分支保护规则

`main` 分支设置了保护规则：禁止强制推送，只能通过 Pull Request 合并。确保部署的可追溯性和代码审查流程。

### 微信小程序

1. `npx taro build --type weapp`（在 `apps/miniprogram/` 目录下）
2. 微信开发者工具打开 `apps/miniprogram/dist/`
3. 上传代码包 → 微信公众平台提交审核 → 发布

### 微信小程序合法域名配置

| 类型 | 域名 | 用途 |
|------|------|------|
| request 合法域名 | 后端 API 部署域名 | API 请求 |
| downloadFile 合法域名 | `https://wsrv.nl` | 图片代理 |

---

## 八、React 版本约束（重要）

项目**统一使用 React 18.3.1**，不得升级到 React 19。原因：

- Taro 4.2.0 依赖 `react-reconciler@0.29.x`，React 19 的 reconciler 接口有破坏性变更
- 升级会导致运行时错误：`ReactCurrentBatchConfig` 未定义、React Error #327 等

Web 端使用 `@vitejs/plugin-react@5.2.0`（不得使用 v6.x，v6.x 要求 React 19）。

---

## 九、数据库概览

数据库共 14 张表，分四组：

- **主实体表**：`pokemon`、`moves`、`abilities`、`items`
- **形态相关表**：`pokemon_forms`、`pokemon_form_stats`、`pokemon_form_types`、`pokemon_form_abilities`、`pokemon_form_images`
- **世代记录表**：`move_generation_records`、`ability_generation_records`
- **关联表**：`evolution_chains`、`pokemon_learnsets`、`pokemon_generation_regions`

核心设计原则：**形态优先**——宝可梦的属性、种族值、特性、图片均挂在 `pokemon_forms` 下，而非主表。形态子表使用 `generation_start` / `generation_end` 表示世代范围，支持跨世代数据变化。

本地 SQLite 和 Cloudflare D1 的表结构保持一致，schema 定义在 `schema/d1-schema.sql` 中。

详细表结构见 [database.md](./database.md)。
