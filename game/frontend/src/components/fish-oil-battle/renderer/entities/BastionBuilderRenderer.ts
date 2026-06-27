/**
 * 堡垒构筑者 (Bastion Builder) - 工程师流派
 * 前端视觉渲染器
 *
 * 视觉设计（工程师黄 + 多层防御堡垒）：
 * - 堡垒护盾 Bastion：堡垒核心（8 层径向渐变）+ 六角护盾（多层叠加）+ 防御粒子
 * - 爆发 Burst：构筑核心（8 层渐变）+ 六角护盾展开 + 防御环 + 三阶段动画（构筑→激活→消散）
 */

import * as PIXI from 'pixi.js';
import { ParticlePool } from '../systems/ParticlePool';

// ══════════════════════════════════════════════════════
//  颜色常量（工程师黄）
// ══════════════════════════════════════════════════════

const BASTION_DEEP = 0x3a3a0a; // 深褐黄（渐变外缘）
const BASTION_MAIN = 0xccaa00; // 主黄（堡垒主色）
const BASTION_LIGHT = 0xffdd33; // 浅金黄（中层渐变）
const BASTION_HIGHLIGHT = 0xffee88; // 高亮浅黄（内层渐变）
const BASTION_WHITE = 0xffffff; // 白色（核心高亮）

// ══════════════════════════════════════════════════════
//  数据结构
// ══════════════════════════════════════════════════════

/** 活跃堡垒护盾实例（常驻防御场） */
interface ActiveBastion {
  container: PIXI.Container;
  coreGraphics: PIXI.Graphics; // 堡垒核心（8 层径向渐变）
  shieldGraphics: PIXI.Graphics; // 六角护盾（多层叠加，独立旋转）
  particleTimer: number;
  life: number; // ms 累计
  maxLife: number;
  x: number;
  y: number;
  radius: number;
}

/** 活跃爆发特效（构筑→激活→消散 三阶段） */
interface ActiveBurst {
  container: PIXI.Container;
  coreGraphics: PIXI.Graphics; // 构筑核心（8 层渐变）
  shieldGraphics: PIXI.Graphics; // 六角护盾展开
  ringGraphics: PIXI.Graphics; // 防御环
  life: number;
  maxLife: number;
  themeColor: number;
  radius: number;
}

export class BastionBuilderRenderer {
  private fieldContainer: PIXI.Container;
  private particlePool: ParticlePool;
  private scale = 1;

  // 活跃实例池
  private activeBastions: Map<string, ActiveBastion> = new Map();
  private activeBursts: Map<string, ActiveBurst> = new Map();

  constructor(fieldContainer: PIXI.Container, particlePool: ParticlePool) {
    this.fieldContainer = fieldContainer;
    this.particlePool = particlePool;
  }

  setScale(scale: number): void {
    this.scale = scale;
    // 容器统一承担全局缩放，内部 graphics 维持各自的动画 scale
    this.activeBastions.forEach((b) => {
      if (b.container.destroyed) return;
      b.container.scale.set(scale);
    });
    this.activeBursts.forEach((b) => {
      if (b.container.destroyed) return;
      b.container.scale.set(scale);
    });
  }

  // ══════════════════════════════════════════════════════
  //  堡垒护盾 Bastion（常驻防御场）
  // ══════════════════════════════════════════════════════

  /**
   * 触发堡垒护盾视觉效果
   * @param playerId 玩家 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param radius 堡垒半径（逻辑 px）
   * @param themeColor 主题色（默认工程师黄）
   */
  triggerBastion(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor = BASTION_MAIN,
  ): void {
    // 已存在则仅更新位置与半径
    const existing = this.activeBastions.get(playerId);
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

    // 堡垒核心（8 层径向渐变 + 主环 + 中心核）
    const coreGraphics = new PIXI.Graphics();
    this.drawBastionCore(coreGraphics, radius);
    container.addChild(coreGraphics);

    // 六角护盾（多层叠加，独立旋转）
    const shieldGraphics = new PIXI.Graphics();
    this.drawHexShield(shieldGraphics, radius);
    container.addChild(shieldGraphics);

    this.fieldContainer.addChild(container);

    const bastion: ActiveBastion = {
      container,
      coreGraphics,
      shieldGraphics,
      particleTimer: 0,
      life: 0,
      maxLife: Number.POSITIVE_INFINITY, // 常驻，直到手动移除
      x,
      y,
      radius,
    };
    this.activeBastions.set(playerId, bastion);

    // 触发首帧防御粒子
    this.spawnDefenseParticles(x, y, radius, BASTION_LIGHT);
    // 避免未使用警告
    void themeColor;
  }

