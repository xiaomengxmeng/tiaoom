# 闲乘月（熵寂之触）特效重设计 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重写 `EntropicTouchRenderer.ts`，将闲乘月技能特效从"元素堆砌但视觉丑陋"升级为"月华清辉 + 熵寂吸光"双形态融合，并补齐数据驱动时长链路。

**Architecture:** 单文件完全重写 + EffectRenderer 补齐 `buildEntropicTouchVisualCfg()` 链路。普通技能（低温场/冻伤）走月华清辉派，爆发走熵寂吸光派三阶段动画。所有动画统一由 `update(dt)` 驱动，移除 rAF/setTimeout。

**Tech Stack:** TypeScript, PixiJS v8 Graphics, 现有 ParticlePool

**Spec:** `docs/superpowers/specs/2026-06-27-xianchengyue-effect-redesign-design.md`

---

## 文件结构

| 文件 | 责任 | 操作 |
|------|------|------|
| `game/frontend/src/components/fish-oil-battle/renderer/entities/EntropicTouchRenderer.ts` | 闲乘月全部视觉特效 | 完全重写 |
| `game/frontend/src/components/fish-oil-battle/renderer/entities/EffectRenderer.ts` | 公开 API + 视觉配置构建 | 修改：新增 `buildEntropicTouchVisualCfg()` + `triggerEntropicBurst` 加 `durationMs` 参数 |

**不修改**：`CyberFishRenderer.ts`（调用方签名向后兼容）、`WeaponRangeConfig.ts`、后端代码。

---

## Task 1: EffectRenderer 补齐数据驱动链路

**Files:**
- Modify: `game/frontend/src/components/fish-oil-battle/renderer/entities/EffectRenderer.ts` (在 `triggerEntropicBurst` 方法附近，约 L499-507)

**目的**：参考其他武器（如 `buildDischargeCatVisualCfg` L645-652），为闲乘月补齐从 `WeaponRangeConfig.burstDurationSec` 读取时长的链路，使爆发时长数据驱动。

- [ ] **Step 1: 新增 `EntropicTouchVisualConfig` 类型与 `buildEntropicTouchVisualCfg()` 方法**

在 `EffectRenderer.ts` 的"熵寂之触"区块（L466 附近的 `// 公开 API：熵寂之触` 注释下方）新增类型定义和方法。

在 `triggerEntropicAura` 方法之前（约 L470 处）插入：

```typescript
/** 闲乘月视觉配置（数据驱动） */
interface EntropicTouchVisualConfig {
  auraRadius: number;
  burstRadius: number;
  burstDurationMs: number;
}

// 在 EffectRenderer class 内部添加方法：
/**
 * 从 WeaponRangeConfig 构建熵寂之触视觉配置
 */
private buildEntropicTouchVisualCfg(): EntropicTouchVisualConfig {
  const rc = WEAPON_RANGE_CONFIG[WeaponId.ENTROPIC_TOUCH];
  return {
    auraRadius: rc?.damageRadius ?? 50,
    burstRadius: rc?.aoeMaxRadius ?? 200,
    burstDurationMs: (rc?.burstDurationSec ?? 5) * 1000,
  };
}
```

- [ ] **Step 2: 修改 `triggerEntropicBurst` 签名，新增 `durationMs` 可选参数**

定位 `EffectRenderer.ts` 的 `triggerEntropicBurst` 方法（约 L499-507），将：

```typescript
triggerEntropicBurst(
  playerId: string,
  x: number,
  y: number,
  radius: number,
  themeColor?: number,
): void {
  this.entropicTouchRenderer.triggerBurst(playerId, x, y, radius, themeColor);
}
```

改为：

```typescript
triggerEntropicBurst(
  playerId: string,
  x: number,
  y: number,
  radius: number,
  themeColor?: number,
  durationMs?: number,
): void {
  const cfg = this.buildEntropicTouchVisualCfg();
  this.entropicTouchRenderer.triggerBurst(
    playerId, x, y, radius, themeColor, durationMs ?? cfg.burstDurationMs,
  );
}
```

- [ ] **Step 3: 运行构建验证 TypeScript 无报错**

Run: `cd d:\TraePro\fishoil\tiaoom\game\frontend && npm run build`
Expected: 编译通过（此时 `EntropicTouchRenderer.triggerBurst` 还未接受 `durationMs`，可能会有参数过多警告，可暂时加 `// @ts-expect-error 等待渲染器重写` 注释，或直接进入 Task 2）

> 说明：此步可能因 `EntropicTouchRenderer.triggerBurst` 还未更新签名而报错。可选择跳过构建验证，直接进入 Task 2 完成渲染器重写后再统一验证。

- [ ] **Step 4: 提交**

```bash
cd d:\TraePro\fishoil\tiaoom
git add game/frontend/src/components/fish-oil-battle/renderer/entities/EffectRenderer.ts
git commit -m "feat(fish-oil-battle): 补齐闲乘月爆发时长数据驱动链路

新增 buildEntropicTouchVisualCfg() 从 WeaponRangeConfig.burstDurationSec
读取时长，triggerEntropicBurst 新增 durationMs 可选参数。"
```

---

## Task 2: 重写 EntropicTouchRenderer 数据结构与构造函数

**Files:**
- Modify: `game/frontend/src/components/fish-oil-battle/renderer/entities/EntropicTouchRenderer.ts` (L1-72 头部 + 数据结构)

