/**
 * 武器 1：冲击波发生器 (ShockwaveGenerator)
 *
 * 流派：侵略者 Aggressor (#FF00FF)
 * 形态：植入芯片（核心光环）
 * 难度：⭐⭐
 *
 * ── 文档行为 ──
 * 常驻特性：互撞造成伤害时，以碰撞点为中心产生冲击波环（半径 0→350px）
 *           冲击波碰墙反弹，反弹后再次碰到对手造成二次伤害 6
 *           同一道冲击波对同一目标最多生效 2 次（前沿到达检测，避免重复伤害）
 * 充能方式：冲击波反弹命中 4 次 → 触发爆发
 * 爆发效果：下一次互撞产生 3 道冲击波（间隔120°），
 *           每道碰墙反弹 2 次，单道伤害 10
 *
 * ── 范围检测 ──
 * - 伤害检测：前沿到达（prevRadius→currentRadius 环内对手）
 * - 碰墙检测：环交叉（prevDist>0 && currDist<=0 时触发反弹）
 * - 特效视觉范围 = 后端传入的 radius 参数（与逻辑一致）
 */

import type { IBattleState } from '../../core/types';
import type {
  IWeapon, IPhysicsQuery, WeaponEffect, WeaponRuntimeState,
} from '../../core/IWeapon';
import { WEAPON_RANGE_CONFIG } from '../../config/WeaponRangeConfig';
import { WeaponId, WeaponName, WeaponEffectType, VisualEventType, School } from '../../config/GameEnums';

// ─── 常量 ──────────────────────────────────────────────
const TICK_INTERVAL = 0.05;         // 秒/tick

// ─── 冲击波数据结构 ───────────────────────────────────
interface Shockwave {
  id: string;
  startX: number;
  startY: number;
  currentRadius: number;
  /** 上一帧半径（用于前沿环检测） */
  prevRadius: number;
  maxRadius: number;
  speed: number;
  damage: number;
  hitPlayers: Map<string, number>;  // playerId → 命中次数
  bounceCount: number;              // 已反弹次数
  maxBounces: number;               // 最大反弹次数
  isBurst: boolean;
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
  private activeWaves: Shockwave[] = [];
  private burstNextHit = false;     // 标记下次互撞为爆发模式
  private cooldowns: Record<string, number> = {};
  private stacks: Record<string, number> = {};
  private flags: Record<string, boolean> = {};

  // ── 生命周期 ──────────────────────────────────────

  onTick(_state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];

    // 推进所有活跃冲击波
    this.activeWaves = this.activeWaves.filter(wave => {
      // 保存上一帧半径，用于前沿环检测
      wave.prevRadius = wave.currentRadius;
      wave.currentRadius += wave.speed * TICK_INTERVAL;

      // ═══ 碰墙反弹检测（环交叉方式：上一帧未碰墙 + 当前帧碰墙 = 刚好穿越边界） ═══
      if (wave.bounceCount < wave.maxBounces) {
        const prevDist = this.getDistToNearestWall(wave.startX, wave.startY, wave.prevRadius, physics);
        const currDist = this.getDistToNearestWall(wave.startX, wave.startY, wave.currentRadius, physics);
        if (prevDist > 0 && currDist <= 0) {
          wave.bounceCount++;

          // 计算反弹点（冲击波环与竞技场边界的交点）
          const bouncePoint = this.calculateBouncePoint(wave.startX, wave.startY, physics);

          // 创建反射波（从反弹点向内收缩，伤害减半，速度不变，不再反弹）
          const reflectedWave: Shockwave = {
            id: `${wave.id}_reflected_${wave.bounceCount}`,
            startX: bouncePoint.x,
            startY: bouncePoint.y,
            currentRadius: 0,
            prevRadius: 0,
            maxRadius: wave.maxRadius,
            speed: wave.speed,
            damage: wave.damage * 0.5,
            hitPlayers: new Map(),
            bounceCount: 0,
            maxBounces: 0,
            isBurst: false,
          };
          this.activeWaves.push(reflectedWave);

          // 发送反弹视觉事件
          effects.push({
            type: WeaponEffectType.VISUAL_ONLY,
            sourceId: this.playerId,
            value: 0,
            position: { x: bouncePoint.x, y: bouncePoint.y },
            aoe: { x: bouncePoint.x, y: bouncePoint.y, radius: wave.maxRadius },
            metadata: {
              visualType: VisualEventType.SHOCKWAVE_BOUNCE,
              radius: wave.maxRadius,
              isBurst: wave.isBurst,
              waveId: wave.id,
              bounceCount: wave.bounceCount,
              reflectedWaveId: reflectedWave.id,
            },
          });
        }
      }

      // ═══ 前沿到达检测：只对 [prevRadius, currentRadius] 环内的对手造成伤害 ═══
      const opponentsInRing = this.getOpponentsInRing(
        wave.startX, wave.startY, wave.prevRadius, wave.currentRadius, physics,
      );
      for (const opponent of opponentsInRing) {
        const hitCount = wave.hitPlayers.get(opponent.id) ?? 0;
        if (hitCount >= CFG.maxHitsPerWave!) continue;
        wave.hitPlayers.set(opponent.id, hitCount + 1);

        effects.push({
          type: WeaponEffectType.AOE_DAMAGE as any,
          sourceId: this.playerId,
          targetId: opponent.id,
          value: wave.damage,
          aoe: { x: wave.startX, y: wave.startY, radius: wave.currentRadius },
          metadata: {
            desc: wave.isBurst ? '爆发冲击波伤害' : '冲击波伤害',
            waveId: wave.id,
            bounceCount: wave.bounceCount,
          },
        });

        // 反弹命中充能（仅非爆发模式）
        if (!wave.isBurst && wave.bounceCount > 0) {
          this.energy = Math.min(CFG.maxEnergy!, this.energy + 1);
        }
      }

      // 生命周期：超出最大半径 × (1 + 反弹次数) 后失效
      return wave.currentRadius < wave.maxRadius * (1 + wave.bounceCount);
    });

