/**
 * 武器：熵寂之触 (Entropic Touch) - 闲乘月
 *
 * 流派：变奏者 Wildcard
 * 难度：⭐⭐
 *
 * ── 文档行为 ──
 * 被动 A（绝对零度）：球体周围低温场（半径 50px）
 *           对手在低温场内每秒移速 -8%（可叠加，最多 -60%）
 *           减速脱离后每 0.5 秒恢复 8%（3.75 秒完全恢复）
 * 被动 B（热力学债务）：受击时对攻击者施加 1 层"冻伤"（持续 5s，上限 3 层）
 *           每层：移速 -10%，每秒 2 点寒冰伤害
 * 爆发（热力学奇点）：充能 6 次冻伤伤害后自动触发
 *       持续 5 秒，自身周围 200px 内对手移速 -80%
 *       每秒 10 点寒冰伤害，3 层冻伤额外 15 点真实伤害
 *       爆发结束清空所有冻伤层数
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

interface FrostbiteStack {
  playerId: string;
  stacks: number;       // 1-3 层
  ticksLeft: number;    // 持续时间（tick）
}

export class EntropicTouchWeapon implements IWeapon {
  static readonly ID = WeaponId.ENTROPIC_TOUCH;
  readonly id = WeaponId.ENTROPIC_TOUCH;
  readonly name = WeaponName.ENTROPIC_TOUCH;
  readonly school = School.WILD;
  readonly difficulty = 2;
  readonly iconId = 'game-icons:entropy-touch';
  playerId = '';

  private energy = 0;
  private isBurstActive = false;
  private burstTicksLeft = 0;

  /** 冻伤层数记录 */
  private frostbiteStacks: FrostbiteStack[] = [];
  /** 对手减速记录（用于脱离低温场后恢复） */
  private opponentSlowMap: Map<string, number> = new Map(); // playerId → 当前减速百分比
  /** 上次冻伤伤害计数（用于充能） */
  private frostbiteDamageCount = 0;

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
    if (isSecondTick) {
      this.tickCounter = 0;
    }

    // 定期发送低温场 aura 视觉事件（每 5 秒 = 100 ticks）
    if (this.tickCounter % 100 === 0) {
      effects.push({
        type: WeaponEffectType.VISUAL_ONLY,
        sourceId: this.playerId,
        value: 0,
        position: { x: self.position.x, y: self.position.y },
        metadata: {
          visualType: VisualEventType.ENTROPIC_TOUCH_AURA,
          radius: CFG.damageRadius ?? 50,
        },
      });
    }

    // ── 被动 A：低温场检测（每秒一次）──
    if (isSecondTick) {
      const opponents = physics.getAllAliveOpponents(this.playerId);
      for (const opp of opponents) {
        const dx = opp.x - self.position.x;
        const dy = opp.y - self.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= CFG.damageRadius!) {
          // 在低温场内：叠加减速（最多 -60%）
          const currentSlow = this.opponentSlowMap.get(opp.id) ?? 0;
          if (currentSlow < 60) {
            this.opponentSlowMap.set(opp.id, Math.min(60, currentSlow + 8));
          }
        }
      }

      // 应用减速效果
      for (const [oppId, slowPct] of this.opponentSlowMap) {
        const opp = state.getPlayer(oppId);
        if (!opp || opp.hp <= 0) {
          this.opponentSlowMap.delete(oppId);
          continue;
        }

        // 检查是否还在低温场内
        const dx = opp.position.x - self.position.x;
        const dy = opp.position.y - self.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > CFG.damageRadius!) {
          // 脱离低温场：每 0.5 秒恢复 8%
          this.opponentSlowMap.set(oppId, Math.max(0, slowPct - 8));
          if (this.opponentSlowMap.get(oppId)! <= 0) {
            this.opponentSlowMap.delete(oppId);
          }
        }

        // 应用减速
        const finalSlow = this.opponentSlowMap.get(oppId) ?? 0;
        if (finalSlow > 0) {
          effects.push({
            type: WeaponEffectType.SLOW,
            sourceId: this.playerId,
            targetId: oppId,
            value: finalSlow,
            duration: 1,
            metadata: { desc: '低温场减速' },
          });
        }
      }
    }

    // ── 冻伤伤害（每秒一次）──
    if (isSecondTick) {
      this.frostbiteStacks = this.frostbiteStacks.filter(fb => {
        fb.ticksLeft--;
        if (fb.ticksLeft <= 0 || fb.stacks <= 0) return false;

        const opp = state.getPlayer(fb.playerId);
        if (!opp || opp.hp <= 0) return false;

        // 每层冻伤：每秒 2 点伤害
        const damage = fb.stacks * CFG.field!.frostbiteDamagePerStack!;
        if (damage > 0) {
          effects.push({
            type: WeaponEffectType.DAMAGE,
            sourceId: this.playerId,
            targetId: fb.playerId,
            value: damage,
            metadata: { desc: `冻伤伤害（${fb.stacks}层）` },
          });

          // 充能计数
          this.frostbiteDamageCount++;
          if (this.frostbiteDamageCount >= CFG.maxEnergy! && !this.isBurstActive) {
            const burstEffects = this.triggerBurst(state, physics);
            effects.push(...burstEffects);
          }
        }

        // 每层冻伤：移速 -10%
        effects.push({
          type: WeaponEffectType.SLOW,
          sourceId: this.playerId,
          targetId: fb.playerId,
          value: fb.stacks * CFG.field!.frostbiteSlowPerStack!,
          duration: 1,
          metadata: { desc: `冻伤减速（${fb.stacks}层）` },
        });

        return true;
      });
    }

    // ── 爆发：热力学奇点 ──
    if (this.isBurstActive) {
      if (this.burstTicksLeft <= 0) {
        this.isBurstActive = false;
        // 爆发结束：清空所有冻伤层数
        this.frostbiteStacks = [];
      } else {
        // 每秒判定一次
        if (isSecondTick) {
          const opponents = physics.getAllAliveOpponents(this.playerId);
          for (const opp of opponents) {
            const dx = opp.x - self.position.x;
            const dy = opp.y - self.position.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist <= CFG.aoeMaxRadius!) {
              // 每秒 10 点寒冰伤害
              effects.push({
                type: WeaponEffectType.DAMAGE,
                sourceId: this.playerId,
                targetId: opp.id,
                value: CFG.burstDamage!,
                metadata: { desc: '热力学奇点伤害' },
              });

              // 移速 -80%
              effects.push({
                type: WeaponEffectType.SLOW,
                sourceId: this.playerId,
                targetId: opp.id,
                value: 80,
                duration: 1,
                metadata: { desc: '热力学奇点减速' },
              });

              // 3 层冻伤额外 15 点真实伤害
              const fb = this.frostbiteStacks.find(f => f.playerId === opp.id);
              if (fb && fb.stacks >= 3) {
                effects.push({
                  type: WeaponEffectType.DAMAGE,
                  sourceId: this.playerId,
                  targetId: opp.id,
                  value: 15,
                  metadata: { desc: '热力学奇点真实伤害（3层冻伤）' },
                });
              }
            }
          }

          // 自身移速 -30%
          effects.push({
            type: WeaponEffectType.SLOW,
            sourceId: this.playerId,
            targetId: this.playerId,
            value: 30,
            duration: 1,
            metadata: { desc: '热力学奇点自减速' },
          });

          this.burstTicksLeft--;
        }
      }
    }

    return effects;
  }

  onHitTarget(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    return []; // 熵寂之触不通过碰撞触发
  }

  onHitByAttacker(attackerId: string, state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const CFG = WEAPON_RANGE_CONFIG[this.id];

    // 给攻击者施加 1 层冻伤（上限 3 层）
    let fb = this.frostbiteStacks.find(f => f.playerId === attackerId);
    if (!fb) {
      fb = { playerId: attackerId, stacks: 0, ticksLeft: 0 };
      this.frostbiteStacks.push(fb);
    }

    if (fb.stacks < CFG.field!.maxCount!) {
      fb.stacks++;
      fb.ticksLeft = CFG.field!.durationSec! * TICKS_PER_SEC;

      // 发送视觉事件
      const self = state.getPlayer(this.playerId);
      effects.push({
        type: WeaponEffectType.VISUAL_ONLY,
        sourceId: this.playerId,
        value: 0,
        position: self?.position ? { x: self.position.x, y: self.position.y } : undefined,
        metadata: {
          visualType: VisualEventType.ENTROPIC_TOUCH_FROSTBITE,
          targetId: attackerId,
          stacks: fb.stacks,
        },
      });
    }

    return effects;
  }

  // ── 能量爆发 ──────────────────────────────────────

  getEnergy(): number { return this.energy; }
  getMaxEnergy(): number { return WEAPON_RANGE_CONFIG[this.id].maxEnergy!; }

  isBurstReady(): boolean {
    return this.energy >= WEAPON_RANGE_CONFIG[this.id].maxEnergy!
      && !this.isBurstActive;
  }

  burst(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    // 熵寂之触的爆发是自动触发的（通过冻伤伤害计数）
    // 这个方法保留以供手动触发
    return this.triggerBurst(_state, _physics);
  }

  private triggerBurst(state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    this.energy = 0;
    this.isBurstActive = true;
    this.burstTicksLeft = (WEAPON_RANGE_CONFIG[this.id].burstDurationSec ?? 5) * TICKS_PER_SEC;
    this.frostbiteDamageCount = 0;

    const self = state.getPlayer(this.playerId);
    return [{
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: self?.position ? { x: self.position.x, y: self.position.y } : undefined,
      metadata: {
        visualType: VisualEventType.ENTROPIC_TOUCH_BURST,
        desc: '热力学奇点启动',
        radius: WEAPON_RANGE_CONFIG[this.id].aoeMaxRadius ?? 200,
      },
    }];
  }

  // ── 状态 ──────────────────────────────────────

  getRuntimeState(): WeaponRuntimeState {
    return {
      energy: this.energy,
      maxEnergy: WEAPON_RANGE_CONFIG[this.id].maxEnergy!,
      cooldowns: this.cooldowns,
      stacks: this.stacks,
      flags: { burstActive: this.isBurstActive },
      custom: {
        frostbiteStacks: this.frostbiteStacks.length,
        burstTicksLeft: this.burstTicksLeft,
      },
    };
  }

  reset(): void {
    this.energy = 0;
    this.isBurstActive = false;
    this.burstTicksLeft = 0;
    this.frostbiteStacks = [];
    this.opponentSlowMap.clear();
    this.frostbiteDamageCount = 0;
    this.tickCounter = 0;
    this.cooldowns = {};
    this.stacks = {};
    this.flags = {};
  }
}
