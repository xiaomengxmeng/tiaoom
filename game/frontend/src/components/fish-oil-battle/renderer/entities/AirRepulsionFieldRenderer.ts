/**
 * 空气斥力场 (Air Repulsion Field) - 开摆
 * 前端视觉渲染器
 *
 * 视觉设计（懒散但强大 —— 平时慵懒无力，爆发时突然爆发，强反差）：
 * - 锚点 Anchor：斥力场光环（8 层径向渐变 白→懒散黄→透明）+ 双层锚点环（金橙外环+白内环）
 *               + 品字三角箭头（缓慢旋转）+ 中心光点（白实心+懒散黄外晕）+ 懒散粒子（每 2s 飘散）
 * - 爆发 Burst：三阶段动画
 *   · 蓄力（0-15%T）：光环收缩，能量汇聚至中心核
 *   · 爆发（15%-30%T）：5 层扩散圆环（白→金→橙→黄→透明）+ 中心爆发核 + 能量碎片飞散 + 扬尘粒子
 *   · 余波（30%-100%T）：多层波纹继续扩散并消散
 *
 * API 兼容：triggerAnchor / triggerBurst 返回 ActiveEffect，由 EffectRenderer.update(dt) 统一驱动 onUpdate(ef, dt)。
 * 所有动画由 dt 驱动，不使用 rAF / setTimeout。
 */

import * as PIXI from 'pixi.js';
import { ParticlePool } from '../systems/ParticlePool';
import { easeOutCubic, lighten, dimColor, type ActiveEffect } from './VisualEffectUtils';
import type { Palette } from './BaseWeaponEffectRenderer';

// ══════════════════════════════════════════════════════
//  颜色常量（懒散黄 → 爆发橙）
// ══════════════════════════════════════════════════════

const AIR_LAZY = 0xffee88; // 懒散浅黄
const AIR_MAIN = 0xffcc44; // 主黄色
const AIR_DEEP = 0xcc8800; // 深黄褐
const AIR_BURST = 0xff6622; // 爆发橙红
const AIR_HIGHLIGHT = 0xffaa00; // 高亮金橙
const AIR_WHITE = 0xffffff; // 白色

/** 爆发冲击波 5 层圆环配色（白→金→橙→黄→懒散黄） */
const BURST_RING_COLORS = [
  AIR_WHITE,
  AIR_HIGHLIGHT,
  AIR_BURST,
  AIR_MAIN,
  AIR_LAZY,
];

/** 余波波纹 4 层配色 */
const AFTERMATH_RING_COLORS = [
  AIR_WHITE,
  AIR_HIGHLIGHT,
  AIR_BURST,
  AIR_MAIN,
];

export class AirRepulsionFieldRenderer {
  /** 挂载容器（field 层） */
  private container: PIXI.Container;
  /** 粒子池（可选，由 EffectRenderer 注入；未注入时不生成粒子） */
  private particlePool?: ParticlePool;
  /** 当前全局缩放因子 */
  private scale = 1;
  /** 活跃特效容器集合（用于 setScale 同步与 clear 批量清理） */
  private activeContainers: Set<PIXI.Container> = new Set();
  /**
   * 活跃锚点映射：anchorId → { container, effect }
   * 用于按 anchorId 去重，避免后端周期同步事件（每 5 tick）导致重复创建锚点堆叠
   */
  private anchorEffects: Map<string, { container: PIXI.Container; effect: ActiveEffect }> = new Map();
  /**
   * 气罩映射：playerId → { container, graphics }
   * 用于按 playerId 去重 + 跟随玩家位置更新（每 5 tick 同步一次）
   */
  private shields: Map<string, { container: PIXI.Container; graphics: PIXI.Graphics }> = new Map();

  constructor(container: PIXI.Container, particlePool?: ParticlePool) {
    this.container = container;
    this.particlePool = particlePool;
  }

  /** 同步缩放：容器统一承担全局缩放，内部 graphics 维持各自的动画 scale */
  setScale(scale: number): void {
    this.scale = scale;
    this.activeContainers.forEach((c) => {
      if (!c.destroyed) c.scale.set(scale);
    });
  }

  // ══════════════════════════════════════════════════════
  //  斥力场锚点（懒散常驻）
  // ══════════════════════════════════════════════════════

