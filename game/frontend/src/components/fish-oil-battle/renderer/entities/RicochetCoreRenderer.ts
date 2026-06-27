/**
 * 弹射核心 (Ricochet Core) - 变奏者流派
 * 前端视觉渲染器
 *
 * 视觉设计（变奏者金青双色调）：
 * - 弹射轨迹 Ricochet：弹射核心（8 层径向渐变）+ 多层叠加发光反弹线 + 弹射粒子
 * - 爆发 Burst：弹射核心（8 层渐变）+ 反弹线爆发 + 弹射环 + 三阶段动画（蓄射→弹射→消散）
 */

import * as PIXI from 'pixi.js';
import { ParticlePool } from '../systems/ParticlePool';

// ══════════════════════════════════════════════════════
//  颜色常量（变奏者金青）
// ══════════════════════════════════════════════════════

const RICOCHET_DEEP = 0x2a1a0a; // 深褐橙（渐变外缘）
const RICOCHET_MAIN = 0xcc8800; // 主橙金（弹射主色）
const RICOCHET_LIGHT = 0xffbb22; // 浅亮橙（中层渐变）
const RICOCHET_HIGHLIGHT = 0xffdd77; // 高亮浅橙（内层渐变）
const RICOCHET_WHITE = 0xffffff; // 白色（核心高亮）
const RICOCHET_CYAN = 0x00ffcc; // 弹射青（反弹线/弹射色）

/** 反弹线数量（多层叠加） */
const RICOCHET_LINE_COUNT = 6;
/** 每条反弹线的弹射段数 */
const RICOCHET_BOUNCE_SEGMENTS = 3;

// ══════════════════════════════════════════════════════
//  数据结构
// ══════════════════════════════════════════════════════

/** 活跃弹射轨迹实例（常驻） */
interface ActiveRicochet {
  container: PIXI.Container;
  coreGraphics: PIXI.Graphics; // 弹射核心（8 层径向渐变）
  ricochetGraphics: PIXI.Graphics; // 多层叠加发光反弹线（独立旋转）
  particleTimer: number;
  life: number; // ms 累计
  maxLife: number;
  x: number;
  y: number;
  radius: number;
}

/** 活跃爆发特效（蓄射→弹射→消散 三阶段） */
interface ActiveBurst {
  container: PIXI.Container;
  coreGraphics: PIXI.Graphics; // 弹射核心（8 层渐变）
  ricochetGraphics: PIXI.Graphics; // 反弹线爆发
  ringGraphics: PIXI.Graphics; // 弹射环
  life: number;
  maxLife: number;
  themeColor: number;
  radius: number;
}

export class RicochetCoreRenderer {
  private fieldContainer: PIXI.Container;
  private particlePool: ParticlePool;
  private scale = 1;

  // 活跃实例池
  private activeRicochets: Map<string, ActiveRicochet> = new Map();
  private activeBursts: Map<string, ActiveBurst> = new Map();

  constructor(fieldContainer: PIXI.Container, particlePool: ParticlePool) {
    this.fieldContainer = fieldContainer;
    this.particlePool = particlePool;
  }

  setScale(scale: number): void {
    this.scale = scale;
    this.activeRicochets.forEach((r) => {
      if (r.container.destroyed) return;
      r.container.scale.set(scale);
    });
    this.activeBursts.forEach((b) => {
      if (b.container.destroyed) return;
      b.container.scale.set(scale);
    });
  }

  // ══════════════════════════════════════════════════════
  //  弹射轨迹 Ricochet（常驻）
  // ══════════════════════════════════════════════════════

  /**
   * 触发弹射轨迹视觉效果
   * @param playerId 玩家 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param radius 弹射半径（逻辑 px）
   * @param themeColor 主题色（默认变奏者橙金）
   */
  triggerRicochet(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor = RICOCHET_MAIN,
  ): void {
    // 已存在则仅更新位置与半径
    const existing = this.activeRicochets.get(playerId);
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

    // 弹射核心（8 层径向渐变 + 主环 + 中心核）
    const coreGraphics = new PIXI.Graphics();
    this.drawRicochetCore(coreGraphics, radius);
    container.addChild(coreGraphics);

    // 多层叠加发光反弹线（独立旋转）
    const ricochetGraphics = new PIXI.Graphics();
    this.drawRicochetLines(ricochetGraphics, radius);
    container.addChild(ricochetGraphics);

    this.fieldContainer.addChild(container);

    const ricochet: ActiveRicochet = {
      container,
      coreGraphics,
      ricochetGraphics,
      particleTimer: 0,
      life: 0,
      maxLife: Number.POSITIVE_INFINITY, // 常驻，直到手动移除
      x,
      y,
      radius,
    };
    this.activeRicochets.set(playerId, ricochet);

    // 触发首帧弹射粒子
    this.spawnRicochetParticles(x, y, radius, RICOCHET_CYAN);
    void themeColor;
  }

