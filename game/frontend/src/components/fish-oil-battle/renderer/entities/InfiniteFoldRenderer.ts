/**
 * 无限折叠 (Infinite Fold) - 陈厌孑
 * 前端视觉渲染器
 *
 * 视觉设计（空间折叠系 + 维度重组双形态融合）：
 * - 闪避 Dodge：空间扭曲场（8 层径向渐变）+ 折叠几何（4 个旋转三角形）+ 空间裂缝（金色边黑线）+ 闪避残影
 * - 重组 Reassemble：重组核心（6 层金白渐变）+ 重组波纹（3 层扩散虚线感）+ 位置交换曲线
 * - 爆发 Burst：维度奇点核心（10 层渐变）+ 折叠几何爆发（6 个飞散三角形）+ 维度裂缝（8 条放射）+ 重组光环（多层）+ 中心奇点核（三阶段动画）
 */

import * as PIXI from 'pixi.js';
import { ParticlePool } from '../systems/ParticlePool';
import type { Palette } from './BaseWeaponEffectRenderer';
import { lighten, dimColor } from './VisualEffectUtils';

// ══════════════════════════════════════════════════════
//  颜色常量（空间折叠系）
// ══════════════════════════════════════════════════════

const FOLD_BLACK = 0x000000; // 纯黑（空间裂缝）
const FOLD_DARK = 0x1a1a2e; // 暗黑蓝（折叠暗面）
const FOLD_GOLD = 0xffd700; // 金色（重组能量）
const FOLD_LIGHT_GOLD = 0xffe875; // 浅金（高亮）
const FOLD_WHITE = 0xffffff; // 纯白（重组闪光）
const FOLD_PURPLE = 0x6633cc; // 空间紫（维度色）
const FOLD_CYAN = 0x00ffcc; // 青绿（空间扭曲）

// ══════════════════════════════════════════════════════
//  数据结构
// ══════════════════════════════════════════════════════

/** 活跃闪避实例（空间扭曲场派） */
interface ActiveDodge {
  container: PIXI.Container;
  auraGraphics: PIXI.Graphics; // 空间扭曲场
  foldGraphics: PIXI.Graphics; // 折叠几何（三角形）
  crackGraphics: PIXI.Graphics; // 空间裂缝
  afterimageGraphics: PIXI.Graphics; // 闪避残影
  particleTimer: number;
  life: number; // ms 累计
  maxLife: number;
  foldLayer: number; // 折叠层数
  dodgeSuccess: boolean;
  x: number;
  y: number;
  radius: number;
}

/** 活跃重组实例（金白重组派） */
interface ActiveReassemble {
  container: PIXI.Container;
  coreGraphics: PIXI.Graphics; // 重组核心
  rippleGraphics: PIXI.Graphics; // 重组波纹
  swapLineGraphics: PIXI.Graphics; // 位置交换线
  life: number;
  maxLife: number;
  foldCount: number;
  themeColor: number;
}

/** 活跃爆发特效（维度坍缩派 + 三阶段动画） */
interface ActiveBurst {
  container: PIXI.Container;
  coreGraphics: PIXI.Graphics; // 维度奇点核
  foldGraphics: PIXI.Graphics; // 折叠几何爆发
  crackGraphics: PIXI.Graphics; // 维度裂缝
  ringGraphics: PIXI.Graphics; // 重组光环
  centerGraphics: PIXI.Graphics; // 中心奇点核
  life: number;
  maxLife: number;
  themeColor: number;
  radius: number;
}

export class InfiniteFoldRenderer {
  private fieldContainer: PIXI.Container;
  private particlePool: ParticlePool;
  private scale = 1;

  // 活跃实例池
  private activeDodges: Map<string, ActiveDodge> = new Map();
  private activeReassembles: Map<string, ActiveReassemble> = new Map();
  private activeBursts: Map<string, ActiveBurst> = new Map();

  constructor(fieldContainer: PIXI.Container, particlePool: ParticlePool) {
    this.fieldContainer = fieldContainer;
    this.particlePool = particlePool;
  }

  setScale(scale: number): void {
    this.scale = scale;
    // 容器统一承担全局缩放，内部 graphics 维持各自的动画 scale
    this.activeDodges.forEach((dodge) => {
      if (dodge.container.destroyed) return;
      dodge.container.scale.set(scale);
    });
    this.activeReassembles.forEach((rs) => {
      if (rs.container.destroyed) return;
      rs.container.scale.set(scale);
    });
    this.activeBursts.forEach((burst) => {
      if (burst.container.destroyed) return;
      burst.container.scale.set(scale);
    });
  }

  // ══════════════════════════════════════════════════════
  //  闪避 Dodge（空间扭曲场派）
  // ══════════════════════════════════════════════════════

