/**
 * 熵寂之触 (Entropic Touch) - 闲乘月
 * 前端视觉渲染器
 *
 * 视觉设计（月华清辉 + 熵寂吸光双形态融合）：
 * - 低温场 Aura：月华外晕（8 层径向渐变）+ 月轮主环（双层）+ 六角放射光线 + 中心月核
 * - 冻伤 Frostbite：霜花光晕（6 层）+ 霜花六瓣纹（3 贯穿线 + 分叉）+ 层数环 + 中心冰核
 * - 爆发 Burst：吸光奇点核心（10 层渐变）+ 事件视界环 + 能量撕裂线 + 月华长发（三阶段动画）
 */

import * as PIXI from 'pixi.js';
import { ParticlePool } from '../systems/ParticlePool';
import type { Palette } from './BaseWeaponEffectRenderer';
import { lighten, dimColor } from './VisualEffectUtils';

// ══════════════════════════════════════════════════════
//  颜色常量
// ══════════════════════════════════════════════════════

const MOON_COLOR = 0x88ddff; // 月华主色（冰蓝）
const MOON_HIGHLIGHT = 0xAAFFFF; // 月华高亮（浅冰蓝）
const MOON_CORE = 0xffffff; // 月核白
const ENTROPY_PURPLE = 0x9966ff; // 熵寂暗紫（边缘辉光）
const ENTROPY_DEEP = 0x6600cc; // 熵寂深紫（渐变中段）
const ENTROPY_BLACK = 0x000000; // 熵寂黑（吸光核中心）

// ══════════════════════════════════════════════════════
//  数据结构
// ══════════════════════════════════════════════════════

/** 活跃低温场实例（月华清辉派） */
interface ActiveAura {
  container: PIXI.Container;
  moonGraphics: PIXI.Graphics; // 月轮 + 月华晕 + 月核
  rayGraphics: PIXI.Graphics; // 六角放射光线（独立旋转）
  particleTimer: number;
  life: number; // ms 累计
  maxLife: number;
  x: number;
  y: number;
  radius: number;
}

/** 活跃冻伤印记（霜花六瓣纹） */
interface ActiveFrostbite {
  container: PIXI.Container;
  frostGraphics: PIXI.Graphics; // 霜花六瓣 + 层数环 + 中心冰核
  life: number;
  maxLife: number;
  stacks: number;
  themeColor: number;
}

/** 活跃爆发特效（熵寂吸光派 + 三阶段动画） */
interface ActiveBurst {
  container: PIXI.Container;
  coreGraphics: PIXI.Graphics; // 吸光奇点核心
  horizonGraphics: PIXI.Graphics; // 事件视界环
  tearGraphics: PIXI.Graphics; // 能量撕裂线
  hairGraphics: PIXI.Graphics; // 月华长发
  life: number;
  maxLife: number;
  themeColor: number;
  radius: number;
}

export class EntropicTouchRenderer {
  private fieldContainer: PIXI.Container;
  private particlePool: ParticlePool;
  private scale = 1;

  // 活跃实例池
  private activeAuras: Map<string, ActiveAura> = new Map();
  private activeFrostbites: Map<string, ActiveFrostbite> = new Map();
  private activeBursts: Map<string, ActiveBurst> = new Map();

  constructor(fieldContainer: PIXI.Container, particlePool: ParticlePool) {
    this.fieldContainer = fieldContainer;
    this.particlePool = particlePool;
  }

  setScale(scale: number): void {
    this.scale = scale;
    // 容器统一承担全局缩放，内部 graphics 维持各自的动画 scale
    this.activeAuras.forEach((aura) => {
      if (aura.container.destroyed) return;
      aura.container.scale.set(scale);
    });
    this.activeFrostbites.forEach((fb) => {
      if (fb.container.destroyed) return;
      fb.container.scale.set(scale);
    });
    this.activeBursts.forEach((burst) => {
      if (burst.container.destroyed) return;
      burst.container.scale.set(scale);
    });
  }

