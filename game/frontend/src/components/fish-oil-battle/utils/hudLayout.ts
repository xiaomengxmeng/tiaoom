/**
 * 径向布局 HUD 位置计算器
 * 方案 B：HUD 围绕竞技场边缘放置（沉浸式）
 *
 * - 2-4人：保持角落布局（兼容现有设计）
 * - 5-8人：圆形径向布局，HUD 围绕竞技场边缘均匀分布
 */

export interface HudPosition {
  /** 唯一标识 */
  id: string;
  /** 玩家名 */
  name: string;
  /** 绝对 X（画布像素） */
  x: number;
  /** 绝对 Y（画布像素） */
  y: number;
  /** CSS 锚点 */
  anchor: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
}

export interface HudLayoutResult {
  /** 己方位置 */
  self: HudPosition;
  /** 其他玩家位置（有序） */
  others: HudPosition[];
  /** 是否启用紧凑模式 */
  compact: boolean;
}

/**
 * 根据总玩家数计算 HUD 布局
 * @param totalPlayers 总玩家数（包含自己）
 * @param canvasWidth 画布宽度（像素）
 * @param canvasHeight 画布高度（像素）
 */
export function computeRadialHudLayout(
  totalPlayers: number,
  canvasWidth: number = 1280,
  canvasHeight: number = 720,
): HudLayoutResult {
  if (totalPlayers <= 4) {
    return computeCornerLayout(totalPlayers, canvasWidth, canvasHeight);
  }
  return computeCircularLayout(totalPlayers, canvasWidth, canvasHeight);
}

/**
 * 角落布局（2-4人）
 */
function computeCornerLayout(
  total: number,
  w: number,
  h: number,
): HudLayoutResult {
  const self: HudPosition = {
    id: 'self',
    name: '己方',
    x: 16,
    y: h,
    anchor: 'bottom-left',
  };

  const corners: Array<{ x: number; y: number; anchor: HudPosition['anchor'] }> = [
    { x: w, y: 0, anchor: 'top-right' },
    { x: w, y: h, anchor: 'bottom-right' },
    { x: 0, y: 0, anchor: 'top-left' },
  ];

  const others: HudPosition[] = [];
  for (let i = 1; i < total; i++) {
    const c = corners[i - 1];
    others.push({
      id: `other-${i}`,
      name: `玩家${i + 1}`,
      x: c.x,
      y: c.y,
      anchor: c.anchor,
    });
  }

  return { self, others, compact: false };
}

/**
 * 圆形径向布局（5-8人）
 * HUD 围绕竞技场边缘均匀分布，己方固定在底部中央
 */
function computeCircularLayout(
  total: number,
  w: number,
  h: number,
): HudLayoutResult {
  const cx = w / 2;
  const cy = h / 2;

  // HUD 放置半径（距离中心的距离，留 20px 边距）
  const hudRadius = Math.min(w, h) * 0.46;

  // 己方：底部中央
  const self: HudPosition = {
    id: 'self',
    name: '己方',
    x: cx,
    y: h,
    anchor: 'bottom-left',
  };

  // 其他玩家：圆形均匀分布（从左侧开始，避开底部己方区域）
  const otherCount = total - 1;
  // 起始角度从 210° 开始（左下方），顺时针绕一圈到 150°（右下方）
  // 避开底部 180° 附近的己方位置
  const startAngle = (210 / 180) * Math.PI;
  const endAngle = (150 / 180) * Math.PI + Math.PI * 2;

  const others: HudPosition[] = [];
  for (let i = 0; i < otherCount; i++) {
    const t = otherCount <= 1 ? 0.5 : i / (otherCount - 1);
    const angle = startAngle + (endAngle - startAngle) * t;
    const x = cx + Math.cos(angle) * hudRadius;
    const y = cy + Math.sin(angle) * hudRadius;

    // 根据象限决定锚点
    let anchor: HudPosition['anchor'] = 'center';
    if (x < cx && y < cy) anchor = 'top-left';
    else if (x >= cx && y < cy) anchor = 'top-right';
    else if (x < cx && y >= cy) anchor = 'bottom-left';
    else anchor = 'bottom-right';

    others.push({
      id: `other-${i + 1}`,
      name: `玩家${i + 2}`,
      x,
      y,
      anchor,
    });
  }

  return { self, others, compact: total >= 7 };
}

/**
 * 将 HudPosition 转换为 CSS style 对象
 * @param pos HUD 位置
 * @param w 画布宽度（用于计算 right/bottom 偏移）
 * @param h 画布高度
 */
export function hudPositionToStyle(
  pos: HudPosition,
  w: number,
  h: number,
): Record<string, string> {
  const style: Record<string, string> = {};

  // 默认使用 transform: translate(-50%, -50%) 居中
  // 根据锚点调整
  switch (pos.anchor) {
    case 'top-left':
      style.left = `${pos.x}px`;
      style.top = `${pos.y}px`;
      break;
    case 'top-right':
      style.right = `${w - pos.x}px`;
      style.top = `${pos.y}px`;
      break;
    case 'bottom-left':
      style.left = `${pos.x}px`;
      style.bottom = `${h - pos.y}px`;
      break;
    case 'bottom-right':
      style.right = `${w - pos.x}px`;
      style.bottom = `${h - pos.y}px`;
      break;
    case 'center':
    default:
      style.left = `${pos.x}px`;
      style.top = `${pos.y}px`;
      style.transform = 'translate(-50%, -50%)';
      break;
  }

  return style;
}
