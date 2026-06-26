/**
 * 武器：预知透镜 (Precognitive Lens) — 风随
 *
 * 常驻特性：
 * - 被动A（层数）：每次球体碰撞墙壁，获得 1 层"先见"（上限 6 层）。
 *   每层：移速 +3%（6层 +18%），下一次碰撞伤害 +1（6层 +6）
 * - 被动B（回响）：层数 ≥3 时，下一次撞墙自动消耗 3 层，在撞墙位置生成
 *   猫灵回响——沿反射方向直线飞出（500 px/s，持续 2 秒），穿透所有对手，
 *   每个命中造成 8 伤害，施加"猎物标记"（持续 4 秒，自身对该对手下一次碰撞伤害 +50%）。
 *   场上最多 2 只回响。
 *
 * 爆发方式：
 * - 充能条件：先见层数叠满 6 层（自动检测）
 * - 触发条件：充能满足时自动触发
 * - 爆发效果 - 无限洞察：持续 4 秒。移速 +15%。每次撞墙必定生成回响
 *   （不消耗层数，上限提至 3 只），回响伤害 14 点，获得轻微追踪能力。
 *   先见层数锁定 6 层不变，结束后清零。
 *
 * 参考 HiveMotherWeapon 的投射物飞行模式
 */

import type { IBattleState } from '../../core/types';
import type {
  IWeapon, IPhysicsQuery, WeaponEffect, WeaponRuntimeState,
} from '../../core/IWeapon';
import { TICKS_PER_SEC } from '../../core/IWeapon';
import { WEAPON_RANGE_CONFIG } from '../../config/WeaponRangeConfig';
import { WeaponId, WeaponName, WeaponEffectType, VisualEventType, School } from '../../config/GameEnums';

/** 猫灵回响投射物 */
interface EchoProjectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  damage: number;
  alive: boolean;
  lifetime: number;
  hitRadius: number;
  /** 已命中的玩家（穿透模式，每个对手只生效1次） */
  hitPlayers: Set<string>;
  /** 是否有追踪能力（爆发期间） */
  tracking: boolean;
}

export class PrecognitiveLensWeapon implements IWeapon {
  static readonly ID = WeaponId.PRECOGNITIVE_LENS;
  readonly id = WeaponId.PRECOGNITIVE_LENS;
  readonly name = WeaponName.PRECOGNITIVE_LENS;
  readonly school = School.WILD;
  readonly difficulty = 3;
  readonly iconId = 'game-icons:eye';
  playerId = '';

  private foresightStacks = 0;     // 先见层数
  private tickCounter = 0;
  private isBurstActive = false;
  private burstTicksLeft = 0;
  private projectiles: EchoProjectile[] = [];
  private cooldowns: Record<string, number> = {};
  private stacks: Record<string, number> = {};
  private flags: Record<string, boolean> = {};
  /** 猎物标记：targetId → 剩余 tick */
  private marks: Record<string, number> = {};

  // ── 生命周期 ──────────────────────────────────────

