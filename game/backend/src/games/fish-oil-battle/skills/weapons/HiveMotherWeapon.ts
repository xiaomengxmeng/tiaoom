/**
 * 武器 7：蜂巢母体 (HiveMother)
 *
 * 流派：工程师 Engineer (#39FF14)
 * 形态：浮游装置 + 投射物
 * 难度：⭐⭐
 *
 * ── 文档行为（2026-06-18 平衡性调整）──
 * 常驻特性：3 只纳米蜂绕球公转（半径 50px，周期 2 秒）
 * 自动触发：每只蜂独立冷却 1.2s，轮流发射蜂刺（全局间隔 0.4s，直线飞行，命中 1 伤害）
 *           同一时间只发射一个蜂刺，蜂刺碰墙即销毁（无反弹）
 * 受击惩罚：球碰球互撞时，随机消失 1 只蜂（最少保留 1 只），蜂数不恢复，同步前端蜂数
 * 充能方式：蜂刺命中 + 互撞 累计 7 次 → 触发爆发
 * 爆发效果：立即 +3 只蜂（上限 6 只，永久保留），伤害提升至 2，持续 5 秒
 *           爆发可多次触发（重新充能），前端蜂数同步更新，爆发结束后仅恢复视觉大小
 *
 * ── 范围检测 ──
 * - 蜂刺命中范围 = 30px（接近目标即判定命中）
 * - 蜂刺飞行由武器内部维护弹道列表
 */

import type { IBattleState } from '../../core/types';
import type {
  IWeapon, IPhysicsQuery, WeaponEffect, WeaponRuntimeState,
} from '../../core/IWeapon';
import { TICKS_PER_SEC } from '../../core/IWeapon';
import { WEAPON_RANGE_CONFIG } from '../../config/WeaponRangeConfig';
import { WeaponId, WeaponName, WeaponEffectType, VisualEventType, School } from '../../config/GameEnums';

interface StingerProjectile {
  id: string;
  targetId: string;
  x: number;
  y: number;
  vx: number;       // 固定方向速度 X
  vy: number;       // 固定方向速度 Y
  speed: number;
  damage: number;
  startX: number;   // 发射位置（视觉用）
  startY: number;   // 发射位置（视觉用）
  bounces: number;
  alive: boolean;
  lifetime: number; // 存活 tick 数（超出 STINGER_MAX_LIFETIME 强制销毁）
}

export class HiveMotherWeapon implements IWeapon {
  static readonly ID = WeaponId.HIVE_MOTHER;
  readonly id = WeaponId.HIVE_MOTHER;
  readonly name = WeaponName.HIVE_MOTHER;
  readonly school = School.ENGINEER;
  readonly difficulty = 2;
  readonly iconId = 'game-icons:hive-mind';
  playerId = '';

  private energy = 0;
  private tickCounter = 0;
  private isBurstActive = false;
  private burstTicksLeft = 0;
  private projectiles: StingerProjectile[] = [];
  private cooldowns: Record<string, number> = {};
  private stacks: Record<string, number> = {};
  private flags: Record<string, boolean> = {};

  /** 当前蜂数（受击惩罚会减少，爆发永久增加） */
  private currentBeeCount = 0; // 从配置中读取
  /** 每只蜂的独立冷却计时（tick序号） */
  private beeCooldowns: number[] = [];
  /** 轮流发射索引（指向下一只需要检查的蜂） */
  private fireQueueIndex: number = 0;
  /** 全局发射冷却计时（距离下次允许发射的剩余 tick 数） */
  private globalFireCooldown: number = 0;

  // ── 生命周期 ──────────────────────────────────────

