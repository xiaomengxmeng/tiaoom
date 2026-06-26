/**
 * 赛博鱼油 · BattleState 实现 + SkillScheduler（IWeapon 版本）
 *
 * SkillScheduler 是技能调度核心，负责：
 *   1. 管理每个玩家的 IWeapon 实例
 *   2. 按固定顺序驱动武器生命周期（onTick → onHit → onHitBy → burst）
 *   3. 收集 WeaponEffect → 转换为 SkillEffect 并应用到 BattleState
 *
 * v2.0：重构为依赖 IWeapon 接口 + IPhysicsQuery，与 WeaponScheduler 对齐。
 */

import {
  IBattleState,
  PlayerState,
  SkillEffect,
} from './types';
import type { IWeapon, IPhysicsQuery, WeaponEffect, WeaponRuntimeState } from './IWeapon';
import { TICKS_PER_SEC } from './IWeapon';
import { WeaponEffectType } from '../config/GameEnums';
import { WEAPON_RANGE_CONFIG } from '../config/WeaponRangeConfig';

// ─── 触发冷却类型 ──────────────────────────────────────
type TriggerType = 'hitTarget' | 'hitByAttacker' | 'wallHit';

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
    const hpBefore = target.hp;
    target.hp = Math.max(0, target.hp - amount);
    target.totalDamageTaken += amount;

    // 追踪来源玩家的统计数据
    if (sourceId && sourceId !== 'system') {
      const source = this.players.get(sourceId);
      if (source) {
        source.damageDealt += amount;
        source.weaponTriggers++;
        if (amount > source.maxHit) {
          source.maxHit = amount;
        }
        // 目标死亡 → 来源击杀数 +1
        if (target.hp <= 0) {
          source.kills++;
          target.deaths = 1;
        }
      }
    }

    const fmt = (n: number) => Math.round(n * 10) / 10;
    console.log(`[FishOil] 伤害: ${targetId} (${target.name}) HP ${fmt(hpBefore)}→${fmt(target.hp)} (-${fmt(amount)}) from ${sourceId ?? 'system'}`);
    this.pendingEffects.push({
      type: WeaponEffectType.DAMAGE,
      sourceId: sourceId || 'system',
      targetId,
      value: amount,
    });
  }
}

// ─── SkillScheduler（IWeapon 版本）──────────────────
export interface PlayerWeaponBinding {
  playerId: string;
  weapon: IWeapon;
}

/** @deprecated 请使用 PlayerWeaponBinding */
export type PlayerSkillBinding = PlayerWeaponBinding;

export class SkillScheduler {
  private bindings = new Map<string, IWeapon>();
  private physicsQuery: IPhysicsQuery;
  /** expireEffects 秒级计数器：每 TICKS_PER_SEC 个 tick 减一次 duration */
  private expireCounter = 0;
  /** 全局冷却追踪器 */
  private cdTracker = new CooldownTracker();

  constructor(physicsQuery: IPhysicsQuery) {
    this.physicsQuery = physicsQuery;
  }

  /** 注册玩家武器（注入 playerId） */
  register(playerId: string, weapon: IWeapon): void {
    weapon.playerId = playerId;
    this.bindings.set(playerId, weapon);
  }

  /** 获取玩家武器 */
  getWeapon(playerId: string): IWeapon | undefined {
    return this.bindings.get(playerId);
  }

  /** @deprecated 请使用 getWeapon */
  getSkill(playerId: string): IWeapon | undefined {
    return this.getWeapon(playerId);
  }

  /** 所有绑定的玩家 ID */
  get playerIds(): string[] {
    return Array.from(this.bindings.keys());
  }

  // ── 核心调度 ──

