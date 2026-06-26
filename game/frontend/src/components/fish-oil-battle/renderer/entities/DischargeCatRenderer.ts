/**
 * 放电猫猫 (Discharge Cat) - 小金喵
 * 前端视觉渲染器
 *
 * 视觉设计：
 * - 放电猫虚影：黄色半透明猫形跟随球体游走
 * - 电弧弹射：链式闪电（黄白色），从猫→目标→弹射目标
 * - 雷霆万钧爆发：猫实体化（更亮更大），电弧加粗
 */

import * as PIXI from 'pixi.js';
import { easeOutCubic, type ActiveEffect } from './VisualEffectUtils';

/** 放电猫猫视觉配置（数据驱动） */
export interface DischargeCatVisualConfig {
  /** 放电猫虚影半径（逻辑 px） */
  catRadius?: number;
  /** 电弧判定范围（逻辑 px） */
  arcRange?: number;
  /** 爆发持续（ms） */
  burstDurationMs?: number;
}

export class DischargeCatRenderer {
  private entityContainer: PIXI.Container;
  private fieldContainer: PIXI.Container;
  private scale = 1;

  /** 每个玩家的放电猫虚影 */
  private cats: Map<string, PIXI.Graphics> = new Map();

  constructor(entityContainer: PIXI.Container, fieldContainer: PIXI.Container) {
    this.entityContainer = entityContainer;
    this.fieldContainer = fieldContainer;
  }

  setScale(scale: number): void {
    this.scale = scale;
  }

  // ══════════════════════════════════════════════════════
  //  放电猫虚影（常驻跟随）
  // ══════════════════════════════════════════════════════

  /**
   * 更新放电猫虚影位置
   * x/y 为画布像素坐标
   */
  updateCat(
    playerId: string,
    x: number,
    y: number,
    isBurst: boolean,
    themeColor = 0xFFD700,
  ): void {
    const s = this.scale;
    let cat = this.cats.get(playerId);
    if (!cat) {
      cat = new PIXI.Graphics();
      this.entityContainer.addChild(cat);
      this.cats.set(playerId, cat);
    }

    cat.position.set(x, y);
    cat.clear();

    const radius = (isBurst ? 18 : 12) * s;
    // 主体
    cat.circle(0, 0, radius);
    cat.fill({ color: themeColor, alpha: isBurst ? 0.9 : 0.5 });
    cat.stroke({ color: 0xFFFFFF, width: 1.5 * s, alpha: 0.6 });

    // 猫耳朵
    cat.ellipse(-radius * 0.5, -radius * 0.8, radius * 0.3, radius * 0.4);
    cat.fill({ color: themeColor, alpha: isBurst ? 0.9 : 0.5 });
    cat.ellipse(radius * 0.5, -radius * 0.8, radius * 0.3, radius * 0.4);
    cat.fill({ color: themeColor, alpha: isBurst ? 0.9 : 0.5 });

    // 眼睛
    cat.circle(-radius * 0.3, 0, radius * 0.12);
    cat.fill({ color: 0x000000, alpha: 1 });
    cat.circle(radius * 0.3, 0, radius * 0.12);
    cat.fill({ color: 0x000000, alpha: 1 });

    // 爆发时电火花
    if (isBurst) {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const r2 = radius * 1.5;
        cat.moveTo(Math.cos(a) * radius, Math.sin(a) * radius);
        cat.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
        cat.stroke({ color: 0xFFFFFF, width: 1 * s, alpha: 0.7 });
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
  //  电弧弹射特效
  // ══════════════════════════════════════════════════════

  /**
   * 触发电弧弹射链特效
   * arcNodes[0] = 放电猫位置，后续为命中目标位置
   */
  triggerArc(
    arcNodes: Array<{ x: number; y: number }>,
    isBurst: boolean,
    themeColor = 0xFFD700,
  ): { effect: ActiveEffect | null } {
    if (arcNodes.length < 2) return { effect: null };

    const s = this.scale;
    const g = new PIXI.Graphics();
    this.fieldContainer.addChild(g);

    const durationMs = isBurst ? 600 : 400;
    const baseWidth = (isBurst ? 4 : 3) * s;

    const ef: ActiveEffect = {
      type: 'discharge_cat_arc',
      container: g as unknown as PIXI.Container,
      life: 0,
      maxLife: durationMs,
      onUpdate: (_ef, _dt) => {
        const t = _ef.life / _ef.maxLife;
        g.clear();
        const alpha = (1 - t) * 0.9;

        // 绘制链式闪电（每段带锯齿）
        for (let i = 0; i < arcNodes.length - 1; i++) {
          const from = arcNodes[i];
          const to = arcNodes[i + 1];
          this.drawLightningSegment(g, from.x, from.y, to.x, to.y, baseWidth, alpha, themeColor);
        }

        // 命中点闪光
        for (let i = 1; i < arcNodes.length; i++) {
          const node = arcNodes[i];
          const flashR = 8 * s * (1 - t * 0.5);
          g.circle(node.x, node.y, flashR);
          g.fill({ color: 0xFFFFFF, alpha: alpha * 0.6 });
        }
      },
      onDecay: () => {
        this.fieldContainer.removeChild(g);
        g.destroy();
      },
    };
    return { effect: ef };
  }

  /** 绘制带锯齿的闪电线段 */
  private drawLightningSegment(
    g: PIXI.Graphics,
    x1: number, y1: number,
    x2: number, y2: number,
    width: number,
    alpha: number,
    color: number,
  ): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const segments = Math.max(3, Math.floor(dist / 20));
    const nx = -dy / dist;
    const ny = dx / dist;

    // 主线（白色核心）
    g.moveTo(x1, y1);
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const jitter = (Math.random() - 0.5) * 15;
      const px = x1 + dx * t + nx * jitter;
      const py = y1 + dy * t + ny * jitter;
      if (i < segments) {
        g.lineTo(px, py);
      } else {
        g.lineTo(x2, y2);
      }
    }
    g.stroke({ color: 0xFFFFFF, width, alpha });

    // 外层光晕
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke({ color, width: width * 2, alpha: alpha * 0.4 });
  }