  /** 移除弹射轨迹 */
  removeRicochet(playerId: string): void {
    const ricochet = this.activeRicochets.get(playerId);
    if (ricochet) {
      this.fieldContainer.removeChild(ricochet.container);
      ricochet.container.destroy({ children: true });
      this.activeRicochets.delete(playerId);
    }
  }

  /**
   * 绘制弹射核心：8 层同心圆径向渐变（白→高亮→浅橙→主橙金→深褐橙）+ 主环 + 中心核
   * 以 (0,0) 为中心绘制
   */
  private drawRicochetCore(g: PIXI.Graphics, radius: number): void {
    g.clear();

    // 8 层同心圆叠加模拟径向渐变
    for (let i = 0; i < 8; i++) {
      const t = i / 7; // 0 → 1
      const r = radius * (0.15 + 0.85 * t);
      // 颜色分段：白 → 高亮 → 浅橙 → 主橙金 → 深褐橙
      let color: number;
      if (t < 0.25) {
        color = this.interpolateColor(RICOCHET_WHITE, RICOCHET_HIGHLIGHT, t / 0.25);
      } else if (t < 0.5) {
        color = this.interpolateColor(
          RICOCHET_HIGHLIGHT,
          RICOCHET_LIGHT,
          (t - 0.25) / 0.25,
        );
      } else if (t < 0.75) {
        color = this.interpolateColor(
          RICOCHET_LIGHT,
          RICOCHET_MAIN,
          (t - 0.5) / 0.25,
        );
      } else {
        color = this.interpolateColor(
          RICOCHET_MAIN,
          RICOCHET_DEEP,
          (t - 0.75) / 0.25,
        );
      }
      const alpha = (1 - t) * 0.22;
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }

    // 弹射主环：深褐橙描边 + 主橙金主环 + 高亮内环
    g.circle(0, 0, radius);
    g.stroke({ color: RICOCHET_DEEP, width: 1.5, alpha: 0.6 });
    g.circle(0, 0, radius * 0.97);
    g.stroke({ color: RICOCHET_MAIN, width: 1, alpha: 0.7 });
    g.circle(0, 0, radius * 0.93);
    g.stroke({ color: RICOCHET_HIGHLIGHT, width: 0.4, alpha: 0.5 });

    // 中心核：白色实心圆 r=4 + 弹射青外环 r=6
    g.circle(0, 0, 6);
    g.stroke({ color: RICOCHET_CYAN, width: 1, alpha: 0.8 });
    g.circle(0, 0, 4);
    g.fill({ color: RICOCHET_WHITE, alpha: 1 });
  }

  /**
   * 绘制多层叠加发光反弹线：6 条弹射轨迹（每条多段反弹），双层叠加发光
   * 由 ricochetGraphics 独立承担旋转动画
   */
  private drawRicochetLines(g: PIXI.Graphics, radius: number): void {
    g.clear();
    const lineR = radius * 0.95;
    // 6 条反弹线均匀分布起始角
    for (let i = 0; i < RICOCHET_LINE_COUNT; i++) {
      const baseAngle =
        (i * Math.PI * 2) / RICOCHET_LINE_COUNT +
        this.ricochetJitter(i) * 0.2;
      // 生成反弹点序列：从中心向外，每次反弹角度反射
      const pts: [number, number][] = [[0, 0]];
      let curAngle = baseAngle;
      let curR = lineR * 0.25;
      for (let s = 0; s < RICOCHET_BOUNCE_SEGMENTS; s++) {
        pts.push([Math.cos(curAngle) * curR, Math.sin(curAngle) * curR]);
        // 反弹：角度反射 + 半径递增（弹射向外）
        curAngle = -curAngle + this.ricochetJitter(i * 10 + s) * 0.5;
        curR = Math.min(lineR, curR + lineR * 0.3);
      }
      // 弹射青外层发光（粗）
      g.moveTo(pts[0][0], pts[0][1]);
      for (let s = 1; s < pts.length; s++) g.lineTo(pts[s][0], pts[s][1]);
      g.stroke({ color: RICOCHET_CYAN, width: 2.5, alpha: 0.7 });
      // 主橙金内层发光（细）
      g.moveTo(pts[0][0], pts[0][1]);
      for (let s = 1; s < pts.length; s++) g.lineTo(pts[s][0], pts[s][1]);
      g.stroke({ color: RICOCHET_LIGHT, width: 1, alpha: 0.9 });
      // 弹射端点：白色高亮节点
      const last = pts[pts.length - 1];
      g.circle(last[0], last[1], 3);
      g.fill({ color: RICOCHET_WHITE, alpha: 0.9 });
    }
  }

