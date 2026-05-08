# Pokemon LocalDex 开发规范与注意事项

> 本文档记录项目开发过程中总结的规范、约束和常见陷阱，所有贡献者在开发前必须阅读。

---

## 一、依赖版本约束（不可随意升级）

### React 必须固定在 18.3.1

```json
"react": "18.3.1",
"react-dom": "18.3.1"
```

**原因**：Taro 4.2.0 内部依赖 `react-reconciler@0.29.x`，该版本与 React 19 的 reconciler 接口不兼容。升级 React 19 会导致：

- 运行时报错：`Cannot read properties of undefined (reading 'ReactCurrentBatchConfig')`
- React Error #327（Fiber 树构建失败）
- 小程序端白屏，无任何错误提示

**操作规范**：
- 不得在任何 `package.json` 中将 React 版本改为 `^18` 或 `>=18`（范围写法会在 `npm update` 时意外升级）
- 不得安装 `@vitejs/plugin-react@6.x`（该版本要求 React 19）
- 当前锁定版本：`@vitejs/plugin-react@5.2.0`

### Taro 固定在 4.2.0

Taro 版本升级可能引入 API 变更，升级前必须在微信开发者工具中完整回归测试所有页面。

---

## 二、数据模型规范

### 2.1 形态优先原则

宝可梦的核心属性**不在** `pokemon` 主表，而在 `pokemon_forms` 及其子表：

```
pokemon（主表）
  └── pokemon_forms（形态表）
        ├── pokemon_form_types（属性）
        ├── pokemon_form_stats（种族值）
        ├── pokemon_form_abilities（特性）
        └── pokemon_form_images（图片）
```

**开发注意**：
- 查询宝可梦属性/种族值时，必须先确定形态（`form_name`），再查对应子表
- 默认形态的 `form_name` 为空字符串 `""`，不是 `null`，也不是 `"default"`
- 前端 `resolvePokemonDisplayVariant()` 函数封装了这套逻辑，**不要绕过它直接读原始数据**

### 2.2 世代范围字段

形态子表使用 `generation_start` 和 `generation_end` 表示数据有效的世代范围：

- `generation_end` 为 `null` 表示"至今有效"
- 查询特定世代数据时，过滤条件为：`generation_start <= target_gen AND (generation_end IS NULL OR generation_end >= target_gen)`

### 2.3 数据库双轨制

SQLite 和 Supabase 的 schema 必须保持同步。修改数据库结构时：

1. 先修改 `supabase/schema.sql`（作为 source of truth）
2. 同步修改 `packages/sqlite-store/src/index.ts` 中的类型定义和查询语句
3. 同步修改 `packages/supabase-store/src/index.ts` 中的查询逻辑
4. 如有爬虫写入逻辑，同步修改 `packages/crawler_py/localdex_crawler/sqlite_upsert.py`

---

## 三、数据源切换规范

### 3.1 API 层（apps/api）

通过 `DATA_SOURCE` 环境变量控制：

```bash
DATA_SOURCE=sqlite    # 使用本地 SQLite（默认）
DATA_SOURCE=supabase  # 使用 Supabase
```

切换逻辑在 `apps/api/src/app.ts` 顶部，动态 `import` 对应的 store 包。**不要在路由处理函数内部做数据源判断**，所有切换逻辑集中在模块导入处。

### 3.2 Web 层（apps/web）

通过 `VITE_DATA_SOURCE` 环境变量控制：

```bash
VITE_DATA_SOURCE=         # 留空：走 Hono API（本地开发默认）
VITE_DATA_SOURCE=supabase # 直连 Supabase（GitHub Pages 生产）
```

统一入口是 `apps/web/src/utils/api.js` 中的 `unifiedApi` 对象，**所有页面和 hook 必须通过 `unifiedApi` 调用，不得直接 import `supabaseApi.js` 或直接 `fetch("/api/...")`**。

### 3.3 小程序层（apps/miniprogram）

小程序**只支持 Supabase 模式**，凭证通过 Taro `defineConstants` 在编译时注入：

```javascript
// apps/miniprogram/config/index.js
defineConstants: {
  SUPABASE_URL: JSON.stringify(process.env.SUPABASE_URL),
  SUPABASE_ANON_KEY: JSON.stringify(process.env.SUPABASE_ANON_KEY),
}
```

**注意**：小程序不使用 `@supabase/supabase-js`，而是自行封装的 `utils/supabase.js`（基于 `Taro.request`）。不要尝试在小程序中引入 supabase-js，它依赖 `fetch`、`WebSocket` 等浏览器 API，在小程序环境中不可用。

---

## 四、前端开发规范

### 4.1 数据请求 Hook

