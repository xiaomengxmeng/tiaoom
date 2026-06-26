import * as PIXI from 'pixi.js';
import {
  easeOutCubic,
  type ActiveEffect,
} from './VisualEffectUtils';

/**
 * 空气斥力场特效渲染器
 *
 * 职责：
 * - 斥力锚点 Graphics 对象池管理
 * - 气罩环绕效果
 * - 爆发斥力场（中心扩散波纹）
 *
 * 视觉设计：
 * - 锚点：品黄色外圈 + 旋转箭头（品字形），0.5s 生长动画
 * - 气罩：半透明品黄色光环，持续脉冲
 * - 爆发：全屏品黄色波纹扩散 + 中心高压指示器
 */
export class AirRepulsionFieldRenderer {
  /** 对象池 */
  private pool: PIXI.Graphics[] = [];
  /** 活跃中的锚点 */
  private active: Set<PIXI.Graphics> = new Set();
  /** anchorId → Graphics 映射 */
  private anchorEffects: Map<string, PIXI.Graphics> = new Map();
  /** 挂载容器 */
  private container: PIXI.Container;
  /** 当前缩放因子 */
  private scale = 1;

  constructor(container: PIXI.Container, prePoolCount = 8) {
    this.container = container;
    for (let i = 0; i < prePoolCount; i++) {
      const g = new PIXI.Graphics();
      g.visible = false;
      container.addChild(g);
      this.pool.push(g);
    }
  }

  setScale(scale: number): void {
    this.scale = scale;
  }

  // ── 对象池操作 ──────────────────────────────

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
    g.mask = null;
    this.active.delete(g);
  }

  // ── 锚点触发接口 ──────────────────────────────

  triggerAnchor(
    x: number,
    y: number,
    anchorId: string,
    themeColor?: number,
    maxLifeMs = 5000,
  ): { effect: ActiveEffect | null; anchorId: string } {
    const g = this.acquire();
    if (!g) return { effect: null, anchorId };

    const color = themeColor ?? 0xFFD700; // 品黄
    const s = this.scale;
    const radius = 55 * s;

    // 初始帧：小圆圈
    g.clear();
    g.circle(x, y, radius * 0.2);
    g.fill({ color, alpha: 0.6 });

    let rotationAngle = 0;

    const ef: ActiveEffect = {
      type: 'air_repulsion_anchor',
      container: g as unknown as PIXI.Container,
      life: 0,
      maxLife: maxLifeMs,
      onUpdate: (_ef, _dt) => {
        const t = _ef.life / _ef.maxLife;
        // 生长动画：0-400ms
        const growT = Math.min(1, _ef.life / 400);
        const grow = easeOutCubic(growT);
        const currentR = radius * Math.max(0.2, grow);

        g.clear();

        // 外圈
        g.circle(x, y, currentR);
        g.stroke({ color, width: 2 * s, alpha: 0.8 * (1 - t * 0.3) });

        // 填充
        g.circle(x, y, currentR);
        g.fill({ color, alpha: 0.1 * (1 - t * 0.5) });

        // 旋转箭头（品字形：3个箭头均匀分布）
        rotationAngle += _dt / 2000; // 慢速旋转
        for (let i = 0; i < 3; i++) {
          const angle = rotationAngle + (i * Math.PI * 2) / 3;
          const ax = x + Math.cos(angle) * currentR * 0.6;
          const ay = y + Math.sin(angle) * currentR * 0.6;
          g.circle(ax, ay, 3 * s);
          g.fill({ color: 0xFFFFFF, alpha: 0.7 * (1 - t * 0.3) });
        }

        // 中心光点
        g.circle(x, y, 4 * s);
        g.fill({ color: 0xFFFFFF, alpha: 0.9 * (1 - t * 0.2) });
      },
      onDecay: (_ef) => {
        this.release(g);
        this.anchorEffects.delete(anchorId);
      },
    };
    ef.container.visible = true;
    this.anchorEffects.set(anchorId, g);
    return { effect: ef, anchorId };
  }

  // ── 爆发效果接口 ──────────────────────────────

  triggerBurst(
    x: number,
    y: number,
    radius = 180,
    themeColor?: number,
    durationMs = 4000,
  ): { effect: ActiveEffect | null } {
    const color = themeColor ?? 0xFFD700;
    const s = this.scale;
    const r = radius * s;

    // 使用现有池对象
    const g = this.acquire();
    if (!g) return { effect: null };

    let wavePhase = 0;

    const ef: ActiveEffect = {
      type: 'air_repulsion_burst',
      container: g as unknown as PIXI.Container,
      life: 0,
      maxLife: durationMs,
      onUpdate: (_ef, _dt) => {
        const t = _ef.life / _ef.maxLife;
        g.clear();

        // 扩散波纹（3圈，不同速度）
        for (let i = 0; i < 3; i++) {
          const phase = (wavePhase + i * 0.33) % 1;
          const waveR = r * phase;
          const alpha = 0.5 * (1 - phase) * (1 - t * 0.3);
          g.circle(x, y, Math.max(0, waveR));
          g.stroke({ color, width: (3 - i) * s, alpha });
        }

        // 中心高压指示器
        g.circle(x, y, 10 * s * (1 + Math.sin(_ef.life / 100) * 0.3));
        g.fill({ color, alpha: 0.6 * (1 - t * 0.4) });

        // 短促高压锅泄压色散（爆发后 0.5s）
        if (t < 0.125) {
          const flashAlpha = 0.8 * (1 - t / 0.125);
          g.circle(x, y, r * 0.3);
          g.fill({ color: 0xFFFFFF, alpha: flashAlpha });
        }

        wavePhase = (_dt / durationMs + wavePhase) % 1;
      },
      onDecay: (_ef) => {
        this.release(g);
      },
    };
    ef.container.visible = true;
    return { effect: ef };
  }

  // ── 资源清理 ──────────────────────────────

  clear(): void {
    this.anchorEffects.clear();
    for (const g of this.active) {
      g.clear();
      g.visible = false;
      g.mask = null;
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
