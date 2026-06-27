/**
 * 情绪天气 (Emotional Weather) - Carzeye
 * 前端视觉渲染器
 *
 * 视觉设计：
 * - 落雷：从天而降的闪电柱（颜色随时间变化），命中点扩散圆环
 * - 冰雹：小冰球从天而降，落地碎裂
 * - 极端气候爆发：全屏暴风雪滤镜 + 气象局水印
 */

import * as PIXI from 'pixi.js';
import { easeOutCubic, type ActiveEffect } from './VisualEffectUtils';

/**
 * 情绪天气视觉配置（数据驱动，从 WeaponRangeConfig 构建）
 */
export interface EmotionalWeatherVisualConfig {
  /** 落雷判定半径（逻辑 px） */
  lightningRadius?: number;
  /** 冰雹爆发范围（逻辑 px） */
  hailRadius?: number;
  /** 冰雹每颗半径（逻辑 px） */
  hailStoneRadius?: number;
  /** 爆发持续时间（ms） */
  burstDurationMs?: number;
}

/** "气象局特供"文字最大显示时长（ms），与原 setTimeout(1000) 保持一致 */
const BUREAU_TEXT_MAX_LIFE_MS = 1000;

/**
 * 活跃爆发实例
 * 持有暴风雪绘制体，以及"气象局特供"文字的生命周期状态（由 update(dt) 驱动过期）
 */
interface ActiveBurst {
  /** 暴风雪绘制体（含范围圈、脉冲、文字等所有子元素） */
  graphics: PIXI.Graphics;
  /** "气象局特供"文字；由 update(dt) 累加 textLife 判断过期 */
  bureauText?: PIXI.Text;
  /** 文字已显示时间（ms），由 update(dt) 累加 */
  textLife: number;
  /** 文字最大显示时间（ms），到达后由 update(dt) 移除并销毁 */
  textMaxLife: number;
  /** 文字是否已过期清理（避免重复销毁） */
  textDisposed: boolean;
}

export class EmotionalWeatherRenderer {
  private fieldContainer: PIXI.Container;
  private scale = 1;

  /** 活跃爆发实例集合（用于 update(dt) 驱动文字生命周期） */
  private activeBursts: Set<ActiveBurst> = new Set();

  constructor(fieldContainer: PIXI.Container) {
    this.fieldContainer = fieldContainer;
  }

  setScale(scale: number): void {
    this.scale = scale;
  }

  // ══════════════════════════════════════════════════════
  //  落雷
  // ══════════════════════════════════════════════════════

