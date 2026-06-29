/**
 * 武器：画作实体化 (Drawing Manifest) — 白猫
 *
 * 常驻特性：
 * - 球体自带一只 Lv1 小兔玩偶（半径 20px，跟随球体移动）
 * - 每次球体互撞，小兔对最近对手造成 2 伤害，并积攒 1 层"灵感墨水"
 *
 * 爆发方式：
 * - 充能条件：墨水积攒 6 层（自动计数）
 * - 触发条件：充能满足时下一次互撞自动触发
 * - 爆发效果 - 肌肉兔降临：小兔巨大化为 Lv4 肌肉兔（半径 50px，持续 5 秒），
 *   移速翻倍，碰撞造成 12 伤害 + 击退。
 *   肌肉兔存在期间，球体每撞墙一次，肌肉兔向最近对手发动一次冲刺撞击（额外 8 伤害）
 *
 * 参考 HiveMotherWeapon 的跟随实体 + 投射物模式
 */

import type { IBattleState } from '../../core/types';
import type {
  IWeapon, IPhysicsQuery, WeaponEffect, WeaponRuntimeState,
} from '../../core/IWeapon';
import { TICKS_PER_SEC } from '../../core/IWeapon';
import { WEAPON_RANGE_CONFIG } from '../../config/WeaponRangeConfig';
import { WeaponId, WeaponName, WeaponEffectType, VisualEventType, School } from '../../config/GameEnums';
import type { HitReaction } from '../../shared/protocol';

/** 肌肉兔冲刺投射物 */
interface DashProjectile {
  id: string;
  targetId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  damage: number;
  alive: boolean;
  lifetime: number;
  hitRadius: number;
}

export class DrawingManifestWeapon implements IWeapon {
  static readonly ID = WeaponId.DRAWING_MANIFEST;
  readonly id = WeaponId.DRAWING_MANIFEST;
  readonly name = WeaponName.DRAWING_MANIFEST;
  readonly school = School.WILD;
  readonly difficulty = 2;
  readonly iconId = 'game-icons:rabbit';
  playerId = '';

  private energy = 0;              // 灵感墨水层数
  private tickCounter = 0;
  private isBurstActive = false;    // 肌肉兔形态
  private burstTicksLeft = 0;
  private projectiles: DashProjectile[] = [];
  private cooldowns: Record<string, number> = {};
  private stacks: Record<string, number> = {};
  private flags: Record<string, boolean> = {};

  /** 小兔跟随位置（平滑插值） */
  private rabbitX = 0;
  private rabbitY = 0;
  private rabbitInited = false;

  // ── 生命周期 ──────────────────────────────────────

