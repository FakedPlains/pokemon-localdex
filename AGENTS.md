# Pokemon LocalDex 项目规则

## 作用范围

本文件适用于整个仓库。每次开始开发前，应先读取本文件；如果后续某个子目录新增了自己的 `AGENTS.md`，则编辑该子目录文件时优先遵守最近的规则文件，再叠加上层规则中不冲突的部分。

非平凡改动开始前，至少阅读：

- `README.md`
- `docs/project-overview.md`
- `docs/dev-guidelines.md`
- 与改动相关的专题文档：`docs/architecture.md`、`docs/api.md`、`docs/database.md`、`docs/crawler.md`

本文件是面向开发执行的浓缩规则；详细背景和设计说明以 `docs/` 下文档为准。

## 项目结构

Pokemon LocalDex 是一个 npm workspaces monorepo，包含三个应用和多个共享包：

- `apps/api`：Hono API 服务，同时服务本地 Node.js/SQLite 模式和 Cloudflare Workers/D1 模式。
- `apps/web`：React 18 + Vite 的 Web SPA。
- `apps/miniprogram`：Taro 4.2.0 + React 18 的微信小程序。
- `packages/battle-core`：伤害计算引擎，必须保持无 I/O、无 SQL、无运行时绑定。
- `packages/store/shared-types`：共享类型、常量、辅助函数和 `IStore` 接口。
- `packages/store/drizzle-schema`：Drizzle 表定义，与 `schema/d1-schema.sql` 保持一致。
- `packages/store/drizzle-queries`：统一查询实现，`DrizzleStore` 同时实现 `IStore` 和 `NameLookup`。
- `packages/store/sqlite-store`：Node.js SQLite 薄封装，只负责数据库打开、旧 schema 轻量迁移和委托查询。
- `packages/store/d1-store`：Cloudflare D1 薄封装，只负责创建 Drizzle D1 实例和委托查询。
- `packages/crawler_py`：从 52Poké Wiki 采集数据并写入 SQLite 的 Python 爬虫。
- `functions/api/[[path]].ts`：Cloudflare Pages Function，将 `/api/*` 代理到 Worker Service Binding。

保持职责边界：不要把数据库查询逻辑写进 `apps/api`，不要让 `battle-core` 依赖 SQL/HTTP/localStorage/Node API，不要让前端直接访问数据库。

## 环境与命令

使用 Node.js 22 或更高版本。本地 SQLite 依赖 Node.js 22 的实验性内置 `node:sqlite`。

常用命令：

```bash
npm install
pip install -r packages/crawler_py/requirements.txt

npm run dev:api
npm run dev:web

npm run build:web
npm run check:api
npm run check:sqlite
npm run check:damage

cd apps/miniprogram
npx taro build --type weapp
npx taro build --type weapp --watch
```

主数据库文件是 `data/sqlite/localdex.sqlite`，由 Git LFS 管理。新 clone 仓库后先执行 `git lfs pull`，再期待本地数据可用。

不要随意运行耗时的全量爬虫 `npm run crawl:all`。开发解析逻辑时优先使用 `--dry-run`、`--limit`、`--pokemon`、`--name` 等参数做小范围验证。

## 依赖版本规则

不要随意升级 React、Taro 或 Vite React 插件。

- React 目标版本是 18.3.1，必须保持与 Taro 4.2.0 兼容。
- 不得升级到 React 19。
- 不得升级到 `@vitejs/plugin-react@6.x`。
- Taro 相关包固定为 4.2.0；若要升级，必须在微信开发者工具中完整回归。
- 保留 Node.js 22 假设，除非明确重构 SQLite 存储层。

当前部分 `package.json` 中 React 版本仍带有 caret 范围。触碰依赖时不要进一步放宽范围，也不要引入会把 React 提升到 19 的安装结果；如专门处理依赖版本，应优先按文档意图固定到兼容版本。

## 数据源与爬虫规则

项目有两个数据源：

- **52Poké Wiki**（主数据源）：宝可梦图鉴、招式、特性、道具、进化链、招式学习表、Champions 赛制等全部基础数据。
- **pokechamdb.com**（使用率数据源）：Champions 排位对战的使用率排名和配置统计（招式、道具、特性、性格、队友、EV 分布）。

