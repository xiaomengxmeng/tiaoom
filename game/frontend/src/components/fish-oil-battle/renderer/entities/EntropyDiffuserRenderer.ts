/**
 * 熵增扩散器 (Entropy Diffuser) - 控制者流派
 * 前端视觉渲染器
 *
 * 视觉设计（控制者蓝紫色系 —— 熵增扩散，混乱效果）：
 * - 熵增场 EntropyField：10 层径向渐变光环（白→高亮蓝紫→浅蓝紫→主蓝紫→深蓝紫透明）
 *   + 双层主环（外环高亮蓝紫 + 内环白）+ 中心熵增核（白实心 + 混乱青外晕）
 *   + 扩散波纹（多层从中心向外扩散的圆环，循环播放）+ 混乱粒子（随机方向飞散，蓝紫/青色）
 * - 爆发 Burst：三阶段动画
 *   · 蓄能（0-15%T）：熵增场收缩，能量向中心汇聚
 *   · 扩散爆发（15%-30%T）：熵增奇点爆发（10 层渐变核心）+ 6 条扩散线闪现 + 视界环展开
 *   · 混乱余波（30%-100%T）：混乱波纹扩散消散
 *
 * API：triggerEntropyField / removeEntropyField / triggerBurst / update / setScale / clear / destroy
 * 所有动画由 update(dt) 驱动，不使用 rAF / setTimeout。
 */

import * as PIXI from 'pixi.js';
import { ParticlePool } from '../systems/ParticlePool';

// ══════════════════════════════════════════════════════
//  颜色常量（控制者蓝紫）
// ══════════════════════════════════════════════════════

const ENTROPY_DEEP = 0x0a0a4a; // 深蓝紫（渐变末端）
const ENTROPY_MAIN = 0x2200cc; // 主蓝紫
const ENTROPY_LIGHT = 0x5566ff; // 浅蓝紫
const ENTROPY_HIGHLIGHT = 0x99bbff; // 高亮蓝紫
const ENTROPY_WHITE = 0xffffff; // 白色
const ENTROPY_CYAN = 0x00ffcc; // 混乱青色

// ══════════════════════════════════════════════════════
//  数据结构
// ══════════════════════════════════════════════════════

/** 活跃熵增场实例（常驻，扩散波纹循环播放） */
interface ActiveEntropyField {
  container: PIXI.Container;
  coreGraphics: PIXI.Graphics; // 10 层渐变光环 + 双层主环 + 中心熵增核
  rippleGraphics: PIXI.Graphics; // 扩散波纹（多层从中心向外扩散的圆环）
  particleTimer: number; // 混乱粒子节流计时器
  rippleTimer: number; // 扩散波纹节流计时器
  ripplePhase: number; // 扩散波纹相位（驱动波纹扩散动画）
  life: number; // ms 累计
  maxLife: number;
  x: number;
  y: number;
  radius: number;
  themeColor: number;
}

/** 活跃爆发特效（三阶段：蓄能 → 扩散爆发 → 混乱余波） */
interface ActiveBurst {
  container: PIXI.Container;
  coreGraphics: PIXI.Graphics; // 熵增奇点核心（10 层渐变）
  horizonGraphics: PIXI.Graphics; // 视界环（双层细高亮环）
  diffuseGraphics: PIXI.Graphics; // 扩散线（6 条向心汇聚）
  haloGraphics: PIXI.Graphics; // 混乱波纹（多层细环）
  life: number;
  maxLife: number;
  themeColor: number;
  radius: number;
  particleTimer: number; // 扩散阶段粒子节流
}

export class EntropyDiffuserRenderer {
  private fieldContainer: PIXI.Container;
  private particlePool: ParticlePool;
  private scale = 1;

  // 活跃实例池
  private activeFields: Map<string, ActiveEntropyField> = new Map();
  private activeBursts: Map<string, ActiveBurst> = new Map();

  constructor(fieldContainer: PIXI.Container, particlePool: ParticlePool) {
    this.fieldContainer = fieldContainer;
    this.particlePool = particlePool;
  }

  setScale(scale: number): void {
    this.scale = scale;
    // 容器统一承担全局缩放，内部 graphics 维持各自的动画 scale
    this.activeFields.forEach((f) => {
      if (f.container.destroyed) return;
      f.container.scale.set(scale);
    });
    this.activeBursts.forEach((b) => {
      if (b.container.destroyed) return;
      b.container.scale.set(scale);
    });
  }

