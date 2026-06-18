import * as PIXI from 'pixi.js';
import { BLEND_MODES, SHOCKWAVE_MAX_RADIUS } from '../constants';
import {
  lighten,
  type ActiveEffect,
  type ShockwaveVisualConfig,
} from './VisualEffectUtils';

/**
 * 冲击波特效渲染器（方案 B + 向后兼容）
 *
 * 方案 B 新增：射线追踪波前渲染
 * - 波前由多条射线端点连接成的多边形曲线表示
 * - 碰墙时同一道波改变方向（水波反弹效果），颜色不变
 * - 使用 Map<waveId, WavefrontRenderData> 管理持久波前对象
 *
 * 向后兼容：保留旧的扩散圆动画（用于 SHOCKWAVE_TRIGGER / SHOCKWAVE_BOUNCE）
 * 注意：旧的 trigger/triggerBounce 方法仍可用，新方案通过 addWavefront 系列方法使用
 */
export class ShockwaveEffectRenderer {
  // ── 旧版：对象池（保留向后兼容） ─────────────────────
  private pool: PIXI.Graphics[] = [];
  private active: Set<PIXI.Graphics> = new Set();
  private bounced: Set<PIXI.Graphics> = new Set();

  // ── 方案 B：波前渲染数据 ─────────────────────────────
  private wavefronts: Map<string, WavefrontRenderData> = new Map();
  /** 波前容器（独立于旧版 Graphics） */
  private wavefrontContainer: PIXI.Container;

  // ── 通用 ────────────────────────────────────────────
  private container: PIXI.Container;
  private scale = 1;
  private canvasW: number;
  private canvasH: number;

  constructor(container: PIXI.Container, canvasW: number, canvasH: number, prePoolCount = 10) {
    this.container = container;
    this.canvasW = canvasW;
    this.canvasH = canvasH;

    // 旧版对象池
    for (let i = 0; i < prePoolCount; i++) {
      const g = new PIXI.Graphics();
      g.visible = false;
      g.blendMode = BLEND_MODES.ADD as unknown as PIXI.BLEND_MODES;
      container.addChild(g);
      this.pool.push(g);
    }

    // 波前容器
    this.wavefrontContainer = new PIXI.Container();
    this.wavefrontContainer.zIndex = 5;
    container.addChild(this.wavefrontContainer);
  }

  setScale(scale: number, canvasW: number, canvasH: number): void {
    this.scale = scale;
    this.canvasW = canvasW;
    this.canvasH = canvasH;
  }

  // ══════════════════════════════════════════════════════
  //  方案 B：射线追踪波前 API
  // ══════════════════════════════════════════════════════

  /**
   * 添加波前（收到 SHOCKWAVE_WAVEFRONT_TRIGGER 时调用）
   * @returns ActiveEffect 用于统一生命周期管理
   */
  addWavefront(
    waveId: string,
    x: number, y: number,
    isBurst: boolean,
    themeColor?: number,
    initialEndpoints?: Array<{ x: number; y: number }>,
    initialAlpha = 1,
  ): ActiveEffect | null {
    // 清除同名旧波前
    this.removeWavefront(waveId);

    const g = new PIXI.Graphics();
    g.blendMode = BLEND_MODES.ADD as unknown as PIXI.BLEND_MODES;
    this.wavefrontContainer.addChild(g);

    const primary = themeColor ?? 0xFF00FF;
    const glow = themeColor ? lighten(themeColor, 50) : 0xFF66FF;

    const data: WavefrontRenderData = {
      graphics: g,
      waveId,
      originX: x,
      originY: y,
      isBurst,
      color: primary,
      glowColor: glow,
      endpoints: initialEndpoints ?? [],
      alpha: initialAlpha,
      createdAt: performance.now(),
    };
    this.wavefronts.set(waveId, data);

    // 初次绘制
    this.drawWavefrontPolygon(data);

    // 创建持久 ActiveEffect（生命周期很长，由 REMOVE 事件终止）
    const ef: ActiveEffect = {
      type: 'shockwave',
      container: g as unknown as PIXI.Container,
      life: 0,
      maxLife: 600000, // 10 分钟（实际由 REMOVE 事件控制）
      onUpdate: (_ef, _dt) => {
        // 每帧重绘（由外部的 updateWavefrontData 更新 endpoints）
        const wfData = this.wavefronts.get(waveId);
        if (wfData) {
          this.drawWavefrontPolygon(wfData);
        }
      },
      onDecay: (_ef) => {
        this.removeWavefront(waveId);
      },
    };
    ef.container.visible = true;

    return ef;
  }