除上述两个已接入数据源外，不要引入第三方数据源或手写权威数据。

爬虫开发必须遵守：

- 52Poké 数据使用 `packages/crawler_py/localdex_crawler/fetcher.py` 中的缓存优先流程。
- pokechamdb 数据使用 `fetcher_pokechamdb.py` 中的独立 fetcher，缓存目录为 `data/raw/pokechamdb/`。pokechamdb 站点由 Cloudflare Worker SSR 提供服务，有 bot 保护，默认请求间隔 4 秒，优先使用 curl（支持 brotli）。
- 保留自定义 User-Agent、请求间隔和超时控制。
- 请求 52Poké 页面时优先使用 `variant=zh-hans` 获取简体中文，OpenCC 只作为补充兜底。
- 保留 NFKC 标准化、空白清理和摘要清理逻辑。
- 写库使用 upsert 语义；需要更新的记录不要用 `INSERT OR IGNORE`。
- `_upsert_pokemon_forms`（位于 `upsert/pokemon.py`）对 `name_en` 字段有保护机制：如果数据库中已有非空 `name_en`，而本次 payload 的 `name_en` 为空或 None，则保留数据库现有值不覆盖。这防止了因 `form_name_rules.json` 规则不完整而意外清空已有的英文名。
- pokechamdb 使用率数据的 partner（队友）匹配以中文名为主键，通过 `POKECHAMDB_NAME_ZH_ALIASES` 字典处理译名差异。不使用日文名匹配。
- 爬虫代码按四层组织：基础工具层（顶层 `.py`）、解析层（`parsers/`）、写库层（`upsert/`）、CLI 调度层（`cli.py`）。Parser 不写库，Upsert 不解析 HTML，CLI 负责串联管道。
- 新增数据类型时，在 `parsers/` 下新增解析模块，在 `upsert/` 下新增写库模块，同步增加 CLI 子命令、schema 和文档。
- `data/raw/` 等页面缓存默认不提交。

## 数据库与 Store 规则

`schema/d1-schema.sql` 是数据库 schema 的 source of truth。当前实际代码链路是：

```text
schema/d1-schema.sql
  -> packages/store/drizzle-schema
  -> packages/store/drizzle-queries
  -> packages/store/sqlite-store 和 packages/store/d1-store
  -> apps/api routes
```

修改 schema 或 API 可见字段时，按顺序处理：

1. 修改 `schema/d1-schema.sql`。
2. 修改 `packages/store/drizzle-schema/src/index.ts`。
3. 修改 `packages/store/shared-types/src/index.ts` 中的共享类型/常量。
4. 修改 `packages/store/drizzle-queries/src/index.ts` 中的查询和 hydrate 逻辑。
5. 如果字段由爬虫写入，修改 `packages/crawler_py/localdex_crawler/upsert/` 下对应的写库模块。
6. 如果响应结构变化，同步更新 API 文档、Web 调用和小程序调用。

`sqlite-store` 和 `d1-store` 通常只应保持薄封装，不要在两边复制查询逻辑。

## 宝可梦数据模型规则

项目采用“形态优先”的数据模型：

- 宝可梦属性、种族值、特性、图片挂在 `pokemon_forms` 及其子表下，而不是只放在 `pokemon` 主表。
- 世代差异用 `generation_start` 和 `generation_end` 表达；`generation_end IS NULL` 表示持续有效。
- 查询某世代数据时使用 `generation_start <= gen AND (generation_end IS NULL OR generation_end >= gen)`。
- 当前 schema 和代码使用 `form_type = "default"` 表示默认形态。`form_key` 是 `form_type` 的别名（保留用于旧 UI/localStorage 兼容）。
- `form_type` 是形态的稳定标识（如 `mega-x`、`alola`、`gmax`），由 `form_name_rules.json` 中的 `formTypeKeywords` 规则从中文形态名推导。默认形态的 `form_type = "default"`。该推导仅在爬虫写入时执行一次，运行时代码不再做模式匹配。
- `formTypeKeywords` 规则文件由 Python 爬虫和 JS 端（`scripts/fill-form-names.mjs`）共享，修改时需同步验证两端行为。
- 少数旧文档可能提到默认形态名为空字符串；动形态逻辑前先确认当前字段语义，不要机械照搬旧描述。

