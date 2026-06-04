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
- 查询宝可梦属性/种族值时，必须先确定形态（`form_type`），再查对应子表
- 默认形态的 `form_type = "default"`，`form_key = "default"`。旧代码中可能有 `form_name` 为空字符串的引用，当前已统一为 `"default"`
- `form_type` 是形态的稳定标识（如 `mega-x`、`alola`、`gmax`），由 `form_name_rules.json` 中的 `formTypeKeywords` 规则推导
- 前端 `resolvePokemonDisplayVariant()` 函数封装了这套逻辑，**不要绕过它直接读原始数据**

### 2.2 世代范围字段

形态子表使用 `generation_start` 和 `generation_end` 表示数据有效的世代范围：

- `generation_end` 为 `null` 表示"至今有效"
- 查询特定世代数据时，过滤条件为：`generation_start <= target_gen AND (generation_end IS NULL OR generation_end >= target_gen)`

### 2.3 ID 优先查询原则

**核心规范：查询任何信息时，能用数据库数字 ID 则必须优先使用 ID，以提升查询速度和准确性。**

数据库主键索引查询（`WHERE id = ?`）的性能远优于文本字段匹配（`WHERE name_zh = ?`），且不存在同名歧义问题。所有查询函数必须遵循以下优先级：

**宝可梦形态查询优先级**：`formId` → `pokemonId + formType` → 兼容 `formKey/form` 标签 → `pokemonId`（默认形态） → `nameZh`（中文名 fallback）

**招式/特性/道具查询优先级**：`id` → `nameZh`（中文名 fallback）

**具体约束**：

- `battle-core` 通过 `NameLookup` 接口与 store 层解耦，查询函数签名统一为 `opts: { id?: string | number; nameZh?: string }` 格式，优先通过 `id` 查询，仅在 `id` 缺失时才降级到 `nameZh`
- 宝可梦形态查询优先使用 `formId`（`pokemon_forms.id`）直接定位，`formType`（如 `mega-x`、`alola`）作为同一宝可梦内稳定标识；旧 `formKey/form` 只作为兼容标签映射
- 前端在选择宝可梦/形态/招式/特性/道具时，必须同时保存数据库 ID 和中文名，API 请求中优先传递 ID
- 中文名仅作为 fallback 和界面显示使用，不作为主要查询条件

**前端传参示例**：

```javascript
// 正确：传递 formId
attacker: {
  pokemonId: "2",      // pokemon.id
  formId: "6862",      // pokemon_forms.id（超级喷火龙X）
  name: "喷火龙",      // 仅作 fallback
  abilityId: "42",     // abilities.id
  ability: "硬爪",     // 仅作 fallback
  itemId: "123",       // items.id
  item: "喷火龙进化石X" // 仅作 fallback
}

// 降级：使用 formType 作为 fallback（formId 不可用时）
attacker: {
  pokemonId: "2",
  formType: "mega-x",
  name: "喷火龙",
  abilityId: "42",
  ability: "硬爪",
}
```

**后端查询接口**：

```typescript
// battle-core 定义的 NameLookup 接口（由 DrizzleStore 统一实现）
interface NameLookup {
  pokemonNameEn(opts: {
    pokemonId?: string | number;
    formId?: string | number;
    formKey?: string;
    name?: string;
  }): Promise<string | undefined>;

  entityNameEn(
    kind: "move" | "ability" | "item",
    id?: string | number,
    nameZh?: string,
  ): Promise<string | undefined>;
}
```

`DrizzleStore` 同时实现 `IStore`（数据查询）和 `NameLookup`（名称解析）两个接口，本地模式和 Worker 模式共用同一套实现。

**数据流转**：

