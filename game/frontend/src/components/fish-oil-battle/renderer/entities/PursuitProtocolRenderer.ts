/**
 * 追猎协议 (Pursuit Protocol) - 侵略者流派
 * 前端视觉渲染器
 *
 * 视觉设计（侵略者橙红色系 —— 锁定追猎目标）：
 * - 追猎标记 PursuitMark：8 层径向渐变光环（白→高亮橙→浅橙红→主红→深红透明）
 *   + 双层主环（外环高亮橙红 + 内环白）+ 锁定准星（4 条线 + 中心点，金色）
 *   + 追踪线（从追猎者到目标的二次贝塞尔曲线，会随追猎者移动实时重绘）
 *   + 锁定粒子（金色，沿追踪线流动）
 * - 爆发 Burst：三阶段动画
 *   · 蓄能（0-15%T）：追猎标记收缩，能量向中心汇聚
 *   · 锁定爆发（15%-30%T）：锁定奇点爆发（10 层渐变核心）+ 6 条锁定线闪现 + 视界环展开
 *   · 余波（30%-100%T）：锁定痕迹扩散消散
 *
 * API：triggerPursuitMark / updatePursuitMark / removePursuitMark / triggerBurst / update / setScale / clear / destroy
 * 所有动画由 update(dt) 驱动，不使用 rAF / setTimeout。
 */

import * as PIXI from 'pixi.js';
import { ParticlePool } from '../systems/ParticlePool';

// ══════════════════════════════════════════════════════
//  颜色常量（侵略者橙红）
// ══════════════════════════════════════════════════════

const PURSUIT_DEEP = 0x3a0a14; // 深红黑（渐变末端）
const PURSUIT_MAIN = 0xdd3322; // 主橙红
const PURSUIT_LIGHT = 0xff7755; // 浅橙红
const PURSUIT_HIGHLIGHT = 0xffbb99; // 高亮橙
const PURSUIT_WHITE = 0xffffff; // 白色
const PURSUIT_GOLD = 0xffcc00; // 锁定标记金色

// ══════════════════════════════════════════════════════
//  数据结构
// ══════════════════════════════════════════════════════

/** 活跃追猎标记实例（常驻，追踪线随追猎者位置实时重绘） */
interface ActivePursuitMark {
  container: PIXI.Container;
  haloGraphics: PIXI.Graphics; // 8 层渐变光环 + 双层主环
  crosshairGraphics: PIXI.Graphics; // 锁定准星（4 条线 + 中心点，金色，独立旋转）
  trackLineGraphics: PIXI.Graphics; // 追踪线（追猎者→目标的二次贝塞尔曲线，每帧重绘）
  particleTimer: number; // 锁定粒子节流计时器
  life: number; // ms 累计
  maxLife: number;
  targetX: number; // 目标逻辑坐标 X
  targetY: number; // 目标逻辑坐标 Y
  hunterX: number; // 追猎者逻辑坐标 X
  hunterY: number; // 追猎者逻辑坐标 Y
  radius: number;
  themeColor: number;
}

/** 活跃爆发特效（三阶段：蓄能 → 锁定爆发 → 余波） */
interface ActiveBurst {
  container: PIXI.Container;
  coreGraphics: PIXI.Graphics; // 锁定奇点核心（10 层渐变）
  horizonGraphics: PIXI.Graphics; // 视界环（双层细高亮环）
  lockGraphics: PIXI.Graphics; // 锁定线（6 条向心汇聚）
  haloGraphics: PIXI.Graphics; // 余波光晕（多层细环）
  life: number;
  maxLife: number;
  themeColor: number;
  radius: number;
  particleTimer: number; // 锁定阶段粒子节流
}

export class PursuitProtocolRenderer {
  private fieldContainer: PIXI.Container;
  private particlePool: ParticlePool;
  private scale = 1;

  // 活跃实例池
  private activeMarks: Map<string, ActivePursuitMark> = new Map();
  private activeBursts: Map<string, ActiveBurst> = new Map();

  constructor(fieldContainer: PIXI.Container, particlePool: ParticlePool) {
    this.fieldContainer = fieldContainer;
    this.particlePool = particlePool;
  }

