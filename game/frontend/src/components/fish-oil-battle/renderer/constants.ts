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
