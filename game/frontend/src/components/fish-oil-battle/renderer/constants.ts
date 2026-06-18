/**
 * Pixi v8 混合模式常量
 *
 * Pixi v8 中 BLEND_MODES 作为 type-only 导出，不能作为值使用。
 * 这些值对应 WebGL 混合方程，与 v7 的 BLEND_MODES 完全一致。
 *
 * @see https://pixijs.download/v8.12.0/docs/filters/BLEND_MODES.html
 */
export const BLEND_MODES = {
  NORMAL: 0 as number,
  ADD: 2 as number,
  MULTIPLY: 1 as number,
  SCREEN: 3 as number,
};

// ══════════════════════════════════════════════════════
//  坐标系统常量（后端固定逻辑坐标系 1280×720）
//  所有视觉尺寸均定义为逻辑坐标值，渲染时乘以 uniformScale
// ══════════════════════════════════════════════════════

/** 后端逻辑坐标宽（默认值，可被后端 arenaConfig 覆盖） */
export const LOGICAL_W = 1280;
/** 后端逻辑坐标高（默认值，可被后端 arenaConfig 覆盖） */
export const LOGICAL_H = 720;
/** 竞技场逻辑半径（碰撞边界，默认值） */
export const ARENA_RADIUS_LOGICAL = 280;
/** 小球基础半径（逻辑坐标，默认值） */
export const PLAYER_BASE_RADIUS = 36;

// ─── 动态竞技场配置（可由后端数据覆盖）────────────
import { ArenaShape } from '$/backend/src/games/fish-oil-battle/config/GameEnums';

let _dynamicArenaConfig: {
  width: number; height: number;
  shape: ArenaShape;
  arenaRadius: number;
  arenaHalfW?: number;
  arenaHalfH?: number;
  ballRadius: number;
} | null = null;

/** 更新竞技场配置（由后端 battle_start 消息驱动） */
export function updateArenaConfig(config: {
  width: number; height: number;
  shape?: ArenaShape;
  arenaRadius: number;
  arenaHalfW?: number;
  arenaHalfH?: number;
  ballRadius: number;
}): void {
  _dynamicArenaConfig = {
    ...config,
    shape: config.shape ?? ArenaShape.CIRCLE,
  };
  console.log(`[constants] 竞技场配置已更新: ${config.width}x${config.height}, shape=${_dynamicArenaConfig.shape}, radius=${config.arenaRadius}, ballRadius=${config.ballRadius}`);
}

/** 获取当前竞技场宽度（动态或默认） */
export function getLogicalW(): number {
  return _dynamicArenaConfig?.width ?? LOGICAL_W;
}

/** 获取当前竞技场高度（动态或默认） */
export function getLogicalH(): number {
  return _dynamicArenaConfig?.height ?? LOGICAL_H;
}

/** 获取当前竞技场半径（动态或默认） */
export function getArenaRadiusLogical(): number {
  return _dynamicArenaConfig?.arenaRadius ?? ARENA_RADIUS_LOGICAL;
}

/** 获取当前竞技场形状（动态或默认） */
export function getArenaShape(): ArenaShape {
  return _dynamicArenaConfig?.shape ?? ArenaShape.CIRCLE;
}

/** 获取矩形半宽（动态或默认，圆形时返回 arenaRadius） */
export function getArenaHalfW(): number {
  return _dynamicArenaConfig?.arenaHalfW ?? _dynamicArenaConfig?.arenaRadius ?? ARENA_RADIUS_LOGICAL;
}

/** 获取矩形半高（动态或默认，圆形时返回 arenaRadius） */
export function getArenaHalfH(): number {
  return _dynamicArenaConfig?.arenaHalfH ?? _dynamicArenaConfig?.arenaRadius ?? ARENA_RADIUS_LOGICAL;
}

/** 获取当前小球半径（动态或默认） */
export function getPlayerBaseRadius(): number {
  return _dynamicArenaConfig?.ballRadius ?? PLAYER_BASE_RADIUS;
}

// ─── 技能特效逻辑尺寸（从后端 WeaponRangeConfig 统一配置导入） ──

import {
  WEAPON_RANGE_CONFIG,
  type WeaponRangeConfig,
} from '$/backend/src/games/fish-oil-battle/config/WeaponRangeConfig';
import { WeaponId } from '$/backend/src/games/fish-oil-battle/config/GameEnums';

/** 冲击波默认扩散半径（逻辑 px），后端可覆盖 */
export const SHOCKWAVE_MAX_RADIUS =
  (WEAPON_RANGE_CONFIG[WeaponId.SHOCKWAVE_GENERATOR]?.aoeMaxRadius
   ?? WEAPON_RANGE_CONFIG[WeaponId.SHOCKWAVE_GENERATOR]?.damageRadius
   ?? 200);
/** 防火墙默认六边形半径（逻辑 px），后端可覆盖 */
export const FIREWALL_HEX_RADIUS =
  (WEAPON_RANGE_CONFIG[WeaponId.FIREWALL_PROTOCOL]?.field?.hexRadius
   ?? WEAPON_RANGE_CONFIG[WeaponId.FIREWALL_PROTOCOL]?.field?.radius
   ?? 80);
/** 防火墙默认视觉宽度（逻辑 px），后端可覆盖 */
export const FIREWALL_VISUAL_WIDTH =
  (WEAPON_RANGE_CONFIG[WeaponId.FIREWALL_PROTOCOL]?.field?.visualWidth
   ?? 100);
/** 防火墙默认视觉高度（逻辑 px），后端可覆盖 */
export const FIREWALL_VISUAL_HEIGHT =
  (WEAPON_RANGE_CONFIG[WeaponId.FIREWALL_PROTOCOL]?.field?.visualHeight
   ?? 40);
/** 蜂刺飞行速度（逻辑 px/s） */
export const STINGER_SPEED =
  WEAPON_RANGE_CONFIG[WeaponId.HIVE_MOTHER]?.projectile?.speed ?? 300;
/** 爆发闪屏持续时间（ms） */
export const BURST_FLASH_DURATION = 400;
/** 蜂群爆发放大倍率 */
export const HIVE_BURST_SCALE = 1.5;

export { WEAPON_RANGE_CONFIG, type WeaponRangeConfig };
