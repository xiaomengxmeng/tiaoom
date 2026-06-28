# 武器视觉辨识度与伤害反馈差异化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 12 个角色武器装饰器系统 + 6 种受击反馈差异化 + 4 个关键武器 PhysicsObstacle 物理化 + 特效页尺寸对齐实战

**Architecture:** 装饰器模式（WeaponDecorator 抽象基类 + 12 个具体子类 + 工厂函数） + 后端 HIT_FEEDBACK VISUAL_ONLY 事件 + 前端 PlayerRenderer 受击方法参数化 + 4 个武器复用防火墙 getObstacles/onObstacleHit 双钩子模式 + 特效页画布缩到 800×450

**Tech Stack:** TypeScript + PixiJS v8 + Vue 3 + Node.js 后端

**Spec:** `docs/superpowers/specs/2026-06-28-weapon-visual-identity-design.md`

---

## 文件结构

### 新建文件（2 个）
- `game/frontend/src/components/fish-oil-battle/renderer/entities/decorators/WeaponDecorator.ts` — 装饰器抽象基类
- `game/frontend/src/components/fish-oil-battle/renderer/entities/decorators/WeaponDecorators.ts` — 12 个具体装饰器 + 工厂函数

### 修改文件（16 个）
- `game/backend/src/games/fish-oil-battle/config/GameEnums.ts` — 新增 `HIT_FEEDBACK` VisualEventType
- `game/backend/src/games/fish-oil-battle/shared/protocol.ts` — 新增 `HitReaction` 类型 + `hitReaction` 字段
- `game/backend/src/games/fish-oil-battle/core/IWeapon.ts` — 新增 `getHitReaction?()` 可选方法
- `game/backend/src/games/fish-oil-battle/core/WeaponScheduler.ts` — applyWeaponEffects 收集 HIT_FEEDBACK
- `game/backend/src/games/fish-oil-battle/config/WeaponRangeConfig.ts` — 12 个武器新增 hitReaction 配置
- `game/backend/src/games/fish-oil-battle/skills/weapons/DischargeCatWeapon.ts` — 实现 getHitReaction + 物理化（不在本批）
- `game/backend/src/games/fish-oil-battle/skills/weapons/OpticalSlashWeapon.ts` — 物理化 getObstacles/onObstacleHit
- `game/backend/src/games/fish-oil-battle/skills/weapons/AirRepulsionFieldWeapon.ts` — 锚点 PhysicsObstacle
- `game/backend/src/games/fish-oil-battle/skills/weapons/FluidMasteryWeapon.ts` — 漩涡 PhysicsObstacle
- `game/backend/src/games/fish-oil-battle/skills/weapons/MemoryCorridorWeapon.ts` — 回响 PhysicsObstacle
- `game/frontend/src/components/fish-oil-battle/renderer/entities/PlayerRenderer.ts` — playHitEffect(reaction) + setStatusEffect + setWeaponDecorator
- `game/frontend/src/components/fish-oil-battle/renderer/CyberFishRenderer.ts` — HIT_FEEDBACK 转发 + 装饰器集成
- `game/frontend/src/components/fish-oil-battle/renderer/entities/EffectRenderer.ts` — triggerHitFeedback
- `game/frontend/src/components/fish-oil-battle/useFishOilBattle.ts` — HIT_FEEDBACK case
- `game/frontend/src/components/fish-oil-battle/components/BattleTestPanel.vue` — HIT_FEEDBACK case
- `game/frontend/src/components/fish-oil-battle/test/effectRegistry.ts` — HIT_FEEDBACK case
- `game/frontend/src/components/fish-oil-battle/test/EffectTestPage.vue` — 画布 800×450 + scale=0.625

---

## Task 1: 新建 WeaponDecorator 抽象基类

**Files:**
- Create: `game/frontend/src/components/fish-oil-battle/renderer/entities/decorators/WeaponDecorator.ts`

- [ ] **Step 1: 创建抽象基类文件**

```typescript
// game/frontend/src/components/fish-oil-battle/renderer/entities/decorators/WeaponDecorator.ts
import * as PIXI from 'pixi.js';
import type { Palette } from '../BaseWeaponEffectRenderer';

/**
 * 武器装饰器抽象基类
 *
 * 装饰器挂在小球 avatar 圆形 mask 之外，随小球 scale/position 同步。
 * 不绘制球体本身（球体来自头像）。
 *
 * 子类按类型分为 4 种：
 * - TopDecorator（顶部装饰）
 * - OrbitDecorator（环绕旋转）
 * - OuterRingDecorator（外圈纹路）
 * - SideDecorator（侧挂缠绕）
 */
export abstract class WeaponDecorator {
  protected container: PIXI.Container;
  protected palette: Palette;
  protected scale = 1;
  protected burstActive = false;

  constructor(parentContainer: PIXI.Container, palette: Palette) {
    this.container = new PIXI.Container();
    this.palette = palette;
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

  /** 每帧更新（由 PlayerRenderer.update 驱动，用于公转/呼吸等动画） */
  abstract update(dt: number): void;

  /** 爆发态切换（部分装饰有变化，默认空实现） */
  setBurstMode(active: boolean): void {
    this.burstActive = active;
  }

  /** 销毁 */
  destroy(): void {
    if (!this.container.destroyed) {
      this.container.destroy({ children: true });
    }
  }
}
```

- [ ] **Step 2: 编译验证**

Run: `cd game/frontend && npx vite build`
Expected: 构建成功（无类型错误）

- [ ] **Step 3: Commit**

```bash
git add game/frontend/src/components/fish-oil-battle/renderer/entities/decorators/WeaponDecorator.ts
git commit -m "feat: 新建 WeaponDecorator 抽象基类"
```

---

## Task 2: 新建 12 个具体装饰器 + 工厂函数

**Files:**
- Create: `game/frontend/src/components/fish-oil-battle/renderer/entities/decorators/WeaponDecorators.ts`

- [ ] **Step 1: 创建 12 个装饰器类 + 工厂函数**