```
前端选择形态 → 保存 form.id 到 state（formId）
前端发起计算 → 请求体携带 formId（优先）和 formType/formKey（fallback）
后端收到请求 → store.pokemonNameEn({ formId, formKey, pokemonId, name })
                   → formId 命中则直接返回
                   → 未命中则尝试 pokemonId + formType/legacy formKey 组合查询
                   → 再未命中则尝试 formType/legacy formKey 单独匹配
                   → 再未命中则降级到 pokemonId 默认形态
                   → 最后降级到 nameZh 文本匹配
```

### 2.4 数据库 Schema 管理

修改数据库结构时：

1. 先修改 `schema/d1-schema.sql`（作为 source of truth）
2. 同步修改 `packages/store/drizzle-schema/src/index.ts`（Drizzle 表定义）
3. 同步修改 `packages/store/shared-types/src/index.ts`（共享类型/常量）
4. 同步修改 `packages/store/drizzle-queries/src/index.ts`（查询和 hydrate 逻辑）
5. 如有爬虫写入逻辑，同步修改 `packages/crawler_py/localdex_crawler/upsert/` 下对应的写库模块
6. 如果响应结构变化，同步更新 API 文档、Web 调用和小程序调用

注意：`sqlite-store` 和 `d1-store` 只是薄封装，不包含查询逻辑。查询变更只需修改 `drizzle-queries` 一处。

---

## 三、数据源切换规范

### 3.1 API 层（apps/api）

本地开发使用 SQLite，生产环境使用 Cloudflare D1。`app.ts` 和 `worker.ts` 分别初始化各自的 store 实例，然后通过 `routes.ts` 的 `registerRoutes()` 函数统一注册路由。**不要在路由处理函数内部做数据源判断**，所有切换逻辑集中在 `getStore` 实现中。

### 3.2 Web 层（apps/web）

所有请求通过 `fetch("/api/...")` 发送到后端（本地走 Hono API，生产走 Pages Functions 代理到 Worker）。

统一入口是 `apps/web/src/utils/api.js` 中的 `unifiedApi` 对象，**所有页面和 hook 必须通过 `unifiedApi` 调用**。

### 3.3 小程序层（apps/miniprogram）

小程序通过 `Taro.request` 调用后端 Hono API，API 基址通过 Taro `defineConstants` 在编译时注入：

```javascript
// apps/miniprogram/config/index.js
defineConstants: {
  API_BASE_URL: JSON.stringify(process.env.API_BASE_URL),
}
```

---

## 四、前端开发规范

### 4.1 数据请求 Hook

- **单次请求**：使用 `useApi(fetchFn, deps)`，返回 `{ data, loading, error }`
- **无限滚动分页**：使用 `useInfiniteApi(fetchFn, deps)`，返回 `{ data, loading, error, loadMore, hasMore }`

不要在组件内直接 `useEffect` + `fetch`，统一走这两个 hook。

### 4.2 路由规范

Web 端使用 **hash 路由**（`HashRouter`），路由格式为 `#/pokedex`、`#/moves` 等。

原因：hash 路由无需服务端配合，适用于各种静态托管平台（Cloudflare Pages 等），刷新不会 404。

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

#### 4.5.1 业务组件

**CustomSelect** — 自定义下拉选择框，支持选项分组和自定义渲染。用于 DamagePage 中的性格选择等场景。

**SearchSelect** — 带异步搜索功能的下拉框，支持远程搜索和本地过滤。用于 DamagePage 中的宝可梦、招式、道具、特性搜索选择。

**PokemonConfigCard** — 宝可梦配置卡片组件，展示宝可梦的基本信息和配置状态。

**PokemonEditor** — 宝可梦编辑器组件，提供完整的宝可梦属性编辑界面。

**PokemonPickerList** — 宝可梦选择列表组件，用于从列表中选择宝可梦。

**StatCalculator** — 能力值计算器，支持 EV/IV 输入和实际能力值计算，同时支持 Champions 赛制的 SP 模式。

#### 4.5.2 跨页面共享组件

以下组件从多个页面中提取而来，**新页面开发时必须优先使用这些共享组件，不要重复定义**。

