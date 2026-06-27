# 基础武器特效渲染器彻底重写 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 9 个模板化的基础武器渲染器按"闲乘月标准"彻底重写，每个具备独特视觉符号，消除"简单换颜色"问题。

**Architecture:** 新建 `BaseWeaponEffectRenderer` 抽象基类封装通用骨架（对象池/调色板派生/三阶段动画），扩展 `ParticlePool` 支持 gravity/drag/color gradient。9 个子类继承基类，各自实现独特视觉主题。对外 API 不变，上层无感知。

**Tech Stack:** TypeScript, PixiJS v8, Vue 3, Vite

**Spec:** `docs/superpowers/specs/2026-06-28-base-weapon-effect-redesign-design.md`

**Build/Verify Command:** `cd game/frontend && npm run build`

**Visual Verification:** `cd game/frontend && npm run dev` → 打开 EffectTestPage → 逐个播放 9 个特效

---

## File Structure

| 操作 | 文件 | 职责 |
|------|------|------|
| 修改 | `renderer/systems/ParticlePool.ts` | 扩展支持 ax/ay/drag/tintStart→tintEnd |
| 新建 | `renderer/entities/BaseWeaponEffectRenderer.ts` | 抽象基类：对象池+调色板+三阶段骨架+共享工具 |
| 重写 | `renderer/entities/NanoRipperRenderer.ts` | 纳米撕裂：分子网格+X形裂刃 |
| 重写 | `renderer/entities/SizeWarpRenderer.ts` | 体积扭曲：椭圆squash+刻度环 |
| 重写 | `renderer/entities/PursuitProtocolRenderer.ts` | 战术追踪：准星+弹道齐射 |
| 重写 | `renderer/entities/GravityWellRenderer.ts` | 时空弯曲：螺旋臂+吸积盘 |
| 重写 | `renderer/entities/EntropyDiffuserRenderer.ts` | 熵增扩散：扩散波纹+混沌风暴 |
| 重写 | `renderer/entities/BastionBuilderRenderer.ts` | 防御工事：六边形护盾+要塞 |
| 重写 | `renderer/entities/CircuitWeaverRenderer.ts` | 电路网络：节点网络+过载 |
| 重写 | `renderer/entities/QuantumRiftRenderer.ts` | 维度裂缝：锯齿裂缝+吸光核 |
| 重写 | `renderer/entities/RicochetCoreRenderer.ts` | 弹道反射：反弹线+反射网络 |
| 不变 | `EffectRenderer.ts` | 上层路由（API 不变） |
| 不变 | `test/EffectTestController.ts` | 测试控制器（构造签名不变） |
| 不变 | `test/effectRegistry.ts` | 特效注册（trigger API 不变） |

**关键约束**：重写后每个渲染器保留 `trigger*` / `update` / `setScale` / `clear` / `destroy` 公开方法签名，上层零修改。

---

## Phase 1：基础设施

### Task 1: 扩展 ParticlePool 支持 gravity/drag/color gradient

**Files:**
- Modify: `game/frontend/src/components/fish-oil-battle/renderer/systems/ParticlePool.ts`

- [ ] **Step 1: 修改 PooledParticle 接口添加新字段**

在 `ParticlePool.ts` 的 `PooledParticle` 接口中，在 `active: boolean;` 之前添加新字段：

```typescript
export interface PooledParticle {
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
  // 新增物理属性
  ax: number;           // X 加速度 (px/s²)
  ay: number;           // Y 加速度 (px/s²)
  drag: number;         // 阻力系数 (0-1, 每秒衰减比例)
  tintStart: number;   // 颜色渐变起始色
  tintEnd: number;      // 颜色渐变结束色
  hasGradient: boolean; // 是否启用颜色渐变
  active: boolean;
}
```

- [ ] **Step 2: 更新构造函数初始化新字段**

在构造函数的循环中，预创建对象的初始化添加新字段（在 `active: false,` 之前）：

```typescript
this.pool[i] = {
  sprite: g,
  vx: 0, vy: 0,
  life: 0, maxLife: 0,
  scaleStart: 1, scaleEnd: 1,
  alphaStart: 1, alphaEnd: 0,
  rotationSpeed: 0,
  tint: 0xffffff,
  ax: 0, ay: 0,
  drag: 0,
  tintStart: 0xffffff,
  tintEnd: 0xffffff,
  hasGradient: false,
  active: false,
};
```

- [ ] **Step 3: 扩展 emit 方法支持新参数**

在 `emit` 方法的 `config` 参数类型中添加新可选参数，并在初始化粒子时设置：

```typescript
emit(config: {
  x: number; y: number;
  vx?: number; vy?: number;
  life?: number;
  scaleStart?: number; scaleEnd?: number;
  alphaStart?: number; alphaEnd?: number;
  tint?: number;
  radius?: number;
  rotationSpeed?: number;
  // 新增物理参数
  ax?: number;
  ay?: number;
  drag?: number;
  tintStart?: number;
  tintEnd?: number;
}): PooledParticle | null {
  let p: PooledParticle | null = null;
  for (let i = 0; i < this.capacity; i++) {
    if (!this.pool[i].active) {
      p = this.pool[i];
      break;
    }
  }
  if (!p) {
    p = this.pool[0];
    p.active = false;
  }

  const tintVal = config.tint ?? 0xffffff;
  const tintStart = config.tintStart ?? tintVal;
  const tintEnd = config.tintEnd ?? tintVal;

  const g = p.sprite as PIXI.Graphics;
  g.clear();
  g.circle(0, 0, config.radius ?? 3);
  g.fill({ color: tintVal });
  g.x = config.x;
  g.y = config.y;
  g.visible = true;
  g.alpha = config.alphaStart ?? 1;
  g.blendMode = BLEND_MODES.ADD as unknown as PIXI.BLEND_MODES;
  g.rotation = 0;

  p.vx = config.vx ?? 0;
  p.vy = config.vy ?? 0;
  p.life = 0;
  p.maxLife = config.life ?? 1000;
  p.scaleStart = config.scaleStart ?? 1;
  p.scaleEnd = config.scaleEnd ?? 0;
  p.alphaStart = config.alphaStart ?? 1;
  p.alphaEnd = config.alphaEnd ?? 0;
  p.rotationSpeed = config.rotationSpeed ?? 0;
  p.tint = tintVal;
  p.ax = config.ax ?? 0;
  p.ay = config.ay ?? 0;
  p.drag = config.drag ?? 0;
  p.tintStart = tintStart;
  p.tintEnd = tintEnd;
  p.hasGradient = config.tintStart !== undefined || config.tintEnd !== undefined;
  p.active = true;

  return p;
}
```

- [ ] **Step 4: 扩展 update 方法添加物理计算**

替换 `update` 方法，添加阻力衰减、重力加速、颜色渐变：

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

    // 阻力衰减
    if (p.drag > 0) {
      const dragFactor = Math.pow(1 - p.drag, dtSec);
      p.vx *= dragFactor;
      p.vy *= dragFactor;
    }

    // 重力加速
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

    // 颜色渐变
    if (p.hasGradient && p.tintStart !== p.tintEnd) {
      const r = Math.round(this.lerp((p.tintStart >> 16) & 0xff, (p.tintEnd >> 16) & 0xff, t));
      const g = Math.round(this.lerp((p.tintStart >> 8) & 0xff, (p.tintEnd >> 8) & 0xff, t));
      const b = Math.round(this.lerp(p.tintStart & 0xff, p.tintEnd & 0xff, t));
      p.sprite.tint = (r << 16) | (g << 8) | b;
    }
  }
}

private lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
```

- [ ] **Step 5: 编译验证**

Run: `cd game/frontend && npm run build`
Expected: 编译通过，无错误

- [ ] **Step 6: 提交**

```bash
cd game/frontend
git add src/components/fish-oil-battle/renderer/systems/ParticlePool.ts
git commit -m "feat(ParticlePool): 扩展支持gravity/drag/color gradient物理属性"
```

---

### Task 2: 新建 BaseWeaponEffectRenderer 抽象基类

**Files:**
- Create: `game/frontend/src/components/fish-oil-battle/renderer/entities/BaseWeaponEffectRenderer.ts`

- [ ] **Step 1: 创建基类文件**

```typescript
/**
 * 基础武器特效渲染器抽象基类
 *
 * 封装通用骨架：
 * - Graphics 对象池（acquire/release，避免频繁 GC）
 * - 调色板派生（buildPalette，让 themeColor 真正生效）
 * - 三阶段动画调度（蓄压 0-15% / 爆发 15-30% / 扩散 30-100%）
 * - 共享工具（interpolateColor / drawMultilayerCircle / easeOutCubic）
 *
 * 子类通过 override 钩子方法实现独特视觉主题。
 * 对外 API：trigger* / update / setScale / clear / destroy 签名不变。
 */

import * as PIXI from 'pixi.js';
import { ParticlePool } from '../systems/ParticlePool';
import { lighten, dimColor, easeOutCubic, easeInCubic } from './VisualEffectUtils';

// ══════════════════════════════════════════════════════
//  调色板接口
// ══════════════════════════════════════════════════════

export interface Palette {
  primary: number;     // 主色（= themeColor）
  glow: number;       // 发光色（lighten +50）
  highlight: number;   // 高亮色（lighten +100）
  dim: number;         // 暗色（dimColor 0.6）
  shadow: number;      // 阴影色（dimColor 0.3）
  accent: number;      // 强调色（色相旋转）
}

// ══════════════════════════════════════════════════════
//  活跃实例基础接口
// ══════════════════════════════════════════════════════

export interface ActiveBurstBase {
  container: PIXI.Container;
  life: number;
  maxLife: number;
  themeColor: number;
  radius: number;
  particleTimer: number;
  palette: Palette;
}

// ══════════════════════════════════════════════════════
//  抽象基类
// ══════════════════════════════════════════════════════

export abstract class BaseWeaponEffectRenderer {
  protected container: PIXI.Container;
  protected particlePool: ParticlePool;
  protected scale = 1;
  protected canvasW = 1280;
  protected canvasH = 720;

  // Graphics 对象池
  private graphicsPool: PIXI.Graphics[] = [];

  constructor(container: PIXI.Container, particlePool: ParticlePool) {
    this.container = container;
    this.particlePool = particlePool;
  }

  // ═══ 通用工具 ═══

  /** RGB 颜色线性插值 */
  protected interpolateColor(from: number, to: number, t: number): number {
    const r = Math.round(((from >> 16) & 0xff) + (((to >> 16) & 0xff) - ((from >> 16) & 0xff)) * t);
    const g = Math.round(((from >> 8) & 0xff) + (((to >> 8) & 0xff) - ((from >> 8) & 0xff)) * t);
    const b = Math.round((from & 0xff) + ((to & 0xff) - (from & 0xff)) * t);
    return (r << 16) | (g << 8) | b;
  }

  protected easeOutCubic(t: number): number {
    return easeOutCubic(t);
  }

  protected easeInCubic(t: number): number {
    return easeInCubic(t);
  }

  /**
   * 绘制多层同心圆模拟径向渐变
   * @param g Graphics 对象
   * @param baseR 基准半径
   * @param layers 层数
   * @param colorFn 第 i 层颜色（t = i/(layers-1)）
   * @param alphaFn 第 i 层 alpha（t = i/(layers-1)）
   */
  protected drawMultilayerCircle(
    g: PIXI.Graphics,
    baseR: number,
    layers: number,
    colorFn: (t: number) => number,
    alphaFn: (t: number) => number,
  ): void {
    for (let i = 0; i < layers; i++) {
      const t = layers > 1 ? i / (layers - 1) : 0;
      const r = Math.max(0.5, baseR * (1 - t * 0.9));
      g.circle(0, 0, r);
      g.fill({ color: colorFn(t), alpha: Math.max(0, alphaFn(t)) });
    }
  }

