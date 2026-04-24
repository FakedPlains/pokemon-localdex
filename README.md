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
npm run check:api
```

如果当前机器能访问 52Poké，也可以直接抓真实页面：

```bash
POKEMON_LIMIT=30 npm run import:52poke
```

## 当前已实现的数据能力

- 解析全国图鉴简单版，生成宝可梦基础索引
- 解析道具列表，生成分类、名称和效果摘要
- 解析宝可梦详情页中的属性、特性、身高、体重、图鉴颜色、捕获率、性别比例、种族值
- 将标准化结果写入 `data/normalized/pokemon.json` 和 `data/normalized/items.json`
- 通过 API 提供：
  - `GET /pokemon`
  - `GET /pokemon/:id`
  - `GET /items`
  - `GET /items/:id`
  - `GET /teams`
  - `POST /teams`
  - `POST /battle/damage`

## 数据来源原则

- 线上原始数据来源：`https://wiki.52poke.com/`
- 本地落地形态分两层：
  - `data/raw/`：保留原始页面快照，便于追溯
  - `data/normalized/`：转换为统一 JSON/SQLite 结构，供多端复用

## 当前限制

- 52Poké 页面结构比较复杂，宝可梦多形态页面仍然采用启发式解析，后续还需要针对形态页和跨世代字段做更细拆分
- 当前标准化数据先落 JSON，SQLite 还没接入
- Web / 小程序端还没有正式 UI，只保留了应用边界和 API 契约

## 下一步建议

如果继续做，我建议下一轮直接实现：

- 多形态与各世代差异数据结构
- SQLite 建库与索引
- 宝可梦详情页 API 查询和搜索过滤
- 本地 SQLite 建库和导入
- Web 端资料检索页面
