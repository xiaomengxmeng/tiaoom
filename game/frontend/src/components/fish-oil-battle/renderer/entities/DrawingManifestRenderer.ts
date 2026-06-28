/**
 * 画作实体化 (Drawing Manifest) - 白猫
 * 前端视觉渲染器
 *
 * 视觉设计（画作出真 · 水墨水彩风格）：
 * - 画作光环：8 层同心圆径向渐变（白→紫粉→透明），水墨晕染感
 * - 兔子实体：多层水彩叠加（4 层身体 + 2 层耳朵 + 眼睛高光 + 鼻子）
 * - 画笔图标：金色笔杆 + 紫色笔毛，6 层时多层光晕（替代粗糙白点）
 * - 墨水粒子：每 1.5s 生成 2-3 个紫色墨水粒子（向下滴落 + 向外飘散）
 * - 爆发扩散：三阶段动画（泼墨 0-20% → 实体化 20-40% → 消散 40-100%）
 *   · 画作核心（10 层渐变）+ 水彩波纹（5 层）+ 墨水飞溅 + 中心画布 + 画笔光晕
 */

import * as PIXI from 'pixi.js';
import { ParticlePool } from '../systems/ParticlePool';
import { easeOutCubic, lighten, dimColor, type ActiveEffect } from './VisualEffectUtils';
import type { Palette } from './BaseWeaponEffectRenderer';

// ══════════════════════════════════════════════════════
//  颜色常量（水彩画作系）
// ══════════════════════════════════════════════════════

const INK_DEEP = 0x4a2c5a; // 深墨紫
const INK_MAIN = 0x8b4d9f; // 主紫粉
const INK_LIGHT = 0xd4a5dd; // 浅紫粉
const INK_HIGHLIGHT = 0xf5e1f5; // 高亮淡紫
const INK_PINK = 0xffb3d9; // 兔子粉
const INK_WHITE = 0xffffff; // 纸张白
const INK_GOLD = 0xd4af37; // 画笔金

// ══════════════════════════════════════════════════════
//  数据结构
// ══════════════════════════════════════════════════════

/** 画作实体化视觉配置（数据驱动） */
export interface DrawingManifestVisualConfig {
  /** 小兔半径（逻辑 px） */
  rabbitRadius?: number;
  /** 肌肉兔半径（逻辑 px） */
  muscleRadius?: number;
  /** 冲刺飞行速度（px/s） */
  dashSpeed?: number;
  /** 爆发持续（ms） */
  burstDurationMs?: number;
}

/** 活跃小兔/肌肉兔实例（常驻跟随） */
interface ActiveRabbit {
  container: PIXI.Container;
  auraGraphics: PIXI.Graphics; // 画作光环（8 层径向渐变）
  bodyGraphics: PIXI.Graphics; // 兔子身体（多层水彩叠加 + 耳朵 + 五官）
  brushGraphics: PIXI.Graphics; // 画笔图标
  particleTimer: number; // 墨水粒子计时器
  life: number; // 累计生命（ms，用于呼吸/脉动动画）
  x: number;
  y: number;
  radius: number;
  playerId: string;
  inkStacks: number;
  isMuscle: boolean;
}

/** 墨水飞溅配置（爆发时预计算） */
interface SplashConfig {
  angle: number;
  maxDist: number;
  size: number;
}

export class DrawingManifestRenderer {
  private entityContainer: PIXI.Container;
  private fieldContainer: PIXI.Container;
  private particlePool?: ParticlePool;
  private scale = 1;

  /** 每个玩家一个常驻兔子 */
  private rabbits: Map<string, ActiveRabbit> = new Map();
  /** 活跃爆发特效（用于重复触发时清理旧实例） */
  private activeBursts: Map<string, ActiveEffect> = new Map();

  constructor(
    entityContainer: PIXI.Container,
    fieldContainer: PIXI.Container,
    particlePool?: ParticlePool,
  ) {
    this.entityContainer = entityContainer;
    this.fieldContainer = fieldContainer;
    this.particlePool = particlePool;
  }

  setScale(scale: number): void {
    this.scale = scale;
    // 容器统一承担全局缩放，内部 graphics 维持各自的动画 scale
    this.rabbits.forEach((rabbit) => {
      if (rabbit.container.destroyed) return;
      rabbit.container.scale.set(scale);
    });
  }

