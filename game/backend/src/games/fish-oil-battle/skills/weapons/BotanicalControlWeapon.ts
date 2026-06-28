/**
 * 武器：植物伙伴派对 (Botanical Party) - 沐里
 *
 * 流派：变奏者 Wildcard
 * 难度：⭐⭐⭐
 *
 * ── 文档行为 ──
 * 被动 A（植物生成）：球体碰撞时 80% 概率生成植物（每 0.5 秒最多 1 次）
 *           植物持续 6 秒，影响半径 40px，场上最多 5 株（超过时最早生成的那株枯萎）
 * 被动 B（性格系统）：每株植物生成时随机分配性格
 *           🌸 温柔型(30%)：沐里获得减伤 30% 护盾，持续 3 秒
 *           🌿 暴躁型(40%)：附近对手持续受伤 3 HP/秒
 *           🌼 好奇型(30%)：附近对手移动速度 -30%
 * 充能：每次碰撞获得 25 能量（无论是否生成植物），满 100 可释放
 * 爆发（植物派对）：持续 4 秒，所有植物进入兴奋状态
 *       体型 1.5 倍 + 发光，性格效果翻倍（护盾 30%→60%，伤害 3→6，减速 30%→60%）
 *       新生植物直接以兴奋状态出现，爆发结束所有植物枯萎飘咖啡香气
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
import type { HitReaction } from '../../shared/protocol';

/** 植物性格类型：gentle 温柔 / fierce 暴躁 / curious 好奇 */
type PlantPersonality = 'gentle' | 'fierce' | 'curious';

/** 活跃植物实体 */
interface BotanicalPlant {
  id: string;
  personality: PlantPersonality;
  x: number;
  y: number;
  radius: number;
  /** 剩余存活 tick */
  ticksLeft: number;
}

export class BotanicalControlWeapon implements IWeapon {
  static readonly ID = WeaponId.BOTANICAL_CONTROL;
  readonly id = WeaponId.BOTANICAL_CONTROL;
  readonly name = WeaponName.BOTANICAL_CONTROL;
  readonly school = School.WILD;
  readonly difficulty = 3;
  readonly iconId = 'game-icons:plant-party';
  playerId = '';

  private energy = 0;
  private isBurstActive = false;
  /** 爆发剩余 tick */
  private burstTicksLeft = 0;
  /** 爆发冷却剩余 tick */
  private burstCooldownTicksLeft = 0;

  /** 活跃植物列表（按生成顺序，FIFO） */
  private plants: BotanicalPlant[] = [];
  /** 植物生成限频计数（tick） */
  private spawnCooldownTicks = 0;
  /** 植物 ID 自增计数 */
  private plantIdCounter = 0;

  private cooldowns: Record<string, number> = {};
  private stacks: Record<string, number> = {};
  private flags: Record<string, boolean> = {};
  private tickCounter = 0;

  /** 植物生成概率（80%） */
  private readonly spawnProbability = 0.8;
  /** 性格概率权重 */
  private readonly personalityWeights = { gentle: 0.3, fierce: 0.4, curious: 0.3 };

  // ── 生命周期 ──────────────────────────────────────

