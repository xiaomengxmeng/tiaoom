# 基础武器特效渲染器彻底重写设计

- **日期**：2026-06-28
- **范围**：9 个新建基础武器渲染器全部按"闲乘月标准"从零重写
- **方案**：B（共享基类 + ParticlePool 扩展）
- **目标**：消除"简单换颜色"模板化问题，每个渲染器具备独特视觉符号与角色 IP 表达

---

## 1. 背景与问题

### 1.1 现状

`game/frontend/src/components/fish-oil-battle/renderer/entities/` 下 9 个新建基础武器渲染器：

- `NanoRipperRenderer.ts`（543 行）
- `SizeWarpRenderer.ts`（513 行）
- `PursuitProtocolRenderer.ts`（694 行）
- `GravityWellRenderer.ts`（627 行）
- `EntropyDiffuserRenderer.ts`（614 行）
- `BastionBuilderRenderer.ts`（505 行）
- `CircuitWeaverRenderer.ts`（542 行）
- `QuantumRiftRenderer.ts`（541 行）
- `RicochetCoreRenderer.ts`（550 行）

### 1.2 问题诊断

经代码审计，9 个渲染器是同一份模板批量生成的产物，共享 12 类逐字重复代码块：

| 重复代码块 | 重复次数 | 说明 |
|-----------|---------|------|
| `interpolateColor(from, to, t)` | 9/9 | 位运算颜色插值，完全一致 |
| `easeOutCubic(t)` | 9/9 | 完全一致 |
| `setScale(scale)` | 9/9 | 完全一致 |
| `drawBurstCore(g, radius)` 10 层渐变 | 4/9 | NanoRipper/Pursuit/Gravity/Entropy 完全一致 |
| `drawBurstCore(g, radius)` 8 层渐变 | 5/9 | Bastion/Circuit/Quantum/Size/Ricochet 完全一致 |
| `drawBurstHorizon/Pulse/Ring` 双层细环 | 9/9 | 完全一致（仅颜色变量名不同） |
| `drawBurstHalo/Pull/Lock/Diffuse/Tear` 6 条 quadraticCurveTo | 4/9 | NanoRipper/Gravity/Pursuit/Entropy 完全一致 |
| `spawnBurstParticles(burst)` | 9/9 | 完全一致（仅颜色变量名不同） |
| `update(dt)` 三阶段 | 9/9 | 结构完全一致 |
| `clear()` / `destroy()` | 9/9 | 完全一致 |

### 1.3 与"闲乘月黄金标准"的 6 项核心差距

对照 `EntropicTouchRenderer.ts`（688 行，项目内黄金参考）：

| 维度 | 闲乘月标准 | 9 个新建渲染器 |
|------|-----------|---------------|
| 对象池预分配 | ✅ `pool[] + acquire/release` | ❌ 直接 `new PIXI.Graphics()` + `destroy` |
| 生命周期管理 | ✅ `ActiveEffect { onUpdate/onDecay }` | ❌ 内部 `Map<string, ActiveXxx>` 自管 |
| 调色板派生 | ✅ `buildPalette(themeColor)` 5-6 色 | ❌ 颜色写死常量，`themeColor` 被 `void` 忽略 |
| 共享工具 | ✅ 引用 `VisualEffectUtils` | ❌ 各自重新实现 |
| 阶段粒子套数 | ✅ 3 套（蓄能/冲击/余震） | ❌ 仅 1-2 套 |
| 混合模式 | ✅ `BLEND_MODES.ADD` | ❌ 默认 NORMAL |

### 1.4 严重程度分级

- ❌ **2 个完全无差异化**：`NanoRipperRenderer`（撕裂线 = 别人的引力线）、`SizeWarpRenderer`（缩放环 = 双层环 4 倍复制）
- ⚠️ **7 个部分模板化**：场特效有独创，爆发部分是模板代码

---

## 2. 设计目标

1. **消除模板化**：9 个渲染器各自具备独特视觉符号，无"换颜色"感
2. **统一质量基线**：全部达到"闲乘月标准"（对象池/调色板派生/三阶段动画/ADD 混合）
3. **消除代码重复**：60%+ 重复代码通过基类消除
4. **ParticlePool 增强物理属性**：支持 gravity(ax/ay)/drag/color gradient，满足项目硬性约束
5. **对外 API 不变**：`trigger*` / `update` / `setScale` / `clear` / `destroy` 签名保持，上层无感知