Web 展示层应通过 `apps/web/src/utils/helpers.js` 中的 `resolvePokemonDisplayVariant()` 和相关 helper 解析世代/形态展示数据，不要在页面组件中重复实现形态选择算法。

## ID 优先规则

所有持久引用和 API 请求优先使用数据库数字 ID。

查询优先级：

- 宝可梦形态：`formId` -> `pokemonId` 默认形态 -> 中文名 fallback。
- 招式/特性/道具：`id` -> 中文名 fallback。

前端 state 和 localStorage 应同时保存 ID 与展示名：

- `pokemonId` + `nameZh`
- `formId` + `formKey`/形态展示名
- `abilityId` + `abilityName`
- `itemId` + `itemName`
- 招式能保存 ID 时保存 ID，中文名只作展示和 fallback

中文名不是主要标识符，只用于显示和降级查询。

## API 规则

所有 API 路由集中在 `apps/api/src/routes.ts`，通过 `registerApiRoutes()` 注册。

- `apps/api/src/app.ts` 初始化本地 SQLite store。
- `apps/api/src/worker.ts` 初始化 Worker D1 store。
- 两个入口共享同一套路由实现。
- 不要在单个路由处理函数里判断数据源。
- 成功响应保持 `{ data: ... }`，错误响应保持 `{ error: "..." }`。
- 列表接口只有在传入 `limit` 时才返回分页结构：`{ data, total, offset, limit, hasMore }`。
- 路由同时挂载到 `/` 和 `/api`，兼容 Vite dev proxy 与 Cloudflare Pages Functions 代理。

伤害计算接口保持为 `calculateDamage(input, store)` 的薄适配层。

## Cloudflare 性能规则

Cloudflare Workers 的请求持续时间包含代码执行和等待 D1/网络 I/O 的墙钟时间。生产 API 的优化目标是把动态接口 P99 控制在 500ms 左右；排查时优先看 D1 查询次数、响应体大小、缓存命中率和 D1 所在区域，而不是只看 Worker CPU。

开发 API 和 Store 时遵守：

- 列表接口只返回当前页面首屏/当前列表行实际需要的摘要字段。不要为了可能展开的详情，在列表中提前返回 `effectDetail`、`source`、`generations` 等重字段；展开或详情页通过详情接口按需获取。
- 图鉴列表的世代筛选使用 `pokemon.introduced_generation`（初登场世代），不要为了列表筛选连接 `pokemon_generation_regions`，也不要在列表响应中返回该表的世代可用性数据。
- 避免 D1 N+1 查询。分页列表不得对每条记录再单独查子表；需要附加数据时使用 `IN (...)` 批量查询或拆到详情接口。
- 只需要数字 ID/基础身份时，不要调用完整详情查询。宝可梦招式表、meta 等只需定位宝可梦的路径应使用轻量身份查询，例如 `getPokemonIdentity()`。
- 所有高频只读 GET 接口优先设置 `Cache-Control`，Worker 端可使用 `caches.default` 缓存。资料库数据低频更新时，允许短浏览器缓存和较长边缘缓存；数据导入或 schema 变更后通过重新部署、版本化 URL 或等待 TTL 处理缓存刷新。
- 每次新增筛选、排序、关联查询，都同步评估 `schema/d1-schema.sql` 和 `packages/store/drizzle-schema/src/index.ts` 是否需要组合索引。常见查询路径应优先服务 `pokemon_moves`、形态子表、图片、特性反查和列表排序。
- Cloudflare Worker 应启用 Smart Placement；如果主要用户区域和 D1 primary 距离较远，优先检查 D1 data location。只读请求量大时评估 D1 read replication，并在代码路径中确认是否使用 Sessions API。
- 性能改动需要验证查询计划或至少说明预期查询轮次变化。目标是把常见首屏列表接口控制在少量 D1 查询和小响应体内。

