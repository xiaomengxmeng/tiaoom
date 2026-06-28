/**
 * 武器：情绪天气 (Emotional Weather) — Carzeye
 *
 * 常驻特性：
 * - 每次球体互撞，碰撞点 2 秒后自动降下一道落雷（半径 40px 圆形判定），
 *   对范围内对手造成 6 伤害 + 0.3 秒硬直
 * - 落雷内置 CD 1.5 秒
 * - 落雷颜色随对局时间变化：前 30 秒晴空蓝 → 30-60 秒橙色 → 60 秒后暗紫
 *
 * 爆发方式：
 * - 充能条件：落雷累计命中 5 次（自动计数）
 * - 触发条件：充能满足时自动触发
 * - 爆发效果 - 极端气候：自身周围 200px 内持续降下冰雹
 *   （持续 4 秒，每 0.5 秒一次，半径 30px），每颗造成 4 伤害 + 移速 -20%（持续 1 秒）。
 *   全屏暴风雪滤镜。
 *
 * 延迟触发模式：在 onTick 中维护 pendingLightnings 队列
 */

import type { IBattleState } from '../../core/types';
import type {
  IWeapon, IPhysicsQuery, WeaponEffect, WeaponRuntimeState,
} from '../../core/IWeapon';
import { TICKS_PER_SEC } from '../../core/IWeapon';
import { WEAPON_RANGE_CONFIG } from '../../config/WeaponRangeConfig';
import { WeaponId, WeaponName, WeaponEffectType, VisualEventType, School } from '../../config/GameEnums';
import type { HitReaction } from '../../shared/protocol';

/** 待执行的延迟落雷 */
interface PendingLightning {
  x: number;
  y: number;
  triggerTick: number;
}

export class EmotionalWeatherWeapon implements IWeapon {
  static readonly ID = WeaponId.EMOTIONAL_WEATHER;
  readonly id = WeaponId.EMOTIONAL_WEATHER;
  readonly name = WeaponName.EMOTIONAL_WEATHER;
  readonly school = School.WILD;
  readonly difficulty = 2;
  readonly iconId = 'game-icons:lightning-storm';
  playerId = '';

  private energy = 0;
  private tickCounter = 0;
  private isBurstActive = false;
  private burstTicksLeft = 0;
  private cooldowns: Record<string, number> = {};
  private stacks: Record<string, number> = {};
  private flags: Record<string, boolean> = {};

  private pendingLightnings: PendingLightning[] = [];
  private hailTimer = 0;

  onTick(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    this.tickCounter++;
    const CFG = WEAPON_RANGE_CONFIG[this.id];
    if (!CFG) return effects;

    const selfPos = physics.getSelfPosition(this.playerId);
    if (!selfPos) return effects;

    // 处理延迟落雷
    const remaining: PendingLightning[] = [];
    for (const p of this.pendingLightnings) {
      if (this.tickCounter >= p.triggerTick) {
        effects.push(...this.executeLightning(p.x, p.y, state, physics, CFG));
      } else {
        remaining.push(p);
      }
    }
    this.pendingLightnings = remaining;

    // 爆发期间持续冰雹
    if (this.isBurstActive) {
      this.hailTimer++;
      if (this.hailTimer >= 0.5 * TICKS_PER_SEC) {
        this.hailTimer = 0;
        effects.push(...this.executeHail(selfPos.x, selfPos.y, state, physics, CFG));
      }
      this.burstTicksLeft--;
      if (this.burstTicksLeft <= 0) this.isBurstActive = false;
    }

    // ── 周期性发送天气状态同步（每 5 tick ≈ 83ms 一次） ──
    // 让前端始终能看到天气效果（云层/颜色阶段跟随对局时间）
    // hitCount=0 标识为状态同步，前端不应绘制实际落雷特效
    if (this.tickCounter % 5 === 0) {
      const elapsedSec = this.tickCounter / TICKS_PER_SEC;
      let weatherPhase = 0;
      let color = 0x4DA6FF;
      if (elapsedSec > 60) { weatherPhase = 2; color = 0x6600CC; }
      else if (elapsedSec > 30) { weatherPhase = 1; color = 0xFF8800; }

      effects.push({
        type: WeaponEffectType.VISUAL_ONLY,
        sourceId: this.playerId,
        value: 0,
        position: { x: selfPos.x, y: selfPos.y },
        metadata: {
          visualType: VisualEventType.EMOTIONAL_WEATHER_LIGHTNING,
          isBurst: this.isBurstActive,
          weatherPhase,
          color,
          hitCount: 0,
        },
      });
    }

    // ── 爆发期间持续发送暴风雪状态（每 5 tick ≈ 83ms 一次） ──
    // 让前端在爆发持续期间持续看到全屏暴风雪滤镜（不仅限于 burst() 启动时一次）
    if (this.isBurstActive && this.tickCounter % 5 === 0) {
      effects.push({
        type: WeaponEffectType.VISUAL_ONLY,
        sourceId: this.playerId,
        value: 0,
        position: { x: selfPos.x, y: selfPos.y },
        metadata: {
          visualType: VisualEventType.EMOTIONAL_WEATHER_BURST,
          isBurst: true,
          radius: CFG.aoeMaxRadius ?? 200,
          burstTicksLeft: this.burstTicksLeft,
        },
      });
    }

    return effects;
  }