  // ══════════════════════════════════════════════════════
  //  熵增场 EntropyField（常驻，扩散波纹循环播放）
  // ══════════════════════════════════════════════════════

  /**
   * 触发熵增场视觉效果
   * @param playerId 玩家 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param radius 熵增场半径（逻辑 px）
   * @param themeColor 主题色（默认主蓝紫）
   */
  triggerEntropyField(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor = ENTROPY_MAIN,
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

    const container = new PIXI.Container();
    container.position.set(x, y);
    container.scale.set(this.scale); // 全局缩放由容器承担

    // 10 层渐变光环 + 双层主环 + 中心熵增核
    const coreGraphics = new PIXI.Graphics();
    this.drawEntropyCore(coreGraphics, radius);
    container.addChild(coreGraphics);

    // 扩散波纹（多层从中心向外扩散的圆环，由 update 驱动动画）
    const rippleGraphics = new PIXI.Graphics();
    container.addChild(rippleGraphics);

    this.fieldContainer.addChild(container);

    const field: ActiveEntropyField = {
      container,
      coreGraphics,
      rippleGraphics,
      particleTimer: 0,
      rippleTimer: 0,
      ripplePhase: 0,
      life: 0,
      maxLife: Number.POSITIVE_INFINITY, // 常驻，直到手动移除
      x,
      y,
      radius,
      themeColor,
    };
    this.activeFields.set(playerId, field);

    // 触发首帧混乱粒子
    this.spawnChaosParticles(x, y, radius, ENTROPY_MAIN);
  }

  /** 移除熵增场 */
  removeEntropyField(playerId: string): void {
    const f = this.activeFields.get(playerId);
    if (f) {
      this.fieldContainer.removeChild(f.container);
      f.container.destroy({ children: true });
      this.activeFields.delete(playerId);
    }
  }

  /**
   * 绘制熵增核心：10 层同心圆径向渐变（白→高亮蓝紫→浅蓝紫→主蓝紫→深蓝紫透明）
   * + 双层主环 + 中心熵增核（混乱青外晕）
   * 以 (0,0) 为中心绘制，半径单位为逻辑 px
   */
  private drawEntropyCore(g: PIXI.Graphics, radius: number): void {
    g.clear();

    // 10 层渐变光环：中心白 → 高亮蓝紫 → 浅蓝紫 → 主蓝紫 → 深蓝紫透明
    for (let i = 0; i < 10; i++) {
      const t = i / 9; // 0 → 1
      const r = radius * (0.1 + 0.9 * t);
      // 颜色四段插值：白→高亮蓝紫→浅蓝紫→主蓝紫→深蓝紫
      let color: number;
      if (t < 0.25) {
        color = this.interpolateColor(ENTROPY_WHITE, ENTROPY_HIGHLIGHT, t / 0.25);
      } else if (t < 0.5) {
        color = this.interpolateColor(
          ENTROPY_HIGHLIGHT,
          ENTROPY_LIGHT,
          (t - 0.25) / 0.25,
        );
      } else if (t < 0.75) {
        color = this.interpolateColor(
          ENTROPY_LIGHT,
          ENTROPY_MAIN,
          (t - 0.5) / 0.25,
        );
      } else {
        color = this.interpolateColor(
          ENTROPY_MAIN,
          ENTROPY_DEEP,
          (t - 0.75) / 0.25,
        );
      }
      const alpha = (1 - t) * 0.2; // 中心高 alpha，边缘趋近 0
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }

    // 双层主环：外环高亮蓝紫 + 内环白
    g.circle(0, 0, radius);
    g.stroke({ color: ENTROPY_HIGHLIGHT, width: 1, alpha: 0.7 });
    g.circle(0, 0, radius * 0.95);
    g.stroke({ color: ENTROPY_WHITE, width: 0.4, alpha: 0.5 });

    // 中心熵增核：白色实心圆 r=4 + 混乱青外环 r=6（混乱感）
    g.circle(0, 0, 6);
    g.stroke({ color: ENTROPY_CYAN, width: 1, alpha: 0.8 });
    g.circle(0, 0, 4);
    g.fill({ color: ENTROPY_WHITE, alpha: 1 });
  }

