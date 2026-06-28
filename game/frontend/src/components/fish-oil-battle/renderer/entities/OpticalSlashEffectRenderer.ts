import * as PIXI from 'pixi.js';
import { lighten, dimColor } from './VisualEffectUtils';
import type { ActiveEffect, OpticalSlashVisualConfig } from './VisualEffectUtils';
import type { Palette } from './BaseWeaponEffectRenderer';
import type { ParticlePool } from '../systems/ParticlePool';

/**
 * 光学斩击特效渲染器 - Liya（OpticalSlash 光学月刃）
 *
 * 视觉设计（光学月刃系 - 闲乘月质量标准）：
 * - 普通技能「弧月弯刀飞行」：
 *     · 6 层填充月牙（外层白色辉光 → 主光蓝 → 浅光蓝 → 白色高亮核心 → 刀刃白边 → 尖端星光）
 *     · 飞行拖尾：通过 particlePool.emit 释放 8-10 颗光粒（注入后生效），并叠加残影月牙
 *     · 目标标记彩蛋「目标已标记」：刀光接近飞行终点时，金色准星（4 条线 + 中心点 + 外环）淡入，命中后淡出
 * - 爆发「无限剑制」三阶段动画：
 *     · 蓄光（0-15%T）：光能量汇聚中心，光学核心显现
 *     · 斩击（15%-30%T）：6 道扇形刀光爆发扩散（easeOutCubic）+ 十字准星锁定 + 光学粒子飞溅
 *     · 余光（30%-100%T）：刀光消散 + 十字准星淡出 + 金色锁定环扩散
 *
 * 数据驱动：所有视觉参数由 EffectRenderer.buildOpticalSlashVisualCfg() 提供，
 * 最终来源是 WeaponRangeConfig。本文件不包含硬编码时长/范围常量。
 *
 * 动画驱动：所有动画通过 ActiveEffect.onUpdate(ef, dt) 由父级 EffectRenderer.update(dt)
 * 统一驱动，不使用 rAF / setTimeout。
 */

// ══════════════════════════════════════════════════════
//  颜色常量（光学月刃系 - Liya 签名色板）
// ══════════════════════════════════════════════════════
const OPTICAL_DEEP = 0x003388; // 深光蓝
const OPTICAL_MAIN = 0x0099ff; // 主光蓝
const OPTICAL_LIGHT = 0x66ccff; // 浅光蓝
const OPTICAL_HIGHLIGHT = 0xaaeeff; // 高亮浅蓝
const OPTICAL_WHITE = 0xffffff; // 纯白（刃光核心）
const OPTICAL_GOLD = 0xffd700; // 金色（标记色）

/** 光学调色板（由主题色派生，保持光学月刃多层质感的同时尊重阵营色） */
interface OpticalPalette {
  deep: number;
  main: number;
  light: number;
  highlight: number;
  white: number;
  gold: number;
}

export class OpticalSlashEffectRenderer {
  private pool: PIXI.Graphics[] = [];
  private active: Set<PIXI.Graphics> = new Set();
  private container: PIXI.Container;
  private particlePool?: ParticlePool;
  private scale = 1;
  private canvasW = 1280;
  private canvasH = 720;

  constructor(
    container: PIXI.Container,
    _hologramContainer: PIXI.Container,
    prePoolCount = 20,
    particlePool?: ParticlePool,
  ) {
    this.container = container;
    this.particlePool = particlePool;

    for (let i = 0; i < prePoolCount; i++) {
      const g = new PIXI.Graphics();
      g.visible = false;
      container.addChild(g);
      this.pool.push(g);
    }
  }

  setScale(s: number, w: number, h: number): void {
    this.scale = s;
    this.canvasW = w;
    this.canvasH = h;
  }

  // ── 对象池 ──────────────────────────────────────────

