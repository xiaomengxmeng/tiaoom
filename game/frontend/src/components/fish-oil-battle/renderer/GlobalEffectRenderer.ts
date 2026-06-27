/**
 * 赛博鱼油 · 全局彩蛋特效渲染器（闲乘月质量标准）
 *
 * 负责 3 个彩蛋的前端视觉表现：
 * 1. 古今观察者 - 全屏闪白（10 层径向渐变 白→透明）
 * 2. 俺寻思之力 - 全屏马赛克闪动（多层叠加：彩色块 + 稀疏高亮块）
 * 3. 万物亲和 - 淡粉色牵引线（quadraticCurveTo 曲线 + 3 层发光描边）
 *
 * 渲染层级：
 * - L5 全息舞台层：闪白、马赛克闪动
 * - L2 实体投射层：牵引线
 *
 * 已迁移至 PixiJS v8 Graphics API（g.rect().fill() / g.circle().fill() / g.stroke()）
 */

import * as PIXI from 'pixi.js';
import type { VisualEventData } from '$/backend/src/games/fish-oil-battle/shared/protocol';
import { GlobalEffectType, VisualEventType } from '$/backend/src/games/fish-oil-battle/config/GameEnums';

// ══════════════════════════════════════════════════════
//  颜色常量
// ══════════════════════════════════════════════════════

const FLASH_WHITE = 0xffffff;     // 闪白核心色
const BOND_PINK = 0xffb6c1;       // 牵引线淡粉色（外层）
const BOND_PINK_BRIGHT = 0xffddee; // 牵引线亮粉色（内层高亮）

/** 闪白径向渐变层数 */
const FLASH_LAYERS = 10;

export class GlobalEffectRenderer {
  private l2Container: PIXI.Container;
  private l5Container: PIXI.Container;
  private canvasW: number;
  private canvasH: number;

  // ── 牵引线缓存（万物亲和） ────────────
  private bondLine: PIXI.Graphics | null = null;
  /** 牵引线最大显示距离（逻辑 px），超过此距离不绘制 */
  private static readonly MAX_BOND_DIST = 500;

  // ── 闪白叠加层（古今观察者） ──────────
  private flashOverlay: PIXI.Graphics | null = null;
  private flashTimer = 0;
  private flashDuration = 0;

  // ── 马赛克叠加层（俺寻思之力） ────────
  private mosaicOverlay: PIXI.Graphics | null = null;
  private mosaicTimer = 0;
  private mosaicDuration = 0;
  /** 马赛克块大小 */
  private static readonly MOSAIC_BLOCK = 20;

  constructor(l2Container: PIXI.Container, l5Container: PIXI.Container, canvasW: number, canvasH: number) {
    this.l2Container = l2Container;
    this.l5Container = l5Container;
    this.canvasW = canvasW;
    this.canvasH = canvasH;
  }

  /** 更新画布尺寸（窗口 resize 时调用） */
  resize(canvasW: number, canvasH: number): void {
    this.canvasW = canvasW;
    this.canvasH = canvasH;
  }

  /**
   * 处理全局彩蛋视觉事件
   * @param event 后端发来的 VisualEventData
   * @param mapX 逻辑坐标 → 画布像素映射函数
   * @param mapY 逻辑坐标 → 画布像素映射函数
   */
  handleGlobalEvent(
    event: VisualEventData,
    mapX: (x: number) => number,
    mapY: (y: number) => number,
  ): void {
    if (event.type !== VisualEventType.GLOBAL_EFFECT || !event.globalEffectType) return;

    switch (event.globalEffectType) {
      case GlobalEffectType.TIME_OBSERVER:
        this.playFlashWhite(event.durationMs ?? 100);
        break;
      case GlobalEffectType.RANDOM_FORCE:
        this.playMosaicFlash(event.durationMs ?? 150);
        break;
      case GlobalEffectType.NATURE_BOND:
        this.updateBondLine(event, mapX, mapY);
        break;
    }
  }

  /** 每帧更新（在 render loop 中调用，dt 单位 ms） */
  update(dt: number): void {
    this.updateFlash(dt);
    this.updateMosaic(dt);
  }

  /** 清理所有效果 */
  destroy(): void {
    this.clearBondLine();
    this.clearFlash();
    this.clearMosaic();
  }

  // ═══════════════════════════════════════════════════
  //  古今观察者：全屏闪白（10 层径向渐变 白→透明）
  // ═══════════════════════════════════════════════════