---

## 3. 架构设计

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│  EffectRenderer (上层路由，已存在)                       │
│  - update(dt) 驱动所有渲染器                             │
│  - buildXxxVisualCfg 从 WeaponRangeConfig 读配置         │
└────────────┬────────────────────────────────────────────┘
             │ 持有
             ▼
┌─────────────────────────────────────────────────────────┐
│  BaseWeaponEffectRenderer (新建抽象基类)                │
│  - 通用对象池 acquire/release                          │
│  - buildPalette(themeColor) 调色板派生                   │
│  - 三阶段动画骨架（蓄压/爆发/扩散）                      │
│  - setScale / clear / destroy 统一实现                  │
│  - 共享工具 interpolateColor / drawMultilayerCircle     │
│  - 抽象钩子：drawAura / drawBurst / drawField           │
└────────────┬────────────────────────────────────────────┘
             │ extends
             ▼
┌─────────────────────────────────────────────────────────┐
│  9 个子类渲染器（重写）                                  │
│  NanoRipper / SizeWarp / PursuitProtocol / GravityWell  │
│  EntropyDiffuser / BastionBuilder / CircuitWeaver       │
│  QuantumRift / RicochetCore                            │
│  - 只实现独特视觉主题（override 钩子）                   │
│  - 颜色常量 + ActiveXxx 接口                            │
└─────────────────────────────────────────────────────────┘
             │ 依赖
             ▼
┌─────────────────────────────────────────────────────────┐
│  ParticlePool (扩展)                                    │
│  新增: ax/ay (gravity) / drag / tintStart→tintEnd       │
│  保留: vx/vy / scale / alpha / rotation / ADD blend    │
└─────────────────────────────────────────────────────────┘
```

### 3.2 文件清单

| 操作 | 文件 | 估算行数 |
|------|------|---------|
| 新建 | `renderer/entities/BaseWeaponEffectRenderer.ts` | ~300 |
| 修改 | `renderer/systems/ParticlePool.ts` | +~80 |
| 重写 | `renderer/entities/NanoRipperRenderer.ts` | ~350 |
| 重写 | `renderer/entities/SizeWarpRenderer.ts` | ~350 |
| 重写 | `renderer/entities/PursuitProtocolRenderer.ts` | ~400 |
| 重写 | `renderer/entities/GravityWellRenderer.ts` | ~400 |
| 重写 | `renderer/entities/EntropyDiffuserRenderer.ts` | ~380 |
| 重写 | `renderer/entities/BastionBuilderRenderer.ts` | ~380 |
| 重写 | `renderer/entities/CircuitWeaverRenderer.ts` | ~400 |
| 重写 | `renderer/entities/QuantumRiftRenderer.ts` | ~380 |
| 重写 | `renderer/entities/RicochetCoreRenderer.ts` | ~380 |
| 微调 | `EffectRenderer.ts` | 基类集成 |
| 微调 | `test/EffectTestController.ts` | 基类构造（如需） |

**总工作量估算**：约 3080 行（对比方案 A 的 5400 行，省 2320 行）

---

## 4. BaseWeaponEffectRenderer 基类设计

### 4.1 类结构

```typescript
abstract class BaseWeaponEffectRenderer {
  protected container: PIXI.Container;
  protected l3Field: PIXI.Container;
  protected particlePool: ParticlePool;
  protected scale = 1;
  protected canvasW = 1280;
  protected canvasH = 720;

  // ═══ 通用工具（子类直接用） ═══
  protected interpolateColor(from: number, to: number, t: number): number;
  protected easeOutCubic(t: number): number;
  protected easeInCubic(t: number): number;
  protected drawMultilayerCircle(
    g: PIXI.Graphics,
    baseR: number,
    layers: number,
    colorFn: (t: number) => number,
    alphaFn: (t: number) => number
  ): void;
  protected buildPalette(themeColor: number): Palette;

  // ═══ 对象池（Graphics 复用） ═══
  protected acquireGraphics(): PIXI.Graphics;
  protected releaseGraphics(g: PIXI.Graphics): void;