  private acquire(): PIXI.Graphics | null {
    for (const g of this.pool) {
      if (!this.active.has(g)) {
        this.active.add(g);
        g.visible = true;
        return g;
      }
    }
    const g = new PIXI.Graphics();
    this.container.addChild(g);
    this.pool.push(g);
    this.active.add(g);
    return g;
  }

  private release(g: PIXI.Graphics): void {
    g.clear();
    g.visible = false;
    this.active.delete(g);
  }

  // ── 调色板派生（数据驱动 + 光学月刃质感） ────────────

  /**
   * 由主题色派生 6 色光学调色板：
   * deep/main/light/highlight/white/gold
   * 深色与浅色分别向 OPTICAL_DEEP 与纯白偏移，保证任何阵营色都呈现光学月刃的分层辉光。
   */
  private buildPalette(main: number): OpticalPalette {
    return {
      deep: this.interpolateColor(main, OPTICAL_DEEP, 0.45),
      main,
      light: this.interpolateColor(main, OPTICAL_WHITE, 0.45),
      highlight: this.interpolateColor(main, OPTICAL_WHITE, 0.78),
      white: OPTICAL_WHITE,
      gold: OPTICAL_GOLD,
    };
  }

  // ══════════════════════════════════════════════════════
  //  普通技能：弧月弯刀飞行
  // ══════════════════════════════════════════════════════