  onTick(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    this.tickCounter++;
    const CFG = WEAPON_RANGE_CONFIG[this.id];
    if (!CFG) return effects;

    const selfPos = physics.getSelfPosition(this.playerId);
    if (!selfPos) return effects;

    // ── 小兔跟随球体（平滑插值） ──
    // 仅在非爆发期跟随小球；爆发期肌肉兔实体化独立
    if (!this.isBurstActive) {
      if (!this.rabbitInited) {
        this.rabbitX = selfPos.x;
        this.rabbitY = selfPos.y;
        this.rabbitInited = true;
      }
      const followLerp = 0.12;
      this.rabbitX += (selfPos.x - this.rabbitX) * followLerp;
      this.rabbitY += (selfPos.y - this.rabbitY) * followLerp;
    }

    // ── 推进冲刺投射物 ──
    const maxLifetimeTicks = (CFG.projectile?.maxLifetimeSec ?? 1.5) * TICKS_PER_SEC;
    for (const proj of this.projectiles) {
      if (!proj.alive) continue;
      proj.lifetime++;
      if (proj.lifetime > maxLifetimeTicks) {
        proj.alive = false;
        continue;
      }

      const moveAmount = proj.speed * 0.05; // 50ms per tick
      const spd = Math.sqrt(proj.vx * proj.vx + proj.vy * proj.vy) || 1;
      proj.x += (proj.vx / spd) * moveAmount;
      proj.y += (proj.vy / spd) * moveAmount;

      // 命中检测
      const target = state.getPlayer(proj.targetId);
      if (target && target.hp > 0) {
        const hitDist = Math.sqrt(
          (proj.x - target.position.x) ** 2 + (proj.y - target.position.y) ** 2,
        );
        if (hitDist < proj.hitRadius + 20) {
          proj.alive = false;
          effects.push({
            type: WeaponEffectType.DAMAGE,
            sourceId: this.playerId,
            targetId: proj.targetId,
            value: proj.damage,
            metadata: { desc: '肌肉兔冲刺撞击' },
          });
          // 冲刺命中视觉事件
          effects.push({
            type: WeaponEffectType.VISUAL_ONLY,
            sourceId: this.playerId,
            value: 0,
            position: { x: proj.x, y: proj.y },
            metadata: {
              visualType: VisualEventType.DRAWING_MANIFEST_DASH,
              targetId: proj.targetId,
              tx: proj.x,
              ty: proj.y,
              isHit: true,
            },
          });
          continue;
        }
      }

      // 超出竞技场边界销毁
      const center = physics.getArenaCenter();
      const arenaR = physics.getArenaRadius();
      const distFromCenter = Math.sqrt(
        (proj.x - center.x) ** 2 + (proj.y - center.y) ** 2,
      );
      if (distFromCenter > arenaR + 80) {
        proj.alive = false;
      }
    }
    this.projectiles = this.projectiles.filter(p => p.alive);

    // ── 爆发倒计时 ──
    if (this.isBurstActive) {
      this.burstTicksLeft--;
      if (this.burstTicksLeft <= 0) {
        this.isBurstActive = false;
        // 肌肉兔消失，发送墨水归零同步
        effects.push({
          type: WeaponEffectType.VISUAL_ONLY,
          sourceId: this.playerId,
          value: 0,
          position: { x: this.rabbitX, y: this.rabbitY },
          metadata: {
            visualType: VisualEventType.DRAWING_MANIFEST_INK,
            inkStacks: this.energy,
            isMuscleRabbit: false,
            rabbitX: this.rabbitX,
            rabbitY: this.rabbitY,
          },
        });
      }
    }

    // ── 周期性发送小兔/肌肉兔位置同步（每 5 tick ≈ 83ms 一次） ──
    // 让前端始终能看到小兔/肌肉兔跟随球体（即使未碰撞也保持可见）
    // inkStacks 用于同步墨水层数，isMuscleRabbit 标识当前是否处于爆发形态
    if (this.tickCounter % 5 === 0) {
      effects.push({
        type: WeaponEffectType.VISUAL_ONLY,
        sourceId: this.playerId,
        value: 0,
        position: { x: this.rabbitX, y: this.rabbitY },
        metadata: {
          visualType: VisualEventType.DRAWING_MANIFEST_INK,
          inkStacks: this.energy,
          isMuscleRabbit: this.isBurstActive,
          rabbitX: this.rabbitX,
          rabbitY: this.rabbitY,
        },
      });
    }

    return effects;
  }

