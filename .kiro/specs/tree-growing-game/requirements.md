# 需求文档

## 简介

本项目是一个微信小游戏——种树游戏。用户选择一种树进行培育，通过浇水增加成长值、施肥增加健康值，推动树苗逐级成长。游戏包含卡牌收集系统和排行榜功能。后端负责所有用户数据存储和业务逻辑，前端仅负责界面展示和请求发送。

## 术语表

- **System**：种树游戏系统，包含前端小程序和后端服务
- **User**：通过微信账号登录的游戏用户
- **Tree**：用户培育的树，具有树种、等级、成长值、健康值等属性
- **Tree_Species**：树的种类，包括苹果树、樱花树、橡树
- **Tree_Level**：树的等级，从0级（树苗）开始逐级成长
- **Grow_Score**：成长值，通过浇水累积，用于升级
- **Healthy_Score**：健康值，范围0-100的整数，通过施肥恢复
- **Watering**：浇水操作，消耗浇水次数，增加成长值
- **Fertilizing**：施肥操作，消耗施肥次数，恢复健康值
- **Card**：卡牌，浇水时有概率获得，具有品质和所属套装
- **Card_Set**：卡牌套装，集齐一套可解锁特殊效果
- **Daily_Settlement**：每日结算，扣除健康值并判定是否扣除成长值
- **Ranking**：排行榜，分为总榜和好友榜
- **Backend**：后端服务，本地部署，负责数据存储和逻辑处理
- **Frontend**：前端微信小程序，负责界面展示和请求发送

## 配置参数

| 参数名 | 默认值 | 说明 |
|--------|--------|------|
| daily_fertilize_resume_times | 1 | 每天登录恢复的施肥次数 |
| max_fertilize_count | 1 | 施肥次数最大积累上限 |
| user_fertilize_recover_effect | 25 | 每次施肥恢复的健康值 |
| daily_decline_health_score | 20 | 每日结算扣除的健康值 |
| low_health_score | 20 | 低健康值阈值，低于此值时扣除成长值 |
| watering_resume_interval | 1800秒（半小时） | 浇水次数恢复间隔 |
| max_watering_time | 50 | 0级树苗最大浇水积累次数 |
| gain_card_possibility | 0.1 | 每次浇水获得卡牌的概率 |
| upgrade_need_grow_score[i] | 按等级配置 | 每级升级所需的累计成长值 |

## 需求

### 需求 1：用户注册与登录

**用户故事：** 作为一个玩家，我希望通过微信账号登录游戏，以便拥有独立的游戏数据。

#### 验收标准

1. WHEN User 首次通过微信账号登录, THE Backend SHALL 创建新用户记录，初始化 Grow_Score 为 0、Healthy_Score 为 30、Tree_Level 为 0、浇水次数为 max_watering_time
2. WHEN User 通过微信账号登录, THE Backend SHALL 返回该 User 的完整游戏数据
3. THE Backend SHALL 为每个 User 维护独立的游戏数据

### 需求 2：选择树种

**用户故事：** 作为一个玩家，我希望选择一种树来培育，以便开始我的种树之旅。

#### 验收标准

1. WHEN User 首次登录, THE Frontend SHALL 展示三种 Tree_Species 供选择：苹果树、樱花树、橡树
2. WHEN User 选择一种 Tree_Species, THE Backend SHALL 记录该 User 的 Tree_Species 选择
3. WHILE User 未选择 Tree_Species, THE Frontend SHALL 阻止 User 进行浇水和施肥操作

### 需求 3：浇水机制

**用户故事：** 作为一个玩家，我希望通过浇水来增加树的成长值，以便推动树的升级。

#### 验收标准

1. THE Backend SHALL 每隔 watering_resume_interval 为 User 恢复 1 次浇水机会
2. WHILE User 的浇水次数达到 max_watering_time, THE Backend SHALL 停止为该 User 累积浇水次数
3. WHEN User 执行浇水操作, THE Backend SHALL 扣除 1 次浇水机会并增加 Grow_Score
4. IF User 的浇水次数为 0, THEN THE Frontend SHALL 禁用浇水按钮并显示下次恢复倒计时

### 需求 4：施肥机制

**用户故事：** 作为一个玩家，我希望通过施肥来维持树的健康值，以便避免成长值被扣除。

#### 验收标准

1. WHEN User 每天首次登录, THE Backend SHALL 为该 User 恢复 daily_fertilize_resume_times 次施肥机会
2. WHILE User 的施肥次数达到 max_fertilize_count, THE Backend SHALL 停止为该 User 累积施肥次数
3. WHEN User 执行施肥操作, THE Backend SHALL 扣除 1 次施肥机会并增加 Healthy_Score user_fertilize_recover_effect 点
4. WHILE Healthy_Score 达到 100, THE Backend SHALL 将 Healthy_Score 限制为 100
5. IF User 的施肥次数为 0, THEN THE Frontend SHALL 禁用施肥按钮