  onTick(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    this.tickCounter++;
    const CFG = WEAPON_RANGE_CONFIG[this.id];
    if (!CFG) return effects;

    const selfPos = physics.getSelfPosition(this.playerId);
    if (!selfPos) return effects;

    // ── 推进猫灵回响投射物 ──
    const maxLifetimeTicks = (CFG.projectile?.maxLifetimeSec ?? 2) * TICKS_PER_SEC;
    const maxEchoCount = this.isBurstActive
      ? 3
      : (CFG.field?.maxCount ?? 2);

    // 限制场上回响数量
    if (this.projectiles.length > maxEchoCount) {
      // 移除最早生成的
      this.projectiles[0].alive = false;
    }

    for (const proj of this.projectiles) {
      if (!proj.alive) continue;
      proj.lifetime++;
      if (proj.lifetime > maxLifetimeTicks) {
        proj.alive = false;
        continue;
      }

      // 追踪能力（爆发期间）：轻微向最近对手偏转
      if (proj.tracking) {
        const opponents = physics.getAllAliveOpponents(this.playerId);
        let nearest: { x: number; y: number; id: string } | null = null;
        let nearestDist = Infinity;
        for (const opp of opponents) {
          if (proj.hitPlayers.has(opp.id)) continue;
          const d = Math.sqrt((opp.x - proj.x) ** 2 + (opp.y - proj.y) ** 2);
          if (d < nearestDist && d < 200) {
            nearestDist = d;
            nearest = opp;
          }
        }
        if (nearest) {
          const tdx = nearest.x - proj.x;
          const tdy = nearest.y - proj.y;
          const tdist = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
          // 轻微偏转（20% 向目标方向）
          const targetVx = (tdx / tdist) * proj.speed;
          const targetVy = (tdy / tdist) * proj.speed;
          proj.vx = proj.vx * 0.8 + targetVx * 0.2;
          proj.vy = proj.vy * 0.8 + targetVy * 0.2;
        }
      }

      // 移动
      const moveAmount = proj.speed * 0.05;
      const spd = Math.sqrt(proj.vx * proj.vx + proj.vy * proj.vy) || 1;
      proj.x += (proj.vx / spd) * moveAmount;
      proj.y += (proj.vy / spd) * moveAmount;

      // 穿透命中检测
      const opponents = physics.getAllAliveOpponents(this.playerId);
      for (const opp of opponents) {
        if (proj.hitPlayers.has(opp.id)) continue;
        const hitDist = Math.sqrt(
          (proj.x - opp.x) ** 2 + (proj.y - opp.y) ** 2,
        );
        if (hitDist < proj.hitRadius + 20) {
          proj.hitPlayers.add(opp.id);
          effects.push({
            type: WeaponEffectType.DAMAGE,
            sourceId: this.playerId,
            targetId: opp.id,
            value: proj.damage,
            metadata: { desc: '猫灵回响穿透' },
          });
          // 施加猎物标记
          const markDuration = (CFG.field?.durationSec ?? 4) * TICKS_PER_SEC;
          this.marks[opp.id] = markDuration;
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

    // ── 猎物标记倒计时 ──
    for (const targetId of Object.keys(this.marks)) {
      this.marks[targetId]--;
      if (this.marks[targetId] <= 0) {
        delete this.marks[targetId];
      }
    }

    // ── 爆发倒计时 ──
    if (this.isBurstActive) {
      this.burstTicksLeft--;
      if (this.burstTicksLeft <= 0) {
        this.isBurstActive = false;
        this.foresightStacks = 0; // 爆发结束后清零
        // 发送层数同步
        effects.push({
          type: WeaponEffectType.VISUAL_ONLY,
          sourceId: this.playerId,
          value: 0,
          position: selfPos,
          metadata: {
            visualType: VisualEventType.PRECOGNITIVE_LENS_FORESIGHT,
            foresightStacks: 0,
            isBurst: false,
          },
        });
      }
    }

    return effects;
  }

  onHitTarget(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const CFG = WEAPON_RANGE_CONFIG[this.id];
    if (!CFG) return effects;

    // 找最近对手
    const opponents = physics.getAllAliveOpponents(this.playerId);
    if (opponents.length === 0) return effects;

    let nearest = opponents[0];
    let nearestDist = Infinity;
    const selfPos = physics.getSelfPosition(this.playerId);
    if (!selfPos) return effects;
    for (const opp of opponents) {
      const d = Math.sqrt((opp.x - selfPos.x) ** 2 + (opp.y - selfPos.y) ** 2);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = opp;
      }
    }

    // 基础碰撞伤害 + 先见层数加成
    const baseDamage = 3;
    const stackBonus = this.foresightStacks * (CFG.damage ?? 1);
    let damage = baseDamage + stackBonus;

    // 猎物标记伤害加成
    if (this.marks[nearest.id] !== undefined) {
      damage = Math.round(damage * (1 + (CFG.field?.damageModifier ?? 0.5)));
    }

    effects.push({
      type: WeaponEffectType.DAMAGE,
      sourceId: this.playerId,
      targetId: nearest.id,
      value: damage,
      metadata: { desc: `预知透镜碰撞 (+${stackBonus}先见)` },
    });

    return effects;
  }

  onHitByAttacker(_attackerId: string, _state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    return [];
  }

  /** 撞墙时：获得先见层数 + 生成猫灵回响 */
  onWallHit(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const CFG = WEAPON_RANGE_CONFIG[this.id];
    if (!CFG) return effects;

    const selfPos = physics.getSelfPosition(this.playerId);
    if (!selfPos) return effects;

    // 爆发期间层数锁定 6 层，不增不减
    if (!this.isBurstActive) {
      this.foresightStacks = Math.min(CFG.maxEnergy ?? 6, this.foresightStacks + 1);
    }

    // 发送层数同步
    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: selfPos,
      metadata: {
        visualType: VisualEventType.PRECOGNITIVE_LENS_FORESIGHT,
        foresightStacks: this.foresightStacks,
        isBurst: this.isBurstActive,
      },
    });

    // 生成猫灵回响的条件
    const shouldSpawnEcho = this.isBurstActive
      ? true // 爆发期间每次撞墙必生成
      : this.foresightStacks >= 3;

    if (shouldSpawnEcho) {
      // 非爆发时消耗 3 层
      if (!this.isBurstActive) {
        this.foresightStacks = Math.max(0, this.foresightStacks - 3);
        // 再次同步层数
        effects.push({
          type: WeaponEffectType.VISUAL_ONLY,
          sourceId: this.playerId,
          value: 0,
          position: selfPos,
          metadata: {
            visualType: VisualEventType.PRECOGNITIVE_LENS_FORESIGHT,
            foresightStacks: this.foresightStacks,
            isBurst: false,
          },
        });
      }

      // 计算反射方向（从圆心指向球体的方向，即向外）
      const center = physics.getArenaCenter();
      const dx = selfPos.x - center.x;
      const dy = selfPos.y - center.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const dirX = dx / dist;
      const dirY = dy / dist;

      const echoSpeed = CFG.projectile?.speed ?? 500;
      const echoDamage = this.isBurstActive ? (CFG.burstDamage ?? 14) : 8;

      const echoId = `echo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      this.projectiles.push({
        id: echoId,
        x: selfPos.x,
        y: selfPos.y,
        vx: dirX * echoSpeed,
        vy: dirY * echoSpeed,
        speed: echoSpeed,
        damage: echoDamage,
        alive: true,
        lifetime: 0,
        hitRadius: CFG.projectile?.hitRadius ?? 30,
        hitPlayers: new Set(),
        tracking: this.isBurstActive,
      });

      // 回响生成视觉事件
      effects.push({
        type: WeaponEffectType.VISUAL_ONLY,
        sourceId: this.playerId,
        value: 0,
        position: { x: selfPos.x, y: selfPos.y },
        metadata: {
          visualType: VisualEventType.PRECOGNITIVE_LENS_ECHO,
          echoId,
          tx: selfPos.x + dirX * 100,
          ty: selfPos.y + dirY * 100,
          isBurst: this.isBurstActive,
          damage: echoDamage,
        },
      });
    }

    return effects;
  }

  // ── 能量爆发 ──────────────────────────────────────

  getEnergy(): number { return this.foresightStacks; }
  getMaxEnergy(): number {
    const CFG = WEAPON_RANGE_CONFIG[this.id];
    return CFG?.maxEnergy ?? 6;
  }

  isBurstReady(): boolean {
    const CFG = WEAPON_RANGE_CONFIG[this.id];
    return this.foresightStacks >= (CFG?.maxEnergy ?? 6) && !this.isBurstActive;
  }

  burst(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const CFG = WEAPON_RANGE_CONFIG[this.id];
    this.isBurstActive = true;
    // 层数锁定 6 层
    this.foresightStacks = CFG?.maxEnergy ?? 6;
    this.burstTicksLeft = (CFG?.burstDurationSec ?? 4) * TICKS_PER_SEC;

    return [{
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      metadata: {
        visualType: VisualEventType.PRECOGNITIVE_LENS_BURST,
        desc: '无限洞察',
        isBurst: true,
        durationSec: CFG?.burstDurationSec ?? 4,
      },
    }];
  }

  // ── 状态 ──────────────────────────────────────────

  getRuntimeState(): WeaponRuntimeState {
    return {
      energy: this.foresightStacks,
      maxEnergy: WEAPON_RANGE_CONFIG[this.id]?.maxEnergy ?? 6,
      cooldowns: this.cooldowns,
      stacks: this.stacks,
      flags: this.flags,
      custom: {
        isBurstActive: this.isBurstActive,
        burstTicksLeft: this.burstTicksLeft,
        activeEchoes: this.projectiles.length,
        markedTargets: Object.keys(this.marks).length,
      },
    };
  }

  reset(): void {
    this.foresightStacks = 0;
    this.tickCounter = 0;
    this.isBurstActive = false;
    this.burstTicksLeft = 0;
    this.projectiles = [];
    this.cooldowns = {};
    this.stacks = {};
    this.flags = {};
    this.marks = {};
  }
}
