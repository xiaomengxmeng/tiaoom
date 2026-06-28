/**
 * 武器 3：追猎协议 (Pursuit Protocol)
 *
 * 流派：侵略者 Aggressor (#FF00FF)
 * 难度：⭐⭐
 *
 * ── 核心设计 ──
 * 互撞后获得 2 秒追击印记（向对手方向移速 +20%）。
 * 连续命中同一对手，每次追击伤害 +3（最多 +15）。
 * 追击印记叠加到 5 层时爆发：发射追踪鱼雷，20 伤害 + 击退。
 *
 * 视觉事件：PURSUIT_PROTOCOL_MARK（含 targetId/tx/ty）+ PURSUIT_PROTOCOL_BURST
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

const PURSUIT_SPEED_BOOST = 20;
const PURSUIT_DURATION_SEC = 2;
const MAX_BONUS_DAMAGE = 15;
const BONUS_PER_STACK = 3;

interface PursuitMark {
  targetId: string;
  stacks: number;
  expireTick: number;
}

export class PursuitProtocolWeapon implements IWeapon {
  static readonly ID = WeaponId.PURSUIT_PROTOCOL;
  readonly id = WeaponId.PURSUIT_PROTOCOL;
  readonly name = WeaponName.PURSUIT_PROTOCOL;
  readonly school = School.AGGRESSOR;
  readonly difficulty = 2;
  readonly iconId = 'game-icons:pursuit';
  playerId = '';

  private energy = 0;
  private marks: Map<string, PursuitMark> = new Map();
  private cooldowns: Record<string, number> = {};
  private stacks: Record<string, number> = {};
  private flags: Record<string, boolean> = {};

  onTick(state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];

    // 清理过期印记
    for (const [tid, mark] of this.marks) {
      if (state.tick > mark.expireTick) {
        this.marks.delete(tid);
      }
    }

    return effects;
  }

  onHitTarget(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    const opponent = physics.getRandomAliveOpponent(this.playerId);
    if (!opponent) return effects;

    // 追击印记逻辑
    const mark = this.marks.get(opponent.id);
    let newStacks = 1;

    if (mark && state.tick <= mark.expireTick) {
      // 连击同一对手，层数 +1
      newStacks = mark.stacks + 1;
    }

    this.marks.set(opponent.id, {
      targetId: opponent.id,
      stacks: newStacks,
      expireTick: state.tick + PURSUIT_DURATION_SEC * TICKS_PER_SEC,
    });

    // 追击额外伤害（每层 +3，最多 +15）
    const bonusDamage = Math.min(
      newStacks * BONUS_PER_STACK,
      MAX_BONUS_DAMAGE,
    );

    effects.push({
      type: WeaponEffectType.DAMAGE,
      sourceId: this.playerId,
      targetId: opponent.id,
      value: CFG.damage! + bonusDamage,
      metadata: {
        desc: `追击伤害（+${bonusDamage} 追击加成）`,
        pursuitStacks: newStacks,
      },
    });

    // 自身加速
    effects.push({
      type: WeaponEffectType.SLOW,
      sourceId: this.playerId,
      targetId: this.playerId,
      value: -PURSUIT_SPEED_BOOST,
      duration: PURSUIT_DURATION_SEC,
      metadata: { desc: '追击加速' },
    });

    // 发送追猎标记视觉事件（含 targetId + tx/ty）
    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: opponent.x, y: opponent.y },
      metadata: {
        visualType: VisualEventType.PURSUIT_PROTOCOL_MARK,
        targetId: opponent.id,
        tx: self.position.x,
        ty: self.position.y,
        radius: CFG.damageRadius!,
        stacks: newStacks,
      },
    });

    // 充能
    this.energy = Math.min(CFG.maxEnergy!, this.energy + 1);

    return effects;
  }

  onHitByAttacker(_attackerId: string, _state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    return [];
  }

  getEnergy(): number {
    return Math.round(this.energy / CFG.maxEnergy! * 100);
  }
  getMaxEnergy(): number {
    return 100;
  }
  setEnergy(percent: number): void {
    this.energy = Math.max(0, Math.min(CFG.maxEnergy!, percent / 100 * CFG.maxEnergy!));
  }

  isBurstReady(): boolean {
    return this.energy >= CFG.maxEnergy!;
  }

  burst(state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    this.energy = 0;

    // 发射追踪鱼雷：对所有有印记的目标造成伤害 + 击退
    for (const [tid] of this.marks) {
      effects.push({
        type: WeaponEffectType.BURST_DAMAGE,
        sourceId: this.playerId,
        targetId: tid,
        value: CFG.burstDamage!,
        metadata: { desc: '追踪鱼雷命中' },
      });
    }

    // 鱼雷溅射（对范围内所有对手）
    const allOpponents = _physics.getAllAliveOpponents(this.playerId);
    for (const opp of allOpponents) {
      effects.push({
        type: WeaponEffectType.AOE_DAMAGE,
        sourceId: this.playerId,
        targetId: opp.id,
        value: 8,
        metadata: { desc: '鱼雷溅射' },
      });
    }

    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: self.position.x, y: self.position.y },
      metadata: {
        visualType: VisualEventType.PURSUIT_PROTOCOL_BURST,
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
      flags: {},
      custom: { markedTargets: this.marks.size },
    };
  }

  reset(): void {
    this.energy = 0;
    this.marks.clear();
    this.cooldowns = {};
    this.stacks = {};
    this.flags = {};
  }
}

const CFG = WEAPON_RANGE_CONFIG[PursuitProtocolWeapon.ID];