```typescript
// game/frontend/src/components/fish-oil-battle/renderer/entities/decorators/WeaponDecorators.ts
import * as PIXI from 'pixi.js';
import { WeaponId } from '$/backend/src/games/fish-oil-battle/config/GameEnums';
import { WeaponDecorator } from './WeaponDecorator';
import type { Palette } from '../BaseWeaponEffectRenderer';

// ════════════════════════════════════════════════════════
// 顶部装饰（3 个）
// ════════════════════════════════════════════════════════

/** 放电猫猫 - 圆润猫耳（宽矮三角，底部延伸被球遮挡） */
export class CatEarDecorator extends WeaponDecorator {
  private earGraphics: PIXI.Graphics;
  private earPhase = 0;

  constructor(parent: PIXI.Container, palette: Palette) {
    super(parent, palette);
    this.earGraphics = new PIXI.Graphics();
    this.container.addChild(this.earGraphics);
    this.drawEars();
  }

  private drawEars(): void {
    const g = this.earGraphics;
    g.clear();
    const primary = this.palette.primary;
    const accent = this.palette.accent;

    // 左耳：宽矮圆润三角，底部 y=8 延伸到球内
    g.moveTo(-14, 8);
    g.quadraticCurveTo(-20, -6, -10, -14);
    g.quadraticCurveTo(-6, -16, -4, -8);
    g.closePath();
    g.fill({ color: primary });
    g.stroke({ color: 0xCC8800, width: 1, join: 'round' });

    // 左内耳：粉色
    g.moveTo(-12, 4);
    g.quadraticCurveTo(-15, -4, -10, -10);
    g.quadraticCurveTo(-7, -10, -6, -4);
    g.closePath();
    g.fill({ color: 0xFFB3D9 });

    // 右耳
    g.moveTo(14, 8);
    g.quadraticCurveTo(20, -6, 10, -14);
    g.quadraticCurveTo(6, -16, 4, -8);
    g.closePath();
    g.fill({ color: primary });
    g.stroke({ color: 0xCC8800, width: 1, join: 'round' });

    g.moveTo(12, 4);
    g.quadraticCurveTo(15, -4, 10, -10);
    g.quadraticCurveTo(7, -10, 6, -4);
    g.closePath();
    g.fill({ color: 0xFFB3D9 });
  }

  update(dt: number): void {
    // 爆发态猫耳抖动
    if (this.burstActive) {
      this.earPhase += dt * 0.02;
      this.earGraphics.y = Math.sin(this.earPhase) * 1;
    } else {
      this.earGraphics.y = 0;
    }
  }

  setBurstMode(active: boolean): void {
    super.setBurstMode(active);
    // 爆发时猫耳变亮
    this.earGraphics.tint = active ? 0xFFEE88 : 0xFFFFFF;
  }
}

/** 流体操控(KE) - 漂浮古籍 */
export class FloatingBookDecorator extends WeaponDecorator {
  private bookGraphics: PIXI.Graphics;
  private phase = 0;

  constructor(parent: PIXI.Container, palette: Palette) {
    super(parent, palette);
    this.bookGraphics = new PIXI.Graphics();
    this.container.addChild(this.bookGraphics);
    this.drawBook();
  }

  private drawBook(): void {
    const g = this.bookGraphics;
    g.clear();
    // 漂浮光晕
    g.circle(0, -18, 16);
    g.fill({ color: this.palette.accent, alpha: 0.15 });
    // 翻开古籍（-8° 倾斜）
    g.rotation = -0.14;
    // 左页
    g.moveTo(-12, -16);
    g.lineTo(-1, -18);
    g.lineTo(-1, -2);
    g.lineTo(-12, 0);
    g.closePath();
    g.fill({ color: 0xF5EFDC });
    g.stroke({ color: 0x8B7340, width: 0.8 });
    // 右页
    g.moveTo(1, -18);
    g.lineTo(12, -16);
    g.lineTo(12, 0);
    g.lineTo(1, -2);
    g.closePath();
    g.fill({ color: 0xF5EFDC });
    g.stroke({ color: 0x8B7340, width: 0.8 });
    // 书脊
    g.moveTo(0, -18);
    g.lineTo(0, -2);
    g.stroke({ color: 0x8B7340, width: 1 });
    // 文字线
    for (let i = 0; i < 3; i++) {
      g.moveTo(-9, -12 + i * 4);
      g.lineTo(-3, -12 + i * 4);
      g.stroke({ color: 0x664400, width: 0.4 });
      g.moveTo(3, -12 + i * 4);
      g.lineTo(9, -12 + i * 4);
      g.stroke({ color: 0x664400, width: 0.4 });
    }
  }

  update(dt: number): void {
    this.phase += dt * (this.burstActive ? 0.012 : 0.004);
    this.bookGraphics.y = Math.sin(this.phase) * 2;
    this.bookGraphics.rotation = -0.14 + Math.sin(this.phase * 0.5) * 0.05;
  }

  setBurstMode(active: boolean): void {
    super.setBurstMode(active);
    this.bookGraphics.tint = active ? 0xFFAAAA : 0xFFFFFF;
  }
}

/** 情绪天气(Carzeye) - 云朵+闪电 */
export class CloudDecorator extends WeaponDecorator {
  private cloudGraphics: PIXI.Graphics;

  constructor(parent: PIXI.Container, palette: Palette) {
    super(parent, palette);
    this.cloudGraphics = new PIXI.Graphics();
    this.container.addChild(this.cloudGraphics);
    this.drawCloud();
  }

  private drawCloud(): void {
    const g = this.cloudGraphics;
    g.clear();
    g.y = -22;
    const c = this.burstActive ? 0xFF8800 : 0xFFFFFF;
    // 云朵（4 个椭圆）
    g.ellipse(-12, 0, 10, 6);
    g.fill({ color: c, alpha: 0.9 });
    g.ellipse(0, -3, 13, 8);
    g.fill({ color: c, alpha: 0.9 });
    g.ellipse(12, 0, 10, 6);
    g.fill({ color: c, alpha: 0.9 });
    g.ellipse(0, 2, 18, 5);
    g.fill({ color: c, alpha: 0.9 });
    // 闪电
    g.moveTo(-2, 8);
    g.lineTo(2, 8);
    g.lineTo(-1, 14);
    g.lineTo(3, 14);
    g.lineTo(-2, 22);
    g.lineTo(0, 16);
    g.lineTo(-3, 16);
    g.closePath();
    g.fill({ color: this.palette.accent });
  }

  update(_dt: number): void { /* 静态 */ }

  setBurstMode(active: boolean): void {
    super.setBurstMode(active);
    this.drawCloud();
  }
}

// ════════════════════════════════════════════════════════
// 环绕旋转装饰（3 个）
// ════════════════════════════════════════════════════════

/** 光学斩击(Liya) - 3 把刀旋转 */
export class TripleBladeDecorator extends WeaponDecorator {
  private rotGraphics: PIXI.Graphics;
  private rot = 0;

  constructor(parent: PIXI.Container, palette: Palette) {
    super(parent, palette);
    this.rotGraphics = new PIXI.Graphics();
    this.container.addChild(this.rotGraphics);
    this.drawBlades();
  }

  private drawBlades(): void {
    const g = this.rotGraphics;
    g.clear();
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      g.save();
      g.rotate(angle);
      // 刀身
      g.moveTo(0, -16);
      g.lineTo(3, -28);
      g.lineTo(0, -32);
      g.lineTo(-3, -28);
      g.closePath();
      g.fill({ color: this.palette.primary });
      g.stroke({ color: this.palette.accent, width: 0.5 });
      // 刀柄
      g.rect(-4, -16, 8, 3);
      g.fill({ color: this.palette.accent });
      g.restore();
    }
  }

  update(dt: number): void {
    this.rot += dt * (this.burstActive ? 0.015 : 0.005);
    this.rotGraphics.rotation = this.rot;
  }
}

/** 无限折叠(陈厌孑) - 3 个三角形旋转 */
export class TripleTriangleDecorator extends WeaponDecorator {
  private rotGraphics: PIXI.Graphics;
  private rot = 0;

  constructor(parent: PIXI.Container, palette: Palette) {
    super(parent, palette);
    this.rotGraphics = new PIXI.Graphics();
    this.container.addChild(this.rotGraphics);
    this.drawTriangles();
  }

  private drawTriangles(): void {
    const g = this.rotGraphics;
    g.clear();
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      g.save();
      g.rotate(angle);
      g.moveTo(0, -18);
      g.lineTo(7, -4);
      g.lineTo(-7, -4);
      g.closePath();
      g.fill({ color: this.palette.accent });
      g.stroke({ color: 0x996600, width: 0.8, join: 'round' });
      g.restore();
    }
    // 中心点
    g.circle(0, 0, 2);
    g.fill({ color: this.palette.accent });
  }

  update(dt: number): void {
    this.rot -= dt * (this.burstActive ? 0.012 : 0.004);
    this.rotGraphics.rotation = this.rot;
  }
}

/** 记忆回廊(梦) - 6 个六边形碎片环 */
export class HexShardRingDecorator extends WeaponDecorator {
  private rotGraphics: PIXI.Graphics;
  private rot = 0;

  constructor(parent: PIXI.Container, palette: Palette) {
    super(parent, palette);
    this.rotGraphics = new PIXI.Graphics();
    this.container.addChild(this.rotGraphics);
    this.drawShards();
  }

  private drawShards(): void {
    const g = this.rotGraphics;
    g.clear();
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      g.save();
      g.rotate(angle);
      g.translate(0, -22);
      // 六边形
      g.moveTo(0, -6);
      g.lineTo(5, -3);
      g.lineTo(5, 1);
      g.lineTo(0, 4);
      g.lineTo(-5, 1);
      g.lineTo(-5, -3);
      g.closePath();
      g.fill({ color: this.palette.primary });
      g.stroke({ color: 0xC9A961, width: 0.5 });
      g.restore();
    }
    // 中心记忆之眼
    g.circle(0, 0, 4);
    g.fill({ color: 0x6633CC, alpha: 0.8 });
    g.circle(0, 0, 1);
    g.fill({ color: 0xFFD700 });
  }

  update(dt: number): void {
    this.rot += dt * (this.burstActive ? 0.008 : 0.003);
    this.rotGraphics.rotation = this.rot;
  }
}

// ════════════════════════════════════════════════════════
// 外圈纹路装饰（4 个）
// ════════════════════════════════════════════════════════

/** 空气斥力场(闲乘月) - 双圈虚线+气流弧 */
export class AirFieldDecorator extends WeaponDecorator {
  private ringGraphics: PIXI.Graphics;

  constructor(parent: PIXI.Container, palette: Palette) {
    super(parent, palette);
    this.ringGraphics = new PIXI.Graphics();
    this.container.addChild(this.ringGraphics);
    this.drawRings();
  }

  private drawRings(): void {
    const g = this.ringGraphics;
    g.clear();
    // 外圈虚线斥力场
    g.circle(0, 0, 38);
    g.stroke({ color: this.palette.primary, width: 1, alpha: 0.6, dash: [4, 3] });
    // 内圈虚线
    g.circle(0, 0, 34);
    g.stroke({ color: this.palette.glow, width: 0.6, alpha: 0.4, dash: [2, 4] });
    // 4 条气流弧
    g.arc(0, 0, 30, Math.PI * 0.3, Math.PI * 0.7);
    g.stroke({ color: this.palette.primary, width: 1.2, alpha: 0.8, cap: 'round' });
    g.arc(0, 0, 30, Math.PI * 1.3, Math.PI * 1.7);
    g.stroke({ color: this.palette.primary, width: 1.2, alpha: 0.8, cap: 'round' });
    g.arc(0, 0, 30, Math.PI * 0.8, Math.PI * 1.2);
    g.stroke({ color: this.palette.glow, width: 0.8, alpha: 0.6, cap: 'round' });
    g.arc(0, 0, 30, Math.PI * 1.8, Math.PI * 2.2);
    g.stroke({ color: this.palette.glow, width: 0.8, alpha: 0.6, cap: 'round' });
  }

  update(_dt: number): void { /* 静态 */ }

  setBurstMode(active: boolean): void {
    super.setBurstMode(active);
    this.ringGraphics.alpha = active ? 1 : 0.6;
  }
}

/** 熵寂之触(闲乘月) - 月轮+放射纹 */
export class MoonHaloDecorator extends WeaponDecorator {
  private haloGraphics: PIXI.Graphics;

  constructor(parent: PIXI.Container, palette: Palette) {
    super(parent, palette);
    this.haloGraphics = new PIXI.Graphics();
    this.container.addChild(this.haloGraphics);
    this.drawHalo();
  }

  private drawHalo(): void {
    const g = this.haloGraphics;
    g.clear();
    // 外圈
    g.circle(0, 0, 36);
    g.stroke({ color: this.palette.glow, width: 0.6, alpha: 0.5 });
    // 虚线月轮
    g.circle(0, 0, 32);
    g.stroke({ color: this.palette.dim, width: 1, alpha: 0.7, dash: [6, 2] });
    // 8 条放射纹
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.moveTo(Math.cos(a) * 26, Math.sin(a) * 26);
      g.lineTo(Math.cos(a) * 34, Math.sin(a) * 34);
      g.stroke({ color: this.palette.glow, width: 0.8, alpha: 0.7 });
    }
    // 中心小月
    g.circle(0, 0, 4);
    g.fill({ color: 0xFFFFFF, alpha: 0.6 });
  }

  update(_dt: number): void { /* 静态 */ }
}

/** 预知透镜(风随) - 刻度环+准星 */
export class LensRingDecorator extends WeaponDecorator {
  private lensGraphics: PIXI.Graphics;

  constructor(parent: PIXI.Container, palette: Palette) {
    super(parent, palette);
    this.lensGraphics = new PIXI.Graphics();
    this.container.addChild(this.lensGraphics);
    this.drawLens();
  }

  private drawLens(): void {
    const g = this.lensGraphics;
    g.clear();
    // 外圈
    g.circle(0, 0, 36);
    g.stroke({ color: this.palette.primary, width: 0.8, alpha: 0.6 });
    // 虚线刻度环
    g.circle(0, 0, 32);
    g.stroke({ color: this.palette.accent, width: 1, alpha: 0.7, dash: [3, 6] });
    // 12 个刻度点
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.circle(Math.cos(a) * 36, Math.sin(a) * 36, 1);
      g.fill({ color: this.palette.primary, alpha: 0.8 });
    }
    // 准星十字
    g.moveTo(0, -28);
    g.lineTo(0, 28);
    g.stroke({ color: this.palette.accent, width: 0.6, alpha: 0.5 });
    g.moveTo(-28, 0);
    g.lineTo(28, 0);
    g.stroke({ color: this.palette.accent, width: 0.6, alpha: 0.5 });
    // 中心准星
    g.circle(0, 0, 2);
    g.fill({ color: this.palette.accent });
  }

  update(_dt: number): void { /* 静态 */ }
}

/** 情绪掌控(林澈) - 心境光环 */
export class MoodAuraDecorator extends WeaponDecorator {
  private auraGraphics: PIXI.Graphics;

  constructor(parent: PIXI.Container, palette: Palette) {
    super(parent, palette);
    this.auraGraphics = new PIXI.Graphics();
    this.container.addChild(this.auraGraphics);
    this.drawAura();
  }

  private drawAura(): void {
    const g = this.auraGraphics;
    g.clear();
    // 三层光环
    g.circle(0, 0, 38);
    g.stroke({ color: this.palette.glow, width: 0.8, alpha: 0.4 });
    g.circle(0, 0, 34);
    g.stroke({ color: this.palette.primary, width: 1, alpha: 0.6, dash: [5, 3] });
    g.circle(0, 0, 30);
    g.stroke({ color: this.palette.glow, width: 0.5, alpha: 0.5 });
    // 12 个心境符号点
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.circle(Math.cos(a) * 34, Math.sin(a) * 34, 2);
      g.fill({ color: this.palette.primary, alpha: 0.8 });
    }
  }

  update(_dt: number): void { /* 静态 */ }
}

// ════════════════════════════════════════════════════════
// 侧挂缠绕装饰（2 个）
// ════════════════════════════════════════════════════════

/** 画作实体化(白猫) - 画板+画笔侧挂 */
export class PaletteSlingDecorator extends WeaponDecorator {
  private slingGraphics: PIXI.Graphics;

  constructor(parent: PIXI.Container, palette: Palette) {
    super(parent, palette);
    this.slingGraphics = new PIXI.Graphics();
    this.container.addChild(this.slingGraphics);
    this.drawSling();
  }

  private drawSling(): void {
    const g = this.slingGraphics;
    g.clear();
    // 右侧画板（倾斜 15°）
    g.save();
    g.rotate(0.26);
    g.translate(35, 0);
    g.rect(-6, -12, 12, 24);
    g.fill({ color: this.palette.primary });
    g.stroke({ color: this.palette.glow, width: 0.8 });
    g.rect(-5, -10, 10, 20);
    g.fill({ color: 0xF5E1F5 });
    // 颜料点
    g.circle(-2, -5, 1.5).fill({ color: 0xFF6699 });
    g.circle(2, 0, 1.5).fill({ color: 0xFFD700 });
    g.circle(-2, 5, 1.5).fill({ color: 0x66CCFF });
    g.restore();
    // 左侧画笔（倾斜 -15°）
    g.save();
    g.rotate(-0.26);
    g.translate(-35, 0);
    g.moveTo(0, -10);
    g.lineTo(0, 10);
    g.stroke({ color: this.palette.primary, width: 1.5, cap: 'round' });
    g.circle(0, -10, 1.5).fill({ color: 0xFFD700 });
    g.restore();
  }

  update(_dt: number): void { /* 静态 */ }
}

/** 植物伙伴(沐里) - 藤蔓缠绕 */
export class VineWrapDecorator extends WeaponDecorator {
  private vineGraphics: PIXI.Graphics;

  constructor(parent: PIXI.Container, palette: Palette) {
    super(parent, palette);
    this.vineGraphics = new PIXI.Graphics();
    this.container.addChild(this.vineGraphics);
    this.drawVine();
  }

  private drawVine(): void {
    const g = this.vineGraphics;
    g.clear();
    // 左藤蔓
    g.moveTo(-22, -16);
    g.quadraticCurveTo(-30, -6, -22, 4);
    g.quadraticCurveTo(-14, 14, -22, 24);
    g.stroke({ color: this.palette.primary, width: 1.5, alpha: 0.9, cap: 'round' });
    // 右藤蔓
    g.moveTo(22, -16);
    g.quadraticCurveTo(30, -6, 22, 4);
    g.quadraticCurveTo(14, 14, 22, 24);
    g.stroke({ color: this.palette.primary, width: 1.5, alpha: 0.9, cap: 'round' });
    // 叶子
    const leafPositions = [
      { x: -26, y: -10, rot: -0.5 },
      { x: -14, y: 6, rot: 0.5 },
      { x: -24, y: 18, rot: -0.5 },
      { x: 26, y: -10, rot: 0.5 },
      { x: 14, y: 6, rot: -0.5 },
      { x: 24, y: 18, rot: 0.5 },
    ];
    for (const p of leafPositions) {
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.ellipse(0, 0, 3, 1.5);
      g.fill({ color: this.palette.glow });
      g.stroke({ color: 0x1A3A0A, width: 0.3 });
      g.restore();
    }
    // 粉色小花
    g.circle(-25, -6, 1.5).fill({ color: 0xFFB3D9 });
    g.circle(25, -6, 1.5).fill({ color: 0xFFB3D9 });
  }

  update(_dt: number): void { /* 静态 */ }
}

// ════════════════════════════════════════════════════════
// 工厂函数
// ════════════════════════════════════════════════════════

/**
 * 根据 weaponId 创建对应装饰器
 * @returns WeaponDecorator 或 undefined（9 个基础武器无装饰）
 */
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
    case WeaponId.EMOTIONAL_WEATHER:
      return new CloudDecorator(parentContainer, palette);
    case WeaponId.OPTICAL_SLASH:
      return new TripleBladeDecorator(parentContainer, palette);
    case WeaponId.INFINITE_FOLD:
      return new TripleTriangleDecorator(parentContainer, palette);
    case WeaponId.MEMORY_CORRIDOR:
      return new HexShardRingDecorator(parentContainer, palette);
    case WeaponId.AIR_REPULSION_FIELD:
      return new AirFieldDecorator(parentContainer, palette);
    case WeaponId.ENTROPIC_TOUCH:
      return new MoonHaloDecorator(parentContainer, palette);
    case WeaponId.PRECOGNITIVE_LENS:
      return new LensRingDecorator(parentContainer, palette);
    case WeaponId.EMOTION_MASTERY:
      return new MoodAuraDecorator(parentContainer, palette);
    case WeaponId.DRAWING_MANIFEST:
      return new PaletteSlingDecorator(parentContainer, palette);
    case WeaponId.BOTANICAL_CONTROL:
      return new VineWrapDecorator(parentContainer, palette);
    default:
      return undefined;
  }
}
```