- **单次请求**：使用 `useApi(fetchFn, deps)`，返回 `{ data, loading, error }`
- **无限滚动分页**：使用 `useInfiniteApi(fetchFn, deps)`，返回 `{ data, loading, error, loadMore, hasMore }`

不要在组件内直接 `useEffect` + `fetch`，统一走这两个 hook。

### 4.2 路由规范

Web 端使用 **hash 路由**（`HashRouter`），路由格式为 `#/pokedex`、`#/moves` 等。

原因：GitHub Pages 静态托管不支持 HTML5 History API（刷新会 404），hash 路由无需服务端配合。

**不要改为 BrowserRouter**，除非同时配置了服务端 fallback。

### 4.3 图片处理

**Web 端**：直接使用 52Poké 图片 URL（`s1.52poke.com`、`s2.52poke.com` 等），无需代理。

**小程序端**：必须通过 `SafeImage` 组件，该组件将图片 URL 转换为 `wsrv.nl` 代理地址：

```javascript
// 原始 URL
https://s1.52poke.com/wiki/thumb/...

// 代理后
https://wsrv.nl/?url=https%3A%2F%2Fs1.52poke.com%2Fwiki%2Fthumb%2F...
```

原因：微信小程序要求所有网络请求域名必须在后台配置白名单，52Poké 的图片域名较多且不固定，`wsrv.nl` 作为统一代理只需配置一个域名。

### 4.4 属性颜色

属性颜色定义在 `apps/web/src/utils/constants.js` 的 `TYPE_COLORS` 对象中，小程序端有对应的 `constants.js`。**不要在组件内硬编码颜色值**，统一从常量文件引用。

### 4.5 公共组件说明

**CustomSelect** — 自定义下拉选择框，支持选项分组和自定义渲染。用于 DamagePage 中的性格选择等场景。

**SearchSelect** — 带异步搜索功能的下拉框，支持远程搜索和本地过滤。用于 DamagePage 中的宝可梦、招式、道具、特性搜索选择。

**PokemonConfigCard** — 宝可梦配置卡片组件，展示宝可梦的基本信息和配置状态。

**PokemonEditor** — 宝可梦编辑器组件，提供完整的宝可梦属性编辑界面。

**PokemonPickerList** — 宝可梦选择列表组件，用于从列表中选择宝可梦。

**StatCalculator** — 能力值计算器，支持 EV/IV 输入和实际能力值计算，同时支持 Champions 赛制的 SP 模式。

### 4.6 ID 使用规范

前端所有 API 请求和 localStorage 存储**必须使用数据库数字 ID**，不得使用中文名称或 slug 作为标识符。

**存储字段约定**：

| 字段 | 用途 | 示例值 |
|------|------|--------|
| `pokemonId` | 宝可梦数据库 ID（用于 API 请求） | `"25"` |
| `nameZh` | 宝可梦中文名（仅用于显示） | `"皮卡丘"` |
| `itemId` | 道具数据库 ID（用于 API 请求） | `"123"` |
| `itemName` | 道具中文名（仅用于显示） | `"气势披带"` |
| `abilityId` | 特性中文名（仅用于显示，不涉及 API 回查） | `"静电"` |

**开发注意**：

- 从列表选择宝可梦/道具时，使用 `String(item.id)` 存储 ID，同时保存 `nameZh` / `itemName` 用于显示
- API 详情请求使用 `/pokemon/${id}` 或 `/items/${id}` 格式，不需要 `encodeURIComponent`
- 搜索请求仍使用中文名称：`/pokemon?q=${encodeURIComponent(name)}`（这是正确的）
- 界面显示优先使用 `itemName`，降级到 `itemId`：`data.itemName || data.itemId`
- `abilityId` 例外：因为特性仅用于显示，不涉及通过 ID 回查 API，所以直接存储中文名

**数据迁移**：`utils/migrateStorage.js` 提供了旧格式数据的自动迁移。应用启动时（`main.jsx`）会检测并迁移旧数据（中文名 → 数字 ID）。迁移完成后通过 `localdex-migration-done` 自定义事件通知组件刷新。

### 4.7 DamagePage 开发注意事项

DamagePage 是项目中最复杂的页面，开发时需注意以下几点：

**EV↔SP 自动转换**：DamagePage 支持 Champions 赛制（SP 模式）和标准赛制（EV 模式）。切换赛制时会自动转换努力值，转换逻辑使用 `evToSp()` 和 `spToEv()` 函数，确保数据不丢失。

**形态切换自动绑定**：当用户切换宝可梦形态时，DamagePage 会自动绑定对应形态的道具和特性。例如超级进化形态会自动设置对应的超级石，极巨化形态会自动清除道具。

