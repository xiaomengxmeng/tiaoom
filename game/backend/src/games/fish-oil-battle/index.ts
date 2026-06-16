/**
 * 赛博鱼油 · 游戏模块入口
 *
 * 按 Tiaoom 规范导出 name / minSize / maxSize / description / default，
 * 由 games/index.ts 的 loadGames() 自动注册。
 *
 * default 导出 FishOilRoom（继承 GameRoom），
 * Controller 会在 room 创建时 new FishOilRoom(room) 并调用 init()。
 */

export const name = 'fish-oil-battle';
export const minSize = 2;
export const maxSize = 2;
export const description = '赛博鱼油 · 1v1 自动弹球对战';
export const points = {
  '我就玩玩': 0,
  '小博一下': 100,
  '大赢家': 1000,
  '梭哈！': 10000,
};

export { default } from './FishOilRoom';

// 也导出核心模块供外部直接测试
export { SkillScheduler, BattleState } from './core/SkillScheduler';
export type { ISkill, IBattleState, SkillEffect, School } from './core/types';
export { ShockwaveGenerator } from './skills/ShockwaveGenerator';
export { FirewallProtocol } from './skills/FirewallProtocol';
export { HiveMother } from './skills/HiveMother';
export { PhysicsEngine } from './physics/PhysicsEngine';
