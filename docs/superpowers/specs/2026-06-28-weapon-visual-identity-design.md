# 武器视觉辨识度与伤害反馈差异化设计

> **日期**：2026-06-28
> **状态**：设计阶段
> **作者**：brainstorming 流程
> **关联**：基于 `2026-06-28-character-weapon-palettes-design.md` 色板系统扩展

## 一、背景与问题

### 1.1 用户反馈

测试中观察到三个核心问题：

1. **小球外观与武器完全解耦**：选了不同武器，小球外观都一样（仅色板不同），辨识度低
2. **伤害看不出是谁打的**：所有武器命中反馈完全相同（150ms 闪白 + 红色数字），无法区分伤害来源
3. **伤害机制雷同**：感觉都是"单纯圆形伤害"，缺乏防火墙硬化碰撞那样的"实质物理感"
4. **特效页与实战尺寸不一致**：特效页 scale=1.0 调好的细节，实战 0.3-0.7 缩放后被压缩看不清

### 1.2 调研结论

| 维度 | 现状 | 评估 |
|------|------|------|
| 后端伤害机制 | 12 把武器已实现 12 种不同机制（弹射/穿透/反击/DOT/牵引等） | ✅ 已差异化 |
| 后端命中事件 | 仅通过 `applyDamage` 减 HP，不发送任何 VISUAL_ONLY 命中事件 | 🔴 无命中事件 |
| 前端命中反馈 | `playHitEffect()` 无参数，所有武器共用 150ms 闪白 + 红色数字 | 🔴 完全相同 |
| 前端状态反馈 | 仅 `setSlowed` 用于防火墙，DOT/冻伤/牵引/眩晕无视觉 | 🔴 仅 1 种 |
| 防火墙硬化碰撞 | `getObstacles + onObstacleHit` 双钩子，物理引擎无法穿越 | ✅ 唯一参考实现 |

## 二、设计目标

1. **小球装饰化**：12 个角色武器各有签名装饰（顶部/环绕/外圈/侧挂），不绘制球体表情（球体来自头像）
2. **受击反馈差异化**：6 种受击反应（闪白/冰冻/电击/燃烧/斩击/拉扯），命中时能看出是什么武器打的
3. **伤害机制物理化**：4 个关键武器（光学斩击/空气斥力场/流体操控/记忆回廊）的场域/投射物改为 `PhysicsObstacle`，有实质碰撞感
4. **尺寸对齐**：特效页 scale 降到 0.625（800×450 画布），所见即实战所得
5. **9 个基础武器不受影响**：仅 12 个角色武器参与本次设计

## 三、架构设计

### 3.1 装饰器系统（前端）

#### 3.1.1 类层次

```
WeaponDecorator（抽象基类）
├── TopDecorator（顶部装饰）
│   ├── CatEarDecorator（放电猫猫 - 圆润猫耳）
│   ├── FloatingBookDecorator（流体操控 - 漂浮古籍）
│   └── CloudDecorator（情绪天气 - 云朵+闪电）
├── OrbitDecorator（环绕旋转）
│   ├── TripleBladeDecorator（光学斩击 - 3 把刀旋转）
│   ├── TripleTriangleDecorator（无限折叠 - 3 三角形旋转）
│   └── HexShardRingDecorator（记忆回廊 - 6 碎片环）
├── OuterRingDecorator（外圈纹路）
│   ├── AirFieldDecorator（空气斥力场 - 双圈虚线+气流弧）
│   ├── MoonHaloDecorator（熵寂之触 - 月轮+放射纹）
│   ├── LensRingDecorator（预知透镜 - 刻度环+准星）
│   └── MoodAuraDecorator（情绪掌控 - 心境光环）
└── SideDecorator（侧挂缠绕）
    ├── PaletteSlingDecorator（画作实体化 - 画板+画笔侧挂）
    └── VineWrapDecorator（植物伙伴 - 藤蔓缠绕）
```

#### 3.1.2 接口设计

