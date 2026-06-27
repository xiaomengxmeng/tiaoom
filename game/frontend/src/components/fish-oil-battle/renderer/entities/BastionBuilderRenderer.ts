/**
 * 堡垒构筑者 (Bastion Builder) - 工程师流派
 * 前端视觉渲染器
 *
 * 视觉主题（Spec §6.1 #8 —— 防御工事）：
 * - 堡垒护盾（常驻）：
 *   · 3 层六边形护盾叠加（不同角度旋转 + 节点连接线）
 *   · 防御符文（中心十字符文 + 外圈符文环，呼吸闪烁）
 *   · 防御粒子（沿护盾边缘环绕飘散，向内汇聚）
 * - 爆发：三阶段动画
 *   · 蓄压（0-15%T）：护盾收缩汇聚
 *   · 堡垒降临（15-30%T）：六边形要塞展开 + 护盾冲击波 + 防御塔投影
 *   · 消散（30-100%T）：要塞淡出，冲击波扩散
 *
 * 独特符号：3 层六边形护盾、防御符文、六边形要塞、护盾冲击波、防御塔
 *
 * API：triggerBastion / removeBastion / triggerBurst / update / setScale / clear / destroy
 * 所有动画由 update(dt) 驱动。
 */

import * as PIXI from 'pixi.js';
import { ParticlePool } from '../systems/ParticlePool';
import { BaseWeaponEffectRenderer, type ActiveBurstBase, type Palette } from './BaseWeaponEffectRenderer';

// ══════════════════════════════════════════════════════
//  颜色常量（工程师黄）
// ══════════════════════════════════════════════════════

const BASTION_MAIN = 0xccaa00; // 主黄（默认 themeColor）

// ══════════════════════════════════════════════════════
//  数据结构
// ══════════════════════════════════════════════════════

/** 活跃堡垒护盾实例（常驻防御场） */
interface ActiveBastion {
  container: PIXI.Container;
  shieldGraphics: PIXI.Graphics; // 3 层六边形护盾
  runeGraphics: PIXI.Graphics;   // 防御符文
  particleTimer: number;
  life: number;
  maxLife: number;
  x: number;
  y: number;
  radius: number;
  themeColor: number;
  palette: Palette;
}

/** 活跃爆发特效（堡垒降临） */
interface ActiveBastionBurst extends ActiveBurstBase {
  coreGraphics: PIXI.Graphics;   // 六边形要塞（3 层）
  haloGraphics: PIXI.Graphics;  // 护盾冲击波
  bladeGraphics: PIXI.Graphics;  // 防御塔投影（6 个）
  x: number;
  y: number;
}

// ══════════════════════════════════════════════════════
//  渲染器
// ══════════════════════════════════════════════════════

export class BastionBuilderRenderer extends BaseWeaponEffectRenderer {
  private activeBastions = new Map<string, ActiveBastion>();
  private activeBursts = new Map<string, ActiveBastionBurst>();

  constructor(fieldContainer: PIXI.Container, particlePool: ParticlePool) {
    super(fieldContainer, particlePool);
  }

  // ═══ 堡垒护盾（常驻防御场） ═══

  triggerBastion(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor: number = BASTION_MAIN,
  ): void {
    // 已存在则仅更新位置与半径
    const existing = this.activeBastions.get(playerId);
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

    const shieldGraphics = new PIXI.Graphics();
    const runeGraphics = new PIXI.Graphics();
    container.addChild(shieldGraphics, runeGraphics);

    const bastion: ActiveBastion = {
      container,
      shieldGraphics,
      runeGraphics,
      particleTimer: 0,
      life: 0,
      maxLife: Infinity,
      x,
      y,
      radius,
      themeColor,
      palette,
    };
    this.activeBastions.set(playerId, bastion);
  }

  removeBastion(playerId: string): void {
    const b = this.activeBastions.get(playerId);
    if (!b) return;
    this.container.removeChild(b.container);
    b.container.destroy({ children: true });
    this.activeBastions.delete(playerId);
  }

  // ═══ 独特视觉：3 层六边形护盾叠加 ═══

