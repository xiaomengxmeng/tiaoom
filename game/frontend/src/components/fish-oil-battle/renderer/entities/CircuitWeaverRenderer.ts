/**
 * 电路编织者 (Circuit Weaver) - 工程师流派
 * 前端视觉渲染器
 *
 * 视觉设计（工程师绿 + 电流青双色调）：
 * - 电路网络 Circuit：电路核心（8 层径向渐变）+ 6 个发光节点 + 节点间电流流动连接线（带闪烁）
 * - 爆发 Burst：电路核心（8 层渐变）+ 节点爆发 + 电流脉冲线 + 三阶段动画（编织→激活→消散）
 */

import * as PIXI from 'pixi.js';
import { ParticlePool } from '../systems/ParticlePool';

// ══════════════════════════════════════════════════════
//  颜色常量（工程师绿）
// ══════════════════════════════════════════════════════

const CIRCUIT_DEEP = 0x0a3a0a; // 深绿黑（渐变外缘）
const CIRCUIT_MAIN = 0x22aa44; // 主绿（电路主色）
const CIRCUIT_LIGHT = 0x66dd22; // 浅亮绿（中层渐变）
const CIRCUIT_HIGHLIGHT = 0xbbff88; // 高亮浅绿（内层渐变）
const CIRCUIT_WHITE = 0xffffff; // 白色（核心高亮）
const CIRCUIT_CYAN = 0x00ffcc; // 电流青（连接线/电流流动色）

/** 电路节点数量（六边形分布） */
const CIRCUIT_NODE_COUNT = 6;

// ══════════════════════════════════════════════════════
//  数据结构
// ══════════════════════════════════════════════════════

/** 活跃电路网络实例（常驻） */
interface ActiveCircuit {
  container: PIXI.Container;
  coreGraphics: PIXI.Graphics; // 电路核心（8 层径向渐变）
  nodeGraphics: PIXI.Graphics; // 6 个发光节点（独立脉动）
  lineGraphics: PIXI.Graphics; // 节点间连接线（电流流动闪烁）
  particleTimer: number;
  life: number; // ms 累计
  maxLife: number;
  x: number;
  y: number;
  radius: number;
}

/** 活跃爆发特效（编织→激活→消散 三阶段） */
interface ActiveBurst {
  container: PIXI.Container;
  coreGraphics: PIXI.Graphics; // 电路核心（8 层渐变）
  nodeGraphics: PIXI.Graphics; // 节点爆发
  lineGraphics: PIXI.Graphics; // 电流脉冲线
  life: number;
  maxLife: number;
  themeColor: number;
  radius: number;
}

export class CircuitWeaverRenderer {
  private fieldContainer: PIXI.Container;
  private particlePool: ParticlePool;
  private scale = 1;

  // 活跃实例池
  private activeCircuits: Map<string, ActiveCircuit> = new Map();
  private activeBursts: Map<string, ActiveBurst> = new Map();

  constructor(fieldContainer: PIXI.Container, particlePool: ParticlePool) {
    this.fieldContainer = fieldContainer;
    this.particlePool = particlePool;
  }

  setScale(scale: number): void {
    this.scale = scale;
    this.activeCircuits.forEach((c) => {
      if (c.container.destroyed) return;
      c.container.scale.set(scale);
    });
    this.activeBursts.forEach((b) => {
      if (b.container.destroyed) return;
      b.container.scale.set(scale);
    });
  }

  // ══════════════════════════════════════════════════════
  //  电路网络 Circuit（常驻）
  // ══════════════════════════════════════════════════════

  /**
   * 触发电路网络视觉效果
   * @param playerId 玩家 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param radius 电路网络半径（逻辑 px）
   * @param themeColor 主题色（默认工程师绿）
   */
  triggerCircuit(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor = CIRCUIT_MAIN,
  ): void {
    // 已存在则仅更新位置与半径
    const existing = this.activeCircuits.get(playerId);
    if (existing) {
      existing.x = x;
      existing.y = y;
      existing.radius = radius;
      existing.container.position.set(x, y);
      return;
    }

    const container = new PIXI.Container();
    container.position.set(x, y);
    container.scale.set(this.scale);

    // 电路核心（8 层径向渐变 + 主环 + 中心核）
    const coreGraphics = new PIXI.Graphics();
    this.drawCircuitCore(coreGraphics, radius);
    container.addChild(coreGraphics);

    // 节点间连接线（六边形闭合 + 对角线，电流青色）
    const lineGraphics = new PIXI.Graphics();
    this.drawCircuitLines(lineGraphics, radius * 0.7);
    container.addChild(lineGraphics);

    // 6 个发光节点（叠加在连接线上层）
    const nodeGraphics = new PIXI.Graphics();
    this.drawCircuitNodes(nodeGraphics, radius * 0.7);
    container.addChild(nodeGraphics);

    this.fieldContainer.addChild(container);

    const circuit: ActiveCircuit = {
      container,
      coreGraphics,
      nodeGraphics,
      lineGraphics,
      particleTimer: 0,
      life: 0,
      maxLife: Number.POSITIVE_INFINITY, // 常驻，直到手动移除
      x,
      y,
      radius,
    };
    this.activeCircuits.set(playerId, circuit);

    // 触发首帧电流粒子
    this.spawnCurrentParticles(x, y, radius, CIRCUIT_CYAN);
    void themeColor;
  }

