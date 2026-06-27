/**
 * KE 流体操控 (Fluid Mastery) - 鱼油大战
 * 前端视觉渲染器
 *
 * 视觉设计（水系三态：水流尾迹 + 漩涡牵引 + 水龙卷爆发）：
 * - 水流尾迹 Trail：水流光环（8 层径向渐变）+ 流动波纹（3 条扩散环）+ 水滴粒子 + 流向箭头
 * - 漩涡牵引 Vortex：漩涡核心（6 层）+ 阿基米德螺旋臂（3 条）+ 牵引曲线（4 条）
 * - 爆发 Burst：水龙卷主体（10 层）+ 螺旋水臂（4 条）+ 中心水柱 + 水花粒子（三阶段动画）
 */

import * as PIXI from 'pixi.js';
import { ParticlePool } from '../systems/ParticlePool';

// ══════════════════════════════════════════════════════
//  颜色常量（水系）
// ══════════════════════════════════════════════════════

const FLUID_DEEP = 0x0044aa; // 深海蓝
const FLUID_MAIN = 0x0099ff; // 主水蓝
const FLUID_LIGHT = 0x66ccff; // 浅水蓝
const FLUID_HIGHLIGHT = 0xaaeeff; // 高亮浅蓝
const FLUID_WHITE = 0xffffff; // 浪花白
const FLUID_FOAM = 0xe0f4ff; // 泡沫白蓝

// 流动波纹周期（单条波纹从生成到消失的时长，ms）
const TRAIL_RIPPLE_MAX_LIFE = 1500;

// ══════════════════════════════════════════════════════
//  数据结构
// ══════════════════════════════════════════════════════

/** 活跃水流尾迹实例（光环 + 流动波纹 + 水滴 + 流向箭头） */
interface ActiveTrail {
  container: PIXI.Container;
  rippleGraphics: PIXI.Graphics; // 流动波纹（3 条扩散环）
  auraGraphics: PIXI.Graphics; // 水流尾迹光环
  arrowGraphics: PIXI.Graphics; // 流向箭头
  particleTimer: number;
  rippleLife: number[]; // 3 条波纹各自的 life（ms）
  rippleMaxLife: number;
  life: number;
  maxLife: number;
  x: number;
  y: number;
  radius: number;
  flowDir: number;
}

/** 活跃漩涡牵引实例（核心 + 螺旋臂 + 牵引线） */
interface ActiveVortex {
  container: PIXI.Container;
  coreGraphics: PIXI.Graphics; // 漩涡核心（6 层同心圆）
  armGraphics: PIXI.Graphics; // 3 条阿基米德螺旋臂
  pullGraphics: PIXI.Graphics; // 4 条牵引曲线
  life: number;
  maxLife: number;
  x: number;
  y: number;
  radius: number;
  pullForce: number;
  themeColor: number;
}

/** 活跃水龙卷爆发实例（三阶段动画） */
interface ActiveBurst {
  container: PIXI.Container;
  columnGraphics: PIXI.Graphics; // 水龙卷主体（10 层同心圆）
  armGraphics: PIXI.Graphics; // 4 条螺旋水臂
  coreGraphics: PIXI.Graphics; // 中心水柱白色高亮
  splashGraphics: PIXI.Graphics; // 水花范围环
  particleTimer: number;
  life: number;
  maxLife: number;
  themeColor: number;
  radius: number;
  x: number;
  y: number;
}

export class FluidMasteryRenderer {
  private fieldContainer: PIXI.Container;
  private particlePool: ParticlePool;
  private scale = 1;

  // 活跃实例池
  private activeTrails: Map<string, ActiveTrail> = new Map();
  private activeVortices: Map<string, ActiveVortex> = new Map();
  private activeBursts: Map<string, ActiveBurst> = new Map();

  constructor(fieldContainer: PIXI.Container, particlePool: ParticlePool) {
    this.fieldContainer = fieldContainer;
    this.particlePool = particlePool;
  }

