/**
 * 武器：记忆回廊 (Memory Corridor) - 梦
 *
 * 流派：变奏者 Wildcard
 * 难度：⭐⭐⭐
 *
 * ── 文档行为 ──
 * 被动 A（回响 FIFO）：记录最近受到的伤害，按 FIFO 队列回响（重放历史伤害）
 *           每次受击记录一条记忆碎片，队列上限 5 条，超出则弹出最旧
 * 被动 B（历史共振）：攻击时根据当前回响层数提升伤害
 * 爆发（记忆洪流）：将所有回响同时释放，造成叠加伤害
 *       持续 5 秒，对范围内所有对手造成 totalDamage
 */

import type { IBattleState } from '../../core/types';
import type {
  IWeapon, IPhysicsQuery, WeaponEffect, WeaponRuntimeState,
} from '../../core/IWeapon';
import { TICKS_PER_SEC } from '../../core/IWeapon';
import { WEAPON_RANGE_CONFIG } from '../../config/WeaponRangeConfig';
import {
  WeaponId, WeaponName, WeaponEffectType, VisualEventType, School,
} from '../../config/GameEnums';

/** 记忆碎片（回响条目） */
interface MemoryShard {
  shardId: string;
  originalDamage: number;
}

export class MemoryCorridorWeapon implements IWeapon {
  static readonly ID = WeaponId.MEMORY_CORRIDOR;
  readonly id = WeaponId.MEMORY_CORRIDOR;
  readonly name = WeaponName.MEMORY_CORRIDOR;
  readonly school = School.WILD;
  readonly difficulty = 3;
  readonly iconId = 'game-icons:memory';
  playerId = '';

  private energy = 0;
  private isBurstActive = false;
  private burstTicksLeft = 0;

  /** 回响 FIFO 队列（最近受到的伤害） */
  private echoes: MemoryShard[] = [];
  /** 回响队列上限 */
  private readonly maxEchoCount = 5;
  /** 碎片 ID 自增计数 */
  private shardCounter = 0;
  /** 上一 tick 的 HP（用于估算实际受到的伤害） */
  private lastHp: number | null = null;
  /** 自上一 tick 以来累计受到的伤害 */
  private pendingDamageTaken = 0;
  /** 回响/共振限频计数（tick） */
  private reactionCooldownTicks = 0;
  /** 爆发冷却剩余（tick） */
  private burstCooldownTicksLeft = 0;

  private cooldowns: Record<string, number> = {};
  private stacks: Record<string, number> = {};
  private flags: Record<string, boolean> = {};
  private tickCounter = 0;

  // ── 生命周期 ──────────────────────────────────────

  onTick(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const CFG = WEAPON_RANGE_CONFIG[this.id];
    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    this.tickCounter++;
    const isSecondTick = this.tickCounter >= TICKS_PER_SEC;
    if (isSecondTick) this.tickCounter = 0;

    if (this.reactionCooldownTicks > 0) this.reactionCooldownTicks--;
    if (this.burstCooldownTicksLeft > 0) this.burstCooldownTicksLeft--;

    // 估算自上一 tick 以来受到的伤害
    if (this.lastHp !== null) {
      const delta = this.lastHp - self.hp;
      this.pendingDamageTaken = delta > 0 ? delta : 0;
    }
    this.lastHp = self.hp;

    // ── 爆发：记忆洪流 ──
    if (this.isBurstActive) {
      if (this.burstTicksLeft <= 0) {
        this.isBurstActive = false;
      } else if (isSecondTick) {
        const center = physics.getArenaCenter();
        const opponents = physics.getAliveOpponentsInRadius(
          this.playerId, center.x, center.y, CFG.aoeMaxRadius ?? 200,
        );
        for (const opp of opponents) {
          effects.push({
            type: WeaponEffectType.BURST_DAMAGE,
            sourceId: this.playerId,
            targetId: opp.id,
            value: CFG.burstDamage ?? 50,
            metadata: { desc: '记忆洪流伤害' },
          });
        }
        this.burstTicksLeft--;
      }
    }

    return effects;
  }

