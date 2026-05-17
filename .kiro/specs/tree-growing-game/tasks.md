# 实现计划：种树游戏

## 概述

基于微信小程序 + Node.js 后端架构实现种树游戏。按照后端基础设施 → 核心业务逻辑 → 前端页面 → 集成联调的顺序逐步推进，确保每一步都可验证。

## Tasks

- [x] 1. 搭建后端项目结构和基础设施
  - [x] 1.1 初始化后端项目并安装依赖
    - 在 `server/` 目录下初始化 Node.js 项目
    - 安装 express、better-sqlite3、node-cron、cors 依赖
    - 安装 vitest、fast-check 作为开发依赖
    - 创建 `server/index.js` 服务入口文件，配置 Express 应用和端口监听
    - 创建 `server/config.js` 游戏配置参数文件，包含所有游戏常量
    - _Requirements: 10.1, 10.3_

  - [x] 1.2 实现数据库初始化模块
    - 创建 `server/db/init.js`，使用 better-sqlite3 初始化 SQLite 数据库
    - 创建 users、trees、cards、card_sets、user_cards、user_rankings 表
    - 插入初始卡牌和卡牌套装种子数据
    - _Requirements: 10.1_

  - [x] 1.3 实现用户身份验证中间件
    - 创建 `server/middleware/auth.js`
    - 实现基于 token 的请求验证逻辑（简化版：使用 openid 作为 token）
    - 未认证请求返回 401 状态码和 AUTH_REQUIRED 错误码
    - _Requirements: 10.4_

- [x] 2. 实现用户模块
  - [x] 2.1 实现用户 Model 和 Service
    - 创建 `server/models/userModel.js`，实现用户 CRUD 操作
    - 创建 `server/services/userService.js`，实现登录逻辑
    - 首次登录时创建用户记录，初始化 Grow_Score=0、Healthy_Score=30、Tree_Level=0、浇水次数=max_watering_time
    - 实现每日首次登录施肥次数恢复逻辑
    - _Requirements: 1.1, 1.2, 1.3, 4.1, 4.2_

  - [x] 2.2 实现用户 Controller 和路由
    - 创建 `server/controllers/userController.js`
    - 创建 `server/routes/user.js`
    - 实现 POST /api/user/login 和 GET /api/user/info 接口
    - _Requirements: 1.1, 1.2, 10.3_

  - [x] 2.3 编写施肥次数恢复属性测试
    - **Property 4: 每日施肥次数恢复逻辑**
    - 使用 fast-check 生成随机日期对（相同/不同天）和随机施肥次数
    - 验证：不同天时恢复 daily_fertilize_resume_times 但不超过 max_fertilize_count；相同天时不变
    - **Validates: Requirements 4.1, 4.2**

- [ ] 3. 实现浇水次数恢复计算模块
  - [x] 3.1 实现浇水次数惰性计算 Service
    - 创建 `server/services/wateringTimerService.js`
    - 实现 `calculateAvailableWaterCount(user)` 方法：根据 last_water_recover_time 和当前时间计算可用浇水次数
    - 实现 `consumeWaterCount(userId)` 方法：消耗一次浇水机会并更新恢复时间
    - _Requirements: 3.1, 3.2_

  - [x] 3.2 编写浇水次数惰性计算属性测试
    - **Property 1: 浇水次数惰性计算正确性**
    - 使用 fast-check 生成随机初始次数(0-50)和随机时间差(0-86400000ms)
    - 验证：计算结果 = min(w + floor(t / watering_resume_interval), max_watering_time)
    - **Validates: Requirements 3.1, 3.2**