  // ══════════════════════════════════════════════════════
  //  小兔/肌肉兔跟随（常驻）
  // ══════════════════════════════════════════════════════

  /**
   * 更新小兔状态（墨水层数 + 形态 + 位置）
   * x/y 为画布像素坐标（已由 mapX/mapY 映射）
   */
  updateRabbit(
    playerId: string,
    x: number,
    y: number,
    inkStacks: number,
    isMuscle: boolean,
    _themeColor = 0xff69b4,
    visualCfg?: DrawingManifestVisualConfig,
    palette?: Palette,
  ): void {
    const baseColor = 0x8B4D9F;
    const pal: Palette = palette ?? {
      primary: baseColor,
      glow: lighten(baseColor, 50),
      highlight: lighten(baseColor, 100),
      dim: dimColor(baseColor, 0.6),
      shadow: dimColor(baseColor, 0.3),
      accent: 0xFFB3D9,
    };
    const rabbitRadius = visualCfg?.rabbitRadius ?? 20;
    const muscleRadius = visualCfg?.muscleRadius ?? 50;

    let rabbit = this.rabbits.get(playerId);
    if (!rabbit) {
      const container = new PIXI.Container();
      container.scale.set(this.scale);
      const auraGraphics = new PIXI.Graphics();
      const bodyGraphics = new PIXI.Graphics();
      const brushGraphics = new PIXI.Graphics();
      container.addChild(auraGraphics, bodyGraphics, brushGraphics);
      this.entityContainer.addChild(container);

      rabbit = {
        container,
        auraGraphics,
        bodyGraphics,
        brushGraphics,
        particleTimer: 0,
        life: 0,
        x,
        y,
        radius: rabbitRadius,
        playerId,
        inkStacks: 0,
        isMuscle: false,
      };
      this.rabbits.set(playerId, rabbit);
    }

    rabbit.container.position.set(x, y);
    rabbit.x = x;
    rabbit.y = y;
    rabbit.inkStacks = inkStacks;
    rabbit.isMuscle = isMuscle;
    rabbit.radius = isMuscle ? muscleRadius : rabbitRadius;

    // 重绘兔子（光环 + 身体 + 画笔）
    this.drawRabbitAura(rabbit.auraGraphics, rabbit.radius, isMuscle, pal);
    this.drawRabbitBody(rabbit.bodyGraphics, rabbit.radius, isMuscle, pal);
    this.drawBrush(rabbit.brushGraphics, rabbit.inkStacks, rabbit.radius, isMuscle, pal);
  }

  /**
   * 绘制作画光环：8 层同心圆径向渐变（白→紫粉→透明），水墨晕染感
   * 以 (0,0) 为中心，半径单位为逻辑 px
   */
  private drawRabbitAura(
    g: PIXI.Graphics,
    radius: number,
    isMuscle: boolean,
    pal: Palette,
  ): void {
    g.clear();
    const auraScale = isMuscle ? 1.6 : 1.4;
    // 8 层同心圆叠加（中心白 → 紫粉 → 透明）
    for (let i = 0; i < 8; i++) {
      const t = i / 7; // 0 → 1
      const r = radius * auraScale * (0.3 + 0.7 * t);
      const color =
        t < 0.5
          ? this.interpolateColor(INK_WHITE, pal.primary, t * 2)
          : pal.primary;
      const alpha = (1 - t) * 0.2;
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }
    // 肌肉兔额外金色爆气外环
    if (isMuscle) {
      g.circle(0, 0, radius * auraScale);
      g.stroke({ color: INK_GOLD, width: 1.5, alpha: 0.6 });
    }
  }

