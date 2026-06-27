/**
 * 重力阱 (Gravity Well) - 控制者流派
 * 前端视觉渲染器
 *
 * 视觉设计（控制者紫色系 —— 重力吸引，牵引敌人）：
 * - 重力核心 GravityCore：10 层径向渐变光环（白→高亮紫→浅紫→主紫→深紫透明）
 *   + 双层主环（外环高亮紫 + 内环白）+ 中心引力核（白实心 + 浅紫外晕）
 *   + 螺旋臂（3 条阿基米德螺旋线，向心旋转）+ 牵引线（4 条从外向内的二次贝塞尔曲线）
 *   + 引力粒子（紫色，向心被吸）
 * - 爆发 Burst：三阶段动画
 *   · 坍缩（0-15%T）：重力核心收缩，能量向中心汇聚
 *   · 爆发（15%-30%T）：引力奇点爆发（10 层渐变核心）+ 6 条引力线闪现 + 视界环展开
 *   · 扩散（30%-100%T）：引力波纹扩散消散
 *
 * API：triggerGravityCore / removeGravityCore / triggerBurst / update / setScale / clear / destroy
 * 所有动画由 update(dt) 驱动，不使用 rAF / setTimeout。
 */

import * as PIXI from 'pixi.js';
import { ParticlePool } from '../systems/ParticlePool';

// ══════════════════════════════════════════════════════
//  颜色常量（控制者紫）
// ══════════════════════════════════════════════════════

const GRAVITY_DEEP = 0x1a0a3a; // 深紫（渐变末端）
const GRAVITY_MAIN = 0x5522cc; // 主紫
const GRAVITY_LIGHT = 0x8866ff; // 浅紫
const GRAVITY_HIGHLIGHT = 0xbbaaff; // 高亮紫
const GRAVITY_WHITE = 0xffffff; // 白色

// ══════════════════════════════════════════════════════
//  数据结构
// ══════════════════════════════════════════════════════

/** 活跃重力核心实例（常驻，螺旋臂向心旋转） */
interface ActiveGravityCore {
  container: PIXI.Container;
  coreGraphics: PIXI.Graphics; // 10 层渐变光环 + 双层主环 + 中心引力核
  spiralGraphics: PIXI.Graphics; // 3 条阿基米德螺旋臂（独立旋转）
  tractionGraphics: PIXI.Graphics; // 4 条牵引线（从外向内）
  particleTimer: number; // 引力粒子节流计时器
  life: number; // ms 累计
  maxLife: number;
  x: number;
  y: number;
  radius: number;
  themeColor: number;
}

/** 活跃爆发特效（三阶段：坍缩 → 爆发 → 扩散） */
interface ActiveBurst {
  container: PIXI.Container;
  coreGraphics: PIXI.Graphics; // 引力奇点核心（10 层渐变）
  horizonGraphics: PIXI.Graphics; // 视界环（双层细高亮环）
  pullGraphics: PIXI.Graphics; // 引力线（6 条向心汇聚）
  haloGraphics: PIXI.Graphics; // 扩散波纹（多层细环）
  life: number;
  maxLife: number;
  themeColor: number;
  radius: number;
  particleTimer: number; // 爆发阶段粒子节流
}

export class GravityWellRenderer {
  private fieldContainer: PIXI.Container;
  private particlePool: ParticlePool;
  private scale = 1;

  // 活跃实例池
  private activeCores: Map<string, ActiveGravityCore> = new Map();
  private activeBursts: Map<string, ActiveBurst> = new Map();

  constructor(fieldContainer: PIXI.Container, particlePool: ParticlePool) {
    this.fieldContainer = fieldContainer;
    this.particlePool = particlePool;
  }

