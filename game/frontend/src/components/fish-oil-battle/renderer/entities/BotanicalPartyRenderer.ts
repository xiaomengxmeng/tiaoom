/**
 * 植物伙伴派对 (Botanical Party) - 沐里
 * 前端视觉渲染器
 *
 * 视觉设计（植物伙伴系 + 性格系统 + 派对爆发）：
 * - 植物生成 Plant：光晕（6 层径向渐变）+ 主体（4 层叠加）+ 叶子（2-4 片）+ 性格装饰 + 表情 + 性格光环
 *   · 温柔型 🌸：粉色花瓣（5 瓣）+ 微笑 + 粉色护盾环
 *   · 暴躁型 🌿：红色尖刺（6-8 根）+ 皱眉 + 红色伤害环
 *   · 好奇型 🌼：青色微风粒子 + 眨眼 + 青色减速环
 * - 爆发 Burst：派对核心（10 层渐变）+ 兴奋光环（金色多层）+ 咖啡香气粒子（三阶段动画）
 *
 * 人设彩蛋：植物有表情、10% 概率对话气泡、枯萎时飘咖啡香气粒子
 */

import * as PIXI from 'pixi.js';
import { ParticlePool } from '../systems/ParticlePool';
import type { Palette } from './BaseWeaponEffectRenderer';
import { lighten, dimColor } from './VisualEffectUtils';

// ══════════════════════════════════════════════════════
//  颜色常量（植物伙伴系）
// ══════════════════════════════════════════════════════

const PLANT_DEEP = 0x1A3A0A; // 深绿黑
const PLANT_MAIN = 0x44AA22; // 主草绿
const PLANT_LIGHT = 0x88DD44; // 浅嫩绿
const PLANT_HIGHLIGHT = 0xBBFF88; // 高亮浅绿
const PLANT_WHITE = 0xFFFFFF; // 白色

// 性格色
const PERSONALITY_GENTLE = 0xFFB3D9; // 温柔粉（花朵）
const PERSONALITY_FIERCE = 0xFF4422; // 暴躁红（尖刺）
const PERSONALITY_CURIOUS = 0x66DDFF; // 好奇青（微风）

// 咖啡香气
const COFFEE_BROWN = 0x8B5A2B; // 咖啡棕
const COFFEE_LIGHT = 0xC4956C; // 浅咖啡

// 爆发金色光环
const BURST_GOLD = 0xFFD700;

// ══════════════════════════════════════════════════════
//  数据结构
// ══════════════════════════════════════════════════════

type PlantPersonality = 'gentle' | 'fierce' | 'curious';

/** 活跃植物实例 */
interface ActivePlant {
  container: PIXI.Container;
  haloGraphics: PIXI.Graphics; // 6 层光晕（白→主绿→透明）
  bodyGraphics: PIXI.Graphics; // 主体（4 层叠加）+ 叶子
  decorGraphics: PIXI.Graphics; // 性格装饰（花瓣/尖刺）
  exprGraphics: PIXI.Graphics; // 表情（微笑/皱眉/眨眼）
  ringGraphics: PIXI.Graphics; // 性格光环（护盾/伤害/减速）
  chatText?: PIXI.Text; // 对话气泡彩蛋
  chatLife?: number; // 气泡剩余生命 ms
  particleTimer: number; // 微风/呼吸粒子节流
  life: number; // ms 累计
  maxLife: number;
  x: number;
  y: number;
  radius: number;
  personality: PlantPersonality;
  /** 阶段：birth(出生) / idle(呼吸) / decay(枯萎) */
  phase: 'birth' | 'idle' | 'decay';
  phaseT: number; // 当前阶段累计 ms
}

/** 活跃爆发特效（三阶段动画） */
interface ActiveBurst {
  container: PIXI.Container;
  coreGraphics: PIXI.Graphics; // 派对核心（10 层渐变）
  auraGraphics: PIXI.Graphics; // 兴奋光环（金色多层）
  life: number;
  maxLife: number;
  radius: number;
  plantCount: number;
  themeColor: number;
}

