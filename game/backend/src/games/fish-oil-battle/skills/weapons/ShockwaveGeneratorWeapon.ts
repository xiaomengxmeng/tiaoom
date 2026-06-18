/**
 * 武器 1：冲击波发生器 (ShockwaveGenerator) - 方案 B 射线追踪版
 *
 * 流派：侵略者 Aggressor (#FF00FF)
 * 形态：植入芯片（核心光环）
 * 难度：⭐⭐
 *
 * ── 方案 B 核心设计 ──
 * 冲击波由 N 条射线组成（普通 36 条/爆发 108 条），每条射线独立传播、反射、造成伤害。
 * 碰墙时每条射线独立反射（水波反弹效果），同一道冲击波颜色不变。
 *
 * ── 射线参数 ──
 * - 普通模式：36 条射线（每 10° 一条），最大反弹 1 次
 * - 爆发模式：108 条射线（每 3.33° 一条），最大反弹 2 次
 * - 射线速度：500 px/s（与旧版一致）
 * - 射线最大长度：350px × (1 + 反弹次数)
 *
 * ── 命中检测 ──
 * - 每条射线独立检测：判断对手是否在射线扇形区域内，且射线前沿刚好到达
 * - 同一道波对同一目标最多命中 2 次（跨所有射线累计）
 *
 * ── 网络同步 ──
 * - 创建时发送 SHOCKWAVE_WAVEFRONT_TRIGGER
 * - 每 3 tick（150ms）发送 SHOCKWAVE_WAVEFRONT_UPDATE（包含所有射线端点）
 * - 波消失时发送 SHOCKWAVE_WAVEFRONT_REMOVE
 */

import type { IBattleState } from '../../core/types';
import type {
  IWeapon, IPhysicsQuery, WeaponEffect, WeaponRuntimeState,
} from '../../core/IWeapon';
import { WEAPON_RANGE_CONFIG } from '../../config/WeaponRangeConfig';
import { WeaponId, WeaponName, WeaponEffectType, VisualEventType, School } from '../../config/GameEnums';

// ─── 常量 ──────────────────────────────────────────────
const TICK_INTERVAL = 0.05;         // 秒/tick
const SYNC_INTERVAL_TICKS = 3;      // 每 N 个 tick 同步波前到前端
const NORMAL_RAY_COUNT = 36;        // 普通模式射线数（每 10° 一条）
const BURST_RAY_COUNT = 108;        // 爆发模式射线数（每 3.33° 一条）
const MAX_WAVE_RANGE_MULTIPLIER = 3; // 波最大范围 = maxRadius * (1 + bounces * multiplier)

// ─── 射线数据结构 ───────────────────────────────────
interface ShockwaveRay {
  id: string;
  /** 射线当前起点 X（反射后更新为墙壁交点） */
  originX: number;
  /** 射线当前起点 Y */
  originY: number;
  /** 当前传播角度（弧度） */
  angle: number;
  /** 当前长度（从起点沿角度方向的距离，px） */
  length: number;
  /** 上一帧长度（用于前沿检测） */
  prevLength: number;
  /** 传播速度（px/s） */
  speed: number;
  /** 当前伤害值（随反射衰减） */
  damage: number;
  /** 已反弹次数 */
  bounceCount: number;
  /** 最大反弹次数 */
  maxBounces: number;
  /** 已命中玩家 ID 集合（反射后清空，允许再次命中） */
  hitPlayers: Set<string>;
  /** 是否激活 */
  isActive: boolean;
}

// ─── 波前数据结构 ───────────────────────────────────
interface ShockwaveWavefront {
  id: string;
  playerId: string;
  rays: ShockwaveRay[];
  isBurst: boolean;
  /** tick 计数器（用于同步节奏） */
  tickCount: number;
  /** 上次同步射线端点的 tick */
  lastSyncTick: number;
  /** 波前总命中计数（用于充能） */
  totalBounceHits: number;
  /** 是否已结束 */
  isFinished: boolean;
}

export class ShockwaveGeneratorWeapon implements IWeapon {
  static readonly ID = WeaponId.SHOCKWAVE_GENERATOR;
  readonly id = WeaponId.SHOCKWAVE_GENERATOR;
  readonly name = WeaponName.SHOCKWAVE_GENERATOR;
  readonly school = School.AGGRESSOR;
  readonly difficulty = 2;
  readonly iconId = 'game-icons:lightning-dome';
  playerId = '';