  /**
   * 触发闪避视觉效果
   * @param playerId 玩家 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param radius 闪避范围（逻辑 px）
   * @param foldLayer 折叠层数（影响三角形数量）
   * @param dodgeSuccess 是否成功闪避
   * @param themeColor 主题色（默认空间紫）
   */
  triggerDodge(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    foldLayer: number,
    dodgeSuccess: boolean,
    themeColor = FOLD_PURPLE,
    palette?: Palette,
  ): void {
    const pal: Palette = palette ?? {
      primary: themeColor,
      glow: lighten(themeColor, 50),
      highlight: lighten(themeColor, 100),
      dim: dimColor(themeColor, 0.6),
      shadow: dimColor(themeColor, 0.3),
      accent: 0xFFD700,
    };

    // 若已存在，先销毁旧实例（避免泄漏）
    const old = this.activeDodges.get(playerId);
    if (old) {
      this.fieldContainer.removeChild(old.container);
      old.container.destroy({ children: true });
    }

    const container = new PIXI.Container();
    container.position.set(x, y);
    container.scale.set(this.scale);

    // 1. 空间扭曲场（8 层径向渐变）
    const auraGraphics = new PIXI.Graphics();
    this.drawDodgeAura(auraGraphics, radius, pal.primary);
    container.addChild(auraGraphics);

    // 2. 折叠几何（3-4 个旋转三角形）
    const foldGraphics = new PIXI.Graphics();
    const triCount = Math.min(4, Math.max(3, foldLayer));
    this.drawDodgeFold(foldGraphics, radius, triCount);
    container.addChild(foldGraphics);

    // 3. 空间裂缝（2-3 条黑色细线，带金色边缘）
    const crackGraphics = new PIXI.Graphics();
    this.drawDodgeCrack(crackGraphics, radius);
    container.addChild(crackGraphics);

    // 4. 闪避残影（3 个半透明残影）
    const afterimageGraphics = new PIXI.Graphics();
    this.drawDodgeAfterimage(afterimageGraphics, radius, dodgeSuccess);
    container.addChild(afterimageGraphics);

    this.fieldContainer.addChild(container);

    const dodge: ActiveDodge = {
      container,
      auraGraphics,
      foldGraphics,
      crackGraphics,
      afterimageGraphics,
      particleTimer: 0,
      life: 0,
      maxLife: 1200, // 1.2 秒（短促闪避特效）
      foldLayer,
      dodgeSuccess,
      x,
      y,
      radius,
    };
    this.activeDodges.set(playerId, dodge);

    // 触发首帧空间粒子
    this.spawnFoldParticles(x, y, radius, FOLD_PURPLE);
  }

  /** 移除闪避特效 */
  removeDodge(playerId: string): void {
    const dodge = this.activeDodges.get(playerId);
    if (dodge) {
      this.fieldContainer.removeChild(dodge.container);
      dodge.container.destroy({ children: true });
      this.activeDodges.delete(playerId);
    }
  }

  /**
   * 绘制空间扭曲场：8 层同心圆径向渐变（暗黑蓝 → 空间紫 → 透明）
   * 以 (0,0) 为中心绘制，半径单位为逻辑 px
   */
  private drawDodgeAura(
    g: PIXI.Graphics,
    radius: number,
    themeColor: number,
  ): void {
    g.clear();

    // 8 层同心圆叠加（暗黑蓝 → 空间紫 → 透明）
    for (let i = 0; i < 8; i++) {
      const t = i / 7; // 0 → 1
      const r = radius * (0.15 + 0.85 * t);
      // 颜色分段：前半段 暗黑蓝 → 空间紫，后半段保持空间紫
      const color =
        t < 0.5
          ? this.interpolateColor(FOLD_DARK, themeColor, t * 2)
          : themeColor;
      const alpha = (1 - t) * 0.22; // 中心高 alpha，边缘趋近 0
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }

    // 扭曲感外环：紫色细环 + 青绿细环（错位叠加营造空间扭曲）
    g.circle(0, 0, radius);
    g.stroke({ color: FOLD_PURPLE, width: 1, alpha: 0.7 });
    g.circle(0, 0, radius * 0.96);
    g.stroke({ color: FOLD_CYAN, width: 0.4, alpha: 0.5 });
  }