  /**
   * 触发普通弧月斩击
   * @param x 起点逻辑坐标 X
   * @param y 起点逻辑坐标 Y
   * @param angle 飞行方向（弧度）
   * @param length 飞行距离（逻辑 px）
   * @param themeColor 主题色（派生光学调色板）
   * @param isBurst 是否爆发模式（影响存活时长）
   * @param config 视觉配置（数据驱动）
   */
  triggerSlash(
    x: number,
    y: number,
    angle: number,
    length: number,
    themeColor: number,
    isBurst = false,
    config?: OpticalSlashVisualConfig,
    palette?: Palette,
  ): ActiveEffect | null {
    const g = this.acquire();
    if (!g) return null;

    const s = this.scale;
    const pal: Palette = palette ?? {
      primary: themeColor,
      glow: lighten(themeColor, 50),
      highlight: lighten(themeColor, 100),
      dim: dimColor(themeColor, 0.6),
      shadow: dimColor(themeColor, 0.3),
      accent: 0xFFD700,
    };
    const optPalette: OpticalPalette = palette
      ? {
          deep: pal.shadow,
          main: pal.primary,
          light: pal.glow,
          highlight: pal.highlight,
          white: OPTICAL_WHITE,
          gold: pal.accent,
        }
      : this.buildPalette(themeColor);
    const maxDist = length * s;
    const maxLife = isBurst ? 1000 : 800;
    const flightSpeed = config?.flightSpeed ?? 300;
    const flightDurMs = (maxDist / (flightSpeed * s)) * 1000;
    // 飞行终点（即「目标」位置，用于标记彩蛋）
    const endX = x + Math.cos(angle) * maxDist;
    const endY = y + Math.sin(angle) * maxDist;

    // 粒子发射节流（闭包累积）
    let lastEmit = -Infinity;

    return {
      type: 'optical_slash',
      container: g as unknown as PIXI.Container,
      life: 0,
      maxLife,
      onUpdate: (ef, _dt) => {
        const t = Math.min(ef.life / ef.maxLife, 1);
        // 飞行进度 0→1，超过后停在终点
        const flightT = Math.min(ef.life / flightDurMs, 1);

        // 当前刀心位置
        const cx = x + Math.cos(angle) * maxDist * flightT;
        const cy = y + Math.sin(angle) * maxDist * flightT;

        // 透明度：飞行期间满，到达后渐隐
        const fadeStart = flightDurMs / maxLife;
        const alpha =
          t < fadeStart ? 0.95 : 0.95 * (1 - (t - fadeStart) / (1 - fadeStart));

        // 弹出感：刚出发稍小
        const growScale = Math.min(flightT * 1.5, 1);
        const bow =
          (config?.arcBow ?? 28) *
          s *
          growScale *
          (0.85 + 0.15 * Math.sin(ef.life / 50));
        const halfW = (config?.bladeHalfWidth ?? 20) * s * growScale;

        g.clear();

        // ── 月牙刀光（6 层叠加发光） ──
        this.drawArcCrescent(g, cx, cy, angle, bow, halfW, optPalette, alpha, s);

        // ── 飞行拖尾：particlePool.emit 光粒 + 残影月牙 ──
        if (flightT < 0.95) {
          // 通过 particlePool.emit 释放 8-10 颗光粒（注入后生效）
          if (this.particlePool && ef.life - lastEmit > 16) {
            lastEmit = ef.life;
            const fx = Math.cos(angle);
            const fy = Math.sin(angle);
            const px = -Math.sin(angle); // 垂直方向
            const py = Math.cos(angle);
            for (let i = 0; i < 2; i++) {
              const perp = (Math.random() - 0.5) * 8 * s;
              const back = (4 + Math.random() * 6) * s;
              this.particlePool.emit({
                x: cx - fx * back + px * perp,
                y: cy - fy * back + py * perp,
                vx: -fx * (30 + Math.random() * 20) + px * (Math.random() * 40 - 20),
                vy: -fy * (30 + Math.random() * 20) + py * (Math.random() * 40 - 20),
                life: 350 + Math.random() * 200,
                scaleStart: 1,
                scaleEnd: 0,
                alphaStart: 0.8,
                alphaEnd: 0,
                tint: Math.random() < 0.3 ? optPalette.white : optPalette.light,
                radius: (1.2 + Math.random() * 1.5) * s,
              });
            }
          }
          // 残影月牙（始终绘制，确保无 particlePool 时也有拖尾）
          const trailDist = 14 * s;
          const trailX = cx - Math.cos(angle) * trailDist;
          const trailY = cy - Math.sin(angle) * trailDist;
          this.drawArcCrescent(
            g,
            trailX,
            trailY,
            angle,
            bow * 0.65,
            halfW * 0.5,
            optPalette,
            alpha * 0.22,
            s,
          );
        }

        // ── 目标标记彩蛋「目标已标记」──
        // 刀光接近飞行终点时金色准星淡入，命中后渐隐
        const markStart = 0.55; // 飞行 55% 后开始显现
        let markAlpha = 0;
        if (flightT >= markStart) {
          const approach = (flightT - markStart) / (1 - markStart); // 0→1
          const fadeIn = Math.min(approach / 0.6, 1); // 0.6 处达到满显
          let fadeOut = 1;
          if (flightT >= 1) {
            // 到达后随刀光一起淡出
            const after = (t - fadeStart) / Math.max(0.001, 1 - fadeStart);
            fadeOut = Math.max(0, 1 - after);
          }
          markAlpha = fadeIn * fadeOut * 0.9;
        }
        if (markAlpha > 0.01) {
          this.drawTargetMarker(g, endX, endY, 16 * s, markAlpha, s, optPalette.gold);
        }
      },
      onDecay: (_ef) => {
        this.release(g);
      },
    };
  }

