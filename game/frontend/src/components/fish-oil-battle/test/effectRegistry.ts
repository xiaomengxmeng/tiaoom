import type { EffectTestContext } from './EffectTestController';
import { ref, type Ref } from 'vue';
import { VisualEventType } from '$/backend/src/games/fish-oil-battle/config/GameEnums';

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
 * VisualEventType 中文名称映射表
 */
const VISUAL_EVENT_TYPE_NAMES: Record<VisualEventType, string> = {
  [VisualEventType.SHOCKWAVE_TRIGGER]: '冲击波',
  [VisualEventType.FIREWALL_SPAWN]: '防火墙',
  [VisualEventType.HIVE_STING]: '蜂刺',
  [VisualEventType.HIVE_STING_FLIGHT]: '蜂刺飞行',
  [VisualEventType.HIVE_STING_HIT]: '蜂刺命中',
  [VisualEventType.HIVE_STING_BOUNCE]: '蜂刺反弹',
  [VisualEventType.BURST_TRIGGER]: '爆发触发',
  [VisualEventType.BEE_COUNT_CHANGE]: '蜂群数量变化',
  [VisualEventType.HIT]: '受击',
  [VisualEventType.GLOBAL_EFFECT]: '全局彩蛋',
  [VisualEventType.OPTICAL_SLASH_TRIGGER]: '光学斩击',
  [VisualEventType.OPTICAL_SLASH_BURST]: '光学斩击·无限剑制',
  [VisualEventType.AIR_REPULSION_ANCHOR]: '空气斥力场·锚点',
  [VisualEventType.AIR_REPULSION_BURST]: '空气斥力场·爆发',
  [VisualEventType.ENTROPIC_TOUCH_AURA]: '熵寂之触·低温场',
  [VisualEventType.ENTROPIC_TOUCH_FROSTBITE]: '熵寂之触·冻伤',
  [VisualEventType.ENTROPIC_TOUCH_BURST]: '熵寂之触·热力学奇点',
  [VisualEventType.DRAWING_MANIFEST_INK]: '画作实体化·灵感墨水',
  [VisualEventType.DRAWING_MANIFEST_BURST]: '画作实体化·肌肉兔降临',
  [VisualEventType.DRAWING_MANIFEST_DASH]: '画作实体化·肌肉兔冲刺',
  [VisualEventType.DISCHARGE_CAT_ARC]: '放电猫猫·电弧弹射',
  [VisualEventType.DISCHARGE_CAT_BURST]: '放电猫猫·雷霆万钧',
  [VisualEventType.PRECOGNITIVE_LENS_ECHO]: '预知透镜·猫灵回响',
  [VisualEventType.PRECOGNITIVE_LENS_FORESIGHT]: '预知透镜·先见层数',
  [VisualEventType.PRECOGNITIVE_LENS_BURST]: '预知透镜·无限洞察',
  [VisualEventType.EMOTIONAL_WEATHER_LIGHTNING]: '情绪天气·落雷',
  [VisualEventType.EMOTIONAL_WEATHER_HAIL]: '情绪天气·冰雹',
  [VisualEventType.EMOTIONAL_WEATHER_BURST]: '情绪天气·极端气候',
  [VisualEventType.EMOTION_MASTERY_MOOD]: '情绪掌控·心境轮转',
  [VisualEventType.EMOTION_MASTERY_BURST]: '情绪掌控·实体化爆发',
  [VisualEventType.SHAPE_EFFECT]: '形状特效',
  [VisualEventType.SUSTAINED_SHAPE]: '持续形状特效',
};

/**
 * 从 VisualEventType 自动生成基础参数
 * 所有视觉事件类型都会自动生成一个基础测试项
 * 
 * 简化版：所有类型共享通用的基础参数
 */
function createDefaultParams(_visualType: VisualEventType): EffectParam[] {
  // 所有类型都有的通用参数
  return [
    { key: 'x', label: 'X 位置', type: 'range', min: 0, max: 1280, step: 1, defaultValue: 640 },
    { key: 'y', label: 'Y 位置', type: 'range', min: 0, max: 720, step: 1, defaultValue: 360 },
    { key: 'primaryColor', label: '主题色(hex)', type: 'color', defaultValue: 0xFF00FF },
    { key: 'size', label: '尺寸', type: 'range', min: 10, max: 300, step: 5, defaultValue: 80 },
    { key: 'duration', label: '持续时间(ms)', type: 'range', min: 200, max: 5000, step: 100, defaultValue: 1000 },
  ];
}

