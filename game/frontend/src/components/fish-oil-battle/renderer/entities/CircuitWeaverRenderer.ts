/**
 * 电路编织者 (Circuit Weaver) - 工程师流派
 * 前端视觉渲染器
 *
 * 视觉主题（Spec §6.1 —— 电路网络）：
 * - 电路网络（常驻）：
 *   · 6 节点六边形网络（开放连线，非闭合护盾）
 *   · 六边形边 + 对角线（跳 2）连接
 *   · 切向电流粒子（沿六边形边流动）
 *   · 网络闪烁（节点脉动 + 连接线呼吸）
 * - 爆发：电路过载
 *   · 蓄压（0-15%T）：网络从中心展开
 *   · 过载（15-30%T）：网络闪烁 + 节点爆炸 + 电流风暴
 *   · 消散（30-100%T）：网络扩散淡出
 *
 * 与 BastionBuilder 的区别：Bastion 用闭合六边形护盾，CircuitWeaver 用开放节点连线 + 电流粒子
 *
 * 独特符号：6 节点六边形网络、对角线连接、切向电流粒子、网络闪烁、电流风暴
 *
 * API：triggerCircuit / removeCircuit / triggerBurst / update / setScale / clear / destroy
 * 所有动画由 update(dt) 驱动。
 */

import * as PIXI from 'pixi.js';
import { ParticlePool } from '../systems/ParticlePool';
import { BaseWeaponEffectRenderer, type ActiveBurstBase, type Palette } from './BaseWeaponEffectRenderer';

// ══════════════════════════════════════════════════════
//  颜色常量（伏特绿）
// ══════════════════════════════════════════════════════

const CIRCUIT_DEFAULT = 0x00ffaa; // 默认主题色（伏特绿）
const CIRCUIT_SPARK = 0xaaff00;  // 电流火花色（粒子 tint）

/** 电路节点数量（六边形分布） */
const CIRCUIT_NODE_COUNT = 6;

// ══════════════════════════════════════════════════════
//  数据结构
// ══════════════════════════════════════════════════════

/** 活跃电路网络实例（常驻） */
interface ActiveCircuitField {
  container: PIXI.Container;
  networkGraphics: PIXI.Graphics; // 6 节点网络 + 对角线 + 中心
  particleTimer: number;
  life: number; // ms 累计
  x: number;
  y: number;
  radius: number;
  themeColor: number;
  palette: Palette;
}

/** 活跃爆发特效（电路过载） */
interface ActiveCircuitBurst extends ActiveBurstBase {
  coreGraphics: PIXI.Graphics; // 过载网络
  x: number;
  y: number;
}

// ══════════════════════════════════════════════════════
//  渲染器
// ══════════════════════════════════════════════════════

export class CircuitWeaverRenderer extends BaseWeaponEffectRenderer {
  private activeCircuits = new Map<string, ActiveCircuitField>();
  private activeBursts = new Map<string, ActiveCircuitBurst>();

  constructor(fieldContainer: PIXI.Container, particlePool: ParticlePool) {
    super(fieldContainer, particlePool);
  }

  // ═══ 电路网络（常驻） ═══

  /**
   * 触发电路网络视觉效果
   * @param playerId 玩家 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param radius 电路网络半径（逻辑 px）
   * @param themeColor 主题色（默认伏特绿）
   */
  triggerCircuit(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor: number = CIRCUIT_DEFAULT,
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

    const palette = this.buildPalette(themeColor);
    const container = new PIXI.Container();
    container.position.set(x, y);
    container.scale.set(this.scale);
    this.container.addChild(container);

    const networkGraphics = new PIXI.Graphics();
    container.addChild(networkGraphics);

    const field: ActiveCircuitField = {
      container,
      networkGraphics,
      particleTimer: 0,
      life: 0,
      x,
      y,
      radius,
      themeColor,
      palette,
    };
    this.activeCircuits.set(playerId, field);
  }

  /** 移除电路网络 */
  removeCircuit(playerId: string): void {
    const field = this.activeCircuits.get(playerId);
    if (!field) return;
    this.container.removeChild(field.container);
    field.container.destroy({ children: true });
    this.activeCircuits.delete(playerId);
  }

  // ═══ 独特视觉：6 节点六边形网络 + 对角线 ═══