- [ ] **Step 2: 编译验证**

Run: `cd game/frontend && npx vite build`
Expected: 构建成功

- [ ] **Step 3: Commit**

```bash
git add game/frontend/src/components/fish-oil-battle/renderer/entities/decorators/WeaponDecorators.ts
git commit -m "feat: 新建 12 个武器装饰器 + 工厂函数"
```

---

## Task 3: PlayerRenderer 集成装饰器

**Files:**
- Modify: `game/frontend/src/components/fish-oil-battle/renderer/entities/PlayerRenderer.ts`

- [ ] **Step 1: 在 PlayerRenderer 顶部添加 import**

在 `PlayerRenderer.ts` 第 4 行后添加：

```typescript
import type { WeaponDecorator } from './decorators/WeaponDecorator';
import type { HitReaction } from '$/backend/src/games/fish-oil-battle/shared/protocol';
```

- [ ] **Step 2: 在 PlayerRenderer 类中添加装饰器字段**

在 `private isSlowed = false;` 后添加：

```typescript
  // ─── 武器装饰器 ─────────────────────────────────────────
  private weaponDecorator?: WeaponDecorator;

  // ─── 受击反馈状态 ─────────────────────────────────────
  private shakeOffset = { x: 0, y: 0, magnitude: 0, duration: 0, elapsed: 0 };
```

