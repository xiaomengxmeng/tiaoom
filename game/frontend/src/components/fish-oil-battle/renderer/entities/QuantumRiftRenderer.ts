/**
 * 量子裂隙 (Quantum Rift) - 变奏者流派
 * 前端视觉渲染器
 *
 * 视觉设计（变奏者青 + 概率金双色调）：
 * - 量子裂隙 Rift：量子核心（10 层径向渐变）+ 多条不规则裂缝线（黑色+青色边缘）+ 概率粒子
 * - 爆发 Burst：量子核心（10 层渐变）+ 裂缝爆发 + 概率云环 + 三阶段动画（撕裂→坍缩→重组）
 */

import * as PIXI from 'pixi.js';
import { ParticlePool } from '../systems/ParticlePool';

// ══════════════════════════════════════════════════════
//  颜色常量（变奏者青）
// ══════════════════════════════════════════════════════

const QUANTUM_DEEP = 0x0a2a3a; // 深青黑（渐变外缘）
const QUANTUM_MAIN = 0x0088cc; // 主青（量子主色）
const QUANTUM_LIGHT = 0x33bbdd; // 浅亮青（中层渐变）
const QUANTUM_HIGHLIGHT = 0x88ddee; // 高亮浅青（内层渐变）
const QUANTUM_WHITE = 0xffffff; // 白色（核心高亮）
const QUANTUM_GOLD = 0xffcc00; // 概率金（粒子/概率云色）
const QUANTUM_BLACK = 0x000000; // 裂缝黑（裂缝核心色）

/** 量子核心径向渐变层数 */
const QUANTUM_CORE_LAYERS = 10;
/** 裂缝线数量 */
const RIFT_CRACK_COUNT = 7;
/** 每条裂缝的分段数（锯齿感） */
const RIFT_CRACK_SEGMENTS = 4;

// ══════════════════════════════════════════════════════
//  数据结构
// ══════════════════════════════════════════════════════

/** 活跃量子裂隙实例（常驻） */
interface ActiveRift {
  container: PIXI.Container;
  coreGraphics: PIXI.Graphics; // 量子核心（10 层径向渐变）
  riftGraphics: PIXI.Graphics; // 多条不规则裂缝线（黑色+青色边缘）
  particleTimer: number;
  life: number; // ms 累计
  maxLife: number;
  x: number;
  y: number;
  radius: number;
}

/** 活跃爆发特效（撕裂→坍缩→重组 三阶段） */
interface ActiveBurst {
  container: PIXI.Container;
  coreGraphics: PIXI.Graphics; // 量子核心（10 层渐变）
  riftGraphics: PIXI.Graphics; // 裂缝爆发
  ringGraphics: PIXI.Graphics; // 概率云环
  life: number;
  maxLife: number;
  themeColor: number;
  radius: number;
}

export class QuantumRiftRenderer {
  private fieldContainer: PIXI.Container;
  private particlePool: ParticlePool;
  private scale = 1;

  // 活跃实例池
  private activeRifts: Map<string, ActiveRift> = new Map();
  private activeBursts: Map<string, ActiveBurst> = new Map();

  constructor(fieldContainer: PIXI.Container, particlePool: ParticlePool) {
    this.fieldContainer = fieldContainer;
    this.particlePool = particlePool;
  }

  setScale(scale: number): void {
    this.scale = scale;
    this.activeRifts.forEach((r) => {
      if (r.container.destroyed) return;
      r.container.scale.set(scale);
    });
    this.activeBursts.forEach((b) => {
      if (b.container.destroyed) return;
      b.container.scale.set(scale);
    });
  }

  // ══════════════════════════════════════════════════════
  //  量子裂隙 Rift（常驻）
  // ══════════════════════════════════════════════════════

  /**
   * 触发量子裂隙视觉效果
   * @param playerId 玩家 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param radius 裂隙半径（逻辑 px）
   * @param themeColor 主题色（默认变奏者青）
   */
  triggerRift(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor = QUANTUM_MAIN,
  ): void {
    // 已存在则仅更新位置与半径
    const existing = this.activeRifts.get(playerId);
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

    // 量子核心（10 层径向渐变 + 主环 + 中心核）
    const coreGraphics = new PIXI.Graphics();
    this.drawQuantumCore(coreGraphics, radius);
    container.addChild(coreGraphics);

    // 多条不规则裂缝线（黑色+青色边缘，独立旋转）
    const riftGraphics = new PIXI.Graphics();
    this.drawRiftCracks(riftGraphics, radius);
    container.addChild(riftGraphics);

    this.fieldContainer.addChild(container);

    const rift: ActiveRift = {
      container,
      coreGraphics,
      riftGraphics,
      particleTimer: 0,
      life: 0,
      maxLife: Number.POSITIVE_INFINITY, // 常驻，直到手动移除
      x,
      y,
      radius,
    };
    this.activeRifts.set(playerId, rift);

    // 触发首帧概率粒子
    this.spawnProbabilityParticles(x, y, radius, QUANTUM_GOLD);
    void themeColor;
  }