  /**
   * 绘制 6 节点六边形网络：
   * - 6 个节点位于半径 radius*0.7 的圆周上，60° 均分
   * - 六边形边连接（相邻节点）
   * - 对角线连接（跳 2，形成星形网络）
   * - 节点闪烁脉动
   * - 中心节点
   */
  private drawCircuitNetwork(
    g: PIXI.Graphics,
    radius: number,
    palette: Palette,
    life: number,
  ): void {
    g.clear();
    // 6 个节点
    const nodes: [number, number][] = [];
    for (let i = 0; i < CIRCUIT_NODE_COUNT; i++) {
      const angle = (i * Math.PI) / 3;
      nodes.push([Math.cos(angle) * radius * 0.7, Math.sin(angle) * radius * 0.7]);
    }
    // 节点间连线：六边形边 + 对角线（跳 2）
    for (let i = 0; i < CIRCUIT_NODE_COUNT; i++) {
      // 六边形边
      const next = (i + 1) % CIRCUIT_NODE_COUNT;
      g.moveTo(nodes[i][0], nodes[i][1]);
      g.lineTo(nodes[next][0], nodes[next][1]);
      g.stroke({ color: palette.glow, width: 1, alpha: 0.5 });
      // 对角线（跳 2）
      const diag = (i + 2) % CIRCUIT_NODE_COUNT;
      g.moveTo(nodes[i][0], nodes[i][1]);
      g.lineTo(nodes[diag][0], nodes[diag][1]);
      g.stroke({ color: palette.dim, width: 0.5, alpha: 0.3 });
    }
    // 节点（闪烁脉动）
    const pulse = 0.5 + 0.5 * Math.sin(life * 0.005 * Math.PI);
    for (const [nx, ny] of nodes) {
      g.circle(nx, ny, 3 + pulse);
      g.fill({ color: palette.highlight, alpha: 0.8 });
      g.circle(nx, ny, 6);
      g.stroke({ color: palette.glow, width: 1, alpha: 0.4 });
    }
    // 中心节点
    g.circle(0, 0, 4);
    g.fill({ color: palette.highlight });
  }

  // ═══ 独特视觉：切向电流粒子（沿六边形边流动） ═══

  /**
   * 生成切向电流粒子：沿六边形边方向流动
   * 每次生成 3 个粒子，随机选择一条边，沿边方向运动
   */
  private spawnCurrentParticles(f: ActiveCircuitField): void {
    const s = this.scale;
    for (let i = 0; i < 3; i++) {
      const edgeIdx = Math.floor(Math.random() * CIRCUIT_NODE_COUNT);
      const angle1 = (edgeIdx * Math.PI) / 3;
      const angle2 = ((edgeIdx + 1) * Math.PI) / 3;
      const t = Math.random();
      const startX = Math.cos(angle1) * f.radius * 0.7 * s;
      const startY = Math.sin(angle1) * f.radius * 0.7 * s;
      const endX = Math.cos(angle2) * f.radius * 0.7 * s;
      const endY = Math.sin(angle2) * f.radius * 0.7 * s;
      const px = startX + (endX - startX) * t;
      const py = startY + (endY - startY) * t;
      this.particlePool.emit({
        x: f.x + px,
        y: f.y + py,
        vx: (endX - startX) * 0.5,
        vy: (endY - startY) * 0.5,
        drag: 0.9,
        life: 300,
        scaleStart: 1.5,
        scaleEnd: 0,
        alphaStart: 1,
        alphaEnd: 0,
        tint: CIRCUIT_SPARK,
        radius: 1.5 * s,
      });
    }
  }

  // ═══ 爆发：电路过载 ═══

  /**
   * 触发爆发视觉效果
   * @param playerId 玩家 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param radius 爆发范围（逻辑 px）
   * @param themeColor 主题色
   * @param durationMs 持续时间（ms），默认 1500
   */
  triggerBurst(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor: number = CIRCUIT_DEFAULT,
    durationMs?: number,
  ): void {
    // 若已存在，先销毁旧实例
    const existing = this.activeBursts.get(playerId);
    if (existing) {
      this.removeBurstInstance(existing);
    }

    const palette = this.buildPalette(themeColor);
    const container = new PIXI.Container();
    container.position.set(x, y);
    container.scale.set(this.scale);
    this.container.addChild(container);

    const coreGraphics = new PIXI.Graphics();
    container.addChild(coreGraphics);

    const burst: ActiveCircuitBurst = {
      container,
      life: 0,
      maxLife: durationMs ?? 1500,
      themeColor,
      radius,
      particleTimer: 0,
      palette,
      coreGraphics,
      x,
      y,
    };
    this.activeBursts.set(playerId, burst);
  }

