/**
 * 体积扭曲 (Size Warp) - 变奏者流派
 * 前端视觉渲染器
 *
 * 视觉设计（变奏者金 + 扭曲青双色调）：
 * - 体积扭曲场 Warp：扭曲核心（8 层径向渐变）+ 多层扩散缩放指示环 + 扭曲粒子
 * - 爆发 Burst：扭曲核心（8 层渐变）+ 缩放环爆发 + 扭曲脉冲 + 三阶段动画（压缩→爆发→恢复）
 */

import * as PIXI from 'pixi.js';
import { ParticlePool } from '../systems/ParticlePool';

// ══════════════════════════════════════════════════════
//  颜色常量（变奏者金）
// ══════════════════════════════════════════════════════

const SIZE_DEEP = 0x3a2a0a; // 深褐金（渐变外缘）
const SIZE_MAIN = 0xccaa22; // 主金（扭曲主色）
const SIZE_LIGHT = 0xffdd55; // 浅亮金（中层渐变）
const SIZE_HIGHLIGHT = 0xffee99; // 高亮浅金（内层渐变）
const SIZE_WHITE = 0xffffff; // 白色（核心高亮）
const SIZE_CYAN = 0x00ffcc; // 扭曲青（缩放环/扭曲色）

/** 缩放指示环数量（多层扩散） */
const SIZE_RING_COUNT = 4;

// ══════════════════════════════════════════════════════
//  数据结构
// ══════════════════════════════════════════════════════

/** 活跃体积扭曲场实例（常驻） */
interface ActiveWarp {
  container: PIXI.Container;
  coreGraphics: PIXI.Graphics; // 扭曲核心（8 层径向渐变）
  ringGraphics: PIXI.Graphics; // 多层扩散缩放指示环（独立旋转）
  particleTimer: number;
  life: number; // ms 累计
  maxLife: number;
  x: number;
  y: number;
  radius: number;
}

/** 活跃爆发特效（压缩→爆发→恢复 三阶段） */
interface ActiveBurst {
  container: PIXI.Container;
  coreGraphics: PIXI.Graphics; // 扭曲核心（8 层渐变）
  ringGraphics: PIXI.Graphics; // 缩放环爆发
  pulseGraphics: PIXI.Graphics; // 扭曲脉冲
  life: number;
  maxLife: number;
  themeColor: number;
  radius: number;
}

export class SizeWarpRenderer {
  private fieldContainer: PIXI.Container;
  private particlePool: ParticlePool;
  private scale = 1;

  // 活跃实例池
  private activeWarps: Map<string, ActiveWarp> = new Map();
  private activeBursts: Map<string, ActiveBurst> = new Map();

  constructor(fieldContainer: PIXI.Container, particlePool: ParticlePool) {
    this.fieldContainer = fieldContainer;
    this.particlePool = particlePool;
  }

  setScale(scale: number): void {
    this.scale = scale;
    this.activeWarps.forEach((w) => {
      if (w.container.destroyed) return;
      w.container.scale.set(scale);
    });
    this.activeBursts.forEach((b) => {
      if (b.container.destroyed) return;
      b.container.scale.set(scale);
    });
  }

  // ══════════════════════════════════════════════════════
  //  体积扭曲场 Warp（常驻）
  // ══════════════════════════════════════════════════════

  /**
   * 触发体积扭曲场视觉效果
   * @param playerId 玩家 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param radius 扭曲场半径（逻辑 px）
   * @param themeColor 主题色（默认变奏者金）
   */
  triggerWarp(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor = SIZE_MAIN,
  ): void {
    // 已存在则仅更新位置与半径
    const existing = this.activeWarps.get(playerId);
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

    // 扭曲核心（8 层径向渐变 + 主环 + 中心核）
    const coreGraphics = new PIXI.Graphics();
    this.drawWarpCore(coreGraphics, radius);
    container.addChild(coreGraphics);

    // 多层扩散缩放指示环（独立旋转）
    const ringGraphics = new PIXI.Graphics();
    this.drawScaleRings(ringGraphics, radius);
    container.addChild(ringGraphics);

    this.fieldContainer.addChild(container);

    const warp: ActiveWarp = {
      container,
      coreGraphics,
      ringGraphics,
      particleTimer: 0,
      life: 0,
      maxLife: Number.POSITIVE_INFINITY, // 常驻，直到手动移除
      x,
      y,
      radius,
    };
    this.activeWarps.set(playerId, warp);

    // 触发首帧扭曲粒子
    this.spawnWarpParticles(x, y, radius, SIZE_CYAN);
    void themeColor;
  }

