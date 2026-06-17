/**
 * 技能 3：蜂巢母体 (HiveMother)
 *
 * 流派：工程师 Engineer (#39FF14)
 * 形态：浮游装置 + 投射物
 * 难度：⭐⭐
 *
 * ── 功能逻辑 ──
 * 常驻特性：3 只纳米蜂绕球公转，每 5 tick 各发射一枚蜂刺
 *           蜂刺命中造成 5 点伤害
 * 充能方式：每枚蜂刺命中 = +1 能量，累计 9 次触发爆发
 * 爆发效果：蜂群狂暴 → 额外生成 3 只临时蜂（共 6 只），
 *           攻速翻倍（3 tick 间隔），伤害提升至 8，持续 5 tick
 *
 * ── 输入输出 ──
 * 输入：IBattleState（读取对手位置）
 * 输出：SkillEffect[]（fire_sting / burst_damage）
 */

import { IBattleState, ISkill, SkillEffect, SkillRuntimeState } from '../core/types';

const BASE_BEE_COUNT = 3;
const BASE_INTERVAL = 5;
const STING_DAMAGE = 5;
const BURST_BEE_COUNT = 6;
const BURST_INTERVAL = 3;
const BURST_DAMAGE = 8;
const BURST_DURATION = 5;
const ENERGY_PER_HIT = 1;
const MAX_ENERGY = 9;

export class HiveMother implements ISkill {
  readonly id = 'hive_mother';
  readonly name = '蜂巢母体';
  readonly school = 'engineer';
  playerId = '';

  private energy = 0;
  private tickCounter = 0;
  private burstTicksLeft = 0;
  private cooldowns = new Map<string, number>();
  private stacks = new Map<string, number>();
  private flags = new Map<string, boolean>();

  // ── 生命周期 ──────────────────────────────────────

  onTick(state: IBattleState): SkillEffect[] {
    const effects: SkillEffect[] = [];
    this.tickCounter++;

    const opponent = state.getRandomAliveOpponent(this.playerId);
    if (!opponent) return effects;

    const beeCount = this.isBurstActive() ? BURST_BEE_COUNT : BASE_BEE_COUNT;
    const interval = this.isBurstActive() ? BURST_INTERVAL : BASE_INTERVAL;

    const shouldFire = this.tickCounter % interval === 0;
    if (!shouldFire) return effects;

    const beesPerCycle = Math.max(1, Math.floor(beeCount / interval));
    for (let i = 0; i < beesPerCycle; i++) {
      const dmg = this.isBurstActive() ? BURST_DAMAGE : STING_DAMAGE;

      effects.push({
        type: 'fire_sting',
        sourceId: this.playerId,
        targetId: opponent.id,
        value: dmg,
        metadata: {
          beeIndex: (this.tickCounter / interval + i) % beeCount,
          totalBees: beeCount,
          burst: this.isBurstActive(),
          desc: this.isBurstActive() ? '蜂群狂暴·蜂刺' : '蜂刺',
        },
      });

      if (!this.isBurstActive()) {
        this.energy = Math.min(MAX_ENERGY, this.energy + ENERGY_PER_HIT);
      }
    }

    if (this.isBurstActive()) {
      this.burstTicksLeft--;
    }

    return effects;
  }

  onHitTarget(_state: IBattleState): SkillEffect[] {
    return [];
  }

  onHitByAttacker(_state: IBattleState): SkillEffect[] {
    return [];
  }

  // ── 能量爆发 ──────────────────────────────────────

  getEnergy(): number { return this.energy; }
  getMaxEnergy(): number { return MAX_ENERGY; }

  isBurstReady(): boolean {
    return !this.isBurstActive() && this.energy >= MAX_ENERGY;
  }

  private isBurstActive(): boolean {
    return this.burstTicksLeft > 0;
  }

  burst(state: IBattleState): SkillEffect[] {
    const opponent = state.getRandomAliveOpponent(this.playerId);
    const effects: SkillEffect[] = [];

    this.burstTicksLeft = BURST_DURATION;
    this.energy = 0;

    effects.push({
      type: 'burst_damage',
      sourceId: this.playerId,
      targetId: opponent?.id,
      value: 0,
      duration: BURST_DURATION,
      metadata: {
        desc: '蜂群狂暴 · 6只纳米蜂',
        school: this.school,
        beeCount: BURST_BEE_COUNT,
        interval: BURST_INTERVAL,
        damage: BURST_DAMAGE,
      },
    });

    return effects;
  }

  // ── 状态 ──────────────────────────────────────────

  getRuntimeState(): SkillRuntimeState {
    return {
      energy: this.energy,
      maxEnergy: MAX_ENERGY,
      cooldowns: this.cooldowns,
      stacks: this.stacks,
      flags: this.flags,
    };
  }

  reset(): void {
    this.energy = 0;
    this.tickCounter = 0;
    this.burstTicksLeft = 0;
    this.cooldowns.clear();
    this.stacks.clear();
    this.flags.clear();
  }
}