  // ═══ 三阶段动画骨架 ═══
  protected runBurstAnimation(burst: ActiveBurst, dt: number): void;
  protected phase1Charge(burst: ActiveBurst, t: number): void;   // 钩子
  protected phase2Burst(burst: ActiveBurst, t: number): void;    // 钩子
  protected phase3Diffuse(burst: ActiveBurst, t: number): void;   // 钩子

  // ═══ 生命周期 ═══
  abstract update(dt: number): void;
  setScale(scale: number, canvasW: number, canvasH: number): void;
  protected onScaleChange(scale: number): void;  // 钩子：同步已有实体
  abstract clear(): void;
  destroy(): void;
}
```

### 4.2 Palette 接口

```typescript
interface Palette {
  primary: number;    // 主色（= themeColor）
  glow: number;      // 发光色（lighten +50）
  highlight: number;  // 高亮色（lighten +100）
  dim: number;        // 暗色（dimColor 0.6）
  shadow: number;     // 阴影色（dimColor 0.3）
  accent: number;     // 强调色（色相旋转 30°）
}
```

### 4.3 三阶段动画调度

```typescript
protected runBurstAnimation(burst: ActiveBurst, dt: number): void {
  burst.life += dt;
  if (burst.life >= burst.maxLife) {
    this.removeBurst(burst);
    return;
  }
  const T = burst.maxLife;
  const t = burst.life / T;
  const phase1End = T * 0.15;  // 蓄压 0-15%
  const phase2End = T * 0.30;  // 爆发 15-30%
  if (burst.life < phase1End) {
    this.phase1Charge(burst, burst.life / phase1End);
  } else if (burst.life < phase2End) {
    this.phase2Burst(burst, (burst.life - phase1End) / (phase2End - phase1End));
  } else {
    this.phase3Diffuse(burst, (burst.life - phase2End) / (T - phase2End));
  }
}
```

**关键设计**：
- 阶段边界用 `T * 比例`，保证 duration 可配置时阶段比例不变
- 子类只需 override 三个 phase 钩子，无需关心调度逻辑

### 4.4 对象池设计

```typescript
private graphicsPool: PIXI.Graphics[] = [];

protected acquireGraphics(): PIXI.Graphics {
  let g = this.graphicsPool.pop();
  if (!g) {
    g = new PIXI.Graphics();
  }
  g.clear();
  g.visible = true;
  this.container.addChild(g);
  return g;
}

protected releaseGraphics(g: PIXI.Graphics): void {
  if (g.destroyed) return;
  g.visible = false;
  this.container.removeChild(g);
  this.graphicsPool.push(g);
}
```

**对比当前实现**：9 个渲染器全用 `new PIXI.Graphics() + destroy`，频繁 GC。基类对象池复用 Graphics 对象。

---

## 5. ParticlePool 扩展设计

### 5.1 新增字段

```typescript
interface PooledParticle {
  // 现有字段保留
  sprite: PIXI.Sprite | PIXI.Graphics;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  scaleStart: number;
  scaleEnd: number;
  alphaStart: number;
  alphaEnd: number;
  rotationSpeed: number;
  tint: number;
  active: boolean;