## Battle-Core 规则

`packages/battle-core` 的唯一业务入口是：

```ts
calculateDamage(input, lookup)
```

规则：

- 不放 SQL、HTTP、localStorage、环境变量或 Node.js 专有逻辑。
- 中文名到英文名的解析通过注入的 `NameLookup` 完成。
- 保留 `DamageCalcInput` 中 ID 优先字段。
- 语言映射和对战参数翻译逻辑集中在 `packages/battle-core/src/index.ts` 附近。
- 新增机制时，同步更新 `types.ts` 和 `index.ts`。

## Web 端规则

Web 数据请求必须走 `apps/web/src/utils/api.js` 中的 `api`/`unifiedApi`，路径使用 `/api/...`。

不要在页面组件里随手写项目数据的原始 `fetch`，除非确有封装无法覆盖的理由。

请求状态优先使用现有 hooks：

- `useApi(fetchFn, deps)`：单次请求。
- `useInfiniteApi(fetchFn, deps)`：分页/无限滚动。

路由规则：

- 保持 hash 路由：`#/pokedex`、`#/moves` 等。
- 不要改成 `BrowserRouter`，除非同时处理服务端 fallback 和 Cloudflare Pages 刷新行为。

样式规则：

- Web CSS 全部放在 `apps/web/src/styles/`。
- 通过 `apps/web/src/styles/index.css` 汇总导入。
- 不要把应用 CSS 放到 `public/`。
- 使用既有命名空间前缀：`pokedex-`、`move-`、`ability-`、`item-`、`team-`、`box-`、`modal-`、`editor-`、`dc-`、`type-chart-`、`shared-`。
- 响应式样式优先集中到 `responsive.css`。
- 新页面优先复用 `shared.css` 和公共组件，不要复制页面级样式。

优先复用这些组件/工具：

- `WikiLink`、`GenerationTimeline`、`PokemonGrid`、`Modal`、`ViewToggle`
- `TypeChip`（属性标签，支持 `iconOnly` 模式仅显示图标小方块）
- `ExternalImage`（外部图片，自动处理 `referrerPolicy` 防盗链和加载失败 fallback）
- `CustomSelect`、`SearchSelect`、`PokemonConfigCard`、`PokemonEditor`、`PokemonPickerList`、`StatCalculator`
- `parseExpandParam()`、`TYPE_BG_COLORS`、`TYPE_BG_COLORS_CARD`、`typeIconSrc()`、`categoryIconSrc()`

DrawerContent（图鉴详情抽屉）跨 Tab 联动：

- BattleTab 接收 `formId`（形态级使用率查询）、`onApplyToCalc`（联动到 StatsTab）、`onSearchMove`（联动到 MovesTab）。
- StatsTab/InlineStatCalculator 通过 `applyPreset` prop 接收外部注入的性格/EV 预设。
- MovesTab 通过 `initialSearch` prop 接收外部注入的搜索关键词（整合在初始加载 effect 中，非独立 effect）。
- 联动状态由 DrawerContent 统一管理，子组件消费后离开 Tab 时清空。

DamagePage 特别注意：

- 保留 EV/SP 自动转换。
- 保留形态切换时自动绑定必须道具/特性的行为。
- 天气和场地分段按钮是 toggle 行为：再次点击当前选项会清空。
- 道具图片预览使用现有 flex 布局，不要用绝对定位覆盖输入框。
- 招式搜索保持按需搜索和防抖，不要预加载全部招式列表。
- 招式表形态选择使用 `learnset/meta` 返回的 `forms: LearnsetFormMeta[]` 数组（包含 `formId`、`formType`、`formCategory`、`nameZh`、`isDefault`、`hasOwnMovesByGeneration` 等），不要使用已废弃的 `formKeys` 字段。
- 请求招式表数据时使用 `formId` 查询参数（对应 `pokemon_forms.id`）。旧的 `formType`、`form` 参数已移除，服务端不再做字符串模式匹配。

## 小程序规则

小程序是 Taro + React 编译到微信小程序。

