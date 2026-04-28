# Pokemon LocalDex

一个面向本地部署的宝可梦资料库项目骨架，目标支持：

- PC 网页端
- 手机 H5 / App 容器
- 微信小程序
- 宝可梦、道具、招式、特性、世代资料查询
- 自定义队伍保存
- 对战伤害计算
- 数据统一来源于 52Poké Wiki

## 当前阶段

当前仓库是第一版基础骨架，已经包含：

- monorepo 目录结构
- 宝可梦资料标准化数据模型
- 伤害计算核心的第一版实现
- 52Poké 列表页与详情页解析的第一版规则
- 本地 API 服务骨架
- Web / 小程序端的应用边界规划
- 离线 fixture 导入与 smoke test
- SQLite 结构化存储，核心表使用自增整数主键，并保留 `legacy_id` 追溯原始业务标识
- 宝可梦、招式、特性、道具、图片、形态、进化链和世代差异数据的关系化入库

## 目录

```text
pokemon-localdex/
  apps/
    api/        本地 API 服务
    web/        PC/H5 Web 客户端规划
    weapp/      微信小程序端规划
  packages/
    battle-core 伤害计算与队伍规则核心
    data-model  统一数据模型与本地 JSON 数据加载
    scraper     52Poké 采集与标准化导入
    sqlite-store SQLite 建表、导入和查询适配
  docs/
    architecture.md
  data/
    normalized/ 标准化后的本地 JSON 数据
    raw/        原始抓取页面缓存
    sqlite/     本地 SQLite 数据库
```

## 先做什么

建议按这个顺序推进：

1. 先完成 `packages/scraper`，把 52Poké 页面抓下来并标准化。
2. 再完善 `apps/api`，提供统一查询接口。
3. 然后优先做 `apps/web`，确认资料浏览和队伍构筑流程。
4. 最后把共享逻辑接到微信小程序和 App 容器。

## 运行

当前仓库没有锁文件，也还没安装第三方依赖。现阶段可直接运行这些纯 Node 命令：

```bash
npm run dev:api
npm run check:damage
npm run import:fixtures
npm run db:import
npm run check:sqlite
npm run check:api
```

默认监听 `127.0.0.1:3030`。如果你需要改端口或监听地址，可以这样启动：

```bash
HOST=127.0.0.1 PORT=3031 npm run dev:api
```

启动后，浏览器访问：

```bash
http://localhost:3030/
```

如果当前机器能访问 52Poké，也可以直接抓真实页面：

```bash
npm run import:52poke
```

常用的全量抓取参数：

```bash
ONLY_MISSING=1 npm run import:52poke
START_DEX=1 END_DEX=151 CHECKPOINT_EVERY=10 npm run import:52poke
REFRESH_RAW=1 START_DEX=1 END_DEX=30 npm run import:52poke
```

## 当前已实现的数据能力

- 解析全国图鉴简单版，生成宝可梦基础索引
- 解析道具列表，生成分类、名称和效果摘要
- 解析宝可梦详情页中的属性、特性、身高、体重、图鉴颜色、捕获率、性别比例、种族值
- 解析宝可梦形态列表和地区图鉴编号，并汇总为世代可用性信息
- 支持为宝可梦记录普通/闪光图片、超级进化形态和按世代差异记录
- 支持为宝可梦记录按世代拆分的可学招式表，并附带升级 / 学习器 / 回忆等学会方式
- 支持招式与特性的独立资料实体，并记录按世代的效果差异
- `import:52poke` 会尝试继续抓取宝可梦各世代招式表，并从招式表里补出本地 `moves.json` 的基础参数
- 将标准化结果写入 `data/normalized/pokemon.json`、`data/normalized/items.json`、`data/normalized/moves.json`、`data/normalized/abilities.json`
- 可将标准化 JSON 结构化导入 `data/sqlite/localdex.sqlite`
- SQLite 中宝可梦、招式、特性、道具、形态、图片、进化链、世代属性、世代特性、世代种族值、可学招式均已关系化存储
- 通过 API 提供：
  - `GET /pokemon`
  - `GET /pokemon?q=皮卡&type=电&generation=1`
  - `GET /pokemon/:id`
  - `GET /items`
  - `GET /items/:id`
  - `GET /moves`
  - `GET /moves/:id`
  - `GET /abilities`
  - `GET /abilities/:id`
  - `GET /teams`
  - `POST /teams`
  - `POST /battle/damage`

## 数据来源原则

- 线上原始数据来源：`https://wiki.52poke.com/`
- 本地落地形态分两层：
  - `data/raw/`：保留原始页面快照，便于追溯
  - `data/normalized/`：转换为统一 JSON/SQLite 结构，供多端复用