  setScale(scale: number): void {
    this.scale = scale;
    // 容器统一承担全局缩放，内部 graphics 维持各自的动画 scale
    this.activeCores.forEach((c) => {
      if (c.container.destroyed) return;
      c.container.scale.set(scale);
    });
    this.activeBursts.forEach((b) => {
      if (b.container.destroyed) return;
      b.container.scale.set(scale);
    });
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
    themeColor = GRAVITY_MAIN,
  ): void {
    // 已存在则仅更新位置与半径
    const existing = this.activeCores.get(playerId);
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

    // 10 层渐变光环 + 双层主环 + 中心引力核
    const coreGraphics = new PIXI.Graphics();
    this.drawGravityCore(coreGraphics, radius);
    container.addChild(coreGraphics);

    // 3 条阿基米德螺旋臂（独立旋转，向心牵引感）
    const spiralGraphics = new PIXI.Graphics();
    this.drawSpiralArms(spiralGraphics, radius);
    container.addChild(spiralGraphics);

    // 4 条牵引线（从外向内的二次贝塞尔曲线）
    const tractionGraphics = new PIXI.Graphics();
    this.drawTractionLines(tractionGraphics, radius);
    container.addChild(tractionGraphics);

    this.fieldContainer.addChild(container);

    const core: ActiveGravityCore = {
      container,
      coreGraphics,
      spiralGraphics,
      tractionGraphics,
      particleTimer: 0,
      life: 0,
      maxLife: Number.POSITIVE_INFINITY, // 常驻，直到手动移除
      x,
      y,
      radius,
      themeColor,
    };
    this.activeCores.set(playerId, core);

    // 触发首帧引力粒子
    this.spawnGravityParticles(x, y, radius, GRAVITY_MAIN);
  }

  /** 移除重力核心 */
  removeGravityCore(playerId: string): void {
    const c = this.activeCores.get(playerId);
    if (c) {
      this.fieldContainer.removeChild(c.container);
      c.container.destroy({ children: true });
      this.activeCores.delete(playerId);
    }
  }

  /**
   * 绘制重力核心：10 层同心圆径向渐变（白→高亮紫→浅紫→主紫→深紫透明）
   * + 双层主环 + 中心引力核
   * 以 (0,0) 为中心绘制，半径单位为逻辑 px
   */
  private drawGravityCore(g: PIXI.Graphics, radius: number): void {
    g.clear();

    // 10 层渐变光环：中心白 → 高亮紫 → 浅紫 → 主紫 → 深紫透明
    for (let i = 0; i < 10; i++) {
      const t = i / 9; // 0 → 1
      const r = radius * (0.1 + 0.9 * t);
      // 颜色四段插值：白→高亮紫→浅紫→主紫→深紫
      let color: number;
      if (t < 0.25) {
        color = this.interpolateColor(GRAVITY_WHITE, GRAVITY_HIGHLIGHT, t / 0.25);
      } else if (t < 0.5) {
        color = this.interpolateColor(
          GRAVITY_HIGHLIGHT,
          GRAVITY_LIGHT,
          (t - 0.25) / 0.25,
        );
      } else if (t < 0.75) {
        color = this.interpolateColor(
          GRAVITY_LIGHT,
          GRAVITY_MAIN,
          (t - 0.5) / 0.25,
        );
      } else {
        color = this.interpolateColor(
          GRAVITY_MAIN,
          GRAVITY_DEEP,
          (t - 0.75) / 0.25,
        );
      }
      const alpha = (1 - t) * 0.2; // 中心高 alpha，边缘趋近 0
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }

    // 双层主环：外环高亮紫 + 内环白
    g.circle(0, 0, radius);
    g.stroke({ color: GRAVITY_HIGHLIGHT, width: 1, alpha: 0.7 });
    g.circle(0, 0, radius * 0.95);
    g.stroke({ color: GRAVITY_WHITE, width: 0.4, alpha: 0.5 });

    // 中心引力核：白色实心圆 r=4 + 浅紫外环 r=6
    g.circle(0, 0, 6);
    g.stroke({ color: GRAVITY_LIGHT, width: 1, alpha: 0.8 });
    g.circle(0, 0, 4);
    g.fill({ color: GRAVITY_WHITE, alpha: 1 });
  }

