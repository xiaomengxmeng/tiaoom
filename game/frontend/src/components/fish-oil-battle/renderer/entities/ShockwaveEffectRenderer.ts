import * as PIXI from 'pixi.js';
import { BLEND_MODES, SHOCKWAVE_MAX_RADIUS } from '../constants';
import {
  lighten,
  dimColor,
  type ActiveEffect,
  type ShockwaveVisualConfig,
} from './VisualEffectUtils';

/**
 * 冲击波特效渲染器
 *
 * 职责：
 * - 冲击波 Graphics 对象池（预分配 + 动态扩展）
 * - 冲击波触发（普通/爆发模式）
 * - 碰墙颜色切换（反弹色）
 * - 每帧更新（扩散动画 + 渐隐）
 *
 * 从 EffectRenderer 独立拆分，解耦视觉渲染与生命周期管理。
 */
export class ShockwaveEffectRenderer {
  /** 对象池 */
  private pool: PIXI.Graphics[] = [];
  /** 活跃中的冲击波 */
  private active: Set<PIXI.Graphics> = new Set();
  /** 已碰墙的冲击波 */
  private bounced: Set<PIXI.Graphics> = new Set();
  /** 挂载容器 */
  private container: PIXI.Container;

  /** 当前缩放因子 */
  private scale = 1;
  /** 画布尺寸（用于碰墙检测） */
  private canvasW: number;
  private canvasH: number;

  constructor(container: PIXI.Container, canvasW: number, canvasH: number, prePoolCount = 10) {
    this.container = container;
    this.canvasW = canvasW;
    this.canvasH = canvasH;

    for (let i = 0; i < prePoolCount; i++) {
      const g = new PIXI.Graphics();
      g.visible = false;
      g.blendMode = BLEND_MODES.ADD as unknown as PIXI.BLEND_MODES;
      container.addChild(g);
      this.pool.push(g);
    }
  }

  /** 同步缩放 + 画布尺寸 */
  setScale(scale: number, canvasW: number, canvasH: number): void {
    this.scale = scale;
    this.canvasW = canvasW;
    this.canvasH = canvasH;
  }

  // ── 对象池操作 ──────────────────────────────────────────

  private acquire(): PIXI.Graphics | null {
    for (const g of this.pool) {
      if (!this.active.has(g)) {
        this.active.add(g);
        this.bounced.delete(g);
        g.visible = true;
        return g;
      }
    }
    // 池耗尽：动态扩展
    const g = new PIXI.Graphics();
    g.blendMode = BLEND_MODES.ADD as unknown as PIXI.BLEND_MODES;
    this.container.addChild(g);
    this.pool.push(g);
    this.active.add(g);
    return g;
  }

  private release(g: PIXI.Graphics): void {
    g.clear();
    g.visible = false;
    this.bounced.delete(g);
    this.active.delete(g);
  }

  // ── 触发接口 ──────────────────────────────────────────

  /**
   * 触发冲击波特效
   * @param x 碰撞点 X（画布像素坐标）
   * @param y 碰撞点 Y（画布像素坐标）
   * @param isBurst 是否为爆发模式（3道波，120° 间隔）
   * @param themeColor 玩家主题色（覆盖视觉配置中的 primaryColor）
   * @param visualCfg 视觉配置（半径、持续时间、颜色等，优先于默认值）
   * @returns 创建的 ActiveEffect 数组（供外部统一 update 用）
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
    const expandDuration = visualCfg?.expandDurationMs ?? 1000;
    const { canvasW, canvasH } = this;

    // 颜色优先级：visualCfg > themeColor 推导 > 默认
    const primary = visualCfg?.primaryColor ?? themeColor ?? 0xFF00FF;
    const glow = visualCfg?.glowColor ?? (themeColor ? lighten(themeColor, 50) : 0xFF66FF);
    const bounceClr = visualCfg?.bounceColor ?? (themeColor ? dimColor(themeColor, 0.6) : 0x00BFFF);

    const effects: ActiveEffect[] = [];

    for (let i = 0; i < count; i++) {
      const g = this.acquire();
      if (!g) continue;

      const ef: ActiveEffect = {
        type: 'shockwave',
        container: g as unknown as PIXI.Container,
        life: 0,
        maxLife: expandDuration,
        onUpdate: (ef, _dt) => {
          const t = ef.life / ef.maxLife;
          const radius = t * maxRadius;
          const alpha = 1 - t * 0.8;
          const width = (4 + t * 8) * this.scale;

          g.clear();
          g.circle(x, y, radius);
          g.stroke({ color: primary, width, alpha: alpha * 0.9 });
          g.circle(x, y, Math.max(radius - width * 2, 0));
          g.stroke({ color: glow, width: 2 * this.scale, alpha: alpha * 0.5 });

          // 碰墙检测（圆形竞技场边界）
          const arenaCenterX = canvasW / 2;
          const arenaCenterY = canvasH / 2;
          const arenaRadius = Math.min(canvasW, canvasH) / 2;
          const distFromCenter = Math.sqrt((x - arenaCenterX) ** 2 + (y - arenaCenterY) ** 2);
          const distToWall = arenaRadius - distFromCenter - radius;
          if (distToWall <= 0 && !this.bounced.has(g)) {
            this.bounced.add(g);
            g.clear();
            g.circle(x, y, radius);
            g.stroke({ color: bounceClr, width, alpha: alpha * 0.9 });
            g.circle(x, y, Math.max(radius - width * 2, 0));
            g.stroke({ color: lighten(bounceClr, 50), width: 2 * this.scale, alpha: alpha * 0.5 });
          }

          g.x = 0; g.y = 0;
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

  // ── 资源清理 ──────────────────────────────────────────

  /** 回收所有活跃冲击波 */
  clear(): void {
    for (const g of this.active) {
      g.clear();
      g.visible = false;
    }
    this.active.clear();
    this.bounced.clear();
  }

  /** 销毁所有 Graphics */
  destroy(): void {
    this.clear();
    for (const g of this.pool) {
      g.destroy(true);
    }
    this.pool.length = 0;
  }
}
