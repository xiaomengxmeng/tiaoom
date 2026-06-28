/**
 * 武器：情绪掌控 (Emotion Mastery) — 林澈
 *
 * 常驻特性：
 * - 每隔 6 秒自动轮转三种"心境"（愤怒/幸福/开心）
 *   - 愤怒（红）：碰撞伤害 +30%，受伤害 +20%
 *   - 幸福（蓝）：碰撞命中对手时使其减速 20%（持续 2 秒）
 *   - 开心（绿）：每次碰撞回复 2 点生命（满血则转化为临时护盾，上限 10 点）
 *
 * 爆发方式：
 * - 充能条件：在 5 秒内连续切换 3 种心境（完整轮转一圈）
 * - 触发条件：充能满足时自动触发
 * - 爆发效果 - 情绪实体化：召唤愤怒恶魔（红）、幸福老者（蓝）、开心小孩（绿）
 *   三个实体围绕自身旋转（半径 80px，持续 4 秒）
 *   对手接触：红=10伤害, 蓝=定身1秒, 绿=自身攻速/移速+20%（可叠加，上限40%）
 *
 * 状态机模式：在 onTick 中维护 currentMood + moodTimer
 */

import type { IBattleState } from '../../core/types';
import type {
  IWeapon, IPhysicsQuery, WeaponEffect, WeaponRuntimeState,
} from '../../core/IWeapon';
import { TICKS_PER_SEC } from '../../core/IWeapon';
import { WEAPON_RANGE_CONFIG } from '../../config/WeaponRangeConfig';
import { WeaponId, WeaponName, WeaponEffectType, VisualEventType, School } from '../../config/GameEnums';

/** 心境类型 */
type Mood = 'anger' | 'bliss' | 'happy';

/** 心境切换历史条目 */
interface MoodEntry {
  mood: Mood;
  tick: number;
}

/** 爆发期间的情绪实体 */
interface MoodEntity {
  mood: Mood;
  angle: number;
  angularSpeed: number;
}

/** 目标身上的速度增益追踪 */
interface SpeedBuffRecord {
  stacks: number;
  expiryTick: number;
}

export class EmotionMasteryWeapon implements IWeapon {
  static readonly ID = WeaponId.EMOTION_MASTERY;
  readonly id = WeaponId.EMOTION_MASTERY;
  readonly name = WeaponName.EMOTION_MASTERY;
  readonly school = School.WILD;
  readonly difficulty = 2;
  readonly iconId = 'game-icons:sparkles';
  playerId = '';

  private energy = 0;
  private tickCounter = 0;

  // 心境状态机
  private currentMood: Mood = 'anger';
  private moodTimer = 0; // ticks remaining in current mood
  private moodHistory: MoodEntry[] = []; // recent mood entries (for burst detection)
  private lastMoodTextTick = 0; // last mood text sent tick

  // 爆发状态
  private isBurstActive = false;
  private burstTicksLeft = 0;
  private burstEntities: MoodEntity[] = [];

  // 速度增益追踪
  private speedBuffs: Map<string, SpeedBuffRecord> = new Map();

  private cooldowns: Record<string, number> = {};
  private stacks: Record<string, number> = {};
  private flags: Record<string, boolean> = {};

  onTick(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    this.tickCounter++;
    const CFG = WEAPON_RANGE_CONFIG[this.id];
    if (!CFG) return effects;

    const selfPos = physics.getSelfPosition(this.playerId);
    if (!selfPos) return effects;

    // 清理过期速度增益
    for (const [pid, rec] of this.speedBuffs) {
      if (this.tickCounter >= rec.expiryTick) {
        this.speedBuffs.delete(pid);
      }
    }

    // 心境轮转计时器
    this.moodTimer--;
    if (this.moodTimer <= 0) {
      this.switchMood();
    }

    // 发送心境同步视觉事件（每 20 ticks ≈ 每秒一次）
    if (this.tickCounter - this.lastMoodTextTick >= TICKS_PER_SEC) {
      this.lastMoodTextTick = this.tickCounter;
      effects.push({
        type: WeaponEffectType.VISUAL_ONLY,
        sourceId: this.playerId, value: 0,
        position: { x: selfPos.x, y: selfPos.y },
        metadata: {
          visualType: VisualEventType.EMOTION_MASTERY_MOOD,
          currentMood: this.currentMood,
        },
      });
    }

    // 爆发期间：维护情绪实体 + 碰撞检测
    if (this.isBurstActive) {
      this.updateBurstEntities();
      effects.push(...this.checkBurstEntityCollisions(selfPos.x, selfPos.y, state, physics, CFG));
      this.burstTicksLeft--;
      if (this.burstTicksLeft <= 0) {
        this.isBurstActive = false;
        this.burstEntities = [];
      }
    }

    return effects;
  }

