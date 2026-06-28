/**
 * 赛博鱼油 · 武器调度器
 *
 * 与 SkillScheduler 并行存在，专门调度 IWeapon 接口。
 * 负责：注册武器 → 驱动生命周期 → 收集 WeaponEffect → 应用到 BattleState
 *
 * 核心调度顺序（每 tick）：
 *   1. 遍历所有武器 → onTick()（常驻被动 + 自动触发）
 *   2. 应用所有 WeaponEffect 到 BattleState
 *   3. 清理过期 activeEffects
 *   4. state.tick++
 *
 * 碰撞处理：
 *   - processHit(attackerId, targetId)
 *     → attacker.onHitTarget() + target.onHitByAttacker()
 */

import type { IBattleState, SkillEffect } from './types';
import type { IWeapon, IPhysicsQuery, WeaponEffect, WeaponEffectMetadata, PhysicsObstacle } from './IWeapon';
import { TICKS_PER_SEC } from './IWeapon';
import { WeaponEffectType, VisualEventType, WeaponId } from '../config/GameEnums';

/** 视觉事件（从 visual_only 类型 WeaponEffect 提取） */
export interface PendingVisualEvent {
  playerId: string;
  weaponId?: WeaponId;
  visualType?: VisualEventType;
  x?: number;
  y?: number;
  tx?: number;
  ty?: number;
  radius?: number;
  isBurst?: boolean;
  metadata?: WeaponEffectMetadata;
  /** 命中反馈目标 ID（HIT_FEEDBACK 事件专用） */
  targetId?: string;
}

export class WeaponScheduler {
  private bindings = new Map<string, IWeapon>();
  private physicsQuery: IPhysicsQuery;
  private pendingVisuals: PendingVisualEvent[] = [];
  /** expireEffects 秒级计数器：每 TICKS_PER_SEC 个 tick 减一次 duration */
  private expireCounter = 0;

  /**
   * 外部伤害修正回调（如全局彩蛋效果）
   * 在 applyDamage 之前调用，返回修正后的伤害值
   */
  public damageModifier: ((baseDamage: number, attackerId: string, victimId: string) => number) | null = null;

  constructor(physicsQuery: IPhysicsQuery) {
    this.physicsQuery = physicsQuery;
  }

  /** 获取并清空待广播的视觉事件 */
  getVisualEvents(): PendingVisualEvent[] {
    const events = [...this.pendingVisuals];
    this.pendingVisuals = [];
    return events;
  }

  /** 注册玩家武器（注入 playerId 并初始化） */
  register(playerId: string, weapon: IWeapon): void {
    weapon.playerId = playerId;
    weapon.reset();
    this.bindings.set(playerId, weapon);
  }

  /** 获取玩家武器 */
  getWeapon(playerId: string): IWeapon | undefined {
    return this.bindings.get(playerId);
  }

  /** 所有绑定的玩家 ID */
  get playerIds(): string[] {
    return Array.from(this.bindings.keys());
  }

  // ── 核心调度 ────────────────────────────────────────