  /** 移除量子裂隙 */
  removeRift(playerId: string): void {
    const rift = this.activeRifts.get(playerId);
    if (rift) {
      this.fieldContainer.removeChild(rift.container);
      rift.container.destroy({ children: true });
      this.activeRifts.delete(playerId);
    }
  }

  /**
   * 绘制量子核心：10 层同心圆径向渐变（白→高亮→浅青→主青→深青黑）+ 主环 + 中心核
   * 以 (0,0) 为中心绘制
   */
  private drawQuantumCore(g: PIXI.Graphics, radius: number): void {
    g.clear();

    // 10 层同心圆叠加模拟径向渐变
    for (let i = 0; i < QUANTUM_CORE_LAYERS; i++) {
      const t = i / (QUANTUM_CORE_LAYERS - 1); // 0 → 1
      const r = radius * (0.12 + 0.88 * t);
      // 颜色分段：白 → 高亮 → 浅青 → 主青 → 深青黑
      let color: number;
      if (t < 0.25) {
        color = this.interpolateColor(QUANTUM_WHITE, QUANTUM_HIGHLIGHT, t / 0.25);
      } else if (t < 0.5) {
        color = this.interpolateColor(
          QUANTUM_HIGHLIGHT,
          QUANTUM_LIGHT,
          (t - 0.25) / 0.25,
        );
      } else if (t < 0.75) {
        color = this.interpolateColor(
          QUANTUM_LIGHT,
          QUANTUM_MAIN,
          (t - 0.5) / 0.25,
        );
      } else {
        color = this.interpolateColor(
          QUANTUM_MAIN,
          QUANTUM_DEEP,
          (t - 0.75) / 0.25,
        );
      }
      const alpha = (1 - t) * 0.22;
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }

    // 量子主环：深青黑描边 + 主青主环 + 高亮内环
    g.circle(0, 0, radius);
    g.stroke({ color: QUANTUM_DEEP, width: 1.5, alpha: 0.6 });
    g.circle(0, 0, radius * 0.97);
    g.stroke({ color: QUANTUM_MAIN, width: 1, alpha: 0.7 });
    g.circle(0, 0, radius * 0.93);
    g.stroke({ color: QUANTUM_HIGHLIGHT, width: 0.4, alpha: 0.5 });

    // 中心核：白色实心圆 r=4 + 概率金外环 r=6
    g.circle(0, 0, 6);
    g.stroke({ color: QUANTUM_GOLD, width: 1, alpha: 0.8 });
    g.circle(0, 0, 4);
    g.fill({ color: QUANTUM_WHITE, alpha: 1 });
  }

