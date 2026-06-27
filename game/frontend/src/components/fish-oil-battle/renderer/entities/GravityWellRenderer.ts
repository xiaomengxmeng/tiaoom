/**
 * 重力阱 (Gravity Well) - 控制者流派
 * 前端视觉渲染器
 *
 * 视觉设计（控制者紫色系 —— 时空弯曲，引力吸引）：
 * - 重力核心 GravityCore：3 条阿基米德螺旋臂（向心旋转）
 *   + 时空网格扭曲（径向弯曲网格线 + 同心圆网格）
 *   + 引力透镜光环（多层渐变 + 双层主环 + 中心引力核）
 *   + 引力粒子（紫色，向心被吸）
 * - 爆发 Burst：三阶段动画
 *   · 蓄压（0-15%T）：螺旋臂收缩汇聚，时空网格扭曲加剧，事件视界逐渐显现
 *   · 爆发（15%-30%T）：黑洞坍缩（吸积盘旋转 + 事件视界 + 引力波纹）
 *   · 扩散（30%-100%T）：吸积盘消散，事件视界淡出，引力波纹扩散
 *
 * API：triggerGravityCore / removeGravityCore / triggerBurst / update / setScale / clear / destroy
 * 所有动画由 update(dt) 驱动，不使用 rAF / setTimeout。
 */

import * as PIXI from 'pixi.js';
import { ParticlePool } from '../systems/ParticlePool';
import { BaseWeaponEffectRenderer, type ActiveBurstBase, type Palette } from './BaseWeaponEffectRenderer';

// ══════════════════════════════════════════════════════
//  颜色常量（控制者紫）
// ══════════════════════════════════════════════════════

const GRAVITY_MAIN = 0x6600cc; // 主紫（默认主题色）
const GRAVITY_VOID = 0x000000; // 事件视界黑色

// ══════════════════════════════════════════════════════
//  数据结构
// ══════════════════════════════════════════════════════

/** 活跃重力核心实例（常驻，螺旋臂向心旋转） */
interface ActiveGravityCore {
  container: PIXI.Container;
  spiralGraphics: PIXI.Graphics; // 3 条阿基米德螺旋臂
  gridGraphics: PIXI.Graphics; // 时空网格扭曲
  haloGraphics: PIXI.Graphics; // 引力透镜光环
  particleTimer: number;
  life: number;
  maxLife: number;
  x: number;
  y: number;
  radius: number;
  themeColor: number;
  palette: Palette;
}

/** 活跃爆发特效（三阶段：蓄压 → 黑洞坍缩 → 扩散） */
interface ActiveGravityBurst extends ActiveBurstBase {
  bladeGraphics: PIXI.Graphics; // 吸积盘（蓄压期：收缩螺旋臂）
  coreGraphics: PIXI.Graphics; // 事件视界
  haloGraphics: PIXI.Graphics; // 引力波纹
  gridGraphics: PIXI.Graphics; // 时空网格扭曲（蓄压期）
  x: number;
  y: number;
}

// ══════════════════════════════════════════════════════
//  渲染器
// ══════════════════════════════════════════════════════

export class GravityWellRenderer extends BaseWeaponEffectRenderer {
  private activeCores = new Map<string, ActiveGravityCore>();
  private activeBursts = new Map<string, ActiveGravityBurst>();

  constructor(fieldContainer: PIXI.Container, particlePool: ParticlePool) {
    super(fieldContainer, particlePool);
  }

  // ══════════════════════════════════════════════════════
  //  重力核心 GravityCore（常驻，螺旋臂向心旋转）
  // ══════════════════════════════════════════════════════

  /**
   * 触发重力核心视觉效果
   * @param playerId 玩家 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param radius 重力核心半径（逻辑 px）
   * @param themeColor 主题色（默认主紫）
   */
  triggerGravityCore(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor: number = GRAVITY_MAIN,
  ): void {
    // 已存在则仅更新位置
    const existing = this.activeCores.get(playerId);
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

    const haloGraphics = new PIXI.Graphics();
    const spiralGraphics = new PIXI.Graphics();
    const gridGraphics = new PIXI.Graphics();
    container.addChild(haloGraphics, spiralGraphics, gridGraphics);

    const core: ActiveGravityCore = {
      container,
      spiralGraphics,
      gridGraphics,
      haloGraphics,
      particleTimer: 0,
      life: 0,
      maxLife: Infinity, // 常驻，直到手动移除
      x,
      y,
      radius,
      themeColor,
      palette,
    };
    this.drawCoreHalo(haloGraphics, radius, palette);
    this.activeCores.set(playerId, core);
  }