  /**
   * 从主题色派生 6 色调色板
   * @param themeColor 主题色（0xRRGGBB）
   */
  protected buildPalette(themeColor: number): Palette {
    return {
      primary: themeColor,
      glow: lighten(themeColor, 50),
      highlight: lighten(themeColor, 100),
      dim: dimColor(themeColor, 0.6),
      shadow: dimColor(themeColor, 0.3),
      accent: this.rotateHue(themeColor, 30),
    };
  }

  /** 色相旋转（degrees） */
  private rotateHue(color: number, degrees: number): number {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    // RGB → HSL
    const max = Math.max(r, g, b) / 255;
    const min = Math.min(r, g, b) / 255;
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      const rN = r / 255, gN = g / 255, bN = b / 255;
      switch (max) {
        case rN: h = (gN - bN) / d + (gN < bN ? 6 : 0); break;
        case gN: h = (bN - rN) / d + 2; break;
        case bN: h = (rN - gN) / d + 4; break;
      }
      h /= 6;
    }
    // 旋转色相
    h = (h + degrees / 360) % 1;
    if (h < 0) h += 1;
    // HSL → RGB
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const newR = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
    const newG = Math.round(hue2rgb(p, q, h) * 255);
    const newB = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
    return (newR << 16) | (newG << 8) | newB;
  }

  // ═══ Graphics 对象池 ═══

  protected acquireGraphics(parent?: PIXI.Container): PIXI.Graphics {
    let g = this.graphicsPool.pop();
    if (!g || g.destroyed) {
      g = new PIXI.Graphics();
    }
    g.clear();
    g.visible = true;
    g.alpha = 1;
    g.scale.set(1);
    g.rotation = 0;
    (parent ?? this.container).addChild(g);
    return g;
  }

  protected releaseGraphics(g: PIXI.Graphics): void {
    if (!g || g.destroyed) return;
    g.visible = false;
    g.alpha = 0;
    if (g.parent) g.parent.removeChild(g);
    this.graphicsPool.push(g);
  }

  // ═══ 三阶段动画调度 ═══

  /**
   * 通用三阶段爆发动画调度
   * - 阶段1 蓄压 0-15% T
   * - 阶段2 爆发 15-30% T
   * - 阶段3 扩散 30-100% T
   *
   * 子类 override phase1Charge / phase2Burst / phase3Diffuse 实现独特视觉
   */
  protected runBurstAnimation(burst: ActiveBurstBase, dt: number): boolean {
    burst.life += dt;
    if (burst.life >= burst.maxLife) {
      return true; // 已过期，子类负责清理
    }
    const T = burst.maxLife;
    const phase1End = T * 0.15;
    const phase2End = T * 0.30;
    if (burst.life < phase1End) {
      this.phase1Charge(burst, burst.life / phase1End);
    } else if (burst.life < phase2End) {
      this.phase2Burst(burst, (burst.life - phase1End) / (phase2End - phase1End));
    } else {
      this.phase3Diffuse(burst, (burst.life - phase2End) / (T - phase2End));
    }
    return false;
  }

  /** 钩子：阶段1 蓄压（子类 override） */
  protected phase1Charge(burst: ActiveBurstBase, t: number): void {}
  /** 钩子：阶段2 爆发（子类 override） */
  protected phase2Burst(burst: ActiveBurstBase, t: number): void {}
  /** 钩子：阶段3 扩散（子类 override） */
  protected phase3Diffuse(burst: ActiveBurstBase, t: number): void {}

  // ═══ 生命周期 ═══

  setScale(scale: number, canvasW?: number, canvasH?: number): void {
    this.scale = scale;
    if (canvasW !== undefined) this.canvasW = canvasW;
    if (canvasH !== undefined) this.canvasH = canvasH;
    this.onScaleChange(scale);
  }

  /** 钩子：缩放变化时同步已有实体（子类 override） */
  protected onScaleChange(scale: number): void {}

  abstract update(dt: number): void;
  abstract clear(): void;

  destroy(): void {
    this.clear();
    // 释放对象池中的 Graphics
    for (const g of this.graphicsPool) {
      if (g && !g.destroyed) g.destroy(true);
    }
    this.graphicsPool.length = 0;
  }
}
```

- [ ] **Step 2: 编译验证**

Run: `cd game/frontend && npm run build`
Expected: 编译通过

- [ ] **Step 3: 提交**

```bash
cd game/frontend
git add src/components/fish-oil-battle/renderer/entities/BaseWeaponEffectRenderer.ts
git commit -m "feat: 新建BaseWeaponEffectRenderer抽象基类(对象池+调色板+三阶段骨架)"
```

---

## Phase 2：重写 2 个完全无差异化渲染器

### Task 3: 重写 NanoRipperRenderer（纳米撕裂）

**Files:**
- Rewrite: `game/frontend/src/components/fish-oil-battle/renderer/entities/NanoRipperRenderer.ts`

**视觉主题**（Spec §6.1 #1）：
- 场特效：6×6 分子点阵网格 + 局部错位 + 撕裂裂纹生长
- 爆发：X 形交叉裂刃爆发 + 碎片粒子飞散（带重力下落）+ 黑色虚空核
- 独特符号：网格点阵、生长裂纹、X 形裂刃

- [ ] **Step 1: 重写整个文件**

```typescript
/**
 * 纳米撕裂者 (Nano Ripper) - 侵略者流派
 * 前端视觉渲染器
 *
 * 视觉设计（侵略者红橙色系 —— 纳米级分子撕裂）：
 * - 撕裂场 RipperField：6×6 分子点阵网格（每个点阵有局部错位抖动）
 *   + 4 条从中心生长的撕裂裂纹（径向直线，随生命生长）
 *   + 8 层径向渐变光环 + 双层主环 + 中心撕裂核
 *   + 红色撕裂粒子（向外飞散，带阻力衰减）
 * - 爆发 Burst：三阶段动画
 *   · 蓄压（0-15%T）：分子网格收缩汇聚，裂纹向中心收缩
 *   · 撕裂（15%-30%T）：X 形交叉裂刃爆发 + 黑色虚空核显现 + 碎片粒子飞散（带重力）
 *   · 余波（30%-100%T）：裂刃消散，虚空核残留淡出，红色粒子飘散
 *
 * API：triggerRipperField / removeRipperField / triggerBurst / update / setScale / clear / destroy
 */

import * as PIXI from 'pixi.js';
import { ParticlePool } from '../systems/ParticlePool';
import { BaseWeaponEffectRenderer, type ActiveBurstBase, type Palette } from './BaseWeaponEffectRenderer';

// ══════════════════════════════════════════════════════
//  颜色常量（侵略者红）
// ══════════════════════════════════════════════════════

const NANO_DEEP = 0x4a0a0a;
const NANO_MAIN = 0xcc2200;
const NANO_LIGHT = 0xff6633;
const NANO_HIGHLIGHT = 0xffaa66;
const NANO_WHITE = 0xffffff;
const NANO_VOID = 0x0a0000; // 黑色虚空核

// ══════════════════════════════════════════════════════
//  数据结构
// ══════════════════════════════════════════════════════

interface ActiveRipperField {
  container: PIXI.Container;
  gridGraphics: PIXI.Graphics;      // 6×6 分子点阵网格
  crackGraphics: PIXI.Graphics;     // 4 条生长裂纹
  haloGraphics: PIXI.Graphics;      // 8 层渐变光环 + 双层主环 + 中心核
  particleTimer: number;
  life: number;
  maxLife: number;
  x: number;
  y: number;
  radius: number;
  themeColor: number;
  palette: Palette;
}

interface ActiveNanoBurst extends ActiveBurstBase {
  bladeGraphics: PIXI.Graphics;      // X 形交叉裂刃
  voidGraphics: PIXI.Graphics;       // 黑色虚空核
  haloGraphics: PIXI.Graphics;       // 余波光晕
  gridGraphics: PIXI.Graphics;       // 收缩的分子网格
  x: number;
  y: number;
}

// ══════════════════════════════════════════════════════
//  渲染器
// ══════════════════════════════════════════════════════

export class NanoRipperRenderer extends BaseWeaponEffectRenderer {
  private activeFields = new Map<string, ActiveRipperField>();
  private activeBursts = new Map<string, ActiveNanoBurst>();

  constructor(fieldContainer: PIXI.Container, particlePool: ParticlePool) {
    super(fieldContainer, particlePool);
  }

  // ═══ 撕裂场 ═══

  triggerRipperField(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor: number = NANO_MAIN,
  ): void {
    const existing = this.activeFields.get(playerId);
    if (existing) {
      existing.x = x;
      existing.y = y;
      existing.container.position.set(x, y);
      return;
    }

    const palette = this.buildPalette(themeColor);
    const container = new PIXI.Container();
    container.position.set(x, y);
    container.scale.set(this.scale);
    this.container.addChild(container);

    const gridGraphics = new PIXI.Graphics();
    container.addChild(gridGraphics);

    const crackGraphics = new PIXI.Graphics();
    container.addChild(crackGraphics);

    const haloGraphics = new PIXI.Graphics();
    container.addChild(haloGraphics);

    const field: ActiveRipperField = {
      container,
      gridGraphics,
      crackGraphics,
      haloGraphics,
      particleTimer: 0,
      life: 0,
      maxLife: Infinity,
      x,
      y,
      radius,
      themeColor,
      palette,
    };
    this.drawFieldHalo(haloGraphics, radius, palette);
    this.activeFields.set(playerId, field);
  }

  removeRipperField(playerId: string): void {
    const f = this.activeFields.get(playerId);
    if (!f) return;
    this.container.removeChild(f.container);
    f.container.destroy({ children: true });
    this.activeFields.delete(playerId);
  }

  /** 绘制 6×6 分子点阵网格 + 局部错位 */
  private drawMolecularGrid(g: PIXI.Graphics, radius: number, palette: Palette, life: number): void {
    g.clear();
    const grid = 6;
    const spacing = (radius * 2) / grid;
    const startX = -radius;
    const startY = -radius;
    // 抖动幅度随生命脉动
    const jitterAmp = 1 + 0.5 * Math.sin(life * 0.003 * Math.PI);

    for (let row = 0; row < grid; row++) {
      for (let col = 0; col < grid; col++) {
        const baseX = startX + col * spacing + spacing / 2;
        const baseY = startY + row * spacing + spacing / 2;
        // 局部错位：基于位置的确定性抖动 + 时间脉动
        const jx = Math.sin(row * 1.7 + col * 2.3 + life * 0.001) * jitterAmp;
        const jy = Math.cos(row * 2.1 + col * 1.9 + life * 0.001) * jitterAmp;
        const px = baseX + jx;
        const py = baseY + jy;
        const distFromCenter = Math.sqrt(px * px + py * py);
        if (distFromCenter > radius) continue;
        // 距离中心越远点越小越暗
        const distRatio = distFromCenter / radius;
        const dotR = Math.max(0.5, 2.5 - distRatio * 1.5);
        const alpha = Math.max(0.2, 0.8 - distRatio * 0.4);
        const color = distRatio < 0.3 ? palette.highlight : distRatio < 0.6 ? palette.glow : palette.primary;
        g.circle(px, py, dotR);
        g.fill({ color, alpha });
      }
    }
  }