/**
 * 所有可测试的特效注册表
 *
 * 优化方案：
 * 1. 基础项：从 VisualEventType 自动生成（确保所有类型都有测试项）
 * 2. 自定义项：可以覆盖基础项，提供更详细的参数控制
 *
 * 新增技能时只需：
 * - 在后端 VisualEventType 枚举中添加类型
 * - 在前端实现特效渲染器
 * - 可选：在此注册表中添加自定义测试项（覆盖基础项）
 *
 * 使用 ref 包装，确保 Vue 响应式更新
 */
export const EFFECT_REGISTRY: Ref<EffectDefinition[]> = ref([]);

/**
 * 注册特效定义（支持多次调用，自动去重）
 */
export function registerEffect(def: EffectDefinition): void {
  const existing = EFFECT_REGISTRY.value.findIndex(e => e.id === def.id);
  if (existing >= 0) {
    EFFECT_REGISTRY.value[existing] = def; // 覆盖
  } else {
    EFFECT_REGISTRY.value.push(def);
  }
}

/**
 * 自动从 VisualEventType 注册基础测试项
 * 这样可以确保所有视觉事件类型都有对应的测试项
 */
export function autoRegisterFromEnum(): void {
  // 只保留字符串值（TypeScript 枚举编译后可能包含数字键）
  const allTypes = Object.values(VisualEventType).filter(v => typeof v === 'string') as VisualEventType[];
  
  console.log('[EffectRegistry] VisualEventType 所有值:', allTypes);
  console.log('[EffectRegistry] 当前已注册的特效:', EFFECT_REGISTRY.value.map(e => e.id));

  for (const visualType of allTypes) {
    // 跳过全局效果和内部事件
    if (visualType === VisualEventType.GLOBAL_EFFECT) {
      console.log('[EffectRegistry] 跳过 GLOBAL_EFFECT');
      continue;
    }
    if (visualType === VisualEventType.HIT) {
      console.log('[EffectRegistry] 跳过 HIT');
      continue;
    }
    if (visualType === VisualEventType.BEE_COUNT_CHANGE) {
      console.log('[EffectRegistry] 跳过 BEE_COUNT_CHANGE');
      continue;
    }

    // 如果已注册则跳过
    if (EFFECT_REGISTRY.value.some(e => e.id === visualType)) {
      console.log(`[EffectRegistry] 已注册，跳过: ${visualType}`);
      continue;
    }

    // 自动生成基础测试项
    console.log(`[EffectRegistry] 自动注册: ${visualType}`);
    registerEffect({
      id: visualType,
      name: VISUAL_EVENT_TYPE_NAMES[visualType] || visualType,
      params: createDefaultParams(visualType),
      play: (ctx, v) => {
        // 将通用参数映射到具体渲染器调用
        const x = v.x || 640;
        const y = v.y || 360;
        const color = v.primaryColor || 0xFF00FF;
        const size = v.size || 80;
        const duration = v.duration || 1000;

        switch (visualType) {
          case VisualEventType.SHOCKWAVE_TRIGGER: {
            const effects = ctx.shockwaveRenderer.trigger(x, y, false, color, {
              maxRadius: size * 2,
              expandDurationMs: duration,
            });
            for (const ef of effects) ctx.activeEffects.push(ef);
            break;
          }
          case VisualEventType.FIREWALL_SPAWN: {
            const result = ctx.firewallRenderer.trigger(x, y, false, `fw_${Date.now()}`, color, {
              visualWidth: size * 1.5,
              visualHeight: size * 0.5,
              maxLifeMs: duration,
            });
            if (result.effect) ctx.activeEffects.push(result.effect);
            break;
          }
          case VisualEventType.HIVE_STING:
          case VisualEventType.HIVE_STING_FLIGHT: {
            const ef = ctx.hiveRenderer.triggerSting(x - 100, y, x + 100, y, color, {
              stingerSpeed: 300,
            });
            if (ef) ctx.activeEffects.push(ef);
            break;
          }
          case VisualEventType.HIVE_STING_HIT:
          case VisualEventType.HIVE_STING_BOUNCE: {
            const ef = ctx.hiveRenderer.triggerStingBounce(x, y, color);
            if (ef) ctx.activeEffects.push(ef);
            break;
          }
          case VisualEventType.BURST_TRIGGER: {
            const ef = ctx.hiveRenderer.triggerBurstFlash(color, {
              burstFlashDuration: duration,
            });
            if (ef) ctx.activeEffects.push(ef);
            break;
          }
          case VisualEventType.OPTICAL_SLASH_TRIGGER: {
            const angleRad = (45 * Math.PI) / 180; // 45度
            const ef = ctx.opticalSlashRenderer.triggerSlash(x, y, angleRad, size * 1.5, color, false);
            if (ef) ctx.addEffect(ef);
            break;
          }
          case VisualEventType.OPTICAL_SLASH_BURST: {
            const effects = ctx.opticalSlashRenderer.triggerBurst(x, y, color);
            ctx.addEffect(effects);
            break;
          }
          case VisualEventType.AIR_REPULSION_ANCHOR: {
            const result = ctx.airRepulsionRenderer?.triggerAnchor(x, y, `anchor_${Date.now()}`, color, size * 1.5);
            if (result?.effect) ctx.activeEffects.push(result.effect);
            break;
          }
          case VisualEventType.AIR_REPULSION_BURST: {
            const result = ctx.airRepulsionRenderer?.triggerBurst(x, y, size * 2, color, duration);
            if (result?.effect) ctx.activeEffects.push(result.effect);
            break;
          }
          case VisualEventType.ENTROPIC_TOUCH_AURA: {
            ctx.entropicTouchRenderer?.triggerAura(`player_${Date.now()}`, x, y, size, color);
            break;
          }
          case VisualEventType.ENTROPIC_TOUCH_FROSTBITE: {
            ctx.entropicTouchRenderer?.triggerFrostbite(`target_${Date.now()}`, v.frostbiteStacks || 3, x, y, color);
            break;
          }
          case VisualEventType.ENTROPIC_TOUCH_BURST: {
            ctx.entropicTouchRenderer?.triggerBurst(`player_${Date.now()}`, x, y, size * 2, color);
            break;
          }
          // ── 预知透镜 ───────────────────────────────
          case VisualEventType.PRECOGNITIVE_LENS_ECHO: {
            const result = ctx.precognitiveLensRenderer?.triggerEcho(x - 100, y, x + 100, y, false, color);
            if (result?.effect) ctx.activeEffects.push(result.effect);
            break;
          }
          case VisualEventType.PRECOGNITIVE_LENS_FORESIGHT: {
            ctx.precognitiveLensRenderer?.updateForesight(`player_${Date.now()}`, x, y, 4, false, color);
            break;
          }
          case VisualEventType.PRECOGNITIVE_LENS_BURST: {
            const result = ctx.precognitiveLensRenderer?.triggerBurst(`player_${Date.now()}`, x, y, duration, color);
            if (result?.effect) ctx.activeEffects.push(result.effect);
            break;
          }

          // ── 画作实体化 ─────────────────────────────
          case VisualEventType.DRAWING_MANIFEST_INK: {
            ctx.drawingManifestRenderer?.updateRabbit(`player_${Date.now()}`, x, y, 4, false, color);
            break;
          }
          case VisualEventType.DRAWING_MANIFEST_BURST: {
            const result = ctx.drawingManifestRenderer?.triggerBurst(`player_${Date.now()}`, x, y, size, duration, color);
            if (result?.effect) ctx.activeEffects.push(result.effect);
            break;
          }
          case VisualEventType.DRAWING_MANIFEST_DASH: {
            const result = ctx.drawingManifestRenderer?.triggerDash(x - 100, y, x + 100, y, true, color);
            if (result?.effect) ctx.activeEffects.push(result.effect);
            break;
          }

          // ── 放电猫猫 ───────────────────────────────
          case VisualEventType.DISCHARGE_CAT_ARC: {
            const result = ctx.dischargeCatRenderer?.triggerArc(
              [{ x, y }, { x: x + 80, y: y - 40 }, { x: x - 60, y: y + 60 }],
              false,
              color,
            );
            if (result?.effect) ctx.activeEffects.push(result.effect);
            break;
          }
          case VisualEventType.DISCHARGE_CAT_BURST: {
            const result = ctx.dischargeCatRenderer?.triggerBurst(`player_${Date.now()}`, x, y, size, duration, color);
            if (result?.effect) ctx.activeEffects.push(result.effect);
            break;
          }

          // ── 情绪天气 ───────────────────────────────
          case VisualEventType.EMOTIONAL_WEATHER_LIGHTNING: {
            const result = ctx.emotionalWeatherRenderer?.triggerLightning(x, y, size, color);
            if (result?.effect) ctx.activeEffects.push(result.effect);
            break;
          }
          case VisualEventType.EMOTIONAL_WEATHER_HAIL: {
            const result = ctx.emotionalWeatherRenderer?.triggerHail(x, y, size);
            if (result?.effect) ctx.activeEffects.push(result.effect);
            break;
          }
          case VisualEventType.EMOTIONAL_WEATHER_BURST: {
            const result = ctx.emotionalWeatherRenderer?.triggerBurst(x, y, size * 2, duration);
            if (result?.effect) ctx.activeEffects.push(result.effect);
            break;
          }

          // ── 情绪掌控 ───────────────────────────────
          case VisualEventType.EMOTION_MASTERY_MOOD: {
            ctx.emotionMasteryRenderer?.updateMood(`player_${Date.now()}`, x, y, 'anger', color);
            break;
          }
          case VisualEventType.EMOTION_MASTERY_BURST: {
            const result = ctx.emotionMasteryRenderer?.triggerBurst(`player_${Date.now()}`, x, y, duration, color);
            if (result?.effect) ctx.activeEffects.push(result.effect);
            break;
          }

          default:
            console.log(`[EffectTest] Playing ${visualType}`, v);
        }
      },
    });
  }
}