  /** 移除重力核心 */
  removeGravityCore(playerId: string): void {
    const c = this.activeCores.get(playerId);
    if (!c) return;
    this.container.removeChild(c.container);
    c.container.destroy({ children: true });
    this.activeCores.delete(playerId);
  }

  /** 绘制引力透镜光环（多层渐变 + 双层主环 + 中心引力核） */
  private drawCoreHalo(g: PIXI.Graphics, radius: number, palette: Palette): void {
    g.clear();
    // 8 层径向渐变（高亮紫 → 阴影紫）
    this.drawMultilayerCircle(
      g,
      radius,
      8,
      (t) => this.interpolateColor(palette.highlight, palette.shadow, t),
      (t) => (1 - t) * 0.4,
    );
    // 双层主环
    g.circle(0, 0, radius);
    g.stroke({ color: palette.glow, width: 1, alpha: 0.7 });
    g.circle(0, 0, radius * 0.95);
    g.stroke({ color: palette.highlight, width: 0.4, alpha: 0.5 });
    // 中心引力核
    g.circle(0, 0, 4);
    g.fill({ color: 0xffffff });
    g.circle(0, 0, 6);
    g.stroke({ color: palette.glow, width: 1, alpha: 0.8 });
  }

  /** 1. 3 条阿基米德螺旋臂（向心旋转，颜色随半径渐变） */
  private drawSpiralArms(g: PIXI.Graphics, radius: number, palette: Palette, life: number): void {
    g.clear();
    const armCount = 3;
    const rotation = life * 0.0005 * Math.PI;
    for (let arm = 0; arm < armCount; arm++) {
      const armOffset = (arm * Math.PI * 2) / armCount + rotation;
      let prevX = 0,
        prevY = 0;
      for (let i = 1; i <= 30; i++) {
        const t = i / 30;
        const r = radius * t;
        const angle = armOffset + t * Math.PI * 2;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (i > 1) {
          g.moveTo(prevX, prevY);
          g.lineTo(x, y);
          g.stroke({
            color: this.interpolateColor(palette.glow, palette.shadow, t),
            width: 2 - t,
            alpha: 0.7 - t * 0.4,
          });
        }
        prevX = x;
        prevY = y;
      }
    }
  }

