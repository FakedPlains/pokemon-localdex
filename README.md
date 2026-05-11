# Pokemon LocalDex

一个宝可梦资料库，数据统一来源于 [52Poké Wiki](https://wiki.52poke.com/)，支持本地 SQLite 和 Cloudflare D1 两种数据源。提供 Web 端和微信小程序端两种客户端，Web 端部署到 Cloudflare Pages，通过 Service Binding 代理到 Worker 访问 D1 数据库。

> 本项目使用 Git LFS 管理大文件（SQLite 数据库和 normalized JSON），克隆后需执行 `git lfs pull` 获取完整数据文件。

**在线访问**：[https://pokemon-localdex.pages.dev/](https://pokemon-localdex.pages.dev/)

## 功能概览

Pokemon LocalDex 提供宝可梦系列游戏的完整资料查询、队伍构筑和伤害计算能力。所有数据通过爬虫从 52Poké Wiki 采集，支持两种运行模式：本地模式使用 SQLite 数据库，通过 Hono API 提供服务；生产模式前端部署到 Cloudflare Pages，通过 Pages Functions + Service Binding 代理到 Worker，Worker 从 D1 数据库读取数据。

项目同时提供微信小程序端，基于 Taro 框架（React 语法）开发，通过后端 Hono API 获取数据。小程序端包含图鉴、招式、特性、道具四个核心页面，以及宝可梦详情页、工具箱（属性相克表、队伍构建、伤害计算）。

## 快速开始

### 环境要求

- Node.js >= 22（使用了实验性 SQLite 支持）
- Python >= 3.10（爬虫依赖）
- 微信开发者工具（小程序开发需要）

### 安装依赖

```bash
npm install
pip install -r packages/crawler_py/requirements.txt
```

### 爬取数据

```bash
# 全量爬取（宝可梦、招式、特性、道具）
npm run crawl:all

# 单独爬取某一类
npm run crawl:pokemon
npm run crawl:abilities
npm run crawl:moves
npm run crawl:items
```

### 本地开发（SQLite 模式）

本地开发时，后端 API 从 SQLite 数据库读取数据，前端通过 Vite proxy 转发请求到后端。

```bash
# 启动 API 服务（默认 localhost:3030，数据源 SQLite）
npm run dev:api

# 启动前端开发服务器（默认 localhost:5173）
npm run dev:web
```

前端的 `.env` 文件中 `VITE_DATA_SOURCE` 留空即走 Hono API 模式。Vite 会将 `/api` 前缀的请求代理到 `http://127.0.0.1:3030`。

### 小程序开发

小程序端位于 `apps/miniprogram/`，基于 Taro 4.2.0 框架开发，使用 React 语法编写，编译为微信小程序。

```bash
# 启动小程序开发模式（监听文件变化，自动编译）
cd apps/miniprogram
npx taro build --type weapp --watch

# 或者生产构建
npx taro build --type weapp
```

编译产物输出到 `apps/miniprogram/dist/` 目录，用微信开发者工具打开该目录即可预览和调试。小程序 AppID 为 `wx6f183945e108152a`。

小程序端通过后端 API 获取数据，API 地址通过 `.env` 文件中的 `API_BASE_URL` 配置，在编译时注入。

**微信后台域名配置**：需要在微信公众平台的「开发管理 → 开发设置 → 服务器域名」中添加以下合法域名：

- request 合法域名：`https://pokemon-localdex.pages.dev`
- downloadFile 合法域名：`https://wsrv.nl`（图片代理服务）

### 验证

```bash
npm run check:sqlite   # 检查 SQLite 数据完整性
npm run check:api      # API smoke test
npm run check:damage   # 伤害计算验证
```

## 项目结构

项目采用 npm workspaces 管理的 monorepo 结构，包含三个应用和多个共享包：

```
pokemon-localdex/
├── apps/
│   ├── api/                Hono API 服务（routes.ts 统一路由，本地 SQLite / Worker D1）
│   ├── web/                React SPA 客户端（Vite 构建）
│   └── miniprogram/        微信小程序客户端（Taro + React）
├── packages/
│   ├── battle-core/        伤害计算引擎（单一异步入口 calculateDamage）
│   │   ├── src/index.ts    calculateDamage(input, lookup)
│   │   └── src/types.ts    计算相关类型定义（DamageCalcInput、NameLookup 等）
│   ├── store/              数据存储层
│   │   ├── shared-types/   共享类型、常量和辅助函数（@pokemon-localdex/store-types）
│   │   ├── drizzle-schema/ Drizzle ORM 表定义（与 d1-schema.sql 对应）
│   │   ├── drizzle-queries/ 统一查询逻辑（DrizzleStore 实现 IStore + NameLookup）
│   │   ├── sqlite-store/   SQLite 薄封装（创建连接，委托 drizzle-queries）
│   │   └── d1-store/       D1 薄封装（创建连接，委托 drizzle-queries）
│   └── crawler_py/         Python 爬虫（52Poké 数据采集 → SQLite）
├── functions/              Cloudflare Pages Functions（Service Binding 代理）
│   └── api/[[path]].ts     将 /api/* 请求代理到 Worker
├── schema/                 数据库 schema（D1 + 历史遗留）
├── scripts/                爬虫入口脚本
├── data/                   本地数据（SQLite [LFS]、页面缓存）
├── docs/                   技术文档
├── wrangler.toml           Cloudflare Pages 配置（Service Binding）
├── wrangler.worker.toml    Cloudflare Worker 配置（D1 绑定）
└── .github/                CI/CD 工作流
```

## 数据源架构

项目支持两种数据源，通过环境变量和部署模式切换，代码层面保持统一的接口。

**SQLite 模式**（本地开发默认）：Python 爬虫采集数据写入 SQLite，Hono API 通过 `sqlite-store` → `drizzle-queries` 读取数据库，前端通过 API 获取数据。完整链路为 `React SPA → Hono API → sqlite-store → drizzle-queries → SQLite`。

**D1 模式**（Cloudflare Pages 生产部署）：数据存储在 Cloudflare D1（SQLite 兼容），Worker 通过 `d1-store` → `drizzle-queries` 读取数据库，前端通过 Pages Functions 的 Service Binding 代理请求到 Worker。链路为 `React SPA → Pages Functions → Service Binding → Worker → d1-store → drizzle-queries → D1`。

**小程序模式**：小程序通过 `Taro.request` 调用后端 API（与 Web 端共用同一套 API），API 地址在编译时通过 `defineConstants` 注入。

环境变量控制：

| 变量 | 位置 | 值 | 效果 |
|------|------|------|------|
| `DATA_SOURCE` | 后端 | `sqlite`（默认） | API 使用 SQLite |
| `DATA_SOURCE` | Worker | `d1` | Worker 使用 D1 |
| `API_BASE_URL` | 小程序 | 后端地址 | 小程序请求的 API 基地址 |

## Cloudflare Pages 部署

项目通过 GitHub Actions 自动部署到 Cloudflare Pages。每次推送到 `main` 分支会触发构建和部署。

### 部署架构

```
用户浏览器
    │
    ▼
Cloudflare Pages（静态资源 + Pages Functions）
    │
    │ /api/* → Service Binding
    ▼
Cloudflare Worker (pokemon-localdex-api)
    │
    │ D1 binding
    ▼
Cloudflare D1 数据库 (pokemon-localdex-d1)
```

Pages Functions（`functions/api/[[path]].ts`）通过 Service Binding 将所有 `/api/*` 请求转发给名为 `pokemon-localdex-api` 的 Worker，Worker 从 D1 数据库读取数据并返回响应。

### CI/CD 工作流

工作流文件位于 `.github/workflows/deploy-cf.yml`，推送到 `main` 分支时自动触发：

1. 删除 `package-lock.json` 后重新 `npm install`（确保 native binding 匹配 CI 平台）
2. 执行 `npm run build:web` 构建前端
3. 部署 Worker（`wrangler deploy --config wrangler.worker.toml`）
4. 部署 Pages（`wrangler pages deploy dist --project-name=pokemon-localdex`）

### GitHub Secrets 配置

首次部署前需在 GitHub 仓库的 Settings → Secrets and variables → Actions 中添加：

- `CLOUDFLARE_API_TOKEN` — Cloudflare API Token（需要 Workers/Pages/D1 权限）
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare Account ID

### 分支保护规则

`main` 分支设置了保护规则：禁止强制推送（force push），所有代码变更必须通过 Pull Request 合并。这确保了部署的可追溯性和代码审查流程。

## 已有功能

### Web 端

#### 图鉴浏览

全国图鉴列表，支持按名称/编号搜索、属性筛选和世代筛选。点击宝可梦可查看详情，包括普通/闪光图片切换、多形态切换（超级进化、地区形态、面具形态等）、种族值雷达图、能力值计算器（支持性格/IV/EV 调节）、按世代可学招式表，以及进化链展示。种族值标签页支持世代切换，可查看不同世代的种族值变化。

#### 招式查询

完整招式列表，支持按名称搜索和属性筛选。招式详情展示威力、命中、PP、效果描述，以及各世代的参数变化记录。

#### 特性查询

完整特性列表，支持按名称搜索。特性详情展示效果描述和各世代的效果变化记录。

#### 道具查询

道具列表与详情，展示道具图片、分类和效果说明。

#### 队伍构筑

6 槽队伍编辑器，支持为每个成员配置性格、等级、特性（数字 ID + 中文名称双字段存储）、携带道具和四个招式。队伍数据保存在浏览器 localStorage 中。

#### 伤害计算

独立选择攻击方和防御方，支持完整的对战环境配置：性格搜索选择（带修正属性标注）、特性内联选择、道具搜索（带图片预览）、形态切换（自动绑定道具和特性）、天气切换（晴天/大日照/雨天/大雨/沙暴/雪/乱流）、场地切换（电气/青草/薄雾/精神）等。支持从盒子/队伍快速导入配置并自动转换 EV↔SP，选择攻击方后会按该宝可梦在当前世代可学的招式自动过滤候选。招式搜索采用按需搜索模式（200ms 防抖），不预加载全部招式数据。

### 小程序端

小程序端提供宝可梦资料查询和对战工具功能，包含五个 Tab 页面和多个子页面：

**图鉴页**：宝可梦列表，支持按名称/编号搜索和属性筛选，展示图鉴编号、名称、属性标签和缩略图。点击进入详情页，展示完整信息包括属性、种族值条形图、特性、进化链等。

**招式页**：招式列表，支持按名称搜索和属性筛选，展示招式名称、属性、分类、威力、命中和 PP。

**特性页**：特性列表，支持按名称搜索，展示特性名称和效果描述。

**道具页**：道具列表，支持按名称搜索，展示道具图标、名称和效果说明。

**工具箱页**：包含属性相克表（18 属性完整克制关系矩阵）、队伍构建（本地存储队伍管理）、伤害计算（调用后端 API 计算伤害范围）三个工具。

小程序端的技术特点：通过 `SafeImage` 组件将外部图片（52Poké Wiki 等域名）代理到 `wsrv.nl` 服务加载，绕过微信小程序的域名白名单限制；通过 `Taro.request` 调用后端 Hono API 获取数据。

### 数据采集

Python 爬虫从 52Poké Wiki 采集全部 1025 只宝可梦、939 个招式、314 个特性、429 个道具的完整数据，支持增量更新和全量重建两种模式。爬虫请求时自动追加 `variant=zh-hans` 参数，确保从 Wiki 获取的原始内容即为简体中文，避免繁简转换导致的译名偏差。

## 技术栈

| 模块 | 技术 |
|------|------|
| Web 前端 | React 18 + Vite 8 |
| 小程序端 | Taro 4.2.0 + React 18 + Webpack 5 |
| 后端 API | Hono + Node.js 22（本地）/ Cloudflare Workers（生产）|
| 本地数据库 | SQLite（node:sqlite） |
| 生产数据库 | Cloudflare D1（SQLite 兼容） |
| 爬虫 | Python 3.10+ + BeautifulSoup4 |
| 大文件管理 | Git LFS（SQLite、normalized JSON） |
| 部署 | Cloudflare Pages + Workers + GitHub Actions |

整个项目统一使用 React 18.3.1，确保 Web 端和小程序端共享同一 React 版本，避免 monorepo 中的版本冲突。

## 后续规划

### 近期

- 特性拥有者列表：在特性详情页展示拥有该特性的宝可梦
- 招式学习者列表：在招式详情页展示可学习该招式的宝可梦
- 道具数据补全，扩充道具采集覆盖范围
- 小程序端招式详情页和特性详情页

### 中期

- 伤害计算器增强：接入属性克制、性格修正、道具和特性对伤害的联动影响
- 队伍分析：属性覆盖率、弱点分布、速度线对比
- 世代差异提示：在详情页高亮标注跨世代变化的字段

### 远期

- 离线 PWA 支持，完全脱离网络使用
- 多语言支持（日文、英文）

## 文档

详细的技术文档位于 `docs/` 目录：

- [系统架构](docs/architecture.md) — 整体架构设计、数据源、部署模式、小程序架构
- [数据库设计](docs/database.md) — SQLite/D1 表结构、索引和关系说明
- [API 接口](docs/api.md) — RESTful API 端点、参数和响应格式
- [爬虫指南](docs/crawler.md) — 爬虫命令、参数和运行流程
- [项目概览](docs/project-overview.md) — 目录结构、包职责和数据流
- [开发规范](docs/dev-guidelines.md) — 编码约束、分层职责和常见模式

## 数据来源

所有数据来源于 [52Poké Wiki](https://wiki.52poke.com/)，宝可梦和道具图片使用 52Poké 在线图片 URL。小程序端通过 [wsrv.nl](https://wsrv.nl/) 图片代理服务加载外部图片。