  onHitTarget(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const CFG = WEAPON_RANGE_CONFIG[this.id];

    // 攻击时派发历史共振视觉事件
    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      metadata: {
        visualType: VisualEventType.MEMORY_CORRIDOR_RESONANCE,
        resonanceStacks: this.echoes.length,
      },
    });

    // 命中获得能量
    this.gainEnergy(CFG.energyPerHit ?? 10);
    return effects;
  }

  onHitByAttacker(attackerId: string, state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const CFG = WEAPON_RANGE_CONFIG[this.id];

    // 限频
    const minIntervalTicks = Math.max(
      1,
      Math.round((CFG.triggerCooldowns?.minIntervalMs ?? 500) / (1000 / TICKS_PER_SEC)),
    );
    if (this.reactionCooldownTicks > 0) return effects;
    this.reactionCooldownTicks = minIntervalTicks;

    // 记录回响：使用估算的实际伤害，回退到武器基础伤害
    const originalDamage = this.pendingDamageTaken > 0
      ? this.pendingDamageTaken
      : (CFG.damage ?? 6);
    this.shardCounter++;
    const shardId = `mem_${this.shardCounter}`;

    const shard: MemoryShard = { shardId, originalDamage };
    this.echoes.push(shard);
    // FIFO：超出上限弹出最旧
    if (this.echoes.length > this.maxEchoCount) {
      this.echoes.shift();
    }

    // 派发回响视觉事件
    const self = state.getPlayer(this.playerId);
    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: self?.position ? { x: self.position.x, y: self.position.y } : undefined,
      metadata: {
        visualType: VisualEventType.MEMORY_CORRIDOR_ECHO,
        echoCount: this.echoes.length,
        originalDamage,
        shardId,
        targetId: attackerId,
        radius: CFG.damageRadius ?? 50,
      },
    });

    // 回响：重放历史伤害（弹出最旧的一条并施加给攻击者）
    const replayed = this.echoes.shift();
    if (replayed) {
      effects.push({
        type: WeaponEffectType.DAMAGE,
        sourceId: this.playerId,
        targetId: attackerId,
        value: replayed.originalDamage,
        metadata: { desc: `记忆回响重放（碎片 ${replayed.shardId}）` },
      });
    }

    // 被击中获得能量
    this.gainEnergy(CFG.energyPerBurstHit ?? 20);
    return effects;
  }

  // ── 能量爆发 ──────────────────────────────────────

  getEnergy(): number { return this.energy; }
  getMaxEnergy(): number { return WEAPON_RANGE_CONFIG[this.id].burstEnergyCost ?? WEAPON_RANGE_CONFIG[this.id].maxEnergy!; }

  isBurstReady(): boolean {
    return this.energy >= this.getMaxEnergy()
      && !this.isBurstActive
      && this.burstCooldownTicksLeft <= 0;
  }

  burst(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    if (!this.isBurstReady()) return [];
    const CFG = WEAPON_RANGE_CONFIG[this.id];

    // 历史共振：所有回响同时释放，叠加伤害
    const echoCount = this.echoes.length;
    const stackedDamage = this.echoes.reduce((sum, s) => sum + s.originalDamage, 0);
    const totalDamage = stackedDamage + (CFG.burstDamage ?? 50);

    this.energy = 0;
    this.isBurstActive = true;
    this.burstTicksLeft = (CFG.burstDurationSec ?? 5) * TICKS_PER_SEC;
    this.burstCooldownTicksLeft = Math.round(
      ((CFG.cooldownMs ?? 7000) / 1000) * TICKS_PER_SEC,
    );
    // 爆发释放后清空回响队列
    this.echoes = [];

    const center = physics.getArenaCenter();
    const radius = CFG.aoeMaxRadius ?? 200;
    const durationMs = (CFG.burstDurationSec ?? 5) * 1000;

    // 对范围内所有对手造成叠加伤害
    const opponents = physics.getAliveOpponentsInRadius(
      this.playerId, center.x, center.y, radius,
    );
    const effects: WeaponEffect[] = [];
    for (const opp of opponents) {
      effects.push({
        type: WeaponEffectType.BURST_DAMAGE,
        sourceId: this.playerId,
        targetId: opp.id,
        value: totalDamage,
        metadata: { desc: '记忆洪流·历史共振' },
      });
    }

    // 派发爆发视觉事件
    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: center.x, y: center.y },
      metadata: {
        visualType: VisualEventType.MEMORY_CORRIDOR_BURST,
        isBurst: true,
        echoCount,
        totalDamage,
        radius,
        durationMs,
        desc: '记忆洪流启动',
      },
    });

    void state;
    return effects;
  }

  // ── 内部 ──────────────────────────────────────

  private gainEnergy(amount: number): void {
    const max = WEAPON_RANGE_CONFIG[this.id].burstEnergyCost
      ?? WEAPON_RANGE_CONFIG[this.id].maxEnergy!;
    this.energy = Math.min(max, this.energy + amount);
  }

  // ── 状态 ──────────────────────────────────────

  getRuntimeState(): WeaponRuntimeState {
    return {
      energy: this.energy,
      maxEnergy: this.getMaxEnergy(),
      cooldowns: this.cooldowns,
      stacks: this.stacks,
      flags: { burstActive: this.isBurstActive },
      custom: {
        echoCount: this.echoes.length,
        burstTicksLeft: this.burstTicksLeft,
        burstCooldownTicksLeft: this.burstCooldownTicksLeft,
      },
    };
  }

  reset(): void {
    this.energy = 0;
    this.isBurstActive = false;
    this.burstTicksLeft = 0;
    this.echoes = [];
    this.shardCounter = 0;
    this.lastHp = null;
    this.pendingDamageTaken = 0;
    this.reactionCooldownTicks = 0;
    this.burstCooldownTicksLeft = 0;
    this.tickCounter = 0;
    this.cooldowns = {};
    this.stacks = {};
    this.flags = {};
  }
}
