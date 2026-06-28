/**
 * 武器：无限折叠 (Infinite Fold) - 陈厌孑
 *
 * 流派：变奏者 Wildcard
 * 难度：⭐⭐⭐
 *
 * ── 文档行为 ──
 * 被动 A（概率闪避）：有概率闪避伤害，闪避时空间扭曲特效
 *           每次成功闪避累计一层折叠（foldLayer），提升闪避后的空间稳定性
 * 被动 B（空间重组）：攻击时将敌人位置随机重组（传送），造成位移伤害
 * 爆发（维度坍缩）：将范围内所有敌人位置随机重组，造成范围伤害
 *       持续 3 秒，displacementRange 范围内随机传送
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
import type { HitReaction } from '../../shared/protocol';

export class InfiniteFoldWeapon implements IWeapon {
  static readonly ID = WeaponId.INFINITE_FOLD;
  readonly id = WeaponId.INFINITE_FOLD;
  readonly name = WeaponName.INFINITE_FOLD;
  readonly school = School.WILD;
  readonly difficulty = 3;
  readonly iconId = 'game-icons:folded-paper';
  playerId = '';

  private energy = 0;
  private isBurstActive = false;
  private burstTicksLeft = 0;

  /** 闪避概率（0-1） */
  private readonly dodgeProbability = 0.35;
  /** 折叠层数（成功闪避累计） */
  private foldLayer = 0;
  /** 空间重组次数 */
  private foldCount = 0;
  /** 闪避/重组限频计数（tick） */
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

    // ── 爆发：维度坍缩 ──
    if (this.isBurstActive) {
      if (this.burstTicksLeft <= 0) {
        this.isBurstActive = false;
      } else if (isSecondTick) {
        const center = physics.getArenaCenter();
        const arenaR = physics.getArenaRadius();
        const opponents = physics.getAliveOpponentsInRadius(
          this.playerId, center.x, center.y, CFG.aoeMaxRadius ?? 180,
        );
        for (const opp of opponents) {
          effects.push({
            type: WeaponEffectType.BURST_DAMAGE,
            sourceId: this.playerId,
            targetId: opp.id,
            value: CFG.burstDamage ?? 40,
            metadata: { desc: '维度坍缩伤害' },
          });
          // 空间扭曲减速
          effects.push({
            type: WeaponEffectType.SLOW,
            sourceId: this.playerId,
            targetId: opp.id,
            value: Math.round((1 - (CFG.field?.slowFactor ?? 0.5)) * 100),
            duration: 1,
            metadata: { desc: '维度坍缩减速' },
          });
        }
        // 爆发期间持续空间重组：重新随机化对手位置（仅视觉，实际位移由前端/调度器处理）
        const positions = this.computeRandomPositions(physics, opponents.length, arenaR);
        if (positions.length > 0) {
          effects.push({
            type: WeaponEffectType.VISUAL_ONLY,
            sourceId: this.playerId,
            value: 0,
            position: { x: center.x, y: center.y },
            metadata: {
              visualType: VisualEventType.INFINITE_FOLD_REASSEMBLE,
              foldCount: ++this.foldCount,
              targetPositions: opponents.map((opp, i) => ({
                id: opp.id,
                x: positions[i % positions.length].x,
                y: positions[i % positions.length].y,
              })),
              radius: CFG.aoeMaxRadius ?? 180,
            },
          });
        }
        this.burstTicksLeft--;
      }
    }

    return effects;
  }

  onHitTarget(_state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const CFG = WEAPON_RANGE_CONFIG[this.id];

    // 命中获得能量
    this.gainEnergy(CFG.energyPerHit ?? 14);
    return effects;
  }

  getHitReaction(): HitReaction {
    return 'pull';
  }

  onHitByAttacker(attackerId: string, state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const CFG = WEAPON_RANGE_CONFIG[this.id];

    // 限频
    const minIntervalTicks = Math.max(
      1,
      Math.round((CFG.triggerCooldowns?.minIntervalMs ?? 350) / (1000 / TICKS_PER_SEC)),
    );
    if (this.reactionCooldownTicks > 0) return effects;
    this.reactionCooldownTicks = minIntervalTicks;

    // 概率闪避判定
    const dodgeSuccess = Math.random() < this.dodgeProbability;
    if (dodgeSuccess) {
      this.foldLayer++;
    }

    const self = state.getPlayer(this.playerId);

    // 派发闪避视觉事件
    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: self?.position ? { x: self.position.x, y: self.position.y } : undefined,
      metadata: {
        visualType: VisualEventType.INFINITE_FOLD_DODGE,
        foldLayer: this.foldLayer,
        dodgeSuccess,
        targetId: attackerId,
        radius: CFG.damageRadius ?? 40,
      },
    });

    if (dodgeSuccess) {
      // 闪避成功：施加护盾抵消伤害（护盾值 = 武器基础伤害，代表抵消一次常规命中）
      effects.push({
        type: WeaponEffectType.SHIELD,
        sourceId: this.playerId,
        targetId: this.playerId,
        value: CFG.damage ?? 10,
        metadata: { desc: '无限折叠·空间闪避' },
      });
    } else {
      // 闪避失败：受到伤害，反击攻击者
      effects.push({
        type: WeaponEffectType.DAMAGE,
        sourceId: this.playerId,
        targetId: attackerId,
        value: CFG.damage ?? 10,
        metadata: { desc: '折叠反击伤害' },
      });
    }

    // 被击中获得能量
    this.gainEnergy(CFG.energyPerBurstHit ?? 22);
    void physics;
    return effects;
  }

  // ── 能量爆发 ──────────────────────────────────────

  getEnergy(): number {
    const max = WEAPON_RANGE_CONFIG[this.id].burstEnergyCost ?? WEAPON_RANGE_CONFIG[this.id].maxEnergy!;
    return Math.round(this.energy / max * 100);
  }
  getMaxEnergy(): number {
    return 100;
  }
  setEnergy(percent: number): void {
    const max = WEAPON_RANGE_CONFIG[this.id].burstEnergyCost ?? WEAPON_RANGE_CONFIG[this.id].maxEnergy!;
    this.energy = Math.max(0, Math.min(max, percent / 100 * max));
  }

  isBurstReady(): boolean {
    return this.energy >= this.getMaxEnergy()
      && !this.isBurstActive
      && this.burstCooldownTicksLeft <= 0;
  }

  burst(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    if (!this.isBurstReady()) return [];
    const CFG = WEAPON_RANGE_CONFIG[this.id];

    this.energy = 0;
    this.isBurstActive = true;
    this.burstTicksLeft = (CFG.burstDurationSec ?? 3) * TICKS_PER_SEC;
    this.burstCooldownTicksLeft = Math.round(
      ((CFG.cooldownMs ?? 5000) / 1000) * TICKS_PER_SEC,
    );

    const center = physics.getArenaCenter();
    const arenaR = physics.getArenaRadius();
    const radius = CFG.aoeMaxRadius ?? 180;
    const displacementRange = radius;
    const durationMs = (CFG.burstDurationSec ?? 3) * 1000;

    // 空间重组：将范围内敌人位置随机化
    const opponents = physics.getAliveOpponentsInRadius(
      this.playerId, center.x, center.y, radius,
    );
    const positions = this.computeRandomPositions(physics, opponents.length, arenaR);
    const targetPositions = opponents.map((opp, i) => ({
      id: opp.id,
      x: positions[i % positions.length].x,
      y: positions[i % positions.length].y,
    }));
    this.foldCount++;

    const effects: WeaponEffect[] = [];

    // 对范围内敌人造成爆发伤害
    for (const opp of opponents) {
      effects.push({
        type: WeaponEffectType.BURST_DAMAGE,
        sourceId: this.playerId,
        targetId: opp.id,
        value: CFG.burstDamage ?? 40,
        metadata: { desc: '维度坍缩爆发伤害' },
      });
    }

    // 派发爆发视觉事件
    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: center.x, y: center.y },
      metadata: {
        visualType: VisualEventType.INFINITE_FOLD_BURST,
        isBurst: true,
        radius,
        durationMs,
        displacementRange,
        foldCount: this.foldCount,
        targetPositions,
        desc: '维度坍缩启动',
      },
    });

    void state;
    return effects;
  }

  // ── 内部 ──────────────────────────────────────

  /** 在竞技场范围内生成 count 个随机位置 */
  private computeRandomPositions(
    physics: IPhysicsQuery,
    count: number,
    arenaR: number,
  ): Array<{ x: number; y: number }> {
    const center = physics.getArenaCenter();
    const positions: Array<{ x: number; y: number }> = [];
    const n = Math.max(1, count);
    for (let i = 0; i < n; i++) {
      // 在竞技场半径 80% 范围内随机
      const angle = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * arenaR * 0.8;
      positions.push({
        x: center.x + Math.cos(angle) * r,
        y: center.y + Math.sin(angle) * r,
      });
    }
    return positions;
  }

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
        foldLayer: this.foldLayer,
        foldCount: this.foldCount,
        burstTicksLeft: this.burstTicksLeft,
        burstCooldownTicksLeft: this.burstCooldownTicksLeft,
      },
    };
  }

  reset(): void {
    this.energy = 0;
    this.isBurstActive = false;
    this.burstTicksLeft = 0;
    this.foldLayer = 0;
    this.foldCount = 0;
    this.reactionCooldownTicks = 0;
    this.burstCooldownTicksLeft = 0;
    this.tickCounter = 0;
    this.cooldowns = {};
    this.stacks = {};
    this.flags = {};
  }
}