**目的**：替换旧的 `ActiveAura`/`ActiveFrostbite`/`ActiveBurst` 数据结构，删除 `tempLabels` Map，为后续视觉重写打基础。

- [ ] **Step 1: 完全清空文件，写入新头部与数据结构**

用以下内容替换 `EntropicTouchRenderer.ts` 的 L1-72（从文件开头到 `setScale` 方法结束）：

```typescript
/**
 * 熵寂之触 (Entropic Touch) - 闲乘月
 * 前端视觉渲染器（重设计版）
 *
 * 设计哲学：双形态融合
 * - 普通技能（低温场/冻伤）：月华清辉派（仙气空灵）
 * - 爆发：熵寂吸光派（震撼反转）
 *
 * 视觉元素：
 * - 低温场：月轮光环 + 六角放射光线 + 月核 + 冰晶粒子
 * - 冻伤：霜花六瓣纹 + 层数细环 + 中心冰核
 * - 爆发：吸光奇点 + 事件视界环 + 能量撕裂线 + 月华长发向心被吸
 *
 * 动画驱动：全部由 update(dt) 驱动，无 requestAnimationFrame/setTimeout
 */

import * as PIXI from 'pixi.js';
import { ParticlePool } from '../systems/ParticlePool';

/** 月华主色 */
const MOON_COLOR = 0x88DDFF;
/** 月华高亮 */
const MOON_HIGHLIGHT = 0xAAFFFF;
/** 月核白 */
const MOON_CORE = 0xFFFFFF;
/** 熵寂暗紫（边缘辉光） */
const ENTROPY_PURPLE = 0x9966FF;
/** 熵寂深紫（渐变中段） */
const ENTROPY_DEEP = 0x6600CC;
/** 熵寂黑（吸光核中心） */
const ENTROPY_BLACK = 0x000000;

/** 活跃低温场实例 */
interface ActiveAura {
  container: PIXI.Container;
  moonGraphics: PIXI.Graphics;   // 月轮 + 月华晕 + 月核
  rayGraphics: PIXI.Graphics;    // 六角放射光线（独立旋转）
  particleTimer: number;
  life: number;                  // ms 累计
  maxLife: number;
  x: number;
  y: number;
  radius: number;
}

/** 活跃冻伤印记 */
interface ActiveFrostbite {
  container: PIXI.Container;
  frostGraphics: PIXI.Graphics;  // 霜花六瓣 + 层数环 + 中心冰核
  life: number;                  // ms 累计
  maxLife: number;
  stacks: number;
  themeColor: number;
}

/** 活跃爆发特效 */
interface ActiveBurst {
  container: PIXI.Container;
  coreGraphics: PIXI.Graphics;     // 吸光奇点核心（径向渐变）
  horizonGraphics: PIXI.Graphics;  // 事件视界环
  tearGraphics: PIXI.Graphics;     // 能量撕裂线
  hairGraphics: PIXI.Graphics;     // 月华长发
  life: number;                    // ms 累计
  maxLife: number;                 // 由 durationMs 决定
  themeColor: number;
  radius: number;
}

export class EntropicTouchRenderer {
  private fieldContainer: PIXI.Container;
  private particlePool: ParticlePool;
  private scale = 1;

  // 活跃实例池
  private activeAuras: Map<string, ActiveAura> = new Map();
  private activeFrostbites: Map<string, ActiveFrostbite> = new Map();
  private activeBursts: Map<string, ActiveBurst> = new Map();

  constructor(fieldContainer: PIXI.Container, particlePool: ParticlePool) {
    this.fieldContainer = fieldContainer;
    this.particlePool = particlePool;
  }

  setScale(scale: number): void {
    this.scale = scale;
    this.activeAuras.forEach(aura => {
      aura.container.scale.set(scale);
    });
    this.activeFrostbites.forEach(fb => {
      fb.container.scale.set(scale);
    });
    this.activeBursts.forEach(burst => {
      burst.container.scale.set(scale);
    });
  }
```

> 注意：保留文件 L72 之后的 `triggerAura`/`removeAura`/`triggerFrostbite`/`removeFrostbite`/`triggerBurst`/`update`/`clear` 等方法的位置，后续 Task 会逐一重写它们。现在先保留旧实现不动。

- [ ] **Step 2: 删除 `tempLabels` Map 声明**

在文件中找到（原 L57 附近）：
```typescript
private tempLabels: Map<string, PIXI.Text> = new Map();
```
删除该行（新头部中已不包含）。

- [ ] **Step 3: 暂时保留旧方法实现，构建验证**

由于后续 Task 会逐一重写方法，此步先确保新头部与旧方法能编译。若旧方法引用了已删除的字段（如 `tempLabels`、`hexGraphics`、`sealGraphics`、`vortexGraphics`），会报错 —— 这是预期的，进入 Task 3-5 逐一修复。

可选择跳过构建验证，直接进入 Task 3。

- [ ] **Step 4: 提交（可选，若不想留下半成品状态可跳过）**

```bash
git add game/frontend/src/components/fish-oil-battle/renderer/entities/EntropicTouchRenderer.ts
git commit -m "refactor(entropic-touch): 重构数据结构，删除 tempLabels"
```

---

## Task 3: 重写低温场 Aura（月华清辉派）

**Files:**
- Modify: `game/frontend/src/components/fish-oil-battle/renderer/entities/EntropicTouchRenderer.ts`