  onHitTarget(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const CFG = WEAPON_RANGE_CONFIG[this.id];
    if (!CFG) return [];
    const selfPos = _physics.getSelfPosition(this.playerId);
    if (!selfPos) return [];

    // 延迟 2 秒降下落雷
    this.pendingLightnings.push({
      x: selfPos.x, y: selfPos.y,
      triggerTick: this.tickCounter + 2 * TICKS_PER_SEC,
    });
    return [];
  }

  getHitReaction(): HitReaction {
    return 'burn';
  }

  onHitByAttacker(_attackerId: string, _state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    return [];
  }

  private executeLightning(
    x: number, y: number,
    _state: IBattleState, physics: IPhysicsQuery,
    CFG: any,
  ): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const damage = CFG.damage ?? 6;
    const radius = CFG.damageRadius ?? 40;

    // 颜色阶段
    const elapsedSec = this.tickCounter / TICKS_PER_SEC;
    let weatherPhase = 0;
    let color = 0x4DA6FF;
    if (elapsedSec > 60) { weatherPhase = 2; color = 0x6600CC; }
    else if (elapsedSec > 30) { weatherPhase = 1; color = 0xFF8800; }

    const opponents = physics.getAliveOpponentsInRadius(this.playerId, x, y, radius);
    let hitCount = 0;
    for (const opp of opponents) {
      effects.push({
        type: WeaponEffectType.DAMAGE,
        sourceId: this.playerId, targetId: opp.id,
        value: damage, duration: 0.3,
        metadata: { desc: '情绪天气·落雷' },
      });
      hitCount++;
    }

    if (hitCount > 0 && !this.isBurstActive) {
      this.energy = Math.min(CFG.maxEnergy ?? 5, this.energy + hitCount);
    }

    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId, value: 0,
      position: { x, y },
      metadata: {
        visualType: VisualEventType.EMOTIONAL_WEATHER_LIGHTNING,
        radius, weatherPhase, color, hitCount,
      },
    });
    return effects;
  }

  private executeHail(
    cx: number, cy: number,
    _state: IBattleState, physics: IPhysicsQuery,
    CFG: any,
  ): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const damage = CFG.burstDamage ?? 4;
    const range = CFG.aoeMaxRadius ?? 200;
    const hailRadius = CFG.field?.radius ?? 30;

    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * range;
    const hx = cx + Math.cos(angle) * dist;
    const hy = cy + Math.sin(angle) * dist;

    const opponents = physics.getAliveOpponentsInRadius(this.playerId, hx, hy, hailRadius);
    for (const opp of opponents) {
      effects.push({
        type: WeaponEffectType.DAMAGE,
        sourceId: this.playerId, targetId: opp.id,
        value: damage, duration: 1,
        metadata: { desc: '情绪天气·冰雹' },
      });
      effects.push({
        type: WeaponEffectType.SLOW,
        sourceId: this.playerId, targetId: opp.id,
        value: CFG.field?.slowPercent ?? 20, duration: 1,
        metadata: { desc: '冰雹减速' },
      });
    }

    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId, value: 0,
      position: { x: hx, y: hy },
      metadata: {
        visualType: VisualEventType.EMOTIONAL_WEATHER_HAIL,
        radius: hailRadius, isBurst: true,
      },
    });
    return effects;
  }

  getEnergy(): number {
    const max = WEAPON_RANGE_CONFIG[this.id]?.maxEnergy ?? 5;
    return Math.round(this.energy / max * 100);
  }
  getMaxEnergy(): number {
    return 100;
  }
  setEnergy(percent: number): void {
    const max = WEAPON_RANGE_CONFIG[this.id]?.maxEnergy ?? 5;
    this.energy = Math.max(0, Math.min(max, percent / 100 * max));
  }

  isBurstReady(): boolean {
    const CFG = WEAPON_RANGE_CONFIG[this.id];
    return this.energy >= (CFG?.maxEnergy ?? 5) && !this.isBurstActive;
  }

  burst(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const CFG = WEAPON_RANGE_CONFIG[this.id];
    this.energy = 0;
    this.isBurstActive = true;
    this.burstTicksLeft = (CFG?.burstDurationSec ?? 4) * TICKS_PER_SEC;
    this.hailTimer = 0;

    return [{
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId, value: 0,
      metadata: {
        visualType: VisualEventType.EMOTIONAL_WEATHER_BURST,
        desc: '极端气候', isBurst: true,
        radius: CFG?.aoeMaxRadius ?? 200,
        durationSec: CFG?.burstDurationSec ?? 4,
      },
    }];
  }

  getRuntimeState(): WeaponRuntimeState {
    return {
      energy: this.energy,
      maxEnergy: WEAPON_RANGE_CONFIG[this.id]?.maxEnergy ?? 5,
      cooldowns: this.cooldowns, stacks: this.stacks, flags: this.flags,
      custom: {
        isBurstActive: this.isBurstActive,
        burstTicksLeft: this.burstTicksLeft,
        pendingLightnings: this.pendingLightnings.length,
      },
    };
  }

  reset(): void {
    this.energy = 0; this.tickCounter = 0;
    this.isBurstActive = false; this.burstTicksLeft = 0;
    this.pendingLightnings = []; this.hailTimer = 0;
    this.cooldowns = {}; this.stacks = {}; this.flags = {};
  }
}
