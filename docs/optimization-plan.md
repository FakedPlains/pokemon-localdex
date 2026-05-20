# Pokemon LocalDex 优化计划

> 本文档基于项目整体 code review 的发现，将优化建议按优先级拆解为可直接执行的任务。每项任务包含背景分析、涉及文件、具体改动步骤、预估工作量和验证方式。优先级分为 P1（建议尽快处理）、P2（中等优先级）、P3（长期优化），建议按编号顺序推进。

---

## 一、P1：建议尽快处理

### 1.1 Web 页面代码分拆（React.lazy）

**背景**

`apps/web/src/App.jsx` 顶部静态 import 了全部 7 个页面组件（PokedexPage、ItemsPage、MovesPage、AbilitiesPage、TeamsPage、DamagePage、TypeChartPage）。用户访问首页时，浏览器必须下载并解析所有页面的 JS，其中 DamagePage 还会拉入 `@smogon/calc` 这个较大的计算库。对于只浏览图鉴的用户来说，这些都是不必要的首屏开销。

**涉及文件**

- `apps/web/src/App.jsx`（第 1-11 行，页面导入区；第 150-200 行左右，路由渲染区）

**具体步骤**

第一步，将 7 个页面组件从静态 import 改为 `React.lazy` + 动态 `import()`。改动集中在 App.jsx 文件顶部：

```jsx
// 改动前
import PokedexPage from "./pages/PokedexPage.jsx";
import DamagePage from "./pages/DamagePage.jsx";
// ... 其余 5 个

// 改动后
import { lazy, Suspense } from "react";
const PokedexPage = lazy(() => import("./pages/PokedexPage.jsx"));
const DamagePage = lazy(() => import("./pages/DamagePage.jsx"));
// ... 其余 5 个
```

第二步，在路由渲染区域外层包裹 `<Suspense fallback={...}>`。fallback 可以复用项目已有的加载状态样式，保持一致的视觉体验。建议将 Suspense 放在 `<main>` 内、路由 switch 外层：

```jsx
<main className="main-content">
  <Suspense fallback={<div className="shared-loading">加载中...</div>}>
    {/* 路由匹配区域 */}
  </Suspense>
</main>
```

第三步，确认 Vite 构建输出。运行 `npm run build:web` 后检查 `dist/assets/` 目录，应该能看到每个页面被拆成独立的 chunk 文件。DamagePage 的 chunk 应该包含 `@smogon/calc`，与主 bundle 分离。

**注意事项**

PokedexPage 是默认路由也是最常用的页面，如果希望首屏零延迟可以保留静态 import，只对其余 6 个页面做 lazy 加载。但考虑到 PokedexPage 本身体积不大且 Vite 的 chunk 加载很快，全部 lazy 化也是可行的。项目当前使用 hash 路由，代码分拆与路由模式无关，不需要做额外的服务端配置。

**预估工作量**：约 30 分钟。

**验证方式**：运行 `npm run build:web`，确认产物中出现多个 chunk 文件；启动 `npm run dev:web`，打开浏览器 Network 面板，访问不同页面时应看到按需加载的 JS 请求。

---

### 1.2 CORS Origin 收紧

**背景**

`apps/api/src/worker.ts` 第 102-106 行和 `apps/api/src/app.ts` 中都配置了 `origin: "*"`，这意味着任何第三方站点都可以直接调用生产 API。虽然本项目的数据是公开的宝可梦资料，风险等级不算高，但收紧 CORS 是基本的安全卫生习惯，可以防止 API 被意外滥用。

**涉及文件**

- `apps/api/src/worker.ts`（第 102-106 行，CORS 中间件配置）
- `apps/api/src/app.ts`（CORS 配置，与 worker.ts 对应位置）
- `wrangler.worker.toml`（添加环境变量）

**具体步骤**

第一步，在 `wrangler.worker.toml` 的 `[vars]` 段添加 `ALLOWED_ORIGINS`：

```toml
[vars]
ALLOWED_ORIGINS = "https://pokemon-localdex.pages.dev"
```

第二步，修改 worker.ts 的 CORS 中间件配置，从环境变量读取 origin 列表：

```ts
app.use("*", cors({
  origin: (origin) => {
    const allowed = (env.ALLOWED_ORIGINS || "*").split(",").map(s => s.trim());
    if (allowed.includes("*")) return origin;
    return allowed.includes(origin) ? origin : null;
  },
  allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type"],
}));
```