  /**
   * 绘制兔子身体：多层水彩叠加
   * - 耳朵：2 层（外层紫粉填充 + 内层浅粉）
   * - 身体：4 层椭圆（深紫粉 → 主紫粉 → 浅紫粉 → 白色高亮）
   * - 眼睛：黑色实心 + 白色高光（肌肉兔水汪汪大眼）
   * - 鼻子：粉色小圆
   * - 肌肉兔：曲线肌肉线条（bezier，替代矩形描边）
   */
  private drawRabbitBody(
    g: PIXI.Graphics,
    radius: number,
    isMuscle: boolean,
    pal: Palette,
  ): void {
    g.clear();

    // ── 耳朵（2 层）──
    for (const side of [-1, 1]) {
      const ex = side * radius * 0.4;
      const ey = -radius * 1.05;
      const earW = radius * (isMuscle ? 0.28 : 0.22);
      const earH = radius * (isMuscle ? 0.7 : 0.55);
      // 外层紫粉填充
      g.ellipse(ex, ey, earW, earH);
      g.fill({ color: pal.primary, alpha: 0.85 });
      // 内层浅粉（小一号，描边感）
      g.ellipse(ex, ey, earW * 0.55, earH * 0.7);
      g.fill({ color: pal.accent, alpha: 0.7 });
    }

    // ── 身体：4 层椭圆叠加（水彩晕染）──
    const bodyLayers = isMuscle
      ? [
          { rx: 1.15, ry: 1.0, color: pal.shadow, alpha: 0.35 },
          { rx: 0.95, ry: 0.85, color: pal.primary, alpha: 0.55 },
          { rx: 0.7, ry: 0.62, color: pal.glow, alpha: 0.65 },
          { rx: 0.35, ry: 0.3, color: pal.highlight, alpha: 0.75 },
        ]
      : [
          { rx: 1.0, ry: 1.0, color: pal.shadow, alpha: 0.3 },
          { rx: 0.82, ry: 0.82, color: pal.primary, alpha: 0.5 },
          { rx: 0.6, ry: 0.6, color: pal.glow, alpha: 0.6 },
          { rx: 0.28, ry: 0.28, color: pal.highlight, alpha: 0.7 },
        ];
    for (const layer of bodyLayers) {
      g.ellipse(0, 0, radius * layer.rx, radius * layer.ry);
      g.fill({ color: layer.color, alpha: layer.alpha });
    }

    // ── 眼睛（黑色实心 + 白色高光）──
    const eyeOffsetX = radius * 0.32;
    const eyeY = -radius * 0.12;
    const eyeR = radius * (isMuscle ? 0.14 : 0.12);
    const pupilR = eyeR * (isMuscle ? 0.6 : 0.7);
    for (const side of [-1, 1]) {
      const ex = side * eyeOffsetX;
      // 肌肉兔：水汪汪眼睛 → 白色眼底
      if (isMuscle) {
        g.circle(ex, eyeY, eyeR * 1.3);
        g.fill({ color: INK_WHITE, alpha: 0.9 });
      }
      // 黑色瞳孔
      g.circle(ex, eyeY, pupilR);
      g.fill({ color: 0x000000, alpha: 1 });
      // 白色高光
      g.circle(ex + pupilR * 0.35, eyeY - pupilR * 0.35, pupilR * 0.35);
      g.fill({ color: INK_WHITE, alpha: 0.95 });
    }

    // ── 鼻子（粉色小圆）──
    g.circle(0, radius * 0.08, radius * 0.07);
    g.fill({ color: pal.accent, alpha: 1 });

    // ── 肌肉兔：曲线肌肉线条（bezier，替代矩形描边）──
    if (isMuscle) {
      // 上胸肌曲线
      g.moveTo(-radius * 0.55, radius * 0.22);
      g.bezierCurveTo(
        -radius * 0.2,
        radius * 0.05,
        radius * 0.2,
        radius * 0.4,
        radius * 0.55,
        radius * 0.22,
      );
      g.stroke({ color: pal.shadow, width: 1.5, alpha: 0.6 });
      // 腹肌曲线
      g.moveTo(-radius * 0.3, radius * 0.5);
      g.bezierCurveTo(
        -radius * 0.1,
        radius * 0.4,
        radius * 0.1,
        radius * 0.6,
        radius * 0.3,
        radius * 0.5,
      );
      g.stroke({ color: pal.shadow, width: 1.2, alpha: 0.5 });
    }
  }