- [ ] **Step 3: 修改 playHitEffect 接受 reaction 参数**

将第 236 行 `playHitEffect(): void { this.hitFlashTimer = 150; }` 替换为：

```typescript
  playHitEffect(reaction: HitReaction = 'flash'): void {
    this.hitFlashTimer = 200;
    switch (reaction) {
      case 'freeze':
        this.avatar.tint = 0x88CCFF;
        this.shakeOffset = { x: 0, y: 0, magnitude: 1, duration: 200, elapsed: 0 };
        break;
      case 'shock':
        this.avatar.tint = 0xFFEE88;
        this.shakeOffset = { x: 0, y: 0, magnitude: 3, duration: 250, elapsed: 0 };
        break;
      case 'burn':
        this.avatar.tint = 0xFF8800;
        this.hitFlashTimer = 300;
        break;
      case 'slash':
        this.avatar.tint = 0xDDDDDD;
        break;
      case 'pull':
        this.avatar.tint = 0xCC99FF;
        this.shakeOffset = { x: 0, y: 0, magnitude: 2, duration: 200, elapsed: 0 };
        break;
      default:
        this.avatar.alpha = 0.3;
    }
  }
```

- [ ] **Step 4: 添加 setWeaponDecorator / setStatusEffect / updateShake 方法**

在 `playBurstEffect(): void { this.burstScaleTimer = 400; }` 后添加：

