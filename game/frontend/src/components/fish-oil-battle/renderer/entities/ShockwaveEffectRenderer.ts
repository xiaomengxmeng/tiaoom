import * as PIXI from 'pixi.js';
import { BLEND_MODES, SHOCKWAVE_MAX_RADIUS } from '../constants';
import {
  type ActiveEffect,
  type ShockwaveVisualConfig,
} from './VisualEffectUtils';

/**
 * 冲击波特效渲染器
 *
 * 主环渲染：
 * - 半透明圆环从触发点扩散
 * - 粗描边 + 高亮
 * - 爆发模式：3 个环依次扩散
 */
export class ShockwaveEffectRenderer {
  private pool: PIXI.Graphics[] = [];
  private active: Set<PIXI.Graphics> = new Set();

  private container: PIXI.Container;
  private scale = 1;

  constructor(container: PIXI.Container, _canvasW: number, _canvasH: number, prePoolCount = 10) {
    this.container = container;

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
   * 简洁风格：三层描边（外层光晕 + 中层 + 内层高亮）
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
    const expandDuration = visualCfg?.expandDurationMs ?? 1500;
    const strokeWidth = (visualCfg?.strokeWidth ?? 15) * this.scale;
    const primary = visualCfg?.primaryColor ?? themeColor ?? 0xFF00FF;

    const effects: ActiveEffect[] = [];

    for (let i = 0; i < count; i++) {
      const g = this.acquire();
      if (!g) continue;

      const delayMs = isBurst ? i * 120 : 0;

      const ef: ActiveEffect = {
        type: 'shockwave',
        container: g as unknown as PIXI.Container,
        life: delayMs,
        maxLife: expandDuration + delayMs,
        onUpdate: (ef, _dt) => {
          if (ef.life < delayMs) return;

          const localLife = ef.life - delayMs;
          const localMax = ef.maxLife - delayMs;
          const t = Math.min(localLife / localMax, 1);
          const radius = t * maxRadius;

          // 透明度：前 20% 渐入，后 40% 渐出
          let alpha: number;
          if (t < 0.2) {
            alpha = t / 0.2 * 1.0;
          } else if (t > 0.6) {
            alpha = (1 - (t - 0.6) / 0.4) * 1.0;
          } else {
            alpha = 1.0;
          }

          g.clear();

          // 外层光晕（宽、低透明度）
          g.circle(x, y, radius);
          g.stroke({ color: primary, width: strokeWidth * 2.5, alpha: alpha * 0.15 });

          // 中层描边（中等宽度、中等透明度）
          g.circle(x, y, radius);
          g.stroke({ color: primary, width: strokeWidth * 1.5, alpha: alpha * 0.4 });

          // 内层高亮描边（细、高透明度、偏白）
          const highlightColor = this.mixWithWhite(primary, 0.6);
          g.circle(x, y, radius);
          g.stroke({ color: highlightColor, width: strokeWidth, alpha: alpha * 0.85 });
        },
        onDecay: (_ef) => {
          this.release(g);
        },
      };
      ef.container.visible = true;
      effects.push(ef);
    }

    return effects;
  }

  // ── 颜色工具 ──────────────────────────────────────────

  /** 混合白色到颜色 */
  private mixWithWhite(color: number, ratio: number): number {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;

    const mr = Math.min(255, Math.round(r + (255 - r) * ratio));
    const mg = Math.min(255, Math.round(g + (255 - g) * ratio));
    const mb = Math.min(255, Math.round(b + (255 - b) * ratio));

    return (mr << 16) | (mg << 8) | mb;
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
      g.destroy(true);
    }
    this.pool.length = 0;
  }
}
