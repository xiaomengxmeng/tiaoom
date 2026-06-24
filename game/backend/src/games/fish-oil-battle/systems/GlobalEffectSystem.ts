/**
 * 赛博鱼油 · 全局彩蛋效果系统
 *
 * 职责：
 * - 每局随机激活1个全局彩蛋效果（影响所有玩家）
 * - 管理3个彩蛋的生命周期（古今观察者/俺寻思之力/万物亲和）
 * - 直接修改 PhysicsEngine 的球状态（速度扰动、位置回溯）
 * - 修改 BattleState 的伤害计算（伤害修正）
 * - 发送全局 VisualEvent 到前端
 *
 * 与 IWeapon 的区别：
 * - 归属：全局（非单个玩家）
 * - 触发：时间触发 或 常驻光环（非碰撞触发）
 * - 视觉层级：L5 全屏 或 L2 跨玩家渲染
 */

import type { IBattleState, PlayerState } from '../core/types';
import type { PhysicsEngine } from '../physics/PhysicsEngine';
import type { VisualEventData } from '../shared/protocol';
import { VisualEventType, GlobalEffectType } from '../config/GameEnums';

// ═══════════════════════════════════════════════════
//  全局效果接口
// ═══════════════════════════════════════════════════

export interface IGlobalEffect {
  readonly type: GlobalEffectType;
  readonly name: string;

  /** 对局开始时调用（一次性初始化） */
  onBattleStart(state: IBattleState, physics: PhysicsEngine): void;

  /**
   * 每 tick 调用（用于时间触发型效果）
   * @returns 产生的 VisualEvent 列表
   */
  onTick(tick: number, state: IBattleState, physics: PhysicsEngine): VisualEventData[];

  /**
   * 修改伤害值（如万物亲和的 -15% 互撞伤害）
   * @param baseDamage 原始伤害
   * @param attackerId 攻击者
   * @param victimId 受害者
   * @returns 修正后的伤害
   */
  modifyDamage?(baseDamage: number, attackerId: string, victimId: string): number;

  /**
   * 修改球速（如万物亲和的 +10% 移速）
   * @param playerId 玩家 ID
   * @param currentSpeed 当前速度
   * @returns 修正后的速度
   */
  modifySpeed?(playerId: string, currentSpeed: number): number;

  /** 对局结束时调用 */
  onBattleEnd(): void;
}

// ═══════════════════════════════════════════════════
//  1. 古今观察者（小梦）- 开局15秒回溯
// ═══════════════════════════════════════════════════

/** 状态快照（用于回溯） */
interface StateSnapshot {
  tick: number;
  players: Record<string, { x: number; y: number; hp: number }>;
}

class TimeObserverEffect implements IGlobalEffect {
  readonly type = GlobalEffectType.TIME_OBSERVER;
  readonly name = '古今观察者';

  private stateHistory: StateSnapshot[] = [];
  private hasTriggered = false;

  /** 触发时的 tick（开局 15 秒 = 300 tick @ 20fps） */
  private static readonly TRIGGER_TICK = 300;
  /** 回溯秒数 */
  private static readonly REWIND_SEC = 2;
  /** 回溯 tick 数 */
  private static readonly REWIND_TICKS = TimeObserverEffect.REWIND_SEC * 20;
  /** 快照记录间隔（每 0.5 秒 = 10 tick） */
  private static readonly SNAPSHOT_INTERVAL = 10;
  /** 最大快照保留数 */
  private static readonly MAX_SNAPSHOTS = 120;

  onBattleStart(): void {
    this.stateHistory = [];
    this.hasTriggered = false;
  }

  onTick(tick: number, state: IBattleState, physics: PhysicsEngine): VisualEventData[] {
    const events: VisualEventData[] = [];

    // 1. 记录历史快照
    if (tick % TimeObserverEffect.SNAPSHOT_INTERVAL === 0) {
      this.recordSnapshot(tick, state);
    }

    // 2. 开局 15 秒时触发回溯（只触发一次）
    if (!this.hasTriggered && tick >= TimeObserverEffect.TRIGGER_TICK) {
      this.triggerRevert(tick, state, physics);
      this.hasTriggered = true;

      events.push({
        type: VisualEventType.GLOBAL_EFFECT,
        globalEffectType: GlobalEffectType.TIME_OBSERVER,
        x: 0,
        y: 0,
        durationMs: 100, // 闪白 0.1 秒
      });

      console.log(`[GlobalEffect] 古今观察者触发回溯 tick=${tick}`);
    }

    return events;
  }

  /** 记录当前帧的快照 */
  private recordSnapshot(tick: number, state: IBattleState): void {
    const snapshot: StateSnapshot = {
      tick,
      players: {},
    };

    for (const [id, player] of state.players) {
      snapshot.players[id] = {
        x: player.position.x,
        y: player.position.y,
        hp: player.hp,
      };
    }

    this.stateHistory.push(snapshot);

    // 只保留最近快照
    if (this.stateHistory.length > TimeObserverEffect.MAX_SNAPSHOTS) {
      this.stateHistory.shift();
    }
  }