**天气和场地分段切换**：天气和场地选择使用分段控制器（segmented control）样式，采用 toggle 行为——点击已选中的按钮会取消选择（回到"无"状态），而不是设置一个显式的"无"选项。

**道具图片预览**：选中道具后，道具图片和名称以 flex 布局展示在搜索框位置，点击可清除选择恢复搜索框。不要使用绝对定位覆盖输入框的方式（会导致图片和文字重叠）。

---

## 五、爬虫开发规范

### 5.1 缓存优先

爬虫采用"缓存优先"策略：

1. 先检查 `data/raw/` 目录是否有对应 URL 的缓存文件
2. 缓存命中则直接读取，不发起 HTTP 请求
3. 缓存未命中才请求网络，并将结果写入缓存

**不要绕过缓存直接请求**，52Poké Wiki 对频繁请求有限速，缓存也是增量更新的基础。

### 5.2 繁简转换

52Poké Wiki 默认返回繁体中文，爬虫通过两种方式转换为简体：

1. 请求 URL 追加 `?variant=zh-hans` 参数（服务端转换，优先）
2. 使用 `opencc-python-reimplemented` 库做客户端转换（降级）

**注意**：部分专有名词（宝可梦名称、招式名称）在繁简转换后可能出现偏差，需要人工校验。

### 5.3 Upsert 语义

所有数据库写入使用 upsert（`INSERT OR REPLACE`），支持：

- 全量重建：删除数据库后重新爬取
- 增量更新：只爬取变更的页面，已有数据自动覆盖

**不要使用 `INSERT OR IGNORE`**，否则数据更新不会生效。

### 5.4 HTTP 降级

爬虫优先使用 Python `requests` 库，若请求失败（超时、SSL 错误等）会自动降级到系统 `curl` 命令。这是为了处理部分页面的 SSL 证书问题。

---

## 六、环境配置规范

### 6.1 凭证安全

以下文件**绝对不能提交到 Git**：

- `apps/api/.env`（含 Supabase Service Role Key，权限极高）
- `apps/web/.env.local`（含 Supabase Anon Key）
- `apps/miniprogram/.env`（含 Supabase Anon Key）

`.env.production` 文件中凭证字段留空（值为空字符串），实际值由 GitHub Actions Secrets 在 CI 构建时注入。

### 6.2 本地开发配置

```bash
# apps/api/.env
DATA_SOURCE=sqlite
HOST=0.0.0.0
PORT=3030

# apps/web/.env（本地开发，留空走 API proxy）
VITE_DATA_SOURCE=
```

Vite dev server 配置了 proxy，将 `/api` 请求转发到 `http://localhost:3030`，因此本地开发时必须同时启动 API 服务。

### 6.3 CI 环境变量

GitHub Actions 工作流从 Secrets 读取以下变量：

| Secret 名称 | 用途 |
|-------------|------|
| `VITE_SUPABASE_URL` | Supabase 项目 URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase 匿名访问密钥 |

---

## 七、构建与部署规范

### 7.1 GitHub Pages 部署

**不要手动推送到 `gh-pages` 分支**，所有部署通过 GitHub Actions 自动完成。

工作流触发条件：推送到 `main` 分支。

工作流关键步骤：
1. 删除 `package-lock.json` 后重新 `npm install`（确保 native binding 匹配 CI 平台）
2. 注入 Supabase 凭证到 `.env.production`
3. `npm run build:web`（`GITHUB_PAGES=true` 触发 Vite base 路径切换）
4. 产物部署到 `gh-pages` 分支

### 7.2 Vite Base 路径

本地开发和生产部署的 base 路径不同：

```javascript
// vite.config.js
base: process.env.GITHUB_PAGES ? '/pokemon-localdex/' : '/'
```

**注意**：本地开发时不要设置 `GITHUB_PAGES=true`，否则所有静态资源路径会加上 `/pokemon-localdex/` 前缀导致 404。

### 7.3 小程序构建

```bash
cd apps/miniprogram

# 开发构建（监听模式）
npx taro build --type weapp --watch

# 生产构建
npx taro build --type weapp
```

构建产物在 `apps/miniprogram/dist/`，用微信开发者工具打开该目录进行预览和上传。

---

## 八、代码组织规范

### 8.1 包职责边界

| 包 | 职责 | 禁止事项 |
|----|------|---------|
| `packages/battle-core` | 纯计算逻辑 | 不得有 I/O、不得依赖 Node.js 特有 API |
| `packages/sqlite-store` | SQLite 查询 | 不得有业务逻辑，只做数据映射 |
| `packages/supabase-store` | Supabase 查询 | 与 sqlite-store 保持接口一致 |
| `packages/crawler_py` | 数据采集 | 不得直接被 API 层调用 |
| `apps/api` | HTTP 路由 | 不得包含数据库查询逻辑（委托给 store 包） |
| `apps/web` | UI 展示 | 不得直接操作数据库 |
| `apps/miniprogram` | 小程序 UI | 不得引入 Node.js 专有模块 |