  /**
   * 每 tick 调度所有武器
   *
   * 顺序：onTick → applyEffects → expireEffects
   * 注意：tick() 不自动触发爆发，调用方需显式调用 forceBurst()
   */
  tick(state: BattleState): SkillEffect[] {
    const allEffects: WeaponEffect[] = [];

    for (const [playerId, weapon] of this.bindings) {
      const player = state.getPlayer(playerId);
      if (!player || player.hp <= 0) continue;

      // onTick 常驻被动
      const tickEffects = weapon.onTick(state, this.physicsQuery);
      allEffects.push(...tickEffects);
    }

    // 应用所有效果
    state.pendingEffects = [];
    this.applyWeaponEffects(state, allEffects);

    // 清理过期效果（每秒一次，每 TICKS_PER_SEC tick 减 1 秒 duration）
    this.expireCounter++;
    if (this.expireCounter >= TICKS_PER_SEC) {
      this.expireCounter = 0;
      this.expireEffects(state);
    }

    state.tick++;
    return state.pendingEffects;
  }

  /**
   * 处理碰撞：attacker 命中 target
   * 即使 target 未注册武器，仍触发 attacker.onHitTarget（受全局冷却守卫保护）
   */
  processHit(attackerId: string, targetId: string, state: BattleState): WeaponEffect[] {
    const allEffects: WeaponEffect[] = [];

    // 攻击者 onHitTarget — 带冷却守卫
    const attackerWeapon = this.bindings.get(attackerId);
    if (attackerWeapon) {
      const cdSec = WEAPON_RANGE_CONFIG[attackerWeapon.id]?.triggerCooldowns?.hitTargetSec ?? 0;
      if (this.cdTracker.tryTrigger(attackerId, 'hitTarget', cdSec, state.tick)) {
        allEffects.push(...attackerWeapon.onHitTarget(state, this.physicsQuery));
      }
    }

    // 目标 onHitByAttacker — 带冷却守卫
    const targetWeapon = this.bindings.get(targetId);
    if (targetWeapon) {
      const cdSec = WEAPON_RANGE_CONFIG[targetWeapon.id]?.triggerCooldowns?.hitByAttackerSec ?? 0;
      if (this.cdTracker.tryTrigger(targetId, 'hitByAttacker', cdSec, state.tick)) {
        allEffects.push(...targetWeapon.onHitByAttacker(attackerId, state, this.physicsQuery));
      }
    }

    this.applyWeaponEffects(state, allEffects);
    return allEffects;
  }

  /**
   * 手动触发某个玩家的爆发
   */
  forceBurst(playerId: string, state: BattleState): WeaponEffect[] {
    const weapon = this.bindings.get(playerId);
    if (!weapon || !weapon.isBurstReady()) return [];

    const effects = weapon.burst(state, this.physicsQuery);
    this.applyWeaponEffects(state, effects);
    return effects;
  }

  // ── 内部 ──

  /** 将 WeaponEffect 转换为 SkillEffect 并应用到 State */
  private applyWeaponEffects(state: IBattleState, effects: WeaponEffect[]): void {
    for (const effect of effects) {
      // visual_only 类型不转换为 SkillEffect（纯前端表现）
      if (effect.type === WeaponEffectType.VISUAL_ONLY) continue;

      // ── dot 类型：value 是 DPS，按 tick 缩放为单次实际伤害 ──
      let applyValue = effect.value;
      if (effect.type === WeaponEffectType.DOT) {
        applyValue = Math.max(1, Math.round(effect.value / TICKS_PER_SEC));
      }

      // 逻辑效果：转换为 SkillEffect 格式
      const se: SkillEffect = {
        type: effect.type === WeaponEffectType.AOE_DAMAGE || effect.type === WeaponEffectType.BURST_DAMAGE ? WeaponEffectType.DAMAGE :
              effect.type === WeaponEffectType.SPAWN_FIELD ? WeaponEffectType.SPAWN_FIREWALL :
              effect.type === WeaponEffectType.SPAWN_PROJECTILE ? WeaponEffectType.FIRE_STING :
              effect.type as any,
        sourceId: effect.sourceId,
        targetId: effect.targetId,
        value: applyValue,  // dot 已缩放，其他类型保持原值
        duration: effect.duration,  // 秒数
        position: effect.position ?? (effect.aoe ? { x: effect.aoe.x, y: effect.aoe.y } : undefined),
        metadata: { ...effect.metadata, radius: effect.aoe?.radius },
      };
      state.pendingEffects.push(se);

      // 伤害类效果：用缩放后的 applyValue
      if ((effect.type === WeaponEffectType.DAMAGE || effect.type === WeaponEffectType.AOE_DAMAGE || effect.type === WeaponEffectType.BURST_DAMAGE) && effect.targetId) {
        state.applyDamage(effect.targetId, applyValue, effect.sourceId);
      }

      // dot 效果：用缩放后的 applyValue
      if (effect.type === WeaponEffectType.DOT && effect.targetId) {
        state.applyDamage(effect.targetId, applyValue, effect.sourceId);
      }

      // 持续类效果（添加到 activeEffects），duration 以秒为单位
      if ((effect.type === WeaponEffectType.DOT || effect.type === WeaponEffectType.SLOW || effect.type === WeaponEffectType.SPAWN_FIELD) && effect.duration && effect.duration > 0) {
        state.activeEffects.push(se);
      }
    }
  }

