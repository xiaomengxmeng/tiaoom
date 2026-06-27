/**
 * 武器 6：熵增扩散器 (Entropy Diffuser)
 *
 * 流派：控制者 Controller (#00BFFF)
 * 难度：⭐⭐⭐
 *
 * ── 核心设计 ──
 * 球体经过路径留下熵增油膜（持续 4 秒，宽 40px）。
 * 对手在油膜上移速 +25% 但无法转向（惯性滑行）。自身不受影响。
 * 油膜段数达 20 时爆发：所有油膜凝固，对手 -60% 移速 + 每秒 5 伤害（持续 3 秒）。
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

const OIL_TRAIL_INTERVAL_SEC = 0.5;
const SOLIDIFY_SLOW_PERCENT = 60;
const SOLIDIFY_DURATION_SEC = 3;

interface OilSegment {
  id: string;
  x: number;
  y: number;
  secondsLeft: number;
}

export class EntropyDiffuserWeapon implements IWeapon {
  static readonly ID = WeaponId.ENTROPY_DIFFUSER;
  readonly id = WeaponId.ENTROPY_DIFFUSER;
  readonly name = WeaponName.ENTROPY_DIFFUSER;
  readonly school = School.CONTROLLER;
  readonly difficulty = 3;
  readonly iconId = 'game-icons:entropy';
  playerId = '';

  private energy = 0;
  private oilSegments: OilSegment[] = [];
  private trailCooldownTicks = 0;
  private burstActive = false;
  private burstTicksLeft = 0;
  private tickCounter = 0;
  private cooldowns: Record<string, number> = {};
  private stacks: Record<string, number> = {};
  private flags: Record<string, boolean> = {};

  onTick(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    this.tickCounter++;
    const isSecondTick = this.tickCounter >= TICKS_PER_SEC;
    if (isSecondTick) this.tickCounter = 0;

    // 油膜生命周期管理
    if (isSecondTick) {
      for (const seg of this.oilSegments) seg.secondsLeft--;
      this.oilSegments = this.oilSegments.filter(s => s.secondsLeft > 0);
    }

    // 铺设新油膜（跟随球体移动）
    if (this.trailCooldownTicks <= 0 && this.oilSegments.length < CFG.field!.maxCount!) {
      this.trailCooldownTicks = Math.ceil(OIL_TRAIL_INTERVAL_SEC * TICKS_PER_SEC);
      const segId = `oil_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      this.oilSegments.push({
        id: segId,
        x: self.position.x,
        y: self.position.y,
        secondsLeft: CFG.field!.durationSec!,
      });

      // 充能
      this.energy = Math.min(CFG.maxEnergy!, this.energy + (CFG.energyPerHit ?? 1));

      effects.push({
        type: WeaponEffectType.VISUAL_ONLY,
        sourceId: this.playerId,
        value: 0,
        position: { x: self.position.x, y: self.position.y },
        metadata: {
          visualType: VisualEventType.ENTROPY_DIFFUSER_FIELD,
          radius: CFG.damageRadius!,
          oilCount: this.oilSegments.length,
        },
      });
    }
    if (this.trailCooldownTicks > 0) this.trailCooldownTicks--;

    // 油膜上对手效果（移速 +25%，惯性滑行用 SLOW 负值模拟加速）
    for (const seg of this.oilSegments) {
      const onOil = physics.getAliveOpponentsInRadius(
        this.playerId, seg.x, seg.y, CFG.damageRadius!,
      );
      for (const opp of onOil) {
        effects.push({
          type: WeaponEffectType.SLOW,
          sourceId: this.playerId,
          targetId: opp.id,
          value: -25,
          duration: 1,
          metadata: { desc: '油膜惯性加速' },
        });
      }
    }

    // 爆发持续：凝固油膜
    if (this.burstActive) {
      if (this.burstTicksLeft <= 0) {
        this.burstActive = false;
        this.oilSegments = [];
      } else {
        // 每秒判定伤害 + 减速
        if (isSecondTick) {
          for (const seg of this.oilSegments) {
            const onOil = physics.getAliveOpponentsInRadius(
              this.playerId, seg.x, seg.y, CFG.damageRadius!,
            );
            for (const opp of onOil) {
              effects.push({
                type: WeaponEffectType.DAMAGE,
                sourceId: this.playerId,
                targetId: opp.id,
                value: CFG.burstDamage!,
                metadata: { desc: '凝固油膜伤害' },
              });
              effects.push({
                type: WeaponEffectType.SLOW,
                sourceId: this.playerId,
                targetId: opp.id,
                value: SOLIDIFY_SLOW_PERCENT,
                duration: 1,
                metadata: { desc: '凝固油膜减速' },
              });
            }
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
    this.burstTicksLeft = SOLIDIFY_DURATION_SEC * TICKS_PER_SEC;

    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: self.position.x, y: self.position.y },
      metadata: {
        visualType: VisualEventType.ENTROPY_DIFFUSER_BURST,
        radius: CFG.aoeMaxRadius!,
        oilCount: this.oilSegments.length,
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
        oilCount: this.oilSegments.length,
        burstTicksLeft: this.burstTicksLeft,
      },
    };
  }

  reset(): void {
    this.energy = 0;
    this.oilSegments = [];
    this.trailCooldownTicks = 0;
    this.burstActive = false;
    this.burstTicksLeft = 0;
    this.tickCounter = 0;
    this.cooldowns = {};
    this.stacks = {};
    this.flags = {};
  }
}

const CFG = WEAPON_RANGE_CONFIG[EntropyDiffuserWeapon.ID];