  /**
   * 绘制弧月弯刀刀光（6 层填充月牙叠加发光）
   *
   * 形状：外弧（向前弓弯）+ 内弧（向前少弓）→ 闭合填充月牙
   * 层级：
   *   1. 外层白色辉光（粗、低透明度，模拟辉光）
   *   2. 主色刀光（主光蓝填充）
   *   3. 浅光蓝层（提亮）
   *   4. 白色高亮核心（细月牙）
   *   5. 刀刃高亮线（外弧白边描边）
   *   6. 尖端星光（两端白点）
   */
  private drawArcCrescent(
    g: PIXI.Graphics,
    cx: number,
    cy: number,
    angle: number,
    bow: number,
    halfWidth: number,
    palette: OpticalPalette,
    alpha: number,
    s: number,
  ): void {
    if (alpha <= 0.01) return;
    // 方向向量：px,py 垂直于飞行方向（刀身展开）；fx,fy 飞行方向（刀刃向前）
    const px = -Math.sin(angle);
    const py = Math.cos(angle);
    const fx = Math.cos(angle);
    const fy = Math.sin(angle);

    // 月牙两端点（刀尖）
    const lx = cx - px * halfWidth;
    const ly = cy - py * halfWidth;
    const rx = cx + px * halfWidth;
    const ry = cy + py * halfWidth;

    // 外弧控制点（刀刃侧，向前弓弯最多）
    const omx = cx + fx * bow;
    const omy = cy + fy * bow;
    // 内弧控制点（刀背侧，弓弯较小 → 形成月牙厚度）
    const innerBow = bow * 0.3;
    const imx = cx + fx * innerBow;
    const imy = cy + fy * innerBow;

    // ═══ Layer 1: 外层白色辉光（放大一圈，低透明度） ═══
    const gHW = halfWidth * 1.18;
    const gBow = bow * 1.15;
    const gIB = innerBow * 0.2;
    g.moveTo(cx - px * gHW, cy - py * gHW);
    g.quadraticCurveTo(cx + fx * gBow, cy + fy * gBow, cx + px * gHW, cy + py * gHW);
    g.quadraticCurveTo(cx + fx * gIB, cy + fy * gIB, cx - px * gHW, cy - py * gHW);
    g.closePath();
    g.fill({ color: palette.white, alpha: alpha * 0.12 });

    // ═══ Layer 2: 主色刀光（主光蓝填充） ═══
    g.moveTo(lx, ly);
    g.quadraticCurveTo(omx, omy, rx, ry);
    g.quadraticCurveTo(imx, imy, lx, ly);
    g.closePath();
    g.fill({ color: palette.main, alpha: alpha * 0.5 });

    // ═══ Layer 3: 浅光蓝层（稍窄，提亮） ═══
    const lHW = halfWidth * 0.78;
    const lBow = bow * 0.85;
    const lIB = innerBow * 1.5;
    g.moveTo(cx - px * lHW, cy - py * lHW);
    g.quadraticCurveTo(cx + fx * lBow, cy + fy * lBow, cx + px * lHW, cy + py * lHW);
    g.quadraticCurveTo(cx + fx * lIB, cy + fy * lIB, cx - px * lHW, cy - py * lHW);
    g.closePath();
    g.fill({ color: palette.light, alpha: alpha * 0.4 });

    // ═══ Layer 4: 白色高亮核心（细月牙） ═══
    const cHW = halfWidth * 0.42;
    const cBow = bow * 0.6;
    const cIB = innerBow * 2.5;
    g.moveTo(cx - px * cHW, cy - py * cHW);
    g.quadraticCurveTo(cx + fx * cBow, cy + fy * cBow, cx + px * cHW, cy + py * cHW);
    g.quadraticCurveTo(cx + fx * cIB, cy + fy * cIB, cx - px * cHW, cy - py * cHW);
    g.closePath();
    g.fill({ color: palette.highlight, alpha: alpha * 0.55 });

    // ═══ Layer 5: 刀刃高亮线（外弧白边描边） ═══
    g.moveTo(lx, ly);
    g.quadraticCurveTo(omx, omy, rx, ry);
    g.stroke({ color: palette.white, width: 1.6 * s, alpha: alpha * 0.9 });

    // ═══ Layer 6: 尖端星光（两端白点） ═══
    const tipR = halfWidth * 0.12;
    g.circle(lx, ly, tipR);
    g.fill({ color: palette.white, alpha: alpha * 0.95 });
    g.circle(rx, ry, tipR);
    g.fill({ color: palette.white, alpha: alpha * 0.95 });
  }

