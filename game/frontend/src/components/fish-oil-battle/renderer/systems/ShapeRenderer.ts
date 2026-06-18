import * as PIXI from 'pixi.js';

// ═══════════════════════════════════════════════════════════════
//  类型定义
// ═══════════════════════════════════════════════════════════════

export type ShapeType =
  | 'circle'
  | 'rect'
  | 'roundedRect'
  | 'polygon'
  | 'star'
  | 'line'
  | 'svgPath';

export interface ShapeDescriptor {
  type: ShapeType;

  // 样式
  fillColor?: number;
  fillAlpha?: number;
  strokeColor?: number;
  strokeWidth?: number;
  strokeAlpha?: number;
  /** Pixi v8 混合模式数值 */
  blendMode?: number;

  // ── 各形状参数 ──

  // circle
  radius?: number;

  // rect / roundedRect
  width?: number;
  height?: number;
  cornerRadius?: number;

  // polygon
  /** 格式: [x1, y1, x2, y2, ...] 或 [[x1,y1], ...] */
  points?: number[] | [number, number][];

  // star
  innerRadius?: number;
  spikes?: number;

  // line
  x1?: number; y1?: number;
  x2?: number; y2?: number;

  // svgPath
  /** SVG path 字符串，如 "M0,-50 L43,25 L-43,25 Z" */
  svgPath?: string;
}

/** SVG 命令 */
interface SvgCommand {
  cmd: string;
  args: number[];
}

/** 编译后的绘制段 */
interface SvgSegment {
  kind: 'moveTo' | 'lineTo' | 'bezierTo' | 'close';
  args: number[];
}

/** 形状包围盒（用于粒子发射） */
export interface ShapeBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  centerX: number;
  centerY: number;
}

// ═══════════════════════════════════════════════════════════════
//  SVG 路径解析器
// ═══════════════════════════════════════════════════════════════

function parseSvgPath(d: string): SvgCommand[] {
  const commands: SvgCommand[] = [];
  const tokenRe = /([MmLlHhVvCcSsQqTtAaZz])\s*([-\d.,eE\s]+)?/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(d)) !== null) {
    const cmd = match[1];
    const argsStr = match[2] ?? '';
    const args = argsStr
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    commands.push({ cmd, args });
  }
  return commands;
}

function compileSvgPath(svgPath: string): SvgSegment[] {
  const cmds = parseSvgPath(svgPath);
  const segments: SvgSegment[] = [];
  let cx = 0, cy = 0;
  let sx = 0, sy = 0;
  let lastCpX = 0, lastCpY = 0;

  for (const { cmd, args } of cmds) {
    const isRel = cmd === cmd.toLowerCase();
    const upper = cmd.toUpperCase();

    const rx = (v: number) => isRel ? cx + v : v;
    const ry = (v: number) => isRel ? cy + v : v;

    switch (upper) {
      case 'M': {
        const nx = rx(args[0]), ny = ry(args[1]);
        segments.push({ kind: 'moveTo', args: [nx, ny] });
        cx = nx; cy = ny;
        sx = nx; sy = ny;
        for (let i = 2; i < args.length; i += 2) {
          const lx = rx(args[i]), ly = ry(args[i + 1]);
          segments.push({ kind: 'lineTo', args: [lx, ly] });
          cx = lx; cy = ly;
        }
        break;
      }
      case 'L': {
        for (let i = 0; i < args.length; i += 2) {
          const nx = rx(args[i]), ny = ry(args[i + 1]);
          segments.push({ kind: 'lineTo', args: [nx, ny] });
          cx = nx; cy = ny;
        }
        break;
      }
      case 'H': {
        for (const v of args) {
          const nx = rx(v);
          segments.push({ kind: 'lineTo', args: [nx, cy] });
          cx = nx;
        }
        break;
      }
      case 'V': {
        for (const v of args) {
          const ny = ry(v);
          segments.push({ kind: 'lineTo', args: [cx, ny] });
          cy = ny;
        }
        break;
      }
      case 'C': {
        for (let i = 0; i < args.length; i += 6) {
          const cp1x = rx(args[i]), cp1y = ry(args[i + 1]);
          const cp2x = rx(args[i + 2]), cp2y = ry(args[i + 3]);
          const nx = rx(args[i + 4]), ny = ry(args[i + 5]);
          segments.push({ kind: 'bezierTo', args: [cp1x, cp1y, cp2x, cp2y, nx, ny] });
          lastCpX = cp2x; lastCpY = cp2y;
          cx = nx; cy = ny;
        }
        break;
      }
      case 'S': {
        for (let i = 0; i < args.length; i += 4) {
          const mirrorCpX = 2 * cx - lastCpX;
          const mirrorCpY = 2 * cy - lastCpY;
          const cp2x = rx(args[i]), cp2y = ry(args[i + 1]);
          const nx = rx(args[i + 2]), ny = ry(args[i + 3]);
          segments.push({ kind: 'bezierTo', args: [mirrorCpX, mirrorCpY, cp2x, cp2y, nx, ny] });
          lastCpX = cp2x; lastCpY = cp2y;
          cx = nx; cy = ny;
        }
        break;
      }
      case 'Q': {
        for (let i = 0; i < args.length; i += 4) {
          const cpx = rx(args[i]), cpy = ry(args[i + 1]);
          const nx = rx(args[i + 2]), ny = ry(args[i + 3]);
          const cp1x = cx + (cpx - cx) * 2 / 3;
          const cp1y = cy + (cpy - cy) * 2 / 3;
          const cp2x = nx + (cpx - nx) * 2 / 3;
          const cp2y = ny + (cpy - ny) * 2 / 3;
          segments.push({ kind: 'bezierTo', args: [cp1x, cp1y, cp2x, cp2y, nx, ny] });
          cx = nx; cy = ny;
        }
        break;
      }
      case 'Z': {
        segments.push({ kind: 'close', args: [] });
        cx = sx; cy = sy;
        break;
      }
      case 'A': {
        // 简化：忽略椭圆参数，直接连到终点
        for (let i = 0; i < args.length; i += 7) {
          const nx = rx(args[5]), ny = ry(args[6]);
          segments.push({ kind: 'lineTo', args: [nx, ny] });
          cx = nx; cy = ny;
        }
        break;
      }
    }
  }
  return segments;
}

