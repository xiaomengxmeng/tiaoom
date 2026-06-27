/**
 * 纳米撕裂者 (Nano Ripper) - 侵略者流派
 * 前端视觉渲染器
 *
 * 视觉设计（侵略者红橙色系 —— 高频低伤害的纳米级撕裂）：
 * - 撕裂场 RipperField：8 层径向渐变光环（白→高亮橙→浅橙红→主红→深红透明）
 *   + 双层主环（外环高亮橙 + 内环白）+ 中心撕裂核（白实心 + 浅橙红外晕）
 *   + 撕裂粒子（红色，向外飞散）+ 缓慢旋转（撕裂痕迹感）
 * - 爆发 Burst：三阶段动画
 *   · 蓄能（0-15%T）：撕裂场收缩，能量向中心汇聚
 *   · 撕裂（15%-30%T）：奇点爆发（10 层渐变核心）+ 6 条撕裂线闪现 + 视界环展开
 *   · 余波（30%-100%T）：撕裂痕迹扩散消散，红色粒子飞散
 *
 * API：triggerRipperField / removeRipperField / triggerBurst / update / setScale / clear / destroy
 * 所有动画由 update(dt) 驱动，不使用 rAF / setTimeout。
 */

import * as PIXI from 'pixi.js';
import { ParticlePool } from '../systems/ParticlePool';

// ══════════════════════════════════════════════════════
//  颜色常量（侵略者红）
// ══════════════════════════════════════════════════════

const NANO_DEEP = 0x4a0a0a; // 深红（渐变末端）
const NANO_MAIN = 0xcc2200; // 主红
const NANO_LIGHT = 0xff6633; // 浅橙红
const NANO_HIGHLIGHT = 0xffaa66; // 高亮橙
const NANO_WHITE = 0xffffff; // 白色

// ══════════════════════════════════════════════════════
//  数据结构
// ══════════════════════════════════════════════════════

/** 活跃撕裂场实例（常驻，移动时留下撕裂痕迹） */
interface ActiveRipperField {
  container: PIXI.Container;
  fieldGraphics: PIXI.Graphics; // 8 层渐变光环 + 双层主环 + 中心撕裂核
  particleTimer: number; // 粒子节流计时器
  life: number; // ms 累计
  maxLife: number;
  x: number;
  y: number;
  radius: number;
  themeColor: number;
}

/** 活跃爆发特效（三阶段：蓄能 → 撕裂 → 余波） */
interface ActiveBurst {
  container: PIXI.Container;
  coreGraphics: PIXI.Graphics; // 撕裂奇点核心（10 层渐变）
  horizonGraphics: PIXI.Graphics; // 视界环（双层细高亮环）
  tearGraphics: PIXI.Graphics; // 撕裂线（6 条向心汇聚）
  haloGraphics: PIXI.Graphics; // 余波光晕（多层细环）
  life: number;
  maxLife: number;
  themeColor: number;
  radius: number;
  particleTimer: number; // 撕裂阶段粒子节流
}

export class NanoRipperRenderer {
  private fieldContainer: PIXI.Container;
  private particlePool: ParticlePool;
  private scale = 1;

  // 活跃实例池
  private activeFields: Map<string, ActiveRipperField> = new Map();
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
  //  撕裂场 RipperField（常驻，移动时留下撕裂痕迹）
  // ══════════════════════════════════════════════════════

  /**
   * 触发撕裂场视觉效果
   * @param playerId 玩家 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param radius 撕裂场半径（逻辑 px）
   * @param themeColor 主题色（默认主红）
   */
  triggerRipperField(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor = NANO_MAIN,
  ): void {
    // 已存在则仅更新位置与半径（移动时跟随）
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

    // 8 层渐变光环 + 双层主环 + 中心撕裂核
    const fieldGraphics = new PIXI.Graphics();
    this.drawRipperField(fieldGraphics, radius);
    container.addChild(fieldGraphics);

    this.fieldContainer.addChild(container);

    const field: ActiveRipperField = {
      container,
      fieldGraphics,
      particleTimer: 0,
      life: 0,
      maxLife: Number.POSITIVE_INFINITY, // 常驻，直到手动移除
      x,
      y,
      radius,
      themeColor,
    };
    this.activeFields.set(playerId, field);

    // 触发首帧撕裂粒子
    this.spawnTearParticles(x, y, radius, NANO_MAIN);
  }

