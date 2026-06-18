import * as PIXI from 'pixi.js';
import { BLEND_MODES, STINGER_SPEED, BURST_FLASH_DURATION, HIVE_BURST_SCALE } from '../constants';
import { ParticlePool } from '../systems/ParticlePool';
import {
  lighten,
  type ActiveEffect,
  type HiveVisualConfig,
} from './VisualEffectUtils';

/**
 * 蜂巢母体特效渲染器
 *
 * 职责：
 * - 蜂刺对象池（Graphics）+ 拖尾粒子
 * - 蜂刺碰墙反弹特效（火花 + 扩散环）
 * - 爆发全屏闪屏（L5 全息层）
 * - 蜂群绕球公转常驻渲染（playerId → beeGraphics）
 * - 蜂群爆发/普通状态切换
 *
 * 从 EffectRenderer 独立拆分。
 */
export class HiveEffectRenderer {
  /** 蜂刺对象池 */
  private stingerPool: PIXI.Graphics[] = [];
  /** 活跃中的蜂刺 */
  private stingerActive: Set<PIXI.Graphics> = new Set();

  /** 蜂群绕球公转：playerId → { container, bees[], beeCount, isBurst, elapsed } */
  private hiveBees = new Map<string, {
    container: PIXI.Container;
    bees: PIXI.Graphics[];
    beeCount: number;
    isBurst: boolean;
    elapsed: number;
  }>();

  /** 挂载容器 */
  private entityContainer: PIXI.Container;
  private hologramContainer: PIXI.Container;
  private particlePool: ParticlePool;

