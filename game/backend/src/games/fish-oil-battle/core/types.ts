/**
 * 赛博鱼油 MVP · 核心类型定义
 *
 * 仅包含 MVP 3 把武器所需的接口，后续可扩展。
 * 所有 Skill 通过 ISkill 接口与调度器解耦，各自独立实现。
 */

import type { WeaponEffectType } from '../config/GameEnums';
import type { WeaponEffectMetadata } from './IWeapon';

// ─── SkillEffect ─────────────────────────────────────
/** 技能每次调用产生的效果集合 */
export interface SkillEffect {
  type: WeaponEffectType;
  sourceId: string;                   // 来源玩家 id
  targetId?: string;                  // 目标玩家 id（伤害类必填）
  /**
   * 数值语义：
   * - damage/aoe_damage/burst_damage → 单次伤害值
   * - dot → 每秒伤害（DPS）
   * - slow → 减速百分比（0-100）
   */
  value: number;
  /** 持续时间（秒），dot/slow 等持续效果以此计时 */
  duration?: number;
  position?: { x: number; y: number };
  metadata?: WeaponEffectMetadata;    // 携带的额外数据
}

// ─── 玩家状态 ────────────────────────────────────────
export interface PlayerState {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  position: { x: number; y: number };
  /** 本局累计受到伤害（用于 Firewall 能量计算） */
  totalDamageTaken: number;
  /** 本局累计造成的伤害 */
  damageDealt: number;
  /** 击杀数 */
  kills: number;
  /** 死亡数（大逃杀模式下最多为 1） */
  deaths: number;
  /** 单次最大伤害 */
  maxHit: number;
  /** 武器技能触发次数（造成伤害的次数） */
  weaponTriggers: number;
  /** 爆发次数 */
  bursts: number;
  /** 当前是否为过热期 */
  isOverheated: boolean;
}

// ─── 战场状态 ────────────────────────────────────────
export interface IBattleState {
  tick: number;
  players: Map<string, PlayerState>;
  /** 当前帧等待应用的 effects（调度器处理后清空） */
  pendingEffects: SkillEffect[];
  /** 持久效果（防火墙、蜂群等，持续多帧） */
  activeEffects: SkillEffect[];
  canvasWidth: number;
  canvasHeight: number;

  getPlayer(id: string): PlayerState | undefined;
  getOpponent(id: string): PlayerState | undefined;
  /** 随机选取一个存活对手（大逃杀模式），返回 undefined 表示无存活对手 */
  getRandomAliveOpponent(id: string): PlayerState | undefined;
  /** 对目标造成伤害，自动更新 totalDamageTaken */
  applyDamage(targetId: string, amount: number, sourceId?: string): void;
}

// ─── 技能运行时状态 ──────────────────────────────────
export interface SkillRuntimeState {
  energy: number;
  maxEnergy: number;
  cooldowns: Map<string, number>;
  stacks: Map<string, number>;
  flags: Map<string, boolean>;
}

// ─── 技能接口（MVP 核心抽象） ────────────────────────
export interface ISkill {
  /** 技能唯一标识 */
  readonly id: string;
  /** 武器名称 */
  readonly name: string;
  /** 所属流派 */
  readonly school: string;
  /** 所属玩家 ID（由调度器注册时注入） */
  playerId: string;

  // ── 生命周期钩子 ──
  /** 每 tick 调用（被动常驻特效） */
  onTick(state: IBattleState): SkillEffect[];
  /** 自身碰撞对手时调用 */
  onHitTarget(state: IBattleState): SkillEffect[];
  /** 被对手碰撞时调用 */
  onHitByAttacker(attackerId: string, state: IBattleState): SkillEffect[];

  // ── 能量爆发 ──
  /** 当前能量值 */
  getEnergy(): number;
  /** 最大能量值 */
  getMaxEnergy(): number;
  /** 是否满足爆发条件 */
  isBurstReady(): boolean;
  /** 执行爆发，返回爆发产生的所有效果 */
  burst(state: IBattleState): SkillEffect[];

  // ── 状态 ──
  /** 获取运行时状态（供调试/持久化） */
  getRuntimeState(): SkillRuntimeState;
  /** 重置技能状态 */
  reset(): void;
}
