/**
 * 追猎协议 (Pursuit Protocol) - 侵略者流派
 * 前端视觉渲染器
 *
 * 视觉主题（Spec §6.1 #3 —— 战术追踪）：
 * - 追猎场（常驻）：
 *   · 旋转准星（双层十字 + 4 角 L 形锁定框，独立正向旋转）
 *   · 贝塞尔追踪粒子流（沿追猎者→目标的二次贝塞尔曲线流动）
 *   · 追踪线（每帧重绘，连接追猎者与目标，弧形）
 * - 爆发：三阶段动画
 *   · 蓄压（0-15%T）：准星收缩，能量向中心汇聚
 *   · 弹道齐射（15-30%T）：6 枚追踪弹从外围向中心飞行 + 命中爆炸 + 弹壳抛洒（带重力下落）
 *   · 余波（30-100%T）：弹道消散，爆炸残留淡出
 *
 * 独特符号：旋转准星、贝塞尔追踪、弹道齐射、弹壳抛洒
 *
 * API：triggerPursuitMark / updatePursuitMark / removePursuitMark / triggerBurst / update / setScale / clear / destroy
 * 所有动画由 update(dt) 驱动。
 */

import * as PIXI from 'pixi.js';
import { ParticlePool } from '../systems/ParticlePool';
import { BaseWeaponEffectRenderer, type ActiveBurstBase, type Palette } from './BaseWeaponEffectRenderer';

// ══════════════════════════════════════════════════════
//  颜色常量（追猎橙红 + 锁定金/红）
// ══════════════════════════════════════════════════════

const PURSUIT_MAIN = 0xdd3322;       // 主橙红（默认 themeColor）
const PURSUIT_LOCK = 0xff4400;       // 锁定红（锁定框）

// ══════════════════════════════════════════════════════
//  数据结构
// ══════════════════════════════════════════════════════

/** 活跃追猎场（常驻，准星随目标移动，追踪线随追猎者重绘） */
interface ActivePursuitField {
  container: PIXI.Container;
  crosshairGraphics: PIXI.Graphics;  // 旋转准星（双层十字 + 锁定框）
  trackLineGraphics: PIXI.Graphics;  // 贝塞尔追踪线（世界坐标，挂 this.container）
  particleTimer: number;
  life: number;
  maxLife: number;
  targetX: number;
  targetY: number;
  hunterX: number;
  hunterY: number;
  radius: number;
  themeColor: number;
  palette: Palette;
}

/** 活跃爆发（弹道齐射 + 命中爆炸 + 弹壳抛洒） */
interface ActivePursuitBurst extends ActiveBurstBase {
  salvoGraphics: PIXI.Graphics;   // 弹道齐射（6 枚追踪弹）
  impactGraphics: PIXI.Graphics;  // 中心命中爆炸
  haloGraphics: PIXI.Graphics;    // 余波光晕
  x: number;
  y: number;
}

// ══════════════════════════════════════════════════════
//  渲染器
// ══════════════════════════════════════════════════════

export class PursuitProtocolRenderer extends BaseWeaponEffectRenderer {
  private activeFields = new Map<string, ActivePursuitField>();
  private activeBursts = new Map<string, ActivePursuitBurst>();

  constructor(fieldContainer: PIXI.Container, particlePool: ParticlePool) {
    super(fieldContainer, particlePool);
  }

  // ═══ 追猎场 ═══

  triggerPursuitMark(
    targetId: string,
    targetX: number,
    targetY: number,
    hunterX: number,
    hunterY: number,
    radius: number,
    themeColor: number = PURSUIT_MAIN,
  ): void {
    // 已存在则更新位置（目标与追猎者都会移动）
    const existing = this.activeFields.get(targetId);
    if (existing) {
      existing.targetX = targetX;
      existing.targetY = targetY;
      existing.hunterX = hunterX;
      existing.hunterY = hunterY;
      existing.radius = radius;
      existing.container.position.set(targetX, targetY);
      return;
    }

    const palette = this.buildPalette(themeColor);
    const container = new PIXI.Container();
    container.position.set(targetX, targetY);
    container.scale.set(this.scale);
    this.container.addChild(container);

    // 旋转准星
    const crosshairGraphics = new PIXI.Graphics();
    container.addChild(crosshairGraphics);

    // 追踪线挂世界容器（连接追猎者与目标两个世界坐标点，不应随目标容器缩放）
    const trackLineGraphics = new PIXI.Graphics();
    this.container.addChild(trackLineGraphics);

    const field: ActivePursuitField = {
      container,
      crosshairGraphics,
      trackLineGraphics,
      particleTimer: 0,
      life: 0,
      maxLife: Infinity,
      targetX,
      targetY,
      hunterX,
      hunterY,
      radius,
      themeColor,
      palette,
    };
    this.activeFields.set(targetId, field);
  }

