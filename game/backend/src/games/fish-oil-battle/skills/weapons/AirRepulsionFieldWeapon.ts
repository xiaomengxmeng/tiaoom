/**
 * 武器：空气斥力场 (Air Repulsion Field) - 开摆
 *
 * 流派：变奏者 Wildcard (#FFD700)
 * 难度：⭐
 *
 * ── 文档行为 ──
 * 被动 A（锚点）：碰撞 → 在碰撞点生成斥力锚点（半径 55px，持续 5s）
 *           进入者弹飞 90px + 4 伤害，同目标 0.8s CD，最多 3 个
 * 被动 B（气罩）：自身周围持续气罩（半径 35px）
 *           进入者弹开 40px + 2 伤害，同目标 1s CD
 * 爆发：以自身为中心持续斥力场（半径 180px，持续 4s）
 *       范围内对手被持续向外推离（250px/s），每秒 6 伤害，-20% 移速
 *       自身 +20% 移速，免疫锚点自伤
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

interface Anchor {
  id: string;
  x: number;
  y: number;
  secondsLeft: number;
  /** 已命中对手 ID（同目标有 CD） */
  hitTargetIds: Map<string, number>; // playerId → 下次允许命中 tick
}

interface ShieldHit {
  lastHitTick: number;
}

export class AirRepulsionFieldWeapon implements IWeapon {
  static readonly ID = WeaponId.AIR_REPULSION_FIELD;
  readonly id = WeaponId.AIR_REPULSION_FIELD;
  readonly name = WeaponName.AIR_REPULSION_FIELD;
  readonly school = School.WILD;
  readonly difficulty = 1;
  readonly iconId = 'game-icons:air-repuslion';
  playerId = '';

  private energy = 0;
  private anchors: Anchor[] = [];
  private isBurstActive = false;
  private burstTicksLeft = 0;

  /** 气罩命中记录：playerId → 下次允许命中 tick */
  private shieldHits: Map<string, number> = new Map();

  private cooldowns: Record<string, number> = {};
  private stacks: Record<string, number> = {};
  private flags: Record<string, boolean> = {};
  private tickCounter = 0;

  // ── 生命周期 ──────────────────────────────────────

  onTick(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const CFG = WEAPON_RANGE_CONFIG[this.id];
    const AR = CFG.field!;
    const shieldR = CFG.damageRadius!;

    this.tickCounter++;
    const isSecondTick = this.tickCounter >= TICKS_PER_SEC;
    if (isSecondTick) {
      this.tickCounter = 0;
    }

    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    // ── 锚点生命周期管理 + 触碰判定 ──
    this.anchors = this.anchors.filter(anchor => {
      if (isSecondTick) {
        anchor.secondsLeft--;
      }
      if (anchor.secondsLeft <= 0) return false;

      // 检测触碰锚点的对手
      const nearby = physics.getAliveOpponentsInRadius(
        this.playerId, anchor.x, anchor.y, AR.radius!,
      );
      for (const opp of nearby) {
        // 跳过自己（爆发期间免疫自伤）
        if (opp.id === this.playerId) continue;

        const lastHit = anchor.hitTargetIds.get(opp.id) ?? -Infinity;
        if (state.tick - lastHit < Math.ceil(0.8 * TICKS_PER_SEC)) continue;

        anchor.hitTargetIds.set(opp.id, state.tick);

        // 伤害
        effects.push({
          type: WeaponEffectType.DAMAGE,
          sourceId: this.playerId,
          targetId: opp.id,
          value: AR.contactDamage!,
          metadata: { desc: '斥力锚点伤害', anchorId: anchor.id },
        });

        // 弹飞（远离锚点方向）
        const dx = opp.x - anchor.x;
        const dy = opp.y - anchor.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        effects.push({
          type: WeaponEffectType.PUSH,
          sourceId: this.playerId,
          targetId: opp.id,
          value: 90,
          metadata: {
            desc: '斥力锚点弹飞',
            dirX: dx / dist,
            dirY: dy / dist,
          },
        });
      }
      return true;
    });

    // ── 气罩判定（每秒一次）──
    if (isSecondTick) {
      const nearby = physics.getAliveOpponentsInRadius(
        this.playerId, self.position.x, self.position.y, shieldR,
      );
      for (const opp of nearby) {
        const lastHit = this.shieldHits.get(opp.id) ?? -Infinity;
        if (state.tick - lastHit < TICKS_PER_SEC) continue;

        this.shieldHits.set(opp.id, state.tick);

        effects.push({
          type: WeaponEffectType.DAMAGE,
          sourceId: this.playerId,
          targetId: opp.id,
          value: 2,
          metadata: { desc: '气罩伤害' },
        });

        const dx = opp.x - self.position.x;
        const dy = opp.y - self.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        effects.push({
          type: WeaponEffectType.PUSH,
          sourceId: this.playerId,
          targetId: opp.id,
          value: 40,
          metadata: {
            desc: '气罩弹开',
            dirX: dx / dist,
            dirY: dy / dist,
          },
        });
      }
    }

    // ── 爆发：持续斥力场 ──
    if (this.isBurstActive) {
      if (this.burstTicksLeft <= 0) {
        this.isBurstActive = false;
      } else {
        // 每秒判定一次
        if (isSecondTick) {
          const opponents = physics.getAllAliveOpponents(this.playerId);
          for (const opp of opponents) {
            const dx = opp.x - self!.position.x;
            const dy = opp.y - self!.position.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist <= 180) {
              // 每秒 6 伤害
              effects.push({
                type: WeaponEffectType.DAMAGE,
                sourceId: this.playerId,
                targetId: opp.id,
                value: CFG.burstDamage!,
                metadata: { desc: '重力反转场伤害' },
              });

              // 持续推离（方向 = 远离中心）
              const nd = dist || 1;
              effects.push({
                type: WeaponEffectType.PUSH,
                sourceId: this.playerId,
                targetId: opp.id,
                value: 250 / TICKS_PER_SEC, // 250px/s 分摊到每 tick
                duration: 1,
                metadata: {
                  desc: '重力反转场推离',
                  dirX: dx / nd,
                  dirY: dy / nd,
                },
              });

              // -20% 移速
              effects.push({
                type: WeaponEffectType.SLOW,
                sourceId: this.playerId,
                targetId: opp.id,
                value: 20,
                duration: 1,
                metadata: { desc: '重力反转场减速' },
              });
            }
          }

          // 自身 +20% 移速
          effects.push({
            type: WeaponEffectType.SLOW,
            sourceId: this.playerId,
            targetId: this.playerId,
            value: -20, // 负值 = 加速
            duration: 1,
            metadata: { desc: '自身斥力加速' },
          });
        }

        this.burstTicksLeft--;
      }
    }