  /**
   * 绘制折叠几何：N 个旋转的折纸三角形（不同角度，表示空间折叠）
   * 由 foldGraphics 独立承担旋转动画
   */
  private drawDodgeFold(
    g: PIXI.Graphics,
    radius: number,
    triCount: number,
  ): void {
    g.clear();
    const baseR = radius * 0.5;
    for (let i = 0; i < triCount; i++) {
      // 每个三角形错开角度，营造空间折叠感
      const a = (i * Math.PI * 2) / triCount;
      // 等边三角形：三个顶点
      const p1x = Math.cos(a) * baseR;
      const p1y = Math.sin(a) * baseR;
      const p2x = Math.cos(a + (Math.PI * 2) / 3) * baseR;
      const p2y = Math.sin(a + (Math.PI * 2) / 3) * baseR;
      const p3x = Math.cos(a + (Math.PI * 4) / 3) * baseR;
      const p3y = Math.sin(a + (Math.PI * 4) / 3) * baseR;
      g.moveTo(p1x, p1y);
      g.lineTo(p2x, p2y);
      g.lineTo(p3x, p3y);
      g.closePath();
      // 折纸三角形：填充半透明紫 + 描边金色
      g.fill({ color: FOLD_PURPLE, alpha: 0.15 });
      g.stroke({ color: FOLD_GOLD, width: 0.8, alpha: 0.7 });
    }
  }

  /**
   * 绘制空间裂缝：2-3 条黑色细线，带金色边缘
   */
  private drawDodgeCrack(g: PIXI.Graphics, radius: number): void {
    g.clear();
    const crackCount = 3;
    const len = radius * 0.8;
    for (let i = 0; i < crackCount; i++) {
      // 裂缝随机角度（固定种子避免每帧抖动）
      const a = (i * Math.PI * 2) / crackCount + Math.PI / 6;
      const halfLen = len / 2;
      // 裂缝起点终点（穿过中心）
      const x1 = Math.cos(a) * halfLen;
      const y1 = Math.sin(a) * halfLen;
      const x2 = -x1;
      const y2 = -y1;
      // 金色边缘（粗）
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke({ color: FOLD_GOLD, width: 1.6, alpha: 0.7 });
      // 黑色裂缝（细，覆盖在金色上）
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke({ color: FOLD_BLACK, width: 0.6, alpha: 0.9 });
    }
  }

  /**
   * 绘制闪避残影：3 个半透明残影（不同时间帧位置），alpha 递减
   */
  private drawDodgeAfterimage(
    g: PIXI.Graphics,
    radius: number,
    dodgeSuccess: boolean,
  ): void {
    g.clear();
    const silR = radius * 0.25; // 残影半径
    // 残影颜色：闪避成功用青绿，失败用暗黑蓝
    const color = dodgeSuccess ? FOLD_CYAN : FOLD_DARK;
    // 3 个残影，沿水平方向错开
    const offsets = [-radius * 0.35, 0, radius * 0.35];
    for (let i = 0; i < offsets.length; i++) {
      const ox = offsets[i];
      const alpha = 0.5 - i * 0.12; // alpha 递减
      g.circle(ox, 0, silR);
      g.fill({ color, alpha });
      // 描边
      g.stroke({ color: FOLD_WHITE, width: 0.3, alpha: alpha * 0.5 });
    }
  }

  /**
   * 生成空间折叠粒子（向外飘散）
   * 利用 particlePool.emit，每帧由 update 节流调用
   */
  private spawnFoldParticles(
    x: number,
    y: number,
    radius: number,
    color: number,
  ): void {
    const s = this.scale;
    for (let i = 0; i < 2; i++) {
      const angle = Math.random() * Math.PI * 2;
      const startDist = radius * s * (0.2 + Math.random() * 0.2);
      const px = x + Math.cos(angle) * startDist;
      const py = y + Math.sin(angle) * startDist;
      const speed = (20 + Math.random() * 15) * s;
      this.particlePool.emit({
        x: px,
        y: py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1500,
        scaleStart: 1,
        scaleEnd: 0,
        alphaStart: 0.8,
        alphaEnd: 0,
        tint: color,
        radius: (1.5 + Math.random() * 1.5) * s,
      });
    }
  }

  // ══════════════════════════════════════════════════════
  //  空间重组 Reassemble（金白重组派）
  // ══════════════════════════════════════════════════════