  private drawHexShields(g: PIXI.Graphics, radius: number, palette: Palette, life: number): void {
    g.clear();
    for (let layer = 0; layer < 3; layer++) {
      const r = radius * (0.5 + layer * 0.25);
      const rot = life * 0.0005 * Math.PI * (layer % 2 === 0 ? 1 : -1);
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      // 六边形护盾（填充 + 描边），手动旋转顶点以实现各层独立旋转
      const pts: [number, number][] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 - Math.PI / 6;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        pts.push([px * cos - py * sin, px * sin + py * cos]);
      }
      g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < 6; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.closePath();
      g.fill({ color: palette.glow, alpha: 0.1 - layer * 0.02 });
      g.stroke({ color: palette.glow, width: 2 - layer * 0.3, alpha: 0.7 - layer * 0.15 });
      // 节点连接线（六边形顶点对角连线）
      for (let i = 0; i < 6; i += 2) {
        g.moveTo(pts[i][0], pts[i][1]);
        g.lineTo(pts[(i + 3) % 6][0], pts[(i + 3) % 6][1]);
        g.stroke({ color: palette.highlight, width: 0.5, alpha: 0.4 });
      }
    }
  }

  // ═══ 独特视觉：防御符文 ═══

  private drawDefenseRune(g: PIXI.Graphics, radius: number, palette: Palette, life: number): void {
    g.clear();
    const breath = 0.7 + 0.3 * Math.sin(life * 0.003 * Math.PI);
    // 中心十字符文
    g.moveTo(-radius * 0.15, 0);
    g.lineTo(radius * 0.15, 0);
    g.moveTo(0, -radius * 0.15);
    g.lineTo(0, radius * 0.15);
    g.stroke({ color: palette.highlight, width: 2, alpha: breath });
    // 外圈符文环
    g.circle(0, 0, radius * 0.12);
    g.stroke({ color: palette.glow, width: 1, alpha: breath * 0.6 });
  }

  // ═══ 防御粒子（常驻场，向内汇聚） ═══

  private spawnDefenseParticles(x: number, y: number, radius: number, color: number): void {
    const s = this.scale;
    for (let i = 0; i < 2; i++) {
      const angle = Math.random() * Math.PI * 2;
      const startDist = radius * s * (0.7 + Math.random() * 0.3);
      const px = x + Math.cos(angle) * startDist;
      const py = y + Math.sin(angle) * startDist;
      const speed = (15 + Math.random() * 10) * s;
      this.particlePool.emit({
        x: px,
        y: py,
        vx: -Math.cos(angle) * speed,
        vy: -Math.sin(angle) * speed,
        life: 2000,
        scaleStart: 1,
        scaleEnd: 0,
        alphaStart: 0.8,
        alphaEnd: 0,
        tint: color,
        radius: (1.5 + Math.random() * 1.5) * s,
      });
    }
  }

  // ═══ 爆发：堡垒降临 ═══

  triggerBurst(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor: number = BASTION_MAIN,
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
    const haloGraphics = new PIXI.Graphics();
    const bladeGraphics = new PIXI.Graphics();
    container.addChild(coreGraphics, haloGraphics, bladeGraphics);

    const burst: ActiveBastionBurst = {
      container,
      life: 0,
      maxLife: durationMs ?? 1500,
      themeColor,
      radius,
      particleTimer: 0,
      palette,
      coreGraphics,
      haloGraphics,
      bladeGraphics,
      x,
      y,
    };
    this.activeBursts.set(playerId, burst);
  }

  // ═══ 三阶段钩子 ═══

  protected phase1Charge(burst: ActiveBurstBase, t: number): void {
    const b = burst as ActiveBastionBurst;
    const ease = this.easeOutCubic(t);
    // 蓄压：3 层护盾从外向内收缩汇聚
    b.coreGraphics.clear();
    b.coreGraphics.rotation = 0;
    for (let layer = 0; layer < 3; layer++) {
      const r = b.radius * (0.5 + layer * 0.25) * (1 - ease * 0.5);
      const pts: [number, number][] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 - Math.PI / 6;
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      b.coreGraphics.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < 6; i++) b.coreGraphics.lineTo(pts[i][0], pts[i][1]);
      b.coreGraphics.closePath();
      b.coreGraphics.stroke({ color: b.palette.glow, width: 1.5, alpha: ease });
    }
    b.coreGraphics.alpha = ease;
    // 冲击波与防御塔隐藏
    b.haloGraphics.alpha = 0;
    b.bladeGraphics.alpha = 0;
  }

  protected phase2Burst(burst: ActiveBurstBase, t: number): void {
    const b = burst as ActiveBastionBurst;
    const ease = this.easeOutCubic(t);
    // 六边形要塞展开（3 层从内到外）
    b.coreGraphics.clear();
    b.coreGraphics.rotation = b.life * 0.001 * Math.PI;
    for (let layer = 0; layer < 3; layer++) {
      const r = b.radius * (0.2 + layer * 0.25) * ease;
      const pts: [number, number][] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 - Math.PI / 6;
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      b.coreGraphics.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < 6; i++) b.coreGraphics.lineTo(pts[i][0], pts[i][1]);
      b.coreGraphics.closePath();
      b.coreGraphics.fill({ color: b.palette.glow, alpha: 0.2 * ease });
      b.coreGraphics.stroke({ color: b.palette.highlight, width: 2, alpha: ease });
    }
    b.coreGraphics.alpha = 1;
    // 护盾冲击波
    b.haloGraphics.clear();
    const waveR = b.radius * 1.5 * ease;
    b.haloGraphics.circle(0, 0, waveR);
    b.haloGraphics.stroke({ color: b.palette.glow, width: 4 * (1 - ease), alpha: 0.6 * (1 - ease) });
    b.haloGraphics.alpha = 1;
    // 防御塔投影（6 个顶点的小塔）
    b.bladeGraphics.clear();
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const tx = Math.cos(angle) * b.radius * 0.4 * ease;
      const ty = Math.sin(angle) * b.radius * 0.4 * ease;
      b.bladeGraphics.circle(tx, ty, 4 * ease);
      b.bladeGraphics.fill({ color: b.palette.primary, alpha: ease });
    }
    b.bladeGraphics.alpha = 1;
    // 防御粒子向外溅射（节流：particleTimer += 16）
    b.particleTimer += 16;
    if (b.particleTimer > 80) {
      b.particleTimer = 0;
      this.spawnBurstDefenseParticles(b, 2);
    }
  }

  protected phase3Diffuse(burst: ActiveBurstBase, t: number): void {
    const b = burst as ActiveBastionBurst;
    const ease = this.easeOutCubic(t);
    // 六边形要塞淡出
    b.coreGraphics.alpha = 1 - ease;
    b.coreGraphics.rotation += 0.001 * Math.PI;
    // 护盾冲击波扩散
    b.haloGraphics.clear();
    const waveR = b.radius * 1.5 * (1 + ease * 0.5);
    b.haloGraphics.circle(0, 0, waveR);
    b.haloGraphics.stroke({ color: b.palette.glow, width: 2 * (1 - ease), alpha: 0.4 * (1 - ease) });
    b.haloGraphics.alpha = 1 - ease;
    // 防御塔淡出
    b.bladeGraphics.alpha = 1 - ease;
  }

  // ═══ 独特视觉：爆发期防御粒子溅射 ═══

  private spawnBurstDefenseParticles(burst: ActiveBastionBurst, count: number): void {
    const s = this.scale;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (40 + Math.random() * 30) * s;
      this.particlePool.emit({
        x: burst.x,
        y: burst.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        drag: 0.3,
        life: 600,
        scaleStart: 1,
        scaleEnd: 0,
        alphaStart: 0.9,
        alphaEnd: 0,
        tint: burst.palette.glow,
        radius: 2 * s,
      });
    }
  }

  // ═══ 生命周期 ═══

  update(dt: number): void {
    // ── 堡垒护盾：3 层六边形护盾 + 防御符文 + 粒子 ──
    this.activeBastions.forEach((bastion) => {
      bastion.life += dt;
      // 3 层六边形护盾（每帧重绘，含各层独立旋转）
      this.drawHexShields(bastion.shieldGraphics, bastion.radius, bastion.palette, bastion.life);
      // 防御符文（呼吸闪烁）
      this.drawDefenseRune(bastion.runeGraphics, bastion.radius, bastion.palette, bastion.life);
      // 防御粒子（节流：每 1.5s 生成）
      bastion.particleTimer += dt;
      if (bastion.particleTimer > 1500) {
        bastion.particleTimer = 0;
        this.spawnDefenseParticles(bastion.x, bastion.y, bastion.radius, bastion.palette.glow);
      }
    });

    // ── 爆发：三阶段动画 ──
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

  private removeBurstInstance(b: ActiveBastionBurst): void {
    this.container.removeChild(b.container);
    b.container.destroy({ children: true });
  }

  protected onScaleChange(scale: number): void {
    this.activeBastions.forEach((b) => {
      if (!b.container.destroyed) b.container.scale.set(scale);
    });
    this.activeBursts.forEach((b) => {
      if (!b.container.destroyed) b.container.scale.set(scale);
    });
  }

  clear(): void {
    this.activeBastions.forEach((b) => {
      this.container.removeChild(b.container);
      b.container.destroy({ children: true });
    });
    this.activeBastions.clear();
    this.activeBursts.forEach((b) => this.removeBurstInstance(b));
    this.activeBursts.clear();
  }
}