  /** 缩放 + 画布尺寸 */
  private scale = 1;
  private canvasW: number;
  private canvasH: number;

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
      const g = new PIXI.Graphics();
      g.circle(0, 0, 3);
      g.fill({ color: 0x39FF14 });
      g.visible = false;
      g.blendMode = BLEND_MODES.ADD as unknown as PIXI.BLEND_MODES;
      entityContainer.addChild(g);
      this.stingerPool.push(g);
    }
  }

  /** 同步缩放 + 画布尺寸 */
  setScale(scale: number, canvasW: number, canvasH: number): void {
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
    const g = new PIXI.Graphics();
    g.circle(0, 0, 3);
    g.fill({ color: 0x39FF14 });
    g.blendMode = BLEND_MODES.ADD as unknown as PIXI.BLEND_MODES;
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

  // ── 蜂刺触发 ──────────────────────────────────────────

  /**
   * 触发蜂刺特效
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

    const primary = themeColor ?? 0x39FF14;
    const trail = themeColor ? lighten(themeColor, 50) : 0x7FFF66;

    g.x = fromX;
    g.y = fromY;
    g.visible = true;

    const ef: ActiveEffect = {
      type: 'hive_sting',
      container: g as unknown as PIXI.Container,
      life: 0,
      maxLife,
      onUpdate: (_ef, _dt) => {
        g.x += vx * _dt / 1000;
        g.y += vy * _dt / 1000;

        g.clear();
        g.circle(0, 0, 4 * this.scale);
        g.fill({ color: primary, alpha: 0.9 });
        // 外发光
        g.circle(0, 0, 6 * this.scale);
        g.fill({ color: 0xFFFFFF, alpha: 0.3 });

        // 主拖尾粒子
        this.particlePool.emit({
          x: g.x, y: g.y,
          vx: -vx * 0.4, vy: -vy * 0.4,
          life: 300, radius: 3 * this.scale,
          alphaStart: 0.7, alphaEnd: 0,
          tint: trail,
        });

        // 额外尾迹（每隔2帧）
        if (_ef.life % 2 === 0) {
          this.particlePool.emit({
            x: g.x, y: g.y,
            vx: -vx * 0.2 + (Math.random() - 0.5) * 20,
            vy: -vy * 0.2 + (Math.random() - 0.5) * 20,
            life: 200, radius: 2 * this.scale,
            alphaStart: 0.4, alphaEnd: 0,
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

  // ── 蜂刺碰墙反弹 ──────────────────────────────────────

  /**
   * 触发蜂刺碰墙反弹特效（火花 + 扩散环）
   */
  triggerStingBounce(x: number, y: number, themeColor?: number): ActiveEffect | null {
    const primary = themeColor ?? 0x39FF14;

    // 1. 小火花（8 颗，向四周散射）
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      const speed = 80 + Math.random() * 60;
      this.particlePool.emit({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 250 + Math.random() * 150,
        radius: 2 * this.scale,
        alphaStart: 0.9, alphaEnd: 0,
        tint: primary,
      });
    }

    // 2. 扩散环
    const g = new PIXI.Graphics();
    g.blendMode = BLEND_MODES.ADD as unknown as PIXI.BLEND_MODES;
    this.entityContainer.addChild(g);

    const ef: ActiveEffect = {
      type: 'hive_sting_bounce',
      container: g as unknown as PIXI.Container,
      life: 0,
      maxLife: 350,
      onUpdate: (_ef, _dt) => {
        const t = _ef.life / _ef.maxLife;
        const radius = (10 + t * 40) * this.scale;
        g.clear();
        g.circle(0, 0, radius);
        g.stroke({ color: primary, width: 2 * this.scale, alpha: 0.8 * (1 - t) });
        g.x = x;
        g.y = y;
      },
      onDecay: (_ef) => {
        g.destroy();
      },
    };
    return ef;
  }

  // ── 爆发闪屏 ──────────────────────────────────────────

  /**
   * 触发爆发全屏闪屏（L5 全息层）
   */
  triggerBurstFlash(factionColor: number, visualCfg?: HiveVisualConfig): ActiveEffect | null {
    const duration = visualCfg?.burstFlashDuration ?? BURST_FLASH_DURATION;

    const g = new PIXI.Graphics();
    this.hologramContainer.addChild(g);

    g.rect(0, 0, this.canvasW, this.canvasH);
    g.fill({ color: factionColor, alpha: 0.4 });

    const ef: ActiveEffect = {
      type: 'burst_flash',
      container: g,
      life: 0,
      maxLife: duration,
      onUpdate: (ef, _dt) => {
        const t = ef.life / ef.maxLife;
        g.alpha = 0.4 * (1 - t);
        if (t > 0.5) g.visible = false;
      },
      onDecay: (_ef) => {
        g.destroy(true);
      },
    };
    return ef;
  }

  // ── 蜂群绕球公转（常驻） ──────────────────────────────

  /**
   * 创建/更新绕球公转的纳米蜂群
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
    let entry = this.hiveBees.get(playerId);
    const primary = themeColor ?? 0x32D63A;
    const burstScale = visualCfg?.burstScale ?? HIVE_BURST_SCALE;
    const orbitRadius = (visualCfg?.orbitRadius ?? 50) * this.scale;

    if (!entry || entry.beeCount !== beeCount) {
      // 重建
      if (entry) {
        entry.container.destroy({ children: true });
      }
      const container = new PIXI.Container();
      const bees: PIXI.Graphics[] = [];

      for (let i = 0; i < beeCount; i++) {
        const g = new PIXI.Graphics();
        g.blendMode = BLEND_MODES.ADD as unknown as PIXI.BLEND_MODES;
        if (isBurst) {
          g.circle(0, 0, 10);
          g.fill({ color: 0xFFFFFF, alpha: 0.9 });
          g.circle(0, 0, 6);
          g.fill({ color: primary, alpha: 0.6 });
          g.scale.set(burstScale);
        } else {
          g.circle(0, 0, 6);
          g.fill({ color: primary, alpha: 0.8 });
          g.circle(0, 0, 3);
          g.fill({ color: 0xFFFFFF, alpha: 0.4 });
        }
        container.addChild(g);
        bees.push(g);
      }

      this.entityContainer.addChild(container);
      entry = { container, bees, beeCount, isBurst, elapsed: 0 };
      this.hiveBees.set(playerId, entry);
    }

    // 更新爆发状态切换
    if (entry.isBurst !== isBurst) {
      entry.isBurst = isBurst;
      for (const g of entry.bees) {
        g.clear();
        if (isBurst) {
          g.circle(0, 0, 10);
          g.fill({ color: 0xFFFFFF, alpha: 0.9 });
          g.circle(0, 0, 6);
          g.fill({ color: primary, alpha: 0.6 });
          g.scale.set(burstScale);
        } else {
          g.circle(0, 0, 6);
          g.fill({ color: primary, alpha: 0.8 });
          g.circle(0, 0, 3);
          g.fill({ color: 0xFFFFFF, alpha: 0.4 });
          g.scale.set(1.0);
        }
      }
    }

    // 更新轨道位置
    entry.elapsed += dt;
    for (let i = 0; i < entry.beeCount; i++) {
      const orbitAngle = (entry.elapsed / 1000) * Math.PI + (i * 2 * Math.PI) / entry.beeCount;
      entry.bees[i].x = playerX + Math.cos(orbitAngle) * orbitRadius;
      entry.bees[i].y = playerY + Math.sin(orbitAngle) * orbitRadius;
    }
  }

  /** 移除某玩家的蜂群 */
  removeHiveBees(playerId: string): void {
    const entry = this.hiveBees.get(playerId);
    if (entry) {
      entry.container.destroy({ children: true });
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
      entry.container.destroy({ children: true });
    }
    this.hiveBees.clear();
  }

  destroy(): void {
    this.clear();
    for (const g of this.stingerPool) {
      g.destroy(true);
    }
    this.stingerPool.length = 0;
  }
}
