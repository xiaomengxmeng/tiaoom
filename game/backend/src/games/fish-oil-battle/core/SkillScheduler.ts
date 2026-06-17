/**
 * 赛博鱼油 MVP · BattleState 实现 + SkillScheduler
 *
 * SkillScheduler 是技能调度核心，负责：
 *   1. 管理每个玩家的技能实例
 *   2. 按固定顺序驱动技能生命周期（onTick → onHit → onHitBy → checkBurst）
 *   3. 收集 SkillEffect 并应用到 BattleState
 */

import {
  IBattleState,
  ISkill,
  PlayerState,
  SkillEffect,
} from './types';

// ─── BattleState 实现 ────────────────────────────────
export class BattleState implements IBattleState {
  tick = 0;
  players = new Map<string, PlayerState>();
  pendingEffects: SkillEffect[] = [];
  activeEffects: SkillEffect[] = [];
  canvasWidth: number;
  canvasHeight: number;

  constructor(canvasWidth = 1280, canvasHeight = 720) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
  }

  addPlayer(state: PlayerState): void {
    this.players.set(state.id, state);
  }

  getPlayer(id: string): PlayerState | undefined {
    return this.players.get(id);
  }

  getOpponent(id: string): PlayerState | undefined {
    for (const [pid, p] of this.players) {
      if (pid !== id) return p;
    }
    return undefined;
  }

  /** 随机选取一个存活对手（大逃杀模式） */
  getRandomAliveOpponent(id: string): PlayerState | undefined {
    const alive = Array.from(this.players.values()).filter(
      p => p.id !== id && p.hp > 0,
    );
    if (alive.length === 0) return undefined;
    return alive[Math.floor(Math.random() * alive.length)];
  }

  applyDamage(targetId: string, amount: number, sourceId?: string): void {
    const target = this.players.get(targetId);
    if (!target || target.hp <= 0) return;
    target.hp = Math.max(0, target.hp - amount);
    target.totalDamageTaken += amount;
    console.log(`[FishOil] 伤害: ${targetId} (${target.name}) HP ${target.hp + amount}→${target.hp} (-${amount}) from ${sourceId ?? 'system'}`);
    this.pendingEffects.push({
      type: 'damage',
      sourceId: sourceId || 'system',
      targetId,
      value: amount,
    });
  }
}

// ─── SkillScheduler ──────────────────────────────────
export interface PlayerSkillBinding {
  playerId: string;
  skill: ISkill;
}

export class SkillScheduler {
  private bindings = new Map<string, ISkill>();

  /** 注册玩家技能（注入 playerId） */
  register(playerId: string, skill: ISkill): void {
    skill.playerId = playerId;
    this.bindings.set(playerId, skill);
  }

  /** 获取玩家技能 */
  getSkill(playerId: string): ISkill | undefined {
    return this.bindings.get(playerId);
  }

  /** 所有绑定的玩家 ID */
  get playerIds(): string[] {
    return Array.from(this.bindings.keys());
  }

  // ── 核心调度 ──

  /**
   * 每 tick 调度所有技能
   *
   * 顺序：onTick → checkDamageEnergy → apply effects → expire
   * 注意：tick() 不自动触发爆发，调用方需显式调用 forceBurst()
   *       这确保了充能和爆发之间存在可控间隙（如 1-tick 预警窗）
   */
  tick(state: BattleState): SkillEffect[] {
    const allEffects: SkillEffect[] = [];

    for (const [playerId, skill] of this.bindings) {
      const player = state.getPlayer(playerId);
      if (!player || player.hp <= 0) continue;

      // 1. onTick 常驻被动
      const tickEffects = skill.onTick(state);
      allEffects.push(...tickEffects);

      // 2. 伤害累加器充能（FirewallProtocol 等受击充能型技能）
      this.checkDamageEnergy(playerId, state);
    }

    // 3. 应用所有效果
    state.pendingEffects = [];
    this.applyEffects(state, allEffects);

    // 4. 清理过期效果
    this.expireEffects(state);

    state.tick++;
    return state.pendingEffects;
  }

  /**
   * 受击伤害累加充能（FirewallProtocol）
   * 通过动态类型检测，避免污染 ISkill 接口
   */
  private checkDamageEnergy(playerId: string, state: BattleState): void {
    const skill = this.bindings.get(playerId);
    const player = state.getPlayer(playerId);
    if (!skill || !player) return;

    // 鸭子类型：检测是否有 checkDamageAccumulator 方法
    const fwSkill = skill as any;
    if (typeof fwSkill.checkDamageAccumulator === 'function') {
      fwSkill.checkDamageAccumulator(player.totalDamageTaken);
    }
  }

  /**
   * 处理碰撞：attacker 命中 target
   * 即使 target 未注册技能，仍触发 attacker.onHitTarget
   */
  processHit(attackerId: string, targetId: string, state: BattleState): SkillEffect[] {
    const allEffects: SkillEffect[] = [];

    const attackerSkill = this.bindings.get(attackerId);
    if (attackerSkill) {
      allEffects.push(...attackerSkill.onHitTarget(state));
    }

    const targetSkill = this.bindings.get(targetId);
    if (targetSkill) {
      allEffects.push(...targetSkill.onHitByAttacker(state));
    }

    this.applyEffects(state, allEffects);
    return allEffects;
  }

  /**
   * 手动触发某个玩家的爆发
   */
  forceBurst(playerId: string, state: BattleState): SkillEffect[] {
    const skill = this.bindings.get(playerId);
    if (!skill || !skill.isBurstReady()) return [];

    const effects = skill.burst(state);
    this.applyEffects(state, effects);
    return effects;
  }

  // ── 内部 ──

  private applyEffects(state: BattleState, effects: SkillEffect[]): void {
    for (const effect of effects) {
      state.pendingEffects.push(effect);

      // 伤害类效果
      if (effect.type === 'damage' || effect.type === 'burst_damage' || effect.type === 'fire_sting') {
        if (effect.targetId) {
          state.applyDamage(effect.targetId, effect.value, effect.sourceId);
        }
      }

      // 持续类效果
      if (effect.type === 'dot' || effect.type === 'slow' || effect.type === 'spawn_firewall') {
        if (effect.duration && effect.duration > 0) {
          state.activeEffects.push(effect);
        }
      }
    }
  }

  private expireEffects(state: BattleState): void {
    state.activeEffects = state.activeEffects.filter((e) => {
      if (e.duration !== undefined) {
        e.duration--;
        return e.duration > 0;
      }
      return true;
    });
  }

  /** 汇总双方状态快照（供调试输出） */
  summary(state: BattleState): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [pid, skill] of this.bindings) {
      const p = state.getPlayer(pid);
      const rt = skill.getRuntimeState();
      result[pid] = {
        name: p?.name,
        hp: `${p?.hp}/${p?.maxHp}`,
        skill: skill.name,
        school: skill.school,
        energy: `${rt.energy}/${rt.maxEnergy}`,
        stacks: Object.fromEntries(rt.stacks),
        burstReady: skill.isBurstReady(),
      };
    }
    return result;
  }
}
