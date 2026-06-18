import * as PIXI from 'pixi.js';
import { FIREWALL_VISUAL_WIDTH, FIREWALL_VISUAL_HEIGHT } from '../constants';
import {
  lighten,
  drawHexagon,
  easeOutCubic,
  type ActiveEffect,
  type FirewallVisualConfig,
} from './VisualEffectUtils';

/**
 * 防火墙特效渲染器
 *
 * 职责：
 * - 防火墙 Graphics 对象池管理
 * - 绘制矩形防火墙 + 六边形蜂巢纹理 + 动态扫描线
 * - 出生生长动画（easeOutCubic）
 * - 硬化/普通状态的视觉区分
 *
 * 从 EffectRenderer 独立拆分。
 */
export class FirewallEffectRenderer {
  /** 对象池 */
  private pool: PIXI.Graphics[] = [];
  /** 活跃中的防火墙 */
  private active: Set<PIXI.Graphics> = new Set();
  /** wallId → Graphics[] 映射（用于后端同步移除） */
  private fieldEffects: Map<string, PIXI.Graphics[]> = new Map();
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

  /** 同步缩放 */
  setScale(scale: number): void {
    this.scale = scale;
  }

  // ── 对象池操作 ──────────────────────────────────────────

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

  // ── 触发接口 ──────────────────────────────────────────

  /**
   * 触发防火墙特效
   * @param x 受击位置 X（画布像素坐标）
   * @param y 受击位置 Y（画布像素坐标）
   * @param isHardened 是否为硬化状态（爆发）
   * @param wallId 唯一 ID（用于后端同步移除）
   * @param themeColor 玩家主题色
   * @param visualCfg 视觉配置（尺寸、颜色、持续时间等）
   * @returns { effect, wallId }
   */
  trigger(
    x: number,
    y: number,
    isHardened = false,
    wallId = `fw_${Date.now()}`,
    themeColor?: number,
    visualCfg?: FirewallVisualConfig,
  ): { effect: ActiveEffect | null; wallId: string } {
    const g = this.acquire();
    if (!g) return { effect: null, wallId };

    const GROW_DURATION = visualCfg?.growDurationMs ?? 400;
    // 与后端 WeaponRangeConfig 的 field.durationSec (18s) 保持一致
    const defaultMaxLife = isHardened ? 18000 : 18000;
    const maxLife = visualCfg?.maxLifeMs ?? defaultMaxLife;
    const s = this.scale;

    // 颜色：visualCfg > themeColor 推导 > 默认
    const color = visualCfg?.primaryColor ?? themeColor ?? (isHardened ? 0xFF3333 : 0x00BFFF);
    const innerColor = visualCfg?.innerColor ?? (themeColor
      ? lighten(themeColor, 40)
      : (isHardened ? 0xFF6666 : 0x66D9FF));

    // 视觉尺寸
    const visualW = (visualCfg?.visualWidth ?? FIREWALL_VISUAL_WIDTH) * s;
    const visualH = (visualCfg?.visualHeight ?? FIREWALL_VISUAL_HEIGHT) * s;
    const halfW = visualW / 2;
    const halfH = visualH / 2;
    const hexR = (visualCfg?.hexRadius ?? 12) * s;

    // 初始帧：缩小版
    g.clear();
    this.drawFirewallRect(g, x, y, halfW * 0.3, halfH * 0.3, hexR, color, innerColor, isHardened ? 1.0 : 0.4, s);

    // 扫描线相位
    let scanPhase = 0;

    const ef: ActiveEffect = {
      type: 'firewall',
      container: g as unknown as PIXI.Container,
      life: 0,
      maxLife,
      onUpdate: (_ef, _dt) => {
        const t = _ef.life / _ef.maxLife;
        // 出生生长动画：0-400ms
        const growT = Math.min(1, _ef.life / GROW_DURATION);
        const grow = easeOutCubic(growT);
        const growScale = 0.3 + grow * 0.7;
        const baseAlpha = isHardened ? 1.0 : 0.4;
        const finalAlpha = baseAlpha * (1 - t * 0.3);

        g.clear();
        this.drawFirewallRect(g, x, y, halfW * growScale, halfH * growScale, hexR, color, innerColor, finalAlpha, s);

        // 动态扫描线（从上到下，2s 周期）
        scanPhase = (scanPhase + _dt / 2000) % 1;
        const scanY = y - halfH * growScale + scanPhase * visualH * growScale;
        const scanHeight = 3 * s;
        g.rect(x - halfW * growScale, scanY - scanHeight / 2, visualW * growScale, scanHeight);
        g.fill({ color: 0xFFFFFF, alpha: 0.5 * (1 - t * 0.5) });
      },
      onDecay: (_ef) => {
        this.release(g);
        this.fieldEffects.delete(wallId);
      },
    };
    ef.container.visible = true;
    this.fieldEffects.set(wallId, [g]);
    return { effect: ef, wallId };
  }

  // ── 绘制方法 ──────────────────────────────────────────

  /** 绘制矩形防火墙（含六边形蜂巢纹理 + 光点） */
  private drawFirewallRect(
    g: PIXI.Graphics,
    x: number,
    y: number,
    halfW: number,
    halfH: number,
    hexR: number,
    color: number,
    innerColor: number,
    alpha: number,
    s: number,
  ): void {
    // 1. 半透明填充
    g.rect(x - halfW, y - halfH, halfW * 2, halfH * 2);
    g.fill({ color, alpha: alpha * 0.15 });

    // 2. 双线描边（外粗内细）
    g.rect(x - halfW, y - halfH, halfW * 2, halfH * 2);
    g.stroke({ color, width: 3 * s, alpha: alpha * 0.9 });
    g.rect(x - halfW + 2 * s, y - halfH + 2 * s, halfW * 2 - 4 * s, halfH * 2 - 4 * s);
    g.stroke({ color: innerColor, width: 1 * s, alpha: alpha * 0.5 });

    // 3. 六边形蜂巢纹理
    const hexW = hexR * 2;
    const hexH = hexR * Math.sqrt(3);
    const startX = x - halfW + hexR;
    const startY = y - halfH + hexR;

    for (let row = 0; ; row++) {
      const cy = startY + row * hexH * 0.75;
      if (cy > y + halfH) break;
      const offsetX = (row % 2 === 0) ? 0 : hexW * 0.375;
      for (let col = 0; ; col++) {
        const cx = startX + offsetX + col * hexW * 0.75;
        if (cx > x + halfW) break;
        if (cx - hexR < x - halfW || cx + hexR > x + halfW ||
            cy - hexR < y - halfH || cy + hexR > y + halfH) continue;
        drawHexagon(g, cx, cy, hexR, innerColor, alpha * 0.35);
      }
    }

    // 4. 中心光点
    g.circle(x, y, 3 * s);
    g.fill({ color: 0xFFFFFF, alpha: alpha * 0.8 });
    g.circle(x, y, 6 * s);
    g.fill({ color: innerColor, alpha: alpha * 0.25 });
  }

  // ── 资源清理 ──────────────────────────────────────────

  clear(): void {
    for (const g of this.active) {
      g.clear();
      g.visible = false;
    }
    this.active.clear();
    this.fieldEffects.clear();
  }

  destroy(): void {
    this.clear();
    for (const g of this.pool) {
      g.destroy(true);
    }
    this.pool.length = 0;
  }
}
