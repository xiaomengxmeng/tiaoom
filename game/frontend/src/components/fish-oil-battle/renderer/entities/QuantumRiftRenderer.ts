/**
 * 量子裂隙 (Quantum Rift) - 变奏者流派
 * 前端视觉渲染器（重写版）
 *
 * 视觉主题：7 条锯齿裂缝（伪随机折线）+ 黑色吸光核 + 量子涨落粒子
 * 爆发：维度撕裂（裂缝扩展 + 虚空涌出 + 量子涟漪）
 *
 * 独特视觉符号：
 * - 锯齿裂缝：7 条由内向外、确定性伪随机折线（黑色 + 青色辉光边缘）
 * - 黑色吸光核：多层径向渐变 + 黑色实心核，呼吸脉动
 * - 量子涨落：随机出现/消失的青色闪烁粒子
 * - 裂缝扩展：爆发阶段裂缝从中心向外撕开
 * - 量子涟漪：向外扩散的青色圆环
 *
 * 三阶段动画：
 * - 蓄压（0-15%T）：裂缝汇聚显现 + 黑核生长
 * - 爆发（15%-30%T）：裂缝扩展 + 虚空涌出 + 量子涟漪
 * - 扩散（30%-100%T）：裂缝消散扩张 + 黑核淡出 + 涟漪继续扩散
 */

import * as PIXI from 'pixi.js';
import { ParticlePool } from '../systems/ParticlePool';
import { BaseWeaponEffectRenderer, type ActiveBurstBase, type Palette } from './BaseWeaponEffectRenderer';

// ══════════════════════════════════════════════════════
//  颜色常量（量子虚空）
// ══════════════════════════════════════════════════════

const RIFT_VOID = 0x000000; // 黑色吸光核
const RIFT_DEEP = 0x003344; // 深青黑（渐变外缘）
const RIFT_DEFAULT_THEME = 0x00ffdd; // 变奏者青（默认主题色）

/** 裂缝数量（常驻 + 爆发一致） */
const RIFT_CRACK_COUNT = 7;
/** 常驻裂缝分段 */
const RIFT_CRACK_SEGMENTS = 4;
/** 爆发裂缝分段（更细密以表现撕裂感） */
const RIFT_BURST_SEGMENTS = 6;

// ══════════════════════════════════════════════════════
//  数据结构
// ══════════════════════════════════════════════════════

/** 活跃量子裂隙实例（常驻） */
interface ActiveRiftField {
  container: PIXI.Container;
  crackGraphics: PIXI.Graphics; // 7 条锯齿裂缝
  coreGraphics: PIXI.Graphics; // 黑色吸光核
  particleTimer: number;
  life: number;
  x: number;
  y: number;
  radius: number;
  themeColor: number;
  palette: Palette;
}

/** 活跃爆发特效（蓄压 → 撕裂 → 扩散 三阶段） */
interface ActiveRiftBurst extends ActiveBurstBase {
  bladeGraphics: PIXI.Graphics; // 裂缝扩展
  coreGraphics: PIXI.Graphics; // 虚空涌出（黑核）
  haloGraphics: PIXI.Graphics; // 量子涟漪
  x: number;
  y: number;
}

// ══════════════════════════════════════════════════════
//  渲染器
// ══════════════════════════════════════════════════════

export class QuantumRiftRenderer extends BaseWeaponEffectRenderer {
  private activeRifts = new Map<string, ActiveRiftField>();
  private activeBursts = new Map<string, ActiveRiftBurst>();

  constructor(fieldContainer: PIXI.Container, particlePool: ParticlePool) {
    super(fieldContainer, particlePool);
  }

  // ══════════════════════════════════════════════════════
  //  量子裂隙 Rift（常驻）
  // ══════════════════════════════════════════════════════