**WikiLink** (`components/WikiLink.jsx`) — Wiki 外链图标组件。接受 `url`、`title`（默认 `"Wiki"`）和可选 `className` 属性。当 `url` 为空时不渲染。已在 MovesPage、AbilitiesPage、ItemsPage、PokedexPage 中使用。

```jsx
import WikiLink from "../components/WikiLink.jsx";
<WikiLink url={detail.source?.url} title="52Poké Wiki" />
```

**GenerationTimeline** (`components/GenerationTimeline.jsx`) — 世代变更时间线组件。接受 `generations` 数组（每项包含 `generation`、`description` 等字段）和可选 `title`（默认 `"世代变更"`）。当 `generations` 为空时不渲染。已在 MovesPage、AbilitiesPage、ItemsPage 中使用。

```jsx
import GenerationTimeline from "../components/GenerationTimeline.jsx";
<GenerationTimeline generations={detail.generations} title="世代变更" />
```

**PokemonGrid** (`components/PokemonGrid.jsx`) — 可学习该招式/拥有该特性的宝可梦网格组件。接受 `apiPath`（API 请求路径，如 `/moves/123/pokemon`）和可选 `title`。已在 MovesPage、AbilitiesPage 中使用。

```jsx
import PokemonGrid from "../components/PokemonGrid.jsx";
<PokemonGrid apiPath={`/moves/${moveId}/pokemon`} title="可学习的宝可梦" />
```

**Modal** (`components/Modal.jsx`) — 通用弹窗组件，基于 `createPortal` 渲染到 `document.body`。支持 Escape 键关闭、点击遮罩关闭、锁定 body 滚动。接受 `open`、`onClose`、`title`、`headerExtra` 和 `children` 属性。已在 TeamsPage 中使用。

```jsx
import Modal from "../components/Modal.jsx";
<Modal open={showModal} onClose={() => setShowModal(false)} title="选择队伍">
  {/* 弹窗内容 */}
</Modal>
```

**ViewToggle** (`components/ViewToggle.jsx`) — 卡片/列表视图切换组件。接受 `mode`（`"card"` 或 `"list"`）和 `onChange` 回调。已在 PokedexPage、TeamsPage 中使用。

```jsx
import ViewToggle from "../components/ViewToggle.jsx";
<ViewToggle mode={viewMode} onChange={setViewMode} />
```

**TypeChip** (`components/TypeChip.tsx`) — 属性标签组件，渲染属性图标和文字。接受 `type`（属性名或数组）、可选 `size`（添加 `type-chip-<size>` 类名）和 `iconOnly`（仅显示图标小方块，不显示文字）。已在多个页面和 BattleTab 中使用。

```tsx
import TypeChip from "../components/TypeChip.tsx";
<TypeChip type="火" />
<TypeChip type={["火", "飞行"]} />
<TypeChip type="电" iconOnly />
```

**ExternalImage** (`components/ExternalImage.tsx`) — 外部图片组件，自动添加 `referrerPolicy="no-referrer"`（解决 52poke.com 等站点的防盗链问题）并提供加载失败时的 fallback 占位。接受标准 `<img>` 属性加 `fallback`（自定义 fallback 元素）。用于展示道具图片、队友官方图等外部 CDN 图片。

```tsx
import ExternalImage from "../components/ExternalImage.tsx";
<ExternalImage src={imageUrl} alt={name} className="my-img" />
```

#### 4.5.3 共享工具函数与常量

**`parseExpandParam()`** (`utils/helpers.js`) — 从 URL hash 中解析 `expand` 参数，用于从其他页面跳转后自动展开指定条目。已在 MovesPage、AbilitiesPage、ItemsPage 中使用。

```jsx
import { parseExpandParam } from "../utils/helpers.js";
const pendingExpandRef = useRef(parseExpandParam());
```

