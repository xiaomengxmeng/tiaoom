/**
 * 熵增扩散器 (Entropy Diffuser) - 控制者流派
 * 前端视觉渲染器
 *
 * 视觉设计（熵增热寂混乱 —— 三大独特视觉符号）：
 * - 熵增场 EntropyField：
 *   · 3 层错相位扩散波纹（12 边不规则多边形，相位错开 0.33）
 *   · 混乱方向粒子（随机加速度 ax/ay + drag 阻力 + 热→冷颜色渐变）
 *   · 8 层径向渐变光环 + 双层主环 + 中心熵增核
 * - 爆发 Burst（热寂奇点）：三阶段动画
 *   · 蓄压（0-15%T）：扩散波纹收缩汇聚至中心
 *   · 爆发（15%-30%T）：热扩散云（6 层 8 边不规则云）+ 混沌粒子风暴（强随机加速度）
 *   · 扩散（30%-100%T）：热云消散 + 余波波纹展开 + 残留粒子飞散
 *
 * API：triggerEntropyField / removeEntropyField / triggerBurst / update / setScale / clear / destroy
 * 所有动画由 update(dt) 驱动，不使用 rAF / setTimeout。
 */

import * as PIXI from 'pixi.js';
import { ParticlePool } from '../systems/ParticlePool';
import {
  BaseWeaponEffectRenderer,
  type ActiveBurstBase,
  type Palette,
} from './BaseWeaponEffectRenderer';

// ══════════════════════════════════════════════════════
//  颜色常量（熵增热寂：热橙 → 混乱黄 → 冷蓝）
// ══════════════════════════════════════════════════════

const ENTROPY_HEAT = 0xff4400; // 热橙（粒子起始色 / 熵增热源）
const ENTROPY_CHAOS = 0xffcc00; // 混乱黄（默认主题色 / 中层过渡）
const ENTROPY_COLD = 0x3300cc; // 冷蓝（粒子终止色 / 熵增冷寂）

// ══════════════════════════════════════════════════════
//  数据结构
// ══════════════════════════════════════════════════════

/** 活跃熵增场实例（常驻，扩散波纹循环播放） */
interface ActiveEntropyField {
  container: PIXI.Container;
  rippleGraphics: PIXI.Graphics; // 3 层错相位扩散波纹（不规则多边形）
  haloGraphics: PIXI.Graphics; // 8 层渐变光环 + 双层主环 + 中心核
  particleTimer: number; // 混乱粒子节流计时器
  life: number; // ms 累计
  maxLife: number;
  x: number;
  y: number;
  radius: number;
  themeColor: number;
  palette: Palette;
}

/** 活跃爆发特效（蓄压 → 热寂奇点 → 扩散） */
interface ActiveEntropyBurst extends ActiveBurstBase {
  coreGraphics: PIXI.Graphics; // 热扩散云（多层不规则云）
  haloGraphics: PIXI.Graphics; // 收缩波纹 / 余波光晕
  x: number;
  y: number;
}

// ══════════════════════════════════════════════════════
//  渲染器
// ══════════════════════════════════════════════════════

export class EntropyDiffuserRenderer extends BaseWeaponEffectRenderer {
  private activeFields = new Map<string, ActiveEntropyField>();
  private activeBursts = new Map<string, ActiveEntropyBurst>();

  constructor(fieldContainer: PIXI.Container, particlePool: ParticlePool) {
    super(fieldContainer, particlePool);
  }

  // ═══ 熵增场 ═══

  /**
   * 触发熵增场视觉效果
   * @param playerId 玩家 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param radius 熵增场半径（逻辑 px）
   * @param themeColor 主题色（默认混乱黄）
   */
  triggerEntropyField(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor: number = ENTROPY_CHAOS,
  ): void {
    // 已存在则仅更新位置与半径
    const existing = this.activeFields.get(playerId);
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

    const haloGraphics = new PIXI.Graphics();
    const rippleGraphics = new PIXI.Graphics();
    container.addChild(haloGraphics, rippleGraphics);

    this.drawFieldHalo(haloGraphics, radius, palette);

    const field: ActiveEntropyField = {
      container,
      rippleGraphics,
      haloGraphics,
      particleTimer: 0,
      life: 0,
      maxLife: Infinity, // 常驻，直到手动移除
      x,
      y,
      radius,
      themeColor,
      palette,
    };
    this.activeFields.set(playerId, field);
  }

  /** 移除熵增场 */
  removeEntropyField(playerId: string): void {
    const f = this.activeFields.get(playerId);
    if (!f) return;
    this.container.removeChild(f.container);
    f.container.destroy({ children: true });
    this.activeFields.delete(playerId);
  }