  /**
   * 触发量子裂隙视觉效果
   * @param playerId 玩家 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param radius 裂隙半径（逻辑 px）
   * @param themeColor 主题色（默认变奏者青）
   */
  triggerRift(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor: number = RIFT_DEFAULT_THEME,
  ): void {
    // 已存在则仅更新位置与半径
    const existing = this.activeRifts.get(playerId);
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

    const crackGraphics = new PIXI.Graphics();
    const coreGraphics = new PIXI.Graphics();
    container.addChild(crackGraphics, coreGraphics);

    const field: ActiveRiftField = {
      container,
      crackGraphics,
      coreGraphics,
      particleTimer: 0,
      life: 0,
      x,
      y,
      radius,
      themeColor,
      palette,
    };
    this.activeRifts.set(playerId, field);
  }

  /** 移除量子裂隙 */
  removeRift(playerId: string): void {
    const f = this.activeRifts.get(playerId);
    if (!f) return;
    this.container.removeChild(f.container);
    f.container.destroy({ children: true });
    this.activeRifts.delete(playerId);
  }

  // ══════════════════════════════════════════════════════
  //  独特视觉符号
  // ══════════════════════════════════════════════════════

  /**
   * 1. 7 条锯齿裂缝（伪随机折线）
   * 使用确定性伪随机（基于角度 + 段索引），保证裂缝形态稳定。
   * 旋转通过手动变换顶点实现（避免 set rotation 后续 moveTo/lineTo 仍用旧坐标）。
   */
  private drawJaggedCracks(
    g: PIXI.Graphics,
    radius: number,
    palette: Palette,
    life: number,
  ): void {
    g.clear();
    const rotation = life * 0.0003 * Math.PI; // 缓慢旋转
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    for (let i = 0; i < RIFT_CRACK_COUNT; i++) {
      const baseAngle = (i * Math.PI * 2) / RIFT_CRACK_COUNT;
      let prevX = 0;
      let prevY = 0;
      for (let seg = 1; seg <= RIFT_CRACK_SEGMENTS; seg++) {
        const t = seg / RIFT_CRACK_SEGMENTS;
        const r = radius * t;
        // 确定性伪随机抖动（基于 i 和 seg，保证可复现）
        const seed = i * 7.3 + seg * 3.7;
        const jitter = (Math.sin(seed) + Math.cos(seed * 1.7)) * 0.15;
        const segAngle = baseAngle + jitter;
        // 原始顶点
        const ox = Math.cos(segAngle) * r;
        const oy = Math.sin(segAngle) * r;
        // 手动旋转（避免依赖 g.rotation）
        const x = ox * cos - oy * sin;
        const y = ox * sin + oy * cos;
        if (seg > 1) {
          // 黑色裂缝主体
          g.moveTo(prevX, prevY);
          g.lineTo(x, y);
          g.stroke({ color: RIFT_VOID, width: 3, alpha: 0.9 });
          // 青色边缘辉光
          g.moveTo(prevX, prevY);
          g.lineTo(x, y);
          g.stroke({ color: palette.glow, width: 1, alpha: 0.8 });
        }
        prevX = x;
        prevY = y;
      }
    }
  }

  /**
   * 2. 黑色吸光核（多层径向渐变 + 黑色实心核）
   * 呼吸脉动 scale 0.8↔1.0
   */
  private drawVoidCore(
    g: PIXI.Graphics,
    radius: number,
    _palette: Palette,
    life: number,
  ): void {
    void _palette;
    g.clear();
    const pulse = 0.8 + 0.2 * Math.sin(life * 0.003 * Math.PI);
    // 多层渐变：中心黑 → 外圈深青黑
    this.drawMultilayerCircle(
      g,
      radius * 0.15,
      10,
      (t) => this.interpolateColor(RIFT_VOID, RIFT_DEEP, t),
      (t) => (1 - t * 0.3) * pulse,
    );
    // 黑色实心核
    g.circle(0, 0, Math.max(0.5, radius * 0.08));
    g.fill({ color: RIFT_VOID });
  }