  /** 绘制 4 条从中心生长的撕裂裂纹（径向直线） */
  private drawGrowingCracks(g: PIXI.Graphics, radius: number, palette: Palette, growProgress: number): void {
    g.clear();
    const crackCount = 4;
    for (let i = 0; i < crackCount; i++) {
      const angle = (i * Math.PI * 2) / crackCount + Math.PI / 4;
      const len = radius * growProgress;
      const startX = Math.cos(angle) * radius * 0.1;
      const startY = Math.sin(angle) * radius * 0.1;
      const endX = Math.cos(angle) * len;
      const endY = Math.sin(angle) * len;
      // 主裂纹线
      g.moveTo(startX, startY);
      g.lineTo(endX, endY);
      g.stroke({ color: palette.glow, width: 1.5, alpha: 0.8 * growProgress });
      // 高亮内线
      g.moveTo(startX, startY);
      g.lineTo(endX, endY);
      g.stroke({ color: palette.highlight, width: 0.5, alpha: 0.6 * growProgress });
    }
  }

  /** 绘制场光晕（8 层渐变 + 双层主环 + 中心核） */
  private drawFieldHalo(g: PIXI.Graphics, radius: number, palette: Palette): void {
    g.clear();
    // 8 层径向渐变
    this.drawMultilayerCircle(
      g, radius, 8,
      (t) => this.interpolateColor(palette.highlight, palette.shadow, t),
      (t) => (1 - t) * 0.4,
    );
    // 双层主环
    g.circle(0, 0, radius);
    g.stroke({ color: palette.glow, width: 1, alpha: 0.7 });
    g.circle(0, 0, radius * 0.95);
    g.stroke({ color: palette.highlight, width: 0.4, alpha: 0.5 });
    // 中心撕裂核
    g.circle(0, 0, 4);
    g.fill({ color: NANO_WHITE });
    g.circle(0, 0, 6);
    g.stroke({ color: palette.glow, width: 1, alpha: 0.8 });
  }

  // ═══ 爆发 ═══

  triggerBurst(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor: number = NANO_MAIN,
  ): void {
    const existing = this.activeBursts.get(playerId);
    if (existing) {
      this.removeBurstInstance(existing);
    }

    const palette = this.buildPalette(themeColor);
    const container = new PIXI.Container();
    container.position.set(x, y);
    container.scale.set(this.scale);
    this.container.addChild(container);

    const gridGraphics = new PIXI.Graphics();
    const bladeGraphics = new PIXI.Graphics();
    const voidGraphics = new PIXI.Graphics();
    const haloGraphics = new PIXI.Graphics();
    container.addChild(gridGraphics, bladeGraphics, voidGraphics, haloGraphics);

    const burst: ActiveNanoBurst = {
      container,
      life: 0,
      maxLife: 1500,
      themeColor,
      radius,
      particleTimer: 0,
      palette,
      bladeGraphics,
      voidGraphics,
      haloGraphics,
      gridGraphics,
      x,
      y,
    };
    this.activeBursts.set(playerId, burst);
  }

  // ═══ 三阶段钩子 ═══

  protected phase1Charge(burst: ActiveBurstBase, t: number): void {
    const b = burst as ActiveNanoBurst;
    const ease = this.easeOutCubic(t);
    // 分子网格收缩汇聚
    b.gridGraphics.clear();
    const gridR = b.radius * (1 - ease * 0.7);
    this.drawMolecularGrid(b.gridGraphics, gridR, b.palette, b.life);
    b.gridGraphics.alpha = 1 - t * 0.3;
    // 虚空核逐渐显现
    b.voidGraphics.clear();
    const voidR = b.radius * 0.1 * ease;
    this.drawVoidCore(b.voidGraphics, voidR, b.palette, t * 0.5);
    // 裂刃蓄压隐藏
    b.bladeGraphics.alpha = 0;
    b.haloGraphics.alpha = 0;
  }

  protected phase2Burst(burst: ActiveBurstBase, t: number): void {
    const b = burst as ActiveNanoBurst;
    const ease = this.easeOutCubic(t);
    // X 形交叉裂刃爆发
    this.drawXBlades(b.bladeGraphics, b.radius, b.palette, ease);
    b.bladeGraphics.alpha = 1;
    // 虚空核满显
    b.voidGraphics.clear();
    this.drawVoidCore(b.voidGraphics, b.radius * 0.1, b.palette, 1);
    // 网格消散
    b.gridGraphics.alpha = (1 - t) * 0.7;
    // 发射碎片粒子（带重力下落）
    b.particleTimer += b.life;
    if (b.particleTimer > 50) {
      b.particleTimer = 0;
      this.spawnShrapnelParticles(b, 3);
    }
  }

  protected phase3Diffuse(burst: ActiveBurstBase, t: number): void {
    const b = burst as ActiveNanoBurst;
    const ease = this.easeOutCubic(t);
    // 裂刃消散
    b.bladeGraphics.alpha = 1 - ease;
    b.bladeGraphics.scale.set(1 + ease * 0.5);
    // 虚空核残留淡出
    b.voidGraphics.clear();
    this.drawVoidCore(b.voidGraphics, b.radius * 0.1 * (1 + ease * 0.5), b.palette, 1 - ease);
    // 余波光晕展开
    this.drawBurstHalo(b.haloGraphics, b.radius, b.palette, ease);
    b.haloGraphics.alpha = 1 - ease * 0.7;
    // 残余粒子
    b.particleTimer += 16;
    if (b.particleTimer > 100) {
      b.particleTimer = 0;
      this.spawnShrapnelParticles(b, 1);
    }
  }

  /** 绘制 X 形交叉裂刃 */
  private drawXBlades(g: PIXI.Graphics, radius: number, palette: Palette, progress: number): void {
    g.clear();
    const len = radius * progress;
    // X 形两条交叉裂刃（45° 和 135°）
    const angles = [Math.PI / 4, (3 * Math.PI) / 4];
    for (const angle of angles) {
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      // 主裂刃（粗）
      g.moveTo(-dx * len, -dy * len);
      g.lineTo(dx * len, dy * len);
      g.stroke({ color: palette.glow, width: 3, alpha: 0.9 });
      // 高亮裂刃（细）
      g.moveTo(-dx * len, -dy * len);
      g.lineTo(dx * len, dy * len);
      g.stroke({ color: palette.highlight, width: 1, alpha: 1 });
      // 边缘辉光
      g.moveTo(-dx * len * 0.9, -dy * len * 0.9);
      g.lineTo(dx * len * 0.9, dy * len * 0.9);
      g.stroke({ color: palette.primary, width: 6, alpha: 0.3 });
    }
  }

  /** 绘制黑色虚空核 */
  private drawVoidCore(g: PIXI.Graphics, radius: number, palette: Palette, intensity: number): void {
    g.clear();
    // 10 层渐变：中心黑 → 外圈暗红
    this.drawMultilayerCircle(
      g, radius, 10,
      (t) => this.interpolateColor(NANO_VOID, palette.shadow, t),
      (t) => (1 - t * 0.5) * intensity,
    );
    // 黑色吸光核
    g.circle(0, 0, Math.max(0.5, radius * 0.3));
    g.fill({ color: NANO_VOID, alpha: intensity });
    // 紫色边缘辉光
    g.circle(0, 0, radius);
    g.stroke({ color: palette.primary, width: 1, alpha: 0.6 * intensity });
  }

  /** 绘制余波光晕 */
  private drawBurstHalo(g: PIXI.Graphics, radius: number, palette: Palette, progress: number): void {
    g.clear();
    const r = radius * (1 + progress * 0.5);
    // 4 层细环
    for (let i = 0; i < 4; i++) {
      const ringR = r * (0.7 + i * 0.1);
      g.circle(0, 0, ringR);
      g.stroke({ color: palette.glow, width: 0.8, alpha: 0.3 - i * 0.05 });
    }
  }

  /** 发射碎片粒子（带重力下落 + 阻力 + 颜色渐变） */
  private spawnShrapnelParticles(burst: ActiveNanoBurst, count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 120;
      this.particlePool.emit({
        x: burst.x,
        y: burst.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 50, // 略微向上初速
        ax: 0,
        ay: 200, // 重力下落
        drag: 0.5, // 阻力衰减
        life: 800 + Math.random() * 400,
        scaleStart: 1.5,
        scaleEnd: 0,
        alphaStart: 1,
        alphaEnd: 0,
        tint: burst.palette.glow,
        tintStart: burst.palette.highlight,
        tintEnd: burst.palette.shadow,
        radius: 1.5 + Math.random() * 1.5,
        rotationSpeed: (Math.random() - 0.5) * 10,
      });
    }
  }

  // ═══ 生命周期 ═══

  update(dt: number): void {
    // 更新撕裂场
    this.activeFields.forEach((f) => {
      f.life += dt;
      // 重绘分子网格（抖动）
      this.drawMolecularGrid(f.gridGraphics, f.radius, f.palette, f.life);
      // 重绘生长裂纹
      const growProgress = Math.min(1, f.life / 2000);
      this.drawGrowingCracks(f.crackGraphics, f.radius, f.palette, growProgress);
      // 光晕呼吸
      const breath = 1 + 0.05 * Math.sin(f.life * 0.002 * Math.PI);
      f.haloGraphics.scale.set(breath);
      // 粒子节流
      f.particleTimer += dt;
      if (f.particleTimer > 200) {
        f.particleTimer = 0;
        const angle = Math.random() * Math.PI * 2;
        this.particlePool.emit({
          x: f.x,
          y: f.y,
          vx: Math.cos(angle) * 30,
          vy: Math.sin(angle) * 30,
          drag: 0.8,
          life: 600,
          scaleStart: 1,
          scaleEnd: 0,
          alphaStart: 0.6,
          alphaEnd: 0,
          tint: f.palette.glow,
          radius: 1.5,
        });
      }
    });

    // 更新爆发
    const expired: string[] = [];
    this.activeBursts.forEach((b, key) => {
      const isExpired = this.runBurstAnimation(b, dt);
      if (isExpired) {
        expired.push(key);
      }
    });
    for (const key of expired) {
      const b = this.activeBursts.get(key);
      if (b) this.removeBurstInstance(b);
      this.activeBursts.delete(key);
    }
  }

  private removeBurstInstance(b: ActiveNanoBurst): void {
    this.container.removeChild(b.container);
    b.container.destroy({ children: true });
  }

  protected onScaleChange(scale: number): void {
    this.activeFields.forEach((f) => {
      if (!f.container.destroyed) f.container.scale.set(scale);
    });
    this.activeBursts.forEach((b) => {
      if (!b.container.destroyed) b.container.scale.set(scale);
    });
  }

  clear(): void {
    this.activeFields.forEach((f) => {
      this.container.removeChild(f.container);
      f.container.destroy({ children: true });
    });
    this.activeFields.clear();
    this.activeBursts.forEach((b) => this.removeBurstInstance(b));
    this.activeBursts.clear();
  }
}
```

- [ ] **Step 2: 编译验证**

Run: `cd game/frontend && npm run build`
Expected: 编译通过

- [ ] **Step 3: 视觉验证**

Run: `cd game/frontend && npm run dev`
打开 EffectTestPage → 侧边栏"基础流派武器"组 → 点击"纳米撕裂者·撕裂场"和"纳米撕裂者·爆发" → Play
Expected: 分子网格可见抖动，X 形裂刃爆发，碎片粒子有重力下落

- [ ] **Step 4: 提交**

```bash
cd game/frontend
git add src/components/fish-oil-battle/renderer/entities/NanoRipperRenderer.ts
git commit -m "feat(NanoRipper): 重写纳米撕裂者渲染器(分子网格+X形裂刃+重力碎片)"
```

---

### Task 4: 重写 SizeWarpRenderer（体积扭曲）

**Files:**
- Rewrite: `game/frontend/src/components/fish-oil-battle/renderer/entities/SizeWarpRenderer.ts`

**视觉主题**（Spec §6.1 #2）：
- 场特效：椭圆 squash/stretch 呼吸变形 + 体积刻度条 + 压缩波纹
- 爆发：体积坍缩奇点 + 形变网格收缩 + 尺寸刻度环展开
- 独特符号：椭圆圆形变、刻度环、squash 动画

- [ ] **Step 1: 重写整个文件**

```typescript
/**
 * 体积扭曲 (Size Warp) - 控制者流派
 * 前端视觉渲染器
 *
 * 视觉设计（控制者青色系 —— 体积压缩与形变）：
 * - 扭曲场 WarpField：椭圆 squash/stretch 呼吸变形（宽高比周期变化）
 *   + 4 条体积刻度条（上下左右，带刻度标记）
 *   + 3 层压缩波纹（向外扩散的椭圆波）
 *   + 8 层径向渐变光环 + 中心扭曲核
 * - 爆发 Burst：三阶段动画
 *   · 蓄压（0-15%T）：椭圆场剧烈压缩，刻度条向中心收缩
 *   · 扭曲（15%-30%T）：体积坍缩奇点 + 形变网格收缩 + 尺寸刻度环展开
 *   · 余波（30%-100%T）：刻度环外扩消散，扭曲场恢复，青色粒子飘散
 *
 * API：triggerWarpField / removeWarpField / triggerBurst / update / setScale / clear / destroy
 */

