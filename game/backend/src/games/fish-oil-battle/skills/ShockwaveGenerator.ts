/**
 * 技能 1：冲击波发生器 (ShockwaveGenerator)
 *
 * 流派：侵略者 Aggressor (#FF00FF)
 * 形态：植入芯片（核心光环）
 * 难度：⭐⭐
 *
 * ── 功能逻辑 ──
 * 常驻特性：每次互撞命中造成 +2 额外伤害（模拟冲击波）
 * 充能方式：每命中一次对手 → +1 能量（累加至 4 触发爆发）
 * 爆发效果：震波共振 → 对对手造成 25 点爆发伤害，能量归零
 *
 * ── 输入输出 ──
 * 输入：IBattleState（读取玩家位置、对手 HP）
 * 输出：SkillEffect[]（damage / shockwave / burst_damage）
 */

import { IBattleState, ISkill, SkillEffect, SkillRuntimeState } from '../core/types';

export class ShockwaveGenerator implements ISkill {
  readonly id = 'shockwave_generator';
  readonly name = '冲击波发生器';
  readonly school = 'aggressor';
  playerId = '';

  private energy = 0;
  private readonly MAX_ENERGY = 4;
  private stacks = new Map<string, number>();
  private flags = new Map<string, boolean>();

  // ── 生命周期 ──────────────────────────────────────

  onTick(_state: IBattleState): SkillEffect[] {
    return [];
  }

  onHitTarget(state: IBattleState): SkillEffect[] {
    const opponent = state.getOpponent(this.playerId);
    if (!opponent) return [];

    const effects: SkillEffect[] = [];

    effects.push({
      type: 'damage',
      sourceId: this.playerId,
      targetId: opponent.id,
      value: 2,
      metadata: { desc: '冲击波碰撞伤害' },
    });

    this.energy = Math.min(this.MAX_ENERGY, this.energy + 1);

    effects.push({
      type: 'shockwave',
      sourceId: this.playerId,
      value: this.energy,
      metadata: { energy: this.energy, maxEnergy: this.MAX_ENERGY, desc: '冲击波扩散' },
    });

    return effects;
  }

  onHitByAttacker(_state: IBattleState): SkillEffect[] {
    return [];
  }

  // ── 能量爆发 ──────────────────────────────────────

  getEnergy(): number { return this.energy; }
  getMaxEnergy(): number { return this.MAX_ENERGY; }

  isBurstReady(): boolean {
    return this.energy >= this.MAX_ENERGY;
  }

  burst(state: IBattleState): SkillEffect[] {
    const opponent = state.getOpponent(this.playerId);
    if (!opponent) return [];

    const effects: SkillEffect[] = [];

    effects.push({
      type: 'burst_damage',
      sourceId: this.playerId,
      targetId: opponent.id,
      value: 25,
      metadata: { desc: '震波共振 · 3道冲击波', school: this.school },
    });

    effects.push({
      type: 'shockwave',
      sourceId: this.playerId,
      value: 3,
      metadata: { desc: '三重冲击波覆盖鱼缸', burst: true },
    });

    this.energy = 0;
    return effects;
  }

  // ── 状态 ──────────────────────────────────────────

  getRuntimeState(): SkillRuntimeState {
    return {
      energy: this.energy,
      maxEnergy: this.MAX_ENERGY,
      cooldowns: new Map(),
      stacks: this.stacks,
      flags: this.flags,
    };
  }

  reset(): void {
    this.energy = 0;
    this.stacks.clear();
    this.flags.clear();
  }
}