  /**
   * 触发斥力场锚点
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param anchorId 锚点 ID（用于追踪）
   * @param themeColor 主题色（保留参数兼容；视觉以"开摆"固定色板为准）
   * @param maxLifeMs 生命周期（ms）
   * @param radius 锚点半径（逻辑 px）
   */
  triggerAnchor(
    x: number,
    y: number,
    anchorId: string,
    themeColor?: number,
    maxLifeMs = 5000,
    radius = 55,
    palette?: Palette,
  ): { effect: ActiveEffect | null; anchorId: string } {
    // 修复：按 anchorId 去重，已存在则更新位置并重置生命周期，不重建（避免堆叠约 20 个重复锚点）
    const existing = this.anchorEffects.get(anchorId);
    if (existing) {
      existing.container.position.set(x, y);
      existing.effect.life = 0;
      existing.effect.maxLife = maxLifeMs;
      return { effect: null, anchorId };
    }

    const baseColor = themeColor ?? 0xFFCC44;
    const pal: Palette = palette ?? {
      primary: baseColor,
      glow: lighten(baseColor, 50),
      highlight: lighten(baseColor, 100),
      dim: dimColor(baseColor, 0.6),
      shadow: dimColor(baseColor, 0.3),
      accent: 0xFF6622,
    };

    const container = new PIXI.Container();
    container.position.set(x, y);
    container.scale.set(this.scale);
    container.visible = true;

    // 主体 graphics：光环 + 双层环 + 中心光点（一次绘制，靠 transform 驱动呼吸/生长）
    const bodyGraphics = new PIXI.Graphics();
    this.drawAnchorBody(bodyGraphics, radius, pal);
    container.addChild(bodyGraphics);

    // 箭头 graphics：品字三角（独立旋转）
    const arrowGraphics = new PIXI.Graphics();
    this.drawAnchorArrows(arrowGraphics, radius * 0.6, pal);
    container.addChild(arrowGraphics);

    this.container.addChild(container);
    this.activeContainers.add(container);

    let rotationAngle = 0;
    let particleTimer = 0;

    const ef: ActiveEffect = {
      type: 'air_repulsion_anchor',
      container,
      life: 0,
      maxLife: maxLifeMs,
      onUpdate: (efx, dt) => {
        const life = efx.life;
        const t = life / efx.maxLife;
        // 生长动画：0-400ms 从 0.2 → 1（easeOutCubic）
        const growT = Math.min(1, life / 400);
        const grow = 0.2 + 0.8 * easeOutCubic(growT);
        // 整体随生命缓慢淡出（懒散消散）
        const fade = 1 - t * 0.3;
        // 呼吸：2s 周期，幅度 5%
        const breath = 1 + 0.05 * Math.sin(life * 0.001 * Math.PI);
        // 透明度脉动：2s 周期，幅度 10%
        const pulse = 0.9 + 0.1 * Math.sin(life * 0.001 * Math.PI);

        bodyGraphics.scale.set(grow * breath);
        bodyGraphics.alpha = Math.max(0, fade * pulse);

        // 品字箭头缓慢旋转（约 0.5rad/s，慵懒）
        rotationAngle += dt / 2000;
        arrowGraphics.rotation = rotationAngle;
        arrowGraphics.scale.set(grow);
        arrowGraphics.alpha = Math.max(0, fade);

        // 懒散粒子：每 2s 飘散 1-2 个
        if (this.particlePool) {
          particleTimer += dt;
          if (particleTimer > 2000) {
            particleTimer = 0;
            this.spawnLazyParticles(x, y, radius, pal);
          }
        }
      },
      onDecay: () => {
        this.removeContainer(container);
      },
    };

    // 记录到 anchorEffects 以便后续去重
    this.anchorEffects.set(anchorId, { container, effect: ef });

    return { effect: ef, anchorId };
  }

