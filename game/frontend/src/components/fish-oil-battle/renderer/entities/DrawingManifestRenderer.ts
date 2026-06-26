/**
 * 画作实体化 (Drawing Manifest) - 白猫
 * 前端视觉渲染器
 *
 * 视觉设计：
 * - 小兔玩偶：粉色小圆球跟随球体，头顶铅笔图标（长度=墨水层数）
 * - 肌肉兔降临：巨大化（半径50px），水汪汪眼睛，爆发光环
 * - 冲刺撞击：肌肉兔向目标飞行的拖尾轨迹
 */

import * as PIXI from 'pixi.js';
import { easeOutCubic, type ActiveEffect } from './VisualEffectUtils';

/** 画作实体化视觉配置（数据驱动） */
export interface DrawingManifestVisualConfig {
  /** 小兔半径（逻辑 px） */
  rabbitRadius?: number;
  /** 肌肉兔半径（逻辑 px） */
  muscleRadius?: number;
  /** 冲刺飞行速度（px/s） */
  dashSpeed?: number;
  /** 爆发持续（ms） */
  burstDurationMs?: number;
}

/** 活跃小兔/肌肉兔实例（常驻跟随） */
interface ActiveRabbit {
  container: PIXI.Container;
  bodyGraphics: PIXI.Graphics;
  pencilGraphics: PIXI.Graphics;
  label?: PIXI.Text;
  playerId: string;
  inkStacks: number;
  isMuscle: boolean;
}

/** 活跃冲刺特效 */
interface ActiveDash {
  container: PIXI.Container;
  graphics: PIXI.Graphics;
  life: number;
  maxLife: number;
}

export class DrawingManifestRenderer {
  private entityContainer: PIXI.Container;
  private fieldContainer: PIXI.Container;
  private scale = 1;

  /** 每个玩家一个常驻兔子 */
  private rabbits: Map<string, ActiveRabbit> = new Map();
  /** 活跃冲刺特效 */
  private activeDashes: ActiveDash[] = [];
  /** 活跃爆发特效 */
  private activeBursts: Map<string, ActiveEffect> = new Map();

  constructor(entityContainer: PIXI.Container, fieldContainer: PIXI.Container) {
    this.entityContainer = entityContainer;
    this.fieldContainer = fieldContainer;
  }

  setScale(scale: number): void {
    this.scale = scale;
  }

  // ══════════════════════════════════════════════════════
  //  小兔/肌肉兔跟随（常驻）
  // ══════════════════════════════════════════════════════

  /**
   * 更新小兔状态（墨水层数 + 形态 + 位置）
   * x/y 为画布像素坐标（已由 mapX/mapY 映射）
   */
  updateRabbit(
    playerId: string,
    x: number,
    y: number,
    inkStacks: number,
    isMuscle: boolean,
    themeColor = 0xFF69B4,
    visualCfg?: DrawingManifestVisualConfig,
  ): void {
    const s = this.scale;
    const rabbitRadius = (visualCfg?.rabbitRadius ?? 20) * s;
    const muscleRadius = (visualCfg?.muscleRadius ?? 50) * s;

    let rabbit = this.rabbits.get(playerId);
    if (!rabbit) {
      const container = new PIXI.Container();
      const bodyGraphics = new PIXI.Graphics();
      const pencilGraphics = new PIXI.Graphics();
      container.addChild(bodyGraphics);
      container.addChild(pencilGraphics);
      this.entityContainer.addChild(container);

      rabbit = {
        container,
        bodyGraphics,
        pencilGraphics,
        playerId,
        inkStacks: 0,
        isMuscle: false,
      };
      this.rabbits.set(playerId, rabbit);
    }

    rabbit.container.position.set(x, y);
    rabbit.inkStacks = inkStacks;
    rabbit.isMuscle = isMuscle;

    // 重绘兔子
    this.drawRabbit(rabbit, rabbitRadius, muscleRadius, themeColor);
  }