  /** 每秒调用一次，将 activeEffects 中每个效果的 duration（秒）减 1 */
  private expireEffects(state: IBattleState): void {
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
    for (const [pid, weapon] of this.bindings) {
      const p = state.getPlayer(pid);
      const rt: WeaponRuntimeState = weapon.getRuntimeState();
      result[pid] = {
        name: p?.name,
        hp: `${p?.hp}/${p?.maxHp}`,
        weapon: weapon.name,
        school: weapon.school,
        energy: `${rt.energy}/${rt.maxEnergy}`,
        stacks: Object.fromEntries(Object.entries(rt.stacks)),
        burstReady: weapon.isBurstReady(),
      };
    }
    return result;
  }

  /** 重置所有冷却（新对局开始时调用） */
  resetCooldowns(): void {
    this.cdTracker.clearAll();
  }
}

// ─── CooldownTracker（全局冷却守卫）─────────────────────
/**
 * 防止极端条件下武器被连续触发的冷却追踪器。
 *
 * 使用 tick 序号计时（与 TICKS_PER_SEC=20 对齐），避免浮点精度问题。
 * 每个玩家维护 3 种触发类型的独立冷却结束 tick。
 * cooldownSec = 0 或未配置 → tryTrigger 始终返回 true（无限制）。
 */
class CooldownTracker {
  /** key = playerId, value = 各触发类型的冷却结束 tick */
  private cdEndTicks = new Map<string, { hitTarget: number; hitByAttacker: number; wallHit: number }>();

  /**
   * 尝试触发。冷却到期返回 true 并自动刷新冷却；冷却中返回 false。
   * @param playerId 玩家 ID
   * @param type 触发类型
   * @param cooldownSec 冷却时间（秒），0 = 无限制
   * @param currentTick 当前 tick 序号
   */
  tryTrigger(playerId: string, type: TriggerType, cooldownSec: number, currentTick: number): boolean {
    // 冷却为 0 → 不限制
    if (cooldownSec <= 0) return true;

    let entry = this.cdEndTicks.get(playerId);
    if (!entry) {
      entry = { hitTarget: 0, hitByAttacker: 0, wallHit: 0 };
      this.cdEndTicks.set(playerId, entry);
    }

    const endTick = entry[type];
    if (currentTick < endTick) return false;

    // 允许触发，记录新的冷却结束 tick
    entry[type] = currentTick + Math.ceil(cooldownSec * TICKS_PER_SEC);
    return true;
  }

  /** 清除指定玩家所有冷却 */
  reset(playerId: string): void {
    this.cdEndTicks.delete(playerId);
  }

  /** 清除所有冷却 */
  clearAll(): void {
    this.cdEndTicks.clear();
  }
}