  /**
   * 每 tick 调度所有武器
   */
  tick(state: IBattleState): SkillEffect[] {
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
   */
  processHit(attackerId: string, targetId: string, state: IBattleState): WeaponEffect[] {
    const allEffects: WeaponEffect[] = [];

    const attackerWeapon = this.bindings.get(attackerId);
    if (attackerWeapon) {
      allEffects.push(...attackerWeapon.onHitTarget(state, this.physicsQuery));
    }

    const targetWeapon = this.bindings.get(targetId);
    if (targetWeapon) {
      allEffects.push(...targetWeapon.onHitByAttacker(attackerId, state, this.physicsQuery));
    }

    this.applyWeaponEffects(state, allEffects);
    return allEffects;
  }

  /**
   * 处理碰墙事件（可选）
   */
  processWallHit(playerId: string, state: IBattleState): WeaponEffect[] {
    const weapon = this.bindings.get(playerId);
    if (!weapon || !weapon.onWallHit) return [];
    const effects = weapon.onWallHit(state, this.physicsQuery);
    this.applyWeaponEffects(state, effects);
    return effects;
  }

  /**
   * 处理对手碰撞某玩家的障碍物（如硬化防火墙）
   * @param obstacleSourceId 障碍物所属玩家 ID
   * @param hittingPlayerId 发生碰撞的玩家 ID
   */
  processObstacleHit(obstacleSourceId: string, hittingPlayerId: string, state: IBattleState): WeaponEffect[] {
    const weapon = this.bindings.get(obstacleSourceId);
    if (!weapon || !weapon.onObstacleHit) return [];
    const effects = weapon.onObstacleHit(hittingPlayerId, state, this.physicsQuery);
    this.applyWeaponEffects(state, effects);
    return effects;
  }

  /**
   * 手动触发某个玩家的爆发
   */
  forceBurst(playerId: string, state: IBattleState): WeaponEffect[] {
    const weapon = this.bindings.get(playerId);
    if (!weapon || !weapon.isBurstReady()) return [];

    const effects = weapon.burst(state, this.physicsQuery);
    this.applyWeaponEffects(state, effects);
    return effects;
  }

  /**
   * 调试用：设置某玩家武器能量（百分比 0-100）
   * - 仅用于测试模式
   * - percent 范围 0-100
   */
  setEnergy(playerId: string, percent: number): void {
    const weapon = this.bindings.get(playerId);
    if (weapon) weapon.setEnergy(percent);
  }

  /**
   * 调试用：强制爆发（绕过 isBurstReady 检查）
   * - 直接调用 weapon.burst()，不检查能量是否满
   * - 仍会触发 applyWeaponEffects 应用效果
   */
  debugForceBurst(playerId: string, state: IBattleState): WeaponEffect[] {
    const weapon = this.bindings.get(playerId);
    if (!weapon) return [];
    const effects = weapon.burst(state, this.physicsQuery);
    this.applyWeaponEffects(state, effects);
    return effects;
  }

  /**
   * 收集所有武器的物理障碍物（供物理引擎碰撞检测）
   */
  getObstacles(): PhysicsObstacle[] {
    const obstacles: PhysicsObstacle[] = [];
    for (const [, weapon] of this.bindings) {
      if (weapon.getObstacles) {
        obstacles.push(...weapon.getObstacles());
      }
    }
    return obstacles;
  }

  // ── 内部 ────────────────────────────────────────────

  /** 将 WeaponEffect 转换为 SkillEffect 并应用到 State，同时收集视觉事件 */
  private applyWeaponEffects(state: IBattleState, effects: WeaponEffect[]): void {
    for (const effect of effects) {
      // visual_only：不转换为 SkillEffect，仅收集为视觉事件
      if (effect.type === WeaponEffectType.VISUAL_ONLY) {
        this.pendingVisuals.push({
          playerId: effect.sourceId,
          weaponId: (effect.metadata?.weaponId as WeaponId) ?? this.bindings.get(effect.sourceId)?.id,
          visualType: effect.metadata?.visualType,
          x: effect.position?.x ?? effect.aoe?.x,
          y: effect.position?.y ?? effect.aoe?.y,
          tx: effect.metadata?.tx,
          ty: effect.metadata?.ty,
          radius: effect.aoe?.radius ?? effect.metadata?.radius,
          isBurst: effect.metadata?.isBurst ?? effect.metadata?.burst,
          metadata: effect.metadata,
        });
        continue;
      }

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

      // 伤害类效果：用缩放后的 applyValue，通过 damageModifier 修正
      if ((effect.type === WeaponEffectType.DAMAGE || effect.type === WeaponEffectType.AOE_DAMAGE || effect.type === WeaponEffectType.BURST_DAMAGE) && effect.targetId) {
        const actualDamage = this.damageModifier
          ? this.damageModifier(applyValue, effect.sourceId, effect.targetId)
          : applyValue;
        state.applyDamage(effect.targetId, actualDamage, effect.sourceId);
        // 收集命中反馈视觉事件（仅对直接伤害类）
        if (effect.sourceId) {
          const weapon = this.bindings.get(effect.sourceId);
          const reaction = weapon?.getHitReaction?.() ?? 'flash';
          this.pendingVisuals.push({
            playerId: effect.targetId,
            weaponId: weapon?.id,
            visualType: VisualEventType.HIT_FEEDBACK,
            x: effect.position?.x ?? effect.aoe?.x,
            y: effect.position?.y ?? effect.aoe?.y,
            targetId: effect.targetId,
            metadata: {
              sourceId: effect.sourceId,
              weaponId: weapon?.id,
              damage: actualDamage,
              hitReaction: reaction,
            },
          });
        }
      }

      // dot 效果：用缩放后的 applyValue，通过 damageModifier 修正
      if (effect.type === WeaponEffectType.DOT && effect.targetId) {
        const actualDamage = this.damageModifier
          ? this.damageModifier(applyValue, effect.sourceId, effect.targetId)
          : applyValue;
        state.applyDamage(effect.targetId, actualDamage, effect.sourceId);
        // 收集 DOT 命中反馈视觉事件
        if (effect.sourceId) {
          const weapon = this.bindings.get(effect.sourceId);
          const reaction = weapon?.getHitReaction?.() ?? 'burn';
          this.pendingVisuals.push({
            playerId: effect.targetId,
            weaponId: weapon?.id,
            visualType: VisualEventType.HIT_FEEDBACK,
            x: effect.position?.x ?? effect.aoe?.x,
            y: effect.position?.y ?? effect.aoe?.y,
            targetId: effect.targetId,
            metadata: {
              sourceId: effect.sourceId,
              weaponId: weapon?.id,
              damage: actualDamage,
              hitReaction: reaction,
            },
          });
        }
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
}