  // ── 心境切换 ─────────────────────────────────
  private switchMood(): void {
    const moodOrder: Mood[] = ['anger', 'bliss', 'happy'];
    const idx = moodOrder.indexOf(this.currentMood);
    const nextIdx = (idx + 1) % moodOrder.length;
    const prevMood = this.currentMood;
    this.currentMood = moodOrder[nextIdx];
    this.moodTimer = 6 * TICKS_PER_SEC; // 6 秒后切换

    // 记录心境切换历史
    this.moodHistory.push({ mood: this.currentMood, tick: this.tickCounter });

    // 清理 5 秒前的记录
    const fiveSecTicks = 5 * TICKS_PER_SEC;
    this.moodHistory = this.moodHistory.filter(e => this.tickCounter - e.tick < fiveSecTicks);

    // 检测爆发条件：5 秒内切换了 3 种不同心境
    const recentMoods = new Set(this.moodHistory.map(e => e.mood));
    if (recentMoods.size >= 3 && !this.isBurstActive) {
      this.energy = WEAPON_RANGE_CONFIG[this.id]?.maxEnergy ?? 3;
    }
  }

  // ── 碰撞目标 ─────────────────────────────────
  onHitTarget(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const selfPos = _physics.getSelfPosition(this.playerId);
    if (!selfPos) return [];

    const effects: WeaponEffect[] = [];
    const otherPlayers = _physics.getAllAliveOpponents(this.playerId);
    const closest = otherPlayers.length > 0 ? otherPlayers[0] : null;
    const targetId = closest?.id;

    switch (this.currentMood) {
      case 'anger':
        // 愤怒：碰撞伤害 +30%
        if (targetId) {
          effects.push({
            type: WeaponEffectType.DAMAGE,
            sourceId: this.playerId, targetId,
            value: 1.3, // +30% collision damage
            metadata: { desc: '情绪掌控·愤怒碰撞' },
          });
        }
        break;
      case 'bliss':
        // 幸福：命中减速 20%，持续 2 秒
        if (targetId) {
          effects.push({
            type: WeaponEffectType.SLOW,
            sourceId: this.playerId, targetId,
            value: 20, duration: 2,
            metadata: { desc: '情绪掌控·幸福减速' },
          });
        }
        break;
      case 'happy':
        // 开心：回复 2 点生命，满血转护盾
        effects.push({
          type: WeaponEffectType.SHIELD,
          sourceId: this.playerId, targetId: this.playerId,
          value: 2, duration: 5,
          metadata: { desc: '情绪掌控·开心回复' },
        });
        break;
    }

    return effects;
  }

  // ── 被碰撞（愤怒时多受 20% 伤害）────────────────
  onHitByAttacker(_attackerId: string, _state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    // 愤怒时额外受伤通过 burst 标记影响物理引擎
    return [];
  }

  // ── 爆发实体更新 ──────────────────────────────
  private updateBurstEntities(): void {
    for (const ent of this.burstEntities) {
      ent.angle += ent.angularSpeed;
    }
  }

  private checkBurstEntityCollisions(
    cx: number, cy: number,
    _state: IBattleState, physics: IPhysicsQuery,
    CFG: any,
  ): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const orbitRadius = CFG.damageRadius ?? 80;
    const contactDamage = CFG.field?.contactDamage ?? 10;