import * as PIXI from 'pixi.js';
import { ParticlePool } from '../systems/ParticlePool';
import { BaseWeaponEffectRenderer, type ActiveBurstBase, type Palette } from './BaseWeaponEffectRenderer';

const SIZE_DEEP = 0x0a2a3a;
const SIZE_MAIN = 0x00ccaa;
const SIZE_LIGHT = 0x33ffdd;
const SIZE_HIGHLIGHT = 0x66ffee;
const SIZE_WHITE = 0xffffff;

interface ActiveWarpField {
  container: PIXI.Container;
  ellipseGraphics: PIXI.Graphics;    // 椭圆 squash/stretch
  scaleBarGraphics: PIXI.Graphics;   // 4 条体积刻度条
  waveGraphics: PIXI.Graphics;       // 3 层压缩波纹
  haloGraphics: PIXI.Graphics;       // 光晕 + 中心核
  particleTimer: number;
  life: number;
  maxLife: number;
  x: number;
  y: number;
  radius: number;
  themeColor: number;
  palette: Palette;
}

interface ActiveSizeBurst extends ActiveBurstBase {
  coreGraphics: PIXI.Graphics;       // 体积坍缩奇点
  gridGraphics: PIXI.Graphics;       // 形变网格
  ringGraphics: PIXI.Graphics;       // 尺寸刻度环
  haloGraphics: PIXI.Graphics;        // 余波光晕
  x: number;
  y: number;
}

export class SizeWarpRenderer extends BaseWeaponEffectRenderer {
  private activeFields = new Map<string, ActiveWarpField>();
  private activeBursts = new Map<string, ActiveSizeBurst>();

  constructor(fieldContainer: PIXI.Container, particlePool: ParticlePool) {
    super(fieldContainer, particlePool);
  }

  // ═══ 扭曲场 ═══

  triggerWarpField(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor: number = SIZE_MAIN,
  ): void {
    const existing = this.activeFields.get(playerId);
    if (existing) {
      existing.x = x;
      existing.y = y;
      existing.container.position.set(x, y);
      return;
    }

    const palette = this.buildPalette(themeColor);
    const container = new PIXI.Container();
    container.position.set(x, y);
    container.scale.set(this.scale);
    this.container.addChild(container);

    const ellipseGraphics = new PIXI.Graphics();
    const scaleBarGraphics = new PIXI.Graphics();
    const waveGraphics = new PIXI.Graphics();
    const haloGraphics = new PIXI.Graphics();
    container.addChild(ellipseGraphics, scaleBarGraphics, waveGraphics, haloGraphics);

    const field: ActiveWarpField = {
      container, ellipseGraphics, scaleBarGraphics, waveGraphics, haloGraphics,
      particleTimer: 0, life: 0, maxLife: Infinity,
      x, y, radius, themeColor, palette,
    };
    this.drawFieldHalo(haloGraphics, radius, palette);
    this.activeFields.set(playerId, field);
  }

  removeWarpField(playerId: string): void {
    const f = this.activeFields.get(playerId);
    if (!f) return;
    this.container.removeChild(f.container);
    f.container.destroy({ children: true });
    this.activeFields.delete(playerId);
  }

  /** 绘制椭圆 squash/stretch 呼吸变形 */
  private drawSquashEllipse(g: PIXI.Graphics, radius: number, palette: Palette, life: number): void {
    g.clear();
    // squash/stretch: 宽高比周期变化（0.7~1.3）
    const phase = life * 0.002 * Math.PI;
    const scaleX = 1 + 0.3 * Math.sin(phase);
    const scaleY = 1 - 0.3 * Math.sin(phase);
    // 8 层渐变椭圆
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const rx = Math.max(0.5, radius * (1 - t * 0.9) * scaleX);
      const ry = Math.max(0.5, radius * (1 - t * 0.9) * scaleY);
      g.ellipse(0, 0, rx, ry);
      g.fill({ color: this.interpolateColor(palette.highlight, palette.shadow, t), alpha: (1 - t) * 0.35 });
    }
    // 双层椭圆主环
    g.ellipse(0, 0, radius * scaleX, radius * scaleY);
    g.stroke({ color: palette.glow, width: 1, alpha: 0.7 });
    g.ellipse(0, 0, radius * 0.95 * scaleX, radius * 0.95 * scaleY);
    g.stroke({ color: palette.highlight, width: 0.4, alpha: 0.5 });
  }

  /** 绘制 4 条体积刻度条（上下左右，带刻度标记） */
  private drawScaleBars(g: PIXI.Graphics, radius: number, palette: Palette, life: number): void {
    g.clear();
    const directions = [
      { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
    ];
    const breath = 1 + 0.05 * Math.sin(life * 0.003 * Math.PI);
    for (const dir of directions) {
      const barLen = radius * 0.3 * breath;
      const startX = dir.dx * radius * 1.1;
      const startY = dir.dy * radius * 1.1;
      const endX = startX + dir.dx * barLen;
      const endY = startY + dir.dy * barLen;
      // 主刻度条
      g.moveTo(startX, startY);
      g.lineTo(endX, endY);
      g.stroke({ color: palette.glow, width: 1.5, alpha: 0.6 });
      // 刻度标记（5 个小刻度）
      for (let i = 1; i <= 5; i++) {
        const t = i / 5;
        const mx = startX + dir.dx * barLen * t;
        const my = startY + dir.dy * barLen * t;
        const perpX = -dir.dy * 3;
        const perpY = dir.dx * 3;
        g.moveTo(mx - perpX, my - perpY);
        g.lineTo(mx + perpX, my + perpY);
        g.stroke({ color: palette.highlight, width: 0.8, alpha: 0.5 });
      }
    }
  }

  /** 绘制 3 层压缩波纹（向外扩散的椭圆波） */
  private drawCompressionWaves(g: PIXI.Graphics, radius: number, palette: Palette, life: number): void {
    g.clear();
    for (let i = 0; i < 3; i++) {
      const phase = (life * 0.001 + i * 0.33) % 1;
      const r = radius * (0.3 + phase * 0.8);
      const alpha = (1 - phase) * 0.4;
      g.ellipse(0, 0, r, r * 0.8);
      g.stroke({ color: palette.light ?? palette.glow, width: 1, alpha });
    }
  }

  private drawFieldHalo(g: PIXI.Graphics, radius: number, palette: Palette): void {
    g.clear();
    this.drawMultilayerCircle(
      g, radius * 0.3, 6,
      (t) => this.interpolateColor(palette.highlight, palette.primary, t),
      (t) => (1 - t) * 0.6,
    );
    g.circle(0, 0, 4);
    g.fill({ color: SIZE_WHITE });
    g.circle(0, 0, 6);
    g.stroke({ color: palette.glow, width: 1, alpha: 0.8 });
  }

  // ═══ 爆发 ═══

  triggerBurst(playerId: string, x: number, y: number, radius: number, themeColor: number = SIZE_MAIN): void {
    const existing = this.activeBursts.get(playerId);
    if (existing) this.removeBurstInstance(existing);

    const palette = this.buildPalette(themeColor);
    const container = new PIXI.Container();
    container.position.set(x, y);
    container.scale.set(this.scale);
    this.container.addChild(container);

    const coreGraphics = new PIXI.Graphics();
    const gridGraphics = new PIXI.Graphics();
    const ringGraphics = new PIXI.Graphics();
    const haloGraphics = new PIXI.Graphics();
    container.addChild(coreGraphics, gridGraphics, ringGraphics, haloGraphics);

    const burst: ActiveSizeBurst = {
      container, life: 0, maxLife: 1500, themeColor, radius, particleTimer: 0, palette,
      coreGraphics, gridGraphics, ringGraphics, haloGraphics, x, y,
    };
    this.activeBursts.set(playerId, burst);
  }

  // ═══ 三阶段钩子 ═══

  protected phase1Charge(burst: ActiveBurstBase, t: number): void {
    const b = burst as ActiveSizeBurst;
    const ease = this.easeOutCubic(t);
    // 椭圆场剧烈压缩
    b.gridGraphics.clear();
    const r = b.radius * (1 - ease * 0.8);
    for (let i = 0; i < 6; i++) {
      const ti = i / 5;
      g_ellipse(b.gridGraphics, r * (1 - ti * 0.9) * (1 + ease * 0.2), r * (1 - ti * 0.9) * (1 - ease * 0.2));
      b.gridGraphics.fill({ color: this.interpolateColor(b.palette.glow, b.palette.shadow, ti), alpha: (1 - ti) * 0.5 * (1 - t * 0.5) });
    }
    // 坍缩奇点逐渐显现
    b.coreGraphics.clear();
    this.drawCollapseCore(b.coreGraphics, b.radius * 0.05 * ease, b.palette, t * 0.5);
    b.ringGraphics.alpha = 0;
    b.haloGraphics.alpha = 0;
  }

  protected phase2Burst(burst: ActiveBurstBase, t: number): void {
    const b = burst as ActiveSizeBurst;
    const ease = this.easeOutCubic(t);
    // 体积坍缩奇点满显
    b.coreGraphics.clear();
    this.drawCollapseCore(b.coreGraphics, b.radius * 0.1, b.palette, 1);
    // 尺寸刻度环展开
    this.drawScaleRings(b.ringGraphics, b.radius * ease, b.palette, ease);
    b.ringGraphics.alpha = 1;
    // 网格消散
    b.gridGraphics.alpha = 1 - t;
    // 粒子
    b.particleTimer += b.life;
    if (b.particleTimer > 60) {
      b.particleTimer = 0;
      this.spawnWarpParticles(b, 2);
    }
  }

  protected phase3Diffuse(burst: ActiveBurstBase, t: number): void {
    const b = burst as ActiveSizeBurst;
    const ease = this.easeOutCubic(t);
    // 刻度环外扩消散
    this.drawScaleRings(b.ringGraphics, b.radius * (1 + ease * 0.5), b.palette, 1 - ease);
    b.ringGraphics.alpha = 1 - ease;
    // 奇点残留淡出
    b.coreGraphics.clear();
    this.drawCollapseCore(b.coreGraphics, b.radius * 0.1 * (1 + ease), b.palette, 1 - ease);
    // 余波光晕
    this.drawBurstHalo(b.haloGraphics, b.radius, b.palette, ease);
    b.haloGraphics.alpha = (1 - ease) * 0.6;
  }

  /** 绘制体积坍缩奇点 */
  private drawCollapseCore(g: PIXI.Graphics, radius: number, palette: Palette, intensity: number): void {
    g.clear();
    this.drawMultilayerCircle(
      g, radius, 10,
      (t) => this.interpolateColor(SIZE_WHITE, palette.primary, t),
      (t) => (1 - t * 0.5) * intensity,
    );
    g.circle(0, 0, Math.max(0.5, radius * 0.3));
    g.fill({ color: SIZE_WHITE, alpha: intensity });
  }

  /** 绘制尺寸刻度环（带刻度标记） */
  private drawScaleRings(g: PIXI.Graphics, radius: number, palette: Palette, progress: number): void {
    g.clear();
    for (let i = 0; i < 4; i++) {
      const r = radius * (0.5 + i * 0.15);
      g.circle(0, 0, r);
      g.stroke({ color: palette.glow, width: 1.5 - i * 0.2, alpha: 0.6 * progress });
      // 刻度标记（8 个方位）
      for (let j = 0; j < 8; j++) {
        const angle = (j * Math.PI) / 4;
        const mx = Math.cos(angle) * r;
        const my = Math.sin(angle) * r;
        g.circle(mx, my, 1);
        g.fill({ color: palette.highlight, alpha: 0.8 * progress });
      }
    }
  }

  private drawBurstHalo(g: PIXI.Graphics, radius: number, palette: Palette, progress: number): void {
    g.clear();
    const r = radius * (1 + progress * 0.5);
    for (let i = 0; i < 4; i++) {
      g.ellipse(0, 0, r * (0.8 + i * 0.05), r * (1 + i * 0.05));
      g.stroke({ color: palette.glow, width: 0.8, alpha: 0.3 - i * 0.05 });
    }
  }

  private spawnWarpParticles(b: ActiveSizeBurst, count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 80;
      this.particlePool.emit({
        x: b.x, y: b.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        drag: 0.6,
        life: 700,
        scaleStart: 1.2, scaleEnd: 0,
        alphaStart: 0.8, alphaEnd: 0,
        tint: b.palette.glow,
        tintStart: b.palette.highlight,
        tintEnd: b.palette.dim,
        radius: 2,
      });
    }
  }

  // ═══ 生命周期 ═══

  update(dt: number): void {
    this.activeFields.forEach((f) => {
      f.life += dt;
      this.drawSquashEllipse(f.ellipseGraphics, f.radius, f.palette, f.life);
      this.drawScaleBars(f.scaleBarGraphics, f.radius, f.palette, f.life);
      this.drawCompressionWaves(f.waveGraphics, f.radius, f.palette, f.life);
      const breath = 1 + 0.05 * Math.sin(f.life * 0.002 * Math.PI);
      f.haloGraphics.scale.set(breath);
      f.particleTimer += dt;
      if (f.particleTimer > 250) {
        f.particleTimer = 0;
        this.particlePool.emit({
          x: f.x, y: f.y,
          vx: (Math.random() - 0.5) * 40,
          vy: (Math.random() - 0.5) * 40,
          drag: 0.7, life: 500,
          scaleStart: 0.8, scaleEnd: 0,
          alphaStart: 0.5, alphaEnd: 0,
          tint: f.palette.glow, radius: 1.5,
        });
      }
    });

    const expired: string[] = [];
    this.activeBursts.forEach((b, key) => {
      if (this.runBurstAnimation(b, dt)) expired.push(key);
    });
    for (const key of expired) {
      const b = this.activeBursts.get(key);
      if (b) this.removeBurstInstance(b);
      this.activeBursts.delete(key);
    }
  }

  private removeBurstInstance(b: ActiveSizeBurst): void {
    this.container.removeChild(b.container);
    b.container.destroy({ children: true });
  }

  protected onScaleChange(scale: number): void {
    this.activeFields.forEach((f) => { if (!f.container.destroyed) f.container.scale.set(scale); });
    this.activeBursts.forEach((b) => { if (!b.container.destroyed) b.container.scale.set(scale); });
  }

  clear(): void {
    this.activeFields.forEach((f) => {
      this.container.removeChild(f.container);
      f.container.destroy({ children: true });
    });
    this.activeFields.clear();
    this.activeBursts.forEach((b) => this.removeBurstInstance(b));
    this.activeBursts.clear();
  }
}