  /**
   * 触发空间重组视觉效果
   * @param targetId 目标玩家 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param foldCount 折叠次数（影响波纹强度）
   * @param themeColor 主题色（默认金色）
   */
  triggerReassemble(
    targetId: string,
    x: number,
    y: number,
    foldCount: number,
    themeColor = FOLD_GOLD,
    palette?: Palette,
  ): void {
    const pal: Palette = palette ?? {
      primary: themeColor,
      glow: lighten(themeColor, 50),
      highlight: lighten(themeColor, 100),
      dim: dimColor(themeColor, 0.6),
      shadow: dimColor(themeColor, 0.3),
      accent: 0x6633CC,
    };

    // 若已存在，先销毁旧实例
    const old = this.activeReassembles.get(targetId);
    if (old) {
      this.fieldContainer.removeChild(old.container);
      old.container.destroy({ children: true });
    }

    const container = new PIXI.Container();
    container.position.set(x, y);
    container.scale.set(this.scale);

    // 1. 重组核心（6 层金白渐变）
    const coreGraphics = new PIXI.Graphics();
    this.drawReassembleCore(coreGraphics, pal.primary);
    container.addChild(coreGraphics);

    // 2. 重组波纹（3 层扩散圆环，带虚线感）
    const rippleGraphics = new PIXI.Graphics();
    this.drawReassembleRipple(rippleGraphics, 25 + foldCount * 4, pal.primary);
    container.addChild(rippleGraphics);

    // 3. 位置交换线（连接原始位置和目标位置的曲线）
    const swapLineGraphics = new PIXI.Graphics();
    this.drawReassembleSwapLine(swapLineGraphics, 40, foldCount, pal.primary);
    container.addChild(swapLineGraphics);

    this.fieldContainer.addChild(container);

    const reassemble: ActiveReassemble = {
      container,
      coreGraphics,
      rippleGraphics,
      swapLineGraphics,
      life: 0,
      maxLife: 2000, // 2 秒
      foldCount,
      themeColor,
    };
    this.activeReassembles.set(targetId, reassemble);

    // 触发首帧金色粒子
    this.spawnReassembleParticles(x, y, FOLD_GOLD);
  }

  /** 移除重组特效 */
  removeReassemble(targetId: string): void {
    const rs = this.activeReassembles.get(targetId);
    if (rs) {
      this.fieldContainer.removeChild(rs.container);
      rs.container.destroy({ children: true });
      this.activeReassembles.delete(targetId);
    }
  }

  /**
   * 绘制重组核心：6 层同心圆（金色 → 白色 → 透明）
   */
  private drawReassembleCore(
    g: PIXI.Graphics,
    themeColor: number,
  ): void {
    g.clear();
    const baseR = 18; // 重组核心基础半径

    // 6 层同心圆（金色 → 白色 → 透明）
    for (let i = 0; i < 6; i++) {
      const t = i / 5; // 0 → 1
      const r = baseR * (0.2 + 0.8 * t);
      // 颜色分段：前半段 金色 → 白色，后半段保持白色
      const color =
        t < 0.5
          ? this.interpolateColor(themeColor, FOLD_WHITE, t * 2)
          : FOLD_WHITE;
      const alpha = (1 - t) * 0.3;
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }

    // 中心重组核：白色实心 + 金色外环
    g.circle(0, 0, 5);
    g.stroke({ color: themeColor, width: 1.2, alpha: 0.9 });
    g.circle(0, 0, 3);
    g.fill({ color: FOLD_WHITE, alpha: 1 });
  }

  /**
   * 绘制重组波纹：3 层扩散圆环（金色，带虚线感）
   * 通过对圆进行分段绘制模拟虚线效果
   */
  private drawReassembleRipple(
    g: PIXI.Graphics,
    baseRadius: number,
    themeColor: number,
  ): void {
    g.clear();
    // 3 层扩散环
    for (let layer = 0; layer < 3; layer++) {
      const r = baseRadius * (0.6 + 0.4 * layer);
      const alpha = 0.6 - layer * 0.15;
      // 虚线感：通过分段绘制圆弧
      const segments = 16;
      const dashRatio = 0.6; // 实线占 60%
      for (let s = 0; s < segments; s++) {
        const startA = (s / segments) * Math.PI * 2;
        const endA = startA + (Math.PI * 2 / segments) * dashRatio;
        g.arc(0, 0, r, startA, endA);
        g.stroke({ color: themeColor, width: 0.8, alpha });
      }
    }
  }

  /**
   * 绘制位置交换线：连接原始位置和目标位置的曲线（金色虚线）
   * 由于仅有单点坐标，使用 bezier 曲线绘制 swap 轨迹示意
   */
  private drawReassembleSwapLine(
    g: PIXI.Graphics,
    span: number,
    foldCount: number,
    themeColor: number,
  ): void {
    g.clear();
    // 避免未使用警告
    void foldCount;
    // 起点（左侧）→ 终点（右侧），中间用 bezier 制造弧形
    const startX = -span;
    const startY = 0;
    const endX = span;
    const endY = 0;
    // 控制点：上方弧形，营造位置交换感
    const cp1X = -span * 0.5;
    const cp1Y = -span * 0.6;
    const cp2X = span * 0.5;
    const cp2Y = -span * 0.6;

    // 虚线感的曲线：分段绘制 bezier
    const segments = 12;
    const dashRatio = 0.5;
    for (let i = 0; i < segments; i++) {
      if (i % 2 !== 0) continue; // 间隔虚线
      const t1 = i / segments;
      const t2 = Math.min(1, t1 + (1 / segments) * dashRatio);
      const p1 = this.bezierPoint(t1, startX, startY, cp1X, cp1Y, cp2X, cp2Y, endX, endY);
      const p2 = this.bezierPoint(t2, startX, startY, cp1X, cp1Y, cp2X, cp2Y, endX, endY);
      g.moveTo(p1.x, p1.y);
      g.lineTo(p2.x, p2.y);
      g.stroke({ color: themeColor, width: 1, alpha: 0.8 });
    }

    // 起点和终点小标记（金色圆点）
    g.circle(startX, startY, 2);
    g.fill({ color: FOLD_LIGHT_GOLD, alpha: 0.9 });
    g.circle(endX, endY, 2);
    g.fill({ color: FOLD_LIGHT_GOLD, alpha: 0.9 });
  }