  /**
   * 绘制多条不规则裂缝线：每条裂缝为锯齿折线，黑色核心 + 青色边缘
   * 由 riftGraphics 独立承担旋转动画
   */
  private drawRiftCracks(g: PIXI.Graphics, radius: number): void {
    g.clear();
    const crackR = radius * 0.95;
    // 7 条裂缝均匀分布起始角，每条裂缝为锯齿折线
    for (let i = 0; i < RIFT_CRACK_COUNT; i++) {
      const baseAngle =
        (i * Math.PI * 2) / RIFT_CRACK_COUNT + this.crackJitter(i) * 0.3;
      // 生成锯齿点序列
      const pts: [number, number][] = [];
      for (let s = 0; s <= RIFT_CRACK_SEGMENTS; s++) {
        const f = s / RIFT_CRACK_SEGMENTS; // 0 → 1 由内向外
        const r = crackR * (0.15 + 0.85 * f);
        // 锯齿偏移：每段随机角向偏移
        const jitter = this.crackJitter(i * 10 + s) * 0.25;
        const a = baseAngle + jitter;
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      // 青色边缘（粗）
      g.moveTo(pts[0][0], pts[0][1]);
      for (let s = 1; s < pts.length; s++) g.lineTo(pts[s][0], pts[s][1]);
      g.stroke({ color: QUANTUM_LIGHT, width: 2.5, alpha: 0.8 });
      // 黑色核心（细）
      g.moveTo(pts[0][0], pts[0][1]);
      for (let s = 1; s < pts.length; s++) g.lineTo(pts[s][0], pts[s][1]);
      g.stroke({ color: QUANTUM_BLACK, width: 1, alpha: 0.9 });
    }
  }

  /**
   * 生成概率粒子（金色概率云，向心汇聚后概率性消散）
   * 利用 particlePool.emit，每帧由 update 节流调用
   */
  private spawnProbabilityParticles(
    x: number,
    y: number,
    radius: number,
    color: number,
  ): void {
    const s = this.scale;
    for (let i = 0; i < 2; i++) {
      const angle = Math.random() * Math.PI * 2;
      // 从裂隙边缘出发
      const startDist = radius * s * (0.6 + Math.random() * 0.4);
      const px = x + Math.cos(angle) * startDist;
      const py = y + Math.sin(angle) * startDist;
      // 向内汇聚速度（px/s），表现概率坍缩感
      const speed = (18 + Math.random() * 12) * s;
      this.particlePool.emit({
        x: px,
        y: py,
        vx: -Math.cos(angle) * speed,
        vy: -Math.sin(angle) * speed,
        life: 2000,
        scaleStart: 1,
        scaleEnd: 0,
        alphaStart: 0.85,
        alphaEnd: 0,
        tint: color,
        radius: (1.5 + Math.random() * 1.5) * s,
      });
    }
  }

  // ══════════════════════════════════════════════════════
  //  爆发特效（撕裂→坍缩→重组 三阶段动画）
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
    themeColor = QUANTUM_MAIN,
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

    // 1. 量子核心（10 层径向渐变 + 中心核）
    const coreGraphics = new PIXI.Graphics();
    this.drawBurstCore(coreGraphics, radius);
    container.addChild(coreGraphics);

    // 2. 裂缝爆发（多条不规则裂缝线）
    const riftGraphics = new PIXI.Graphics();
    this.drawRiftCracks(riftGraphics, radius * 0.85);
    container.addChild(riftGraphics);

    // 3. 概率云环（双层细高亮环）
    const ringGraphics = new PIXI.Graphics();
    this.drawBurstRing(ringGraphics, radius);
    container.addChild(ringGraphics);

    this.fieldContainer.addChild(container);

    const burst: ActiveBurst = {
      container,
      coreGraphics,
      riftGraphics,
      ringGraphics,
      life: 0,
      maxLife: durationMs ?? 5000,
      themeColor,
      radius,
    };
    this.activeBursts.set(playerId, burst);
  }

  /**
   * 绘制爆发量子核心：10 层同心圆（白→高亮→浅青→主青→深青黑）+ 中心核
   */
  private drawBurstCore(g: PIXI.Graphics, radius: number): void {
    g.clear();
    const coreR = radius * 0.6;

    // 10 层同心圆叠加
    for (let i = 0; i < QUANTUM_CORE_LAYERS; i++) {
      const t = i / (QUANTUM_CORE_LAYERS - 1);
      const r = coreR * (0.08 + 0.92 * t);
      let color: number;
      if (t < 0.25) {
        color = this.interpolateColor(QUANTUM_WHITE, QUANTUM_HIGHLIGHT, t / 0.25);
      } else if (t < 0.5) {
        color = this.interpolateColor(
          QUANTUM_HIGHLIGHT,
          QUANTUM_LIGHT,
          (t - 0.25) / 0.25,
        );
      } else if (t < 0.75) {
        color = this.interpolateColor(
          QUANTUM_LIGHT,
          QUANTUM_MAIN,
          (t - 0.5) / 0.25,
        );
      } else {
        color = this.interpolateColor(
          QUANTUM_MAIN,
          QUANTUM_DEEP,
          (t - 0.75) / 0.25,
        );
      }
      const alpha = (1 - t) * 0.28;
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }

    // 中心核 r=6（黑色吸光核 + 概率金辉光）
    g.circle(0, 0, 6);
    g.fill({ color: QUANTUM_BLACK, alpha: 0.9 });
    g.circle(0, 0, 8);
    g.stroke({ color: QUANTUM_GOLD, width: 1.5, alpha: 0.8 });
  }

  /**
   * 绘制概率云环：双层细高亮环（主青 + 概率金）
   */
  private drawBurstRing(g: PIXI.Graphics, radius: number): void {
    g.clear();
    g.circle(0, 0, radius);
    g.stroke({ color: QUANTUM_LIGHT, width: 0.6, alpha: 0.7 });
    g.circle(0, 0, radius * 0.95);
    g.stroke({ color: QUANTUM_GOLD, width: 0.3, alpha: 0.5 });
  }

  // ══════════════════════════════════════════════════════
  //  更新循环
  // ══════════════════════════════════════════════════════

