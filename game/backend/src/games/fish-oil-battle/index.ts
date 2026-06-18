/**
 * 赛博鱼油 · 游戏模块入口
 *
 * 按 Tiaoom 规范导出 name / minSize / maxSize / description / default，
 * 由 games/index.ts 的 loadGames() 自动注册。
 *
 * default 导出 FishOilRoom（继承 GameRoom），
 * Controller 会在 room 创建时 new FishOilRoom(room) 并调用 init()。
 */

export const name = '赛博鱼油大逃杀';
export const minSize = 2;
export const maxSize = 8;
export const description = '2-8 人大逃杀，选择武器，最后存活者获胜！';
export const points = {
  '我就玩玩': 0,
  '小博一下': 100,
  '大赢家': 1000,
  '梭哈！': 10000,
};

export { default } from './FishOilRoom';

// 也导出核心模块供外部直接测试
export { SkillScheduler, BattleState } from './core/SkillScheduler';
export { WeaponScheduler } from './core/WeaponScheduler';
export type { ISkill, IBattleState, SkillEffect } from './core/types';
export type { IWeapon, IPhysicsQuery, WeaponEffect, WeaponRuntimeState, AliveOpponent } from './core/IWeapon';
export { createWeapon, getWeaponMetaList, getImplementedWeaponMetaList } from './core/WeaponRegistry';
export { PhysicsAdapter } from './physics/PhysicsAdapter';
// 新版 IWeapon 武器
export { ShockwaveGeneratorWeapon } from './skills/weapons/ShockwaveGeneratorWeapon';
export { FirewallProtocolWeapon } from './skills/weapons/FirewallProtocolWeapon';
export { HiveMotherWeapon } from './skills/weapons/HiveMotherWeapon';
export { PhysicsEngine } from './physics/PhysicsEngine';
export { School, WeaponId, WeaponEffectType, VisualEventType, GameEndReason, ArenaShape } from './config/GameEnums';
export { WEAPON_RANGE_CONFIG } from './config/WeaponRangeConfig';
export type { WeaponRangeConfig, WeaponProjectileConfig, WeaponFieldConfig } from './config/WeaponRangeConfig';
