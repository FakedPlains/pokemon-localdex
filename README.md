# Pokemon LocalDex

一个面向本地部署的宝可梦资料库项目，目标支持：

- PC 网页端
- 手机 H5 / App 容器
- 宝可梦、道具、招式、特性、世代资料查询
- 自定义队伍保存
- 对战伤害计算
- 数据统一来源于 52Poké Wiki

## 架构

采用 Python 爬虫 + SQLite 存储 + Hono API + React SPA 的四层结构：

```text
pokemon-localdex/
  apps/
    api/        Hono API 服务（托管 SPA 静态资源）
    web/        React SPA 客户端（Vite 构建）
  packages/
    battle-core 伤害计算与队伍规则核心
    crawler_py  Python 爬虫（52Poké 数据采集 → SQLite）
    sqlite-store SQLite 建表、查询适配与类型定义
  scripts/
    crawl-52poke-db.py  爬虫入口脚本
  data/
    raw/        原始抓取页面缓存（gitignored）
    sqlite/     本地 SQLite 数据库（gitignored）
```

## 运行

### 1. 爬取数据

```bash
# 全量爬取（宝可梦、招式、特性、道具）
npm run crawl:all

# 单独爬取
npm run crawl:pokemon
npm run crawl:abilities
npm run crawl:moves
npm run crawl:items
npm run crawl:catalog

# 清除数据后重新爬取
python3 scripts/crawl-52poke-db.py all --clean
```

### 2. 启动 API

```bash
npm run dev:api
```

默认监听 `127.0.0.1:3030`。如果你需要改端口或监听地址：

```bash
HOST=127.0.0.1 PORT=3031 npm run dev:api
```

### 3. 启动 Web 开发服务器

```bash
npm run dev:web
```

### 4. 验证

```bash
npm run check:sqlite   # 检查 SQLite 数据
npm run check:api      # API smoke test
npm run check:damage   # 伤害计算验证
```

## API 接口

- `GET /pokemon` — 宝可梦列表（支持 `?q=&type=&generation=` 筛选）
- `GET /pokemon/:id` — 宝可梦详情
- `GET /items` — 道具列表
- `GET /items/:id` — 道具详情
- `GET /moves` — 招式列表（支持 `?q=&type=&generation=` 筛选）
- `GET /moves/:id` — 招式详情
- `GET /abilities` — 特性列表（支持 `?q=&generation=` 筛选）
- `GET /abilities/:id` — 特性详情
- `GET /teams` — 队伍列表
- `POST /teams` — 保存队伍
- `POST /battle/damage` — 伤害计算

## 数据来源

- 线上原始数据来源：`https://wiki.52poke.com/`
- 爬虫将原始 HTML 缓存到 `data/raw/`，解析后写入 `data/sqlite/localdex.sqlite`
- 宝可梦和道具图片使用 52Poké 在线图片 URL

## SQLite 说明

- 默认数据库路径：`data/sqlite/localdex.sqlite`
- 所有核心表的 `id` 使用 `INTEGER PRIMARY KEY AUTOINCREMENT`
- 外键关系使用自增整数 ID，API 查询兼容数字 ID、`legacy_id`、`slug` 和中文名
- 特性表以 `(number, name_zh)` 作为唯一键

### 主要表结构

- `pokemon`、`moves`、`abilities`、`items`：主表
- `types`、`generations`、`game_versions`：字典表
- `image_assets`：统一图片表
- `pokemon_forms`、`pokemon_form_stats`、`pokemon_form_types`、`pokemon_form_abilities`：形态资料
- `pokemon_evolution_members`：进化链
- `pokemon_moves`：按世代可学招式
- `move_generation_records`、`ability_generation_records`：招式/特性世代差异
- `pokemon_generation_records`、`pokemon_generation_types`、`pokemon_generation_abilities`、`pokemon_generation_stats`：宝可梦世代差异

## Web 界面

当前已有 React SPA 前端，由 `apps/api` 托管静态资源，包含：

- 图鉴搜索页：支持关键字、属性、世代筛选
- 宝可梦详情页：展示图片、种族值、世代与地区图鉴
- 道具页、招式页、特性页：搜索和世代差异查看
- 队伍页：6 槽成员编辑、性格/等级/特性/道具/招式输入
- 伤害页：独立选择攻守双方并计算伤害