- 宝可梦和道具图片优先存储 52Poké 在线图片 URL；宝可梦图片取自详情页“形象”区域的 Pokemon HOME 图片，并将缩略图 URL 还原为原图 URL
- 全量抓取进度会写到 `data/raw/import-progress-52poke.json`，用于查看断点续跑状态

## SQLite 说明

- 默认数据库路径：`data/sqlite/localdex.sqlite`
- 导入流程：
  1. 先执行 `npm run import:fixtures` 或 `npm run import:52poke`
  2. 再执行 `npm run db:import`
- API 在检测到 SQLite 中有数据时，会优先从 SQLite 读取宝可梦、道具、招式和特性资料；否则自动回退到 JSON
- 所有核心表的 `id` 都使用 `INTEGER PRIMARY KEY AUTOINCREMENT`
- 原标准化 JSON 中的字符串 ID 会写入 `legacy_id`，例如 `pokemon-0003`、`move-十万伏特`、`ability-静电`
- 外键关系使用自增整数 ID，API 查询仍兼容数字 ID、`legacy_id`、`slug` 和中文名

### 主要表结构

- `pokemon`、`moves`、`abilities`、`items`：宝可梦、招式、特性、道具主表
- `types`、`generations`：属性与世代字典表，其中 `generations.number` 表示第几世代
- `image_assets`：统一图片表，按 `entity_type`、`entity_id`、`form_id`、`image_kind` 记录在线图片 URL
- `pokemon_forms`、`pokemon_form_stats`、`pokemon_form_types`、`pokemon_form_abilities`：形态、超级进化、超极巨化等形态资料
- `pokemon_evolution_members`：进化链成员关系，用于图鉴按进化链展示
- `pokemon_moves`：宝可梦按世代可学招式，包含学习方式、等级、版本备注和排序
- `move_generation_records`、`ability_generation_records`：招式/特性自身在不同世代的效果差异

### 宝可梦世代差异表

`pokemon_generation_records` 现在只保存宝可梦与世代的基础记录、标签和备注。具体变化拆分到以下表：

- `pokemon_generation_types`：记录各世代属性变化
- `pokemon_generation_abilities`：记录各世代普通特性和隐藏特性变化
- `pokemon_generation_stats`：记录各世代种族值变化

这让“某只宝可梦在某世代属性变了、特性变了、种族值变了”可以分别查询和维护，也避免把多个领域字段混在同一张记录表里。

## Web 界面

当前已经有一版零依赖 Web 前端，由 `apps/api` 直接托管静态资源。当前页面包含：

- 图鉴搜索页：支持关键字、属性、世代筛选
- 宝可梦详情页：展示普通 / 闪光图片、超级进化形态、种族值、世代与地区图鉴
- 道具页：查看道具图片、分类与效果摘要
- 招式页：搜索招式并查看按世代的威力、命中、PP、效果差异
- 特性页：搜索特性并查看按世代的效果差异
- 队伍页：支持 6 槽成员编辑、性格/等级/特性/道具/招式输入、IV/EV 编辑、载入已保存队伍并覆盖保存
- 伤害页：可独立选择攻守双方宝可梦并设置等级/性格/IV/EV，不依赖队伍构筑；支持直接选择招式并自动带出当前世代的属性、分类、威力、命中和效果摘要，并按攻击方在对应世代真正可学的招式自动过滤候选列表

## 当前限制

- 52Poké 页面结构比较复杂，当前多形态和跨世代差异仍然采用启发式解析，后续还需要针对形态页模板做更细拆分
- 图片使用 52Poké 在线 URL，部署环境需要允许访问 `s1.52poke.com`
- 真实 52Poké 在线抓取当前已补到“宝可梦详情 + 世代招式表 + 招式/特性/道具基础资料 + Pokemon HOME 图片 URL”
- 受页面结构影响，个别宝可梦形态、特性文本或招式学习表仍可能需要后续人工校正规则
- `import:52poke` 默认优先复用 `data/raw/` 已有页面缓存；全量抓取建议配合 `ONLY_MISSING=1` 和 `CHECKPOINT_EVERY` 使用
- 微信小程序和 App 端还没有正式 UI，当前优先把 Web 端打磨完整

## 下一步建议

如果继续做，我建议下一轮直接实现：

- 继续校正 52Poké 多形态、地区形态、特殊形态的解析规则
- 补充属性克制表、性格、道具和特性对伤害计算的联动
- 完善特性拥有者列表和招式学习表的反向查询
- Web 端详情页继续增强世代切换视图和字段差异提示
- 微信小程序 / App 复用当前 API