  /** 移除体积扭曲场 */
  removeWarp(playerId: string): void {
    const warp = this.activeWarps.get(playerId);
    if (warp) {
      this.fieldContainer.removeChild(warp.container);
      warp.container.destroy({ children: true });
      this.activeWarps.delete(playerId);
    }
  }

  /**
   * 绘制扭曲核心：8 层同心圆径向渐变（白→高亮→浅金→主金→深褐金）+ 主环 + 中心核
   * 以 (0,0) 为中心绘制
   */
  private drawWarpCore(g: PIXI.Graphics, radius: number): void {
    g.clear();

    // 8 层同心圆叠加模拟径向渐变
    for (let i = 0; i < 8; i++) {
      const t = i / 7; // 0 → 1
      const r = radius * (0.15 + 0.85 * t);
      // 颜色分段：白 → 高亮 → 浅金 → 主金 → 深褐金
      let color: number;
      if (t < 0.25) {
        color = this.interpolateColor(SIZE_WHITE, SIZE_HIGHLIGHT, t / 0.25);
      } else if (t < 0.5) {
        color = this.interpolateColor(
          SIZE_HIGHLIGHT,
          SIZE_LIGHT,
          (t - 0.25) / 0.25,
        );
      } else if (t < 0.75) {
        color = this.interpolateColor(
          SIZE_LIGHT,
          SIZE_MAIN,
          (t - 0.5) / 0.25,
        );
      } else {
        color = this.interpolateColor(
          SIZE_MAIN,
          SIZE_DEEP,
          (t - 0.75) / 0.25,
        );
      }
      const alpha = (1 - t) * 0.22;
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }

    // 扭曲主环：深褐金描边 + 主金主环 + 高亮内环
    g.circle(0, 0, radius);
    g.stroke({ color: SIZE_DEEP, width: 1.5, alpha: 0.6 });
    g.circle(0, 0, radius * 0.97);
    g.stroke({ color: SIZE_MAIN, width: 1, alpha: 0.7 });
    g.circle(0, 0, radius * 0.93);
    g.stroke({ color: SIZE_HIGHLIGHT, width: 0.4, alpha: 0.5 });

    // 中心核：白色实心圆 r=4 + 扭曲青外环 r=6
    g.circle(0, 0, 6);
    g.stroke({ color: SIZE_CYAN, width: 1, alpha: 0.8 });
    g.circle(0, 0, 4);
    g.fill({ color: SIZE_WHITE, alpha: 1 });
  }

  /**
   * 绘制多层扩散缩放指示环：4 层环由内到外，扭曲青色
   * 由 ringGraphics 独立承担缩放呼吸动画
   */
  private drawScaleRings(g: PIXI.Graphics, radius: number): void {
    g.clear();
    // 4 层缩放指示环：由内到外半径递增，alpha 递减
    for (let i = 0; i < SIZE_RING_COUNT; i++) {
      const t = i / (SIZE_RING_COUNT - 1); // 0 → 1
      const r = radius * (0.4 + 0.6 * t);
      // 颜色交替：内层扭曲青，外层高亮
      const color = i % 2 === 0 ? SIZE_CYAN : SIZE_LIGHT;
      const alpha = 0.7 - t * 0.3;
      g.circle(0, 0, r);
      g.stroke({ color, width: 1.5 - t * 0.5, alpha });
    }
  }