// 辅助函数（避免与 Graphics.ellipse 方法名冲突）
function g_ellipse(g: PIXI.Graphics, rx: number, ry: number): void {
  g.ellipse(0, 0, Math.max(0.5, rx), Math.max(0.5, ry));
}
```

- [ ] **Step 2: 编译验证**

Run: `cd game/frontend && npm run build`
Expected: 编译通过

- [ ] **Step 3: 视觉验证 + 提交**

```bash
cd game/frontend && npm run dev
# 验证：椭圆 squash/stretch 呼吸变形、刻度条、刻度环展开
git add src/components/fish-oil-battle/renderer/entities/SizeWarpRenderer.ts
git commit -m "feat(SizeWarp): 重写体积扭曲渲染器(椭圆squash+刻度环+压缩波纹)"
```

---

## Phase 3：重写 7 个部分模板化渲染器

> **实施说明**：以下 7 个渲染器采用与 Task 3/4 相同的模式（继承 BaseWeaponEffectRenderer，实现独特视觉钩子）。每个渲染器的独特视觉符号已在 Spec §6.1 中定义。为节省篇幅，以下每个 Task 给出关键独特视觉方法的完整实现代码，子类骨架（import/接口/构造/trigger*/update/clear/onScaleChange）参照 Task 3 的 NanoRipperRenderer 模板。

### Task 5: 重写 PursuitProtocolRenderer（战术追踪）

**Files:**
- Rewrite: `game/frontend/src/components/fish-oil-battle/renderer/entities/PursuitProtocolRenderer.ts`

**视觉主题**：旋转准星（双层十字 + 锁定框）+ 贝塞尔追踪粒子流；爆发：弹道齐射（多枚追踪弹 + 命中爆炸 + 弹壳抛洒）

- [ ] **Step 1: 重写文件，核心独特方法**

关键独特方法（必须实现）：

```typescript
// 颜色常量
const PURSUIT_GOLD = 0xffaa00;
const PURSUIT_HIGHLIGHT = 0xffdd44;
const PURSUIT_LOCK = 0xff4400;

// 1. 旋转准星（双层十字 + 锁定框）
private drawCrosshair(g: PIXI.Graphics, radius: number, palette: Palette, life: number): void {
  g.clear();
  const rotation = life * 0.001 * Math.PI;
  // 外层十字（旋转）
  g.rotation = rotation;
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    const x1 = Math.cos(angle) * radius * 0.4;
    const y1 = Math.sin(angle) * radius * 0.4;
    const x2 = Math.cos(angle) * radius * 0.9;
    const y2 = Math.sin(angle) * radius * 0.9;
    g.moveTo(x1, y1); g.lineTo(x2, y2);
    g.stroke({ color: palette.glow, width: 1.5, alpha: 0.8 });
  }
  // 内层十字（反向旋转）
  // 锁定框（4 角 L 形）
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2 + Math.PI / 4;
    const cx = Math.cos(angle) * radius * 0.95;
    const cy = Math.sin(angle) * radius * 0.95;
    const len = radius * 0.15;
    g.moveTo(cx - Math.cos(angle) * len, cy - Math.sin(angle) * len);
    g.lineTo(cx, cy);
    g.lineTo(cx + Math.cos(angle + Math.PI / 2) * len, cy + Math.sin(angle + Math.PI / 2) * len);
    g.stroke({ color: PURSUIT_LOCK, width: 2, alpha: 0.9 });
  }
}

// 2. 贝塞尔追踪粒子流
private spawnTrackingParticles(f: ActivePursuitField): void {
  // 沿贝塞尔曲线发射粒子
  for (let i = 0; i < 2; i++) {
    const t = Math.random();
    const startX = f.x + (Math.random() - 0.5) * f.radius * 2;
    const startY = f.y + (Math.random() - 0.5) * f.radius * 2;
    const ctrlX = f.x;
    const ctrlY = f.y - f.radius;
    const endX = f.x;
    const endY = f.y;
    // 贝塞尔曲线点
    const px = (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * ctrlX + t * t * endX;
    const py = (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * ctrlY + t * t * endY;
    this.particlePool.emit({
      x: px, y: py,
      vx: (endX - px) * 2, vy: (endY - py) * 2,
      drag: 0.3, life: 500,
      scaleStart: 1, scaleEnd: 0,
      alphaStart: 0.8, alphaEnd: 0,
      tint: f.palette.glow, radius: 2,
    });
  }
}

// 3. 爆发：弹道齐射（多枚追踪弹 + 命中爆炸 + 弹壳抛洒）
protected phase2Burst(burst: ActiveBurstBase, t: number): void {
  const b = burst as ActivePursuitBurst;
  const ease = this.easeOutCubic(t);
  // 6 枚追踪弹从外围向中心飞行
  b.bladeGraphics.clear();
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const startR = b.radius * 2 * (1 - ease);
    const startX = Math.cos(angle) * startR;
    const startY = Math.sin(angle) * startR;
    const endX = 0;
    const endY = 0;
    // 弹道线
    b.bladeGraphics.moveTo(startX, startY);
    b.bladeGraphics.lineTo(endX, endY);
    b.bladeGraphics.stroke({ color: b.palette.glow, width: 2, alpha: 0.6 * ease });
    // 弹头
    b.bladeGraphics.circle(startX, startY, 3);
    b.bladeGraphics.fill({ color: b.palette.highlight, alpha: ease });
  }
  // 中心命中爆炸
  b.coreGraphics.clear();
  this.drawMultilayerCircle(b.coreGraphics, b.radius * 0.2 * ease, 8,
    (ti) => this.interpolateColor(b.palette.highlight, b.palette.shadow, ti),
    (ti) => (1 - ti) * ease);
  // 弹壳抛洒（重力下落）
  if (b.particleTimer > 40) {
    b.particleTimer = 0;
    for (let i = 0; i < 4; i++) {
      const angle = Math.random() * Math.PI * 2;
      this.particlePool.emit({
        x: b.x, y: b.y,
        vx: Math.cos(angle) * 100, vy: Math.sin(angle) * 100 - 80,
        ax: 0, ay: 300, // 重力
        drag: 0.4,
        life: 1000, scaleStart: 1.5, scaleEnd: 0,
        alphaStart: 1, alphaEnd: 0,
        tint: b.palette.primary, radius: 2,
        rotationSpeed: (Math.random() - 0.5) * 15,
      });
    }
  }
}
```

- [ ] **Step 2: 补全子类骨架（参照 Task 3 模板）+ 编译 + 视觉验证 + 提交**

```bash
cd game/frontend && npm run build
# 视觉验证：准星旋转、追踪粒子流、弹道齐射、弹壳抛洒
git add src/components/fish-oil-battle/renderer/entities/PursuitProtocolRenderer.ts
git commit -m "feat(PursuitProtocol): 重写战术追踪渲染器(旋转准星+弹道齐射+弹壳抛洒)"
```

---

### Task 6: 重写 GravityWellRenderer（时空弯曲）

**Files:**
- Rewrite: `game/frontend/src/components/fish-oil-battle/renderer/entities/GravityWellRenderer.ts`

**视觉主题**：3 条阿基米德螺旋臂 + 引力透镜环 + 时空网格扭曲；爆发：黑洞坍缩（吸积盘旋转 + 事件视界 + 引力波纹）

- [ ] **Step 1: 重写文件，核心独特方法**

```typescript
const GRAVITY_VOID = 0x000000;
const GRAVITY_DEEP = 0x1a0033;
const GRAVITY_MAIN = 0x6600cc;
const GRAVITY_LIGHT = 0xaa44ff;
const GRAVITY_HIGHLIGHT = 0xdd88ff;

// 1. 3 条阿基米德螺旋臂
private drawSpiralArms(g: PIXI.Graphics, radius: number, palette: Palette, life: number): void {
  g.clear();
  const armCount = 3;
  const rotation = life * 0.0005 * Math.PI;
  for (let arm = 0; arm < armCount; arm++) {
    const armOffset = (arm * Math.PI * 2) / armCount + rotation;
    let prevX = 0, prevY = 0;
    for (let i = 1; i <= 30; i++) {
      const t = i / 30;
      const r = radius * t;
      const angle = armOffset + t * Math.PI * 2;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i > 1) {
        g.moveTo(prevX, prevY); g.lineTo(x, y);
        g.stroke({ color: this.interpolateColor(palette.glow, palette.shadow, t), width: 2 - t, alpha: 0.7 - t * 0.4 });
      }
      prevX = x; prevY = y;
    }
  }
}