```typescript
  setWeaponDecorator(decorator?: WeaponDecorator): void {
    if (this.weaponDecorator) {
      this.weaponDecorator.destroy();
      this.weaponDecorator = undefined;
    }
    this.weaponDecorator = decorator;
    if (decorator) {
      decorator.setScale(this.radiusScale);
      decorator.setPosition(this.container.x, this.container.y);
    }
  }

  setBurstMode(active: boolean): void {
    this.weaponDecorator?.setBurstMode(active);
  }

  setStatusEffect(type: 'slow' | 'freeze' | 'burn' | 'pull' | 'shock', duration: number): void {
    // 复用 slowEffectTimer 字段，按 type 设置不同 tint
    this.isSlowed = true;
    this.slowEffectTimer = duration;
    switch (type) {
      case 'slow': this.avatar.tint = 0x88CCFF; break;
      case 'freeze': this.avatar.tint = 0x88CCFF; break;
      case 'burn': this.avatar.tint = 0xFF8800; break;
      case 'pull': this.avatar.tint = 0xCC99FF; break;
      case 'shock': this.avatar.tint = 0xFFEE88; break;
    }
  }

  private updateShake(dt: number): void {
    if (this.shakeOffset.duration === 0) return;
    this.shakeOffset.elapsed += dt;
    if (this.shakeOffset.elapsed >= this.shakeOffset.duration) {
      this.shakeOffset.x = 0;
      this.shakeOffset.y = 0;
      this.shakeOffset.duration = 0;
      this.avatar.tint = 0xFFFFFF;
    } else {
      this.shakeOffset.x = (Math.random() - 0.5) * this.shakeOffset.magnitude * 2;
      this.shakeOffset.y = (Math.random() - 0.5) * this.shakeOffset.magnitude * 2;
    }
    this.avatar.position.set(this.shakeOffset.x, this.shakeOffset.y);
  }
```

- [ ] **Step 5: 在 update 方法中调用 updateShake + weaponDecorator.update**

在 `update(dt: number)` 方法（搜索 `update(dt: number): void`）中，在 `if (this.hitFlashTimer > 0)` 块之后添加：

```typescript
    this.updateShake(dt);
    this.weaponDecorator?.update(dt);
```

- [ ] **Step 6: 在 setScale 中同步装饰器**

在 `setScale` 方法末尾（`this.idText.y = -this.r - 18;` 后）添加：

```typescript
    this.weaponDecorator?.setScale(scale);
```

- [ ] **Step 7: 在 destroy 中销毁装饰器**

在 `destroy()` 方法末尾添加：

```typescript
    this.weaponDecorator?.destroy();
```

- [ ] **Step 8: 编译验证**

Run: `cd game/frontend && npx vite build`
Expected: 构建成功

- [ ] **Step 9: Commit**

```bash
git add game/frontend/src/components/fish-oil-battle/renderer/entities/PlayerRenderer.ts
git commit -m "feat: PlayerRenderer 集成武器装饰器 + 受击反馈差异化"
```

---

## Task 4: 后端新增 HIT_FEEDBACK VisualEventType + HitReaction 类型

**Files:**
- Modify: `game/backend/src/games/fish-oil-battle/config/GameEnums.ts`
- Modify: `game/backend/src/games/fish-oil-battle/shared/protocol.ts`

- [ ] **Step 1: 在 GameEnums.ts 中添加 HIT_FEEDBACK**

在 `SUSTAINED_SHAPE = 'sustained_shape',` 前（约第 220 行）添加：

```typescript
  /** 命中反馈（受击差异化视觉，由后端 applyDamage 时附带） */
  HIT_FEEDBACK = 'hit_feedback',
```

- [ ] **Step 2: 在 protocol.ts 中添加 HitReaction 类型 + 字段**

在 `VisualEventData` 接口末尾（约第 290 行 `durationMs?: number;` 后）添加：

```typescript
  /** 命中反馈类型（HIT_FEEDBACK 事件专用） */
  hitReaction?: 'flash' | 'freeze' | 'shock' | 'burn' | 'slash' | 'pull';
  /** 命中伤害值（HIT_FEEDBACK 事件专用） */
  hitDamage?: number;
  /** 命中来源武器 ID（HIT_FEEDBACK 事件专用） */
  hitSourceWeaponId?: WeaponId;
```

- [ ] **Step 3: 编译验证**

Run: `cd game/backend && npx tsc --noEmit`
Expected: 仅 4 个预存 skill-chain.test.ts 错误

- [ ] **Step 4: Commit**

```bash
git add game/backend/src/games/fish-oil-battle/config/GameEnums.ts game/backend/src/games/fish-oil-battle/shared/protocol.ts
git commit -m "feat: 后端新增 HIT_FEEDBACK 事件 + HitReaction 类型"
```

---

## Task 5: IWeapon 接口扩展 getHitReaction

**Files:**
- Modify: `game/backend/src/games/fish-oil-battle/core/IWeapon.ts`

- [ ] **Step 1: 读取 IWeapon.ts 确认接口位置**

Run: 读取 `game/backend/src/games/fish-oil-battle/core/IWeapon.ts` 找到 `export interface IWeapon`

- [ ] **Step 2: 在 IWeapon 接口末尾添加 getHitReaction 可选方法**

在 `}` 前添加：

```typescript
  /** 返回该武器的受击反应类型（用于前端差异化受击视觉） */
  getHitReaction?(): HitReaction;
```

并在文件顶部添加 import：

```typescript
import type { HitReaction } from '../shared/protocol';
```

- [ ] **Step 3: 编译验证**

Run: `cd game/backend && npx tsc --noEmit`
Expected: 仅 4 个预存错误

- [ ] **Step 4: Commit**

```bash
git add game/backend/src/games/fish-oil-battle/core/IWeapon.ts
git commit -m "feat: IWeapon 接口新增 getHitReaction 可选方法"
```

---

## Task 6: WeaponScheduler 收集 HIT_FEEDBACK 事件

**Files:**
- Modify: `game/backend/src/games/fish-oil-battle/core/WeaponScheduler.ts`

- [ ] **Step 1: 在 applyWeaponEffects 的 DAMAGE 处理分支后添加 HIT_FEEDBACK 收集**

定位到 `applyWeaponEffects` 方法（约第 205-265 行），在伤害类效果处理块（`state.applyDamage(effect.targetId, actualDamage, effect.sourceId);`）之后、`// dot 效果` 之前，添加：

```typescript
      // 收集命中反馈视觉事件（仅对直接伤害类）
      if ((effect.type === WeaponEffectType.DAMAGE || effect.type === WeaponEffectType.AOE_DAMAGE || effect.type === WeaponEffectType.BURST_DAMAGE) && effect.targetId && effect.sourceId) {
        const weapon = this.bindings.get(effect.sourceId);
        const reaction = weapon?.getHitReaction?.() ?? 'flash';
        this.pendingVisuals.push({
          playerId: effect.targetId,
          weaponId: weapon?.id,
          visualType: VisualEventType.HIT_FEEDBACK,
          x: effect.position?.x ?? effect.aoe?.x,
          y: effect.position?.y ?? effect.aoe?.y,
          targetId: effect.targetId,
          metadata: {
            sourceId: effect.sourceId,
            weaponId: weapon?.id,
            damage: actualDamage,
            hitReaction: reaction,
          },
        });
      }
```

同时在 `effect.type === WeaponEffectType.DOT && effect.targetId` 块末尾（`state.applyDamage` 之后）添加同样的 DOT 命中反馈收集：

```typescript
      if (effect.type === WeaponEffectType.DOT && effect.targetId && effect.sourceId) {
        const weapon = this.bindings.get(effect.sourceId);
        const reaction = weapon?.getHitReaction?.() ?? 'burn';
        this.pendingVisuals.push({
          playerId: effect.targetId,
          weaponId: weapon?.id,
          visualType: VisualEventType.HIT_FEEDBACK,
          x: effect.position?.x ?? effect.aoe?.x,
          y: effect.position?.y ?? effect.aoe?.y,
          targetId: effect.targetId,
          metadata: {
            sourceId: effect.sourceId,
            weaponId: weapon?.id,
            damage: actualDamage,
            hitReaction: reaction,
          },
        });
      }
```