  setScale(scale: number): void {
    this.scale = scale;
    // 容器统一承担全局缩放，内部 graphics 维持各自的动画 scale
    this.activeMarks.forEach((m) => {
      if (m.container.destroyed) return;
      m.container.scale.set(scale);
    });
    this.activeBursts.forEach((b) => {
      if (b.container.destroyed) return;
      b.container.scale.set(scale);
    });
  }

  // ══════════════════════════════════════════════════════
  //  追猎标记 PursuitMark（常驻，追踪线随追猎者位置实时重绘）
  // ══════════════════════════════════════════════════════

  /**
   * 触发追猎标记视觉效果（创建或更新位置）
   * @param targetId 目标玩家 ID
   * @param targetX 目标逻辑坐标 X
   * @param targetY 目标逻辑坐标 Y
   * @param hunterX 追猎者逻辑坐标 X
   * @param hunterY 追猎者逻辑坐标 Y
   * @param radius 追猎标记半径（逻辑 px）
   * @param themeColor 主题色（默认主橙红）
   */
  triggerPursuitMark(
    targetId: string,
    targetX: number,
    targetY: number,
    hunterX: number,
    hunterY: number,
    radius: number,
    themeColor = PURSUIT_MAIN,
  ): void {
    // 已存在则仅更新位置（目标与追猎者都会移动）
    const existing = this.activeMarks.get(targetId);
    if (existing) {
      existing.targetX = targetX;
      existing.targetY = targetY;
      existing.hunterX = hunterX;
      existing.hunterY = hunterY;
      existing.radius = radius;
      existing.container.position.set(targetX, targetY);
      return;
    }

    const container = new PIXI.Container();
    container.position.set(targetX, targetY);
    container.scale.set(this.scale); // 全局缩放由容器承担

    // 8 层渐变光环 + 双层主环
    const haloGraphics = new PIXI.Graphics();
    this.drawPursuitHalo(haloGraphics, radius);
    container.addChild(haloGraphics);

    // 锁定准星（4 条线 + 中心点，金色，独立旋转）
    const crosshairGraphics = new PIXI.Graphics();
    this.drawCrosshair(crosshairGraphics, radius * 0.3, radius * 0.7);
    container.addChild(crosshairGraphics);

    // 追踪线（追猎者→目标的二次贝塞尔曲线，每帧重绘）
    // 注意：trackLineGraphics 挂在 fieldContainer 而非 mark.container，
    // 因为它连接两个世界坐标点（追猎者与目标），不应随目标容器旋转/缩放
    const trackLineGraphics = new PIXI.Graphics();
    this.fieldContainer.addChild(trackLineGraphics);

    this.fieldContainer.addChild(container);

    const mark: ActivePursuitMark = {
      container,
      haloGraphics,
      crosshairGraphics,
      trackLineGraphics,
      particleTimer: 0,
      life: 0,
      maxLife: Number.POSITIVE_INFINITY, // 常驻，直到手动移除
      targetX,
      targetY,
      hunterX,
      hunterY,
      radius,
      themeColor,
    };
    this.activeMarks.set(targetId, mark);

    // 触发首帧锁定粒子
    this.spawnLockParticles(hunterX, hunterY, targetX, targetY, PURSUIT_GOLD);
  }

  /**
   * 更新追猎标记位置（仅更新追猎者与目标坐标，追踪线在 update(dt) 中重绘）
   * @param targetId 目标玩家 ID
   * @param targetX 目标逻辑坐标 X
   * @param targetY 目标逻辑坐标 Y
   * @param hunterX 追猎者逻辑坐标 X
   * @param hunterY 追猎者逻辑坐标 Y
   */
  updatePursuitMark(
    targetId: string,
    targetX: number,
    targetY: number,
    hunterX: number,
    hunterY: number,
  ): void {
    const mark = this.activeMarks.get(targetId);
    if (mark) {
      mark.targetX = targetX;
      mark.targetY = targetY;
      mark.hunterX = hunterX;
      mark.hunterY = hunterY;
      mark.container.position.set(targetX, targetY);
    }
  }