第三步，app.ts（本地开发入口）保持 `origin: "*"` 不变，因为本地开发时前端端口可能变化，开放 CORS 是合理的。

第四步，如果有 Cloudflare Pages 自定义域名，将其也加入 `ALLOWED_ORIGINS` 列表，用逗号分隔。

**注意事项**

如果不想把 origin 列表硬编码在配置文件中，也可以放到 Cloudflare Dashboard 的环境变量中，通过 GitHub Actions Secrets 注入。

**预估工作量**：约 20 分钟。

**验证方式**：部署到 Cloudflare 后，使用 curl 从非允许域名发起跨域请求，确认响应不包含 `Access-Control-Allow-Origin` 头；从允许域名发起请求应正常返回。本地开发不受影响。

---

### 1.3 IStore 接口的 any 返回类型治理

**背景**

`IStore` 是整个项目数据层的核心契约接口，定义在 `packages/store/shared-types/src/index.ts` 中。目前有三个方法的返回类型是 `Promise<any>` 或 `Promise<any[] | PaginatedResult<any>>`：`getLearnsetMeta`（第 321 行）、`getPokemonByMove`（第 330 行）、`getPokemonByAbility`（第 335 行）。这三个 `any` 会导致从 store 查询到 API 路由再到前端调用的整条链路上类型安全完全失效。

**涉及文件**

- `packages/store/shared-types/src/index.ts`（IStore 接口定义，第 293-353 行）
- `packages/store/drizzle-queries/src/index.ts`（DrizzleStore 实现这三个方法的位置）
- `apps/api/src/routes/pokemon.ts`（调用这三个方法的路由）

**具体步骤**

第一步，阅读 `drizzle-queries` 中 `getLearnsetMeta`、`getPokemonByMove`、`getPokemonByAbility` 三个方法的实际 SELECT 字段和 hydrate 逻辑，记录它们真实返回的数据结构。

第二步，在 `shared-types/src/index.ts` 中新增三个具体类型，字段与查询返回值严格对齐：

```ts
export type LearnsetMeta = {
  pokemonId: number;
  nameZh: string;
  formId: number;
  formKey: string;
  formNameZh: string;
  primaryType: string;
  secondaryType: string | null;
  imageUrl: string | null;
  // 根据实际查询补充
};

export type PokemonByMoveSummary = {
  pokemonId: number;
  nameZh: string;
  formId: number;
  formKey: string;
  primaryType: string;
  secondaryType: string | null;
  imageUrl: string | null;
  learnMethod?: string;
};

export type PokemonByAbilitySummary = {
  pokemonId: number;
  nameZh: string;
  formId: number;
  formKey: string;
  primaryType: string;
  secondaryType: string | null;
  imageUrl: string | null;
  isHidden: boolean;
};
```

第三步，将 IStore 中三个方法的返回类型替换为具体类型：

```ts
getLearnsetMeta(pokemonId: number): Promise<LearnsetMeta | null>;
getPokemonByMove(moveId: number, ...): Promise<PokemonByMoveSummary[] | PaginatedResult<PokemonByMoveSummary>>;
getPokemonByAbility(abilityId: number, ...): Promise<PokemonByAbilitySummary[] | PaginatedResult<PokemonByAbilitySummary>>;
```

第四步，在 DrizzleStore 实现中确认这三个方法的返回值与新类型兼容。如有字段不匹配，调整 hydrate 逻辑或类型定义。

**注意事项**

定义新类型时，必须以 `drizzle-queries` 的查询代码为准，不要凭猜测定义字段。

**预估工作量**：约 1 小时。

**验证方式**：运行 `npm run check:api` 和 `npm run check:sqlite`，确认 TypeScript 编译无错误。

---

## 二、P2：中等优先级改进

### 2.1 route-utils.ts 的 any 类型治理

**背景**

`apps/api/src/route-utils.ts` 中有 5 处函数参数使用了 `c: any`（Hono 的 Context 参数），导致所有 `c.req`、`c.json()`、`c.header()` 等调用都没有类型提示和类型检查。

**涉及文件**

- `apps/api/src/route-utils.ts`（全文约 41 行）

**具体步骤**

将所有 `c: any` 替换为 Hono 的 `Context` 类型。使用 `Context<any>` 作为过渡方案，已经比裸 `any` 好很多：