  /** 移除堡垒护盾 */
  removeBastion(playerId: string): void {
    const bastion = this.activeBastions.get(playerId);
    if (bastion) {
      this.fieldContainer.removeChild(bastion.container);
      bastion.container.destroy({ children: true });
      this.activeBastions.delete(playerId);
    }
  }

  /**
   * 绘制堡垒核心：8 层同心圆径向渐变（白→高亮→浅黄→主黄→深褐黄）+ 主环 + 中心核
   * 以 (0,0) 为中心绘制
   */
  private drawBastionCore(g: PIXI.Graphics, radius: number): void {
    g.clear();

    // 8 层同心圆叠加模拟径向渐变（中心白 → 高亮 → 浅黄 → 主黄 → 深褐黄外缘）
    for (let i = 0; i < 8; i++) {
      const t = i / 7; // 0 → 1
      const r = radius * (0.15 + 0.85 * t);
      // 颜色分段：白 → 高亮 → 浅黄 → 主黄 → 深褐黄
      let color: number;
      if (t < 0.25) {
        color = this.interpolateColor(BASTION_WHITE, BASTION_HIGHLIGHT, t / 0.25);
      } else if (t < 0.5) {
        color = this.interpolateColor(
          BASTION_HIGHLIGHT,
          BASTION_LIGHT,
          (t - 0.25) / 0.25,
        );
      } else if (t < 0.75) {
        color = this.interpolateColor(
          BASTION_LIGHT,
          BASTION_MAIN,
          (t - 0.5) / 0.25,
        );
      } else {
        color = this.interpolateColor(
          BASTION_MAIN,
          BASTION_DEEP,
          (t - 0.75) / 0.25,
        );
      }
      const alpha = (1 - t) * 0.22;
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }

    // 堡垒主环：外环深褐黄描边 + 浅黄主环 + 内环高亮
    g.circle(0, 0, radius);
    g.stroke({ color: BASTION_DEEP, width: 1.5, alpha: 0.6 });
    g.circle(0, 0, radius * 0.97);
    g.stroke({ color: BASTION_LIGHT, width: 1, alpha: 0.7 });
    g.circle(0, 0, radius * 0.93);
    g.stroke({ color: BASTION_HIGHLIGHT, width: 0.4, alpha: 0.5 });

    // 中心核：白色实心圆 r=4 + 主黄外环 r=6
    g.circle(0, 0, 6);
    g.stroke({ color: BASTION_MAIN, width: 1, alpha: 0.8 });
    g.circle(0, 0, 4);
    g.fill({ color: BASTION_WHITE, alpha: 1 });
  }