  /**
   * 生成弹射粒子（沿反弹线方向喷射）
   * 利用 particlePool.emit，每帧由 update 节流调用
   */
  private spawnRicochetParticles(
    x: number,
    y: number,
    radius: number,
    color: number,
  ): void {
    const s = this.scale;
    for (let i = 0; i < 2; i++) {
      const angle = Math.random() * Math.PI * 2;
      // 从核心附近出发
      const startDist = radius * s * (0.15 + Math.random() * 0.15);
      const px = x + Math.cos(angle) * startDist;
      const py = y + Math.sin(angle) * startDist;
      // 沿放射方向喷射速度（px/s），表现弹射感
      const speed = (28 + Math.random() * 20) * s;
      this.particlePool.emit({
        x: px,
        y: py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1800,
        scaleStart: 1,
        scaleEnd: 0,
        alphaStart: 0.85,
        alphaEnd: 0,
        tint: color,
        radius: (1.4 + Math.random() * 1.4) * s,
      });
    }
  }

  // ══════════════════════════════════════════════════════
  //  爆发特效（蓄射→弹射→消散 三阶段动画）
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
    themeColor = RICOCHET_MAIN,
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

    // 1. 弹射核心（8 层径向渐变 + 中心核）
    const coreGraphics = new PIXI.Graphics();
    this.drawBurstCore(coreGraphics, radius);
    container.addChild(coreGraphics);

    // 2. 反弹线爆发（多层叠加发光反弹线）
    const ricochetGraphics = new PIXI.Graphics();
    this.drawRicochetLines(ricochetGraphics, radius * 0.85);
    container.addChild(ricochetGraphics);

    // 3. 弹射环（双层细高亮环）
    const ringGraphics = new PIXI.Graphics();
    this.drawBurstRing(ringGraphics, radius);
    container.addChild(ringGraphics);

    this.fieldContainer.addChild(container);