  /** 每帧更新（由 EffectRenderer 调用，dt 单位 ms） */
  update(dt: number): void {
    // ── 量子裂隙：核心呼吸 + 裂缝旋转 + 概率粒子 ──
    this.activeRifts.forEach((rift) => {
      rift.life += dt;
      // 核心呼吸 scale 1.0↔1.05（2s 周期）
      const breath = 1 + 0.05 * Math.sin(rift.life * 0.001 * Math.PI);
      rift.coreGraphics.scale.set(breath);
      // 核心脉动 alpha 0.7↔0.95
      const pulse = 0.8 + 0.15 * Math.sin(rift.life * 0.001 * Math.PI);
      rift.coreGraphics.alpha = pulse;
      // 裂缝缓慢旋转 0.4 转/秒（撕裂感）
      rift.riftGraphics.rotation += dt * 0.0008 * Math.PI;
      // 裂缝脉动 alpha 0.6↔1.0（概率波动感）
      rift.riftGraphics.alpha =
        0.8 + 0.2 * Math.sin(rift.life * 0.002 * Math.PI * 2);
      // 概率粒子：每 1.4s 生成 2 个
      rift.particleTimer += dt;
      if (rift.particleTimer > 1400) {
        rift.particleTimer = 0;
        this.spawnProbabilityParticles(
          rift.x,
          rift.y,
          rift.radius,
          QUANTUM_GOLD,
        );
      }
    });

    // ── 爆发：三阶段动画（撕裂→坍缩→重组） ──
    this.activeBursts.forEach((burst, playerId) => {
      burst.life += dt;
      const T = burst.maxLife;
      if (burst.life >= T) {
        this.removeBurst(playerId);
        return;
      }
      const phase1End = T * 0.15; // 撕裂阶段
      const phase2End = T * 0.3; // 坍缩阶段

      if (burst.life < phase1End) {
        // 阶段1 撕裂：裂缝从 0.3 扩张到 1.2（撕裂外扩），核心显现，环未展开
        const t = burst.life / phase1End;
        burst.riftGraphics.scale.set(0.3 + 0.9 * t);
        burst.riftGraphics.alpha = t; // 0 → 1 显现
        burst.riftGraphics.rotation += dt * 0.004 * Math.PI; // 快速撕裂旋转
        burst.coreGraphics.alpha = t;
        burst.coreGraphics.scale.set(0.5 + 0.5 * t);
        burst.ringGraphics.alpha = 0;
        burst.ringGraphics.scale.set(0.3);
      } else if (burst.life < phase2End) {
        // 阶段2 坍缩：裂缝收缩到中心 scale 1.2→0.4(easeInCubic)，核心变黑，环展开
        const t = (burst.life - phase1End) / (phase2End - phase1End);
        const eased = this.easeInCubic(t);
        burst.riftGraphics.scale.set(1.2 - 0.8 * eased); // 收缩坍缩
        burst.riftGraphics.alpha = 1.0 - 0.3 * t;
        burst.riftGraphics.rotation += dt * 0.006 * Math.PI;
        // 环展开 scale 0.3→1.0
        burst.ringGraphics.scale.set(0.3 + 0.7 * this.easeOutCubic(t));
        burst.ringGraphics.alpha = t;
        burst.coreGraphics.alpha = 1.0;
        burst.coreGraphics.scale.set(1.0 - 0.3 * eased); // 核心收缩
      } else {
        // 阶段3 重组：环扩散 scale 1.0→2.0 alpha 1.0→0，裂缝重组消散，核心重组渐隐
        const t = (burst.life - phase2End) / (T - phase2End);
        burst.ringGraphics.scale.set(1.0 + 1.0 * t);
        burst.ringGraphics.alpha = 1.0 - t;
        // 裂缝重组：反向旋转 + 渐隐
        burst.riftGraphics.alpha = 0.7 * (1.0 - t);
        burst.riftGraphics.rotation -= dt * 0.002 * Math.PI;
        burst.riftGraphics.scale.set(0.4 + 0.6 * t); // 重组扩张
        burst.coreGraphics.alpha = 1.0 - 0.7 * t;
        burst.coreGraphics.scale.set(0.7 + 0.3 * t);
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
    this.activeRifts.forEach((_, playerId) => this.removeRift(playerId));
    this.activeBursts.forEach((_, playerId) => this.removeBurst(playerId));
  }

  destroy(): void {
    this.clear();
  }

  // ══════════════════════════════════════════════════════
  //  工具方法
  // ══════════════════════════════════════════════════════

  /**
   * 确定性伪随机抖动（基于种子，保证裂缝形态稳定）
   * 返回 [-1, 1] 范围
   */
  private crackJitter(seed: number): number {
    // 简单哈希：sin 折叠，避免使用 Math.random（保证可复现）
    const v = Math.sin(seed * 12.9898) * 43758.5453;
    return (v - Math.floor(v)) * 2 - 1;
  }

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