```typescript
// WeaponDecorator.ts
export abstract class WeaponDecorator {
  protected container: PIXI.Container;  // 装饰容器（挂在 avatar 之外）
  protected scale = 1;

  constructor(parentContainer: PIXI.Container) {
    this.container = new PIXI.Container();
    parentContainer.addChild(this.container);
  }

  /** 同步缩放（与 PlayerRenderer.setScale 联动） */
  setScale(s: number): void {
    this.scale = s;
    this.container.scale.set(s);
  }

  /** 同步位置（与 PlayerRenderer 位置联动） */
  setPosition(x: number, y: number): void {
    this.container.position.set(x, y);
  }

  /** 更新（由 PlayerRenderer.update 驱动，用于公转/呼吸等动画） */
  abstract update(dt: number): void;

  /** 爆发态切换（部分装饰有变化） */
  setBurstMode(active: boolean): void { /* 默认空实现，子类按需 override */ }

  /** 销毁 */
  destroy(): void {
    this.container.destroy({ children: true });
  }
}
```

#### 3.1.3 PlayerRenderer 集成

```typescript
// PlayerRenderer.ts 新增
private weaponDecorator?: WeaponDecorator;

setWeaponDecorator(decorator?: WeaponDecorator): void {
  if (this.weaponDecorator) {
    this.weaponDecorator.destroy();
    this.weaponDecorator = undefined;
  }
  this.weaponDecorator = decorator;
  if (decorator) {
    decorator.setScale(this.scale);
    decorator.setPosition(this.container.x, this.container.y);
  }
}

update(dt: number): void {
  // ... 原有逻辑 ...
  this.weaponDecorator?.update(dt);
}

setScale(s: number): void {
  // ... 原有逻辑 ...
  this.weaponDecorator?.setScale(s);
}

setPosition(x: number, y: number): void {
  // ... 原有逻辑 ...
  this.weaponDecorator?.setPosition(x, y);
}

setBurstMode(active: boolean): void {
  this.weaponDecorator?.setBurstMode(active);
}

destroy(): void {
  this.weaponDecorator?.destroy();
  // ... 原有销毁逻辑 ...
}
```

#### 3.1.4 装饰工厂

```typescript
// WeaponDecorators.ts 末尾导出
export function createWeaponDecorator(
  weaponId: WeaponId,
  parentContainer: PIXI.Container,
  palette: Palette,
): WeaponDecorator | undefined {
  switch (weaponId) {
    case WeaponId.DISCHARGE_CAT:
      return new CatEarDecorator(parentContainer, palette);
    case WeaponId.FLUID_MASTERY:
      return new FloatingBookDecorator(parentContainer, palette);
    // ... 12 个 case ...
    default:
      return undefined;  // 9 个基础武器无装饰
  }
}
```

**CyberFishRenderer 集成**：在 `addPlayer` 后根据该玩家所选武器调用 `playerRenderer.setWeaponDecorator(createWeaponDecorator(weaponId, l2Entity, getWeaponPalette(weaponId)))`。武器切换时（`set_bot_weapon` 命令）需重新创建装饰器。

### 3.2 受击反馈差异化系统（前端 + 后端协议）

#### 3.2.1 HitReaction 类型定义

```typescript
// protocol.ts 新增
export type HitReaction =
  | 'flash'      // 默认闪白（基础武器/无特殊）
  | 'freeze'     // 冰冻颤抖+蓝色（熵寂之触）
  | 'shock'      // 电击抖动+黄色（放电猫猫）
  | 'burn'       // 燃烧粒子+橙色（情绪天气）
  | 'slash'      // 斩击残影+银色（光学斩击）
  | 'pull';      // 拉扯位移+紫色（流体操控/记忆回廊）

export interface HitFeedback {
  targetId: string;
  sourceId: string;
  weaponId: WeaponId;
  damage: number;
  reaction: HitReaction;
}
```

#### 3.2.2 后端：发送命中事件

**方案**：在 `WeaponScheduler.applyWeaponEffects` 中，当处理 DAMAGE 类型效果时，额外收集一个 `HIT_FEEDBACK` VISUAL_ONLY 事件。