### 8.2 sqlite-store 与 supabase-store 接口一致性

这是项目最重要的架构约束之一。每次修改任一 store 包的函数签名时，必须同步修改另一个包，保持接口完全一致。

检查方式：两个包的 `src/index.ts` 导出的函数名和参数类型必须完全相同。

### 8.3 常量管理

全局常量（属性列表、性格列表、招式学习方式等）分别维护在：

- `apps/web/src/utils/constants.js`
- `apps/miniprogram/src/utils/constants.js`

两份文件内容应保持同步。如果需要新增常量，两处都要更新。

---

## 九、常见问题与解决方案

### Q1：本地启动后图鉴页面空白

**原因**：`data/sqlite/localdex.sqlite` 不存在或为空。

**解决**：
```bash
npm run crawl:all   # 全量爬取（耗时较长）
# 或
npm run crawl:pokemon  # 仅爬取宝可梦数据
```

### Q2：Vite dev server 请求 API 报 404

**原因**：Hono API 服务未启动。

**解决**：在另一个终端运行 `npm run dev:api`，确保 `:3030` 端口可访问。

### Q3：小程序图片不显示

**原因**：
1. `wsrv.nl` 未加入微信小程序 downloadFile 合法域名
2. 使用了 `<Image>` 而非 `<SafeImage>` 组件

**解决**：
1. 登录微信公众平台 → 开发管理 → 开发设置 → 服务器域名，添加 `https://wsrv.nl`
2. 将 `<Image>` 替换为 `<SafeImage>`

### Q4：GitHub Pages 部署后页面空白

**原因**：通常是 Supabase 凭证未正确注入，或 base 路径配置错误。

**排查步骤**：
1. 检查 GitHub Actions 日志，确认 Secrets 注入步骤无报错
2. 检查构建产物中 `index.html` 的 `<script src>` 路径是否包含 `/pokemon-localdex/` 前缀
3. 打开浏览器控制台，查看是否有 Supabase 认证错误

### Q5：爬虫报 SSL 错误

**原因**：52Poké Wiki 部分页面的 SSL 证书链不完整。

**解决**：爬虫会自动降级到 `curl`，通常无需手动干预。如果 `curl` 也失败，可以临时添加 `--insecure` 参数（仅限本地开发，不要提交）。

### Q6：`node:sqlite` 模块找不到

**原因**：Node.js 版本低于 22，`node:sqlite` 是 Node.js 22 引入的实验性内置模块。

**解决**：升级 Node.js 到 22.x。检查版本：`node --version`。

### Q7：Taro 构建报 React 相关错误

**原因**：React 版本被意外升级到 19.x。

**解决**：
```bash
# 检查当前版本
npm ls react

# 如果不是 18.3.1，重新安装
npm install react@18.3.1 react-dom@18.3.1
```

---

## 十、开发流程建议

### 新功能开发流程

1. **确认数据是否已有**：先查 SQLite 数据库，确认所需字段是否已被爬虫采集
2. **如需新字段**：先修改爬虫，重新爬取，再修改 schema 和 store 包
3. **后端先行**：在 `apps/api` 中添加路由，用 `npm run check:api` 验证
4. **前端对接**：在 `apps/web/src/utils/api.js` 的 `unifiedApi` 中添加对应方法
5. **小程序同步**：如果功能需要在小程序中支持，同步修改 `apps/miniprogram/src/utils/api.js`

### 数据库变更流程

1. 修改 `supabase/schema.sql`
2. 修改 `packages/sqlite-store/src/index.ts`（类型 + 查询）
3. 修改 `packages/supabase-store/src/index.ts`（查询）
4. 修改爬虫写入逻辑（如有）
5. 本地重建 SQLite：删除 `data/sqlite/localdex.sqlite` 后重新爬取
6. 如需同步到 Supabase：运行 `scripts/migrate-to-supabase.mjs`

### 发布前检查清单

- [ ] `npm run check:api` 通过
- [ ] `npm run check:sqlite` 通过
- [ ] `npm run build:web` 无报错
- [ ] 本地模式（SQLite + API）功能正常
- [ ] 在线模式（Supabase 直连）功能正常（需配置 `.env.local`）
- [ ] 小程序构建无报错，微信开发者工具预览正常
- [ ] 没有将 `.env` 文件提交到 Git
