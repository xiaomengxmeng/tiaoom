/**
 * 赛博鱼油 · 武器总接口（高可扩展架构）
 *
 * 设计说明：
 * - IWeapon 是 12 把武器的顶层抽象，每把武器 = 一个 IWeapon 实现
 * - 通过 IPhysicsQuery 解耦武器与物理引擎，武器只做"空间查询"
 * - WeaponEffect 类型覆盖所有文档中的效果（伤害/控制/场地/投射物/视觉）
 * - 新增武器只需实现 IWeapon + 在 WeaponRegistry 注册，核心系统零改动
 */

import type { IBattleState } from './types';
import { School, WeaponEffectType, WeaponId, VisualEventType } from '../config/GameEnums';
import type { HitReaction } from '../shared/protocol';
export { School, WeaponEffectType };

// ─── 帧率常量 ─────────────────────────────────────────────
/** 每秒 tick 数（20fps），武器实现与调度器共享 */
export const TICKS_PER_SEC = 20;

/** WeaponEffect.metadata 的约束类型。保留索引签名以兼容武器特有字段。 */
export interface WeaponEffectMetadata {
  visualType?: VisualEventType;
  weaponId?: WeaponId;
  radius?: number;
  isBurst?: boolean;
  burst?: boolean;
  tx?: number;
  ty?: number;
  desc?: string;
  [key: string]: any;
}

export interface WeaponEffect {
  type: WeaponEffectType;
  sourceId: string;
  targetId?: string;
  /**
   * 数值语义：
   * - 'damage' / 'aoe_damage' / 'burst_damage' → 单次伤害值
   * - 'dot' → 每秒伤害（DPS），调度器在 apply 时自动缩放为每 tick 实际伤害
   * - 'slow' → 减速百分比（0-100）
   */
  value: number;
  /** 持续时间（秒），dot/slow 效果以此决定存活时长 */
  duration?: number;
  /** 范围效果时的中心点 + 半径 */
  aoe?: { x: number; y: number; radius: number };
  position?: { x: number; y: number };
  metadata?: WeaponEffectMetadata;
}

// ─── 武器运行时状态 ────────────────────────────────────────
export interface WeaponRuntimeState {
  energy: number;
  maxEnergy: number;
  cooldowns: Record<string, number>;
  stacks: Record<string, number>;
  flags: Record<string, boolean>;
  custom?: Record<string, any>;
}

// ─── 物理查询接口（解耦武器与物理引擎） ──────────────
/** 简化的存活对手快照 */
export interface AliveOpponent {
  id: string;
  x: number;
  y: number;
  hp: number;
  name: string;
}

/** 动态物理障碍物（硬化防火墙等场地装置的碰撞边界） */
export interface PhysicsObstacle {
  x: number;
  y: number;
  /** 碰撞半径（逻辑 px） */
  radius: number;
  /** 碰撞矩形宽度（逻辑 px，方案 B） */
  width?: number;
  /** 碰撞矩形高度（逻辑 px） */
  height?: number;
  /** 障碍物所属玩家 ID（用于碰撞时追溯伤害来源 + 跳过创造者自己的碰撞） */
  sourceId: string;
  /** 障碍物唯一标识（用于前端差异化渲染 + 去重） */
  id?: string;
  /** 障碍物类型（如 'slash' / 'air_anchor' / 'vortex' / 'memory_echo'，用于前端差异化渲染） */
  type?: string;
}

export interface IPhysicsQuery {
  /** 获取某点半径 r 内的所有存活对手（不含自己） */
  getAliveOpponentsInRadius(selfId: string, x: number, y: number, radius: number): AliveOpponent[];
  /** 获取自己的坐标 */
  getSelfPosition(playerId: string): { x: number; y: number } | undefined;
  /** 获取随机存活对手 */
  getRandomAliveOpponent(selfId: string): AliveOpponent | undefined;
  /** 获取所有存活对手快照 */
  getAllAliveOpponents(selfId: string): AliveOpponent[];
  /** 竞技场圆心 */
  getArenaCenter(): { x: number; y: number };
  /** 竞技场半径 */
  getArenaRadius(): number;
}

// ─── 武器总接口 ─────────────────────────────────────────
export interface IWeapon {
  /** 武器唯一 ID */
  readonly id: WeaponId;
  /** 武器名称 */
  readonly name: string;
  /** 所属流派 */
  readonly school: School;
  /** 难度 1-3 */
  readonly difficulty: number;
  /** 图标 ID（game-icons 或自定义） */
  readonly iconId: string;
  /** 所属玩家 ID（调度器注册时注入） */
  playerId: string;

  // ── 生命周期钩子 ──
  /** 每 tick 调用（常驻被动 + 自动触发检测） */
  onTick(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[];
  /** 自身碰撞对手时调用 */
  onHitTarget(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[];
  /** 被对手碰撞时调用 */
  onHitByAttacker(attackerId: string, state: IBattleState, physics: IPhysicsQuery): WeaponEffect[];
  /** 碰撞墙壁时调用（可选） */
  onWallHit?(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[];
  /**
   * 对手碰撞到本武器生成的障碍物时调用（可选）
   * @param hittingPlayerId 碰撞者的 playerId
   */
  onObstacleHit?(hittingPlayerId: string, state: IBattleState, physics: IPhysicsQuery): WeaponEffect[];

  // ── 物理障碍 ──
  /**
   * 返回当前活跃的物理障碍物列表（可选）。
   * 仅当武器需要动态添加碰撞边界时实现（如硬化防火墙）。
   * 物理引擎每帧调用此方法获取最新的障碍物。
   */
  getObstacles?(): PhysicsObstacle[];

  // ── 能量/爆发 ──
  /**
   * 获取当前能量百分比（0-100）
   * - 内部原单位动态计算为百分比返回
   * - 所有武器统一返回 0-100
   */
  getEnergy(): number;

  /**
   * 获取最大能量值（固定返回 100）
   * - 所有武器统一返回 100
   */
  getMaxEnergy(): number;

  /**
   * 调试用：设置能量值（百分比 0-100）
   * - 接收 0-100 的百分比值
   * - 内部转换为武器原始单位存储
   * - 不触发爆发，需另行调用 burst()
   */
  setEnergy(percent: number): void;

  /** 是否满足爆发条件 */
  isBurstReady(): boolean;
  /** 执行爆发，返回爆发产生的所有效果 */
  burst(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[];

  // ── 状态查询 ──
  getRuntimeState(): WeaponRuntimeState;
  /** 重置（新对局开始时调用） */
  reset(): void;

  /** 返回该武器的受击反应类型（用于前端差异化受击视觉） */
  getHitReaction?(): HitReaction;
}
