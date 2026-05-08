# Pokemon LocalDex

一个宝可梦资料库，数据统一来源于 [52Poké Wiki](https://wiki.52poke.com/)，支持本地 SQLite 和云端 Supabase 双数据源。提供 Web 端和微信小程序端两种客户端，Web 端可部署到 GitHub Pages 作为纯静态站点使用。

> 本项目使用 Git LFS 管理大文件（SQLite 数据库和 normalized JSON），克隆后需执行 `git lfs pull` 获取完整数据文件。

**在线访问**：[https://fakedplains.github.io/pokemon-localdex/](https://fakedplains.github.io/pokemon-localdex/)

## 功能概览

Pokemon LocalDex 提供宝可梦系列游戏的完整资料查询、队伍构筑和伤害计算能力。所有数据通过爬虫从 52Poké Wiki 采集，支持两种运行模式：本地模式使用 SQLite 数据库，通过 Hono API 提供服务；在线模式前端直连 Supabase，无需后端即可部署到 GitHub Pages 等静态托管平台。

项目同时提供微信小程序端，基于 Taro 框架（React 语法）开发，通过 Supabase PostgREST REST API 直连数据库，无需后端服务。小程序端包含图鉴、招式、特性、道具四个核心页面，以及宝可梦详情页。

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

### 本地开发（Supabase 模式）

如果希望本地开发时也使用 Supabase 作为数据源，有两种方式。

后端切换：设置环境变量 `DATA_SOURCE=supabase` 启动 API 服务，同时需要配置 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`。

前端直连：在 `apps/web/.env` 中设置 `VITE_DATA_SOURCE=supabase` 并配置 Supabase URL 和 anon key，前端会绕过 Hono API 直接查询 Supabase。

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

小程序端直连 Supabase PostgREST REST API，不依赖后端服务。Supabase 连接配置位于 `apps/miniprogram/src/utils/config.js`。

**微信后台域名配置**：需要在微信公众平台的「开发管理 → 开发设置 → 服务器域名」中添加以下合法域名：

- request 合法域名：`https://lonaljgaevutlyswrelm.supabase.co`
- downloadFile 合法域名：`https://wsrv.nl`（图片代理服务）

### 验证

```bash
npm run check:sqlite   # 检查 SQLite 数据完整性
npm run check:api      # API smoke test
npm run check:damage   # 伤害计算验证
```

## 项目结构

项目采用 npm workspaces 管理的 monorepo 结构，包含三个应用和四个共享包：

```
pokemon-localdex/
├── apps/
│   ├── api/                Hono API 服务（托管 SPA 静态资源）
│   ├── web/                React SPA 客户端（Vite 构建）
│   └── miniprogram/        微信小程序客户端（Taro + React）
├── packages/
│   ├── battle-core/        伤害计算与队伍规则核心
│   ├── crawler_py/         Python 爬虫（52Poké 数据采集 → SQLite）
│   ├── sqlite-store/       SQLite 建表、查询适配与类型定义
│   └── supabase-store/     Supabase 查询适配（与 sqlite-store 同接口）
├── supabase/               Supabase 数据库 schema
├── scripts/                爬虫入口脚本
├── data/                   本地数据（SQLite [LFS]、页面缓存）
├── docs/                   技术文档
└── .github/                CI/CD 工作流
```

## 数据源架构

项目支持两种数据源，通过环境变量切换，代码层面保持统一的接口。

**SQLite 模式**（本地开发默认）：Python 爬虫采集数据写入 SQLite，Hono API 通过 `sqlite-store` 包读取数据库，前端通过 API 获取数据。完整链路为 `React SPA → Hono API → sqlite-store → SQLite`。

**Supabase 模式**（GitHub Pages 部署）：数据存储在 Supabase（PostgreSQL），前端通过 `@supabase/supabase-js` 直连查询，无需后端服务。链路为 `React SPA → supabase-js → Supabase`。后端 API 也支持 Supabase 模式，通过 `supabase-store` 包访问，链路为 `React SPA → Hono API → supabase-store → Supabase`。

**小程序模式**：小程序端通过 `Taro.request` 直接调用 Supabase PostgREST REST API，不使用 `@supabase/supabase-js` SDK（该 SDK 依赖浏览器 API，在小程序环境中不可用）。链路为 `Taro 小程序 → Taro.request → Supabase PostgREST`。

环境变量控制：

| 变量 | 位置 | 值 | 效果 |
|------|------|------|------|
| `DATA_SOURCE` | 后端 | `sqlite`（默认） | API 使用 SQLite |
| `DATA_SOURCE` | 后端 | `supabase` | API 使用 Supabase |
| `VITE_DATA_SOURCE` | 前端 | 空（默认） | 前端走 Hono API |
| `VITE_DATA_SOURCE` | 前端 | `supabase` | 前端直连 Supabase |

小程序端的 Supabase 配置直接写在 `apps/miniprogram/src/utils/config.js` 中，不通过环境变量控制。

## GitHub Pages 部署

项目通过 GitHub Actions 自动部署到 GitHub Pages。每次推送到 `main` 分支会触发构建，产物部署到 `gh-pages` 分支。

Supabase 凭证通过 GitHub Repository Secrets 注入，不存储在代码仓库中。首次部署前需要在 GitHub 仓库的 Settings → Secrets and variables → Actions 中添加以下两个 Secret：

- `VITE_SUPABASE_URL` — Supabase 项目 URL（如 `https://xxx.supabase.co`）
- `VITE_SUPABASE_ANON_KEY` — Supabase anon/public key

CI 构建时这些 Secret 作为环境变量注入 Vite，覆盖 `.env.production` 中的空占位符。`GITHUB_PAGES=true` 环境变量会将 Vite 的 `base` 设置为 `/pokemon-localdex/`，以匹配 GitHub Pages 的子路径。

手动部署：

```bash
# 本地构建 GitHub Pages 产物（需要手动提供 Supabase 凭证）
GITHUB_PAGES=true \
  VITE_DATA_SOURCE=supabase \
  VITE_SUPABASE_URL=https://xxx.supabase.co \
  VITE_SUPABASE_ANON_KEY=your-anon-key \
  npm run build:web

# 构建产物在 dist/ 目录
```

CI 工作流文件位于 `.github/workflows/deploy-pages.yml`，使用 `peaceiris/actions-gh-pages` 将 `dist/` 目录推送到 `gh-pages` 分支。

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

6 槽队伍编辑器，支持为每个成员配置性格、等级、特性、携带道具和四个招式。本地模式下队伍数据保存在 `data/teams.json` 文件中；Supabase 直连模式下保存在浏览器 localStorage 中。

#### 伤害计算

独立选择攻击方和防御方，支持完整的对战环境配置：性格搜索选择（带修正属性标注）、特性内联选择、道具搜索（带图片预览）、形态切换（自动绑定道具和特性）、天气切换（晴天/大日照/雨天/大雨/沙暴/雪/乱流）、场地切换（电气/青草/薄雾/精神）等。支持从盒子/队伍快速导入配置并自动转换 EV↔SP，选择攻击方后会按该宝可梦在当前世代可学的招式自动过滤候选。注意：伤害计算功能在 GitHub Pages 静态部署模式下不可用，因为计算逻辑在后端执行。

### 小程序端

小程序端提供轻量级的宝可梦资料查询功能，包含四个 Tab 页面和一个详情页：

**图鉴页**：宝可梦列表，支持按名称/编号搜索和属性筛选，展示图鉴编号、名称、属性标签和缩略图。点击进入详情页，展示完整信息包括属性、种族值条形图、特性、进化链等。

**招式页**：招式列表，支持按名称搜索和属性筛选，展示招式名称、属性、分类、威力、命中和 PP。

**特性页**：特性列表，支持按名称搜索，展示特性名称和效果描述。

**道具页**：道具列表，支持按名称搜索，展示道具图标、名称和效果说明。

小程序端的技术特点：通过 `SafeImage` 组件将外部图片（52Poké Wiki 等域名）代理到 `wsrv.nl` 服务加载，绕过微信小程序的域名白名单限制；使用自封装的 Supabase PostgREST 客户端（`supabase.js`）替代官方 SDK，适配小程序的 `Taro.request` 网络接口。

### 数据采集

Python 爬虫从 52Poké Wiki 采集全部 1025 只宝可梦、939 个招式、314 个特性、429 个道具的完整数据，支持增量更新和全量重建两种模式。爬虫请求时自动追加 `variant=zh-hans` 参数，确保从 Wiki 获取的原始内容即为简体中文，避免繁简转换导致的译名偏差。

## 技术栈

| 模块 | 技术 |
|------|------|
| Web 前端 | React 18 + Vite 8 |
| 小程序端 | Taro 4.2.0 + React 18 + Webpack 5 |
| 后端 API | Hono + Node.js 22 |
| 本地数据库 | SQLite（node:sqlite） |
| 云端数据库 | Supabase（PostgreSQL） |
| 爬虫 | Python 3.10+ + BeautifulSoup4 |
| 大文件管理 | Git LFS（SQLite、normalized JSON） |
| 部署 | GitHub Pages + GitHub Actions |

整个项目统一使用 React 18.3.1，确保 Web 端和小程序端共享同一 React 版本，避免 monorepo 中的版本冲突。

## 后续规划

### 近期

- 属性克制表可视化，展示完整的 18 属性相克关系
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

- [系统架构](docs/architecture.md) — 整体架构设计、双数据源、部署模式、小程序架构
- [数据库设计](docs/database.md) — SQLite 表结构、索引和关系说明
- [API 接口](docs/api.md) — RESTful API 端点、参数和响应格式、小程序端 REST 封装
- [爬虫指南](docs/crawler.md) — 爬虫命令、参数和运行流程

## 数据来源

所有数据来源于 [52Poké Wiki](https://wiki.52poke.com/)，宝可梦和道具图片使用 52Poké 在线图片 URL。小程序端通过 [wsrv.nl](https://wsrv.nl/) 图片代理服务加载外部图片。