  /** 移除电路网络 */
  removeCircuit(playerId: string): void {
    const circuit = this.activeCircuits.get(playerId);
    if (circuit) {
      this.fieldContainer.removeChild(circuit.container);
      circuit.container.destroy({ children: true });
      this.activeCircuits.delete(playerId);
    }
  }

  /**
   * 绘制电路核心：8 层同心圆径向渐变（白→高亮→浅绿→主绿→深绿黑）+ 主环 + 中心核
   * 以 (0,0) 为中心绘制
   */
  private drawCircuitCore(g: PIXI.Graphics, radius: number): void {
    g.clear();

    // 8 层同心圆叠加模拟径向渐变
    for (let i = 0; i < 8; i++) {
      const t = i / 7; // 0 → 1
      const r = radius * (0.15 + 0.85 * t);
      // 颜色分段：白 → 高亮 → 浅绿 → 主绿 → 深绿黑
      let color: number;
      if (t < 0.25) {
        color = this.interpolateColor(CIRCUIT_WHITE, CIRCUIT_HIGHLIGHT, t / 0.25);
      } else if (t < 0.5) {
        color = this.interpolateColor(
          CIRCUIT_HIGHLIGHT,
          CIRCUIT_LIGHT,
          (t - 0.25) / 0.25,
        );
      } else if (t < 0.75) {
        color = this.interpolateColor(
          CIRCUIT_LIGHT,
          CIRCUIT_MAIN,
          (t - 0.5) / 0.25,
        );
      } else {
        color = this.interpolateColor(
          CIRCUIT_MAIN,
          CIRCUIT_DEEP,
          (t - 0.75) / 0.25,
        );
      }
      const alpha = (1 - t) * 0.22;
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }

    // 电路主环：深绿黑描边 + 主绿主环 + 高亮内环
    g.circle(0, 0, radius);
    g.stroke({ color: CIRCUIT_DEEP, width: 1.5, alpha: 0.6 });
    g.circle(0, 0, radius * 0.97);
    g.stroke({ color: CIRCUIT_MAIN, width: 1, alpha: 0.7 });
    g.circle(0, 0, radius * 0.93);
    g.stroke({ color: CIRCUIT_HIGHLIGHT, width: 0.4, alpha: 0.5 });

    // 中心核：白色实心圆 r=4 + 电流青外环 r=6
    g.circle(0, 0, 6);
    g.stroke({ color: CIRCUIT_CYAN, width: 1, alpha: 0.8 });
    g.circle(0, 0, 4);
    g.fill({ color: CIRCUIT_WHITE, alpha: 1 });
  }

  /**
   * 绘制 6 个发光节点（六边形分布，每个节点 3 层叠加发光）
   * 节点位于半径 nodeRadius 的圆周上，60° 均分
   */
  private drawCircuitNodes(g: PIXI.Graphics, nodeRadius: number): void {
    g.clear();
    for (let i = 0; i < CIRCUIT_NODE_COUNT; i++) {
      const a = (i * Math.PI * 2) / CIRCUIT_NODE_COUNT - Math.PI / 2; // 顶点朝上
      const nx = Math.cos(a) * nodeRadius;
      const ny = Math.sin(a) * nodeRadius;
      // 3 层叠加发光：外晕（电流青）→ 中层（高亮）→ 白核
      g.circle(nx, ny, 6);
      g.fill({ color: CIRCUIT_CYAN, alpha: 0.3 });
      g.circle(nx, ny, 4);
      g.fill({ color: CIRCUIT_HIGHLIGHT, alpha: 0.7 });
      g.circle(nx, ny, 2);
      g.fill({ color: CIRCUIT_WHITE, alpha: 1 });
    }
  }