  setScale(scale: number): void {
    this.scale = scale;
    // 容器统一承担全局缩放，内部 graphics 维持各自的动画 scale
    this.activeTrails.forEach((trail) => {
      if (trail.container.destroyed) return;
      trail.container.scale.set(scale);
    });
    this.activeVortices.forEach((vortex) => {
      if (vortex.container.destroyed) return;
      vortex.container.scale.set(scale);
    });
    this.activeBursts.forEach((burst) => {
      if (burst.container.destroyed) return;
      burst.container.scale.set(scale);
    });
  }

  // ══════════════════════════════════════════════════════
  //  水流尾迹 Trail（水系普通技能）
  // ══════════════════════════════════════════════════════

  /**
   * 触发水流尾迹视觉效果
   * @param playerId 玩家 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param radius 尾迹光环半径（逻辑 px）
   * @param flowDir 流向角度（弧度）
   * @param themeColor 主题色（默认主水蓝）
   */
  triggerTrail(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    flowDir: number,
    themeColor = FLUID_MAIN,
  ): void {
    // 已存在则仅更新位置、半径与方向
    const existing = this.activeTrails.get(playerId);
    if (existing) {
      existing.x = x;
      existing.y = y;
      existing.radius = radius;
      existing.flowDir = flowDir;
      existing.container.position.set(x, y);
      this.drawTrailArrow(existing.arrowGraphics, radius, flowDir);
      return;
    }

    const container = new PIXI.Container();
    container.position.set(x, y);
    container.scale.set(this.scale); // 全局缩放由容器承担

    // 水流尾迹光环（8 层径向渐变）
    const auraGraphics = new PIXI.Graphics();
    this.drawTrailAura(auraGraphics, radius);
    container.addChild(auraGraphics);

    // 流动波纹（3 条扩散环，由 update 重绘）
    const rippleGraphics = new PIXI.Graphics();
    container.addChild(rippleGraphics);

    // 流向箭头
    const arrowGraphics = new PIXI.Graphics();
    this.drawTrailArrow(arrowGraphics, radius, flowDir);
    container.addChild(arrowGraphics);

    this.fieldContainer.addChild(container);

    // 3 条波纹错峰启动（相位差 1/3 周期）
    const trail: ActiveTrail = {
      container,
      rippleGraphics,
      auraGraphics,
      arrowGraphics,
      particleTimer: 0,
      rippleLife: [
        0,
        TRAIL_RIPPLE_MAX_LIFE / 3,
        (TRAIL_RIPPLE_MAX_LIFE * 2) / 3,
      ],
      rippleMaxLife: TRAIL_RIPPLE_MAX_LIFE,
      life: 0,
      maxLife: Number.POSITIVE_INFINITY, // 常驻，直到手动移除
      x,
      y,
      radius,
      flowDir,
    };
    this.activeTrails.set(playerId, trail);

    // 触发首帧水滴粒子
    this.spawnDropletParticles(x, y, radius, themeColor);
  }

  /**
   * 更新水流尾迹的位置与方向（由外部位置同步调用）
   * @param playerId 玩家 ID
   * @param x 新逻辑坐标 X
   * @param y 新逻辑坐标 Y
   * @param flowDir 新流向角度（弧度）
   */
  updateTrail(playerId: string, x: number, y: number, flowDir: number): void {
    const trail = this.activeTrails.get(playerId);
    if (!trail) return;
    trail.x = x;
    trail.y = y;
    trail.flowDir = flowDir;
    trail.container.position.set(x, y);
    this.drawTrailArrow(trail.arrowGraphics, trail.radius, flowDir);
  }

  /** 移除水流尾迹 */
  removeTrail(playerId: string): void {
    const trail = this.activeTrails.get(playerId);
    if (trail) {
      this.fieldContainer.removeChild(trail.container);
      trail.container.destroy({ children: true });
      this.activeTrails.delete(playerId);
    }
  }

