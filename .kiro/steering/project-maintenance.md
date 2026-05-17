---
inclusion: always
---

# 种树游戏项目维护指南

## 项目结构

- **前端**：微信小程序原生框架，根目录下 `pages/`、`services/`、`app.js`、`app.json`
- **后端**：Node.js + Express + SQLite，位于 `server/` 目录
- **规格文档**：`.kiro/specs/tree-growing-game/`

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | 微信小程序原生（WXML/WXSS/JS） |
| 后端 | Node.js + Express + better-sqlite3 |
| 数据库 | SQLite（`server/db/tree-game.db`，自动创建） |
| 测试 | Vitest + fast-check（属性测试） |
| 定时任务 | node-cron |

## 启动方式

```bash
cd server && npm start   # 后端启动在 localhost:3000
```

微信开发者工具打开项目根目录，勾选"不校验合法域名"。

## 运行测试

```bash
cd server && npm test
```

当前 210 个测试（含 9 个属性测试）。修改后端代码后必须确保测试通过。

## 代码架构约定

### 后端分层

```
server/
├── controllers/   # HTTP 请求处理，参数校验，调用 service
├── services/      # 业务逻辑，核心算法
├── models/        # 数据库 CRUD 操作
├── routes/        # Express 路由注册
├── middleware/    # 认证等中间件
├── jobs/          # 定时任务
├── db/            # 数据库初始化和种子数据
└── tests/         # 测试文件
```

### 工厂模式

所有 service 和 model 使用工厂模式 `createXxxService(options)` 支持依赖注入：
- `options.getDatabase` - 自定义数据库获取函数（测试用 `:memory:`）
- 导出默认实例和工厂函数

### 前端页面结构

```
pages/
├── index/         # 主页面（浇水、施肥、树展示）
├── select-tree/   # 选择树种
├── cards/         # 卡牌收集
├── ranking/       # 排行榜
└── dev-panel/     # 开发控制面板（仅开发环境）
```

## 关键配置

所有游戏数值在 `server/config.js` 中集中管理。前端需要的常量在 `pages/index/index.js` 顶部同步维护。

## 开发环境特性

- `BASE_URL` 包含 `localhost` 时自动进入开发模式
- 开发模式下显示 dev-panel（选择测试账号）和调试按钮（无限浇水/施肥/触发结算）
- 测试接口：`POST /api/test/fake-user`、`POST /api/test/refill`、`POST /api/test/settle`

## 修改注意事项

1. 修改后端逻辑后运行 `npm test` 确保通过
2. 修改 `config.js` 中的数值后，检查前端是否有同步的常量需要更新
3. 新增数据库表需要在 `server/db/init.js` 的 `createTables` 中添加
4. 新增 API 需要：controller → service → model → route → 注册到 index.js
5. 前端页面新增需要在 `app.json` 的 pages 数组中注册
6. 卡组效果的实现分布在：treeService（浇水加成）、settlementService（健康扣除减少）、wateringTimerService（浇水上限）
7. 删除数据库文件后重启服务会自动重建并插入种子数据

## 常见问题

- **浇水次数不恢复**：检查 `getUserInfo` 是否调用了惰性计算 `calculateAvailableWaterCount`
- **前端倒计时异常**：倒计时基于本地预估，只在首次加载和浇水操作后从服务端同步
- **测试端口冲突**：HTTP 集成测试偶尔出现 "bad port" 错误，重跑即可
- **卡组效果不生效**：确认 `cardService.hasCompletedSet` 被正确调用，且数据库有种子数据