  /**
   * 绘制六角护盾：3 层六边形叠加（由外到内，独立旋转）
   * 由 shieldGraphics 独立承担旋转动画
   */
  private drawHexShield(g: PIXI.Graphics, radius: number): void {
    g.clear();
    // 3 层六边形叠加：外层主黄 → 中层浅黄 → 内层高亮
    const layers = [
      { r: radius * 1.0, color: BASTION_MAIN, alpha: 0.4, width: 2 },
      { r: radius * 0.85, color: BASTION_LIGHT, alpha: 0.5, width: 1.5 },
      { r: radius * 0.7, color: BASTION_HIGHLIGHT, alpha: 0.6, width: 1 },
    ];
    for (const layer of layers) {
      const pts: [number, number][] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 - Math.PI / 6; // 顶点朝上
        pts.push([Math.cos(a) * layer.r, Math.sin(a) * layer.r]);
      }
      g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < 6; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.closePath();
      g.stroke({ color: layer.color, width: layer.width, alpha: layer.alpha });
    }
  }

  /**
   * 生成防御粒子（沿六角护盾边缘环绕飘散）
   * 利用 particlePool.emit，每帧由 update 节流调用
   */
  private spawnDefenseParticles(
    x: number,
    y: number,
    radius: number,
    color: number,
  ): void {
    const s = this.scale;
    for (let i = 0; i < 2; i++) {
      const angle = Math.random() * Math.PI * 2;
      // 从护盾边缘附近出发
      const startDist = radius * s * (0.7 + Math.random() * 0.3);
      const px = x + Math.cos(angle) * startDist;
      const py = y + Math.sin(angle) * startDist;
      // 向内汇聚速度（px/s），表现防御场吸入感
      const speed = (15 + Math.random() * 10) * s;
      this.particlePool.emit({
        x: px,
        y: py,
        vx: -Math.cos(angle) * speed,
        vy: -Math.sin(angle) * speed,
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
  //  爆发特效（构筑→激活→消散 三阶段动画）
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
    themeColor = BASTION_MAIN,
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

    // 1. 构筑核心（8 层径向渐变 + 中心核）
    const coreGraphics = new PIXI.Graphics();
    this.drawBurstCore(coreGraphics, radius);
    container.addChild(coreGraphics);

    // 2. 六角护盾展开（多层叠加）
    const shieldGraphics = new PIXI.Graphics();
    this.drawHexShield(shieldGraphics, radius * 0.8);
    container.addChild(shieldGraphics);

    // 3. 防御环（双层细高亮环）
    const ringGraphics = new PIXI.Graphics();
    this.drawBurstRing(ringGraphics, radius);
    container.addChild(ringGraphics);

    this.fieldContainer.addChild(container);

    const burst: ActiveBurst = {
      container,
      coreGraphics,
      shieldGraphics,
      ringGraphics,
      life: 0,
      maxLife: durationMs ?? 5000,
      themeColor,
      radius,
    };
    this.activeBursts.set(playerId, burst);
  }

  /**
   * 绘制构筑核心：8 层同心圆（白→高亮→浅黄→主黄→透明）+ 中心核
   */
  private drawBurstCore(g: PIXI.Graphics, radius: number): void {
    g.clear();
    const coreR = radius * 0.6; // 核心区域半径

    // 8 层同心圆叠加
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const r = coreR * (0.1 + 0.9 * t);
      let color: number;
      if (t < 0.33) {
        color = this.interpolateColor(BASTION_WHITE, BASTION_HIGHLIGHT, t / 0.33);
      } else if (t < 0.66) {
        color = this.interpolateColor(
          BASTION_HIGHLIGHT,
          BASTION_LIGHT,
          (t - 0.33) / 0.33,
        );
      } else {
        color = this.interpolateColor(
          BASTION_LIGHT,
          BASTION_MAIN,
          (t - 0.66) / 0.34,
        );
      }
      const alpha = (1 - t) * 0.28;
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }

    // 中心核 r=6
    g.circle(0, 0, 6);
    g.fill({ color: BASTION_WHITE, alpha: 1 });

    // 主黄边缘辉光
    g.circle(0, 0, 8);
    g.stroke({ color: BASTION_MAIN, width: 1.5, alpha: 0.8 });
  }

  /**
   * 绘制防御环：双层细高亮环
   */
  private drawBurstRing(g: PIXI.Graphics, radius: number): void {
    g.clear();
    g.circle(0, 0, radius);
    g.stroke({ color: BASTION_LIGHT, width: 0.6, alpha: 0.7 });
    g.circle(0, 0, radius * 0.95);
    g.stroke({ color: BASTION_HIGHLIGHT, width: 0.3, alpha: 0.5 });
  }

  // ══════════════════════════════════════════════════════
  //  更新循环
  // ══════════════════════════════════════════════════════

  /** 每帧更新（由 EffectRenderer 调用，dt 单位 ms） */
  update(dt: number): void {
    // ── 堡垒护盾：核心呼吸 + 护盾旋转 + 防御粒子 ──
    this.activeBastions.forEach((bastion) => {
      bastion.life += dt;
      // 核心呼吸 scale 1.0↔1.05（2s 周期）
      const breath = 1 + 0.05 * Math.sin(bastion.life * 0.001 * Math.PI);
      bastion.coreGraphics.scale.set(breath);
      // 核心脉动 alpha 0.7↔0.95
      const pulse = 0.8 + 0.15 * Math.sin(bastion.life * 0.001 * Math.PI);
      bastion.coreGraphics.alpha = pulse;
      // 六角护盾缓慢旋转 0.3 转/秒
      bastion.shieldGraphics.rotation += dt * 0.0006 * Math.PI;
      // 护盾呼吸 alpha 0.7↔1.0（反相，与核心错峰）
      bastion.shieldGraphics.alpha =
        0.85 + 0.15 * Math.sin(bastion.life * 0.001 * Math.PI + Math.PI / 2);
      // 防御粒子：每 1.5s 生成 2 个
      bastion.particleTimer += dt;
      if (bastion.particleTimer > 1500) {
        bastion.particleTimer = 0;
        this.spawnDefenseParticles(
          bastion.x,
          bastion.y,
          bastion.radius,
          BASTION_LIGHT,
        );
      }
    });

    // ── 爆发：三阶段动画（构筑→激活→消散） ──
    this.activeBursts.forEach((burst, playerId) => {
      burst.life += dt;
      const T = burst.maxLife;
      if (burst.life >= T) {
        this.removeBurst(playerId);
        return;
      }
      const phase1End = T * 0.2; // 构筑阶段
      const phase2End = T * 0.4; // 激活阶段

      if (burst.life < phase1End) {
        // 阶段1 构筑：护盾从 0.3 收缩组装到 1.0，核心显现，环未展开
        const t = burst.life / phase1End;
        burst.shieldGraphics.scale.set(0.3 + 0.7 * this.easeOutCubic(t));
        burst.shieldGraphics.alpha = t; // 0 → 1 显现
        burst.coreGraphics.alpha = t;
        burst.coreGraphics.scale.set(0.5 + 0.5 * t);
        burst.ringGraphics.alpha = 0;
        burst.ringGraphics.scale.set(0.3);
      } else if (burst.life < phase2End) {
        // 阶段2 激活：环展开 scale 0.3→1.0(easeOutCubic)，护盾脉冲变亮，核心全亮
        const t = (burst.life - phase1End) / (phase2End - phase1End);
        const eased = this.easeOutCubic(t);
        burst.ringGraphics.scale.set(0.3 + 0.7 * eased);
        burst.ringGraphics.alpha = t; // 0 → 1
        // 护盾脉冲：scale 1.0↔1.1 高频闪烁
        burst.shieldGraphics.scale.set(
          1.0 + 0.1 * Math.sin(t * Math.PI * 6),
        );
        burst.shieldGraphics.alpha = 1.0;
        burst.coreGraphics.alpha = 1.0;
        burst.coreGraphics.scale.set(1.0 + 0.05 * Math.sin(t * Math.PI * 6));
      } else {
        // 阶段3 消散：环扩散 scale 1.0→2.0 alpha 1.0→0，护盾消散，核心保持透明渐隐
        const t = (burst.life - phase2End) / (T - phase2End);
        burst.ringGraphics.scale.set(1.0 + 1.0 * t);
        burst.ringGraphics.alpha = 1.0 - t;
        burst.shieldGraphics.alpha = 1.0 - t;
        burst.shieldGraphics.rotation += dt * 0.002 * Math.PI;
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
    this.activeBastions.forEach((_, playerId) => this.removeBastion(playerId));
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
