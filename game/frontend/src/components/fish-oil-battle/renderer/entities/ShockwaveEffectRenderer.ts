import * as PIXI from 'pixi.js';
import { BLEND_MODES, SHOCKWAVE_MAX_RADIUS } from '../constants';
import { ParticlePool } from '../systems/ParticlePool';
import {
  type ActiveEffect,
  type ShockwaveVisualConfig,
} from './VisualEffectUtils';

/**
 * 冲击波发生器 (Shockwave Generator) - 侵略者流派
 * 前端视觉渲染器（闲乘月质量标准）
 *
 * 视觉设计（侵略者红橙）：
 * - 冲击波核心：10 层同心圆径向渐变（白→高亮橙→浅橙红→主红→透明）
 * - 冲击波环：5 层扩散圆环（外层宽光晕 → 内层细高亮，带发光感）
 * - 震波粒子：particlePool.emit 生成飞溅粒子（蓄能内聚 / 冲击外溅 / 余烬飘散）
 * - 三阶段动画：蓄能(0-15%T) → 冲击(15%-30%T) → 余震(30%-100%T)
 */

// ══════════════════════════════════════════════════════
//  颜色常量（侵略者红橙）
// ══════════════════════════════════════════════════════

const SHOCK_DEEP = 0x4a0a0a; // 深红黑
const SHOCK_MAIN = 0xcc2200; // 主红
const SHOCK_LIGHT = 0xff6633; // 浅橙红
const SHOCK_HIGHLIGHT = 0xffaa66; // 高亮橙
const SHOCK_WHITE = 0xffffff; // 白色核心

/** 冲击波调色板（5 色，可由主题色派生） */
interface ShockPalette {
  deep: number;
  main: number;
  light: number;
  highlight: number;
  white: number;
}

export class ShockwaveEffectRenderer {
  private pool: PIXI.Graphics[] = [];
  private active: Set<PIXI.Graphics> = new Set();

  private container: PIXI.Container;
  private scale = 1;
  private particlePool?: ParticlePool;

  constructor(
    container: PIXI.Container,
    _canvasW: number,
    _canvasH: number,
    particlePool?: ParticlePool,
    prePoolCount = 10,
  ) {
    this.container = container;
    this.particlePool = particlePool;

    for (let i = 0; i < prePoolCount; i++) {
      const g = new PIXI.Graphics();
      g.visible = false;
      g.blendMode = BLEND_MODES.NORMAL as unknown as PIXI.BLEND_MODES;
      container.addChild(g);
      this.pool.push(g);
    }
  }

  setScale(scale: number, _canvasW: number, _canvasH: number): void {
    this.scale = scale;
  }

  // ── 对象池操作 ──────────────────────────────────────