  updatePursuitMark(
    targetId: string,
    targetX: number,
    targetY: number,
    hunterX: number,
    hunterY: number,
  ): void {
    const f = this.activeFields.get(targetId);
    if (!f) return;
    f.targetX = targetX;
    f.targetY = targetY;
    f.hunterX = hunterX;
    f.hunterY = hunterY;
    f.container.position.set(targetX, targetY);
  }

  removePursuitMark(targetId: string): void {
    const f = this.activeFields.get(targetId);
    if (!f) return;
    this.container.removeChild(f.container);
    this.container.removeChild(f.trackLineGraphics);
    f.container.destroy({ children: true });
    f.trackLineGraphics.destroy();
    this.activeFields.delete(targetId);
  }

  // ═══ 独特视觉：旋转准星 ═══

  /**
   * 旋转准星（独特符号 #1）：
   * - 外层十字（4 线，0.4r→0.9r，palette.glow）
   * - 内层十字（4 线斜向，0.15r→0.35r，palette.highlight）
   * - 4 角 L 形锁定框（PURSUIT_LOCK 红）
   * - 中心点（高亮实心 + 辉光环）
   * Graphics 自身 rotation 在 update 中正向旋转
   */
  private drawRotatingCrosshair(g: PIXI.Graphics, radius: number, palette: Palette): void {
    g.clear();
    // 外层十字（正向，90° 均分）
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      const x1 = Math.cos(angle) * radius * 0.4;
      const y1 = Math.sin(angle) * radius * 0.4;
      const x2 = Math.cos(angle) * radius * 0.9;
      const y2 = Math.sin(angle) * radius * 0.9;
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke({ color: palette.glow, width: 1.5, alpha: 0.8 });
    }
    // 内层十字（斜向 45°，更短，高亮色）
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2 + Math.PI / 4;
      const x1 = Math.cos(angle) * radius * 0.15;
      const y1 = Math.sin(angle) * radius * 0.15;
      const x2 = Math.cos(angle) * radius * 0.35;
      const y2 = Math.sin(angle) * radius * 0.35;
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke({ color: palette.highlight, width: 1, alpha: 0.9 });
    }
    // 4 角 L 形锁定框
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
    // 中心点（高亮实心 + 辉光环）
    g.circle(0, 0, 3);
    g.fill({ color: palette.highlight, alpha: 1 });
    g.circle(0, 0, 5);
    g.stroke({ color: palette.glow, width: 1, alpha: 0.8 });
  }

  // ═══ 独特视觉：贝塞尔追踪线 + 粒子流 ═══

  /**
   * 绘制贝塞尔追踪线（独特符号 #2）：追猎者→目标的二次贝塞尔曲线（带控制点偏移呈弧形）
   */
  private drawBezierTrackLine(
    g: PIXI.Graphics,
    hunterX: number,
    hunterY: number,
    targetX: number,
    targetY: number,
    palette: Palette,
  ): void {
    g.clear();
    const midX = (hunterX + targetX) / 2;
    const midY = (hunterY + targetY) / 2;
    const dx = targetX - hunterX;
    const dy = targetY - hunterY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const perpX = dist > 0 ? -dy / dist : 0;
    const perpY = dist > 0 ? dx / dist : 0;
    const offset = dist * 0.15;
    const cpX = midX + perpX * offset;
    const cpY = midY + perpY * offset;
    g.moveTo(hunterX, hunterY);
    g.quadraticCurveTo(cpX, cpY, targetX, targetY);
    g.stroke({ color: palette.glow, width: 1, alpha: 0.7 });
  }

  /**
   * 沿贝塞尔曲线发射追踪粒子（独特符号 #2：贝塞尔追踪粒子流）
   * 在曲线上随机一点生成粒子，向目标流动
   */
  private spawnBezierTrackingParticles(f: ActivePursuitField): void {
    const s = this.scale;
    const { hunterX, hunterY, targetX, targetY } = f;
    const midX = (hunterX + targetX) / 2;
    const midY = (hunterY + targetY) / 2;
    const dx = targetX - hunterX;
    const dy = targetY - hunterY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const perpX = dist > 0 ? -dy / dist : 0;
    const perpY = dist > 0 ? dx / dist : 0;
    const offset = dist * 0.15;
    const cpX = midX + perpX * offset;
    const cpY = midY + perpY * offset;
    // 贝塞尔曲线点：B(t) = (1-t)^2*P0 + 2(1-t)t*P1 + t^2*P2
    const t = Math.random();
    const px = (1 - t) * (1 - t) * hunterX + 2 * (1 - t) * t * cpX + t * t * targetX;
    const py = (1 - t) * (1 - t) * hunterY + 2 * (1 - t) * t * cpY + t * t * targetY;
    // 向目标流动
    const flowSpeed = 80 * s;
    const flowAngle = Math.atan2(targetY - py, targetX - px);
    this.particlePool.emit({
      x: px,
      y: py,
      vx: Math.cos(flowAngle) * flowSpeed,
      vy: Math.sin(flowAngle) * flowSpeed,
      drag: 0.3,
      life: 500,
      scaleStart: 1,
      scaleEnd: 0,
      alphaStart: 0.8,
      alphaEnd: 0,
      tint: f.palette.glow,
      radius: 2 * s,
    });
  }

  // ═══ 爆发 ═══

  triggerBurst(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor: number = PURSUIT_MAIN,
    durationMs?: number,
  ): void {
    // 若已存在，先销毁旧实例
    const existing = this.activeBursts.get(playerId);
    if (existing) {
      this.removeBurstInstance(existing);
    }

    const palette = this.buildPalette(themeColor);
    const container = new PIXI.Container();
    container.position.set(x, y);
    container.scale.set(this.scale);
    this.container.addChild(container);

    const salvoGraphics = new PIXI.Graphics();   // 弹道齐射
    const impactGraphics = new PIXI.Graphics();  // 命中爆炸
    const haloGraphics = new PIXI.Graphics();    // 余波光晕
    container.addChild(salvoGraphics, impactGraphics, haloGraphics);

    const burst: ActivePursuitBurst = {
      container,
      life: 0,
      maxLife: durationMs ?? 1500,
      themeColor,
      radius,
      particleTimer: 0,
      palette,
      salvoGraphics,
      impactGraphics,
      haloGraphics,
      x,
      y,
    };
    this.activeBursts.set(playerId, burst);
  }

  // ═══ 三阶段钩子 ═══

  protected phase1Charge(burst: ActiveBurstBase, t: number): void {
    const b = burst as ActivePursuitBurst;
    const ease = this.easeOutCubic(t);
    // 蓄压：准星收缩汇聚
    this.drawChargeCrosshair(b.salvoGraphics, b.radius * (1 - ease * 0.7), b.palette);
    b.salvoGraphics.alpha = 1 - t * 0.3;
    // 命中爆炸与余波隐藏
    b.impactGraphics.alpha = 0;
    b.haloGraphics.alpha = 0;
  }

  protected phase2Burst(burst: ActiveBurstBase, t: number): void {
    const b = burst as ActivePursuitBurst;
    const ease = this.easeOutCubic(t);
    // 弹道齐射：6 枚追踪弹从外围向中心飞行
    this.drawBallisticSalvo(b.salvoGraphics, b.radius, b.palette, ease);
    b.salvoGraphics.alpha = 1;
    // 中心命中爆炸
    this.drawImpactExplosion(b.impactGraphics, b.radius * 0.2 * ease, b.palette, ease);
    b.impactGraphics.alpha = 1;
    // 弹壳抛洒（带重力下落）—— 节流
    b.particleTimer += 16;
    if (b.particleTimer > 40) {
      b.particleTimer = 0;
      this.spawnShellEjection(b, 4);
    }
  }

  protected phase3Diffuse(burst: ActiveBurstBase, t: number): void {
    const b = burst as ActivePursuitBurst;
    const ease = this.easeOutCubic(t);
    // 弹道消散
    b.salvoGraphics.alpha = 1 - ease;
    b.salvoGraphics.scale.set(1 + ease * 0.5);
    // 爆炸残留淡出
    this.drawImpactExplosion(b.impactGraphics, b.radius * 0.2 * (1 + ease * 0.5), b.palette, 1 - ease);
    b.impactGraphics.alpha = 1 - ease;
    // 余波光晕展开
    this.drawDiffuseHalo(b.haloGraphics, b.radius, b.palette, ease);
    b.haloGraphics.alpha = 1 - ease * 0.7;
    // 残余弹壳
    b.particleTimer += 16;
    if (b.particleTimer > 120) {
      b.particleTimer = 0;
      this.spawnShellEjection(b, 1);
    }
  }

  // ═══ 独特视觉：弹道齐射 ═══

  /**
   * 弹道齐射（独特符号 #3）：6 枚追踪弹从外围向中心飞行 + 弹道线 + 弹头辉光
   * @param progress 0→1，弹头从外围(radius*2)向中心(0)飞行
   */
  private drawBallisticSalvo(g: PIXI.Graphics, radius: number, palette: Palette, progress: number): void {
    g.clear();
    const startR = radius * 2 * (1 - progress);
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const startX = Math.cos(angle) * startR;
      const startY = Math.sin(angle) * startR;
      // 弹道线（从起点到中心）
      g.moveTo(startX, startY);
      g.lineTo(0, 0);
      g.stroke({ color: palette.glow, width: 2, alpha: 0.6 * progress });
      // 弹头（高亮实心）
      g.circle(startX, startY, 3);
      g.fill({ color: palette.highlight, alpha: progress });
      // 弹头辉光
      g.circle(startX, startY, 5);
      g.stroke({ color: palette.glow, width: 1, alpha: 0.5 * progress });
    }
  }

  /** 蓄压阶段收缩准星（向中心汇聚的十字） */
  private drawChargeCrosshair(g: PIXI.Graphics, radius: number, palette: Palette): void {
    g.clear();
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      const x1 = Math.cos(angle) * radius * 0.3;
      const y1 = Math.sin(angle) * radius * 0.3;
      const x2 = Math.cos(angle) * radius * 0.8;
      const y2 = Math.sin(angle) * radius * 0.8;
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke({ color: palette.glow, width: 1.5, alpha: 0.8 });
    }
    // 中心汇聚点
    g.circle(0, 0, 2);
    g.fill({ color: palette.highlight, alpha: 1 });
  }

  // ═══ 独特视觉：命中爆炸 ═══

  /**
   * 中心命中爆炸：多层渐变圆（highlight→shadow）+ 白色核心
   */
  private drawImpactExplosion(g: PIXI.Graphics, radius: number, palette: Palette, intensity: number): void {
    g.clear();
    this.drawMultilayerCircle(
      g, radius, 8,
      (t) => this.interpolateColor(palette.highlight, palette.shadow, t),
      (t) => (1 - t) * intensity,
    );
    // 白色核心
    g.circle(0, 0, Math.max(0.5, radius * 0.3));
    g.fill({ color: palette.highlight, alpha: intensity });
  }

  /** 余波光晕：4 层细环展开 */
  private drawDiffuseHalo(g: PIXI.Graphics, radius: number, palette: Palette, progress: number): void {
    g.clear();
    const r = radius * (1 + progress * 0.5);
    for (let i = 0; i < 4; i++) {
      const ringR = r * (0.7 + i * 0.1);
      g.circle(0, 0, ringR);
      g.stroke({ color: palette.glow, width: 0.8, alpha: 0.3 - i * 0.05 });
    }
  }

  // ═══ 独特视觉：弹壳抛洒（带重力下落） ═══

  /**
   * 弹壳抛洒（独特符号 #4）：从爆发中心向外抛射，带重力下落 + 阻力 + 旋转
   */
  private spawnShellEjection(burst: ActivePursuitBurst, count: number): void {
    const s = this.scale;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      this.particlePool.emit({
        x: burst.x,
        y: burst.y,
        vx: Math.cos(angle) * 100 * s,
        vy: Math.sin(angle) * 100 * s - 80 * s, // 略微向上初速
        ax: 0,
        ay: 300 * s, // 重力下落
        drag: 0.4,
        life: 1000,
        scaleStart: 1.5,
        scaleEnd: 0,
        alphaStart: 1,
        alphaEnd: 0,
        tint: burst.palette.primary,
        radius: 2 * s,
        rotationSpeed: (Math.random() - 0.5) * 15,
      });
    }
  }

  // ═══ 生命周期 ═══

  update(dt: number): void {
    // ── 追猎场：旋转准星 + 贝塞尔追踪线 + 粒子流 ──
    this.activeFields.forEach((f) => {
      f.life += dt;
      // 重绘旋转准星
      this.drawRotatingCrosshair(f.crosshairGraphics, f.radius, f.palette);
      // 准星正向旋转（0.5 转/秒）
      f.crosshairGraphics.rotation += dt * 0.001 * Math.PI;
      // 准星脉动 alpha（锁定闪烁感）
      f.crosshairGraphics.alpha = 0.7 + 0.3 * Math.sin(f.life * 0.004 * Math.PI);
      // 重绘贝塞尔追踪线（每帧，追猎者与目标都可能移动）
      this.drawBezierTrackLine(
        f.trackLineGraphics,
        f.hunterX,
        f.hunterY,
        f.targetX,
        f.targetY,
        f.palette,
      );
      // 贝塞尔追踪粒子流（节流）
      f.particleTimer += dt;
      if (f.particleTimer > 80) {
        f.particleTimer = 0;
        this.spawnBezierTrackingParticles(f);
      }
    });

    // ── 爆发：三阶段动画 ──
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

  private removeBurstInstance(b: ActivePursuitBurst): void {
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
      this.container.removeChild(f.trackLineGraphics);
      f.container.destroy({ children: true });
      f.trackLineGraphics.destroy();
    });
    this.activeFields.clear();
    this.activeBursts.forEach((b) => this.removeBurstInstance(b));
    this.activeBursts.clear();
  }
}