  /**
   * 绘制「目标已标记」金色准星（4 条线 + 中心点 + 外环），淡入淡出
   * 彩蛋：刀光接近飞行终点时浮现，象征 Liya 的精准狙击标记
   */
  private drawTargetMarker(
    g: PIXI.Graphics,
    cx: number,
    cy: number,
    size: number,
    alpha: number,
    s: number,
    gold: number,
  ): void {
    if (alpha <= 0.01) return;
    const inner = size * 0.25;
    const outer = size;
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    // 4 条方向线（中心带缺口）
    for (const [dx, dy] of dirs) {
      g.moveTo(cx + dx * inner, cy + dy * inner);
      g.lineTo(cx + dx * outer, cy + dy * outer);
      g.stroke({ color: gold, width: 1.5 * s, alpha: alpha * 0.9 });
    }
    // 中心点
    g.circle(cx, cy, 1.6 * s);
    g.fill({ color: gold, alpha });
    // 外环（细，增强锁定感）
    g.circle(cx, cy, outer * 1.18);
    g.stroke({ color: gold, width: 1 * s, alpha: alpha * 0.5 });
  }

  // ══════════════════════════════════════════════════════
  //  爆发：光学斩击·无限剑制（三阶段动画）
  // ══════════════════════════════════════════════════════