**`TYPE_BG_COLORS` / `TYPE_BG_COLORS_CARD`** (`utils/constants.js`) — 属性背景色映射。`TYPE_BG_COLORS` 使用 0.10 透明度（用于名称标签），`TYPE_BG_COLORS_CARD` 使用 0.18 透明度（用于卡片背景）。通过 `makeTypeBgColors(alpha)` 工厂函数生成，避免重复定义。

```jsx
import { TYPE_BG_COLORS, TYPE_BG_COLORS_CARD } from "../utils/constants.js";
const bgColor = TYPE_BG_COLORS[typeName] || "rgba(0,0,0,0.06)";
```

**`typeIconSrc(type)` / `categoryIconSrc(category)`** (`utils/constants.js`) — 属性图标和分类图标的 URL 生成函数。

```jsx
import { typeIconSrc, categoryIconSrc } from "../utils/constants.js";
<img src={typeIconSrc("fire")} alt="fire" />
<img src={categoryIconSrc("physical")} alt="physical" />
```

#### 4.5.4 共享 CSS（`styles/shared.css`）

`shared.css` 定义了跨页面复用的样式类，使用 `shared-` 前缀。为保持向后兼容，部分选择器同时包含旧前缀（`mv-`、`ab-`、`it-`）作为多选择器。

主要共享类名：`shared-name-tag`、`shared-name-ja`、`shared-name-en`、`shared-name-gen`、`shared-detail-effect`、`shared-detail-effect-title`、`shared-detail-effect-text`、`shared-detail-loading`、`shared-gen-timeline`、`shared-gen-item`、`shared-pokemon-section`、`shared-pokemon-grid`、`shared-wiki-link`、`shared-source`。

**开发规范**：新页面中使用 `shared-` 前缀的类名，不要再创建带页面前缀的重复样式。如需扩展共享样式，在 `shared.css` 中添加并使用 `shared-` 前缀。

### 4.6 ID 使用规范

前端所有 API 请求和 localStorage 存储**必须使用数据库数字 ID**，不得使用中文名称作为标识符。

**存储字段约定**：

| 字段 | 用途 | 示例值 |
|------|------|--------|
| `pokemonId` | 宝可梦数据库 ID（用于 API 请求） | `"25"` |
| `nameZh` | 宝可梦中文名（仅用于显示） | `"皮卡丘"` |
| `itemId` | 道具数据库 ID（用于 API 请求） | `"123"` |
| `itemName` | 道具中文名（仅用于显示） | `"气势披带"` |
| `abilityId` | 特性数据库 ID（用于数据标识） | `"42"` |
| `abilityName` | 特性中文名（仅用于显示） | `"静电"` |

**开发注意**：

- 从列表选择宝可梦/道具时，使用 `String(item.id)` 存储 ID，同时保存 `nameZh` / `itemName` 用于显示
- API 详情请求使用 `/pokemon/${id}` 或 `/items/${id}` 格式，不需要 `encodeURIComponent`
- 搜索请求仍使用中文名称：`/pokemon?q=${encodeURIComponent(name)}`（这是正确的）
- 界面显示优先使用 `itemName`，降级到 `itemId`：`data.itemName || data.itemId`
- `abilityId` 存储数字 ID，同时保存 `abilityName` 用于显示。PokemonEditor 的特性选择返回 `{id, name}` 对象，同时写入两个字段
- 界面显示优先使用 `abilityName`，降级到 `abilityId`：`data.abilityName || data.abilityId`

**数据迁移**：`utils/migrateStorage.js` 提供了旧格式数据的自动迁移（当前版本 v4）。应用启动时（`main.jsx`）会检测并迁移旧数据，包括：

- v1–v3：中文名 → 数字 ID（pokemonId、itemId、abilityId）
- v4：旧 slug 形中文 formKey → formId 解析（通过 `resolveFormId()` 多级匹配：精确 formKey/formType -> nameZh/displayNameZh/canonicalNameZh -> 大小写不敏感 -> 默认形态回退）

迁移标记为 `localdex_migration_v4`，存储在 localStorage 中防止重复执行。

### 4.7 DamagePage 开发注意事项