  /**
   * 更新波前端点数据（收到 SHOCKWAVE_WAVEFRONT_UPDATE 时调用）
   */
  updateWavefrontData(
    waveId: string,
    endpoints: Array<{ x: number; y: number }>,
    alpha?: number,
  ): void {
    const data = this.wavefronts.get(waveId);
    if (!data) return;

    data.endpoints = endpoints;
    if (alpha !== undefined) data.alpha = alpha;
  }

  /**
   * 移除波前（收到 SHOCKWAVE_WAVEFRONT_REMOVE 或波结束时调用）
   */
  removeWavefront(waveId: string): void {
    const data = this.wavefronts.get(waveId);
    if (data) {
      data.graphics.clear();
      data.graphics.destroy(true);
      this.wavefronts.delete(waveId);
    }
  }

  // ── 波前绘制 ──────────────────────────────────────────

  /** 将后端逻辑坐标映射为画布像素坐标 */
  private mapPoint(logicalX: number, logicalY: number): { x: number; y: number } {
    return {
      x: logicalX * this.scale + this.canvasW / 2 - (1280 * this.scale) / 2,
      y: logicalY * this.scale + this.canvasH / 2 - (720 * this.scale) / 2,
    };
  }

  /**
   * 绘制波前多边形
   * - 连接所有射线端点形成曲线
   * - 主色描边 + 发光色内侧描边
   * - alpha 控制透明度
   */
  private drawWavefrontPolygon(data: WavefrontRenderData): void {
    const g = data.graphics;
    g.clear();

    const pts = data.endpoints;
    if (pts.length < 3) return;

    // 映射所有端点到画布像素坐标
    const mapped = pts.map(p => this.mapPoint(p.x, p.y));

    // 计算波前大致尺寸，用于描边宽度
    let avgDist = 0;
    const cx = mapped.reduce((s, p) => s + p.x, 0) / mapped.length;
    const cy = mapped.reduce((s, p) => s + p.y, 0) / mapped.length;
    for (const p of mapped) {
      avgDist += Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
    }
    avgDist /= mapped.length;
    const strokeWidth = Math.max(2, Math.min(8, avgDist * 0.02)) * this.scale;

    // 绘制波前曲线（连接所有端点）
    g.moveTo(mapped[0].x, mapped[0].y);
    for (let i = 1; i < mapped.length; i++) {
      g.lineTo(mapped[i].x, mapped[i].y);
    }
    g.closePath();

    // 主色描边（波前外沿）
    g.stroke({ color: data.color, width: strokeWidth, alpha: data.alpha * 0.9 });

    // 内侧发光描边
    const innerWidth = Math.max(1, strokeWidth * 0.4);
    g.moveTo(mapped[0].x, mapped[0].y);
    for (let i = 1; i < mapped.length; i++) {
      g.lineTo(mapped[i].x, mapped[i].y);
    }
    g.closePath();
    g.stroke({ color: data.glowColor, width: innerWidth, alpha: data.alpha * 0.5 });

    // 低透明度填充（波前内部区域）
    g.moveTo(mapped[0].x, mapped[0].y);
    for (let i = 1; i < mapped.length; i++) {
      g.lineTo(mapped[i].x, mapped[i].y);
    }
    g.closePath();
    g.fill({ color: data.color, alpha: data.alpha * 0.08 });
  }

  // ══════════════════════════════════════════════════════
  //  旧版 API（向后兼容，保留扩散圆动画）
  // ══════════════════════════════════════════════════════

  private acquire(): PIXI.Graphics | null {
    for (const g of this.pool) {
      if (!this.active.has(g)) {
        this.active.add(g);
        this.bounced.delete(g);
        g.visible = true;
        return g;
      }
    }
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

    const primary = visualCfg?.primaryColor ?? themeColor ?? 0xFF00FF;
    const glow = visualCfg?.glowColor ?? (themeColor ? lighten(themeColor, 50) : 0xFF66FF);
    const bounceClr = visualCfg?.bounceColor ?? 0x00BFFF;

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

  clear(): void {
    // 清理波前
    for (const [id] of this.wavefronts) {
      this.removeWavefront(id);
    }
    this.wavefronts.clear();

    // 清理旧版
    for (const g of this.active) {
      g.clear();
      g.visible = false;
    }
    this.active.clear();
    this.bounced.clear();
  }

  destroy(): void {
    this.clear();
    for (const g of this.pool) {
      g.destroy(true);
    }
    this.pool.length = 0;
    this.wavefrontContainer.destroy({ children: true });
  }
}

// ─── 波前渲染数据 ──────────────────────────────────────
interface WavefrontRenderData {
  graphics: PIXI.Graphics;
  waveId: string;
  originX: number;
  originY: number;
  isBurst: boolean;
  color: number;
  glowColor: number;
  endpoints: Array<{ x: number; y: number }>;
  alpha: number;
  createdAt: number;
}