- [ ] **Step 2: 确保 VisualEventType 已 import**

检查文件顶部 import，确保有：
```typescript
import { VisualEventType, WeaponId } from '../config/GameEnums';
```

- [ ] **Step 3: 编译验证**

Run: `cd game/backend && npx tsc --noEmit`
Expected: 仅 4 个预存错误

- [ ] **Step 4: Commit**

```bash
git add game/backend/src/games/fish-oil-battle/core/WeaponScheduler.ts
git commit -m "feat: WeaponScheduler applyWeaponEffects 收集 HIT_FEEDBACK 事件"
```

---

## Task 7: 12 个武器实现 getHitReaction

**Files:**
- Modify: 12 个武器文件 in `game/backend/src/games/fish-oil-battle/skills/weapons/`

- [ ] **Step 1: 在每个武器类中添加 getHitReaction 方法**

按设计文档 3.2.3 节映射表添加。以 `DischargeCatWeapon.ts` 为例，在 `onHitTarget` 方法后添加：

```typescript
  getHitReaction(): HitReaction {
    return 'shock';
  }
```

并在文件顶部添加 import（如果未导入）：
```typescript
import type { HitReaction } from '../../shared/protocol';
```

**12 个武器的 hitReaction 值**（逐一添加）：

| 文件 | 方法返回值 |
|------|-----------|
| `DischargeCatWeapon.ts` | `return 'shock';` |
| `FluidMasteryWeapon.ts` | `return 'pull';` |
| `MemoryCorridorWeapon.ts` | `return 'pull';` |
| `OpticalSlashWeapon.ts` | `return 'slash';` |
| `AirRepulsionFieldWeapon.ts` | `return 'pull';` |
| `EntropicTouchWeapon.ts` | `return 'freeze';` |
| `DrawingManifestWeapon.ts` | `return 'slash';` |
| `PrecognitiveLensWeapon.ts` | `return 'flash';` |
| `EmotionalWeatherWeapon.ts` | `return 'burn';` |
| `EmotionMasteryWeapon.ts` | `return 'flash';` |
| `InfiniteFoldWeapon.ts` | `return 'pull';` |
| `BotanicalControlWeapon.ts` | `return 'burn';` |

- [ ] **Step 2: 编译验证**

Run: `cd game/backend && npx tsc --noEmit`
Expected: 仅 4 个预存错误

- [ ] **Step 3: Commit**

```bash
git add game/backend/src/games/fish-oil-battle/skills/weapons/
git commit -m "feat: 12 个武器实现 getHitReaction 方法"
```

---

## Task 8: 前端 CyberFishRenderer 转发 HIT_FEEDBACK + 装饰器集成

**Files:**
- Modify: `game/frontend/src/components/fish-oil-battle/renderer/CyberFishRenderer.ts`

- [ ] **Step 1: 添加 import**

在 `CyberFishRenderer.ts` 顶部 import 区添加：

```typescript
import { createWeaponDecorator } from './entities/decorators/WeaponDecorators';
import type { HitReaction } from '$/backend/src/games/fish-oil-battle/shared/protocol';
```

- [ ] **Step 2: 在 triggerSkillEffect 的 switch 中添加 HIT_FEEDBACK case**

在 `switch (config.type)` 中（约第 291 行后），在 `case VisualEventType.SHOCKWAVE_TRIGGER:` 前添加：

```typescript
      case VisualEventType.HIT_FEEDBACK: {
        const reaction = (config as any).hitReaction ?? 'flash';
        const targetId = (config as any).targetId;
        const damage = (config as any).hitDamage;
        if (targetId) {
          const pr = this.playerRenderers.get(targetId);
          if (pr) {
            pr.playHitEffect(reaction as HitReaction);
            if (damage !== undefined) pr.showDamageNumber(damage, this.getDamageColor(reaction as HitReaction));
          }
        }
        break;
      }
```

- [ ] **Step 3: 添加 getDamageColor 辅助方法**

在 `triggerSkillEffect` 方法后添加：

```typescript
  private getDamageColor(reaction: HitReaction): number {
    switch (reaction) {
      case 'freeze': return 0x88CCFF;
      case 'shock': return 0xFFEE88;
      case 'burn': return 0xFF8800;
      case 'slash': return 0xDDDDDD;
      case 'pull': return 0xCC99FF;
      default: return 0xFF3333;
    }
  }
```

- [ ] **Step 4: 修改 showDamageNumber 方法签名以接受颜色**

在 `CyberFishRenderer.ts` 中找到 `showDamageNumber(playerId: string, damage: number): void`（约第 995 行），修改为：

```typescript
  showDamageNumber(playerId: string, damage: number, color?: number): void {
    this.playerRenderers.get(playerId)?.showDamageNumber(damage, color);
  }
```

- [ ] **Step 5: 添加 setWeaponDecorator 方法（供外部调用）**

在 `showDamageNumber` 后添加：

```typescript
  setWeaponDecorator(playerId: string, weaponId: WeaponId): void {
    const pr = this.playerRenderers.get(playerId);
    if (!pr) return;
    const palette = getWeaponPalette(weaponId);
    if (!palette) return;
    const decorator = createWeaponDecorator(weaponId, this.l2Entity, palette);
    pr.setWeaponDecorator(decorator);
  }
```

- [ ] **Step 6: 在 BURST_TRIGGER case 中调用 setBurstMode**

找到 `case VisualEventType.BURST_TRIGGER:`，修改为：

```typescript
      case VisualEventType.BURST_TRIGGER:
        this.effectRenderer.triggerBurstFlash(themeColor ?? config.factionColor ?? 0xFF00FF);
        if (config.playerId) {
          this.playerRenderers.get(config.playerId)?.setBurstMode(true);
          // 4 秒后关闭爆发态（由 burstDurationSec 决定）
          // 简化：使用 setTimeout，后续可改为事件驱动
          setTimeout(() => {
            this.playerRenderers.get(config.playerId ?? '')?.setBurstMode(false);
          }, ((config as any).durationMs ?? 4000) as number);
        }
        break;
```

- [ ] **Step 7: 编译验证**

Run: `cd game/frontend && npx vite build`
Expected: 构建成功

- [ ] **Step 8: Commit**

```bash
git add game/frontend/src/components/fish-oil-battle/renderer/CyberFishRenderer.ts
git commit -m "feat: CyberFishRenderer 转发 HIT_FEEDBACK + 装饰器集成"
```

---

## Task 9: useFishOilBattle 处理 HIT_FEEDBACK

**Files:**
- Modify: `game/frontend/src/components/fish-oil-battle/useFishOilBattle.ts`

- [ ] **Step 1: 在 onVisualEvent 处理中添加 HIT_FEEDBACK case**

找到处理 `visual_event` 的 switch（搜索 `case VisualEventType.`），添加：

```typescript
      case VisualEventType.HIT_FEEDBACK: {
        const reaction = (ev as any).hitReaction ?? 'flash';
        const damage = (ev as any).hitDamage;
        const targetId = (ev as any).targetId;
        if (targetId && rendererRef.value) {
          rendererRef.value.playHitEffect(targetId, reaction);
          if (damage !== undefined) {
            rendererRef.value.showDamageNumber(targetId, damage, getDamageColor(reaction));
          }
        }
        break;
      }
```

- [ ] **Step 2: 添加 getDamageColor 辅助函数**

在文件顶部添加：

