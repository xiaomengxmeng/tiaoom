import * as PIXI from 'pixi.js';
import {
  BLEND_MODES,
  LOGICAL_W, LOGICAL_H,
  SHOCKWAVE_MAX_RADIUS,
  FIREWALL_HEX_RADIUS,
  STINGER_SPEED,
  BURST_FLASH_DURATION,
  HIVE_BURST_SCALE,
} from '../constants';
import { ParticlePool } from '../systems/ParticlePool';

/** 活跃特效实例 */
interface ActiveEffect {
  type: 'shockwave' | 'firewall' | 'hive_sting' | 'burst_flash';
  container: PIXI.Container;
  life: number;
  maxLife: number;
  /** 每帧更新回调 */
  onUpdate: (ef: ActiveEffect, dt: number) => void;
  /** 消散回调（回收资源） */
  onDecay: (ef: ActiveEffect) => void;
}

/**
 * 技能特效渲染器（L2-L5 层）
 *
 * 严格只负责特效视觉，不含任何游戏逻辑。
 * - L2 层（entityContainer）：蜂刺、弹射碎片等投射物
 * - L3 层（fieldContainer）：冲击波、防火墙、油膜、回路等场地印记
 * - L5 层（hologramContainer）：全屏滤镜、闪屏、画面扭曲
 *
 * 与 PlayerRenderer 完全解耦，只通过 CyberFishRenderer 协调。
 */
export class EffectRenderer {
  private entityContainer: PIXI.Container;
  private fieldContainer: PIXI.Container;
  private hologramContainer: PIXI.Container;
  private particlePool: ParticlePool;
  private activeEffects: ActiveEffect[] = [];
  private fieldEffects: Map<string, PIXI.Graphics[]> = new Map();

  /** 当前缩放因子（= CyberFishRenderer.uniformScale），所有视觉尺寸 × scale */
  private scale = 1;
  /** 当前画布宽高（用于全屏特效 + 边界检测） */
  private canvasW = LOGICAL_W;
  private canvasH = LOGICAL_H; // 场地持续特效

  // ── 冲击波特效池（对象池化） ───────────────────────────
  private shockwavePool: PIXI.Graphics[] = [];
  private shockwaveActive: Set<PIXI.Graphics> = new Set();
  private shockwaveBounced: Set<PIXI.Graphics> = new Set();

  // ── 防火墙特效池 ─────────────────────────────────────────
  private firewallPool: PIXI.Graphics[] = [];
  private firewallActive: Set<PIXI.Graphics> = new Set();

  // ── 蜂刺特效池 ─────────────────────────────────────────
  private stingerPool: PIXI.Graphics[] = [];
  private stingerActive: Set<PIXI.Graphics> = new Set();

  constructor(
    entityContainer: PIXI.Container,
    fieldContainer: PIXI.Container,
    hologramContainer: PIXI.Container,
    particlePool: ParticlePool,
  ) {
    this.entityContainer = entityContainer;
    this.fieldContainer = fieldContainer;
    this.hologramContainer = hologramContainer;
    this.particlePool = particlePool;

    // 预创建特效池
    this.prepoolShockwaves(10);
    this.prepoolFirewalls(8);
    this.prepoolStingers(30);
  }

  /**
   * 同步缩放因子（由 CyberFishRenderer.resize 驱动）
   * @param s uniformScale = min(canvasW/1280, canvasH/720)
   * @param w 当前画布宽
   * @param h 当前画布高
   */
  setScale(s: number, w: number, h: number): void {
    this.scale = s;
    this.canvasW = w;
    this.canvasH = h;
  }

  // ══════════════════════════════════════════════════════
  //  公开方法：特效触发接口
  // ══════════════════════════════════════════════════════