  /**
   * 绘制场光晕：8 层径向渐变（高亮→阴影）+ 双层主环 + 中心熵增核
   */
  private drawFieldHalo(g: PIXI.Graphics, radius: number, palette: Palette): void {
    g.clear();
    this.drawMultilayerCircle(
      g,
      radius,
      8,
      (t) => this.interpolateColor(palette.highlight, palette.shadow, t),
      (t) => (1 - t) * 0.35,
    );
    // 双层主环
    g.circle(0, 0, radius);
    g.stroke({ color: palette.glow, width: 1, alpha: 0.7 });
    g.circle(0, 0, radius * 0.95);
    g.stroke({ color: palette.highlight, width: 0.4, alpha: 0.5 });
    // 中心熵增核（高亮实心 + 主色辉光外环）
    g.circle(0, 0, 4);
    g.fill({ color: palette.highlight, alpha: 1 });
    g.circle(0, 0, 6);
    g.stroke({ color: palette.glow, width: 1, alpha: 0.8 });
  }

  /**
   * 绘制 3 层错相位扩散波纹（12 边不规则多边形）
   * - 每层相位错开 0.33，形成连续向外扩散的视觉
   * - 顶点带正弦抖动，呈现熵增不规则形态
   * @param life 时间(ms)，驱动波纹扩散
   */
  private drawDiffusionWaves(
    g: PIXI.Graphics,
    radius: number,
    palette: Palette,
    life: number,
  ): void {
    g.clear();
    for (let i = 0; i < 3; i++) {
      const phase = (life * 0.0008 + i * 0.33) % 1;
      const r = radius * (0.2 + phase * 0.9);
      // 12 边不规则多边形
      const sides = 12;
      const points: [number, number][] = [];
      for (let j = 0; j < sides; j++) {
        const angle = (j * Math.PI * 2) / sides;
        const jitter = 1 + 0.1 * Math.sin(j * 2.3 + life * 0.001);
        points.push([Math.cos(angle) * r * jitter, Math.sin(angle) * r * jitter]);
      }
      g.moveTo(points[0][0], points[0][1]);
      for (let j = 1; j < sides; j++) g.lineTo(points[j][0], points[j][1]);
      g.closePath();
      g.stroke({ color: palette.glow, width: 1.5, alpha: (1 - phase) * 0.5 });
    }
  }

  /**
   * 生成混乱方向粒子（核心独特符号）
   * - 方向完全随机（不是径向向外）
   * - 速度随机（20-120 px/s）
   * - 随机加速度 ax/ay（混乱轨迹）
   * - drag 阻力衰减（粒子最终减速）
   * - tintStart→tintEnd 热→冷颜色渐变（熵增热寂）
   */
  private spawnChaosParticles(f: ActiveEntropyField): void {
    for (let i = 0; i < 2; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 20 + Math.random() * 100;
      this.particlePool.emit({
        x: f.x + (Math.random() - 0.5) * f.radius,
        y: f.y + (Math.random() - 0.5) * f.radius,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        ax: (Math.random() - 0.5) * 100, // 随机加速度（混乱方向）
        ay: (Math.random() - 0.5) * 100,
        drag: 0.8, // 阻力衰减
        life: 600 + Math.random() * 400,
        scaleStart: 1.5,
        scaleEnd: 0,
        alphaStart: 0.7,
        alphaEnd: 0,
        tint: f.palette.glow,
        tintStart: ENTROPY_HEAT,
        tintEnd: ENTROPY_COLD, // 热→冷渐变
        radius: 2,
      });
    }
  }

  // ═══ 爆发特效（热寂奇点：蓄压 → 爆发 → 扩散） ═══

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
    themeColor: number = ENTROPY_CHAOS,
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

    const coreGraphics = new PIXI.Graphics(); // 热扩散云
    const haloGraphics = new PIXI.Graphics(); // 收缩波纹 / 余波光晕
    container.addChild(coreGraphics, haloGraphics);