```typescript
function getDamageColor(reaction: HitReaction): number {
  switch (reaction) {
    case 'freeze': return 0x88CCFF;
    case 'shock': return 0xFFEE88;
    case 'burn': return 0xFF8800;
    case 'slash': return 0xDDDDDD;
    case 'pull': return 0xCC99FF;
    default: return 0xFF3333;
  }
}
```

并在顶部 import 中添加 `import type { HitReaction } from '$/backend/src/games/fish-oil-battle/shared/protocol';`

- [ ] **Step 3: 修改 CyberFishRenderer.playHitEffect 签名**

`CyberFishRenderer.playHitEffect` 当前签名是 `playHitEffect(playerId: string): void`，需改为接受可选 reaction：

```typescript
  playHitEffect(playerId: string, reaction?: HitReaction): void {
    const pr = this.playerRenderers.get(playerId);
    pr?.playHitEffect(reaction);
  }
```

- [ ] **Step 4: 修改原 HP 差值触发逻辑（避免重复触发）**

在 `useFishOilBattle.ts` 第 199-207 行的 HP 差值检测块中，将 `playHitEffect` 调用改为仅触发伤害数字（不再触发 flash，因为 HIT_FEEDBACK 会处理）：

```typescript
      if (prev > p.hp) {
        const dmg = prev - p.hp;
        // 仅显示伤害数字（不再触发 flash，由 HIT_FEEDBACK 事件处理）
        rendererRef.value?.showDamageNumber(p.id, dmg);
      }
```

- [ ] **Step 5: 编译验证**

Run: `cd game/frontend && npx vite build`
Expected: 构建成功

- [ ] **Step 6: Commit**

```bash
git add game/frontend/src/components/fish-oil-battle/useFishOilBattle.ts game/frontend/src/components/fish-oil-battle/renderer/CyberFishRenderer.ts
git commit -m "feat: useFishOilBattle 处理 HIT_FEEDBACK 事件 + CyberFishRenderer.playHitEffect 接受 reaction"
```

---

## Task 10: BattleTestPanel + effectRegistry 处理 HIT_FEEDBACK

**Files:**
- Modify: `game/frontend/src/components/fish-oil-battle/components/BattleTestPanel.vue`
- Modify: `game/frontend/src/components/fish-oil-battle/test/effectRegistry.ts`

- [ ] **Step 1: 在 BattleTestPanel.vue 的 handleVisualEvent switch 中添加 HIT_FEEDBACK case**

参考 Task 9 的逻辑，在 BattleTestPanel.vue 的 `handleVisualEvent` 函数中添加：

```typescript
      case VisualEventType.HIT_FEEDBACK: {
        const reaction = (ev as any).hitReaction ?? 'flash';
        const damage = (ev as any).hitDamage;
        const targetId = (ev as any).targetId;
        if (targetId && rendererRef.value) {
          rendererRef.value.playHitEffect(targetId, reaction);
          if (damage !== undefined) {
            rendererRef.value.showDamageNumber(targetId, damage);
          }
        }
        break;
      }
```

- [ ] **Step 2: 在 effectRegistry.ts 中添加 HIT_FEEDBACK case**

在 effectRegistry.ts 的 switch 中添加（仅测试页预览用，简单调用 triggerSkillEffect）：

```typescript
      case VisualEventType.HIT_FEEDBACK: {
        // 测试页仅模拟闪白
        const reaction = (ev as any).hitReaction ?? 'flash';
        const targetId = (ev as any).targetId;
        if (targetId && rendererRef.value) {
          rendererRef.value.playHitEffect(targetId, reaction);
        }
        break;
      }
```

- [ ] **Step 3: 编译验证**

Run: `cd game/frontend && npx vite build`
Expected: 构建成功

- [ ] **Step 4: Commit**

```bash
git add game/frontend/src/components/fish-oil-battle/components/BattleTestPanel.vue game/frontend/src/components/fish-oil-battle/test/effectRegistry.ts
git commit -m "feat: BattleTestPanel + effectRegistry 处理 HIT_FEEDBACK 事件"
```

---

## Task 11: 关键武器物理化 - OpticalSlashWeapon

**Files:**
- Modify: `game/backend/src/games/fish-oil-battle/skills/weapons/OpticalSlashWeapon.ts`

- [ ] **Step 1: 添加 PhysicsObstacle 支持**

读取 `OpticalSlashWeapon.ts`，在类中添加：

```typescript
import type { PhysicsObstacle } from '../../physics/PhysicsEngine';

  // 斩击残留实体（可碰撞）
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

  onObstacleHit(hittingPlayerId: string, _state, _physics): WeaponEffect[] {
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
```

- [ ] **Step 2: 在 onHitTarget 中记录斩击残留**

在 `onHitTarget` 方法生成斩击的位置，添加：

```typescript
    // 记录斩击残留（可碰撞实体）
    this.slashResidues.push({
      id: `slash_${Date.now()}_${Math.random()}`,
      x: targetState.x,
      y: targetState.y,
      radius: 25,
      spawnedAt: Date.now(),
      ownerId: this.ownerId,
    });
    // 清理过期残留
    const now = Date.now();
    this.slashResidues = this.slashResidues.filter(r => now - r.spawnedAt < 800);
```

- [ ] **Step 3: 编译验证**

Run: `cd game/backend && npx tsc --noEmit`
Expected: 仅 4 个预存错误

- [ ] **Step 4: Commit**

```bash
git add game/backend/src/games/fish-oil-battle/skills/weapons/OpticalSlashWeapon.ts
git commit -m "feat: OpticalSlashWeapon 斩击残留 PhysicsObstacle 物理化"
```

---

## Task 12: 关键武器物理化 - AirRepulsionFieldWeapon 锚点

**Files:**
- Modify: `game/backend/src/games/fish-oil-battle/skills/weapons/AirRepulsionFieldWeapon.ts`

- [ ] **Step 1: 修改 anchors 为 PhysicsObstacle**

读取 `AirRepulsionFieldWeapon.ts`，在 `getObstacles` 中返回 anchors：

```typescript
  getObstacles(): PhysicsObstacle[] {
    return this.anchors.map(a => ({
      id: a.id,
      x: a.x, y: a.y,
      radius: 30,
      sourceId: this.ownerId,
      type: 'air_anchor',
    }));
  }

  onObstacleHit(hittingPlayerId: string, _state, _physics): WeaponEffect[] {
    if (hittingPlayerId === this.ownerId) return [];
    if (this.isOnCooldown('obstacleHit', 1.0)) return [];
    return [{
      type: WeaponEffectType.DAMAGE,
      targetId: hittingPlayerId,
      sourceId: this.ownerId,
      value: 4,
      metadata: { hitReaction: 'pull' },
    }];
  }
```

- [ ] **Step 2: 编译验证**

Run: `cd game/backend && npx tsc --noEmit`
Expected: 仅 4 个预存错误

- [ ] **Step 3: Commit**

```bash
git add game/backend/src/games/fish-oil-battle/skills/weapons/AirRepulsionFieldWeapon.ts
git commit -m "feat: AirRepulsionFieldWeapon 锚点 PhysicsObstacle 物理化"
```

---

## Task 13: 关键武器物理化 - FluidMasteryWeapon 漩涡

**Files:**
- Modify: `game/backend/src/games/fish-oil-battle/skills/weapons/FluidMasteryWeapon.ts`

- [ ] **Step 1: 添加漩涡 PhysicsObstacle**

