/**
 * 预知透镜 (Precognitive Lens) - 风随
 * 前端视觉渲染器
 *
 * 视觉设计：
 * - 先见层数：球体周围蓝金色光环（层数越多越亮），6层时金色
 * - 猫灵回响：半透明蓝金猫形投射物，直线飞行带拖尾
 * - 无限洞察爆发：全屏竖瞳猫眼 + 蓝金色波纹
 */

import * as PIXI from 'pixi.js';
import { easeOutCubic, type ActiveEffect } from './VisualEffectUtils';

/** 预知透镜视觉配置（数据驱动） */
export interface PrecognitiveLensVisualConfig {
  /** 回响飞行速度（px/s） */
  echoSpeed?: number;
  /** 回响命中半径（逻辑 px） */
  echoRadius?: number;
  /** 爆发持续（ms） */
  burstDurationMs?: number;
}

/** "已看透"文字最大显示时长（ms），与原 setTimeout(1000) 保持一致 */
const REVEAL_TEXT_MAX_LIFE_MS = 1000;

/**
 * 单个玩家的先见光环实例
 * 持有光环绘制体，以及"已看透"文字的生命周期状态（由 update(dt) 驱动过期）
 */
interface ForesightAura {
  /** 光环绘制体（包含环、层数指示器、"已看透"文字等所有子元素） */
  graphics: PIXI.Graphics;
  /** "已看透"文字（仅当 stacks >= 6 且非爆发时存在）；由 update(dt) 累加 revealLife 判断过期 */
  revealText?: PIXI.Text;
  /** 文字已显示时间（ms），由 update(dt) 累加 */
  revealLife?: number;
  /** 文字最大显示时间（ms），到达后由 update(dt) 移除并销毁 */
  revealMaxLife?: number;
}

export class PrecognitiveLensRenderer {
  private entityContainer: PIXI.Container;
  private fieldContainer: PIXI.Container;
  private scale = 1;

  /** 每个玩家的先见光环（含"已看透"文字生命周期） */
  private foresightAuras: Map<string, ForesightAura> = new Map();

  constructor(entityContainer: PIXI.Container, fieldContainer: PIXI.Container) {
    this.entityContainer = entityContainer;
    this.fieldContainer = fieldContainer;
  }

  setScale(scale: number): void {
    this.scale = scale;
  }

  // ══════════════════════════════════════════════════════
  //  先见层数光环（常驻）
  // ══════════════════════════════════════════════════════

  /**
   * 更新先见层数光环
   * x/y 为画布像素坐标
   */
  updateForesight(
    playerId: string,
    x: number,
    y: number,
    stacks: number,
    isBurst: boolean,
    themeColor = 0x4DA6FF,
  ): void {
    const s = this.scale;
    let auraData = this.foresightAuras.get(playerId);
    if (!auraData) {
      const graphics = new PIXI.Graphics();
      this.entityContainer.addChild(graphics);
      auraData = { graphics };
      this.foresightAuras.set(playerId, auraData);
    }
    const aura = auraData.graphics;

    aura.position.set(x, y);
    aura.clear();

    const maxStacks = 6;
    const t = stacks / maxStacks;
    // 层数越多越亮，6层时金色
    const color = stacks >= 6 ? 0xFFD700 : 0x4DA6FF;
    const radius = (20 + stacks * 3) * s;
    const alpha = 0.3 + t * 0.4;

    // 光环
    aura.circle(0, 0, radius);
    aura.stroke({ color, width: 2 * s, alpha });
    aura.circle(0, 0, radius);
    aura.fill({ color, alpha: alpha * 0.15 });

    // 层数指示器（6个小点环绕）
    for (let i = 0; i < stacks; i++) {
      const a = (i / maxStacks) * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(a) * radius;
      const py = Math.sin(a) * radius;
      aura.circle(px, py, 2 * s);
      aura.fill({ color, alpha: 0.9 });
    }

    // 6层时显示"已看透"文字
    // 注意：不再使用 setTimeout，文字生命周期由 update(dt) 累加 revealLife 判断过期后清理
    if (stacks >= 6 && !isBurst) {
      // 销毁旧文字（避免重复叠加，并重置过期计时器）
      this.disposeRevealText(auraData);
      const text = new PIXI.Text('已看透', {
        fontFamily: 'monospace',
        fontSize: 8,
        fill: 0xFFD700,
      });
      text.anchor.set(0.5);
      text.position.set(0, -radius - 12 * s);
      text.alpha = 0.8;
      aura.addChild(text);
      // 记录生命周期状态，由 update(dt) 驱动过期
      auraData.revealText = text;
      auraData.revealLife = 0;
      auraData.revealMaxLife = REVEAL_TEXT_MAX_LIFE_MS;
    }

    // 爆发期间额外光环
    if (isBurst) {
      aura.circle(0, 0, radius * 1.3);
      aura.stroke({ color: 0xFFD700, width: 3 * s, alpha: 0.4 });
    }
  }