### 需求 5：树的升级机制

**用户故事：** 作为一个玩家，我希望树能随着成长值的积累自动升级，以便看到树的成长变化。

#### 验收标准

1. WHEN User 的 Grow_Score 达到 upgrade_need_grow_score[i] 对应的阈值, THE Backend SHALL 将 Tree_Level 提升至对应等级
2. WHEN 一次 Grow_Score 增加使其跨越多个升级阈值, THE Backend SHALL 连续提升 Tree_Level 至对应的最高等级
3. WHEN Tree_Level 发生变化, THE Frontend SHALL 更新树的显示外观

### 需求 6：每日结算机制

**用户故事：** 作为一个玩家，我希望游戏有每日结算机制，以便激励我每天登录维护树的健康。

#### 验收标准

1. WHEN 每日结算触发, THE Backend SHALL 先扣除 User 的 Healthy_Score daily_decline_health_score 点
2. WHILE Healthy_Score 低于 0, THE Backend SHALL 将 Healthy_Score 设置为 0
3. WHILE 结算后 User 的 Healthy_Score 低于 low_health_score, THE Backend SHALL 扣除该 User 的 Grow_Score，扣除量为 (upgrade_need_grow_score[当前等级+1] - upgrade_need_grow_score[当前等级]) * 10%
4. WHILE Grow_Score 低于 0, THE Backend SHALL 将 Grow_Score 设置为 0
5. WHEN Grow_Score 因扣除而低于当前等级所需的成长值, THE Backend SHALL 降低 Tree_Level 至对应等级

### 需求 7：卡牌获取机制

**用户故事：** 作为一个玩家，我希望浇水时有机会获得卡牌，以便增加游戏的趣味性。

#### 验收标准

1. WHEN User 执行浇水操作, THE Backend SHALL 以 gain_card_possibility 的概率判定是否获得卡牌
2. WHEN 判定获得卡牌, THE Backend SHALL 根据所有卡牌的 card_possibility 进行加权随机选择，确定获得的具体卡牌
3. WHEN User 获得卡牌, THE Backend SHALL 将该 User 对应卡牌的 card_owned_count 加 1
4. THE Backend SHALL 为每张卡牌存储 card_id、card_name、card_icon、card_quality、card_possibility、card_set 属性

### 需求 8：卡牌套装收集

**用户故事：** 作为一个玩家，我希望集齐一套卡牌后获得特殊效果，以便激励我持续收集卡牌。

#### 验收标准

1. THE Backend SHALL 支持多个 Card_Set，每张卡牌属于一个 Card_Set 或不属于任何套装（card_set = -1）
2. WHEN User 集齐某个 Card_Set 中的所有卡牌（每张至少拥有 1 张）, THE Backend SHALL 将 user_collect_card_set[i] 设置为 true
3. WHEN user_collect_card_set[i] 为 true, THE Backend SHALL 为该 User 激活对应的特殊效果

### 需求 9：排行榜功能

**用户故事：** 作为一个玩家，我希望查看排行榜与其他玩家比较，以便增加竞争乐趣。

#### 验收标准

1. WHEN User 勾选参与排名, THE Backend SHALL 将该 User 的 Grow_Score、Tree_Level、Tree_Species 展示在排行榜中
2. WHEN User 未勾选参与排名, THE Backend SHALL 确保该 User 的数据对其他 User 不可见
3. THE Frontend SHALL 提供总榜和好友榜两种排行榜视图
4. WHEN User 查看排行榜, THE Frontend SHALL 展示参与排名的 User 的成长值、等级和树种信息
5. WHEN User 切换排名参与状态, THE Backend SHALL 立即更新排行榜中该 User 的可见性

### 需求 10：前后端架构

**用户故事：** 作为一个开发者，我希望前后端职责清晰分离，以便系统易于维护和扩展。

#### 验收标准

1. THE Backend SHALL 本地部署，处理所有用户数据存储和业务逻辑
2. THE Frontend SHALL 仅负责界面展示和向 Backend 发送请求
3. THE Backend SHALL 提供 RESTful API 供 Frontend 调用
4. THE Backend SHALL 对所有请求进行用户身份验证

### 需求 11：测试工具

**用户故事：** 作为一个开发者，我希望有测试工具来模拟用户数据，以便方便地进行功能验证。

#### 验收标准

1. THE Backend SHALL 提供测试接口，支持添加假人用户
2. WHEN 添加假人用户, THE Backend SHALL 支持设置该假人的 Tree_Species、Grow_Score
3. WHEN 添加假人用户, THE Backend SHALL 支持设置该假人获取的卡牌种类和每种卡牌的数量
4. THE Backend SHALL 确保假人用户可出现在排行榜中
