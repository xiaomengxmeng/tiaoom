/**
 * 熵寂之触 (Entropic Touch) - 闲乘月
 * 前端视觉渲染器
 *
 * 视觉设计：
 * - 低温场：蓝色半透明六边形脉冲 + 冰晶粒子飘散
 * - 冻伤：理事会印章图标（带"批准"字样）+ 冰霜厚度
 * - 爆发：热力学奇点漩涡（冰蓝→暗紫）+ 全屏文字 + 长发残影
 */

import * as PIXI from 'pixi.js';
import { ParticlePool } from '../systems/ParticlePool';

/** 活跃低温场实例 */
interface ActiveAura {
  container: PIXI.Container;
  hexGraphics: PIXI.Graphics;
  particleTimer: number;
  life: number;
  maxLife: number;
  x: number;
  y: number;
  radius: number;
}

/** 活跃冻伤印记 */
interface ActiveFrostbite {
  container: PIXI.Container;
  sealGraphics: PIXI.Graphics;
  iceGraphics: PIXI.Graphics;
  life: number;
  maxLife: number;
  stacks: number;
}

/** 活跃爆发特效 */
interface ActiveBurst {
  container: PIXI.Container;
  vortexGraphics: PIXI.Graphics;
  textContainer: PIXI.Container;
  hairGraphics: PIXI.Graphics;
  life: number;
  maxLife: number;
}

export class EntropicTouchRenderer {
  private fieldContainer: PIXI.Container;
  private particlePool: ParticlePool;
  private scale = 1;

  // 活跃实例池
  private activeAuras: Map<string, ActiveAura> = new Map();
  private activeFrostbites: Map<string, ActiveFrostbite> = new Map();
  private activeBursts: Map<string, ActiveBurst> = new Map();

  // 温度标签池（每个玩家一个）
  private tempLabels: Map<string, PIXI.Text> = new Map();

  constructor(fieldContainer: PIXI.Container, particlePool: ParticlePool) {
    this.fieldContainer = fieldContainer;
    this.particlePool = particlePool;
  }

  setScale(scale: number): void {
    this.scale = scale;
    // 更新所有活跃实例的缩放（hexGraphics 以 (0,0) 为中心绘制，
    // 容器 position 已设为目标画布坐标，scale.set 不会产生位置漂移）
    this.activeAuras.forEach(aura => {
      if (aura.hexGraphics.destroyed) return;
      aura.hexGraphics.scale.set(scale);
    });
  }

  // ══════════════════════════════════════════════════════
  //  低温场 Aura（绝对零度）
  // ══════════════════════════════════════════════════════

  /**
   * 触发低温场视觉效果
   * @param playerId 玩家 ID（用于唯一标识）
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param radius 低温场半径（逻辑 px）
   * @param themeColor 主题色（冰蓝色）
   */
  triggerAura(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor = 0x00CCFF,
  ): void {
    // 如果已存在，更新位置
    const existing = this.activeAuras.get(playerId);
    if (existing) {
      existing.x = x;
      existing.y = y;
      existing.radius = radius;
      existing.container.position.set(x, y);
      return;
    }

    const s = this.scale;
    const container = new PIXI.Container();
    container.position.set(x, y); // 容器定位到画布像素坐标
    const hexGraphics = new PIXI.Graphics();

    // 以 (0,0) 为中心绘制（容器已定位到目标坐标，支持 resize 时 scale.set 不漂移）
    this.drawAuraHex(hexGraphics, 0, 0, radius * s, themeColor);

    container.addChild(hexGraphics);
    this.fieldContainer.addChild(container);

    const aura: ActiveAura = {
      container,
      hexGraphics,
      particleTimer: 0,
      life: 0,
      maxLife: 999999, // 常驻，直到手动移除
      x,
      y,
      radius,
    };

    this.activeAuras.set(playerId, aura);

    // 触发冰晶粒子
    this.spawnIceCrystals(x, y, radius * s, themeColor);

    // 显示温度标签（16℃ 恒温彩蛋）
    this.showTempLabel(playerId, x, y - (radius * s) - 20 * s, themeColor);
  }

  /** 移除低温场 */
  removeAura(playerId: string): void {
    const aura = this.activeAuras.get(playerId);
    if (aura) {
      this.fieldContainer.removeChild(aura.container);
      aura.container.destroy({ children: true });
      this.activeAuras.delete(playerId);
    }

    // 移除温度标签
    const label = this.tempLabels.get(playerId);
    if (label) {
      label.destroy();
      this.tempLabels.delete(playerId);
    }
  }