  /** 移除玩家光环（同时清理其"已看透"文字） */
  removeForesight(playerId: string): void {
    const auraData = this.foresightAuras.get(playerId);
    if (auraData) {
      // 显式清理文字生命周期状态（graphics.destroy 会一并销毁子节点）
      this.disposeRevealText(auraData);
      this.entityContainer.removeChild(auraData.graphics);
      auraData.graphics.destroy({ children: true });
      this.foresightAuras.delete(playerId);
    }
  }

  /**
   * 销毁并重置"已看透"文字的生命周期状态
   * 用于：updateForesight 重建文字前、removeForesight 清理时、update(dt) 过期后
   */
  private disposeRevealText(auraData: ForesightAura): void {
    const text = auraData.revealText;
    if (text && !text.destroyed) {
      auraData.graphics.removeChild(text);
      text.destroy();
    }
    auraData.revealText = undefined;
    auraData.revealLife = undefined;
    auraData.revealMaxLife = undefined;
  }

  // ══════════════════════════════════════════════════════
  //  生命周期更新（由 EffectRenderer.update 主循环调用，dt 单位 ms）
  // ══════════════════════════════════════════════════════

  /**
   * 每帧更新：累加"已看透"文字的 revealLife，超过 maxLife 后移除并销毁
   * 取代原 setTimeout(1000) 的延迟清理逻辑
   */
  update(dt: number): void {
    this.foresightAuras.forEach((auraData) => {
      const text = auraData.revealText;
      if (!text || text.destroyed) return;
      auraData.revealLife = (auraData.revealLife ?? 0) + dt;
      if (auraData.revealLife >= (auraData.revealMaxLife ?? REVEAL_TEXT_MAX_LIFE_MS)) {
        this.disposeRevealText(auraData);
      }
    });
  }

  // ══════════════════════════════════════════════════════
  //  猫灵回响投射物
  // ══════════════════════════════════════════════════════