  /**
   * 绘制水流尾迹光环：8 层同心圆（主水蓝 → 深蓝 → 透明）+ 外环 + 中心水核
   * 以 (0,0) 为中心绘制，半径单位为逻辑 px
   */
  private drawTrailAura(g: PIXI.Graphics, radius: number): void {
    g.clear();

    // 8 层同心圆叠加模拟径向渐变（中心主水蓝 → 深海蓝 → 透明）
    for (let i = 0; i < 8; i++) {
      const t = i / 7; // 0 → 1
      const r = radius * (0.15 + 0.85 * t);
      // 颜色：前半段 主水蓝 → 深蓝，后半段保持深蓝
      const color =
        t < 0.5
          ? this.interpolateColor(FLUID_MAIN, FLUID_DEEP, t * 2)
          : FLUID_DEEP;
      const alpha = (1 - t) * 0.22; // 中心高 alpha，边缘趋近 0
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }

    // 外环（高亮浅蓝细环）+ 内环（泡沫白蓝）
    g.circle(0, 0, radius);
    g.stroke({ color: FLUID_HIGHLIGHT, width: 1, alpha: 0.7 });
    g.circle(0, 0, radius * 0.95);
    g.stroke({ color: FLUID_FOAM, width: 0.4, alpha: 0.5 });

    // 中心水核：白色实心圆 r=4 + 主水蓝外环 r=6
    g.circle(0, 0, 6);
    g.stroke({ color: FLUID_MAIN, width: 1, alpha: 0.8 });
    g.circle(0, 0, 4);
    g.fill({ color: FLUID_WHITE, alpha: 1 });
  }

  /**
   * 绘制单条流动波纹（扩散环）
   * @param g 目标 Graphics
   * @param radius 基准半径
   * @param life 当前 life（ms）
   * @param maxLife 最大 life（ms）
   */
  private drawTrailRipple(
    g: PIXI.Graphics,
    radius: number,
    life: number,
    maxLife: number,
  ): void {
    const t = life / maxLife; // 0 → 1
    const r = radius * (0.5 + 1.0 * t); // scale 0.5 → 1.5
    const alpha = 0.8 * (1 - t); // alpha 0.8 → 0
    g.circle(0, 0, r);
    g.stroke({ color: FLUID_LIGHT, width: 1.2, alpha });
  }

  /**
   * 绘制流向箭头：细线 + 三角箭头头（半透明）
   * @param g 目标 Graphics
   * @param radius 基准半径
   * @param flowDir 流向角度（弧度）
   */
  private drawTrailArrow(
    g: PIXI.Graphics,
    radius: number,
    flowDir: number,
  ): void {
    g.clear();
    const innerR = radius * 0.4;
    const outerR = radius * 0.95;
    const tipX = Math.cos(flowDir) * outerR;
    const tipY = Math.sin(flowDir) * outerR;
    const tailX = Math.cos(flowDir) * innerR;
    const tailY = Math.sin(flowDir) * innerR;

    // 主线
    g.moveTo(tailX, tailY);
    g.lineTo(tipX, tipY);
    g.stroke({ color: FLUID_HIGHLIGHT, width: 1, alpha: 0.6 });

    // 三角箭头头（在 tip 处，左右各一条短线）
    const arrowSize = 5;
    const leftA = flowDir + Math.PI - Math.PI / 6;
    const rightA = flowDir + Math.PI + Math.PI / 6;
    g.moveTo(tipX, tipY);
    g.lineTo(
      tipX + Math.cos(leftA) * arrowSize,
      tipY + Math.sin(leftA) * arrowSize,
    );
    g.moveTo(tipX, tipY);
    g.lineTo(
      tipX + Math.cos(rightA) * arrowSize,
      tipY + Math.sin(rightA) * arrowSize,
    );
    g.stroke({ color: FLUID_HIGHLIGHT, width: 1, alpha: 0.6 });
  }