  // ═══ 三阶段钩子 ═══

  /** 阶段1 蓄压（0-15%T）：网络从中心展开，节点逐一显现 */
  protected phase1Charge(burst: ActiveBurstBase, t: number): void {
    const b = burst as ActiveCircuitBurst;
    const ease = this.easeOutCubic(t);
    b.coreGraphics.clear();
    // 网络节点从中心向外展开
    const nodes: [number, number][] = [];
    for (let i = 0; i < CIRCUIT_NODE_COUNT; i++) {
      const angle = (i * Math.PI) / 3;
      nodes.push([
        Math.cos(angle) * b.radius * 0.7 * ease,
        Math.sin(angle) * b.radius * 0.7 * ease,
      ]);
    }
    // 连接线渐显（六边形边 + 对角线）
    for (let i = 0; i < CIRCUIT_NODE_COUNT; i++) {
      const next = (i + 1) % CIRCUIT_NODE_COUNT;
      b.coreGraphics.moveTo(nodes[i][0], nodes[i][1]);
      b.coreGraphics.lineTo(nodes[next][0], nodes[next][1]);
      b.coreGraphics.stroke({ color: b.palette.glow, width: 1, alpha: 0.5 * ease });
      const diag = (i + 2) % CIRCUIT_NODE_COUNT;
      b.coreGraphics.moveTo(nodes[i][0], nodes[i][1]);
      b.coreGraphics.lineTo(nodes[diag][0], nodes[diag][1]);
      b.coreGraphics.stroke({ color: b.palette.dim, width: 0.5, alpha: 0.3 * ease });
    }
    // 节点渐显
    for (const [nx, ny] of nodes) {
      b.coreGraphics.circle(nx, ny, 3 * ease);
      b.coreGraphics.fill({ color: b.palette.highlight, alpha: 0.8 * ease });
    }
    // 中心节点
    b.coreGraphics.circle(0, 0, 4 * ease);
    b.coreGraphics.fill({ color: b.palette.highlight, alpha: ease });
    b.coreGraphics.alpha = ease;
  }

  /** 阶段2 过载（15-30%T）：网络闪烁 + 节点爆炸 + 电流风暴 */
  protected phase2Burst(burst: ActiveBurstBase, t: number): void {
    const b = burst as ActiveCircuitBurst;
    const ease = this.easeOutCubic(t);
    // 网络过载闪烁（高频明暗交替）
    const flash = Math.sin(b.life * 0.02) > 0 ? 1 : 0.3;
    b.coreGraphics.clear();
    // 网络节点（过载展开）
    const nodes: [number, number][] = [];
    for (let i = 0; i < CIRCUIT_NODE_COUNT; i++) {
      const angle = (i * Math.PI) / 3;
      nodes.push([
        Math.cos(angle) * b.radius * 0.7 * ease,
        Math.sin(angle) * b.radius * 0.7 * ease,
      ]);
    }
    // 六边形边（过载高亮闪烁）
    for (let i = 0; i < CIRCUIT_NODE_COUNT; i++) {
      const next = (i + 1) % CIRCUIT_NODE_COUNT;
      b.coreGraphics.moveTo(nodes[i][0], nodes[i][1]);
      b.coreGraphics.lineTo(nodes[next][0], nodes[next][1]);
      b.coreGraphics.stroke({ color: b.palette.highlight, width: 3, alpha: flash });
    }
    // 节点爆炸（闪烁填充）
    for (const [nx, ny] of nodes) {
      b.coreGraphics.circle(nx, ny, 5 * ease);
      b.coreGraphics.fill({ color: b.palette.highlight, alpha: flash });
    }
    // 中心过载核
    b.coreGraphics.circle(0, 0, 6 * ease);
    b.coreGraphics.fill({ color: b.palette.primary, alpha: flash });
    // 电流风暴：节流生成爆发粒子（particleTimer += 16 修复 dt 累积 bug）
    b.particleTimer += 16;
    if (b.particleTimer > 20) {
      b.particleTimer = 0;
      this.spawnCurrentStorm(b);
    }
  }