**目的**：将低温场从"六边形 + 小六边形 + 温度标签"重写为"月轮光环 + 六角放射光线 + 月核 + 冰晶粒子"。

- [ ] **Step 1: 重写 `triggerAura` 方法**

定位 `triggerAura` 方法（原 L86-132），整体替换为：

```typescript
/**
 * 触发低温场视觉效果（月华清辉派）
 * @param playerId 玩家 ID
 * @param x 逻辑坐标 X
 * @param y 逻辑坐标 Y
 * @param radius 低温场半径（逻辑 px）
 * @param themeColor 主题色（默认冰蓝）
 */
triggerAura(
  playerId: string,
  x: number,
  y: number,
  radius: number,
  themeColor = MOON_COLOR,
): void {
  const existing = this.activeAuras.get(playerId);
  if (existing) {
    existing.x = x;
    existing.y = y;
    existing.radius = radius;
    existing.container.position.set(x, y);
    return;
  }

  const container = new PIXI.Container();
  container.position.set(x, y);
  container.scale.set(this.scale);

  const moonGraphics = new PIXI.Graphics();
  const rayGraphics = new PIXI.Graphics();

  this.drawMoonAura(moonGraphics, radius, themeColor);
  this.drawMoonRays(rayGraphics, radius, themeColor);

  container.addChild(moonGraphics);
  container.addChild(rayGraphics);
  this.fieldContainer.addChild(container);

  const aura: ActiveAura = {
    container,
    moonGraphics,
    rayGraphics,
    particleTimer: 0,
    life: 0,
    maxLife: 999999,
    x,
    y,
    radius,
  };

  this.activeAuras.set(playerId, aura);
}

/** 移除低温场 */
removeAura(playerId: string): void {
  const aura = this.activeAuras.get(playerId);
  if (aura) {
    this.fieldContainer.removeChild(aura.container);
    aura.container.destroy({ children: true });
    this.activeAuras.delete(playerId);
  }
}
```

- [ ] **Step 2: 新增 `drawMoonAura` 与 `drawMoonRays` 绘制方法**

在 `removeAura` 之后插入：

```typescript
/**
 * 绘制月华光环（月华晕 + 月轮主环 + 月核）
 * 用多层同心圆叠加模拟径向渐变
 */
private drawMoonAura(g: PIXI.Graphics, radius: number, color: number): void {
  g.clear();

  // 月华外晕：多层同心圆叠加（中心白 → 冰蓝 → 透明）
  const layers = 8;
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1); // 0 → 1
    const r = radius * (1 - t * 0.7);
    // 颜色从白渐变到主题色
    const colorVal = this.interpolateColor(MOON_CORE, color, t);
    // alpha 从中心 0.15 → 边缘 0.05
    const alpha = 0.15 - t * 0.10;
    g.circle(0, 0, r);
    g.fill({ color: colorVal, alpha });
  }

  // 月轮主环（双层）
  g.circle(0, 0, radius);
  g.stroke({ color: MOON_HIGHLIGHT, width: 1, alpha: 0.7 });
  g.circle(0, 0, radius * 0.93);
  g.stroke({ color: MOON_CORE, width: 0.4, alpha: 0.5 });

  // 中心月核
  g.circle(0, 0, 4);
  g.fill({ color: MOON_CORE, alpha: 0.9 });
  g.circle(0, 0, 6);
  g.stroke({ color: MOON_HIGHLIGHT, width: 0.5, alpha: 0.6 });
}

/**
 * 绘制六角放射光线（冰晶折射感）
 * 6 条短线从内环到外环，60° 均分
 */
private drawMoonRays(g: PIXI.Graphics, radius: number, color: number): void {
  g.clear();
  const innerR = radius * 0.65;
  const outerR = radius * 1.05;
  g.setStrokeStyle({ width: 0.6, color: MOON_HIGHLIGHT, alpha: 0.7, cap: 'round' });

  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const x1 = Math.cos(angle) * innerR;
    const y1 = Math.sin(angle) * innerR;
    const x2 = Math.cos(angle) * outerR;
    const y2 = Math.sin(angle) * outerR;
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  }
}

/** 颜色插值工具：from → to，t∈[0,1] */
private interpolateColor(from: number, to: number, t: number): number {
  const fr = (from >> 16) & 0xff;
  const fg = (from >> 8) & 0xff;
  const fb = from & 0xff;
  const tr = (to >> 16) & 0xff;
  const tg = (to >> 8) & 0xff;
  const tb = to & 0xff;
  const r = Math.round(fr + (tr - fr) * t);
  const g = Math.round(fg + (tg - fg) * t);
  const b = Math.round(fb + (tb - fb) * t);
  return (r << 16) | (g << 8) | b;
}
```

> 注意：PixiJS v8 Graphics 的 `setStrokeStyle` 是新 API。若构建报错，改用传统写法：每次 `g.moveTo/lineTo` 后调用 `g.stroke({ color, width, alpha, cap })`。

- [ ] **Step 3: 删除旧方法 `drawAuraHex`、`drawTinyHex`、`spawnIceCrystals`、`animateParticle`、`showTempLabel`**

在文件中搜索并删除以下方法（原 L152-260 附近）：
- `drawAuraHex()`
- `drawTinyHex()`
- `spawnIceCrystals()`（旧版，会在 Step 4 用 ParticlePool 版本替代）
- `animateParticle()`
- `showTempLabel()`

- [ ] **Step 4: 新增基于 ParticlePool 的冰晶粒子生成方法**

