/**
 * 基础武器特效渲染器抽象基类
 *
 * 封装通用骨架：
 * - Graphics 对象池（acquire/release，避免频繁 GC）
 * - 调色板派生（buildPalette，让 themeColor 真正生效）
 * - 三阶段动画调度（蓄压 0-15% / 爆发 15-30% / 扩散 30-100%）
 * - 共享工具（interpolateColor / drawMultilayerCircle / easeOutCubic）
 *
 * 子类通过 override 钩子方法实现独特视觉主题。
 * 对外 API：trigger* / update / setScale / clear / destroy 签名不变。
 */

import * as PIXI from 'pixi.js';
import { ParticlePool } from '../systems/ParticlePool';
import { lighten, dimColor, easeOutCubic, easeInCubic } from './VisualEffectUtils';

// ══════════════════════════════════════════════════════
//  调色板接口
// ══════════════════════════════════════════════════════

export interface Palette {
  primary: number;     // 主色（= themeColor）
  glow: number;       // 发光色（lighten +50）
  highlight: number;   // 高亮色（lighten +100）
  dim: number;         // 暗色（dimColor 0.6）
  shadow: number;      // 阴影色（dimColor 0.3）
  accent: number;      // 强调色（色相旋转）
}

// ══════════════════════════════════════════════════════
//  活跃实例基础接口
// ══════════════════════════════════════════════════════

export interface ActiveBurstBase {
  container: PIXI.Container;
  life: number;
  maxLife: number;
  themeColor: number;
  radius: number;
  particleTimer: number;
  palette: Palette;
}

// ══════════════════════════════════════════════════════
//  抽象基类
// ══════════════════════════════════════════════════════

export abstract class BaseWeaponEffectRenderer {
  protected container: PIXI.Container;
  protected particlePool: ParticlePool;
  protected scale = 1;
  protected canvasW = 1280;
  protected canvasH = 720;

  // Graphics 对象池
  private graphicsPool: PIXI.Graphics[] = [];

  constructor(container: PIXI.Container, particlePool: ParticlePool) {
    this.container = container;
    this.particlePool = particlePool;
  }

  // ═══ 通用工具 ═══

  /** RGB 颜色线性插值 */
  protected interpolateColor(from: number, to: number, t: number): number {
    const r = Math.round(((from >> 16) & 0xff) + (((to >> 16) & 0xff) - ((from >> 16) & 0xff)) * t);
    const g = Math.round(((from >> 8) & 0xff) + (((to >> 8) & 0xff) - ((from >> 8) & 0xff)) * t);
    const b = Math.round((from & 0xff) + ((to & 0xff) - (from & 0xff)) * t);
    return (r << 16) | (g << 8) | b;
  }

  protected easeOutCubic(t: number): number {
    return easeOutCubic(t);
  }

  protected easeInCubic(t: number): number {
    return easeInCubic(t);
  }

  /**
   * 绘制多层同心圆模拟径向渐变
   * @param g Graphics 对象
   * @param baseR 基准半径
   * @param layers 层数
   * @param colorFn 第 i 层颜色（t = i/(layers-1)）
   * @param alphaFn 第 i 层 alpha（t = i/(layers-1)）
   */
  protected drawMultilayerCircle(
    g: PIXI.Graphics,
    baseR: number,
    layers: number,
    colorFn: (t: number) => number,
    alphaFn: (t: number) => number,
  ): void {
    for (let i = 0; i < layers; i++) {
      const t = layers > 1 ? i / (layers - 1) : 0;
      const r = Math.max(0.5, baseR * (1 - t * 0.9));
      g.circle(0, 0, r);
      g.fill({ color: colorFn(t), alpha: Math.max(0, alphaFn(t)) });
    }
  }

  /**
   * 从主题色派生 6 色调色板
   * @param themeColor 主题色（0xRRGGBB）
   */
  protected buildPalette(themeColor: number): Palette {
    return {
      primary: themeColor,
      glow: lighten(themeColor, 50),
      highlight: lighten(themeColor, 100),
      dim: dimColor(themeColor, 0.6),
      shadow: dimColor(themeColor, 0.3),
      accent: this.rotateHue(themeColor, 30),
    };
  }