  /**
   * 绘制锚点主体：斥力场光环（8 层径向渐变）+ 双层锚点环 + 中心光点
   * 以 (0,0) 为中心，按完整半径 radius 一次绘制，呼吸/生长由外部 scale 驱动
   */
  private drawAnchorBody(g: PIXI.Graphics, radius: number, pal: Palette): void {
    g.clear();

    // 斥力场光环：8 层同心圆叠加模拟径向渐变（中心白 → 懒散黄 → 透明）
    for (let i = 0; i < 8; i++) {
      const lt = i / 7; // 0 → 1
      const r = radius * (0.15 + 0.85 * lt);
      const color =
        lt < 0.5
          ? this.interpolateColor(AIR_WHITE, pal.glow, lt * 2)
          : pal.glow;
      const alpha = (1 - lt) * 0.2;
      g.circle(0, 0, Math.max(0.5, r));
      g.fill({ color, alpha });
    }

    // 双层锚点环：外环高亮色 + 内环白
    g.circle(0, 0, radius);
    g.stroke({ color: pal.highlight, width: 1, alpha: 0.7 });
    g.circle(0, 0, radius * 0.95);
    g.stroke({ color: AIR_WHITE, width: 0.4, alpha: 0.5 });

    // 中心光点：发光色外晕 r=6 + 白色实心 r=4
    g.circle(0, 0, 6);
    g.fill({ color: pal.glow, alpha: 0.5 });
    g.circle(0, 0, 4);
    g.fill({ color: AIR_WHITE, alpha: 0.9 });
  }

