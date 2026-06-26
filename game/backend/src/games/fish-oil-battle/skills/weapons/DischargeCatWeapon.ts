/**
 * 武器：放电猫猫 (Discharge Cat) — 小金喵
 *
 * 常驻特性：
 * - 球体周围跟随一只放电猫虚影（半径 15px，始终在自身 30px 范围内）
 * - 每次球体互撞，放电猫向最近对手发射一道电弧（瞬间命中，范围 120px），
 *   造成 4 伤害，并弹射至该对手 80px 内的另一名对手（若存在），
 *   造成 2 额外伤害（最多弹射 2 次）
 *
 * 爆发方式：
 * - 充能条件：电弧累计弹射总次数达到 6 次（自动计数）
 * - 触发条件：充能满足时自动触发
 * - 爆发效果 - 雷霆万钧：放电猫实体化（持续 4 秒），移速 2 倍，
 *   电弧基础伤害提升至 8 点，弹射次数上限提升至 4 次，弹射距离扩大至 120px。
 *   爆发期间每次碰撞必定触发一次电弧（无视 CD）
 *
 * 参考 OpticalSlashWeapon 的即时判定模式
 */

import type { IBattleState } from '../../core/types';
import type {
  IWeapon, IPhysicsQuery, WeaponEffect, WeaponRuntimeState,
} from '../../core/IWeapon';
import { TICKS_PER_SEC } from '../../core/IWeapon';
import { WEAPON_RANGE_CONFIG } from '../../config/WeaponRangeConfig';
import { WeaponId, WeaponName, WeaponEffectType, VisualEventType, School } from '../../config/GameEnums';

/** 电弧弹射节点（用于前端绘制链式电弧） */
interface ArcNode {
  x: number;
  y: number;
  targetId?: string;
}

export class DischargeCatWeapon implements IWeapon {
  static readonly ID = WeaponId.DISCHARGE_CAT;
  readonly id = WeaponId.DISCHARGE_CAT;
  readonly name = WeaponName.DISCHARGE_CAT;
  readonly school = School.WILD;
  readonly difficulty = 2;
  readonly iconId = 'game-icons:cat';
  playerId = '';

  private energy = 0;              // 弹射累计次数
  private tickCounter = 0;
  private isBurstActive = false;
  private burstTicksLeft = 0;
  private cooldowns: Record<string, number> = {};
  private stacks: Record<string, number> = {};
  private flags: Record<string, boolean> = {};

  /** 放电猫虚影跟随位置 */
  private catX = 0;
  private catY = 0;
  private catInited = false;

  // ── 生命周期 ──────────────────────────────────────

  onTick(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    this.tickCounter++;
    const CFG = WEAPON_RANGE_CONFIG[this.id];
    if (!CFG) return effects;

    const selfPos = physics.getSelfPosition(this.playerId);
    if (!selfPos) return effects;

    // ── 放电猫虚影跟随（绕球体小幅游走） ──
    if (!this.catInited) {
      this.catX = selfPos.x;
      this.catY = selfPos.y;
      this.catInited = true;
    }
    // 虚影在球体 30px 范围内游走
    const orbitAngle = this.tickCounter * 0.08;
    const orbitR = 25 + Math.sin(this.tickCounter * 0.05) * 5;
    const targetX = selfPos.x + Math.cos(orbitAngle) * orbitR;
    const targetY = selfPos.y + Math.sin(orbitAngle) * orbitR;
    this.catX += (targetX - this.catX) * 0.15;
    this.catY += (targetY - this.catY) * 0.15;

    // ── 爆发倒计时 ──
    if (this.isBurstActive) {
      this.burstTicksLeft--;
      if (this.burstTicksLeft <= 0) {
        this.isBurstActive = false;
      }
    }

    return effects;
  }

  onHitTarget(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    return this.fireArc(state, physics);
  }

  onHitByAttacker(_attackerId: string, _state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    return [];
  }