  /**
   * 触发冲击波特效
   * @param x 碰撞点 X
   * @param y 碰撞点 Y
   * @param isBurst 是否为爆发（3道波）
   * @param angleOverride 爆发时的角度（度，-1=全方向120°间隔）
   * @param themeColor 玩家主题色（未提供则用默认品红）
   */
  triggerShockwave(x: number, y: number, isBurst = false, angleOverride = -1, themeColor?: number): void {
    const count = isBurst ? 3 : 1;
    const baseAngle = angleOverride >= 0 ? angleOverride : 0;
    const primary = themeColor ?? 0xFF00FF;
    const glow = themeColor ? this.lighten(themeColor, 50) : 0xFF66FF;
    const bounceColor = themeColor ? this.dimColor(themeColor, 0.6) : 0x00BFFF;
    const maxRadius = SHOCKWAVE_MAX_RADIUS * this.scale;
    const { canvasW, canvasH } = this;

    for (let i = 0; i < count; i++) {
      const angle = isBurst ? (i * 120) : baseAngle; void angle;
      /* rad unused */
      const g = this.acquireShockwave();
      if (!g) continue;

      const ef: ActiveEffect = {
        type: 'shockwave',
        container: g as unknown as PIXI.Container,
        life: 0,
        maxLife: 800,
        onUpdate: (ef, _dt) => {
          const t = ef.life / ef.maxLife;
          const radius = t * maxRadius;
          const alpha = 1 - t * 0.8;
          const width = (4 + t * 8) * this.scale;

          g.clear();
          g.circle(x, y, radius);
          g.stroke({ color: primary, width, alpha: alpha * 0.9 });
          g.circle(x, y, Math.max(radius - width * 2, 0));
          g.stroke({ color: glow, width: 2 * this.scale, alpha: alpha * 0.5 });

          // 碰墙检测（使用实际画布尺寸）
          const distToWall = Math.min(x, canvasW - x, y, canvasH - y);
          if (radius >= distToWall && !this.shockwaveBounced.has(g)) {
            this.shockwaveBounced.add(g);
            g.clear();
            g.circle(x, y, radius);
            g.stroke({ color: bounceColor, width, alpha: alpha * 0.9 });
          }

          g.x = 0; g.y = 0;
        },
        onDecay: (_ef) => {
          g.clear();
          g.visible = false;
          this.shockwaveBounced.delete(g);
          this.shockwaveActive.delete(g);
        },
      };
      ef.container.visible = true;
      this.activeEffects.push(ef);
    }
  }

