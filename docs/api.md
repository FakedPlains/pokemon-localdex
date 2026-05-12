# API 接口

## 概述

Pokemon LocalDex 提供统一的后端 Hono API，供 Web 端和小程序端共同使用。

API 层基于 [Hono](https://hono.dev/) 框架构建，运行在 Node.js 22 上（本地）或 Cloudflare Workers（生产），提供 RESTful 风格的查询接口和少量写入接口。本地 API 服务默认监听 `0.0.0.0:3030`，可通过环境变量 `HOST` 和 `PORT` 调整。

数据源为 SQLite（本地开发）或 Cloudflare D1（生产部署）。

所有接口同时挂载在根路径和 `/api` 前缀下。例如 `/pokemon` 和 `/api/pokemon` 返回相同结果。这是为了兼容两种运行模式：Vite 开发模式下前端通过 proxy 将 `/api/xxx` 转发为 `/xxx`；生产模式下 Pages Functions 通过 Service Binding 将 `/api/*` 请求转发给 Worker。

## 启动方式

```bash
# 默认启动（SQLite 数据源，0.0.0.0:3030）
npm run dev:api

# 自定义地址和端口
HOST=127.0.0.1 PORT=8080 npm run dev:api
```

启动前需要确保 SQLite 数据库存在：`data/sqlite/localdex.sqlite`。

环境变量可以写在 `apps/api/.env` 文件中（参考 `.env.example`）。

## 通用约定

所有成功响应的格式为 `{ "data": ... }`，错误响应的格式为 `{ "error": "..." }`。列表接口返回数组，详情接口返回单个对象。HTTP 状态码遵循标准语义：200 表示成功，201 表示创建成功，404 表示资源不存在。

API 启用了全局 CORS，允许任意来源访问。

### 分页

列表接口（pokemon、items、moves、abilities）支持可选的分页参数。当请求中包含 `limit` 参数时，响应格式会从简单数组变为分页对象：

不带分页：`{ "data": [...] }`

带分页：`{ "data": [...], "total": 1025, "offset": 0, "limit": 20, "hasMore": true }`

| 参数 | 类型 | 说明 |
|------|------|------|
| limit | number | 每页条数，传入后启用分页模式 |
| offset | number | 偏移量，默认 0 |


## 宝可梦

### GET /pokemon

获取宝可梦列表。返回的每条记录包含图鉴编号、名称、属性、图片等摘要信息。

查询参数：

| 参数 | 类型 | 说明 |
|------|------|------|
| q | string | 按名称模糊搜索（支持中文、英文、日文） |
| type | string | 按属性筛选，支持逗号分隔多属性（如"火,飞行"） |
| generation | number | 按初登场世代筛选 |
| seasonId | number | 按 Champions 赛季数据库 ID 筛选可用池 |
| limit | number | 分页：每页条数 |
| offset | number | 分页：偏移量 |

示例：

```
GET /api/pokemon?q=皮卡&type=电&generation=1
GET /api/pokemon?seasonId=1
GET /api/pokemon?limit=20&offset=0
```


### GET /pokemon/:id

获取单只宝可梦的完整详情。`:id` 支持三种格式：数字 ID（数据库主键）、slug（如 `pikachu`）、中文名（如 `皮卡丘`）。

返回数据包含基础信息、所有形态（含每个形态的属性变体 `typeVariants`、种族值变体 `statVariants`、特性变体 `abilityVariants`、图片 `images`）、进化链、世代可用性等完整数据。

示例：

```
GET /api/pokemon/皮卡丘
GET /api/pokemon/25
```

小程序端对应函数：`fetchPokemonDetail(idOrSlug)`。小程序端使用 `query` + `limit:1` 而非 PostgREST 的 `single` 模式（后者在 0 或多条结果时返回 406 错误），并优先使用数字 ID 导航以避免中文 URL 编码问题。

### GET /pokemon/:id/learnset

获取指定宝可梦在某个世代的可学招式表。

查询参数：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| generation | number | 9 | 世代编号 |
| form | string | "default" | 形态标识（form_key） |
| version | string | — | 游戏版本代码（可选，如 "SV"） |

返回数据按学习方式（升级、招式学习器、遗传、教授等）分组。响应中还包含实际使用的 `formKey` 和 `gameVersionCode`。

示例：

```
GET /api/pokemon/皮卡丘/learnset?generation=1&form=default
GET /api/pokemon/25/learnset?generation=9&version=SV
```

小程序端对应函数：`fetchPokemonLearnset(pokemonId, generation, formKey, gameVersionCode)`。支持形态回退逻辑：如果指定形态无数据，依次尝试 `default` 形态和该世代的第一个可用形态。

### GET /pokemon/:id/learnset/meta

获取指定宝可梦的招式表元数据，包括该宝可梦在哪些世代有招式数据、每个世代有哪些形态和游戏版本可选。用于前端构建世代/形态/版本选择器。

示例：

```
GET /api/pokemon/25/learnset/meta
```

小程序端对应函数：`fetchLearnsetMeta(pokemonId)`。

## Champions

### GET /champions/seasons

获取 Pokémon Champions 赛季列表，用于构建赛季选择器。每个赛季包含赛季编号、关联赛制、赛制名称和期间文本。

示例：

```
GET /api/champions/seasons
```

可将返回的 `id` 传给 `/pokemon?seasonId=...`，按该赛季关联赛制的可使用宝可梦池筛选图鉴列表。`seasonCode` 仅用于展示。

## 招式

### GET /moves

获取招式列表。

查询参数：

| 参数 | 类型 | 说明 |
|------|------|------|
| q | string | 按名称模糊搜索 |
| type | string | 按属性筛选 |
| category | string | 按分类筛选（物理/特殊/变化） |
| generation | number | 按初登场世代筛选 |
| limit | number | 分页：每页条数 |
| offset | number | 分页：偏移量 |

小程序端对应函数：`fetchMovesList({ q, type, category, generation, limit, offset })`。

### GET /moves/:id

获取单个招式的完整详情，包括威力、命中、PP、效果描述和各世代的参数变化记录。`:id` 支持数字 ID 和中文名。

小程序端对应函数：`fetchMoveDetail(idOrSlug)`。

## 特性

### GET /abilities

获取特性列表。

查询参数：

| 参数 | 类型 | 说明 |
|------|------|------|
| q | string | 按名称模糊搜索 |
| generation | number | 按初登场世代筛选 |
| limit | number | 分页：每页条数 |
| offset | number | 分页：偏移量 |

小程序端对应函数：`fetchAbilitiesList({ q, generation, limit, offset })`。

### GET /abilities/:id

获取单个特性的完整详情，包括效果描述和各世代的效果变化记录。`:id` 支持数字 ID 和中文名。

小程序端对应函数：`fetchAbilityDetail(idOrSlug)`。

## 道具

### GET /items

获取道具列表。

查询参数：

| 参数 | 类型 | 说明 |
|------|------|------|
| q | string | 按名称模糊搜索 |
| category | string | 按道具分类筛选 |
| limit | number | 分页：每页条数 |
| offset | number | 分页：偏移量 |

小程序端对应函数：`fetchItemsList({ q, category, limit, offset })`。

### GET /items/:id

获取单个道具的详情，包括分类和效果说明。`:id` 支持数字 ID、legacy_id 和中文名。

小程序端对应函数：`fetchItemDetail(idOrSlug)`。

## 伤害计算

### POST /battle/damage

计算一次攻击的伤害。请求体为 JSON 格式：

```json
{
  "level": 50,
  "power": 80,
  "attack": 150,
  "defense": 100,
  "stab": 1.5,
  "typeEffectiveness": 2
}
```

返回伤害计算结果，包含最小伤害、最大伤害和乱数范围。

小程序端和 Web 端均通过此接口实现伤害计算。

## 健康检查

### GET /health

返回服务状态，包含当前使用的数据源：

```json
{ "ok": true, "service": "pokemon-localdex-api", "dataSource": "sqlite" }
```

`dataSource` 字段值为 `sqlite` 或 `d1`，反映当前 API 使用的数据源。

## 静态资源

生产模式下，API 服务器同时托管前端静态资源。静态文件按以下优先级查找：先查 `dist/` 目录（Vite 构建产物），再查 `apps/web/public/` 目录。所有未匹配的 GET 请求会回退到 `index.html`，以支持 SPA 的客户端路由。

## 小程序端 API 调用

小程序端通过 `Taro.request` 调用同一套后端 Hono API，封装代码位于 `apps/miniprogram/src/utils/api.js`。

API 基址址通过 `.env` 文件中的 `API_BASE_URL` 配置，在编译时通过 Taro `defineConstants` 注入。小程序端封装了与 Web 端相同的查询函数：`fetchPokemonList`、`fetchPokemonDetail`、`fetchMovesList`、`fetchMoveDetail`、`fetchAbilitiesList`、`fetchAbilityDetail`、`fetchItemsList`、`fetchItemDetail`、`fetchLearnsetMeta`、`fetchPokemonLearnset`。返回格式与 Web 端保持一致。