  /** 发射电弧并弹射 */
  private fireArc(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const CFG = WEAPON_RANGE_CONFIG[this.id];
    if (!CFG) return effects;

    const baseDamage = this.isBurstActive ? (CFG.burstDamage ?? 8) : (CFG.damage ?? 4);
    const maxBounces = this.isBurstActive ? 4 : 2;
    const bounceRange = this.isBurstActive ? 120 : 80;
    const arcRange = CFG.damageRadius ?? 120;

    const opponents = physics.getAllAliveOpponents(this.playerId);
    if (opponents.length === 0) return effects;

    // 找最近对手作为电弧起点目标
    let current = opponents[0];
    let currentDist = Infinity;
    for (const opp of opponents) {
      const d = Math.sqrt(
        (opp.x - this.catX) ** 2 + (opp.y - this.catY) ** 2,
      );
      if (d < currentDist && d < arcRange) {
        currentDist = d;
        current = opp;
      }
    }

    if (currentDist >= arcRange) return effects;

    const arcNodes: ArcNode[] = [
      { x: this.catX, y: this.catY },
    ];
    const hitSet = new Set<string>();
    let totalBounces = 0;

    // 第一击
    effects.push({
      type: WeaponEffectType.DAMAGE,
      sourceId: this.playerId,
      targetId: current.id,
      value: baseDamage,
      metadata: { desc: '放电猫电弧' },
    });
    hitSet.add(current.id);
    arcNodes.push({ x: current.x, y: current.y, targetId: current.id });

    // 弹射链
    let lastTarget = current;
    for (let b = 0; b < maxBounces; b++) {
      const candidates = opponents.filter(o =>
        !hitSet.has(o.id) && o.hp > 0,
      );
      if (candidates.length === 0) break;

      let nextTarget = candidates[0];
      let nextDist = Infinity;
      for (const c of candidates) {
        const d = Math.sqrt(
          (c.x - lastTarget.x) ** 2 + (c.y - lastTarget.y) ** 2,
        );
        if (d < nextDist && d < bounceRange) {
          nextDist = d;
          nextTarget = c;
        }
      }
      if (nextDist >= bounceRange) break;

      // 弹射伤害（每跳递减）
      const bounceDamage = this.isBurstActive ? baseDamage : Math.max(1, baseDamage - 2 + b);
      effects.push({
        type: WeaponEffectType.DAMAGE,
        sourceId: this.playerId,
        targetId: nextTarget.id,
        value: bounceDamage,
        metadata: { desc: `电弧弹射第${b + 1}跳` },
      });
      hitSet.add(nextTarget.id);
      arcNodes.push({ x: nextTarget.x, y: nextTarget.y, targetId: nextTarget.id });
      lastTarget = nextTarget;
      totalBounces++;
    }

    // 积攒能量（弹射次数）
    if (!this.isBurstActive) {
      this.energy = Math.min(CFG.maxEnergy ?? 6, this.energy + Math.max(1, totalBounces));
    }

    // 电弧视觉事件（含弹射链节点）
    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: this.catX, y: this.catY },
      metadata: {
        visualType: VisualEventType.DISCHARGE_CAT_ARC,
        isBurst: this.isBurstActive,
        catX: this.catX,
        catY: this.catY,
        bounceCount: totalBounces,
        arcNodes: arcNodes.map(n => ({ x: n.x, y: n.y, targetId: n.targetId })),
      },
    });

    return effects;
  }

  // ── 能量爆发 ──────────────────────────────────────

  getEnergy(): number { return this.energy; }
  getMaxEnergy(): number {
    const CFG = WEAPON_RANGE_CONFIG[this.id];
    return CFG?.maxEnergy ?? 6;
  }

  isBurstReady(): boolean {
    const CFG = WEAPON_RANGE_CONFIG[this.id];
    return this.energy >= (CFG?.maxEnergy ?? 6) && !this.isBurstActive;
  }

  burst(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const CFG = WEAPON_RANGE_CONFIG[this.id];
    this.energy = 0;
    this.isBurstActive = true;
    this.burstTicksLeft = (CFG?.burstDurationSec ?? 4) * TICKS_PER_SEC;

    return [{
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: this.catX, y: this.catY },
      metadata: {
        visualType: VisualEventType.DISCHARGE_CAT_BURST,
        desc: '雷霆万钧',
        isBurst: true,
        catX: this.catX,
        catY: this.catY,
        radius: CFG?.field?.radius ?? 120,
        durationSec: CFG?.burstDurationSec ?? 4,
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
        isBurstActive: this.isBurstActive,
        burstTicksLeft: this.burstTicksLeft,
        catX: this.catX,
        catY: this.catY,
      },
    };
  }

  reset(): void {
    this.energy = 0;
    this.tickCounter = 0;
    this.isBurstActive = false;
    this.burstTicksLeft = 0;
    this.cooldowns = {};
    this.stacks = {};
    this.flags = {};
    this.catX = 0;
    this.catY = 0;
    this.catInited = false;
  }
}