  onTick(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const CFG = WEAPON_RANGE_CONFIG[this.id];
    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    this.tickCounter++;
    const isSecondTick = this.tickCounter >= TICKS_PER_SEC;
    if (isSecondTick) this.tickCounter = 0;

    // 限频与冷却递减
    if (this.spawnCooldownTicks > 0) this.spawnCooldownTicks--;
    if (this.burstCooldownTicksLeft > 0) this.burstCooldownTicksLeft--;

    // 爆发剩余时间递减（每 tick 递减，确保 4 秒精确结束）
    if (this.isBurstActive) {
      if (this.burstTicksLeft <= 0) {
        // 爆发结束：所有植物同时枯萎，飘咖啡香气粒子
        this.isBurstActive = false;
        for (const p of this.plants) {
          effects.push(this.buildDecayEffect(p));
        }
        this.plants = [];
      } else {
        this.burstTicksLeft--;
      }
    }

    // 每秒处理植物性格效果 + 自然枯萎
    if (isSecondTick) {
      const radius = CFG.damageRadius ?? 40;
      const burstMultiplier = this.isBurstActive ? 2 : 1;

      const survivors: BotanicalPlant[] = [];
      for (const plant of this.plants) {
        plant.ticksLeft--;

        // 仍存活则施加性格效果
        if (plant.ticksLeft > 0) {
          survivors.push(plant);
          this.applyPersonalityEffect(effects, plant, physics, radius, burstMultiplier);
        } else {
          // 自然枯萎：派发枯萎事件
          effects.push(this.buildDecayEffect(plant));
        }
      }
      this.plants = survivors;
    }

    // ── 周期性发送植物状态同步（每 5 tick ≈ 83ms 一次） ──
    // 让前端始终能看到存活植物 + 兴奋状态（即使未碰撞也保持可见）
    // plants 数组携带全部存活植物，isBurst 标识是否处于植物派对爆发期间
    if (this.tickCounter % 5 === 0) {
      effects.push({
        type: WeaponEffectType.VISUAL_ONLY,
        sourceId: this.playerId,
        value: 0,
        position: { x: self.position.x, y: self.position.y },
        metadata: {
          visualType: VisualEventType.BOTANICAL_PLANT_SPAWN,
          isBurst: this.isBurstActive,
          plants: this.plants.map(p => ({
            id: p.id,
            personality: p.personality,
            x: p.x,
            y: p.y,
            radius: p.radius,
            ticksLeft: p.ticksLeft,
          })),
        },
      });
    }

    return effects;
  }

  onHitTarget(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    // 主动碰撞时获得能量（无论是否生成植物）
    this.gainEnergy(WEAPON_RANGE_CONFIG[this.id].energyPerHit ?? 25);
    return [];
  }

  getHitReaction(): HitReaction {
    return 'burn';
  }

