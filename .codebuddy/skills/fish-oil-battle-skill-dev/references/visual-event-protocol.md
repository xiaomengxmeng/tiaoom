# 视觉事件协议指南

## 协议架构

前后端通过 `VisualEventData` 进行视觉同步。后端武器通过 `WeaponEffect.metadata` 携带视觉事件数据，经网络层打包为 `VisualEventData` 发送给前端。

```
后端 IWeapon                    网络层                   前端渲染
┌──────────────┐           ┌──────────────┐        ┌──────────────────┐
│ WeaponEffect │           │ VisualEvent  │        │ onVisualEvent()  │
│ .metadata:   │──打包──▶  │ Data         │──解包─▶│ ↓                │
│  visualType  │           │ .type        │        │ triggerSkillEffect│
│  radius      │           │ .radius      │        │ ↓                │
│  isBurst     │           │ .isBurst     │        │ EffectRenderer   │
│  ...         │           │ ...          │        │ .triggerXxx()    │
└──────────────┘           └──────────────┘        └──────────────────┘
```

## VisualEventData 接口

```typescript
interface VisualEventData {
  type: VisualEventType;       // 事件类型
  playerId?: string;           // 触发玩家 ID
  weaponId?: WeaponId;         // 武器 ID
  x?: number; y?: number;      // 坐标（逻辑 px）
  isBurst?: boolean;           // 是否爆发
  tx?: number; ty?: number;    // 目标坐标
  radius?: number;             // 效果半径
  visualWidth?: number;        // 视觉宽度（防火墙）
  visualHeight?: number;       // 视觉高度（防火墙）
  durationSec?: number;        // 持续时间（秒）
  beeCount?: number;           // 蜂巢母体：当前蜂数
  waveId?: string;             // 波前：唯一 ID
  rayEndpoints?: Array<{ x: number; y: number; reflected: boolean; angle: number }>;
  waveAlpha?: number;          // 波前：透明度 0-1
  bounceX?: number;            // 冲击环碰墙涟漪 X
  bounceY?: number;            // 冲击环碰墙涟漪 Y
  effectConfig?: {
    primaryColor?: number;     // 主色
    glowColor?: number;        // 发光色
    expandDurationMs?: number; // 扩散持续时间
    bounceColor?: number;      // 反弹色
  };
}
```

## 添加新视觉事件完整流程

### 1. 定义事件类型

在 `GameEnums.ts` 的 `VisualEventType` 中添加：

```typescript
export enum VisualEventType {
  // ... 现有类型
  YOUR_EFFECT_TRIGGER = 'your_effect_trigger',
  YOUR_EFFECT_UPDATE = 'your_effect_update',
  YOUR_EFFECT_REMOVE = 'your_effect_remove',
}
```

命名规范：`SNAKE_CASE`，动词/名词组合，描述视觉动作。

### 2. 后端发送事件（武器类中）

```typescript
// 简单事件（一次性触发）
onHitTarget(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
  const self = state.getPlayer(this.playerId);
  if (!self) return [];

  const effects: WeaponEffect[] = [];

  // 发送视觉事件
  effects.push({
    type: WeaponEffectType.VISUAL_ONLY,
    sourceId: this.playerId,
    value: 0,
    metadata: {
      visualType: VisualEventType.YOUR_EFFECT_TRIGGER,
      radius: CFG.visualRadius,
      isBurst: this.burstNextHit,
      desc: '你的特效描述',
    },
  });

  return effects;
}
```

### 3. 扩展协议数据（如需要新字段）

在 `shared/protocol.ts` 的 `VisualEventData` 中添加新字段：

```typescript
export interface VisualEventData {
  // ... 现有字段
  /** 你的特效：自定义数据 */
  yourCustomField?: number;
}
```

### 4. 前端事件路由

在 `useFishOilBattle.ts` 的 `onVisualEvent` 方法中添加：

```typescript
case VisualEventType.YOUR_EFFECT_TRIGGER: {
  const { x, y, playerId, radius, isBurst, effectConfig, yourCustomField } = data;
  renderer?.triggerSkillEffect?.('your_effect_trigger', {
    x, y, playerId, radius, isBurst, yourCustomField,
    ...effectConfig,
  });
  break;
}
```

### 5. 前端渲染处理

在 `CyberFishRenderer.ts` 的 `triggerSkillEffect` 方法中添加：

```typescript
case 'your_effect_trigger': {
  const { x, y, playerId, radius, isBurst, yourCustomField } = data;
  if (x === undefined || y === undefined) break;
  const { cx, cy } = this.toCanvas(x, y);
  const color = this.getPlayerThemeColor(playerId);
  this.effectRenderer.triggerYourEffect(cx, cy, {
    primaryColor: color,
    radius,
    isBurst,
    customField: yourCustomField,
  });
  break;
}
```

## 多事件协同模式（参考冲击波波前）

复杂持续效果使用 TRIGGER → UPDATE → REMOVE 三阶段模式：

```
onHitTarget:  发送 TRIGGER（创建前端效果）
onTick:       每 3 tick 发送 UPDATE（更新前端数据）
波结束:        发送 REMOVE（清理前端效果）
```

示例：

```typescript
// TRIGGER：创建效果
effects.push({
  type: WeaponEffectType.VISUAL_ONLY,
  sourceId: this.playerId,
  value: 0,
  metadata: {
    visualType: VisualEventType.YOUR_EFFECT_TRIGGER,
    waveId: waveId,         // 唯一 ID
    radius: currentRadius,
    isBurst: this.burstNextHit,
  },
});

// UPDATE：定期更新（onTick 中）
effects.push({
  type: WeaponEffectType.VISUAL_ONLY,
  sourceId: this.playerId,
  value: 0,
  metadata: {
    visualType: VisualEventType.YOUR_EFFECT_UPDATE,
    waveId: waveId,
    radius: currentRadius,
    waveAlpha: currentAlpha,
    rayEndpoints: currentEndpoints,
  },
});

// REMOVE：波结束
effects.push({
  type: WeaponEffectType.VISUAL_ONLY,
  sourceId: this.playerId,
  value: 0,
  metadata: {
    visualType: VisualEventType.YOUR_EFFECT_REMOVE,
    waveId: waveId,
  },
});
```

## 前端渲染分层

| 分层容器 | 用途 | 示例 |
|----------|------|------|
| `l2Entity` | 实体投射物、飞行特效 | 蜂刺飞线 |
| `l3Field` | 场地印记、范围效果 | 冲击波环、防火墙 |
| `l5Hologram` | 全屏特效 | 爆发闪光 |

## ActiveEffect 生命周期

```typescript
interface ActiveEffect {
  type: string;              // 效果类型标识
  container: PIXI.Container; // 绑定的 PIXI 容器
  life: number;              // 已存活时间（ms）
  maxLife: number;           // 最大存活时间（ms）
  onUpdate: (ef: ActiveEffect, dt: number) => void;  // 每帧调用
  onDecay: (ef: ActiveEffect) => void;               // 生命周期结束
}
```

- `life >= maxLife` 时自动调用 `onDecay` 并从活跃列表移除
- `onUpdate` 每帧调用，用于绘制帧动画
- `onDecay` 负责将 Graphics 归还对象池
