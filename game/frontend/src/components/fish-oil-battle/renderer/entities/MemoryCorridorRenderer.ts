/**
 * 梦 - 记忆回廊 (Memory Corridor)
 * 前端视觉渲染器
 *
 * 视觉设计（虚空记忆系 + FIFO 回响队列可视化）：
 * - 回响光环 Echo：8 层径向渐变（深紫→主紫→透明）+ 六边形碎片公转（FIFO 队列）+ 时间涟漪 + 回响粒子
 * - 历史共振 Resonance：6 层同心圆核心（银白→主紫→透明）+ 共振波纹（层数 = resonanceStacks）+ 碎片闪烁
 * - 记忆洪流 Burst：10 层记忆核心 + 5 层扩散圆环 + 六边形碎片爆发 + 中心记忆之眼（三阶段动画）
 *
 * 三阶段动画（Burst）：
 * - 回忆阶段（0-20%T）：碎片向中心汇聚
 * - 共振阶段（20%-40%T）：碎片叠加爆发，多层共振波纹扩散
 * - 遗忘阶段（40%-100%T）：波纹消散，碎片化为粒子飘散
 */

import * as PIXI from 'pixi.js';
import { ParticlePool } from '../systems/ParticlePool';

// ══════════════════════════════════════════════════════
//  颜色常量（虚空记忆系）
// ══════════════════════════════════════════════════════

const MEMORY_DEEP = 0x1a0033; // 深紫黑
const MEMORY_MAIN = 0x6633cc; // 主紫色
const MEMORY_LIGHT = 0x9966ff; // 浅紫
const MEMORY_HIGHLIGHT = 0xcc99ff; // 高亮淡紫
const MEMORY_SILVER = 0xe0e0ff; // 银白
const MEMORY_WHITE = 0xffffff; // 纯白

// ══════════════════════════════════════════════════════
//  数据结构
// ══════════════════════════════════════════════════════

/** 活跃回响实例（FIFO 队列可视化） */
interface ActiveEcho {
  container: PIXI.Container;
  auraGraphics: PIXI.Graphics; // 回响光环
  shardGraphics: PIXI.Graphics; // 记忆碎片（六边形）
  rippleGraphics: PIXI.Graphics; // 时间涟漪
  shardAngles: number[]; // 每个碎片的当前角度
  shardCount: number; // 当前碎片数量（FIFO 计数）
  rippleLife: number[]; // 涟漪 life 数组
  particleTimer: number;
  rippleTimer: number;
  life: number; // ms 累计
  maxLife: number;
  x: number;
  y: number;
  radius: number;
}

/** 活跃历史共振 */
interface ActiveResonance {
  container: PIXI.Container;
  coreGraphics: PIXI.Graphics; // 共振核心 + 共振波纹
  life: number;
  maxLife: number;
  stacks: number;
  themeColor: number;
}

/** 活跃记忆洪流爆发（三阶段动画） */
interface ActiveBurst {
  container: PIXI.Container;
  coreGraphics: PIXI.Graphics; // 记忆核心（10 层渐变）
  rippleGraphics: PIXI.Graphics; // 共振波纹（5 层扩散圆环）
  shardGraphics: PIXI.Graphics; // 六边形碎片爆发
  eyeGraphics: PIXI.Graphics; // 中心记忆之眼
  life: number;
  maxLife: number;
  themeColor: number;
  radius: number;
  shardCount: number;
}

export class MemoryCorridorRenderer {
  private fieldContainer: PIXI.Container;
  private particlePool: ParticlePool;
  private scale = 1;

  // 活跃实例池
  private activeEchoes: Map<string, ActiveEcho> = new Map();
  private activeResonances: Map<string, ActiveResonance> = new Map();
  private activeBursts: Map<string, ActiveBurst> = new Map();

  constructor(fieldContainer: PIXI.Container, particlePool: ParticlePool) {
    this.fieldContainer = fieldContainer;
    this.particlePool = particlePool;
  }