  /**
   * 生成水滴粒子（向外飞溅）
   * 每 800ms 由 update 节流调用，每次 3-4 个
   */
  private spawnDropletParticles(
    x: number,
    y: number,
    radius: number,
    color: number,
  ): void {
    const s = this.scale;
    const count = 3 + Math.floor(Math.random() * 2); // 3-4 个
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      // 从光环中部出发
      const startDist = radius * s * (0.3 + Math.random() * 0.2);
      const px = x + Math.cos(angle) * startDist;
      const py = y + Math.sin(angle) * startDist;
      // 向外飞溅速度（px/s）
      const speed = (25 + Math.random() * 20) * s;
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
  //  漩涡牵引 Vortex
  // ══════════════════════════════════════════════════════

  /**
   * 触发漩涡牵引视觉效果
   * @param targetId 目标 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param radius 漩涡半径（逻辑 px）
   * @param pullForce 牵引力（0-1，影响牵引线 alpha）
   * @param themeColor 主题色
   */
  triggerVortex(
    targetId: string,
    x: number,
    y: number,
    radius: number,
    pullForce: number,
    themeColor = FLUID_MAIN,
  ): void {
    // 若已存在，先销毁旧实例（避免泄漏）
    const old = this.activeVortices.get(targetId);
    if (old) {
      this.fieldContainer.removeChild(old.container);
      old.container.destroy({ children: true });
    }

    const container = new PIXI.Container();
    container.position.set(x, y);
    container.scale.set(this.scale);

    // 1. 漩涡核心（6 层同心圆 + 中心水核）
    const coreGraphics = new PIXI.Graphics();
    this.drawVortexCore(coreGraphics, radius);
    container.addChild(coreGraphics);

    // 2. 螺旋臂（3 条阿基米德螺旋线）
    const armGraphics = new PIXI.Graphics();
    this.drawVortexArms(armGraphics, radius);
    container.addChild(armGraphics);

    // 3. 牵引线（4 条从外向内的曲线）
    const pullGraphics = new PIXI.Graphics();
    this.drawVortexPull(pullGraphics, radius, pullForce);
    container.addChild(pullGraphics);

    this.fieldContainer.addChild(container);

    const vortex: ActiveVortex = {
      container,
      coreGraphics,
      armGraphics,
      pullGraphics,
      life: 0,
      maxLife: 6000, // 6 秒
      x,
      y,
      radius,
      pullForce,
      themeColor,
    };
    this.activeVortices.set(targetId, vortex);
  }

  /** 移除漩涡牵引 */
  removeVortex(targetId: string): void {
    const vortex = this.activeVortices.get(targetId);
    if (vortex) {
      this.fieldContainer.removeChild(vortex.container);
      vortex.container.destroy({ children: true });
      this.activeVortices.delete(targetId);
    }
  }

  /**
   * 绘制漩涡核心：6 层同心圆（主水蓝 → 深蓝 → 透明）+ 中心水核
   */
  private drawVortexCore(g: PIXI.Graphics, radius: number): void {
    g.clear();
    const coreR = radius * 0.7;

    // 6 层同心圆叠加（中心主水蓝 → 深蓝 → 透明）
    for (let i = 0; i < 6; i++) {
      const t = i / 5; // 0 → 1
      const r = coreR * (0.15 + 0.85 * t);
      const color =
        t < 0.5
          ? this.interpolateColor(FLUID_MAIN, FLUID_DEEP, t * 2)
          : FLUID_DEEP;
      const alpha = (1 - t) * 0.25;
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }

    // 中心水核：白色实心 r=5 + 浅水蓝外环 r=7
    g.circle(0, 0, 5);
    g.fill({ color: FLUID_WHITE, alpha: 0.9 });
    g.circle(0, 0, 7);
    g.stroke({ color: FLUID_LIGHT, width: 1, alpha: 0.7 });
  }

  /**
   * 绘制阿基米德螺旋臂：3 条 120° 均分的螺旋线，从中心向外旋转
   * r = a*theta（阿基米德螺旋）
   */
  private drawVortexArms(g: PIXI.Graphics, radius: number): void {
    g.clear();
    const steps = 32;
    const turns = 1.5; // 1.5 圈
    for (let i = 0; i < 3; i++) {
      const baseAngle = (i * 2 * Math.PI) / 3;
      g.moveTo(0, 0);
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const theta = t * Math.PI * 2 * turns;
        const r = t * radius;
        const angle = baseAngle + theta;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        g.lineTo(x, y);
      }
      // 主螺旋臂（浅水蓝粗线）
      g.stroke({ color: FLUID_LIGHT, width: 1.5, alpha: 0.8 });
    }
  }