- [ ] 4. 实现树操作核心逻辑
  - [x] 4.1 实现树 Model 和等级计算
    - 创建 `server/models/treeModel.js`，实现树的 CRUD 操作
    - 创建 `server/services/treeService.js`
    - 实现 `selectSpecies(userId, species)` 方法，验证树种有效性和重复选择
    - 实现 `calculateLevel(growScore)` 方法，根据成长值计算对应等级
    - _Requirements: 2.2, 5.1, 5.2_

  - [x] 4.2 编写等级计算属性测试
    - **Property 5: 等级计算一致性**
    - 使用 fast-check 生成随机成长值(0-10000)
    - 验证：计算出的等级为满足 upgrade_need_grow_score[level] ≤ g 的最大 level
    - **Validates: Requirements 5.1, 5.2, 6.5**

  - [x] 4.3 实现浇水操作逻辑
    - 在 treeService 中实现 `water(userId)` 方法
    - 调用 wateringTimerService 检查并消耗浇水次数
    - 增加成长值，判定升级，调用卡牌获取逻辑
    - 浇水次数为 0 时返回 NO_WATER_COUNT 错误
    - _Requirements: 3.3, 3.4, 5.1, 5.2_

  - [x] 4.4 编写浇水操作属性测试
    - **Property 2: 浇水操作状态变更正确性**
    - 使用 fast-check 生成随机用户状态（有/无浇水次数，有/无树种）
    - 验证：浇水次数减少1，成长值增加正整数值，次数为0时操作被拒绝
    - **Validates: Requirements 3.3, 3.4**

  - [x] 4.5 实现施肥操作逻辑
    - 在 treeService 中实现 `fertilize(userId)` 方法
    - 扣除施肥次数，增加健康值（上限100）
    - 施肥次数为 0 时返回 NO_FERTILIZE_COUNT 错误
    - _Requirements: 4.3, 4.4, 4.5_

  - [x] 4.6 编写施肥操作属性测试
    - **Property 3: 施肥健康值计算正确性**
    - 使用 fast-check 生成随机初始健康值(0-100)和随机施肥次数(0-1)
    - 验证：施肥后健康值 = min(h + user_fertilize_recover_effect, 100)，施肥次数减少1
    - **Validates: Requirements 4.3, 4.4, 4.5**

  - [x] 4.7 实现树操作 Controller 和路由
    - 创建 `server/controllers/treeController.js`
    - 创建 `server/routes/tree.js`
    - 实现 POST /api/tree/select、POST /api/tree/water、POST /api/tree/fertilize、GET /api/tree/status 接口
    - _Requirements: 2.2, 3.3, 4.3, 10.3_

- [x] 5. Checkpoint - 确保核心浇水施肥逻辑正确
  - 确保所有测试通过，ask the user if questions arise.

- [ ] 6. 实现卡牌系统
  - [x] 6.1 实现卡牌 Model 和 Service
    - 创建 `server/models/cardModel.js`，实现卡牌和用户卡牌的数据操作
    - 创建 `server/services/cardService.js`
    - 实现 `tryGainCard(userId)` 方法：概率判定 + 加权随机选择卡牌
    - 实现 `getUserCards(userId)` 方法：获取用户卡牌列表
    - 实现 `checkSetCompletion(userId)` 方法：检查套装完成状态
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3_

  - [x] 6.2 编写卡牌获取属性测试
    - **Property 7: 卡牌获取数量递增**
    - 使用 fast-check 生成随机用户和随机卡牌
    - 验证：获得卡牌时 owned_count 恰好增加1，其他卡牌数量不变
    - **Validates: Requirements 7.3**

  - [x] 6.3 编写套装完成判定属性测试
    - **Property 8: 套装完成判定正确性**
    - 使用 fast-check 生成随机套装配置和随机拥有状态
    - 验证：套装完成当且仅当该套装中每张卡牌的 owned_count ≥ 1
    - **Validates: Requirements 8.2**

  - [x] 6.4 实现卡牌 Controller 和路由
    - 创建 `server/controllers/cardController.js`
    - 创建 `server/routes/card.js`
    - 实现 GET /api/cards 和 GET /api/cards/sets 接口
    - _Requirements: 8.1, 8.2, 10.3_

- [ ] 7. 实现每日结算系统
  - [x] 7.1 实现每日结算 Service
    - 创建 `server/services/settlementService.js`
    - 实现 `executeDailySettlement()` 方法：遍历所有用户执行结算
    - 实现 `settleUser(userId)` 方法：扣除健康值 → 判定是否扣除成长值 → 重新计算等级
    - 使用数据库事务保证原子性，单用户失败不影响其他用户
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 7.2 编写每日结算属性测试
    - **Property 6: 每日结算正确性**
    - 使用 fast-check 生成随机初始状态（健康值、成长值、等级）
    - 验证：新健康值 = max(h - daily_decline_health_score, 0)；低健康时成长值扣除正确；等级与新成长值一致
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

  - [x] 7.3 实现定时任务调度
    - 创建 `server/jobs/dailySettlement.js`
    - 使用 node-cron 配置每日凌晨执行结算任务
    - 在 `server/index.js` 中注册定时任务
    - _Requirements: 6.1_

