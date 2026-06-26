---
name: fish-oil-battle-skill-dev
description: 辅助开发鱼油战斗（Fish Oil Battle）的新武器技能机制和特效。当需要创建新武器、实现 IWeapon 接口、设计前端特效渲染器、配置 WeaponRangeConfig 数值平衡、或设计 VisualEvent 前后端协议时使用此技能。
---

# 鱼油战斗 - 技能开发辅助

本技能提供鱼油战斗游戏的新武器/技能开发全流程指导，包括后端逻辑、前端特效、协议设计和数值配置。

## 一、数据驱动架构全景

所有视觉参数从 `WeaponRangeConfig` 出发，经过 6 步到达前端渲染。**每一步都是强制检查点**，漏掉任何一步都会导致特效静默丢弃。

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
      │ ⚠️ 检查点1: extractVisualEvents 字段提取 │
      │  所有事件直接透传，无需白名单过滤           │
      ▼                                          │
VisualEventData (协议)                           │
{ type, playerId, x, y, angle,                  │
  length, beeCount, ... }                       │
      │                                          │
      │ WebSocket → 前端                         │
      ▼                                          │
⚠️ 检查点2: protocol.ts VisualEventData          │
  协议类型定义是否包含新字段                       │
      │                                          │
      ▼                                          │
⚠️ 检查点3: useFishOilBattle.onVisualEvent()     │
  switch(data.type) → Case 路由                  │
      │                                          │
      ▼                                          │
⚠️ 检查点4: CyberFishRenderer.triggerSkillEffect()│
  参数类型定义 + switch(config.type) → EffectRenderer API
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

#### ⚠️ Step 5: extractVisualEvents 字段提取 (`FishOilRoom.ts`)

**所有视觉事件直接透传**，不再有白名单过滤。只需确保武器特有字段从 metadata 提取到 VisualEventData。

```typescript
// FishOilRoom.ts extractVisualEvents() 
result.push({
  // ... 通用字段 (type, playerId, weaponId, x, y, radius, isBurst, tx, ty)
  angle: evt.metadata?.angle,
  length: evt.metadata?.length,
  // 各武器特有字段 ↓
  anchorId: evt.metadata?.anchorId,           // 空气斥力场
  frostbiteTargetId: evt.metadata?.targetId,  // 熵寂之触
  frostbiteStacks: evt.metadata?.stacks,      // 熵寂之触冻伤层数
  yourField: evt.metadata?.yourField,         // ← 新增特有字段
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

#### ⚠️ Step 5: CyberFishRenderer 类型定义 + 事件路由 (`CyberFishRenderer.ts`)

**类型定义更新**（必须首先完成）：
1. 在 `triggerSkillEffect` 方法的参数类型定义中添加新技能所需的属性
2. 例如：目标ID (`targetId`)、层数 (`frostbiteStacks`)、锚点ID (`anchorId`) 等
3. 确保类型定义与 `VisualEventData` 接口保持一致

**事件路由**（类型定义完成后）：
1. 在 `triggerSkillEffect` 的 switch 中添加新的 type case
2. **重要**：始终传递 `themeColor ?? config.factionColor` 给特效渲染器
3. 确保从 `config` 参数中正确读取所有新增的属性

---

## 三、数据驱动强制检查清单

新建武器后，逐项核查以下检查点：

| # | 检查位置 | 检查内容 | 遗漏后果 |
|:---:|:---|:---|:---|
| ☐1 | `FishOilRoom.extractVisualEvents()` | 特有字段(angle/length/anchorId/targetId/stacks等)是否从 metadata 提取 | 前端收不到 |
| ☐2 | `WeaponRangeConfig.ts` | 视觉参数是否有配置项(不依赖前端硬编码) | 数值不一致 |
| ☐3 | `protocol.ts` VisualEventData | 协议类型定义是否包含新字段 | TypeScript 类型错误 |
| ☐4 | `useFishOilBattle.onVisualEvent()` | switch 是否匹配所有新 VisualEventType | 收到事件不处理 |
| ☐5 | `CyberFishRenderer.triggerSkillEffect()` 参数类型 | 是否为新技能添加了所需属性（targetId/frostbiteStacks 等） | TypeScript 类型错误 |
| ☐6 | `CyberFishRenderer.triggerSkillEffect()` switch | switch 是否匹配所有新 type | 不触发渲染 |
| ☐7 | `EffectRenderer.buildXxxVisualCfg()` | 是否从 WEAPON_RANGE_CONFIG 构建配置 | 前端数值与后端脱节 |
| ☐8 | 子渲染器参数来源 | 参数默认值是否来自 buildXxxVisualCfg 返回的配置 | 参数魔法数散布 |
| ☐9 | **子渲染器坐标变换** | **x/y 不乘 this.scale，尺寸(radius/length)乘 this.scale** | **特效位置偏移** |

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

## 五、PIXI.js API 使用规范

### 5.1 常见类型错误及正确用法

| API | 错误用法 | 正确用法 | 说明 |
|:---|:---|:---|:---|
| `PIXI.Text` 样式 | `{ alpha: 0.7 }` | `label.alpha = 0.7` | `alpha` 不是 `TextStyle` 的属性，应在 `Text` 对象上设置 |
| `PIXI.Text` 创建 | `new PIXI.Text(text, style)` | `new PIXI.Text(text, style as Partial<TextStyle>)` | 新版本 PIXI.js 中构造函数已弃用，建议使用 `PIXI.Text` 类 |
| 对象属性访问 | `player.x` / `player.y` | `player.position.x` / `player.position.y` | 玩家坐标嵌套在 `position` 对象中 |
| 玩家存活判断 | `player.isAlive` | `player.hp > 0` | `PlayerState` 没有 `isAlive` 属性 |

### 5.2 正确代码示例

```typescript
// ✅ 正确：创建文本并设置透明度
const label = new PIXI.Text('16℃', {
  fontFamily: 'monospace',
  fontSize: 10,
  fill: color,
});
label.anchor.set(0.5);
label.position.set(x, y);
label.alpha = 0.7;  // ← alpha 在对象上设置，不在样式中

