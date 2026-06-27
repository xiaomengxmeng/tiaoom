/**
 * 弹射核心 (Ricochet Core) - 变奏者流派
 * 前端视觉渲染器
 *
 * 视觉设计（变奏者橙金系 —— 多段反射与弹道齐射）：
 * - 反弹场 RicochetField：6 条多段反射折线（每条 3 段反射，端点带反射角标记弧）
 *   + 弹道余晖粒子（沿反射路径喷射）
 *   + 中心反射核心（8 层径向渐变 + 白色核心）
 * - 爆发 Burst：三阶段动画
 *   · 蓄压（0-15%T）：反射线收缩汇聚，核心蓄压显现
 *   · 弹射（15%-30%T）：12 条弹道齐射 + 反射网络（连接外端点）+ 中心爆炸
 *   · 余波（30%-100%T）：弹道消散，反射网络淡出
 *
 * API：triggerRicochet / removeRicochet / triggerBurst / update / setScale / clear / destroy
 */

import * as PIXI from 'pixi.js';
import { ParticlePool } from '../systems/ParticlePool';
import { BaseWeaponEffectRenderer, type ActiveBurstBase, type Palette } from './BaseWeaponEffectRenderer';

// ══════════════════════════════════════════════════════
//  颜色常量（变奏者橙金系）
// ══════════════════════════════════════════════════════

const RICO_TRAIL = 0xff8800;   // 弹道余晖橙
const RICO_NODE = 0xffcc00;    // 反射节点金
const RICO_ANGLE = 0xff4400;   // 反射角标记红橙
const RICO_WHITE = 0xffffff;   // 中心核高亮白

/** 反弹线数量 */
const RICO_LINE_COUNT = 6;
/** 每条反弹线的反射段数 */
const RICO_BOUNCE_SEGMENTS = 3;
/** 弹道齐射数量 */
const RICO_SALVO_COUNT = 12;

// ══════════════════════════════════════════════════════
//  数据结构
// ══════════════════════════════════════════════════════

/** 活跃反弹场实例（常驻） */
interface ActiveRicochetField {
  container: PIXI.Container;
  lineGraphics: PIXI.Graphics;     // 6 条多段反射折线 + 端点节点 + 反射角标记
  coreGraphics: PIXI.Graphics;    // 中心反射核心（8 层径向渐变）
  particleTimer: number;
  life: number;
  maxLife: number;
  x: number;
  y: number;
  radius: number;
  themeColor: number;
  palette: Palette;
}

/** 活跃爆发特效（蓄压→弹射→余波 三阶段） */
interface ActiveRicochetBurst extends ActiveBurstBase {
  bladeGraphics: PIXI.Graphics;   // 12 条弹道齐射 + 反射网络
  coreGraphics: PIXI.Graphics;    // 中心爆炸
  x: number;
  y: number;
}

// ══════════════════════════════════════════════════════
//  RicochetCoreRenderer
// ══════════════════════════════════════════════════════

export class RicochetCoreRenderer extends BaseWeaponEffectRenderer {
  private activeFields = new Map<string, ActiveRicochetField>();
  private activeBursts = new Map<string, ActiveRicochetBurst>();

  constructor(fieldContainer: PIXI.Container, particlePool: ParticlePool) {
    super(fieldContainer, particlePool);
  }

  // ═══ 反弹场 ═══