  private energy = 0;
  private activeWavefronts: ShockwaveWavefront[] = [];
  private burstNextHit = false;
  private cooldowns: Record<string, number> = {};
  private stacks: Record<string, number> = {};
  private flags: Record<string, boolean> = {};

  // ── 生命周期 ──────────────────────────────────────

  onTick(_state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const arenaCenter = physics.getArenaCenter();
    const arenaR = physics.getArenaRadius();
    const allOpponents = physics.getAllAliveOpponents(this.playerId);

    // 推进所有活跃波前
    this.activeWavefronts = this.activeWavefronts.filter(wf => {
      if (wf.isFinished) return false;
      wf.tickCount++;

      let allRaysFinished = true;

      for (const ray of wf.rays) {
        if (!ray.isActive) continue;

        // 1. 保存上一帧长度，推进射线
        ray.prevLength = ray.length;
        ray.length += ray.speed * TICK_INTERVAL;

        // 2. 计算射线终点
        const endX = ray.originX + Math.cos(ray.angle) * ray.length;
        const endY = ray.originY + Math.sin(ray.angle) * ray.length;

        // 3. 碰墙检测与反射
        if (ray.bounceCount < ray.maxBounces) {
          const dx = endX - arenaCenter.x;
          const dy = endY - arenaCenter.y;
          const distFromCenter = Math.sqrt(dx * dx + dy * dy);

          if (distFromCenter > arenaR) {
            this.reflectRayAtWall(ray, endX, endY, arenaCenter, arenaR);
          }
        }

        // 4. 命中玩家检测
        this.checkRayHits(ray, wf, allOpponents, effects);

        // 5. 检查射线是否超出最大范围
        const maxLen = CFG.aoeMaxRadius! * (1 + ray.bounceCount * MAX_WAVE_RANGE_MULTIPLIER);
        if (ray.length > maxLen) {
          ray.isActive = false;
        }

        if (ray.isActive) allRaysFinished = false;
      }

      // 6. 全部射线结束 → 标记finished，发送移除事件
      if (allRaysFinished) {
        wf.isFinished = true;
        effects.push({
          type: WeaponEffectType.VISUAL_ONLY,
          sourceId: this.playerId,
          value: 0,
          metadata: {
            visualType: VisualEventType.SHOCKWAVE_WAVEFRONT_REMOVE,
            waveId: wf.id,
          },
        });
        return false;
      }

      // 7. 定期同步射线端点给前端（每 SYNC_INTERVAL_TICKS tick）
      const shouldSync = (wf.tickCount - wf.lastSyncTick) >= SYNC_INTERVAL_TICKS;
      if (shouldSync) {
        wf.lastSyncTick = wf.tickCount;
        const endpoints = this.collectRayEndpoints(wf);
        effects.push({
          type: WeaponEffectType.VISUAL_ONLY,
          sourceId: this.playerId,
          value: 0,
          metadata: {
            visualType: VisualEventType.SHOCKWAVE_WAVEFRONT_UPDATE,
            waveId: wf.id,
            isBurst: wf.isBurst,
            rayEndpoints: endpoints,
            waveAlpha: Math.max(0, 1 - (wf.tickCount * TICK_INTERVAL) / 5), // 5秒渐隐
          },
        });
      }

      return !wf.isFinished;
    });

    return effects;
  }