  /**
   * 3. 量子涨落粒子（随机出现消失）
   * 利用 particlePool.emit，由 update 节流调用。
   */
  private spawnQuantumFluctuation(f: ActiveRiftField): void {
    const s = this.scale;
    for (let i = 0; i < 2; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = f.radius * s * Math.random() * 0.8;
      this.particlePool.emit({
        x: f.x + Math.cos(angle) * dist,
        y: f.y + Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * 20,
        vy: (Math.random() - 0.5) * 20,
        life: 300 + Math.random() * 300,
        scaleStart: 1.5,
        scaleEnd: 0,
        alphaStart: 0.8,
        alphaEnd: 0,
        tint: f.palette.glow,
        radius: 1.5 * s,
      });
    }
  }

  // ══════════════════════════════════════════════════════
  //  爆发特效（蓄压 → 撕裂 → 扩散 三阶段）
  // ══════════════════════════════════════════════════════

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
    themeColor: number = RIFT_DEFAULT_THEME,
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

    const bladeGraphics = new PIXI.Graphics();
    const coreGraphics = new PIXI.Graphics();
    const haloGraphics = new PIXI.Graphics();
    container.addChild(bladeGraphics, coreGraphics, haloGraphics);

    const burst: ActiveRiftBurst = {
      container,
      life: 0,
      maxLife: durationMs ?? 1500,
      themeColor,
      radius,
      particleTimer: 0,
      palette,
      bladeGraphics,
      coreGraphics,
      haloGraphics,
      x,
      y,
    };
    this.activeBursts.set(playerId, burst);
  }

  // ══════════════════════════════════════════════════════
  //  三阶段钩子
  // ══════════════════════════════════════════════════════

  /** 阶段1 蓄压：裂缝汇聚显现 + 黑核生长 */
  protected phase1Charge(burst: ActiveBurstBase, t: number): void {
    const b = burst as ActiveRiftBurst;
    const ease = this.easeOutCubic(t);
    // 裂缝从 0.3 半径生长到 0.8 半径，alpha 0→1
    b.bladeGraphics.clear();
    this.drawJaggedCracks(
      b.bladeGraphics,
      b.radius * (0.3 + 0.5 * ease),
      b.palette,
      b.life,
    );
    b.bladeGraphics.alpha = t;
    // 黑核逐渐显现
    b.coreGraphics.clear();
    const voidR = b.radius * 0.08 * ease;
    if (voidR > 0.5) {
      this.drawMultilayerCircle(
        b.coreGraphics,
        voidR,
        8,
        (ti) => this.interpolateColor(RIFT_VOID, RIFT_DEEP, ti),
        (ti) => (1 - ti * 0.3) * ease,
      );
      b.coreGraphics.circle(0, 0, Math.max(0.5, voidR * 0.5));
      b.coreGraphics.fill({ color: RIFT_VOID });
    }
    b.coreGraphics.alpha = 1;
    // 涟漪隐藏
    b.haloGraphics.clear();
    b.haloGraphics.alpha = 0;
  }

  /** 阶段2 爆发：维度撕裂（裂缝扩展 + 虚空涌出 + 量子涟漪） */
  protected phase2Burst(burst: ActiveBurstBase, t: number): void {
    const b = burst as ActiveRiftBurst;
    const ease = this.easeOutCubic(t);
    // 裂缝扩展（手动变换顶点支持旋转）
    b.bladeGraphics.clear();
    const len = b.radius * 1.5 * ease;
    const rotation = b.life * 0.001 * Math.PI; // 撕裂旋转
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    for (let i = 0; i < RIFT_CRACK_COUNT; i++) {
      const angle = (i * Math.PI * 2) / RIFT_CRACK_COUNT;
      let prevX = 0;
      let prevY = 0;
      for (let seg = 1; seg <= RIFT_BURST_SEGMENTS; seg++) {
        const tSeg = seg / RIFT_BURST_SEGMENTS;
        const r = len * tSeg;
        const seed = i * 7.3 + seg * 3.7;
        const jitter = (Math.sin(seed) + Math.cos(seed * 1.7)) * 0.2;
        const segAngle = angle + jitter;
        const ox = Math.cos(segAngle) * r;
        const oy = Math.sin(segAngle) * r;
        // 手动旋转
        const x = ox * cos - oy * sin;
        const y = ox * sin + oy * cos;
        if (seg > 1) {
          // 黑色裂缝主体
          b.bladeGraphics.moveTo(prevX, prevY);
          b.bladeGraphics.lineTo(x, y);
          b.bladeGraphics.stroke({ color: RIFT_VOID, width: 4, alpha: ease });
          // 青色边缘辉光
          b.bladeGraphics.moveTo(prevX, prevY);
          b.bladeGraphics.lineTo(x, y);
          b.bladeGraphics.stroke({
            color: b.palette.glow,
            width: 1.5,
            alpha: ease,
          });
        }
        prevX = x;
        prevY = y;
      }
    }
    b.bladeGraphics.alpha = 1;
    // 虚空涌出（中心黑色核扩大）
    b.coreGraphics.clear();
    this.drawMultilayerCircle(
      b.coreGraphics,
      b.radius * 0.2 * ease,
      10,
      (ti) => this.interpolateColor(RIFT_VOID, RIFT_DEEP, ti),
      (ti) => (1 - ti * 0.3) * ease,
    );
    b.coreGraphics.circle(0, 0, Math.max(0.5, b.radius * 0.12 * ease));
    b.coreGraphics.fill({ color: RIFT_VOID });
    b.coreGraphics.alpha = 1;
    // 量子涟漪（向外扩散）
    b.haloGraphics.clear();
    for (let i = 0; i < 3; i++) {
      const phase = (b.life * 0.001 + i * 0.33) % 1;
      b.haloGraphics.circle(0, 0, Math.max(0.5, b.radius * phase));
      b.haloGraphics.stroke({
        color: b.palette.glow,
        width: 1,
        alpha: (1 - phase) * 0.4,
      });
    }
    b.haloGraphics.alpha = 1;
    // 量子涨落粒子（向外飞散）
    b.particleTimer += 16;
    if (b.particleTimer > 80) {
      b.particleTimer = 0;
      this.spawnBurstParticles(b, 2);
    }
  }

  /** 阶段3 扩散：裂缝消散扩张 + 黑核淡出 + 涟漪继续扩散 */
  protected phase3Diffuse(burst: ActiveBurstBase, t: number): void {
    const b = burst as ActiveRiftBurst;
    const ease = this.easeOutCubic(t);
    // 裂缝消散 + 扩张
    b.bladeGraphics.clear();
    const len = b.radius * 1.5 * (1 + ease * 0.3);
    const rotation = b.life * 0.001 * Math.PI;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const fadeAlpha = (1 - ease) * 0.8;
    for (let i = 0; i < RIFT_CRACK_COUNT; i++) {
      const angle = (i * Math.PI * 2) / RIFT_CRACK_COUNT;
      let prevX = 0;
      let prevY = 0;
      for (let seg = 1; seg <= RIFT_BURST_SEGMENTS; seg++) {
        const tSeg = seg / RIFT_BURST_SEGMENTS;
        const r = len * tSeg;
        const seed = i * 7.3 + seg * 3.7;
        const jitter = (Math.sin(seed) + Math.cos(seed * 1.7)) * 0.2;
        const segAngle = angle + jitter;
        const ox = Math.cos(segAngle) * r;
        const oy = Math.sin(segAngle) * r;
        const x = ox * cos - oy * sin;
        const y = ox * sin + oy * cos;
        if (seg > 1) {
          b.bladeGraphics.moveTo(prevX, prevY);
          b.bladeGraphics.lineTo(x, y);
          b.bladeGraphics.stroke({
            color: RIFT_VOID,
            width: 4,
            alpha: fadeAlpha,
          });
          b.bladeGraphics.moveTo(prevX, prevY);
          b.bladeGraphics.lineTo(x, y);
          b.bladeGraphics.stroke({
            color: b.palette.glow,
            width: 1.5,
            alpha: fadeAlpha,
          });
        }
        prevX = x;
        prevY = y;
      }
    }
    b.bladeGraphics.alpha = 1;
    // 黑核淡出 + 扩张
    b.coreGraphics.clear();
    const voidR = b.radius * 0.2 * (1 + ease * 0.5);
    this.drawMultilayerCircle(
      b.coreGraphics,
      voidR,
      10,
      (ti) => this.interpolateColor(RIFT_VOID, RIFT_DEEP, ti),
      (ti) => (1 - ti * 0.3) * (1 - ease),
    );
    b.coreGraphics.circle(0, 0, Math.max(0.5, b.radius * 0.12 * (1 + ease * 0.5)));
    b.coreGraphics.fill({ color: RIFT_VOID, alpha: 1 - ease });
    b.coreGraphics.alpha = 1;
    // 量子涟漪继续扩散（更多环 + 更大范围）
    b.haloGraphics.clear();
    for (let i = 0; i < 4; i++) {
      const phase = (b.life * 0.001 + i * 0.25) % 1;
      b.haloGraphics.circle(0, 0, Math.max(0.5, b.radius * (0.2 + phase * 1.2)));
      b.haloGraphics.stroke({
        color: b.palette.glow,
        width: 1,
        alpha: (1 - phase) * 0.4 * (1 - ease * 0.5),
      });
    }
    b.haloGraphics.alpha = 1;
    // 残余粒子
    b.particleTimer += 16;
    if (b.particleTimer > 120) {
      b.particleTimer = 0;
      this.spawnBurstParticles(b, 1);
    }
  }

  /** 爆发阶段喷射粒子（向外飞散的青色量子涨落） */
  private spawnBurstParticles(burst: ActiveRiftBurst, count: number): void {
    const s = this.scale;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const startDist = burst.radius * s * 0.1;
      const px = burst.x + Math.cos(angle) * startDist;
      const py = burst.y + Math.sin(angle) * startDist;
      const speed = (50 + Math.random() * 40) * s;
      this.particlePool.emit({
        x: px,
        y: py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 700,
        scaleStart: 1.2,
        scaleEnd: 0,
        alphaStart: 1,
        alphaEnd: 0,
        tint: Math.random() < 0.5 ? burst.palette.glow : burst.palette.primary,
        radius: (1.5 + Math.random() * 1.5) * s,
      });
    }
  }

  // ══════════════════════════════════════════════════════
  //  生命周期
  // ══════════════════════════════════════════════════════

  /** 每帧更新（由 EffectRenderer 调用，dt 单位 ms） */
  update(dt: number): void {
    // ── 量子裂隙：裂缝旋转 + 黑核呼吸 + 量子涨落粒子 ──
    this.activeRifts.forEach((field) => {
      field.life += dt;
      // 重绘裂缝（缓慢旋转，手动变换顶点）
      this.drawJaggedCracks(field.crackGraphics, field.radius, field.palette, field.life);
      // 重绘黑核（呼吸脉动）
      this.drawVoidCore(field.coreGraphics, field.radius, field.palette, field.life);
      // 量子涨落粒子（每 ~600ms 生成 2 个）
      field.particleTimer += dt;
      if (field.particleTimer > 600) {
        field.particleTimer = 0;
        this.spawnQuantumFluctuation(field);
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

  private removeBurstInstance(b: ActiveRiftBurst): void {
    this.container.removeChild(b.container);
    b.container.destroy({ children: true });
  }

  protected onScaleChange(scale: number): void {
    this.activeRifts.forEach((f) => {
      if (!f.container.destroyed) f.container.scale.set(scale);
    });
    this.activeBursts.forEach((b) => {
      if (!b.container.destroyed) b.container.scale.set(scale);
    });
  }

  clear(): void {
    this.activeRifts.forEach((f) => {
      this.container.removeChild(f.container);
      f.container.destroy({ children: true });
    });
    this.activeRifts.clear();
    this.activeBursts.forEach((b) => this.removeBurstInstance(b));
    this.activeBursts.clear();
  }
}