  /** 移除撕裂场 */
  removeRipperField(playerId: string): void {
    const f = this.activeFields.get(playerId);
    if (f) {
      this.fieldContainer.removeChild(f.container);
      f.container.destroy({ children: true });
      this.activeFields.delete(playerId);
    }
  }

  /**
   * 绘制撕裂场：8 层同心圆径向渐变（白→高亮橙→浅橙红→主红→深红透明）
   * + 双层主环 + 中心撕裂核
   * 以 (0,0) 为中心绘制，半径单位为逻辑 px
   */
  private drawRipperField(g: PIXI.Graphics, radius: number): void {
    g.clear();

    // 8 层渐变光环：中心白 → 高亮橙 → 浅橙红 → 主红 → 深红透明
    for (let i = 0; i < 8; i++) {
      const t = i / 7; // 0 → 1
      const r = radius * (0.15 + 0.85 * t);
      // 颜色四段插值：白→高亮橙→浅橙红→主红→深红
      let color: number;
      if (t < 0.25) {
        color = this.interpolateColor(NANO_WHITE, NANO_HIGHLIGHT, t / 0.25);
      } else if (t < 0.5) {
        color = this.interpolateColor(
          NANO_HIGHLIGHT,
          NANO_LIGHT,
          (t - 0.25) / 0.25,
        );
      } else if (t < 0.75) {
        color = this.interpolateColor(NANO_LIGHT, NANO_MAIN, (t - 0.5) / 0.25);
      } else {
        color = this.interpolateColor(NANO_MAIN, NANO_DEEP, (t - 0.75) / 0.25);
      }
      const alpha = (1 - t) * 0.22; // 中心高 alpha，边缘趋近 0
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }

    // 双层主环：外环高亮橙 + 内环白
    g.circle(0, 0, radius);
    g.stroke({ color: NANO_HIGHLIGHT, width: 1, alpha: 0.7 });
    g.circle(0, 0, radius * 0.95);
    g.stroke({ color: NANO_WHITE, width: 0.4, alpha: 0.5 });

    // 中心撕裂核：白色实心圆 r=4 + 浅橙红外环 r=6
    g.circle(0, 0, 6);
    g.stroke({ color: NANO_LIGHT, width: 1, alpha: 0.8 });
    g.circle(0, 0, 4);
    g.fill({ color: NANO_WHITE, alpha: 1 });
  }