在 `drawMoonRays` 之后插入：

```typescript
/**
 * 生成冰晶粒子（从月核向外飘散）
 * 使用 ParticlePool，由其内部 update 驱动
 */
private spawnIceParticles(x: number, y: number, radius: number, color: number): void {
  const count = 2;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 30 + Math.random() * 20;
    this.particlePool.emit({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1500,
      scaleStart: 1,
      scaleEnd: 0,
      alphaStart: 0.8,
      alphaEnd: 0,
      tint: color,
      radius: 2 + Math.random() * 2,
      rotationSpeed: (Math.random() - 0.5) * 4,
    });
  }
}
```

- [ ] **Step 5: 重写 `update` 方法中的低温场部分**

定位 `update(dt)` 方法（原 L566 附近），将低温场的更新逻辑替换为：

```typescript
update(dt: number): void {
  // 更新低温场（月华呼吸 + 光线旋转 + 粒子生成）
  this.activeAuras.forEach((aura) => {
    aura.life += dt;

    // 月轮呼吸：scale 1.0 ↔ 1.05，周期 2s
    const breath = 1 + 0.05 * Math.sin(aura.life * 0.001 * Math.PI);
    aura.moonGraphics.scale.set(breath);

    // 月华晕脉动：alpha 0.6 ↔ 0.9
    const pulse = 0.75 + 0.15 * Math.sin(aura.life * 0.001 * Math.PI);
    aura.moonGraphics.alpha = pulse;

    // 六角光线旋转：0.5 转/秒
    aura.rayGraphics.rotation += dt * 0.001 * Math.PI;

    // 冰晶粒子：每 1.5s 生成 1-2 个
    aura.particleTimer += dt;
    if (aura.particleTimer > 1500) {
      aura.particleTimer = 0;
      this.spawnIceParticles(aura.x, aura.y, aura.radius * this.scale, MOON_COLOR);
    }
  });

  // 更新冻伤印记（自动过期）—— Task 4 会重写
  this.activeFrostbites.forEach((fb, targetId) => {
    fb.life += dt;
    if (fb.life >= fb.maxLife) {
      this.removeFrostbite(targetId);
    }
  });

  // 更新爆发特效（自动过期）—— Task 5 会重写
  this.activeBursts.forEach((burst, playerId) => {
    burst.life += dt;
    if (burst.life >= burst.maxLife) {
      this.removeBurst(playerId);
    }
  });
}

/** 移除爆发特效 */
private removeBurst(playerId: string): void {
  const burst = this.activeBursts.get(playerId);
  if (burst) {
    this.fieldContainer.removeChild(burst.container);
    burst.container.destroy({ children: true });
    this.activeBursts.delete(playerId);
  }
}
```

- [ ] **Step 6: 构建验证**

Run: `cd d:\TraePro\fishoil\tiaoom\game\frontend && npm run build`
Expected: 编译通过。若有 `drawAuraHex`/`drawTinyHex` 等旧方法引用残留报错，回到 Step 3 确认已全部删除。

- [ ] **Step 7: 提交**

```bash
cd d:\TraePro\fishoil\tiaoom
git add game/frontend/src/components/fish-oil-battle/renderer/entities/EntropicTouchRenderer.ts
git commit -m "feat(entropic-touch): 重写低温场为月华清辉派

- 六边形 → 月轮光环 + 径向渐变月华晕
- 小六边形 → 六角放射光线（冰晶折射感）
- 温度标签彩蛋废弃
- 冰晶粒子改用 ParticlePool.emit
- 动画统一由 update(dt) 驱动"
```

---

## Task 4: 重写冻伤 Frostbite（霜花六瓣纹）

**Files:**
- Modify: `game/frontend/src/components/fish-oil-battle/renderer/entities/EntropicTouchRenderer.ts`

**目的**：将冻伤从"矩形印章 + 加粗同心环"重写为"霜花六瓣纹 + 层数细环 + 中心冰核"。

- [ ] **Step 1: 重写 `triggerFrostbite` 方法**

定位 `triggerFrostbite` 方法，整体替换为：

```typescript
/**
 * 触发冻伤叠加视觉效果（霜花六瓣纹）
 * @param targetId 目标玩家 ID
 * @param x 逻辑坐标 X
 * @param y 逻辑坐标 Y
 * @param stacks 当前冻伤层数
 * @param themeColor 主题色
 */
triggerFrostbite(
  targetId: string,
  x: number,
  y: number,
  stacks: number,
  themeColor = MOON_COLOR,
): void {
  const existing = this.activeFrostbites.get(targetId);
  if (existing) {
    existing.stacks = stacks;
    existing.themeColor = themeColor;
    this.drawFrostFlower(existing.frostGraphics, stacks, themeColor);
    return;
  }

  const container = new PIXI.Container();
  container.position.set(x, y);
  container.scale.set(this.scale);

  const frostGraphics = new PIXI.Graphics();
  this.drawFrostFlower(frostGraphics, stacks, themeColor);

  container.addChild(frostGraphics);
  this.fieldContainer.addChild(container);

  const fb: ActiveFrostbite = {
    container,
    frostGraphics,
    life: 0,
    maxLife: 5000, // 与后端 field.durationSec 一致（5s）
    stacks,
    themeColor,
  };

  this.activeFrostbites.set(targetId, fb);
}

/** 移除冻伤 */
removeFrostbite(targetId: string): void {
  const fb = this.activeFrostbites.get(targetId);
  if (fb) {
    this.fieldContainer.removeChild(fb.container);
    fb.container.destroy({ children: true });
    this.activeFrostbites.delete(targetId);
  }
}
```