  /**
   * 绘制牵引曲线：4 条 quadraticCurveTo 从外向内汇聚
   * @param radius 漩涡半径
   * @param pullForce 牵引力 0-1，影响 alpha
   */
  private drawVortexPull(
    g: PIXI.Graphics,
    radius: number,
    pullForce: number,
  ): void {
    g.clear();
    const baseAlpha = 0.4 + 0.4 * pullForce; // 0.4 → 0.8
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const startX = Math.cos(a) * radius * 1.2;
      const startY = Math.sin(a) * radius * 1.2;
      // 控制点：偏离直线方向，制造弧形牵引感
      const midR = radius * 0.6;
      const offset = Math.PI / 4;
      const cpX = Math.cos(a + offset) * midR;
      const cpY = Math.sin(a + offset) * midR;
      g.moveTo(startX, startY);
      g.quadraticCurveTo(cpX, cpY, 0, 0);
      g.stroke({ color: FLUID_HIGHLIGHT, width: 1, alpha: baseAlpha });
    }
  }

  // ══════════════════════════════════════════════════════
  //  水龙卷爆发 Burst（三阶段动画）
  // ══════════════════════════════════════════════════════

  /**
   * 触发水龙卷爆发视觉效果
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
    themeColor = FLUID_MAIN,
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

    // 1. 水龙卷主体（10 层同心圆：深蓝 → 主水蓝 → 浅蓝 → 透明）
    const columnGraphics = new PIXI.Graphics();
    this.drawBurstColumn(columnGraphics, radius);
    container.addChild(columnGraphics);

    // 2. 螺旋水臂（4 条从底部向上旋转）
    const armGraphics = new PIXI.Graphics();
    this.drawBurstArms(armGraphics, radius);
    container.addChild(armGraphics);

    // 3. 中心水柱（白色高亮核心）
    const coreGraphics = new PIXI.Graphics();
    this.drawBurstCore(coreGraphics, radius);
    container.addChild(coreGraphics);

    // 4. 水花范围环（外圈暴雨范围）
    const splashGraphics = new PIXI.Graphics();
    this.drawBurstSplash(splashGraphics, radius);
    container.addChild(splashGraphics);

    this.fieldContainer.addChild(container);

    const burst: ActiveBurst = {
      container,
      columnGraphics,
      armGraphics,
      coreGraphics,
      splashGraphics,
      particleTimer: 0,
      life: 0,
      maxLife: durationMs ?? 5000,
      themeColor,
      radius,
      x,
      y,
    };
    this.activeBursts.set(playerId, burst);
  }

  /**
   * 绘制水龙卷主体：10 层同心圆（深蓝 → 主水蓝 → 浅蓝 → 透明）
   * "高度递增"以层叠 alpha 模拟水柱从下到上的递进
   */
  private drawBurstColumn(g: PIXI.Graphics, radius: number): void {
    g.clear();
    const columnR = radius * 0.7;

    // 10 层同心圆叠加（深蓝 → 主水蓝 → 浅蓝 → 透明）
    for (let i = 0; i < 10; i++) {
      const t = i / 9; // 0 → 1
      const r = columnR * (0.1 + 0.9 * t);
      // 颜色分段：深蓝 → 主水蓝 → 浅蓝 → 高亮
      let color: number;
      if (t < 0.33) {
        color = this.interpolateColor(FLUID_DEEP, FLUID_MAIN, t / 0.33);
      } else if (t < 0.66) {
        color = this.interpolateColor(
          FLUID_MAIN,
          FLUID_LIGHT,
          (t - 0.33) / 0.33,
        );
      } else {
        color = this.interpolateColor(
          FLUID_LIGHT,
          FLUID_HIGHLIGHT,
          (t - 0.66) / 0.34,
        );
      }
      const alpha = (1 - t) * 0.25;
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }
  }

  /**
   * 绘制螺旋水臂：4 条从底部向上旋转的螺旋线
   * 以 2D 投影表达 3D 螺旋（向上 = 向外 + 旋转）
   */
  private drawBurstArms(g: PIXI.Graphics, radius: number): void {
    g.clear();
    const steps = 40;
    const turns = 2.5; // 2.5 圈
    for (let i = 0; i < 4; i++) {
      const baseAngle = (i * Math.PI) / 2;
      g.moveTo(0, 0);
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const theta = t * Math.PI * 2 * turns;
        const r = t * radius;
        const angle = baseAngle + theta;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        g.lineTo(x, y);
      }
      // 螺旋水臂（主水蓝粗线）
      g.stroke({ color: FLUID_MAIN, width: 2, alpha: 0.8 });
    }
  }

  /**
   * 绘制中心水柱：白色高亮核心 + 主水蓝外环 + 高亮辉光
   */
  private drawBurstCore(g: PIXI.Graphics, radius: number): void {
    g.clear();
    const coreR = radius * 0.15;
    // 中心白色实心
    g.circle(0, 0, coreR);
    g.fill({ color: FLUID_WHITE, alpha: 1 });
    // 外环（主水蓝）
    g.circle(0, 0, coreR * 1.5);
    g.stroke({ color: FLUID_MAIN, width: 1.5, alpha: 0.9 });
    // 高亮辉光
    g.circle(0, 0, coreR * 2);
    g.stroke({ color: FLUID_HIGHLIGHT, width: 0.5, alpha: 0.5 });
  }

  /**
   * 绘制水花范围环：双层细环 + 内圈虚线感（多段短弧）
   */
  private drawBurstSplash(g: PIXI.Graphics, radius: number): void {
    g.clear();
    // 外环（高亮浅蓝）
    g.circle(0, 0, radius);
    g.stroke({ color: FLUID_HIGHLIGHT, width: 0.6, alpha: 0.7 });
    // 中环（泡沫白蓝）
    g.circle(0, 0, radius * 0.95);
    g.stroke({ color: FLUID_FOAM, width: 0.4, alpha: 0.5 });
    // 内圈虚线感（16 段短弧）
    const innerR = radius * 0.85;
    const segments = 16;
    for (let i = 0; i < segments; i++) {
      const a1 = (i * 2 * Math.PI) / segments;
      const a2 = a1 + Math.PI / segments;
      g.moveTo(Math.cos(a1) * innerR, Math.sin(a1) * innerR);
      g.lineTo(Math.cos(a2) * innerR, Math.sin(a2) * innerR);
      g.stroke({ color: FLUID_LIGHT, width: 0.8, alpha: 0.4 });
    }
  }

  /**
   * 生成水龙卷粒子（按阶段决定方向）
   * @param phase 1=吸水(向心) 2=形成(切向旋转) 3=扩散(离心暴雨)
   */
  private spawnBurstParticles(
    x: number,
    y: number,
    radius: number,
    phase: 1 | 2 | 3,
    color: number,
  ): void {
    const s = this.scale;
    if (phase === 1) {
      // 吸水阶段：从外围向中心汇聚（粒子在 outer ring 生成，向心运动）
      for (let i = 0; i < 2; i++) {
        const angle = Math.random() * Math.PI * 2;
        const startDist = radius * s * (0.85 + Math.random() * 0.15);
        const px = x + Math.cos(angle) * startDist;
        const py = y + Math.sin(angle) * startDist;
        // 向心速度
        const speed = (40 + Math.random() * 20) * s;
        this.particlePool.emit({
          x: px,
          y: py,
          vx: -Math.cos(angle) * speed,
          vy: -Math.sin(angle) * speed,
          life: 800,
          scaleStart: 1,
          scaleEnd: 0.3,
          alphaStart: 0.9,
          alphaEnd: 0,
          tint: color,
          radius: (1.5 + Math.random() * 1.5) * s,
        });
      }
    } else if (phase === 2) {
      // 形成阶段：螺旋上升（在中等半径绕中心旋转）
      for (let i = 0; i < 2; i++) {
        const angle = Math.random() * Math.PI * 2;
        const startDist = radius * s * (0.3 + Math.random() * 0.3);
        const px = x + Math.cos(angle) * startDist;
        const py = y + Math.sin(angle) * startDist;
        // 切向速度（旋转）
        const speed = (30 + Math.random() * 15) * s;
        this.particlePool.emit({
          x: px,
          y: py,
          vx: -Math.sin(angle) * speed,
          vy: Math.cos(angle) * speed,
          life: 1000,
          scaleStart: 1,
          scaleEnd: 0,
          alphaStart: 0.7,
          alphaEnd: 0,
          tint: FLUID_LIGHT,
          radius: (1.2 + Math.random() * 1.2) * s,
        });
      }
    } else {
      // 扩散阶段：暴雨飞溅（从中心向外飞）
      for (let i = 0; i < 4; i++) {
        const angle = Math.random() * Math.PI * 2;
        const startDist = radius * s * (0.1 + Math.random() * 0.2);
        const px = x + Math.cos(angle) * startDist;
        const py = y + Math.sin(angle) * startDist;
        // 离心速度
        const speed = (50 + Math.random() * 30) * s;
        this.particlePool.emit({
          x: px,
          y: py,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1200,
          scaleStart: 1.2,
          scaleEnd: 0,
          alphaStart: 1,
          alphaEnd: 0,
          tint: i % 2 === 0 ? FLUID_WHITE : color,
          radius: (1.5 + Math.random() * 1.5) * s,
        });
      }
    }
  }

  // ══════════════════════════════════════════════════════
  //  更新循环
  // ══════════════════════════════════════════════════════

  /** 每帧更新（由 EffectRenderer 调用，dt 单位 ms） */
  update(dt: number): void {
    // ── 水流尾迹：光环呼吸 + 波纹扩散 + 水滴粒子 ──
    this.activeTrails.forEach((trail) => {
      trail.life += dt;
      // 光环呼吸 scale 1.0↔1.05（2s 周期）
      const breath = 1 + 0.05 * Math.sin(trail.life * 0.001 * Math.PI);
      trail.auraGraphics.scale.set(breath);
      // 光环脉动 alpha 0.7↔0.95
      const pulse = 0.82 + 0.13 * Math.sin(trail.life * 0.001 * Math.PI);
      trail.auraGraphics.alpha = pulse;
      // 流向箭头随呼吸轻微脉动
      trail.arrowGraphics.alpha =
        0.7 + 0.15 * Math.sin(trail.life * 0.001 * Math.PI);

      // 流动波纹：3 条波纹各自 life 推进，到达 maxLife 自动重置
      trail.rippleGraphics.clear();
      for (let i = 0; i < 3; i++) {
        trail.rippleLife[i] += dt;
        if (trail.rippleLife[i] >= trail.rippleMaxLife) {
          trail.rippleLife[i] -= trail.rippleMaxLife;
        }
        this.drawTrailRipple(
          trail.rippleGraphics,
          trail.radius,
          trail.rippleLife[i],
          trail.rippleMaxLife,
        );
      }

      // 水滴粒子：每 800ms 生成 3-4 个
      trail.particleTimer += dt;
      if (trail.particleTimer > 800) {
        trail.particleTimer = 0;
        this.spawnDropletParticles(trail.x, trail.y, trail.radius, FLUID_MAIN);
      }
    });

    // ── 漩涡：核心缓慢旋转 + 螺旋臂反向旋转 + 牵引线脉动 + 自动过期 ──
    this.activeVortices.forEach((vortex, targetId) => {
      vortex.life += dt;
      if (vortex.life >= vortex.maxLife) {
        this.removeVortex(targetId);
        return;
      }
      // 核心缓慢旋转 0.3 转/秒
      vortex.coreGraphics.rotation += dt * 0.001 * Math.PI * 0.6;
      // 螺旋臂反向旋转 0.8 转/秒（产生漩涡感）
      vortex.armGraphics.rotation -= dt * 0.001 * Math.PI * 1.6;
      // 牵引线脉动 alpha 0.6↔1.0
      vortex.pullGraphics.alpha =
        0.6 + 0.4 * Math.sin(vortex.life * 0.002 * Math.PI);
      // 核心呼吸 scale 0.95↔1.05
      const breath = 1 + 0.05 * Math.sin(vortex.life * 0.001 * Math.PI);
      vortex.coreGraphics.scale.set(breath);
    });

    // ── 水龙卷爆发：三阶段动画 ──
    this.activeBursts.forEach((burst, playerId) => {
      burst.life += dt;
      const T = burst.maxLife;
      if (burst.life >= T) {
        this.removeBurst(playerId);
        return;
      }
      const phase1End = T * 0.2; // 0-20%：吸水
      const phase2End = T * 0.4; // 20%-40%：龙卷形成
      // 阶段3：40%-100%：龙卷扩散

      if (burst.life < phase1End) {
        // 阶段1 吸水：水柱从地面开始升起 scale 0→0.3，alpha 0→0.5
        //   螺旋臂/核心未显现，水花环未展开
        //   粒子从外围向中心汇聚
        const t = burst.life / phase1End;
        burst.columnGraphics.scale.set(0.3 * t);
        burst.columnGraphics.alpha = 0.5 * t;
        burst.armGraphics.alpha = 0;
        burst.coreGraphics.alpha = 0;
        burst.splashGraphics.alpha = 0;
        burst.splashGraphics.scale.set(0.3);
        // 粒子：向心运动
        burst.particleTimer += dt;
        if (burst.particleTimer > 60) {
          burst.particleTimer = 0;
          this.spawnBurstParticles(
            burst.x,
            burst.y,
            burst.radius,
            1,
            burst.themeColor,
          );
        }
      } else if (burst.life < phase2End) {
        // 阶段2 龙卷形成：水柱升至全高 scale 0.3→1.0(easeOutCubic)，alpha 0.5→1.0
        //   螺旋水臂显现 alpha 0→0.8，中心水柱 alpha 0→1
        //   水花环未展开
        const t = (burst.life - phase1End) / (phase2End - phase1End);
        const eased = this.easeOutCubic(t);
        burst.columnGraphics.scale.set(0.3 + 0.7 * eased);
        burst.columnGraphics.alpha = 0.5 + 0.5 * t;
        // 螺旋臂旋转加速（4 转/秒）
        burst.armGraphics.rotation += dt * 0.001 * Math.PI * 4;
        burst.armGraphics.alpha = 0.8 * t;
        burst.coreGraphics.alpha = t; // 0 → 1
        burst.splashGraphics.alpha = 0;
        // 粒子：螺旋上升
        burst.particleTimer += dt;
        if (burst.particleTimer > 80) {
          burst.particleTimer = 0;
          this.spawnBurstParticles(
            burst.x,
            burst.y,
            burst.radius,
            2,
            burst.themeColor,
          );
        }
      } else {
        // 阶段3 龙卷扩散：水柱扩散 scale 1.0→1.5 alpha 1.0→0
        //   螺旋臂消散 alpha 0.8→0，水花环展开 scale 1.0→2.0 alpha 0→0.8→0
        //   中心水柱 alpha 1.0→0.3
        //   粒子：暴雨向外飞溅
        const t = (burst.life - phase2End) / (T - phase2End);
        burst.columnGraphics.scale.set(1.0 + 0.5 * t);
        burst.columnGraphics.alpha = 1.0 - t;
        // 螺旋臂加速旋转并消散（6 转/秒）
        burst.armGraphics.rotation += dt * 0.001 * Math.PI * 6;
        burst.armGraphics.alpha = 0.8 * (1.0 - t);
        // 中心水柱
        burst.coreGraphics.alpha = 1.0 - 0.7 * t;
        // 水花环：先展开 alpha 0→0.8（前半），后消散 alpha 0.8→0（后半）
        burst.splashGraphics.scale.set(1.0 + 1.0 * t);
        if (t < 0.5) {
          burst.splashGraphics.alpha = 0.8 * (t * 2);
        } else {
          burst.splashGraphics.alpha = 0.8 * (1.0 - (t - 0.5) * 2);
        }
        // 粒子：暴雨向外飞溅（频率更高）
        burst.particleTimer += dt;
        if (burst.particleTimer > 50) {
          burst.particleTimer = 0;
          this.spawnBurstParticles(
            burst.x,
            burst.y,
            burst.radius,
            3,
            burst.themeColor,
          );
        }
      }
    });
  }

  // ══════════════════════════════════════════════════════
  //  移除与清理
  // ══════════════════════════════════════════════════════

  /** 移除水龙卷爆发特效 */
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
    this.activeTrails.forEach((_, playerId) => this.removeTrail(playerId));
    this.activeVortices.forEach((_, targetId) => this.removeVortex(targetId));
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
