/**
 * 竞技场背景渲染器 — daisyUI 风格
 *
 * daisyUI 设计语言：
 * - 暖白底色（base-100），柔和宁静
 * - 极淡网格（类似 daisyUI 的 subtle divider）
 * - 圆形竞技场边界 — 柔和虚线圆标定，无深色/黑色边框
 * - 与后端 PhysicsEngine 圆形碰撞边界精确对齐
 *
 * 坐标对齐：
 * - 后端逻辑坐标系：1280×720，arenaRadius=280（圆心 640,360）
 * - 通过等比缩放确保视觉圆 = 物理碰撞圆
 */

import * as PIXI from 'pixi.js';
import { LOGICAL_W, LOGICAL_H, ARENA_RADIUS_LOGICAL } from '../constants';

// ── daisyUI 色彩体系 ────────────────────────────────
const DAISY = {
  base100: 0xFAFBFC,   // 暖白底色（≈ oklch(0.98 0 0)）
  base200: 0xF2F3F5,   // 次级表面
  base300: 0xE5E7EB,   // 边框/分隔线
  neutral: 0x9CA3AF,   // 中性灰（次级文字）
  neutralLight: 0xD1D5DB, // 浅中性灰（虚线/淡边界）
  primary: 0x6366F1,   // daisyUI primary（靛蓝）
  primarySoft: 0xA5B4FC, // primary 浅色版
  accent: 0xF472B6,    // daisyUI secondary（柔粉）
  accentSoft: 0xFBCFE8, // accent 浅色版
} as const;

export class ArenaRenderer {
  private container: PIXI.Container;
  private bg!: PIXI.Graphics;
  private arenaCircle!: PIXI.Graphics;

  /** 当前画布尺寸 */
  private w = 1280;
  private h = 720;

  constructor(parentContainer: PIXI.Container) {
    this.container = new PIXI.Container();
    this.container.zIndex = -50;
    parentContainer.addChild(this.container);
    this.build();
  }

  resize(w: number, h: number): void {
    if (this.w === w && this.h === h) return;
    this.w = w;
    this.h = h;
    this.rebuild();
  }

  getBounds(): { cx: number; cy: number; radius: number } {
    const cx = this.w / 2;
    const cy = this.h / 2;
    const uniformScale = Math.min(this.w / LOGICAL_W, this.h / LOGICAL_H);
    const radius = ARENA_RADIUS_LOGICAL * uniformScale;
    return { cx, cy, radius };
  }

  // ── 构建 ──────────────────────────────────────────

  private build(): void {
    this.bg = new PIXI.Graphics();
    this.arenaCircle = new PIXI.Graphics();
    this.container.addChild(this.bg);
    this.container.addChild(this.arenaCircle);
    this.resize(this.w, this.h);
  }

  private rebuild(): void {
    this.drawBackground();
    this.drawArenaBoundary();
  }

  // ═══════════════════════════════════════════════════
  //  背景层 — daisyUI 暖白极简
  // ═══════════════════════════════════════════════════

  private drawBackground(): void {
    const g = this.bg;
    g.clear();

    // 1. 暖白底色（daisyUI base-100）
    g.rect(0, 0, this.w, this.h);
    g.fill({ color: DAISY.base100 });

    // 2. 极淡网格（daisyUI divider 风格，微弱可见）
    const gridSize = 64;
    for (let x = gridSize; x < this.w; x += gridSize) {
      g.moveTo(x, 0);
      g.lineTo(x, this.h);
      g.stroke({ color: DAISY.base200, width: 0.5, alpha: 0.7 });
    }
    for (let y = gridSize; y < this.h; y += gridSize) {
      g.moveTo(0, y);
      g.lineTo(this.w, y);
      g.stroke({ color: DAISY.base200, width: 0.5, alpha: 0.7 });
    }
  }

  // ═══════════════════════════════════════════════════
  //  竞技场边界 — daisyUI 柔和虚线圆（无黑色边框）
  // ═══════════════════════════════════════════════════

  private drawArenaBoundary(): void {
    const g = this.arenaCircle;
    g.clear();

    const cx = this.w / 2;
    const cy = this.h / 2;
    const uniformScale = Math.min(this.w / LOGICAL_W, this.h / LOGICAL_H);
    const r = ARENA_RADIUS_LOGICAL * uniformScale;

    // ── 1. 内场柔和填充（daisyUI base-200 微色差，标识区域）──
    g.circle(cx, cy, r);
    g.fill({ color: DAISY.base100, alpha: 0.5 });

    // ── 2. 极淡填充圆（base-200 比背景稍深，形成微妙区域感）──
    g.circle(cx, cy, r - 2);
    g.fill({ color: DAISY.base200, alpha: 0.25 });

    // ── 3. 虚线主边界（中灰色虚线，daisyUI 风格柔和分隔）──
    const dashCount = 72;
    const dashAngle = (Math.PI * 2) / dashCount;
    const dashArc = dashAngle * 0.5; // 50% 占空比
    for (let i = 0; i < dashCount; i++) {
      const a0 = i * dashAngle - Math.PI / 2;
      const a1 = a0 + dashArc;
      g.arc(cx, cy, r, a0, a1);
      g.stroke({ color: DAISY.neutralLight, width: 1.5, alpha: 0.7 });
    }

    // ── 4. 内侧实线（极淡，仅比虚线稍深一点）──
    g.circle(cx, cy, r);
    g.stroke({ color: DAISY.base300, width: 0.8, alpha: 0.35 });

    // ── 5. 外侧间距环（更淡，增加空间层次）──
    g.circle(cx, cy, r + 6);
    g.stroke({ color: DAISY.base300, width: 0.5, alpha: 0.2 });
  }

  // ═══════════════════════════════════════════════════

  destroy(): void {
    this.bg.destroy({ children: true });
    this.arenaCircle.destroy({ children: true });
    this.container.destroy({ children: true });
  }
}