- [ ] **Step 2: 新增 `drawFrostFlower` 绘制方法**

在 `removeFrostbite` 之后插入：

```typescript
/**
 * 绘制霜花六瓣纹（雪花结构 + 层数环 + 中心冰核）
 * @param g Graphics 对象
 * @param stacks 冻伤层数（1-3）
 * @param color 主题色
 */
private drawFrostFlower(g: PIXI.Graphics, stacks: number, color: number): void {
  g.clear();

  const baseRadius = 25;

  // 霜花光晕：多层同心圆叠加（中心白 → 冰蓝 → 透明）
  const layers = 6;
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    const r = baseRadius * (1 - t * 0.6);
    const colorVal = this.interpolateColor(MOON_CORE, color, t);
    const alpha = 0.2 - t * 0.15;
    g.circle(0, 0, r);
    g.fill({ color: colorVal, alpha });
  }

  // 霜花六瓣：3 条贯穿线 + 6 组分叉
  g.setStrokeStyle({ width: 1, color: MOON_HIGHLIGHT, alpha: 0.9, cap: 'round' });
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI) / 3;
    const x1 = Math.cos(angle) * baseRadius * 0.7;
    const y1 = Math.sin(angle) * baseRadius * 0.7;
    const x2 = -x1;
    const y2 = -y1;
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();

    // 分叉短线（在每条线的 1/3 和 2/3 处）
    for (let j = 1; j <= 2; j++) {
      const t = j / 3;
      const px = x1 + (x2 - x1) * t;
      const py = y1 + (y2 - y1) * t;
      const branchLen = baseRadius * 0.25;
      const perpAngle = angle + Math.PI / 2;
      g.moveTo(px, py);
      g.lineTo(px + Math.cos(perpAngle) * branchLen, py + Math.sin(perpAngle) * branchLen);
      g.stroke();
      g.moveTo(px, py);
      g.lineTo(px - Math.cos(perpAngle) * branchLen, py - Math.sin(perpAngle) * branchLen);
      g.stroke();
    }
  }

  // 层数环（外圈细环累加，每层 +4px 半径，alpha 递减）
  for (let i = 0; i < stacks; i++) {
    const ringR = baseRadius + 8 + i * 4;
    const alpha = 0.4 - i * 0.1;
    g.circle(0, 0, ringR);
    g.stroke({ color: MOON_HIGHLIGHT, width: 0.4, alpha });
  }

  // 中心冰核
  g.circle(0, 0, 3);
  g.fill({ color: MOON_CORE, alpha: 1 });
}
```

- [ ] **Step 3: 删除旧方法 `drawCouncilSeal`、`drawIceThickness`、`animateSealStamp`**

在文件中搜索并删除这三个方法。

- [ ] **Step 4: 构建验证**

Run: `cd d:\TraePro\fishoil\tiaoom\game\frontend && npm run build`
Expected: 编译通过

- [ ] **Step 5: 提交**

```bash
cd d:\TraePro\fishoil\tiaoom
git add game/frontend/src/components/fish-oil-battle/renderer/entities/EntropicTouchRenderer.ts
git commit -m "feat(entropic-touch): 重写冻伤为霜花六瓣纹

- 矩形印章废弃 → 霜花六瓣纹（3条贯穿线+6组分叉）
- 加粗同心环 → 外圈细环累加（alpha 递减）
- 加径向渐变光晕
- 中心冰核高亮"
```

---

## Task 5: 重写爆发 Burst（熵寂吸光派 + 三阶段动画）

**Files:**
- Modify: `game/frontend/src/components/fish-oil-battle/renderer/entities/EntropicTouchRenderer.ts`

**目的**：将爆发从"单色螺旋 + 黑点 + 平行面条 + 调试文字"重写为"吸光奇点 + 事件视界环 + 能量撕裂线 + 月华长发向心被吸"，并实现三阶段戏剧动画。

- [ ] **Step 1: 重写 `triggerBurst` 方法，新增 `durationMs` 参数**

定位 `triggerBurst` 方法，整体替换为：

```typescript
/**
 * 触发爆发视觉效果（熵寂吸光派）
 * @param playerId 玩家 ID
 * @param x 逻辑坐标 X
 * @param y 逻辑坐标 Y
 * @param radius 爆发范围（逻辑 px）
 * @param themeColor 主题色（默认冰蓝）
 * @param durationMs 持续时长（ms），由 EffectRenderer 从 WeaponRangeConfig 传入
 */
triggerBurst(
  playerId: string,
  x: number,
  y: number,
  radius: number,
  themeColor = MOON_COLOR,
  durationMs?: number,
): void {
  // 移除已有爆发
  this.removeBurst(playerId);

  const container = new PIXI.Container();
  container.position.set(x, y);
  container.scale.set(this.scale);

  const coreGraphics = new PIXI.Graphics();
  const horizonGraphics = new PIXI.Graphics();
  const tearGraphics = new PIXI.Graphics();
  const hairGraphics = new PIXI.Graphics();

  // 初始绘制（update 会按阶段重绘）
  this.drawSingularityCore(coreGraphics, radius, themeColor, 0);
  this.drawEventHorizon(horizonGraphics, radius, 0);
  this.drawTearLines(tearGraphics, radius, 0);
  this.drawMoonHair(hairGraphics, radius, 0);

  container.addChild(coreGraphics);
  container.addChild(horizonGraphics);
  container.addChild(tearGraphics);
  container.addChild(hairGraphics);
  this.fieldContainer.addChild(container);

  const burst: ActiveBurst = {
    container,
    coreGraphics,
    horizonGraphics,
    tearGraphics,
    hairGraphics,
    life: 0,
    maxLife: durationMs ?? 5000,
    themeColor,
    radius,
  };

  this.activeBursts.set(playerId, burst);
}
```