  /** 绘制低温场六边形 */
  private drawAuraHex(
    g: PIXI.Graphics,
    x: number,
    y: number,
    radius: number,
    color: number,
  ): void {
    g.clear();

    // 外圈六边形（半透明蓝色）
    const pts: [number, number][] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 - Math.PI / 6;
      pts.push([x + Math.cos(a) * radius, y + Math.sin(a) * radius]);
    }
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < 6; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    g.fill({ color, alpha: 0.15 });
    g.stroke({ color, width: 2, alpha: 0.4 });

    // 内圈脉动圆环
    g.circle(x, y, radius * 0.3);
    g.stroke({ color, width: 1, alpha: 0.2 });
  }

  /** 生成冰晶粒子 */
  private spawnIceCrystals(
    x: number,
    y: number,
    radius: number,
    color: number,
  ): void {
    // 使用粒子池生成冰晶效果
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const dist = radius * (0.5 + Math.random() * 0.5);
      const px = x + Math.cos(angle) * dist;
      const py = y + Math.sin(angle) * dist;

      // 创建冰晶粒子（小六边形）
      const particle = new PIXI.Graphics();
      this.drawTinyHex(particle, px, py, 3 + Math.random() * 3, color);
      this.fieldContainer.addChild(particle);

      // 动画：向外飘散 + 淡出
      const vx = Math.cos(angle) * 20;
      const vy = Math.sin(angle) * 20;
      this.animateParticle(particle, vx, vy, 2000);
    }
  }

  /** 绘制微小六边形（冰晶） */
  private drawTinyHex(
    g: PIXI.Graphics,
    x: number,
    y: number,
    size: number,
    color: number,
  ): void {
    g.clear();
    const pts: [number, number][] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      pts.push([x + Math.cos(a) * size, y + Math.sin(a) * size]);
    }
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < 6; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    g.fill({ color, alpha: 0.6 });
  }

  /** 粒子动画 */
  private animateParticle(
    particle: PIXI.Graphics,
    vx: number,
    vy: number,
    durationMs: number,
  ): void {
    const startTime = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startTime;
      const t = elapsed / durationMs;

      if (t >= 1) {
        particle.destroy();
        return;
      }

      particle.x += vx * (1 / 60); // 假设 60fps
      particle.y += vy * (1 / 60);
      particle.alpha = 1 - t;
      particle.scale.set(1 - t * 0.5);

      requestAnimationFrame(tick);
    };
    tick();
  }

  /** 显示温度标签（16℃ 恒温彩蛋） */
  private showTempLabel(
    playerId: string,
    x: number,
    y: number,
    color: number,
  ): void {
    if (this.tempLabels.has(playerId)) return;

    const label = new PIXI.Text('16℃', {
      fontFamily: 'monospace',
      fontSize: 10,
      fill: color,
    });
    label.anchor.set(0.5);
    label.position.set(x, y);
    label.alpha = 0.7;
    this.fieldContainer.addChild(label);

    this.tempLabels.set(playerId, label);
  }

  // ══════════════════════════════════════════════════════
  //  冻伤叠加效果
  // ══════════════════════════════════════════════════════

  /**
   * 触发冻伤叠加视觉效果
   * @param targetId 目标玩家 ID
   * @param stacks 当前冻伤层数（1-3）
   * @param x 目标逻辑坐标 X
   * @param y 目标逻辑坐标 Y
   * @param themeColor 主题色
   */
  triggerFrostbite(
    targetId: string,
    stacks: number,
    x: number,
    y: number,
    themeColor = 0x00CCFF,
  ): void {
    const container = new PIXI.Container();
    container.position.set(x, y);

    // 绘制理事会印章图标
    const sealGraphics = new PIXI.Graphics();
    this.drawCouncilSeal(sealGraphics, 0, 0, stacks, themeColor);
    container.addChild(sealGraphics);

    // 绘制冰霜厚度（层数越高越厚）
    const iceGraphics = new PIXI.Graphics();
    this.drawIceThickness(iceGraphics, 0, 0, stacks, themeColor);
    container.addChild(iceGraphics);

    this.fieldContainer.addChild(container);

    const frostbite: ActiveFrostbite = {
      container,
      sealGraphics,
      iceGraphics,
      life: 0,
      maxLife: 5 * 60, // 5 秒（假设 60fps）
      stacks,
    };

    this.activeFrostbites.set(targetId, frostbite);

    // 动画：印章戳印效果
    this.animateSealStamp(sealGraphics);
  }

  /** 绘制理事会印章 */
  private drawCouncilSeal(
    g: PIXI.Graphics,
    x: number,
    y: number,
    stacks: number,
    color: number,
  ): void {
    g.clear();

    // 外圈圆形印章
    const radius = 15 + stacks * 3; // 层数越高，印章越大
    g.circle(x, y, radius);
    g.stroke({ color, width: 2, alpha: 0.8 });

    // 内部文字 "批准"（简化：用矩形表示）
    g.rect(x - radius * 0.6, y - radius * 0.3, radius * 1.2, radius * 0.6);
    g.stroke({ color, width: 1, alpha: 0.5 });

    // 中心点
    g.circle(x, y, 3);
    g.fill({ color, alpha: 0.8 });
  }

  /** 绘制冰霜厚度 */
  private drawIceThickness(
    g: PIXI.Graphics,
    x: number,
    y: number,
    stacks: number,
    color: number,
  ): void {
    g.clear();

    // 根据层数绘制不同厚度的冰霜环
    for (let i = 0; i < stacks; i++) {
      const radius = 20 + i * 8;
      g.circle(x, y, radius);
      g.stroke({
        color,
        width: 2 + i,
        alpha: 0.3 + i * 0.2,
      });
    }
  }

  /** 印章戳印动画 */
  private animateSealStamp(seal: PIXI.Graphics): void {
    seal.scale.set(0);
    seal.alpha = 0;

    const startTime = Date.now();
    const duration = 300; // 300ms

    const tick = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);

      // easeOutBack 效果
      const ease = 1 - Math.pow(1 - t, 3);
      seal.scale.set(ease);
      seal.alpha = Math.min(t * 2, 1);

      if (t < 1) {
        requestAnimationFrame(tick);
      }
    };
    tick();
  }

  // ══════════════════════════════════════════════════════
  //  爆发特效（热力学奇点）
  // ══════════════════════════════════════════════════════

  /**
   * 触发爆发视觉效果
   * @param playerId 玩家 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param radius 爆发范围（逻辑 px）
   * @param themeColor 主题色
   */
  triggerBurst(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor = 0x00CCFF,
  ): void {
    const s = this.scale;
    const container = new PIXI.Container();
    container.position.set(x, y);

    // 1. 漩涡图形（冰蓝→暗紫）
    const vortexGraphics = new PIXI.Graphics();
    this.drawVortex(vortexGraphics, 0, 0, radius * s, themeColor);
    container.addChild(vortexGraphics);

    // 2. 全屏文字
    const textContainer = new PIXI.Container();
    this.showBurstText(textContainer, themeColor);
    container.addChild(textContainer);

    // 3. 冰蓝长发残影
    const hairGraphics = new PIXI.Graphics();
    this.drawHairAfterimage(hairGraphics, 0, 0, themeColor);
    container.addChild(hairGraphics);

    this.fieldContainer.addChild(container);

    const burst: ActiveBurst = {
      container,
      vortexGraphics,
      textContainer,
      hairGraphics,
      life: 0,
      maxLife: 5 * 60, // 5 秒
    };

    this.activeBursts.set(playerId, burst);

    // 动画：漩涡旋转 + 文字闪烁
    this.animateVortex(vortexGraphics);
    this.animateBurstText(textContainer);
  }

  /** 绘制热力学奇点漩涡 */
  private drawVortex(
    g: PIXI.Graphics,
    x: number,
    y: number,
    radius: number,
    color: number,
  ): void {
    g.clear();

    // 螺旋线（冰蓝→暗紫渐变）
    const spiralTurns = 5;
    const points: [number, number][] = [];

    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      const angle = t * spiralTurns * Math.PI * 2;
      const r = radius * (1 - t * 0.8);
      const px = x + Math.cos(angle) * r;
      const py = y + Math.sin(angle) * r;
      points.push([px, py]);
    }

    // 绘制螺旋线
    if (points.length > 1) {
      g.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) {
        g.lineTo(points[i][0], points[i][1]);
      }
    }

    const darkPurple = 0x6600CC;
    g.stroke({ color: darkPurple, width: 3, alpha: 0.8 });

    // 中心奇点（黑色圆点）
    g.circle(x, y, 5);
    g.fill({ color: 0x000000, alpha: 1 });
  }

  /** 显示爆发文字 */
  private showBurstText(container: PIXI.Container, color: number): void {
    const text1 = new PIXI.Text('> 最优解执行中...', {
      fontFamily: 'monospace',
      fontSize: 16,
      fill: color,
      fontWeight: 'bold',
    });
    text1.anchor.set(0.5);
    text1.position.set(0, -50);
    container.addChild(text1);

    const text2 = new PIXI.Text('> 牺牲率：1%', {
      fontFamily: 'monospace',
      fontSize: 14,
      fill: 0xFF0000, // 红字
      fontWeight: 'bold',
    });
    text2.anchor.set(0.5);
    text2.position.set(0, -30);
    container.addChild(text2);
  }

  /** 绘制冰蓝长发残影 */
  private drawHairAfterimage(
    g: PIXI.Graphics,
    x: number,
    y: number,
    color: number,
  ): void {
    g.clear();

    // 简化：绘制几条曲线代表长发
    for (let i = 0; i < 5; i++) {
      const offsetX = (i - 2) * 10;
      g.moveTo(x + offsetX, y - 20);
      g.bezierCurveTo(
        x + offsetX - 20, y - 10,
        x + offsetX - 30, y + 20,
        x + offsetX - 40, y + 40,
      );
    }

    g.stroke({ color, width: 2, alpha: 0.6 });
  }

  /** 漩涡旋转动画 */
  private animateVortex(vortex: PIXI.Graphics): void {
    let angle = 0;
    const tick = () => {
      angle += 0.02;
      vortex.rotation = angle;

      if (vortex.parent) {
        requestAnimationFrame(tick);
      }
    };
    tick();
  }

  /** 文字闪烁动画 */
  private animateBurstText(textContainer: PIXI.Container): void {
    let visible = true;
    const tick = () => {
      visible = !visible;
      textContainer.visible = visible;

      if (textContainer.parent) {
        setTimeout(tick, 500); // 500ms 闪烁
      }
    };
    setTimeout(tick, 500);
  }

  // ══════════════════════════════════════════════════════
  //  更新循环
  // ══════════════════════════════════════════════════════

  /** 每帧更新（由 EffectRenderer 调用） */
  update(dt: number): void {
    // 更新低温场（脉动效果）
    this.activeAuras.forEach((aura, playerId) => {
      aura.life++;
      // 脉动：alpha 在 0.3-0.6 之间循环
      const pulse = 0.4 + 0.2 * Math.sin(aura.life * 0.05);
      aura.hexGraphics.alpha = pulse;

      // 定期生成冰晶粒子
      aura.particleTimer += dt;
      if (aura.particleTimer > 1000) {
        // 每秒生成一次
        aura.particleTimer = 0;
        this.spawnIceCrystals(
          aura.x,
          aura.y,
          aura.radius * this.scale,
          0x00CCFF,
        );
      }
    });

    // 更新冻伤印记（自动过期）
    this.activeFrostbites.forEach((fb, targetId) => {
      fb.life++;
      if (fb.life >= fb.maxLife) {
        this.removeFrostbite(targetId);
      }
    });

    // 更新爆发特效（自动过期）
    this.activeBursts.forEach((burst, playerId) => {
      burst.life++;
      if (burst.life >= burst.maxLife) {
        this.removeBurst(playerId);
      }
    });
  }

  /** 移除冻伤印记 */
  private removeFrostbite(targetId: string): void {
    const fb = this.activeFrostbites.get(targetId);
    if (fb) {
      this.fieldContainer.removeChild(fb.container);
      fb.container.destroy({ children: true });
      this.activeFrostbites.delete(targetId);
    }
  }

  /** 移除爆发特效 */
  private removeBurst(playerId: string): void {
    const burst = this.activeBursts.get(playerId);
    if (burst) {
      this.fieldContainer.removeChild(burst.container);
      burst.container.destroy({ children: true });
      this.activeBursts.delete(playerId);
    }
  }

  // ══════════════════════════════════════════════════════
  //  销毁
  // ══════════════════════════════════════════════════════

  /** 清除所有特效（不销毁渲染器） */
  clear(): void {
    this.activeAuras.forEach((aura, playerId) => {
      this.removeAura(playerId);
    });
    this.activeFrostbites.forEach((fb, targetId) => {
      this.removeFrostbite(targetId);
    });
    this.activeBursts.forEach((burst, playerId) => {
      this.removeBurst(playerId);
    });
  }

  destroy(): void {
    this.clear();
  }
}