```typescript
// WeaponScheduler.ts applyWeaponEffects 中
case WeaponEffectType.DAMAGE:
  if (effect.targetId && effect.sourceId) {
    const weapon = this.getWeapon(effect.sourceId);
    const reaction = weapon?.getHitReaction?.() ?? 'flash';
    state.applyDamage(effect.targetId, effect.value);
    // 新增：收集命中反馈事件
    pendingVisuals.push({
      type: VisualEventType.HIT_FEEDBACK,
      targetId: effect.targetId,
      sourceId: effect.sourceId,
      metadata: {
        weaponId: weapon?.weaponId,
        damage: effect.value,
        hitReaction: reaction,
      },
    });
  }
  break;
```

**IWeapon 新增可选方法**：

```typescript
// IWeapon.ts
export interface IWeapon {
  // ... 原有方法 ...
  getHitReaction?(): HitReaction;
}
```

#### 3.2.3 12 把武器的 hitReaction 映射

| 武器 | hitReaction | 说明 |
|------|------------|------|
| 放电猫猫 | `shock` | 电击抖动+黄色粒子 |
| 流体操控 | `pull` | 被水流拉扯位移+蓝色 |
| 记忆回廊 | `pull` | 被回响牵引+紫色 |
| 光学斩击 | `slash` | 斩击残影+银色 |
| 空气斥力场 | `pull` | 被气流推开+黄色 |
| 熵寂之触 | `freeze` | 冰冻颤抖+蓝色 |
| 画作实体化 | `slash` | 墨迹溅射+紫色 |
| 预知透镜 | `flash` | 默认闪白（已有专属透镜命中视觉） |
| 情绪天气 | `burn` | 燃烧粒子+橙色 |
| 情绪掌控 | `flash` | 心境光环（已有专属心境视觉） |
| 无限折叠 | `pull` | 空间扭曲+紫色 |
| 植物伙伴 | `burn` | 藤蔓缠绕+绿色 |

#### 3.2.4 前端：PlayerRenderer 受击方法扩展

```typescript
// PlayerRenderer.ts
playHitEffect(reaction: HitReaction = 'flash'): void {
  switch (reaction) {
    case 'freeze':
      this.hitFlashTimer = 200;
      this.avatar.tint = 0x88CCFF;
      this.shakeOffset = { x: 0, y: 0, magnitude: 1, duration: 200 };
      break;
    case 'shock':
      this.hitFlashTimer = 250;
      this.avatar.tint = 0xFFEE88;
      this.shakeOffset = { x: 0, y: 0, magnitude: 3, duration: 250 };
      break;
    case 'burn':
      this.hitFlashTimer = 300;
      this.avatar.tint = 0xFF8800;
      this.spawnBurnParticles();
      break;
    case 'slash':
      this.hitFlashTimer = 150;
      this.spawnSlashAfterimage();
      break;
    case 'pull':
      this.hitFlashTimer = 200;
      this.applyPullDisplacement();
      break;
    default:
      this.hitFlashTimer = 150;
      this.avatar.alpha = 0.3;
  }
}

showDamageNumber(damage: number, color?: number): void {
  // ... 原有逻辑，fill: color ?? 0xFF3333 ...
}
```

#### 3.2.5 通用状态效果方法

```typescript
// PlayerRenderer.ts
setStatusEffect(type: 'slow' | 'freeze' | 'burn' | 'pull' | 'shock', duration: number): void {
  this.statusEffect = { type, duration, elapsed: 0 };
}

private updateStatusEffect(dt: number): void {
  if (!this.statusEffect) return;
  this.statusEffect.elapsed += dt;
  if (this.statusEffect.elapsed >= this.statusEffect.duration) {
    this.clearStatusEffect();
    return;
  }
  switch (this.statusEffect.type) {
    case 'slow': /* 蓝色粒子拖尾 */ break;
    case 'freeze': /* 冰晶粒子 + alpha 0.85 */ break;
    case 'burn': /* 橙色火焰粒子 */ break;
    case 'pull': /* 紫色拉扯粒子轨迹 */ break;
    case 'shock': /* 黄色电火花粒子 */ break;
  }
}
```

### 3.3 关键武器物理化（后端）

#### 3.3.1 PhysicsObstacle 复用

参考防火墙实现，为 4 个关键武器添加 `getObstacles()` + `onObstacleHit()`：