- [ ] **Step 2: 新增 `drawSingularityCore` 绘制方法**

在 `triggerBurst` 之后插入：

```typescript
/**
 * 绘制吸光奇点核心（径向渐变：黑 → 暗紫 → 冰蓝 → 透明）
 * 用多层同心圆叠加模拟径向渐变
 * @param g Graphics 对象
 * @param radius 爆发半径
 * @param color 主题色
 * @param progress 阶段进度 [0,1]（阶段2-3 用）
 */
private drawSingularityCore(g: PIXI.Graphics, radius: number, color: number, progress: number): void {
  g.clear();

  // 吸光奇点：多层同心圆叠加（黑 → 暗紫 → 冰蓝 → 透明）
  const layers = 10;
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1); // 0 → 1（中心到边缘）
    const r = radius * (1 - t * 0.5);
    // 颜色：黑 → 暗紫 → 冰蓝
    let colorVal: number;
    if (t < 0.3) {
      colorVal = this.interpolateColor(ENTROPY_BLACK, ENTROPY_DEEP, t / 0.3);
    } else if (t < 0.7) {
      colorVal = this.interpolateColor(ENTROPY_DEEP, ENTROPY_PURPLE, (t - 0.3) / 0.4);
    } else {
      colorVal = this.interpolateColor(ENTROPY_PURPLE, color, (t - 0.7) / 0.3);
    }
    const alpha = 0.25 - t * 0.20;
    g.circle(0, 0, r);
    g.fill({ color: colorVal, alpha });
  }

  // 中心吸光核（纯黑）+ 紫色边缘辉光
  const coreR = 6 + progress * 2; // 阶段2-3 核心略扩大
  g.circle(0, 0, coreR);
  g.fill({ color: ENTROPY_BLACK, alpha: 1 });
  g.circle(0, 0, coreR + 1);
  g.stroke({ color: ENTROPY_PURPLE, width: 0.5, alpha: 0.9 });
}
```

- [ ] **Step 3: 新增 `drawEventHorizon` 绘制方法**

在 `drawSingularityCore` 之后插入：

```typescript
/**
 * 绘制事件视界环（双层细高亮环）
 * @param g Graphics 对象
 * @param radius 爆发半径
 * @param scale 当前 scale（阶段2从0展开到1，阶段3从1扩散到2）
 */
private drawEventHorizon(g: PIXI.Graphics, radius: number, scale: number): void {
  g.clear();
  if (scale <= 0) return;

  const r = radius * 0.3 * scale;
  // 外环
  g.circle(0, 0, r);
  g.stroke({ color: MOON_HIGHLIGHT, width: 0.6, alpha: 0.7 * Math.max(0, 1 - (scale - 1)) });
  // 内环
  g.circle(0, 0, r * 0.9);
  g.stroke({ color: MOON_CORE, width: 0.3, alpha: 0.5 * Math.max(0, 1 - (scale - 1)) });
}
```

- [ ] **Step 4: 新增 `drawTearLines` 绘制方法**

在 `drawEventHorizon` 之后插入：

```typescript
/**
 * 绘制能量撕裂线（6 条 bezier 从外向内汇聚）
 * @param g Graphics 对象
 * @param radius 爆发半径
 * @param alpha 当前 alpha（阶段2从0闪现到0.8，阶段3从0.8消散到0）
 */
private drawTearLines(g: PIXI.Graphics, radius: number, alpha: number): void {
  g.clear();
  if (alpha <= 0) return;

  g.setStrokeStyle({ width: 1, color: MOON_HIGHLIGHT, alpha, cap: 'round' });

  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3 + Math.PI / 6;
    // 起点（外端）
    const x1 = Math.cos(angle) * radius;
    const y1 = Math.sin(angle) * radius;
    // 中点（控制点）
    const cx = Math.cos(angle) * radius * 0.5;
    const cy = Math.sin(angle) * radius * 0.5;
    // 终点（内端，吸光核附近）
    const x2 = Math.cos(angle) * 8;
    const y2 = Math.sin(angle) * 8;

    g.moveTo(x1, y1);
    g.quadraticCurveTo(cx, cy, x2, y2);
    g.stroke();
  }
}
```

- [ ] **Step 5: 新增 `drawMoonHair` 绘制方法**

在 `drawTearLines` 之后插入：