/** 对话气泡文案池 */
const CHAT_LINES = [
  '你好呀~',
  '今天天气真好！',
  '一起玩吧！',
  '好开心~',
  '我是植物！',
  '阳光好暖~',
];

// ══════════════════════════════════════════════════════

export class BotanicalPartyRenderer {
  private fieldContainer: PIXI.Container;
  private particlePool: ParticlePool;
  private scale = 1;

  // 活跃实例池
  private activePlants: Map<string, ActivePlant> = new Map();
  private activeBursts: Map<string, ActiveBurst> = new Map();

  /** 爆发激活标记：所有植物进入兴奋状态（体型 1.5 倍 + 发光） */
  private burstActive = false;

  constructor(fieldContainer: PIXI.Container, particlePool: ParticlePool) {
    this.fieldContainer = fieldContainer;
    this.particlePool = particlePool;
  }

  setScale(scale: number): void {
    this.scale = scale;
    // 容器统一承担全局缩放，内部 graphics 维持各自的动画 scale
    this.activePlants.forEach((plant) => {
      if (plant.container.destroyed) return;
      plant.container.scale.set(scale);
    });
    this.activeBursts.forEach((burst) => {
      if (burst.container.destroyed) return;
      burst.container.scale.set(scale);
    });
  }

  // ══════════════════════════════════════════════════════
  //  植物生成 / 枯萎 / 移除
  // ══════════════════════════════════════════════════════

  /**
   * 触发植物生成视觉效果
   * @param plantId 植物 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param personality 性格（gentle/fierce/curious）
   * @param radius 植物影响半径（逻辑 px）
   * @param themeColor 主题色（可选，默认主草绿）
   */
  triggerPlantSpawn(
    plantId: string,
    x: number,
    y: number,
    personality: PlantPersonality,
    radius: number,
    themeColor = PLANT_MAIN,
    palette?: Palette,
  ): void {
    const pal: Palette = palette ?? {
      primary: themeColor,
      glow: lighten(themeColor, 50),
      highlight: lighten(themeColor, 100),
      dim: dimColor(themeColor, 0.6),
      shadow: dimColor(themeColor, 0.3),
      accent: 0xFFB3D9,
    };

    // 已存在则先销毁旧实例（避免泄漏）
    const old = this.activePlants.get(plantId);
    if (old) {
      this.fieldContainer.removeChild(old.container);
      old.container.destroy({ children: true });
    }

    const container = new PIXI.Container();
    container.position.set(x, y);
    container.scale.set(this.scale); // 全局缩放由容器承担

    // 1. 植物光晕（6 层径向渐变：白→主绿→透明）
    const haloGraphics = new PIXI.Graphics();
    this.drawPlantHalo(haloGraphics, radius, pal);
    container.addChild(haloGraphics);

    // 2. 植物主体（4 层叠加）+ 叶子
    const bodyGraphics = new PIXI.Graphics();
    this.drawPlantBody(bodyGraphics, radius, pal);
    this.drawLeaves(bodyGraphics, radius, pal);
    container.addChild(bodyGraphics);

    // 3. 性格装饰（花瓣/尖刺）
    const decorGraphics = new PIXI.Graphics();
    this.drawPersonalityDecor(decorGraphics, radius, personality);
    container.addChild(decorGraphics);

    // 4. 表情（微笑/皱眉/眨眼）
    const exprGraphics = new PIXI.Graphics();
    this.drawExpression(exprGraphics, radius, personality);
    container.addChild(exprGraphics);

    // 5. 性格光环（护盾/伤害/减速）
    const ringGraphics = new PIXI.Graphics();
    this.drawPersonalityRing(ringGraphics, radius, personality);
    container.addChild(ringGraphics);

    // 6. 对话气泡彩蛋（10% 概率）
    let chatText: PIXI.Text | undefined;
    let chatLife: number | undefined;
    if (Math.random() < 0.1) {
      const line = CHAT_LINES[Math.floor(Math.random() * CHAT_LINES.length)];
      chatText = new PIXI.Text({
        text: line,
        style: {
          fontFamily: 'Arial',
          fontSize: 11,
          fill: 0xffffff,
          stroke: { color: PLANT_DEEP, width: 2 },
          align: 'center',
        },
      });
      chatText.anchor.set(0.5);
      chatText.position.set(0, -radius * 0.9);
      chatText.alpha = 0;
      container.addChild(chatText);
      chatLife = 1500; // 1.5s 后淡出
    }

    this.fieldContainer.addChild(container);

    const plant: ActivePlant = {
      container,
      haloGraphics,
      bodyGraphics,
      decorGraphics,
      exprGraphics,
      ringGraphics,
      chatText,
      chatLife,
      particleTimer: 0,
      life: 0,
      maxLife: 6000, // 6 秒持续
      x,
      y,
      radius,
      personality,
      phase: 'birth',
      phaseT: 0,
    };
    this.activePlants.set(plantId, plant);

    // 爆发期生成的植物直接以兴奋状态出现
    if (this.burstActive) {
      plant.container.scale.set(this.scale * 1.5);
    }
  }