| 武器 | PhysicsObstacle 内容 | onObstacleHit 效果 |
|------|---------------------|-------------------|
| 光学斩击 | 斩击残留（0.8s 实体） | 反弹 + 额外 2 伤害（同目标 CD 1s） |
| 空气斥力场 | 锚点（5s 实体） | 弹飞 90px + 4 伤害（同目标 CD 1s） |
| 流体操控 | 漩涡（持续实体） | 牵引 40px + 8 伤害（同目标 CD 1s） |
| 记忆回廊 | 回响投射物（飞行实体） | 穿透 + 8 伤害（单次） |

#### 3.3.2 实现模式

```typescript
// OpticalSlashWeapon.ts
export class OpticalSlashWeapon extends BaseWeapon {
  private slashResidues: Array<{
    id: string;
    x: number; y: number;
    radius: number;
    spawnedAt: number;
    ownerId: string;
  }> = [];

  getObstacles(): PhysicsObstacle[] {
    const now = Date.now();
    return this.slashResidues
      .filter(r => now - r.spawnedAt < 800)  // 0.8s 持续
      .map(r => ({
        id: r.id,
        x: r.x, y: r.y,
        radius: r.radius,
        sourceId: r.ownerId,
        type: 'slash',
      }));
  }

  onObstacleHit(hittingPlayerId: string, state, physics): WeaponEffect[] {
    if (hittingPlayerId === this.ownerId) return [];
    if (this.isOnCooldown('obstacleHit', 1.0)) return [];
    return [{
      type: WeaponEffectType.DAMAGE,
      targetId: hittingPlayerId,
      sourceId: this.ownerId,
      value: 2,
      metadata: { hitReaction: 'slash' },
    }];
  }
}
```

#### 3.3.3 WeaponRangeConfig 扩展

```typescript
// WeaponRangeConfig.ts 各武器配置新增
export interface WeaponRangeConfig {
  // ... 原有字段 ...
  hitReaction?: HitReaction;      // 受击反应类型
  obstacleEnabled?: boolean;       // 是否启用 PhysicsObstacle
  obstacleDurationSec?: number;    // 障碍物持续时间
}
```

### 3.4 尺寸对齐（特效页）

#### 3.4.1 EffectTestPage 画布调整

```typescript
// EffectTestPage.vue
const CANVAS_WIDTH = 800;   // 原 1280
const CANVAS_HEIGHT = 450;  // 原 720
const PREVIEW_SCALE = 0.625; // 800/1280

// 初始化时
const renderer = new CyberFishRenderer(app);
renderer.setScale(PREVIEW_SCALE);
```

#### 3.4.2 切换按钮（可选）

```vue
<template>
  <div class="scale-toggle">
    <button @click="setScale(0.625)">实战比例 (0.625x)</button>
    <button @click="setScale(1.0)">原比例 (1.0x)</button>
  </div>
</template>
```

## 四、实施范围

### 4.1 新增文件

| 文件 | 说明 |
|------|------|
| `renderer/entities/decorators/WeaponDecorator.ts` | 装饰器抽象基类（含 setScale/setPosition/update/setBurstMode/destroy） |
| `renderer/entities/decorators/WeaponDecorators.ts` | 12 个具体装饰器类 + 工厂函数 `createWeaponDecorator(weaponId, parent, palette)`（合并到一个文件，避免过度拆分） |

**色板联动**：装饰器构造函数接收 `palette: Palette` 参数，复用 `WeaponPalettes.ts` 已有的 12 套色板（如猫耳金色来自 `WEAPON_PALETTES[WeaponId.DISCHARGE_CAT].primary`）

### 4.2 修改文件