  /** 移除追猎标记 */
  removePursuitMark(targetId: string): void {
    const mark = this.activeMarks.get(targetId);
    if (mark) {
      this.fieldContainer.removeChild(mark.container);
      this.fieldContainer.removeChild(mark.trackLineGraphics);
      mark.container.destroy({ children: true });
      mark.trackLineGraphics.destroy();
      this.activeMarks.delete(targetId);
    }
  }

  /**
   * 绘制追猎光环：8 层同心圆径向渐变（白→高亮橙→浅橙红→主橙红→深红透明）
   * + 双层主环
   * 以 (0,0) 为中心绘制，半径单位为逻辑 px
   */
  private drawPursuitHalo(g: PIXI.Graphics, radius: number): void {
    g.clear();

    // 8 层渐变光环：中心白 → 高亮橙 → 浅橙红 → 主橙红 → 深红透明
    for (let i = 0; i < 8; i++) {
      const t = i / 7; // 0 → 1
      const r = radius * (0.15 + 0.85 * t);
      // 颜色四段插值：白→高亮橙→浅橙红→主橙红→深红
      let color: number;
      if (t < 0.25) {
        color = this.interpolateColor(PURSUIT_WHITE, PURSUIT_HIGHLIGHT, t / 0.25);
      } else if (t < 0.5) {
        color = this.interpolateColor(
          PURSUIT_HIGHLIGHT,
          PURSUIT_LIGHT,
          (t - 0.25) / 0.25,
        );
      } else if (t < 0.75) {
        color = this.interpolateColor(
          PURSUIT_LIGHT,
          PURSUIT_MAIN,
          (t - 0.5) / 0.25,
        );
      } else {
        color = this.interpolateColor(
          PURSUIT_MAIN,
          PURSUIT_DEEP,
          (t - 0.75) / 0.25,
        );
      }
      const alpha = (1 - t) * 0.22; // 中心高 alpha，边缘趋近 0
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }

    // 双层主环：外环高亮橙红 + 内环白
    g.circle(0, 0, radius);
    g.stroke({ color: PURSUIT_HIGHLIGHT, width: 1, alpha: 0.7 });
    g.circle(0, 0, radius * 0.95);
    g.stroke({ color: PURSUIT_WHITE, width: 0.4, alpha: 0.5 });
  }