  /**
   * 绘制螺旋臂：3 条阿基米德螺旋线（120° 均分，向心旋转）
   * 阿基米德螺旋：r = a * theta，从外向内卷曲
   */
  private drawSpiralArms(g: PIXI.Graphics, radius: number): void {
    g.clear();
    const arms = 3; // 3 条螺旋臂
    const turns = 1.5; // 每条臂旋转 1.5 圈
    const steps = 24; // 每条臂的采样点数
    const a = radius / (turns * Math.PI * 2); // 螺旋系数：使最外圈半径 ≈ radius

    for (let arm = 0; arm < arms; arm++) {
      const armOffset = (arm * Math.PI * 2) / arms; // 120° 均分
      g.moveTo(
        Math.cos(armOffset + turns * Math.PI * 2) * radius,
        Math.sin(armOffset + turns * Math.PI * 2) * radius,
      );
      // 从外向内卷曲（theta 从大到小）
      for (let s = steps - 1; s >= 0; s--) {
        const theta = (s / steps) * turns * Math.PI * 2;
        const r = a * theta;
        const ang = armOffset + theta;
        g.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
      }
      g.stroke({ color: GRAVITY_LIGHT, width: 1, alpha: 0.6 });
    }
  }

  /**
   * 绘制牵引线：4 条从外向内的二次贝塞尔曲线（向心牵引感）
   * 控制点向内偏移，制造向心弯曲
   */
  private drawTractionLines(g: PIXI.Graphics, radius: number): void {
    g.clear();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2; // 90° 均分
      const startX = Math.cos(a) * radius;
      const startY = Math.sin(a) * radius;
      // 控制点：在径向中点处切向偏移（顺时针），形成向心弯曲
      const midR = radius * 0.5;
      const tangentOffset = Math.PI / 8; // 切向偏移角
      const cpX = Math.cos(a + tangentOffset) * midR;
      const cpY = Math.sin(a + tangentOffset) * midR;
      g.moveTo(startX, startY);
      g.quadraticCurveTo(cpX, cpY, 0, 0);
      g.stroke({ color: GRAVITY_HIGHLIGHT, width: 0.8, alpha: 0.7 });
    }
  }

  /**
   * 生成引力粒子（紫色，向心被吸）
   * 利用 particlePool.emit，由 update 节流调用
   */
  private spawnGravityParticles(
    x: number,
    y: number,
    radius: number,
    color: number,
  ): void {
    const s = this.scale;
    for (let i = 0; i < 2; i++) {
      const angle = Math.random() * Math.PI * 2;
      // 从外缘出发，向心被吸
      const startDist = radius * s * (0.7 + Math.random() * 0.2);
      const px = x + Math.cos(angle) * startDist;
      const py = y + Math.sin(angle) * startDist;
      // 向心速度（px/s）
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
  //  爆发特效（三阶段：坍缩 → 爆发 → 扩散）
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
    themeColor = GRAVITY_MAIN,
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

    // 1. 引力奇点核心（10 层渐变 + 白核 + 紫色边缘辉光）
    const coreGraphics = new PIXI.Graphics();
    this.drawBurstCore(coreGraphics, radius);
    container.addChild(coreGraphics);

    // 2. 视界环（双层细高亮环）
    const horizonGraphics = new PIXI.Graphics();
    this.drawBurstHorizon(horizonGraphics, radius);
    container.addChild(horizonGraphics);

    // 3. 引力线（6 条 quadraticCurveTo 从外向内汇聚）
    const pullGraphics = new PIXI.Graphics();
    this.drawBurstPulls(pullGraphics, radius);
    container.addChild(pullGraphics);

    // 4. 扩散波纹（多层细环）
    const haloGraphics = new PIXI.Graphics();
    this.drawBurstHalo(haloGraphics, radius);
    container.addChild(haloGraphics);

    this.fieldContainer.addChild(container);

    const burst: ActiveBurst = {
      container,
      coreGraphics,
      horizonGraphics,
      pullGraphics,
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
   * 绘制引力奇点核心：10 层同心圆（深紫 → 主紫 → 浅紫 → 高亮紫 → 白）
   * + 白核 + 紫色边缘辉光
   */
  private drawBurstCore(g: PIXI.Graphics, radius: number): void {
    g.clear();
    const coreR = radius * 0.6; // 奇点核心区域半径

    // 10 层同心圆叠加（深紫 → 主紫 → 浅紫 → 高亮紫 → 白）
    for (let i = 0; i < 10; i++) {
      const t = i / 9; // 0 → 1
      const r = coreR * (0.1 + 0.9 * t);
      // 颜色四段插值：深紫→主紫→浅紫→高亮紫→白
      let color: number;
      if (t < 0.25) {
        color = this.interpolateColor(GRAVITY_DEEP, GRAVITY_MAIN, t / 0.25);
      } else if (t < 0.5) {
        color = this.interpolateColor(
          GRAVITY_MAIN,
          GRAVITY_LIGHT,
          (t - 0.25) / 0.25,
        );
      } else if (t < 0.75) {
        color = this.interpolateColor(
          GRAVITY_LIGHT,
          GRAVITY_HIGHLIGHT,
          (t - 0.5) / 0.25,
        );
      } else {
        color = this.interpolateColor(
          GRAVITY_HIGHLIGHT,
          GRAVITY_WHITE,
          (t - 0.75) / 0.25,
        );
      }
      const alpha = (1 - t) * 0.25;
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }

    // 引力核 r=6（白色实心）
    g.circle(0, 0, 6);
    g.fill({ color: GRAVITY_WHITE, alpha: 1 });

    // 紫色边缘辉光
    g.circle(0, 0, 8);
    g.stroke({ color: GRAVITY_MAIN, width: 1.5, alpha: 0.8 });
  }

  /**
   * 绘制视界环：双层细高亮环
   */
  private drawBurstHorizon(g: PIXI.Graphics, radius: number): void {
    g.clear();
    g.circle(0, 0, radius);
    g.stroke({ color: GRAVITY_HIGHLIGHT, width: 0.6, alpha: 0.7 });
    g.circle(0, 0, radius * 0.95);
    g.stroke({ color: GRAVITY_WHITE, width: 0.3, alpha: 0.5 });
  }

  /**
   * 绘制引力线：6 条 quadraticCurveTo 从外向内汇聚（向心牵引感）
   */
  private drawBurstPulls(g: PIXI.Graphics, radius: number): void {
    g.clear();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const startX = Math.cos(a) * radius;
      const startY = Math.sin(a) * radius;
      // 控制点偏离直线方向，形成弧形牵引感
      const midR = radius * 0.5;
      const offset = Math.PI / 6;
      const cpX = Math.cos(a + offset) * midR;
      const cpY = Math.sin(a + offset) * midR;
      g.moveTo(startX, startY);
      g.quadraticCurveTo(cpX, cpY, 0, 0);
      g.stroke({ color: GRAVITY_LIGHT, width: 1, alpha: 0.8 });
    }
  }

  /**
   * 绘制扩散波纹：4 层细环（白 → 高亮紫 → 浅紫 → 主紫）
   */
  private drawBurstHalo(g: PIXI.Graphics, radius: number): void {
    g.clear();
    const colors = [
      GRAVITY_WHITE,
      GRAVITY_HIGHLIGHT,
      GRAVITY_LIGHT,
      GRAVITY_MAIN,
    ];
    for (let i = 0; i < colors.length; i++) {
      const r = radius * (0.8 + i * 0.1);
      g.circle(0, 0, r);
      g.stroke({ color: colors[i], width: 0.5, alpha: 0.4 });
    }
  }

  /**
   * 爆发阶段喷射粒子（从核心向外飞散的紫色引力粒子）
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
        tint: Math.random() < 0.5 ? GRAVITY_MAIN : GRAVITY_LIGHT,
        radius: (1.5 + Math.random() * 1.5) * s,
      });
    }
  }

  // ══════════════════════════════════════════════════════
  //  更新循环
  // ══════════════════════════════════════════════════════

  /** 每帧更新（由 EffectRenderer 调用，dt 单位 ms） */
  update(dt: number): void {
    // ── 重力核心：呼吸 scale + 脉动 alpha + 螺旋臂旋转 + 牵引线呼吸 + 引力粒子 ──
    this.activeCores.forEach((core) => {
      core.life += dt;
      // 呼吸 scale 1.0↔1.05（2s 周期）
      const breath = 1 + 0.05 * Math.sin(core.life * 0.001 * Math.PI);
      core.coreGraphics.scale.set(breath);
      // 脉动 alpha 0.6↔0.9
      const pulse = 0.75 + 0.15 * Math.sin(core.life * 0.001 * Math.PI);
      core.coreGraphics.alpha = pulse;
      // 螺旋臂向心旋转 0.5 转/秒
      core.spiralGraphics.rotation += dt * 0.001 * Math.PI;
      // 牵引线脉动 alpha（向心牵引感）
      core.tractionGraphics.alpha =
        0.6 + 0.3 * Math.sin(core.life * 0.002 * Math.PI);
      // 引力粒子：每 1.5s 生成 2 个（向心被吸）
      core.particleTimer += dt;
      if (core.particleTimer > 1500) {
        core.particleTimer = 0;
        this.spawnGravityParticles(core.x, core.y, core.radius, GRAVITY_MAIN);
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
      const phase1End = T * 0.15; // 坍缩阶段结束
      const phase2End = T * 0.30; // 爆发阶段结束

      if (burst.life < phase1End) {
        // 阶段1 坍缩：波纹收缩 scale 1.0→0.3，alpha 1.0→0.3，引力核显现
        const t = burst.life / phase1End;
        burst.haloGraphics.scale.set(1.0 - 0.7 * t);
        burst.haloGraphics.alpha = 1.0 - 0.7 * t;
        burst.coreGraphics.alpha = t; // 0 → 1 显现
        burst.pullGraphics.alpha = 0;
        burst.horizonGraphics.alpha = 0;
        burst.horizonGraphics.scale.set(0.3);
      } else if (burst.life < phase2End) {
        // 阶段2 爆发：奇点爆发 scale 0.3→1.0(easeOutCubic)，引力线闪现 alpha 0→0.8，视界环展开
        const t = (burst.life - phase1End) / (phase2End - phase1End);
        const eased = this.easeOutCubic(t);
        burst.haloGraphics.scale.set(0.3 + 0.7 * eased);
        burst.haloGraphics.alpha = 0.3 + 0.4 * t; // 0.3 → 0.7
        burst.coreGraphics.alpha = 1.0;
        burst.pullGraphics.alpha = 0.8 * t; // 0 → 0.8
        burst.horizonGraphics.scale.set(0.3 + 0.7 * eased);
        burst.horizonGraphics.alpha = t; // 0 → 1
        // 爆发阶段喷射粒子（每 80ms）
        burst.particleTimer += dt;
        if (burst.particleTimer > 80) {
          burst.particleTimer = 0;
          this.spawnBurstParticles(burst);
        }
      } else {
        // 阶段3 扩散：视界环扩散 scale 1.0→2.0 alpha 1.0→0，扩散波纹消散 alpha 0.7→0（sin 波动），
        //            引力线消散 alpha 0.8→0，引力核保持但透明 alpha 1.0→0.3
        const t = (burst.life - phase2End) / (T - phase2End);
        burst.horizonGraphics.scale.set(1.0 + 1.0 * t);
        burst.horizonGraphics.alpha = 1.0 - t;
        burst.haloGraphics.alpha = 0.7 * (1.0 - t);
        burst.haloGraphics.rotation = Math.sin(t * Math.PI * 4) * 0.5;
        burst.pullGraphics.alpha = 0.8 * (1.0 - t);
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
    this.activeCores.forEach((_, playerId) => this.removeGravityCore(playerId));
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
