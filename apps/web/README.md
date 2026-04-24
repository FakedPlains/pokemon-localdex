# Web 端

当前已经落地一版零依赖静态 Web 前端，目录在：

- `apps/web/public/index.html`
- `apps/web/public/assets/styles.css`
- `apps/web/public/assets/app.js`

## 运行方式

直接启动 API：

```bash
npm run dev:api
```

默认监听 `127.0.0.1:3030`。如果你需要改端口或监听地址，可以这样启动：

```bash
HOST=127.0.0.1 PORT=3031 npm run dev:api
```

然后访问：

```bash
http://localhost:3030/
```

## 当前能力

- 图鉴列表搜索
- 属性和世代筛选
- 宝可梦详情展示：普通/闪光图、超级进化形态、世代差异卡片、按世代可学招式表
- 道具列表与详情：支持图片展示
- 招式列表与详情：支持按世代查看威力、命中、PP、效果
- 特性列表与详情：支持按世代查看效果
- 队伍构筑器：6 槽编辑、招式/性格/IV/EV 输入、载入已保存队伍继续编辑
- 伤害计算器：独立选择攻守双方并手动配置，不依赖队伍；支持直接选择招式并自动带出当前世代参数，也支持从当前队伍快速导入；当选择攻击方后，会按该宝可梦在当前世代真正可学的招式自动过滤候选
- 当底层跑 `import:52poke` 时，伤害页会优先利用真实世代招式表导入出来的 learnset 和招式基础参数
- 当底层跑 `import:52poke` 时，图鉴页与道具页会优先展示缓存到 `apps/web/public/assets/cache/` 的真实 52Poké 图片

## 后续建议

下一步更适合升级到组件化前端框架时，再切到：

- React + Vite
- 共享 `packages/battle-core`
- 通过 `apps/api` 获取本地标准化数据