```ts
import type { Context } from "hono";

type AnyContext = Context<any>;

export function numberQuery(c: AnyContext, key: string, fallback?: number): number | undefined { ... }
export function paginatedJson(c: AnyContext, result: unknown) { ... }
```

后续如果需要更精确的 Env 类型绑定，可以进一步收窄泛型参数。

**预估工作量**：约 20 分钟。

**验证方式**：运行 `npm run check:api`。

---

### 2.2 DrizzleStore 构造函数类型治理

**背景**

`packages/store/drizzle-queries/src/index.ts` 的 `DrizzleStore` 类中 `db` 字段声明为 `private db: any`，失去了 Drizzle 查询编写时的类型推断能力。

**涉及文件**

- `packages/store/drizzle-queries/src/index.ts`（第 68-72 行）

**具体步骤**

使用 Drizzle 提供的 `BaseSQLiteDatabase` 类型约束 db 字段：

```ts
import { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

type DrizzleDb = BaseSQLiteDatabase<"async", any>;

class DrizzleStore implements IStore {
  private db: DrizzleDb;
  constructor(db: DrizzleDb) {
    this.db = db;
  }
}
```

第二个泛型参数（schema 类型）用 `any` 是可接受的，因为内部直接引用表对象而非通过 schema 泛型访问。同时需要确认 `createDrizzleStore` 工厂函数的参数类型也同步更新。

**预估工作量**：约 20 分钟。

**验证方式**：运行 `npm run check:sqlite`。

---

### 2.3 DamagePage 场地状态收拢为自定义 Hook

**背景**

`apps/web/src/pages/DamagePage.jsx` 第 55-80 行使用了约 10 个独立的 `useState` 管理场地环境状态（weather、terrain、gravity、magicRoom、wonderRoom、四个灾厄特性），加上 battleMode 和两个 teraType，导致 `FieldControlPanel` 组件需要接收 18 个 props。项目已经有 `useDamageSideState` 作为先例，场地状态也应该收拢。

**涉及文件**

- `apps/web/src/pages/DamagePage.jsx`（第 55-80 行状态声明，第 291-310 行 FieldControlPanel 调用）
- `apps/web/src/hooks/`（新建 `useFieldState.js`）
- `apps/web/src/components/damage/FieldControlPanel.jsx`（props 签名调整）

**具体步骤**

第一步，在 `apps/web/src/hooks/` 下新建 `useFieldState.js`，用 `useReducer` 管理所有场地状态：

```js
import { useReducer } from "react";

const initialFieldState = {
  weather: "",
  terrain: "",
  gravity: false,
  magicRoom: false,
  wonderRoom: false,
  beadsOfRuin: false,
  tabletsOfRuin: false,
  swordOfRuin: false,
  vesselOfRuin: false,
};

function fieldReducer(state, action) {
  if (action.type === "set") return { ...state, [action.key]: action.value };
  if (action.type === "toggle") return { ...state, [action.key]: !state[action.key] };
  if (action.type === "reset") return { ...initialFieldState };
  return state;
}

export function useFieldState() {
  const [field, dispatch] = useReducer(fieldReducer, initialFieldState);
  const setField = (key, value) => dispatch({ type: "set", key, value });
  const toggleField = (key) => dispatch({ type: "toggle", key });
  const resetField = () => dispatch({ type: "reset" });
  return { field, setField, toggleField, resetField };
}
```

第二步，在 DamagePage.jsx 中用 `useFieldState()` 替换 10 个独立的 `useState`。

第三步，修改 FieldControlPanel 的 props 签名，从 18 个独立 prop 改为接收 `field` 对象和 `onFieldChange` 回调。注意保留天气和场地分段按钮的 toggle 行为（再次点击当前选项清空值）。

**注意事项**

改动时注意 DamagePage 第 165-185 行的 `depsForRecalc` 也依赖了这些场地状态值，收拢后需要同步更新依赖表达式。建议与 2.4 一起做。

**预估工作量**：约 1.5 小时。

**验证方式**：运行 `npm run build:web`；启动 dev 服务，在伤害计算页面完整操作一遍天气/场地/灾厄切换，确认 toggle 行为、计算结果和 UI 状态都正常。

---

### 2.4 DamagePage 的 JSON.stringify 依赖优化

**背景**

`DamagePage.jsx` 第 165-185 行将约 20 个状态值放入数组后用 `JSON.stringify()` 序列化为字符串，作为 `useEffect` 的单一依赖项。每次渲染都执行一次序列化，且这种模式掩盖了真正的依赖关系，ESLint 的 `react-hooks/exhaustive-deps` 规则也被手动禁用。

