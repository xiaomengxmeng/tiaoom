/**
 * 武器 9：电路编织者 (Circuit Weaver)
 *
 * 流派：工程师 Engineer (#39FF14)
 * 难度：⭐⭐⭐
 *
 * ── 核心设计 ──
 * 球体移动时在身后拖出能量回路（持续 6 秒，宽 20px）。
 * 自身在回路上移速 +15%。回路可交叉形成网络。
 * 对手触碰回路时通电（2 秒）：每秒 8 伤害。同回路对同目标只激活一次。
 * 回路总长度达 600px 时爆发：所有回路通电（4 秒），每秒 12 伤害，-25% 移速。
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

const TRAIL_INTERVAL_SEC = 0.3;
const SELF_SPEED_BOOST = 15;
const CIRCUIT_DOT_DAMAGE = 8;
const OVERLOAD_DOT_DAMAGE = 12;
const OVERLOAD_SLOW_PERCENT = 25;
const SEGMENT_LENGTH = 30;

interface CircuitSegment {
  id: string;
  x: number;
  y: number;
  secondsLeft: number;
  energizedTicksLeft: number;
  hitTargets: Set<string>;
}

export class CircuitWeaverWeapon implements IWeapon {
  static readonly ID = WeaponId.CIRCUIT_WEAVER;
  readonly id = WeaponId.CIRCUIT_WEAVER;
  readonly name = WeaponName.CIRCUIT_WEAVER;
  readonly school = School.ENGINEER;
  readonly difficulty = 3;
  readonly iconId = 'game-icons:circuit';
  playerId = '';

  private energy = 0;
  private segments: CircuitSegment[] = [];
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

    // 回路生命周期管理
    if (isSecondTick) {
      for (const seg of this.segments) {
        seg.secondsLeft--;
        if (seg.energizedTicksLeft > 0) seg.energizedTicksLeft--;
      }
      this.segments = this.segments.filter(s => s.secondsLeft > 0);
    }

    // 铺设新回路段（跟随球体移动）
    if (this.trailCooldownTicks <= 0 && this.segments.length < CFG.field!.maxCount!) {
      this.trailCooldownTicks = Math.ceil(TRAIL_INTERVAL_SEC * TICKS_PER_SEC);
      const segId = `circuit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      this.segments.push({
        id: segId,
        x: self.position.x,
        y: self.position.y,
        secondsLeft: CFG.field!.durationSec!,
        energizedTicksLeft: 0,
        hitTargets: new Set(),
      });

      // 充能（每段 ~30px 长度）
      this.energy = Math.min(CFG.maxEnergy!, this.energy + (CFG.energyPerHit ?? SEGMENT_LENGTH));

      effects.push({
        type: WeaponEffectType.VISUAL_ONLY,
        sourceId: this.playerId,
        value: 0,
        position: { x: self.position.x, y: self.position.y },
        metadata: {
          visualType: VisualEventType.CIRCUIT_WEAVER_NETWORK,
          radius: CFG.damageRadius!,
          segmentCount: this.segments.length,
          totalLength: this.energy,
        },
      });
    }
    if (this.trailCooldownTicks > 0) this.trailCooldownTicks--;

    // 自身在回路上加速
    let onCircuit = false;
    for (const seg of this.segments) {
      const dx = self.position.x - seg.x;
      const dy = self.position.y - seg.y;
      if (Math.sqrt(dx * dx + dy * dy) < CFG.damageRadius!) {
        onCircuit = true;
        break;
      }
    }
    if (onCircuit) {
      effects.push({
        type: WeaponEffectType.SLOW,
        sourceId: this.playerId,
        targetId: this.playerId,
        value: -SELF_SPEED_BOOST,
        duration: 1,
        metadata: { desc: '回路上加速' },
      });
    }

    // 对手触碰回路 → 通电
    for (const seg of this.segments) {
      const onSeg = physics.getAliveOpponentsInRadius(
        this.playerId, seg.x, seg.y, CFG.damageRadius!,
      );
      for (const opp of onSeg) {
        if (seg.hitTargets.has(opp.id)) continue;

        // 通电激活
        if (seg.energizedTicksLeft <= 0) {
          seg.energizedTicksLeft = 2 * TICKS_PER_SEC;
        }

        seg.hitTargets.add(opp.id);

        // 通电伤害
        if (isSecondTick) {
          effects.push({
            type: WeaponEffectType.DAMAGE,
            sourceId: this.playerId,
            targetId: opp.id,
            value: CIRCUIT_DOT_DAMAGE,
            metadata: { desc: '回路通电', segmentId: seg.id },
          });
        }
      }
    }

    // 爆发持续：全回路过载
    if (this.burstActive) {
      if (this.burstTicksLeft <= 0) {
        this.burstActive = false;
        this.segments = [];
      } else {
        if (isSecondTick) {
          for (const seg of this.segments) {
            const onSeg = physics.getAliveOpponentsInRadius(
              this.playerId, seg.x, seg.y, CFG.damageRadius!,
            );
            for (const opp of onSeg) {
              effects.push({
                type: WeaponEffectType.BURST_DAMAGE,
                sourceId: this.playerId,
                targetId: opp.id,
                value: OVERLOAD_DOT_DAMAGE,
                metadata: { desc: '回路过载', segmentId: seg.id },
              });
              effects.push({
                type: WeaponEffectType.SLOW,
                sourceId: this.playerId,
                targetId: opp.id,
                value: OVERLOAD_SLOW_PERCENT,
                duration: 1,
                metadata: { desc: '过载减速' },
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
    this.burstTicksLeft = CFG.burstDurationSec! * TICKS_PER_SEC;

    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: self.position.x, y: self.position.y },
      metadata: {
        visualType: VisualEventType.CIRCUIT_WEAVER_BURST,
        radius: CFG.aoeMaxRadius!,
        segmentCount: this.segments.length,
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
        segmentCount: this.segments.length,
        totalLength: this.energy,
        burstTicksLeft: this.burstTicksLeft,
      },
    };
  }

  reset(): void {
    this.energy = 0;
    this.segments = [];
    this.trailCooldownTicks = 0;
    this.burstActive = false;
    this.burstTicksLeft = 0;
    this.tickCounter = 0;
    this.cooldowns = {};
    this.stacks = {};
    this.flags = {};
  }
}

const CFG = WEAPON_RANGE_CONFIG[CircuitWeaverWeapon.ID];
