/**
 * [特效名称] 渲染器模板
 *
 * 使用方法：
 * 1. 复制此文件到 renderer/entities/ 目录并重命名
 * 2. 实现 TODO 标记的方法
 * 3. 在 EffectRenderer.ts 中集成（添加成员变量、公开 API、clear/destroy 调用）
 * 4. 在 CyberFishRenderer.ts 的 triggerSkillEffect 中处理新事件类型
 * 5. 在 useFishOilBattle.ts 的 onVisualEvent 中路由事件
 */

import * as PIXI from 'pixi.js';
import { BLEND_MODES } from '../constants';
import type { ActiveEffect } from './VisualEffectUtils';

/** 你的特效视觉配置 */
export interface YourEffectVisualConfig {
  /** 主色 */
  primaryColor?: number;
  /** 发光色 */
  glowColor?: number;
  /** 特效半径（逻辑 px） */
  radius?: number;
  /** 扩散持续时间（ms） */
  expandDurationMs?: number;
  /** 是否爆发模式 */
  isBurst?: boolean;
  // TODO: 添加自定义配置
}

export class YourEffectRenderer {
  private container: PIXI.Container;
  private scale = 1;
  private canvasW: number;
  private canvasH: number;

  // ── 对象池 ────────────────────────────────────────────
  private pool: PIXI.Graphics[] = [];
  private active: Set<PIXI.Graphics> = new Set();

  // TODO: 添加其他持久数据结构（如持续效果的 Map）

  /**
   * @param container 分层容器（entity/field/hologram）
   * @param canvasW 画布宽度
   * @param canvasH 画布高度
   * @param prePoolCount 预创建对象数量
   */
  constructor(container: PIXI.Container, canvasW: number, canvasH: number, prePoolCount = 10) {
    this.container = container;
    this.canvasW = canvasW;
    this.canvasH = canvasH;

    // 初始化对象池
    for (let i = 0; i < prePoolCount; i++) {
      const g = new PIXI.Graphics();
      g.visible = false;
      g.blendMode = BLEND_MODES.NORMAL as unknown as PIXI.BLEND_MODES;
      container.addChild(g);
      this.pool.push(g);
    }
  }

  /**
   * 同步缩放因子（由 EffectRenderer.setScale 驱动）
   */
  setScale(scale: number, canvasW: number, canvasH: number): void {
    this.scale = scale;
    this.canvasW = canvasW;
    this.canvasH = canvasH;
  }

  // ── 对象池操作 ─────────────────────────────────────

  /** 从对象池获取一个 Graphics */
  private acquire(): PIXI.Graphics | null {
    for (const g of this.pool) {
      if (!this.active.has(g)) {
        this.active.add(g);
        g.visible = true;
        return g;
      }
    }
    // 池耗尽，创建新的
    const g = new PIXI.Graphics();
    g.blendMode = BLEND_MODES.NORMAL as unknown as PIXI.BLEND_MODES;
    this.container.addChild(g);
    this.pool.push(g);
    this.active.add(g);
    return g;
  }

  /** 归还 Graphics 到对象池 */
  private release(g: PIXI.Graphics): void {
    g.clear();
    g.visible = false;
    this.active.delete(g);
  }

  /**
   * 触发特效
   * @param x, y 画布坐标（已由 CyberFishRenderer.toCanvas 转换）
   * @param config 视觉配置
   * @returns ActiveEffect[] 用于生命周期管理
   */
  trigger(
    x: number,
    y: number,
    config?: YourEffectVisualConfig,
  ): ActiveEffect[] {
    const effects: ActiveEffect[] = [];

    const s = this.scale;
    const primary = config?.primaryColor ?? 0xFFFFFF;
    const maxRadius = (config?.radius ?? 200) * s;
    const duration = config?.expandDurationMs ?? 1500;
    const isBurst = config?.isBurst ?? false;

    // TODO: 实现特效逻辑
    // 示例：扩散圆环效果
    const count = isBurst ? 3 : 1;
    for (let i = 0; i < count; i++) {
      const g = this.acquire();
      if (!g) continue;

      const delayMs = isBurst ? i * 120 : 0;

      const ef: ActiveEffect = {
        type: 'your_effect',
        container: g as unknown as PIXI.Container,
        life: delayMs,
        maxLife: duration + delayMs,
        onUpdate: (ef, _dt) => {
          if (ef.life < delayMs) return;

          const localLife = ef.life - delayMs;
          const localMax = ef.maxLife - delayMs;
          const t = Math.min(localLife / localMax, 1);

          // TODO: 根据进度绘制特效帧
          this.drawFrame(g, t, x, y, maxRadius, primary);
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

  // ── 绘制方法 ──────────────────────────────────────

  /**
   * 绘制特效帧
   * @param g Graphics 对象
   * @param t 进度 0-1
   * @param x, y 中心坐标
   * @param maxRadius 最大半径
   * @param color 主色
   */
  private drawFrame(
    g: PIXI.Graphics,
    t: number,
    x: number,
    y: number,
    maxRadius: number,
    color: number,
  ): void {
    // 透明度：前 20% 渐入，后 40% 渐出
    let alpha: number;
    if (t < 0.2) {
      alpha = t / 0.2 * 0.9;
    } else if (t > 0.6) {
      alpha = (1 - (t - 0.6) / 0.4) * 0.9;
    } else {
      alpha = 0.9;
    }

    const radius = t * maxRadius;
    const strokeWidth = 25 * this.scale;

    g.clear();

    // TODO: 绘制特效形状
    // 示例：扩散圆环
    g.circle(x, y, radius);
    g.stroke({ color, width: strokeWidth, alpha });

    // 更多 PIXI.Graphics API：
    // - g.rect(x, y, w, h) + g.fill({ color, alpha })
    // - g.poly(points) + g.stroke(...)
    // - g.moveTo / g.lineTo / g.quadraticCurveTo / g.bezierCurveTo
    // - g.arc(x, y, r, startAngle, endAngle)
    // - g.ellipse(x, y, w, h)
  }

  // ── 资源清理 ──────────────────────────────────────

  clear(): void {
    for (const g of this.active) {
      g.clear();
      g.visible = false;
    }
    this.active.clear();
    // TODO: 清理持久数据结构
  }

  destroy(): void {
    this.clear();
    for (const g of this.pool) {
      g.destroy(true);
    }
    this.pool.length = 0;
    // TODO: 销毁持久数据结构中的 Graphics
  }
}