  /**
   * 绘制品字三角箭头：3 个三角形（120° 均分，尖端向外），带渐变填充（主色填充 + 高亮色描边）
   * 以 (0,0) 为中心，按 orbitR 一次绘制，旋转由外部 rotation 驱动
   */
  private drawAnchorArrows(g: PIXI.Graphics, orbitR: number, pal: Palette): void {
    g.clear();
    const triSize = 5; // 三角形尺寸
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3; // 基础角度
      const cx = Math.cos(a) * orbitR;
      const cy = Math.sin(a) * orbitR;
      // 尖端（朝外）
      const tipX = Math.cos(a) * (orbitR + triSize);
      const tipY = Math.sin(a) * (orbitR + triSize);
      // 底边两点（垂直于径向方向）
      const b1a = a + Math.PI / 2;
      const b2a = a - Math.PI / 2;
      const halfBase = triSize * 0.6;
      const b1x = cx + Math.cos(b1a) * halfBase;
      const b1y = cy + Math.sin(b1a) * halfBase;
      const b2x = cx + Math.cos(b2a) * halfBase;
      const b2y = cy + Math.sin(b2a) * halfBase;
      g.moveTo(tipX, tipY);
      g.lineTo(b1x, b1y);
      g.lineTo(b2x, b2y);
      g.closePath();
      // 渐变填充近似：主色填充 + 高亮色描边
      g.fill({ color: pal.primary, alpha: 0.85 });
      g.stroke({ color: pal.highlight, width: 0.6, alpha: 0.7 });
    }
  }

  // ══════════════════════════════════════════════════════
  //  爆发：扩散波纹（三阶段动画）
  // ══════════════════════════════════════════════════════

  /**
   * 触发爆发视觉效果
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param radius 爆发范围（逻辑 px）
   * @param themeColor 主题色（保留参数兼容）
   * @param durationMs 持续时间（ms）
   */
  triggerBurst(
    x: number,
    y: number,
    radius = 180,
    themeColor?: number,
    durationMs = 4000,
    palette?: Palette,
  ): { effect: ActiveEffect | null } {
    const baseColor = themeColor ?? 0xFFCC44;
    const pal: Palette = palette ?? {
      primary: baseColor,
      glow: lighten(baseColor, 50),
      highlight: lighten(baseColor, 100),
      dim: dimColor(baseColor, 0.6),
      shadow: dimColor(baseColor, 0.3),
      accent: 0xFF6622,
    };

    const container = new PIXI.Container();
    container.position.set(x, y);
    container.scale.set(this.scale);
    container.visible = true;

    // 冲击波圆环（每帧重绘以驱动扩散）
    const shockwaveGraphics = new PIXI.Graphics();
    // 能量碎片（每帧重绘以驱动飞散）
    const fragmentGraphics = new PIXI.Graphics();
    // 中心爆发核（每帧重绘以驱动闪光）
    const coreGraphics = new PIXI.Graphics();
    container.addChild(shockwaveGraphics, fragmentGraphics, coreGraphics);

    this.container.addChild(container);
    this.activeContainers.add(container);

    // 基于色板构建圆环配色（白 → 高亮 → 强调 → 主色 → 发光）
    const burstRingColors = [AIR_WHITE, pal.highlight, pal.accent, pal.primary, pal.glow];
    const aftermathRingColors = [AIR_WHITE, pal.highlight, pal.accent, pal.primary];

    const T = durationMs;

    // 预生成 7 个能量碎片方向（带随机扰动）
    const fragCount = 7;
    const fragments: { angle: number; speedMul: number }[] = [];
    for (let i = 0; i < fragCount; i++) {
      const a = (i / fragCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      fragments.push({ angle: a, speedMul: 0.8 + Math.random() * 0.4 });
    }

    let dustEmitted = false;

    const ef: ActiveEffect = {
      type: 'air_repulsion_burst',
      container,
      life: 0,
      maxLife: durationMs,
      onUpdate: (efx, _dt) => {
        const life = efx.life;
        const phase1End = T * 0.15; // 蓄力 0-15%T
        const phase2End = T * 0.3; // 爆发 15%-30%T，余波 30%-100%T

        shockwaveGraphics.clear();
        fragmentGraphics.clear();
        coreGraphics.clear();

        if (life < phase1End) {
          // ── 阶段1 蓄力：光环收缩，能量汇聚至中心核 ──
          const t = life / phase1End; // 0 → 1
          const shrink = 1 - 0.7 * t; // 1 → 0.3 收缩
          // 收缩光环（6 层，向心汇聚；中心白 → 主色 → 暗色，能量压缩转暗）
          for (let i = 0; i < 6; i++) {
            const lt = i / 5;
            const lr = radius * 0.3 * (0.3 + 0.7 * lt) * shrink;
            const color =
              lt < 0.5
                ? this.interpolateColor(AIR_WHITE, pal.primary, lt * 2)
                : this.interpolateColor(pal.primary, pal.dim, (lt - 0.5) * 2);
            const alpha = (1 - lt) * 0.3 * (1 - t * 0.5);
            shockwaveGraphics.circle(0, 0, Math.max(0.5, lr));
            shockwaveGraphics.fill({ color, alpha: Math.max(0, alpha) });
          }
          // 中心核汇聚显现
          coreGraphics.alpha = t; // 0 → 1
          coreGraphics.circle(0, 0, Math.max(0.5, 14 * t));
          coreGraphics.stroke({ color: pal.accent, width: 1.5, alpha: 0.8 });
          coreGraphics.circle(0, 0, Math.max(0.5, 8 * t));
          coreGraphics.fill({ color: AIR_WHITE, alpha: 0.9 });
          // 碎片尚未发射
          fragmentGraphics.alpha = 0;
        } else if (life < phase2End) {
          // ── 阶段2 爆发：强冲击波扩散（easeOutCubic）+ 能量碎片飞散 + 扬尘粒子 ──
          const t = (life - phase1End) / (phase2End - phase1End); // 0 → 1
          const eased = easeOutCubic(t);

          // 5 层扩散圆环（白→高亮→强调→主色→发光），层叠扩散
          for (let i = 0; i < burstRingColors.length; i++) {
            const lr = radius * eased * (1 - i * 0.08);
            const alpha = (0.9 - i * 0.15) * (1 - t * 0.2);
            shockwaveGraphics.circle(0, 0, Math.max(0.5, lr));
            shockwaveGraphics.stroke({
              color: burstRingColors[i],
              width: Math.max(0.5, 3 - i * 0.4),
              alpha: Math.max(0, alpha),
            });
          }

          // 中心爆发核：白高亮 + 强调色辉光（爆发瞬间最亮，随后微降）
          const coreFlash = 1 - t * 0.3;
          coreGraphics.alpha = 1;
          coreGraphics.circle(0, 0, 16);
          coreGraphics.fill({ color: pal.accent, alpha: 0.5 * coreFlash });
          coreGraphics.circle(0, 0, 10);
          coreGraphics.fill({ color: AIR_WHITE, alpha: 0.95 * coreFlash });

          // 能量碎片向外飞散
          fragmentGraphics.alpha = t; // 0 → 1 渐显
          for (const f of fragments) {
            const dist = radius * eased * f.speedMul;
            const fx = Math.cos(f.angle) * dist;
            const fy = Math.sin(f.angle) * dist;
            this.drawTriangle(
              fragmentGraphics,
              fx,
              fy,
              f.angle,
              5,
              pal.accent,
              0.9 * (1 - t * 0.2),
            );
          }

          // 扬尘粒子：爆发瞬间大量向外飞溅（仅阶段 2 前半段发射一次）
          if (this.particlePool && !dustEmitted && t > 0.05) {
            dustEmitted = true;
            this.spawnDustParticles(x, y, radius, pal);
          }
        } else {
          // ── 阶段3 余波：多层波纹继续扩散并消散 ──
          const t = (life - phase2End) / (T - phase2End); // 0 → 1

          // 4 层波纹循环扩散并淡出
          for (let i = 0; i < aftermathRingColors.length; i++) {
            const phase = (t + i * 0.2) % 1;
            const lr = radius * (0.5 + 0.5 * phase);
            const alpha = 0.45 * (1 - phase) * (1 - t * 0.6);
            shockwaveGraphics.circle(0, 0, Math.max(0.5, lr));
            shockwaveGraphics.stroke({
              color: aftermathRingColors[i],
              width: Math.max(0.5, 2.5 - i * 0.3),
              alpha: Math.max(0, alpha),
            });
          }

          // 中心核消散
          coreGraphics.alpha = Math.max(0, 1 - t * 0.7);
          coreGraphics.circle(0, 0, Math.max(0.5, 16 * (1 - t * 0.5)));
          coreGraphics.fill({ color: pal.accent, alpha: 0.3 * (1 - t) });

          // 碎片飞远并消散
          fragmentGraphics.alpha = Math.max(0, 1 - t);
          for (const f of fragments) {
            const dist = radius * (1 + t * 0.5) * f.speedMul;
            const fx = Math.cos(f.angle) * dist;
            const fy = Math.sin(f.angle) * dist;
            this.drawTriangle(
              fragmentGraphics,
              fx,
              fy,
              f.angle,
              Math.max(0.5, 5 * (1 - t * 0.5)),
              pal.accent,
              0.6 * (1 - t),
            );
          }
        }
      },
      onDecay: () => {
        this.removeContainer(container);
      },
    };

    return { effect: ef };
  }

  // ══════════════════════════════════════════════════════
  //  气罩（被动 B：自身周围持续气罩）
  // ══════════════════════════════════════════════════════

  /**
   * 更新气罩视觉（持续跟随玩家位置，按 playerId 去重）
   * @param playerId 玩家 ID（作为 shield key 去重）
   * @param x 玩家逻辑坐标 X
   * @param y 玩家逻辑坐标 Y
   * @param radius 气罩半径（逻辑 px，默认 35）
   * @param themeColor 主题色（保留参数兼容）
   * @param palette 调色板
   */
  updateShield(
    playerId: string,
    x: number,
    y: number,
    radius = 35,
    themeColor?: number,
    palette?: Palette,
  ): void {
    const baseColor = themeColor ?? 0xFFCC44;
    const pal: Palette = palette ?? {
      primary: baseColor,
      glow: lighten(baseColor, 50),
      highlight: lighten(baseColor, 100),
      dim: dimColor(baseColor, 0.6),
      shadow: dimColor(baseColor, 0.3),
      accent: 0xFF6622,
    };

    let entry = this.shields.get(playerId);
    if (!entry) {
      // 首次创建：容器 + graphics
      const container = new PIXI.Container();
      container.scale.set(this.scale);
      const graphics = new PIXI.Graphics();
      container.addChild(graphics);
      this.container.addChild(container);
      this.activeContainers.add(container);
      entry = { container, graphics };
      this.shields.set(playerId, entry);
    }

    // 跟随玩家位置 + 重绘（基于当前半径，便于后续半径变化）
    entry.container.position.set(x, y);
    this.drawShield(entry.graphics, radius, pal);
  }

  /**
   * 绘制气罩视觉：双层气罩环（外环虚线 + 内环实线）+ 6 个气流点 + 中心光晕
   */
  private drawShield(g: PIXI.Graphics, radius: number, pal: Palette): void {
    g.clear();
    // 外圈：虚线气罩边界（懒散黄）
    g.circle(0, 0, radius);
    g.stroke({ color: pal.primary, width: 1, alpha: 0.5, dash: [4, 3] });
    // 内圈：实线呼吸（发光色）
    g.circle(0, 0, radius * 0.9);
    g.stroke({ color: pal.glow, width: 0.6, alpha: 0.4 });
    // 中心光晕（懒散淡）
    g.circle(0, 0, radius * 0.3);
    g.fill({ color: pal.glow, alpha: 0.15 });
    // 6 个气流点环绕（高亮色）
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const px = Math.cos(a) * radius * 0.95;
      const py = Math.sin(a) * radius * 0.95;
      g.circle(px, py, 1.5);
      g.fill({ color: pal.highlight, alpha: 0.7 });
    }
  }

  /**
   * 移除玩家气罩
   */
  removeShield(playerId: string): void {
    const entry = this.shields.get(playerId);
    if (!entry) return;
    this.removeContainer(entry.container);
    this.shields.delete(playerId);
  }

  // ══════════════════════════════════════════════════════
  //  粒子发射
  // ══════════════════════════════════════════════════════

  /**
   * 懒散粒子：每 2s 由锚点 emit 1-2 个发光色粒子，缓慢向外飘散
   * 坐标使用世界坐标（与 particlePool 容器同坐标系），尺寸/速度乘以全局 scale
   */
  private spawnLazyParticles(x: number, y: number, radius: number, pal: Palette): void {
    if (!this.particlePool) return;
    const s = this.scale;
    const count = 1 + (Math.random() < 0.5 ? 1 : 0); // 1-2 个
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const startDist = radius * s * (0.2 + Math.random() * 0.3);
      const px = x + Math.cos(angle) * startDist;
      const py = y + Math.sin(angle) * startDist;
      // 缓慢飘散速度（懒散）
      const speed = (8 + Math.random() * 10) * s;
      this.particlePool.emit({
        x: px,
        y: py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 2500,
        scaleStart: 1,
        scaleEnd: 0,
        alphaStart: 0.7,
        alphaEnd: 0,
        tint: pal.glow,
        radius: (1.5 + Math.random()) * s,
      });
    }
  }

  /**
   * 扬尘粒子：爆发瞬间大量粒子向外飞溅
   * 多色（发光/主色/高亮/强调），高速短寿命
   */
  private spawnDustParticles(x: number, y: number, radius: number, pal: Palette): void {
    if (!this.particlePool) return;
    const s = this.scale;
    const dustColors = [pal.glow, pal.primary, pal.highlight, pal.accent];
    const count = 16; // 大量飞溅
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const startDist = radius * s * 0.1;
      const px = x + Math.cos(angle) * startDist;
      const py = y + Math.sin(angle) * startDist;
      const speed = (80 + Math.random() * 60) * s;
      const color = dustColors[Math.floor(Math.random() * dustColors.length)];
      this.particlePool.emit({
        x: px,
        y: py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 800 + Math.random() * 400,
        scaleStart: 1.2,
        scaleEnd: 0,
        alphaStart: 0.9,
        alphaEnd: 0,
        tint: color,
        radius: (2 + Math.random() * 2) * s,
      });
    }
  }

  // ══════════════════════════════════════════════════════
  //  绘图辅助
  // ══════════════════════════════════════════════════════

  /**
   * 绘制三角形（用于能量碎片）：以 (x,y) 为底边中点，尖端朝 angle 方向
   */
  private drawTriangle(
    g: PIXI.Graphics,
    x: number,
    y: number,
    angle: number,
    size: number,
    color: number,
    alpha: number,
  ): void {
    const tipX = x + Math.cos(angle) * size;
    const tipY = y + Math.sin(angle) * size;
    const b1a = angle + Math.PI / 2;
    const b2a = angle - Math.PI / 2;
    const halfBase = size * 0.6;
    g.moveTo(tipX, tipY);
    g.lineTo(x + Math.cos(b1a) * halfBase, y + Math.sin(b1a) * halfBase);
    g.lineTo(x + Math.cos(b2a) * halfBase, y + Math.sin(b2a) * halfBase);
    g.closePath();
    g.fill({ color, alpha: Math.max(0, alpha) });
  }

  // ══════════════════════════════════════════════════════
  //  移除与清理
  // ══════════════════════════════════════════════════════

  /** 移除并销毁单个特效容器 */
  private removeContainer(c: PIXI.Container): void {
    if (!c.destroyed) {
      this.container.removeChild(c);
      c.destroy({ children: true });
    }
    this.activeContainers.delete(c);
    // 同步清理 anchorEffects 映射（按容器引用反查 anchorId）
    for (const [aid, entry] of this.anchorEffects) {
      if (entry.container === c) {
        this.anchorEffects.delete(aid);
        break;
      }
    }
    // 同步清理 shields 映射（按容器引用反查 playerId）
    for (const [pid, entry] of this.shields) {
      if (entry.container === c) {
        this.shields.delete(pid);
        break;
      }
    }
  }

  /** 清除所有特效（不销毁渲染器） */
  clear(): void {
    this.activeContainers.forEach((c) => this.removeContainer(c));
    // 显式清空映射，避免 removeContainer 仅 break 第一个匹配后残留
    this.anchorEffects.clear();
    this.shields.clear();
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