  /**
   * 生成重组粒子（金色四散）
   */
  private spawnReassembleParticles(
    x: number,
    y: number,
    color: number,
  ): void {
    const s = this.scale;
    for (let i = 0; i < 3; i++) {
      const angle = Math.random() * Math.PI * 2;
      const startDist = 5 * s;
      const px = x + Math.cos(angle) * startDist;
      const py = y + Math.sin(angle) * startDist;
      const speed = (15 + Math.random() * 20) * s;
      this.particlePool.emit({
        x: px,
        y: py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1200,
        scaleStart: 1,
        scaleEnd: 0,
        alphaStart: 0.9,
        alphaEnd: 0,
        tint: color,
        radius: (1.5 + Math.random() * 1.5) * s,
      });
    }
  }

  // ══════════════════════════════════════════════════════
  //  爆发特效（维度坍缩派 + 三阶段动画）
  // ══════════════════════════════════════════════════════

  /**
   * 触发爆发视觉效果
   * @param playerId 玩家 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param radius 爆发范围（逻辑 px）
   * @param themeColor 主题色
   * @param durationMs 持续时间（ms），默认 5000
   */
  triggerBurst(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor = FOLD_GOLD,
    durationMs?: number,
    palette?: Palette,
  ): void {
    const pal: Palette = palette ?? {
      primary: 0x6633CC,
      glow: 0x9966FF,
      highlight: 0xCC99FF,
      dim: 0x1A1A2E,
      shadow: 0x000000,
      accent: themeColor,
    };

    // 若已存在，先销毁旧实例
    const old = this.activeBursts.get(playerId);
    if (old) {
      this.fieldContainer.removeChild(old.container);
      old.container.destroy({ children: true });
    }

    const container = new PIXI.Container();
    container.position.set(x, y);
    container.scale.set(this.scale);

    // 1. 维度奇点核心（10 层渐变 黑→暗紫→金→透明）
    const coreGraphics = new PIXI.Graphics();
    this.drawBurstCore(coreGraphics, radius);
    container.addChild(coreGraphics);

    // 2. 折叠几何爆发（6 个三角形从中心向外飞散）
    const foldGraphics = new PIXI.Graphics();
    this.drawBurstFold(foldGraphics, radius);
    container.addChild(foldGraphics);

    // 3. 维度裂缝（8 条黑色裂缝从中心放射）
    const crackGraphics = new PIXI.Graphics();
    this.drawBurstCrack(crackGraphics, radius);
    container.addChild(crackGraphics);

    // 4. 重组光环（金色扩散环，多层）
    const ringGraphics = new PIXI.Graphics();
    this.drawBurstRing(ringGraphics, radius);
    container.addChild(ringGraphics);

    // 5. 中心奇点核（黑色实心 + 金色边缘辉光）
    const centerGraphics = new PIXI.Graphics();
    this.drawBurstCenter(centerGraphics, pal.accent);
    container.addChild(centerGraphics);

    this.fieldContainer.addChild(container);

    const burst: ActiveBurst = {
      container,
      coreGraphics,
      foldGraphics,
      crackGraphics,
      ringGraphics,
      centerGraphics,
      life: 0,
      maxLife: durationMs ?? 5000,
      themeColor,
      radius,
    };
    this.activeBursts.set(playerId, burst);
  }