  onTick(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    this.tickCounter++;

    // ── DEBUG: 每 20 tick（1秒）打印一次状态 ──
    const debugLog = (msg: string) => {
      if (this.tickCounter % 20 === 1) {
        console.log(`[HiveMother#${this.playerId}] T${this.tickCounter}: ${msg}`);
      }
    };

    const selfPos = physics.getSelfPosition(this.playerId);
    if (!selfPos) {
      debugLog('⚠️ getSelfPosition 返回 null/undefined — 球未进入物理引擎？');
      return effects;
    }
    debugLog(`selfPos=(${selfPos.x.toFixed(0)},${selfPos.y.toFixed(0)})`);

    const HM = CFG.hiveMother!;
    if (!HM) {
      console.error('[HiveMother] CFG.hiveMother 为 undefined！检查 WEAPON_RANGE_CONFIG');
      return effects;
    }
    const beeCooldownTicks = Math.round(HM.stingerCooldownPerBee * TICKS_PER_SEC); // 1.2s
    const globalIntervalTicks = Math.round(HM.stingerLaunchInterval * TICKS_PER_SEC); // 0.4s
    const beeCount = this.currentBeeCount;

    // 保持冷却数组大小
    while (this.beeCooldowns.length < beeCount) {
      this.beeCooldowns.push(-Infinity);
    }
    this.beeCooldowns.length = beeCount;

    // 如果发射索引超出范围（蜂数减少时），重置
    if (this.fireQueueIndex >= beeCount) {
      this.fireQueueIndex = 0;
    }

    // ── 全局发射冷却递减 ──
    if (this.globalFireCooldown > 0) {
      this.globalFireCooldown--;
    }

    // ── 轮流发射（同一时间只发射一个蜂刺，间隔 0.4s）──
    const opponents = physics.getAllAliveOpponents(this.playerId);
    debugLog(`beeCount=${beeCount} globalCD=${this.globalFireCooldown} opponents=${opponents.length} queueIdx=${this.fireQueueIndex}`);

    let skipReason = '';
    if (opponents.length === 0) skipReason = '无对手';
    else if (beeCount === 0) skipReason = 'beeCount=0';
    else if (this.globalFireCooldown > 0) skipReason = `全局CD剩余${this.globalFireCooldown}`;
    if (skipReason && this.tickCounter % 60 === 1) {
      console.log(`[HiveMother#${this.playerId}] 跳过发射: ${skipReason}`);
    }

    if (opponents.length > 0 && beeCount > 0 && this.globalFireCooldown <= 0) {
      // 从当前索引开始，轮询检查每只蜂是否冷却完毕
      for (let attempt = 0; attempt < beeCount; attempt++) {
        const i = this.fireQueueIndex;
        this.fireQueueIndex = (this.fireQueueIndex + 1) % beeCount;

        // 检查这只蜂的独立冷却是否完毕
        const cdRemaining = beeCooldownTicks - (this.tickCounter - this.beeCooldowns[i]);
        if (cdRemaining > 0) {
          debugLog(`🐝 bee#${i} 冷却中 (剩余 ${cdRemaining} ticks)`);
          continue;
        }

        // 可以发射！
        this.beeCooldowns[i] = this.tickCounter;
        const target = opponents[i % opponents.length];
        console.log(`[HiveMother#${this.playerId}] 🚀 蜂刺发射! bee#${i} → target=${target?.id || '?'}`);

        // 蜂围绕球体公转的偏移（2 秒周期）
        const orbitAngle = (this.tickCounter * 0.05 * Math.PI + (i * 2 * Math.PI) / beeCount) % (2 * Math.PI);
        const orbitRadius = CFG.hiveMother!.orbitRadius!;
        const startX = selfPos.x + Math.cos(orbitAngle) * orbitRadius;
        const startY = selfPos.y + Math.sin(orbitAngle) * orbitRadius;

        // 固定方向：向目标方向发射，不锁头
        const tdx = target.x - startX;
        const tdy = target.y - startY;
        const tdist = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
        const dirVx = (tdx / tdist) * CFG.projectile!.speed;
        const dirVy = (tdy / tdist) * CFG.projectile!.speed;

        this.projectiles.push({
          id: `sting_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
          targetId: target.id,
          x: startX,
          y: startY,
          vx: dirVx,
          vy: dirVy,
          speed: CFG.projectile!.speed,
          damage: this.isBurstActive ? HM.burstDamage : HM.stingerDamage,
          startX,
          startY,
          bounces: 0,
          alive: true,
          lifetime: 0,
        });

        // 飞行视觉事件（起点 + 方向，前端绘制弹道）
        effects.push({
          type: WeaponEffectType.VISUAL_ONLY,
          sourceId: this.playerId,
          value: 0,
          position: { x: startX, y: startY },
          metadata: {
            visualType: VisualEventType.HIVE_STING,
            tx: target.x,
            ty: target.y,
            stingId: `sting_${Date.now()}_${i}`,
          },
        });

        // 设置全局发射冷却
        this.globalFireCooldown = globalIntervalTicks;
        break; // 只发射一个，跳出循环
      }
    }

    // 推进投射物（固定方向飞行，碰墙即销毁）
    const center = physics.getArenaCenter();
    const arenaR = physics.getArenaRadius();
    const ballRadius = CFG.hiveMother!.ballRadius!;
    const maxLifetimeTicks = CFG.projectile!.maxLifetimeSec * TICKS_PER_SEC;

    for (const proj of this.projectiles) {
      if (!proj.alive) continue;

      proj.lifetime++;

      // 超出最大存活时间 → 强制销毁
      if (proj.lifetime > maxLifetimeTicks) {
        proj.alive = false;
        continue;
      }

      const targetState = state.getPlayer(proj.targetId);
      // 如果目标死亡，蜂刺继续沿当前方向飞行（可能反弹后误伤其他玩家暂不处理）

      // 按固定方向移动
      const moveAmount = proj.speed * 0.05; // 50ms per tick
      proj.x += (proj.vx / proj.speed) * moveAmount;
      proj.y += (proj.vy / proj.speed) * moveAmount;

      // 检测命中
      const hitDist = targetState && targetState.hp > 0
        ? Math.sqrt((proj.x - targetState.position.x) ** 2 + (proj.y - targetState.position.y) ** 2)
        : Infinity;

      if (hitDist < CFG.projectile!.hitRadius + (CFG.hiveMother!.ballRadius!)) {
        // 命中
        proj.alive = false;
        effects.push({
          type: WeaponEffectType.DAMAGE,
          sourceId: this.playerId,
          targetId: proj.targetId,
          value: proj.damage,
          metadata: { desc: '蜂刺伤害' },
        });

        if (!this.isBurstActive) {
          this.energy = Math.min(CFG.hiveMother!.maxEnergy, this.energy + 1);
        }

        // 命中视觉事件
        effects.push({
          type: WeaponEffectType.VISUAL_ONLY,
          sourceId: this.playerId,
          value: 0,
          aoe: { x: proj.x, y: proj.y, radius: 0 },
          metadata: {
            visualType: VisualEventType.HIVE_STING,
            targetId: proj.targetId,
            tx: proj.x,
            ty: proj.y,
          },
        });
        continue;
      }

      // 碰墙检测与反弹
      const distFromCenter = Math.sqrt(
        (proj.x - center.x) ** 2 + (proj.y - center.y) ** 2,
      );
      // 超出竞技场边界太远 → 立即销毁（安全兜底）
      if (distFromCenter > arenaR + 80) {
        proj.alive = false;
        continue;
      }
      if (distFromCenter + ballRadius > arenaR) {
        if (proj.bounces < CFG.projectile!.maxBounces) {
          proj.bounces++;
          // 法向反射
          const bnx = (proj.x - center.x) / distFromCenter;
          const bny = (proj.y - center.y) / distFromCenter;
          // 将蜂刺推回竞技场内（紧贴边界）
          proj.x = center.x + bnx * (arenaR - ballRadius - 1);
          proj.y = center.y + bny * (arenaR - ballRadius - 1);
          // 反射速度方向
          const dot = proj.vx * bnx + proj.vy * bny;
          proj.vx -= 2 * dot * bnx;
          proj.vy -= 2 * dot * bny;
          // 反弹视觉事件
          effects.push({
            type: WeaponEffectType.VISUAL_ONLY,
            sourceId: this.playerId,
            value: 0,
            position: { x: proj.x, y: proj.y },
            metadata: {
              visualType: VisualEventType.HIVE_STING_BOUNCE,
              stingId: proj.id,
              tx: proj.x + proj.vx * 0.5,
              ty: proj.y + proj.vy * 0.5,
            },
          });
        } else {
          // 超出反弹次数 → 立即销毁
          proj.alive = false;
        }
      }
    }

    // 清理已失效的投射物
    this.projectiles = this.projectiles.filter(p => p.alive);

    // 爆发倒计时
    if (this.isBurstActive) {
      this.burstTicksLeft--;
      if (this.burstTicksLeft <= 0) {
        this.isBurstActive = false;
      }
    }

    return effects;
  }

  onHitTarget(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    return [];
  }

  onHitByAttacker(_attackerId: string, _state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const HM = CFG.hiveMother!;

    // 互撞充能（非爆发期间）
    if (!this.isBurstActive) {
      this.energy = Math.min(HM.maxEnergy, this.energy + 1);
    }

    // 受击惩罚：随机消失 1 只蜂（最少保留 1 只）
    if (this.currentBeeCount > 1) {
      this.currentBeeCount--;

      // 蜂数减少时同步调整发射索引
      if (this.fireQueueIndex >= this.currentBeeCount) {
        this.fireQueueIndex = 0;
      }

      // 蜂数变化视觉事件（前端同步更新蜂群数量）
      effects.push({
        type: WeaponEffectType.VISUAL_ONLY,
        sourceId: this.playerId,
        value: 0,
        metadata: {
          visualType: VisualEventType.BEE_COUNT_CHANGE,
          desc: '纳米蜂被击落',
          beeCount: this.currentBeeCount,
          isBurst: false,
        },
      });
    }

    return effects;
  }

  // ── 能量爆发 ──────────────────────────────────────

  getEnergy(): number {
    return Math.round(this.energy / CFG.hiveMother!.maxEnergy * 100);
  }
  getMaxEnergy(): number {
    return 100;
  }

  setEnergy(percent: number): void {
    const max = CFG.hiveMother!.maxEnergy;
    this.energy = Math.max(0, Math.min(max, percent / 100 * max));
  }

  isBurstReady(): boolean {
    const HM = CFG.hiveMother!;
    return this.energy >= HM.maxEnergy && !this.isBurstActive;
  }

  burst(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const HM = CFG.hiveMother!;
    this.energy = 0;
    this.isBurstActive = true;
    this.burstTicksLeft = HM.burstDurationSec * TICKS_PER_SEC;

    // 永久 +3 蜂（上限 6 只）
    const prevCount = this.currentBeeCount;
    this.currentBeeCount = Math.min(HM.maxBeeCount, this.currentBeeCount + HM.burstBeeBonus);

    return [{
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      metadata: {
        visualType: VisualEventType.BURST_TRIGGER,
        desc: this.currentBeeCount >= HM.maxBeeCount ? '蜂群狂暴 · 蜂巢满编' : `蜂群狂暴 · +${this.currentBeeCount - prevCount}只纳米蜂`,
        beeCount: this.currentBeeCount,
        interval: HM.stingerCooldownPerBee,
        damage: HM.burstDamage,
        isBurst: true,
      },
    }];
  }

  // ── 状态 ──────────────────────────────────────────

  getRuntimeState(): WeaponRuntimeState {
    const HM = CFG.hiveMother!;
    return {
      energy: this.energy, maxEnergy: HM.maxEnergy,
      cooldowns: this.cooldowns, stacks: this.stacks, flags: this.flags,
      custom: {
        beeCount: this.currentBeeCount,
        maxBeeCount: HM.maxBeeCount,
        projectiles: this.projectiles.length,
        burstActive: this.isBurstActive,
      },
    };
  }

  reset(): void {
    const HM = CFG.hiveMother!;
    console.log(`[HiveMother#${this.playerId}] reset() - initialBeeCount=${HM.initialBeeCount} maxBee=${HM.maxBeeCount} cfgOK=${!!CFG.hiveMother}`);
    this.energy = 0;
    this.tickCounter = 0;
    this.isBurstActive = false;
    this.burstTicksLeft = 0;
    this.projectiles = [];
    this.cooldowns = {};
    this.stacks = {};
    this.flags = {};
    this.currentBeeCount = HM.initialBeeCount;
    this.beeCooldowns = [];
    this.fireQueueIndex = 0;
    this.globalFireCooldown = 0;
  }
}

// ─── 获取本武器范围配置 ───────────────────────────────
const CFG = WEAPON_RANGE_CONFIG[HiveMotherWeapon.ID];