  // ══════════════════════════════════════════════════════
  //  低温场 Aura（月华清辉派）
  // ══════════════════════════════════════════════════════

  /**
   * 触发低温场视觉效果
   * @param playerId 玩家 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param radius 低温场半径（逻辑 px）
   * @param themeColor 主题色（默认月华冰蓝）
   */
  triggerAura(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor = MOON_COLOR,
    palette?: Palette,
  ): void {
    // 已存在则仅更新位置与半径
    const existing = this.activeAuras.get(playerId);
    if (existing) {
      existing.x = x;
      existing.y = y;
      existing.radius = radius;
      existing.container.position.set(x, y);
      return;
    }

    const pal: Palette = palette ?? {
      primary: themeColor,
      glow: lighten(themeColor, 50),
      highlight: lighten(themeColor, 100),
      dim: dimColor(themeColor, 0.6),
      shadow: dimColor(themeColor, 0.3),
      accent: 0xFF3333,
    };

    const container = new PIXI.Container();
    container.position.set(x, y);
    container.scale.set(this.scale); // 全局缩放由容器承担

    // 月轮 + 月华晕 + 月核
    const moonGraphics = new PIXI.Graphics();
    this.drawMoonAura(moonGraphics, radius);
    container.addChild(moonGraphics);

    // 六角放射光线（独立旋转）
    const rayGraphics = new PIXI.Graphics();
    this.drawMoonRays(rayGraphics, radius * 0.3, radius);
    container.addChild(rayGraphics);

    this.fieldContainer.addChild(container);

    const aura: ActiveAura = {
      container,
      moonGraphics,
      rayGraphics,
      particleTimer: 0,
      life: 0,
      maxLife: Number.POSITIVE_INFINITY, // 常驻，直到手动移除
      x,
      y,
      radius,
    };
    this.activeAuras.set(playerId, aura);

    // 触发首帧冰晶粒子
    this.spawnIceParticles(x, y, radius, pal.primary);
  }

  /** 移除低温场 */
  removeAura(playerId: string): void {
    const aura = this.activeAuras.get(playerId);
    if (aura) {
      this.fieldContainer.removeChild(aura.container);
      aura.container.destroy({ children: true });
      this.activeAuras.delete(playerId);
    }
  }

  /**
   * 绘制月华清辉：月华外晕（8 层径向渐变）+ 月轮主环（双层）+ 中心月核
   * 以 (0,0) 为中心绘制，半径单位为逻辑 px
   */
  private drawMoonAura(g: PIXI.Graphics, radius: number): void {
    g.clear();

    // 月华外晕：8 层同心圆叠加模拟径向渐变（中心白 → 冰蓝 → 透明）
    for (let i = 0; i < 8; i++) {
      const t = i / 7; // 0 → 1
      const r = radius * (0.15 + 0.85 * t);
      // 颜色：前半段 白→冰蓝，后半段保持冰蓝
      const color =
        t < 0.5
          ? this.interpolateColor(MOON_CORE, MOON_COLOR, t * 2)
          : MOON_COLOR;
      const alpha = (1 - t) * 0.2; // 中心高 alpha，边缘趋近 0
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }

    // 月轮主环：外环 MOON_HIGHLIGHT + 内环 MOON_CORE
    g.circle(0, 0, radius);
    g.stroke({ color: MOON_HIGHLIGHT, width: 1, alpha: 0.7 });
    g.circle(0, 0, radius * 0.95);
    g.stroke({ color: MOON_CORE, width: 0.4, alpha: 0.5 });

    // 中心月核：白色实心圆 r=4 + 冰蓝外环 r=6
    g.circle(0, 0, 6);
    g.stroke({ color: MOON_COLOR, width: 1, alpha: 0.8 });
    g.circle(0, 0, 4);
    g.fill({ color: MOON_CORE, alpha: 1 });
  }