  /** 2. 时空网格扭曲（径向弯曲网格线 + 同心圆网格） */
  private drawSpacetimeGrid(g: PIXI.Graphics, radius: number, palette: Palette, life: number): void {
    g.clear();
    const gridLines = 8;
    const rotation = life * 0.0003 * Math.PI;
    // 弯曲的径向网格线（贝塞尔）
    for (let i = 0; i < gridLines; i++) {
      const angle = (i * Math.PI * 2) / gridLines + rotation;
      g.moveTo(0, 0);
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

  /** 绘制事件视界（黑色多层渐变 + 黑色吸光核） */
  private drawEventHorizon(g: PIXI.Graphics, radius: number, palette: Palette, intensity: number): void {
    g.clear();
    if (radius < 0.5) return;
    // 多层渐变：中心黑 → 外圈阴影紫
    this.drawMultilayerCircle(
      g,
      radius,
      10,
      (t) => this.interpolateColor(GRAVITY_VOID, palette.shadow, t),
      (t) => (1 - t * 0.3) * intensity,
    );
    // 黑色吸光核
    g.circle(0, 0, Math.max(0.5, radius * 0.6));
    g.fill({ color: GRAVITY_VOID, alpha: intensity });
    // 紫色边缘辉光
    g.circle(0, 0, radius);
    g.stroke({ color: palette.primary, width: 1, alpha: 0.6 * intensity });
  }

  /** 生成引力粒子（紫色，向心被吸） */
  private spawnGravityParticles(x: number, y: number, radius: number, color: number): void {
    const s = this.scale;
    for (let i = 0; i < 2; i++) {
      const angle = Math.random() * Math.PI * 2;
      const startDist = radius * s * (0.7 + Math.random() * 0.2);
      const px = x + Math.cos(angle) * startDist;
      const py = y + Math.sin(angle) * startDist;
      const speed = (25 + Math.random() * 15) * s;
      this.particlePool.emit({
        x: px,
        y: py,
        vx: -Math.cos(angle) * speed, // 向心
        vy: -Math.sin(angle) * speed,
        life: 1500,
        scaleStart: 1,
        scaleEnd: 0,
        alphaStart: 0.8,
        alphaEnd: 0,
        tint: color,
        radius: (1.5 + Math.random() * 1.5) * s,
      });
    }
  }

  // ══════════════════════════════════════════════════════
  //  爆发特效（三阶段：蓄压 → 黑洞坍缩 → 扩散）
  // ══════════════════════════════════════════════════════

  /**
   * 触发爆发视觉效果
   * @param playerId 玩家 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param radius 爆发范围（逻辑 px）
   * @param themeColor 主题色
   * @param durationMs 持续时间（ms），默认 1500
   */
  triggerBurst(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor: number = GRAVITY_MAIN,
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

    const bladeGraphics = new PIXI.Graphics();
    const coreGraphics = new PIXI.Graphics();
    const haloGraphics = new PIXI.Graphics();
    const gridGraphics = new PIXI.Graphics();
    container.addChild(bladeGraphics, coreGraphics, haloGraphics, gridGraphics);

    const burst: ActiveGravityBurst = {
      container,
      life: 0,
      maxLife: durationMs ?? 1500,
      themeColor,
      radius,
      particleTimer: 0,
      palette,
      bladeGraphics,
      coreGraphics,
      haloGraphics,
      gridGraphics,
      x,
      y,
    };
    this.activeBursts.set(playerId, burst);
  }

  // ══════════════════════════════════════════════════════
  //  三阶段钩子
  // ══════════════════════════════════════════════════════

  /** 阶段1 蓄压：螺旋臂收缩汇聚，时空网格扭曲加剧，事件视界逐渐显现 */
  protected phase1Charge(burst: ActiveBurstBase, t: number): void {
    const b = burst as ActiveGravityBurst;
    const ease = this.easeOutCubic(t);
    // 螺旋臂收缩汇聚（吸积盘雏形）
    b.bladeGraphics.clear();
    const spiralR = b.radius * (1 - ease * 0.7);
    this.drawSpiralArms(b.bladeGraphics, spiralR, b.palette, b.life);
    b.bladeGraphics.alpha = 1 - t * 0.3;
    // 时空网格扭曲加剧（半径收缩）
    b.gridGraphics.clear();
    const gridR = b.radius * (1 - ease * 0.5);
    this.drawSpacetimeGrid(b.gridGraphics, gridR, b.palette, b.life);
    b.gridGraphics.alpha = t; // 0 → 1 显现
    // 事件视界逐渐显现（小黑核生长）
    b.coreGraphics.clear();
    const voidR = b.radius * 0.15 * ease;
    this.drawEventHorizon(b.coreGraphics, voidR, b.palette, ease);
    b.coreGraphics.alpha = 1;
    // 引力波纹隐藏
    b.haloGraphics.clear();
    b.haloGraphics.alpha = 0;
  }

  /** 阶段2 爆发：黑洞坍缩（吸积盘旋转 + 事件视界 + 引力波纹） */
  protected phase2Burst(burst: ActiveBurstBase, t: number): void {
    const b = burst as ActiveGravityBurst;
    const ease = this.easeOutCubic(t);
    // 吸积盘（旋转椭圆环）
    b.bladeGraphics.clear();
    b.bladeGraphics.rotation = b.life * 0.003;
    for (let i = 0; i < 5; i++) {
      const r = b.radius * (0.3 + i * 0.15) * ease;
      b.bladeGraphics.ellipse(0, 0, r, r * 0.3);
      b.bladeGraphics.stroke({
        color: this.interpolateColor(b.palette.highlight, b.palette.primary, i / 4),
        width: 2,
        alpha: 0.8 * ease,
      });
    }
    b.bladeGraphics.alpha = 1;
    // 事件视界（黑色圆环）
    b.coreGraphics.clear();
    this.drawMultilayerCircle(
      b.coreGraphics,
      b.radius * 0.15,
      10,
      (ti) => this.interpolateColor(GRAVITY_VOID, b.palette.shadow, ti),
      (ti) => 1 - ti * 0.3,
    );
    b.coreGraphics.circle(0, 0, b.radius * 0.1);
    b.coreGraphics.fill({ color: GRAVITY_VOID });
    b.coreGraphics.alpha = 1;
    // 引力波纹（向外扩散的圆环）
    b.haloGraphics.clear();
    for (let i = 0; i < 3; i++) {
      const phase = (b.life * 0.001 + i * 0.33) % 1;
      const r = b.radius * (0.2 + phase * 0.8) * ease;
      b.haloGraphics.circle(0, 0, r);
      b.haloGraphics.stroke({
        color: b.palette.glow,
        width: 1.5,
        alpha: (1 - phase) * 0.5,
      });
    }
    b.haloGraphics.alpha = 1;
    // 时空网格消散
    b.gridGraphics.clear();
    b.gridGraphics.alpha = 0;
    // 发射引力粒子
    b.particleTimer += 16;
    if (b.particleTimer > 80) {
      b.particleTimer = 0;
      this.spawnBurstParticles(b, 3);
    }
  }

  /** 阶段3 扩散：吸积盘消散，事件视界淡出，引力波纹扩散 */
  protected phase3Diffuse(burst: ActiveBurstBase, t: number): void {
    const b = burst as ActiveGravityBurst;
    const ease = this.easeOutCubic(t);
    // 吸积盘消散 + 扩张
    b.bladeGraphics.clear();
    b.bladeGraphics.rotation = b.life * 0.003;
    const diskScale = 1 + ease * 0.5;
    for (let i = 0; i < 5; i++) {
      const r = b.radius * (0.3 + i * 0.15) * diskScale;
      b.bladeGraphics.ellipse(0, 0, r, r * 0.3);
      b.bladeGraphics.stroke({
        color: this.interpolateColor(b.palette.highlight, b.palette.primary, i / 4),
        width: 2,
        alpha: 0.8 * (1 - ease),
      });
    }
    b.bladeGraphics.alpha = 1;
    // 事件视界淡出 + 扩张
    b.coreGraphics.clear();
    this.drawEventHorizon(
      b.coreGraphics,
      b.radius * 0.15 * (1 + ease * 0.5),
      b.palette,
      1 - ease,
    );
    b.coreGraphics.alpha = 1;
    // 引力波纹继续扩散（更多环 + 更大范围）
    b.haloGraphics.clear();
    for (let i = 0; i < 4; i++) {
      const phase = (b.life * 0.001 + i * 0.25) % 1;
      const r = b.radius * (0.2 + phase * 1.2);
      b.haloGraphics.circle(0, 0, r);
      b.haloGraphics.stroke({
        color: b.palette.glow,
        width: 1.5,
        alpha: (1 - phase) * 0.4 * (1 - ease * 0.5),
      });
    }
    b.haloGraphics.alpha = 1;
    // 时空网格隐藏
    b.gridGraphics.clear();
    b.gridGraphics.alpha = 0;
    // 残余粒子
    b.particleTimer += 16;
    if (b.particleTimer > 120) {
      b.particleTimer = 0;
      this.spawnBurstParticles(b, 1);
    }
  }

  /** 爆发阶段喷射粒子（向外飞散的紫色引力粒子） */
  private spawnBurstParticles(burst: ActiveGravityBurst, count: number): void {
    const s = this.scale;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const startDist = burst.radius * s * 0.1;
      const px = burst.x + Math.cos(angle) * startDist;
      const py = burst.y + Math.sin(angle) * startDist;
      const speed = (60 + Math.random() * 40) * s;
      this.particlePool.emit({
        x: px,
        y: py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 800,
        scaleStart: 1.2,
        scaleEnd: 0,
        alphaStart: 1,
        alphaEnd: 0,
        tint: Math.random() < 0.5 ? burst.palette.primary : burst.palette.glow,
        radius: (1.5 + Math.random() * 1.5) * s,
      });
    }
  }

  // ══════════════════════════════════════════════════════
  //  生命周期
  // ══════════════════════════════════════════════════════

  /** 每帧更新（由 EffectRenderer 调用，dt 单位 ms） */
  update(dt: number): void {
    // ── 重力核心：螺旋臂 + 时空网格旋转 + 光环呼吸 + 引力粒子 ──
    this.activeCores.forEach((core) => {
      core.life += dt;
      // 重绘螺旋臂（向心旋转）
      this.drawSpiralArms(core.spiralGraphics, core.radius, core.palette, core.life);
      // 重绘时空网格（旋转）
      this.drawSpacetimeGrid(core.gridGraphics, core.radius, core.palette, core.life);
      // 光环呼吸 scale 1.0↔1.05
      const breath = 1 + 0.05 * Math.sin(core.life * 0.002 * Math.PI);
      core.haloGraphics.scale.set(breath);
      // 引力粒子节流（每 1.5s 生成 2 个向心被吸）
      core.particleTimer += dt;
      if (core.particleTimer > 1500) {
        core.particleTimer = 0;
        this.spawnGravityParticles(core.x, core.y, core.radius, core.palette.glow);
      }
    });

    // ── 爆发：三阶段动画调度 ──
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

  private removeBurstInstance(b: ActiveGravityBurst): void {
    this.container.removeChild(b.container);
    b.container.destroy({ children: true });
  }

  protected onScaleChange(scale: number): void {
    this.activeCores.forEach((c) => {
      if (!c.container.destroyed) c.container.scale.set(scale);
    });
    this.activeBursts.forEach((b) => {
      if (!b.container.destroyed) b.container.scale.set(scale);
    });
  }

  clear(): void {
    this.activeCores.forEach((c) => {
      this.container.removeChild(c.container);
      c.container.destroy({ children: true });
    });
    this.activeCores.clear();
    this.activeBursts.forEach((b) => this.removeBurstInstance(b));
    this.activeBursts.clear();
  }
}