**涉及文件**

- `apps/web/src/pages/DamagePage.jsx`（第 165-185 行）

**具体步骤**

如果已完成 2.3 的场地状态收拢，可以将依赖改为用 `useMemo` 计算一个稳定的 key：

```js
const calcKey = useMemo(() => {
  return JSON.stringify({
    gen: generation,
    atk: { pokemonId: atkMember.pokemonId, formId: atkMember.formId, level: atkMember.level },
    def: { pokemonId: defMember.pokemonId, formId: defMember.formId, level: defMember.level },
    move: selectedMove,
    field,
    mode: battleMode,
  });
}, [generation, atkMember, defMember, selectedMove, field, battleMode]);
```

这样依赖列表明确、序列化数据量更小、ESLint 规则可以正常工作。

**预估工作量**：约 30 分钟（如果与 2.3 一起做，增量很小）。

**验证方式**：在伤害计算页面修改各项参数，确认计算结果仍然实时更新且防抖行为正常。

---

### 2.5 battle/damage 路由输入校验

**背景**

`apps/api/src/routes/battle.ts` 的 POST `/battle/damage` 路由直接将请求 JSON body 传给 `calculateDamage`，没有任何结构验证。格式错误的请求可能导致 `@smogon/calc` 内部抛出难以理解的错误堆栈。

**涉及文件**

- `apps/api/src/routes/battle.ts`（全文约 18 行）

**具体步骤**

在调用 `calculateDamage` 之前添加关键字段的存在性检查，不需要引入额外的验证库：

```ts
app.post("/battle/damage", async (c) => {
  const store = await getStore(c);
  const input = await c.req.json();

  if (!input || typeof input !== "object") {
    return c.json({ error: "请求体必须是 JSON 对象" }, 400);
  }
  if (!input.generation || !input.attacker || !input.defender || !input.move) {
    return c.json({ error: "缺少必填字段：generation, attacker, defender, move" }, 400);
  }
  if (!input.attacker.pokemonId && !input.attacker.name) {
    return c.json({ error: "attacker 必须提供 pokemonId 或 name" }, 400);
  }
  if (!input.defender.pokemonId && !input.defender.name) {
    return c.json({ error: "defender 必须提供 pokemonId 或 name" }, 400);
  }

  try {
    const result = await calculateDamage(input, store);
    return c.json({ data: result });
  } catch (err) {
    return c.json({ error: err?.message || "伤害计算失败" }, 400);
  }
});
```

如果未来验证逻辑变复杂，再考虑引入 zod 或 valibot。

**预估工作量**：约 15 分钟。

**验证方式**：运行 `npm run check:api`；手动发送缺少字段的 POST 请求确认返回明确的错误信息。

---

### 2.6 CI Lockfile 策略优化

**背景**

`.github/workflows/deploy-cf.yml` 第 26-29 行在安装依赖前执行 `rm -f package-lock.json && npm install`。删除 lockfile 后重新 install 意味着每次部署的依赖版本可能漂移，如果 npm registry 上某个包发布了有 breaking change 的新版本，CI 会静默采用。

**涉及文件**

- `.github/workflows/deploy-cf.yml`（第 26-29 行）

**具体步骤**

推荐方案：保留 lockfile，用 `npm ci` 代替 `npm install`，跳过 postinstall 后单独 rebuild：

```yaml
- name: Install dependencies
  run: npm ci --ignore-scripts && npm rebuild
```

如果上述方案有兼容问题，退而求其次：保留删除 lockfile 方案，但添加 `npm ls --depth=0` 输出实际安装版本，让漂移可追溯。

**预估工作量**：约 20 分钟。

**验证方式**：推送到 main 分支触发 CI，确认部署成功。

---

### 2.7 D1 迁移 Job 触发条件修复

**背景**

`deploy-cf.yml` 中 `migrate-d1` job 通过 `contains(github.event.head_commit.modified, 'schema/d1-schema.sql')` 判断是否触发。`head_commit.modified` 只包含最后一个 commit 的修改文件，多 commit push 时可能遗漏。

**涉及文件**

- `.github/workflows/deploy-cf.yml`（第 55-57 行）

**具体步骤**

推荐使用 `dorny/paths-filter` action 替代 `head_commit.modified` 判断：