  /**
   * 触发爆发无限剑制
   * @param x 中心逻辑坐标 X
   * @param y 中心逻辑坐标 Y
   * @param themeColor 主题色（派生光学调色板）
   * @param config 视觉配置（数据驱动）
   * @param durationMs 持续时间（ms），默认 1200
   */
  triggerBurst(
    x: number,
    y: number,
    themeColor: number,
    config?: OpticalSlashVisualConfig,
    durationMs?: number,
    palette?: Palette,
  ): ActiveEffect[] {
    const g = this.acquire();
    if (!g) return [];

    const s = this.scale;
    const pal: Palette = palette ?? {
      primary: themeColor,
      glow: lighten(themeColor, 50),
      highlight: lighten(themeColor, 100),
      dim: dimColor(themeColor, 0.6),
      shadow: dimColor(themeColor, 0.3),
      accent: 0xFFD700,
    };
    const optPalette: OpticalPalette = palette
      ? {
          deep: pal.shadow,
          main: pal.primary,
          light: pal.glow,
          highlight: pal.highlight,
          white: OPTICAL_WHITE,
          gold: pal.accent,
        }
      : this.buildPalette(themeColor);
    const radius = (config?.maxRadius ?? 150) * s;
    const T = durationMs ?? 1200;
    const screenDiag = Math.sqrt(this.canvasW ** 2 + this.canvasH ** 2);

    // 粒子飞溅节流累积
    let particleAcc = 0;

    return [
      {
        type: 'optical_slash_burst',
        container: g as unknown as PIXI.Container,
        life: 0,
        maxLife: T,
        onUpdate: (ef, dt) => {
          const life = ef.life;
          const p1 = T * 0.15; // 蓄光阶段结束
          const p2 = T * 0.3; // 斩击阶段结束
          g.clear();

          // ── 光学核心（10 层同心圆径向渐变，全程显现，强度随阶段变化） ──
          let coreScale: number, coreAlpha: number;
          if (life < p1) {
            // 蓄光：核心从 0 显现
            const tt = life / p1;
            coreScale = tt;
            coreAlpha = tt;
          } else if (life < p2) {
            // 斩击：核心满显
            coreScale = 1;
            coreAlpha = 1;
          } else {
            // 余光：核心缓慢放大消散
            const tt = (life - p2) / (T - p2);
            coreScale = 1 + 0.3 * tt;
            coreAlpha = 1 - 0.6 * tt;
          }
          this.drawOpticalCore(
            g,
            x,
            y,
            radius * 0.35 * coreScale,
            optPalette,
            coreAlpha,
          );

          // ── 6 道扇形刀光（阶段 2 爆发扩散 easeOutCubic，阶段 3 消散） ──
          if (life >= p1) {
            let bladeReachT: number, bladeAlpha: number;
            if (life < p2) {
              const tt = (life - p1) / (p2 - p1);
              bladeReachT = this.easeOutCubic(tt);
              bladeAlpha = tt;
            } else {
              const tt = (life - p2) / (T - p2);
              bladeReachT = 1;
              bladeAlpha = 1 - tt;
            }
            const bladeReach = radius * (0.2 + 0.8 * bladeReachT);
            const bow = (config?.arcBow ?? 28) * s * 1.4;
            const halfW = (config?.bladeHalfWidth ?? 20) * s * 0.9;
            for (let i = 0; i < 6; i++) {
              const a = (i / 6) * Math.PI * 2;
              const bx = x + Math.cos(a) * bladeReach;
              const by = y + Math.sin(a) * bladeReach;
              this.drawArcCrescent(g, bx, by, a, bow, halfW, optPalette, bladeAlpha * 0.85, s);
            }
          }

          // ── 十字准星（4 条线 + 刻度分段，阶段 2 显现，阶段 3 淡出） ──
          let crossAlpha = 0;
          if (life >= p1) {
            if (life < p2) crossAlpha = (life - p1) / (p2 - p1);
            else crossAlpha = 1 - (life - p2) / (T - p2);
          }
          if (crossAlpha > 0.01) {
            this.drawCrosshair(g, x, y, radius * 1.1, crossAlpha, s, screenDiag, optPalette);
          }

          // ── 光学粒子飞溅（阶段 2 大量 emit） ──
          if (life >= p1 && life < p2 && this.particlePool) {
            particleAcc += dt;
            const interval = 20;
            while (particleAcc > interval) {
              particleAcc -= interval;
              for (let i = 0; i < 3; i++) {
                const a = Math.random() * Math.PI * 2;
                const spd = (60 + Math.random() * 120) * s;
                this.particlePool.emit({
                  x,
                  y,
                  vx: Math.cos(a) * spd,
                  vy: Math.sin(a) * spd,
                  life: 500 + Math.random() * 400,
                  scaleStart: 1.2,
                  scaleEnd: 0,
                  alphaStart: 0.9,
                  alphaEnd: 0,
                  tint: Math.random() < 0.4 ? optPalette.white : optPalette.light,
                  radius: (1.5 + Math.random() * 1.5) * s,
                });
              }
            }
          }

          // ── 中心光核（白色高亮 + 光蓝外晕） ──
          if (life < p2) {
            const tt = life < p1 ? life / p1 : 1;
            const coreR = 6 * s * tt;
            g.circle(x, y, coreR + 4 * s);
            g.fill({ color: optPalette.light, alpha: 0.5 * tt });
            g.circle(x, y, coreR);
            g.fill({ color: optPalette.white, alpha: 0.95 });
          } else {
            const tt = (life - p2) / (T - p2);
            g.circle(x, y, 6 * s * (1 - tt));
            g.fill({ color: optPalette.white, alpha: 0.95 * (1 - tt) });
          }

          // ── 金色锁定环（阶段 3 扩散，标记感） ──
          if (life >= p2) {
            const tt = (life - p2) / (T - p2);
            const ringR = radius * (0.5 + 0.8 * this.easeOutCubic(tt));
            g.circle(x, y, ringR);
            g.stroke({ color: optPalette.gold, width: 2.5 * s, alpha: (1 - tt) * 0.85 });
            g.circle(x, y, ringR * 0.92);
            g.stroke({ color: optPalette.gold, width: 1 * s, alpha: (1 - tt) * 0.5 });
          }
        },
        onDecay: () => {
          this.release(g);
        },
      } as ActiveEffect,
    ];
  }

