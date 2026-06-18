# 武器创建指南

## 完整创建流程（6 步）

### 步骤 1：定义枚举

在 `config/GameEnums.ts` 中添加：

```typescript
// WeaponId 枚举
export enum WeaponId {
  // ... 现有武器
  // 按流派分组添加：
  // 侵略者 Aggressor
  YOUR_WEAPON_ID = 'your_weapon_id',
}

// WeaponName 枚举
export enum WeaponName {
  // ... 现有武器
  YOUR_WEAPON_ID = '你的武器名称',
}

// 如需新视觉事件类型：
export enum VisualEventType {
  // ... 现有类型
  YOUR_EFFECT_TRIGGER = 'your_effect_trigger',
  YOUR_EFFECT_UPDATE = 'your_effect_update',
  YOUR_EFFECT_REMOVE = 'your_effect_remove',
}
```

### 步骤 2：配置数值

在 `config/WeaponRangeConfig.ts` 的 `WEAPON_RANGE_CONFIG` 中添加：

```typescript
[WeaponId.YOUR_WEAPON_ID]: {
  // 核心参数
  damageRadius: 200,        // 伤害作用半径
  damage: 5,                // 普通伤害
  burstDamage: 10,          // 爆发伤害
  maxEnergy: 4,             // 最大能量

  // 视觉参数
  visualRadius: 200,        // 特效半径
  visualSpeed: 300,         // 扩散速度 px/s
  visualDurationMs: 1500,   // 持续时间 ms

  // 可选：投射物
  projectile: {
    speed: 300,
    maxBounces: 1,
    maxLifetimeSec: 4,
    hitRadius: 30,
  },

  // 可选：场地装置
  field: {
    maxCount: 3,
    durationSec: 18,
    radius: 80,
    contactDamage: 3,
    slowPercent: 40,
  },
},
```

### 步骤 3：实现武器类

使用 `assets/WeaponTemplate.ts` 模板在 `skills/weapons/` 下创建新文件。

**关键实现要点：**

1. **onTick**：处理持续效果、自动触发检测、状态更新
2. **onHitTarget**：处理命中逻辑，返回 WeaponEffect[]
   - 从 `WEAPON_RANGE_CONFIG` 获取伤害值
   - 通过 `metadata.visualType` 发送视觉事件
3. **onHitByAttacker**：被命中时的反应（如能量积攒）
4. **burst**：实现爆发效果，设置标志位供 onHitTarget 检测
5. **getRuntimeState**：返回 `custom` 字段供前端渲染使用

**能量管理最佳实践：**
- 通过命中/反射等方式积攒能量
- 满能量后可爆发
- burst() 中 `this.energy = 0` 重置能量

**网络同步最佳实践：**
- 使用 `VISUAL_ONLY` 类型的 WeaponEffect 发送纯视觉事件
- 复杂效果（如 ShockwaveGenerator 的波前）使用多事件协同（TRIGGER → UPDATE → REMOVE）
- 持续效果定期发送 UPDATE 事件保持前后端同步

### 步骤 4：注册武器

在 `core/WeaponRegistry.ts` 的 `REGISTRY` 中添加：

```typescript
[WeaponId.YOUR_WEAPON_ID]: {
  id: WeaponId.YOUR_WEAPON_ID,
  name: WeaponName.YOUR_WEAPON_ID,
  school: School.AGGRESSOR,  // 根据实际流派选择
  difficulty: 2,              // 1-3
  iconId: 'game-icons:your-icon',  // 从 game-icons.net 选择
  factory: () => new YourWeapon(),
},
```

### 步骤 5：创建前端渲染器

使用 `assets/EffectRendererTemplate.ts` 模板在 `renderer/entities/` 下创建新渲染器。

**渲染器基本结构：**
- 构造函数接收 `container: PIXI.Container`（分层容器）
- 实现对象池管理 `PIXI.Graphics`
- `trigger()` 方法返回 `ActiveEffect[]` 用于生命周期管理
- `setScale()` 方法处理缩放
- `update()` 方法处理每帧更新（可选，通常由 ActiveEffect.onUpdate 驱动）
- `clear()` / `destroy()` 方法清理资源

### 步骤 6：集成渲染器

**6a. 在 EffectRenderer.ts 中集成：**

```typescript
// 1. 导入新渲染器
import { YourEffectRenderer } from './YourEffectRenderer';

// 2. 添加私有成员
private yourRenderer: YourEffectRenderer;

// 3. 在构造函数中初始化
this.yourRenderer = new YourEffectRenderer(fieldContainer, this.canvasW, this.canvasH);

// 4. 在 setScale 中传递缩放
this.yourRenderer.setScale(s, w, h);

// 5. 添加公开 API
triggerYourEffect(x: number, y: number, config?: YourVisualConfig): void {
  const effects = this.yourRenderer.trigger(x, y, config);
  for (const ef of effects) {
    this.activeEffects.push(ef);
  }
}

// 6. 在 clear/destroy 中清理
this.yourRenderer.clear();
this.yourRenderer.destroy();
```

**6b. 在 CyberFishRenderer.ts 中处理事件：**

在 `triggerSkillEffect` 方法的 switch 中添加新 case：

```typescript
case 'your_effect_trigger': {
  const { x, y, playerId } = data;
  if (x === undefined || y === undefined) break;
  const { cx, cy } = this.toCanvas(x, y);
  const color = this.getPlayerThemeColor(playerId);
  this.effectRenderer.triggerYourEffect(cx, cy, { primaryColor: color });
  break;
}
```

**6c. 在 useFishOilBattle.ts 中路由事件：**

在 `onVisualEvent` 方法中添加新 case：

```typescript
case VisualEventType.YOUR_EFFECT_TRIGGER: {
  const { x, y, playerId, radius, effectConfig } = data;
  renderer?.triggerSkillEffect?.('your_effect_trigger', {
    x, y, playerId, radius, ...effectConfig,
  });
  break;
}
```

## 最佳实践

1. **配置驱动**：所有数值从 `WEAPON_RANGE_CONFIG` 读取，不要硬编码
2. **类型安全**：使用 `GameEnums` 中定义的枚举，不要使用字符串字面量
3. **网络效率**：视觉事件每 3-5 tick（150-250ms）同步一次即可，不要每 tick 都发
4. **对象池**：前端渲染器使用对象池避免 GC 抖动
5. **分层渲染**：根据特效性质选择正确的分层容器（entity/field/hologram）
6. **能量管理**：通过 onHitTarget/onHitByAttacker 等钩子自然积攒能量
7. **参考现有武器**：ShockwaveGenerator（复杂）、FirewallProtocol（场地）、HiveMother（投射物+蜂群）
