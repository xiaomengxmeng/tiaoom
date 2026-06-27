/**
 * 武器 8：堡垒构筑者 (Bastion Builder)
 *
 * 流派：工程师 Engineer (#39FF14)
 * 难度：⭐⭐⭐
 *
 * ── 核心设计 ──
 * 球体碰撞墙壁时，在碰撞位置生成 3×3 方块（边长 50px，持续 12 秒）。
 * 对手碰撞方块 = 4 伤害。场上最多 6 个方块。
 * 每 5 秒方块长尖刺（3 秒），碰撞尖刺 +8 伤害。
 * 场上 6 个方块时爆发：合并为大型墙壁（5 秒），碰撞 12 伤害。自身可穿过。
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

const SPIKE_INTERVAL_SEC = 5;
const SPIKE_DURATION_SEC = 3;
const SPIKE_EXTRA_DAMAGE = 8;

interface BastionBlock {
  id: string;
  x: number;
  y: number;
  secondsLeft: number;
  hasSpikes: boolean;
  spikeTicksLeft: number;
  hitTargets: Set<string>;
}

export class BastionBuilderWeapon implements IWeapon {
  static readonly ID = WeaponId.BASTION_BUILDER;
  readonly id = WeaponId.BASTION_BUILDER;
  readonly name = WeaponName.BASTION_BUILDER;
  readonly school = School.ENGINEER;
  readonly difficulty = 3;
  readonly iconId = 'game-icons:bastion';
  playerId = '';

  private energy = 0;
  private blocks: BastionBlock[] = [];
  private spikeCooldownTicks = 0;
  private burstActive = false;
  private burstTicksLeft = 0;
  private tickCounter = 0;
  private cooldowns: Record<string, number> = {};
  private stacks: Record<string, number> = {};
  private flags: Record<string, boolean> = {};

  onTick(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];

    this.tickCounter++;
    const isSecondTick = this.tickCounter >= TICKS_PER_SEC;
    if (isSecondTick) this.tickCounter = 0;

    // 方块生命周期 + 尖刺计时
    if (isSecondTick) {
      for (const b of this.blocks) {
        b.secondsLeft--;
        if (b.spikeTicksLeft > 0) {
          b.spikeTicksLeft--;
          if (b.spikeTicksLeft <= 0) b.hasSpikes = false;
        }
      }
      this.blocks = this.blocks.filter(b => b.secondsLeft > 0);
    }

    // 每 5 秒长尖刺
    if (this.spikeCooldownTicks <= 0 && this.blocks.length > 0) {
      this.spikeCooldownTicks = SPIKE_INTERVAL_SEC * TICKS_PER_SEC;
      for (const b of this.blocks) {
        b.hasSpikes = true;
        b.spikeTicksLeft = SPIKE_DURATION_SEC * TICKS_PER_SEC;
        b.hitTargets.clear();
      }
    }
    if (this.spikeCooldownTicks > 0) this.spikeCooldownTicks--;

    // 方块碰撞检测
    for (const block of this.blocks) {
      const nearby = physics.getAliveOpponentsInRadius(
        this.playerId, block.x, block.y, CFG.damageRadius!,
      );
      for (const opp of nearby) {
        if (block.hitTargets.has(opp.id)) continue;
        block.hitTargets.add(opp.id);

        effects.push({
          type: WeaponEffectType.DAMAGE,
          sourceId: this.playerId,
          targetId: opp.id,
          value: CFG.damage!,
          metadata: { desc: '方块碰撞', blockId: block.id },
        });

        if (block.hasSpikes) {
          effects.push({
            type: WeaponEffectType.DAMAGE,
            sourceId: this.playerId,
            targetId: opp.id,
            value: SPIKE_EXTRA_DAMAGE,
            metadata: { desc: '尖刺伤害', blockId: block.id },
          });
        }
      }
    }

    // 爆发持续：合并墙壁
    if (this.burstActive) {
      if (this.burstTicksLeft <= 0) {
        this.burstActive = false;
      } else {
        // 墙壁对所有对手造成碰撞伤害
        if (isSecondTick) {
          const allOpponents = physics.getAllAliveOpponents(this.playerId);
          for (const opp of allOpponents) {
            // 简化：墙壁覆盖全图 40%，对所有对手造成伤害
            effects.push({
              type: WeaponEffectType.BURST_DAMAGE,
              sourceId: this.playerId,
              targetId: opp.id,
              value: CFG.burstDamage!,
              metadata: { desc: '要塞墙壁碰撞' },
            });
          }
        }
        this.burstTicksLeft--;
      }
    }

    return effects;
  }

  onHitTarget(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    return [];
  }

  onHitByAttacker(_attackerId: string, _state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    return [];
  }

  onWallHit(state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    // 生成方块（最多 6 个）
    if (this.blocks.length < CFG.field!.maxCount!) {
      const blockId = `block_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      this.blocks.push({
        id: blockId,
        x: self.position.x,
        y: self.position.y,
        secondsLeft: CFG.field!.durationSec!,
        hasSpikes: false,
        spikeTicksLeft: 0,
        hitTargets: new Set(),
      });

      this.energy = Math.min(CFG.maxEnergy!, this.energy + 1);

      effects.push({
        type: WeaponEffectType.VISUAL_ONLY,
        sourceId: this.playerId,
        value: 0,
        position: { x: self.position.x, y: self.position.y },
        metadata: {
          visualType: VisualEventType.BASTION_BUILDER_SHIELD,
          radius: CFG.damageRadius!,
          blockId,
          blockCount: this.blocks.length,
        },
      });
    }

    return effects;
  }

  getEnergy(): number { return this.energy; }
  getMaxEnergy(): number { return CFG.maxEnergy!; }

  isBurstReady(): boolean {
    return this.energy >= CFG.maxEnergy! && !this.burstActive;
  }

  burst(state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    this.energy = 0;
    this.burstActive = true;
    this.burstTicksLeft = CFG.burstDurationSec! * TICKS_PER_SEC;

    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: self.position.x, y: self.position.y },
      metadata: {
        visualType: VisualEventType.BASTION_BUILDER_BURST,
        radius: CFG.aoeMaxRadius!,
        blockCount: this.blocks.length,
      },
    });

    return effects;
  }

  getRuntimeState(): WeaponRuntimeState {
    return {
      energy: this.energy,
      maxEnergy: CFG.maxEnergy!,
      cooldowns: this.cooldowns,
      stacks: this.stacks,
      flags: { burstActive: this.burstActive },
      custom: {
        blockCount: this.blocks.length,
        burstTicksLeft: this.burstTicksLeft,
      },
    };
  }

  reset(): void {
    this.energy = 0;
    this.blocks = [];
    this.spikeCooldownTicks = 0;
    this.burstActive = false;
    this.burstTicksLeft = 0;
    this.tickCounter = 0;
    this.cooldowns = {};
    this.stacks = {};
    this.flags = {};
  }
}

const CFG = WEAPON_RANGE_CONFIG[BastionBuilderWeapon.ID];
