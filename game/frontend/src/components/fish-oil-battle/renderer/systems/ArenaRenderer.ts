/**
 * 竞技场背景渲染器
 *
 * 坐标对齐：
 * - 后端逻辑坐标系：1280×720，arenaRadius=280（圆心 640,360）
 * - 通过等比缩放确保视觉圆 = 物理碰撞圆
 *
 * 墙壁风格：
 * - DAISY：柔和虚线边界
 * - NEON：霓虹发光实线边界（默认）
 */

import * as PIXI from 'pixi.js';
import {
  getLogicalW, getLogicalH,
  getArenaRadiusLogical, getArenaShape, getArenaHalfW, getArenaHalfH,
} from '../constants';
import { ArenaShape } from '$/backend/src/games/fish-oil-battle/config/GameEnums';

/** 墙壁风格 */
export const WallStyle = {
  DAISY: 'daisy',
  NEON: 'neon',
} as const;
export type WallStyle = (typeof WallStyle)[keyof typeof WallStyle];

// ── daisyUI 色彩体系 ────────────────────────────────
const DAISY = {
  base100: 0xFAFBFC,   // 暖白底色（≈ oklch(0.98 0 0)）
  base200: 0xF2F3F5,   // 次级表面
  base300: 0xE5E7EB,   // 边框/分隔线
  neutral: 0x9CA3AF,   // 中性灰（次级文字）
  neutralLight: 0xD1D5DB, // 浅中性灰（虚线/淡边界）
} as const;

// ── 霓虹色系 ────────────────────────────────────────
const NEON = {
  cyan: 0x00FFFF,      // 主色青
  cyanDim: 0x00B8B8,   // 暗青（发光外层）
  magenta: 0xFF00FF,   // 副色品红
  glowAlpha: 0.15,     // 发光层透明度
  coreWidth: 2,        // 主线宽
  glowWidth: 6,        // 发光宽度
  // 随机霓虹色板
  palette: [
    0x00FFFF, // 青
    0xFF00FF, // 品红
    0x00FF88, // 青绿
    0xFF6600, // 橙
    0xFFDD00, // 黄
    0x00AAFF, // 蓝
    0xFF4488, // 玫红
    0x88FF00, // 亮绿
    0xCC44FF, // 紫
    0xFF2266, // 红粉
  ],
} as const;

export class ArenaRenderer {
  private container: PIXI.Container;
  private bg!: PIXI.Graphics;
  private arenaCircle!: PIXI.Graphics;

  /** 当前墙壁风格（默认霓虹） */
  private wallStyle: WallStyle = WallStyle.NEON;
  /** 当前霓虹主色（每次 rebuild 随机） */
  private neonColor: number = NEON.cyan;

  /** 当前画布尺寸 */
  private w = 1280;
  private h = 720;

  constructor(parentContainer: PIXI.Container) {
    this.container = new PIXI.Container();
    this.container.zIndex = -50;
    parentContainer.addChild(this.container);
    this.build();
  }

  resize(w: number, h: number, force = false): void {
    if (!force && this.w === w && this.h === h) return;
    this.w = w;
    this.h = h;
    this.rebuild();
  }

  /** 强制重建背景/墙壁（用于形状切换等不改尺寸的场景） */
  forceRedraw(): void {
    this.rebuild();
  }

  /** 设置墙壁风格 */
  setWallStyle(style: WallStyle): void {
    if (this.wallStyle === style) return;
    this.wallStyle = style;
    this.rebuild();
  }

  getBounds(): { cx: number; cy: number; radius: number; shape: ArenaShape; halfW?: number; halfH?: number } {
    const cx = this.w / 2;
    const cy = this.h / 2;
    const uniformScale = Math.min(this.w / getLogicalW(), this.h / getLogicalH());
    const shape = getArenaShape();
    const result: any = { cx, cy, radius: getArenaRadiusLogical() * uniformScale, shape };
    if (shape === ArenaShape.RECT) {
      result.halfW = getArenaHalfW() * uniformScale;
      result.halfH = getArenaHalfH() * uniformScale;
    }
    return result;
  }

