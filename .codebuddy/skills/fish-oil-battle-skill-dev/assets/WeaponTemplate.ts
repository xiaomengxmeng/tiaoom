/**
 * 武器模板 - [武器名称]
 *
 * 流派：[AGGRESSOR / CONTROLLER / ENGINEER / WILDCARD]
 * 难度：⭐ [1-3]
 *
 * [武器机制描述]
 *
 * 使用方法：
 * 1. 复制此文件到 skills/weapons/ 目录
 * 2. 重命名类名和文件名
 * 3. 实现 TODO 标记的方法
 * 4. 在 WeaponRegistry.ts 中注册
 * 5. 在 GameEnums.ts 中添加 WeaponId 和 WeaponName
 * 6. 在 WeaponRangeConfig.ts 中添加配置
 */


// import type { IBattleState } from '../../core/types';
// import type {
//   IWeapon, IPhysicsQuery, WeaponEffect,
// } from '../../core/IWeapon';
// import { WEAPON_RANGE_CONFIG } from '../../config/WeaponRangeConfig';
// import { WeaponId, WeaponName, WeaponEffectType, VisualEventType, School } from '../../config/GameEnums';

// export class YourWeapon implements IWeapon {
//   static readonly ID = WeaponId.YOUR_WEAPON_ID;
//   readonly id = WeaponId.YOUR_WEAPON_ID;
//   readonly name = WeaponName.YOUR_WEAPON_ID;
//   readonly school = School.AGGRESSOR;  // TODO: 选择合适的流派
//   readonly difficulty = 2;            // TODO: 设置难度 1-3
//   readonly iconId = 'game-icons:sonic-wave';  // TODO: 从 game-icons.net 选择
//   playerId = '';

//   // ── 基础状态 ──────────────────────────────────────────
//   private energy = 0;
//   private burstNextHit = false;
//   private cooldowns: Record<string, number> = {};
//   private stacks: Record<string, number> = {};
//   private flags: Record<string, boolean> = {};

//   // TODO: 添加武器特有状态
//   // 例如：投射物列表、场地装置列表、计时器等

//   // ── 生命周期钩子 ─────────────────────────────────────

//   /**
//    * 每 tick 调用（常驻被动 + 自动触发检测）
//    * TICKS_PER_SEC = 20，即每 50ms 调用一次
//    */
//   onTick(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
//     const effects: WeaponEffect[] = [];

//     // TODO: 实现持续效果逻辑
//     // 1. 更新投射物位置、检测碰撞
//     // 2. 更新场地装置计时器
//     // 3. 定期发送视觉更新事件

//     return effects;
//   }

//   /**
//    * 自身碰撞对手时调用（碰撞 = 玩家球体相交）
//    */
//   onHitTarget(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
//     const self = state.getPlayer(this.playerId);
//     if (!self) return [];

//     const effects: WeaponEffect[] = [];
//     const isBurst = this.burstNextHit;

//     // TODO: 实现命中逻辑
//     // 1. 从 WEAPON_RANGE_CONFIG 获取伤害值
//     // 2. 返回 DAMAGE 或 AOE_DAMAGE 类型的 WeaponEffect
//     // 3. 发送视觉事件（VISUAL_ONLY + metadata.visualType）
//     // 4. 积攒能量：this.energy++

//     if (isBurst) {
//       this.burstNextHit = false;
//       // TODO: 爆发额外效果
//       // effects.push({
//       //   type: WeaponEffectType.BURST_DAMAGE,
//       //   sourceId: this.playerId,
//       //   value: CFG.burstDamage!,
//       //   ...
//       // });
//     }

//     return effects;
//   }

//   /**
//    * 被对手碰撞时调用
//    */
//   onHitByAttacker(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
//     const effects: WeaponEffect[] = [];

//     // TODO: 被命中时的反应（可选）
//     // 1. 护盾反弹伤害
//     // 2. 积攒能量
//     // 3. 触发被动效果

//     return effects;
//   }

//   /**
//    * 碰撞墙壁时调用（可选）
//    */
//   onWallHit?(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
//     // TODO: 碰墙反应（可选）
//     return [];
//   }

//   /**
//    * 对手碰撞到本武器生成的障碍物时调用（可选）
//    */
//   onObstacleHit?(hittingPlayerId: string, state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
//     // TODO: 障碍物碰撞反应（可选，如硬化防火墙）
//     return [];
//   }

//   /**
//    * 返回当前活跃的物理障碍物列表（可选）
//    */
//   getObstacles?() {
//     // TODO: 返回 PhysicsObstacle[]（可选，如硬化防火墙）
//     return [];
//   }

//   // ── 能量/爆发 ──────────────────────────────────────

//   getEnergy(): number {
//     return this.energy;
//   }

//   getMaxEnergy(): number {
//     return CFG.maxEnergy!;
//   }

//   isBurstReady(): boolean {
//     return this.energy >= CFG.maxEnergy! && !this.burstNextHit;
//   }

//   /**
//    * 执行爆发，返回爆发产生的所有效果
//    */
//   burst(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
//     this.energy = 0;
//     this.burstNextHit = true;

//     // TODO: 爆发逻辑
//     // 1. 设置爆发标志位（下次 onHitTarget 触发）
//     // 2. 或立即产生爆发效果
//     // 3. 发送视觉事件

//     return [{
//       type: WeaponEffectType.VISUAL_ONLY,
//       sourceId: this.playerId,
//       value: 0,
//       metadata: {
//         visualType: VisualEventType.BURST_TRIGGER,
//         isBurst: true,
//         desc: '[爆发描述]',
//       },
//     }];
//   }

//   // ── 状态查询 ──────────────────────────────────────

//   getRuntimeState() {
//     return {
//       energy: this.energy,
//       maxEnergy: CFG.maxEnergy!,
//       cooldowns: this.cooldowns,
//       stacks: this.stacks,
//       flags: this.flags,
//       custom: {
//         // TODO: 添加自定义状态供前端使用
//       },
//     };
//   }

//   /**
//    * 重置（新对局开始时调用）
//    */
//   reset(): void {
//     this.energy = 0;
//     this.burstNextHit = false;
//     this.cooldowns = {};
//     this.stacks = {};
//     this.flags = {};
//     // TODO: 重置武器特有状态
//   }
// }

// // ─── 获取本武器范围配置 ───────────────────────────────
// const CFG = WEAPON_RANGE_CONFIG[YourWeapon.ID];
