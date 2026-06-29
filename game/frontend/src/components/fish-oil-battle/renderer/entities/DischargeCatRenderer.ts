/**
 * 放电猫猫 (Discharge Cat) - 小金喵
 * 前端视觉渲染器（闲乘月质量标准）
 *
 * 视觉设计（电系萌宠 - 可爱但危险）：
 * - 放电猫虚影：8 层径向渐变（金→电青→透明）+ 双层耳朵 + 多层猫瞳 + 爆发电火花
 * - 电弧弹射：链式闪电三层叠加发光（外晕白 / 主电青 / 核心白）+ 电弧粒子飞溅
 * - 雷霆万钧爆发：三阶段动画
 *   · 蓄电（0-15%T）：电弧向中心汇聚
 *   · 放电（15-30%T）：8 条放射闪电 + 3 层扩散电弧环 + 中心猫瞳显现
 *   · 余电（30-100%T）：金色能量扩散，电弧消散
 *   · 狮子形态彩蛋（前 0.3s）：金色能量鬃毛（多层同心圆 + 12 条锯齿鬃毛光线）
 */

import * as PIXI from 'pixi.js';
import { easeOutCubic, lighten, dimColor, type ActiveEffect } from './VisualEffectUtils';
import type { Palette } from './BaseWeaponEffectRenderer';

// ══════════════════════════════════════════════════════
//  颜色常（电系金 - 小金喵配色）
// ══════════════════════════════════════════════════════

const ELECTRIC_DEEP = 0x0044aa; // 深电蓝（渐变末端）
const ELECTRIC_MAIN = 0x00bbff; // 主电青（闪电主色）
const ELECTRIC_LIGHT = 0x66eeff; // 浅电蓝（高光过渡）
const ELECTRIC_GOLD = 0xffcc00; // 金色（猫的金色 / 余电扩散）
const ELECTRIC_YELLOW = 0xffff66; // 高亮黄（鬃毛中层）
const ELECTRIC_WHITE = 0xffffff; // 纯白（闪电核心 / 猫瞳中心）

/** 默认主题色（电系金，可被外部 themeColor 覆盖） */
const DEFAULT_THEME = ELECTRIC_GOLD;

// ══════════════════════════════════════════════════════
//  数据结构
// ══════════════════════════════════════════════════════

/** 放电猫猫视觉配置（数据驱动） */
export interface DischargeCatVisualConfig {
  /** 放电猫虚影半径（逻辑 px） */
  catRadius?: number;
  /** 电弧判定范围（逻辑 px） */
  arcRange?: number;
  /** 爆发持续（ms） */
  burstDurationMs?: number;
}

/** 电火花粒子（自管理，无需 ParticlePool） */
interface SparkParticle {
  x: number;
  y: number;
  vx: number; // px/s
  vy: number; // px/s
  life: number; // ms 累计
  maxLife: number; // ms
  size: number; // 逻辑半径
  color: number;
}

/** 锯齿点（用于多层叠加发光闪电） */
interface JaggedPoint {
  x: number;
  y: number;
}

export class DischargeCatRenderer {
  private entityContainer: PIXI.Container;
  private fieldContainer: PIXI.Container;
  private scale = 1;

  /** 每个玩家的放电猫虚影（常驻跟随） */
  private cats: Map<string, PIXI.Graphics> = new Map();

  constructor(entityContainer: PIXI.Container, fieldContainer: PIXI.Container) {
    this.entityContainer = entityContainer;
    this.fieldContainer = fieldContainer;
  }

  setScale(scale: number): void {
    this.scale = scale;
  }

  // ══════════════════════════════════════════════════════
  //  放电猫虚影（常驻跟随 - 8 层径向渐变 + 多层猫特征）
  // ══════════════════════════════════════════════════════

  /**
   * 更新放电猫虚影位置
   * @param playerId 玩家 ID
   * @param x 画布像素坐标 X
   * @param y 画布像素坐标 Y
   * @param isBurst 是否处于爆发态
   * @param themeColor 主题色（默认电系金）
   */
  updateCat(
    playerId: string,
    x: number,
    y: number,
    isBurst: boolean,
    themeColor = DEFAULT_THEME,
    palette?: Palette,
  ): void {
    const pal: Palette = palette ?? {
      primary: themeColor,
      glow: lighten(themeColor, 50),
      highlight: lighten(themeColor, 100),
      dim: dimColor(themeColor, 0.6),
      shadow: dimColor(themeColor, 0.3),
      accent: 0xFFCC00,
    };
    let cat = this.cats.get(playerId);
    if (!cat) {
      cat = new PIXI.Graphics();
      this.entityContainer.addChild(cat);
      this.cats.set(playerId, cat);
    }

    cat.position.set(x, y);
    this.drawCatPhantom(cat, isBurst ? 18 : 12, isBurst, pal.primary);
  }