  private acquire(): PIXI.Graphics | null {
    for (const g of this.pool) {
      if (!this.active.has(g)) {
        this.active.add(g);
        g.visible = true;
        return g;
      }
    }
    const g = new PIXI.Graphics();
    g.blendMode = BLEND_MODES.NORMAL as unknown as PIXI.BLEND_MODES;
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

  /**
   * 触发冲击环
   * @param x 触发点逻辑坐标 X
   * @param y 触发点逻辑坐标 Y
   * @param isBurst 是否爆发模式（3 环依次扩散）
   * @param themeColor 玩家主题色（覆盖默认主色，自动派生调色板）
   * @param visualCfg 数据驱动视觉配置（含 durationMs 路径 expandDurationMs / maxRadius）
   * @returns 活跃特效列表（每环一个 ActiveEffect，由 EffectRenderer 统一驱动）
   */
  trigger(
    x: number,
    y: number,
    isBurst = false,
    themeColor?: number,
    visualCfg?: ShockwaveVisualConfig,
  ): ActiveEffect[] {
    const count = isBurst ? 3 : 1;
    const effectiveRadius = visualCfg?.maxRadius ?? SHOCKWAVE_MAX_RADIUS;
    const maxRadius = effectiveRadius * this.scale;
    // 持续时间（数据驱动：visualCfg.expandDurationMs 即 durationMs）
    const expandDuration = visualCfg?.expandDurationMs ?? 1500;
    const strokeWidth = (visualCfg?.strokeWidth ?? 15) * this.scale;

    // 构建调色板：优先 visualCfg.primaryColor，其次 themeColor，最后侵略者默认
    const baseMain = visualCfg?.primaryColor ?? themeColor ?? SHOCK_MAIN;
    const palette = this.buildPalette(baseMain);

    const effects: ActiveEffect[] = [];

    for (let i = 0; i < count; i++) {
      const g = this.acquire();
      if (!g) continue;

      // 爆发模式：每环依次延迟触发
      const delayMs = isBurst ? i * 120 : 0;
      // 每环强度递减，营造层次
      const ringIntensity = isBurst ? 1 - i * 0.18 : 1;

      // 粒子节流计时器（闭包内独立维护）
      let particleTimer = 0;

      const ef: ActiveEffect = {
        type: 'shockwave',
        container: g as unknown as PIXI.Container,
        life: delayMs,
        maxLife: expandDuration + delayMs,
        onUpdate: (ef, dt) => {
          // 延迟等待（爆发模式前序环未结束）
          if (ef.life < delayMs) return;

          const localLife = ef.life - delayMs;
          const localMax = ef.maxLife - delayMs;
          const T = localMax;
          if (localLife >= T) return;

          // 三阶段时间边界
          const phase1End = T * 0.15; // 蓄能
          const phase2End = T * 0.3; // 冲击

          let radius: number;
          let coreScale: number;
          let coreAlpha: number;
          let ringAlpha: number;

          if (localLife < phase1End) {
            // 阶段1 蓄能：核心在中心聚集，无环
            const p = localLife / phase1End;
            const eased = this.easeInCubic(p); // 加速聚集
            radius = 0;
            coreScale = 0.3 + 0.7 * eased;
            coreAlpha = p * ringIntensity; // 0 → 强度
            ringAlpha = 0;

            // 蓄能粒子：向中心螺旋内聚
            particleTimer += dt;
            if (this.particlePool && particleTimer > 70) {
              particleTimer = 0;
              this.spawnChargeParticles(
                x,
                y,
                maxRadius * 0.4,
                palette,
              );
            }
          } else if (localLife < phase2End) {
            // 阶段2 冲击：环爆射至 0.45*maxR，核心闪现
            const p = (localLife - phase1End) / (phase2End - phase1End);
            const eased = this.easeOutCubic(p);
            radius = maxRadius * 0.45 * eased;
            coreScale = 1.0 - 0.3 * p; // 能量释放后核心略缩
            coreAlpha = ringIntensity;
            ringAlpha = p * ringIntensity; // 0 → 强度 闪现

            // 冲击粒子：径向外溅
            particleTimer += dt;
            if (this.particlePool && particleTimer > 28) {
              particleTimer = 0;
              this.spawnImpactParticles(
                x,
                y,
                radius,
                maxRadius,
                palette,
              );
            }
          } else {
            // 阶段3 余震：环继续扩散 0.45→1.0，渐隐
            const p = (localLife - phase2End) / (T - phase2End);
            const eased = this.easeOutCubic(p);
            radius = maxRadius * (0.45 + 0.55 * eased);
            coreScale = 0.7 * (1 - p);
            coreAlpha = (1 - 0.7 * p) * ringIntensity;
            ringAlpha = (1 - p) * ringIntensity;

            // 余烬粒子：飘散
            particleTimer += dt;
            if (this.particlePool && particleTimer > 110) {
              particleTimer = 0;
              this.spawnEmberParticles(x, y, radius, palette);
            }
          }

          g.clear();

          // 1. 冲击波核心（10 层径向渐变）
          if (coreAlpha > 0.01) {
            const coreR = maxRadius * 0.25 * coreScale;
            this.drawShockCore(g, x, y, coreR, coreAlpha, palette);
          }

          // 2. 冲击波环（5 层扩散发光带）
          if (ringAlpha > 0.01 && radius > 0) {
            this.drawShockRing(g, x, y, radius, ringAlpha, strokeWidth, palette);
          }
        },
        onDecay: () => {
          this.release(g);
        },
      };
      ef.container.visible = true;
      effects.push(ef);
    }

    return effects;
  }

  // ══════════════════════════════════════════════════════
  //  绘制方法
  // ══════════════════════════════════════════════════════

  /**
   * 绘制冲击波核心：10 层同心圆径向渐变
   * 白 → 高亮橙 → 浅橙红 → 主红 → 深红黑（透明）
   */
  private drawShockCore(
    g: PIXI.Graphics,
    x: number,
    y: number,
    coreR: number,
    intensity: number,
    palette: ShockPalette,
  ): void {
    for (let i = 0; i < 10; i++) {
      const t = i / 9; // 0 → 1
      const r = coreR * (0.1 + 0.9 * t);
      // 颜色分段：白 → 高亮 → 浅 → 主 → 深
      let color: number;
      if (t < 0.25) {
        color = this.interpolateColor(palette.white, palette.highlight, t / 0.25);
      } else if (t < 0.5) {
        color = this.interpolateColor(
          palette.highlight,
          palette.light,
          (t - 0.25) / 0.25,
        );
      } else if (t < 0.75) {
        color = this.interpolateColor(
          palette.light,
          palette.main,
          (t - 0.5) / 0.25,
        );
      } else {
        color = this.interpolateColor(
          palette.main,
          palette.deep,
          (t - 0.75) / 0.25,
        );
      }
      const alpha = (1 - t) * 0.28 * intensity;
      g.circle(x, y, r);
      g.fill({ color, alpha });
    }

    // 白色高亮内核
    g.circle(x, y, coreR * 0.15);
    g.fill({ color: palette.white, alpha: intensity });
  }

  /**
   * 绘制冲击波环：5 层扩散圆环
   * 外层宽光晕（主红）→ 中层（浅橙红）→ 内层细高亮（白）
   */
  private drawShockRing(
    g: PIXI.Graphics,
    x: number,
    y: number,
    radius: number,
    alpha: number,
    strokeWidth: number,
    palette: ShockPalette,
  ): void {
    // 5 层从外到内：宽光晕 → 细高亮
    const layers = [
      { rScale: 1.0, wMul: 2.5, color: palette.main, aMul: 0.12 },
      { rScale: 0.98, wMul: 1.8, color: palette.light, aMul: 0.25 },
      { rScale: 0.96, wMul: 1.2, color: palette.highlight, aMul: 0.5 },
      { rScale: 0.94, wMul: 0.8, color: palette.highlight, aMul: 0.8 },
      { rScale: 0.92, wMul: 0.4, color: palette.white, aMul: 1.0 },
    ];
    for (const layer of layers) {
      g.circle(x, y, radius * layer.rScale);
      g.stroke({
        color: layer.color,
        width: strokeWidth * layer.wMul,
        alpha: alpha * layer.aMul,
      });
    }
  }

  // ══════════════════════════════════════════════════════
  //  粒子发射
  // ══════════════════════════════════════════════════════

  /** 蓄能阶段：向中心螺旋内聚的粒子 */
  private spawnChargeParticles(
    x: number,
    y: number,
    startDist: number,
    palette: ShockPalette,
  ): void {
    const s = this.scale;
    for (let i = 0; i < 2; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = startDist * s * (0.7 + Math.random() * 0.3);
      const px = x + Math.cos(angle) * dist;
      const py = y + Math.sin(angle) * dist;
      // 朝中心方向（带切向偏移形成螺旋）
      const tangent = angle + Math.PI / 2;
      const inwardSpeed = (60 + Math.random() * 40) * s;
      const tangentSpeed = 30 * s;
      const vx = -Math.cos(angle) * inwardSpeed + Math.cos(tangent) * tangentSpeed;
      const vy = -Math.sin(angle) * inwardSpeed + Math.sin(tangent) * tangentSpeed;
      const color = i === 0 ? palette.highlight : palette.light;
      this.particlePool!.emit({
        x: px,
        y: py,
        vx,
        vy,
        life: 600,
        scaleStart: 1,
        scaleEnd: 0.2,
        alphaStart: 0.9,
        alphaEnd: 0,
        tint: color,
        radius: (1.5 + Math.random() * 1.5) * s,
      });
    }
  }

  /** 冲击阶段：径向外溅粒子 */
  private spawnImpactParticles(
    x: number,
    y: number,
    radius: number,
    maxRadius: number,
    palette: ShockPalette,
  ): void {
    const s = this.scale;
    const count = 4;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const dist = radius * s;
      const px = x + Math.cos(angle) * dist;
      const py = y + Math.sin(angle) * dist;
      // 外溅速度（与扩散方向一致，叠加随机）
      const speed = (80 + Math.random() * 60) * s * (maxRadius / Math.max(maxRadius, 1));
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const color =
        i % 3 === 0 ? palette.white : i % 3 === 1 ? palette.highlight : palette.light;
      this.particlePool!.emit({
        x: px,
        y: py,
        vx,
        vy,
        life: 800,
        scaleStart: 1.2,
        scaleEnd: 0,
        alphaStart: 1,
        alphaEnd: 0,
        tint: color,
        radius: (2 + Math.random() * 2) * s,
      });
    }
  }