  onHitTarget(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const self = state.getPlayer(this.playerId);
    if (!self) return [];

    const effects: WeaponEffect[] = [];
    const isBurst = this.burstNextHit;
    const waveCount = isBurst ? CFG.burstWaves! : 1;
    const rayCount = isBurst ? BURST_RAY_COUNT : NORMAL_RAY_COUNT;
    const maxBounces = isBurst ? CFG.burstBounces! : CFG.baseBounces!;
    const damage = isBurst ? CFG.burstDamage! : CFG.damage!;

    // 创建波前（可能多道，爆发模式按 120° 偏移）
    for (let w = 0; w < waveCount; w++) {
      const angleOffset = isBurst ? (w * Math.PI * 2) / waveCount : 0;
      const rays: ShockwaveRay[] = [];
      const waveId = `wf_${Date.now()}_${w}_${Math.random().toString(36).slice(2, 6)}`;

      for (let i = 0; i < rayCount; i++) {
        const angle = angleOffset + (i / rayCount) * Math.PI * 2;
        rays.push({
          id: `${waveId}_r${i}`,
          originX: self.position.x,
          originY: self.position.y,
          angle,
          length: 0,
          prevLength: 0,
          speed: CFG.visualSpeed!,
          damage,
          bounceCount: 0,
          maxBounces,
          hitPlayers: new Set(),
          isActive: true,
        });
      }

      const wf: ShockwaveWavefront = {
        id: waveId,
        playerId: this.playerId,
        rays,
        isBurst,
        tickCount: 0,
        lastSyncTick: -1, // 确保第一帧就同步
        totalBounceHits: 0,
        isFinished: false,
      };
      this.activeWavefronts.push(wf);

      // 发送波前创建事件
      const initialEndpoints = this.collectRayEndpoints(wf);
      effects.push({
        type: WeaponEffectType.VISUAL_ONLY,
        sourceId: this.playerId,
        value: 0,
        position: { x: self.position.x, y: self.position.y },
        metadata: {
          visualType: VisualEventType.SHOCKWAVE_WAVEFRONT_TRIGGER,
          waveId: wf.id,
          isBurst,
          rayEndpoints: initialEndpoints,
          waveAlpha: 1,
          radius: CFG.aoeMaxRadius!,
        },
      });
    }

    if (isBurst) {
      this.burstNextHit = false;
    }

    // 碰撞基础伤害
    const opponent = physics.getRandomAliveOpponent(this.playerId);
    if (opponent) {
      effects.push({
        type: WeaponEffectType.DAMAGE,
        sourceId: this.playerId,
        targetId: opponent.id,
        value: 2,
        metadata: { desc: '冲击波碰撞基础伤害' },
      });
    }

    return effects;
  }

  onHitByAttacker(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    return [];
  }

  // ── 能量爆发 ──────────────────────────────────────

  getEnergy(): number { return this.energy; }
  getMaxEnergy(): number { return CFG.maxEnergy!; }

  isBurstReady(): boolean {
    return this.energy >= CFG.maxEnergy! && !this.burstNextHit;
  }

  burst(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    this.energy = 0;
    this.burstNextHit = true;

    return [{
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      metadata: { visualType: VisualEventType.BURST_TRIGGER, desc: '震波共振就绪' },
    }];
  }

  // ── 状态 ──────────────────────────────────────────

  getRuntimeState(): WeaponRuntimeState {
    return {
      energy: this.energy, maxEnergy: CFG.maxEnergy!,
      cooldowns: this.cooldowns, stacks: this.stacks, flags: this.flags,
      custom: { activeWaves: this.activeWavefronts.length, burstReady: this.isBurstReady() },
    };
  }

  reset(): void {
    this.energy = 0;
    this.activeWavefronts = [];
    this.burstNextHit = false;
    this.cooldowns = {};
    this.stacks = {};
    this.flags = {};
  }

  // ── 私有：射线反射 ──────────────────────────────────

  /** 在墙壁处反射射线 */
  private reflectRayAtWall(
    ray: ShockwaveRay,
    endX: number, endY: number,
    arenaCenter: { x: number; y: number },
    arenaR: number,
  ): void {
    // 1. 计算射线与竞技场边界的交点
    const dx = endX - ray.originX;
    const dy = endY - ray.originY;

    // 二分法求射线与圆的交点
    const ox = ray.originX - arenaCenter.x;
    const oy = ray.originY - arenaCenter.y;
    // 射线方向单位向量
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) return;
    const udx = dx / len;
    const udy = dy / len;

    // 求解 (ox + t*udx)^2 + (oy + t*udy)^2 = arenaR^2
    const a = udx * udx + udy * udy; // = 1
    const b = 2 * (ox * udx + oy * udy);
    const c = ox * ox + oy * oy - arenaR * arenaR;
    const discriminant = b * b - 4 * a * c;

    if (discriminant < 0) return;

    const sqrtD = Math.sqrt(discriminant);
    const t1 = (-b - sqrtD) / (2 * a);
    const t2 = (-b + sqrtD) / (2 * a);
    // 取正的最小值（射线方向上的交点）
    const t = (t1 > 0 && t2 > 0) ? Math.min(t1, t2) : Math.max(t1, t2);
    if (t <= 0) return;

