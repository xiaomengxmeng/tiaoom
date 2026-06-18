---
name: fish-oil-battle-skill-dev
description: 辅助开发鱼油战斗（Fish Oil Battle）的新武器技能机制和特效。当需要创建新武器、实现 IWeapon 接口、设计前端特效渲染器、配置 WeaponRangeConfig 数值平衡、或设计 VisualEvent 前后端协议时使用此技能。
---

# 鱼油战斗 - 技能开发辅助

本技能提供鱼油战斗游戏的新武器/技能开发全流程指导，包括后端逻辑、前端特效、协议设计和数值配置。

## 使用流程

### 1. 创建新武器后端

1. 参考 `references/framework-api.md` 了解 IWeapon 接口和 IPhysicsQuery 接口
2. 使用 `assets/WeaponTemplate.ts` 作为模板创建新的武器类
3. 在 `GameEnums.ts` 中注册新的 WeaponId 和 WeaponName
4. 在 `WeaponRangeConfig.ts` 中配置武器数值（参考 `references/balance-guide.md`）
5. 在 `WeaponRegistry.ts` 中注册新武器

### 2. 创建新武器前端特效

1. 参考 `references/visual-event-protocol.md` 了解视觉事件协议
2. 使用 `assets/EffectRendererTemplate.ts` 作为模板创建新的特效渲染器
3. 在 `EffectRenderer.ts` 中集成新渲染器（添加子渲染器实例和公开 API）
4. 设计 VisualEvent 数据类型并在 `protocol.ts` 中更新
5. 在 `CyberFishRenderer.ts` 的 `triggerSkillEffect` 中处理新事件类型
6. 在 `useFishOilBattle.ts` 的 `onVisualEvent` 中路由新事件类型

### 3. 数值平衡

参考 `references/balance-guide.md` 进行数值设计和平衡调整。

## 关键文件位置

| 文件 | 路径 |
|------|------|
| IWeapon 接口 | `game/backend/src/games/fish-oil-battle/core/IWeapon.ts` |
| IBattleState 类型 | `game/backend/src/games/fish-oil-battle/core/types.ts` |
| WeaponRegistry | `game/backend/src/games/fish-oil-battle/core/WeaponRegistry.ts` |
| GameEnums | `game/backend/src/games/fish-oil-battle/config/GameEnums.ts` |
| WeaponRangeConfig | `game/backend/src/games/fish-oil-battle/config/WeaponRangeConfig.ts` |
| 协议定义 | `game/backend/src/games/fish-oil-battle/shared/protocol.ts` |
| 武器目录 | `game/backend/src/games/fish-oil-battle/skills/weapons/` |
| EffectRenderer（总协调器） | `game/frontend/src/components/fish-oil-battle/renderer/entities/EffectRenderer.ts` |
| ShockwaveEffectRenderer（示例） | `game/frontend/src/components/fish-oil-battle/renderer/entities/ShockwaveEffectRenderer.ts` |
| VisualEffectUtils（类型定义） | `game/frontend/src/components/fish-oil-battle/renderer/entities/VisualEffectUtils.ts` |
| CyberFishRenderer（集成） | `game/frontend/src/components/fish-oil-battle/renderer/CyberFishRenderer.ts` |
| useFishOilBattle（事件路由） | `game/frontend/src/components/fish-oil-battle/useFishOilBattle.ts` |

## 参考文档

- 框架 API 详解: 加载 `references/framework-api.md`
- 武器创建最佳实践: 加载 `references/weapon-creation-guide.md`
- 视觉事件协议: 加载 `references/visual-event-protocol.md`
- 数值平衡指南: 加载 `references/balance-guide.md`