```typescript
/**
 * 绘制月华长发（4 条非平行 bezier，向心被吸）
 * @param g Graphics 对象
 * @param radius 爆发半径
 * @param alpha 当前 alpha
 */
private drawMoonHair(g: PIXI.Graphics, radius: number, alpha: number): void {
  g.clear();
  if (alpha <= 0) return;

  // 4 条长发：左右各 2（主细搭配），非平行，向奇点汇聚
  const hairs = [
    { startX: -radius * 0.7, startY: -radius * 0.9, ctrlX: -radius * 0.4, ctrlY: -radius * 0.4, width: 1.2 },
    { startX: -radius * 0.5, startY: -radius * 0.95, ctrlX: -radius * 0.2, ctrlY: -radius * 0.4, width: 0.8 },
    { startX: radius * 0.7, startY: -radius * 0.9, ctrlX: radius * 0.4, ctrlY: -radius * 0.4, width: 1.2 },
    { startX: radius * 0.5, startY: -radius * 0.95, ctrlX: radius * 0.2, ctrlY: -radius * 0.4, width: 0.8 },
  ];

  for (const h of hairs) {
    g.setStrokeStyle({ width: h.width, color: MOON_COLOR, alpha: alpha * 0.7, cap: 'round' });
    g.moveTo(h.startX, h.startY);
    g.quadraticCurveTo(h.ctrlX, h.ctrlY, 0, 0);
    g.stroke();
  }
}
```

- [ ] **Step 6: 删除旧方法 `drawVortex`、`drawHairAfterimage`、`showBurstText`、`animateVortex`、`animateBurstText`**

在文件中搜索并删除这五个方法。

- [ ] **Step 7: 重写 `update` 方法中的爆发部分（三阶段动画）**

将 `update` 方法中爆发部分替换为：

```typescript
  // 更新爆发特效（三阶段戏剧动画）
  this.activeBursts.forEach((burst, playerId) => {
    burst.life += dt;
    const T = burst.maxLife;
    const life = burst.life;

    if (life >= T) {
      this.removeBurst(playerId);
      return;
    }

    // 阶段划分：0.15T / 0.10T / 0.75T
    const phase1End = T * 0.15;
    const phase2End = T * 0.25;

    if (life < phase1End) {
      // 阶段 1：蓄压（0 ~ 0.15T）
      const t = life / phase1End; // 0 → 1
      // 月华从外围收缩向中心：scale 1.0 → 0.3
      const scale = 1.0 - 0.7 * t;
      burst.coreGraphics.scale.set(scale);
      // 光线变暗：alpha 1.0 → 0.3
      burst.coreGraphics.alpha = 1.0 - 0.7 * t;
      // 吸光核逐渐显现：alpha 0 → 1
      this.drawSingularityCore(burst.coreGraphics, burst.radius, burst.themeColor, t * 0.3);
      burst.coreGraphics.scale.set(scale);
      burst.coreGraphics.alpha = 1.0 - 0.7 * t;

    } else if (life < phase2End) {
      // 阶段 2：坍缩（0.15T ~ 0.25T）
      const t = (life - phase1End) / (phase2End - phase1End); // 0 → 1
      const easeT = this.easeOutCubic(t);
      // 奇点爆发：吸光核 scale 0.3 → 1.0
      const scale = 0.3 + 0.7 * easeT;
      burst.coreGraphics.scale.set(scale);
      burst.coreGraphics.alpha = 0.3 + 0.7 * easeT;
      this.drawSingularityCore(burst.coreGraphics, burst.radius, burst.themeColor, 0.3 + 0.7 * easeT);

      // 能量撕裂线闪现：alpha 0 → 0.8
      const tearAlpha = 0.8 * easeT;
      this.drawTearLines(burst.tearGraphics, burst.radius, tearAlpha);

      // 事件视界环展开：scale 0 → 1.0
      const horizonScale = easeT;
      this.drawEventHorizon(burst.horizonGraphics, burst.radius, horizonScale);

      // 月华长发开始显现
      this.drawMoonHair(burst.hairGraphics, burst.radius, easeT * 0.7);

    } else {
      // 阶段 3：扩散（0.25T ~ T）
      const t = (life - phase2End) / (T - phase2End); // 0 → 1
      // 吸光核保持但逐渐透明：alpha 1.0 → 0.3
      burst.coreGraphics.alpha = 1.0 - 0.7 * t;
      this.drawSingularityCore(burst.coreGraphics, burst.radius, burst.themeColor, 1.0);

      // 事件视界环持续扩散：scale 1.0 → 2.0，alpha 1.0 → 0
      const horizonScale = 1.0 + 1.0 * t;
      this.drawEventHorizon(burst.horizonGraphics, burst.radius, horizonScale);

      // 月华长发飘逸消散：alpha 0.7 → 0，位置波动
      const hairAlpha = 0.7 * (1 - t);
      // 用 rotation 模拟飘逸
      burst.hairGraphics.rotation = Math.sin(life * 0.003) * 0.1;
      this.drawMoonHair(burst.hairGraphics, burst.radius, hairAlpha);

      // 能量撕裂线逐渐消散：alpha 0.8 → 0
      const tearAlpha = 0.8 * (1 - t);
      this.drawTearLines(burst.tearGraphics, burst.radius, tearAlpha);
    }
  });
```

- [ ] **Step 8: 新增 `easeOutCubic` 工具方法**

在 `interpolateColor` 之后插入：

```typescript
/** easeOutCubic 缓动函数 */
private easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
```

- [ ] **Step 9: 构建验证**

Run: `cd d:\TraePro\fishoil\tiaoom\game\frontend && npm run build`
Expected: 编译通过

- [ ] **Step 10: 提交**