- 通过 `apps/miniprogram/src/utils/api.js` 使用 `Taro.request`。
- API 基址通过 Taro `defineConstants` 注入 `API_BASE_URL`。
- 外部图片必须使用 `SafeImage`，由 `wsrv.nl` 代理。
- 新增共享常量时，同步维护 `apps/miniprogram/src/utils/constants.js` 和 Web 端常量。
- 小程序代码不要引入 Node.js 专有模块。
- 构建产物在 `apps/miniprogram/dist/`，不要提交。

## 资产与生成文件

除非任务明确要求，不要编辑生成物或大数据文件：

- `dist/`
- `apps/miniprogram/dist/`
- `node_modules/`
- `.wrangler/`
- `data/raw/`
- SQLite WAL/SHM 文件

主 SQLite 文件由 Git LFS 管理，非数据任务不要意外改写 `data/sqlite/localdex.sqlite`。

Web 属性/分类图标位于 `apps/web/public/assets/type-icons/`。如果重新生成，保持文件名兼容 `typeIconSrc()` 和 `categoryIconSrc()`。

## 密钥与环境变量

不要提交本地凭证或私密环境变量。

不得提交：

- `apps/api/.env`
- `apps/web/.env.local`
- `apps/miniprogram/.env`
- 任何包含密钥的未跟踪 `.env` 文件

`.env.example` 和安全的 `.env.production` 可以提交。

Cloudflare 凭证放在 GitHub Actions Secrets：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## Cloudflare 部署规则

生产链路：

```text
Cloudflare Pages
  -> Pages Function /api/*
  -> Service Binding API_WORKER
  -> Worker pokemon-localdex-api
  -> D1 pokemon-localdex-d1
```

约束：

- `wrangler.toml` 属于 Pages，声明 `API_WORKER` Service Binding。
- `wrangler.worker.toml` 属于 API Worker，声明 D1 binding `DB`。
- `apps/web/vite.config.js` 保持 `base: "/"`，构建输出到根目录 `dist/`。
- `functions/api/[[path]].ts` 保持薄代理，除非部署架构明确变更。

## 验证规则

根据改动范围选择验证：

- API/store/schema 改动：运行 `npm run check:sqlite` 和 `npm run check:api`。
- 伤害计算改动：运行 `npm run check:damage`，必要时加 API 检查。
- Web 改动：运行 `npm run build:web`；视觉/UI 改动还应启动服务并在浏览器检查。
- 小程序改动：运行 `cd apps/miniprogram && npx taro build --type weapp`。
- 爬虫解析改动：先用小范围 `npm run crawl:* -- --dry-run`，必要时再小范围写库。

如果因为本地数据、密钥、网络或工具缺失无法运行命令，明确说明没有验证的部分和剩余风险。

## 代码分析补充

当前代码中这些事实需要保持：

- `routes.ts` 是 Node 本地入口和 Worker 入口的共享 API 路由层。
- `worker.ts` 会在同一个 Worker isolate 中缓存 D1 store。
- `drizzle-queries` 对宝可梦列表的属性、特性、图片、世代、进化链做批量查询，避免逐行查询。
- `resolvePokemonDisplayVariant()` 是 Web 端形态/世代展示的权威转换函数。
- `main.jsx` 启动时异步执行 localStorage 迁移（当前版本 v4），完成后派发 `localdex-migration-done`。
- v4 迁移新增 `resolveFormId()` 多级匹配：精确 formKey/formType 匹配 -> nameZh/displayNameZh/canonicalNameZh 匹配 -> 大小写不敏感匹配 -> 回退默认形态。这解决了旧 slug 形中文 formKey（如"超级喷火龙x"）无法匹配新 formType（如"mega-x"）的问题。
- 队伍/盒子 localStorage schema 已经是 ID 优先，同时保留中文展示字段。
- Web 和小程序常量目前存在重复维护；改共享行为时两边都要查。
- `SafeImage` 会把 52Poké 等外部图片域名代理到 `wsrv.nl`。
- CI 中删除 `package-lock.json` 后重新 `npm install` 是为避免 Linux native binding 不匹配；没有 CI 回归前不要移除。