  /** 执行真实回溯（位置 + 血量） */
  private triggerRevert(currentTick: number, state: IBattleState, physics: PhysicsEngine): void {
    const targetTick = currentTick - TimeObserverEffect.REWIND_TICKS;

    // 找到 ≤ targetTick 的最近快照
    let bestSnapshot: StateSnapshot | undefined;
    for (const snap of this.stateHistory) {
      if (snap.tick <= targetTick) {
        bestSnapshot = snap;
      } else {
        break;
      }
    }

    if (!bestSnapshot) {
      console.warn(`[GlobalEffect] 古今观察者：未找到 ${TimeObserverEffect.REWIND_SEC} 秒前的历史记录`);
      return;
    }

    // 回溯所有玩家的状态和物理位置
    for (const [id, player] of state.players) {
      const pastState = bestSnapshot.players[id];
      if (!pastState) continue;

      const wasDead = player.hp <= 0;

      // 回溯位置
      player.position.x = pastState.x;
      player.position.y = pastState.y;

      // 回溯血量：如果回溯后 HP > 0，复活
      player.hp = pastState.hp;

      // 同步到物理引擎
      const ball = physics.getBall(id);
      if (ball) {
        ball.x = pastState.x;
        ball.y = pastState.y;
      } else if (pastState.hp > 0) {
        // 之前已死亡的玩家：重新加入物理引擎
        physics.addBall(id, pastState.x, pastState.y);
        console.log(`[GlobalEffect] 古今观察者复活: ${player.name}`);
      }

      if (wasDead && pastState.hp > 0) {
        console.log(`[GlobalEffect] 古今观察者复活: ${player.name} (HP: 0 → ${pastState.hp})`);
      }
    }
  }

  onBattleEnd(): void {
    this.stateHistory = [];
  }
}

// ═══════════════════════════════════════════════════
//  2. 俺寻思之力（薯饼）- 每10秒速度扰动
// ═══════════════════════════════════════════════════

class RandomForceEffect implements IGlobalEffect {
  readonly type = GlobalEffectType.RANDOM_FORCE;
  readonly name = '俺寻思之力';

  /** 触发间隔（10 秒 = 200 tick @ 20fps） */
  private static readonly INTERVAL_TICKS = 200;
  /** 首次触发延迟（可选偏移，避免与古今观察者冲突） */
  private static readonly FIRST_TRIGGER_OFFSET = 40; // 2 秒延迟
  private nextTriggerTick = RandomForceEffect.INTERVAL_TICKS + RandomForceEffect.FIRST_TRIGGER_OFFSET;
  /** 速度扰动因子（0.95 ~ 1.05） */
  private static readonly SPEED_MIN = 0.95;
  private static readonly SPEED_MAX = 1.05;
  /** 方向扰动角度（±3°，转换为弧度） */
  private static readonly ANGLE_JITTER_DEG = 6; // ±3° = 6° 范围

  onBattleStart(): void {
    this.nextTriggerTick = RandomForceEffect.INTERVAL_TICKS + RandomForceEffect.FIRST_TRIGGER_OFFSET;
  }

  onTick(tick: number, _state: IBattleState, physics: PhysicsEngine): VisualEventData[] {
    const events: VisualEventData[] = [];

    if (tick >= this.nextTriggerTick) {
      this.applyRandomForce(physics);

      events.push({
        type: VisualEventType.GLOBAL_EFFECT,
        globalEffectType: GlobalEffectType.RANDOM_FORCE,
        x: 0,
        y: 0,
        durationMs: 150, // 马赛克闪动 0.15 秒
      });

      this.nextTriggerTick = tick + RandomForceEffect.INTERVAL_TICKS;

      console.log(`[GlobalEffect] 俺寻思之力触发扰动 tick=${tick}`);
    }

    return events;
  }

  private applyRandomForce(physics: PhysicsEngine): void {
    for (const ball of physics.getAllBalls()) {
      // ±5% 速度扰动
      const speedMultiplier = RandomForceEffect.SPEED_MIN
        + Math.random() * (RandomForceEffect.SPEED_MAX - RandomForceEffect.SPEED_MIN);

      // ±3° 方向扰动
      const jitterRad = (Math.random() - 0.5) * RandomForceEffect.ANGLE_JITTER_DEG * (Math.PI / 180);

      const currentAngle = Math.atan2(ball.vy, ball.vx);
      const newAngle = currentAngle + jitterRad;
      const newSpeed = ball.speed * speedMultiplier;

      // 直接修改物理引擎中的球（getAllBalls 返回副本，需要用 modifyBallSpeed）
      physics.modifyBallSpeed(ball.id, newSpeed, newAngle);
    }
  }