  /**
   * 绘制扩散波纹：3 层从中心向外扩散的圆环（由 ripplePhase 驱动扩散）
   * @param g rippleGraphics
   * @param radius 最大半径
   * @param phase 扩散相位（0 → 1 循环），3 层波纹错相位扩散
   */
  private drawDiffuseRipples(
    g: PIXI.Graphics,
    radius: number,
    phase: number,
  ): void {
    g.clear();
    // 3 层波纹，相位错开 1/3
    const layers = 3;
    for (let i = 0; i < layers; i++) {
      // 每层波纹的相位（0 → 1 循环）
      const p = (phase + i / layers) % 1;
      const r = radius * p; // 半径随相位从 0 → radius
      const alpha = (1 - p) * 0.5; // 透明度随相位从 0.5 → 0
      g.circle(0, 0, r);
      g.stroke({
        color: i === 1 ? ENTROPY_CYAN : ENTROPY_LIGHT, // 中层用混乱青色突出
        width: 0.8,
        alpha,
      });
    }
  }

  /**
   * 生成混乱粒子（随机方向飞散，蓝紫/青色）
   * 利用 particlePool.emit，由 update 节流调用
   */
  private spawnChaosParticles(
    x: number,
    y: number,
    radius: number,
    color: number,
  ): void {
    const s = this.scale;
    for (let i = 0; i < 2; i++) {
      const angle = Math.random() * Math.PI * 2;
      // 从熵增核附近出发
      const startDist = radius * s * (0.2 + Math.random() * 0.5);
      const px = x + Math.cos(angle) * startDist;
      const py = y + Math.sin(angle) * startDist;
      // 混乱方向速度（px/s）—— 完全随机方向，非纯向外
      const chaosAngle = Math.random() * Math.PI * 2;
      const speed = (15 + Math.random() * 30) * s;
      // 30% 概率使用混乱青色，70% 使用主题色
      const tint = Math.random() < 0.3 ? ENTROPY_CYAN : color;
      this.particlePool.emit({
        x: px,
        y: py,
        vx: Math.cos(chaosAngle) * speed,
        vy: Math.sin(chaosAngle) * speed,
        life: 1200,
        scaleStart: 1,
        scaleEnd: 0,
        alphaStart: 0.8,
        alphaEnd: 0,
        tint,
        radius: (1.5 + Math.random() * 1.5) * s,
      });
    }
  }

  // ══════════════════════════════════════════════════════
  //  爆发特效（三阶段：蓄能 → 扩散爆发 → 混乱余波）
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
    themeColor = ENTROPY_MAIN,
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

    // 1. 熵增奇点核心（10 层渐变 + 白核 + 混乱青边缘辉光）
    const coreGraphics = new PIXI.Graphics();
    this.drawBurstCore(coreGraphics, radius);
    container.addChild(coreGraphics);

    // 2. 视界环（双层细高亮环）
    const horizonGraphics = new PIXI.Graphics();
    this.drawBurstHorizon(horizonGraphics, radius);
    container.addChild(horizonGraphics);

    // 3. 扩散线（6 条 quadraticCurveTo 从外向内汇聚）
    const diffuseGraphics = new PIXI.Graphics();
    this.drawBurstDiffuses(diffuseGraphics, radius);
    container.addChild(diffuseGraphics);

    // 4. 混乱波纹（多层细环）
    const haloGraphics = new PIXI.Graphics();
    this.drawBurstHalo(haloGraphics, radius);
    container.addChild(haloGraphics);

    this.fieldContainer.addChild(container);

