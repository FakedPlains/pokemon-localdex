# 架构设计

## 一、目标

这个项目要同时满足三件事：

1. 数据必须完全来自 52Poké Wiki。
2. 数据要能本地离线使用。
3. 查询、队伍构筑、伤害计算必须在多个端上共用一套核心逻辑。

## 二、架构

采用 `Python 爬虫 -> SQLite 存储 -> Hono API -> React SPA` 的四层结构。

### 1. 采集层（crawler_py）

职责：

- 抓取 52Poké 页面，缓存原始 HTML 到 `data/raw/`
- 解析页面，标准化数据
- 直接写入 SQLite 数据库

原则：

- 所有解析逻辑集中在 `packages/crawler_py`
- 支持增量更新（upsert）和清除重建（`--clean`）两种模式
- 繁体中文自动转换为简体

### 2. 存储层（sqlite-store）

职责：

- 定义 SQLite schema 和类型
- 提供查询适配函数
- 导出所有数据类型供 API 层使用

### 3. API 层（apps/api）

职责：

- 提供统一查询入口
- 给 Web 和未来多端共用
- 全部从 SQLite 读取数据

### 4. 展示层（apps/web）

- React SPA，由 Vite 构建
- 通过 API 获取数据

## 三、数据落地

- 唯一存储：SQLite（`data/sqlite/localdex.sqlite`）
- 队伍数据：JSON 文件（`data/teams.json`）
- 原始页面缓存：`data/raw/`（便于追溯和断点续跑）

## 四、MVP 范围

第一阶段已完成：

- 宝可梦基础资料、道具、招式、特性
- 队伍保存
- 单次伤害计算
- Web 端图鉴浏览

第二阶段：

- 属性克制表、性格、道具和特性对伤害计算的联动
- 特性拥有者列表和招式学习表的反向查询
- 世代切换视图和字段差异提示