  // ══════════════════════════════════════════════════════
  //  雷霆万钧爆发
  // ══════════════════════════════════════════════════════

  /**
   * 触发雷霆万钧爆发特效
   * x/y 为画布像素坐标
   */
  triggerBurst(
    _playerId: string,
    x: number,
    y: number,
    radius: number,
    durationMs: number,
    themeColor = 0xFFD700,
  ): { effect: ActiveEffect | null } {
    const s = this.scale;
    const r = radius * s;
    const g = new PIXI.Graphics();
    g.position.set(x, y);
    this.fieldContainer.addChild(g);

    let phase = 0;
    const ef: ActiveEffect = {
      type: 'discharge_cat_burst',
      container: g as unknown as PIXI.Container,
      life: 0,
      maxLife: durationMs,
      onUpdate: (_ef, _dt) => {
        const t = _ef.life / _ef.maxLife;
        g.clear();
        // 扩散光环
        const growT = Math.min(1, _ef.life / 300);
        const grow = easeOutCubic(growT);
        const currentR = r * grow;

        // 外圈雷电光环
        g.circle(0, 0, currentR);
        g.stroke({ color: themeColor, width: 3 * s, alpha: 0.6 * (1 - t * 0.3) });
        g.circle(0, 0, currentR);
        g.fill({ color: themeColor, alpha: 0.08 * (1 - t * 0.5) });

        // 脉冲雷电
        const pulseR = r * (0.4 + 0.6 * Math.abs(Math.sin(phase)));
        g.circle(0, 0, pulseR);
        g.stroke({ color: 0xFFFFFF, width: 2 * s, alpha: 0.5 * (1 - t * 0.3) });
        phase += _dt / 200;

        // 中心狮子形态闪回（前 0.3s）
        if (t < 0.075) {
          const lionAlpha = 0.8 * (1 - t / 0.075);
          // 简化狮子轮廓
          g.circle(0, 0, 15 * s);
          g.fill({ color: 0xFFAA00, alpha: lionAlpha });
          // 鬃毛
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            g.moveTo(Math.cos(a) * 12 * s, Math.sin(a) * 12 * s);
            g.lineTo(Math.cos(a) * 22 * s, Math.sin(a) * 22 * s);
            g.stroke({ color: 0xFF8800, width: 3 * s, alpha: lionAlpha });
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
  //  清理
  // ══════════════════════════════════════════════════════

  clear(): void {
    this.cats.forEach((_, playerId) => this.removeCat(playerId));
  }

  destroy(): void {
    this.clear();
  }
}