  triggerLightning(
    x: number,
    y: number,
    radius: number,
    color: number,
  ): { effect: ActiveEffect | null } {
    const s = this.scale;
    const g = new PIXI.Graphics();
    this.fieldContainer.addChild(g);

    const durationMs = 600;
    const ef: ActiveEffect = {
      type: 'emotional_weather_lightning',
      container: g as unknown as PIXI.Container,
      life: 0,
      maxLife: durationMs,
      onUpdate: (_ef, _dt) => {
        const t = _ef.life / _ef.maxLife;
        g.clear();

        // 闪电柱（从云端到地面的锯齿状折线，带发光效果）
        if (t < 0.3) {
          const flashAlpha = (1 - t / 0.3) * 0.8;
          const boltHeight = 200 * s;
          const segments = 8;
          const segH = boltHeight / segments;
          const startY = y - boltHeight;

          // 构建锯齿路径点：起点 (x, startY) → 终点 (x, y)，中段左右交替偏移
          const pts: Array<{ px: number; py: number }> = [];
          pts.push({ px: x, py: startY });
          for (let i = 1; i < segments; i++) {
            const py = startY + segH * i;
            // 之字形水平偏移（奇数段右偏，偶数段左偏）
            const offset = (i % 2 === 1 ? 1 : -1) * (5 * s);
            pts.push({ px: x + offset, py });
          }
          pts.push({ px: x, py: y }); // 落地到命中点

          // 外层发光描边（粗，白色，低 alpha）
          g.moveTo(pts[0].px, pts[0].py);
          for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].px, pts[i].py);
          g.stroke({ color: 0xFFFFFF, width: 6 * s, alpha: flashAlpha * 0.3 });

          // 主色描边（细，高 alpha）
          g.moveTo(pts[0].px, pts[0].py);
          for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].px, pts[i].py);
          g.stroke({ color, width: 2 * s, alpha: flashAlpha });
        }

        // 命中点扩散圆环
        const ringR = radius * s * easeOutCubic(Math.min(1, t * 1.5));
        g.circle(x, y, ringR);
        g.stroke({ color, width: 3 * s, alpha: 0.7 * (1 - t * 0.5) });
        g.circle(x, y, ringR * 0.6);
        g.fill({ color, alpha: 0.2 * (1 - t * 0.7) });

        // 中心闪光
        if (t < 0.2) {
          g.circle(x, y, 10 * s * (1 - t / 0.2));
          g.fill({ color: 0xFFFFFF, alpha: 0.9 * (1 - t / 0.2) });
        }
      },
      onDecay: () => {
        this.fieldContainer.removeChild(g);
        g.destroy();
      },
    };
    return { effect: ef };
  }

  // ══════════════════════════════════════════════════════
  //  冰雹
  // ══════════════════════════════════════════════════════

  triggerHail(
    x: number,
    y: number,
    radius: number,
  ): { effect: ActiveEffect | null } {
    const s = this.scale;
    const g = new PIXI.Graphics();
    this.fieldContainer.addChild(g);

    const durationMs = 500;
    const ef: ActiveEffect = {
      type: 'emotional_weather_hail',
      container: g as unknown as PIXI.Container,
      life: 0,
      maxLife: durationMs,
      onUpdate: (_ef, _dt) => {
        const t = _ef.life / _ef.maxLife;
        g.clear();

        // 冰球下落
        if (t < 0.6) {
          const fallT = t / 0.6;
          const cy = y - 60 * s * (1 - fallT);
          g.circle(x, cy, 6 * s);
          g.fill({ color: 0xAAEEFF, alpha: 0.9 });
          g.stroke({ color: 0xFFFFFF, width: 1 * s, alpha: 0.6 });
        } else {
          // 碎裂
          const breakT = (t - 0.6) / 0.4;
          g.circle(x, y, radius * s * breakT);
          g.stroke({ color: 0xAAEEFF, width: 2 * s, alpha: 0.6 * (1 - breakT) });
          // 碎片
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2;
            const r = radius * s * breakT * 0.8;
            g.circle(x + Math.cos(a) * r, y + Math.sin(a) * r, 2 * s);
            g.fill({ color: 0xFFFFFF, alpha: 0.7 * (1 - breakT) });
          }
        }
      },
      onDecay: () => {
        this.fieldContainer.removeChild(g);
        g.destroy();
      },
    };
    return { effect: ef };
  }

  // ══════════════════════════════════════════════════════
  //  极端气候爆发
  // ══════════════════════════════════════════════════════

  triggerBurst(
    x: number,
    y: number,
    radius: number,
    durationMs: number,
  ): { effect: ActiveEffect | null } {
    const s = this.scale;
    const g = new PIXI.Graphics();
    g.position.set(x, y);
    this.fieldContainer.addChild(g);

    // 创建"气象局特供"文字（仅创建一次），生命周期由 update(dt) 驱动过期
    const bureauText = new PIXI.Text('气象局特供', {
      fontFamily: 'monospace', fontSize: 10, fill: 0xFFFFFF,
    });
    bureauText.anchor.set(0.5);
    bureauText.position.set(0, -radius * s - 15 * s);
    bureauText.alpha = 0.8;
    g.addChild(bureauText);

    // 注册活跃爆发实例，update(dt) 据此累加 textLife 并在过期后清理文字
    const burst: ActiveBurst = {
      graphics: g,
      bureauText,
      textLife: 0,
      textMaxLife: BUREAU_TEXT_MAX_LIFE_MS,
      textDisposed: false,
    };
    this.activeBursts.add(burst);

    let phase = 0;
    const ef: ActiveEffect = {
      type: 'emotional_weather_burst',
      container: g as unknown as PIXI.Container,
      life: 0,
      maxLife: durationMs,
      onUpdate: (_ef, _dt) => {
        const t = _ef.life / _ef.maxLife;
        g.clear();

        // 暴风雪范围圈
        const r = radius * s;
        g.circle(0, 0, r);
        g.stroke({ color: 0xAAEEFF, width: 2 * s, alpha: 0.3 * (1 - t * 0.3) });
        g.circle(0, 0, r);
        g.fill({ color: 0x4DA6FF, alpha: 0.05 * (1 - t * 0.5) });

        // 脉冲
        const pulseR = r * (0.3 + 0.7 * Math.abs(Math.sin(phase)));
        g.circle(0, 0, pulseR);
        g.stroke({ color: 0xFFFFFF, width: 1.5 * s, alpha: 0.2 * (1 - t * 0.3) });
        phase += _dt / 400;

        // 气象局水印渐隐：textLife 在 [0, textMaxLife] 内 alpha 由 0.8 线性衰减到 0
        // 文字过期后由 update(dt) 负责销毁，这里仅做未过期时的 alpha 更新
        if (!burst.textDisposed && burst.bureauText && !burst.bureauText.destroyed) {
          const textT = Math.min(1, burst.textLife / burst.textMaxLife);
          burst.bureauText.alpha = 0.8 * (1 - textT);
        }
      },
      onDecay: () => {
        // 显式清理文字生命周期状态（graphics.destroy 会一并销毁子节点）
        this.disposeBureauText(burst);
        this.activeBursts.delete(burst);
        this.fieldContainer.removeChild(g);
        g.destroy({ children: true });
      },
    };
    return { effect: ef };
  }

  // ══════════════════════════════════════════════════════
  //  生命周期更新（由 EffectRenderer.update 主循环调用，dt 单位 ms）
  // ══════════════════════════════════════════════════════

  /**
   * 每帧更新：累加"气象局特供"文字的 textLife，超过 textMaxLife 后移除并销毁
   * 取代原 setTimeout(1000) 的延迟清理逻辑
   */
  update(dt: number): void {
    this.activeBursts.forEach((burst) => {
      if (burst.textDisposed) return;
      burst.textLife += dt;
      if (burst.textLife >= burst.textMaxLife) {
        this.disposeBureauText(burst);
      }
    });
  }

  /**
   * 销毁并重置"气象局特供"文字的生命周期状态
   * 用于：onDecay 清理时、update(dt) 过期后
   */
  private disposeBureauText(burst: ActiveBurst): void {
    if (burst.textDisposed) return;
    const text = burst.bureauText;
    if (text && !text.destroyed && !burst.graphics.destroyed) {
      burst.graphics.removeChild(text);
      text.destroy();
    }
    burst.bureauText = undefined;
    burst.textDisposed = true;
  }

  clear(): void {
    // 清理所有活跃爆发的文字生命周期状态（graphics 由 onDecay 负责销毁）
    this.activeBursts.forEach((burst) => this.disposeBureauText(burst));
    this.activeBursts.clear();
  }

  destroy(): void { this.clear(); }
}