  /** 绘制小兔/肌肉兔 */
  private drawRabbit(
    rabbit: ActiveRabbit,
    rabbitRadius: number,
    muscleRadius: number,
    color: number,
  ): void {
    const { bodyGraphics, pencilGraphics, isMuscle, inkStacks } = rabbit;
    const s = this.scale;

    // ── 身体 ──
    bodyGraphics.clear();
    const radius = isMuscle ? muscleRadius : rabbitRadius;

    // 主体圆
    bodyGraphics.circle(0, 0, radius);
    bodyGraphics.fill({ color, alpha: 0.85 });
    bodyGraphics.stroke({ color: 0xFFFFFF, width: 2 * s, alpha: 0.6 });

    if (isMuscle) {
      // 肌肉兔：水汪汪眼睛 + 爆气光环
      // 眼睛（水汪汪）
      bodyGraphics.circle(-radius * 0.3, -radius * 0.15, radius * 0.18);
      bodyGraphics.fill({ color: 0xFFFFFF, alpha: 0.9 });
      bodyGraphics.circle(-radius * 0.3, -radius * 0.15, radius * 0.1);
      bodyGraphics.fill({ color: 0x000000, alpha: 1 });
      bodyGraphics.circle(radius * 0.3, -radius * 0.15, radius * 0.18);
      bodyGraphics.fill({ color: 0xFFFFFF, alpha: 0.9 });
      bodyGraphics.circle(radius * 0.3, -radius * 0.15, radius * 0.1);
      bodyGraphics.fill({ color: 0x000000, alpha: 1 });
      // 爆气光环
      bodyGraphics.circle(0, 0, radius * 1.15);
      bodyGraphics.stroke({ color: 0xFFD700, width: 3 * s, alpha: 0.5 });
      // 肌肉线条
      bodyGraphics.moveTo(-radius * 0.5, radius * 0.3);
      bodyGraphics.lineTo(radius * 0.5, radius * 0.3);
      bodyGraphics.stroke({ color: 0xFF4444, width: 2 * s, alpha: 0.7 });
    } else {
      // 小兔：可爱眼睛 + 长耳朵
      // 耳朵
      bodyGraphics.ellipse(-radius * 0.4, -radius * 1.1, radius * 0.2, radius * 0.5);
      bodyGraphics.fill({ color, alpha: 0.8 });
      bodyGraphics.ellipse(radius * 0.4, -radius * 1.1, radius * 0.2, radius * 0.5);
      bodyGraphics.fill({ color, alpha: 0.8 });
      // 眼睛
      bodyGraphics.circle(-radius * 0.3, -radius * 0.1, radius * 0.12);
      bodyGraphics.fill({ color: 0x000000, alpha: 1 });
      bodyGraphics.circle(radius * 0.3, -radius * 0.1, radius * 0.12);
      bodyGraphics.fill({ color: 0x000000, alpha: 1 });
    }

    // ── 铅笔图标（头顶，长度=墨水层数） ──
    pencilGraphics.clear();
    if (inkStacks > 0 && !isMuscle) {
      const pencilLen = 8 + inkStacks * 4;
      const pencilW = 3 * s;
      const py = -radius - pencilLen * 0.5 - 4 * s;
      // 铅笔主体（黄色）
      pencilGraphics.rect(-pencilW, py - pencilLen * 0.5, pencilW * 2, pencilLen);
      pencilGraphics.fill({ color: 0xFFD700, alpha: 0.9 });
      // 笔尖（6层时发光）
      if (inkStacks >= 6) {
        pencilGraphics.circle(0, py + pencilLen * 0.5 + 3 * s, 4 * s);
        pencilGraphics.fill({ color: 0xFFFFFF, alpha: 0.9 });
        // 发光
        pencilGraphics.circle(0, py + pencilLen * 0.5 + 3 * s, 7 * s);
        pencilGraphics.stroke({ color: 0xFFD700, width: 2 * s, alpha: 0.5 });
      } else {
        pencilGraphics.poly(
          [-pencilW, py + pencilLen * 0.5,
            pencilW, py + pencilLen * 0.5,
            0, py + pencilLen * 0.5 + 5 * s],
        );
        pencilGraphics.fill({ color: 0xDDDDDD, alpha: 0.9 });
      }
    }
  }

  /** 移除玩家兔子 */
  removeRabbit(playerId: string): void {
    const rabbit = this.rabbits.get(playerId);
    if (rabbit) {
      this.entityContainer.removeChild(rabbit.container);
      rabbit.container.destroy({ children: true });
      this.rabbits.delete(playerId);
    }
  }

  // ══════════════════════════════════════════════════════
  //  肌肉兔降临爆发
  // ══════════════════════════════════════════════════════