  /**
   * 绘制放电猫虚影
   * - 8 层同心圆径向渐变（金→电青→透明）替代单色填充
   * - 双层耳朵（金色外晕 + 电青内）
   * - 多层猫瞳（电青外晕 + 金色瞳孔 + 黑色瞳仁）
   * - 爆发时四向电火花（多层发光）
   */
  private drawCatPhantom(
    g: PIXI.Graphics,
    radius: number,
    isBurst: boolean,
    themeColor: number,
  ): void {
    const s = this.scale;
    g.clear();

    // ── 8 层径向渐变主体（中心金 → 中段电青 → 边缘透明） ──
    for (let i = 0; i < 8; i++) {
      const t = i / 7; // 0 → 1
      const r = radius * s * (0.18 + 0.82 * t);
      // 前半段：金 → 电青；后半段：保持电青
      const color =
        t < 0.5
          ? this.interpolateColor(themeColor, ELECTRIC_MAIN, t * 2)
          : ELECTRIC_MAIN;
      const alpha = (1 - t) * 0.24 * (isBurst ? 1.3 : 1.0);
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }

    // ── 双层耳朵（外晕电青 + 内填金色） ──
    const earOffsetX = radius * 0.5;
    const earOffsetY = -radius * 0.8;
    const earW = radius * 0.32;
    const earH = radius * 0.42;
    for (const sign of [-1, 1]) {
      // 外晕（电青，宽）
      g.ellipse(sign * earOffsetX, earOffsetY, earW * 1.25, earH * 1.15);
      g.fill({ color: ELECTRIC_MAIN, alpha: isBurst ? 0.6 : 0.35 });
      // 内填（金色，窄）
      g.ellipse(sign * earOffsetX, earOffsetY, earW, earH);
      g.fill({ color: themeColor, alpha: isBurst ? 0.95 : 0.6 });
    }

    // ── 多层猫瞳（外晕电青 + 金色瞳孔 + 黑色瞳仁 + 白色高光） ──
    for (const sign of [-1, 1]) {
      const ex = sign * radius * 0.3;
      // 外晕
      g.circle(ex, 0, radius * 0.2);
      g.fill({ color: ELECTRIC_MAIN, alpha: isBurst ? 0.55 : 0.3 });
      // 金色瞳孔
      g.circle(ex, 0, radius * 0.14);
      g.fill({ color: themeColor, alpha: 1 });
      // 黑色瞳仁（竖瞳 - 猫眼）
      g.ellipse(ex, 0, radius * 0.04, radius * 0.12);
      g.fill({ color: 0x000000, alpha: 1 });
      // 白色高光点
      g.circle(ex + radius * 0.04, -radius * 0.04, radius * 0.03);
      g.fill({ color: ELECTRIC_WHITE, alpha: 0.9 });
    }

    // ── 爆发时四向电火花（多层发光短线） ──
    if (isBurst) {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const r1 = radius * s;
        const r2 = radius * s * 1.6;
        const x1 = Math.cos(a) * r1;
        const y1 = Math.sin(a) * r1;
        const x2 = Math.cos(a) * r2;
        const y2 = Math.sin(a) * r2;
        // 外晕（金色粗）
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.stroke({ color: themeColor, width: 2.5 * s, alpha: 0.4 });
        // 核心（白色细）
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.stroke({ color: ELECTRIC_WHITE, width: 0.8 * s, alpha: 0.95 });
      }
    }
  }

  /** 移除玩家放电猫 */
  removeCat(playerId: string): void {
    const cat = this.cats.get(playerId);
    if (cat) {
      this.entityContainer.removeChild(cat);
      cat.destroy();
      this.cats.delete(playerId);
    }
  }

  // ══════════════════════════════════════════════════════
  //  电弧弹射特效（链式闪电 - 三层叠加发光 + 电弧粒子）
  // ══════════════════════════════════════════════════════

  /**
   * 触发电弧弹射链特效
   * @param arcNodes arcNodes[0] = 放电猫位置，后续为命中目标位置
   * @param isBurst 是否爆发态（影响宽度与持续）
   * @param themeColor 主题色（默认电系金）
   * @returns ActiveEffect 由 EffectRenderer 统一 update(dt) 驱动
   */
  triggerArc(
    arcNodes: Array<{ x: number; y: number }>,
    isBurst: boolean,
    themeColor = DEFAULT_THEME,
    palette?: Palette,
  ): { effect: ActiveEffect | null } {
    if (arcNodes.length < 2) return { effect: null };

    const pal: Palette = palette ?? {
      primary: themeColor,
      glow: lighten(themeColor, 50),
      highlight: lighten(themeColor, 100),
      dim: dimColor(themeColor, 0.6),
      shadow: dimColor(themeColor, 0.3),
      accent: 0xFFCC00,
    };

    const s = this.scale;
    const g = new PIXI.Graphics();
    this.fieldContainer.addChild(g);

    const durationMs = isBurst ? 1200 : 800;
    const baseWidth = (isBurst ? 8 : 6) * s;

    // 电弧粒子（每次弹射生成 8-12 个电蓝色粒子）
    const particles: SparkParticle[] = [];
    for (let i = 1; i < arcNodes.length; i++) {
      const node = arcNodes[i];
      const count = 8 + Math.floor(Math.random() * 5);
      for (let p = 0; p < count; p++) {
        const ang = Math.random() * Math.PI * 2;
        const speed = (60 + Math.random() * 80) * s;
        particles.push({
          x: node.x,
          y: node.y,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed,
          life: 0,
          maxLife: 500 + Math.random() * 400,
          size: (2 + Math.random() * 2.5) * s,
          color: Math.random() < 0.5 ? ELECTRIC_MAIN : ELECTRIC_LIGHT,
        });
      }
    }

    const ef: ActiveEffect = {
      type: 'discharge_cat_arc',
      container: g as unknown as PIXI.Container,
      life: 0,
      maxLife: durationMs,
      onUpdate: (_ef, dt) => {
        const t = _ef.life / _ef.maxLife;
        g.clear();

        // 双回闪：0-20% 主闪、40-55% 回闪、70-80% 再闪
        let flashAlpha = 0;
        if (t < 0.2) flashAlpha = 1 - t * 3;
        else if (t >= 0.4 && t < 0.55) flashAlpha = 0.7 - (t - 0.4) * 3;
        else if (t >= 0.7 && t < 0.8) flashAlpha = 0.4 - (t - 0.7) * 3;
        const alpha = flashAlpha * 0.95;

        // ── 链式闪电（每段三层叠加发光 + 抖动偏移） ──
        if (flashAlpha > 0.05) {
          for (let i = 0; i < arcNodes.length - 1; i++) {
            const from = arcNodes[i];
            const to = arcNodes[i + 1];
            const jitter = Math.sin(t * 30 + i) * 3 * s;
            this.drawLightningSegment(g, from.x + jitter, from.y, to.x - jitter, to.y, baseWidth, alpha, pal.primary);
          }
        }

        // ── 命中点闪光（多层径向渐变 + 放大动画） ──
        for (let i = 1; i < arcNodes.length; i++) {
          const node = arcNodes[i];
          const flashPhase = t < 0.3 ? t / 0.3 : Math.max(0, 1 - (t - 0.3) / 0.7);
          const flashR = (15 + flashPhase * 12) * s;
          // 外晕（电青）
          g.circle(node.x, node.y, flashR * 2);
          g.fill({ color: ELECTRIC_MAIN, alpha: flashAlpha * 0.2 });
          // 中层（金色）
          g.circle(node.x, node.y, flashR * 1.2);
          g.fill({ color: pal.primary, alpha: flashAlpha * 0.45 });
          // 核心（白色）
          g.circle(node.x, node.y, flashR * 0.5);
          g.fill({ color: ELECTRIC_WHITE, alpha: flashAlpha * 0.9 });
        }

        // ── 放射闪电（命中点向四周爆散） ──
        if (flashAlpha > 0.1) {
          for (let i = 1; i < arcNodes.length; i++) {
            const node = arcNodes[i];
            const boltCount = isBurst ? 8 : 5;
            for (let b = 0; b < boltCount; b++) {
              const angle = (b / boltCount) * Math.PI * 2 + i * 0.5;
              const len = (20 + Math.random() * 30) * s;
              const ex = node.x + Math.cos(angle) * len;
              const ey = node.y + Math.sin(angle) * len;
              this.strokePolyline(g,
                this.generateJaggedPoints(node.x, node.y, ex, ey, 8 * s),
                ELECTRIC_LIGHT, baseWidth * 0.5, flashAlpha * 0.5);
            }
          }
        }

        // ── 电弧粒子更新与绘制 ──
        this.updateAndDrawParticles(g, particles, dt);
      },
      onDecay: () => {
        this.fieldContainer.removeChild(g);
        g.destroy();
      },
    };
    return { effect: ef };
  }

  /**
   * 绘制带锯齿的闪电线段（三层叠加发光）
   * - 外层发光：粗白色低透明度（width 4，alpha 0.3）
   * - 主色闪电：中电青（width 2，alpha 0.9）
   * - 核心高亮：白色细线（width 0.8，alpha 1）
   * 锯齿点每帧重新生成，制造闪电抖动感
   */
  private drawLightningSegment(
    g: PIXI.Graphics,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    baseWidth: number,
    alpha: number,
    themeColor: number,
  ): void {
    const s = this.scale;
    // 生成锯齿点（每帧随机，制造抖动）
    const pts = this.generateJaggedPoints(x1, y1, x2, y2, 15 * s);

    // 外层发光：粗白色低透明度（光晕扩散感）
    this.strokePolyline(g, pts, ELECTRIC_WHITE, baseWidth * 1.6, alpha * 0.3);

    // 主色闪电：中电青
    this.strokePolyline(g, pts, ELECTRIC_MAIN, baseWidth * 0.8, alpha * 0.9);

    // 主题色辉光（金色边缘 - 与猫的金色呼应）
    this.strokePolyline(g, pts, themeColor, baseWidth * 1.1, alpha * 0.4);

    // 核心高亮：白色细线
    this.strokePolyline(g, pts, ELECTRIC_WHITE, Math.max(0.8, baseWidth * 0.3), alpha);
  }

  // ══════════════════════════════════════════════════════
  //  雷霆万钧爆发（三阶段动画 + 狮子彩蛋）
  // ══════════════════════════════════════════════════════

  /**
   * 触发雷霆万钧爆发特效
   * @param playerId 玩家 ID
   * @param x 画布像素坐标 X
   * @param y 画布像素坐标 Y
   * @param radius 爆发范围（逻辑 px）
   * @param durationMs 持续时间（ms，数据驱动）
   * @param themeColor 主题色（默认电系金）
   * @returns ActiveEffect 由 EffectRenderer 统一 update(dt) 驱动
   */
  triggerBurst(
    _playerId: string,
    x: number,
    y: number,
    radius: number,
    durationMs: number,
    themeColor = DEFAULT_THEME,
    palette?: Palette,
  ): { effect: ActiveEffect | null } {
    const pal: Palette = palette ?? {
      primary: themeColor,
      glow: lighten(themeColor, 50),
      highlight: lighten(themeColor, 100),
      dim: dimColor(themeColor, 0.6),
      shadow: dimColor(themeColor, 0.3),
      accent: 0xFFCC00,
    };

    const s = this.scale;
    const r = radius * s;
    const g = new PIXI.Graphics();
    g.position.set(x, y);
    this.fieldContainer.addChild(g);

    // 电火花粒子池（爆发瞬间生成大量粒子）
    const particles: SparkParticle[] = [];
    const sparkCount = 24;
    for (let i = 0; i < sparkCount; i++) {
      const ang = (i / sparkCount) * Math.PI * 2 + Math.random() * 0.4;
      const speed = (60 + Math.random() * 80) * s;
      const isGold = Math.random() < 0.4;
      particles.push({
        x: 0,
        y: 0,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        life: 0,
        maxLife: 600 + Math.random() * 400,
        size: (1.2 + Math.random() * 1.8) * s,
        color: isGold ? pal.primary : Math.random() < 0.5 ? ELECTRIC_MAIN : ELECTRIC_LIGHT,
      });
    }

    const ef: ActiveEffect = {
      type: 'discharge_cat_burst',
      container: g as unknown as PIXI.Container,
      life: 0,
      maxLife: durationMs,
      onUpdate: (_ef, dt) => {
        const T = _ef.maxLife;
        const life = _ef.life;
        const t = life / T;
        g.clear();

        // ── 阶段划分 ──
        const phase1End = T * 0.15; // 蓄电：0-15%T
        const phase2End = T * 0.30; // 放电：15-30%T
        // 余电：30-100%T

        // ── 狮子形态彩蛋（前 0.3s 金色能量鬃毛） ──
        // 用绝对时间 300ms，与 durationMs 解耦
        if (life < 300) {
          const maneAlpha = 1 - life / 300;
          this.drawLionManeBurst(g, r, maneAlpha, life, pal.primary);
        }

        if (life < phase1End) {
          // ═══ 阶段 1：蓄电 - 电弧向中心汇聚 ═══
          const p1 = life / phase1End;
          const eased = easeOutCubic(p1);

          // 雷霆核心：从中心显现并放大（0.3 → 1.0）
          const coreScale = 0.3 + 0.7 * eased;
          const coreAlpha = p1;
          this.drawThunderCore(g, r * 0.6 * coreScale, coreAlpha, pal.primary);

          // 汇聚电弧：8 条从外向内的锯齿闪电（外半径随 p1 收缩）
          const outerR = r * (1.0 - 0.6 * eased);
          this.drawConvergingRays(g, outerR, r * 0.15, p1 * 0.8, pal.primary);

          // 中心猫瞳未显现
          // 电弧环未显现
        } else if (life < phase2End) {
          // ═══ 阶段 2：放电 - 闪电爆发 ═══
          const p2 = (life - phase1End) / (phase2End - phase1End);
          const eased = easeOutCubic(p2);

          // 雷霆核心：完整显现
          this.drawThunderCore(g, r * 0.6, 1.0, pal.primary);

          // 放射闪电：8 条从中心向外的锯齿闪电（多层叠加发光）
          const rayLen = r * (0.5 + 0.5 * eased);
          this.drawRadialLightning(g, rayLen, 8, 1.0, pal.primary);

          // 电弧环：3 层扩散圆环（电青色，带闪烁感）
          this.drawArcRings(g, r, p2, 1.0);

          // 中心猫瞳：金色高亮六边形 + 电青色外晕（显现）
          this.drawCatEye(g, r * 0.12 * (0.5 + 0.5 * eased), p2);
        } else {
          // ═══ 阶段 3：余电 - 金色能量扩散，电弧消散 ═══
          const p3 = (life - phase2End) / (T - phase2End);

          // 雷霆核心：转向金色并淡出
          const coreScale = 1.0 + 0.3 * p3;
          const coreAlpha = 1.0 - 0.7 * p3;
          this.drawThunderCore(g, r * 0.6 * coreScale, coreAlpha, pal.primary, true);

          // 放射闪电：消散（alpha 衰减 + 长度收缩）
          const rayLen = r * (1.0 - 0.4 * p3);
          this.drawRadialLightning(g, rayLen, 8, 1.0 - p3, pal.primary);

          // 电弧环：继续扩散并消散
          this.drawArcRings(g, r, 1.0 + p3, 1.0 - p3);

          // 金色能量扩散环（余电特征）
          const goldR = r * (0.5 + 1.0 * p3);
          g.circle(0, 0, goldR);
          g.stroke({ color: pal.primary, width: 2 * s, alpha: 0.4 * (1 - p3) });
          g.circle(0, 0, goldR * 0.92);
          g.stroke({ color: ELECTRIC_YELLOW, width: 0.6 * s, alpha: 0.5 * (1 - p3) });

          // 中心猫瞳：脉冲淡出
          const eyePulse = 0.5 + 0.5 * Math.sin(p3 * Math.PI * 3);
          this.drawCatEye(g, r * 0.12 * (1 - 0.3 * p3), (1 - p3) * eyePulse);
        }

        // ── 电火花粒子（贯穿三阶段） ──
        this.updateAndDrawParticles(g, particles, dt);

        // 避免未使用警告
        void t;
      },
      onDecay: () => {
        this.fieldContainer.removeChild(g);
        g.destroy();
      },
    };
    return { effect: ef };
  }

  // ══════════════════════════════════════════════════════
  //  爆发视觉元素绘制（私有）
  // ══════════════════════════════════════════════════════

  /**
   * 绘制雷霆核心：10 层同心圆（白→电青→金→透明）+ 中心实心核 + 边缘辉光
   * @param toGold 是否转向金色（余电阶段）
   */
  private drawThunderCore(
    g: PIXI.Graphics,
    coreR: number,
    alpha: number,
    themeColor: number,
    toGold = false,
  ): void {
    const s = this.scale;
    // 10 层同心圆径向渐变
    for (let i = 0; i < 10; i++) {
      const t = i / 9; // 0 → 1
      const r = coreR * (0.08 + 0.92 * t);
      // 颜色分段：白 → 浅电蓝 → 主电青 → 金
      let color: number;
      if (t < 0.2) {
        color = this.interpolateColor(ELECTRIC_WHITE, ELECTRIC_LIGHT, t / 0.2);
      } else if (t < 0.5) {
        color = this.interpolateColor(ELECTRIC_LIGHT, ELECTRIC_MAIN, (t - 0.2) / 0.3);
      } else if (t < 0.8) {
        color = this.interpolateColor(ELECTRIC_MAIN, ELECTRIC_DEEP, (t - 0.5) / 0.3);
      } else {
        // 末端过渡到金（余电阶段加强）
        color = toGold
          ? this.interpolateColor(ELECTRIC_DEEP, themeColor, (t - 0.8) / 0.2)
          : this.interpolateColor(ELECTRIC_DEEP, ELECTRIC_MAIN, (t - 0.8) / 0.2);
      }
      const a = (1 - t) * 0.28 * alpha;
      g.circle(0, 0, r);
      g.fill({ color, alpha: a });
    }

    // 中心实心核（白色 → 金色，余电阶段转金）
    const coreColor = toGold ? themeColor : ELECTRIC_WHITE;
    g.circle(0, 0, 4 * s);
    g.fill({ color: coreColor, alpha });

    // 边缘辉光环（电青色，余电阶段转金）
    const haloColor = toGold ? themeColor : ELECTRIC_MAIN;
    g.circle(0, 0, 6 * s);
    g.stroke({ color: haloColor, width: 1.2 * s, alpha: alpha * 0.8 });
  }

  /**
   * 绘制汇聚电弧（阶段 1）：8 条从外向内的锯齿闪电
   * @param outerR 起始外半径（随蓄电收缩）
   * @param innerR 终止内半径
   */
  private drawConvergingRays(
    g: PIXI.Graphics,
    outerR: number,
    innerR: number,
    alpha: number,
    themeColor: number,
  ): void {
    const s = this.scale;
    const count = 8;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const sx = Math.cos(a) * outerR;
      const sy = Math.sin(a) * outerR;
      const ex = Math.cos(a) * innerR;
      const ey = Math.sin(a) * innerR;
      const pts = this.generateJaggedPoints(sx, sy, ex, ey, 8 * s);
      // 三层叠加发光
      this.strokePolyline(g, pts, ELECTRIC_WHITE, 3 * s, alpha * 0.3);
      this.strokePolyline(g, pts, ELECTRIC_MAIN, 1.5 * s, alpha * 0.85);
      this.strokePolyline(g, pts, themeColor, 1 * s, alpha * 0.4);
      this.strokePolyline(g, pts, ELECTRIC_WHITE, 0.6 * s, alpha);
    }
  }

  /**
   * 绘制放射闪电（阶段 2/3）：N 条从中心向外的锯齿闪电（多层叠加发光）
   * @param rayR 闪电长度
   * @param count 闪电条数
   */
  private drawRadialLightning(
    g: PIXI.Graphics,
    rayR: number,
    count: number,
    alpha: number,
    themeColor: number,
  ): void {
    const s = this.scale;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const ex = Math.cos(a) * rayR;
      const ey = Math.sin(a) * rayR;
      const pts = this.generateJaggedPoints(0, 0, ex, ey, 10 * s);
      // 外层发光（粗白低透明）
      this.strokePolyline(g, pts, ELECTRIC_WHITE, 4 * s, alpha * 0.3);
      // 主题色辉光（金色边缘）
      this.strokePolyline(g, pts, themeColor, 2.4 * s, alpha * 0.4);
      // 主色闪电（中电青）
      this.strokePolyline(g, pts, ELECTRIC_MAIN, 1.8 * s, alpha * 0.9);
      // 核心高亮（白细）
      this.strokePolyline(g, pts, ELECTRIC_WHITE, 0.8 * s, alpha);
    }
  }

  /**
   * 绘制电弧环（3 层扩散圆环，电青色带闪烁感）
   * @param baseR 基准半径
   * @param progress 扩散进度 0-1（+）
   * @param alpha 整体透明度
   */
  private drawArcRings(
    g: PIXI.Graphics,
    baseR: number,
    progress: number,
    alpha: number,
  ): void {
    const s = this.scale;
    // 3 层不同进度与相位的扩散环
    for (let i = 0; i < 3; i++) {
      const layerProgress = (progress + i * 0.33) % 1;
      const ringR = baseR * (0.4 + 0.6 * layerProgress);
      const ringAlpha = alpha * (1 - layerProgress) * 0.7;
      // 闪烁感：sin 波动
      const flicker = 0.7 + 0.3 * Math.sin(layerProgress * Math.PI * 6);
      // 主环（电青）
      g.circle(0, 0, ringR);
      g.stroke({ color: ELECTRIC_MAIN, width: 2 * s, alpha: ringAlpha * flicker });
      // 内细环（白色高亮）
      g.circle(0, 0, ringR * 0.96);
      g.stroke({ color: ELECTRIC_WHITE, width: 0.5 * s, alpha: ringAlpha * flicker * 0.8 });
    }
  }

  /**
   * 绘制中心猫瞳（金色高亮六边形 + 电青色外晕）
   * @param size 猫瞳外接圆半径
   */
  private drawCatEye(g: PIXI.Graphics, size: number, alpha: number): void {
    const s = this.scale;
    if (alpha <= 0) return;

    // 电青色外晕（圆形光晕，2 层）
    g.circle(0, 0, size * 1.8);
    g.fill({ color: ELECTRIC_MAIN, alpha: alpha * 0.25 });
    g.circle(0, 0, size * 1.3);
    g.fill({ color: ELECTRIC_MAIN, alpha: alpha * 0.4 });

    // 金色高亮六边形（猫眼意象 - 6 顶点）
    const hexPts: number[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      hexPts.push(Math.cos(a) * size, Math.sin(a) * size);
    }
    // 外层金色填充
    g.poly(hexPts, true);
    g.fill({ color: ELECTRIC_GOLD, alpha: alpha * 0.8 });

    // 内层金色高亮（缩小六边形）
    const innerPts: number[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      innerPts.push(Math.cos(a) * size * 0.6, Math.sin(a) * size * 0.6);
    }
    g.poly(innerPts, true);
    g.fill({ color: ELECTRIC_YELLOW, alpha: alpha });

    // 中心黑色竖瞳（猫眼）
    g.ellipse(0, 0, size * 0.12, size * 0.5);
    g.fill({ color: 0x000000, alpha: alpha });

    // 白色高光点
    g.circle(size * 0.2, -size * 0.2, size * 0.1);
    g.fill({ color: ELECTRIC_WHITE, alpha: alpha * 0.9 });

    // 避免未使用警告
    void s;
  }

  /**
   * 绘制狮子形态彩蛋（前 0.3s 金色能量爆发）
   * - 多层同心圆（白→金→透明）模拟能量核心
   * - 12 条锯齿鬃毛光线（多层叠加发光）模拟狮子鬃毛能量感
   * @param alpha 整体透明度（随时间衰减）
   * @param time 累计时间（ms，用于缓慢旋转与长度脉动）
   */
  private drawLionManeBurst(
    g: PIXI.Graphics,
    radius: number,
    alpha: number,
    time: number,
    themeColor: number,
  ): void {
    const s = this.scale;
    const maneR = radius * 0.85;

    // ── 多层同心圆能量核心（白→金→透明，6 层） ──
    for (let i = 0; i < 6; i++) {
      const t = i / 5; // 0 → 1
      const r = maneR * 0.5 * (0.15 + 0.85 * t);
      const color =
        t < 0.5
          ? this.interpolateColor(ELECTRIC_WHITE, themeColor, t * 2)
          : themeColor;
      const a = (1 - t) * 0.4 * alpha;
      g.circle(0, 0, r);
      g.fill({ color, alpha: a });
    }

    // ── 12 条锯齿鬃毛光线（多层叠加发光 + 缓慢旋转 + 长度脉动） ──
    const maneCount = 12;
    const rot = time * 0.0008; // 缓慢旋转
    for (let i = 0; i < maneCount; i++) {
      const a = (i / maneCount) * Math.PI * 2 + rot;
      // 长度脉动（不同鬃毛错相位）
      const lenFactor = 0.8 + 0.2 * Math.sin(time * 0.012 + i * 0.7);
      const innerR = maneR * 0.35;
      const outerR = maneR * 1.1 * lenFactor;
      const sx = Math.cos(a) * innerR;
      const sy = Math.sin(a) * innerR;
      const ex = Math.cos(a) * outerR;
      const ey = Math.sin(a) * outerR;
      const pts = this.generateJaggedPoints(sx, sy, ex, ey, 6 * s);
      // 外层金色发光（粗）
      this.strokePolyline(g, pts, themeColor, 3.5 * s, alpha * 0.4);
      // 中层黄色
      this.strokePolyline(g, pts, ELECTRIC_YELLOW, 1.8 * s, alpha * 0.7);
      // 核心白色
      this.strokePolyline(g, pts, ELECTRIC_WHITE, 0.7 * s, alpha);
    }
  }

  // ══════════════════════════════════════════════════════
  //  粒子系统（自管理，无需 ParticlePool 依赖）
  // ══════════════════════════════════════════════════════

  /**
   * 更新并绘制粒子（每帧调用）
   * - 位置积分（dt 单位 ms，速度单位 px/s）
   * - 透明度随生命衰减
   * - 双层绘制（外晕 + 核心）模拟发光粒子
   */
  private updateAndDrawParticles(
    g: PIXI.Graphics,
    particles: SparkParticle[],
    dt: number,
  ): void {
    const s = this.scale;
    const dtSec = dt / 1000;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        particles.splice(i, 1);
        continue;
      }
      // 位置积分
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;
      // 阻尼（模拟空气阻力，能量消散）
      const damp = Math.pow(0.96, dtSec * 60);
      p.vx *= damp;
      p.vy *= damp;

      const t = p.life / p.maxLife;
      const alpha = (1 - t) * 0.9;
      // 外晕（粗低透明）
      g.circle(p.x, p.y, p.size * 1.8);
      g.fill({ color: p.color, alpha: alpha * 0.3 });
      // 核心（实心）
      g.circle(p.x, p.y, p.size);
      g.fill({ color: ELECTRIC_WHITE, alpha: alpha * 0.8 });
    }
    void s;
  }

  // ══════════════════════════════════════════════════════
  //  几何工具（私有）
  // ══════════════════════════════════════════════════════

  /**
   * 生成锯齿点序列（每帧随机，制造闪电抖动感）
   * @param jitterAmplitude 最大垂直偏移幅度
   */
  private generateJaggedPoints(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    jitterAmplitude: number,
  ): JaggedPoint[] {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const segments = Math.max(3, Math.floor(dist / 18));
    const nx = -dy / dist; // 法线 x
    const ny = dx / dist; // 法线 y
    const pts: JaggedPoint[] = [{ x: x1, y: y1 }];
    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const jitter = (Math.random() - 0.5) * 2 * jitterAmplitude;
      pts.push({
        x: x1 + dx * t + nx * jitter,
        y: y1 + dy * t + ny * jitter,
      });
    }
    pts.push({ x: x2, y: y2 });
    return pts;
  }

  /**
   * 沿点序列绘制折线并描边（PIXI.Graphics 每次 moveTo+lineTo 后 stroke）
   * 用于多层叠加发光闪电
   */
  private strokePolyline(
    g: PIXI.Graphics,
    pts: JaggedPoint[],
    color: number,
    width: number,
    alpha: number,
  ): void {
    if (pts.length < 2 || alpha <= 0) return;
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      g.lineTo(pts[i].x, pts[i].y);
    }
    g.stroke({ color, width, alpha });
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

  // ══════════════════════════════════════════════════════
  //  清理
  // ══════════════════════════════════════════════════════

  clear(): void {
    this.cats.forEach((_, playerId) => this.removeCat(playerId));
  }

  destroy(): void {
    this.clear();
  }
}