  /**
   * 绘制画笔图标：金色笔杆 + 紫色笔毛
   * 笔长度随墨水层数增长，6 层时多层光晕（替代粗糙白点）
   */
  private drawBrush(
    g: PIXI.Graphics,
    inkStacks: number,
    radius: number,
    isMuscle: boolean,
    pal: Palette,
  ): void {
    g.clear();
    if (inkStacks <= 0 || isMuscle) return;

    const pencilLen = 8 + inkStacks * 4;
    const pencilW = 3;
    const py = -radius - pencilLen * 0.5 - 4;

    // 笔杆（金色）
    g.rect(-pencilW, py - pencilLen * 0.5, pencilW * 2, pencilLen);
    g.fill({ color: INK_GOLD, alpha: 0.9 });

    // 笔毛（紫色三角）
    g.poly([
      -pencilW,
      py + pencilLen * 0.5,
      pencilW,
      py + pencilLen * 0.5,
      0,
      py + pencilLen * 0.5 + 5,
    ]);
    g.fill({ color: pal.primary, alpha: 0.9 });

    // 笔尖发光：6 层时多层光晕（内白 → 金 → 透明），替代粗糙白点
    if (inkStacks >= 6) {
      const tipY = py + pencilLen * 0.5 + 5;
      g.circle(0, tipY, 3);
      g.fill({ color: INK_WHITE, alpha: 0.95 });
      g.circle(0, tipY, 5);
      g.fill({ color: INK_GOLD, alpha: 0.5 });
      g.circle(0, tipY, 8);
      g.fill({ color: INK_GOLD, alpha: 0.2 });
    }
  }

