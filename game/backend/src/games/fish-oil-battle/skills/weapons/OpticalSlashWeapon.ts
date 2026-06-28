/**
 * 武器：光学斩击 (Optical Slash) - Liya
 *
 * 每次碰撞沿碰撞法线（指向最近对手）方向生成一道笔直斩击（长100px），无视墙壁。
 * 立即检测路径上所有对手并造成5点穿透伤害（8.6°锥角，单道斩击每个对手只生效1次）。
 * 斩击残留0.8s，期间碰到路径的对手也会受伤。
 * 每命中1个对手，自身移速+5%（持续2秒，上限20%）。
 *
 * 爆发 - 无限剑制：累计命中6次后，下一次碰撞触发6道扇形斩击（每60°一道，长150px），
 * 每道伤害提升至10点。
 */

import type { IBattleState } from '../../core/types';
import type {
  IWeapon, IPhysicsQuery, WeaponEffect, WeaponRuntimeState,
} from '../../core/IWeapon';
import { WEAPON_RANGE_CONFIG } from '../../config/WeaponRangeConfig';
import { WeaponId, WeaponName, WeaponEffectType, VisualEventType, School } from '../../config/GameEnums';

// ─── 斩击 ───────────────────────────────────────────────
interface Slash {
  id: string;
  originX: number;
  originY: number;
  angle: number;
  length: number;
  width: number;
  hitPlayers: Set<string>;
  isFinished: boolean;
  lifetime: number;
}

export class OpticalSlashWeapon implements IWeapon {
  static readonly ID = WeaponId.OPTICAL_SLASH;
  readonly id = WeaponId.OPTICAL_SLASH;
  readonly name = WeaponName.OPTICAL_SLASH;
  readonly school = School.AGGRESSOR;
  readonly difficulty = 2;
  readonly iconId = 'game-icons:sword-cut';
  playerId = '';

  private energy = 0;
  private hitCount = 0;
  private speedBuff = 0;
  private speedBuffTimer = 0;
  private activeSlashes: Slash[] = [];
  private burstReady = false;

  // ── 每 tick ───────────────────────────────────────────

  onTick(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const CFG = WEAPON_RANGE_CONFIG[this.id];

    // 移速加成衰减
    if (this.speedBuff > 0) {
      this.speedBuffTimer -= 1 / 20; // 每 tick ~0.05s
      if (this.speedBuffTimer <= 0) {
        this.speedBuff = Math.max(0, this.speedBuff - 5);
        if (this.speedBuff > 0) this.speedBuffTimer = 2;
      }
    }

    // 更新活跃斩击的命中检测
    this.activeSlashes = this.activeSlashes.filter(slash => {
      if (slash.isFinished) return false;

      slash.lifetime += 1 / 20;
      if (slash.lifetime >= 0.8) {
        slash.isFinished = true;
        return false;
      }

      // 检测路径上的对手
      const opponents = physics.getAllAliveOpponents(this.playerId);
      for (const opp of opponents) {
        if (slash.hitPlayers.has(opp.id)) continue;

        const dx = opp.x - slash.originX;
        const dy = opp.y - slash.originY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angleToOpp = Math.atan2(dy, dx);
        let angleDiff = angleToOpp - slash.angle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        const slashTolerance = CFG.projectile?.slashAngleTolerance ?? 0.1;
        if (dist <= slash.length && Math.abs(angleDiff) < slashTolerance) {
          slash.hitPlayers.add(opp.id);
          this.hitCount++;
          this.energy = Math.min(this.hitCount, CFG.maxEnergy!);

          // 移速加成（上限20%）
          if (this.speedBuff < 20) {
            this.speedBuff += 5;
            this.speedBuffTimer = 2;
          }

          effects.push({
            type: WeaponEffectType.DAMAGE,
            sourceId: this.playerId,
            targetId: opp.id,
            value: CFG.damage!,
            metadata: {
              desc: '光学斩击伤害',
              visualType: VisualEventType.OPTICAL_SLASH_TRIGGER,
            },
          });
        }
      }

      return !slash.isFinished;
    });

    return effects;
  }

  // ── 碰撞对手时：生成斩击并立即判定伤害 ────────────

  onHitTarget(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const self = state.getPlayer(this.playerId);
    if (!self) return [];

    const effects: WeaponEffect[] = [];
    const CFG = WEAPON_RANGE_CONFIG[this.id];

    // 碰撞法线方向 = 指向最近对手（而非反弹后的速度方向）
    const opponents = physics.getAllAliveOpponents(this.playerId);
    let closestOpp: { x: number; y: number } | null = null;
    let closestDist = Infinity;
    for (const opp of opponents) {
      const dx = opp.x - self.position.x;
      const dy = opp.y - self.position.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < closestDist) {
        closestDist = d;
        closestOpp = opp;
      }
    }

    let angle: number;
    if (closestOpp) {
      angle = Math.atan2(closestOpp.y - self.position.y, closestOpp.x - self.position.x);
    } else {
      const vx = (self as any).vx ?? 0;
      const vy = (self as any).vy ?? 0;
      angle = vx === 0 && vy === 0 ? Math.random() * Math.PI * 2 : Math.atan2(vy, vx);
    }

