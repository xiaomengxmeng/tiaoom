/**
 * 赛博鱼油 · 全局彩蛋特效渲染器
 *
 * 负责 3 个彩蛋的前端视觉表现：
 * 1. 古今观察者 - 全屏闪白
 * 2. 俺寻思之力 - 全屏马赛克闪动
 * 3. 万物亲和 - 淡粉色牵引线（只在第一名和最后一名之间）
 *
 * 渲染层级：
 * - L5 全息舞台层：闪白、马赛克闪动
 * - L2 实体投射层：牵引线
 */

import * as PIXI from 'pixi.js';
import type { VisualEventData } from '$/backend/src/games/fish-oil-battle/shared/protocol';
import { GlobalEffectType, VisualEventType } from '$/backend/src/games/fish-oil-battle/config/GameEnums';

export class GlobalEffectRenderer {
  private l2Container: PIXI.Container;
  private l5Container: PIXI.Container;
  private canvasW: number;
  private canvasH: number;

  // ── 牵引线缓存（万无亲和） ────────────
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

  /** 每帧更新（在 render loop 中调用） */
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
  //  古今观察者：全屏闪白
  // ═══════════════════════════════════════════════════

  private playFlashWhite(durationMs: number): void {
    // 创建全屏白色叠加层（如果还没创建）
    if (!this.flashOverlay) {
      this.flashOverlay = new PIXI.Graphics();
      this.flashOverlay.beginFill(0xFFFFFF);
      this.flashOverlay.drawRect(0, 0, this.canvasW, this.canvasH);
      this.flashOverlay.endFill();
      this.l5Container.addChild(this.flashOverlay);
    }

    this.flashOverlay.visible = true;
    this.flashOverlay.alpha = 1.0;
    this.flashTimer = 0;
    this.flashDuration = durationMs;
  }

  private updateFlash(dt: number): void {
    if (!this.flashOverlay || !this.flashOverlay.visible) return;

    this.flashTimer += dt;
    const progress = this.flashTimer / this.flashDuration;

    if (progress >= 1) {
      this.clearFlash();
    } else {
      // 快速衰减：0→1 进度中，alpha 从 1→0
      this.flashOverlay.alpha = 1 - progress;
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
  //  俺寻思之力：全屏马赛克闪动
  // ═══════════════════════════════════════════════════

  private playMosaicFlash(durationMs: number): void {
    // 生成马赛克块
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

  /** 生成随机彩色马赛克块 */
  private generateMosaic(): void {
    if (!this.mosaicOverlay) return;

    const blockW = GlobalEffectRenderer.MOSAIC_BLOCK;
    const blockH = GlobalEffectRenderer.MOSAIC_BLOCK;
    const cols = Math.ceil(this.canvasW / blockW);
    const rows = Math.ceil(this.canvasH / blockH);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // 随机跳过一些块（稀疏化）
        if (Math.random() > 0.5) continue;

        const hue = Math.random() * 360;
        const color = this.hslToHex(hue, 80, 50 + Math.random() * 30);

        this.mosaicOverlay!.beginFill(color, 0.3 + Math.random() * 0.4);
        this.mosaicOverlay!.drawRect(c * blockW, r * blockH, blockW, blockH);
        this.mosaicOverlay!.endFill();
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
      this.mosaicOverlay.alpha = 0.5 * (1 - progress);
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
  //  万物亲和：淡粉色牵引线
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

    this.bondLine.clear();
    this.bondLine.lineStyle(2, 0xFFB6C1, alpha); // 淡粉色 (#FFB6C1)
    this.bondLine.moveTo(x1, y1);
    this.bondLine.lineTo(x2, y2);

    // 加一层发光效果
    this.bondLine.lineStyle(4, 0xFFB6C1, alpha * 0.3);
    this.bondLine.moveTo(x1, y1);
    this.bondLine.lineTo(x2, y2);
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

  /** 设置牵引线可见性（用于对局结束后隐藏） */
  setBondLineVisible(visible: boolean): void {
    if (this.bondLine) {
      this.bondLine.visible = visible;
    }
  }
}