  /**
   * 触发反弹场视觉效果
   * @param playerId 玩家 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param radius 反弹场半径（逻辑 px）
   * @param themeColor 主题色（默认变奏者橙金）
   */
  triggerRicochet(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor: number = RICO_TRAIL,
  ): void {
    // 已存在则仅更新位置与半径
    const existing = this.activeFields.get(playerId);
    if (existing) {
      existing.x = x;
      existing.y = y;
      existing.radius = radius;
      existing.container.position.set(x, y);
      return;
    }

    const palette = this.buildPalette(themeColor);
    const container = new PIXI.Container();
    container.position.set(x, y);
    container.scale.set(this.scale);
    this.container.addChild(container);

    const lineGraphics = new PIXI.Graphics();
    const coreGraphics = new PIXI.Graphics();
    container.addChild(lineGraphics, coreGraphics);

    const field: ActiveRicochetField = {
      container, lineGraphics, coreGraphics,
      particleTimer: 0, life: 0, maxLife: Infinity,
      x, y, radius, themeColor, palette,
    };
    this.drawFieldCore(coreGraphics, radius, palette);
    this.activeFields.set(playerId, field);
  }

  /** 移除反弹场 */
  removeRicochet(playerId: string): void {
    const f = this.activeFields.get(playerId);
    if (!f) return;
    this.container.removeChild(f.container);
    f.container.destroy({ children: true });
    this.activeFields.delete(playerId);
  }

  /**
   * 绘制 6 条多段反射折线：每条 3 段反射，端点带反射角标记弧
   * - 反射规则：每段后角度 +90° 偏转（带 ±0.3 rad 扰动，依线号奇偶）
   * - 端点节点：金色高亮圆点（RICO_NODE）
   * - 反射角标记：以端点为圆心的小弧（RICO_ANGLE）
   */
  private drawRicochetLines(g: PIXI.Graphics, radius: number, palette: Palette, life: number): void {
    g.clear();
    const rotation = life * 0.0005 * Math.PI;
    for (let i = 0; i < RICO_LINE_COUNT; i++) {
      const startAngle = (i * Math.PI * 2) / RICO_LINE_COUNT + rotation;
      // 起点：距中心 0.3R
      let x = Math.cos(startAngle) * radius * 0.3;
      let y = Math.sin(startAngle) * radius * 0.3;
      let angle = startAngle;
      // 3 段反射
      for (let seg = 0; seg < RICO_BOUNCE_SEGMENTS; seg++) {
        const len = radius * 0.25;
        const endX = x + Math.cos(angle) * len;
        const endY = y + Math.sin(angle) * len;
        // 反射线（弹道发光）
        g.moveTo(x, y);
        g.lineTo(endX, endY);
        g.stroke({ color: palette.glow, width: 1.5, alpha: 0.7 });
        // 端点节点（金色）
        g.circle(endX, endY, Math.max(0.5, 2));
        g.fill({ color: RICO_NODE, alpha: 0.85 });
        // 反射角标记（在端点画小弧）
        g.arc(endX, endY, Math.max(0.5, 4), angle - 0.5, angle + 0.5);
        g.stroke({ color: RICO_ANGLE, width: 1, alpha: 0.5 });
        // 反射（角度 + 90° 偏转，奇偶线号反向扰动）
        angle = angle + Math.PI / 2 + (i % 2 === 0 ? 0.3 : -0.3);
        x = endX; y = endY;
      }
    }
  }

  /** 绘制中心反射核心（8 层径向渐变 + 白色中心核） */
  private drawFieldCore(g: PIXI.Graphics, radius: number, palette: Palette): void {
    g.clear();
    this.drawMultilayerCircle(
      g, Math.max(0.5, radius * 0.3), 8,
      (t) => this.interpolateColor(palette.highlight, palette.shadow, t),
      (t) => (1 - t) * 0.5,
    );
    g.circle(0, 0, Math.max(0.5, 4));
    g.fill({ color: RICO_WHITE });
    g.circle(0, 0, Math.max(0.5, 6));
    g.stroke({ color: palette.glow, width: 1, alpha: 0.8 });
  }