  // 新增字段
  ax: number;         // X 加速度 (px/s²)，默认 0
  ay: number;         // Y 加速度 (px/s²)，默认 0
  drag: number;       // 阻力系数 (0-1, 每秒衰减比例)，默认 0
  tintStart: number;  // 起始色，默认 = tint
  tintEnd: number;    // 结束色，默认 = tint
  hasGradient: boolean; // 是否启用颜色渐变，默认 false
}
```

### 5.2 emit 扩展

```typescript
emit(config: {
  // 现有参数
  x: number; y: number;
  vx?: number; vy?: number;
  life?: number;
  scaleStart?: number; scaleEnd?: number;
  alphaStart?: number; alphaEnd?: number;
  tint?: number;
  radius?: number;
  rotationSpeed?: number;
  // 新增参数
  ax?: number;           // X 加速度
  ay?: number;           // Y 加速度
  drag?: number;         // 阻力系数
  tintStart?: number;    // 起始色（启用渐变）
  tintEnd?: number;      // 结束色（启用渐变）
}): PooledParticle | null
```

### 5.3 update 扩展

```typescript
update(dt: number): void {
  const dtSec = dt / 1000;
  for (let i = 0; i < this.capacity; i++) {
    const p = this.pool[i];
    if (!p.active) continue;

    p.life += dt;
    if (p.life >= p.maxLife) {
      p.active = false;
      p.sprite.visible = false;
      p.sprite.alpha = 0;
      continue;
    }

    const t = p.life / p.maxLife;

    // 阻力衰减（新增）
    if (p.drag > 0) {
      const dragFactor = Math.pow(1 - p.drag, dtSec);
      p.vx *= dragFactor;
      p.vy *= dragFactor;
    }

    // 重力加速（新增）
    p.vx += p.ax * dtSec;
    p.vy += p.ay * dtSec;

    // 位置
    p.sprite.x += p.vx * dtSec;
    p.sprite.y += p.vy * dtSec;

    // 缩放
    const s = p.scaleStart + (p.scaleEnd - p.scaleStart) * t;
    p.sprite.scale.set(s);

    // 透明度
    p.sprite.alpha = p.alphaStart + (p.alphaEnd - p.alphaStart) * t;

    // 旋转
    p.sprite.rotation += p.rotationSpeed * dtSec;

    // 颜色渐变（新增）
    if (p.hasGradient) {
      p.sprite.tint = interpolateColor(p.tintStart, p.tintEnd, t);
    }
  }
}
```

### 5.4 向后兼容性

- 所有新增参数可选，默认值不改变现有行为
- `ax/ay/drag` 默认 0，不启用重力/阻力
- `tintStart/tintEnd` 默认 = `tint`，`hasGradient` 默认 false，不启用渐变
- 现有调用（如 `EntropicTouchRenderer.spawnIceParticles`）无需修改

---

## 6. 9 个子类视觉主题设计

### 6.1 视觉主题矩阵

| # | 渲染器 | 主题 | 场特效独特视觉 | 爆发独特视觉 | 独特符号 |
|---|--------|------|---------------|-------------|---------|
| 1 | NanoRipper | 纳米撕裂 | 6×6 分子点阵网格 + 局部错位 + 撕裂裂纹生长 | X 形交叉裂刃爆发 + 碎片粒子飞散 + 黑色虚空核 | 网格点阵、生长裂纹、X 形裂刃 |
| 2 | SizeWarp | 体积扭曲 | 椭圆 squash/stretch 呼吸变形 + 体积刻度条 + 压缩波纹 | 体积坍缩奇点 + 形变网格收缩 + 尺寸刻度环展开 | 椭圆形变、刻度环、squash 动画 |
| 3 | PursuitProtocol | 战术追踪 | 旋转准星（双层十字 + 锁定框）+ 贝塞尔追踪粒子流 | 弹道齐射（多枚追踪弹 + 命中爆炸 + 弹壳抛洒） | 准星、追踪弹道、命中爆炸 |
| 4 | GravityWell | 时空弯曲 | 3 条阿基米德螺旋臂 + 引力透镜环 + 时空网格扭曲 | 黑洞坍缩（吸积盘旋转 + 事件视界 + 引力波纹） | 螺旋臂、吸积盘、引力波 |
| 5 | EntropyDiffuser | 熵增扩散 | 3 层错相位扩散波纹 + 混乱方向粒子 + 熵增进度条 | 热寂奇点（热扩散云 + 混沌粒子风暴 + 熵最大爆发） | 扩散波纹、混沌风暴、热寂云 |
| 6 | BastionBuilder | 防御工事 | 3 层六边形护盾叠加 + 节点连接线 + 防御符文 | 堡垒降临（六边形要塞展开 + 护盾冲击波 + 防御塔投影） | 六边形护盾、要塞、符文 |
| 7 | CircuitWeaver | 电路网络 | 6 节点六边形网络 + 对角线连接 + 切向电流粒子 | 电路过载（网络闪烁 + 电流风暴 + 节点爆炸） | 节点网络、电流粒子、过载闪烁 |
| 8 | QuantumRift | 维度裂缝 | 7 条锯齿裂缝（伪随机）+ 黑色吸光核 + 量子涨落粒子 | 维度撕裂（裂缝扩展 + 虚空涌出 + 量子涟漪） | 锯齿裂缝、吸光核、量子涨落 |
| 9 | RicochetCore | 弹道反射 | 6 条多段反弹线（角度反射）+ 端点节点 + 反射角标记 | 弹射风暴（多向弹道 + 反射网络 + 弹道余晖） | 反弹线、反射角、弹道网络 |

### 6.2 视觉符号"去重"保证

每个子类至少有 2 个独有视觉符号，不与其他子类重复：

- **NanoRipper** 用"分子网格"（点阵），**GravityWell** 用"时空网格扭曲"（弯曲网格）—— 前者点阵，后者弯曲
- **BastionBuilder** 用"六边形护盾"（闭合），**CircuitWeaver** 用"六边形网络"（开放连线）—— 前者闭合防御，后者开放导电
- **QuantumRift** 用"锯齿裂缝"（伪随机折线），**NanoRipper** 用"生长裂纹"（径向直线）—— 前者折线，后者直线

### 6.3 子类实现模板

```typescript
class NanoRipperRenderer extends BaseWeaponEffectRenderer {
  // 1. 颜色常量（4+ 个）
  private static readonly NANO_CORE = 0xff3300;
  private static readonly NANO_LIGHT = 0xffaa44;
  // ...