  /**
   * 绘制锁定准星：4 条线（90° 均分）+ 中心点（金色）
   * 由 crosshairGraphics 独立承担旋转动画
   */
  private drawCrosshair(
    g: PIXI.Graphics,
    innerR: number,
    outerR: number,
  ): void {
    g.clear();
    // 4 条准星线（90° 均分，金色）
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const x1 = Math.cos(a) * innerR;
      const y1 = Math.sin(a) * innerR;
      const x2 = Math.cos(a) * outerR;
      const y2 = Math.sin(a) * outerR;
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke({ color: PURSUIT_GOLD, width: 1.2, alpha: 0.85 });
    }
    // 中心点（金色实心 + 白色高亮）
    g.circle(0, 0, 4);
    g.fill({ color: PURSUIT_GOLD, alpha: 1 });
    g.circle(0, 0, 2);
    g.fill({ color: PURSUIT_WHITE, alpha: 1 });
  }

  /**
   * 绘制追踪线：从追猎者到目标的二次贝塞尔曲线（带控制点偏移，呈追踪弧线）
   * 使用世界坐标绘制（追猎者与目标的世界位置）
   */
  private drawTrackLine(
    g: PIXI.Graphics,
    hunterX: number,
    hunterY: number,
    targetX: number,
    targetY: number,
  ): void {
    g.clear();
    // 控制点：在追猎者与目标中点处垂直偏移，形成弧形追踪线
    const midX = (hunterX + targetX) / 2;
    const midY = (hunterY + targetY) / 2;
    const dx = targetX - hunterX;
    const dy = targetY - hunterY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // 垂直方向偏移（距离的 15%），制造弧线
    const perpX = dist > 0 ? -dy / dist : 0;
    const perpY = dist > 0 ? dx / dist : 0;
    const offset = dist * 0.15;
    const cpX = midX + perpX * offset;
    const cpY = midY + perpY * offset;

    g.moveTo(hunterX, hunterY);
    g.quadraticCurveTo(cpX, cpY, targetX, targetY);
    g.stroke({ color: PURSUIT_GOLD, width: 1, alpha: 0.7 });
  }

  /**
   * 生成锁定粒子（金色，沿追踪线流动）
   * 利用 particlePool.emit，由 update 节流调用
   */
  private spawnLockParticles(
    hunterX: number,
    hunterY: number,
    targetX: number,
    targetY: number,
    color: number,
  ): void {
    const s = this.scale;
    // 在追踪线上随机一点生成粒子，向目标流动
    const t = Math.random();
    // 二次贝塞尔曲线点：B(t) = (1-t)^2*P0 + 2(1-t)t*P1 + t^2*P2
    const midX = (hunterX + targetX) / 2;
    const midY = (hunterY + targetY) / 2;
    const dx = targetX - hunterX;
    const dy = targetY - hunterY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const perpX = dist > 0 ? -dy / dist : 0;
    const perpY = dist > 0 ? dx / dist : 0;
    const offset = dist * 0.15;
    const cpX = midX + perpX * offset;
    const cpY = midY + perpY * offset;
    const px =
      (1 - t) * (1 - t) * hunterX + 2 * (1 - t) * t * cpX + t * t * targetX;
    const py =
      (1 - t) * (1 - t) * hunterY + 2 * (1 - t) * t * cpY + t * t * targetY;
    // 向目标流动的速度（px/s）
    const flowSpeed = 40 * s;
    const flowAngle = Math.atan2(targetY - py, targetX - px);
    this.particlePool.emit({
      x: px,
      y: py,
      vx: Math.cos(flowAngle) * flowSpeed,
      vy: Math.sin(flowAngle) * flowSpeed,
      life: 800,
      scaleStart: 1,
      scaleEnd: 0,
      alphaStart: 0.9,
      alphaEnd: 0,
      tint: color,
      radius: (1.5 + Math.random() * 1) * s,
    });
  }

  // ══════════════════════════════════════════════════════
  //  爆发特效（三阶段：蓄能 → 锁定爆发 → 余波）
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
    themeColor = PURSUIT_MAIN,
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

    // 1. 锁定奇点核心（10 层渐变 + 白核 + 金色边缘辉光）
    const coreGraphics = new PIXI.Graphics();
    this.drawBurstCore(coreGraphics, radius);
    container.addChild(coreGraphics);

    // 2. 视界环（双层细高亮环）
    const horizonGraphics = new PIXI.Graphics();
    this.drawBurstHorizon(horizonGraphics, radius);
    container.addChild(horizonGraphics);

    // 3. 锁定线（6 条 quadraticCurveTo 从外向内汇聚）
    const lockGraphics = new PIXI.Graphics();
    this.drawBurstLocks(lockGraphics, radius);
    container.addChild(lockGraphics);

    // 4. 余波光晕（多层细环）
    const haloGraphics = new PIXI.Graphics();
    this.drawBurstHalo(haloGraphics, radius);
    container.addChild(haloGraphics);

    this.fieldContainer.addChild(container);

    const burst: ActiveBurst = {
      container,
      coreGraphics,
      horizonGraphics,
      lockGraphics,
      haloGraphics,
      life: 0,
      maxLife: durationMs ?? 5000,
      themeColor,
      radius,
      particleTimer: 0,
    };
    this.activeBursts.set(playerId, burst);
  }

  /**
   * 绘制锁定奇点核心：10 层同心圆（深红 → 主橙红 → 浅橙红 → 高亮橙 → 白）
   * + 白核 + 金色边缘辉光
   */
  private drawBurstCore(g: PIXI.Graphics, radius: number): void {
    g.clear();
    const coreR = radius * 0.6; // 奇点核心区域半径

    // 10 层同心圆叠加（深红 → 主橙红 → 浅橙红 → 高亮橙 → 白）
    for (let i = 0; i < 10; i++) {
      const t = i / 9; // 0 → 1
      const r = coreR * (0.1 + 0.9 * t);
      // 颜色四段插值：深红→主橙红→浅橙红→高亮橙→白
      let color: number;
      if (t < 0.25) {
        color = this.interpolateColor(PURSUIT_DEEP, PURSUIT_MAIN, t / 0.25);
      } else if (t < 0.5) {
        color = this.interpolateColor(
          PURSUIT_MAIN,
          PURSUIT_LIGHT,
          (t - 0.25) / 0.25,
        );
      } else if (t < 0.75) {
        color = this.interpolateColor(
          PURSUIT_LIGHT,
          PURSUIT_HIGHLIGHT,
          (t - 0.5) / 0.25,
        );
      } else {
        color = this.interpolateColor(
          PURSUIT_HIGHLIGHT,
          PURSUIT_WHITE,
          (t - 0.75) / 0.25,
        );
      }
      const alpha = (1 - t) * 0.25;
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }

    // 锁定核 r=6（白色实心）
    g.circle(0, 0, 6);
    g.fill({ color: PURSUIT_WHITE, alpha: 1 });

    // 金色边缘辉光
    g.circle(0, 0, 8);
    g.stroke({ color: PURSUIT_GOLD, width: 1.5, alpha: 0.8 });
  }

  /**
   * 绘制视界环：双层细高亮环
   */
  private drawBurstHorizon(g: PIXI.Graphics, radius: number): void {
    g.clear();
    g.circle(0, 0, radius);
    g.stroke({ color: PURSUIT_HIGHLIGHT, width: 0.6, alpha: 0.7 });
    g.circle(0, 0, radius * 0.95);
    g.stroke({ color: PURSUIT_WHITE, width: 0.3, alpha: 0.5 });
  }

  /**
   * 绘制锁定线：6 条 quadraticCurveTo 从外向内汇聚（锁定汇聚感）
   */
  private drawBurstLocks(g: PIXI.Graphics, radius: number): void {
    g.clear();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const startX = Math.cos(a) * radius;
      const startY = Math.sin(a) * radius;
      // 控制点偏离直线方向，形成弧形锁定感
      const midR = radius * 0.5;
      const offset = Math.PI / 6;
      const cpX = Math.cos(a + offset) * midR;
      const cpY = Math.sin(a + offset) * midR;
      g.moveTo(startX, startY);
      g.quadraticCurveTo(cpX, cpY, 0, 0);
      g.stroke({ color: PURSUIT_GOLD, width: 1, alpha: 0.8 });
    }
  }

  /**
   * 绘制余波光晕：4 层细环（白 → 高亮橙 → 浅橙红 → 主橙红）
   */
  private drawBurstHalo(g: PIXI.Graphics, radius: number): void {
    g.clear();
    const colors = [
      PURSUIT_WHITE,
      PURSUIT_HIGHLIGHT,
      PURSUIT_LIGHT,
      PURSUIT_MAIN,
    ];
    for (let i = 0; i < colors.length; i++) {
      const r = radius * (0.8 + i * 0.1);
      g.circle(0, 0, r);
      g.stroke({ color: colors[i], width: 0.5, alpha: 0.4 });
    }
  }

  /**
   * 锁定阶段喷射粒子（从核心向外飞散的金色锁定粒子）
   */
  private spawnBurstParticles(burst: ActiveBurst): void {
    const s = this.scale;
    const count = 3;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const startDist = burst.radius * s * 0.1;
      const px = burst.container.position.x + Math.cos(angle) * startDist;
      const py = burst.container.position.y + Math.sin(angle) * startDist;
      const speed = (60 + Math.random() * 40) * s;
      this.particlePool.emit({
        x: px,
        y: py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 800,
        scaleStart: 1.2,
        scaleEnd: 0,
        alphaStart: 1,
        alphaEnd: 0,
        tint: Math.random() < 0.5 ? PURSUIT_GOLD : PURSUIT_LIGHT,
        radius: (1.5 + Math.random() * 1.5) * s,
      });
    }
  }

  // ══════════════════════════════════════════════════════
  //  更新循环
  // ══════════════════════════════════════════════════════

  /** 每帧更新（由 EffectRenderer 调用，dt 单位 ms） */
  update(dt: number): void {
    // ── 追猎标记：呼吸 scale + 脉动 alpha + 准星旋转 + 追踪线重绘 + 锁定粒子 ──
    this.activeMarks.forEach((mark) => {
      mark.life += dt;
      // 呼吸 scale 1.0↔1.05（2s 周期）
      const breath = 1 + 0.05 * Math.sin(mark.life * 0.001 * Math.PI);
      mark.haloGraphics.scale.set(breath);
      // 脉动 alpha 0.6↔0.9
      const pulse = 0.75 + 0.15 * Math.sin(mark.life * 0.001 * Math.PI);
      mark.haloGraphics.alpha = pulse;
      // 准星旋转 0.5 转/秒
      mark.crosshairGraphics.rotation += dt * 0.001 * Math.PI;
      // 准星脉动 alpha（锁定闪烁感）
      mark.crosshairGraphics.alpha = 0.7 + 0.3 * Math.sin(mark.life * 0.004 * Math.PI);
      // 追踪线每帧重绘（追猎者与目标都可能移动）
      this.drawTrackLine(
        mark.trackLineGraphics,
        mark.hunterX,
        mark.hunterY,
        mark.targetX,
        mark.targetY,
      );
      // 锁定粒子：每 200ms 生成 1 个（沿追踪线流动）
      mark.particleTimer += dt;
      if (mark.particleTimer > 200) {
        mark.particleTimer = 0;
        this.spawnLockParticles(
          mark.hunterX,
          mark.hunterY,
          mark.targetX,
          mark.targetY,
          PURSUIT_GOLD,
        );
      }
    });

    // ── 爆发：三阶段动画 ──
    this.activeBursts.forEach((burst, playerId) => {
      burst.life += dt;
      const T = burst.maxLife;
      if (burst.life >= T) {
        this.removeBurst(playerId);
        return;
      }
      const phase1End = T * 0.15; // 蓄能阶段结束
      const phase2End = T * 0.30; // 锁定爆发阶段结束

      if (burst.life < phase1End) {
        // 阶段1 蓄能：光环收缩 scale 1.0→0.3，alpha 1.0→0.3，锁定核显现
        const t = burst.life / phase1End;
        burst.haloGraphics.scale.set(1.0 - 0.7 * t);
        burst.haloGraphics.alpha = 1.0 - 0.7 * t;
        burst.coreGraphics.alpha = t; // 0 → 1 显现
        burst.lockGraphics.alpha = 0;
        burst.horizonGraphics.alpha = 0;
        burst.horizonGraphics.scale.set(0.3);
      } else if (burst.life < phase2End) {
        // 阶段2 锁定爆发：奇点爆发 scale 0.3→1.0(easeOutCubic)，锁定线闪现 alpha 0→0.8，视界环展开
        const t = (burst.life - phase1End) / (phase2End - phase1End);
        const eased = this.easeOutCubic(t);
        burst.haloGraphics.scale.set(0.3 + 0.7 * eased);
        burst.haloGraphics.alpha = 0.3 + 0.4 * t; // 0.3 → 0.7
        burst.coreGraphics.alpha = 1.0;
        burst.lockGraphics.alpha = 0.8 * t; // 0 → 0.8
        burst.horizonGraphics.scale.set(0.3 + 0.7 * eased);
        burst.horizonGraphics.alpha = t; // 0 → 1
        // 锁定阶段喷射粒子（每 80ms）
        burst.particleTimer += dt;
        if (burst.particleTimer > 80) {
          burst.particleTimer = 0;
          this.spawnBurstParticles(burst);
        }
      } else {
        // 阶段3 余波：视界环扩散 scale 1.0→2.0 alpha 1.0→0，余波光晕消散 alpha 0.7→0（sin 波动），
        //            锁定线消散 alpha 0.8→0，锁定核保持但透明 alpha 1.0→0.3
        const t = (burst.life - phase2End) / (T - phase2End);
        burst.horizonGraphics.scale.set(1.0 + 1.0 * t);
        burst.horizonGraphics.alpha = 1.0 - t;
        burst.haloGraphics.alpha = 0.7 * (1.0 - t);
        burst.haloGraphics.rotation = Math.sin(t * Math.PI * 4) * 0.5;
        burst.lockGraphics.alpha = 0.8 * (1.0 - t);
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
    this.activeMarks.forEach((_, targetId) => this.removePursuitMark(targetId));
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
