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
  docs/
    architecture.md
  data/
    normalized/ 标准化后的本地 JSON 数据
    raw/        原始抓取页面缓存
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
- 可将标准化 JSON 导入 `data/sqlite/localdex.sqlite`
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
- 真实抓取到的图片会缓存到 `apps/web/public/assets/cache/`，供 Web 端直接展示
- 全量抓取进度会写到 `data/raw/import-progress-52poke.json`，用于查看断点续跑状态

## SQLite 说明

- 默认数据库路径：`data/sqlite/localdex.sqlite`
- 导入流程：
  1. 先执行 `npm run import:fixtures` 或 `npm run import:52poke`
  2. 再执行 `npm run db:import`
- API 在检测到 SQLite 中有数据时，会优先从 SQLite 读宝可梦和道具资料；否则自动回退到 JSON

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
- 当前图片资源先用本地演示图打通展示链路，后续可以替换为真实 52Poké 图片抓取结果
- SQLite 目前主要覆盖宝可梦和道具；招式、特性仍先从 JSON 提供
- 真实 52Poké 在线抓取当前已补到“宝可梦详情 + 世代招式表 + 招式基础参数”，图片与特性详情仍需继续扩展
- 真实 52Poké 在线抓取当前会尝试缓存宝可梦原图 / 闪光图 / 形态图，以及道具图到本地静态目录；受页面结构影响，个别条目可能仍会缺图
- `import:52poke` 默认优先复用 `data/raw/` 已有页面缓存；全量抓取建议配合 `ONLY_MISSING=1` 和 `CHECKPOINT_EVERY` 使用
- 微信小程序和 App 端还没有正式 UI，当前优先把 Web 端打磨完整

## 下一步建议

如果继续做，我建议下一轮直接实现：

- 真实 52Poké 图片抓取与缓存
- 宝可梦各世代可学招式与特性的真实抓取和标准化
- 招式学习表、特性拥有者列表、属性克制表
- Web 端详情页的世代切换视图
- 微信小程序 / App 复用当前 API
