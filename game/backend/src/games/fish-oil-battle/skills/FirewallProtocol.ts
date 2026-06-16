/**
 * 技能 2：防火墙协议 (FirewallProtocol)
 *
 * 流派：控制者 Controller (#00BFFF)
 * 形态：场地装置（场地印记）
 * 难度：⭐
 *
 * ── 功能逻辑 ──
 * 常驻特性：被命中后在受击位置生成防火墙（持续 5 tick），
 *           每 tick 对穿过防火墙的对手造成 4 点 DoT + 40% 减速
 *           场上最多 3 面防火墙
 * 充能方式：每累计受到 15 点伤害 → +1 能量（共需 4 格触发）
 * 爆发效果：全面封锁 → 所有防火墙硬化，每面额外 +6 伤害/tick，持续 4 tick
 *
 * ── 输入输出 ──
 * 输入：IBattleState（读取 totalDamageTaken、对手位置）
 * 输出：SkillEffect[]（spawn_firewall / dot / slow / burst_damage）
 */

import { IBattleState, ISkill, SkillEffect, SkillRuntimeState } from '../core/types';

const FIREWALL_DURATION = 5;
const FIREWALL_DOT = 4;
const MAX_FIREWALLS = 3;
const DAMAGE_PER_ENERGY = 15;
const MAX_ENERGY = 4;
const BURST_BONUS_DAMAGE = 6;
const BURST_DURATION = 4;

export class FirewallProtocol implements ISkill {
  readonly id = 'firewall_protocol';
  readonly name = '防火墙协议';
  readonly school = 'controller';
  playerId = '';

  private energy = 0;
  private activeFirewallCount = 0;
  private isHardened = false;
  private hardenedTicksLeft = 0;
  private firewallTicksLeft = 0;
  private cooldowns = new Map<string, number>();
  private stacks = new Map<string, number>();
  private flags = new Map<string, boolean>();

  // ── 生命周期 ──────────────────────────────────────

  onTick(state: IBattleState): SkillEffect[] {
    const effects: SkillEffect[] = [];
    const opponent = state.getOpponent(this.playerId);

    // 防火墙生命周期管理
    if (this.activeFirewallCount > 0) {
      this.firewallTicksLeft--;
      if (this.firewallTicksLeft <= 0) {
        this.activeFirewallCount = 0;
      }
    }

    if (this.activeFirewallCount > 0 && opponent) {
      const baseDmg = FIREWALL_DOT * this.activeFirewallCount;
      const bonusDmg = this.isHardened ? BURST_BONUS_DAMAGE * this.activeFirewallCount : 0;
      const totalDmg = baseDmg + bonusDmg;

      effects.push({
        type: 'dot',
        sourceId: this.playerId,
        targetId: opponent.id,
        value: totalDmg,
        duration: 1,
        metadata: {
          firewallCount: this.activeFirewallCount,
          hardened: this.isHardened,
          desc: this.isHardened ? '防火墙硬化灼烧' : '防火墙灼烧',
        },
      });

      effects.push({
        type: 'slow',
        sourceId: this.playerId,
        targetId: opponent.id,
        value: 40,
        duration: 1,
        metadata: { desc: '防火墙穿越减速' },
      });
    }

    if (this.isHardened) {
      this.hardenedTicksLeft--;
      if (this.hardenedTicksLeft <= 0) {
        this.isHardened = false;
      }
    }

    return effects;
  }

  onHitTarget(_state: IBattleState): SkillEffect[] {
    return [];
  }

  onHitByAttacker(state: IBattleState): SkillEffect[] {
    const effects: SkillEffect[] = [];
    const player = state.getPlayer(this.playerId);

    if (this.activeFirewallCount < MAX_FIREWALLS) {
      this.activeFirewallCount++;
      this.firewallTicksLeft = FIREWALL_DURATION;
      effects.push({
        type: 'spawn_firewall',
        sourceId: this.playerId,
        value: 0,
        duration: FIREWALL_DURATION,
        position: player ? { ...player.position } : undefined,
        metadata: {
          count: this.activeFirewallCount,
          max: MAX_FIREWALLS,
          desc: '防火墙生成',
        },
      });
    }

    return effects;
  }

  /** 受击充能：由调度器在 applyDamage 后调用 */
  checkDamageAccumulator(totalDamageTaken: number): number {
    const newEnergy = Math.floor(totalDamageTaken / DAMAGE_PER_ENERGY);
    const gained = newEnergy - this.energy;
    if (gained > 0) {
      this.energy = Math.min(MAX_ENERGY, newEnergy);
    }
    return Math.max(0, gained);
  }

  // ── 能量爆发 ──────────────────────────────────────

  getEnergy(): number { return this.energy; }
  getMaxEnergy(): number { return MAX_ENERGY; }

  isBurstReady(): boolean {
    return this.energy >= MAX_ENERGY;
  }

  burst(state: IBattleState): SkillEffect[] {
    const opponent = state.getOpponent(this.playerId);
    const effects: SkillEffect[] = [];

    this.isHardened = true;
    this.hardenedTicksLeft = BURST_DURATION;
    this.energy = 0;

    effects.push({
      type: 'burst_damage',
      sourceId: this.playerId,
      targetId: opponent?.id,
      value: this.activeFirewallCount * BURST_BONUS_DAMAGE,
      duration: BURST_DURATION,
      metadata: {
        desc: '全面封锁 · 防火墙硬化',
        school: this.school,
        firewallCount: this.activeFirewallCount,
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
    this.activeFirewallCount = 0;
    this.isHardened = false;
    this.hardenedTicksLeft = 0;
    this.firewallTicksLeft = 0;
    this.cooldowns.clear();
    this.stacks.clear();
    this.flags.clear();
  }
}