DamagePage 是项目中最复杂的页面，开发时需注意以下几点：

**EV↔SP 自动转换**：DamagePage 支持 Champions 赛制（SP 模式）和标准赛制（EV 模式）。切换赛制时会自动转换努力值，整体转换逻辑统一使用 `convertEvsToSps(evs)` 和 `convertSpsToEvs(sps)` 函数（位于 `utils/statCalcModel.ts`），不要在各组件中重复实现逐项 `evToSp` / `spToEv` + 总量裁剪的转换逻辑。

**形态切换自动绑定**：当用户切换宝可梦形态时，DamagePage 会自动绑定对应形态的道具和特性。例如超级进化形态会自动设置对应的超级石，极巨化形态会自动清除道具。

**天气和场地分段切换**：天气和场地选择使用分段控制器（segmented control）样式，采用 toggle 行为——点击已选中的按钮会取消选择（回到"无"状态），而不是设置一个显式的"无"选项。

**道具图片预览**：选中道具后，道具图片和名称以 flex 布局展示在搜索框位置，点击可清除选择恢复搜索框。不要使用绝对定位覆盖输入框的方式（会导致图片和文字重叠）。

### 4.8 宝可梦详情 Drawer 跨 Tab 联动

宝可梦图鉴详情 Drawer（`DrawerContent.tsx`）包含四个 Tab：种族值（StatsTab）、招式表（MovesTab）、进化链（EvolutionTab）、对战数据（BattleTab）。

BattleTab 与其他 Tab 之间存在跨 Tab 联动机制：

**对战数据 → 种族值计算器**：用户在 BattleTab 点击性格/努力值分配的"应用"按钮后，自动切换到 StatsTab，并将性格和 EV 注入种族值计算器。实现方式是 `DrawerContent` 维护 `battleApply` 状态，通过 `applyPreset` prop 传递给 `StatsTab` → `InlineStatCalculator`，后者在 `useEffect` 中消费数据（支持经典/Champions 两种模式的自动转换）。离开 StatsTab 时清空预设。

**对战数据 → 招式表搜索**：用户在 BattleTab 点击招式名后，自动切换到 MovesTab，并将招式名填入搜索框触发搜索。实现方式是 `DrawerContent` 维护 `moveSearchApply` 状态，通过 `initialSearch` prop 传递给 `MovesTab`。关键实现细节：`initialSearch` 直接整合在 MovesTab 的初始加载 effect 中（而非单独 effect），避免与重置逻辑打架——初始加载 effect 会用 `initialSearch || ""` 同时设置 `moveSearch` 状态和作为 `fetchPage` 的搜索参数。

**BattleTab 形态感知**：BattleTab 接收 `formId` prop（来自 `display.form?.id`），请求使用率数据时带上 `formId` 参数。不同形态的使用率是分开统计的（`champions_usage_pokemon` 表同时有 `pokemonId` 和 `formId`），切换形态时对战数据会自动刷新。

开发注意事项：

- 联动数据采用"一次性消费"模式：preset/search 被子组件消费后，离开 Tab 时由父组件清空为 null
- 新增联动方向时，在 `DrawerContent` 中添加状态和 handler，通过 props 单向传递给目标 Tab
- InlineStatCalculator 的 `applyPreset` effect 会自动判断当前模式（classic/champions），将 EV 转换为对应的 SP

### 4.9 CSS 模块化开发规范

项目样式采用模块化架构，所有 CSS 文件位于 `apps/web/src/styles/` 目录下，按页面或功能拆分为独立模块。

**目录结构与职责**：