  /**
   * 触发猫灵回响飞行特效
   * fromX/fromY 起点，toX/toY 方向参考点（画布像素坐标）
   */
  triggerEcho(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    isBurst: boolean,
    themeColor = 0x4DA6FF,
  ): { effect: ActiveEffect | null } {
    const s = this.scale;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const dirX = dx / dist;
    const dirY = dy / dist;

    const container = new PIXI.Container();
    container.position.set(fromX, fromY);
    this.fieldContainer.addChild(container);

    const g = new PIXI.Graphics();
    container.addChild(g);

    const durationMs = 2000;
    const flightDist = 500 * s; // 飞行距离
    const color = isBurst ? 0xFFD700 : themeColor;

    const ef: ActiveEffect = {
      type: 'precognitive_lens_echo',
      container: container as unknown as PIXI.Container,
      life: 0,
      maxLife: durationMs,
      onUpdate: (_ef, _dt) => {
        const t = _ef.life / _ef.maxLife;
        g.clear();

        // 飞行进度
        const progress = easeOutCubic(Math.min(1, t * 1.1));
        const cx = dirX * flightDist * progress;
        const cy = dirY * flightDist * progress;

        // 拖尾
        const trailLen = 40 * s;
        const trailStart = Math.max(0, progress - trailLen / flightDist);
        const tsx = dirX * flightDist * trailStart;
        const tsy = dirY * flightDist * trailStart;
        g.moveTo(tsx, tsy);
        g.lineTo(cx, cy);
        g.stroke({ color, width: 3 * s, alpha: 0.6 * (1 - t * 0.3) });

        // 猫灵头部（半透明猫形）
        const headR = 10 * s;
        g.circle(cx, cy, headR);
        g.fill({ color, alpha: 0.7 * (1 - t * 0.2) });
        g.stroke({ color: 0xFFFFFF, width: 1 * s, alpha: 0.5 });
        // 猫耳
        g.ellipse(cx - headR * 0.5, cy - headR * 0.7, headR * 0.3, headR * 0.4);
        g.fill({ color, alpha: 0.7 * (1 - t * 0.2) });
        g.ellipse(cx + headR * 0.5, cy - headR * 0.7, headR * 0.3, headR * 0.4);
        g.fill({ color, alpha: 0.7 * (1 - t * 0.2) });

        // 渐隐
        container.alpha = 1 - t * 0.8;
      },
      onDecay: () => {
        this.fieldContainer.removeChild(container);
        container.destroy({ children: true });
      },
    };
    return { effect: ef };
  }

  // ══════════════════════════════════════════════════════
  //  无限洞察爆发
  // ══════════════════════════════════════════════════════

  /**
   * 触发无限洞察爆发特效
   * x/y 为画布像素坐标
   */
  triggerBurst(
    _playerId: string,
    x: number,
    y: number,
    durationMs: number,
    themeColor = 0x4DA6FF,
  ): { effect: ActiveEffect | null } {
    const s = this.scale;
    const g = new PIXI.Graphics();
    g.position.set(x, y);
    this.fieldContainer.addChild(g);

    let phase = 0;
    const ef: ActiveEffect = {
      type: 'precognitive_lens_burst',
      container: g as unknown as PIXI.Container,
      life: 0,
      maxLife: durationMs,
      onUpdate: (_ef, _dt) => {
        const t = _ef.life / _ef.maxLife;
        g.clear();

        // 扩散波纹
        const growT = Math.min(1, _ef.life / 400);
        const grow = easeOutCubic(growT);
        const baseR = 80 * s * grow;

        // 蓝金波纹
        g.circle(0, 0, baseR);
        g.stroke({ color: 0xFFD700, width: 3 * s, alpha: 0.6 * (1 - t * 0.3) });
        g.circle(0, 0, baseR * 0.7);
        g.stroke({ color: themeColor, width: 2 * s, alpha: 0.5 * (1 - t * 0.3) });

        // 脉冲
        const pulseR = baseR * (0.5 + 0.5 * Math.abs(Math.sin(phase)));
        g.circle(0, 0, pulseR);
        g.stroke({ color: 0xFFFFFF, width: 1.5 * s, alpha: 0.4 * (1 - t * 0.3) });
        phase += _dt / 250;

        // 前 0.8s 全屏竖瞳猫眼
        if (t < 0.2) {
          const eyeAlpha = 0.9 * (1 - t / 0.2);
          const eyeR = 40 * s;
          // 竖瞳
          g.ellipse(0, -baseR - 30 * s, eyeR * 0.5, eyeR);
          g.fill({ color: 0xFFD700, alpha: eyeAlpha });
          g.ellipse(0, -baseR - 30 * s, eyeR * 0.15, eyeR * 0.8);
          g.fill({ color: 0x000000, alpha: eyeAlpha });
        }
      },
      onDecay: () => {
        this.fieldContainer.removeChild(g);
        g.destroy();
      },
    };
    return { effect: ef };
  }

  // ══════════════════════════════════════════════════════
  //  清理
  // ══════════════════════════════════════════════════════

  clear(): void {
    this.foresightAuras.forEach((_, playerId) => this.removeForesight(playerId));
  }

  destroy(): void {
    this.clear();
  }
}
