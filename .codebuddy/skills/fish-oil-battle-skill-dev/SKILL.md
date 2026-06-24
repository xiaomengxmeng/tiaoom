---
name: fish-oil-battle-skill-dev
description: 辅助开发鱼油战斗（Fish Oil Battle）的新武器技能机制和特效。当需要创建新武器、实现 IWeapon 接口、设计前端特效渲染器、配置 WeaponRangeConfig 数值平衡、或设计 VisualEvent 前后端协议时使用此技能。
---

# 鱼油战斗 - 技能开发辅助

本技能提供鱼油战斗游戏的新武器/技能开发全流程指导，包括后端逻辑、前端特效、协议设计和数值配置。

## 一、数据驱动架构全景

所有视觉参数从 `WeaponRangeConfig` 出发，经过 7 步到达前端渲染。**每一步都是强制检查点**，漏掉任何一步都会导致特效静默丢弃。

```
WeaponRangeConfig                          EffectRenderer
(数值 + 视觉参数)                          (buildXxxVisualCfg)
      │                                          ▲
      │ 后端读取                                 │ 前端读取
      ▼                                          │
IWeapon (onTick/onHitTarget/burst)               │
→ WeaponEffect[] { metadata: {                   │
    visualType, x, y, angle, ... } }            │
      │                                          │
      │ WeaponScheduler 收集                     │
      ▼                                          │
PendingVisualEvent[]                             │
{ playerId, weaponId, visualType,               │
  x, y, metadata }                              │
      │                                          │
      │ ⚠️ 检查点1: FishOilRoom.VISUAL_TYPE_MAP │
      │ ⚠️ 检查点2: extractVisualEvents 字段提取 │
      ▼                                          │
VisualEventData (协议)                           │
{ type, playerId, x, y, angle,                  │
  length, beeCount, ... }                       │
      │                                          │
      │ WebSocket → 前端                         │
      ▼                                          │
⚠️ 检查点3: useFishOilBattle.onVisualEvent()     │
  switch(data.type) → Case 路由                  │
      │                                          │
      ▼                                          │
⚠️ 检查点4: CyberFishRenderer.triggerSkillEffect()│
  switch(config.type) → EffectRenderer API       │
      │                                          │
      ▼                                          │
⚠️ 检查点5: EffectRenderer.buildXxxVisualCfg()   │
  从 WEAPON_RANGE_CONFIG 构建配置 ───────────────┘
      │
      ▼
⚠️ 检查点6: 子渲染器接收 config 参数
  禁止文件顶部 const 硬编码
```

## 二、创建新武器的完整流程

### 2.1 后端步骤

#### Step 1: 注册枚举 (`GameEnums.ts`)

在 `WeaponId`、`WeaponName` 枚举中添加条目。
如有新视觉效果类型，在 `VisualEventType` 中添加。

#### Step 2: 配置数值 (`WeaponRangeConfig.ts`)

参考 `references/balance-guide.md`，添加武器的 `WeaponRangeConfig` 配置。
**必须同时配置视觉参数**（见下方数据驱动检查清单第 3 项）。

#### Step 3: 创建武器类 (`skills/weapons/`)

使用 `assets/WeaponTemplate.ts` 作为模板，实现 `IWeapon` 接口。
在 `onHitTarget`/`burst` 中发送 `VISUAL_ONLY` 事件时，metadata 必须携带：
- `visualType`: VisualEventType 枚举值
- 特效所需的特有字段（angle、length 等）

#### Step 4: 注册武器 (`WeaponRegistry.ts`)

在 `IMPLEMENTED_WEAPONS` 数组中添加武器元信息。

#### ⚠️ Step 5: VISUAL_TYPE_MAP 注册 (`FishOilRoom.ts`)

**每个新的 VisualEventType 都必须在 `VISUAL_TYPE_MAP` 中注册**，否则事件会被静默丢弃。
1:1 透传的事件直接列出；合并映射的显式标注。