// ✅ 正确：访问玩家坐标
const dx = opp.position.x - self.position.x;
const dy = opp.position.y - self.position.y;

// ✅ 正确：判断玩家是否存活
if (opp && opp.hp > 0) {
  // 玩家存活
}
```

---

## 六、坐标变换管道与前端渲染器防错指南 ⭐

### 6.1 坐标变换管道

前端接收到的坐标是**后端逻辑坐标**（1280×720 虚拟画布），`CyberFishRenderer.mapX/mapY` 负责将逻辑坐标映射为**画布像素坐标**。所有子渲染器收到的 `x, y` 参数已经是画布像素坐标。

```
后端逻辑坐标 (1280×720) 
    → CyberFishRenderer.mapX/mapY (uniformScale + offsetX)
    → 画布像素坐标
    → 子渲染器 trigger*(x, y, ...) 
    → x, y 直接作为容器位置 / 绘制坐标使用
```

### 6.2 坐标缩放核心规则 🔥

**这是最容易踩的坑，必须牢记：**

| 值的类型 | 处理方式 | 说明 |
|:---|:---|:---|
| **位置坐标** (x, y, fromX, fromY, toX, toY) | **不乘** `this.scale` | 已由 mapX/mapY 映射为画布像素 |
| **尺寸值** (radius, length, width, height, strokeWidth) | **必须乘** `this.scale` | 从逻辑 px 转为画布像素 |
| **速度值** (flightSpeed 等) | **必须乘** `this.scale` | 从逻辑 px/s 转为画布像素/s |

### ❌ 禁止模式 vs ✅ 正确模式

```typescript
// ❌ 禁止：对位置坐标乘 scale（双重缩放，特效偏移）
triggerEffect(x: number, y: number, radius: number): void {
  const s = this.scale;
  container.position.set(x * s, y * s);  // ❌ 位置偏移！
  g.circle(x * s, y * s, radius * s);     // ❌ 位置偏移！
}