    return effects;
  }

  onHitTarget(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const self = state.getPlayer(this.playerId);
    if (!self) return [];

    const effects: WeaponEffect[] = [];
    const isBurst = this.burstNextHit;  // 先保存，后续消费
    const base: Omit<Shockwave, 'id' | 'isBurst'> = {
      startX: self.position.x,
      startY: self.position.y,
      currentRadius: 0,
      prevRadius: 0,
      maxRadius: (CFG.aoeMaxRadius ?? CFG.damageRadius)!,
      speed: CFG.visualSpeed!,
      damage: isBurst ? CFG.burstDamage! : CFG.damage!,
      hitPlayers: new Map(),
      bounceCount: 0,
      maxBounces: isBurst ? CFG.burstBounces! : CFG.baseBounces!,
    };

    if (isBurst) {
      // 爆发：3 道波，120° 间距
      for (let i = 0; i < CFG.burstWaves!; i++) {
        this.activeWaves.push({
          ...base,
          id: `wave_${Date.now()}_${i}`,
          isBurst: true,
        });
      }
      this.burstNextHit = false;
    } else {
      this.activeWaves.push({
        ...base,
        id: `wave_${Date.now()}_0`,
        isBurst: false,
      });
    }

    // 视觉事件标记
    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: self.position.x, y: self.position.y },
      metadata: {
        visualType: VisualEventType.SHOCKWAVE_TRIGGER,
        radius: (CFG.aoeMaxRadius ?? CFG.damageRadius)!,
        isBurst,
        waveCount: isBurst ? CFG.burstWaves! : 1,
      },
    });

    // 碰撞基础伤害（冲击波发生器碰撞造成额外 +2 伤害）
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
      custom: { activeWaves: this.activeWaves.length, burstReady: this.isBurstReady() },
    };
  }

  reset(): void {
    this.energy = 0;
    this.activeWaves = [];
    this.burstNextHit = false;
    this.cooldowns = {};
    this.stacks = {};
    this.flags = {};
  }

  // ── 私有 ──────────────────────────────────────────

  /** 检测扩散半径是否碰到竞技场边界（圆形竞技场） */
  private getDistToNearestWall(startX: number, startY: number, radius: number, physics: IPhysicsQuery): number {
    const center = physics.getArenaCenter();
    const arenaR = physics.getArenaRadius();
    // 扩散圆到竞技场圆心的距离
    const dx = startX - center.x;
    const dy = startY - center.y;
    const distFromCenter = Math.sqrt(dx * dx + dy * dy);
    // 扩散圆最远点 = distFromCenter + radius，如果超出 arenaR 则碰墙
    return arenaR - (distFromCenter + radius);
  }

  /** 计算冲击波环与竞技场圆形边界的反弹交点 */
  private calculateBouncePoint(
    startX: number, startY: number,
    physics: IPhysicsQuery,
  ): { x: number; y: number } {
    const center = physics.getArenaCenter();
    const arenaR = physics.getArenaRadius();
    const dx = startX - center.x;
    const dy = startY - center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // 如果冲击波中心与竞技场中心重合，默认向右反弹
    if (dist < 0.001) {
      return { x: center.x + arenaR, y: center.y };
    }
    // 反弹点 = 竞技场边界上沿冲击波中心方向的点
    return {
      x: center.x + (dx / dist) * arenaR,
      y: center.y + (dy / dist) * arenaR,
    };
  }

  /**
   * 前沿到达检测：获取在环形区域 [innerRadius, outerRadius] 内的对手
   * 只在冲击波前沿刚好到达对手位置时造成伤害，避免每帧重复伤害
   */
  private getOpponentsInRing(
    centerX: number, centerY: number,
    innerRadius: number, outerRadius: number,
    physics: IPhysicsQuery,
  ): { id: string; x: number; y: number }[] {
    // 获取外圆内的所有对手
    const allInOuter = physics.getAliveOpponentsInRadius(
      this.playerId, centerX, centerY, outerRadius,
    );

    // 过滤：只保留距离在 [innerRadius, outerRadius] 环内的对手
    return allInOuter.filter(opponent => {
      const dx = opponent.x - centerX;
      const dy = opponent.y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      return dist >= innerRadius && dist <= outerRadius;
    });
  }
}

// ─── 获取本武器范围配置 ───────────────────────────────
const CFG = WEAPON_RANGE_CONFIG[ShockwaveGeneratorWeapon.ID];