  onBattleEnd(): void {}
}

// ═══════════════════════════════════════════════════
//  3. 万物亲和（君）- 常驻光环
// ═══════════════════════════════════════════════════

class NatureBondEffect implements IGlobalEffect {
  readonly type = GlobalEffectType.NATURE_BOND;
  readonly name = '万物亲和';

  /** 牵引线发送间隔（每 0.5 秒 = 10 tick） */
  private static readonly BOND_LINE_INTERVAL = 10;
  /** 互撞伤害修正系数 */
  static readonly DAMAGE_MULTIPLIER = 0.85; // -15%
  /** 移速修正系数 */
  static readonly SPEED_MULTIPLIER = 1.10; // +10%

  onBattleStart(): void {}

  onTick(tick: number, state: IBattleState, _physics: PhysicsEngine): VisualEventData[] {
    const events: VisualEventData[] = [];

    // 每 0.5 秒发送一次牵引线绘制事件
    if (tick % NatureBondEffect.BOND_LINE_INTERVAL === 0) {
      const alive = Array.from(state.players.values()).filter(p => p.hp > 0);

      if (alive.length >= 2) {
        // 按血量 + 击杀数排序：第一名 vs 最后一名
        const sorted = [...alive].sort((a, b) => {
          if (a.hp !== b.hp) return b.hp - a.hp;
          return b.kills - a.kills;
        });

        const first = sorted[0];
        const last = sorted[sorted.length - 1];

        // 只在第一名和最后一名之间绘制牵引线
        if (first.id !== last.id) {
          const dist = Math.sqrt(
            (first.position.x - last.position.x) ** 2 +
            (first.position.y - last.position.y) ** 2,
          );

          events.push({
            type: VisualEventType.GLOBAL_EFFECT,
            globalEffectType: GlobalEffectType.NATURE_BOND,
            playerId: first.id,
            targetId: last.id,
            x: first.position.x,
            y: first.position.y,
            tx: last.position.x,
            ty: last.position.y,
            radius: dist, // 用 radius 传递距离（前端计算线亮度）
          });
        }
      }
    }

    return events;
  }

  modifyDamage(baseDamage: number, _attackerId: string, _victimId: string): number {
    return Math.round(baseDamage * NatureBondEffect.DAMAGE_MULTIPLIER);
  }

  modifySpeed(_playerId: string, currentSpeed: number): number {
    return currentSpeed * NatureBondEffect.SPEED_MULTIPLIER;
  }

  onBattleEnd(): void {}
}

// ═══════════════════════════════════════════════════
//  全局效果系统（核心调度器）
// ═══════════════════════════════════════════════════

/** 所有可用的彩蛋效果（按数组索引随机选取） */
const ALL_EFFECTS: readonly IGlobalEffect[] = [
  new TimeObserverEffect(),
  new RandomForceEffect(),
  new NatureBondEffect(),
];

export class GlobalEffectSystem {
  private activeEffect: IGlobalEffect | null = null;

  /** 当前激活的彩蛋类型 */
  get activeType(): GlobalEffectType {
    return this.activeEffect?.type ?? GlobalEffectType.NONE;
  }

  /** 当前激活的彩蛋名称 */
  get activeName(): string {
    return this.activeEffect?.name ?? '无';
  }

  /**
   * 随机选择一个彩蛋并激活
   * @returns 激活的彩蛋类型
   */
  activateRandom(): GlobalEffectType {
    const idx = Math.floor(Math.random() * ALL_EFFECTS.length);
    this.activeEffect = ALL_EFFECTS[idx];
    console.log(`[GlobalEffect] 随机激活彩蛋: ${this.activeEffect.name} (${this.activeEffect.type})`);
    return this.activeEffect.type;
  }

  /** 停用当前彩蛋 */
  deactivate(): void {
    if (this.activeEffect) {
      this.activeEffect.onBattleEnd();
      this.activeEffect = null;
    }
  }

  // ── 生命周期转发 ──────────────────────────────────

  onBattleStart(state: IBattleState, physics: PhysicsEngine): void {
    if (!this.activeEffect) {
      this.activateRandom();
    }
    this.activeEffect!.onBattleStart(state, physics);
  }

  onTick(tick: number, state: IBattleState, physics: PhysicsEngine): VisualEventData[] {
    if (!this.activeEffect) return [];
    return this.activeEffect.onTick(tick, state, physics);
  }

  modifyDamage(baseDamage: number, attackerId: string, victimId: string): number {
    if (!this.activeEffect?.modifyDamage) return baseDamage;
    return this.activeEffect.modifyDamage(baseDamage, attackerId, victimId);
  }

  modifySpeed(playerId: string, currentSpeed: number): number {
    if (!this.activeEffect?.modifySpeed) return currentSpeed;
    return this.activeEffect.modifySpeed(playerId, currentSpeed);
  }

  onBattleEnd(): void {
    this.deactivate();
  }
}
