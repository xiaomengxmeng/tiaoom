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
  IWeapon, IPhysicsQuery, WeaponEffect, WeaponRuntimeState, PhysicsObstacle,
} from '../../core/IWeapon';
import { WEAPON_RANGE_CONFIG } from '../../config/WeaponRangeConfig';
import { WeaponId, WeaponName, WeaponEffectType, VisualEventType, School } from '../../config/GameEnums';
import type { HitReaction } from '../../shared/protocol';

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

// ─── 爆发刀刃（追踪突进） ───────────────────────────────
interface BurstBlade {
  targetId: string;
  startX: number;
  startY: number;
  endX: number;        // 实时更新（追踪目标）
  endY: number;
  locked: boolean;
  hit: boolean;
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

  // ── 爆发三阶段状态 ──
  private burstFloatEndTime = 0;      // 浮动结束时间戳（Date.now()）
  private burstDashEndTime = 0;       // 突进结束时间戳（Date.now()）
  private burstBlades: BurstBlade[] = [];
  private burstHitCount: Map<string, number> = new Map();

  // 斩击残留实体（可碰撞）
  private slashResidues: Array<{
    id: string;
    x: number;
    y: number;
    radius: number;
    spawnedAt: number;
    ownerId: string;
  }> = [];
  /** 障碍物碰撞 CD 时间戳（1s CD） */
  private lastObstacleHitAt = 0;

  // ── 每 tick ───────────────────────────────────────────