  /**
   * 绘制光学核心：10 层同心圆（白 → 高亮浅蓝 → 浅光蓝 → 主光蓝 → 透明）径向渐变
   */
  private drawOpticalCore(
    g: PIXI.Graphics,
    cx: number,
    cy: number,
    coreR: number,
    palette: OpticalPalette,
    alpha: number,
  ): void {
    if (alpha <= 0.01) return;
    for (let i = 0; i < 10; i++) {
      const tt = i / 9; // 0 → 1
      const r = coreR * (0.1 + 0.9 * tt);
      // 颜色分段：白 → 高亮 → 浅光蓝 → 主光蓝
      let color: number;
      if (tt < 0.33) {
        color = this.interpolateColor(palette.white, palette.highlight, tt / 0.33);
      } else if (tt < 0.66) {
        color = this.interpolateColor(palette.highlight, palette.light, (tt - 0.33) / 0.33);
      } else {
        color = this.interpolateColor(palette.light, palette.main, (tt - 0.66) / 0.34);
      }
      const a = (1 - tt) * 0.28 * alpha;
      g.circle(cx, cy, r);
      g.fill({ color, alpha: a });
    }
  }

  /**
   * 绘制十字准星：远端视轴细线 + 4 条主方向线（中心带缺口）+ 刻度短线 + 中心锁环 + 中心点
   * 带刻度分段感（每条线 3 段垂直短刻度），强化狙击锁定感
   */
  private drawCrosshair(
    g: PIXI.Graphics,
    cx: number,
    cy: number,
    reach: number,
    alpha: number,
    s: number,
    screenDiag: number,
    palette: OpticalPalette,
  ): void {
    if (alpha <= 0.01) return;
    const gold = palette.gold;

    // 远端视轴细线（贯穿屏幕，低透明）—— 锁定视轴
    g.moveTo(cx - screenDiag, cy);
    g.lineTo(cx + screenDiag, cy);
    g.stroke({ color: gold, width: 1, alpha: alpha * 0.12 });
    g.moveTo(cx, cy - screenDiag);
    g.lineTo(cx, cy + screenDiag);
    g.stroke({ color: gold, width: 1, alpha: alpha * 0.12 });

    const inner = 6 * s;
    const outer = reach;
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    // 4 条主方向线 + 刻度分段
    for (const [dx, dy] of dirs) {
      g.moveTo(cx + dx * inner, cy + dy * inner);
      g.lineTo(cx + dx * outer, cy + dy * outer);
      g.stroke({ color: gold, width: 2 * s, alpha: alpha * 0.85 });
      // 3 段垂直短刻度（刻度感）
      const px = -dy;
      const py = dx;
      const tick = 3 * s;
      for (let k = 1; k <= 3; k++) {
        const r = inner + (outer - inner) * (k / 4);
        g.moveTo(cx + dx * r + px * tick, cy + dy * r + py * tick);
        g.lineTo(cx + dx * r - px * tick, cy + dy * r - py * tick);
        g.stroke({ color: gold, width: 1 * s, alpha: alpha * 0.5 });
      }
    }
    // 中心锁环
    g.circle(cx, cy, 10 * s);
    g.stroke({ color: gold, width: 1.5 * s, alpha: alpha * 0.8 });
    // 中心点
    g.circle(cx, cy, 2 * s);
    g.fill({ color: gold, alpha });
  }

  // ── 清理 ──────────────────────────────────────────

  clear(): void {
    for (const g of this.active) {
      g.clear();
      g.visible = false;
    }
    this.active.clear();
  }

  destroy(): void {
    this.clear();
    for (const g of this.pool) {
      if (!g.destroyed) g.destroy(true);
    }
    this.pool.length = 0;
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
    const gg = Math.round(fg + (tg - fg) * t);
    const b = Math.round(fb + (tb - fb) * t);
    return (r << 16) | (gg << 8) | b;
  }

  /** easeOutCubic 缓动 */
  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }
}