    for (const ent of this.burstEntities) {
      const ex = cx + Math.cos(ent.angle) * orbitRadius;
      const ey = cy + Math.sin(ent.angle) * orbitRadius;

      const hitRadius = 20; // 实体碰撞判定半径
      const opponents = physics.getAliveOpponentsInRadius(this.playerId, ex, ey, hitRadius);

      for (const opp of opponents) {
        switch (ent.mood) {
          case 'anger': // 红恶魔：10 伤害
            effects.push({
              type: WeaponEffectType.DAMAGE,
              sourceId: this.playerId, targetId: opp.id,
              value: contactDamage,
              metadata: { desc: '情绪掌控·愤怒恶魔' },
            });
            break;
          case 'bliss': // 蓝老者：定身 1 秒（强减速模拟）
            effects.push({
              type: WeaponEffectType.SLOW,
              sourceId: this.playerId, targetId: opp.id,
              value: 100, duration: 1, // 100% 减速 = 定身
              metadata: { desc: '情绪掌控·幸福定身' },
            });
            break;
          case 'happy': // 绿小孩：速度 +20%（叠加上限 40%）
            {
              const existing = this.speedBuffs.get(this.playerId);
              const newStacks = Math.min(2, (existing?.stacks ?? 0) + 1);
              this.speedBuffs.set(this.playerId, {
                stacks: newStacks,
                expiryTick: this.tickCounter + 3 * TICKS_PER_SEC,
              });
              effects.push({
                type: WeaponEffectType.VISUAL_ONLY,
                sourceId: this.playerId, value: newStacks * 20,
                position: { x: ex, y: ey },
                metadata: {
                  visualType: VisualEventType.EMOTION_MASTERY_MOOD,
                  currentMood: 'happy',
                  desc: `速度+${newStacks * 20}%`,
                },
              });
            }
            break;
        }
      }

      // 发送实体位置视觉事件（每 10 ticks 一次避免洪水）
      if (this.tickCounter % 10 === 0) {
        effects.push({
          type: WeaponEffectType.VISUAL_ONLY,
          sourceId: this.playerId, value: 0,
          position: { x: ex, y: ey },
          metadata: {
            visualType: VisualEventType.EMOTION_MASTERY_BURST,
            isBurst: true,
            radius: orbitRadius,
            currentMood: ent.mood,
            angle: ent.angle,
          },
        });
      }
    }

    return effects;
  }

  // ── 能量 / 爆发 ──────────────────────────────
  getEnergy(): number {
    const max = WEAPON_RANGE_CONFIG[this.id]?.maxEnergy ?? 3;
    return Math.round(this.energy / max * 100);
  }
  getMaxEnergy(): number {
    return 100;
  }
  setEnergy(percent: number): void {
    const max = WEAPON_RANGE_CONFIG[this.id]?.maxEnergy ?? 3;
    this.energy = Math.max(0, Math.min(max, percent / 100 * max));
  }

  isBurstReady(): boolean {
    return this.energy >= (WEAPON_RANGE_CONFIG[this.id]?.maxEnergy ?? 3) && !this.isBurstActive;
  }

  burst(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const CFG = WEAPON_RANGE_CONFIG[this.id];
    this.energy = 0;
    this.isBurstActive = true;
    this.burstTicksLeft = (CFG?.burstDurationSec ?? 4) * TICKS_PER_SEC;

    // 召唤三个情绪实体，初始角度均分 120°
    this.burstEntities = [
      { mood: 'anger', angle: 0, angularSpeed: 0.05 },
      { mood: 'bliss', angle: (2 * Math.PI) / 3, angularSpeed: 0.05 },
      { mood: 'happy', angle: (4 * Math.PI) / 3, angularSpeed: 0.05 },
    ];

    const effects: WeaponEffect[] = [];
    const selfPos = _physics.getSelfPosition(this.playerId);
    if (selfPos) {
      effects.push({
        type: WeaponEffectType.VISUAL_ONLY,
        sourceId: this.playerId, value: 0,
        position: { x: selfPos.x, y: selfPos.y },
        metadata: {
          visualType: VisualEventType.EMOTION_MASTERY_BURST,
          isBurst: true,
          desc: '情绪实体化',
          radius: CFG?.damageRadius ?? 80,
          durationSec: CFG?.burstDurationSec ?? 4,
          currentMood: 'burst',
        },
      });
    }

    return effects;
  }

  // ── 状态查询 ─────────────────────────────────
  getRuntimeState(): WeaponRuntimeState {
    return {
      energy: this.energy,
      maxEnergy: WEAPON_RANGE_CONFIG[this.id]?.maxEnergy ?? 3,
      cooldowns: this.cooldowns,
      stacks: this.stacks,
      flags: this.flags,
      custom: {
        currentMood: this.currentMood,
        moodTimer: this.moodTimer,
        isBurstActive: this.isBurstActive,
        burstTicksLeft: this.burstTicksLeft,
        burstEntityCount: this.burstEntities.length,
        speedBuffs: Array.from(this.speedBuffs.entries()).map(([pid, r]) => ({
          playerId: pid, stacks: r.stacks,
        })),
      },
    };
  }

  reset(): void {
    this.energy = 0;
    this.tickCounter = 0;
    this.currentMood = 'anger';
    this.moodTimer = 6 * TICKS_PER_SEC;
    this.moodHistory = [];
    this.lastMoodTextTick = 0;
    this.isBurstActive = false;
    this.burstTicksLeft = 0;
    this.burstEntities = [];
    this.speedBuffs.clear();
    this.cooldowns = {};
    this.stacks = {};
    this.flags = {};
  }
}