  /**
   * 绘制维度奇点核心：10 层同心圆（黑 → 暗紫 → 金 → 透明）
   */
  private drawBurstCore(g: PIXI.Graphics, radius: number): void {
    g.clear();
    const coreR = radius * 0.6;

    // 10 层同心圆叠加（黑 → 暗紫 → 金 → 透明）
    for (let i = 0; i < 10; i++) {
      const t = i / 9; // 0 → 1
      const r = coreR * (0.1 + 0.9 * t);
      // 颜色分段：黑 → 暗紫 → 紫 → 金 → 浅金
      let color: number;
      if (t < 0.25) {
        color = this.interpolateColor(FOLD_BLACK, FOLD_PURPLE, t / 0.25);
      } else if (t < 0.5) {
        color = this.interpolateColor(
          FOLD_PURPLE,
          FOLD_GOLD,
          (t - 0.25) / 0.25,
        );
      } else if (t < 0.75) {
        color = this.interpolateColor(
          FOLD_GOLD,
          FOLD_LIGHT_GOLD,
          (t - 0.5) / 0.25,
        );
      } else {
        color = FOLD_LIGHT_GOLD;
      }
      const alpha = (1 - t) * 0.25;
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }
  }

  /**
   * 绘制折叠几何爆发：6 个三角形从中心向外飞散（不同角度）
   */
  private drawBurstFold(g: PIXI.Graphics, radius: number): void {
    g.clear();
    const triCount = 6;
    const baseR = radius * 0.7;
    for (let i = 0; i < triCount; i++) {
      const a = (i * Math.PI * 2) / triCount;
      // 三角形顶点指向外
      const tipX = Math.cos(a) * baseR;
      const tipY = Math.sin(a) * baseR;
      const back1 = a + (Math.PI * 2) / 3;
      const back2 = a + (Math.PI * 4) / 3;
      const b1x = Math.cos(back1) * baseR * 0.4;
      const b1y = Math.sin(back1) * baseR * 0.4;
      const b2x = Math.cos(back2) * baseR * 0.4;
      const b2y = Math.sin(back2) * baseR * 0.4;
      g.moveTo(tipX, tipY);
      g.lineTo(b1x, b1y);
      g.lineTo(b2x, b2y);
      g.closePath();
      // 折叠三角形：填充半透明金 + 描边浅金
      g.fill({ color: FOLD_GOLD, alpha: 0.18 });
      g.stroke({ color: FOLD_LIGHT_GOLD, width: 1, alpha: 0.8 });
    }
  }

  /**
   * 绘制维度裂缝：8 条黑色裂缝从中心放射（带金色边缘）
   */
  private drawBurstCrack(g: PIXI.Graphics, radius: number): void {
    g.clear();
    const crackCount = 8;
    const len = radius;
    for (let i = 0; i < crackCount; i++) {
      const a = (i * Math.PI * 2) / crackCount;
      const x1 = 0;
      const y1 = 0;
      const x2 = Math.cos(a) * len;
      const y2 = Math.sin(a) * len;
      // 金色边缘（粗）
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke({ color: FOLD_GOLD, width: 1.8, alpha: 0.7 });
      // 黑色裂缝（细，覆盖在金色上）
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke({ color: FOLD_BLACK, width: 0.8, alpha: 0.9 });
    }
  }

  /**
   * 绘制重组光环：金色扩散环（双层）
   */
  private drawBurstRing(g: PIXI.Graphics, radius: number): void {
    g.clear();
    // 外环（浅金）
    g.circle(0, 0, radius);
    g.stroke({ color: FOLD_LIGHT_GOLD, width: 0.8, alpha: 0.7 });
    // 内环（金色）
    g.circle(0, 0, radius * 0.95);
    g.stroke({ color: FOLD_GOLD, width: 0.4, alpha: 0.5 });
  }

  /**
   * 绘制中心奇点核：黑色实心 + 金色边缘辉光
   */
  private drawBurstCenter(g: PIXI.Graphics, themeColor: number): void {
    g.clear();
    // 金色边缘辉光（外圈）
    g.circle(0, 0, 9);
    g.stroke({ color: themeColor, width: 1.5, alpha: 0.8 });
    // 浅金次辉光
    g.circle(0, 0, 7);
    g.stroke({ color: FOLD_LIGHT_GOLD, width: 0.6, alpha: 0.6 });
    // 黑色实心奇点核
    g.circle(0, 0, 6);
    g.fill({ color: FOLD_BLACK, alpha: 1 });
  }

  // ══════════════════════════════════════════════════════
  //  更新循环
  // ══════════════════════════════════════════════════════