    // 生成斩击
    const slash: Slash = {
      id: `slash_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      originX: self.position.x,
      originY: self.position.y,
      angle,
      length: CFG.damageRadius!,
      width: CFG.projectile!.hitRadius,
      hitPlayers: new Set(),
      isFinished: false,
      lifetime: 0,
    };

    // ── 立即检测路径上的对手（不等 tick） ──
    const immediateTolerance = CFG.projectile?.slashAngleTolerance ?? 0.1;
    for (const opp of opponents) {
      const dx = opp.x - slash.originX;
      const dy = opp.y - slash.originY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angleToOpp = Math.atan2(dy, dx);
      let angleDiff = angleToOpp - slash.angle;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      if (dist <= slash.length && Math.abs(angleDiff) < immediateTolerance) {
        slash.hitPlayers.add(opp.id);
        this.hitCount++;
        this.energy = Math.min(this.hitCount, CFG.maxEnergy!);

        // 移速加成（上限20%）
        if (this.speedBuff < 20) {
          this.speedBuff += 5;
          this.speedBuffTimer = 2;
        }

        effects.push({
          type: WeaponEffectType.DAMAGE,
          sourceId: this.playerId,
          targetId: opp.id,
          value: CFG.damage!,
          metadata: {
            desc: '光学斩击伤害',
            visualType: VisualEventType.OPTICAL_SLASH_TRIGGER,
          },
        });
      }
    }

    this.activeSlashes.push(slash);

    // 发送视觉事件
    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: self.position.x, y: self.position.y },
      metadata: {
        visualType: VisualEventType.OPTICAL_SLASH_TRIGGER,
        angle,
        length: slash.length,
        isBurst: false,
      },
    });

    // 检查爆发
    if (this.energy >= CFG.maxEnergy!) {
      this.burstReady = true;
    }

    return effects;
  }

  onHitByAttacker(_attackerId: string, _state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    return [];
  }

  // ── 能量 / 爆发 ──────────────────────────────────────

  getEnergy(): number {
    return Math.round(this.energy / WEAPON_RANGE_CONFIG[this.id].maxEnergy! * 100);
  }
  getMaxEnergy(): number {
    return 100;
  }
  setEnergy(percent: number): void {
    const max = WEAPON_RANGE_CONFIG[this.id].maxEnergy!;
    this.energy = Math.max(0, Math.min(max, percent / 100 * max));
  }

  isBurstReady(): boolean { return this.burstReady; }

  burst(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    if (!this.burstReady) return [];

    const self = state.getPlayer(this.playerId);
    if (!self) return [];

    const effects: WeaponEffect[] = [];
    const CFG = WEAPON_RANGE_CONFIG[this.id];

    // 6道扇形斩击
    const burstSlashes: Slash[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      burstSlashes.push({
        id: `burst_${i}_${Date.now()}`,
        originX: self.position.x,
        originY: self.position.y,
        angle,
        length: CFG.visualRadius!,
        width: CFG.projectile!.hitRadius * 2,
        hitPlayers: new Set(),
        isFinished: false,
        lifetime: 0,
      });
    }

    // 检测命中
    const opponents = physics.getAllAliveOpponents(this.playerId);
    for (const slash of burstSlashes) {
      for (const opp of opponents) {
        if (slash.hitPlayers.has(opp.id)) continue;

        const dx = opp.x - slash.originX;
        const dy = opp.y - slash.originY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angleToOpp = Math.atan2(dy, dx);
        let angleDiff = angleToOpp - slash.angle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        const burstTolerance = CFG.projectile?.slashAngleTolerance ?? 0.1;
        if (dist <= slash.length && Math.abs(angleDiff) < burstTolerance) {
          slash.hitPlayers.add(opp.id);
          effects.push({
            type: WeaponEffectType.BURST_DAMAGE,
            sourceId: this.playerId,
            targetId: opp.id,
            value: CFG.burstDamage!,
            metadata: {
              desc: '无限剑制',
              visualType: VisualEventType.OPTICAL_SLASH_BURST,
            },
          });
        }
      }
    }

    // 视觉事件
    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: self.position.x, y: self.position.y },
      metadata: {
        visualType: VisualEventType.OPTICAL_SLASH_BURST,
        isBurst: true,
        length: CFG.visualRadius,
      },
    });

    // 重置
    this.energy = 0;
    this.hitCount = 0;
    this.burstReady = false;

    return effects;
  }

  // ── 运行时状态 ────────────────────────────────────────

  getRuntimeState(): WeaponRuntimeState {
    const CFG = WEAPON_RANGE_CONFIG[this.id];
    return {
      energy: this.energy,
      maxEnergy: CFG.maxEnergy!,
      cooldowns: {},
      stacks: { hitCount: this.hitCount, speedBuff: this.speedBuff },
      flags: { burstReady: this.burstReady },
      custom: { activeSlashes: this.activeSlashes.length },
    };
  }

  reset(): void {
    this.energy = 0;
    this.hitCount = 0;
    this.speedBuff = 0;
    this.speedBuffTimer = 0;
    this.activeSlashes = [];
    this.burstReady = false;
  }
}
