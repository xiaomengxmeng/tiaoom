/**
 * 武器 1：冲击波发生器 (ShockwaveGenerator)
 *
 * 流派：侵略者 Aggressor (#FF00FF)
 * 形态：植入芯片（核心光环）
 * 难度：⭐⭐
 *
 * ── 核心设计 ──
 * 冲击波由 N 条射线组成（普通 36 条/爆发 108 条），每条射线独立传播、造成伤害。
 * 射线到达竞技场边界后直接消失，不再反弹。
 *
 * ── 射线参数 ──
 * - 普通模式：36 条射线（每 10° 一条）
 * - 爆发模式：108 条射线（每 3.33° 一条）
 * - 射线速度：500 px/s
 * - 射线最大长度：350px
 *
 * ── 命中检测 ──
 * - 每条射线独立检测：判断对手是否在射线扇形区域内，且射线前沿刚好到达
 * - 同一道波对同一目标最多命中 2 次（跨所有射线累计）
 *
 * ── 网络同步 ──
 * - 创建时发送 SHOCKWAVE_TRIGGER（前端绘制扩散圆环）
 */

import type { IBattleState } from '../../core/types';
import type {
  IWeapon, IPhysicsQuery, WeaponEffect, WeaponRuntimeState,
} from '../../core/IWeapon';
import { WEAPON_RANGE_CONFIG } from '../../config/WeaponRangeConfig';
import { WeaponId, WeaponName, WeaponEffectType, VisualEventType, School } from '../../config/GameEnums';

// ─── 常量 ──────────────────────────────────────────────
const TICK_INTERVAL = 0.05;         // 秒/tick
const NORMAL_RAY_COUNT = 36;        // 普通模式射线数（每 10° 一条）
const BURST_RAY_COUNT = 108;        // 爆发模式射线数（每 3.33° 一条）
const MAX_WAVE_RANGE_MULTIPLIER = 1; // 波最大范围 = maxRadius * multiplier

// ─── 射线数据结构 ───────────────────────────────────
interface ShockwaveRay {
  id: string;
  /** 射线起点 X */
  originX: number;
  /** 射线起点 Y */
  originY: number;
  /** 当前传播角度（弧度） */
  angle: number;
  /** 当前长度（从起点沿角度方向的距离，px） */
  length: number;
  /** 上一帧长度（用于前沿检测） */
  prevLength: number;
  /** 传播速度（px/s） */
  speed: number;
  /** 当前伤害值 */
  damage: number;
  /** 已命中玩家 ID 集合 */
  hitPlayers: Set<string>;
  /** 是否激活 */
  isActive: boolean;
}

// ─── 波前数据结构（仅用于伤害检测）───────────────────
interface ShockwaveWavefront {
  id: string;
  playerId: string;
  rays: ShockwaveRay[];
  isBurst: boolean;
  /** tick 计数器 */
  tickCount: number;
  /** 波前总命中计数（用于充能） */
  totalBounceHits: number;
  /** 是否已结束 */
  isFinished: boolean;
  /** 本波内每个对手的累计命中次数（跨所有射线共享，防止同一波超量命中） */
  perOpponentHitCount: Map<string, number>;
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

    // 推进所有活跃波前（仅用于伤害检测，不发送视觉同步事件）
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

        // 3. 碰墙检测：超出竞技场边界 → 射线消失
        const dx = endX - arenaCenter.x;
        const dy = endY - arenaCenter.y;
        const distFromCenter = Math.sqrt(dx * dx + dy * dy);
        if (distFromCenter > arenaR) {
          ray.isActive = false;
        }

        // 4. 命中玩家检测（仅在射线活跃时）
        if (ray.isActive) {
          this.checkRayHits(ray, wf, allOpponents, effects, wf.perOpponentHitCount);
        }

        // 5. 检查射线是否超出最大范围
        const maxLen = CFG.aoeMaxRadius! * MAX_WAVE_RANGE_MULTIPLIER;
        if (ray.length > maxLen) {
          ray.isActive = false;
        }

        if (ray.isActive) allRaysFinished = false;
      }

      // 6. 全部射线结束 → 标记finished
      if (allRaysFinished) {
        wf.isFinished = true;
        return false;
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
        totalBounceHits: 0,
        isFinished: false,
        perOpponentHitCount: new Map(),
      };
      this.activeWavefronts.push(wf);

      // 立即推进一次射线长度（1 tick = 50ms），让初始端点形成圆环而非一个点
      // 注意：这里只推进长度 + 碰墙检测，不检测命中（命中检测在 onTick 中做）
      this.advanceRaysInitialTick(wf);

      // 发送 SHOCKWAVE_TRIGGER（前端绘制扩散圆环）
      effects.push({
        type: WeaponEffectType.VISUAL_ONLY,
        sourceId: this.playerId,
        value: 0,
        position: { x: self.position.x, y: self.position.y },
        metadata: {
          visualType: VisualEventType.SHOCKWAVE_TRIGGER,
          isBurst,
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

  onHitByAttacker(_attackerId: string, _state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    return [];
  }

  // ── 能量爆发 ──────────────────────────────────────

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

  // ── 私有：命中检测 ──────────────────────────────────

  /**
   * 检测射线是否命中对手。
   * 使用扇形区域检测：对手在射线的扇形区域内（±半扇区角），
   * 且射线前沿刚好到达对手所在距离。
   *
   * @param sharedHitCount 跨所有射线共享的命中计数，确保 maxHitsPerWave 真正生效
   */
  private checkRayHits(
    ray: ShockwaveRay,
    wf: ShockwaveWavefront,
    opponents: { id: string; x: number; y: number }[],
    effects: WeaponEffect[],
    sharedHitCount: Map<string, number>,
  ): void {
    const halfSectorAngle = Math.PI / wf.rays.length; // 半扇区角
    const maxHits = CFG.maxHitsPerWave!;

    for (const opp of opponents) {
      // 跳过已命中（本射线周期内）
      if (ray.hitPlayers.has(opp.id)) continue;

      // 检查跨所有射线的累计命中次数
      const totalHits = sharedHitCount.get(opp.id) ?? 0;
      if (totalHits >= maxHits) continue;

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
        ray.hitPlayers.add(opp.id);
        sharedHitCount.set(opp.id, totalHits + 1);

        effects.push({
          type: WeaponEffectType.AOE_DAMAGE as any,
          sourceId: this.playerId,
          targetId: opp.id,
          value: Math.round(ray.damage),
          metadata: {
            desc: wf.isBurst ? '爆发冲击波伤害' : '冲击波伤害',
            waveId: wf.id,
          },
        });
      }
    }
  }

  // ── 私有：初始推进（仅长度+碰墙，不检测命中） ──────────

  /**
   * 在波前创建后立即推进一次射线长度（1 tick），让初始 TRIGGER 发送的端点形成完整圆环。
   * 只处理长度推进和碰墙反射，不检测玩家命中（命中由 onTick 中的 checkRayHits 负责）。
   */
  private advanceRaysInitialTick(wf: ShockwaveWavefront): void {
    for (const ray of wf.rays) {
      if (!ray.isActive) continue;
      ray.prevLength = ray.length;
      ray.length += ray.speed * TICK_INTERVAL;
    }
    // 注：初始 tick 不检测碰墙，因为射线刚从中心发出，长度仅 ~25px，
    // 不可能到达竞技场边界（半径通常 400px+）。
  }

  // ── 私有：射线端点收集 ──────────────────────────────

}

// ─── 获取本武器范围配置 ───────────────────────────────
const CFG = WEAPON_RANGE_CONFIG[ShockwaveGeneratorWeapon.ID];