/**
 * 从 SVG path 线段计算包围盒
 */
function svgPathBounds(segments: SvgSegment[]): ShapeBounds {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (const seg of segments) {
    switch (seg.kind) {
      case 'moveTo':
      case 'lineTo': {
        const x = seg.args[0], y = seg.args[1];
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y;
        break;
      }
      case 'bezierTo': {
        // 贝塞尔控制点 + 终点
        for (let i = 0; i < 6; i += 2) {
          const x = seg.args[i], y = seg.args[i + 1];
          if (x < minX) minX = x; if (y < minY) minY = y;
          if (x > maxX) maxX = x; if (y > maxY) maxY = y;
        }
        break;
      }
    }
  }

  if (!isFinite(minX)) {
    return { minX: -10, minY: -10, maxX: 10, maxY: 10, centerX: 0, centerY: 0 };
  }
  return {
    minX, minY, maxX, maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

// ═══════════════════════════════════════════════════════════════
//  ShapeRenderer 主类
// ═══════════════════════════════════════════════════════════════

export class ShapeRenderer {
  /**
   * 主入口：在 g 上绘制形状（调用前需 g.clear()）
   */
  static drawShape(g: PIXI.Graphics, desc: ShapeDescriptor): void {
    switch (desc.type) {
      case 'circle':      this.drawCircle(g, desc); break;
      case 'rect':        this.drawRect(g, desc); break;
      case 'roundedRect': this.drawRoundedRect(g, desc); break;
      case 'polygon':     this.drawPolygon(g, desc); break;
      case 'star':        this.drawStar(g, desc); break;
      case 'line':        this.drawLine(g, desc); break;
      case 'svgPath':     this.drawSvgPath(g, desc); break;
    }

    if (desc.fillColor !== undefined) {
      g.fill({ color: desc.fillColor, alpha: desc.fillAlpha ?? 1 });
    }
    if (desc.strokeColor !== undefined) {
      g.stroke({
        color: desc.strokeColor,
        width: desc.strokeWidth ?? 1,
        alpha: desc.strokeAlpha ?? 1,
      });
    }
  }

  /**
   * 获取形状包围盒（用于粒子发射区域计算）
   */
  static getBounds(desc: ShapeDescriptor): ShapeBounds {
    switch (desc.type) {
      case 'circle': {
        const r = desc.radius ?? 10;
        return { minX: -r, minY: -r, maxX: r, maxY: r, centerX: 0, centerY: 0 };
      }
      case 'rect':
      case 'roundedRect': {
        const hw = (desc.width ?? 10) / 2;
        const hh = (desc.height ?? 10) / 2;
        return { minX: -hw, minY: -hh, maxX: hw, maxY: hh, centerX: 0, centerY: 0 };
      }
      case 'polygon': {
        const pts = this.normalizePoints(desc.points);
        if (!pts || pts.length === 0) {
          return { minX: -10, minY: -10, maxX: 10, maxY: 10, centerX: 0, centerY: 0 };
        }
        let minX = pts[0][0], minY = pts[0][1], maxX = pts[0][0], maxY = pts[0][1];
        for (const [x, y] of pts) {
          if (x < minX) minX = x; if (y < minY) minY = y;
          if (x > maxX) maxX = x; if (y > maxY) maxY = y;
        }
        return { minX, minY, maxX, maxY, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 };
      }
      case 'star': {
        const r = desc.radius ?? 20;
        return { minX: -r, minY: -r, maxX: r, maxY: r, centerX: 0, centerY: 0 };
      }
      case 'line': {
        const x1 = desc.x1 ?? 0, y1 = desc.y1 ?? 0;
        const x2 = desc.x2 ?? 0, y2 = desc.y2 ?? 0;
        const minX = Math.min(x1, x2), minY = Math.min(y1, y2);
        const maxX = Math.max(x1, x2), maxY = Math.max(y1, y2);
        return { minX, minY, maxX, maxY, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 };
      }
      case 'svgPath': {
        if (!desc.svgPath) {
          return { minX: -10, minY: -10, maxX: 10, maxY: 10, centerX: 0, centerY: 0 };
        }
        return svgPathBounds(compileSvgPath(desc.svgPath));
      }
    }
  }

  // ── 各形状绘制实现 ─────────────────────────────────

  private static drawCircle(g: PIXI.Graphics, d: ShapeDescriptor): void {
    g.circle(0, 0, d.radius ?? 10);
  }

  private static drawRect(g: PIXI.Graphics, d: ShapeDescriptor): void {
    const w = d.width ?? 10;
    const h = d.height ?? 10;
    g.rect(-w / 2, -h / 2, w, h);
  }

  private static drawRoundedRect(g: PIXI.Graphics, d: ShapeDescriptor): void {
    const w = d.width ?? 10;
    const h = d.height ?? 10;
    g.roundRect(-w / 2, -h / 2, w, h, d.cornerRadius ?? 4);
  }

  private static normalizePoints(raw?: number[] | [number, number][]): [number, number][] | null {
    if (!raw || raw.length === 0) return null;
    if (Array.isArray(raw[0])) {
      return raw as [number, number][];
    }
    const flat = raw as number[];
    const pts: [number, number][] = [];
    for (let i = 0; i < flat.length; i += 2) {
      pts.push([flat[i], flat[i + 1]]);
    }
    return pts;
  }

  private static drawPolygon(g: PIXI.Graphics, d: ShapeDescriptor): void {
    const pts = this.normalizePoints(d.points);
    if (!pts || pts.length < 3) return;
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      g.lineTo(pts[i][0], pts[i][1]);
    }
    g.closePath();
  }

  private static drawStar(g: PIXI.Graphics, d: ShapeDescriptor): void {
    const outer = d.radius ?? 20;
    const inner = d.innerRadius ?? outer * 0.5;
    const spikes = d.spikes ?? 5;
    const pts: [number, number][] = [];
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (i * Math.PI) / spikes - Math.PI / 2;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      g.lineTo(pts[i][0], pts[i][1]);
    }
    g.closePath();
  }

  private static drawLine(g: PIXI.Graphics, d: ShapeDescriptor): void {
    g.moveTo(d.x1 ?? 0, d.y1 ?? 0);
    g.lineTo(d.x2 ?? 0, d.y2 ?? 0);
  }

  private static drawSvgPath(g: PIXI.Graphics, d: ShapeDescriptor): void {
    if (!d.svgPath) return;
    const segments = compileSvgPath(d.svgPath);
    for (const seg of segments) {
      switch (seg.kind) {
        case 'moveTo':
          g.moveTo(seg.args[0], seg.args[1]);
          break;
        case 'lineTo':
          g.lineTo(seg.args[0], seg.args[1]);
          break;
        case 'bezierTo':
          g.bezierCurveTo(
            seg.args[0], seg.args[1],
            seg.args[2], seg.args[3],
            seg.args[4], seg.args[5],
          );
          break;
        case 'close':
          g.closePath();
          break;
      }
    }
  }

  // ── 静态形状生成工具 ───────────────────────────────

  /** 正 N 边形顶点（中心在 0,0） */
  static regularPolygon(sides: number, radius: number): [number, number][] {
    const pts: [number, number][] = [];
    for (let i = 0; i < sides; i++) {
      const a = (i * 2 * Math.PI) / sides - Math.PI / 2;
      pts.push([Math.cos(a) * radius, Math.sin(a) * radius]);
    }
    return pts;
  }

  /** 星形顶点（中心在 0,0） */
  static starPoints(spikes: number, outerRadius: number, innerRadius: number): [number, number][] {
    const pts: [number, number][] = [];
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? outerRadius : innerRadius;
      const a = (i * Math.PI) / spikes - Math.PI / 2;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return pts;
  }
}