```typescript
  private vortex: { x: number; y: number; active: boolean } = { x: 0, y: 0, active: false };

  getObstacles(): PhysicsObstacle[] {
    if (!this.vortex.active) return [];
    return [{
      id: `vortex_${this.ownerId}`,
      x: this.vortex.x,
      y: this.vortex.y,
      radius: 40,
      sourceId: this.ownerId,
      type: 'vortex',
    }];
  }

  onObstacleHit(hittingPlayerId: string, _state, _physics): WeaponEffect[] {
    if (hittingPlayerId === this.ownerId) return [];
    if (this.isOnCooldown('obstacleHit', 1.0)) return [];
    return [{
      type: WeaponEffectType.DAMAGE,
      targetId: hittingPlayerId,
      sourceId: this.ownerId,
      value: 8,
      metadata: { hitReaction: 'pull' },
    }];
  }
```

- [ ] **Step 2: 在 onHitByAttacker 中更新漩涡位置**

在 `onHitByAttacker` 中设置 `this.vortex = { x: attackerState.x, y: attackerState.y, active: true };`

- [ ] **Step 3: 编译验证 + Commit**

Run: `cd game/backend && npx tsc --noEmit`

```bash
git add game/backend/src/games/fish-oil-battle/skills/weapons/FluidMasteryWeapon.ts
git commit -m "feat: FluidMasteryWeapon 漩涡 PhysicsObstacle 物理化"
```

---

## Task 14: 关键武器物理化 - MemoryCorridorWeapon 回响

**Files:**
- Modify: `game/backend/src/games/fish-oil-battle/skills/weapons/MemoryCorridorWeapon.ts`

- [ ] **Step 1: 添加回响投射物 PhysicsObstacle**

```typescript
  private echoes: Array<{ id: string; x: number; y: number; vx: number; vy: number; spawnedAt: number }> = [];

  getObstacles(): PhysicsObstacle[] {
    const now = Date.now();
    return this.echoes
      .filter(e => now - e.spawnedAt < 3000)  // 3s 飞行
      .map(e => ({
        id: e.id,
        x: e.x, y: e.y,
        radius: 15,
        sourceId: this.ownerId,
        type: 'memory_echo',
      }));
  }

  onObstacleHit(hittingPlayerId: string, _state, _physics): WeaponEffect[] {
    if (hittingPlayerId === this.ownerId) return [];
    return [{
      type: WeaponEffectType.DAMAGE,
      targetId: hittingPlayerId,
      sourceId: this.ownerId,
      value: 8,
      metadata: { hitReaction: 'pull' },
    }];
  }
```

- [ ] **Step 2: 在 onHitByAttacker 中生成回响**

在 `onHitByAttacker` 中添加：

```typescript
    this.echoes.push({
      id: `echo_${Date.now()}_${Math.random()}`,
      x: attackerState.x,
      y: attackerState.y,
      vx: (Math.random() - 0.5) * 100,
      vy: (Math.random() - 0.5) * 100,
      spawnedAt: Date.now(),
    });
    // 清理过期
    const now = Date.now();
    this.echoes = this.echoes.filter(e => now - e.spawnedAt < 3000);
```

- [ ] **Step 3: 编译验证 + Commit**

Run: `cd game/backend && npx tsc --noEmit`

```bash
git add game/backend/src/games/fish-oil-battle/skills/weapons/MemoryCorridorWeapon.ts
git commit -m "feat: MemoryCorridorWeapon 回响 PhysicsObstacle 物理化"
```

---

## Task 15: 特效页尺寸对齐实战

**Files:**
- Modify: `game/frontend/src/components/fish-oil-battle/test/EffectTestPage.vue`

- [ ] **Step 1: 修改画布尺寸为 800×450 + scale=0.625**

在 `EffectTestPage.vue` 中找到画布初始化（搜索 `app = new PIXI.Application` 或 `width: 1280`），修改为：

```typescript
const PREVIEW_WIDTH = 800;
const PREVIEW_HEIGHT = 450;
const PREVIEW_SCALE = 0.625;  // 800/1280
```

并在初始化后调用 `renderer.setScale(PREVIEW_SCALE)`。

- [ ] **Step 2: 添加切换按钮（可选 1.0x 查看细节）**

在 template 中添加：

```vue
<div class="scale-toggle">
  <button :class="{ active: scale === 0.625 }" @click="setScale(0.625)">实战比例 (0.625x)</button>
  <button :class="{ active: scale === 1.0 }" @click="setScale(1.0)">原比例 (1.0x)</button>
</div>
```

并实现 `setScale` 方法：

```typescript
function setScale(s: number) {
  scale.value = s;
  if (rendererRef.value) {
    rendererRef.value.setScale(s, PREVIEW_WIDTH, PREVIEW_HEIGHT);
  }
}
```

- [ ] **Step 3: 编译验证**

Run: `cd game/frontend && npx vite build`
Expected: 构建成功

- [ ] **Step 4: Commit**

```bash
git add game/frontend/src/components/fish-oil-battle/test/EffectTestPage.vue
git commit -m "feat: EffectTestPage 画布降至 800×450 + scale=0.625 对齐实战"
```

---

## Task 16: 最终编译验证 + 回归测试

**Files:** 无修改

- [ ] **Step 1: 前端编译验证**

Run: `cd game/frontend && npx vite build`
Expected: 构建成功，无类型错误

- [ ] **Step 2: 后端编译验证**

Run: `cd game/backend && npx tsc --noEmit`
Expected: 仅 4 个预存 skill-chain.test.ts 错误

- [ ] **Step 3: grep 验证装饰器覆盖**

Run: `grep -r "palette?: Palette" game/frontend/src/components/fish-oil-battle/renderer/entities/`
Expected: ≥ 12 个文件匹配

Run: `grep -c "createWeaponDecorator" game/frontend/src/components/fish-oil-battle/renderer/CyberFishRenderer.ts`
Expected: ≥ 1

- [ ] **Step 4: grep 验证 HIT_FEEDBACK 覆盖**

Run: `grep -r "HIT_FEEDBACK" game/frontend/src/components/fish-oil-battle/`
Expected: ≥ 3 个文件匹配（CyberFishRenderer / useFishOilBattle / BattleTestPanel）

Run: `grep -r "getHitReaction" game/backend/src/games/fish-oil-battle/skills/weapons/`
Expected: ≥ 12 个文件匹配

- [ ] **Step 5: 手动验证（用户执行）**

启动 `npm run dev`，在 EffectTestPage 触发 12 个角色武器，确认：
- 12 个装饰正确显示（猫耳/古籍/云朵/三刀/三三角/六碎片环/双圈虚线/月轮/刻度环/心境光环/画板画笔/藤蔓）
- 装饰随小球 scale 同步
- 特效页 scale=0.625 与实战一致
- 实战对局中受击反馈差异化明显（电击抖动/冰冻/燃烧/斩击/拉扯）

- [ ] **Step 6: Commit（如有修复）**

如有修复，提交：
```bash
git add -A
git commit -m "fix: 最终编译验证修复"
```

---

## Self-Review 总结

**Spec 覆盖检查**：
- ✅ 装饰器系统（4 类 12 个装饰器） → Task 1, 2
- ✅ PlayerRenderer 集成 → Task 3
- ✅ HIT_FEEDBACK 事件 → Task 4, 5, 6
- ✅ 12 武器 getHitReaction → Task 7
- ✅ 前端 HIT_FEEDBACK 处理 → Task 8, 9, 10
- ✅ 4 个武器物理化 → Task 11, 12, 13, 14
- ✅ 尺寸对齐 → Task 15
- ✅ 最终验证 → Task 16

**类型一致性**：`HitReaction` 类型在 protocol.ts 定义，前后端共用；`WeaponDecorator` 接口在 Task 1 定义，Task 2/3 复用。

**无占位符**：所有步骤都包含完整代码，无 TBD/TODO。
