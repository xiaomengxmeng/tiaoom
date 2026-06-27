/**
 * 武器 12：弹射核心 (Ricochet Core)
 *
 * 流派：变奏者 Wildcard (#FFD700)
 * 难度：⭐⭐
 *
 * ── 核心设计 ──
 * 球体永不减速。每次撞墙移速 +8%（无限叠加）。
 * 高速碰撞对手额外伤害 = 当前速度加成 × 0.5。
 * 球速达基准 200% 时爆发：飙至 300%（4 秒），每次撞墙分裂弹射碎片（8 伤害）。
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

const SPEED_BONUS_PER_WALL = 8; // 每次撞墙 +8%
const SPEED_THRESHOLD = 200; // 爆发阈值
const BURST_SPEED_MULT = 300; // 爆发 300%
const BURST_DURATION_SEC = 4;
const FRAGMENT_DAMAGE = 8;
const SPEED_DAMAGE_RATIO = 0.5;

export class RicochetCoreWeapon implements IWeapon {
  static readonly ID = WeaponId.RICOCHET_CORE;
  readonly id = WeaponId.RICOCHET_CORE;
  readonly name = WeaponName.RICOCHET_CORE;
  readonly school = School.WILD;
  readonly difficulty = 2;
  readonly iconId = 'game-icons:ricochet';
  playerId = '';

  private energy = 0; // 当前速度加成 %
  private burstActive = false;
  private burstTicksLeft = 0;
  private cooldowns: Record<string, number> = {};
  private stacks: Record<string, number> = {};
  private flags: Record<string, boolean> = {};

  onTick(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];

    // 爆发持续
    if (this.burstActive) {
      if (this.burstTicksLeft <= 0) {
        this.burstActive = false;
        // 保留爆发前速度层数（不清零 energy）
      } else {
        this.burstTicksLeft--;
      }
    }

    return effects;
  }

  onHitTarget(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const opponent = _physics.getRandomAliveOpponent(this.playerId);
    if (!opponent) return effects;

    // 高速碰撞额外伤害 = 当前速度加成 × 0.5
    const speedBonus = this.getCurrentSpeedBonus();
    const extraDamage = Math.floor(speedBonus * SPEED_DAMAGE_RATIO);

    if (extraDamage > 0) {
      effects.push({
        type: WeaponEffectType.DAMAGE,
        sourceId: this.playerId,
        targetId: opponent.id,
        value: extraDamage,
        metadata: {
          desc: '高速碰撞额外伤害',
          speedBonus: speedBonus,
        },
      });
    }

    return effects;
  }

  onHitByAttacker(_attackerId: string, _state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    return [];
  }

  onWallHit(state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    // 撞墙 +8% 速度
    this.energy += SPEED_BONUS_PER_WALL;

    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: self.position.x, y: self.position.y },
      metadata: {
        visualType: VisualEventType.RICOCHET_CORE_TRAIL,
        radius: CFG.damageRadius!,
        speedBonus: this.energy,
      },
    });

    // 爆发期间撞墙分裂弹射碎片
    if (this.burstActive) {
      const allOpponents = _physics.getAllAliveOpponents(this.playerId);
      for (const opp of allOpponents) {
        effects.push({
          type: WeaponEffectType.AOE_DAMAGE,
          sourceId: this.playerId,
          targetId: opp.id,
          value: FRAGMENT_DAMAGE,
          metadata: { desc: '弹射碎片' },
        });
      }
    }

    return effects;
  }

  private getCurrentSpeedBonus(): number {
    if (this.burstActive) return BURST_SPEED_MULT;
    return this.energy;
  }

  getEnergy(): number { return this.energy; }
  getMaxEnergy(): number { return CFG.maxEnergy!; }

  isBurstReady(): boolean {
    return this.energy >= SPEED_THRESHOLD && !this.burstActive;
  }

  burst(state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    this.burstActive = true;
    this.burstTicksLeft = BURST_DURATION_SEC * TICKS_PER_SEC;

    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: self.position.x, y: self.position.y },
      metadata: {
        visualType: VisualEventType.RICOCHET_CORE_BURST,
        radius: CFG.aoeMaxRadius!,
        speedBonus: BURST_SPEED_MULT,
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
        speedBonus: this.energy,
        currentSpeed: this.getCurrentSpeedBonus(),
        burstTicksLeft: this.burstTicksLeft,
      },
    };
  }

  reset(): void {
    this.energy = 0;
    this.burstActive = false;
    this.burstTicksLeft = 0;
    this.cooldowns = {};
    this.stacks = {};
    this.flags = {};
  }
}

const CFG = WEAPON_RANGE_CONFIG[RicochetCoreWeapon.ID];