    const burst: ActiveBurst = {
      container,
      coreGraphics,
      horizonGraphics,
      diffuseGraphics,
      haloGraphics,
      life: 0,
      maxLife: durationMs ?? 5000,
      themeColor,
      radius,
      particleTimer: 0,
    };
    this.activeBursts.set(playerId, burst);
  }

  /**
   * 绘制熵增奇点核心：10 层同心圆（深蓝紫 → 主蓝紫 → 浅蓝紫 → 高亮蓝紫 → 白）
   * + 白核 + 混乱青边缘辉光
   */
  private drawBurstCore(g: PIXI.Graphics, radius: number): void {
    g.clear();
    const coreR = radius * 0.6; // 奇点核心区域半径

    // 10 层同心圆叠加（深蓝紫 → 主蓝紫 → 浅蓝紫 → 高亮蓝紫 → 白）
    for (let i = 0; i < 10; i++) {
      const t = i / 9; // 0 → 1
      const r = coreR * (0.1 + 0.9 * t);
      // 颜色四段插值：深蓝紫→主蓝紫→浅蓝紫→高亮蓝紫→白
      let color: number;
      if (t < 0.25) {
        color = this.interpolateColor(ENTROPY_DEEP, ENTROPY_MAIN, t / 0.25);
      } else if (t < 0.5) {
        color = this.interpolateColor(
          ENTROPY_MAIN,
          ENTROPY_LIGHT,
          (t - 0.25) / 0.25,
        );
      } else if (t < 0.75) {
        color = this.interpolateColor(
          ENTROPY_LIGHT,
          ENTROPY_HIGHLIGHT,
          (t - 0.5) / 0.25,
        );
      } else {
        color = this.interpolateColor(
          ENTROPY_HIGHLIGHT,
          ENTROPY_WHITE,
          (t - 0.75) / 0.25,
        );
      }
      const alpha = (1 - t) * 0.25;
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }

    // 熵增核 r=6（白色实心）
    g.circle(0, 0, 6);
    g.fill({ color: ENTROPY_WHITE, alpha: 1 });

    // 混乱青色边缘辉光
    g.circle(0, 0, 8);
    g.stroke({ color: ENTROPY_CYAN, width: 1.5, alpha: 0.8 });
  }

  /**
   * 绘制视界环：双层细高亮环
   */
  private drawBurstHorizon(g: PIXI.Graphics, radius: number): void {
    g.clear();
    g.circle(0, 0, radius);
    g.stroke({ color: ENTROPY_HIGHLIGHT, width: 0.6, alpha: 0.7 });
    g.circle(0, 0, radius * 0.95);
    g.stroke({ color: ENTROPY_WHITE, width: 0.3, alpha: 0.5 });
  }

  /**
   * 绘制扩散线：6 条 quadraticCurveTo 从外向内汇聚（扩散汇聚感）
   */
  private drawBurstDiffuses(g: PIXI.Graphics, radius: number): void {
    g.clear();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const startX = Math.cos(a) * radius;
      const startY = Math.sin(a) * radius;
      // 控制点偏离直线方向，形成弧形扩散感
      const midR = radius * 0.5;
      const offset = Math.PI / 6;
      const cpX = Math.cos(a + offset) * midR;
      const cpY = Math.sin(a + offset) * midR;
      g.moveTo(startX, startY);
      g.quadraticCurveTo(cpX, cpY, 0, 0);
      g.stroke({ color: ENTROPY_CYAN, width: 1, alpha: 0.8 });
    }
  }

  /**
   * 绘制混乱波纹：4 层细环（白 → 高亮蓝紫 → 浅蓝紫 → 主蓝紫）
   */
  private drawBurstHalo(g: PIXI.Graphics, radius: number): void {
    g.clear();
    const colors = [
      ENTROPY_WHITE,
      ENTROPY_HIGHLIGHT,
      ENTROPY_LIGHT,
      ENTROPY_MAIN,
    ];
    for (let i = 0; i < colors.length; i++) {
      const r = radius * (0.8 + i * 0.1);
      g.circle(0, 0, r);
      g.stroke({ color: colors[i], width: 0.5, alpha: 0.4 });
    }
  }

  /**
   * 扩散阶段喷射粒子（从核心向外飞散的混乱蓝紫/青色粒子）
   */
  private spawnBurstParticles(burst: ActiveBurst): void {
    const s = this.scale;
    const count = 3;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const startDist = burst.radius * s * 0.1;
      const px = burst.container.position.x + Math.cos(angle) * startDist;
      const py = burst.container.position.y + Math.sin(angle) * startDist;
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
        tint: Math.random() < 0.4 ? ENTROPY_CYAN : ENTROPY_LIGHT,
        radius: (1.5 + Math.random() * 1.5) * s,
      });
    }
  }

  // ══════════════════════════════════════════════════════
  //  更新循环
  // ══════════════════════════════════════════════════════

  /** 每帧更新（由 EffectRenderer 调用，dt 单位 ms） */
  update(dt: number): void {
    // ── 熵增场：呼吸 scale + 脉动 alpha + 扩散波纹 + 混乱粒子 ──
    this.activeFields.forEach((field) => {
      field.life += dt;
      // 呼吸 scale 1.0↔1.05（2s 周期）
      const breath = 1 + 0.05 * Math.sin(field.life * 0.001 * Math.PI);
      field.coreGraphics.scale.set(breath);
      // 脉动 alpha 0.6↔0.9
      const pulse = 0.75 + 0.15 * Math.sin(field.life * 0.001 * Math.PI);
      field.coreGraphics.alpha = pulse;
      // 扩散波纹：相位推进（2s 一个周期）
      field.rippleTimer += dt;
      if (field.rippleTimer > 33) {
        // 每 33ms 推进相位，2000ms 完成一次扩散循环
        field.ripplePhase = (field.ripplePhase + dt / 2000) % 1;
        field.rippleTimer = 0;
        this.drawDiffuseRipples(
          field.rippleGraphics,
          field.radius,
          field.ripplePhase,
        );
      }
      // 混乱粒子：每 1s 生成 2 个（随机方向飞散）
      field.particleTimer += dt;
      if (field.particleTimer > 1000) {
        field.particleTimer = 0;
        this.spawnChaosParticles(field.x, field.y, field.radius, ENTROPY_MAIN);
      }
    });

    // ── 爆发：三阶段动画 ──
    this.activeBursts.forEach((burst, playerId) => {
      burst.life += dt;
      const T = burst.maxLife;
      if (burst.life >= T) {
        this.removeBurst(playerId);
        return;
      }
      const phase1End = T * 0.15; // 蓄能阶段结束
      const phase2End = T * 0.30; // 扩散爆发阶段结束

      if (burst.life < phase1End) {
        // 阶段1 蓄能：波纹收缩 scale 1.0→0.3，alpha 1.0→0.3，熵增核显现
        const t = burst.life / phase1End;
        burst.haloGraphics.scale.set(1.0 - 0.7 * t);
        burst.haloGraphics.alpha = 1.0 - 0.7 * t;
        burst.coreGraphics.alpha = t; // 0 → 1 显现
        burst.diffuseGraphics.alpha = 0;
        burst.horizonGraphics.alpha = 0;
        burst.horizonGraphics.scale.set(0.3);
      } else if (burst.life < phase2End) {
        // 阶段2 扩散爆发：奇点爆发 scale 0.3→1.0(easeOutCubic)，扩散线闪现 alpha 0→0.8，视界环展开
        const t = (burst.life - phase1End) / (phase2End - phase1End);
        const eased = this.easeOutCubic(t);
        burst.haloGraphics.scale.set(0.3 + 0.7 * eased);
        burst.haloGraphics.alpha = 0.3 + 0.4 * t; // 0.3 → 0.7
        burst.coreGraphics.alpha = 1.0;
        burst.diffuseGraphics.alpha = 0.8 * t; // 0 → 0.8
        burst.horizonGraphics.scale.set(0.3 + 0.7 * eased);
        burst.horizonGraphics.alpha = t; // 0 → 1
        // 扩散阶段喷射粒子（每 80ms）
        burst.particleTimer += dt;
        if (burst.particleTimer > 80) {
          burst.particleTimer = 0;
          this.spawnBurstParticles(burst);
        }
      } else {
        // 阶段3 混乱余波：视界环扩散 scale 1.0→2.0 alpha 1.0→0，混乱波纹消散 alpha 0.7→0（sin 波动），
        //                 扩散线消散 alpha 0.8→0，熵增核保持但透明 alpha 1.0→0.3
        const t = (burst.life - phase2End) / (T - phase2End);
        burst.horizonGraphics.scale.set(1.0 + 1.0 * t);
        burst.horizonGraphics.alpha = 1.0 - t;
        burst.haloGraphics.alpha = 0.7 * (1.0 - t);
        burst.haloGraphics.rotation = Math.sin(t * Math.PI * 4) * 0.5;
        burst.diffuseGraphics.alpha = 0.8 * (1.0 - t);
        burst.coreGraphics.alpha = 1.0 - 0.7 * t;
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
    this.activeFields.forEach((_, playerId) =>
      this.removeEntropyField(playerId),
    );
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
}