    const burst: ActiveEntropyBurst = {
      container,
      life: 0,
      maxLife: durationMs ?? 1500,
      themeColor,
      radius,
      particleTimer: 0,
      palette,
      coreGraphics,
      haloGraphics,
      x,
      y,
    };
    this.activeBursts.set(playerId, burst);
  }

  // ═══ 三阶段动画钩子 ═══

  /** 阶段1 蓄压（0-15%T）：扩散波纹收缩汇聚至中心 */
  protected phase1Charge(burst: ActiveBurstBase, t: number): void {
    const b = burst as ActiveEntropyBurst;
    const ease = this.easeOutCubic(t);
    // 扩散波纹收缩：半径 1.0 → 0.2，alpha 1.0 → 0.7
    this.drawDiffusionWaves(b.haloGraphics, b.radius * (1 - ease * 0.8), b.palette, b.life);
    b.haloGraphics.alpha = 1 - t * 0.3;
    // 热扩散云蓄压隐藏
    b.coreGraphics.alpha = 0;
  }

  /** 阶段2 爆发（15%-30%T）：热扩散云 + 混沌粒子风暴 */
  protected phase2Burst(burst: ActiveBurstBase, t: number): void {
    const b = burst as ActiveEntropyBurst;
    const ease = this.easeOutCubic(t);

    // 热扩散云：6 层 8 边不规则云（高亮→阴影渐变）
    b.coreGraphics.clear();
    for (let i = 0; i < 6; i++) {
      const r = b.radius * (0.1 + i * 0.12) * ease;
      const sides = 8;
      const points: [number, number][] = [];
      for (let j = 0; j < sides; j++) {
        const angle = (j * Math.PI * 2) / sides;
        const jitter = 1 + 0.2 * Math.sin(j * 3.7 + b.life * 0.002);
        points.push([Math.cos(angle) * r * jitter, Math.sin(angle) * r * jitter]);
      }
      b.coreGraphics.moveTo(points[0][0], points[0][1]);
      for (let j = 1; j < sides; j++) {
        b.coreGraphics.lineTo(points[j][0], points[j][1]);
      }
      b.coreGraphics.closePath();
      b.coreGraphics.fill({
        color: this.interpolateColor(b.palette.highlight, b.palette.shadow, i / 5),
        alpha: 0.3 * ease,
      });
    }
    b.coreGraphics.alpha = 1;

    // 收缩波纹消散
    b.haloGraphics.alpha = (1 - t) * 0.5;

    // 混沌粒子风暴：每帧节流喷射 6 个强随机加速度粒子
    b.particleTimer += 16;
    if (b.particleTimer > 30) {
      b.particleTimer = 0;
      for (let i = 0; i < 6; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 80 + Math.random() * 150;
        this.particlePool.emit({
          x: b.x,
          y: b.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          ax: (Math.random() - 0.5) * 200, // 强随机加速度（风暴感）
          ay: (Math.random() - 0.5) * 200,
          drag: 0.5,
          life: 800,
          scaleStart: 2,
          scaleEnd: 0,
          alphaStart: 1,
          alphaEnd: 0,
          tint: ENTROPY_HEAT,
          tintStart: ENTROPY_HEAT,
          tintEnd: ENTROPY_COLD, // 热→冷渐变
          radius: 2.5,
        });
      }
    }
  }

  /** 阶段3 扩散（30%-100%T）：热云消散 + 余波波纹 + 残留粒子 */
  protected phase3Diffuse(burst: ActiveBurstBase, t: number): void {
    const b = burst as ActiveEntropyBurst;
    const ease = this.easeOutCubic(t);

    // 热扩散云消散（缩小 + 淡出）
    b.coreGraphics.alpha = (1 - ease) * 0.7;
    b.coreGraphics.scale.set(1 + ease * 0.3);

    // 余波波纹展开
    this.drawDiffusionWaves(b.haloGraphics, b.radius * (1 + ease * 0.5), b.palette, b.life);
    b.haloGraphics.alpha = (1 - ease) * 0.4;

    // 残留粒子（较弱加速度，继续飞散）
    b.particleTimer += 16;
    if (b.particleTimer > 100) {
      b.particleTimer = 0;
      for (let i = 0; i < 2; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 40 + Math.random() * 80;
        this.particlePool.emit({
          x: b.x,
          y: b.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          ax: (Math.random() - 0.5) * 100,
          ay: (Math.random() - 0.5) * 100,
          drag: 0.7,
          life: 600,
          scaleStart: 1.5,
          scaleEnd: 0,
          alphaStart: 0.6,
          alphaEnd: 0,
          tint: ENTROPY_CHAOS,
          tintStart: ENTROPY_HEAT,
          tintEnd: ENTROPY_COLD,
          radius: 2,
        });
      }
    }
  }

  // ═══ 生命周期 ═══

  /** 每帧更新（由 EffectRenderer 调用，dt 单位 ms） */
  update(dt: number): void {
    // ── 熵增场：扩散波纹动画 + 光晕呼吸 + 混乱粒子 ──
    this.activeFields.forEach((f) => {
      f.life += dt;
      // 重绘 3 层错相位扩散波纹（动画驱动）
      this.drawDiffusionWaves(f.rippleGraphics, f.radius, f.palette, f.life);
      // 光晕呼吸 scale 1.0↔1.05（1s 周期）
      const breath = 1 + 0.05 * Math.sin(f.life * 0.002 * Math.PI);
      f.haloGraphics.scale.set(breath);
      // 混乱粒子：每 200ms 生成 2 个（随机方向 + 随机加速度）
      f.particleTimer += dt;
      if (f.particleTimer > 200) {
        f.particleTimer = 0;
        this.spawnChaosParticles(f);
      }
    });

    // ── 爆发：三阶段动画调度 ──
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

  private removeBurstInstance(b: ActiveEntropyBurst): void {
    this.container.removeChild(b.container);
    b.container.destroy({ children: true });
  }

  /** 缩放变化时同步已有实体 */
  protected onScaleChange(scale: number): void {
    this.activeFields.forEach((f) => {
      if (!f.container.destroyed) f.container.scale.set(scale);
    });
    this.activeBursts.forEach((b) => {
      if (!b.container.destroyed) b.container.scale.set(scale);
    });
  }

  /** 清除所有特效（不销毁渲染器） */
  clear(): void {
    this.activeFields.forEach((f) => {
      this.container.removeChild(f.container);
      f.container.destroy({ children: true });
    });
    this.activeFields.clear();
    this.activeBursts.forEach((b) => this.removeBurstInstance(b));
    this.activeBursts.clear();
  }
}