  /**
   * 绘制六角放射光线：6 条短线从内环到外环（60° 均分）
   * 由 rayGraphics 独立承担旋转动画
   */
  private drawMoonRays(
    g: PIXI.Graphics,
    innerR: number,
    outerR: number,
  ): void {
    g.clear();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const x1 = Math.cos(a) * innerR;
      const y1 = Math.sin(a) * innerR;
      const x2 = Math.cos(a) * outerR;
      const y2 = Math.sin(a) * outerR;
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke({ color: MOON_HIGHLIGHT, width: 1, alpha: 0.6 });
    }
  }

  /**
   * 生成冰晶粒子（向外飘散）
   * 利用 particlePool.emit，每帧由 update 节流调用
   */
  private spawnIceParticles(
    x: number,
    y: number,
    radius: number,
    color: number,
  ): void {
    const s = this.scale;
    for (let i = 0; i < 2; i++) {
      const angle = Math.random() * Math.PI * 2;
      // 从月核附近出发
      const startDist = radius * s * (0.2 + Math.random() * 0.2);
      const px = x + Math.cos(angle) * startDist;
      const py = y + Math.sin(angle) * startDist;
      // 向外飘散速度（px/s）
      const speed = (20 + Math.random() * 15) * s;
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
  //  冻伤叠加效果（霜花六瓣纹）
  // ══════════════════════════════════════════════════════

  /**
   * 触发冻伤叠加视觉效果
   * @param targetId 目标玩家 ID
   * @param stacks 当前冻伤层数（1-3）
   * @param x 目标逻辑坐标 X
   * @param y 目标逻辑坐标 Y
   * @param themeColor 主题色
   */
  triggerFrostbite(
    targetId: string,
    stacks: number,
    x: number,
    y: number,
    themeColor = MOON_COLOR,
    palette?: Palette,
  ): void {
    // 若已存在，先销毁旧实例（避免泄漏）
    const old = this.activeFrostbites.get(targetId);
    if (old) {
      this.fieldContainer.removeChild(old.container);
      old.container.destroy({ children: true });
    }

    const pal: Palette = palette ?? {
      primary: themeColor,
      glow: lighten(themeColor, 50),
      highlight: lighten(themeColor, 100),
      dim: dimColor(themeColor, 0.6),
      shadow: dimColor(themeColor, 0.3),
      accent: 0xFF3333,
    };

    const container = new PIXI.Container();
    container.position.set(x, y);
    container.scale.set(this.scale);

    const frostGraphics = new PIXI.Graphics();
    this.drawFrostbite(frostGraphics, stacks, pal.primary);
    container.addChild(frostGraphics);

    this.fieldContainer.addChild(container);

    const frostbite: ActiveFrostbite = {
      container,
      frostGraphics,
      life: 0,
      maxLife: 5000, // 5 秒
      stacks,
      themeColor: pal.primary,
    };
    this.activeFrostbites.set(targetId, frostbite);
  }

  /**
   * 绘制霜花六瓣纹：霜花光晕（6 层）+ 霜花六瓣（3 贯穿线 + 分叉）+ 层数环 + 中心冰核
   */
  private drawFrostbite(
    g: PIXI.Graphics,
    stacks: number,
    themeColor: number,
  ): void {
    g.clear();
    const baseR = 25; // 霜花基础半径

    // 霜花光晕：6 层同心圆叠加（中心白 → 冰蓝 → 透明）
    for (let i = 0; i < 6; i++) {
      const t = i / 5; // 0 → 1
      const r = baseR * (0.3 + 0.7 * t);
      const color =
        t < 0.5
          ? this.interpolateColor(MOON_CORE, themeColor, t * 2)
          : themeColor;
      const alpha = (1 - t) * 0.22;
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }

    // 霜花六瓣：3 条贯穿线（60° 均分）+ 每条线 1/3 和 2/3 处的分叉短线
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3;
      const x1 = Math.cos(a) * baseR;
      const y1 = Math.sin(a) * baseR;
      const x2 = -x1;
      const y2 = -y1;
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke({ color: themeColor, width: 1, alpha: 0.7 });

      // 1/3 与 2/3 处的分叉短线（垂直主线方向）
      for (const f of [1 / 3, 2 / 3]) {
        const cx = x1 + (x2 - x1) * f;
        const cy = y1 + (y2 - y1) * f;
        const fa = a + Math.PI / 2;
        const forkLen = 4;
        g.moveTo(
          cx - Math.cos(fa) * forkLen,
          cy - Math.sin(fa) * forkLen,
        );
        g.lineTo(
          cx + Math.cos(fa) * forkLen,
          cy + Math.sin(fa) * forkLen,
        );
        g.stroke({ color: themeColor, width: 0.5, alpha: 0.5 });
      }
    }

    // 层数环：外圈细环累加（每层 +4px 半径，alpha 0.4→0.3→0.2 递减）
    for (let i = 0; i < stacks; i++) {
      const r = baseR + 8 + i * 4;
      const alpha = Math.max(0.1, 0.4 - i * 0.1);
      g.circle(0, 0, r);
      g.stroke({ color: themeColor, width: 1, alpha });
    }

    // 中心冰核：白色实心圆 r=3
    g.circle(0, 0, 3);
    g.fill({ color: MOON_CORE, alpha: 1 });
  }

  // ══════════════════════════════════════════════════════
  //  爆发特效（熵寂吸光派 + 三阶段动画）
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
    themeColor = MOON_COLOR,
    durationMs?: number,
    palette?: Palette,
  ): void {
    // 修复：后端每 250ms 发送 ENTROPIC_TOUCH_BURST 周期同步事件，
    // 已存在实例时仅更新位置和半径，不重建（避免 life 被重置为 0 导致永远卡在"蓄压"阶段）
    const existing = this.activeBursts.get(playerId);
    if (existing) {
      existing.container.position.set(x, y);
      existing.radius = radius;
      return;
    }

    const pal: Palette = palette ?? {
      primary: themeColor,
      glow: lighten(themeColor, 50),
      highlight: lighten(themeColor, 100),
      dim: dimColor(themeColor, 0.6),
      shadow: dimColor(themeColor, 0.3),
      accent: 0xFF3333,
    };

    const container = new PIXI.Container();
    container.position.set(x, y);
    container.scale.set(this.scale);

    // 1. 吸光奇点核心（10 层渐变 + 吸光核 + 紫色边缘辉光）
    const coreGraphics = new PIXI.Graphics();
    this.drawBurstCore(coreGraphics, radius);
    container.addChild(coreGraphics);

    // 2. 事件视界环（双层细高亮环）
    const horizonGraphics = new PIXI.Graphics();
    this.drawBurstHorizon(horizonGraphics, radius);
    container.addChild(horizonGraphics);

    // 3. 能量撕裂线（6 条 quadraticCurveTo 从外向内汇聚）
    const tearGraphics = new PIXI.Graphics();
    this.drawBurstTears(tearGraphics, radius);
    container.addChild(tearGraphics);

    // 4. 月华长发（4 条非平行 bezier，向心被吸）
    const hairGraphics = new PIXI.Graphics();
    this.drawBurstHair(hairGraphics, radius, pal.primary);
    container.addChild(hairGraphics);

    this.fieldContainer.addChild(container);

    const burst: ActiveBurst = {
      container,
      coreGraphics,
      horizonGraphics,
      tearGraphics,
      hairGraphics,
      life: 0,
      maxLife: durationMs ?? 5000,
      themeColor: pal.primary,
      radius,
    };
    this.activeBursts.set(playerId, burst);
  }

  /**
   * 绘制吸光奇点核心：10 层同心圆（黑 → 暗紫 → 冰蓝 → 透明）+ 吸光核 + 紫色边缘辉光
   */
  private drawBurstCore(g: PIXI.Graphics, radius: number): void {
    g.clear();
    const coreR = radius * 0.6; // 奇点核心区域半径

    // 10 层同心圆叠加（黑 → 暗紫 → 冰蓝 → 透明）
    for (let i = 0; i < 10; i++) {
      const t = i / 9; // 0 → 1
      const r = coreR * (0.1 + 0.9 * t);
      // 颜色分段：黑 → 暗紫 → 暗紫亮 → 冰蓝
      let color: number;
      if (t < 0.33) {
        color = this.interpolateColor(ENTROPY_BLACK, ENTROPY_DEEP, t / 0.33);
      } else if (t < 0.66) {
        color = this.interpolateColor(
          ENTROPY_DEEP,
          ENTROPY_PURPLE,
          (t - 0.33) / 0.33,
        );
      } else {
        color = this.interpolateColor(
          ENTROPY_PURPLE,
          MOON_COLOR,
          (t - 0.66) / 0.34,
        );
      }
      const alpha = (1 - t) * 0.25;
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }

    // 吸光核 r=6
    g.circle(0, 0, 6);
    g.fill({ color: ENTROPY_BLACK, alpha: 1 });

    // 紫色边缘辉光
    g.circle(0, 0, 8);
    g.stroke({ color: ENTROPY_PURPLE, width: 1.5, alpha: 0.8 });
  }

  /**
   * 绘制事件视界环：双层细高亮环
   */
  private drawBurstHorizon(g: PIXI.Graphics, radius: number): void {
    g.clear();
    g.circle(0, 0, radius);
    g.stroke({ color: MOON_HIGHLIGHT, width: 0.6, alpha: 0.7 });
    g.circle(0, 0, radius * 0.95);
    g.stroke({ color: MOON_CORE, width: 0.3, alpha: 0.5 });
  }

  /**
   * 绘制能量撕裂线：6 条 quadraticCurveTo 从外向内汇聚
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
      g.stroke({ color: ENTROPY_PURPLE, width: 1, alpha: 0.8 });
    }
  }

  /**
   * 绘制月华长发：4 条非平行 bezier（左右各 2，主细搭配），向心被吸
   */
  private drawBurstHair(
    g: PIXI.Graphics,
    radius: number,
    themeColor: number,
  ): void {
    g.clear();
    // 左右各 2 条：一条主（粗，themeColor）+ 一条细（MOON_HIGHLIGHT）
    const configs = [
      { side: -1, isMain: true, startOffset: -0.6 },
      { side: -1, isMain: false, startOffset: -0.3 },
      { side: 1, isMain: true, startOffset: 0.6 },
      { side: 1, isMain: false, startOffset: 0.3 },
    ];
    for (const c of configs) {
      // 起点：外侧偏远位置
      const startX = c.side * radius * 1.5;
      const startY = c.startOffset * radius;
      // 终点：奇点中心
      const endX = 0;
      const endY = 0;
      // 控制点：非平行走向，制造向心被吸的曲线
      const cp1X = c.side * radius * 1.2;
      const cp1Y = c.startOffset * radius * 0.5;
      const cp2X = c.side * radius * 0.4;
      const cp2Y = c.startOffset * radius * 0.2;
      g.moveTo(startX, startY);
      g.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, endX, endY);
      g.stroke({
        color: c.isMain ? themeColor : MOON_HIGHLIGHT,
        width: c.isMain ? 2 : 1,
        alpha: 0.7,
      });
    }
  }

  // ══════════════════════════════════════════════════════
  //  更新循环
  // ══════════════════════════════════════════════════════

  /** 每帧更新（由 EffectRenderer 调用，dt 单位 ms） */
  update(dt: number): void {
    // ── 低温场：月轮呼吸 + 月华晕脉动 + 光线旋转 + 冰晶粒子 ──
    this.activeAuras.forEach((aura) => {
      aura.life += dt;
      // 月轮呼吸 scale 1.0↔1.05（2s 周期）
      const breath = 1 + 0.05 * Math.sin(aura.life * 0.001 * Math.PI);
      aura.moonGraphics.scale.set(breath);
      // 月华晕脉动 alpha 0.6↔0.9
      const pulse = 0.75 + 0.15 * Math.sin(aura.life * 0.001 * Math.PI);
      aura.moonGraphics.alpha = pulse;
      // 六角光线旋转 0.5 转/秒
      aura.rayGraphics.rotation += dt * 0.001 * Math.PI;
      // 冰晶粒子：每 1.5s 生成 2 个
      aura.particleTimer += dt;
      if (aura.particleTimer > 1500) {
        aura.particleTimer = 0;
        this.spawnIceParticles(aura.x, aura.y, aura.radius, MOON_COLOR);
      }
    });

    // ── 冻伤：自动过期 ──
    this.activeFrostbites.forEach((fb, targetId) => {
      fb.life += dt;
      if (fb.life >= fb.maxLife) this.removeFrostbite(targetId);
    });

    // ── 爆发：三阶段动画 ──
    this.activeBursts.forEach((burst, playerId) => {
      burst.life += dt;
      const T = burst.maxLife;
      if (burst.life >= T) {
        this.removeBurst(playerId);
        return;
      }
      const phase1End = T * 0.15;
      const phase2End = T * 0.25;

      if (burst.life < phase1End) {
        // 阶段1 蓄压：月华收缩 scale 1.0→0.3，光线变暗 alpha 1.0→0.3，吸光核显现
        const t = burst.life / phase1End;
        burst.hairGraphics.scale.set(1.0 - 0.7 * t);
        burst.hairGraphics.alpha = 1.0 - 0.7 * t;
        burst.coreGraphics.alpha = t; // 0 → 1 显现
        burst.tearGraphics.alpha = 0;
        burst.horizonGraphics.alpha = 0;
        burst.horizonGraphics.scale.set(0.3);
      } else if (burst.life < phase2End) {
        // 阶段2 坍缩：奇点爆发 scale 0.3→1.0(easeOutCubic)，撕裂线闪现 alpha 0→0.8，视界环展开
        const t = (burst.life - phase1End) / (phase2End - phase1End);
        const eased = this.easeOutCubic(t);
        burst.hairGraphics.scale.set(0.3 + 0.7 * eased);
        burst.hairGraphics.alpha = 0.3 + 0.4 * t; // 0.3 → 0.7
        burst.coreGraphics.alpha = 1.0;
        burst.tearGraphics.alpha = 0.8 * t; // 0 → 0.8
        burst.horizonGraphics.scale.set(0.3 + 0.7 * eased);
        burst.horizonGraphics.alpha = t; // 0 → 1
      } else {
        // 阶段3 扩散：视界环扩散 scale 1.0→2.0 alpha 1.0→0，长发消散 alpha 0.7→0（sin 波动），
        //           撕裂线消散 alpha 0.8→0，吸光核保持但透明 alpha 1.0→0.3
        const t = (burst.life - phase2End) / (T - phase2End);
        burst.horizonGraphics.scale.set(1.0 + 1.0 * t);
        burst.horizonGraphics.alpha = 1.0 - t;
        burst.hairGraphics.alpha = 0.7 * (1.0 - t);
        burst.hairGraphics.rotation = Math.sin(t * Math.PI * 4) * 0.5;
        burst.tearGraphics.alpha = 0.8 * (1.0 - t);
        burst.coreGraphics.alpha = 1.0 - 0.7 * t;
      }
    });
  }

  // ══════════════════════════════════════════════════════
  //  移除与清理
  // ══════════════════════════════════════════════════════

  /** 移除冻伤印记 */
  removeFrostbite(targetId: string): void {
    const fb = this.activeFrostbites.get(targetId);
    if (fb) {
      this.fieldContainer.removeChild(fb.container);
      fb.container.destroy({ children: true });
      this.activeFrostbites.delete(targetId);
    }
  }

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
    this.activeAuras.forEach((_, playerId) => this.removeAura(playerId));
    this.activeFrostbites.forEach((_, targetId) =>
      this.removeFrostbite(targetId),
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