  /** 每帧更新（由 EffectRenderer 调用，dt 单位 ms） */
  update(dt: number): void {
    // ── 闪避：扭曲场呼吸 + 折叠旋转 + 裂缝闪烁 + 残影淡出 + 粒子 ──
    this.activeDodges.forEach((dodge, playerId) => {
      dodge.life += dt;
      if (dodge.life >= dodge.maxLife) {
        this.removeDodge(playerId);
        return;
      }
      const lifeT = dodge.life / dodge.maxLife; // 0 → 1
      // 整体淡出（接近末尾）
      const fadeOut = lifeT > 0.7 ? 1 - (lifeT - 0.7) / 0.3 : 1;

      // 扭曲场呼吸 scale 1.0↔1.06（1.5s 周期）
      const breath = 1 + 0.06 * Math.sin(dodge.life * 0.001 * Math.PI * 1.5);
      dodge.auraGraphics.scale.set(breath);
      // 扭曲场脉动 alpha 0.7↔1.0
      const pulse = 0.85 + 0.15 * Math.sin(dodge.life * 0.001 * Math.PI * 1.5);
      dodge.auraGraphics.alpha = pulse * fadeOut;

      // 折叠几何旋转（正向 + 反向交替，营造空间折叠扭曲）
      dodge.foldGraphics.rotation += dt * 0.001 * Math.PI * 0.8;
      dodge.foldGraphics.alpha = fadeOut;

      // 裂缝闪烁（高频 alpha 抖动）
      const flicker = 0.6 + 0.4 * Math.sin(dodge.life * 0.01 * Math.PI);
      dodge.crackGraphics.alpha = flicker * fadeOut;

      // 残影淡出（前 30% 显现，30%-70% 持续，70%-100% 淡出）
      let afterimageAlpha = 1;
      if (lifeT < 0.3) {
        afterimageAlpha = lifeT / 0.3;
      } else if (lifeT > 0.7) {
        afterimageAlpha = 1 - (lifeT - 0.7) / 0.3;
      }
      dodge.afterimageGraphics.alpha = afterimageAlpha * fadeOut;

      // 空间粒子：每 400ms 生成 2 个
      dodge.particleTimer += dt;
      if (dodge.particleTimer > 400) {
        dodge.particleTimer = 0;
        this.spawnFoldParticles(dodge.x, dodge.y, dodge.radius, FOLD_PURPLE);
      }
    });

    // ── 重组：核心脉动 + 波纹扩散 + 交换线脉动 ──
    this.activeReassembles.forEach((rs, targetId) => {
      rs.life += dt;
      if (rs.life >= rs.maxLife) {
        this.removeReassemble(targetId);
        return;
      }
      const lifeT = rs.life / rs.maxLife; // 0 → 1
      // 整体淡出（最后 30%）
      const fadeOut = lifeT > 0.7 ? 1 - (lifeT - 0.7) / 0.3 : 1;

      // 核心脉动 scale 1.0↔1.15（1s 周期）
      const corePulse = 1 + 0.15 * Math.sin(rs.life * 0.001 * Math.PI * 2);
      rs.coreGraphics.scale.set(corePulse);
      rs.coreGraphics.alpha = fadeOut;

      // 波纹扩散 scale 0.4→1.8（线性），alpha 1.0→0
      const rippleScale = 0.4 + 1.4 * lifeT;
      const rippleAlpha = (1 - lifeT) * fadeOut;
      rs.rippleGraphics.scale.set(rippleScale);
      rs.rippleGraphics.alpha = rippleAlpha;
      // 波纹缓慢旋转，增强空间重组感
      rs.rippleGraphics.rotation += dt * 0.001 * Math.PI * 0.5;

      // 交换线脉动 alpha 0.5↔1.0
      const swapPulse = 0.75 + 0.25 * Math.sin(rs.life * 0.002 * Math.PI);
      rs.swapLineGraphics.alpha = swapPulse * fadeOut;
    });

    // ── 爆发：三阶段动画 ──
    this.activeBursts.forEach((burst, playerId) => {
      burst.life += dt;
      const T = burst.maxLife;
      if (burst.life >= T) {
        this.removeBurst(playerId);
        return;
      }
      // 三阶段：折叠 0-20%T，坍缩 20%-40%T，重组 40%-100%T
      const phase1End = T * 0.2;
      const phase2End = T * 0.4;

      if (burst.life < phase1End) {
        // 阶段1 折叠：空间向中心收缩，折叠几何汇聚
        // core 收缩 scale 1.0→0.3，fold 汇聚 alpha 0→1，cracks 隐藏，ring 隐藏
        const t = burst.life / phase1End;
        burst.coreGraphics.scale.set(1.0 - 0.7 * t);
        burst.coreGraphics.alpha = t; // 0 → 1 显现
        burst.foldGraphics.scale.set(1.5 - 0.5 * t); // 1.5 → 1.0 汇聚
        burst.foldGraphics.alpha = t;
        burst.crackGraphics.alpha = 0;
        burst.ringGraphics.alpha = 0;
        burst.ringGraphics.scale.set(0.3);
        burst.centerGraphics.alpha = 0;
      } else if (burst.life < phase2End) {
        // 阶段2 坍缩：维度坍缩，黑色奇点爆发
        // core 爆发 scale 0.3→1.0 (easeOutCubic)，cracks 闪现 alpha 0→0.8，ring 展开，center 显现
        const t = (burst.life - phase1End) / (phase2End - phase1End);
        const eased = this.easeOutCubic(t);
        burst.coreGraphics.scale.set(0.3 + 0.7 * eased);
        burst.coreGraphics.alpha = 1.0;
        burst.foldGraphics.scale.set(1.0 + 0.3 * eased);
        burst.foldGraphics.alpha = 1.0 - 0.3 * t;
        burst.crackGraphics.alpha = 0.8 * t; // 0 → 0.8
        burst.ringGraphics.scale.set(0.3 + 0.7 * eased);
        burst.ringGraphics.alpha = t; // 0 → 1
        burst.centerGraphics.alpha = t; // 0 → 1 奇点核显现
        // 奇点核脉动
        const centerPulse = 1 + 0.2 * Math.sin(t * Math.PI * 6);
        burst.centerGraphics.scale.set(centerPulse);
      } else {
        // 阶段3 重组：金色能量扩散，空间重组
        // ring 扩散 scale 1.0→2.0 alpha 1.0→0，fold 消散 alpha 0.7→0（sin 波动）
        //     cracks 消散 alpha 0.8→0，core 保持但透明 alpha 1.0→0.3，center 保持
        const t = (burst.life - phase2End) / (T - phase2End);
        const eased = this.easeOutCubic(t);
        // 重组光环扩散
        burst.ringGraphics.scale.set(1.0 + 1.0 * eased);
        burst.ringGraphics.alpha = 1.0 - t;
        // 折叠几何消散 + 旋转
        burst.foldGraphics.alpha = 0.7 * (1.0 - t);
        burst.foldGraphics.rotation = Math.sin(t * Math.PI * 4) * 0.5;
        // 裂缝消散
        burst.crackGraphics.alpha = 0.8 * (1.0 - t);
        // 维度核心淡出
        burst.coreGraphics.alpha = 1.0 - 0.7 * t;
        // 中心奇点核持续脉动并淡出
        const centerPulse = 1 + 0.15 * Math.sin(t * Math.PI * 8);
        burst.centerGraphics.scale.set(centerPulse);
        burst.centerGraphics.alpha = 1.0 - 0.5 * t;
      }
    });
  }