  /**
   * 生成撕裂粒子（红色，向外飞散）
   * 利用 particlePool.emit，由 update 节流调用
   */
  private spawnTearParticles(
    x: number,
    y: number,
    radius: number,
    color: number,
  ): void {
    const s = this.scale;
    for (let i = 0; i < 2; i++) {
      const angle = Math.random() * Math.PI * 2;
      // 从撕裂核附近出发
      const startDist = radius * s * (0.2 + Math.random() * 0.2);
      const px = x + Math.cos(angle) * startDist;
      const py = y + Math.sin(angle) * startDist;
      // 向外飞散速度（px/s）
      const speed = (20 + Math.random() * 15) * s;
      this.particlePool.emit({
        x: px,
        y: py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
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
  //  爆发特效（三阶段：蓄能 → 撕裂 → 余波）
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
    themeColor = NANO_MAIN,
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

    // 1. 撕裂奇点核心（10 层渐变 + 白核 + 红色边缘辉光）
    const coreGraphics = new PIXI.Graphics();
    this.drawBurstCore(coreGraphics, radius);
    container.addChild(coreGraphics);

    // 2. 视界环（双层细高亮环）
    const horizonGraphics = new PIXI.Graphics();
    this.drawBurstHorizon(horizonGraphics, radius);
    container.addChild(horizonGraphics);

    // 3. 撕裂线（6 条 quadraticCurveTo 从外向内汇聚）
    const tearGraphics = new PIXI.Graphics();
    this.drawBurstTears(tearGraphics, radius);
    container.addChild(tearGraphics);

    // 4. 余波光晕（多层细环）
    const haloGraphics = new PIXI.Graphics();
    this.drawBurstHalo(haloGraphics, radius);
    container.addChild(haloGraphics);

    this.fieldContainer.addChild(container);

    const burst: ActiveBurst = {
      container,
      coreGraphics,
      horizonGraphics,
      tearGraphics,
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
   * 绘制撕裂奇点核心：10 层同心圆（深红 → 主红 → 浅橙红 → 高亮橙 → 白）
   * + 白核 + 红色边缘辉光
   */
  private drawBurstCore(g: PIXI.Graphics, radius: number): void {
    g.clear();
    const coreR = radius * 0.6; // 奇点核心区域半径

    // 10 层同心圆叠加（深红 → 主红 → 浅橙红 → 高亮橙 → 白）
    for (let i = 0; i < 10; i++) {
      const t = i / 9; // 0 → 1
      const r = coreR * (0.1 + 0.9 * t);
      // 颜色四段插值：深红→主红→浅橙红→高亮橙→白
      let color: number;
      if (t < 0.25) {
        color = this.interpolateColor(NANO_DEEP, NANO_MAIN, t / 0.25);
      } else if (t < 0.5) {
        color = this.interpolateColor(NANO_MAIN, NANO_LIGHT, (t - 0.25) / 0.25);
      } else if (t < 0.75) {
        color = this.interpolateColor(
          NANO_LIGHT,
          NANO_HIGHLIGHT,
          (t - 0.5) / 0.25,
        );
      } else {
        color = this.interpolateColor(
          NANO_HIGHLIGHT,
          NANO_WHITE,
          (t - 0.75) / 0.25,
        );
      }
      const alpha = (1 - t) * 0.25;
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }

    // 撕裂核 r=6（白色实心）
    g.circle(0, 0, 6);
    g.fill({ color: NANO_WHITE, alpha: 1 });

    // 红色边缘辉光
    g.circle(0, 0, 8);
    g.stroke({ color: NANO_MAIN, width: 1.5, alpha: 0.8 });
  }

  /**
   * 绘制视界环：双层细高亮环
   */
  private drawBurstHorizon(g: PIXI.Graphics, radius: number): void {
    g.clear();
    g.circle(0, 0, radius);
    g.stroke({ color: NANO_HIGHLIGHT, width: 0.6, alpha: 0.7 });
    g.circle(0, 0, radius * 0.95);
    g.stroke({ color: NANO_WHITE, width: 0.3, alpha: 0.5 });
  }

  /**
   * 绘制撕裂线：6 条 quadraticCurveTo 从外向内汇聚（锯齿状撕裂感）
   */
  private drawBurstTears(g: PIXI.Graphics, radius: number): void {
    g.clear();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const startX = Math.cos(a) * radius;
      const startY = Math.sin(a) * radius;
      // 控制点偏离直线方向，形成弧形撕裂感
      const midR = radius * 0.5;
      const offset = Math.PI / 6;
      const cpX = Math.cos(a + offset) * midR;
      const cpY = Math.sin(a + offset) * midR;
      g.moveTo(startX, startY);
      g.quadraticCurveTo(cpX, cpY, 0, 0);
      g.stroke({ color: NANO_LIGHT, width: 1, alpha: 0.8 });
    }
  }

  /**
   * 绘制余波光晕：4 层细环（白 → 高亮橙 → 浅橙红 → 主红）
   */
  private drawBurstHalo(g: PIXI.Graphics, radius: number): void {
    g.clear();
    const colors = [NANO_WHITE, NANO_HIGHLIGHT, NANO_LIGHT, NANO_MAIN];
    for (let i = 0; i < colors.length; i++) {
      const r = radius * (0.8 + i * 0.1);
      g.circle(0, 0, r);
      g.stroke({ color: colors[i], width: 0.5, alpha: 0.4 });
    }
  }

  /**
   * 撕裂阶段喷射粒子（从核心向外飞散的红色撕裂粒子）
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
        tint: Math.random() < 0.5 ? NANO_MAIN : NANO_LIGHT,
        radius: (1.5 + Math.random() * 1.5) * s,
      });
    }
  }

  // ══════════════════════════════════════════════════════
  //  更新循环
  // ══════════════════════════════════════════════════════

  /** 每帧更新（由 EffectRenderer 调用，dt 单位 ms） */
  update(dt: number): void {
    // ── 撕裂场：呼吸 scale + 脉动 alpha + 缓慢旋转 + 撕裂粒子 ──
    this.activeFields.forEach((field) => {
      field.life += dt;
      // 呼吸 scale 1.0↔1.05（2s 周期）
      const breath = 1 + 0.05 * Math.sin(field.life * 0.001 * Math.PI);
      field.fieldGraphics.scale.set(breath);
      // 脉动 alpha 0.6↔0.9
      const pulse = 0.75 + 0.15 * Math.sin(field.life * 0.001 * Math.PI);
      field.fieldGraphics.alpha = pulse;
      // 撕裂场缓慢旋转（撕裂痕迹感，0.25 转/秒）
      field.fieldGraphics.rotation += dt * 0.0005 * Math.PI;
      // 撕裂粒子：每 1.2s 生成 2 个
      field.particleTimer += dt;
      if (field.particleTimer > 1200) {
        field.particleTimer = 0;
        this.spawnTearParticles(field.x, field.y, field.radius, NANO_MAIN);
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
      const phase2End = T * 0.30; // 撕裂阶段结束

      if (burst.life < phase1End) {
        // 阶段1 蓄能：光环收缩 scale 1.0→0.3，alpha 1.0→0.3，撕裂核显现
        const t = burst.life / phase1End;
        burst.haloGraphics.scale.set(1.0 - 0.7 * t);
        burst.haloGraphics.alpha = 1.0 - 0.7 * t;
        burst.coreGraphics.alpha = t; // 0 → 1 显现
        burst.tearGraphics.alpha = 0;
        burst.horizonGraphics.alpha = 0;
        burst.horizonGraphics.scale.set(0.3);
      } else if (burst.life < phase2End) {
        // 阶段2 撕裂：奇点爆发 scale 0.3→1.0(easeOutCubic)，撕裂线闪现 alpha 0→0.8，视界环展开
        const t = (burst.life - phase1End) / (phase2End - phase1End);
        const eased = this.easeOutCubic(t);
        burst.haloGraphics.scale.set(0.3 + 0.7 * eased);
        burst.haloGraphics.alpha = 0.3 + 0.4 * t; // 0.3 → 0.7
        burst.coreGraphics.alpha = 1.0;
        burst.tearGraphics.alpha = 0.8 * t; // 0 → 0.8
        burst.horizonGraphics.scale.set(0.3 + 0.7 * eased);
        burst.horizonGraphics.alpha = t; // 0 → 1
        // 撕裂阶段喷射粒子（每 80ms）
        burst.particleTimer += dt;
        if (burst.particleTimer > 80) {
          burst.particleTimer = 0;
          this.spawnBurstParticles(burst);
        }
      } else {
        // 阶段3 余波：视界环扩散 scale 1.0→2.0 alpha 1.0→0，余波光晕消散 alpha 0.7→0（sin 波动），
        //            撕裂线消散 alpha 0.8→0，撕裂核保持但透明 alpha 1.0→0.3
        const t = (burst.life - phase2End) / (T - phase2End);
        burst.horizonGraphics.scale.set(1.0 + 1.0 * t);
        burst.horizonGraphics.alpha = 1.0 - t;
        burst.haloGraphics.alpha = 0.7 * (1.0 - t);
        burst.haloGraphics.rotation = Math.sin(t * Math.PI * 4) * 0.5;
        burst.tearGraphics.alpha = 0.8 * (1.0 - t);
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
    this.activeFields.forEach((_, playerId) => this.removeRipperField(playerId));
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
