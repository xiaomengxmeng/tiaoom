# CodeBuddy 项目规则 - Fish Oil Battle

## 项目概述
Fish Oil Battle 是 Tiaoom 游戏平台中的一个多人在线战斗游戏。

## 修改范围限制 ⚠️

### ✅ 允许修改的目录
所有 Fish Oil Battle 相关的开发工作**必须**限制在以下目录内：

**后端代码：**
- `game/backend/src/games/fish-oil-battle/`
  - `components/` - 游戏组件
  - `config/` - 游戏配置（如 WeaponRangeConfig.ts）
  - `core/` - 核心逻辑（IWeapon.ts, SkillScheduler.ts, WeaponRegistry.ts）
  - `physics/` - 物理系统
  - `shared/` - 前后端共享代码
  - `skills/weapons/` - 武器技能实现
  - `systems/` - 游戏系统
  - `test/` - 后端测试代码
  - `FishOilRoom.ts` - 房间逻辑

**前端代码：**
- `game/frontend/src/components/fish-oil-battle/`
  - `components/` - Vue 组件
  - `renderer/` - 渲染器（CyberFishRenderer.ts, PlayerRenderer.ts 等）
  - `test/` - 测试相关（TestModeConnector.ts, BattleTestPanel.vue 等）
  - `utils/` - 工具函数
  - `EffectTestPage.vue` - 特效测试页面
  - `FishOilBattleCanvas.vue` - 主画布组件
  - `FishOilBattleRoom.vue` - 房间页面
  - `useFishOilBattle.ts` - 组合式函数
  - `WeaponRangeConfig.ts` - 武器配置

### ❌ 禁止修改的目录
以下目录的代码**不应**被修改，除非有明确指示：

- `lib/` - Tiaoom 框架核心代码
- `game/backend/src/controller.ts` - 框架控制器
- `game/backend/src/socket.ts` - 框架套接字处理
- `game/frontend/src/core/` - 前端核心游戏引擎
- `game/frontend/src/stores/game.ts` - 全局状态管理（除非修复跨模块 bug）
- `game/frontend/src/hook/useRoom.ts` - 房间钩子（除非修复跨模块 bug）
- 其他游戏的目录（如 `fish-oil-battle-test/` 除外）

## 开发规范

### 新增武器技能
1. 在 `game/backend/src/games/fish-oil-battle/skills/weapons/` 创建新文件
2. 实现 `IWeapon` 接口
3. 在 `WeaponRegistry.ts` 中注册新武器
4. 在 `WeaponRangeConfig.ts` 中配置数值平衡
5. 前端在 `renderer/` 下实现对应的特效渲染器

### 配置修改
- 武器数值平衡：修改 `WeaponRangeConfig.ts`（前后端各一份）
- 游戏参数调整：修改 `config/` 目录下的配置文件

### 测试要求
- 后端单元测试：在 `test/` 目录或 `*.test.ts` 文件中编写
- 前端特效测试：使用 `EffectTestPage.vue` 和 `TestModeConnector.ts`
- 测试模式：通过 `BattleTestPanel.vue` 启动

### 代码风格
- TypeScript：使用严格的类型定义
- Vue 3：使用 Composition API 和 `<script setup>`
- 后端：遵循现有代码的模块结构
- 前端：渲染器使用 Canvas 2D API

## 特殊情况处理

### 需要修改框架代码时
如果遇到必须修改 `lib/`、`controller.ts`、`socket.ts` 等框架代码的情况：
1. 先尝试在游戏模块内找到替代方案
2. 如果必须修改，需要在 commit message 中明确说明原因
3. 修改后需要测试其他游戏是否受影响

### 需要修改全局状态时
如果遇到必须修改 `game.ts`、`useRoom.ts` 等全局状态的情况：
1. 评估是否可以通过局部状态替代
2. 如果必须修改，需要确保向后兼容
3. 修改后需要测试所有依赖该状态的功能

## 提交规范
- Commit message 应清晰说明修改内容和影响范围
- 如果是测试相关的临时修改，应在 commit message 中标注 `[WIP]` 或 `[TEST]`
- 重要的配置调整应在 commit message 中说明调整原因

## 紧急联系人
如遇规则不明确或特殊情况，请联系项目维护者确认。
