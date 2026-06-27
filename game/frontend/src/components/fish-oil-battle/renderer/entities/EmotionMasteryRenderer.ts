import * as PIXI from 'pixi.js';
import type { ActiveEffect } from './VisualEffectUtils';
import { lighten, glowColor, easeOutCubic } from './VisualEffectUtils';

/**
 * 情绪掌控视觉配置（数据驱动，从 WeaponRangeConfig 构建）
 */
export interface EmotionMasteryVisualConfig {
  /** 实体公转半径 */
  orbitRadius?: number;
  /** 爆发持续时间（ms） */
  burstDurationMs?: number;
}

/** 活跃心境显示 */
interface ActiveMood {
  container: PIXI.Container;
  label: PIXI.Text;
  glow: PIXI.Graphics;
}

/** 爆发实体 */
interface BurstEntity {
  container: PIXI.Container;
  body: PIXI.Graphics;
  aura: PIXI.Graphics;
  mood: string;
}

/** 心境颜色映射 */
const MOOD_COLORS: Record<string, number> = {
  anger: 0xFF3333, // 愤怒红
  bliss: 0x4488FF,  // 幸福蓝
  happy: 0x44DD44,  // 开心绿
  burst: 0xFFFFFF,  // 爆发白
};

const MOOD_LABELS: Record<string, string> = {
  anger: '> ANGER',
  bliss: '> BLISS',
  happy: '> HAPPY',
};

const MOOD_EMOJI: Record<string, string> = {
  anger: '😡',
  bliss: '😌',
  happy: '😊',
};

/**
 * 情绪掌控特效渲染器
 *
 * 负责：
 * - 心境指示文字（"> ANGER" / "> BLISS" / "> HAPPY"）跟随玩家
 * - 爆发时三个情绪实体（红恶魔/蓝老者/绿小孩）围绕玩家旋转
 */
export class EmotionMasteryRenderer {
  private fieldContainer: PIXI.Container;
  private entityContainer: PIXI.Container;
  private scale = 1;

  /** 玩家心境显示: playerId → ActiveMood */
  private activeMoods: Map<string, ActiveMood> = new Map();

  /** 爆发实体: playerId → BurstEntity[] */
  private burstEntities: Map<string, BurstEntity[]> = new Map();

  /** 爆发外层容器: playerId → PIXI.Container（用于 setScale 同步缩放） */
  private burstContainers: Map<string, PIXI.Container> = new Map();

  constructor(fieldContainer: PIXI.Container, entityContainer: PIXI.Container) {
    this.fieldContainer = fieldContainer;
    this.entityContainer = entityContainer;
  }

  setScale(s: number): void {
    this.scale = s;
    // 同步已有爆发实体的外层容器缩放（参考 EntropicTouchRenderer）
    // 心境文字由 updateMood 每帧重绘自适应，无需在此处理
    this.burstContainers.forEach((container) => {
      if (container.destroyed) return;
      container.scale.set(s);
    });
  }

  // ══════════════════════════════════════════════════════
  //  心境指示
  // ══════════════════════════════════════════════════════

  /**
   * 更新/显示心境指示文字
   */
  updateMood(
    playerId: string,
    x: number,
    y: number,
    mood: string,
    themeColor?: number,
  ): void {
    const s = this.scale;
    let active = this.activeMoods.get(playerId);

    if (!active) {
      const container = new PIXI.Container();
      const label = new PIXI.Text('', {
        fontFamily: 'monospace, "Courier New"',
        fontSize: 14 * s,
        fill: MOOD_COLORS[mood] ?? 0xFFFFFF,
        fontWeight: 'bold',
        dropShadow: {
          alpha: 0.8,
          angle: Math.PI / 4,
          blur: 3,
          color: 0x000000,
          distance: 1,
        },
      });
      label.anchor.set(0.5, 1);
      const glow = new PIXI.Graphics();
      container.addChild(glow);
      container.addChild(label);
      this.entityContainer.addChild(container);

      active = { container, label, glow };
      this.activeMoods.set(playerId, active);
    }

    const moodText = MOOD_LABELS[mood] ?? `> ${mood.toUpperCase()}`;
    const moodColor = MOOD_COLORS[mood] ?? (themeColor ?? 0xFFFFFF);

    // 更新文字
    active.label.text = moodText;
    active.label.style = {
      fontFamily: 'monospace, "Courier New"',
      fontSize: 14 * s,
      fill: moodColor,
      fontWeight: 'bold',
      dropShadow: {
        alpha: 0.8,
        blur: 3,
        color: 0x000000,
        distance: 1,
      },
    };
    active.label.alpha = 0.85;
    active.label.anchor.set(0.5, 1);

    // 更新容器位置（在玩家头顶上方）
    active.container.position.set(x, y - 30 * s);

    // 绘制发光背景
    const glowG = active.glow;
    glowG.clear();
    const textW = active.label.width;
    const bgH = 18 * s;
    glowG.roundRect(-textW / 2 - 8 * s, -bgH - 12 * s, textW + 16 * s, bgH + 4 * s, 4 * s);
    glowG.fill({ color: moodColor, alpha: 0.1 });
    glowG.stroke({ color: moodColor, alpha: 0.3, width: 1 * s });
  }