  // 2. 活跃实例接口
  private interface ActiveField { ... }
  private interface ActiveBurst { ... }

  // 3. 实例池
  private fields = new Map<string, ActiveField>();
  private bursts = new Map<string, ActiveBurst>();

  // 4. 独特视觉绘制（override 钩子）
  protected phase1Charge(burst, t) { /* X 形裂刃蓄压 */ }
  protected phase2Burst(burst, t) { /* 碎片爆发 */ }
  protected phase3Diffuse(burst, t) { /* 虚空核消散 */ }

  // 5. 独特场特效
  private drawMolecularGrid(g, radius) { /* 6×6 分子点阵 */ }

  // 6. trigger API（对外不变）
  triggerField(playerId, x, y, radius, color) { ... }
  triggerBurst(playerId, x, y, radius, color) { ... }

  // 7. 生命周期
  update(dt) { /* 遍历 fields/bursts 调用基类 runBurstAnimation */ }
  clear() { /* 清空两个 Map */ }
}
```

---

## 7. 集成点

### 7.1 改动范围

| 集成点 | 改动 |
|--------|------|
| `EffectRenderer.ts` | 9 个渲染器构造改用基类工厂；`buildXxxVisualCfg` 保持不变 |
| `useFishOilBattle.ts` | 路由不变（VisualEventType 已存在） |
| `test/EffectTestController.ts` | 9 个渲染器构造签名不变（基类透明） |
| `test/effectRegistry.ts` | switch case 不变（trigger API 不变） |
| `WeaponRangeConfig.ts` | 不变（已有配置） |
| `GameEnums.ts` | 不变（VisualEventType 已存在） |

### 7.2 对外 API 不变保证

重写后每个渲染器保留以下公开方法签名：

```typescript
// 场特效
triggerField(playerId: string, x: number, y: number, radius: number, color: number): void
// 爆发特效
triggerBurst(playerId: string, x: number, y: number, radius: number, color: number): void
// 帧更新
update(dt: number): void
// 缩放
setScale(scale: number, canvasW?: number, canvasH?: number): void
// 清空
clear(): void
// 销毁
destroy(): void
```

上层（EffectRenderer / useFishOilBattle / EffectTestController）无需修改。

---

## 8. 测试与验证

### 8.1 验证项

| 验证项 | 方法 | 通过标准 |
|--------|------|---------|
| 编译通过 | `npm run build` | 无错误，exit code 0 |
| 测试页面显示 | EffectTestPage 9 个渲染器可见 | 全部出现在侧边栏分组 |
| 测试页面播放 | 点击 Play 按钮 | 9 个特效正常播放，无报错 |
| 视觉差异化 | 肉眼对比 9 个爆发特效 | 无"换颜色"感，各有独特符号 |
| 对象池生效 | Chrome DevTools Memory | 无频繁 GC spike |
| 调色板派生 | 同一渲染器传不同 themeColor | 颜色变化可见 |
| 粒子物理 | 观察 NanoRipper 碎片粒子 | 有重力下落 + 阻力衰减 |
| 粒子渐变 | 观察 EntropyDiffuser 混沌粒子 | 颜色从起始色过渡到结束色 |
| 性能 | 9 个渲染器同时活跃 | ≥ 30fps |

### 8.2 回归测试

- `EntropicTouchRenderer` 等 11 个已达标的联动角色渲染器不受影响（不修改）
- `ShockwaveEffectRenderer` / `FirewallEffectRenderer` / `HiveEffectRenderer` 不受影响（不修改）
- 现有 ParticlePool 调用（如 `EntropicTouchRenderer.spawnIceParticles`）行为不变（向后兼容）

---

## 9. 风险与缓解

### 9.1 基类设计风险

**风险**：基类抽象点设计不当，导致子类难以实现独特视觉
**缓解**：采用"模板方法 + 钩子"模式，子类通过 override 钩子方法实现独特视觉，避免过度抽象。基类只封装通用骨架，不限制子类视觉表达

### 9.2 ParticlePool 向后兼容风险

**风险**：扩展字段破坏现有调用
**缓解**：所有新增参数可选，默认值不改变现有行为。现有 `EntropicTouchRenderer.spawnIceParticles` 等调用无需修改

### 9.3 视觉风格统一风险

**风险**：9 个子类视觉风格分裂，与闲乘月标准不一致
**缓解**：
- 基类强制三阶段动画骨架（蓄压/爆发/扩散）
- 基类提供 `buildPalette` 统一调色板派生
- 基类提供 `drawMultilayerCircle` 统一径向渐变
- ADD blend mode 由 ParticlePool 内部硬编码，主体光环用 alpha 叠加（与闲乘月一致）

### 9.4 工作量风险

**风险**：9 个渲染器重写工作量大
**缓解**：基类消除 60%+ 重复代码，每个子类只实现独特视觉（~300-400 行 vs 当前 ~550 行）。可按优先级分批实现：先 2 个完全无差异化的（NanoRipper/SizeWarp），再 7 个部分模板化的

---

## 10. 实施顺序建议

1. **Phase 1：基础设施**
   - 扩展 `ParticlePool.ts`（+gravity/drag/color gradient）
   - 新建 `BaseWeaponEffectRenderer.ts`（基类 + 对象池 + 调色板 + 三阶段骨架）

2. **Phase 2：重写 2 个完全无差异化渲染器**
   - `NanoRipperRenderer`（纳米撕裂）
   - `SizeWarpRenderer`（体积扭曲）

3. **Phase 3：重写 7 个部分模板化渲染器**
   - `PursuitProtocolRenderer`（战术追踪）
   - `GravityWellRenderer`（时空弯曲）
   - `EntropyDiffuserRenderer`（熵增扩散）
   - `BastionBuilderRenderer`（防御工事）
   - `CircuitWeaverRenderer`（电路网络）
   - `QuantumRiftRenderer`（维度裂缝）
   - `RicochetCoreRenderer`（弹道反射）

4. **Phase 4：集成验证**
   - `EffectRenderer.ts` 基类集成
   - `npm run build` 编译验证
   - 测试页面验证 9 个特效可见可播放

---

## 11. 不在范围内

- 11 个联动角色渲染器（已达闲乘月标准，不修改）
- `ShockwaveEffectRenderer` / `FirewallEffectRenderer` / `HiveEffectRenderer` / `GlobalEffectRenderer`（已优化，不修改）
- 后端武器逻辑（`WeaponRangeConfig` / `GameEnums` / 武器类等不变）
- 测试页面 UI（已优化，不修改）

---

## 12. 参考文件

- **黄金参考**：`renderer/entities/EntropicTouchRenderer.ts`（688 行）
- **共享工具**：`renderer/entities/VisualEffectUtils.ts`（lighten/dimColor/glowColor/bounceColor/drawHexagon/drawRing/easeOutCubic/ActiveEffect）
- **粒子池**：`renderer/systems/ParticlePool.ts`
- **配置层**：`backend/src/games/fish-oil-battle/config/WeaponRangeConfig.ts`
- **事件枚举**：`backend/src/games/fish-oil-battle/config/GameEnums.ts`（VisualEventType）
- **上层路由**：`renderer/EffectRenderer.ts`（buildXxxVisualCfg + update 调度）