  /**
   * 触发肌肉兔降临爆发特效
   * x/y 为画布像素坐标
   */
  triggerBurst(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    durationMs: number,
    themeColor = 0xFF69B4,
  ): { effect: ActiveEffect | null } {
    const s = this.scale;
    const r = radius * s;
    const g = new PIXI.Graphics();
    g.position.set(x, y);
    this.fieldContainer.addChild(g);

    let phase = 0;
    const ef: ActiveEffect = {
      type: 'drawing_manifest_burst',
      container: g as unknown as PIXI.Container,
      life: 0,
      maxLife: durationMs,
      onUpdate: (_ef, _dt) => {
        const t = _ef.life / _ef.maxLife;
        g.clear();
        // 扩散光环（生长动画 0-400ms）
        const growT = Math.min(1, _ef.life / 400);
        const grow = easeOutCubic(growT);
        const currentR = r * (0.3 + 0.7 * grow);

        // 外圈爆发光环
        g.circle(0, 0, currentR);
        g.stroke({ color: 0xFFD700, width: 4 * s, alpha: 0.7 * (1 - t * 0.4) });
        g.circle(0, 0, currentR);
        g.fill({ color: 0xFFD700, alpha: 0.1 * (1 - t * 0.5) });

        // 脉冲波纹
        const pulseR = r * (0.5 + 0.5 * Math.sin(phase));
        g.circle(0, 0, pulseR);
        g.stroke({ color: themeColor, width: 2 * s, alpha: 0.5 * (1 - t * 0.3) });
        phase += _dt / 300;

        // 中心闪光（前 0.3s）
        if (t < 0.1) {
          g.circle(0, 0, r * 0.4 * (1 - t / 0.1));
          g.fill({ color: 0xFFFFFF, alpha: 0.8 * (1 - t / 0.1) });
        }
      },
      onDecay: () => {
        this.fieldContainer.removeChild(g);
        g.destroy();
        this.activeBursts.delete(playerId);
      },
    };
    this.activeBursts.set(playerId, ef);
    return { effect: ef };
  }

  // ══════════════════════════════════════════════════════
  //  冲刺撞击特效
  // ══════════════════════════════════════════════════════

  /**
   * 触发冲刺特效（飞行轨迹）
   * fromX/fromY, toX/toY 为画布像素坐标
   */
  triggerDash(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    isHit: boolean,
    themeColor = 0xFF69B4,
  ): { effect: ActiveEffect | null } {
    const s = this.scale;
    const g = new PIXI.Graphics();
    this.fieldContainer.addChild(g);

    const dx = toX - fromX;
    const dy = toY - fromY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const durationMs = 400;

    const ef: ActiveEffect = {
      type: 'drawing_manifest_dash',
      container: g as unknown as PIXI.Container,
      life: 0,
      maxLife: durationMs,
      onUpdate: (_ef, _dt) => {
        const t = _ef.life / _ef.maxLife;
        g.clear();
        // 飞行轨迹（从起点到终点的渐变线）
        const progress = easeOutCubic(Math.min(1, t * 1.2));
        const cx = fromX + dx * progress;
        const cy = fromY + dy * progress;

        // 拖尾
        const trailLen = 30 * s;
        const trailStartT = Math.max(0, progress - trailLen / dist);
        const tsx = fromX + dx * trailStartT;
        const tsy = fromY + dy * trailStartT;
        g.moveTo(tsx, tsy);
        g.lineTo(cx, cy);
        g.stroke({ color: 0xFFD700, width: 5 * s, alpha: 0.6 * (1 - t * 0.5) });

        // 肌肉兔头部（飞行中）
        g.circle(cx, cy, 12 * s);
        g.fill({ color: themeColor, alpha: 0.9 * (1 - t * 0.3) });
        g.stroke({ color: 0xFFD700, width: 2 * s, alpha: 0.8 });

        // 命中爆裂
        if (isHit && t > 0.8) {
          const hitT = (t - 0.8) / 0.2;
          g.circle(toX, toY, 20 * s * hitT);
          g.stroke({ color: 0xFFFFFF, width: 3 * s, alpha: 0.8 * (1 - hitT) });
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
    this.rabbits.forEach((_, playerId) => this.removeRabbit(playerId));
    this.activeBursts.clear();
    this.activeDashes = [];
  }

  destroy(): void {
    this.clear();
  }
}