  // ══════════════════════════════════════════════════════
  //  移除与清理
  // ══════════════════════════════════════════════════════

  /** 移除爆发特效 */
  removeBurst(playerId: string): void {
    const burst = this.activeBursts.get(playerId);
    if (burst) {
      this.fieldContainer.removeChild(burst.container);
      burst.container.destroy({ children: true });
      this.activeBursts.delete(playerId);
    }
  }

  /** 清除所有特效（不销毁渲染器） */
  clear(): void {
    this.activeDodges.forEach((_, playerId) => this.removeDodge(playerId));
    this.activeReassembles.forEach((_, targetId) =>
      this.removeReassemble(targetId),
    );
    this.activeBursts.forEach((_, playerId) => this.removeBurst(playerId));
  }

  destroy(): void {
    this.clear();
  }

  // ══════════════════════════════════════════════════════
  //  工具方法
  // ══════════════════════════════════════════════════════

  /** 颜色插值（from → to，t ∈ [0,1]） */
  private interpolateColor(from: number, to: number, t: number): number {
    const fr = (from >> 16) & 0xff;
    const fg = (from >> 8) & 0xff;
    const fb = from & 0xff;
    const tr = (to >> 16) & 0xff;
    const tg = (to >> 8) & 0xff;
    const tb = to & 0xff;
    const r = Math.round(fr + (tr - fr) * t);
    const g = Math.round(fg + (tg - fg) * t);
    const b = Math.round(fb + (tb - fb) * t);
    return (r << 16) | (g << 8) | b;
  }

  /** easeOutCubic 缓动 */
  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  /**
   * 三次贝塞尔曲线取点（用于绘制 swap 交换线虚线分段）
   * @param t 参数 [0,1]
   * @param p0x,p0y 起点
   * @param p1x,p1y 控制点1
   * @param p2x,p2y 控制点2
   * @param p3x,p3y 终点
   */
  private bezierPoint(
    t: number,
    p0x: number,
    p0y: number,
    p1x: number,
    p1y: number,
    p2x: number,
    p2y: number,
    p3x: number,
    p3y: number,
  ): { x: number; y: number } {
    const u = 1 - t;
    const tt = t * t;
    const uu = u * u;
    const uuu = uu * u;
    const ttt = tt * t;
    const x =
      uuu * p0x +
      3 * uu * t * p1x +
      3 * u * tt * p2x +
      ttt * p3x;
    const y =
      uuu * p0y +
      3 * uu * t * p1y +
      3 * u * tt * p2y +
      ttt * p3y;
    return { x, y };
  }
}