```typescript
// FishOilRoom.ts 约 L648
private static readonly VISUAL_TYPE_MAP: Partial<Record<VisualEventType, VisualEventType>> = {
  [VisualEventType.YOUR_EVENT]: VisualEventType.YOUR_EVENT,
  // ...
};
```

#### ⚠️ Step 6: extractVisualEvents 字段提取 (`FishOilRoom.ts`)

**武器特有字段必须从 metadata 提取到 VisualEventData**。若遗漏，前端收不到这些字段。

```typescript
// FishOilRoom.ts extractVisualEvents() 约 L659
result.push({
  // ... 通用字段
  yourField: evt.metadata?.yourField,  // ← 新增特有字段
});
```

### 2.2 前端步骤

#### Step 1: 更新协议类型 (`protocol.ts`)

在 `VisualEventData` 接口中添加新字段声明。

#### Step 2: 创建特效渲染器 (`renderer/entities/`)

使用 `assets/EffectRendererTemplate.ts` 作为模板。
**所有视觉参数必须通过 constructor 或 trigger 方法传入，禁止在文件顶部用 const 硬编码。**

#### Step 3: 集成到 EffectRenderer (`EffectRenderer.ts`)

添加：
1. 子渲染器成员变量
2. constructor 中初始化
3. setScale 中传递 scale
4. clear/destroy 中调用对应方法
5. `buildXxxVisualCfg()` 私有方法（从 WEAPON_RANGE_CONFIG 构建配置）
6. 公开 trigger API

#### ⚠️ Step 4: useFishOilBattle 事件路由 (`useFishOilBattle.ts`)

在 `onVisualEvent` 的 switch 中添加新的 `VisualEventType` case。

#### ⚠️ Step 5: CyberFishRenderer 事件路由 (`CyberFishRenderer.ts`)

在 `triggerSkillEffect` 的 switch 中添加新的 type case。
**重要**：始终传递 `themeColor ?? config.factionColor` 给特效渲染器。

---

## 三、数据驱动强制检查清单

新建武器后，逐项核查以下 7 个检查点：

| # | 检查位置 | 检查内容 | 遗漏后果 |
|:---:|:---|:---|:---|
| ☐1 | `FishOilRoom.VISUAL_TYPE_MAP` | 每个新 VisualEventType 是否已注册 | 事件静默丢弃 |
| ☐2 | `FishOilRoom.extractVisualEvents()` | 特有字段(angle/length/beeCount等)是否从 metadata 提取 | 前端收不到 |
| ☐3 | `WeaponRangeConfig.ts` | 视觉参数是否有配置项(不依赖前端硬编码) | 数值不一致 |
| ☐4 | `EffectRenderer.buildXxxVisualCfg()` | 是否从 WEAPON_RANGE_CONFIG 构建配置 | 前端数值与后端脱节 |
| ☐5 | `useFishOilBattle.onVisualEvent()` | switch 是否匹配所有新 VisualEventType | 收到事件不处理 |
| ☐6 | `CyberFishRenderer.triggerSkillEffect()` | switch 是否匹配所有新 type | 不触发渲染 |
| ☐7 | 子渲染器参数来源 | 参数默认值是否来自 buildXxxVisualCfg 返回的配置 | 参数魔法数散布 |

---

## 四、WeaponRangeConfig 视觉参数标准化模板

每种特效模式都有对应的 VisualConfig 接口，定义在 `WeaponRangeConfig` 中：

| 特效模式 | 配置接口 / 字段 | 示例武器 | 关键字段 |
|:---|:---|:---|:---|
| 扩散圆环 | `ShockwaveVisualParams` (已存在) | 冲击波 | `strokeWidth` |
| 场地持续 | `field.visualWidth`, `field.visualHeight`, `field.hexRadius` | 防火墙 | 宽度/高度/六边形半径 |
| 追踪投射物 | `HiveMotherConfig.orbitRadius`, `.ballRadius` | 蜂巢母体 | 轨道半径/判定球半径 |
| **飞行弹道** | **`projectile.visualFlightSpeed`, `projectile.visualArcBow`, `projectile.visualBladeHalfWidth`** | **光学斩击** | **飞行速度/弧月弓弯/刀光半宽** |

