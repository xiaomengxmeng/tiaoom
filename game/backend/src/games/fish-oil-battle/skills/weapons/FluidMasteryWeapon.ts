/**
 * 武器：流体操控 (Fluid Mastery) - KE
 *
 * 流派：变奏者 Wildcard
 * 难度：⭐⭐
 *
 * ── 文档行为 ──
 * 被动 A（水流尾迹）：移动时留下水流尾迹，对路径上敌人造成伤害 + 减速
 * 被动 B（漩涡牵引）：被攻击时形成漩涡，牵引攻击者并造成反击伤害
 * 爆发（水龙卷）：充能满后召唤水龙卷，范围伤害 + 持续牵引敌人向中心
 *       持续 4 秒，aoeMaxRadius 范围内每秒造成 burstDamage 伤害
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

export class FluidMasteryWeapon implements IWeapon {
  static readonly ID = WeaponId.FLUID_MASTERY;
  readonly id = WeaponId.FLUID_MASTERY;
  readonly name = WeaponName.FLUID_MASTERY;
  readonly school = School.WILD;
  readonly difficulty = 2;
  readonly iconId = 'game-icons:water-flow';
  playerId = '';

  private energy = 0;
  private isBurstActive = false;
  private burstTicksLeft = 0;

  /** 上一次位置（用于移动检测） */
  private lastX: number | null = null;
  private lastY: number | null = null;
  /** 尾迹派发限频计数（tick） */
  private trailCooldownTicks = 0;
  /** 漩涡反击限频计数（tick） */
  private vortexCooldownTicks = 0;
  /** 爆发冷却剩余（tick） */
  private burstCooldownTicksLeft = 0;

  private cooldowns: Record<string, number> = {};
  private stacks: Record<string, number> = {};
  private flags: Record<string, boolean> = {};
  private tickCounter = 0;
  /** 书生愤怒态（hp<30% 时触发，色系切换为深红） */
  private isAngry = false;

  // ── 生命周期 ──────────────────────────────────────

  onTick(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const CFG = WEAPON_RANGE_CONFIG[this.id];
    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    // 书生愤怒态：hp < 30% 时激活
    const hpRatio = self.hp / self.maxHp;
    this.isAngry = hpRatio < 0.3;

    this.tickCounter++;
    const isSecondTick = this.tickCounter >= TICKS_PER_SEC;
    if (isSecondTick) this.tickCounter = 0;

    // 限频计数递减
    if (this.trailCooldownTicks > 0) this.trailCooldownTicks--;
    if (this.vortexCooldownTicks > 0) this.vortexCooldownTicks--;
    if (this.burstCooldownTicksLeft > 0) this.burstCooldownTicksLeft--;

    const curX = self.position.x;
    const curY = self.position.y;

    // ── 被动 A：水流尾迹（移动检测）──
    if (this.lastX !== null && this.lastY !== null) {
      const dx = curX - this.lastX;
      const dy = curY - this.lastY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // 移动超过阈值且冷却结束：派发尾迹
      if (dist > 3 && this.trailCooldownTicks <= 0) {
        const minIntervalTicks = Math.max(
          1,
          Math.round((CFG.triggerCooldowns?.minIntervalMs ?? 400) / (1000 / TICKS_PER_SEC)),
        );
        this.trailCooldownTicks = minIntervalTicks;

        const flowDir = Math.atan2(dy, dx);
        const trailLength = Math.round(dist);

        // 派发尾迹视觉事件
        effects.push({
          type: WeaponEffectType.VISUAL_ONLY,
          sourceId: this.playerId,
          value: 0,
          position: { x: curX, y: curY },
          metadata: {
            visualType: VisualEventType.FLUID_MASTERY_TRAIL,
            flowDir,
            trailLength,
            radius: CFG.damageRadius ?? 45,
            isAngry: this.isAngry,
          },
        });

        // 对尾迹路径上的敌人造成伤害 + 减速
        const opponents = physics.getAliveOpponentsInRadius(
          this.playerId, curX, curY, CFG.damageRadius ?? 45,
        );
        for (const opp of opponents) {
          effects.push({
            type: WeaponEffectType.DAMAGE,
            sourceId: this.playerId,
            targetId: opp.id,
            value: CFG.damage ?? 8,
            metadata: { desc: '水流尾迹伤害' },
          });
          effects.push({
            type: WeaponEffectType.SLOW,
            sourceId: this.playerId,
            targetId: opp.id,
            value: Math.round((1 - (CFG.field?.slowFactor ?? 0.7)) * 100),
            duration: 1,
            metadata: { desc: '水流尾迹减速' },
          });
          // 命中获得能量
          this.gainEnergy(CFG.energyPerHit ?? 12);
        }
      }
    }
    this.lastX = curX;
    this.lastY = curY;

    // ── 爆发：水龙卷 ──
    if (this.isBurstActive) {
      if (this.burstTicksLeft <= 0) {
        this.isBurstActive = false;
      } else if (isSecondTick) {
        const center = physics.getArenaCenter();
        const opponents = physics.getAliveOpponentsInRadius(
          this.playerId, center.x, center.y, CFG.aoeMaxRadius ?? 220,
        );
        for (const opp of opponents) {
          // 每秒爆发伤害
          effects.push({
            type: WeaponEffectType.BURST_DAMAGE,
            sourceId: this.playerId,
            targetId: opp.id,
            value: CFG.burstDamage ?? 45,
            metadata: { desc: '水龙卷伤害' },
          });
          // 牵引敌人向中心（PULL）
          effects.push({
            type: WeaponEffectType.PULL,
            sourceId: this.playerId,
            targetId: opp.id,
            value: 50,
            metadata: { desc: '水龙卷牵引', tx: center.x, ty: center.y },
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

    // 命中获得能量
    this.gainEnergy(CFG.energyPerHit ?? 12);
    return effects;
  }

  onHitByAttacker(attackerId: string, state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const CFG = WEAPON_RANGE_CONFIG[this.id];

    // 漩涡反击限频
    const minIntervalTicks = Math.max(
      1,
      Math.round((CFG.triggerCooldowns?.minIntervalMs ?? 400) / (1000 / TICKS_PER_SEC)),
    );
    if (this.vortexCooldownTicks > 0) return effects;
    this.vortexCooldownTicks = minIntervalTicks;

    const self = state.getPlayer(this.playerId);
    const vortexRadius = CFG.damageRadius ?? 45;
    const pullForce = 40;

    // 派发漩涡视觉事件
    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: self?.position ? { x: self.position.x, y: self.position.y } : undefined,
      metadata: {
        visualType: VisualEventType.FLUID_MASTERY_VORTEX,
        vortexRadius,
        pullForce,
        targetId: attackerId,
        radius: vortexRadius,
        isAngry: this.isAngry,
      },
    });

    // 牵引攻击者向自己（PULL）
    if (self) {
      effects.push({
        type: WeaponEffectType.PULL,
        sourceId: this.playerId,
        targetId: attackerId,
        value: pullForce,
        metadata: { desc: '漩涡牵引', tx: self.position.x, ty: self.position.y },
      });
    }

    // 对攻击者造成反击伤害
    effects.push({
      type: WeaponEffectType.DAMAGE,
      sourceId: this.playerId,
      targetId: attackerId,
      value: CFG.damage ?? 8,
      metadata: { desc: '漩涡反击伤害' },
    });

    // 被击中获得能量
    this.gainEnergy(CFG.energyPerBurstHit ?? 25);
    void physics;
    return effects;
  }

  // ── 能量爆发 ──────────────────────────────────────

  getEnergy(): number {
    const max = WEAPON_RANGE_CONFIG[this.id].burstEnergyCost ?? WEAPON_RANGE_CONFIG[this.id].maxEnergy!;
    return Math.round(this.energy / max * 100);
  }
  getMaxEnergy(): number {
    return 100;
  }
  setEnergy(percent: number): void {
    const max = WEAPON_RANGE_CONFIG[this.id].burstEnergyCost ?? WEAPON_RANGE_CONFIG[this.id].maxEnergy!;
    this.energy = Math.max(0, Math.min(max, percent / 100 * max));
  }

  isBurstReady(): boolean {
    return this.energy >= this.getMaxEnergy()
      && !this.isBurstActive
      && this.burstCooldownTicksLeft <= 0;
  }

  burst(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    if (!this.isBurstReady()) return [];
    const CFG = WEAPON_RANGE_CONFIG[this.id];

    this.energy = 0;
    this.isBurstActive = true;
    this.burstTicksLeft = (CFG.burstDurationSec ?? 4) * TICKS_PER_SEC;
    this.burstCooldownTicksLeft = Math.round(
      ((CFG.cooldownMs ?? 6000) / 1000) * TICKS_PER_SEC,
    );

    const center = physics.getArenaCenter();
    const radius = CFG.aoeMaxRadius ?? 220;
    const durationMs = (CFG.burstDurationSec ?? 4) * 1000;

    return [{
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: center.x, y: center.y },
      metadata: {
        visualType: VisualEventType.FLUID_MASTERY_BURST,
        isBurst: true,
        radius,
        durationMs,
        isAngry: this.isAngry,
        desc: '水龙卷启动',
      },
    }];
  }

  // ── 内部 ──────────────────────────────────────

  private gainEnergy(amount: number): void {
    const max = WEAPON_RANGE_CONFIG[this.id].burstEnergyCost
      ?? WEAPON_RANGE_CONFIG[this.id].maxEnergy!;
    this.energy = Math.min(max, this.energy + amount);
  }

  // ── 状态 ──────────────────────────────────────

  getRuntimeState(): WeaponRuntimeState {
    return {
      energy: this.energy,
      maxEnergy: this.getMaxEnergy(),
      cooldowns: this.cooldowns,
      stacks: this.stacks,
      flags: { burstActive: this.isBurstActive },
      custom: {
        burstTicksLeft: this.burstTicksLeft,
        burstCooldownTicksLeft: this.burstCooldownTicksLeft,
        isAngry: this.isAngry,
      },
    };
  }

  reset(): void {
    this.energy = 0;
    this.isBurstActive = false;
    this.burstTicksLeft = 0;
    this.lastX = null;
    this.lastY = null;
    this.trailCooldownTicks = 0;
    this.vortexCooldownTicks = 0;
    this.burstCooldownTicksLeft = 0;
    this.tickCounter = 0;
    this.isAngry = false;
    this.cooldowns = {};
    this.stacks = {};
    this.flags = {};
  }
}
