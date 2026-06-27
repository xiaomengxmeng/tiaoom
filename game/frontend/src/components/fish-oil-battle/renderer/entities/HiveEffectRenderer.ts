/**
 * 蜂巢母体特效渲染器（工程师流派 - 闲乘月质量标准）
 *
 * 视觉设计（工程师黄绿 + 蜂蜜金双色调）：
 * - 蜂刺 Sting：4 层叠加发光（外晕→主色→高亮→白核）+ 三阶段生命周期动画
 *   孵化(0-15%T)→出击(15%-30%T)→归巢(30%-100%T)
 * - 蜂巢核心 HiveCore：10 层径向渐变（白→高亮→浅黄绿→主黄绿→透明）+ 呼吸脉动
 * - 蜂刺反弹 StingBounce：3 层扩散环 + 12 颗蜂蜜火花
 * - 爆发闪屏 BurstFlash：10 层径向渐变全屏 + 三阶段动画
 * - 蜂群绕球 Bees：4 层叠加发光（外晕→高亮→主色→白核）+ 公转
 *
 * 从 EffectRenderer 独立拆分，保持 API 签名兼容。
 */

import * as PIXI from 'pixi.js';
import { BLEND_MODES, STINGER_SPEED, BURST_FLASH_DURATION, HIVE_BURST_SCALE } from '../constants';
import { ParticlePool } from '../systems/ParticlePool';
import {
  lighten,
  type ActiveEffect,
  type HiveVisualConfig,
} from './VisualEffectUtils';

// ══════════════════════════════════════════════════════
//  颜色常量（工程师黄绿）
// ══════════════════════════════════════════════════════

const HIVE_DEEP = 0x2A3A0A;        // 深绿黑（渐变外缘）
const HIVE_MAIN = 0x66AA00;        // 主黄绿（蜂刺主色）
const HIVE_LIGHT = 0xAADD22;       // 浅黄绿（中层渐变）
const HIVE_HIGHLIGHT = 0xDDFF66;   // 高亮浅绿（内层渐变）
const HIVE_GOLD = 0xFFCC00;        // 蜂蜜金（粒子色）
const HIVE_WHITE = 0xFFFFFF;       // 白色（核心高亮）

/** 蜂巢核心径向渐变层数 */
const HIVE_CORE_LAYERS = 10;
/** 爆发闪屏径向渐变层数 */
const BURST_FLASH_LAYERS = 10;

// ══════════════════════════════════════════════════════
//  数据结构
// ══════════════════════════════════════════════════════

/** 蜂群绕球公转条目（含蜂巢核心） */
interface HiveBeeEntry {
  container: PIXI.Container;
  bees: PIXI.Graphics[];
  coreGraphics: PIXI.Graphics; // 蜂巢核心（10 层径向渐变）
  beeCount: number;
  isBurst: boolean;
  elapsed: number;
  honeyTimer: number; // 蜂蜜粒子节流计时器
}

export class HiveEffectRenderer {
  /** 蜂刺对象池 */
  private stingerPool: PIXI.Graphics[] = [];
  /** 活跃中的蜂刺 */
  private stingerActive: Set<PIXI.Graphics> = new Set();

  /** 蜂群绕球公转 */
  private hiveBees = new Map<string, HiveBeeEntry>();

  /** 挂载容器 */
  private entityContainer: PIXI.Container;
  private hologramContainer: PIXI.Container;
  private particlePool: ParticlePool;

  /** 缩放 + 画布尺寸 */
  private scale = 1;
  private canvasW: number;
  private canvasH: number;
  /** 缩放变化时强制重建蜂群 */
  private scaleDirty = false;

  constructor(
    entityContainer: PIXI.Container,
    hologramContainer: PIXI.Container,
    particlePool: ParticlePool,
    canvasW: number,
    canvasH: number,
    prePoolCount = 30,
  ) {
    this.entityContainer = entityContainer;
    this.hologramContainer = hologramContainer;
    this.particlePool = particlePool;
    this.canvasW = canvasW;
    this.canvasH = canvasH;

    for (let i = 0; i < prePoolCount; i++) {
      const g = this.createStingerGraphics();
      g.visible = false;
      this.entityContainer.addChild(g);
      this.stingerPool.push(g);
    }
  }