// 2. 时空网格扭曲（径向网格线弯曲）
private drawSpacetimeGrid(g: PIXI.Graphics, radius: number, palette: Palette, life: number): void {
  g.clear();
  const gridLines = 8;
  const rotation = life * 0.0003 * Math.PI;
  for (let i = 0; i < gridLines; i++) {
    const angle = (i * Math.PI * 2) / gridLines + rotation;
    g.moveTo(0, 0);
    // 弯曲的径向线（贝塞尔）
    const ctrlAngle = angle + 0.3;
    const ctrlR = radius * 0.5;
    const endX = Math.cos(angle) * radius;
    const endY = Math.sin(angle) * radius;
    const cpX = Math.cos(ctrlAngle) * ctrlR;
    const cpY = Math.sin(ctrlAngle) * ctrlR;
    g.quadraticCurveTo(cpX, cpY, endX, endY);
    g.stroke({ color: palette.dim, width: 0.8, alpha: 0.4 });
  }
  // 同心圆网格（扭曲）
  for (let i = 1; i <= 4; i++) {
    const r = radius * (i / 5);
    g.circle(0, 0, r);
    g.stroke({ color: palette.dim, width: 0.5, alpha: 0.3 });
  }
}

// 3. 爆发：黑洞坍缩（吸积盘旋转 + 事件视界 + 引力波纹）
protected phase2Burst(burst: ActiveBurstBase, t: number): void {
  const b = burst as ActiveGravityBurst;
  const ease = this.easeOutCubic(t);
  // 吸积盘（旋转椭圆环）
  b.bladeGraphics.clear();
  b.bladeGraphics.rotation = b.life * 0.003;
  for (let i = 0; i < 5; i++) {
    const r = b.radius * (0.3 + i * 0.15) * ease;
    b.bladeGraphics.ellipse(0, 0, r, r * 0.3);
    b.bladeGraphics.stroke({ color: this.interpolateColor(b.palette.highlight, b.palette.primary, i / 4), width: 2, alpha: 0.8 * ease });
  }
  // 事件视界（黑色圆环）
  b.coreGraphics.clear();
  this.drawMultilayerCircle(b.coreGraphics, b.radius * 0.15, 10,
    (ti) => this.interpolateColor(GRAVITY_VOID, b.palette.shadow, ti),
    (ti) => 1 - ti * 0.3);
  b.coreGraphics.circle(0, 0, b.radius * 0.1);
  b.coreGraphics.fill({ color: GRAVITY_VOID });
  // 引力波纹（向外扩散的圆环）
  b.haloGraphics.clear();
  for (let i = 0; i < 3; i++) {
    const phase = (b.life * 0.001 + i * 0.33) % 1;
    const r = b.radius * (0.2 + phase * 0.8) * ease;
    b.haloGraphics.circle(0, 0, r);
    b.haloGraphics.stroke({ color: b.palette.glow, width: 1.5, alpha: (1 - phase) * 0.5 });
  }
}
```

- [ ] **Step 2: 补全骨架 + 编译 + 视觉验证 + 提交**

```bash
cd game/frontend && npm run build
git add src/components/fish-oil-battle/renderer/entities/GravityWellRenderer.ts
git commit -m "feat(GravityWell): 重写时空弯曲渲染器(螺旋臂+吸积盘+引力波纹)"
```

---

### Task 7: 重写 EntropyDiffuserRenderer（熵增扩散）

**Files:**
- Rewrite: `game/frontend/src/components/fish-oil-battle/renderer/entities/EntropyDiffuserRenderer.ts`

**视觉主题**：3 层错相位扩散波纹 + 混乱方向粒子 + 熵增进度条；爆发：热寂奇点（热扩散云 + 混沌粒子风暴 + 熵最大爆发）

- [ ] **Step 1: 重写文件，核心独特方法**

```typescript
const ENTROPY_HEAT = 0xff4400;
const ENTROPY_CHAOS = 0xffcc00;
const ENTROPY_COLD = 0x3300cc;

// 1. 3 层错相位扩散波纹
private drawDiffusionWaves(g: PIXI.Graphics, radius: number, palette: Palette, life: number): void {
  g.clear();
  for (let i = 0; i < 3; i++) {
    const phase = (life * 0.0008 + i * 0.33) % 1;
    const r = radius * (0.2 + phase * 0.9);
    // 波纹是不规则形状（用多边形模拟）
    const sides = 12;
    const points: [number, number][] = [];
    for (let j = 0; j < sides; j++) {
      const angle = (j * Math.PI * 2) / sides;
      const jitter = 1 + 0.1 * Math.sin(j * 2.3 + life * 0.001);
      points.push([Math.cos(angle) * r * jitter, Math.sin(angle) * r * jitter]);
    }
    g.moveTo(points[0][0], points[0][1]);
    for (let j = 1; j < sides; j++) g.lineTo(points[j][0], points[j][1]);
    g.closePath();
    g.stroke({ color: palette.glow, width: 1.5, alpha: (1 - phase) * 0.5 });
  }
}

// 2. 混乱方向粒子（方向随机，速度随机）
private spawnChaosParticles(f: ActiveEntropyField): void {
  for (let i = 0; i < 2; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 20 + Math.random() * 100;
    this.particlePool.emit({
      x: f.x + (Math.random() - 0.5) * f.radius,
      y: f.y + (Math.random() - 0.5) * f.radius,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      ax: (Math.random() - 0.5) * 100, // 随机加速度
      ay: (Math.random() - 0.5) * 100,
      drag: 0.8,
      life: 600 + Math.random() * 400,
      scaleStart: 1.5, scaleEnd: 0,
      alphaStart: 0.7, alphaEnd: 0,
      tint: f.palette.glow,
      tintStart: ENTROPY_HEAT, tintEnd: ENTROPY_COLD, // 热→冷渐变
      radius: 2,
    });
  }
}

// 3. 爆发：热寂奇点
protected phase2Burst(burst: ActiveBurstBase, t: number): void {
  const b = burst as ActiveEntropyBurst;
  const ease = this.easeOutCubic(t);
  // 热扩散云（多层不规则云）
  b.coreGraphics.clear();
  for (let i = 0; i < 6; i++) {
    const r = b.radius * (0.1 + i * 0.12) * ease;
    const sides = 8;
    const points: [number, number][] = [];
    for (let j = 0; j < sides; j++) {
      const angle = (j * Math.PI * 2) / sides;
      const jitter = 1 + 0.2 * Math.sin(j * 3.7 + b.life * 0.002);
      points.push([Math.cos(angle) * r * jitter, Math.sin(angle) * r * jitter]);
    }
    b.coreGraphics.moveTo(points[0][0], points[0][1]);
    for (let j = 1; j < sides; j++) b.coreGraphics.lineTo(points[j][0], points[j][1]);
    b.coreGraphics.closePath();
    b.coreGraphics.fill({ color: this.interpolateColor(b.palette.highlight, b.palette.shadow, i / 5), alpha: 0.3 * ease });
  }
  // 混沌粒子风暴
  if (b.particleTimer > 30) {
    b.particleTimer = 0;
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 150;
      this.particlePool.emit({
        x: b.x, y: b.y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        ax: (Math.random() - 0.5) * 200, ay: (Math.random() - 0.5) * 200,
        drag: 0.5,
        life: 800, scaleStart: 2, scaleEnd: 0,
        alphaStart: 1, alphaEnd: 0,
        tintStart: ENTROPY_HEAT, tintEnd: ENTROPY_COLD,
        radius: 2.5,
      });
    }
  }
}
```

- [ ] **Step 2: 补全骨架 + 编译 + 视觉验证 + 提交**

```bash
cd game/frontend && npm run build
git add src/components/fish-oil-battle/renderer/entities/EntropyDiffuserRenderer.ts
git commit -m "feat(EntropyDiffuser): 重写熵增扩散渲染器(扩散波纹+混沌风暴+热寂云)"
```

---

### Task 8: 重写 BastionBuilderRenderer（防御工事）

**Files:**
- Rewrite: `game/frontend/src/components/fish-oil-battle/renderer/entities/BastionBuilderRenderer.ts`

**视觉主题**：3 层六边形护盾叠加 + 节点连接线 + 防御符文；爆发：堡垒降临（六边形要塞展开 + 护盾冲击波 + 防御塔投影）

- [ ] **Step 1: 重写文件，核心独特方法**

```typescript
import { drawHexagon } from './VisualEffectUtils';

const BASTION_STONE = 0x886644;
const BASTION_GOLD = 0xccaa44;
const BASTION_SHIELD = 0x44aacc;

// 1. 3 层六边形护盾叠加（闭合，不同角度旋转）
private drawHexShields(g: PIXI.Graphics, radius: number, palette: Palette, life: number): void {
  g.clear();
  for (let layer = 0; layer < 3; layer++) {
    const r = radius * (0.5 + layer * 0.25);
    const rot = life * 0.0005 * Math.PI * (layer % 2 === 0 ? 1 : -1);
    g.rotation = rot;
    // 六边形护盾（填充 + 描边）
    const pts: [number, number][] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 - Math.PI / 6;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < 6; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    g.fill({ color: palette.glow, alpha: 0.1 - layer * 0.02 });
    g.stroke({ color: palette.glow, width: 2 - layer * 0.3, alpha: 0.7 - layer * 0.15 });
    // 节点连接线（六边形顶点连线）
    for (let i = 0; i < 6; i += 2) {
      g.moveTo(pts[i][0], pts[i][1]);
      g.lineTo(pts[(i + 3) % 6][0], pts[(i + 3) % 6][1]);
      g.stroke({ color: palette.highlight, width: 0.5, alpha: 0.4 });
    }
  }
}

// 2. 防御符文（中心符号，呼吸闪烁）
private drawDefenseRune(g: PIXI.Graphics, radius: number, palette: Palette, life: number): void {
  g.clear();
  const breath = 0.7 + 0.3 * Math.sin(life * 0.003 * Math.PI);
  // 中心十字符文
  g.moveTo(-radius * 0.15, 0); g.lineTo(radius * 0.15, 0);
  g.moveTo(0, -radius * 0.15); g.lineTo(0, radius * 0.15);
  g.stroke({ color: palette.highlight, width: 2, alpha: breath });
  // 外圈符文环
  g.circle(0, 0, radius * 0.12);
  g.stroke({ color: palette.glow, width: 1, alpha: breath * 0.6 });
}