  /**
   * 触发防火墙特效
   * @param x 受击位置 X
   * @param y 受击位置 Y
   * @param isHardened 是否为硬化状态（爆发）
   * @param wallId 唯一 ID（用于更新/移除）
   * @param themeColor 玩家主题色（未提供则用默认青/红）
   */
  triggerFirewall(x: number, y: number, isHardened = false, wallId = `fw_${Date.now()}`, themeColor?: number): string {
    const g = this.acquireFirewall();
    if (!g) return wallId;

    const maxLife = isHardened ? 4000 : 5000;
    const alpha = isHardened ? 1.0 : 0.4;
    const color = themeColor ?? (isHardened ? 0xFF3333 : 0x00BFFF);
    const streamColor = themeColor ? this.lighten(themeColor, 60) : 0x66D9FF;
    const hexRadius = FIREWALL_HEX_RADIUS * this.scale;
    const s = this.scale;

    // 绘制六边形网格屏障
    g.clear();
    this.drawHexagon(g, x, y, hexRadius, color, alpha);

    const ef: ActiveEffect = {
      type: 'firewall',
      container: g as unknown as PIXI.Container,
      life: 0,
      maxLife: maxLife,
      onUpdate: (ef, _dt) => {
        const t = ef.life / ef.maxLife;
        const pulse = 0.8 + 0.2 * Math.sin(ef.life / 200);
        g.clear();
        this.drawHexagon(g, x, y, hexRadius * pulse, color, alpha * (1 - t * 0.3));
        // 数据流纹理（扫描线）
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3 + ef.life / 500;
          g.circle(x + Math.cos(a) * 90 * s, y + Math.sin(a) * 90 * s, 2 * s);
          g.fill({ color: streamColor, alpha: 0.5 * (1 - t) });
        }
      },
      onDecay: (_ef) => {
        g.clear();
        g.visible = false;
        this.firewallActive.delete(g);
        this.fieldEffects.delete(wallId);
      },
    };
    ef.container.visible = true;
    this.activeEffects.push(ef);
    this.fieldEffects.set(wallId, [g]);
    return wallId;
  }

  /**
   * 触发蜂刺（蜂巢母体）
   * @param fromX 发射位置 X
   * @param fromY 发射位置 Y
   * @param toX 目标位置 X
   * @param toY 目标位置 Y
   * @param themeColor 玩家主题色（未提供则用默认绿色）
   */
  triggerHiveSting(fromX: number, fromY: number, toX: number, toY: number, themeColor?: number): void {
    const g = this.acquireStinger();
    if (!g) return;

    const dx = toX - fromX;
    const dy = toY - fromY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = STINGER_SPEED * this.scale;
    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;
    const maxLife = (dist / speed) * 1000 + 500;
    const primary = themeColor ?? 0x39FF14;
    const trail = themeColor ? this.lighten(themeColor, 50) : 0x7FFF66;

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
        g.circle(g.x, g.y, 3 * this.scale);
        g.fill({ color: primary, alpha: 0.9 });
        // 尾迹粒子
        this.particlePool.emit({
          x: g.x, y: g.y,
          vx: -vx * 0.3, vy: -vy * 0.3,
          life: 150, radius: 2 * this.scale,
          alphaStart: 0.5, alphaEnd: 0,
          tint: trail,
        });
      },
      onDecay: (_ef) => {
        g.clear();
        g.visible = false;
        this.stingerActive.delete(g);
      },
    };
    this.activeEffects.push(ef);
  }

  /**
   * 触发爆发全屏闪屏（L5 全息舞台层）
   * @param factionColor 流派主色
   * @param duration 持续时间（ms）
   */
  triggerBurstFlash(factionColor: number, duration = BURST_FLASH_DURATION): void {
    const g = new PIXI.Graphics();
    this.hologramContainer.addChild(g);

    // 全屏覆盖闪光（使用实际画布尺寸）
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
    this.activeEffects.push(ef);
  }

  /**
   * 触发蜂群狂暴视觉效果（蜂巢母体爆发）
   * @param hives 蜂群容器数组
   * @param themeColor 玩家主题色（未提供则用默认绿色）
   */
  triggerHiveBurst(hives: PIXI.Container[], themeColor?: number): void {
    const primary = themeColor ?? 0x39FF14;
    // 所有蜂变大 + 白热
    for (const h of hives) {
      h.scale.set(HIVE_BURST_SCALE);
      if (h instanceof PIXI.Graphics) {
        h.clear();
        h.circle(0, 0, 10);
        h.fill({ color: 0xFFFFFF, alpha: 0.9 });
        h.circle(0, 0, 6);
        h.fill({ color: primary, alpha: 0.6 });
      }
    }
    // 3 秒后恢复
    setTimeout(() => {
      for (const h of hives) {
        h.scale.set(1.0);
        if (h instanceof PIXI.Graphics) {
          h.clear();
          h.circle(0, 0, 7);
          h.fill({ color: primary, alpha: 0.8 });
        }
      }
    }, 3000);
  }

  // ══════════════════════════════════════════════════════
  //  每帧更新
  // ══════════════════════════════════════════════════════

  update(dt: number): void {
    for (let i = this.activeEffects.length - 1; i >= 0; i--) {
      const ef = this.activeEffects[i];
      ef.life += dt;
      if (ef.life >= ef.maxLife) {
        // 消散阶段
        ef.onDecay(ef);
        this.activeEffects.splice(i, 1);
      } else {
        ef.onUpdate(ef, dt);
      }
    }
  }

  /** 清除所有特效 */
  clear(): void {
    for (let i = this.activeEffects.length - 1; i >= 0; i--) {
      this.activeEffects[i].onDecay(this.activeEffects[i]);
    }
    this.activeEffects.length = 0;
    this.fieldEffects.clear();
    this.shockwaveActive.clear();
    this.shockwaveBounced.clear();
    this.firewallActive.clear();
    this.stingerActive.clear();
  }

  destroy(): void {
    this.clear();
    // 释放池资源（防御 null 引用）
    for (let i = this.shockwavePool.length - 1; i >= 0; i--) {
      this.shockwavePool[i]?.destroy(true);
    }
    for (let i = this.firewallPool.length - 1; i >= 0; i--) {
      this.firewallPool[i]?.destroy(true);
    }
    for (let i = this.stingerPool.length - 1; i >= 0; i--) {
      this.stingerPool[i]?.destroy(true);
    }
    this.shockwavePool.length = 0;
    this.firewallPool.length = 0;
    this.stingerPool.length = 0;
  }

  // ══════════════════════════════════════════════════════
  //  私有方法：对象池管理
  // ══════════════════════════════════════════════════════

  private prepoolShockwaves(count: number): void {
    for (let i = 0; i < count; i++) {
      const g = new PIXI.Graphics();
      g.visible = false;
      g.blendMode = BLEND_MODES.ADD as unknown as PIXI.BLEND_MODES;
      this.fieldContainer.addChild(g);
      this.shockwavePool.push(g);
    }
  }

  private acquireShockwave(): PIXI.Graphics | null {
    for (const g of this.shockwavePool) {
      if (!this.shockwaveActive.has(g)) {
        this.shockwaveActive.add(g);
        g.visible = true;
        this.shockwaveBounced.delete(g);
        return g;
      }
    }
    // 池耗尽：扩展
    const g = new PIXI.Graphics();
    g.blendMode = BLEND_MODES.ADD as unknown as PIXI.BLEND_MODES;
    this.fieldContainer.addChild(g);
    this.shockwavePool.push(g);
    this.shockwaveActive.add(g);
    return g;
  }

  private prepoolFirewalls(count: number): void {
    for (let i = 0; i < count; i++) {
      const g = new PIXI.Graphics();
      g.visible = false;
      this.fieldContainer.addChild(g);
      this.firewallPool.push(g);
    }
  }

  private acquireFirewall(): PIXI.Graphics | null {
    for (const g of this.firewallPool) {
      if (!this.firewallActive.has(g)) {
        this.firewallActive.add(g);
        g.visible = true;
        return g;
      }
    }
    const g = new PIXI.Graphics();
    this.fieldContainer.addChild(g);
    this.firewallPool.push(g);
    this.firewallActive.add(g);
    return g;
  }

  private prepoolStingers(count: number): void {
    for (let i = 0; i < count; i++) {
      const g = new PIXI.Graphics();
      g.circle(0, 0, 3);
      g.fill({ color: 0x39FF14 });
      g.visible = false;
      g.blendMode = BLEND_MODES.ADD as unknown as PIXI.BLEND_MODES;
      this.entityContainer.addChild(g);
      this.stingerPool.push(g);
    }
  }

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

  // ══════════════════════════════════════════════════════
  //  绘图辅助
  // ══════════════════════════════════════════════════════

  /** 提亮颜色（保持色相，增加亮度） */
  private lighten(color: number, amount: number): number {
    const r = Math.min(255, ((color >> 16) & 0xff) + amount);
    const g = Math.min(255, ((color >> 8) & 0xff) + amount);
    const b = Math.min(255, (color & 0xff) + amount);
    return (r << 16) | (g << 8) | b;
  }

  /** 降低颜色亮度（保持色相） */
  private dimColor(color: number, factor: number): number {
    const r = Math.round(((color >> 16) & 0xff) * factor);
    const g = Math.round(((color >> 8) & 0xff) * factor);
    const b = Math.round((color & 0xff) * factor);
    return (r << 16) | (g << 8) | b;
  }

  /** 绘制六边形 */
  private drawHexagon(
    g: PIXI.Graphics, x: number, y: number,
    radius: number, color: number, alpha: number,
  ): void {
    const pts: [number, number][] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 - Math.PI / 6;
      pts.push([x + Math.cos(a) * radius, y + Math.sin(a) * radius]);
    }
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < 6; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    g.stroke({ color, width: 3, alpha });
    // 半透明填充
    g.circle(x, y, radius);
    g.fill({ color, alpha: alpha * 0.15 });
  }
}