  /** 创建蜂刺 Graphics（统一 ADD 混合模式） */
  private createStingerGraphics(): PIXI.Graphics {
    const g = new PIXI.Graphics();
    g.blendMode = BLEND_MODES.ADD as unknown as PIXI.BLEND_MODES;
    return g;
  }

  /** 同步缩放 + 画布尺寸 */
  setScale(scale: number, canvasW: number, canvasH: number): void {
    if (scale !== this.scale) {
      this.scaleDirty = true;
    }
    this.scale = scale;
    this.canvasW = canvasW;
    this.canvasH = canvasH;
  }

  // ── 蜂刺对象池 ──────────────────────────────────────────

  private acquireStinger(): PIXI.Graphics | null {
    for (const g of this.stingerPool) {
      if (!this.stingerActive.has(g)) {
        this.stingerActive.add(g);
        g.visible = true;
        return g;
      }
    }
    const g = this.createStingerGraphics();
    this.entityContainer.addChild(g);
    this.stingerPool.push(g);
    this.stingerActive.add(g);
    return g;
  }

  private releaseStinger(g: PIXI.Graphics): void {
    g.clear();
    g.visible = false;
    this.stingerActive.delete(g);
  }

  // ── 蜂刺触发（4 层叠加发光 + 三阶段生命周期） ──────────────────────────────────────────

  /**
   * 触发蜂刺特效
   *
   * 三阶段生命周期：
   * - 孵化(0-15%T)：蜂刺浮现，scale 0.3→1.0，alpha 0→1
   * - 出击(15%-30%T)：峰值强度，发射蜂蜜粒子（HIVE_GOLD）
   * - 归巢(30%-100%T)：逐渐衰减，蜂蜜色拖尾，alpha 1.0→0.6
   *
   * @param fromX 发射位置 X（画布像素坐标）
   * @param fromY 发射位置 Y
   * @param toX 目标位置 X
   * @param toY 目标位置 Y
   * @param themeColor 玩家主题色
   * @param visualCfg 视觉配置
   */
  triggerSting(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    themeColor?: number,
    visualCfg?: HiveVisualConfig,
  ): ActiveEffect | null {
    const g = this.acquireStinger();
    if (!g) return null;

    const dx = toX - fromX;
    const dy = toY - fromY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = (visualCfg?.stingerSpeed ?? STINGER_SPEED) * this.scale;
    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;
    const maxLife = (dist / speed) * 1000 + 500;

    const primary = themeColor ?? HIVE_MAIN;
    const trail = themeColor ? lighten(themeColor, 50) : HIVE_LIGHT;

    g.x = fromX;
    g.y = fromY;
    g.visible = true;

    const ef: ActiveEffect = {
      type: 'hive_sting',
      container: g as unknown as PIXI.Container,
      life: 0,
      maxLife,
      onUpdate: (_ef, _dt) => {
        // 物理位移（不受视觉阶段影响）
        g.x += (vx * _dt) / 1000;
        g.y += (vy * _dt) / 1000;

        // 三阶段生命周期
        const t = _ef.life / _ef.maxLife;
        let scale: number;
        let alpha: number;
        let coreColor: number;

        if (t < 0.15) {
          // 阶段1 孵化：蜂刺浮现，scale 0.3→1.0（easeOutCubic），alpha 0→1
          const p = t / 0.15;
          const eased = this.easeOutCubic(p);
          scale = 0.3 + 0.7 * eased;
          alpha = eased;
          coreColor = HIVE_WHITE;
        } else if (t < 0.3) {
          // 阶段2 出击：峰值强度，发射蜂蜜粒子（HIVE_GOLD）
          scale = 1.0;
          alpha = 1.0;
          coreColor = HIVE_HIGHLIGHT;
          this.particlePool.emit({
            x: g.x,
            y: g.y,
            vx: -vx * 0.3 + (Math.random() - 0.5) * 30,
            vy: -vy * 0.3 + (Math.random() - 0.5) * 30,
            life: 400,
            radius: 2 * this.scale,
            alphaStart: 0.8,
            alphaEnd: 0,
            tint: HIVE_GOLD,
          });
        } else {
          // 阶段3 归巢：逐渐衰减，核心色渐变至蜂蜜金
          const p = (t - 0.3) / 0.7;
          scale = 1.0 - 0.3 * p;
          alpha = 1.0 - 0.4 * p; // 1.0 → 0.6，保持飞行可见性
          coreColor = this.interpolateColor(HIVE_HIGHLIGHT, HIVE_GOLD, p);
        }

        const s = this.scale * scale;
        g.clear();
        // 4 层叠加发光（外→内，先画大圆后画小圆覆盖）
        // 1. 外层光晕（大半径，白色低 alpha）
        g.circle(0, 0, 8 * s);
        g.fill({ color: HIVE_WHITE, alpha: 0.12 * alpha });
        // 2. 中层光晕（HIVE_HIGHLIGHT）
        g.circle(0, 0, 6 * s);
        g.fill({ color: HIVE_HIGHLIGHT, alpha: 0.25 * alpha });
        // 3. 主色（primary / HIVE_MAIN）
        g.circle(0, 0, 4 * s);
        g.fill({ color: primary, alpha: 0.85 * alpha });
        // 4. 核心高亮（白核 / 蜂蜜金过渡）
        g.circle(0, 0, 2 * s);
        g.fill({ color: coreColor, alpha });

        // 主拖尾粒子（每帧）
        this.particlePool.emit({
          x: g.x,
          y: g.y,
          vx: -vx * 0.4,
          vy: -vy * 0.4,
          life: 300,
          radius: 3 * this.scale,
          alphaStart: 0.7,
          alphaEnd: 0,
          tint: trail,
        });

        // 额外尾迹（50% 概率，修复原版 _ef.life % 2 浮点 bug）
        if (Math.random() < 0.5) {
          this.particlePool.emit({
            x: g.x,
            y: g.y,
            vx: -vx * 0.2 + (Math.random() - 0.5) * 20,
            vy: -vy * 0.2 + (Math.random() - 0.5) * 20,
            life: 200,
            radius: 2 * this.scale,
            alphaStart: 0.4,
            alphaEnd: 0,
            tint: trail,
          });
        }
      },
      onDecay: (_ef) => {
        this.releaseStinger(g);
      },
    };
    return ef;
  }

