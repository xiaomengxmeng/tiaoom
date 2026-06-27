/**
 * 武器 2：纳米撕裂者 (Nano Ripper)
 *
 * 流派：侵略者 Aggressor (#FF00FF)
 * 难度：⭐
 *
 * ── 核心设计 ──
 * 球体延伸出 2 条纳米触手（两侧各 40px），触手碰到对手 = 互撞 + 4 撕裂伤害。
 * 每 6 秒触手交叉扫荡，扫中 10 伤害 + 1 层撕裂。
 * 撕裂达 4 层引爆：每层 6 伤害（共 24），移速 -30% 持续 2 秒。
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

const SWEEP_DAMAGE = 10;
const SWEEP_INTERVAL_SEC = 6;
const TEAR_SLOW_PERCENT = 30;
const TEAR_SLOW_DURATION_SEC = 2;

interface TearStack {
  targetId: string;
  stacks: number;
  lastSweepTick: number;
}

export class NanoRipperWeapon implements IWeapon {
  static readonly ID = WeaponId.NANO_RIPPER;
  readonly id = WeaponId.NANO_RIPPER;
  readonly name = WeaponName.NANO_RIPPER;
  readonly school = School.AGGRESSOR;
  readonly difficulty = 1;
  readonly iconId = 'game-icons:nano-ripper';
  playerId = '';

  private energy = 0;
  private tearStacks: Map<string, TearStack> = new Map();
  private sweepCooldownTicks = 0;
  private burstActive = false;
  private burstTicksLeft = 0;
  private cooldowns: Record<string, number> = {};
  private stacks: Record<string, number> = {};
  private flags: Record<string, boolean> = {};

  onTick(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    // 扫荡冷却推进
    if (this.sweepCooldownTicks > 0) {
      this.sweepCooldownTicks--;
    }

    // 自动扫荡触发（每 6 秒）
    if (this.sweepCooldownTicks <= 0) {
      this.sweepCooldownTicks = SWEEP_INTERVAL_SEC * TICKS_PER_SEC;

      const nearby = physics.getAliveOpponentsInRadius(
        this.playerId, self.position.x, self.position.y, CFG.damageRadius!,
      );

      effects.push({
        type: WeaponEffectType.VISUAL_ONLY,
        sourceId: this.playerId,
        value: 0,
        position: { x: self.position.x, y: self.position.y },
        metadata: {
          visualType: VisualEventType.NANO_RIPPER_FIELD,
          radius: CFG.damageRadius!,
        },
      });

      for (const opp of nearby) {
        effects.push({
          type: WeaponEffectType.DAMAGE,
          sourceId: this.playerId,
          targetId: opp.id,
          value: SWEEP_DAMAGE,
          metadata: { desc: '纳米触手扫荡' },
        });

        // 叠加撕裂层数
        const ts = this.tearStacks.get(opp.id) ?? {
          targetId: opp.id, stacks: 0, lastSweepTick: 0,
        };
        ts.stacks++;
        ts.lastSweepTick = state.tick;
        this.tearStacks.set(opp.id, ts);

        // 充能
        this.energy = Math.min(CFG.maxEnergy!, this.energy + 1);
      }
    }

    // 爆发持续：减速效果
    if (this.burstActive) {
      if (this.burstTicksLeft <= 0) {
        this.burstActive = false;
      } else {
        // 每 tick 持续减速（通过 1 tick 持续 slow 效果）
        for (const [tid, ts] of this.tearStacks) {
          if (ts.stacks > 0) {
            effects.push({
              type: WeaponEffectType.SLOW,
              sourceId: this.playerId,
              targetId: tid,
              value: TEAR_SLOW_PERCENT,
              duration: 1,
              metadata: { desc: '撕裂减速' },
            });
          }
        }
        this.burstTicksLeft--;
      }
    }

    return effects;
  }

  onHitTarget(state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    const opponent = _physics.getRandomAliveOpponent(this.playerId);
    if (opponent) {
      effects.push({
        type: WeaponEffectType.DAMAGE,
        sourceId: this.playerId,
        targetId: opponent.id,
        value: CFG.damage!,
        metadata: { desc: '触手撕裂伤害' },
      });
    }

    return effects;
  }

  onHitByAttacker(_attackerId: string, _state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    return [];
  }

  getEnergy(): number { return this.energy; }
  getMaxEnergy(): number { return CFG.maxEnergy!; }

  isBurstReady(): boolean {
    return this.energy >= CFG.maxEnergy! && !this.burstActive;
  }

  burst(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const self = _state.getPlayer(this.playerId);
    if (!self) return effects;

    this.energy = 0;
    this.burstActive = true;
    this.burstTicksLeft = TEAR_SLOW_DURATION_SEC * TICKS_PER_SEC;

    // 每层撕裂造成 6 伤害
    for (const [tid, ts] of this.tearStacks) {
      const totalDamage = ts.stacks * CFG.burstDamage!;
      if (totalDamage > 0) {
        effects.push({
          type: WeaponEffectType.BURST_DAMAGE,
          sourceId: this.playerId,
          targetId: tid,
          value: totalDamage,
          metadata: { desc: `纳米爆发（${ts.stacks} 层撕裂）` },
        });
      }
      ts.stacks = 0;
    }

    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: self.position.x, y: self.position.y },
      metadata: {
        visualType: VisualEventType.NANO_RIPPER_BURST,
        radius: CFG.aoeMaxRadius!,
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
        sweepCooldownTicks: this.sweepCooldownTicks,
        tearTargets: this.tearStacks.size,
      },
    };
  }

  reset(): void {
    this.energy = 0;
    this.tearStacks.clear();
    this.sweepCooldownTicks = 0;
    this.burstActive = false;
    this.burstTicksLeft = 0;
    this.cooldowns = {};
    this.stacks = {};
    this.flags = {};
  }
}

const CFG = WEAPON_RANGE_CONFIG[NanoRipperWeapon.ID];