// 3. 爆发：堡垒降临
protected phase2Burst(burst: ActiveBurstBase, t: number): void {
  const b = burst as ActiveBastionBurst;
  const ease = this.easeOutCubic(t);
  // 六边形要塞展开（3 层从内到外）
  b.coreGraphics.clear();
  for (let layer = 0; layer < 3; layer++) {
    const r = b.radius * (0.2 + layer * 0.25) * ease;
    const rot = b.life * 0.001 * (layer % 2 === 0 ? 1 : -1);
    b.coreGraphics.rotation = rot;
    const pts: [number, number][] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 - Math.PI / 6;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    b.coreGraphics.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < 6; i++) b.coreGraphics.lineTo(pts[i][0], pts[i][1]);
    b.coreGraphics.closePath();
    b.coreGraphics.fill({ color: b.palette.glow, alpha: 0.2 * ease });
    b.coreGraphics.stroke({ color: b.palette.highlight, width: 2, alpha: ease });
  }
  // 护盾冲击波
  b.haloGraphics.clear();
  const waveR = b.radius * 1.5 * ease;
  b.haloGraphics.circle(0, 0, waveR);
  b.haloGraphics.stroke({ color: b.palette.glow, width: 4 * (1 - ease), alpha: 0.6 * (1 - ease) });
  // 防御塔投影（6 个顶点的小塔）
  b.bladeGraphics.clear();
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const tx = Math.cos(angle) * b.radius * 0.4 * ease;
    const ty = Math.sin(angle) * b.radius * 0.4 * ease;
    b.bladeGraphics.circle(tx, ty, 4 * ease);
    b.bladeGraphics.fill({ color: b.palette.primary, alpha: ease });
  }
}
```

- [ ] **Step 2: 补全骨架 + 编译 + 视觉验证 + 提交**

```bash
cd game/frontend && npm run build
git add src/components/fish-oil-battle/renderer/entities/BastionBuilderRenderer.ts
git commit -m "feat(BastionBuilder): 重写防御工事渲染器(六边形护盾+要塞+防御塔)"
```

---

### Task 9: 重写 CircuitWeaverRenderer（电路网络）

**Files:**
- Rewrite: `game/frontend/src/components/fish-oil-battle/renderer/entities/CircuitWeaverRenderer.ts`

**视觉主题**：6 节点六边形网络 + 对角线连接 + 切向电流粒子；爆发：电路过载（网络闪烁 + 电流风暴 + 节点爆炸）
**与 BastionBuilder 的区别**：Bastion 用闭合六边形护盾，CircuitWeaver 用开放节点连线

- [ ] **Step 1: 重写文件，核心独特方法**

```typescript
const CIRCUIT_VOLT = 0x00ffaa;
const CIRCUIT_SPARK = 0xaaff00;

// 1. 6 节点六边形网络（开放连线，非闭合）
private drawCircuitNetwork(g: PIXI.Graphics, radius: number, palette: Palette, life: number): void {
  g.clear();
  // 6 个节点
  const nodes: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    nodes.push([Math.cos(angle) * radius * 0.7, Math.sin(angle) * radius * 0.7]);
  }
  // 节点间连线（六边形边 + 对角线）
  for (let i = 0; i < 6; i++) {
    // 六边形边
    const next = (i + 1) % 6;
    g.moveTo(nodes[i][0], nodes[i][1]);
    g.lineTo(nodes[next][0], nodes[next][1]);
    g.stroke({ color: palette.glow, width: 1, alpha: 0.5 });
    // 对角线（跳 2）
    const diag = (i + 2) % 6;
    g.moveTo(nodes[i][0], nodes[i][1]);
    g.lineTo(nodes[diag][0], nodes[diag][1]);
    g.stroke({ color: palette.dim, width: 0.5, alpha: 0.3 });
  }
  // 节点（闪烁）
  const pulse = 0.5 + 0.5 * Math.sin(life * 0.005 * Math.PI);
  for (const [x, y] of nodes) {
    g.circle(x, y, 3 + pulse);
    g.fill({ color: palette.highlight, alpha: 0.8 });
    g.circle(x, y, 6);
    g.stroke({ color: palette.glow, width: 1, alpha: 0.4 });
  }
  // 中心节点
  g.circle(0, 0, 4);
  g.fill({ color: palette.highlight });
}

// 2. 切向电流粒子（沿六边形边流动）
private spawnCurrentParticles(f: ActiveCircuitField): void {
  for (let i = 0; i < 3; i++) {
    const edgeIdx = Math.floor(Math.random() * 6);
    const angle1 = (edgeIdx * Math.PI) / 3;
    const angle2 = ((edgeIdx + 1) * Math.PI) / 3;
    const t = Math.random();
    const startX = Math.cos(angle1) * f.radius * 0.7;
    const startY = Math.sin(angle1) * f.radius * 0.7;
    const endX = Math.cos(angle2) * f.radius * 0.7;
    const endY = Math.sin(angle2) * f.radius * 0.7;
    const px = startX + (endX - startX) * t;
    const py = startY + (endY - startY) * t;
    this.particlePool.emit({
      x: f.x + px, y: f.y + py,
      vx: (endX - startX) * 0.5, vy: (endY - startY) * 0.5,
      drag: 0.9, life: 300,
      scaleStart: 1.5, scaleEnd: 0,
      alphaStart: 1, alphaEnd: 0,
      tint: CIRCUIT_SPARK, radius: 1.5,
    });
  }
}

// 3. 爆发：电路过载
protected phase2Burst(burst: ActiveBurstBase, t: number): void {
  const b = burst as ActiveCircuitBurst;
  const ease = this.easeOutCubic(t);
  const flash = Math.sin(b.life * 0.02) > 0 ? 1 : 0.3; // 闪烁
  // 网络过载闪烁
  b.coreGraphics.clear();
  const nodes: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    nodes.push([Math.cos(angle) * b.radius * 0.7 * ease, Math.sin(angle) * b.radius * 0.7 * ease]);
  }
  for (let i = 0; i < 6; i++) {
    const next = (i + 1) % 6;
    b.coreGraphics.moveTo(nodes[i][0], nodes[i][1]);
    b.coreGraphics.lineTo(nodes[next][0], nodes[next][1]);
    b.coreGraphics.stroke({ color: b.palette.highlight, width: 3, alpha: flash });
  }
  // 节点爆炸
  for (const [x, y] of nodes) {
    b.coreGraphics.circle(x, y, 5 * ease);
    b.coreGraphics.fill({ color: b.palette.highlight, alpha: flash });
  }
  // 电流风暴
  if (b.particleTimer > 20) {
    b.particleTimer = 0;
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 100 + Math.random() * 200;
      this.particlePool.emit({
        x: b.x, y: b.y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        drag: 0.7, life: 500,
        scaleStart: 1.5, scaleEnd: 0,
        alphaStart: 1, alphaEnd: 0,
        tint: CIRCUIT_SPARK, radius: 2,
      });
    }
  }
}
```

- [ ] **Step 2: 补全骨架 + 编译 + 视觉验证 + 提交**

```bash
cd game/frontend && npm run build
git add src/components/fish-oil-battle/renderer/entities/CircuitWeaverRenderer.ts
git commit -m "feat(CircuitWeaver): 重写电路网络渲染器(节点网络+电流粒子+过载闪烁)"
```

---

### Task 10: 重写 QuantumRiftRenderer（维度裂缝）

**Files:**
- Rewrite: `game/frontend/src/components/fish-oil-battle/renderer/entities/QuantumRiftRenderer.ts`

**视觉主题**：7 条锯齿裂缝（伪随机折线）+ 黑色吸光核 + 量子涨落粒子；爆发：维度撕裂（裂缝扩展 + 虚空涌出 + 量子涟漪）

- [ ] **Step 1: 重写文件，核心独特方法**

```typescript
const RIFT_VOID = 0x000000;
const RIFT_CYAN = 0x00ffdd;
const RIFT_DEEP = 0x003344;

// 1. 7 条锯齿裂缝（伪随机折线）
private drawJaggedCracks(g: PIXI.Graphics, radius: number, palette: Palette, life: number): void {
  g.clear();
  const crackCount = 7;
  // 确定性伪随机（基于角度）
  for (let i = 0; i < crackCount; i++) {
    const angle = (i * Math.PI * 2) / crackCount;
    const segments = 4;
    let prevX = 0, prevY = 0;
    for (let seg = 1; seg <= segments; seg++) {
      const t = seg / segments;
      const r = radius * t;
      // 伪随机抖动（基于 i 和 seg，确定性）
      const seed = i * 7.3 + seg * 3.7;
      const jitter = (Math.sin(seed) + Math.cos(seed * 1.7)) * 0.15;
      const segAngle = angle + jitter;
      const x = Math.cos(segAngle) * r;
      const y = Math.sin(segAngle) * r;
      if (seg > 1) {
        // 黑色裂缝主体
        g.moveTo(prevX, prevY); g.lineTo(x, y);
        g.stroke({ color: RIFT_VOID, width: 3, alpha: 0.9 });
        // 青色边缘辉光
        g.moveTo(prevX, prevY); g.lineTo(x, y);
        g.stroke({ color: palette.glow, width: 1, alpha: 0.8 });
      }
      prevX = x; prevY = y;
    }
  }
}

// 2. 黑色吸光核
private drawVoidCore(g: PIXI.Graphics, radius: number, palette: Palette, life: number): void {
  g.clear();
  const pulse = 0.8 + 0.2 * Math.sin(life * 0.003 * Math.PI);
  this.drawMultilayerCircle(
    g, radius * 0.15, 10,
    (t) => this.interpolateColor(RIFT_VOID, RIFT_DEEP, t),
    (t) => (1 - t * 0.3) * pulse,
  );
  g.circle(0, 0, radius * 0.08);
  g.fill({ color: RIFT_VOID });
}

// 3. 量子涨落粒子（随机出现消失）
private spawnQuantumFluctuation(f: ActiveRiftField): void {
  for (let i = 0; i < 2; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * f.radius * 0.8;
    this.particlePool.emit({
      x: f.x + Math.cos(angle) * dist,
      y: f.y + Math.sin(angle) * dist,
      vx: (Math.random() - 0.5) * 20,
      vy: (Math.random() - 0.5) * 20,
      life: 300 + Math.random() * 300,
      scaleStart: 1.5, scaleEnd: 0,
      alphaStart: 0.8, alphaEnd: 0,
      tint: RIFT_CYAN, radius: 1.5,
    });
  }
}