    return effects;
  }

  onHitTarget(state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const CFG = WEAPON_RANGE_CONFIG[this.id];
    const AR = CFG.field!;
    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    // 生成锚点（最多 3 个）
    if (this.anchors.length < AR.maxCount) {
      const anchorId = `anchor_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      this.anchors.push({
        id: anchorId,
        x: self.position.x,
        y: self.position.y,
        secondsLeft: AR.durationSec!,
        hitTargetIds: new Map(),
      });

      effects.push({
        type: WeaponEffectType.VISUAL_ONLY,
        sourceId: this.playerId,
        value: 0,
        position: { x: self.position.x, y: self.position.y },
        metadata: {
          visualType: VisualEventType.AIR_REPULSION_ANCHOR,
          anchorId,
          radius: AR.radius!,
          count: this.anchors.length,
          max: AR.maxCount!,
        },
      });

      // 充能
      this.energy = Math.min(CFG.maxEnergy!, this.energy + 1);
    }

    return effects;
  }

  onHitByAttacker(_attackerId: string, _state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    return [];
  }

  // ── 能量爆发 ──────────────────────────────────────

  getEnergy(): number { return this.energy; }
  getMaxEnergy(): number { return WEAPON_RANGE_CONFIG[this.id].maxEnergy!; }

  isBurstReady(): boolean {
    return this.energy >= WEAPON_RANGE_CONFIG[this.id].maxEnergy!
      && !this.isBurstActive;
  }

  burst(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    this.energy = 0;
    this.isBurstActive = true;
    this.burstTicksLeft = (WEAPON_RANGE_CONFIG[this.id].burstDurationSec ?? 4) * TICKS_PER_SEC;

    return [{
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      metadata: {
        visualType: VisualEventType.AIR_REPULSION_BURST,
        desc: '重力反转场启动',
        radius: 180,
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
        anchorCount: this.anchors.length,
        burstTicksLeft: this.burstTicksLeft,
      },
    };
  }

  reset(): void {
    this.energy = 0;
    this.anchors = [];
    this.isBurstActive = false;
    this.burstTicksLeft = 0;
    this.shieldHits.clear();
    this.tickCounter = 0;
    this.cooldowns = {};
    this.stacks = {};
    this.flags = {};
  }
}

// ─── 获取本武器范围配置 ───────────────────────────────
const _CFG = WEAPON_RANGE_CONFIG[AirRepulsionFieldWeapon.ID];