| 文件 | 职责 | 前缀/命名空间 |
|------|------|--------------|
| `base.css` | CSS 变量、reset、body 基础样式 | `--` 变量 |
| `shared.css` | 跨页面共享样式（名称标签、世代时间线、Wiki 链接等） | `.shared-` |
| `nav.css` | 顶部导航栏、搜索框、过滤面板 | `.nav-`、`.filter-` |
| `pokedex.css` | 图鉴页 Master-Detail 布局 | `.pokedex-` |
| `stat-calculator.css` | 能力值计算器 | `.stat-calc-` |
| `abilities.css` | 特性页面 | `.ability-` |
| `moves.css` | 招式页面 | `.move-` |
| `items.css` | 道具页面 | `.item-` |
| `responsive.css` | 响应式断点（`@media` 查询） | — |
| `teams.css` | 盒子 & 队伍管理 | `.team-`、`.box-` |
| `box-card.css` | 盒子卡片 + 属性底色（`.type-bg-*`） | `.box-card-`、`.type-bg-` |
| `modal.css` | 通用弹窗 | `.modal-` |
| `pokemon-editor.css` | 配置编辑器 | `.editor-` |
| `common.css` | Toast、Version Tags、视图切换 | `.toast-`、`.version-` |
| `battle-tab.css` | 对战数据 Tab（使用率统计） | `.btd-` |
| `damage-v1.css` | 旧版伤害计算器 | `.damage-` |
| `damage.css` | 新版伤害计算器 | `.dc-` |
| `type-chart.css` | 属性克制表 | `.type-chart-` |

**入口与打包机制**：

`index.css` 通过 `@import` 汇总所有模块，`main.jsx` 中通过 `import "./styles/index.css"` 引入。Vite 在构建时会将所有 `@import` 解析并合并为单个 CSS 文件，生产环境只产生一次 HTTP 请求。这与将 CSS 放在 `public/` 目录下通过 `<link>` 引入有本质区别——后者的 `@import` 会在运行时逐个发起 HTTP 请求，每个模块一次请求，严重影响首屏性能。

**开发规范**：

- 新增页面样式时，创建对应的 CSS 文件并在 `index.css` 中添加 `@import`
- 每个模块使用独立的类名前缀（如 `dc-` 用于 damage calculator），避免跨模块命名冲突
- 公共变量（颜色、间距、圆角等）统一定义在 `base.css` 的 `:root` 中
- `box-card.css` 中的 `.type-bg-*` 类同时定义了 `--type-color` CSS 变量，供其他模块通过 `var(--type-color)` 引用属性颜色
- 响应式样式集中在 `responsive.css` 中管理，不要在各模块内分散编写 `@media` 查询
- 不要在 `public/` 目录下放置 CSS 文件，所有样式必须通过 `src/styles/` 走 Vite 打包流程

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

- `apps/api/.env`
- `apps/web/.env.local`
- `apps/miniprogram/.env`

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

GitHub Actions 工作流（`.github/workflows/deploy-cf.yml`）从 Secrets 读取以下变量：

| Secret 名称 | 用途 |
|-------------|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token（Workers/Pages/D1 权限）|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID |

---

## 七、构建与部署规范

### 7.1 Cloudflare Pages 部署

所有部署通过 GitHub Actions 自动完成，推送到 `main` 分支触发。

`main` 分支设置了保护规则：禁止强制推送，只能通过 Pull Request 合并。

工作流文件：`.github/workflows/deploy-cf.yml`

工作流关键步骤：
1. 删除 `package-lock.json` 后重新 `npm install`（确保 native binding 匹配 CI 平台，解决 rolldown 等原生模块在 Linux 环境的兼容问题）
2. `npm run build:web` 构建前端到 `dist/`
3. 部署 Worker：`wrangler deploy --config wrangler.worker.toml`
4. 部署 Pages：`wrangler pages deploy dist --project-name=pokemon-localdex --branch=main`

### 7.2 Vite Base 路径

Vite 的 base 路径固定为 `"/"`，Cloudflare Pages 在根路径提供服务，无需子路径前缀：

```javascript
// vite.config.js
base: "/"
```