  // ── 构建 ──────────────────────────────────────────

  private build(): void {
    this.bg = new PIXI.Graphics();
    this.arenaCircle = new PIXI.Graphics();
    this.container.addChild(this.bg);
    this.container.addChild(this.arenaCircle);
    this.rebuild();
  }

  private rebuild(): void {
    // 每次重建随机选取霓虹主色
    this.neonColor = NEON.palette[Math.floor(Math.random() * NEON.palette.length)];
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
  //  竞技场边界 — 支持圆形 / 矩形 / 六边形 + 双风格
  // ═══════════════════════════════════════════════════

  private drawArenaBoundary(): void {
    const g = this.arenaCircle;
    g.clear();

    const cx = this.w / 2;
    const cy = this.h / 2;
    const s = Math.min(this.w / getLogicalW(), this.h / getLogicalH());
    const shape = getArenaShape();
    const isNeon = this.wallStyle === WallStyle.NEON;

    if (shape === ArenaShape.RECT) {
      if (isNeon) this.drawNeonRect(g, cx, cy, s);
      else this.drawDaisyRect(g, cx, cy, s);
    } else if (shape === ArenaShape.HEXAGON) {
      if (isNeon) this.drawNeonHex(g, cx, cy, s);
      else this.drawDaisyHex(g, cx, cy, s);
    } else {
      if (isNeon) this.drawNeonCircle(g, cx, cy, s);
      else this.drawDaisyCircle(g, cx, cy, s);
    }
  }

  // ── Daisy 圆形边界 ────────────────────────────────

  private drawDaisyCircle(g: PIXI.Graphics, cx: number, cy: number, s: number): void {
    const r = getArenaRadiusLogical() * s;

    // 内场柔和填充
    g.circle(cx, cy, r);
    g.fill({ color: DAISY.base100, alpha: 0.5 });
    g.circle(cx, cy, r - 2);
    g.fill({ color: DAISY.base200, alpha: 0.25 });

    // 虚线主边界
    const dashCount = 72;
    const dashAngle = (Math.PI * 2) / dashCount;
    const dashArc = dashAngle * 0.5;
    for (let i = 0; i < dashCount; i++) {
      const a0 = i * dashAngle - Math.PI / 2;
      const a1 = a0 + dashArc;
      // 跳到弧段起点，避免连线
      g.moveTo(cx + r * Math.cos(a0), cy + r * Math.sin(a0));
      g.arc(cx, cy, r, a0, a1);
      g.stroke({ color: DAISY.neutralLight, width: 1.5, alpha: 0.7 });
    }

    // 内侧实线
    g.circle(cx, cy, r);
    g.stroke({ color: DAISY.base300, width: 0.8, alpha: 0.35 });

    // 外侧间距环
    g.circle(cx, cy, r + 6);
    g.stroke({ color: DAISY.base300, width: 0.5, alpha: 0.2 });
  }

  // ── Neon 圆形边界 ─────────────────────────────────

  private drawNeonCircle(g: PIXI.Graphics, cx: number, cy: number, s: number): void {
    const r = getArenaRadiusLogical() * s;
    const c = this.neonColor;

    // 外层发光（多层叠加）
    g.circle(cx, cy, r);
    g.stroke({ color: c, width: NEON.glowWidth, alpha: NEON.glowAlpha * 0.5 });
    g.circle(cx, cy, r);
    g.stroke({ color: c, width: NEON.glowWidth * 0.6, alpha: NEON.glowAlpha });
    g.circle(cx, cy, r);
    g.stroke({ color: c, width: NEON.glowWidth * 0.35, alpha: NEON.glowAlpha * 1.2 });

    // 实线主边界
    g.circle(cx, cy, r);
    g.stroke({ color: c, width: NEON.coreWidth, alpha: 0.9 });

    // 内场半透明填充
    g.circle(cx, cy, r - NEON.coreWidth);
    g.fill({ color: c, alpha: 0.03 });
  }

  // ── Daisy 矩形边界 ────────────────────────────────

  private drawDaisyRect(g: PIXI.Graphics, cx: number, cy: number, s: number): void {
    const hw = getArenaHalfW() * s;
    const hh = getArenaHalfH() * s;
    const x0 = cx - hw;
    const y0 = cy - hh;

    // 内场柔和填充
    g.rect(x0, y0, hw * 2, hh * 2);
    g.fill({ color: DAISY.base100, alpha: 0.5 });
    g.rect(x0 + 2, y0 + 2, hw * 2 - 4, hh * 2 - 4);
    g.fill({ color: DAISY.base200, alpha: 0.25 });

    // 虚线主边界
    this.drawDashedRect(g, x0, y0, hw * 2, hh * 2, 12, 8, DAISY.neutralLight, 1.5, 0.7);

    // 内侧实线
    g.rect(x0, y0, hw * 2, hh * 2);
    g.stroke({ color: DAISY.base300, width: 0.8, alpha: 0.35 });

    // 外侧间距环
    g.rect(x0 - 6, y0 - 6, hw * 2 + 12, hh * 2 + 12);
    g.stroke({ color: DAISY.base300, width: 0.5, alpha: 0.2 });
  }

  // ── Neon 矩形边界 ─────────────────────────────────

  private drawNeonRect(g: PIXI.Graphics, cx: number, cy: number, s: number): void {
    const hw = getArenaHalfW() * s;
    const hh = getArenaHalfH() * s;
    const x0 = cx - hw;
    const y0 = cy - hh;
    const c = this.neonColor;

    // 外层发光（多层叠加）
    g.rect(x0, y0, hw * 2, hh * 2);
    g.stroke({ color: c, width: NEON.glowWidth, alpha: NEON.glowAlpha * 0.5 });
    g.rect(x0, y0, hw * 2, hh * 2);
    g.stroke({ color: c, width: NEON.glowWidth * 0.6, alpha: NEON.glowAlpha });
    g.rect(x0, y0, hw * 2, hh * 2);
    g.stroke({ color: c, width: NEON.glowWidth * 0.35, alpha: NEON.glowAlpha * 1.2 });

    // 实线主边界
    g.rect(x0, y0, hw * 2, hh * 2);
    g.stroke({ color: c, width: NEON.coreWidth, alpha: 0.9 });

    // 内场半透明填充
    g.rect(x0 + NEON.coreWidth, y0 + NEON.coreWidth, hw * 2 - NEON.coreWidth * 2, hh * 2 - NEON.coreWidth * 2);
    g.fill({ color: c, alpha: 0.03 });
  }

  // ── Daisy 六边形边界 ──────────────────────────────

  private drawDaisyHex(g: PIXI.Graphics, cx: number, cy: number, s: number): void {
    const r = getArenaRadiusLogical() * s;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = -Math.PI / 2 + (Math.PI / 3) * i;
      pts.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    }

    // 内场柔和填充
    const flat = pts.flatMap(p => [p.x, p.y]);
    g.poly(flat);
    g.fill({ color: DAISY.base100, alpha: 0.5 });
    const innerScale = (r - 2) / r;
    const innerPts = pts.map(p => ({
      x: cx + (p.x - cx) * innerScale,
      y: cy + (p.y - cy) * innerScale,
    }));
    g.poly(innerPts.flatMap(p => [p.x, p.y]));
    g.fill({ color: DAISY.base200, alpha: 0.25 });

    // 虚线主边界
    this.drawDashedHex(g, pts, 12, 8, DAISY.neutralLight, 1.5, 0.7);

    // 内侧实线
    g.poly(flat);
    g.stroke({ color: DAISY.base300, width: 0.8, alpha: 0.35 });

    // 外侧间距环（正六边形缩放）
    const outerScale = (r + 8) / r;
    const outerPts = pts.map(p => ({
      x: cx + (p.x - cx) * outerScale,
      y: cy + (p.y - cy) * outerScale,
    }));
    g.poly(outerPts.flatMap(p => [p.x, p.y]));
    g.stroke({ color: DAISY.base300, width: 0.5, alpha: 0.2 });
  }