  /** 弹道余晖粒子（沿反射路径喷射，利用 tintStart/tintEnd 渐变） */
  private spawnTrailParticles(f: ActiveRicochetField): void {
    for (let i = 0; i < 2; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * f.radius * 0.7;
      this.particlePool.emit({
        x: f.x + Math.cos(angle) * dist,
        y: f.y + Math.sin(angle) * dist,
        vx: Math.cos(angle) * 40,
        vy: Math.sin(angle) * 40,
        drag: 0.9, life: 400,
        scaleStart: 1, scaleEnd: 0,
        alphaStart: 0.6, alphaEnd: 0,
        tint: RICO_TRAIL,
        tintStart: f.palette.highlight,
        tintEnd: f.palette.dim,
        radius: 1.5,
      });
    }
  }

  // ═══ 爆发 ═══

  /**
   * 触发弹射风暴爆发
   * @param playerId 玩家 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param radius 爆发半径（逻辑 px）
   * @param themeColor 主题色（默认变奏者橙金）
   * @param durationMs 爆发持续时间（ms，默认 1500）
   */
  triggerBurst(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor: number = RICO_TRAIL,
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

    const bladeGraphics = new PIXI.Graphics();
    const coreGraphics = new PIXI.Graphics();
    container.addChild(bladeGraphics, coreGraphics);

    const burst: ActiveRicochetBurst = {
      container, life: 0, maxLife: durationMs ?? 1500, themeColor, radius,
      particleTimer: 0, palette,
      bladeGraphics, coreGraphics, x, y,
    };
    this.activeBursts.set(playerId, burst);
  }

  // ═══ 三阶段钩子 ═══

  /** 阶段1 蓄压（0-15%T）：反射线收缩汇聚，核心蓄压显现 */
  protected phase1Charge(burst: ActiveBurstBase, t: number): void {
    const b = burst as ActiveRicochetBurst;
    const ease = this.easeInCubic(t);
    // 反射线收缩汇聚（6 条短线指向中心）
    b.bladeGraphics.clear();
    const r = b.radius * 0.3 * (1 - ease * 0.5);
    for (let i = 0; i < RICO_LINE_COUNT; i++) {
      const angle = (i * Math.PI * 2) / RICO_LINE_COUNT;
      const endX = Math.cos(angle) * r;
      const endY = Math.sin(angle) * r;
      b.bladeGraphics.moveTo(0, 0);
      b.bladeGraphics.lineTo(endX, endY);
      b.bladeGraphics.stroke({ color: b.palette.glow, width: 1.5, alpha: 0.6 * (1 - t * 0.3) });
    }
    // 核心蓄压显现
    b.coreGraphics.clear();
    this.drawMultilayerCircle(
      b.coreGraphics, Math.max(0.5, b.radius * 0.1 * ease), 6,
      (ti) => this.interpolateColor(b.palette.highlight, b.palette.shadow, ti),
      (ti) => (1 - ti) * 0.6 * ease,
    );
  }