  /** 阶段3 消散（30-100%T）：网络扩散淡出 */
  protected phase3Diffuse(burst: ActiveBurstBase, t: number): void {
    const b = burst as ActiveCircuitBurst;
    const ease = this.easeOutCubic(t);
    b.coreGraphics.clear();
    // 网络扩散（半径增大 + 透明度降低）
    const expand = 1 + ease * 0.3;
    const fade = 1 - ease;
    const nodes: [number, number][] = [];
    for (let i = 0; i < CIRCUIT_NODE_COUNT; i++) {
      const angle = (i * Math.PI) / 3;
      nodes.push([
        Math.cos(angle) * b.radius * 0.7 * expand,
        Math.sin(angle) * b.radius * 0.7 * expand,
      ]);
    }
    // 连接线淡出
    for (let i = 0; i < CIRCUIT_NODE_COUNT; i++) {
      const next = (i + 1) % CIRCUIT_NODE_COUNT;
      b.coreGraphics.moveTo(nodes[i][0], nodes[i][1]);
      b.coreGraphics.lineTo(nodes[next][0], nodes[next][1]);
      b.coreGraphics.stroke({ color: b.palette.glow, width: 1, alpha: 0.5 * fade });
      const diag = (i + 2) % CIRCUIT_NODE_COUNT;
      b.coreGraphics.moveTo(nodes[i][0], nodes[i][1]);
      b.coreGraphics.lineTo(nodes[diag][0], nodes[diag][1]);
      b.coreGraphics.stroke({ color: b.palette.dim, width: 0.5, alpha: 0.3 * fade });
    }
    // 节点淡出
    for (const [nx, ny] of nodes) {
      b.coreGraphics.circle(nx, ny, 3);
      b.coreGraphics.fill({ color: b.palette.highlight, alpha: 0.8 * fade });
    }
    // 中心节点淡出
    b.coreGraphics.circle(0, 0, 4);
    b.coreGraphics.fill({ color: b.palette.highlight, alpha: fade });
    b.coreGraphics.alpha = fade;
  }

  // ═══ 独特视觉：电流风暴（爆发期向外辐射） ═══

  private spawnCurrentStorm(b: ActiveCircuitBurst): void {
    const s = this.scale;
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (100 + Math.random() * 200) * s;
      this.particlePool.emit({
        x: b.x,
        y: b.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        drag: 0.7,
        life: 500,
        scaleStart: 1.5,
        scaleEnd: 0,
        alphaStart: 1,
        alphaEnd: 0,
        tint: CIRCUIT_SPARK,
        radius: 2 * s,
      });
    }
  }

  // ═══ 生命周期 ═══

  update(dt: number): void {
    // ── 电路网络：6 节点网络闪烁 + 切向电流粒子 ──
    this.activeCircuits.forEach((field) => {
      field.life += dt;
      // 每帧重绘网络（节点脉动 + 连接线呼吸）
      this.drawCircuitNetwork(field.networkGraphics, field.radius, field.palette, field.life);
      // 切向电流粒子（节流：每 400ms 生成）
      field.particleTimer += dt;
      if (field.particleTimer > 400) {
        field.particleTimer = 0;
        this.spawnCurrentParticles(field);
      }
    });

    // ── 爆发：三阶段动画（蓄压→过载→消散） ──
    const expired: string[] = [];
    this.activeBursts.forEach((b, key) => {
      const isExpired = this.runBurstAnimation(b, dt);
      if (isExpired) {
        expired.push(key);
      }
    });
    for (const key of expired) {
      const b = this.activeBursts.get(key);
      if (b) this.removeBurstInstance(b);
      this.activeBursts.delete(key);
    }
  }

  private removeBurstInstance(b: ActiveCircuitBurst): void {
    this.container.removeChild(b.container);
    b.container.destroy({ children: true });
  }

  protected onScaleChange(scale: number): void {
    this.activeCircuits.forEach((f) => {
      if (!f.container.destroyed) f.container.scale.set(scale);
    });
    this.activeBursts.forEach((b) => {
      if (!b.container.destroyed) b.container.scale.set(scale);
    });
  }

  clear(): void {
    this.activeCircuits.forEach((f) => {
      this.container.removeChild(f.container);
      f.container.destroy({ children: true });
    });
    this.activeCircuits.clear();
    this.activeBursts.forEach((b) => this.removeBurstInstance(b));
    this.activeBursts.clear();
  }
}
