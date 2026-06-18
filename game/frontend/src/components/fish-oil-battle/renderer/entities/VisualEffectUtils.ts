import * as PIXI from 'pixi.js';

/**
 * 特效视觉工具函数集合
 *
 * 所有特效子渲染器共享的颜色操作和绘图辅助方法。
 * 从 EffectRenderer 提取，消除重复代码。
 */

// ══════════════════════════════════════════════════════
//  颜色操作
// ══════════════════════════════════════════════════════

/** 提亮颜色（保持色相，增加亮度） */
export function lighten(color: number, amount: number): number {
  const r = Math.min(255, ((color >> 16) & 0xff) + amount);
  const g = Math.min(255, ((color >> 8) & 0xff) + amount);
  const b = Math.min(255, (color & 0xff) + amount);
  return (r << 16) | (g << 8) | b;
}

/** 降低颜色亮度（保持色相） */
export function dimColor(color: number, factor: number): number {
  const r = Math.round(((color >> 16) & 0xff) * factor);
  const g = Math.round(((color >> 8) & 0xff) * factor);
  const b = Math.round((color & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

/** 创建发光色（基于主色，默认 +50 亮度） */
export function glowColor(primary: number, amount = 50): number {
  return lighten(primary, amount);
}

/** 创建反弹色（基于主色，默认 0.6 因子） */
export function bounceColor(primary: number, factor = 0.6): number {
  return dimColor(primary, factor);
}

// ══════════════════════════════════════════════════════
//  形状绘制
// ══════════════════════════════════════════════════════

/** 绘制六边形（含填充 + 描边） */
export function drawHexagon(
  g: PIXI.Graphics,
  x: number,
  y: number,
  radius: number,
  color: number,
  alpha: number,
): void {
  const pts: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 - Math.PI / 6;
    pts.push([x + Math.cos(a) * radius, y + Math.sin(a) * radius]);
  }
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < 6; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  g.fill({ color, alpha: 0.25 });
  g.stroke({ color, width: 2, alpha });
}

/** 绘制圆环（用于弹射火花等扩散特效） */
export function drawRing(
  g: PIXI.Graphics,
  x: number,
  y: number,
  radius: number,
  color: number,
  width: number,
  alpha: number,
): void {
  g.circle(x, y, radius);
  g.stroke({ color, width, alpha });
}

// ══════════════════════════════════════════════════════
//  缓动函数
// ══════════════════════════════════════════════════════

/** easeOutCubic: 1 - (1-t)^3 */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** easeInCubic: t^3 */
export function easeInCubic(t: number): number {
  return t * t * t;
}

/** easeInOutCubic */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ══════════════════════════════════════════════════════
//  通用特效生命周期类型
// ══════════════════════════════════════════════════════

/** 活跃特效实例（通用接口，所有子渲染器共用） */
export interface ActiveEffect {
  type: 'shockwave' | 'firewall' | 'hive_sting' | 'hive_sting_bounce' | 'burst_flash' | 'sustained_shape';
  container: PIXI.Container;
  life: number;
  maxLife: number;
  onUpdate: (ef: ActiveEffect, dt: number) => void;
  onDecay: (ef: ActiveEffect) => void;
}

// ══════════════════════════════════════════════════════
//  数据驱动视觉配置类型
// ══════════════════════════════════════════════════════

/**
 * 冲击波视觉配置（可从 WeaponRangeConfig 或后端 effectConfig 获取）
 */
export interface ShockwaveVisualConfig {
  /** 主色（玩家主题色覆盖） */
  primaryColor?: number;
  /** 发光色 */
  glowColor?: number;
  /** 反弹色 */
  bounceColor?: number;
  /** 扩散持续时间（ms） */
  expandDurationMs?: number;
  /** 最大扩散半径（逻辑 px） */
  maxRadius?: number;
  /** 描边宽度（px） */
  strokeWidth?: number;
}

/**
 * 防火墙视觉配置
 */
export interface FirewallVisualConfig {
  /** 主色 */
  primaryColor?: number;
  /** 内侧描边色 */
  innerColor?: number;
  /** 视觉宽度（逻辑 px） */
  visualWidth?: number;
  /** 视觉高度（逻辑 px） */
  visualHeight?: number;
  /** 存活时间（ms） */
  maxLifeMs?: number;
  /** 六边形半径（逻辑 px） */
  hexRadius?: number;
  /** 出生生长时间（ms） */
  growDurationMs?: number;
}

/**
 * 蜂巢视觉配置
 */
export interface HiveVisualConfig {
  /** 蜂刺速度（px/s） */
  stingerSpeed?: number;
  /** 轨道半径（逻辑 px） */
  orbitRadius?: number;
  /** 爆发放大倍率 */
  burstScale?: number;
  /** 爆发闪屏持续时间（ms） */
  burstFlashDuration?: number;
}
