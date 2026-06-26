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

export class EmotionalWeatherRenderer {
  private fieldContainer: PIXI.Container;
  private scale = 1;

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

        // 闪电柱（从上方落下）
        if (t < 0.3) {
          const flashAlpha = (1 - t / 0.3) * 0.8;
          g.rect(x - 2 * s, y - 200 * s, 4 * s, 200 * s);
          g.fill({ color, alpha: flashAlpha });
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

        // 前 1s 气象局水印
        if (t < 0.25) {
          const text = new PIXI.Text('气象局特供', {
            fontFamily: 'monospace', fontSize: 10, fill: 0xFFFFFF,
          });
          text.anchor.set(0.5);
          text.position.set(0, -r - 15 * s);
          text.alpha = 0.8 * (1 - t / 0.25);
          g.addChild(text);
          setTimeout(() => { if (!text.destroyed) { g.removeChild(text); text.destroy(); } }, 1000);
        }
      },
      onDecay: () => {
        this.fieldContainer.removeChild(g);
        g.destroy();
      },
    };
    return { effect: ef };
  }

  clear(): void {}
  destroy(): void { this.clear(); }
}