  // ── Neon 六边形边界 ───────────────────────────────

  private drawNeonHex(g: PIXI.Graphics, cx: number, cy: number, s: number): void {
    const r = getArenaRadiusLogical() * s;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = -Math.PI / 2 + (Math.PI / 3) * i;
      pts.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    }
    const flat = pts.flatMap(p => [p.x, p.y]);
    const c = this.neonColor;

    // 外层发光（多层叠加）
    this.drawPolyStroke(g, flat, c, NEON.glowWidth, NEON.glowAlpha * 0.5);
    this.drawPolyStroke(g, flat, c, NEON.glowWidth * 0.6, NEON.glowAlpha);
    this.drawPolyStroke(g, flat, c, NEON.glowWidth * 0.35, NEON.glowAlpha * 1.2);

    // 实线主边界
    this.drawPolyStroke(g, flat, c, NEON.coreWidth, 0.9);

    // 内场半透明填充
    const innerScale = (r - NEON.coreWidth) / r;
    const innerPts = pts.map(p => ({
      x: cx + (p.x - cx) * innerScale,
      y: cy + (p.y - cy) * innerScale,
    }));
    g.poly(innerPts.flatMap(p => [p.x, p.y]));
    g.fill({ color: c, alpha: 0.03 });
  }

  // ── 辅助：多边形描边（闭合） ──────────────────────

  private drawPolyStroke(g: PIXI.Graphics, flat: number[], color: number, width: number, alpha: number): void {
    g.poly(flat);
    g.stroke({ color, width, alpha });
  }

  // ── 辅助：虚线矩形 ────────────────────────────────

  private drawDashedRect(
    g: PIXI.Graphics,
    x: number, y: number, w: number, h: number,
    dashLen: number, gapLen: number,
    color: number, width: number, alpha: number,
  ): void {
    this.drawDashedLine(g, x, y, x + w, y, dashLen, gapLen, color, width, alpha);
    this.drawDashedLine(g, x + w, y, x + w, y + h, dashLen, gapLen, color, width, alpha);
    this.drawDashedLine(g, x + w, y + h, x, y + h, dashLen, gapLen, color, width, alpha);
    this.drawDashedLine(g, x, y + h, x, y, dashLen, gapLen, color, width, alpha);
  }

  // ── 辅助：虚线六边形 ──────────────────────────────

  private drawDashedHex(
    g: PIXI.Graphics,
    pts: { x: number; y: number }[],
    dashLen: number, gapLen: number,
    color: number, width: number, alpha: number,
  ): void {
    for (let i = 0; i < 6; i++) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % 6];
      this.drawDashedLine(g, p0.x, p0.y, p1.x, p1.y, dashLen, gapLen, color, width, alpha);
    }
  }

  // ── 辅助：虚线线段 ────────────────────────────────

  private drawDashedLine(
    g: PIXI.Graphics,
    x0: number, y0: number, x1: number, y1: number,
    dashLen: number, gapLen: number,
    color: number, width: number, alpha: number,
  ): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const totalLen = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / totalLen;
    const ny = dy / totalLen;

    let pos = 0;
    let drawing = true;
    while (pos < totalLen) {
      const segLen = Math.min(drawing ? dashLen : gapLen, totalLen - pos);
      if (drawing) {
        g.moveTo(x0 + nx * pos, y0 + ny * pos);
        g.lineTo(x0 + nx * (pos + segLen), y0 + ny * (pos + segLen));
        g.stroke({ color, width, alpha });
      }
      pos += segLen;
      drawing = !drawing;
    }
  }

  // ═══════════════════════════════════════════════════

  destroy(): void {
    this.bg.destroy({ children: true });
    this.arenaCircle.destroy({ children: true });
    this.container.destroy({ children: true });
  }
}