### 新增 WeaponProjectileConfig 视觉字段示例

```typescript
// WeaponRangeConfig.ts - WeaponProjectileConfig 接口扩展
export interface WeaponProjectileConfig {
  // ... 现有字段
  /** 视觉飞行速度（px/s），前端渲染用 */    visualFlightSpeed?: number;
  /** 弧月弓弯距离（逻辑 px） */             visualArcBow?: number;
  /** 刀光/投射物视觉半宽（逻辑 px） */      visualBladeHalfWidth?: number;
  /** 尾部残影长度（逻辑 px） */             visualTrailLength?: number;
}
```

### 对应 EffectRenderer.buildXxxVisualCfg() 模板

```typescript
// EffectRenderer.ts - 飞行弹道武器专用
private buildOpticalSlashVisualCfg(): OpticalSlashVisualConfig {
  const rc = WEAPON_RANGE_CONFIG[WeaponId.OPTICAL_SLASH];
  const p = rc?.projectile;
  return {
    flightSpeed: p?.visualFlightSpeed ?? 300,
    arcBow: p?.visualArcBow ?? 35,
    bladeHalfWidth: p?.visualBladeHalfWidth ?? 14,
    expandDurationMs: rc?.visualDurationMs ?? 800,
    maxRadius: rc?.visualRadius ?? 150,
  };
}
```

---

## 五、特效设计模式

常见的前端特效模式：

| 模式 | 说明 | 参数来源 | 示例 |
|:---|:---|:---|:---|
| **飞行弹道** | 特效从起点沿方向飞行，到达终点后渐隐 | `projectile.visualFlightSpeed` + 方向角 + 距离 | 光学斩击、能量弹 |
| **扩散圆环** | 从触发点向外扩散的圆环，渐入渐出 | `shockwaveVisual.strokeWidth` + 最大半径 | 冲击波 |
| **场地持续** | 固定位置的持续特效，带持续绘制更新 | `field.visualWidth/visualHeight` + 持续时间 | 防火墙、引力场 |
| **追踪实体** | 跟随玩家/投射物移动的特效 | `hiveMother.orbitRadius/ballRadius` | 蜂群绕球、护盾 |

---

## 六、关键文件速查表

| 文件 | 路径 |
|:---|:---|
| IWeapon 接口 | `game/backend/src/games/fish-oil-battle/core/IWeapon.ts` |
| IBattleState 类型 | `game/backend/src/games/fish-oil-battle/core/types.ts` |
| WeaponRegistry | `game/backend/src/games/fish-oil-battle/core/WeaponRegistry.ts` |
| WeaponScheduler (PendingVisualEvent) | `game/backend/src/games/fish-oil-battle/core/WeaponScheduler.ts` |
| FishOilRoom (VISUAL_TYPE_MAP) | `game/backend/src/games/fish-oil-battle/FishOilRoom.ts` |
| GameEnums | `game/backend/src/games/fish-oil-battle/config/GameEnums.ts` |
| WeaponRangeConfig | `game/backend/src/games/fish-oil-battle/config/WeaponRangeConfig.ts` |
| 协议定义 | `game/backend/src/games/fish-oil-battle/shared/protocol.ts` |
| 武器目录 | `game/backend/src/games/fish-oil-battle/skills/weapons/` |
| EffectRenderer（总协调器） | `game/frontend/src/components/fish-oil-battle/renderer/entities/EffectRenderer.ts` |
| VisualEffectUtils（类型定义） | `game/frontend/src/components/fish-oil-battle/renderer/entities/VisualEffectUtils.ts` |
| CyberFishRenderer（集成） | `game/frontend/src/components/fish-oil-battle/renderer/CyberFishRenderer.ts` |
| useFishOilBattle（事件路由） | `game/frontend/src/components/fish-oil-battle/useFishOilBattle.ts` |

---

## 七、参考文档

- 框架 API 详解: 加载 `references/framework-api.md`
- 视觉事件协议: 加载 `references/visual-event-protocol.md`
- 数值平衡指南: 加载 `references/balance-guide.md`