// ── 自定义特效定义（覆盖基础项，提供更详细的参数控制）────────

// ── 防火墙 ─────────────────────────────────────────
registerEffect({
  id: VisualEventType.FIREWALL_SPAWN,
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
});

// ── 冲击波 ─────────────────────────────────────────
registerEffect({
  id: VisualEventType.SHOCKWAVE_TRIGGER,
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
});

// ── 蜂刺 ───────────────────────────────────────────
registerEffect({
  id: VisualEventType.HIVE_STING,
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
});

// ── 蜂刺反弹 ───────────────────────────────────────
registerEffect({
  id: VisualEventType.HIVE_STING_BOUNCE,
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
});

// ── 光学斩击 ───────────────────────────────────────
registerEffect({
  id: VisualEventType.OPTICAL_SLASH_TRIGGER,
  name: '光学斩击 (Liya)',
  params: [
    { key: 'x', label: 'X 位置', type: 'range', min: 0, max: 1280, step: 1, defaultValue: 640 },
    { key: 'y', label: 'Y 位置', type: 'range', min: 0, max: 720, step: 1, defaultValue: 360 },
    { key: 'angleDeg', label: '角度(°)', type: 'range', min: 0, max: 360, step: 1, defaultValue: 45 },
    { key: 'length', label: '长度(px)', type: 'range', min: 50, max: 300, step: 10, defaultValue: 100 },
    { key: 'themeColor', label: '主题色(hex)', type: 'color', defaultValue: 0x00BFFF },
  ],
  play: (ctx, v) => {
    const angleRad = (v.angleDeg * Math.PI) / 180;
    const ef = ctx.opticalSlashRenderer.triggerSlash(v.x, v.y, angleRad, v.length, Number(v.themeColor ?? 0x00BFFF), false);
    if (ef) ctx.addEffect(ef);
  },
});

// ── 光学斩击爆发 ────────────────────────────────────
registerEffect({
  id: VisualEventType.OPTICAL_SLASH_BURST,
  name: '光学斩击·无限剑制 (Liya)',
  params: [
    { key: 'x', label: 'X 位置', type: 'range', min: 0, max: 1280, step: 1, defaultValue: 640 },
    { key: 'y', label: 'Y 位置', type: 'range', min: 0, max: 720, step: 1, defaultValue: 360 },
    { key: 'themeColor', label: '主题色(hex)', type: 'color', defaultValue: 0x00BFFF },
  ],
  play: (ctx, v) => {
    const effects = ctx.opticalSlashRenderer.triggerBurst(v.x, v.y, Number(v.themeColor ?? 0x00BFFF));
    ctx.addEffect(effects);
  },
});

// ── 爆发闪屏 ───────────────────────────────────────
registerEffect({
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
});

// 自动注册所有 VisualEventType（确保无遗漏）
// 在模块加载时自动执行，确保测试页面始终有最新的特效列表
autoRegisterFromEnum();