构建产物输出到项目根目录的 `dist/`（`outDir: "../../dist"`），供 `wrangler pages deploy` 使用。

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
| `packages/battle-core` | 纯计算逻辑 | 不得有 I/O、不得包含 SQL、不得依赖 Node.js 特有 API |
| `packages/store/shared-types` | 共享类型/常量/辅助函数 | 不得有 I/O、不得依赖运行时特定 API |
| `packages/store/drizzle-schema` | Drizzle ORM 表定义 | 与 d1-schema.sql 保持一致 |
| `packages/store/drizzle-queries` | 统一查询逻辑（DrizzleStore） | 实现 IStore + NameLookup，不得有业务逻辑 |
| `packages/store/sqlite-store` | SQLite 薄封装 | 仅创建数据库连接，委托 drizzle-queries |
| `packages/store/d1-store` | D1 薄封装 | 仅创建数据库连接，委托 drizzle-queries |
| `packages/crawler_py` | 数据采集 | 不得直接被 API 层调用 |
| `apps/api` | HTTP 路由 | 不得包含数据库查询逻辑（委托给 store 包） |
| `apps/web` | UI 展示 | 不得直接操作数据库 |
| `apps/miniprogram` | 小程序 UI | 不得引入 Node.js 专有模块 |

### 8.2 store 包架构

存储层采用四层结构：shared-types 定义类型和常量，drizzle-schema 定义表结构，drizzle-queries 实现全部查询逻辑，sqlite-store 和 d1-store 作为薄封装层仅负责创建数据库连接。查询逻辑变更只需修改 drizzle-queries 一处，sqlite-store 和 d1-store 自动同步。

共享类型、常量和辅助函数统一定义在 `packages/store/shared-types`（`@pokemon-localdex/store-types`）中，不得在各自包内重复定义。

### 8.3 常量管理

全局常量（属性列表、性格列表、招式学习方式等）分别维护在：

- `apps/web/src/utils/constants.js`
- `apps/miniprogram/src/utils/constants.js`

两份文件内容应保持同步。如果需要新增常量，两处都要更新。

**能力值计算常量**（`EV_MAX`、`EV_TOTAL_MAX`、`SP_MAX`、`SP_TOTAL_MAX`、`IV_MAX`、`STAT_KEYS` 等）统一定义在 `apps/web/src/utils/statCalcModel.ts` 中。其他文件（如 `damageConstants.js`）通过 re-export 引用，不得重复定义。需要使用这些常量或计算函数的组件，应直接从 `statCalcModel.ts` 导入。

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

### Q4：Cloudflare Pages 部署后 API 报 1101 错误

**原因**：Service Binding 未正确配置。Pages Functions 通过 Service Binding 代理请求到 Worker，如果 `wrangler.toml` 中缺少 `[[services]]` 声明，会返回 1101 错误。

**排查步骤**：
1. 确认 `wrangler.toml` 中有 `[[services]]` 块声明 `binding = "API_WORKER"` 和 `service = "pokemon-localdex-api"`
2. 确认 Worker 已通过 `wrangler deploy --config wrangler.worker.toml` 成功部署
3. 直接访问 Worker URL（`pokemon-localdex-api.<account>.workers.dev`）验证 Worker 本身是否正常

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

1. 修改 `schema/d1-schema.sql`
2. 修改 `packages/store/drizzle-schema/src/index.ts`（Drizzle 表定义）
3. 修改 `packages/store/shared-types/src/index.ts`（共享类型/常量）
4. 修改 `packages/store/drizzle-queries/src/index.ts`（查询和 hydrate 逻辑）
5. 修改爬虫写入逻辑（如有）
6. 本地重建 SQLite：删除 `data/sqlite/localdex.sqlite` 后重新爬取

### 发布前检查清单

- [ ] `npm run check:api` 通过
- [ ] `npm run check:sqlite` 通过
- [ ] `npm run build:web` 无报错
- [ ] 本地模式（SQLite + API）功能正常
- [ ] 小程序构建无报错，微信开发者工具预览正常
- [ ] 没有将 `.env` 文件提交到 Git