  onHitByAttacker(_attackerId: string, state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const CFG = WEAPON_RANGE_CONFIG[this.id];

    // 每次碰撞获得能量（无论是否生成植物）
    this.gainEnergy(CFG.energyPerHit ?? 25);

    // 生成限频：每 0.5 秒最多 1 次
    const minIntervalTicks = Math.max(
      1,
      Math.round((CFG.triggerCooldowns?.minIntervalMs ?? 500) / (1000 / TICKS_PER_SEC)),
    );
    if (this.spawnCooldownTicks > 0) return effects;
    this.spawnCooldownTicks = minIntervalTicks;

    // 80% 概率生成植物
    if (Math.random() > this.spawnProbability) return effects;

    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    // 生成位置：沐里当前位置（碰撞点近似）
    const x = self.position.x;
    const y = self.position.y;
    const radius = CFG.damageRadius ?? 40;
    const maxCount = CFG.field?.maxCount ?? 5;

    // 超过最大数量时移除最早的植物
    while (this.plants.length >= maxCount) {
      const oldest = this.plants.shift();
      if (oldest) effects.push(this.buildDecayEffect(oldest));
    }

    // 随机分配性格并生成植物
    const personality = this.rollPersonality();
    const plantId = `muli-plant-${++this.plantIdCounter}`;
    const durationSec = CFG.field?.durationSec ?? 6;
    const plant: BotanicalPlant = {
      id: plantId,
      personality,
      x,
      y,
      radius,
      ticksLeft: durationSec * TICKS_PER_SEC,
    };
    this.plants.push(plant);

    // 派发生成视觉事件
    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x, y },
      metadata: {
        visualType: VisualEventType.BOTANICAL_PLANT_SPAWN,
        plantId,
        personality,
        x,
        y,
        radius,
      },
    });

    // 温柔型：生成时立即给沐里施加护盾（爆发期效果翻倍）
    if (personality === 'gentle') {
      const burstMultiplier = this.isBurstActive ? 2 : 1;
      effects.push({
        type: WeaponEffectType.SHIELD,
        sourceId: this.playerId,
        targetId: this.playerId,
        value: 30 * burstMultiplier,
        duration: 3,
        metadata: {
          desc: `温柔型植物护盾${this.isBurstActive ? '（爆发）' : ''}`,
        },
      });
    }

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

  burst(state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    if (!this.isBurstReady()) return [];
    const CFG = WEAPON_RANGE_CONFIG[this.id];

    this.energy = 0;
    this.isBurstActive = true;
    this.burstTicksLeft = (CFG.burstDurationSec ?? 4) * TICKS_PER_SEC;
    this.burstCooldownTicksLeft = Math.round(
      ((CFG.cooldownMs ?? 8000) / 1000) * TICKS_PER_SEC,
    );

    const durationMs = (CFG.burstDurationSec ?? 4) * 1000;
    const radius = CFG.aoeMaxRadius ?? 60;
    const self = state.getPlayer(this.playerId);

    // 派发爆发视觉事件（植物派对启动）
    return [{
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: self?.position ? { x: self.position.x, y: self.position.y } : undefined,
      metadata: {
        visualType: VisualEventType.BOTANICAL_BURST,
        isBurst: true,
        radius,
        durationMs,
        plantCount: this.plants.length,
        desc: '植物派对爆发',
      },
    }];
  }

  // ── 内部方法 ──────────────────────────────────────

  /** 随机分配植物性格（温柔 30% / 暴躁 40% / 好奇 30%） */
  private rollPersonality(): PlantPersonality {
    const r = Math.random();
    const gentle = this.personalityWeights.gentle;
    const fierce = this.personalityWeights.fierce;
    if (r < gentle) return 'gentle';
    if (r < gentle + fierce) return 'fierce';
    return 'curious';
  }

  /** 充能（爆发期间暂停充能） */
  private gainEnergy(amount: number): void {
    if (this.isBurstActive) return;
    const max = WEAPON_RANGE_CONFIG[this.id].burstEnergyCost
      ?? WEAPON_RANGE_CONFIG[this.id].maxEnergy!;
    this.energy = Math.min(max, this.energy + amount);
  }

  /** 施加植物性格效果（暴躁型伤害 / 好奇型减速，温柔型在生成时已施加护盾） */
  private applyPersonalityEffect(
    effects: WeaponEffect[],
    plant: BotanicalPlant,
    physics: IPhysicsQuery,
    radius: number,
    burstMultiplier: number,
  ): void {
    const opponents = physics.getAliveOpponentsInRadius(this.playerId, plant.x, plant.y, radius);
    const burstTag = this.isBurstActive ? '（爆发）' : '';

    if (plant.personality === 'fierce') {
      // 暴躁型：附近对手持续受伤（爆发期翻倍）
      const dmg = (WEAPON_RANGE_CONFIG[this.id].damage ?? 3) * burstMultiplier;
      for (const opp of opponents) {
        effects.push({
          type: WeaponEffectType.DAMAGE,
          sourceId: this.playerId,
          targetId: opp.id,
          value: dmg,
          metadata: { desc: `暴躁型植物伤害${burstTag}` },
        });
      }
    } else if (plant.personality === 'curious') {
      // 好奇型：附近对手移动速度 -30%（爆发期 -60%）
      const slow = 30 * burstMultiplier;
      for (const opp of opponents) {
        effects.push({
          type: WeaponEffectType.SLOW,
          sourceId: this.playerId,
          targetId: opp.id,
          value: slow,
          duration: 1,
          metadata: { desc: `好奇型植物减速${burstTag}` },
        });
      }
    }
    // 温柔型：护盾在植物生成时已施加，此处不再重复
  }

  /** 构建植物枯萎视觉事件 */
  private buildDecayEffect(plant: BotanicalPlant): WeaponEffect {
    return {
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: plant.x, y: plant.y },
      metadata: {
        visualType: VisualEventType.BOTANICAL_PLANT_DECAY,
        plantId: plant.id,
        x: plant.x,
        y: plant.y,
      },
    };
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
        plantCount: this.plants.length,
        burstTicksLeft: this.burstTicksLeft,
        burstCooldownTicksLeft: this.burstCooldownTicksLeft,
        plants: this.plants.map(p => ({ id: p.id, personality: p.personality })),
      },
    };
  }

  reset(): void {
    this.energy = 0;
    this.isBurstActive = false;
    this.burstTicksLeft = 0;
    this.burstCooldownTicksLeft = 0;
    this.plants = [];
    this.spawnCooldownTicks = 0;
    this.plantIdCounter = 0;
    this.tickCounter = 0;
    this.cooldowns = {};
    this.stacks = {};
    this.flags = {};
  }
}
