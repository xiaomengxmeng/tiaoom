import type { EffectTestContext } from './EffectTestController';

/**
 * 特效参数定义
 */
export interface EffectParam {
  key: string;
  label: string;
  type: 'range' | 'boolean' | 'color' | 'number';
  min?: number;
  max?: number;
  step?: number;
  defaultValue: number | boolean;
}

/**
 * 特效定义
 */
export interface EffectDefinition {
  id: string;
  name: string;
  params: EffectParam[];
  play: (ctx: EffectTestContext, values: Record<string, any>) => void;
}

/**
 * 所有可测试的特效注册表
 *
 * 新增特效只需在此数组中加一个 EffectDefinition，
 * EffectTestPage.vue 会自动渲染参数面板。
 */
export const EFFECT_REGISTRY: EffectDefinition[] = [
  // ── 防火墙 ─────────────────────────────────────────
  {
    id: 'firewall',
    name: '防火墙',
    params: [
      { key: 'x', label: 'X 位置', type: 'range', min: 0, max: 1280, step: 1, defaultValue: 640 },
      { key: 'y', label: 'Y 位置', type: 'range', min: 0, max: 720, step: 1, defaultValue: 360 },
      { key: 'isHardened', label: '硬化模式', type: 'boolean', defaultValue: false },
      { key: 'hexRadius', label: '六边形半径', type: 'range', min: 10, max: 60, step: 1, defaultValue: 16 },
      { key: 'hexLineWidth', label: '网格线宽', type: 'range', min: 0.5, max: 6, step: 0.5, defaultValue: 1.5 },
      { key: 'hexLineAlpha', label: '网格透明度', type: 'range', min: 0.1, max: 1, step: 0.05, defaultValue: 0.75 },
      { key: 'visualWidth', label: '视觉宽度', type: 'range', min: 60, max: 400, step: 10, defaultValue: 130 },
      { key: 'visualHeight', label: '视觉高度', type: 'range', min: 20, max: 200, step: 5, defaultValue: 45 },
      { key: 'maxLifeMs', label: '持续时间(ms)', type: 'range', min: 500, max: 20000, step: 500, defaultValue: 4000 },
      { key: 'primaryColor', label: '主题色(hex)', type: 'color', defaultValue: 0xBFFF },
    ],
    play: (ctx, v) => {
      const result = ctx.firewallRenderer.trigger(v.x, v.y, v.isHardened, `fw_${Date.now()}`, v.primaryColor, {
        hexRadius: v.hexRadius,
        hexLineWidth: v.hexLineWidth,
        hexLineAlpha: v.hexLineAlpha,
        visualWidth: v.visualWidth,
        visualHeight: v.visualHeight,
        maxLifeMs: v.maxLifeMs,
        growDurationMs: 400,
      });
      if (result.effect) ctx.activeEffects.push(result.effect);
    },
  },

  // ── 冲击波 ─────────────────────────────────────────
  {
    id: 'shockwave',
    name: '冲击波',
    params: [
      { key: 'x', label: 'X 位置', type: 'range', min: 0, max: 1280, step: 1, defaultValue: 640 },
      { key: 'y', label: 'Y 位置', type: 'range', min: 0, max: 720, step: 1, defaultValue: 360 },
      { key: 'isBurst', label: '爆发模式(3环)', type: 'boolean', defaultValue: false },
      { key: 'maxRadius', label: '最大半径', type: 'range', min: 100, max: 800, step: 10, defaultValue: 350 },
      { key: 'expandDurationMs', label: '扩散时长(ms)', type: 'range', min: 300, max: 5000, step: 100, defaultValue: 1500 },
      { key: 'strokeWidth', label: '描边宽度', type: 'range', min: 3, max: 40, step: 1, defaultValue: 15 },
      { key: 'primaryColor', label: '主题色(hex)', type: 'color', defaultValue: 0xFF00FF },
    ],
    play: (ctx, v) => {
      const effects = ctx.shockwaveRenderer.trigger(v.x, v.y, v.isBurst, v.primaryColor, {
        maxRadius: v.maxRadius,
        expandDurationMs: v.expandDurationMs,
        strokeWidth: v.strokeWidth,
        primaryColor: v.primaryColor,
      });
      for (const ef of effects) ctx.activeEffects.push(ef);
    },
  },

  // ── 蜂刺 ───────────────────────────────────────────
  {
    id: 'hive_sting',
    name: '蜂刺',
    params: [
      { key: 'fromX', label: '起点 X', type: 'range', min: 0, max: 1280, step: 1, defaultValue: 200 },
      { key: 'fromY', label: '起点 Y', type: 'range', min: 0, max: 720, step: 1, defaultValue: 360 },
      { key: 'toX', label: '终点 X', type: 'range', min: 0, max: 1280, step: 1, defaultValue: 1080 },
      { key: 'toY', label: '终点 Y', type: 'range', min: 0, max: 720, step: 1, defaultValue: 360 },
      { key: 'stingerSpeed', label: '飞行速度', type: 'range', min: 100, max: 1000, step: 10, defaultValue: 300 },
      { key: 'primaryColor', label: '主题色(hex)', type: 'color', defaultValue: 0x39FF14 },
    ],
    play: (ctx, v) => {
      const ef = ctx.hiveRenderer.triggerSting(v.fromX, v.fromY, v.toX, v.toY, v.primaryColor, {
        stingerSpeed: v.stingerSpeed,
      });
      if (ef) ctx.activeEffects.push(ef);
    },
  },

  // ── 蜂刺反弹 ───────────────────────────────────────
  {
    id: 'hive_sting_bounce',
    name: '蜂刺反弹',
    params: [
      { key: 'x', label: '反弹位置 X', type: 'range', min: 0, max: 1280, step: 1, defaultValue: 640 },
      { key: 'y', label: '反弹位置 Y', type: 'range', min: 0, max: 720, step: 1, defaultValue: 360 },
      { key: 'primaryColor', label: '主题色(hex)', type: 'color', defaultValue: 0x39FF14 },
    ],
    play: (ctx, v) => {
      const ef = ctx.hiveRenderer.triggerStingBounce(v.x, v.y, v.primaryColor);
      if (ef) ctx.activeEffects.push(ef);
    },
  },

  // ── 爆发闪屏 ───────────────────────────────────────
  {
    id: 'burst_flash',
    name: '爆发闪屏',
    params: [
      { key: 'primaryColor', label: '主题色(hex)', type: 'color', defaultValue: 0xFF00FF },
      { key: 'burstFlashDuration', label: '持续时间(ms)', type: 'range', min: 100, max: 2000, step: 50, defaultValue: 400 },
    ],
    play: (ctx, v) => {
      const ef = ctx.hiveRenderer.triggerBurstFlash(v.primaryColor, {
        burstFlashDuration: v.burstFlashDuration,
      });
      if (ef) ctx.activeEffects.push(ef);
    },
  },
];