// ✅ 正确：位置直接用，只对尺寸乘 scale
triggerEffect(x: number, y: number, radius: number): void {
  const s = this.scale;
  container.position.set(x, y);           // ✅ 位置已是像素坐标
  g.circle(0, 0, radius * s);             // ✅ 用相对(0,0)，尺寸缩放
}
```

### 6.3 容器定位规范（防 resize 漂移）

**关键原则：容器 `position.set(x, y)` + 子 Graphics 以 `(0, 0)` 为中心绘制**

这样当 `setScale` 在 resize 时调用 `hexGraphics.scale.set(scale)`，Graphics 从本地原点 `(0,0)` 缩放不会导致位置漂移。

```typescript
// ✅ 正确：容器定位 + 子图形以 (0,0) 为中心
triggerAura(playerId: string, x: number, y: number, radius: number): void {
  const s = this.scale;
  const container = new PIXI.Container();
  container.position.set(x, y);           // 容器定位
  const g = new PIXI.Graphics();
  g.circle(0, 0, radius * s);            // (0,0) 相对绘制
  container.addChild(g);
  this.fieldContainer.addChild(container);
}

// setScale 中安全缩放：
setScale(scale: number): void {
  this.scale = scale;
  this.activeAuras.forEach(aura => {
    if (aura.graphics.destroyed) return;  // ⚠️ 必须检查 destroyed
    aura.graphics.scale.set(scale);       // 从 (0,0) 缩放，位置不变
  });
}
```

### 6.4 硬编码像素常量

任何直接写入的数值（如 `-20`）都要考虑是否需要缩放：

```typescript
// ❌ 硬编码常量不缩放 — 窗口缩放时比例失调
this.showLabel(pid, x, y - (radius * s) - 20);

// ✅ 常量也乘 scale
this.showLabel(pid, x, y - (radius * s) - 20 * s);
```

### 6.5 已知曾出错的渲染器

| 渲染器 | 问题 | 修复方式 |
|:---|:---|:---|
| EntropicTouchRenderer | `x * s`, `y * s` 双重缩放 + `setScale` 漂移 + 常量未缩放 + 缺 destroyed 检查 | 容器定位 + (0,0) 绘制 |
| OpticalSlashEffectRenderer | `x * s + offsetX` 双重缩放 + 手动 offsetX/Y 计算 | 移除 offset 计算，x/y 直接使用 |

---

## 七、类型命名规范

### 6.1 核心原则

**必须使用完整的 `VisualEventType` 枚举值，避免使用简写或缩写。**

| ✅ 正确 | ❌ 错误 | 说明 |
|:---|:---|:---|
| `'air_repulsion_anchor'` | `'air_anchor'` | 使用完整的枚举值 |
| `'entropic_touch_aura'` | `'entropic_aura'` | 使用完整的枚举值 |
| `'burst_trigger'` | `'burst_flash'` | 与 `VisualEventType` 枚举值一致 |

### 6.2 类型定义同步清单

创建新武器时，**必须同时更新**以下文件的类型定义：

| 文件 | 位置 | 更新内容 |
|:---|:---|:---|
| `GameEnums.ts` | `VisualEventType` 枚举 | 添加新的视觉效果类型 |
| `VisualEffectUtils.ts` | `ActiveEffect` 接口 | 更新 `type` 联合类型 |
| `CyberFishRenderer.ts` | `triggerSkillEffect` 参数 | 更新 `type` 联合类型 + switch case |
| `useFishOilBattle.ts` | `onVisualEvent` switch | 使用完整的枚举值调用 `triggerSkillEffect` |
| `BattleTestPanel.vue` | 测试事件处理 | 使用完整的枚举值调用 `triggerSkillEffect` |

### 6.3 常见类型错误

| 错误信息 | 原因 | 修复方法 |
|:---|:---|:---|
| 不能将类型"X"分配给类型"Y" | 使用了简写类型字符串 | 改为完整的 `VisualEventType` 枚举值 |
| 类型"X"上不存在属性"Y" | 类型定义不完整 | 更新所有相关文件的类型定义 |

---

## 八、特效设计模式

常见的前端特效模式：

| 模式 | 说明 | 参数来源 | 示例 |
|:---|:---|:---|:---|
| **飞行弹道** | 特效从起点沿方向飞行，到达终点后渐隐 | `projectile.visualFlightSpeed` + 方向角 + 距离 | 光学斩击、能量弹 |
| **扩散圆环** | 从触发点向外扩散的圆环，渐入渐出 | `shockwaveVisual.strokeWidth` + 最大半径 | 冲击波 |
| **场地持续** | 固定位置的持续特效，带持续绘制更新 | `field.visualWidth/visualHeight` + 持续时间 | 防火墙、引力场 |
| **追踪实体** | 跟随玩家/投射物移动的特效 | `hiveMother.orbitRadius/ballRadius` | 蜂群绕球、护盾 |

---

## 九、关键文件速查表

| 文件 | 路径 |
|:---|:---|
| IWeapon 接口 | `game/backend/src/games/fish-oil-battle/core/IWeapon.ts` |
| IBattleState 类型 | `game/backend/src/games/fish-oil-battle/core/types.ts` |
| WeaponRegistry | `game/backend/src/games/fish-oil-battle/core/WeaponRegistry.ts` |
| WeaponScheduler (PendingVisualEvent) | `game/backend/src/games/fish-oil-battle/core/WeaponScheduler.ts` |
| FishOilRoom (extractVisualEvents) | `game/backend/src/games/fish-oil-battle/FishOilRoom.ts` |
| GameEnums | `game/backend/src/games/fish-oil-battle/config/GameEnums.ts` |
| WeaponRangeConfig | `game/backend/src/games/fish-oil-battle/config/WeaponRangeConfig.ts` |
| 协议定义 | `game/backend/src/games/fish-oil-battle/shared/protocol.ts` |
| 武器目录 | `game/backend/src/games/fish-oil-battle/skills/weapons/` |
| EffectRenderer（总协调器） | `game/frontend/src/components/fish-oil-battle/renderer/entities/EffectRenderer.ts` |
| VisualEffectUtils（类型定义） | `game/frontend/src/components/fish-oil-battle/renderer/entities/VisualEffectUtils.ts` |
| CyberFishRenderer（集成） | `game/frontend/src/components/fish-oil-battle/renderer/CyberFishRenderer.ts` |
| useFishOilBattle（事件路由） | `game/frontend/src/components/fish-oil-battle/useFishOilBattle.ts` |

---

## 十、类型同步检查模板

创建新武器时，确保前后端类型定义一致。**按顺序执行以下检查**：

### 9.1 后端类型定义

```typescript
// 1. GameEnums.ts - 添加枚举
export enum VisualEventType {
  YOUR_EVENT = 'your_event',
  // ...
}