- [ ] 8. 实现排行榜功能
  - [x] 8.1 实现排行榜 Model 和 Service
    - 创建 `server/models/rankingModel.js`，实现排名数据操作
    - 创建 `server/services/rankingService.js`
    - 实现 `getAllRanking()` 方法：返回所有 participate=true 的用户排名
    - 实现 `getFriendsRanking(userId)` 方法：返回好友排名
    - 实现 `toggleParticipation(userId, participate)` 方法：切换排名参与状态
    - _Requirements: 9.1, 9.2, 9.5_

  - [x] 8.2 编写排行榜可见性属性测试
    - **Property 9: 排行榜可见性一致性**
    - 使用 fast-check 生成随机用户集合和随机参与状态
    - 验证：排行榜恰好包含所有 participate=true 的用户，不包含 participate=false 的用户
    - **Validates: Requirements 9.1, 9.2, 9.5**

  - [x] 8.3 实现排行榜 Controller 和路由
    - 创建 `server/controllers/rankingController.js`
    - 创建 `server/routes/ranking.js`
    - 实现 GET /api/ranking/all、GET /api/ranking/friends、POST /api/ranking/toggle 接口
    - _Requirements: 9.1, 9.3, 9.5, 10.3_

- [ ] 9. 实现测试工具接口
  - [x] 9.1 实现测试工具 Controller 和路由
    - 创建 `server/controllers/testController.js`
    - 创建 `server/routes/test.js`
    - 实现 POST /api/test/fake-user 接口：支持设置树种、成长值、卡牌
    - 确保假人用户可出现在排行榜中
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [x] 10. Checkpoint - 确保后端所有功能正确
  - 确保所有测试通过，ask the user if questions arise.

- [ ] 11. 实现前端 API 请求封装
  - [x] 11.1 创建统一 API 请求模块
    - 创建 `services/api.js`，封装 wx.request
    - 实现请求拦截（自动附加 token）、响应拦截（统一错误处理）
    - 实现 Token 过期自动重新登录逻辑
    - _Requirements: 10.2, 10.3_

- [ ] 12. 实现前端选择树种页面
  - [x] 12.1 创建选择树种页面
    - 创建 `pages/select-tree/` 目录及 wxml、wxss、js、json 文件
    - 展示三种树种（苹果树、樱花树、橡树）供用户选择
    - 选择后调用 POST /api/tree/select 接口
    - 在 app.json 中注册页面路由
    - _Requirements: 2.1, 2.2, 2.3_

- [ ] 13. 实现前端主页面（树的展示、浇水、施肥）
  - [x] 13.1 改造 index 页面为游戏主页面
    - 修改 `pages/index/` 页面，展示用户的树（等级、成长值、健康值）
    - 实现浇水按钮和施肥按钮，调用对应后端接口
    - 浇水次数为 0 时禁用浇水按钮并显示恢复倒计时
    - 施肥次数为 0 时禁用施肥按钮
    - 未选择树种时跳转到选择树种页面
    - _Requirements: 2.3, 3.3, 3.4, 4.5, 5.3_

- [ ] 14. 实现前端卡牌收集页面
  - [x] 14.1 创建卡牌收集页面
    - 创建 `pages/cards/` 目录及 wxml、wxss、js、json 文件
    - 展示用户拥有的所有卡牌及数量
    - 展示套装完成状态和特殊效果
    - 调用 GET /api/cards 和 GET /api/cards/sets 接口
    - 在 app.json 中注册页面路由
    - _Requirements: 8.1, 8.2, 8.3_

- [ ] 15. 实现前端排行榜页面
  - [x] 15.1 创建排行榜页面
    - 创建 `pages/ranking/` 目录及 wxml、wxss、js、json 文件
    - 实现总榜和好友榜切换视图
    - 展示参与排名用户的成长值、等级和树种信息
    - 实现参与排名的勾选切换功能
    - 调用排行榜相关 API 接口
    - 在 app.json 中注册页面路由
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 16. 实现全局登录逻辑和页面路由
  - [x] 16.1 完善 app.js 全局登录逻辑
    - 在 app.js 中实现微信登录流程（wx.login → 调用后端登录接口 → 存储 token）
    - 根据用户是否已选择树种决定跳转到主页面或选择树种页面
    - 更新 app.json 配置所有页面路由和 tabBar 导航
    - _Requirements: 1.1, 1.2, 2.3, 10.2_

- [x] 17. Final checkpoint - 确保前后端联调完成
  - 确保所有测试通过，ask the user if questions arise.

## Notes

- 标记 `*` 的任务为可选任务，可跳过以加快 MVP 进度
- 每个任务引用了对应的需求编号以确保可追溯性
- Checkpoint 任务用于阶段性验证，确保增量开发的正确性
- 属性测试验证系统的通用正确性属性，单元测试验证具体示例和边界情况
- 后端优先实现，确保 API 可用后再开发前端页面