  private playFlashWhite(durationMs: number): void {
    // 创建或重建闪白叠加层
    if (!this.flashOverlay) {
      this.flashOverlay = new PIXI.Graphics();
      this.l5Container.addChild(this.flashOverlay);
    }

    // 绘制 10 层径向渐变（白→透明），以画布中心为圆心
    this.drawFlashGradient();

    this.flashOverlay.visible = true;
    this.flashOverlay.alpha = 1.0;
    this.flashTimer = 0;
    this.flashDuration = durationMs;
  }

  /**
   * 绘制闪白径向渐变（10 层同心圆，白→透明）
   * 以画布中心为圆心，最大半径 = 对角线一半
   */
  private drawFlashGradient(): void {
    if (!this.flashOverlay) return;
    this.flashOverlay.clear();

    const cx = this.canvasW / 2;
    const cy = this.canvasH / 2;
    const maxR = Math.sqrt(cx * cx + cy * cy);

    // 10 层同心圆叠加（中心白 → 透明）
    for (let i = 0; i < FLASH_LAYERS; i++) {
      const t = i / (FLASH_LAYERS - 1); // 0(中心) → 1(边缘)
      const r = maxR * (0.1 + 0.9 * t);
      // alpha：中心高，边缘趋近 0
      const alpha = (1 - t) * 0.3;
      this.flashOverlay.circle(cx, cy, r);
      this.flashOverlay.fill({ color: FLASH_WHITE, alpha });
    }
  }

  private updateFlash(dt: number): void {
    if (!this.flashOverlay || !this.flashOverlay.visible) return;

    this.flashTimer += dt;
    const progress = this.flashTimer / this.flashDuration;

    if (progress >= 1) {
      this.clearFlash();
    } else {
      // easeOutCubic 衰减：0→1 进度中，alpha 从 1→0（前期快、后期慢）
      const eased = this.easeOutCubic(progress);
      this.flashOverlay.alpha = 1 - eased;
    }
  }

  private clearFlash(): void {
    if (this.flashOverlay) {
      this.flashOverlay.visible = false;
      this.flashOverlay.alpha = 0;
    }
    this.flashTimer = 0;
  }

  // ═══════════════════════════════════════════════════
  //  俺寻思之力：全屏马赛克闪动（多层叠加）
  // ═══════════════════════════════════════════════════

  private playMosaicFlash(durationMs: number): void {
    if (!this.mosaicOverlay) {
      this.mosaicOverlay = new PIXI.Graphics();
      this.l5Container.addChild(this.mosaicOverlay);
    }

    this.mosaicOverlay.clear();
    this.generateMosaic();

    this.mosaicOverlay.visible = true;
    this.mosaicOverlay.alpha = 0.5;
    this.mosaicTimer = 0;
    this.mosaicDuration = durationMs;
  }

