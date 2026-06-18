/**
 * 武器 5：防火墙协议 (FirewallProtocol)
 *
 * 流派：控制者 Controller (#00BFFF)
 * 形态：场地装置（场地印记）
 * 难度：⭐
 *
 * ── 文档行为 ──
 * 常驻特性：每次受击在受击位置生成防火墙（持续 5 秒），
 *           对手在 100px 范围内移速 -40% + 4 伤害/tick
 *           场上最多 3 面墙
 * 充能方式：每受到 15 伤害充能 1 格，满 4 格触发
 * 爆发效果：所有防火墙实体化为硬墙（4 秒），
 *           不可穿越，碰墙额外 +6 伤害
 *
 * ── 范围检测 ──
 * - 防火墙影响范围 = 100px（六边形半径）
 * - 特效视觉范围 = 后端传入的 100px（与逻辑一致）
 */

import type { IBattleState } from '../../core/types';
import type {
  IWeapon, IPhysicsQuery, WeaponEffect, WeaponRuntimeState, PhysicsObstacle,
} from '../../core/IWeapon';
import { TICKS_PER_SEC } from '../../core/IWeapon';
import { WEAPON_RANGE_CONFIG } from '../../config/WeaponRangeConfig';
import { WeaponId, WeaponName, WeaponEffectType, VisualEventType, School } from '../../config/GameEnums';

interface Firewall {
  id: string;
  x: number;
  y: number;
  /** 剩余存活秒数 */
  secondsLeft: number;
  spawnedAt: number;
  /** 本轮已命中对手 ID（离开范围后清除，允许再次触发接触伤害） */
  hitOpponentIds: Set<string>;
}

export class FirewallProtocolWeapon implements IWeapon {
  static readonly ID = WeaponId.FIREWALL_PROTOCOL;
  readonly id = WeaponId.FIREWALL_PROTOCOL;
  readonly name = WeaponName.FIREWALL_PROTOCOL;
  readonly school = School.CONTROLLER;
  readonly difficulty = 1;
  readonly iconId = 'game-icons:firewall';
  playerId = '';

  private energy = 0;
  private activeFirewalls: Firewall[] = [];
  private isBurstActive = false;
  /** 爆发剩余秒数 */
  private burstSecondsLeft = 0;
  private lastKnownTotalDamage = 0;
  private cooldowns: Record<string, number> = {};
  private stacks: Record<string, number> = {};
  private flags: Record<string, boolean> = {};
  /** 秒级内部计数器（onTick 每 tick 调用，靠此实现每秒一次的生命周期递减） */
  private tickCounter = 0;

  // ── 生命周期 ──────────────────────────────────────

  onTick(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const FIELD = CFG.field!;

    // ── 秒级计数器：每 TICKS_PER_SEC tick 执行一次生命周期递减 ──
    this.tickCounter++;
    const isSecondTick = this.tickCounter >= TICKS_PER_SEC;
    if (isSecondTick) {
      this.tickCounter = 0;
    }

    // 防火墙生命周期管理 + 接触伤害
    this.activeFirewalls = this.activeFirewalls.filter(fw => {
      // 每秒递减一次剩余秒数
      if (isSecondTick) {
        fw.secondsLeft--;
      }
      if (fw.secondsLeft <= 0) return false;

      // 获取当前在范围内的对手
      const nearby = physics.getAliveOpponentsInRadius(
        this.playerId, fw.x, fw.y, FIELD.radius,
      );
      const currentOpponentIds = new Set(nearby.map(o => o.id));

      // 检查新进入的对手（不在 hitOpponentIds 中 → 施加一次接触伤害）
      for (const opponent of nearby) {
        if (!fw.hitOpponentIds.has(opponent.id)) {
          fw.hitOpponentIds.add(opponent.id);
          effects.push({
            type: WeaponEffectType.DAMAGE,
            sourceId: this.playerId,
            targetId: opponent.id,
            value: FIELD.contactDamage!,
            metadata: {
              fwId: fw.id,
              hardened: this.isBurstActive,
              desc: this.isBurstActive ? '防火墙硬化接触伤害' : '防火墙接触伤害',
            },
          });
        }

        // 始终刷新减速
        effects.push({
          type: WeaponEffectType.SLOW,
          sourceId: this.playerId,
          targetId: opponent.id,
          value: FIELD.slowPercent!,
          duration: 1,
          metadata: { desc: '防火墙穿越减速' },
        });
      }

      // 清除已离开范围的对手（允许下次再进入时触发接触伤害）
      const toRemove: string[] = [];
      for (const id of fw.hitOpponentIds) {
        if (!currentOpponentIds.has(id)) {
          toRemove.push(id);
        }
      }
      for (const id of toRemove) {
        fw.hitOpponentIds.delete(id);
      }

      return true;
    });

    // 爆发倒计时（每秒递减一次）
    if (this.isBurstActive && isSecondTick) {
      this.burstSecondsLeft--;
      if (this.burstSecondsLeft <= 0) {
        this.isBurstActive = false;
      }
    }

    // 受击充能检测
    const player = state.getPlayer(this.playerId);
    if (player && player.totalDamageTaken > this.lastKnownTotalDamage) {
      const gained = Math.floor(player.totalDamageTaken / FIELD.damagePerEnergy!) -
                     Math.floor(this.lastKnownTotalDamage / FIELD.damagePerEnergy!);
      if (gained > 0) {
        this.energy = Math.min(CFG.maxEnergy!, this.energy + gained);
      }
      this.lastKnownTotalDamage = player.totalDamageTaken;
    }

    return effects;
  }

