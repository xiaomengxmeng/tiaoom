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
    durationMs?: number,
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
      maxLife: durationMs ?? 1500,
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
    b.particleTimer += 16;
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