  /**
   * 生成随机彩色马赛克块（多层叠加）
   * - Layer 1：稀疏彩色块（alpha 0.3-0.7）
   * - Layer 2：稀疏高亮白块（alpha 0.4-0.7，增加闪烁感）
   */
  private generateMosaic(): void {
    if (!this.mosaicOverlay) return;

    const blockW = GlobalEffectRenderer.MOSAIC_BLOCK;
    const blockH = GlobalEffectRenderer.MOSAIC_BLOCK;
    const cols = Math.ceil(this.canvasW / blockW);
    const rows = Math.ceil(this.canvasH / blockH);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * blockW;
        const y = r * blockH;

        // Layer 1：稀疏彩色块（50% 概率跳过）
        if (Math.random() > 0.5) {
          const hue = Math.random() * 360;
          const color = this.hslToHex(hue, 80, 50 + Math.random() * 30);
          const alpha = 0.3 + Math.random() * 0.4;
          this.mosaicOverlay.rect(x, y, blockW, blockH);
          this.mosaicOverlay.fill({ color, alpha });
        }

        // Layer 2：稀疏高亮白块（15% 概率，增加闪烁感）
        if (Math.random() > 0.85) {
          const alpha = 0.4 + Math.random() * 0.3;
          this.mosaicOverlay.rect(x, y, blockW, blockH);
          this.mosaicOverlay.fill({ color: FLASH_WHITE, alpha });
        }
      }
    }
  }

  private updateMosaic(dt: number): void {
    if (!this.mosaicOverlay || !this.mosaicOverlay.visible) return;

    this.mosaicTimer += dt;
    const progress = this.mosaicTimer / this.mosaicDuration;

    if (progress >= 1) {
      this.clearMosaic();
    } else {
      // easeOutCubic 衰减
      const eased = this.easeOutCubic(progress);
      this.mosaicOverlay.alpha = 0.5 * (1 - eased);
    }
  }

  private clearMosaic(): void {
    if (this.mosaicOverlay) {
      this.mosaicOverlay.visible = false;
      this.mosaicOverlay.alpha = 0;
      this.mosaicOverlay.clear();
    }
    this.mosaicTimer = 0;
  }

  // ═══════════════════════════════════════════════════
  //  万物亲和：淡粉色牵引线（quadraticCurveTo 曲线 + 3 层发光描边）
  // ═══════════════════════════════════════════════════

  private updateBondLine(
    event: VisualEventData,
    mapX: (x: number) => number,
    mapY: (y: number) => number,
  ): void {
    // 距离超过最大值 → 清除线
    if ((event.radius ?? 0) > GlobalEffectRenderer.MAX_BOND_DIST) {
      this.clearBondLine();
      return;
    }

    // 创建或更新牵引线
    if (!this.bondLine) {
      this.bondLine = new PIXI.Graphics();
      this.l2Container.addChild(this.bondLine);
    }

    const x1 = mapX(event.x ?? 0);
    const y1 = mapY(event.y ?? 0);
    const x2 = mapX(event.tx ?? 0);
    const y2 = mapY(event.ty ?? 0);
    const dist = event.radius ?? 1;
    const maxDist = GlobalEffectRenderer.MAX_BOND_DIST;

    // 距离越近线越亮
    const brightness = 1 - Math.min(1, dist / maxDist);
    const alpha = 0.1 + brightness * 0.4; // 0.1 ~ 0.5

    // 计算曲线控制点（垂直于连线方向偏移，制造弧形）
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lineDist = Math.sqrt(dx * dx + dy * dy) || 1;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    // 垂直偏移量（与距离成正比，上限 30px）
    const offset = Math.min(lineDist * 0.15, 30);
    const cpX = mx + (-dy / lineDist) * offset;
    const cpY = my + (dx / lineDist) * offset;

    this.bondLine.clear();

    // 3 层发光描边（外→内：粗外晕 → 主线 → 细高亮）
    // Layer 1：外层光晕（粗，低 alpha，BOND_PINK）
    this.bondLine.moveTo(x1, y1);
    this.bondLine.quadraticCurveTo(cpX, cpY, x2, y2);
    this.bondLine.stroke({ color: BOND_PINK, width: 6, alpha: alpha * 0.3 });

    // Layer 2：主线（中等宽度，中 alpha，BOND_PINK）
    this.bondLine.moveTo(x1, y1);
    this.bondLine.quadraticCurveTo(cpX, cpY, x2, y2);
    this.bondLine.stroke({ color: BOND_PINK, width: 2.5, alpha });

    // Layer 3：内层高亮（细，高 alpha，BOND_PINK_BRIGHT）
    this.bondLine.moveTo(x1, y1);
    this.bondLine.quadraticCurveTo(cpX, cpY, x2, y2);
    this.bondLine.stroke({ color: BOND_PINK_BRIGHT, width: 1, alpha: alpha * 1.6 });
  }

  private clearBondLine(): void {
    if (this.bondLine) {
      this.bondLine.clear();
      this.bondLine.visible = false;
    }
  }

  /** 重置（对局结束时调用） */
  reset(): void {
    this.clearBondLine();
    this.clearFlash();
    this.clearMosaic();
  }

  // ── 工具方法 ──────────────────────────────────

  private hslToHex(h: number, s: number, l: number): number {
    const sNorm = s / 100;
    const lNorm = l / 100;
    const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = lNorm - c / 2;

    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }

    const ri = Math.round((r + m) * 255);
    const gi = Math.round((g + m) * 255);
    const bi = Math.round((b + m) * 255);

    return (ri << 16) | (gi << 8) | bi;
  }

  /** easeOutCubic 缓动 */
  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  /** 设置牵引线可见性（用于对局结束后隐藏） */
  setBondLineVisible(visible: boolean): void {
    if (this.bondLine) {
      this.bondLine.visible = visible;
    }
  }
}
