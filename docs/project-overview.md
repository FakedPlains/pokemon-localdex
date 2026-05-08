# Pokemon LocalDex 项目总览

> 本文档是项目的权威结构说明，描述整个项目的目录组织、各层职责、数据流向和运行模式。后续所有开发均以此为基准。

---

## 一、项目定位

Pokemon LocalDex 是一个宝可梦图鉴应用，数据完全来自 [52Poké Wiki](https://wiki.52poke.com/)，支持三种运行模式：

| 模式 | 前端 | 数据源 | 适用场景 |
|------|------|--------|---------|
| **本地模式** | React SPA（Vite dev server） | 本地 SQLite → Hono API | 本地开发、离线使用 |
| **在线模式** | React SPA（GitHub Pages 静态托管） | Supabase（PostgreSQL） | 公开访问，零后端 |
| **小程序模式** | Taro + React（微信小程序） | Supabase PostgREST REST API | 移动端入口 |

---

## 二、Monorepo 目录结构

```
pokemon-localdex/
├── apps/
│   ├── api/                    Hono API 服务（同时托管 SPA 静态资源）
│   │   ├── src/
│   │   │   ├── app.ts          路由定义、数据源切换、Teams/Battle 接口
│   │   │   ├── server.ts       HTTP 服务器入口（监听 0.0.0.0:3030）
│   │   │   ├── static.ts       静态文件服务（dist/ → apps/web/public/）
│   │   │   └── smoke.ts        启动自检脚本
│   │   └── .env.example        API 环境变量模板
│   │
│   ├── web/                    React SPA（Vite 构建）
│   │   ├── src/
│   │   │   ├── App.jsx         路由入口（hash 路由）
│   │   │   ├── main.jsx        React 挂载点
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
│   │   │   │   ├── PokemonConfigCard.jsx 宝可梦配置卡片
│   │   │   │   ├── PokemonEditor.jsx    宝可梦编辑器
│   │   │   │   └── PokemonPickerList.jsx 宝可梦选择列表
│   │   │   ├── hooks/
│   │   │   │   ├── useApi.js            单次请求 hook
│   │   │   │   └── useInfiniteApi.js    无限滚动分页 hook
│   │   │   └── utils/
│   │   │       ├── api.js               统一 API 入口（unifiedApi / api）
│   │   │       ├── supabase.js          Supabase 客户端初始化
│   │   │       ├── supabaseApi.js       Supabase 直连查询函数
│   │   │       ├── constants.js         全局常量（属性、性格、招式学习方式等）
│   │   │       ├── helpers.js           数据转换工具函数
│   │   │       ├── teamStorage.js       队伍/盒子本地存储
│   │   │       └── migrateStorage.js    localStorage 数据迁移（旧格式中文名→数字ID）
│   │   ├── public/
│   │   │   └── assets/
│   │   │       ├── styles.css           全局样式
│   │   │       └── type-icons/          属性图标（PNG）
│   │   ├── .env                本地开发（VITE_DATA_SOURCE 留空，走 API）
│   │   ├── .env.production     生产构建模板（凭证由 CI Secrets 注入）
│   │   ├── .env.example        配置说明模板
│   │   └── vite.config.js      Vite 配置（proxy、base、outDir）
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
│       │       ├── supabase.js          PostgREST 请求封装（Taro.request）
│       │       ├── api.js               业务查询函数
│       │       ├── config.js            Supabase 凭证（编译时注入）
│       │       └── constants.js         常量
│       ├── config/             Taro 构建配置（Webpack 5）
│       │   ├── index.js        公共配置（defineConstants 注入凭证）
│       │   ├── dev.js          开发配置
│       │   └── prod.js         生产配置
│       └── project.config.json 微信开发者工具项目配置（AppID: wx6f183945e108152a）
│
├── packages/
│   ├── battle-core/            伤害计算核心（纯 TypeScript）
│   │   └── src/index.ts        calculateDamage() 函数
│   ├── crawler_py/             Python 爬虫（52Poké → SQLite）
│   │   └── localdex_crawler/   爬虫核心模块
│   ├── sqlite-store/           SQLite 查询适配层（TypeScript）
│   │   └── src/index.ts        类型定义 + 查询函数（node:sqlite）
│   └── supabase-store/         Supabase 查询适配层（TypeScript）
│       └── src/index.ts        与 sqlite-store 同接口，底层用 supabase-js
│
├── supabase/
│   └── schema.sql              Supabase 数据库 schema（与 SQLite 对应）
│
├── scripts/
│   ├── crawl-52poke-db.py      爬虫入口脚本（npm run crawl:* 的实际执行文件）
│   ├── fetch_type_icons.py     属性图标采集脚本
│   └── migrate-to-supabase.mjs SQLite → Supabase 数据迁移脚本
│
├── data/
│   ├── raw/                    爬虫页面缓存（gitignored）
│   ├── sqlite/
│   │   └── localdex.sqlite     本地主数据库
│   └── teams.json              本地模式队伍数据（运行时生成）
│
├── .github/
│   └── workflows/
│       └── deploy-pages.yml    GitHub Pages 自动部署工作流
│
├── docs/                       技术文档（本目录）
├── package.json                Monorepo 根配置（npm workspaces）
└── .npmrc                      npm registry 配置
```

---

## 三、架构分层

### 3.1 采集层（crawler_py）

Python 爬虫，唯一数据源为 52Poké Wiki。核心职责：

- 抓取 HTML 页面并缓存到 `data/raw/`（JSON 格式，含 url/title/fetchedAt/html）
- 解析 HTML，繁体中文自动转简体（请求时追加 `variant=zh-hans`，辅以 opencc）
- 通过 upsert 语义写入 SQLite，支持增量更新和全量重建

模块分工：`cli.py`（命令行入口）→ `fetcher.py`（HTTP + 缓存）→ `pokemon.py` / `catalog.py`（页面解析）→ `sqlite_upsert.py`（数据库写入）

### 3.2 存储层（sqlite-store / supabase-store）

两个可互换的 TypeScript 包，对外暴露**完全相同的函数签名**：

```typescript
listPokemonFromSqlite / listPokemonFromSupabase
getPokemonFromSqlite  / getPokemonFromSupabase
listMovesFromSqlite   / listMovesFromSupabase
// ... 以此类推
```

API 层通过 `DATA_SOURCE` 环境变量动态 `import` 对应的包，切换对上层完全透明。

**sqlite-store** 使用 Node.js 22 内置的 `node:sqlite`（`DatabaseSync`），无需额外依赖。

**supabase-store** 使用 `@supabase/supabase-js` 客户端，通过 Supabase REST API 查询。

### 3.3 API 层（apps/api）

基于 Hono 框架，运行在 Node.js 22，默认监听 `0.0.0.0:3030`。

关键设计：
- 所有路由**同时挂载在 `/` 和 `/api` 前缀**下，兼容 Vite dev proxy 和生产直连两种模式
- 生产模式下同时托管 React SPA 静态资源（`dist/` → `apps/web/public/`）
- 全局启用 CORS，允许任意来源

### 3.4 Web 展示层（apps/web）

React 18 SPA，Vite 构建，使用 **hash 路由**（`#/pokedex`、`#/moves` 等）。

数据获取通过 `unifiedApi()` 统一入口，根据 `VITE_DATA_SOURCE` 自动选择：

```
VITE_DATA_SOURCE 为空 / "api"  →  fetch("/api/...")  →  Hono API
VITE_DATA_SOURCE = "supabase"  →  supabaseApi.js 直连 Supabase
```

核心数据转换函数 `resolvePokemonDisplayVariant()`：根据当前选中的形态和世代，从 API 返回的嵌套数据中解析出正确的属性、种族值、特性和图片。

### 3.5 小程序展示层（apps/miniprogram）

Taro 4.2.0 + React 18，编译为微信小程序原生代码。

关键差异：
- **不使用 `@supabase/supabase-js`**（依赖浏览器 API，小程序不可用），自行封装 PostgREST 客户端（`supabase.js`）
- 图片通过 `SafeImage` 组件代理到 `wsrv.nl`，绕过微信域名白名单限制
- Supabase 凭证通过 Taro `defineConstants` 在编译时注入，不硬编码在源码中

### 3.6 核心库（battle-core）

纯 TypeScript 库，实现宝可梦伤害计算公式（含本系加成、属性克制、天气、急所、乱数范围）。仅在后端 API 模式下可用，GitHub Pages 和小程序端不支持。

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

### 在线模式数据流（GitHub Pages）

```
data/sqlite/localdex.sqlite
    │ migrate-to-supabase.mjs
    ▼
Supabase（PostgreSQL）
    │ @supabase/supabase-js
    ▼
React SPA（GitHub Pages 静态托管）
```

### 小程序模式数据流

```
Supabase（PostgreSQL）
    │ Taro.request（PostgREST REST API）
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
| `apps/api/.env` | API 服务 | `DATA_SOURCE`（sqlite/supabase）、`HOST`、`PORT`、`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` |
| `apps/web/.env` | Web 本地开发 | `VITE_DATA_SOURCE`（留空走 API） |
| `apps/web/.env.production` | Web 生产构建模板 | `VITE_DATA_SOURCE=supabase`，凭证留空由 CI 注入 |
| `apps/miniprogram/.env` | 小程序构建 | `SUPABASE_URL`、`SUPABASE_ANON_KEY` |
| GitHub Secrets | CI 构建 | `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY` |

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

### GitHub Pages

推送到 `main` 分支自动触发 `.github/workflows/deploy-pages.yml`：

1. 删除 lockfile 后重新 `npm install`（解析正确平台的 native binding）
2. 注入 Supabase 凭证（GitHub Secrets）并执行 `npm run build:web`
3. 设置 `GITHUB_PAGES=true`，Vite `base` 自动切换为 `/pokemon-localdex/`
4. 产物推送到 `gh-pages` 分支

### 微信小程序

1. `npx taro build --type weapp`（在 `apps/miniprogram/` 目录下）
2. 微信开发者工具打开 `apps/miniprogram/dist/`
3. 上传代码包 → 微信公众平台提交审核 → 发布

### 微信小程序合法域名配置

| 类型 | 域名 | 用途 |
|------|------|------|
| request 合法域名 | `https://lonaljgaevutlyswrelm.supabase.co` | Supabase REST API |
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

详细表结构见 [database.md](./database.md)。