  /** 触发单株植物枯萎（飘出咖啡香气粒子） */
  triggerPlantDecay(plantId: string): void {
    const plant = this.activePlants.get(plantId);
    if (plant && plant.phase !== 'decay') {
      plant.phase = 'decay';
      plant.phaseT = 0;
      // 飘出咖啡香气粒子
      this.spawnCoffeeParticles(plant.x, plant.y, plant.radius, 6);
    }
  }

  /** 移除单株植物 */
  removePlant(plantId: string): void {
    const plant = this.activePlants.get(plantId);
    if (plant) {
      this.fieldContainer.removeChild(plant.container);
      plant.container.destroy({ children: true });
      this.activePlants.delete(plantId);
    }
  }

  // ── 绘制：植物光晕 ──────────────────────────────────

  /**
   * 绘制植物光晕：6 层同心圆叠加模拟径向渐变（白→主绿→透明）
   */
  private drawPlantHalo(
    g: PIXI.Graphics,
    radius: number,
    pal: Palette,
  ): void {
    g.clear();
    for (let i = 0; i < 6; i++) {
      const t = i / 5; // 0 → 1
      const r = radius * (0.2 + 0.8 * t);
      // 颜色：前半段 白→主绿，后半段保持主绿
      const color =
        t < 0.5
          ? this.interpolateColor(PLANT_WHITE, pal.primary, t * 2)
          : pal.primary;
      const alpha = (1 - t) * 0.2; // 中心高 alpha，边缘趋近 0
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }
  }

  // ── 绘制：植物主体 + 叶子 ────────────────────────────

  /**
   * 绘制植物主体：4 层叠加（深绿→主绿→浅绿→白色高亮）
   */
  private drawPlantBody(g: PIXI.Graphics, radius: number, pal: Palette): void {
    g.clear();
    const bodyR = radius * 0.32; // 主体半径
    // 4 层叠加：深绿 → 主绿 → 浅绿 → 白色高亮
    const layers = [
      { r: bodyR, color: pal.shadow, alpha: 0.9 },
      { r: bodyR * 0.8, color: pal.primary, alpha: 0.95 },
      { r: bodyR * 0.5, color: pal.glow, alpha: 1 },
      { r: bodyR * 0.22, color: PLANT_WHITE, alpha: 1 },
    ];
    for (const l of layers) {
      g.circle(0, 0, l.r);
      g.fill({ color: l.color, alpha: l.alpha });
    }
  }

  /**
   * 绘制叶子：2-4 片椭圆叶子（绿色渐变），围绕主体分布
   */
  private drawLeaves(g: PIXI.Graphics, radius: number, pal: Palette): void {
    const bodyR = radius * 0.32;
    const leafCount = 2 + Math.floor(Math.random() * 3); // 2-4 片
    const leafLen = bodyR * 0.9;
    const leafWidth = bodyR * 0.4;
    for (let i = 0; i < leafCount; i++) {
      const a = (i / leafCount) * Math.PI * 2 + Math.PI / 2; // 从顶部开始均匀分布
      const dist = bodyR * 0.7;
      const cx = Math.cos(a) * dist;
      const cy = Math.sin(a) * dist;
      this.drawLeaf(g, cx, cy, a, leafLen, leafWidth, pal);
    }
  }

