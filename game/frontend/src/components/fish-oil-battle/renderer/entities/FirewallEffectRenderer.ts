import * as PIXI from 'pixi.js';
import { FIREWALL_VISUAL_WIDTH, FIREWALL_VISUAL_HEIGHT } from '../constants';
import {
  lighten,
  easeOutCubic,
  type ActiveEffect,
  type FirewallVisualConfig,
} from './VisualEffectUtils';

/**
 * 防火墙特效渲染器
 *
 * 职责：
 * - 防火墙 Graphics 对象池管理
 * - 绘制矩形边框 + 内部正六边形蜂巢纹理
 * - 动态扫描线 + 出生生长动画
 *
 * 设计思路：
 * - 背景半透明填充（颜色跟随主题色）
 * - 双层矩形描边（外粗内细，科技感边框）
 * - 内部六边形蜂巢：深色填充 + 亮色描边，高对比确保轮廓清晰
 * - 六边形按矩形边界精确裁剪，不越界
 */
export class FirewallEffectRenderer {
  /** 对象池 */
  private pool: PIXI.Graphics[] = [];
  /** 活跃中的防火墙 */
  private active: Set<PIXI.Graphics> = new Set();
  /** wallId → Graphics 映射 */
  private fieldEffects: Map<string, PIXI.Graphics> = new Map();
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
    g.mask = null;
    this.active.delete(g);
  }

  // ── 触发接口 ──────────────────────────────────────────

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
    const defaultMaxLife = 18000;
    const maxLife = visualCfg?.maxLifeMs ?? defaultMaxLife;
    const s = this.scale;

    // 颜色
    const color = visualCfg?.primaryColor ?? themeColor ?? (isHardened ? 0xFF3333 : 0x00BFFF);
    const innerColor = visualCfg?.innerColor ?? (themeColor
      ? lighten(themeColor, 40)
      : (isHardened ? 0xFF6666 : 0x66D9FF));

    // 视觉尺寸
    const visualW = (visualCfg?.visualWidth ?? FIREWALL_VISUAL_WIDTH) * s;
    const visualH = (visualCfg?.visualHeight ?? FIREWALL_VISUAL_HEIGHT) * s;
    const halfW = visualW / 2;
    const halfH = visualH / 2;

    const hexR = (visualCfg?.hexRadius ?? 24) * s;
    const hexLineWidth = visualCfg?.hexLineWidth;
    const hexLineAlpha = visualCfg?.hexLineAlpha;

    // 初始帧
    g.clear();
    this.drawFirewallRect(g, x, y, halfW * 0.3, halfH * 0.3, hexR, color, innerColor, isHardened ? 1.0 : 0.45, s, hexLineWidth, hexLineAlpha);

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
        const baseAlpha = isHardened ? 1.0 : 0.45;
        const finalAlpha = baseAlpha * (1 - t * 0.3);

        g.clear();
        this.drawFirewallRect(g, x, y, halfW * growScale, halfH * growScale, hexR, color, innerColor, finalAlpha, s, hexLineWidth, hexLineAlpha);

        // 动态扫描线（从上到下，2s 周期）
        scanPhase = (scanPhase + _dt / 2000) % 1;
        const scanY = y - halfH * growScale + scanPhase * visualH * growScale;
        const scanHeight = 3 * s;
        g.rect(x - halfW * growScale, scanY - scanHeight / 2, visualW * growScale, scanHeight);
        g.fill({ color: 0xFFFFFF, alpha: 0.3 * (1 - t * 0.5) });
      },
      onDecay: (_ef) => {
        this.release(g);
        this.fieldEffects.delete(wallId);
      },
    };
    ef.container.visible = true;
    this.fieldEffects.set(wallId, g);
    return { effect: ef, wallId };
  }

  // ── 绘制方法 ──────────────────────────────────────────

  /**
   * 绘制矩形防火墙（背景填充 + 双层描边 + 蜂巢纹理 + 中心光点）
   */
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
    hexLineWidth?: number,
    hexLineAlpha?: number,
  ): void {
    const left = x - halfW;
    const top = y - halfH;
    const fullW = halfW * 2;
    const fullH = halfH * 2;

    // 1. 背景填充
    g.rect(left, top, fullW, fullH);
    g.fill({ color, alpha: alpha * 0.12 });

    // 2. 双线描边（外粗内细）
    g.rect(left, top, fullW, fullH);
    g.stroke({ color, width: 3 * s, alpha: alpha * 0.95 });
    g.rect(left + 2 * s, top + 2 * s, fullW - 4 * s, fullH - 4 * s);
    g.stroke({ color: innerColor, width: 1.5 * s, alpha: alpha * 0.5 });

    // 3. 蜂巢纹理（精确裁剪在矩形内部，使用边界同色）
    this.drawHoneycomb(g, left, top, fullW, fullH, hexR, color, alpha, s, hexLineWidth, hexLineAlpha);

    // 4. 中心光点
    g.circle(x, y, 3 * s);
    g.fill({ color: 0xFFFFFF, alpha: alpha * 0.8 });
    g.circle(x, y, 6 * s);
    g.fill({ color: innerColor, alpha: alpha * 0.3 });
  }

  /**
   * 绘制蜂巢纹理 —— 每个六边形只画独立的 6 条边，通过 mask 裁剪在矩形内。
   *
   * 六边形顶点计算（flat-top）：
   *   顶点角度偏移 30°，六个顶点等距分布在圆周上。
   */
  private drawHoneycomb(
    g: PIXI.Graphics,
    left: number,
    top: number,
    fullW: number,
    fullH: number,
    hexR: number,
    color: number,
    alpha: number,
    _s: number,
    lineWidthOverride?: number,
    lineAlphaOverride?: number,
  ): void {
    const hexH = hexR * Math.sqrt(3);
    const right = left + fullW;
    const bottom = top + fullH;

    const lineColor = color;
    const lineAlpha = lineAlphaOverride ?? alpha * 0.75;
    const lineWidth = lineWidthOverride ?? 2;

    // 每个六边形完整 6 顶点（flat-top，从最左顶点开始逆时针）
    const hexVerts = (cx: number, cy: number): [number, number][] => {
      const verts: [number, number][] = [];
      for (let i = 0; i < 6; i++) {
        const angle = Math.PI / 6 + (Math.PI / 3) * i; // 30° 起始，flat-top
        verts.push([cx + hexR * Math.cos(angle), cy + hexR * Math.sin(angle)]);
      }
      return verts;
    };

    // 逐行逐列画完整六边形
    for (let row = 0; ; row++) {
      const cy = top + row * hexH * 0.5 + hexH * 0.25;
      if (cy > bottom + hexH) break;
      const isOddRow = row % 2 === 1;
      const xOff = isOddRow ? hexR * 1.5 : 0;
      for (let col = 0; ; col++) {
        const cx = left + xOff + col * hexR * 3;
        if (cx > right + hexR) break;

        // 快速跳过完全在矩形外的六边形
        if (cx + hexR < left || cx - hexR > right || cy + hexH * 0.5 < top || cy - hexH * 0.5 > bottom) continue;

        const verts = hexVerts(cx, cy);
        g.moveTo(verts[0][0], verts[0][1]);
        for (let i = 1; i < 6; i++) g.lineTo(verts[i][0], verts[i][1]);
        g.closePath();
      }
    }

    // 用 mask 裁剪到矩形范围内，超出部分不显示
    const mask = new PIXI.Graphics();
    mask.rect(left, top, fullW, fullH);
    mask.fill({ color: 0xFFFFFF });
    g.mask = mask;

    g.stroke({ color: lineColor, width: lineWidth, alpha: lineAlpha });
  }

  // ── 资源清理 ──────────────────────────────────────────

  clear(): void {
    this.fieldEffects.clear();
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
      g.destroy(true);
    }
    this.pool.length = 0;
  }
}