| 文件 | 修改内容 |
|------|---------|
| `PlayerRenderer.ts` | 新增 `setWeaponDecorator` / `setStatusEffect` / `playHitEffect(reaction)` |
| `EffectRenderer.ts` | 新增 `triggerHitFeedback(feedback: HitFeedback)` 方法 |
| `CyberFishRenderer.ts` | 转发 `HIT_FEEDBACK` 事件 + `setWeaponDecorator` 调用 |
| `useFishOilBattle.ts` | `HIT_FEEDBACK` case 处理 |
| `BattleTestPanel.vue` | `HIT_FEEDBACK` case 处理（测试页对齐） |
| `effectRegistry.ts` | `HIT_FEEDBACK` case 处理 |
| `IWeapon.ts` | 新增 `getHitReaction?()` 可选方法 |
| `WeaponScheduler.ts` | `applyWeaponEffects` 收集 `HIT_FEEDBACK` 事件 |
| `protocol.ts` | 新增 `HitReaction` 类型 + `HitFeedback` 接口 |
| `WeaponRangeConfig.ts` | 12 个武器新增 `hitReaction` + `obstacleEnabled` 配置 |
| `OpticalSlashWeapon.ts` | 添加 `getObstacles` + `onObstacleHit` |
| `AirRepulsionFieldWeapon.ts` | 锚点改为 `PhysicsObstacle` |
| `FluidMasteryWeapon.ts` | 漩涡改为 `PhysicsObstacle` |
| `MemoryCorridorWeapon.ts` | 回响改为 `PhysicsObstacle` |
| `GameEnums.ts` | 新增 `HIT_FEEDBACK` VisualEventType |
| `EffectTestPage.vue` | 画布 800×450 + scale=0.625 |

## 五、验证标准

### 5.1 装饰器系统
- [ ] 12 个角色武器各有独特装饰，9 个基础武器无装饰
- [ ] 装饰随小球 scale 同步缩放
- [ ] 装饰不遮挡球体（球体来自头像）
- [ ] 部分装饰有爆发态变化（如猫耳变大+电火花、古籍翻页加速）

### 5.2 受击反馈差异化
- [ ] 6 种受击反应（flash/freeze/shock/burn/slash/pull）视觉明显不同
- [ ] 被放电猫猫打中显示电击抖动+黄色
- [ ] 被熵寂之触打中显示冰冻颤抖+蓝色
- [ ] 被光学斩击打中显示斩击残影+银色
- [ ] 伤害数字颜色可区分武器

### 5.3 伤害机制物理化
- [ ] 光学斩击残留可碰撞（0.8s 实体）
- [ ] 空气斥力场锚点可弹飞对手
- [ ] 流体操控漩涡可牵引对手
- [ ] 记忆回廊回响可穿透+伤害
- [ ] 物理碰撞有额外伤害（同目标 CD）

### 5.4 尺寸对齐
- [ ] 特效页画布 800×450，scale=0.625
- [ ] 特效页预览与实战中看到的比例一致
- [ ] 可选切换 1.0x 查看细节

### 5.5 回归测试
- [ ] 9 个基础武器不受影响
- [ ] 前端编译通过
- [ ] 后端编译通过（仅预存 4 个 skill-chain.test.ts 错误）
- [ ] 实战对局中能清晰区分 12 个角色武器的伤害来源

## 六、边界与风险

### 6.1 性能风险
- 装饰器预渲染纹理，避免实时 Graphics 绘制
- `HIT_FEEDBACK` 事件频率限制（同目标 CD 0.1s，避免刷屏）
- `PhysicsObstacle` 数量上限（每武器最多 5 个，避免物理引擎过载）

### 6.2 向后兼容
- `getHitReaction?()` 可选方法，未实现的武器回退到 `flash`
- `getObstacles?()` 可选方法，未实现的武器无障碍物
- 现有 `setSlowed` 保留，新增 `setStatusEffect` 作为超集
- `playHitEffect()` 默认参数 `reaction = 'flash'`，未传参时行为不变

### 6.3 范围控制
- 仅 12 个角色武器参与，9 个基础武器不受影响
- 仅 4 个关键武器物理化，其他武器保持原机制
- 不重构 HP 差值检测链路（方案 C 的 `HIT_EVENT` 广播），改用 `HIT_FEEDBACK` VISUAL_ONLY 事件

## 七、决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| 装饰范围 | 仅 12 个角色武器 | 9 个基础武器保持极简，靠色板区分 |
| 装饰类型 | 4 种混合（顶部/环绕/外圈/侧挂） | 避免全部"顶着挂件"的雷同感 |
| 特效差异化方向 | 受击反馈 + 伤害机制（方案 B） | 兼顾视觉与机制，"实质物理感"明显 |
| 尺寸对齐 | 特效页降到 0.625 scale | 所见即实战所得 |
| 命中事件实现 | VISUAL_ONLY `HIT_FEEDBACK` | 不重构 HP 检测链路，风险低 |
