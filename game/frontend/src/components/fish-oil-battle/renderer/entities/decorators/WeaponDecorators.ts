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
