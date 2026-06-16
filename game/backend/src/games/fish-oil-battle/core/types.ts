/**
 * 赛博鱼油 MVP · 核心类型定义
 *
 * 仅包含 MVP 3 把武器所需的接口，后续可扩展。
 * 所有 Skill 通过 ISkill 接口与调度器解耦，各自独立实现。
 */

// ─── 流派 ────────────────────────────────────────────
export type School = 'aggressor' | 'controller' | 'engineer' | 'wildcard';

// ─── SkillEffect ─────────────────────────────────────
/** 技能产生的效果类型 */
export type EffectType =
  | 'damage'          // 直接伤害
  | 'dot'             // 持续伤害 (duration 有效)
  | 'slow'            // 减速 (value=百分比)
  | 'shield'          // 护盾
  | 'spawn_firewall'  // 生成防火墙
  | 'fire_sting'      // 蜂刺发射
  | 'shockwave'       // 冲击波
  | 'burst_damage';   // 爆发伤害

/** 技能每次调用产生的效果集合 */
export interface SkillEffect {
  type: EffectType;
  sourceId: string;                   // 来源玩家 id
  targetId?: string;                  // 目标玩家 id（伤害类必填）
  value: number;                      // 数值（伤害/减速百分比等）
  duration?: number;                  // 持续 tick 数
  position?: { x: number; y: number };
  metadata?: Record<string, any>;     // 携带的额外数据
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
  onHitByAttacker(state: IBattleState): SkillEffect[];

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
