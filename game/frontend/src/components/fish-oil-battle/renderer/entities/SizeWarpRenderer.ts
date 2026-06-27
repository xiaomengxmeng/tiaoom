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
 * API：triggerWarp / removeWarp / triggerBurst / update / setScale / clear / destroy
 */

import * as PIXI from 'pixi.js';
import { ParticlePool } from '../systems/ParticlePool';
import { BaseWeaponEffectRenderer, type ActiveBurstBase, type Palette } from './BaseWeaponEffectRenderer';

// ══════════════════════════════════════════════════════
//  颜色常量（控制者青色系）
// ══════════════════════════════════════════════════════

const SIZE_DEEP = 0x0a2a3a;      // 深青（渐变外缘）
const SIZE_MAIN = 0x00ccaa;     // 主青（扭曲主色）
const SIZE_LIGHT = 0x33ffdd;    // 浅亮青（中层渐变）
const SIZE_HIGHLIGHT = 0x66ffee; // 高亮浅青（内层渐变）
const SIZE_WHITE = 0xffffff;    // 白色（核心高亮）

// ══════════════════════════════════════════════════════
//  数据结构
// ══════════════════════════════════════════════════════

/** 活跃扭曲场实例（常驻） */
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

/** 活跃爆发特效（蓄压→撕裂→余波 三阶段） */
interface ActiveSizeBurst extends ActiveBurstBase {
  coreGraphics: PIXI.Graphics;       // 体积坍缩奇点
  gridGraphics: PIXI.Graphics;       // 形变网格
  ringGraphics: PIXI.Graphics;       // 尺寸刻度环
  haloGraphics: PIXI.Graphics;       // 余波光晕
  x: number;
  y: number;
}

// ══════════════════════════════════════════════════════
//  SizeWarpRenderer
// ══════════════════════════════════════════════════════

export class SizeWarpRenderer extends BaseWeaponEffectRenderer {
  private activeFields = new Map<string, ActiveWarpField>();
  private activeBursts = new Map<string, ActiveSizeBurst>();

  constructor(fieldContainer: PIXI.Container, particlePool: ParticlePool) {
    super(fieldContainer, particlePool);
  }

  // ═══ 扭曲场 ═══

  /**
   * 触发体积扭曲场视觉效果
   * @param playerId 玩家 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param radius 扭曲场半径（逻辑 px）
   * @param themeColor 主题色（默认控制者青）
   */
  triggerWarp(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor: number = SIZE_MAIN,
  ): void {
    // 已存在则仅更新位置
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

  /** 移除体积扭曲场 */
  removeWarp(playerId: string): void {
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
      g.stroke({ color: palette.highlight, width: 1, alpha });
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

  /**
   * 触发体积扭曲爆发
   * @param playerId 玩家 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param radius 爆发半径（逻辑 px）
   * @param themeColor 主题色（默认控制者青）
   * @param durationMs 爆发持续时间（ms，默认 1500）
   */
  triggerBurst(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor: number = SIZE_MAIN,
    durationMs?: number,
  ): void {
    // 若已存在，先销毁旧实例
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
      container, life: 0, maxLife: durationMs ?? 1500, themeColor, radius, particleTimer: 0, palette,
      coreGraphics, gridGraphics, ringGraphics, haloGraphics, x, y,
    };
    this.activeBursts.set(playerId, burst);
  }

  // ═══ 三阶段钩子 ═══

  /** 阶段1 蓄压（0-15%T）：椭圆场剧烈压缩，坍缩奇点逐渐显现 */
  protected phase1Charge(burst: ActiveBurstBase, t: number): void {
    const b = burst as ActiveSizeBurst;
    const ease = this.easeOutCubic(t);
    // 椭圆场剧烈压缩（6 层椭圆，squash 形变加剧）
    b.gridGraphics.clear();
    const r = b.radius * (1 - ease * 0.8);
    for (let i = 0; i < 6; i++) {
      const ti = i / 5;
      g_ellipse(b.gridGraphics, r * (1 - ti * 0.9) * (1 + ease * 0.2), r * (1 - ti * 0.9) * (1 - ease * 0.2));
      b.gridGraphics.fill({
        color: this.interpolateColor(b.palette.glow, b.palette.shadow, ti),
        alpha: (1 - ti) * 0.5 * (1 - t * 0.5),
      });
    }
    // 坍缩奇点逐渐显现
    b.coreGraphics.clear();
    this.drawCollapseCore(b.coreGraphics, b.radius * 0.05 * ease, b.palette, t * 0.5);
    b.ringGraphics.alpha = 0;
    b.haloGraphics.alpha = 0;
  }

  /** 阶段2 撕裂（15%-30%T）：坍缩奇点满显 + 尺寸刻度环展开 + 粒子飞散 */
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
    // 发射扭曲粒子
    b.particleTimer += 16;
    if (b.particleTimer > 60) {
      b.particleTimer = 0;
      this.spawnWarpParticles(b, 2);
    }
  }

  /** 阶段3 余波（30%-100%T）：刻度环外扩消散，奇点残留淡出，余波光晕 */
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

  /** 绘制体积坍缩奇点（10 层径向渐变 + 白色核心） */
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

  /** 绘制尺寸刻度环（4 层同心环 + 8 方位刻度标记） */
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

  /** 绘制余波光晕（4 层椭圆扩散） */
  private drawBurstHalo(g: PIXI.Graphics, radius: number, palette: Palette, progress: number): void {
    g.clear();
    const r = radius * (1 + progress * 0.5);
    for (let i = 0; i < 4; i++) {
      g.ellipse(0, 0, r * (0.8 + i * 0.05), r * (1 + i * 0.05));
      g.stroke({ color: palette.glow, width: 0.8, alpha: 0.3 - i * 0.05 });
    }
  }

  /** 发射扭曲粒子（带 tintStart/tintEnd 渐变 + 阻力衰减） */
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
    // 更新扭曲场
    this.activeFields.forEach((f) => {
      f.life += dt;
      this.drawSquashEllipse(f.ellipseGraphics, f.radius, f.palette, f.life);
      this.drawScaleBars(f.scaleBarGraphics, f.radius, f.palette, f.life);
      this.drawCompressionWaves(f.waveGraphics, f.radius, f.palette, f.life);
      const breath = 1 + 0.05 * Math.sin(f.life * 0.002 * Math.PI);
      f.haloGraphics.scale.set(breath);
      // 漂浮粒子
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

    // 更新爆发（三阶段调度）
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