  /** 阶段2 弹射（15%-30%T）：12 条弹道齐射 + 反射网络 + 中心爆炸 */
  protected phase2Burst(burst: ActiveBurstBase, t: number): void {
    const b = burst as ActiveRicochetBurst;
    const ease = this.easeOutCubic(t);
    // 手动变换顶点（避免 g.rotation 在循环内只保留末帧 bug）
    const rotation = b.life * 0.002;
    const len = b.radius * ease;
    // 12 条弹道齐射
    b.bladeGraphics.clear();
    for (let i = 0; i < RICO_SALVO_COUNT; i++) {
      const angle = (i * Math.PI * 2) / RICO_SALVO_COUNT + rotation;
      const endX = Math.cos(angle) * len;
      const endY = Math.sin(angle) * len;
      // 弹道
      b.bladeGraphics.moveTo(0, 0);
      b.bladeGraphics.lineTo(endX, endY);
      b.bladeGraphics.stroke({ color: b.palette.glow, width: 2, alpha: ease });
      // 弹头
      b.bladeGraphics.circle(endX, endY, Math.max(0.5, 3));
      b.bladeGraphics.fill({ color: b.palette.highlight, alpha: ease });
    }
    // 反射网络（连接相邻外端点）
    for (let i = 0; i < RICO_SALVO_COUNT; i++) {
      const next = (i + 1) % RICO_SALVO_COUNT;
      const angle1 = (i * Math.PI * 2) / RICO_SALVO_COUNT + rotation;
      const angle2 = (next * Math.PI * 2) / RICO_SALVO_COUNT + rotation;
      b.bladeGraphics.moveTo(Math.cos(angle1) * len, Math.sin(angle1) * len);
      b.bladeGraphics.lineTo(Math.cos(angle2) * len, Math.sin(angle2) * len);
      b.bladeGraphics.stroke({ color: b.palette.dim, width: 0.8, alpha: ease * 0.5 });
    }
    // 中心爆炸
    b.coreGraphics.clear();
    this.drawMultilayerCircle(
      b.coreGraphics, Math.max(0.5, b.radius * 0.15 * ease), 8,
      (ti) => this.interpolateColor(b.palette.highlight, b.palette.shadow, ti),
      (ti) => (1 - ti) * ease,
    );
    // 弹道余晖粒子（节流：固定步长 16ms，避免 b.life 累加 bug）
    b.particleTimer += 16;
    if (b.particleTimer > 80) {
      b.particleTimer = 0;
      this.spawnBurstParticles(b, 2);
    }
  }

  /** 阶段3 余波（30%-100%T）：弹道消散，反射网络淡出 */
  protected phase3Diffuse(burst: ActiveBurstBase, t: number): void {
    const b = burst as ActiveRicochetBurst;
    const ease = this.easeOutCubic(t);
    // 弹道消散（手动变换顶点）
    b.bladeGraphics.clear();
    const rotation = b.life * 0.002;
    const len = b.radius * (1 + ease * 0.3);
    for (let i = 0; i < RICO_SALVO_COUNT; i++) {
      const angle = (i * Math.PI * 2) / RICO_SALVO_COUNT + rotation;
      const endX = Math.cos(angle) * len;
      const endY = Math.sin(angle) * len;
      b.bladeGraphics.moveTo(0, 0);
      b.bladeGraphics.lineTo(endX, endY);
      b.bladeGraphics.stroke({ color: b.palette.glow, width: 1.5, alpha: (1 - ease) * 0.5 });
    }
    // 中心爆炸淡出
    b.coreGraphics.clear();
    this.drawMultilayerCircle(
      b.coreGraphics, Math.max(0.5, b.radius * 0.15 * (1 - ease * 0.5)), 6,
      (ti) => this.interpolateColor(b.palette.highlight, b.palette.shadow, ti),
      (ti) => (1 - ti) * (1 - ease) * 0.6,
    );
  }

  /** 弹道余晖粒子（爆发期，带 tintStart/tintEnd 渐变 + 阻力衰减） */
  private spawnBurstParticles(b: ActiveRicochetBurst, count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 60;
      this.particlePool.emit({
        x: b.x, y: b.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        drag: 0.85, life: 500,
        scaleStart: 1.2, scaleEnd: 0,
        alphaStart: 0.7, alphaEnd: 0,
        tint: RICO_TRAIL,
        tintStart: b.palette.highlight,
        tintEnd: b.palette.dim,
        radius: 1.8,
      });
    }
  }

  // ═══ 生命周期 ═══

  update(dt: number): void {
    // 更新反弹场
    this.activeFields.forEach((f) => {
      f.life += dt;
      this.drawRicochetLines(f.lineGraphics, f.radius, f.palette, f.life);
      // 核心呼吸
      const breath = 1 + 0.05 * Math.sin(f.life * 0.002 * Math.PI);
      f.coreGraphics.scale.set(breath);
      // 弹道余晖粒子
      f.particleTimer += dt;
      if (f.particleTimer > 200) {
        f.particleTimer = 0;
        this.spawnTrailParticles(f);
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

  private removeBurstInstance(b: ActiveRicochetBurst): void {
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