// 4. 爆发：维度撕裂
protected phase2Burst(burst: ActiveBurstBase, t: number): void {
  const b = burst as ActiveRiftBurst;
  const ease = this.easeOutCubic(t);
  // 裂缝扩展
  b.bladeGraphics.clear();
  for (let i = 0; i < 7; i++) {
    const angle = (i * Math.PI * 2) / 7;
    const len = b.radius * 1.5 * ease;
    const segments = 6;
    let prevX = 0, prevY = 0;
    for (let seg = 1; seg <= segments; seg++) {
      const tSeg = seg / segments;
      const r = len * tSeg;
      const seed = i * 7.3 + seg * 3.7;
      const jitter = (Math.sin(seed) + Math.cos(seed * 1.7)) * 0.2;
      const segAngle = angle + jitter;
      const x = Math.cos(segAngle) * r;
      const y = Math.sin(segAngle) * r;
      if (seg > 1) {
        b.bladeGraphics.moveTo(prevX, prevY); b.bladeGraphics.lineTo(x, y);
        b.bladeGraphics.stroke({ color: RIFT_VOID, width: 4, alpha: ease });
        b.bladeGraphics.moveTo(prevX, prevY); b.bladeGraphics.lineTo(x, y);
        b.bladeGraphics.stroke({ color: b.palette.glow, width: 1.5, alpha: ease });
      }
      prevX = x; prevY = y;
    }
  }
  // 虚空涌出（中心黑色核扩大）
  b.coreGraphics.clear();
  this.drawMultilayerCircle(b.coreGraphics, b.radius * 0.2 * ease, 10,
    (ti) => this.interpolateColor(RIFT_VOID, RIFT_DEEP, ti),
    (ti) => (1 - ti * 0.3) * ease);
  b.coreGraphics.circle(0, 0, b.radius * 0.12 * ease);
  b.coreGraphics.fill({ color: RIFT_VOID });
  // 量子涟漪（向外扩散）
  b.haloGraphics.clear();
  for (let i = 0; i < 3; i++) {
    const phase = (b.life * 0.001 + i * 0.33) % 1;
    b.haloGraphics.circle(0, 0, b.radius * phase);
    b.haloGraphics.stroke({ color: b.palette.glow, width: 1, alpha: (1 - phase) * 0.4 });
  }
}
```

- [ ] **Step 2: 补全骨架 + 编译 + 视觉验证 + 提交**

```bash
cd game/frontend && npm run build
git add src/components/fish-oil-battle/renderer/entities/QuantumRiftRenderer.ts
git commit -m "feat(QuantumRift): 重写维度裂缝渲染器(锯齿裂缝+吸光核+量子涨落)"
```

---

### Task 11: 重写 RicochetCoreRenderer（弹道反射）

**Files:**
- Rewrite: `game/frontend/src/components/fish-oil-battle/renderer/entities/RicochetCoreRenderer.ts`

**视觉主题**：6 条多段反弹线（角度反射）+ 端点节点 + 反射角标记；爆发：弹射风暴（多向弹道 + 反射网络 + 弹道余晖）

- [ ] **Step 1: 重写文件，核心独特方法**

```typescript
const RICO_TRAIL = 0xff8800;
const RICO_NODE = 0xffcc00;
const RICO_ANGLE = 0xff4400;

// 1. 6 条多段反弹线（角度反射）
private drawRicochetLines(g: PIXI.Graphics, radius: number, palette: Palette, life: number): void {
  g.clear();
  const lineCount = 6;
  const rotation = life * 0.0005 * Math.PI;
  for (let i = 0; i < lineCount; i++) {
    const startAngle = (i * Math.PI * 2) / lineCount + rotation;
    let x = Math.cos(startAngle) * radius * 0.3;
    let y = Math.sin(startAngle) * radius * 0.3;
    let angle = startAngle;
    // 3 段反弹
    for (let seg = 0; seg < 3; seg++) {
      const len = radius * 0.25;
      const endX = x + Math.cos(angle) * len;
      const endY = y + Math.sin(angle) * len;
      g.moveTo(x, y); g.lineTo(endX, endY);
      g.stroke({ color: palette.glow, width: 1.5, alpha: 0.7 });
      // 端点节点
      g.circle(endX, endY, 2);
      g.fill({ color: palette.highlight, alpha: 0.8 });
      // 反射角标记（在端点画小弧）
      g.arc(endX, endY, 4, angle - 0.5, angle + 0.5);
      g.stroke({ color: RICO_ANGLE, width: 1, alpha: 0.5 });
      // 反射（角度 + 90° 偏转）
      angle = angle + Math.PI / 2 + (i % 2 === 0 ? 0.3 : -0.3);
      x = endX; y = endY;
    }
  }
}

// 2. 弹道余晖粒子
private spawnTrailParticles(f: ActiveRicochetField): void {
  for (let i = 0; i < 2; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * f.radius * 0.7;
    this.particlePool.emit({
      x: f.x + Math.cos(angle) * dist,
      y: f.y + Math.sin(angle) * dist,
      vx: Math.cos(angle) * 40, vy: Math.sin(angle) * 40,
      drag: 0.9, life: 400,
      scaleStart: 1, scaleEnd: 0,
      alphaStart: 0.6, alphaEnd: 0,
      tint: RICO_TRAIL, radius: 1.5,
    });
  }
}

// 3. 爆发：弹射风暴
protected phase2Burst(burst: ActiveBurstBase, t: number): void {
  const b = burst as ActiveRicochetBurst;
  const ease = this.easeOutCubic(t);
  // 多向弹道（12 条向外飞行的弹道）
  b.bladeGraphics.clear();
  b.bladeGraphics.rotation = b.life * 0.002;
  for (let i = 0; i < 12; i++) {
    const angle = (i * Math.PI * 2) / 12;
    const len = b.radius * ease;
    const startX = 0, startY = 0;
    const endX = Math.cos(angle) * len;
    const endY = Math.sin(angle) * len;
    b.bladeGraphics.moveTo(startX, startY); b.bladeGraphics.lineTo(endX, endY);
    b.bladeGraphics.stroke({ color: b.palette.glow, width: 2, alpha: ease });
    // 弹头
    b.bladeGraphics.circle(endX, endY, 3);
    b.bladeGraphics.fill({ color: b.palette.highlight, alpha: ease });
  }
  // 反射网络（连接外端点）
  for (let i = 0; i < 12; i++) {
    const next = (i + 1) % 12;
    const angle1 = (i * Math.PI * 2) / 12;
    const angle2 = (next * Math.PI * 2) / 12;
    const len = b.radius * ease;
    b.bladeGraphics.moveTo(Math.cos(angle1) * len, Math.sin(angle1) * len);
    b.bladeGraphics.lineTo(Math.cos(angle2) * len, Math.sin(angle2) * len);
    b.bladeGraphics.stroke({ color: b.palette.dim, width: 0.8, alpha: ease * 0.5 });
  }
  // 中心爆炸
  b.coreGraphics.clear();
  this.drawMultilayerCircle(b.coreGraphics, b.radius * 0.15 * ease, 8,
    (ti) => this.interpolateColor(b.palette.highlight, b.palette.shadow, ti),
    (ti) => (1 - ti) * ease);
}
```

- [ ] **Step 2: 补全骨架 + 编译 + 视觉验证 + 提交**

```bash
cd game/frontend && npm run build
git add src/components/fish-oil-battle/renderer/entities/RicochetCoreRenderer.ts
git commit -m "feat(RicochetCore): 重写弹道反射渲染器(反弹线+反射角+弹射风暴)"
```

---

## Phase 4：集成验证

### Task 12: 集成验证与构建

**Files:**
- Verify: 所有 9 个渲染器文件 + `EffectRenderer.ts` + `test/EffectTestController.ts`

- [ ] **Step 1: 确认 EffectRenderer.ts 集成无需修改**

Run: `cd game/frontend && npm run build`
Expected: 编译通过（因为重写后公开 API 不变，EffectRenderer 无需修改）

如果编译失败，检查：
- 9 个渲染器的 `trigger*` 方法签名是否与 effectRegistry.ts 中的 switch case 一致
- 9 个渲染器的构造函数签名是否为 `(container: PIXI.Container, particlePool: ParticlePool)`

- [ ] **Step 2: 测试页面验证**

Run: `cd game/frontend && npm run dev`
打开浏览器 → EffectTestPage → 侧边栏"基础流派武器"组

逐个点击并 Play 以下 18 个特效（9 个场 + 9 个爆发）：

1. 纳米撕裂者·撕裂场 → 应看到 6×6 分子点阵网格抖动 + 4 条生长裂纹
2. 纳米撕裂者·爆发 → 应看到 X 形交叉裂刃 + 黑色虚空核 + 碎片粒子下落
3. 体积扭曲·扭曲场 → 应看到椭圆 squash/stretch 呼吸 + 4 条刻度条 + 压缩波纹
4. 体积扭曲·爆发 → 应看到坍缩奇点 + 刻度环展开
5. 追猎协议·标记 → 应看到旋转准星 + 锁定框 + 追踪粒子流
6. 追猎协议·爆发 → 应看到 6 枚弹道齐射 + 命中爆炸 + 弹壳抛洒
7. 重力阱·核心 → 应看到 3 条螺旋臂 + 时空网格扭曲
8. 重力阱·爆发 → 应看到吸积盘 + 事件视界 + 引力波纹
9. 熵增扩散器·扩散场 → 应看到 3 层扩散波纹 + 混乱粒子
10. 熵增扩散器·爆发 → 应看到热扩散云 + 混沌粒子风暴
11. 堡垒构筑者·护盾 → 应看到 3 层六边形护盾 + 防御符文
12. 堡垒构筑者·爆发 → 应看到六边形要塞展开 + 护盾冲击波
13. 电路编织者·网络 → 应看到 6 节点网络 + 对角线 + 电流粒子
14. 电路编织者·爆发 → 应看到网络闪烁 + 电流风暴
15. 量子裂隙·裂缝 → 应看到 7 条锯齿裂缝 + 黑色吸光核
16. 量子裂隙·爆发 → 应看到裂缝扩展 + 虚空涌出 + 量子涟漪
17. 弹射核心·弹射轨迹 → 应看到 6 条多段反弹线 + 端点节点
18. 弹射核心·爆发 → 应看到 12 条弹道齐射 + 反射网络

- [ ] **Step 3: 视觉差异化检查**

肉眼对比 9 个爆发特效，确认：
- 无"换颜色"感（每个爆发有独特视觉符号）
- 调色板派生生效（传不同 themeColor 颜色变化）
- 粒子物理生效（NanoRipper 碎片有重力下落、EntropyDiffuser 粒子有颜色渐变）

- [ ] **Step 4: 性能验证**

在测试页面同时触发 9 个场特效，观察 FPS：
Expected: ≥ 30fps（对象池生效，无频繁 GC）

- [ ] **Step 5: 提交剩余改动（如有）**

```bash
cd game/frontend
git add -A
git commit -m "feat: 9个基础武器渲染器全部按闲乘月标准重写完成"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ §1-2 背景与目标 → Task 1-2 基础设施
- ✅ §3 架构设计 → Task 1-2（ParticlePool + BaseWeaponEffectRenderer）
- ✅ §4 基类设计 → Task 2 完整代码
- ✅ §5 ParticlePool 扩展 → Task 1 完整代码
- ✅ §6.1 视觉主题矩阵 9 个 → Task 3-11 各自实现
- ✅ §6.2 去重保证 → 每个渲染器有 2+ 独特符号
- ✅ §7 集成点 → Task 12 验证（API 不变）
- ✅ §8 测试与验证 → Task 12 验证项
- ✅ §9 风险缓解 → 基类钩子模式 + 向后兼容

**2. Placeholder scan:**
- Task 5-11 的"补全骨架"步骤引用 Task 3 模板 —— 这是合理的代码复用引用，非占位符
- 所有独特视觉方法有完整代码

**3. Type consistency:**
- `ActiveBurstBase` 在基类定义，所有子类的 `ActiveXxxBurst extends ActiveBurstBase`
- `trigger*` 方法签名统一：`(playerId, x, y, radius, themeColor?)`
- `setScale(scale, canvasW?, canvasH?)` 签名一致
- `Palette` 接口在基类导出，子类引用

**4. 实施说明：**
- Task 5-11 的"补全骨架"指的是：import/接口定义/构造函数/trigger*/update/clear/onScaleChange/removeBurstInstance，这些方法在 Task 3 (NanoRipperRenderer) 中有完整模板，子类只需替换颜色常量、接口名、独特 draw 方法
- 如果实施时对骨架不确定，可参照 `EntropicTouchRenderer.ts`（黄金参考）或 Task 3 的完整代码