  /**
   * 绘制节点间连接线：六边形闭合边 + 3 条对角线，电流青色
   * 由 lineGraphics 承担电流流动闪烁动画
   */
  private drawCircuitLines(g: PIXI.Graphics, nodeRadius: number): void {
    g.clear();
    // 计算节点坐标
    const pts: [number, number][] = [];
    for (let i = 0; i < CIRCUIT_NODE_COUNT; i++) {
      const a = (i * Math.PI * 2) / CIRCUIT_NODE_COUNT - Math.PI / 2;
      pts.push([Math.cos(a) * nodeRadius, Math.sin(a) * nodeRadius]);
    }
    // 六边形闭合边
    for (let i = 0; i < CIRCUIT_NODE_COUNT; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % CIRCUIT_NODE_COUNT];
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke({ color: CIRCUIT_CYAN, width: 1, alpha: 0.5 });
    }
    // 3 条对角线（连接对面节点）
    for (let i = 0; i < 3; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 3];
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke({ color: CIRCUIT_MAIN, width: 0.6, alpha: 0.4 });
    }
  }

  /**
   * 生成电流粒子（沿连接线方向流动）
   * 利用 particlePool.emit，每帧由 update 节流调用
   */
  private spawnCurrentParticles(
    x: number,
    y: number,
    radius: number,
    color: number,
  ): void {
    const s = this.scale;
    for (let i = 0; i < 2; i++) {
      const angle = Math.random() * Math.PI * 2;
      // 从核心附近出发
      const startDist = radius * s * (0.2 + Math.random() * 0.2);
      const px = x + Math.cos(angle) * startDist;
      const py = y + Math.sin(angle) * startDist;
      // 沿切线方向流动（px/s），表现电流环流感
      const tangent = angle + Math.PI / 2;
      const speed = (25 + Math.random() * 15) * s;
      this.particlePool.emit({
        x: px,
        y: py,
        vx: Math.cos(tangent) * speed,
        vy: Math.sin(tangent) * speed,
        life: 1800,
        scaleStart: 1,
        scaleEnd: 0,
        alphaStart: 0.8,
        alphaEnd: 0,
        tint: color,
        radius: (1.2 + Math.random() * 1.2) * s,
      });
    }
  }

  // ══════════════════════════════════════════════════════
  //  爆发特效（编织→激活→消散 三阶段动画）
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
    themeColor = CIRCUIT_MAIN,
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

    // 1. 电路核心（8 层径向渐变 + 中心核）
    const coreGraphics = new PIXI.Graphics();
    this.drawBurstCore(coreGraphics, radius);
    container.addChild(coreGraphics);

    // 2. 电流脉冲线（六边形闭合 + 对角线）
    const lineGraphics = new PIXI.Graphics();
    this.drawCircuitLines(lineGraphics, radius * 0.8);
    container.addChild(lineGraphics);

    // 3. 节点爆发（6 个发光节点叠加在脉冲线上层）
    const nodeGraphics = new PIXI.Graphics();
    this.drawCircuitNodes(nodeGraphics, radius * 0.8);
    container.addChild(nodeGraphics);

    this.fieldContainer.addChild(container);

    const burst: ActiveBurst = {
      container,
      coreGraphics,
      nodeGraphics,
      lineGraphics,
      life: 0,
      maxLife: durationMs ?? 5000,
      themeColor,
      radius,
    };
    this.activeBursts.set(playerId, burst);
  }

  /**
   * 绘制爆发电路核心：8 层同心圆（白→高亮→浅绿→主绿→深绿黑）+ 中心核
   */
  private drawBurstCore(g: PIXI.Graphics, radius: number): void {
    g.clear();
    const coreR = radius * 0.6;

    // 8 层同心圆叠加
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const r = coreR * (0.1 + 0.9 * t);
      let color: number;
      if (t < 0.25) {
        color = this.interpolateColor(CIRCUIT_WHITE, CIRCUIT_HIGHLIGHT, t / 0.25);
      } else if (t < 0.5) {
        color = this.interpolateColor(
          CIRCUIT_HIGHLIGHT,
          CIRCUIT_LIGHT,
          (t - 0.25) / 0.25,
        );
      } else if (t < 0.75) {
        color = this.interpolateColor(
          CIRCUIT_LIGHT,
          CIRCUIT_MAIN,
          (t - 0.5) / 0.25,
        );
      } else {
        color = this.interpolateColor(
          CIRCUIT_MAIN,
          CIRCUIT_DEEP,
          (t - 0.75) / 0.25,
        );
      }
      const alpha = (1 - t) * 0.28;
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }

    // 中心核 r=6
    g.circle(0, 0, 6);
    g.fill({ color: CIRCUIT_WHITE, alpha: 1 });

    // 电流青边缘辉光
    g.circle(0, 0, 8);
    g.stroke({ color: CIRCUIT_CYAN, width: 1.5, alpha: 0.8 });
  }

  // ══════════════════════════════════════════════════════
  //  更新循环
  // ══════════════════════════════════════════════════════

  /** 每帧更新（由 EffectRenderer 调用，dt 单位 ms） */
  update(dt: number): void {
    // ── 电路网络：核心呼吸 + 节点脉动 + 连接线闪烁 + 电流粒子 ──
    this.activeCircuits.forEach((circuit) => {
      circuit.life += dt;
      // 核心呼吸 scale 1.0↔1.05（2s 周期）
      const breath = 1 + 0.05 * Math.sin(circuit.life * 0.001 * Math.PI);
      circuit.coreGraphics.scale.set(breath);
      // 核心脉动 alpha 0.7↔0.95
      const pulse = 0.8 + 0.15 * Math.sin(circuit.life * 0.001 * Math.PI);
      circuit.coreGraphics.alpha = pulse;
      // 节点高频脉动（电流脉冲感）alpha 0.6↔1.0，3 转/秒
      const nodePulse =
        0.8 + 0.2 * Math.sin(circuit.life * 0.003 * Math.PI * 2);
      circuit.nodeGraphics.alpha = nodePulse;
      // 节点缓慢旋转 0.2 转/秒
      circuit.nodeGraphics.rotation += dt * 0.0004 * Math.PI;
      // 连接线电流流动闪烁（高频随机感）
      circuit.lineGraphics.alpha =
        0.6 + 0.4 * Math.sin(circuit.life * 0.005 * Math.PI * 2);
      circuit.lineGraphics.rotation -= dt * 0.0004 * Math.PI; // 反向旋转，形成错峰
      // 电流粒子：每 1.2s 生成 2 个
      circuit.particleTimer += dt;
      if (circuit.particleTimer > 1200) {
        circuit.particleTimer = 0;
        this.spawnCurrentParticles(
          circuit.x,
          circuit.y,
          circuit.radius,
          CIRCUIT_CYAN,
        );
      }
    });

    // ── 爆发：三阶段动画（编织→激活→消散） ──
    this.activeBursts.forEach((burst, playerId) => {
      burst.life += dt;
      const T = burst.maxLife;
      if (burst.life >= T) {
        this.removeBurst(playerId);
        return;
      }
      const phase1End = T * 0.2; // 编织阶段
      const phase2End = T * 0.4; // 激活阶段

      if (burst.life < phase1End) {
        // 阶段1 编织：连接线从 0.3 展开到 1.0，节点逐一显现，核心显现
        const t = burst.life / phase1End;
        burst.lineGraphics.scale.set(0.3 + 0.7 * this.easeOutCubic(t));
        burst.lineGraphics.alpha = t;
        burst.nodeGraphics.alpha = t; // 0 → 1
        burst.nodeGraphics.scale.set(0.3 + 0.7 * t);
        burst.coreGraphics.alpha = t;
        burst.coreGraphics.scale.set(0.5 + 0.5 * t);
      } else if (burst.life < phase2End) {
        // 阶段2 激活：节点高频闪烁，连接线电流流动，核心全亮
        const t = (burst.life - phase1End) / (phase2End - phase1End);
        // 节点高频闪烁 alpha 0.7↔1.0
        burst.nodeGraphics.alpha =
          0.7 + 0.3 * Math.sin(t * Math.PI * 8);
        burst.nodeGraphics.scale.set(
          1.0 + 0.15 * Math.sin(t * Math.PI * 8),
        );
        // 连接线电流流动闪烁 alpha 0.5↔1.0
        burst.lineGraphics.alpha =
          0.5 + 0.5 * Math.sin(t * Math.PI * 10);
        burst.lineGraphics.rotation += dt * 0.001 * Math.PI;
        burst.coreGraphics.alpha = 1.0;
        burst.coreGraphics.scale.set(1.0 + 0.05 * Math.sin(t * Math.PI * 8));
      } else {
        // 阶段3 消散：整体渐隐，连接线扩散旋转，节点消散
        const t = (burst.life - phase2End) / (T - phase2End);
        burst.lineGraphics.alpha = 1.0 - t;
        burst.lineGraphics.scale.set(1.0 + 0.3 * t);
        burst.lineGraphics.rotation += dt * 0.002 * Math.PI;
        burst.nodeGraphics.alpha = 1.0 - t;
        burst.coreGraphics.alpha = 1.0 - 0.7 * t;
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
    this.activeCircuits.forEach((_, playerId) => this.removeCircuit(playerId));
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
}