  /** 绘制单片叶子（两条 quadraticCurveTo 形成尖叶） */
  private drawLeaf(
    g: PIXI.Graphics,
    cx: number,
    cy: number,
    angle: number,
    len: number,
    width: number,
    pal: Palette,
  ): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // 叶尖与叶基
    const tipX = cx + cos * len;
    const tipY = cy + sin * len;
    const baseX = cx - cos * len * 0.3;
    const baseY = cy - sin * len * 0.3;
    // 垂直方向控制点
    const perpX = -sin * width;
    const perpY = cos * width;
    g.moveTo(baseX, baseY);
    g.quadraticCurveTo(cx + perpX, cy + perpY, tipX, tipY);
    g.quadraticCurveTo(cx - perpX, cy - perpY, baseX, baseY);
    g.fill({ color: pal.glow, alpha: 0.8 });
  }

  // ── 绘制：性格装饰 ──────────────────────────────────

  /**
   * 绘制性格装饰：
   * - 温柔型 🌸：粉色花瓣（5 瓣，围绕顶部）
   * - 暴躁型 🌿：红色尖刺（6-8 根，从主体向外放射）
   * - 好奇型 🌼：无装饰（靠微风粒子+表情表达）
   */
  private drawPersonalityDecor(
    g: PIXI.Graphics,
    radius: number,
    personality: PlantPersonality,
  ): void {
    g.clear();
    const bodyR = radius * 0.32;

    if (personality === 'gentle') {
      // 粉色花瓣：5 瓣，围绕主体顶部
      const petalCount = 5;
      const petalR = bodyR * 0.45;
      for (let i = 0; i < petalCount; i++) {
        const a = (i / petalCount) * Math.PI * 2 - Math.PI / 2; // 从顶部开始
        const dist = bodyR * 0.75;
        const px = Math.cos(a) * dist;
        const py = Math.sin(a) * dist;
        g.ellipse(px, py, petalR, petalR * 0.5);
        g.fill({ color: PERSONALITY_GENTLE, alpha: 0.85 });
      }
    } else if (personality === 'fierce') {
      // 红色尖刺：6-8 根，从主体向外放射
      const thornCount = 6 + Math.floor(Math.random() * 3);
      const thornLen = bodyR * 0.7;
      for (let i = 0; i < thornCount; i++) {
        const a = (i / thornCount) * Math.PI * 2;
        const baseR = bodyR * 0.8;
        const tipR = baseR + thornLen;
        // 三角形尖刺：底部两点 + 尖端一点
        const bx1 = Math.cos(a - 0.25) * baseR;
        const by1 = Math.sin(a - 0.25) * baseR;
        const bx2 = Math.cos(a + 0.25) * baseR;
        const by2 = Math.sin(a + 0.25) * baseR;
        const tx = Math.cos(a) * tipR;
        const ty = Math.sin(a) * tipR;
        g.moveTo(bx1, by1);
        g.lineTo(tx, ty);
        g.lineTo(bx2, by2);
        g.closePath();
        g.fill({ color: PERSONALITY_FIERCE, alpha: 0.9 });
      }
    }
    // 好奇型无装饰，靠微风粒子表达
  }

  // ── 绘制：表情 ──────────────────────────────────────

  /**
   * 绘制表情（位于主体上方）：
   * - 温柔型：微笑（弧线）
   * - 暴躁型：皱眉（倒 V 形）
   * - 好奇型：眨眼（半圆 + 小点）
   */
  private drawExpression(
    g: PIXI.Graphics,
    radius: number,
    personality: PlantPersonality,
  ): void {
    g.clear();
    const bodyR = radius * 0.32;
    const exprY = -bodyR * 0.15; // 表情略偏上
    const exprSize = bodyR * 0.35;

    if (personality === 'gentle') {
      // 微笑：下半弧（U 形）
      g.arc(0, exprY, exprSize, 0, Math.PI, false);
      g.stroke({ color: PLANT_DEEP, width: 1.5, alpha: 1 });
    } else if (personality === 'fierce') {
      // 皱眉：倒 V 形（两段线段在顶部交汇）
      g.moveTo(-exprSize, exprY + exprSize * 0.6);
      g.lineTo(0, exprY - exprSize * 0.3);
      g.lineTo(exprSize, exprY + exprSize * 0.6);
      g.stroke({ color: PLANT_DEEP, width: 1.5, alpha: 1 });
    } else {
      // 眨眼：左眼半圆（闭合）+ 右眼小点
      g.arc(-exprSize * 0.6, exprY, exprSize * 0.4, 0, Math.PI, false);
      g.stroke({ color: PLANT_DEEP, width: 1, alpha: 1 });
      g.circle(exprSize * 0.6, exprY, exprSize * 0.3);
      g.fill({ color: PLANT_DEEP, alpha: 1 });
    }
  }

  // ── 绘制：性格光环 ──────────────────────────────────

  /**
   * 绘制性格光环：
   * - 温柔型：粉色护盾环（沐里周围柔光护盾的视觉投射）
   * - 暴躁型：红色伤害环（脉冲）
   * - 好奇型：青色减速环（扩散）
   */
  private drawPersonalityRing(
    g: PIXI.Graphics,
    radius: number,
    personality: PlantPersonality,
  ): void {
    g.clear();
    if (personality === 'gentle') {
      // 粉色护盾环
      g.circle(0, 0, radius);
      g.stroke({ color: PERSONALITY_GENTLE, width: 1.5, alpha: 0.6 });
      g.circle(0, 0, radius * 0.92);
      g.stroke({ color: PERSONALITY_GENTLE, width: 0.5, alpha: 0.4 });
    } else if (personality === 'fierce') {
      // 红色伤害环
      g.circle(0, 0, radius * 1.05);
      g.stroke({ color: PERSONALITY_FIERCE, width: 1.5, alpha: 0.6 });
    } else {
      // 青色减速环
      g.circle(0, 0, radius * 0.7);
      g.stroke({ color: PERSONALITY_CURIOUS, width: 1, alpha: 0.5 });
    }
  }

  // ══════════════════════════════════════════════════════
  //  爆发：植物派对（三阶段动画）
  // ══════════════════════════════════════════════════════

  /**
   * 触发爆发视觉效果
   * @param playerId 玩家 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param radius 爆发范围（逻辑 px）
   * @param plantCount 当前植物数量
   * @param themeColor 主题色
   * @param durationMs 持续时间（ms），默认 4000
   */
  triggerBurst(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    plantCount: number,
    themeColor = PLANT_MAIN,
    durationMs?: number,
    palette?: Palette,
  ): void {
    const pal: Palette = palette ?? {
      primary: themeColor,
      glow: lighten(themeColor, 50),
      highlight: lighten(themeColor, 100),
      dim: dimColor(themeColor, 0.6),
      shadow: dimColor(themeColor, 0.3),
      accent: 0xFFB3D9,
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

    // 1. 派对核心（10 层同心圆渐变）
    const coreGraphics = new PIXI.Graphics();
    this.drawBurstCore(coreGraphics, radius, pal);
    container.addChild(coreGraphics);

    // 2. 兴奋光环（金色多层扩散环）
    const auraGraphics = new PIXI.Graphics();
    this.drawBurstAura(auraGraphics, radius);
    container.addChild(auraGraphics);

    this.fieldContainer.addChild(container);

    const burst: ActiveBurst = {
      container,
      coreGraphics,
      auraGraphics,
      life: 0,
      maxLife: durationMs ?? 4000,
      radius,
      plantCount,
      themeColor: pal.primary,
    };
    this.activeBursts.set(playerId, burst);

    // 激活爆发标记：所有植物进入兴奋状态
    this.burstActive = true;
  }

  /**
   * 绘制派对核心：10 层同心圆（白→高亮→浅绿→主绿→透明）
   */
  private drawBurstCore(g: PIXI.Graphics, radius: number, pal: Palette): void {
    g.clear();
    const coreR = radius * 0.8; // 核心区域半径

    // 10 层同心圆叠加
    for (let i = 0; i < 10; i++) {
      const t = i / 9; // 0 → 1
      const r = coreR * (0.1 + 0.9 * t);
      // 颜色分段：白 → 高亮 → 浅绿 → 主绿
      let color: number;
      if (t < 0.25) {
        color = this.interpolateColor(PLANT_WHITE, pal.highlight, t / 0.25);
      } else if (t < 0.5) {
        color = this.interpolateColor(
          pal.highlight,
          pal.glow,
          (t - 0.25) / 0.25,
        );
      } else if (t < 0.75) {
        color = this.interpolateColor(
          pal.glow,
          pal.primary,
          (t - 0.5) / 0.25,
        );
      } else {
        color = pal.primary;
      }
      const alpha = (1 - t) * 0.22;
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }

    // 中心白色实心核
    g.circle(0, 0, 6);
    g.fill({ color: PLANT_WHITE, alpha: 1 });
  }

  /**
   * 绘制兴奋光环：金色多层扩散环
   */
  private drawBurstAura(g: PIXI.Graphics, radius: number): void {
    g.clear();
    // 4 层金色环，由内到外 alpha 递减
    for (let i = 0; i < 4; i++) {
      const r = radius * (0.6 + i * 0.2);
      g.circle(0, 0, r);
      g.stroke({
        color: BURST_GOLD,
        width: 1.5 - i * 0.3,
        alpha: 0.6 - i * 0.12,
      });
    }
  }

  // ══════════════════════════════════════════════════════
  //  更新循环
  // ══════════════════════════════════════════════════════

  /** 每帧更新（由 EffectRenderer 调用，dt 单位 ms） */
  update(dt: number): void {
    // ── 植物动画：出生 / 呼吸 / 枯萎 + 性格粒子 ──
    this.activePlants.forEach((plant, plantId) => {
      plant.life += dt;
      plant.phaseT += dt;
      const burstMult = this.burstActive ? 1.5 : 1.0; // 爆发期体型 1.5 倍

      if (plant.phase === 'birth') {
        // 出生动画：scale 0→1.2→1.0（easeOutBack，300ms）
        const t = Math.min(plant.phaseT / 300, 1);
        const eased = this.easeOutBack(t);
        const baseScale = eased * burstMult;
        plant.bodyGraphics.scale.set(baseScale);
        plant.decorGraphics.scale.set(baseScale);
        plant.exprGraphics.scale.set(baseScale);
        plant.haloGraphics.alpha = t; // 0 → 1 显现
        plant.ringGraphics.alpha = t;
        if (plant.phaseT >= 300) {
          plant.phase = 'idle';
          plant.phaseT = 0;
        }
      } else if (plant.phase === 'idle') {
        // 呼吸：scale 1.0↔1.05（2s 周期）
        const breath = (1 + 0.05 * Math.sin(plant.life * 0.001 * Math.PI)) * burstMult;
        plant.bodyGraphics.scale.set(breath);
        plant.decorGraphics.scale.set(breath);
        plant.exprGraphics.scale.set(breath);
        // 光晕脉动
        plant.haloGraphics.alpha = 0.7 + 0.2 * Math.sin(plant.life * 0.001 * Math.PI);
        // 性格光环动画
        this.updatePersonalityRing(plant);

        // 好奇型：持续生成微风粒子
        if (plant.personality === 'curious') {
          plant.particleTimer += dt;
          if (plant.particleTimer > 400) {
            plant.particleTimer = 0;
            this.spawnBreezeParticles(plant.x, plant.y, plant.radius);
          }
        }

        // 自动过期：进入枯萎
        if (plant.life >= plant.maxLife) {
          plant.phase = 'decay';
          plant.phaseT = 0;
          this.spawnCoffeeParticles(plant.x, plant.y, plant.radius, 4);
        }
      } else if (plant.phase === 'decay') {
        // 枯萎：scale 1.0→0.3，alpha 1→0（500ms）
        const t = Math.min(plant.phaseT / 500, 1);
        const eased = this.easeOutCubic(t);
        const decayScale = (1.0 - 0.7 * eased) * burstMult;
        plant.bodyGraphics.scale.set(decayScale);
        plant.decorGraphics.scale.set(decayScale);
        plant.exprGraphics.scale.set(decayScale);
        plant.haloGraphics.alpha = 1 - eased;
        plant.ringGraphics.alpha = 1 - eased;
        if (plant.phaseT >= 500) {
          this.removePlant(plantId);
        }
      }

      // 对话气泡淡入淡出（1.5s）
      if (plant.chatText && plant.chatLife !== undefined) {
        plant.chatLife -= dt;
        const remain = plant.chatLife;
        if (remain > 1100) {
          // 前 400ms 淡入
          plant.chatText.alpha = (1500 - remain) / 400;
        } else if (remain > 0) {
          // 后 1100ms 保持
          plant.chatText.alpha = 1;
        } else {
          plant.chatText.alpha = 0;
        }
        if (remain <= 0) {
          plant.container.removeChild(plant.chatText);
          plant.chatText.destroy();
          plant.chatText = undefined;
          plant.chatLife = undefined;
        }
      }
    });

    // ── 爆发：三阶段动画 ──
    this.activeBursts.forEach((burst, playerId) => {
      burst.life += dt;
      const T = burst.maxLife;
      if (burst.life >= T) {
        this.removeBurst(playerId);
        // 爆发结束：所有植物同时枯萎 + 大量咖啡香气粒子
        this.burstActive = false;
        this.triggerAllPlantsDecay();
        this.spawnCoffeeParticles(
          burst.container.x,
          burst.container.y,
          burst.radius,
          16,
        );
        return;
      }

      const phase1End = T * 0.15; // 苏醒 0-15%
      const phase3Start = T * 0.85; // 枯萎 85-100%

      if (burst.life < phase1End) {
        // 阶段1 苏醒：光晕扩大 scale 0.3→1.0，核心显现
        const t = burst.life / phase1End;
        const eased = this.easeOutCubic(t);
        burst.coreGraphics.scale.set(0.3 + 0.7 * eased);
        burst.coreGraphics.alpha = t;
        burst.auraGraphics.scale.set(0.3 + 0.7 * eased);
        burst.auraGraphics.alpha = t * 0.8;
      } else if (burst.life < phase3Start) {
        // 阶段2 兴奋：核心脉动 + 兴奋光环扩散
        const t = (burst.life - phase1End) / (phase3Start - phase1End);
        const pulse = 1.0 + 0.08 * Math.sin(burst.life * 0.005 * Math.PI);
        burst.coreGraphics.scale.set(pulse);
        burst.coreGraphics.alpha = 1.0;
        // 兴奋光环：缓慢扩散 + 旋转
        burst.auraGraphics.scale.set(1.0 + 0.2 * t);
        burst.auraGraphics.rotation += dt * 0.0005;
        burst.auraGraphics.alpha = 0.8;

        // 持续散发咖啡香气粒子（少量）
        if (Math.random() < 0.15) {
          this.spawnCoffeeParticles(
            burst.container.x,
            burst.container.y,
            burst.radius * 0.5,
            1,
          );
        }
      } else {
        // 阶段3 枯萎：核心消散 + 大量咖啡香气粒子
        const t = (burst.life - phase3Start) / (T - phase3Start);
        burst.coreGraphics.alpha = 1.0 - 0.8 * t;
        burst.coreGraphics.scale.set(1.0 + 0.3 * t);
        burst.auraGraphics.alpha = 0.8 * (1.0 - t);
        burst.auraGraphics.scale.set(1.2 + 0.5 * t);

        // 大量咖啡香气粒子
        if (Math.random() < 0.4) {
          this.spawnCoffeeParticles(
            burst.container.x,
            burst.container.y,
            burst.radius,
            2,
          );
        }
      }
    });
  }

  /** 更新性格光环动画（脉冲/扩散） */
  private updatePersonalityRing(plant: ActivePlant): void {
    const t = plant.life * 0.002;
    if (plant.personality === 'gentle') {
      // 粉色护盾环：alpha 脉动
      plant.ringGraphics.alpha = 0.5 + 0.25 * Math.sin(t * Math.PI);
    } else if (plant.personality === 'fierce') {
      // 红色伤害环：脉冲缩放
      const pulse = 1.0 + 0.1 * Math.sin(t * Math.PI);
      plant.ringGraphics.scale.set(pulse);
      plant.ringGraphics.alpha = 0.5 + 0.25 * Math.sin(t * Math.PI);
    } else {
      // 青色减速环：扩散动画
      const expand = 1.0 + 0.15 * (Math.sin(t * Math.PI) * 0.5 + 0.5);
      plant.ringGraphics.scale.set(expand);
    }
  }

  /** 触发所有植物枯萎（爆发结束时调用） */
  private triggerAllPlantsDecay(): void {
    this.activePlants.forEach((plant) => {
      if (plant.phase !== 'decay') {
        plant.phase = 'decay';
        plant.phaseT = 0;
        this.spawnCoffeeParticles(plant.x, plant.y, plant.radius, 4);
      }
    });
  }

  // ══════════════════════════════════════════════════════
  //  粒子生成
  // ══════════════════════════════════════════════════════

  /**
   * 生成微风粒子（好奇型植物，青色向外飘散）
   */
  private spawnBreezeParticles(
    x: number,
    y: number,
    radius: number,
  ): void {
    const s = this.scale;
    for (let i = 0; i < 2; i++) {
      const angle = Math.random() * Math.PI * 2;
      const startDist = radius * s * (0.3 + Math.random() * 0.3);
      const px = x + Math.cos(angle) * startDist;
      const py = y + Math.sin(angle) * startDist;
      const speed = (15 + Math.random() * 10) * s;
      this.particlePool.emit({
        x: px,
        y: py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1500,
        scaleStart: 1,
        scaleEnd: 0,
        alphaStart: 0.7,
        alphaEnd: 0,
        tint: PERSONALITY_CURIOUS,
        radius: (1.5 + Math.random() * 1) * s,
      });
    }
  }

  /**
   * 生成咖啡香气粒子（枯萎时飘散，向上飘 + 优先飞向中心）
   */
  private spawnCoffeeParticles(
    x: number,
    y: number,
    radius: number,
    count: number,
  ): void {
    const s = this.scale;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const startDist = radius * s * (0.2 + Math.random() * 0.4);
      const px = x + Math.cos(angle) * startDist;
      const py = y + Math.sin(angle) * startDist;
      // 向上飘散为主，带轻微水平扰动
      const vx = (Math.random() - 0.5) * 20 * s;
      const vy = -(20 + Math.random() * 25) * s; // 向上
      // 咖啡棕/浅咖啡随机
      const tint = Math.random() < 0.5 ? COFFEE_BROWN : COFFEE_LIGHT;
      this.particlePool.emit({
        x: px,
        y: py,
        vx,
        vy,
        life: 2500,
        scaleStart: 1.2,
        scaleEnd: 0,
        alphaStart: 0.8,
        alphaEnd: 0,
        tint,
        radius: (2 + Math.random() * 2) * s,
      });
    }
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
    this.activePlants.forEach((_, plantId) => this.removePlant(plantId));
    this.activeBursts.forEach((_, playerId) => this.removeBurst(playerId));
    this.burstActive = false;
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

  /** easeOutBack 缓动（带回弹，用于出生动画 0→1.2→1.0） */
  private easeOutBack(t: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
}
