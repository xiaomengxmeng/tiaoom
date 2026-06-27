/**
 * 武器 11：体积扭曲 (Size Warp)
 *
 * 流派：变奏者 Wildcard (#FFD700)
 * 难度：⭐
 *
 * ── 核心设计 ──
 * 每 8 秒自动切换球体尺寸，0.5 倍（小）和 1.5 倍（大）交替。
 * 大球：碰撞判定 +50%。小球：碰撞判定 -50%，互撞伤害 -30%。
 * 完成 3 次切换后爆发：球体变 3 倍（3 秒），每次碰撞 18 伤害，自身受伤 +25%。
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

const SWITCH_INTERVAL_SEC = 8;
const SMALL_SCALE = 0.5;
const LARGE_SCALE = 1.5;
const GIANT_SCALE = 3;
const GIANT_DURATION_SEC = 3;
const SMALL_DAMAGE_REDUCTION = 0.3;
const GIANT_SELF_DAMAGE_BONUS = 0.25;

type SizeState = 'small' | 'large' | 'giant';

export class SizeWarpWeapon implements IWeapon {
  static readonly ID = WeaponId.SIZE_WARP;
  readonly id = WeaponId.SIZE_WARP;
  readonly name = WeaponName.SIZE_WARP;
  readonly school = School.WILD;
  readonly difficulty = 1;
  readonly iconId = 'game-icons:size-warp';
  playerId = '';

  private energy = 0;
  private sizeState: SizeState = 'large';
  private switchCooldownTicks = SWITCH_INTERVAL_SEC * TICKS_PER_SEC;
  private burstActive = false;
  private burstTicksLeft = 0;
  private cooldowns: Record<string, number> = {};
  private stacks: Record<string, number> = {};
  private flags: Record<string, boolean> = {};

  onTick(state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    // 爆发持续：巨型化
    if (this.burstActive) {
      if (this.burstTicksLeft <= 0) {
        this.burstActive = false;
        this.sizeState = 'large';
        this.switchCooldownTicks = SWITCH_INTERVAL_SEC * TICKS_PER_SEC;
      } else {
        this.burstTicksLeft--;
      }
      return effects;
    }

    // 尺寸切换
    if (this.switchCooldownTicks <= 0) {
      this.switchCooldownTicks = SWITCH_INTERVAL_SEC * TICKS_PER_SEC;
      this.sizeState = this.sizeState === 'small' ? 'large' : 'small';
      this.energy = Math.min(CFG.maxEnergy!, this.energy + 1);

      effects.push({
        type: WeaponEffectType.VISUAL_ONLY,
        sourceId: this.playerId,
        value: 0,
        position: { x: self.position.x, y: self.position.y },
        metadata: {
          visualType: VisualEventType.SIZE_WARP_FIELD,
          radius: CFG.damageRadius!,
          sizeState: this.sizeState,
          scale: this.getCurrentScale(),
        },
      });
    }
    if (this.switchCooldownTicks > 0) this.switchCooldownTicks--;

    return effects;
  }

  onHitTarget(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    if (this.sizeState === 'giant') {
      // 巨型化：18 伤害
      const opponent = _physics.getRandomAliveOpponent(this.playerId);
      if (opponent) {
        effects.push({
          type: WeaponEffectType.BURST_DAMAGE,
          sourceId: this.playerId,
          targetId: opponent.id,
          value: CFG.burstDamage!,
          metadata: { desc: '巨型化碰撞' },
        });
      }
    }
    return effects;
  }

  onHitByAttacker(_attackerId: string, _state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    if (this.sizeState === 'giant') {
      // 巨型化期间自身受伤 +25%
      effects.push({
        type: WeaponEffectType.DAMAGE,
        sourceId: this.playerId,
        targetId: this.playerId,
        value: 0,
        metadata: { desc: '巨型化受伤加成', damageBonus: GIANT_SELF_DAMAGE_BONUS },
      });
    }
    return effects;
  }

  private getCurrentScale(): number {
    switch (this.sizeState) {
      case 'small': return SMALL_SCALE;
      case 'large': return LARGE_SCALE;
      case 'giant': return GIANT_SCALE;
    }
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
    this.burstTicksLeft = GIANT_DURATION_SEC * TICKS_PER_SEC;
    this.sizeState = 'giant';

    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: self.position.x, y: self.position.y },
      metadata: {
        visualType: VisualEventType.SIZE_WARP_BURST,
        radius: CFG.aoeMaxRadius!,
        scale: GIANT_SCALE,
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
        sizeState: this.sizeState,
        scale: this.getCurrentScale(),
        switchCooldownTicks: this.switchCooldownTicks,
        burstTicksLeft: this.burstTicksLeft,
      },
    };
  }

  reset(): void {
    this.energy = 0;
    this.sizeState = 'large';
    this.switchCooldownTicks = SWITCH_INTERVAL_SEC * TICKS_PER_SEC;
    this.burstActive = false;
    this.burstTicksLeft = 0;
    this.cooldowns = {};
    this.stacks = {};
    this.flags = {};
  }
}

const CFG = WEAPON_RANGE_CONFIG[SizeWarpWeapon.ID];