  onHitTarget(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const CFG = WEAPON_RANGE_CONFIG[this.id];
    if (!CFG) return effects;

    const opponents = physics.getAllAliveOpponents(this.playerId);
    if (opponents.length === 0) return effects;

    // 找最近对手
    let nearest = opponents[0];
    let nearestDist = Infinity;
    for (const opp of opponents) {
      const d = Math.sqrt(
        (opp.x - this.rabbitX) ** 2 + (opp.y - this.rabbitY) ** 2,
      );
      if (d < nearestDist) {
        nearestDist = d;
        nearest = opp;
      }
    }

    const damage = this.isBurstActive ? (CFG.burstDamage ?? 12) : (CFG.damage ?? 2);

    effects.push({
      type: WeaponEffectType.DAMAGE,
      sourceId: this.playerId,
      targetId: nearest.id,
      value: damage,
      metadata: { desc: this.isBurstActive ? '肌肉兔碰撞' : '小兔玩偶碰撞' },
    });

    // 积攒灵感墨水（非爆发期间）
    if (!this.isBurstActive) {
      this.energy = Math.min(CFG.maxEnergy ?? 6, this.energy + 1);
    }

    // 发送墨水层数同步（含小兔位置）
    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: this.rabbitX, y: this.rabbitY },
      metadata: {
        visualType: VisualEventType.DRAWING_MANIFEST_INK,
        inkStacks: this.energy,
        isMuscleRabbit: this.isBurstActive,
        rabbitX: this.rabbitX,
        rabbitY: this.rabbitY,
      },
    });

    return effects;
  }

  getHitReaction(): HitReaction {
    return 'slash';
  }

  onHitByAttacker(_attackerId: string, _state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    return [];
  }

  /** 撞墙时：肌肉兔形态下向最近对手发动冲刺 */
  onWallHit(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    if (!this.isBurstActive) return effects;

    const CFG = WEAPON_RANGE_CONFIG[this.id];
    if (!CFG) return effects;

    const opponents = physics.getAllAliveOpponents(this.playerId);
    if (opponents.length === 0) return effects;

    let nearest = opponents[0];
    let nearestDist = Infinity;
    for (const opp of opponents) {
      const d = Math.sqrt(
        (opp.x - this.rabbitX) ** 2 + (opp.y - this.rabbitY) ** 2,
      );
      if (d < nearestDist) {
        nearestDist = d;
        nearest = opp;
      }
    }

    const dashDamage = 8;
    const dashSpeed = CFG.projectile?.speed ?? 200;
    const dx = nearest.x - this.rabbitX;
    const dy = nearest.y - this.rabbitY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

    this.projectiles.push({
      id: `dash_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      targetId: nearest.id,
      x: this.rabbitX,
      y: this.rabbitY,
      vx: (dx / dist) * dashSpeed,
      vy: (dy / dist) * dashSpeed,
      speed: dashSpeed,
      damage: dashDamage,
      alive: true,
      lifetime: 0,
      hitRadius: CFG.projectile?.hitRadius ?? 20,
    });

    // 冲刺发射视觉事件
    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: this.rabbitX, y: this.rabbitY },
      metadata: {
        visualType: VisualEventType.DRAWING_MANIFEST_DASH,
        targetId: nearest.id,
        tx: nearest.x,
        ty: nearest.y,
        isHit: false,
      },
    });

    return effects;
  }

  // ── 能量爆发 ──────────────────────────────────────

  getEnergy(): number {
    const max = WEAPON_RANGE_CONFIG[this.id]?.maxEnergy ?? 6;
    return Math.round(this.energy / max * 100);
  }
  getMaxEnergy(): number {
    return 100;
  }
  setEnergy(percent: number): void {
    const max = WEAPON_RANGE_CONFIG[this.id]?.maxEnergy ?? 6;
    this.energy = Math.max(0, Math.min(max, percent / 100 * max));
  }

  isBurstReady(): boolean {
    const CFG = WEAPON_RANGE_CONFIG[this.id];
    return this.energy >= (CFG?.maxEnergy ?? 6) && !this.isBurstActive;
  }

  burst(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const CFG = WEAPON_RANGE_CONFIG[this.id];
    this.energy = 0;
    this.isBurstActive = true;
    this.burstTicksLeft = (CFG?.burstDurationSec ?? 5) * TICKS_PER_SEC;

    return [{
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: this.rabbitX, y: this.rabbitY },
      metadata: {
        visualType: VisualEventType.DRAWING_MANIFEST_BURST,
        desc: '肌肉兔降临',
        isBurst: true,
        rabbitX: this.rabbitX,
        rabbitY: this.rabbitY,
        radius: CFG?.aoeMaxRadius ?? 50,
        durationSec: CFG?.burstDurationSec ?? 5,
      },
    }];
  }

  // ── 状态 ──────────────────────────────────────────

  getRuntimeState(): WeaponRuntimeState {
    return {
      energy: this.energy,
      maxEnergy: WEAPON_RANGE_CONFIG[this.id]?.maxEnergy ?? 6,
      cooldowns: this.cooldowns,
      stacks: this.stacks,
      flags: this.flags,
      custom: {
        isMuscleRabbit: this.isBurstActive,
        burstTicksLeft: this.burstTicksLeft,
        rabbitX: this.rabbitX,
        rabbitY: this.rabbitY,
        projectiles: this.projectiles.length,
      },
    };
  }

  reset(): void {
    this.energy = 0;
    this.tickCounter = 0;
    this.isBurstActive = false;
    this.burstTicksLeft = 0;
    this.projectiles = [];
    this.cooldowns = {};
    this.stacks = {};
    this.flags = {};
    this.rabbitX = 0;
    this.rabbitY = 0;
    this.rabbitInited = false;
  }
}