  /** 余震阶段：飘散余烬粒子 */
  private spawnEmberParticles(
    x: number,
    y: number,
    radius: number,
    palette: ShockPalette,
  ): void {
    const s = this.scale;
    for (let i = 0; i < 2; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = radius * s * (0.85 + Math.random() * 0.15);
      const px = x + Math.cos(angle) * dist;
      const py = y + Math.sin(angle) * dist;
      // 缓慢飘散 + 轻微上浮
      const speed = (15 + Math.random() * 15) * s;
      const vx = Math.cos(angle) * speed * 0.5;
      const vy = Math.sin(angle) * speed * 0.5 - 10 * s;
      this.particlePool!.emit({
        x: px,
        y: py,
        vx,
        vy,
        life: 1200,
        scaleStart: 0.9,
        scaleEnd: 0,
        alphaStart: 0.7,
        alphaEnd: 0,
        tint: palette.main,
        radius: (1.2 + Math.random() * 1.3) * s,
      });
    }
  }

  // ══════════════════════════════════════════════════════
  //  调色板与工具方法
  // ══════════════════════════════════════════════════════

  /** 由主色派生 5 色调色板（侵略者红橙默认） */
  private buildPalette(main: number): ShockPalette {
    // 默认侵略者红橙：直接使用预设以保证流派辨识度
    if (main === SHOCK_MAIN) {
      return {
        deep: SHOCK_DEEP,
        main: SHOCK_MAIN,
        light: SHOCK_LIGHT,
        highlight: SHOCK_HIGHLIGHT,
        white: SHOCK_WHITE,
      };
    }
    // 主题色派生：保证玩家主题色覆盖时调色板协调
    return {
      deep: this.dimColor(main, 0.3),
      main,
      light: this.lightenColor(main, 50),
      highlight: this.interpolateColor(main, 0xffffff, 0.6),
      white: SHOCK_WHITE,
    };
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

  /** 提亮颜色（增加固定亮度） */
  private lightenColor(color: number, amount: number): number {
    const r = Math.min(255, ((color >> 16) & 0xff) + amount);
    const g = Math.min(255, ((color >> 8) & 0xff) + amount);
    const b = Math.min(255, (color & 0xff) + amount);
    return (r << 16) | (g << 8) | b;
  }

  /** 降低颜色亮度（按因子） */
  private dimColor(color: number, factor: number): number {
    const r = Math.round(((color >> 16) & 0xff) * factor);
    const g = Math.round(((color >> 8) & 0xff) * factor);
    const b = Math.round((color & 0xff) * factor);
    return (r << 16) | (g << 8) | b;
  }

  /** easeOutCubic: 1 - (1-t)^3 */
  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  /** easeInCubic: t^3 */
  private easeInCubic(t: number): number {
    return t * t * t;
  }

  // ── 资源清理 ──────────────────────────────────────────

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
}
