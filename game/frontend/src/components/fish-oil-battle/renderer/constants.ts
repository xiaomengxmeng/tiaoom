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

/** 后端逻辑坐标宽 */
export const LOGICAL_W = 1280;
/** 后端逻辑坐标高 */
export const LOGICAL_H = 720;
/** 竞技场逻辑半径（碰撞边界） */
export const ARENA_RADIUS_LOGICAL = 280;
/** 小球基础半径（逻辑坐标） */
export const PLAYER_BASE_RADIUS = 36;

// ─── 技能特效逻辑尺寸 ─────────────────────────────────

/** 冲击波最大扩散半径（逻辑 px） */
export const SHOCKWAVE_MAX_RADIUS = 220;
/** 防火墙六边形基准半径（逻辑 px） */
export const FIREWALL_HEX_RADIUS = 100;
/** 蜂刺飞行速度（逻辑 px/s） */
export const STINGER_SPEED = 300;
/** 爆发闪屏持续时间（ms） */
export const BURST_FLASH_DURATION = 400;
/** 蜂群爆发放大倍率 */
export const HIVE_BURST_SCALE = 1.5;
