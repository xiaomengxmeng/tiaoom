/**
 * 武器 10：量子裂隙 (Quantum Rift)
 *
 * 流派：变奏者 Wildcard (#FFD700)
 * 难度：⭐⭐⭐
 *
 * ── 核心设计 ──
 * 每 5 秒进入 0.3 秒量子态：不可碰撞、不可被锁定。
 * 退出量子态时，在进/出位置各留量子裂隙（持续 8 秒），两个裂隙连通。
 * 对手碰到裂隙被传送到另一个，受 6 伤害。场上最多 4 个（2 对）。
 * 对手穿过裂隙 4 次后爆发：所有裂隙爆炸，每对产生连接线（10 伤害）。
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

const QUANTUM_INTERVAL_SEC = 5;
const QUANTUM_DURATION_SEC = 0.3;
const RIFT_TP_DAMAGE = 6;
const RIFT_CONNECTION_DAMAGE = 10;

interface QuantumRift {
  id: string;
  pairId: string;
  x: number;
  y: number;
  secondsLeft: number;
  hitTargets: Set<string>;
}

export class QuantumRiftWeapon implements IWeapon {
  static readonly ID = WeaponId.QUANTUM_RIFT;
  readonly id = WeaponId.QUANTUM_RIFT;
  readonly name = WeaponName.QUANTUM_RIFT;
  readonly school = School.WILD;
  readonly difficulty = 3;
  readonly iconId = 'game-icons:quantum-rift';
  playerId = '';

  private energy = 0;
  private rifts: QuantumRift[] = [];
  private quantumCooldownTicks = 0;
  private quantumStateTicks = 0;
  private lastQuantumPos = { x: 0, y: 0 };
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

    // 裂隙生命周期管理
    if (isSecondTick) {
      for (const r of this.rifts) r.secondsLeft--;
      this.rifts = this.rifts.filter(r => r.secondsLeft > 0);
    }

    // 量子态管理
    if (this.quantumStateTicks > 0) {
      this.quantumStateTicks--;
      if (this.quantumStateTicks <= 0) {
        // 退出量子态：生成裂隙对
        if (this.rifts.length < CFG.field!.maxCount!) {
          const pairId = `pair_${Date.now()}`;
          const r1Id = `rift_${pairId}_a`;
          const r2Id = `rift_${pairId}_b`;
          this.rifts.push({
            id: r1Id, pairId, x: this.lastQuantumPos.x, y: this.lastQuantumPos.y,
            secondsLeft: CFG.field!.durationSec!, hitTargets: new Set(),
          });
          this.rifts.push({
            id: r2Id, pairId, x: self.position.x, y: self.position.y,
            secondsLeft: CFG.field!.durationSec!, hitTargets: new Set(),
          });

          effects.push({
            type: WeaponEffectType.VISUAL_ONLY,
            sourceId: this.playerId,
            value: 0,
            position: { x: self.position.x, y: self.position.y },
            metadata: {
              visualType: VisualEventType.QUANTUM_RIFT_FISSURE,
              radius: CFG.damageRadius!,
              riftCount: this.rifts.length,
              pairId,
            },
          });
        }
      }
    }

    // 进入量子态（每 5 秒）
    if (this.quantumCooldownTicks <= 0 && this.quantumStateTicks <= 0) {
      this.quantumCooldownTicks = QUANTUM_INTERVAL_SEC * TICKS_PER_SEC;
      this.quantumStateTicks = Math.ceil(QUANTUM_DURATION_SEC * TICKS_PER_SEC);
      this.lastQuantumPos = { x: self.position.x, y: self.position.y };
    }
    if (this.quantumCooldownTicks > 0) this.quantumCooldownTicks--;

    // 裂隙触碰检测（传送）
    for (const rift of this.rifts) {
      const nearby = physics.getAliveOpponentsInRadius(
        this.playerId, rift.x, rift.y, CFG.damageRadius!,
      );
      for (const opp of nearby) {
        if (rift.hitTargets.has(opp.id)) continue;
        rift.hitTargets.add(opp.id);

        // 传送到配对裂隙
        const partner = this.rifts.find(r => r.pairId === rift.pairId && r.id !== rift.id);
        if (partner) {
          effects.push({
            type: WeaponEffectType.PULL,
            sourceId: this.playerId,
            targetId: opp.id,
            value: 9999, // 强制传送
            duration: 1,
            metadata: {
              desc: '量子传送',
              dirX: partner.x - opp.x,
              dirY: partner.y - opp.y,
              teleport: true,
              toX: partner.x,
              toY: partner.y,
            },
          });

          effects.push({
            type: WeaponEffectType.DAMAGE,
            sourceId: this.playerId,
            targetId: opp.id,
            value: RIFT_TP_DAMAGE,
            metadata: { desc: '裂隙传送伤害', riftId: rift.id },
          });

          // 充能
          this.energy = Math.min(CFG.maxEnergy!, this.energy + 1);
        }
      }
    }

    return effects;
  }

  onHitTarget(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    // 量子态期间无法造成碰撞伤害
    if (this.quantumStateTicks > 0) return [];
    return [];
  }

  onHitByAttacker(_attackerId: string, _state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    // 量子态期间不可被锁定
    if (this.quantumStateTicks > 0) return [];
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

    // 所有裂隙爆炸：每对产生连接线伤害
    const pairs = new Map<string, QuantumRift[]>();
    for (const r of this.rifts) {
      const list = pairs.get(r.pairId) ?? [];
      list.push(r);
      pairs.set(r.pairId, list);
    }

    const allOpponents = _physics.getAllAliveOpponents(this.playerId);
    for (const [pid, pair] of pairs) {
      if (pair.length < 2) continue;
      // 连接线对所有对手造成伤害
      for (const opp of allOpponents) {
        effects.push({
          type: WeaponEffectType.BURST_DAMAGE,
          sourceId: this.playerId,
          targetId: opp.id,
          value: RIFT_CONNECTION_DAMAGE,
          metadata: { desc: '裂隙连接线', pairId: pid },
        });
      }
    }

    this.energy = 0;
    this.rifts = [];

    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: self.position.x, y: self.position.y },
      metadata: {
        visualType: VisualEventType.QUANTUM_RIFT_BURST,
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
      flags: { inQuantumState: this.quantumStateTicks > 0 },
      custom: {
        riftCount: this.rifts.length,
        quantumCooldownTicks: this.quantumCooldownTicks,
      },
    };
  }

  reset(): void {
    this.energy = 0;
    this.rifts = [];
    this.quantumCooldownTicks = 0;
    this.quantumStateTicks = 0;
    this.tickCounter = 0;
    this.cooldowns = {};
    this.stacks = {};
    this.flags = {};
  }
}

const CFG = WEAPON_RANGE_CONFIG[QuantumRiftWeapon.ID];