  // ── 蜂刺碰墙反弹（3 层扩散环 + 12 颗蜂蜜火花） ──────────────────────────────────────

  /**
   * 触发蜂刺碰墙反弹特效
   * - 12 颗蜂蜜火花（交替 primary / HIVE_GOLD）向四周散射
   * - 3 层扩散环（外层高亮→中层主色→内层白核）
   */
  triggerStingBounce(x: number, y: number, themeColor?: number): ActiveEffect | null {
    const primary = themeColor ?? HIVE_MAIN;

    // 1. 蜂蜜火花（12 颗，交替主色/蜂蜜金）
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.3;
      const speed = 80 + Math.random() * 80;
      this.particlePool.emit({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 300 + Math.random() * 200,
        radius: 2.5 * this.scale,
        alphaStart: 0.9,
        alphaEnd: 0,
        tint: i % 2 === 0 ? primary : HIVE_GOLD,
      });
    }

    // 2. 3 层扩散环
    const g = new PIXI.Graphics();
    g.blendMode = BLEND_MODES.ADD as unknown as PIXI.BLEND_MODES;
    this.entityContainer.addChild(g);

    const ef: ActiveEffect = {
      type: 'hive_sting_bounce',
      container: g as unknown as PIXI.Container,
      life: 0,
      maxLife: 400,
      onUpdate: (_ef, _dt) => {
        const t = _ef.life / _ef.maxLife;
        const eased = this.easeOutCubic(t);
        const radius = (12 + eased * 48) * this.scale;
        g.clear();
        g.x = x;
        g.y = y;
        // 外层环（HIVE_HIGHLIGHT，大半径，低 alpha）
        g.circle(0, 0, radius);
        g.stroke({ color: HIVE_HIGHLIGHT, width: 1 * this.scale, alpha: 0.5 * (1 - t) });
        // 中层环（primary）
        g.circle(0, 0, radius * 0.7);
        g.stroke({ color: primary, width: 2 * this.scale, alpha: 0.8 * (1 - t) });
        // 内层环（白色高亮）
        g.circle(0, 0, radius * 0.4);
        g.stroke({ color: HIVE_WHITE, width: 1 * this.scale, alpha: 0.9 * (1 - t) });
      },
      onDecay: (_ef) => {
        g.destroy();
      },
    };
    return ef;
  }

  // ── 爆发闪屏（10 层径向渐变 + 三阶段动画） ──────────────────────────────────────────

  /**
   * 触发爆发全屏闪屏（L5 全息层）
   *
   * 三阶段动画：
   * - 孵化(0-15%T)：闪屏浮现，scale 0.5→1.0，alpha 0→1
   * - 出击(15%-30%T)：峰值强度
   * - 归巢(30%-100%T)：衰减消散，scale 1.0→1.3，alpha 1→0
   *
   * 10 层径向渐变（白→factionColor→透明），以画布中心为圆心
   */
  triggerBurstFlash(factionColor: number, visualCfg?: HiveVisualConfig): ActiveEffect | null {
    const duration = visualCfg?.burstFlashDuration ?? BURST_FLASH_DURATION;

    const g = new PIXI.Graphics();
    g.blendMode = BLEND_MODES.ADD as unknown as PIXI.BLEND_MODES;
    this.hologramContainer.addChild(g);

    // 预计算全屏对角线半径（最大覆盖）
    const cx = this.canvasW / 2;
    const cy = this.canvasH / 2;
    const maxR = Math.sqrt(cx * cx + cy * cy);

    const ef: ActiveEffect = {
      type: 'burst_flash',
      container: g,
      life: 0,
      maxLife: duration,
      onUpdate: (ef, _dt) => {
        const t = ef.life / ef.maxLife;
        g.clear();

        // 三阶段动画
        let scale: number;
        let alpha: number;
        if (t < 0.15) {
          // 孵化：闪屏浮现
          const p = t / 0.15;
          const eased = this.easeOutCubic(p);
          scale = 0.5 + 0.5 * eased;
          alpha = eased;
        } else if (t < 0.3) {
          // 出击：峰值
          scale = 1.0;
          alpha = 1.0;
        } else {
          // 归巢：衰减消散
          const p = (t - 0.3) / 0.7;
          scale = 1.0 + 0.3 * p;
          alpha = 1.0 - p;
        }

        if (alpha <= 0) {
          g.visible = false;
          return;
        }
        g.visible = true;

        // 10 层径向渐变（白 → factionColor → 透明）
        const r = maxR * scale;
        for (let i = 0; i < BURST_FLASH_LAYERS; i++) {
          const lt = i / (BURST_FLASH_LAYERS - 1); // 0 → 1
          const lr = r * (0.1 + 0.9 * lt);
          // 颜色分段：前半段 白→factionColor，后半段保持 factionColor
          const color = lt < 0.5
            ? this.interpolateColor(HIVE_WHITE, factionColor, lt * 2)
            : factionColor;
          const la = (1 - lt) * 0.35 * alpha;
          g.circle(cx, cy, lr);
          g.fill({ color, alpha: la });
        }
      },
      onDecay: (_ef) => {
        g.destroy(true);
      },
    };
    return ef;
  }

  // ── 蜂群绕球公转（含蜂巢核心） ──────────────────────────────

  /**
   * 创建/更新绕球公转的纳米蜂群（含蜂巢核心）
   *
   * 蜂巢核心：10 层径向渐变（白→高亮→浅黄绿→主黄绿→透明）+ 呼吸脉动
   * 蜂群：4 层叠加发光（外晕→高亮→主色→白核）+ 公转
   * 爆发时：持续发射蜂蜜粒子（HIVE_GOLD）
   *
   * @param playerId 玩家 ID
   * @param playerX / playerY 玩家当前画布像素坐标
   * @param beeCount 蜂数量
   * @param isBurst 是否爆发状态
   * @param dt 帧间隔
   * @param themeColor 主题色
   * @param visualCfg 视觉配置
   */
  updateHiveBees(
    playerId: string,
    playerX: number,
    playerY: number,
    beeCount: number,
    isBurst: boolean,
    dt: number,
    themeColor?: number,
    visualCfg?: HiveVisualConfig,
  ): void {
    // 缩放变化时强制重建蜂群，使半径立即生效
    if (this.scaleDirty) {
      const old = this.hiveBees.get(playerId);
      if (old) {
        old.container.destroy({ children: true });
        this.hiveBees.delete(playerId);
      }
      this.scaleDirty = false;
    }

    let entry = this.hiveBees.get(playerId);
    const primary = themeColor ?? HIVE_MAIN;
    const burstScale = visualCfg?.burstScale ?? HIVE_BURST_SCALE;
    const orbitRadius = (visualCfg?.orbitRadius ?? 50) * this.scale;

    if (!entry || entry.beeCount !== beeCount) {
      // 重建
      if (entry) {
        entry.container.destroy({ children: true });
      }
      const container = new PIXI.Container();
      const bees: PIXI.Graphics[] = [];

      // 蜂巢核心（10 层径向渐变）—— 最底层
      const coreGraphics = new PIXI.Graphics();
      coreGraphics.blendMode = BLEND_MODES.ADD as unknown as PIXI.BLEND_MODES;
      container.addChild(coreGraphics);

      // 蜂群（4 层叠加发光）
      for (let i = 0; i < beeCount; i++) {
        const g = new PIXI.Graphics();
        g.blendMode = BLEND_MODES.ADD as unknown as PIXI.BLEND_MODES;
        this.drawBee(g, primary, isBurst, burstScale);
        container.addChild(g);
        bees.push(g);
      }

      this.entityContainer.addChild(container);
      entry = { container, bees, coreGraphics, beeCount, isBurst, elapsed: 0, honeyTimer: 0 };
      this.hiveBees.set(playerId, entry);
    }

    // 更新爆发状态切换
    if (entry.isBurst !== isBurst) {
      entry.isBurst = isBurst;
      for (const g of entry.bees) {
        g.clear();
        this.drawBee(g, primary, isBurst, burstScale);
      }
    }

    entry.elapsed += dt;

    // 绘制蜂巢核心（10 层径向渐变 + 呼吸脉动）
    this.drawHiveCore(entry.coreGraphics, primary, isBurst, entry.elapsed);
    entry.coreGraphics.position.set(playerX, playerY);

    // 蜂蜜粒子（爆发时持续发射）
    if (isBurst) {
      entry.honeyTimer += dt;
      if (entry.honeyTimer > 200) {
        entry.honeyTimer = 0;
        const angle = Math.random() * Math.PI * 2;
        const dist = orbitRadius * (0.5 + Math.random() * 0.5);
        this.particlePool.emit({
          x: playerX + Math.cos(angle) * dist,
          y: playerY + Math.sin(angle) * dist,
          vx: Math.cos(angle) * 20,
          vy: Math.sin(angle) * 20,
          life: 800,
          radius: 2 * this.scale,
          alphaStart: 0.6,
          alphaEnd: 0,
          tint: HIVE_GOLD,
        });
      }
    }

    // 更新蜂群轨道位置
    for (let i = 0; i < entry.beeCount; i++) {
      const orbitAngle = (entry.elapsed / 1000) * Math.PI + (i * 2 * Math.PI) / entry.beeCount;
      entry.bees[i].x = playerX + Math.cos(orbitAngle) * orbitRadius;
      entry.bees[i].y = playerY + Math.sin(orbitAngle) * orbitRadius;
    }
  }

  /**
   * 绘制单只蜂（4 层叠加发光）
   * - 爆发态：大尺寸 + 强发光 + burstScale 放大
   * - 常态：标准 3 层 + 白核
   */
  private drawBee(g: PIXI.Graphics, primary: number, isBurst: boolean, burstScale: number): void {
    if (isBurst) {
      // 爆发态：4 层叠加发光
      g.circle(0, 0, 10 * this.scale);
      g.fill({ color: HIVE_WHITE, alpha: 0.2 });
      g.circle(0, 0, 7 * this.scale);
      g.fill({ color: HIVE_HIGHLIGHT, alpha: 0.5 });
      g.circle(0, 0, 5 * this.scale);
      g.fill({ color: primary, alpha: 0.7 });
      g.circle(0, 0, 3 * this.scale);
      g.fill({ color: HIVE_WHITE, alpha: 0.9 });
      g.scale.set(burstScale);
    } else {
      // 常态：3 层叠加发光 + 白核
      g.circle(0, 0, 7 * this.scale);
      g.fill({ color: HIVE_HIGHLIGHT, alpha: 0.25 });
      g.circle(0, 0, 5 * this.scale);
      g.fill({ color: primary, alpha: 0.7 });
      g.circle(0, 0, 2.5 * this.scale);
      g.fill({ color: HIVE_WHITE, alpha: 0.8 });
      g.scale.set(1.0);
    }
  }

  /**
   * 绘制蜂巢核心（10 层径向渐变 + 呼吸脉动）
   *
   * 颜色分段（外→内）：
   * - 0.00-0.25：HIVE_DEEP → primary
   * - 0.25-0.50：primary → HIVE_LIGHT
   * - 0.50-0.75：HIVE_LIGHT → HIVE_HIGHLIGHT
   * - 0.75-1.00：HIVE_HIGHLIGHT → HIVE_WHITE
   *
   * 呼吸脉动（2s 周期），爆发时放大 + 加强脉动
   */
  private drawHiveCore(g: PIXI.Graphics, primary: number, isBurst: boolean, elapsed: number): void {
    g.clear();
    // 基础半径（爆发时放大）
    const baseR = (isBurst ? 24 : 16) * this.scale;
    // 呼吸脉动（2s 周期）
    const breathAmp = isBurst ? 0.15 : 0.08;
    const breath = 1 + breathAmp * Math.sin(elapsed * 0.001 * Math.PI);
    const r = baseR * breath;

    // 10 层径向渐变（外→内：HIVE_DEEP → primary → HIVE_LIGHT → HIVE_HIGHLIGHT → HIVE_WHITE）
    for (let i = 0; i < HIVE_CORE_LAYERS; i++) {
      const t = i / (HIVE_CORE_LAYERS - 1); // 0(外) → 1(内)
      const lr = r * (0.1 + 0.9 * t);
      // 颜色分段：外→内 4 段插值
      let color: number;
      if (t < 0.25) {
        color = this.interpolateColor(HIVE_DEEP, primary, t / 0.25);
      } else if (t < 0.5) {
        color = this.interpolateColor(primary, HIVE_LIGHT, (t - 0.25) / 0.25);
      } else if (t < 0.75) {
        color = this.interpolateColor(HIVE_LIGHT, HIVE_HIGHLIGHT, (t - 0.5) / 0.25);
      } else {
        color = this.interpolateColor(HIVE_HIGHLIGHT, HIVE_WHITE, (t - 0.75) / 0.25);
      }
      // alpha：外层趋近 0，内层最高
      const alpha = (1 - t) * (isBurst ? 0.3 : 0.22);
      g.circle(0, 0, lr);
      g.fill({ color, alpha });
    }

    // 中心白核（实心）
    g.circle(0, 0, 3 * this.scale);
    g.fill({ color: HIVE_WHITE, alpha: 0.9 });
  }

  /** 移除某玩家的蜂群 */
  removeHiveBees(playerId: string): void {
    const entry = this.hiveBees.get(playerId);
    if (entry) {
      if (!entry.container.destroyed) entry.container.destroy({ children: true });
      this.hiveBees.delete(playerId);
    }
  }

  // ── 资源清理 ──────────────────────────────────────────

  clear(): void {
    for (const g of this.stingerActive) {
      g.clear();
      g.visible = false;
    }
    this.stingerActive.clear();

    for (const [, entry] of this.hiveBees) {
      if (!entry.container.destroyed) entry.container.destroy({ children: true });
    }
    this.hiveBees.clear();
  }

  destroy(): void {
    this.clear();
    for (const g of this.stingerPool) {
      if (!g.destroyed) g.destroy(true);
    }
    this.stingerPool.length = 0;
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
}