  /**
   * 生成扭曲粒子（向外扩散，表现体积扭曲场扩张感）
   * 利用 particlePool.emit，每帧由 update 节流调用
   */
  private spawnWarpParticles(
    x: number,
    y: number,
    radius: number,
    color: number,
  ): void {
    const s = this.scale;
    for (let i = 0; i < 2; i++) {
      const angle = Math.random() * Math.PI * 2;
      // 从核心附近出发
      const startDist = radius * s * (0.2 + Math.random() * 0.2);
      const px = x + Math.cos(angle) * startDist;
      const py = y + Math.sin(angle) * startDist;
      // 向外扩散速度（px/s），表现体积扭曲扩张
      const speed = (22 + Math.random() * 18) * s;
      this.particlePool.emit({
        x: px,
        y: py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 2000,
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
  //  爆发特效（压缩→爆发→恢复 三阶段动画）
  // ══════════════════════════════════════════════════════

  /**
   * 触发爆发视觉效果
   * @param playerId 玩家 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param radius 爆发范围（逻辑 px）
   * @param themeColor 主题色
   * @param durationMs 持续时间（ms），默认 5000
   */
  triggerBurst(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor = SIZE_MAIN,
    durationMs?: number,
  ): void {
    // 若已存在，先销毁旧实例
    const old = this.activeBursts.get(playerId);
    if (old) {
      this.fieldContainer.removeChild(old.container);
      old.container.destroy({ children: true });
    }

    const container = new PIXI.Container();
    container.position.set(x, y);
    container.scale.set(this.scale);

    // 1. 扭曲核心（8 层径向渐变 + 中心核）
    const coreGraphics = new PIXI.Graphics();
    this.drawBurstCore(coreGraphics, radius);
    container.addChild(coreGraphics);

    // 2. 缩放环爆发（多层扩散缩放指示环）
    const ringGraphics = new PIXI.Graphics();
    this.drawScaleRings(ringGraphics, radius * 0.8);
    container.addChild(ringGraphics);

    // 3. 扭曲脉冲（双层细高亮环）
    const pulseGraphics = new PIXI.Graphics();
    this.drawBurstPulse(pulseGraphics, radius);
    container.addChild(pulseGraphics);

    this.fieldContainer.addChild(container);

    const burst: ActiveBurst = {
      container,
      coreGraphics,
      ringGraphics,
      pulseGraphics,
      life: 0,
      maxLife: durationMs ?? 5000,
      themeColor,
      radius,
    };
    this.activeBursts.set(playerId, burst);
  }

  /**
   * 绘制爆发扭曲核心：8 层同心圆（白→高亮→浅金→主金→深褐金）+ 中心核
   */
  private drawBurstCore(g: PIXI.Graphics, radius: number): void {
    g.clear();
    const coreR = radius * 0.6;

    // 8 层同心圆叠加
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const r = coreR * (0.1 + 0.9 * t);
      let color: number;
      if (t < 0.25) {
        color = this.interpolateColor(SIZE_WHITE, SIZE_HIGHLIGHT, t / 0.25);
      } else if (t < 0.5) {
        color = this.interpolateColor(
          SIZE_HIGHLIGHT,
          SIZE_LIGHT,
          (t - 0.25) / 0.25,
        );
      } else if (t < 0.75) {
        color = this.interpolateColor(
          SIZE_LIGHT,
          SIZE_MAIN,
          (t - 0.5) / 0.25,
        );
      } else {
        color = this.interpolateColor(
          SIZE_MAIN,
          SIZE_DEEP,
          (t - 0.75) / 0.25,
        );
      }
      const alpha = (1 - t) * 0.28;
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }

    // 中心核 r=6
    g.circle(0, 0, 6);
    g.fill({ color: SIZE_WHITE, alpha: 1 });

    // 扭曲青边缘辉光
    g.circle(0, 0, 8);
    g.stroke({ color: SIZE_CYAN, width: 1.5, alpha: 0.8 });
  }

  /**
   * 绘制扭曲脉冲：双层细高亮环（主金 + 扭曲青）
   */
  private drawBurstPulse(g: PIXI.Graphics, radius: number): void {
    g.clear();
    g.circle(0, 0, radius);
    g.stroke({ color: SIZE_LIGHT, width: 0.6, alpha: 0.7 });
    g.circle(0, 0, radius * 0.95);
    g.stroke({ color: SIZE_CYAN, width: 0.3, alpha: 0.5 });
  }

  // ══════════════════════════════════════════════════════
  //  更新循环
  // ══════════════════════════════════════════════════════

  /** 每帧更新（由 EffectRenderer 调用，dt 单位 ms） */
  update(dt: number): void {
    // ── 体积扭曲场：核心呼吸 + 缩放环脉动 + 扭曲粒子 ──
    this.activeWarps.forEach((warp) => {
      warp.life += dt;
      // 核心呼吸 scale 1.0↔1.05（2s 周期）
      const breath = 1 + 0.05 * Math.sin(warp.life * 0.001 * Math.PI);
      warp.coreGraphics.scale.set(breath);
      // 核心脉动 alpha 0.7↔0.95
      const pulse = 0.8 + 0.15 * Math.sin(warp.life * 0.001 * Math.PI);
      warp.coreGraphics.alpha = pulse;
      // 缩放环脉动：scale 0.95↔1.05（错峰相位），表现缩放指示
      const ringScale =
        1.0 + 0.05 * Math.sin(warp.life * 0.0015 * Math.PI * 2);
      warp.ringGraphics.scale.set(ringScale);
      // 缩放环 alpha 0.6↔1.0 脉动
      warp.ringGraphics.alpha =
        0.8 + 0.2 * Math.sin(warp.life * 0.002 * Math.PI * 2);
      // 扭曲粒子：每 1.3s 生成 2 个
      warp.particleTimer += dt;
      if (warp.particleTimer > 1300) {
        warp.particleTimer = 0;
        this.spawnWarpParticles(warp.x, warp.y, warp.radius, SIZE_CYAN);
      }
    });

    // ── 爆发：三阶段动画（压缩→爆发→恢复） ──
    this.activeBursts.forEach((burst, playerId) => {
      burst.life += dt;
      const T = burst.maxLife;
      if (burst.life >= T) {
        this.removeBurst(playerId);
        return;
      }
      const phase1End = T * 0.2; // 压缩阶段
      const phase2End = T * 0.4; // 爆发阶段

      if (burst.life < phase1End) {
        // 阶段1 压缩：核心收缩 scale 1.0→0.3(easeInCubic)，缩放环收缩，脉冲未展开
        const t = burst.life / phase1End;
        const eased = this.easeInCubic(t);
        burst.coreGraphics.scale.set(1.0 - 0.7 * eased); // 1.0 → 0.3 压缩
        burst.coreGraphics.alpha = 1.0 - 0.3 * t;
        burst.ringGraphics.scale.set(1.0 - 0.5 * eased); // 缩放环收缩
        burst.ringGraphics.alpha = 1.0 - 0.5 * t;
        burst.ringGraphics.rotation += dt * 0.003 * Math.PI; // 压缩旋转
        burst.pulseGraphics.alpha = 0;
        burst.pulseGraphics.scale.set(0.3);
      } else if (burst.life < phase2End) {
        // 阶段2 爆发：核心爆发 scale 0.3→1.5(easeOutCubic)，缩放环爆发扩张，脉冲展开
        const t = (burst.life - phase1End) / (phase2End - phase1End);
        const eased = this.easeOutCubic(t);
        burst.coreGraphics.scale.set(0.3 + 1.2 * eased); // 0.3 → 1.5 爆发
        burst.coreGraphics.alpha = 0.7 + 0.3 * t;
        burst.ringGraphics.scale.set(0.5 + 1.0 * eased); // 缩放环爆发扩张
        burst.ringGraphics.alpha = 0.5 + 0.5 * t;
        burst.ringGraphics.rotation += dt * 0.005 * Math.PI; // 快速旋转
        // 脉冲展开 scale 0.3→1.0
        burst.pulseGraphics.scale.set(0.3 + 0.7 * eased);
        burst.pulseGraphics.alpha = t;
      } else {
        // 阶段3 恢复：核心恢复 scale 1.5→1.0，缩放环恢复，脉冲扩散消散
        const t = (burst.life - phase2End) / (T - phase2End);
        const eased = this.easeOutCubic(t);
        burst.coreGraphics.scale.set(1.5 - 0.5 * eased); // 1.5 → 1.0 恢复
        burst.coreGraphics.alpha = 1.0 - 0.7 * t; // 渐隐
        burst.ringGraphics.scale.set(1.5 - 0.3 * t); // 恢复
        burst.ringGraphics.alpha = 1.0 - t;
        burst.ringGraphics.rotation += dt * 0.002 * Math.PI;
        // 脉冲扩散 scale 1.0→2.0 alpha 1.0→0
        burst.pulseGraphics.scale.set(1.0 + 1.0 * t);
        burst.pulseGraphics.alpha = 1.0 - t;
      }
    });
  }

  // ══════════════════════════════════════════════════════
  //  移除与清理
  // ══════════════════════════════════════════════════════

  /** 移除爆发特效 */
  removeBurst(playerId: string): void {
    const burst = this.activeBursts.get(playerId);
    if (burst) {
      this.fieldContainer.removeChild(burst.container);
      burst.container.destroy({ children: true });
      this.activeBursts.delete(playerId);
    }
  }

  /** 清除所有特效（不销毁渲染器） */
  clear(): void {
    this.activeWarps.forEach((_, playerId) => this.removeWarp(playerId));
    this.activeBursts.forEach((_, playerId) => this.removeBurst(playerId));
  }

  destroy(): void {
    this.clear();
  }

  // ══════════════════════════════════════════════════════
  //  工具方法
  // ══════════════════════════════════════════════════════

  /** 颜色插值（from → to，t ∈ [0,1]） */
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

  /** easeOutCubic 缓动 */
  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  /** easeInCubic 缓动 */
  private easeInCubic(t: number): number {
    return t * t * t;
  }
}
