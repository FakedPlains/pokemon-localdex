# Pokemon LocalDex

一个宝可梦资料库，数据统一来源于 [52Poké Wiki](https://wiki.52poke.com/)，支持本地 SQLite 和云端 Supabase 双数据源，可部署到 GitHub Pages 作为纯静态站点使用。

**在线访问**：[https://fakedplains.github.io/pokemon-localdex/](https://fakedplains.github.io/pokemon-localdex/)

## 功能概览

Pokemon LocalDex 提供宝可梦系列游戏的完整资料查询、队伍构筑和伤害计算能力。所有数据通过爬虫从 52Poké Wiki 采集，支持两种运行模式：本地模式使用 SQLite 数据库，通过 Hono API 提供服务；在线模式前端直连 Supabase，无需后端即可部署到 GitHub Pages 等静态托管平台。

## 快速开始

### 环境要求

- Node.js >= 22（使用了实验性 SQLite 支持）
- Python >= 3.10（爬虫依赖）

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

### 验证

```bash
npm run check:sqlite   # 检查 SQLite 数据完整性
npm run check:api      # API smoke test
npm run check:damage   # 伤害计算验证
```

## 数据源架构

项目支持两种数据源，通过环境变量切换，代码层面保持统一的接口。

**SQLite 模式**（本地开发默认）：Python 爬虫采集数据写入 SQLite，Hono API 通过 `sqlite-store` 包读取数据库，前端通过 API 获取数据。完整链路为 `React SPA → Hono API → sqlite-store → SQLite`。

**Supabase 模式**（GitHub Pages 部署）：数据存储在 Supabase（PostgreSQL），前端通过 `@supabase/supabase-js` 直连查询，无需后端服务。链路为 `React SPA → supabase-js → Supabase`。后端 API 也支持 Supabase 模式，通过 `supabase-store` 包访问，链路为 `React SPA → Hono API → supabase-store → Supabase`。

环境变量控制：

| 变量 | 位置 | 值 | 效果 |
|------|------|------|------|
| `DATA_SOURCE` | 后端 | `sqlite`（默认） | API 使用 SQLite |
| `DATA_SOURCE` | 后端 | `supabase` | API 使用 Supabase |
| `VITE_DATA_SOURCE` | 前端 | 空（默认） | 前端走 Hono API |
| `VITE_DATA_SOURCE` | 前端 | `supabase` | 前端直连 Supabase |

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

### 图鉴浏览

全国图鉴列表，支持按名称/编号搜索、属性筛选和世代筛选。点击宝可梦可查看详情，包括普通/闪光图片切换、多形态切换（超级进化、地区形态、面具形态等）、种族值雷达图、能力值计算器（支持性格/IV/EV 调节）、按世代可学招式表，以及进化链展示。种族值标签页支持世代切换，可查看不同世代的种族值变化。

### 招式查询

完整招式列表，支持按名称搜索和属性筛选。招式详情展示威力、命中、PP、效果描述，以及各世代的参数变化记录。

### 特性查询

完整特性列表，支持按名称搜索。特性详情展示效果描述和各世代的效果变化记录。

### 道具查询

道具列表与详情，展示道具图片、分类和效果说明。

### 队伍构筑

6 槽队伍编辑器，支持为每个成员配置性格、等级、特性、携带道具和四个招式。本地模式下队伍数据保存在 `data/teams.json` 文件中；Supabase 直连模式下保存在浏览器 localStorage 中。

### 伤害计算

独立选择攻击方和防御方，手动配置等级、招式威力、属性相克等参数进行伤害计算。支持从当前队伍快速导入宝可梦配置，选择攻击方后会按该宝可梦在当前世代可学的招式自动过滤候选。注意：伤害计算功能在 GitHub Pages 静态部署模式下不可用，因为计算逻辑在后端执行。

### 数据采集

Python 爬虫从 52Poké Wiki 采集全部 1025 只宝可梦、935 个招式、314 个特性的完整数据，支持增量更新和全量重建两种模式。

## 后续规划

### 近期

- 属性克制表可视化，展示完整的 18 属性相克关系
- 特性拥有者列表：在特性详情页展示拥有该特性的宝可梦
- 招式学习者列表：在招式详情页展示可学习该招式的宝可梦
- 道具数据补全，扩充道具采集覆盖范围

### 中期

- 伤害计算器增强：接入属性克制、性格修正、道具和特性对伤害的联动影响
- 队伍分析：属性覆盖率、弱点分布、速度线对比
- 世代差异提示：在详情页高亮标注跨世代变化的字段

### 远期

- 移动端适配优化，提供更好的手机 H5 体验
- 离线 PWA 支持，完全脱离网络使用
- 多语言支持（日文、英文）

## 文档

详细的技术文档位于 `docs/` 目录：

- [系统架构](docs/architecture.md) — 整体架构设计、双数据源、部署模式
- [数据库设计](docs/database.md) — SQLite 表结构、索引和关系说明
- [API 接口](docs/api.md) — RESTful API 端点、参数和响应格式
- [爬虫指南](docs/crawler.md) — 爬虫命令、参数和运行流程

## 数据来源

所有数据来源于 [52Poké Wiki](https://wiki.52poke.com/)，宝可梦和道具图片使用 52Poké 在线图片 URL。