    // 交点坐标
    const hitX = ray.originX + udx * t;
    const hitY = ray.originY + udy * t;

    // 2. 计算墙壁法向量（圆形竞技场，从圆心指向交点）
    const nx = hitX - arenaCenter.x;
    const ny = hitY - arenaCenter.y;
    const nLen = Math.sqrt(nx * nx + ny * ny);
    if (nLen < 0.001) return;
    const unx = nx / nLen;
    const uny = ny / nLen;

    // 3. 反射角度：r = d - 2(d·n)n
    const dot = udx * unx + udy * uny;
    const rx = udx - 2 * dot * unx;
    const ry = udy - 2 * dot * uny;
    const reflectAngle = Math.atan2(ry, rx);

    // 4. 更新射线
    ray.originX = hitX;
    ray.originY = hitY;
    ray.angle = reflectAngle;
    ray.length = 0;
    ray.prevLength = 0;
    ray.bounceCount++;
    ray.damage *= 0.8; // 反射伤害衰减 20%
    ray.hitPlayers.clear(); // 反射后可重新命中同一玩家

    // 超过最大反弹次数则禁用
    if (ray.bounceCount >= ray.maxBounces) {
      ray.isActive = false;
    }
  }

  // ── 私有：命中检测 ──────────────────────────────────

  /**
   * 检测射线是否命中对手。
   * 使用扇形区域检测：对手在射线的扇形区域内（±半扇区角），
   * 且射线前沿刚好到达对手所在距离。
   */
  private checkRayHits(
    ray: ShockwaveRay,
    wf: ShockwaveWavefront,
    opponents: { id: string; x: number; y: number }[],
    effects: WeaponEffect[],
  ): void {
    const halfSectorAngle = Math.PI / wf.rays.length; // 半扇区角
    const waveHitCount = new Map<string, number>(); // 本波累计命中数

    for (const opp of opponents) {
      // 跳过已命中（本反射周期内）
      if (ray.hitPlayers.has(opp.id)) continue;

      // 计算对手相对射线起点的距离和角度
      const dx = opp.x - ray.originX;
      const dy = opp.y - ray.originY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // 角度检查：对手是否在射线的扇形区域内
      const oppAngle = Math.atan2(dy, dx);
      let angleDiff = oppAngle - ray.angle;
      // 标准化角度差到 [-π, π]
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      if (Math.abs(angleDiff) > halfSectorAngle) continue;

      // 前沿到达检测：射线刚好从对手身边经过
      if (ray.prevLength < dist && ray.length >= dist) {
        // 检查跨所有射线的累计命中次数
        const totalHits = waveHitCount.get(opp.id) ?? 0;
        const maxHits = CFG.maxHitsPerWave!;
        if (totalHits >= maxHits) continue;

        ray.hitPlayers.add(opp.id);
        waveHitCount.set(opp.id, totalHits + 1);

        effects.push({
          type: WeaponEffectType.AOE_DAMAGE as any,
          sourceId: this.playerId,
          targetId: opp.id,
          value: Math.round(ray.damage),
          metadata: {
            desc: wf.isBurst ? '爆发冲击波伤害' : '冲击波伤害',
            waveId: wf.id,
            bounceCount: ray.bounceCount,
          },
        });

        // 反弹命中充能
        if (!wf.isBurst && ray.bounceCount > 0) {
          wf.totalBounceHits++;
          this.energy = Math.min(CFG.maxEnergy!, this.energy + 1);
        }
      }
    }
  }

  // ── 私有：射线端点收集 ──────────────────────────────

  /** 收集波前所有活跃射线的端点坐标（用于网络同步） */
  private collectRayEndpoints(wf: ShockwaveWavefront): { x: number; y: number }[] {
    const endpoints: { x: number; y: number }[] = [];
    for (const ray of wf.rays) {
      if (!ray.isActive) continue;
      endpoints.push({
        x: ray.originX + Math.cos(ray.angle) * ray.length,
        y: ray.originY + Math.sin(ray.angle) * ray.length,
      });
    }
    return endpoints;
  }
}

// ─── 获取本武器范围配置 ───────────────────────────────
const CFG = WEAPON_RANGE_CONFIG[ShockwaveGeneratorWeapon.ID];