```yaml
migrate-d1:
  needs: deploy
  runs-on: ubuntu-latest
  if: github.ref == 'refs/heads/main'
  steps:
    - uses: actions/checkout@v4
      with:
        fetch-depth: 0
    - uses: dorny/paths-filter@v3
      id: changes
      with:
        filters: |
          schema:
            - 'schema/d1-schema.sql'
    - name: Migrate D1
      if: steps.changes.outputs.schema == 'true'
      run: npx wrangler d1 execute pokemon-localdex-d1 --remote --file=schema/d1-schema.sql
      env:
        CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

备选方案：用 `git diff --name-only ${{ github.event.before }} ${{ github.event.after }}` 检查变更列表。

**预估工作量**：约 30 分钟。

**验证方式**：多 commit push 包含 schema 变更，确认迁移 job 正确触发。

---

## 三、P3：长期优化项

### 3.1 helpers.js 与 shared-types 的重复函数消除

**背景**

`apps/web/src/utils/helpers.js` 中的 `normalizeTypeName()` 与 `packages/store/shared-types/src/constants.js` 中的类型查找逻辑存在重复。`normalizeTypeName` 内部已经调用了 constants 导出的 `typeNameToId` 和 `typeIdToName`，函数本身可以直接内联为这两个调用的组合而无需独立维护。

**涉及文件**

- `apps/web/src/utils/helpers.js`（第 24-55 行）
- `packages/store/shared-types/src/constants.js`

**具体步骤**

评估 `splitTypeNames` 的贪心匹配逻辑是否有跨包复用需求。如果是纯前端展示逻辑，保留在 helpers.js；将 `normalizeTypeName` 改为直接组合 `typeNameToId` + `typeIdToName`，删除重复实现。

**预估工作量**：约 30 分钟。

**验证方式**：运行 `npm run build:web`，在图鉴页面确认属性显示正常。

---

### 3.2 爬虫 backfill 循环内重复解析优化

**背景**

`packages/crawler_py/localdex_crawler/cli.py` 中 `_backfill_incomplete_moves` 函数在逐条补全空壳招式时，虽然 fetcher 有缓存不会重复发起 HTTP 请求，但 `parse_move_list_page` 的 HTML 解析操作在循环内每次都重复执行。

**涉及文件**

- `packages/crawler_py/localdex_crawler/cli.py`（第 406-434 行）

**具体步骤**

将 `fetcher.load_or_fetch` 和 `parse_move_list_page` 调用提到循环外部，在函数入口处一次性解析完招式列表，循环内只做查找和单条招式详情补全。

**预估工作量**：约 15 分钟。

**验证方式**：运行 `npm run crawl:learnsets -- --pokemon 皮卡丘 --dry-run`，确认 backfill 逻辑不报错。

---

### 3.3 增量 schema 迁移方案

**背景**

当前 `schema/d1-schema.sql` 使用 `CREATE TABLE IF NOT EXISTS`，可以安全反复执行，但无法处理 `ALTER TABLE` 等增量变更。随着项目发展，缺少编号迁移机制会导致生产环境的 schema 演进变得脆弱。

**涉及文件**

- 新增 `schema/migrations/` 目录
- `.github/workflows/deploy-cf.yml`（migrate-d1 job）

**具体步骤**

建议在项目需要第一次 ALTER TABLE 时引入。创建 `schema/migrations/` 目录，将当前文件作为 `001_initial.sql`。后续每次 schema 变更新增编号文件。CI 中按编号顺序执行，维护 `schema_migrations` 表记录已执行的迁移编号。也可以考虑使用 Drizzle Kit 的 migration 功能。

**预估工作量**：约 3 小时。

**验证方式**：本地用 `wrangler d1 execute --local` 测试迁移文件的执行顺序和幂等性。

---

### 3.4 useApi 请求缓存与去重

**背景**

`apps/web/src/hooks/useApi.ts` 已经支持 `enabled` 条件请求和 `path: string | null` 的跳过语义，但仍没有缓存和去重机制。相同的 API 请求在不同组件挂载时会重复发起。`useApiCallback` 提供了手动触发的命令式请求能力，但也不涉及缓存。

**涉及文件**

- `apps/web/src/hooks/useApi.ts`
- `apps/web/src/utils/api.ts`
- 可能新增 `apps/web/src/utils/apiCache.ts`

**具体步骤**

短期方案：在 `api.ts` 层加一个简单的内存缓存 Map，key 为请求路径+参数的序列化字符串，value 包含 Promise 和过期时间。相同 key 的并发请求复用同一个 Promise，已完成的请求在 TTL 内直接返回缓存结果。`useApi` 的 `enabled=false` 或 `path=null` 时不应创建缓存条目。长期方案：如果请求场景进一步增多，可以评估引入 `@tanstack/react-query`。

**预估工作量**：约 2 小时（短期方案）。

**验证方式**：浏览器 Network 面板观察切换页面后再切回时，已缓存的请求不再重复发起。

---

### 3.5 battle-core 内 smogon-calc 类型对齐

**背景**

`packages/battle-core/src/index.ts` 中 `buildPokemonOpts` 函数构建的 opts 对象类型标注为 `Record<string, any>`，最终通过 `as any` 传入 `new Pokemon()`。

**涉及文件**

- `packages/battle-core/src/index.ts`（第 138-154 行）

**具体步骤**

从 `@smogon/calc` 导入 Pokemon 构造函数的参数类型，将 opts 标注改为部分引用该类型，移除 `as any` 断言。

**预估工作量**：约 30 分钟。

**验证方式**：运行 `npm run check:damage`。

---

## 四、执行顺序与依赖关系

同一阶段内的任务没有相互依赖，可以并行开发。

**第一阶段（P1）：** 1.2 CORS 收紧（最小改动，安全相关） -> 1.1 Web 代码分拆（用户体验影响最大） -> 1.3 IStore any 治理（为 P2 类型改进打基础）。

**第二阶段（P2）：** (2.1 route-utils 类型 + 2.2 DrizzleStore 类型) -> (2.3 场地状态收拢 + 2.4 JSON.stringify 优化) -> 2.5 battle 输入校验 -> (2.6 CI lockfile + 2.7 D1 迁移触发)。

**第三阶段（P3）：** 这些改动可以在日常开发中逐步推进，没有严格的顺序要求。3.2 和 3.5 适合在下次改动相关模块时顺手处理。3.3 在首次需要 ALTER TABLE 时引入。3.4 在请求场景增多时评估。

---

## 五、改动量预估

| 任务编号 | 任务名称 | 预估文件数 | 预估工时 | 风险等级 |
|---------|---------|-----------|---------|--------|
| 1.1 | Web 代码分拆 | 1-2 | 0.5h | 低 |
| 1.2 | CORS 收紧 | 2-3 | 0.5h | 低 |
| 1.3 | IStore any 治理 | 2-3 | 1h | 中 |
| 2.1 | route-utils 类型 | 1 | 0.5h | 低 |
| 2.2 | DrizzleStore 类型 | 1-2 | 0.5h | 低 |
| 2.3 | DamagePage 场地状态收拢 | 2-3 | 1.5h | 中 |
| 2.4 | JSON.stringify 依赖优化 | 1 | 0.5h | 低 |
| 2.5 | battle/damage 输入校验 | 1 | 0.5h | 低 |
| 2.6 | CI lockfile 策略 | 1 | 0.5h | 中 |
| 2.7 | D1 迁移触发条件 | 1 | 0.5h | 低 |
| 3.1 | helpers.js 去重 | 2-3 | 0.5h | 低 |
| 3.2 | backfill 解析优化 | 1 | 0.5h | 低 |
| 3.3 | 增量 schema 迁移 | 3-5 | 3h | 中 |
| 3.4 | useApi 缓存 | 2-3 | 2h | 中 |
| 3.5 | battle-core 类型对齐 | 1 | 0.5h | 低 |

P1 总工时约 2 小时，P2 总工时约 4.5 小时，P3 总工时约 6.5 小时。全部合计约 13 小时。

---

## 六、验证检查清单

每个阶段完成后，执行以下验证命令确认没有引入回归：

```bash
# API/Store 相关改动
npm run check:sqlite
npm run check:api

# 伤害计算改动
npm run check:damage

# Web 改动
npm run build:web
npm run check:web:static

# 全量检查
npm run check:sqlite && npm run check:api && npm run check:damage && npm run build:web
```

Web 视觉相关改动（代码分拆、DamagePage 重构）还需要启动开发服务器后在浏览器中手动验证各页面的渲染和交互，重点关注图鉴页面无限滚动、伤害计算的自动重算和 toggle 行为、队伍编辑的保存和加载。
