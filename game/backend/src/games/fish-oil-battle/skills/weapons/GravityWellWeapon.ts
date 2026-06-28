/**
 * 武器 4：重力阱 (Gravity Well)
 *
 * 流派：控制者 Controller (#00BFFF)
 * 难度：⭐⭐
 *
 * ── 核心设计 ──
 * 球体持续散发微重力场（半径 60px），对手进入移速 -15%。
 * 每 8 秒生成重力锚点（持续 6 秒），对手经过 80px 被拉向锚点中心。
 * 每 15 秒自动充满（时间制）：地图中心黑洞（3 秒），拉拽 + 移速 -50%，
 * 拉到中心 = 22 伤害 + 1.5 秒眩晕。自身不受影响。
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

const ANCHOR_INTERVAL_SEC = 8;
const BLACKHOLE_DURATION_SEC = 3;
const BLACKHOLE_PULL_FORCE = 200;
const BLACKHOLE_SLOW_PERCENT = 50;
const BLACKHOLE_STUN_SEC = 1.5;
const MICRO_GRAVITY_SLOW = 15;

interface GravityAnchor {
  id: string;
  x: number;
  y: number;
  secondsLeft: number;
}

export class GravityWellWeapon implements IWeapon {
  static readonly ID = WeaponId.GRAVITY_WELL;
  readonly id = WeaponId.GRAVITY_WELL;
  readonly name = WeaponName.GRAVITY_WELL;
  readonly school = School.CONTROLLER;
  readonly difficulty = 2;
  readonly iconId = 'game-icons:gravity-well';
  playerId = '';

  private energy = 0;
  private anchors: GravityAnchor[] = [];
  private burstActive = false;
  private burstTicksLeft = 0;
  private anchorCooldownTicks = 0;
  private tickCounter = 0;
  private cooldowns: Record<string, number> = {};
  private stacks: Record<string, number> = {};
  private flags: Record<string, boolean> = {};

  onTick(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    this.tickCounter++;
    const isSecondTick = this.tickCounter >= TICKS_PER_SEC;
    if (isSecondTick) this.tickCounter = 0;

    // 时间充能（每秒 +1）
    if (isSecondTick) {
      this.energy = Math.min(CFG.maxEnergy!, this.energy + 1);
    }

    // 微重力场：对手进入减速
    const microFieldR = CFG.damageRadius!;
    const nearbyMicro = physics.getAliveOpponentsInRadius(
      this.playerId, self.position.x, self.position.y, microFieldR,
    );
    for (const opp of nearbyMicro) {
      effects.push({
        type: WeaponEffectType.SLOW,
        sourceId: this.playerId,
        targetId: opp.id,
        value: MICRO_GRAVITY_SLOW,
        duration: 1,
        metadata: { desc: '微重力场减速' },
      });
    }

    // 发送重力核心视觉事件（微重力场）
    if (this.tickCounter % 10 === 0) {
      effects.push({
        type: WeaponEffectType.VISUAL_ONLY,
        sourceId: this.playerId,
        value: 0,
        position: { x: self.position.x, y: self.position.y },
        metadata: {
          visualType: VisualEventType.GRAVITY_WELL_CORE,
          radius: microFieldR,
        },
      });
    }

    // 锚点管理
    if (isSecondTick) {
      for (const a of this.anchors) a.secondsLeft--;
      this.anchors = this.anchors.filter(a => a.secondsLeft > 0);
    }

    // 锚点牵引
    for (const anchor of this.anchors) {
      const inRange = physics.getAliveOpponentsInRadius(
        this.playerId, anchor.x, anchor.y, CFG.field!.radius!,
      );
      for (const opp of inRange) {
        const dx = anchor.x - opp.x;
        const dy = anchor.y - opp.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        effects.push({
          type: WeaponEffectType.PULL,
          sourceId: this.playerId,
          targetId: opp.id,
          value: BLACKHOLE_PULL_FORCE / TICKS_PER_SEC,
          duration: 1,
          metadata: {
            desc: '锚点牵引',
            dirX: dx / dist,
            dirY: dy / dist,
          },
        });
      }
    }

    // 生成新锚点（每 8 秒）
    if (this.anchorCooldownTicks <= 0 && this.anchors.length < CFG.field!.maxCount!) {
      this.anchorCooldownTicks = ANCHOR_INTERVAL_SEC * TICKS_PER_SEC;
      const arenaCenter = physics.getArenaCenter();
      const arenaR = physics.getArenaRadius();
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * arenaR * 0.7;
      const ax = arenaCenter.x + Math.cos(angle) * r;
      const ay = arenaCenter.y + Math.sin(angle) * r;
      const anchorId = `anchor_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      this.anchors.push({
        id: anchorId, x: ax, y: ay, secondsLeft: CFG.field!.durationSec!,
      });
      effects.push({
        type: WeaponEffectType.VISUAL_ONLY,
        sourceId: this.playerId,
        value: 0,
        position: { x: ax, y: ay },
        metadata: {
          visualType: VisualEventType.GRAVITY_WELL_CORE,
          radius: CFG.field!.radius!,
          anchorId,
        },
      });
    }
    if (this.anchorCooldownTicks > 0) this.anchorCooldownTicks--;

    // 爆发持续：黑洞
    if (this.burstActive) {
      if (this.burstTicksLeft <= 0) {
        this.burstActive = false;
      } else {
        const arenaCenter = physics.getArenaCenter();
        const inBlackhole = physics.getAliveOpponentsInRadius(
          this.playerId, arenaCenter.x, arenaCenter.y, CFG.aoeMaxRadius!,
        );
        for (const opp of inBlackhole) {
          const dx = arenaCenter.x - opp.x;
          const dy = arenaCenter.y - opp.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;

          // 拉拽
          effects.push({
            type: WeaponEffectType.PULL,
            sourceId: this.playerId,
            targetId: opp.id,
            value: BLACKHOLE_PULL_FORCE / TICKS_PER_SEC,
            duration: 1,
            metadata: {
              desc: '黑洞拉拽',
              dirX: dx / dist,
              dirY: dy / dist,
            },
          });

          // 减速
          effects.push({
            type: WeaponEffectType.SLOW,
            sourceId: this.playerId,
            targetId: opp.id,
            value: BLACKHOLE_SLOW_PERCENT,
            duration: 1,
            metadata: { desc: '黑洞减速' },
          });

          // 中心伤害 + 眩晕
          if (dist < 30) {
            effects.push({
              type: WeaponEffectType.BURST_DAMAGE,
              sourceId: this.playerId,
              targetId: opp.id,
              value: CFG.burstDamage!,
              metadata: { desc: '黑洞中心伤害' },
            });
            effects.push({
              type: WeaponEffectType.SLOW,
              sourceId: this.playerId,
              targetId: opp.id,
              value: 100,
              duration: BLACKHOLE_STUN_SEC,
              metadata: { desc: '黑洞眩晕' },
            });
          }
        }
        this.burstTicksLeft--;
      }
    }

    return effects;
  }

  onHitTarget(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    return [];
  }

  onHitByAttacker(_attackerId: string, _state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    return [];
  }

  getEnergy(): number {
    return Math.round(this.energy / CFG.maxEnergy! * 100);
  }
  getMaxEnergy(): number {
    return 100;
  }
  setEnergy(percent: number): void {
    this.energy = Math.max(0, Math.min(CFG.maxEnergy!, percent / 100 * CFG.maxEnergy!));
  }

  isBurstReady(): boolean {
    return this.energy >= CFG.maxEnergy! && !this.burstActive;
  }

  burst(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const arenaCenter = physics.getArenaCenter();
    this.energy = 0;
    this.burstActive = true;
    this.burstTicksLeft = BLACKHOLE_DURATION_SEC * TICKS_PER_SEC;

    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: arenaCenter.x, y: arenaCenter.y },
      metadata: {
        visualType: VisualEventType.GRAVITY_WELL_BURST,
        radius: CFG.aoeMaxRadius!,
      },
    });

    return effects;
  }

  getRuntimeState(): WeaponRuntimeState {
    return {
      energy: this.energy,
      maxEnergy: CFG.maxEnergy!,
      cooldowns: this.cooldowns,
      stacks: this.stacks,
      flags: { burstActive: this.burstActive },
      custom: {
        anchorCount: this.anchors.length,
        burstTicksLeft: this.burstTicksLeft,
      },
    };
  }

  reset(): void {
    this.energy = 0;
    this.anchors = [];
    this.burstActive = false;
    this.burstTicksLeft = 0;
    this.anchorCooldownTicks = 0;
    this.tickCounter = 0;
    this.cooldowns = {};
    this.stacks = {};
    this.flags = {};
  }
}

const CFG = WEAPON_RANGE_CONFIG[GravityWellWeapon.ID];