  /**
   * 生成墨水粒子（向外飘散 + 向下滴落）
   * 每 1.5s 由 update 调用，生成 2-3 个紫色墨水粒子
   */
  private spawnInkParticles(x: number, y: number, radius: number): void {
    if (!this.particlePool) return;
    const s = this.scale;
    const count = 2 + Math.floor(Math.random() * 2); // 2-3 个
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const startDist = radius * s * 0.4;
      const px = x + Math.cos(angle) * startDist;
      const py = y + Math.sin(angle) * startDist;
      const speed = (12 + Math.random() * 10) * s;
      this.particlePool.emit({
        x: px,
        y: py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + 15 * s, // 微向下滴落
        life: 1500,
        scaleStart: 1,
        scaleEnd: 0,
        alphaStart: 0.8,
        alphaEnd: 0,
        tint: INK_MAIN,
        radius: (2 + Math.random() * 1.5) * s,
      });
    }
  }

  /** 移除玩家兔子 */
  removeRabbit(playerId: string): void {
    const rabbit = this.rabbits.get(playerId);
    if (rabbit) {
      this.entityContainer.removeChild(rabbit.container);
      rabbit.container.destroy({ children: true });
      this.rabbits.delete(playerId);
    }
  }

  // ══════════════════════════════════════════════════════
  //  爆发：画作扩散（三阶段动画）
  // ══════════════════════════════════════════════════════

  /**
   * 触发画作扩散爆发特效（三阶段：泼墨 → 实体化 → 消散）
   * @param playerId 玩家 ID
   * @param x 画布像素坐标 X
   * @param y 画布像素坐标 Y
   * @param radius 爆发范围（逻辑 px）
   * @param durationMs 持续时间（ms），数据驱动
   * @param _themeColor 主题色（兼容签名，使用水彩画作系常量）
   */
  triggerBurst(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    durationMs: number,
    _themeColor = 0xff69b4,
    palette?: Palette,
  ): { effect: ActiveEffect | null } {
    const baseColor = 0x8B4D9F;
    const pal: Palette = palette ?? {
      primary: baseColor,
      glow: lighten(baseColor, 50),
      highlight: lighten(baseColor, 100),
      dim: dimColor(baseColor, 0.6),
      shadow: dimColor(baseColor, 0.3),
      accent: 0xFFB3D9,
    };
    // 若已存在，先销毁旧实例（避免泄漏）
    const old = this.activeBursts.get(playerId);
    if (old && !old.container.destroyed) {
      this.fieldContainer.removeChild(old.container);
      old.container.destroy({ children: true });
    }

    const container = new PIXI.Container();
    container.position.set(x, y);
    container.scale.set(this.scale);

    // 各视觉层
    const coreGraphics = new PIXI.Graphics(); // 画作核心（10 层）
    const rippleGraphics = new PIXI.Graphics(); // 水彩波纹（5 层）
    const splashGraphics = new PIXI.Graphics(); // 墨水飞溅
    const canvasGraphics = new PIXI.Graphics(); // 中心画布
    const haloGraphics = new PIXI.Graphics(); // 画笔光晕

    // 预绘制静态层
    this.drawBurstCore(coreGraphics, radius, pal);
    this.drawBurstRipples(rippleGraphics, radius, pal);
    this.drawBurstCanvas(canvasGraphics, radius);
    this.drawBurstHalo(haloGraphics, radius);

    container.addChild(
      haloGraphics,
      rippleGraphics,
      splashGraphics,
      canvasGraphics,
      coreGraphics,
    );
    this.fieldContainer.addChild(container);

    // 预计算墨水飞溅配置（8-12 个，角度均匀 + 随机扰动）
    const splashCount = 8 + Math.floor(Math.random() * 5);
    const splashConfigs: SplashConfig[] = [];
    for (let i = 0; i < splashCount; i++) {
      splashConfigs.push({
        angle: (i / splashCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.4,
        maxDist: radius * (0.6 + Math.random() * 0.5),
        size: 2 + Math.random() * 2.5,
      });
    }

    const ef: ActiveEffect = {
      type: 'drawing_manifest_burst',
      container,
      life: 0,
      maxLife: durationMs,
      onUpdate: (_ef, _dt) => {
        const t = _ef.life / _ef.maxLife;
        // 三阶段划分：泼墨 0-20%，实体化 20-40%，消散 40-100%
        const p1End = 0.2;
        const p2End = 0.4;

        if (t < p1End) {
          // ── 阶段1 泼墨：墨水从中心泼洒 ──
          const pt = t / p1End; // 0 → 1
          // 飞溅：向外飞散（距离 0 → maxDist）
          this.drawBurstSplashes(splashGraphics, splashConfigs, pt, pal);
          // 画布：浮现（alpha 0 → 1, scale 0.5 → 1）
          canvasGraphics.alpha = pt;
          canvasGraphics.scale.set(0.5 + 0.5 * easeOutCubic(pt));
          // 核心/波纹/光晕：隐藏
          coreGraphics.alpha = 0;
          rippleGraphics.alpha = 0;
          haloGraphics.alpha = 0;
        } else if (t < p2End) {
          // ── 阶段2 实体化：兔子实体从画布浮现 ──
          const pt = (t - p1End) / (p2End - p1End); // 0 → 1
          const eased = easeOutCubic(pt);
          // 核心：生长（scale 0.3 → 1.0, alpha 0 → 1）
          coreGraphics.scale.set(0.3 + 0.7 * eased);
          coreGraphics.alpha = pt;
          // 波纹：扩散（scale 0.5 → 1.2, alpha 0 → 0.8）
          rippleGraphics.scale.set(0.5 + 0.7 * eased);
          rippleGraphics.alpha = 0.8 * pt;
          // 画布：保持
          canvasGraphics.alpha = 1;
          canvasGraphics.scale.set(1);
          // 光晕：显现（alpha 0 → 0.7）
          haloGraphics.alpha = 0.7 * pt;
          // 飞溅：淡出（alpha 0.8 → 0.3）
          this.drawBurstSplashes(splashGraphics, splashConfigs, 1, pal);
          splashGraphics.alpha = 0.8 - 0.5 * pt;
        } else {
          // ── 阶段3 消散：水彩晕染消散 ──
          const pt = (t - p2End) / (1 - p2End); // 0 → 1
          // 核心：缩小 + 淡出（scale 1 → 0.8, alpha 1 → 0）
          coreGraphics.scale.set(1 - 0.2 * pt);
          coreGraphics.alpha = 1 - pt;
          // 波纹：继续扩散 + 淡出（scale 1.2 → 2.0, alpha 0.8 → 0）
          rippleGraphics.scale.set(1.2 + 0.8 * pt);
          rippleGraphics.alpha = 0.8 * (1 - pt);
          // 画布：淡出
          canvasGraphics.alpha = 1 - pt;
          // 光晕：淡出
          haloGraphics.alpha = 0.7 * (1 - pt);
          // 飞溅：消失
          splashGraphics.alpha = 0;
        }
      },
      onDecay: () => {
        this.fieldContainer.removeChild(container);
        container.destroy({ children: true });
        // 仅当仍指向本实例时才删除（避免误删新实例）
        if (this.activeBursts.get(playerId) === ef) {
          this.activeBursts.delete(playerId);
        }
      },
    };
    this.activeBursts.set(playerId, ef);
    return { effect: ef };
  }

  /**
   * 绘制画作核心：10 层同心圆（白→紫粉→金→透明），径向渐变
   */
  private drawBurstCore(g: PIXI.Graphics, radius: number, pal: Palette): void {
    g.clear();
    const coreR = radius * 0.6;
    // 10 层同心圆叠加（白 → 主紫粉 → 金 → 深紫）
    for (let i = 0; i < 10; i++) {
      const t = i / 9; // 0 → 1
      const r = coreR * (0.1 + 0.9 * t);
      // 颜色分段：白 → 主紫粉 → 金 → 深紫
      let color: number;
      if (t < 0.33) {
        color = this.interpolateColor(INK_WHITE, pal.primary, t / 0.33);
      } else if (t < 0.66) {
        color = this.interpolateColor(pal.primary, INK_GOLD, (t - 0.33) / 0.33);
      } else {
        color = this.interpolateColor(INK_GOLD, pal.dim, (t - 0.66) / 0.34);
      }
      const alpha = (1 - t) * 0.25;
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }
    // 中心白核
    g.circle(0, 0, coreR * 0.08);
    g.fill({ color: INK_WHITE, alpha: 1 });
  }

  /**
   * 绘制水彩波纹：5 层扩散圆环（不同紫色调）
   */
  private drawBurstRipples(g: PIXI.Graphics, radius: number, pal: Palette): void {
    g.clear();
    const colors = [pal.dim, pal.primary, pal.glow, pal.accent, pal.highlight];
    for (let i = 0; i < 5; i++) {
      const r = radius * (0.3 + 0.15 * i);
      g.circle(0, 0, r);
      g.stroke({ color: colors[i], width: 1.5, alpha: 0.6 - i * 0.08 });
    }
  }

  /**
   * 绘制墨水飞溅：8-12 个墨点向外飞散（按进度 t 动画）
   * @param configs 预计算的飞溅配置
   * @param t 飞溅进度 0 → 1（0=中心，1=最远）
   */
  private drawBurstSplashes(
    g: PIXI.Graphics,
    configs: SplashConfig[],
    t: number,
    pal: Palette,
  ): void {
    g.clear();
    for (const c of configs) {
      const dist = c.maxDist * t;
      const px = Math.cos(c.angle) * dist;
      const py = Math.sin(c.angle) * dist;
      // 墨点随距离缩小
      const r = c.size * (1 - t * 0.5);
      g.circle(px, py, r);
      g.fill({ color: pal.primary, alpha: 0.8 * (1 - t * 0.3) });
    }
  }

  /**
   * 绘制中心画布：白色方形（画布意象）+ 金色边框
   */
  private drawBurstCanvas(g: PIXI.Graphics, radius: number): void {
    g.clear();
    const size = radius * 0.3;
    // 白色画布
    g.rect(-size, -size, size * 2, size * 2);
    g.fill({ color: INK_WHITE, alpha: 0.8 });
    // 金色边框
    g.rect(-size, -size, size * 2, size * 2);
    g.stroke({ color: INK_GOLD, width: 2, alpha: 0.9 });
  }

  /**
   * 绘制画笔光晕：金色能量环（3 层）
   */
  private drawBurstHalo(g: PIXI.Graphics, radius: number): void {
    g.clear();
    for (let i = 0; i < 3; i++) {
      g.circle(0, 0, radius * (1.0 + i * 0.05));
      g.stroke({ color: INK_GOLD, width: 1, alpha: 0.5 - i * 0.1 });
    }
  }

  // ══════════════════════════════════════════════════════
  //  冲刺撞击特效（水彩风拖尾）
  // ══════════════════════════════════════════════════════

  /**
   * 触发冲刺特效（飞行轨迹，多层水彩拖尾 + 命中飞溅）
   * fromX/fromY, toX/toY 为画布像素坐标
   */
  triggerDash(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    isHit: boolean,
    _themeColor = 0xff69b4,
    palette?: Palette,
  ): { effect: ActiveEffect | null } {
    const baseColor = 0x8B4D9F;
    const pal: Palette = palette ?? {
      primary: baseColor,
      glow: lighten(baseColor, 50),
      highlight: lighten(baseColor, 100),
      dim: dimColor(baseColor, 0.6),
      shadow: dimColor(baseColor, 0.3),
      accent: 0xFFB3D9,
    };
    const s = this.scale;
    const g = new PIXI.Graphics();
    this.fieldContainer.addChild(g);

    const dx = toX - fromX;
    const dy = toY - fromY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const durationMs = 400;

    const ef: ActiveEffect = {
      type: 'drawing_manifest_dash',
      container: g as unknown as PIXI.Container,
      life: 0,
      maxLife: durationMs,
      onUpdate: (_ef, _dt) => {
        const t = _ef.life / _ef.maxLife;
        g.clear();
        const progress = easeOutCubic(Math.min(1, t * 1.2));
        const cx = fromX + dx * progress;
        const cy = fromY + dy * progress;

        // 拖尾：多层水彩（外层金 + 内层紫）
        const trailLen = 30 * s;
        const trailStartT = Math.max(0, progress - trailLen / dist);
        const tsx = fromX + dx * trailStartT;
        const tsy = fromY + dy * trailStartT;
        // 外层金色
        g.moveTo(tsx, tsy);
        g.lineTo(cx, cy);
        g.stroke({ color: INK_GOLD, width: 6 * s, alpha: 0.4 * (1 - t * 0.5) });
        // 内层紫色
        g.moveTo(tsx, tsy);
        g.lineTo(cx, cy);
        g.stroke({ color: pal.primary, width: 3 * s, alpha: 0.7 * (1 - t * 0.5) });

        // 肌肉兔头部：多层水彩圆
        const headR = 12 * s;
        // 外层光晕
        g.circle(cx, cy, headR * 1.5);
        g.fill({ color: pal.primary, alpha: 0.2 * (1 - t * 0.3) });
        // 主层
        g.circle(cx, cy, headR);
        g.fill({ color: pal.accent, alpha: 0.85 * (1 - t * 0.3) });
        // 高光
        g.circle(cx, cy, headR * 0.5);
        g.fill({ color: pal.highlight, alpha: 0.6 * (1 - t * 0.3) });
        // 描边
        g.circle(cx, cy, headR);
        g.stroke({ color: INK_GOLD, width: 2 * s, alpha: 0.8 });

        // 命中爆裂：水彩飞溅（多层扩散环 + 中心晕染）
        if (isHit && t > 0.8) {
          const hitT = (t - 0.8) / 0.2;
          // 扩散环
          g.circle(toX, toY, 20 * s * hitT);
          g.stroke({ color: INK_WHITE, width: 3 * s, alpha: 0.8 * (1 - hitT) });
          g.circle(toX, toY, 28 * s * hitT);
          g.stroke({ color: INK_GOLD, width: 2 * s, alpha: 0.5 * (1 - hitT) });
          // 中心水彩晕染
          g.circle(toX, toY, 15 * s * hitT);
          g.fill({ color: pal.primary, alpha: 0.3 * (1 - hitT) });
        }
      },
      onDecay: () => {
        this.fieldContainer.removeChild(g);
        g.destroy();
      },
    };
    return { effect: ef };
  }

  // ══════════════════════════════════════════════════════
  //  更新循环（兔子常驻动画）
  // ══════════════════════════════════════════════════════

  /**
   * 每帧更新（由 EffectRenderer 调用，dt 单位 ms）
   * 驱动：身体呼吸 + 光环脉动 + 画笔摆动 + 墨水粒子生成
   */
  update(dt: number): void {
    this.rabbits.forEach((rabbit) => {
      if (rabbit.container.destroyed) return;
      rabbit.life += dt;
      // 身体呼吸 scale 1.0 ↔ 1.03（2s 周期）
      const breath = 1 + 0.03 * Math.sin(rabbit.life * 0.001 * Math.PI);
      rabbit.bodyGraphics.scale.set(breath);
      // 光环脉动 alpha 0.7 ↔ 1.0
      const pulse = 0.85 + 0.15 * Math.sin(rabbit.life * 0.001 * Math.PI);
      rabbit.auraGraphics.alpha = pulse;
      // 画笔微旋转摆动
      const wobble = Math.sin(rabbit.life * 0.002 * Math.PI) * 0.08;
      rabbit.brushGraphics.rotation = wobble;
      // 墨水粒子：每 1.5s 生成 2-3 个
      rabbit.particleTimer += dt;
      if (rabbit.particleTimer > 1500) {
        rabbit.particleTimer = 0;
        this.spawnInkParticles(rabbit.x, rabbit.y, rabbit.radius);
      }
    });
  }

  // ══════════════════════════════════════════════════════
  //  清理
  // ══════════════════════════════════════════════════════

  clear(): void {
    this.rabbits.forEach((_, playerId) => this.removeRabbit(playerId));
    this.activeBursts.forEach((ef) => {
      if (!ef.container.destroyed) {
        this.fieldContainer.removeChild(ef.container);
        ef.container.destroy({ children: true });
      }
    });
    this.activeBursts.clear();
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
}