  setScale(scale: number): void {
    this.scale = scale;
    // 容器统一承担全局缩放，内部 graphics 维持各自的动画 scale
    this.activeEchoes.forEach((echo) => {
      if (echo.container.destroyed) return;
      echo.container.scale.set(scale);
    });
    this.activeResonances.forEach((res) => {
      if (res.container.destroyed) return;
      res.container.scale.set(scale);
    });
    this.activeBursts.forEach((burst) => {
      if (burst.container.destroyed) return;
      burst.container.scale.set(scale);
    });
  }

  // ══════════════════════════════════════════════════════
  //  回响光环 Echo（FIFO 队列可视化）
  // ══════════════════════════════════════════════════════

  /**
   * 触发回响光环视觉效果
   * @param playerId 玩家 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param radius 回响半径（逻辑 px）
   * @param echoCount 当前回响层数（影响碎片数 5-8）
   * @param shardId 碎片标识（保留用于 FIFO 队列追踪）
   * @param themeColor 主题色（默认主紫色）
   */
  triggerEcho(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    echoCount: number,
    shardId: number,
    themeColor = MEMORY_MAIN,
  ): void {
    // 已存在则仅更新位置、半径、碎片数
    const existing = this.activeEchoes.get(playerId);
    if (existing) {
      existing.x = x;
      existing.y = y;
      existing.radius = radius;
      existing.container.position.set(x, y);
      this.syncEchoShards(existing, echoCount);
      return;
    }

    const container = new PIXI.Container();
    container.position.set(x, y);
    container.scale.set(this.scale); // 全局缩放由容器承担

    // 回响光环（8 层径向渐变）
    const auraGraphics = new PIXI.Graphics();
    this.drawEchoAura(auraGraphics, radius, themeColor);
    container.addChild(auraGraphics);

    // 记忆碎片（六边形公转）
    const shardGraphics = new PIXI.Graphics();
    container.addChild(shardGraphics);

    // 时间涟漪
    const rippleGraphics = new PIXI.Graphics();
    container.addChild(rippleGraphics);

    this.fieldContainer.addChild(container);

    // FIFO 队列：碎片数 = clamp(echoCount + 4, 5, 8)
    const shardCount = this.clampShardCount(echoCount + 4, 5, 8);
    const shardAngles: number[] = [];
    for (let i = 0; i < shardCount; i++) {
      shardAngles.push((i * Math.PI * 2) / shardCount);
    }

    const echo: ActiveEcho = {
      container,
      auraGraphics,
      shardGraphics,
      rippleGraphics,
      shardAngles,
      shardCount,
      rippleLife: [],
      particleTimer: 0,
      rippleTimer: 0,
      life: 0,
      maxLife: Number.POSITIVE_INFINITY, // 常驻，直到手动移除
      x,
      y,
      radius,
    };
    this.activeEchoes.set(playerId, echo);

    // 首帧绘制碎片 + 涟漪
    this.drawEchoShards(echo.shardGraphics, echo.shardAngles, radius * 0.7, false);
    echo.rippleLife.push(0);

    // 保留 shardId（当前未深度使用，避免 lint 警告）
    void shardId;
  }

  /**
   * 更新回响位置与碎片数
   * @param playerId 玩家 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param echoCount 当前回响层数
   */
  updateEcho(playerId: string, x: number, y: number, echoCount: number): void {
    const echo = this.activeEchoes.get(playerId);
    if (!echo) return;
    echo.x = x;
    echo.y = y;
    echo.container.position.set(x, y);
    this.syncEchoShards(echo, echoCount);
  }

  /** 移除回响光环 */
  removeEcho(playerId: string): void {
    const echo = this.activeEchoes.get(playerId);
    if (echo) {
      this.fieldContainer.removeChild(echo.container);
      echo.container.destroy({ children: true });
      this.activeEchoes.delete(playerId);
    }
  }

  /**
   * 同步 FIFO 队列碎片数：target 越大 → 加入新碎片到末尾；越小 → 从末尾弹出
   * 模拟队列"先进先出"的视觉直觉
   */
  private syncEchoShards(echo: ActiveEcho, echoCount: number): void {
    const target = this.clampShardCount(echoCount + 4, 5, 8);
    if (target === echo.shardCount) return;
    if (target > echo.shardCount) {
      // 入队：新碎片追加到角度数组末尾
      for (let i = echo.shardCount; i < target; i++) {
        // 与上一片错开 60° 避免重叠
        const last = echo.shardAngles[echo.shardAngles.length - 1] ?? 0;
        echo.shardAngles.push(last + Math.PI / 3);
      }
    } else {
      // 出队：从末尾弹出（保留前面的角度状态）
      echo.shardAngles.length = target;
    }
    echo.shardCount = target;
  }