  onTick(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const CFG = WEAPON_RANGE_CONFIG[this.id];

    // ── 爆发阶段 2/3 驱动（基于时间戳） ──
    const now = Date.now();

    // 阶段 2：锁定（浮动结束时触发）
    if (this.burstFloatEndTime > 0 && now >= this.burstFloatEndTime) {
      this.executeBurstLock(state, physics, effects);
      this.burstFloatEndTime = 0;
    }

    // 阶段 3：追踪 + 伤害结算（突进结束时触发）
    if (this.burstDashEndTime > 0 && now >= this.burstDashEndTime) {
      this.executeBurstDamage(state, physics, effects);
      this.burstDashEndTime = 0;
      this.energy = 0;
      this.hitCount = 0;
    }

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

    // 记录斩击残留（可碰撞实体）
    this.slashResidues.push({
      id: `slash_residue_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      x: self.position.x,
      y: self.position.y,
      radius: 25,
      spawnedAt: Date.now(),
      ownerId: this.playerId,
    });
    // 清理过期残留
    const residueNow = Date.now();
    this.slashResidues = this.slashResidues.filter(r => residueNow - r.spawnedAt < 800);

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

  getHitReaction(): HitReaction {
    return 'slash';
  }

  onHitByAttacker(_attackerId: string, _state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    return [];
  }

  // ── 物理障碍 ──────────────────────────────────────

  getObstacles(): PhysicsObstacle[] {
    const now = Date.now();
    return this.slashResidues
      .filter(r => now - r.spawnedAt < 800)  // 0.8s 持续
      .map(r => ({
        id: r.id,
        x: r.x,
        y: r.y,
        radius: r.radius,
        sourceId: r.ownerId,
        type: 'slash',
      }));
  }

  onObstacleHit(hittingPlayerId: string, _state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    if (hittingPlayerId === this.playerId) return [];
    const now = Date.now();
    if (now - this.lastObstacleHitAt < 1000) return [];  // 1s CD
    this.lastObstacleHitAt = now;
    return [{
      type: WeaponEffectType.DAMAGE,
      targetId: hittingPlayerId,
      sourceId: this.playerId,
      value: 2,
      metadata: { hitReaction: 'slash' },
    }];
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

    // ── 阶段 1：启动浮动（0.8s） ──
    // 不立即造成伤害，仅发送视觉事件
    const now = Date.now();
    const floatDur = CFG.burstFloatDurationMs ?? 800;
    const dashDur = CFG.burstDashDurationMs ?? 400;
    this.burstFloatEndTime = now + floatDur;
    this.burstDashEndTime = now + floatDur + dashDur;
    this.burstBlades = [];
    this.burstHitCount.clear();

    // 发送浮动阶段视觉事件
    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: self.position.x, y: self.position.y },
      metadata: {
        visualType: VisualEventType.OPTICAL_SLASH_BURST,
        isBurst: true,
        phase: 'float',
        floatRadius: CFG.burstFloatRadius ?? 60,
        floatDuration: floatDur,
        dashDuration: dashDur,
      },
    });

    // 重置爆发就绪（但保留 energy 用于 onTick 阶段 2/3）
    this.burstReady = false;
    return effects;
  }

  /** 爆发阶段 2：锁定目标 + 分配 6 把刀 */
  private executeBurstLock(
    state: IBattleState,
    physics: IPhysicsQuery,
    effects: WeaponEffect[],
  ): void {
    const self = state.getPlayer(this.playerId);
    if (!self) return;

    const opponents = physics.getAllAliveOpponents(this.playerId);
    if (opponents.length === 0) return;

    const CFG = WEAPON_RANGE_CONFIG[this.id];
    const floatR = CFG.burstFloatRadius ?? 60;

    // ── 分配 6 把刀的目标（优先均分 + 随机） ──
    const targets: string[] = [];
    // 第 1 轮：每个敌人分配 1 把（最多 6 个）
    for (let i = 0; i < Math.min(6, opponents.length); i++) {
      targets.push(opponents[i].id);
    }
    // 第 2 轮：剩余的刀随机分配
    while (targets.length < 6 && opponents.length > 0) {
      targets.push(opponents[Math.floor(Math.random() * opponents.length)].id);
    }

    // ── 创建 6 把刀 ──
    this.burstBlades = [];
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const target = opponents.find(o => o.id === targets[i]);
      this.burstBlades.push({
        targetId: targets[i],
        startX: self.position.x + Math.cos(angle) * floatR,
        startY: self.position.y + Math.sin(angle) * floatR,
        endX: target?.x ?? self.position.x,
        endY: target?.y ?? self.position.y,
        locked: true,
        hit: false,
      });
    }

    // 发送锁定视觉事件（携带 burstBlades 数组）
    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: self.position.x, y: self.position.y },
      metadata: {
        visualType: VisualEventType.OPTICAL_SLASH_BURST,
        isBurst: true,
        phase: 'lock',
        burstBlades: this.burstBlades.map(b => ({
          targetId: b.targetId,
          startX: b.startX,
          startY: b.startY,
          endX: b.endX,
          endY: b.endY,
        })),
      },
    });
  }

  /** 爆发阶段 3：追踪更新 + 伤害结算（同敌人多刀衰减） */
  private executeBurstDamage(
    state: IBattleState,
    physics: IPhysicsQuery,
    effects: WeaponEffect[],
  ): void {
    // ── 追踪：最后再更新一次目标位置 ──
    const opponents = physics.getAllAliveOpponents(this.playerId);
    for (const blade of this.burstBlades) {
      if (blade.hit) continue;
      const target = opponents.find(o => o.id === blade.targetId);
      if (target) {
        blade.endX = target.x;
        blade.endY = target.y;
      }
    }

    // ── 伤害结算（按刀序，同敌人衰减） ──
    const CFG = WEAPON_RANGE_CONFIG[this.id];
    const baseDamage = CFG.burstDamage ?? 10;
    const decay = CFG.burstDecayPerHit ?? 0.5;

    for (const blade of this.burstBlades) {
      if (blade.hit) continue;
      blade.hit = true;

      // 目标已死则跳过伤害（刀光仍飞行但不造成伤害）
      const targetAlive = opponents.find(o => o.id === blade.targetId);
      if (!targetAlive) continue;

      const hitCount = this.burstHitCount.get(blade.targetId) ?? 0;
      const damage = Math.max(1, Math.floor(baseDamage * Math.pow(decay, hitCount)));
      this.burstHitCount.set(blade.targetId, hitCount + 1);

      effects.push({
        type: WeaponEffectType.BURST_DAMAGE,
        sourceId: this.playerId,
        targetId: blade.targetId,
        value: damage,
        metadata: {
          desc: '无限剑制·追踪斩',
          visualType: VisualEventType.OPTICAL_SLASH_BURST,
          phase: 'hit',
          hitOrder: hitCount,
        },
      });
    }

    // 清理
    this.burstBlades = [];
    this.burstHitCount.clear();
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
    this.slashResidues = [];
    this.lastObstacleHitAt = 0;
    this.burstFloatEndTime = 0;
    this.burstDashEndTime = 0;
    this.burstBlades = [];
    this.burstHitCount.clear();
  }
}