    const burst: ActiveBurst = {
      container,
      coreGraphics,
      ricochetGraphics,
      ringGraphics,
      life: 0,
      maxLife: durationMs ?? 5000,
      themeColor,
      radius,
    };
    this.activeBursts.set(playerId, burst);
  }

  /**
   * 绘制爆发弹射核心：8 层同心圆（白→高亮→浅橙→主橙金→深褐橙）+ 中心核
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
        color = this.interpolateColor(RICOCHET_WHITE, RICOCHET_HIGHLIGHT, t / 0.25);
      } else if (t < 0.5) {
        color = this.interpolateColor(
          RICOCHET_HIGHLIGHT,
          RICOCHET_LIGHT,
          (t - 0.25) / 0.25,
        );
      } else if (t < 0.75) {
        color = this.interpolateColor(
          RICOCHET_LIGHT,
          RICOCHET_MAIN,
          (t - 0.5) / 0.25,
        );
      } else {
        color = this.interpolateColor(
          RICOCHET_MAIN,
          RICOCHET_DEEP,
          (t - 0.75) / 0.25,
        );
      }
      const alpha = (1 - t) * 0.28;
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }

    // 中心核 r=6
    g.circle(0, 0, 6);
    g.fill({ color: RICOCHET_WHITE, alpha: 1 });

    // 弹射青边缘辉光
    g.circle(0, 0, 8);
    g.stroke({ color: RICOCHET_CYAN, width: 1.5, alpha: 0.8 });
  }

  /**
   * 绘制弹射环：双层细高亮环（主橙金 + 弹射青）
   */
  private drawBurstRing(g: PIXI.Graphics, radius: number): void {
    g.clear();
    g.circle(0, 0, radius);
    g.stroke({ color: RICOCHET_LIGHT, width: 0.6, alpha: 0.7 });
    g.circle(0, 0, radius * 0.95);
    g.stroke({ color: RICOCHET_CYAN, width: 0.3, alpha: 0.5 });
  }

  // ══════════════════════════════════════════════════════
  //  更新循环
  // ══════════════════════════════════════════════════════

  /** 每帧更新（由 EffectRenderer 调用，dt 单位 ms） */
  update(dt: number): void {
    // ── 弹射轨迹：核心呼吸 + 反弹线旋转 + 弹射粒子 ──
    this.activeRicochets.forEach((ricochet) => {
      ricochet.life += dt;
      // 核心呼吸 scale 1.0↔1.05（2s 周期）
      const breath = 1 + 0.05 * Math.sin(ricochet.life * 0.001 * Math.PI);
      ricochet.coreGraphics.scale.set(breath);
      // 核心脉动 alpha 0.7↔0.95
      const pulse = 0.8 + 0.15 * Math.sin(ricochet.life * 0.001 * Math.PI);
      ricochet.coreGraphics.alpha = pulse;
      // 反弹线旋转 0.5 转/秒（弹射轨迹流动感）
      ricochet.ricochetGraphics.rotation += dt * 0.001 * Math.PI;
      // 反弹线高频闪烁 alpha 0.5↔1.0（弹射脉冲感）
      ricochet.ricochetGraphics.alpha =
        0.75 + 0.25 * Math.sin(ricochet.life * 0.004 * Math.PI * 2);
      // 弹射粒子：每 1.2s 生成 2 个
      ricochet.particleTimer += dt;
      if (ricochet.particleTimer > 1200) {
        ricochet.particleTimer = 0;
        this.spawnRicochetParticles(
          ricochet.x,
          ricochet.y,
          ricochet.radius,
          RICOCHET_CYAN,
        );
      }
    });

    // ── 爆发：三阶段动画（蓄射→弹射→消散） ──
    this.activeBursts.forEach((burst, playerId) => {
      burst.life += dt;
      const T = burst.maxLife;
      if (burst.life >= T) {
        this.removeBurst(playerId);
        return;
      }
      const phase1End = T * 0.15; // 蓄射阶段
      const phase2End = T * 0.35; // 弹射阶段

      if (burst.life < phase1End) {
        // 阶段1 蓄射：核心收缩 scale 1.0→0.4(easeInCubic)，反弹线汇聚收缩，环未展开
        const t = burst.life / phase1End;
        const eased = this.easeInCubic(t);
        burst.coreGraphics.scale.set(1.0 - 0.6 * eased); // 1.0 → 0.4 蓄压收缩
        burst.coreGraphics.alpha = 1.0 - 0.2 * t;
        // 反弹线收缩汇聚 scale 1.0→0.3
        burst.ricochetGraphics.scale.set(1.0 - 0.7 * eased);
        burst.ricochetGraphics.alpha = 1.0 - 0.3 * t;
        burst.ricochetGraphics.rotation += dt * 0.008 * Math.PI; // 快速蓄压旋转
        burst.ringGraphics.alpha = 0;
        burst.ringGraphics.scale.set(0.3);
      } else if (burst.life < phase2End) {
        // 阶段2 弹射：反弹线爆发扩张 scale 0.3→1.5(easeOutCubic)，核心爆发，环展开
        const t = (burst.life - phase1End) / (phase2End - phase1End);
        const eased = this.easeOutCubic(t);
        // 反弹线弹射扩张 0.3 → 1.5
        burst.ricochetGraphics.scale.set(0.3 + 1.2 * eased);
        burst.ricochetGraphics.alpha = 0.7 + 0.3 * t;
        burst.ricochetGraphics.rotation += dt * 0.012 * Math.PI; // 快速弹射旋转
        // 核心爆发 scale 0.4→1.2
        burst.coreGraphics.scale.set(0.4 + 0.8 * eased);
        burst.coreGraphics.alpha = 0.8 + 0.2 * t;
        // 环展开 scale 0.3→1.0
        burst.ringGraphics.scale.set(0.3 + 0.7 * eased);
        burst.ringGraphics.alpha = t;
      } else {
        // 阶段3 消散：反弹线渐隐扩散，环扩散消散，核心渐隐
        const t = (burst.life - phase2End) / (T - phase2End);
        burst.ricochetGraphics.alpha = 1.0 - t;
        burst.ricochetGraphics.scale.set(1.5 + 0.5 * t); // 继续扩散
        burst.ricochetGraphics.rotation += dt * 0.004 * Math.PI;
        burst.ringGraphics.scale.set(1.0 + 1.0 * t);
        burst.ringGraphics.alpha = 1.0 - t;
        burst.coreGraphics.alpha = 1.0 - 0.7 * t;
        burst.coreGraphics.scale.set(1.2 - 0.2 * t); // 略微收缩
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
    this.activeRicochets.forEach((_, playerId) =>
      this.removeRicochet(playerId),
    );
    this.activeBursts.forEach((_, playerId) => this.removeBurst(playerId));
  }

  destroy(): void {
    this.clear();
  }

  // ══════════════════════════════════════════════════════
  //  工具方法
  // ══════════════════════════════════════════════════════

  /**
   * 确定性伪随机抖动（基于种子，保证反弹轨迹形态稳定）
   * 返回 [-1, 1] 范围
   */
  private ricochetJitter(seed: number): number {
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