  /**
   * 移除玩家心境显示
   */
  removeMood(playerId: string): void {
    const active = this.activeMoods.get(playerId);
    if (active) {
      active.container.destroy({ children: true });
      this.activeMoods.delete(playerId);
    }
  }

  // ══════════════════════════════════════════════════════
  //  爆发特效
  // ══════════════════════════════════════════════════════

  /**
   * 触发情绪实体化爆发，返回 ActiveEffect 用于生命周期管理
   *
   * @param orbitRadius 实体公转半径（逻辑像素，由外层 container.scale 统一缩放），默认 80
   */
  triggerBurst(
    playerId: string,
    x: number,
    y: number,
    durationMs: number,
    themeColor?: number,
    orbitRadius = 80,
  ): { effect: ActiveEffect | null } {
    const s = this.scale;

    // 清理旧实体
    this.removeBurstEntities(playerId);

    const container = new PIXI.Container();
    container.position.set(x, y);
    // 外层容器承担全局缩放，内部图形一律使用逻辑像素（参考 EntropicTouchRenderer）
    container.scale.set(s);
    this.entityContainer.addChild(container);

    const entities: BurstEntity[] = [];
    const moods: Array<'anger' | 'bliss' | 'happy'> = ['anger', 'bliss', 'happy'];

    for (let i = 0; i < 3; i++) {
      const mood = moods[i];
      const eContainer = new PIXI.Container();
      const eBody = new PIXI.Graphics();
      const eAura = new PIXI.Graphics();

      eContainer.addChild(eAura);
      eContainer.addChild(eBody);
      container.addChild(eContainer);

      entities.push({ container: eContainer, body: eBody, aura: eAura, mood });
      this.drawEmotionEntity(eBody, eAura, mood);
    }

    this.burstEntities.set(playerId, entities);
    this.burstContainers.set(playerId, container);

    const maxLife = durationMs;

    const effect: ActiveEffect = {
      // 专属类型标识，避免复用 EmotionalWeather 的事件类型
      type: 'emotion_mastery_burst',
      container,
      life: 0,
      maxLife,
      onUpdate: (_ef, dt) => {
        const t = _ef.life / maxLife;
        const alpha = t < 0.1 ? t / 0.1 : t > 0.8 ? (1 - t) / 0.2 : 1;
        container.alpha = alpha;

        // 数据驱动：公转半径从配置读取（逻辑像素，由 container.scale 统一缩放）
        const orbitR = orbitRadius;
        for (let j = 0; j < entities.length; j++) {
          const ent = entities[j];
          const angle = (j * 2 * Math.PI) / 3 + _ef.life * 0.003;
          ent.container.position.set(
            Math.cos(angle) * orbitR,
            Math.sin(angle) * orbitR,
          );

          // 脉冲缩放：仅动画幅度，全局缩放由外层 container 承担
          const pulse = 1 + 0.1 * Math.sin(_ef.life * 0.01 + j);
          ent.container.scale.set(pulse);
        }
      },
      onDecay: () => {
        container.destroy({ children: true });
        entities.length = 0;
        this.burstEntities.delete(playerId);
        this.burstContainers.delete(playerId);
      },
    };

    return { effect };
  }

  /**
   * 绘制情绪实体（逻辑像素，缩放由外层 container 承担）
   */
  private drawEmotionEntity(
    bodyG: PIXI.Graphics,
    auraG: PIXI.Graphics,
    mood: string,
  ): void {
    const color = MOOD_COLORS[mood] ?? 0xFFFFFF;
    const emoji = MOOD_EMOJI[mood] ?? '?';
    const radius = 12;

    // 光环
    auraG.circle(0, 0, radius + 6);
    auraG.fill({ color, alpha: 0.15 });
    auraG.circle(0, 0, radius);
    auraG.stroke({ color: glowColor(color), width: 2, alpha: 0.5 });

    // 实体
    bodyG.circle(0, 0, radius);
    bodyG.fill({ color: color, alpha: 0.6 });
    bodyG.circle(0, 0, radius);
    bodyG.stroke({ color: 0xFFFFFF, width: 1.5, alpha: 0.7 });

    // 表情符号用 Text
    if (emoji) {
      const text = new PIXI.Text(emoji, {
        fontFamily: 'Arial',
        fontSize: 10,
      });
      text.anchor.set(0.5);
      bodyG.addChild(text);
    }
  }

  /**
   * 移除玩家爆发实体（外层容器由 ActiveEffect.onDecay 负责销毁，此处仅清理引用）
   */
  private removeBurstEntities(playerId: string): void {
    const entities = this.burstEntities.get(playerId);
    if (entities) {
      for (const ent of entities) {
        if (!ent.container.destroyed) ent.container.destroy({ children: true });
      }
    }
    this.burstEntities.delete(playerId);
    this.burstContainers.delete(playerId);
  }

  // ══════════════════════════════════════════════════════
  //  生命周期
  // ══════════════════════════════════════════════════════

  clear(): void {
    for (const [, mood] of this.activeMoods) {
      mood.container.destroy({ children: true });
    }
    this.activeMoods.clear();
    // 销毁爆发外层容器（同时销毁内部实体子节点）
    for (const [, container] of this.burstContainers) {
      if (!container.destroyed) container.destroy({ children: true });
    }
    this.burstContainers.clear();
    this.burstEntities.clear();
  }

  destroy(): void {
    this.clear();
  }
}