  /** 碎片数限定 [min, max] */
  private clampShardCount(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * 绘制回响光环：8 层同心圆径向渐变（深紫→主紫→透明）+ 主光环双层细环
   * 以 (0,0) 为中心绘制，半径单位为逻辑 px
   */
  private drawEchoAura(
    g: PIXI.Graphics,
    radius: number,
    themeColor: number,
  ): void {
    g.clear();

    // 8 层同心圆叠加模拟径向渐变（中心深紫 → 主紫 → 透明）
    for (let i = 0; i < 8; i++) {
      const t = i / 7; // 0 → 1
      const r = radius * (0.15 + 0.85 * t);
      // 颜色：前半段 深紫→主紫，后半段保持主紫
      const color =
        t < 0.5
          ? this.interpolateColor(MEMORY_DEEP, themeColor, t * 2)
          : themeColor;
      const alpha = (1 - t) * 0.2; // 中心高 alpha，边缘趋近 0
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }

    // 主光环：外环 MEMORY_LIGHT + 内环 MEMORY_HIGHLIGHT
    g.circle(0, 0, radius);
    g.stroke({ color: MEMORY_LIGHT, width: 1, alpha: 0.7 });
    g.circle(0, 0, radius * 0.92);
    g.stroke({ color: MEMORY_HIGHLIGHT, width: 0.4, alpha: 0.5 });
  }

  /**
   * 绘制记忆碎片：5-8 个半透明六边形围绕中心公转
   * @param angles 每个碎片的当前角度
   * @param orbitR 公转半径
   * @param highlight 是否高亮（共振触发时）
   */
  private drawEchoShards(
    g: PIXI.Graphics,
    angles: number[],
    orbitR: number,
    highlight: boolean,
  ): void {
    g.clear();
    const shardSize = 5;
    for (let i = 0; i < angles.length; i++) {
      const a = angles[i];
      const cx = Math.cos(a) * orbitR;
      const cy = Math.sin(a) * orbitR;
      // 六边形朝向公转切线方向（增加流动感）
      this.traceHexagon(g, cx, cy, shardSize, a + Math.PI / 2);
      if (highlight) {
        // 共振闪烁：银白高亮
        g.fill({ color: MEMORY_SILVER, alpha: 0.85 });
        g.stroke({ color: MEMORY_WHITE, width: 0.7, alpha: 1 });
      } else {
        // 常态：半透明淡紫
        g.fill({ color: MEMORY_HIGHLIGHT, alpha: 0.5 });
        g.stroke({ color: MEMORY_LIGHT, width: 0.5, alpha: 0.7 });
      }
    }
  }

  /**
   * 绘制时间涟漪：每圈涟漪从 scale 0 扩散到 2，alpha 0.6→0
   * @param rippleLife 涟漪 life 数组（ms）
   * @param baseR 涟漪基础半径
   */
  private drawEchoRipples(
    g: PIXI.Graphics,
    rippleLife: number[],
    baseR: number,
  ): void {
    g.clear();
    const rippleLifeMs = 1500; // 单圈涟漪寿命
    for (const life of rippleLife) {
      const t = life / rippleLifeMs;
      if (t < 0 || t > 1) continue;
      const r = baseR * 2 * t; // scale 0 → 2
      const alpha = 0.6 * (1 - t); // alpha 0.6 → 0
      g.circle(0, 0, r);
      g.stroke({ color: MEMORY_HIGHLIGHT, width: 1, alpha });
    }
  }

  /**
   * 生成回响粒子（缓慢飘散）
   * 利用 particlePool.emit，每 2s 由 update 节流调用
   */
  private spawnMemoryParticles(
    x: number,
    y: number,
    radius: number,
    count: number,
  ): void {
    const s = this.scale;
    const palette = [MEMORY_LIGHT, MEMORY_HIGHLIGHT, MEMORY_SILVER];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      // 从核心附近出发
      const startDist = radius * s * (0.2 + Math.random() * 0.3);
      const px = x + Math.cos(angle) * startDist;
      const py = y + Math.sin(angle) * startDist;
      // 缓慢飘散速度（px/s）
      const speed = (15 + Math.random() * 15) * s;
      const color = palette[Math.floor(Math.random() * palette.length)];
      this.particlePool.emit({
        x: px,
        y: py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 2500,
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
  //  历史共振 Resonance
  // ══════════════════════════════════════════════════════

  /**
   * 触发历史共振视觉效果
   * @param targetId 目标玩家 ID
   * @param x 目标逻辑坐标 X
   * @param y 目标逻辑坐标 Y
   * @param resonanceStacks 共振层数（决定波纹环数）
   * @param themeColor 主题色
   */
  triggerResonance(
    targetId: string,
    x: number,
    y: number,
    resonanceStacks: number,
    themeColor = MEMORY_MAIN,
  ): void {
    // 若已存在，先销毁旧实例（避免泄漏）
    const old = this.activeResonances.get(targetId);
    if (old) {
      this.fieldContainer.removeChild(old.container);
      old.container.destroy({ children: true });
    }

    const container = new PIXI.Container();
    container.position.set(x, y);
    container.scale.set(this.scale);

    const coreGraphics = new PIXI.Graphics();
    this.drawResonanceCore(coreGraphics, resonanceStacks, themeColor);
    container.addChild(coreGraphics);

    this.fieldContainer.addChild(container);

    const resonance: ActiveResonance = {
      container,
      coreGraphics,
      life: 0,
      maxLife: 4000, // 4 秒
      stacks: resonanceStacks,
      themeColor,
    };
    this.activeResonances.set(targetId, resonance);

    // 共振触发瞬间：所有活跃回响的碎片高亮闪烁
    this.activeEchoes.forEach((echo) => {
      if (echo.container.destroyed) return;
      this.drawEchoShards(
        echo.shardGraphics,
        echo.shardAngles,
        echo.radius * 0.7,
        true,
      );
    });
  }

  /** 移除历史共振 */
  removeResonance(targetId: string): void {
    const res = this.activeResonances.get(targetId);
    if (res) {
      this.fieldContainer.removeChild(res.container);
      res.container.destroy({ children: true });
      this.activeResonances.delete(targetId);
    }
  }

  /**
   * 绘制共振核心：6 层同心圆（银白→主紫→透明）+ 共振波纹（层数 = stacks）+ 中心记忆核
   */
  private drawResonanceCore(
    g: PIXI.Graphics,
    stacks: number,
    themeColor: number,
  ): void {
    g.clear();
    const baseR = 25;

    // 6 层同心圆叠加（中心银白 → 主紫 → 透明）
    for (let i = 0; i < 6; i++) {
      const t = i / 5; // 0 → 1
      const r = baseR * (0.2 + 0.8 * t);
      const color =
        t < 0.5
          ? this.interpolateColor(MEMORY_SILVER, themeColor, t * 2)
          : themeColor;
      const alpha = (1 - t) * 0.25;
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }

    // 共振波纹：层数 = resonanceStacks，每层 +5px 半径，alpha 递减
    for (let i = 0; i < stacks; i++) {
      const r = baseR + 6 + i * 5;
      const alpha = Math.max(0.15, 0.65 - i * 0.13);
      g.circle(0, 0, r);
      g.stroke({ color: MEMORY_SILVER, width: 1, alpha });
    }

    // 中心记忆核：白色实心圆 r=3
    g.circle(0, 0, 3);
    g.fill({ color: MEMORY_WHITE, alpha: 1 });
  }

  // ══════════════════════════════════════════════════════
  //  记忆洪流 Burst（三阶段动画）
  // ══════════════════════════════════════════════════════

  /**
   * 触发记忆洪流爆发视觉效果
   * @param playerId 玩家 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param radius 爆发范围（逻辑 px）
   * @param echoCount 回响层数（影响碎片数 8-12）
   * @param themeColor 主题色
   * @param durationMs 持续时间（ms），默认 5000
   */
  triggerBurst(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    echoCount: number,
    themeColor = MEMORY_MAIN,
    durationMs?: number,
  ): void {
    // 若已存在，先销毁旧实例
    const old = this.activeBursts.get(playerId);
    if (old) {
      this.fieldContainer.removeChild(old.container);
      old.container.destroy({ children: true });
    }

    const container = new PIXI.Container();
    container.position.set(x, y);
    container.scale.set(this.scale);

    // 1. 记忆核心（10 层渐变：深紫→主紫→银白→透明）
    const coreGraphics = new PIXI.Graphics();
    this.drawBurstCore(coreGraphics, radius, themeColor);
    container.addChild(coreGraphics);

    // 2. 共振波纹（5 层扩散圆环，从内到外颜色递进）
    const rippleGraphics = new PIXI.Graphics();
    this.drawBurstRipples(rippleGraphics, radius);
    container.addChild(rippleGraphics);

    // 3. 六边形碎片爆发（8-12 个向外飞散）
    const shardGraphics = new PIXI.Graphics();
    const shardCount = this.clampShardCount(echoCount + 6, 8, 12);
    this.drawBurstShards(shardGraphics, radius, shardCount);
    container.addChild(shardGraphics);

    // 4. 中心记忆之眼（白色高亮六边形核心）
    const eyeGraphics = new PIXI.Graphics();
    this.drawMemoryEye(eyeGraphics);
    container.addChild(eyeGraphics);

    this.fieldContainer.addChild(container);

    const burst: ActiveBurst = {
      container,
      coreGraphics,
      rippleGraphics,
      shardGraphics,
      eyeGraphics,
      life: 0,
      maxLife: durationMs ?? 5000,
      themeColor,
      radius,
      shardCount,
    };
    this.activeBursts.set(playerId, burst);
  }

  /** 移除记忆洪流爆发 */
  removeBurst(playerId: string): void {
    const burst = this.activeBursts.get(playerId);
    if (burst) {
      this.fieldContainer.removeChild(burst.container);
      burst.container.destroy({ children: true });
      this.activeBursts.delete(playerId);
    }
  }

  /**
   * 绘制记忆核心：10 层同心圆（深紫→主紫→浅紫→银白→透明）径向渐变
   */
  private drawBurstCore(
    g: PIXI.Graphics,
    radius: number,
    themeColor: number,
  ): void {
    g.clear();
    const coreR = radius * 0.55; // 记忆核心区域半径

    // 10 层同心圆叠加（深紫 → 主紫 → 浅紫 → 银白 → 透明）
    for (let i = 0; i < 10; i++) {
      const t = i / 9; // 0 → 1
      const r = coreR * (0.1 + 0.9 * t);
      // 颜色分段：深紫 → 主紫 → 浅紫 → 银白
      let color: number;
      if (t < 0.33) {
        color = this.interpolateColor(MEMORY_DEEP, themeColor, t / 0.33);
      } else if (t < 0.66) {
        color = this.interpolateColor(
          themeColor,
          MEMORY_LIGHT,
          (t - 0.33) / 0.33,
        );
      } else {
        color = this.interpolateColor(
          MEMORY_LIGHT,
          MEMORY_SILVER,
          (t - 0.66) / 0.34,
        );
      }
      const alpha = (1 - t) * 0.25;
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }
  }

  /**
   * 绘制共振波纹：5 层扩散圆环（不同颜色，从内到外）
   * 颜色序列：银白 → 高亮淡紫 → 浅紫 → 主紫 → 深紫
   */
  private drawBurstRipples(g: PIXI.Graphics, radius: number): void {
    g.clear();
    const colors = [
      MEMORY_SILVER,
      MEMORY_HIGHLIGHT,
      MEMORY_LIGHT,
      MEMORY_MAIN,
      MEMORY_DEEP,
    ];
    for (let i = 0; i < 5; i++) {
      const r = radius * (0.4 + 0.15 * i);
      const alpha = 0.8 - i * 0.12;
      g.circle(0, 0, r);
      g.stroke({ color: colors[i], width: 1.5, alpha });
    }
  }

  /**
   * 绘制六边形碎片爆发：8-12 个六边形围绕中心向外飞散
   * 每片六边形朝向外侧（顶点指向圆心反方向）
   */
  private drawBurstShards(
    g: PIXI.Graphics,
    radius: number,
    count: number,
  ): void {
    g.clear();
    const dist = radius * 0.75; // 碎片初始距离中心
    const shardSize = 6;
    for (let i = 0; i < count; i++) {
      const a = (i * Math.PI * 2) / count;
      const cx = Math.cos(a) * dist;
      const cy = Math.sin(a) * dist;
      // 六边形朝向外侧
      this.traceHexagon(g, cx, cy, shardSize, a);
      g.fill({ color: MEMORY_HIGHLIGHT, alpha: 0.7 });
      g.stroke({ color: MEMORY_SILVER, width: 0.7, alpha: 0.9 });
    }
  }

  /**
   * 绘制中心记忆之眼：银白光晕 + 白色高亮六边形 + 紫色瞳孔
   */
  private drawMemoryEye(g: PIXI.Graphics): void {
    g.clear();

    // 银白光晕（双层）
    g.circle(0, 0, 12);
    g.fill({ color: MEMORY_SILVER, alpha: 0.4 });
    g.circle(0, 0, 9);
    g.fill({ color: MEMORY_SILVER, alpha: 0.3 });

    // 六边形眼（白色高亮）
    this.traceHexagon(g, 0, 0, 6, 0);
    g.fill({ color: MEMORY_WHITE, alpha: 1 });
    g.stroke({ color: MEMORY_SILVER, width: 1, alpha: 0.8 });

    // 中心瞳孔（主紫）
    g.circle(0, 0, 2);
    g.fill({ color: MEMORY_MAIN, alpha: 0.9 });
  }

  // ══════════════════════════════════════════════════════
  //  更新循环
  // ══════════════════════════════════════════════════════

  /** 每帧更新（由 EffectRenderer 调用，dt 单位 ms） */
  update(dt: number): void {
    // ── 回响光环：呼吸 + 碎片公转 + 涟漪扩散 + 粒子飘散 ──
    this.activeEchoes.forEach((echo) => {
      echo.life += dt;
      // 光环呼吸 scale 1.0↔1.04（2s 周期）
      const breath = 1 + 0.04 * Math.sin(echo.life * 0.001 * Math.PI);
      echo.auraGraphics.scale.set(breath);
      // 光环脉动 alpha 0.6↔0.9
      echo.auraGraphics.alpha = 0.75 + 0.15 * Math.sin(echo.life * 0.001 * Math.PI);

      // 碎片公转（0.3 转/秒）
      const orbitSpeed = 0.3 * Math.PI * 2; // rad/s
      for (let i = 0; i < echo.shardAngles.length; i++) {
        echo.shardAngles[i] += (orbitSpeed * dt) / 1000;
      }
      // 共振高亮：若存在活跃共振，所有碎片闪烁
      const hasResonance = this.activeResonances.size > 0;
      this.drawEchoShards(
        echo.shardGraphics,
        echo.shardAngles,
        echo.radius * 0.7,
        hasResonance,
      );

      // 时间涟漪：每 1s 生成一圈
      echo.rippleTimer += dt;
      if (echo.rippleTimer > 1000) {
        echo.rippleTimer = 0;
        echo.rippleLife.push(0);
      }
      // 涟漪生命推进 & 过期回收
      for (let i = echo.rippleLife.length - 1; i >= 0; i--) {
        echo.rippleLife[i] += dt;
        if (echo.rippleLife[i] > 1500) echo.rippleLife.splice(i, 1);
      }
      this.drawEchoRipples(echo.rippleGraphics, echo.rippleLife, echo.radius);

      // 回响粒子：每 2s 生成 2-3 个
      echo.particleTimer += dt;
      if (echo.particleTimer > 2000) {
        echo.particleTimer = 0;
        this.spawnMemoryParticles(
          echo.x,
          echo.y,
          echo.radius,
          2 + Math.floor(Math.random() * 2),
        );
      }
    });

    // ── 历史共振：脉动 + 自动过期 ──
    this.activeResonances.forEach((res, targetId) => {
      res.life += dt;
      // 脉动 scale 1.0↔1.08
      const pulse = 1 + 0.08 * Math.sin(res.life * 0.003 * Math.PI);
      res.coreGraphics.scale.set(pulse);
      if (res.life >= res.maxLife) this.removeResonance(targetId);
    });

    // ── 记忆洪流：三阶段动画 ──
    this.activeBursts.forEach((burst, playerId) => {
      burst.life += dt;
      const T = burst.maxLife;
      if (burst.life >= T) {
        this.removeBurst(playerId);
        return;
      }
      const phase1End = T * 0.2; // 回忆阶段 0-20%T
      const phase2End = T * 0.4; // 共振阶段 20%-40%T

      if (burst.life < phase1End) {
        // 阶段1 回忆：碎片向中心汇聚（scale 1.0→0.15），核心半显，波纹/眼未显
        const t = burst.life / phase1End;
        const eased = this.easeOutCubic(t);
        burst.shardGraphics.scale.set(1.0 - 0.85 * eased);
        burst.shardGraphics.alpha = t;
        burst.coreGraphics.alpha = t * 0.5; // 0 → 0.5 半显
        burst.rippleGraphics.alpha = 0;
        burst.eyeGraphics.alpha = 0;
        burst.eyeGraphics.scale.set(0.1);
      } else if (burst.life < phase2End) {
        // 阶段2 共振：碎片叠加爆发，多层共振波纹扩散
        const t = (burst.life - phase1End) / (phase2End - phase1End);
        const eased = this.easeOutCubic(t);
        burst.coreGraphics.alpha = 0.5 + 0.5 * eased; // 0.5 → 1.0 全显
        burst.rippleGraphics.alpha = eased; // 0 → 1 波纹展开
        burst.rippleGraphics.scale.set(0.3 + 0.7 * eased);
        burst.shardGraphics.scale.set(0.15 + 1.25 * eased); // 0.15 → 1.4 爆发散开
        burst.shardGraphics.alpha = 1 - 0.3 * t; // 1 → 0.7
        burst.eyeGraphics.alpha = eased; // 0 → 1
        burst.eyeGraphics.scale.set(0.1 + 0.9 * eased); // 0.1 → 1.0
        // 中心粒子爆发
        if (Math.random() < 0.25) {
          this.spawnMemoryParticles(burst.x, burst.y, 10, 1);
        }
      } else {
        // 阶段3 遗忘：波纹消散，碎片化为粒子飘散
        const t = (burst.life - phase2End) / (T - phase2End);
        burst.rippleGraphics.scale.set(1 + 1.2 * t); // 1 → 2.2 扩散
        burst.rippleGraphics.alpha = 1 - t; // 1 → 0
        burst.shardGraphics.scale.set(1.4 + 0.6 * t); // 1.4 → 2.0 继续飞散
        burst.shardGraphics.alpha = 0.7 * (1 - t); // 0.7 → 0
        burst.shardGraphics.rotation = Math.sin(t * Math.PI * 4) * 0.3;
        burst.coreGraphics.alpha = 1 - 0.6 * t; // 1 → 0.4
        burst.eyeGraphics.alpha = 1 - t; // 1 → 0
        // 碎片化为粒子飘散（前 30% 时长内持续生成）
        if (t < 0.3 && Math.random() < 0.4) {
          this.spawnMemoryParticles(burst.x, burst.y, burst.radius * 0.6, 1);
        }
      }
    });
  }

  // ══════════════════════════════════════════════════════
  //  移除与清理
  // ══════════════════════════════════════════════════════

  /** 清除所有特效（不销毁渲染器） */
  clear(): void {
    this.activeEchoes.forEach((_, playerId) => this.removeEcho(playerId));
    this.activeResonances.forEach((_, targetId) =>
      this.removeResonance(targetId),
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
   * 绘制六边形路径（不填色，仅描点；调用方负责 fill/stroke）
   * @param g 目标 Graphics
   * @param cx 中心 X
   * @param cy 中心 Y
   * @param r 外接圆半径
   * @param rotation 起始角度（弧度），决定六边形朝向
   */
  private traceHexagon(
    g: PIXI.Graphics,
    cx: number,
    cy: number,
    r: number,
    rotation = 0,
  ): void {
    for (let i = 0; i < 6; i++) {
      const a = rotation + (i * Math.PI) / 3;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
  }
}