// 2. protocol.ts - 更新 VisualEventData 接口
export interface VisualEventData {
  // ... 现有字段
  /** 你的新字段描述 */
  yourField?: string;
  yourNumberField?: number;
}
```

### 9.2 前端类型定义

```typescript
// 1. protocol.ts - 确保与后端完全一致（共享文件）
//  already imported from backend

// 2. CyberFishRenderer.ts - 更新 triggerSkillEffect 参数类型
triggerSkillEffect(config: {
  type: 'shockwave' | 'firewall' | ... | 'your_new_type';
  // ... 现有属性
  /** 你的新属性 */
  yourField?: string;
  yourNumberField?: number;
}): void {
  // 在 switch 中添加 case
  case 'your_new_type':
    // 调用特效渲染器
    break;
}
```

### 9.3 类型检查命令

创建新武器后，运行以下命令检查类型错误：

```bash
# 检查后端类型
cd game/backend && npx tsc --noEmit

# 检查前端类型
cd game/frontend && npx tsc --noEmit

# 或者运行 Vue 开发服务器（会自动显示类型错误）
npm run dev
```

### 9.4 常见类型错误及修复

| 错误信息 | 原因 | 修复方法 |
|:---|:---|:---|
| 类型"X"上不存在属性"Y" | `triggerSkillEffect` 参数类型缺少属性 | 在 `CyberFishRenderer.ts` 第173行附近添加属性 |
| 对象字面量只能指定已知属性 | 传递给 `triggerSkillEffect` 的对象包含未定义属性 | 确保对象所有属性都在类型定义中声明 |
| 类型"X"不能赋值给类型"Y" | `VisualEventData` 与 `triggerSkillEffect` 参数类型不匹配 | 确保两者字段名和类型完全一致 |
| 类型"X"上不存在属性"isAlive" | 使用了不存在的属性 | 使用 `hp > 0` 判断玩家是否存活 |
| 对象字面量只能指定已知属性（alpha） | 在 TextStyle 中使用了 alpha | 在 PIXI.Text 对象上设置 `alpha` 属性 |

---

## 十一、参考文档

- 框架 API 详解: 加载 `references/framework-api.md`
- 视觉事件协议: 加载 `references/visual-event-protocol.md`
- 数值平衡指南: 加载 `references/balance-guide.md`