  onHitTarget(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    return [];
  }

  onHitByAttacker(state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const player = state.getPlayer(this.playerId);
    if (!player) return effects;

    // 生成防火墙（最多 3 面）
    if (this.activeFirewalls.length < CFG.field!.maxCount) {
      const fwId = `fw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      this.activeFirewalls.push({
        id: fwId,
        x: player.position.x,
        y: player.position.y,
        secondsLeft: CFG.field!.durationSec,  // 秒数（不再 × TICKS_PER_SEC）
        spawnedAt: Date.now(),
        hitOpponentIds: new Set(),
      });

      effects.push({
        type: WeaponEffectType.VISUAL_ONLY,
        sourceId: this.playerId,
        value: 0,
        position: { x: player.position.x, y: player.position.y },
        metadata: {
          visualType: VisualEventType.FIREWALL_SPAWN,
          fwId,
          radius: CFG.field!.radius,
          visualWidth: CFG.field!.visualWidth ?? 100,
          visualHeight: CFG.field!.visualHeight ?? 40,
          durationSec: CFG.field!.durationSec,
          count: this.activeFirewalls.length,
          max: CFG.field!.maxCount,
          hardened: this.isBurstActive,
        },
      });
    }

    return effects;
  }

  /**
   * 对手碰撞到硬化防火墙时触发——反弹并受到额外伤害。
   * 只在硬化（爆发）状态下生效。
   */
  onObstacleHit(hittingPlayerId: string, _state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    // 不伤害创造者自己
    if (hittingPlayerId === this.playerId) return [];
    if (!this.isBurstActive) return [];
    return [{
      type: WeaponEffectType.DAMAGE,
      sourceId: this.playerId,
      targetId: hittingPlayerId,
      value: CFG.field!.burstHardenDamage!,
      metadata: { desc: '硬化防火墙碰撞伤害' },
    }];
  }

  // ── 能量爆发 ──────────────────────────────────────

  getEnergy(): number { return this.energy; }
  getMaxEnergy(): number { return CFG.maxEnergy!; }

  isBurstReady(): boolean {
    return this.energy >= CFG.maxEnergy! && !this.isBurstActive;
  }

  burst(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    this.energy = 0;
    this.isBurstActive = true;
    this.burstSecondsLeft = CFG.burstDurationSec!;  // 秒数（不再 × TICKS_PER_SEC）

    return [{
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      metadata: {
        visualType: VisualEventType.BURST_TRIGGER,
        desc: '全面封锁 · 防火墙硬化',
        firewallCount: this.activeFirewalls.length,
      },
    }];
  }

  // ── 物理障碍 ────────────────────────────────────

  /**
   * 返回硬化防火墙的物理碰撞边界，供物理引擎反弹角色。
   * 只在爆发（isBurstActive）时返回有效障碍物。
   */
  getObstacles(): PhysicsObstacle[] {
    if (!this.isBurstActive) return [];
    return this.activeFirewalls.map(fw => ({
      x: fw.x,
      y: fw.y,
      radius: CFG.field!.radius,
      width: CFG.field!.width,
      height: CFG.field!.height,
      sourceId: this.playerId,
    }));
  }

  // ── 状态 ──────────────────────────────────────────

  getRuntimeState(): WeaponRuntimeState {
    return {
      energy: this.energy, maxEnergy: CFG.maxEnergy!,
      cooldowns: this.cooldowns, stacks: this.stacks, flags: this.flags,
      custom: {
        activeFirewalls: this.activeFirewalls.length,
        hardened: this.isBurstActive,
        burstSecondsLeft: this.burstSecondsLeft,
      },
    };
  }

  reset(): void {
    this.energy = 0;
    this.activeFirewalls = [];
    this.isBurstActive = false;
    this.burstSecondsLeft = 0;
    this.lastKnownTotalDamage = 0;
    this.tickCounter = 0;
    this.cooldowns = {};
    this.stacks = {};
    this.flags = {};
  }
}

// ─── 获取本武器范围配置 ───────────────────────────────
const CFG = WEAPON_RANGE_CONFIG[FirewallProtocolWeapon.ID];