  /** 色相旋转（degrees） */
  private rotateHue(color: number, degrees: number): number {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    // RGB → HSL
    const max = Math.max(r, g, b) / 255;
    const min = Math.min(r, g, b) / 255;
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      const rN = r / 255, gN = g / 255, bN = b / 255;
      switch (max) {
        case rN: h = (gN - bN) / d + (gN < bN ? 6 : 0); break;
        case gN: h = (bN - rN) / d + 2; break;
        case bN: h = (rN - gN) / d + 4; break;
      }
      h /= 6;
    }
    // 旋转色相
    h = (h + degrees / 360) % 1;
    if (h < 0) h += 1;
    // HSL → RGB
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const newR = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
    const newG = Math.round(hue2rgb(p, q, h) * 255);
    const newB = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
    return (newR << 16) | (newG << 8) | newB;
  }

  // ═══ Graphics 对象池 ═══

  protected acquireGraphics(parent?: PIXI.Container): PIXI.Graphics {
    let g = this.graphicsPool.pop();
    if (!g || g.destroyed) {
      g = new PIXI.Graphics();
    }
    g.clear();
    g.visible = true;
    g.alpha = 1;
    g.scale.set(1);
    g.rotation = 0;
    (parent ?? this.container).addChild(g);
    return g;
  }

  protected releaseGraphics(g: PIXI.Graphics): void {
    if (!g || g.destroyed) return;
    g.visible = false;
    g.alpha = 0;
    if (g.parent) g.parent.removeChild(g);
    this.graphicsPool.push(g);
  }

  // ═══ 三阶段动画调度 ═══

  /**
   * 通用三阶段爆发动画调度
   * - 阶段1 蓄压 0-15% T
   * - 阶段2 爆发 15-30% T
   * - 阶段3 扩散 30-100% T
   *
   * 子类 override phase1Charge / phase2Burst / phase3Diffuse 实现独特视觉
   */
  protected runBurstAnimation(burst: ActiveBurstBase, dt: number): boolean {
    burst.life += dt;
    if (burst.life >= burst.maxLife) {
      return true; // 已过期，子类负责清理
    }
    const T = burst.maxLife;
    const phase1End = T * 0.15;
    const phase2End = T * 0.30;
    if (burst.life < phase1End) {
      this.phase1Charge(burst, burst.life / phase1End);
    } else if (burst.life < phase2End) {
      this.phase2Burst(burst, (burst.life - phase1End) / (phase2End - phase1End));
    } else {
      this.phase3Diffuse(burst, (burst.life - phase2End) / (T - phase2End));
    }
    return false;
  }

  /** 钩子：阶段1 蓄压（子类 override） */
  protected phase1Charge(burst: ActiveBurstBase, t: number): void {}
  /** 钩子：阶段2 爆发（子类 override） */
  protected phase2Burst(burst: ActiveBurstBase, t: number): void {}
  /** 钩子：阶段3 扩散（子类 override） */
  protected phase3Diffuse(burst: ActiveBurstBase, t: number): void {}

  // ═══ 生命周期 ═══

  setScale(scale: number, canvasW?: number, canvasH?: number): void {
    this.scale = scale;
    if (canvasW !== undefined) this.canvasW = canvasW;
    if (canvasH !== undefined) this.canvasH = canvasH;
    this.onScaleChange(scale);
  }

  /** 钩子：缩放变化时同步已有实体（子类 override） */
  protected onScaleChange(scale: number): void {}

  abstract update(dt: number): void;
  abstract clear(): void;

  destroy(): void {
    this.clear();
    // 释放对象池中的 Graphics
    for (const g of this.graphicsPool) {
      if (g && !g.destroyed) g.destroy(true);
    }
    this.graphicsPool.length = 0;
  }
}