```bash
cd d:\TraePro\fishoil\tiaoom
git add game/frontend/src/components/fish-oil-battle/renderer/entities/EntropicTouchRenderer.ts
git commit -m "feat(entropic-touch): 重写爆发为熵寂吸光派+三阶段动画

- 单色螺旋 → 径向渐变吸光奇点（黑→暗紫→冰蓝→透明）
- 黑色圆点 → 事件视界环 + 中心吸光核
- 5条平行面条 → 月华长发向心被吸（非平行bezier）
- 新增能量撕裂线（6条从外向内汇聚）
- 剔除调试文字（>最优解执行中... 等）
- 三阶段戏剧动画：蓄压(0.15T)→坍缩(0.10T)→扩散(0.75T)
- 时长数据驱动：由 EffectRenderer 传入 durationMs"
```

---

## Task 6: 最终验证与清理

**Files:**
- Verify: `game/frontend/src/components/fish-oil-battle/renderer/entities/EntropicTouchRenderer.ts`
- Verify: `game/frontend/src/components/fish-oil-battle/renderer/entities/EffectRenderer.ts`

- [ ] **Step 1: 检查 EntropicTouchRenderer 无遗留旧代码**

在 `EntropicTouchRenderer.ts` 中搜索以下关键词，确认全部已删除：
- `drawAuraHex`
- `drawTinyHex`
- `drawCouncilSeal`
- `drawIceThickness`
- `drawVortex`
- `drawHairAfterimage`
- `showBurstText`
- `showTempLabel`
- `animateParticle`
- `animateSealStamp`
- `animateVortex`
- `animateBurstText`
- `tempLabels`
- `requestAnimationFrame`
- `setTimeout`
- `hexGraphics`
- `sealGraphics`
- `iceGraphics`
- `vortexGraphics`
- `textContainer`
- `hairGraphics`（注意：新代码也有 hairGraphics，是 burst.hairGraphics，正常）
- `0x6600CC`（旧暗紫常量，应改为 ENTROPY_DEEP 常量）

若有残留，删除对应代码。

- [ ] **Step 2: 检查 API 兼容性**

确认以下方法签名（与 `EffectRenderer.ts` 调用方匹配）：
- `triggerAura(playerId, x, y, radius, themeColor?)` ✅
- `removeAura(playerId)` ✅
- `triggerFrostbite(targetId, x, y, stacks, themeColor?)` ✅
- `removeFrostbite(targetId)` ✅
- `triggerBurst(playerId, x, y, radius, themeColor?, durationMs?)` ✅（新增 durationMs）
- `update(dt)` ✅
- `setScale(scale)` ✅
- `clear()` ✅

- [ ] **Step 3: 检查 `clear` 方法实现**

确认 `clear()` 方法清理了所有三个 Map：

```typescript
clear(): void {
  this.activeAuras.forEach((aura, playerId) => this.removeAura(playerId));
  this.activeFrostbites.forEach((fb, targetId) => this.removeFrostbite(targetId));
  this.activeBursts.forEach((_, playerId) => this.removeBurst(playerId));
}
```

若旧 `clear` 实现不完整，替换为上述实现。

- [ ] **Step 4: 最终构建验证**

Run: `cd d:\TraePro\fishoil\tiaoom\game\frontend && npm run build`
Expected: 编译通过，无 TypeScript 错误

- [ ] **Step 5: 提交（若有清理改动）**

```bash
cd d:\TraePro\fishoil\tiaoom
git add game/frontend/src/components/fish-oil-battle/renderer/entities/EntropicTouchRenderer.ts
git commit -m "chore(entropic-touch): 清理遗留旧代码，确保 API 兼容"
```

---

## 自审

**Spec 覆盖检查**：
- ✅ Section 2.1.1 低温场月华清辉 → Task 3
- ✅ Section 2.1.2 冻伤霜花六瓣纹 → Task 4
- ✅ Section 2.2 爆发熵寂吸光 → Task 5
- ✅ Section 2.2.2 三阶段动画 → Task 5 Step 7
- ✅ Section 3.1.1 数据驱动链路 → Task 1
- ✅ Section 3.3 动画驱动迁移（移除 rAF/setTimeout）→ Task 3/5
- ✅ Section 3.4 数据结构更新 → Task 2
- ✅ Section 3.5 删除项清单 → Task 3/4/5 + Task 6
- ✅ Section 4.4 API 兼容性 → Task 6 Step 2
- ✅ Section 5 验收标准 → Task 6

**Placeholder 扫描**：无 TBD/TODO/未定义引用。所有代码块完整。

**类型一致性**：
- `MOON_COLOR` / `MOON_HIGHLIGHT` / `MOON_CORE` / `ENTROPY_PURPLE` / `ENTROPY_DEEP` / `ENTROPY_BLACK` 常量在 Task 2 定义，Task 3/4/5 使用 ✅
- `ActiveAura.moonGraphics` / `rayGraphics` 在 Task 2 定义，Task 3 使用 ✅
- `ActiveFrostbite.frostGraphics` 在 Task 2 定义，Task 4 使用 ✅
- `ActiveBurst.coreGraphics` / `horizonGraphics` / `tearGraphics` / `hairGraphics` 在 Task 2 定义，Task 5 使用 ✅
- `interpolateColor` 在 Task 3 Step 2 定义，Task 4/5 使用 ✅
- `easeOutCubic` 在 Task 5 Step 8 定义，Task 5 Step 7 使用 ✅
- `removeBurst` 在 Task 3 Step 5 定义，Task 5 使用 ✅
- `spawnIceParticles` 在 Task 3 Step 4 定义，Task 3 Step 5 使用 ✅
