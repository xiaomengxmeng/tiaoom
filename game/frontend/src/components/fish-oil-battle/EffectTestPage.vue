<template>
  <div class="flex h-screen w-screen flex-col overflow-hidden bg-base-100 text-base-content">
    <!-- ══════════════════════════════════════════════════ -->
    <!--  顶部工具栏                                      -->
    <!-- ══════════════════════════════════════════════════ -->
    <header class="flex items-center gap-3 border-b border-base-300 bg-base-200/60 px-4 py-2">
      <!-- 侧边栏切换 -->
      <button
        class="btn btn-ghost btn-sm btn-square"
        @click="sidebarOpen = !sidebarOpen"
      >
        <Icon :icon="sidebarOpen ? 'ph:sidebar-simple-fill' : 'ph:sidebar-simple'" />
      </button>

      <!-- Tab 切换 -->
      <div class="tabs tabs-bordered tabs-sm">
        <a
          class="tab tab-sm"
          :class="{ 'tab-active': currentTab === 'effect' }"
          @click="currentTab = 'effect'"
        >特效测试</a>
        <a
          class="tab tab-sm"
          :class="{ 'tab-active': currentTab === 'battle' }"
          @click="currentTab = 'battle'"
        >对局测试</a>
      </div>

      <!-- 分隔 -->
      <div class="w-px h-5 bg-base-300" />

      <!-- 特效名称（仅特效 tab 显示） -->
      <span v-if="currentTab === 'effect'" class="text-sm font-semibold min-w-0 truncate">
        {{ currentEffect?.name ?? '选择特效' }}
      </span>

      <!-- 分隔 -->
      <div v-if="currentTab === 'effect'" class="w-px h-5 bg-base-300" />

      <!-- 循环开关（仅特效 tab 显示） -->
      <template v-if="currentTab === 'effect'">
        <label class="label cursor-pointer gap-1.5 p-0">
          <input v-model="loopEnabled" type="checkbox" class="toggle toggle-primary toggle-xs" />
          <span class="label-text text-xs">循环</span>
        </label>
        <span v-if="loopEnabled" class="text-[11px] opacity-50 tabular-nums">
          {{ loopInterval }}ms
        </span>
      </template>

      <div class="flex-1" />

      <!-- 操作按钮组（仅特效 tab） -->
      <template v-if="currentTab === 'effect'">
        <div class="join">
          <button class="btn btn-primary btn-xs join-item" @click="playOnce">
            <Icon icon="ph:play-fill" />
            Play
          </button>
          <button class="btn btn-error btn-soft btn-xs join-item" @click="clearAll">
            <Icon icon="ph:x" />
            Clear
          </button>
        </div>

        <!-- 参数面板切换 -->
        <button
          class="btn btn-ghost btn-sm btn-square"
          @click="paramsOpen = !paramsOpen"
        >
          <Icon :icon="paramsOpen ? 'ph:sliders-fill' : 'ph:sliders'" />
        </button>

        <!-- 复制 -->
        <div class="tooltip tooltip-bottom" data-tip="复制 JSON">
          <button class="btn btn-ghost btn-sm btn-square" @click="copyParams">
            <Icon icon="ph:copy" />
          </button>
        </div>

        <!-- 活跃计数 -->
        <span class="badge badge-sm badge-ghost tabular-nums">{{ activeCount }}</span>
      </template>
    </header>

    <!-- ══════════════════════════════════════════════════ -->
    <!--  内容：对局测试模式                              -->
    <!-- ══════════════════════════════════════════════════ -->
    <div v-if="currentTab === 'battle'" class="flex-1 overflow-hidden">
      <BattleTestPanel />
    </div>

    <!-- ══════════════════════════════════════════════════ -->
    <!--  内容：特效测试模式                              -->
    <!-- ══════════════════════════════════════════════════ -->
    <template v-if="currentTab === 'effect'">
    <div class="flex flex-1 overflow-hidden">
      <!-- 侧边栏 -->
      <aside
        v-show="sidebarOpen"
        class="flex w-56 shrink-0 flex-col border-r border-base-300 bg-base-200/40 overflow-hidden"
      >
        <div class="flex items-center justify-between px-3 py-2 border-b border-base-300">
          <span class="text-xs font-semibold opacity-60">特效列表</span>
          <button class="btn btn-ghost btn-xs" @click="refreshRegistry" title="刷新注册表">
            <Icon icon="ph:arrow-clockwise" />
          </button>
        </div>
        <ul class="menu menu-sm flex-1 overflow-y-auto p-2">
          <li v-for="ef in EFFECT_REGISTRY" :key="ef.id">
            <a
              :class="{ active: selectedId === ef.id }"
              class="text-sm"
              @click="selectEffect(ef.id)"
            >
              {{ ef.name }}
            </a>
          </li>
        </ul>
      </aside>

      <!-- 画布区域 -->
      <main class="relative flex-1 bg-black overflow-hidden">
        <canvas ref="canvasRef" class="absolute inset-0" />

        <!-- 画布叠加信息 (HUD) -->
        <div
          v-if="currentEffect"
          class="pointer-events-none absolute top-3 left-3 flex flex-col gap-1"
        >
          <span class="text-[11px] text-white/40 font-mono">
            {{ currentEffect.name }}
            <span v-if="loopEnabled" class="text-primary/60">loop</span>
          </span>
          <span class="text-[11px] text-white/30 font-mono tabular-nums">
            active: {{ activeCount }}
          </span>
          <span class="text-[11px] text-white/25 font-mono tabular-nums">
            scale: {{ scaleDisplay }}
          </span>
        </div>
      </main>
    </div>

    <!-- ══════════════════════════════════════════════════ -->
    <!--  底部参数面板                                    -->
    <!-- ══════════════════════════════════════════════════ -->
    <div
      v-show="paramsOpen"
      class="border-t border-base-300 bg-base-100/90 overflow-y-auto"
      :class="paramsOpen ? 'max-h-[45vh]' : 'max-h-0'"
    >
      <!-- 地图参数组（常驻，无需选中特效） -->
      <div class="p-4 pb-0">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div class="card card-compact bg-base-200/70 md:col-span-2 lg:col-span-3">
            <div class="card-body p-3">
              <h4 class="card-title text-xs opacity-60 mb-1">地图</h4>
              <div class="flex flex-wrap gap-3 items-end">
                <!-- 形状选择 -->
                <label class="form-control min-w-[100px]">
                  <span class="label-text text-[11px]">形状</span>
                  <select
                    v-model="arenaShape"
                    class="select select-bordered select-xs mt-0.5"
                    @change="onShapeChange"
                  >
                    <option v-for="opt in shapeOptions" :key="opt.value" :value="opt.value">
                      {{ opt.label }}
                    </option>
                  </select>
                </label>
                <!-- 墙壁风格 -->
                <label class="form-control min-w-[110px]">
                  <span class="label-text text-[11px]">墙壁风格</span>
                  <select
                    v-model="wallStyle"
                    class="select select-bordered select-xs mt-0.5"
                    @change="onWallStyleChange"
                  >
                    <option :value="WallStyle.NEON">霓虹发光</option>
                    <option :value="WallStyle.DAISY">柔和虚线</option>
                  </select>
                </label>
                <!-- 通用：逻辑宽高 -->
                <label class="form-control min-w-[100px]">
                  <span class="label-text text-[11px] flex justify-between">
                    <span>逻辑宽度</span>
                    <span class="font-mono opacity-70 tabular-nums">{{ arenaW }}</span>
                  </span>
                  <input
                    v-model.number="arenaW"
                    :min="640" :max="2560" :step="64"
                    type="range"
                    class="range range-secondary range-xs mt-0.5"
                    @input="onArenaChange()"
                  />
                </label>
                <label class="form-control min-w-[100px]">
                  <span class="label-text text-[11px] flex justify-between">
                    <span>逻辑高度</span>
                    <span class="font-mono opacity-70 tabular-nums">{{ arenaH }}</span>
                  </span>
                  <input
                    v-model.number="arenaH"
                    :min="360" :max="1440" :step="36"
                    type="range"
                    class="range range-secondary range-xs mt-0.5"
                    @input="onArenaChange()"
                  />
                </label>
                <!-- 圆形/六边形：半径 -->
                <label v-if="arenaShape !== ArenaShape.RECT" class="form-control min-w-[100px]">
                  <span class="label-text text-[11px] flex justify-between">
                    <span>{{ arenaShape === ArenaShape.HEXAGON ? '外接圆半径' : '竞技场半径' }}</span>
                    <span class="font-mono opacity-70 tabular-nums">{{ arenaRadius }}</span>
                  </span>
                  <input
                    v-model.number="arenaRadius"
                    :min="140" :max="560" :step="14"
                    type="range"
                    class="range range-secondary range-xs mt-0.5"
                    @input="onArenaChange()"
                  />
                </label>
                <!-- 矩形：半宽/半高 -->
                <template v-if="arenaShape === ArenaShape.RECT">
                  <label class="form-control min-w-[100px]">
                    <span class="label-text text-[11px] flex justify-between">
                      <span>半宽</span>
                      <span class="font-mono opacity-70 tabular-nums">{{ arenaHalfW }}</span>
                    </span>
                    <input
                      v-model.number="arenaHalfW"
                      :min="100" :max="500" :step="10"
                      type="range"
                      class="range range-secondary range-xs mt-0.5"
                      @input="onArenaChange()"
                    />
                  </label>
                  <label class="form-control min-w-[100px]">
                    <span class="label-text text-[11px] flex justify-between">
                      <span>半高</span>
                      <span class="font-mono opacity-70 tabular-nums">{{ arenaHalfH }}</span>
                    </span>
                    <input
                      v-model.number="arenaHalfH"
                      :min="80" :max="400" :step="10"
                      type="range"
                      class="range range-secondary range-xs mt-0.5"
                      @input="onArenaChange()"
                    />
                  </label>
                </template>
                <div class="flex items-center gap-3 pb-0.5">
                  <span class="text-[11px] opacity-50">
                    scale: <span class="font-mono tabular-nums">{{ scaleDisplay }}</span>
                  </span>
                  <button class="btn btn-ghost btn-xs" @click="resetArena">重置</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="!currentEffect" class="px-4 py-6 text-center text-sm opacity-50">
        从左侧列表选择特效，或点击 <Icon icon="ph:play-fill" class="inline" /> 预览
      </div>

      <div v-else class="p-4">
        <!-- 参数分组 -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <!-- 位置参数组 -->
          <div v-if="posParams.length" class="card card-compact bg-base-200/70">
            <div class="card-body p-3">
              <h4 class="card-title text-xs opacity-60 mb-1">位置</h4>
              <div class="flex flex-wrap gap-3">
                <template v-for="param in posParams" :key="param.key">
                  <label class="form-control min-w-[120px]">
                    <span class="label-text text-[11px] flex justify-between">
                      <span>{{ param.label }}</span>
                      <span class="font-mono opacity-70 tabular-nums">{{ formatValue(paramValues[param.key]) }}</span>
                    </span>
                    <input
                      :value="paramValues[param.key]"
                      :min="param.min"
                      :max="param.max"
                      :step="param.step"
                      type="range"
                      class="range range-primary range-xs mt-0.5"
                      @input="setParam(param.key, ($event.target as HTMLInputElement).value)"
                    />
                  </label>
                </template>
              </div>
            </div>
          </div>

          <!-- 视觉参数组 -->
          <div v-if="visualParams.length" class="card card-compact bg-base-200/70">
            <div class="card-body p-3">
              <h4 class="card-title text-xs opacity-60 mb-1">视觉</h4>
              <div class="flex flex-wrap gap-3">
                <template v-for="param in visualParams" :key="param.key">
                  <!-- range -->
                  <label
                    v-if="param.type === 'range'"
                    class="form-control min-w-[120px]"
                  >
                    <span class="label-text text-[11px] flex justify-between">
                      <span>{{ param.label }}</span>
                      <span class="font-mono opacity-70 tabular-nums">{{ formatValue(paramValues[param.key]) }}</span>
                    </span>
                    <input
                      :value="paramValues[param.key]"
                      :min="param.min"
                      :max="param.max"
                      :step="param.step"
                      type="range"
                      class="range range-primary range-xs mt-0.5"
                      @input="setParam(param.key, ($event.target as HTMLInputElement).value)"
                    />
                  </label>

                  <!-- boolean -->
                  <label v-if="param.type === 'boolean'" class="label cursor-pointer gap-1.5 p-0">
                    <input
                      :checked="paramValues[param.key]"
                      type="checkbox"
                      class="toggle toggle-primary toggle-xs"
                      @change="setParam(param.key, ($event.target as HTMLInputElement).checked)"
                    />
                    <span class="label-text text-[11px]">{{ param.label }}</span>
                  </label>

                  <!-- number -->
                  <label v-if="param.type === 'number'" class="form-control min-w-[80px]">
                    <span class="label-text text-[11px]">{{ param.label }}</span>
                    <input
                      :value="paramValues[param.key]"
                      type="number"
                      class="input input-bordered input-xs w-22 mt-0.5"
                      @input="setParam(param.key, ($event.target as HTMLInputElement).value)"
                    />
                  </label>
                </template>
              </div>
            </div>
          </div>

          <!-- 颜色参数组 -->
          <div v-if="colorParams.length" class="card card-compact bg-base-200/70">
            <div class="card-body p-3">
              <h4 class="card-title text-xs opacity-60 mb-1">颜色</h4>
              <div class="flex flex-wrap gap-3">
                <template v-for="param in colorParams" :key="param.key">
                  <label class="form-control min-w-[130px]">
                    <span class="label-text text-[11px]">
                      {{ param.label }}
                      <span class="font-mono opacity-60 ml-1">{{ formatHex(paramValues[param.key]) }}</span>
                    </span>
                    <div class="flex items-center gap-1.5 mt-0.5">
                      <input
                        type="color"
                        :value="toColorInput(paramValues[param.key])"
                        class="input h-6 w-8 cursor-pointer p-0"
                        @input="setParamFromColorInput(param.key, ($event.target as HTMLInputElement).value)"
                      />
                      <input
                        :value="formatHex(paramValues[param.key])"
                        type="text"
                        class="input input-bordered input-xs w-22 font-mono"
                        @input="setParamFromHexInput(param.key, ($event.target as HTMLInputElement).value)"
                      />
                    </div>
                  </label>
                </template>
              </div>
            </div>
          </div>
        </div>

        <!-- 底部操作 -->
        <div class="flex items-center justify-between mt-3 pt-3 border-t border-base-300">
          <span class="text-[11px] opacity-50">
            {{ currentEffect.params.length }} 个参数
          </span>
          <div class="join">
            <button class="btn btn-ghost btn-xs join-item" @click="resetParams">
              <Icon icon="ph:arrow-counter-clockwise" />
              重置
            </button>
            <button class="btn btn-primary btn-xs join-item" @click="copyParams">
              <Icon icon="ph:copy" />
              复制 JSON
            </button>
          </div>
        </div>
      </div>
    </div>
  </template>

    <!-- ══════════════════════════════════════════════════ -->
    <!--  Toast 通知                                      -->
    <!-- ══════════════════════════════════════════════════ -->
    <div v-if="toastMessage" class="toast toast-top toast-center z-50">
      <div class="alert alert-success alert-soft py-2 text-sm">
        <Icon icon="ph:check" />
        <span>{{ toastMessage }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import Icon from '@/components/common/Icon.vue';
import {
  createEffectTestController,
  type EffectTestContext,
} from './test/EffectTestController';
import { EFFECT_REGISTRY, type EffectDefinition, type EffectParam, autoRegisterFromEnum } from './test/effectRegistry';
import { ArenaShape } from '$/backend/src/games/fish-oil-battle/config/GameEnums';
import { WallStyle } from './renderer/systems/ArenaRenderer';
import type { WallStyle as WallStyleType } from './renderer/systems/ArenaRenderer';
import BattleTestPanel from './components/BattleTestPanel.vue';

// ── 状态 ────────────────────────────────────────────

const canvasRef = ref<HTMLCanvasElement | null>(null);
const selectedId = ref(EFFECT_REGISTRY.value[0]?.id ?? '');
const loopEnabled = ref(false);
const loopInterval = ref(1500);
const activeCount = ref(0);
const sidebarOpen = ref(true);
const paramsOpen = ref(true);
const currentTab = ref<'effect' | 'battle'>('effect');

const paramValues = ref<Record<string, any>>({});

// ── 地图参数 ──────────────────────────────────────────
const arenaW = ref(1280);
const arenaH = ref(720);
const arenaRadius = ref(280);
const arenaShape = ref<ArenaShape>(ArenaShape.CIRCLE);
const arenaHalfW = ref(210);  // 矩形半宽 (≈ 280 * 0.75)
const arenaHalfH = ref(210);  // 矩形半高
const defaultArena = { w: 1280, h: 720, r: 280, shape: ArenaShape.CIRCLE, hw: 210, hh: 210 };

const wallStyle = ref<WallStyleType>(WallStyle.NEON);

const shapeOptions: { value: ArenaShape; label: string }[] = [
  { value: ArenaShape.CIRCLE, label: '圆形' },
  { value: ArenaShape.RECT, label: '矩形' },
  { value: ArenaShape.HEXAGON, label: '六边形' },
];

const toastMessage = ref('');
let toastTimer: ReturnType<typeof setTimeout> | null = null;

let ctx: EffectTestContext | null = null;
let loopTimer: ReturnType<typeof setInterval> | null = null;

// ── 计算属性 ────────────────────────────────────────

const currentEffect = computed<EffectDefinition | undefined>(() =>
  EFFECT_REGISTRY.value.find(e => e.id === selectedId.value),
);

/** 位置类参数 (X, Y, 起点/终点) */
const posParams = computed<EffectParam[]>(() =>
  currentEffect.value?.params.filter(p =>
    ['x', 'y', 'fromX', 'fromY', 'toX', 'toY'].includes(p.key),
  ) ?? [],
);

/** 视觉类参数 (范围、速度、线宽等) */
const visualParams = computed<EffectParam[]>(() =>
  currentEffect.value?.params.filter(p =>
    !['x', 'y', 'fromX', 'fromY', 'toX', 'toY', 'primaryColor', 'color'].includes(p.key),
  ) ?? [],
);

/** 颜色参数 */
const colorParams = computed<EffectParam[]>(() =>
  currentEffect.value?.params.filter(p =>
    ['primaryColor', 'color'].includes(p.key),
  ) ?? [],
);

/** 当前缩放因子显示 */
const scaleDisplay = computed(() => {
  if (!ctx) return '1.00';
  return ctx.getUniformScale().toFixed(2);
});

// ── 生命周期 ────────────────────────────────────────

onMounted(async () => {
  if (!canvasRef.value) return;
  ctx = await createEffectTestController(canvasRef.value);
  // 初始化时同步地图参数到渲染器（不自动播放，等 selectEffect 后播放）
  onArenaChange(true);
  selectEffect(selectedId.value);
  // 自动预览
  playOnce();
});

onUnmounted(() => {
  stopLoop();
  if (toastTimer) clearTimeout(toastTimer);
  ctx?.destroy();
  ctx = null;
});

// ── 特效切换 ────────────────────────────────────────

function selectEffect(id: string): void {
  selectedId.value = id;
  resetParams();
  // 切换特效时自动播放预览
  setTimeout(() => playOnce(), 50);
}

/** 刷新注册表（自动同步新增的 VisualEventType） */
function refreshRegistry(): void {
  // 清空注册表，重新自动注册
  EFFECT_REGISTRY.value = [];
  autoRegisterFromEnum();
  // 如果当前选中的特效已被移除，则选中第一个
  if (!EFFECT_REGISTRY.value.some(e => e.id === selectedId.value)) {
    selectedId.value = EFFECT_REGISTRY.value[0]?.id ?? '';
  }
  showToast('注册表已刷新');
}

// ── 参数更新 ────────────────────────────────────────

function setParam(key: string, value: any): void {
  const param = currentEffect.value?.params.find(p => p.key === key);
  let parsed = value;
  if (param && (param.type === 'range' || param.type === 'number')) {
    const num = Number(value);
    parsed = Number.isNaN(num) ? value : num;
  }
  paramValues.value = { ...paramValues.value, [key]: parsed };
}

function toColorInput(hex: number | undefined): string {
  if (hex === undefined || hex === null) return '#000000';
  return `#${hex.toString(16).padStart(6, '0')}`;
}

function formatHex(hex: number | undefined): string {
  if (hex === undefined || hex === null) return '0x000000';
  return `0x${hex.toString(16).toUpperCase().padStart(6, '0')}`;
}

function setParamFromColorInput(key: string, colorStr: string): void {
  const hex = parseInt(colorStr.replace('#', ''), 16);
  setParam(key, Number.isNaN(hex) ? paramValues.value[key] : hex);
}

function setParamFromHexInput(key: string, hexStr: string): void {
  const cleaned = hexStr.replace(/^0x/i, '').replace(/^#/, '');
  const hex = parseInt(cleaned, 16);
  if (!Number.isNaN(hex)) setParam(key, hex);
}

function formatValue(v: any): string {
  if (v === undefined || v === null) return '-';
  if (typeof v === 'number') {
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
  }
  return String(v);
}

function resetParams(): void {
  if (!currentEffect.value) return;
  const values: Record<string, any> = {};
  for (const p of currentEffect.value.params) {
    values[p.key] = p.defaultValue;
  }
  paramValues.value = values;
}

// ── 地图参数 ────────────────────────────────────────

function onArenaChange(skipPlay = false): void {
  if (!ctx) return;
  const config: any = {
    width: arenaW.value,
    height: arenaH.value,
    arenaRadius: arenaRadius.value,
    shape: arenaShape.value,
  };
  if (arenaShape.value === ArenaShape.RECT) {
    config.arenaHalfW = arenaHalfW.value;
    config.arenaHalfH = arenaHalfH.value;
  }
  ctx.setArenaConfig(config);
  if (!skipPlay) {
    // 地图变更后清除旧特效重新预览
    clearAll();
    setTimeout(() => playOnce(), 100);
  }
}

function onShapeChange(): void {
  // 切换形状时重置相关参数为合理默认值
  if (arenaShape.value === ArenaShape.RECT) {
    arenaHalfW.value = Math.round(arenaRadius.value * 0.75);
    arenaHalfH.value = Math.round(arenaRadius.value * 0.75);
  }
  onArenaChange();
}

function onWallStyleChange(): void {
  if (!ctx) return;
  ctx.setWallStyle(wallStyle.value);
}

function resetArena(): void {
  arenaW.value = defaultArena.w;
  arenaH.value = defaultArena.h;
  arenaRadius.value = defaultArena.r;
  arenaShape.value = defaultArena.shape;
  arenaHalfW.value = defaultArena.hw;
  arenaHalfH.value = defaultArena.hh;
  onArenaChange();
}

// ── 播放控制 ────────────────────────────────────────

function playOnce(): void {
  if (!ctx || !currentEffect.value) return;
  clearEffectById(currentEffect.value.id);
  currentEffect.value.play(ctx, { ...paramValues.value });
  updateActiveCount();
}

function clearEffectById(effectId: string): void {
  if (!ctx) return;
  const effects = ctx.activeEffects;
  for (let i = effects.length - 1; i >= 0; i--) {
    if (effects[i].type === effectId) {
      effects[i].onDecay(effects[i]);
      effects.splice(i, 1);
    }
  }
}

function clearAll(): void {
  ctx?.clearEffects();
  activeCount.value = 0;
}

function updateActiveCount(): void {
  if (ctx) {
    activeCount.value = ctx.activeEffects.length;
  }
}

function startLoop(): void {
  if (!loopEnabled.value) return;
  stopLoop();
  playOnce();
  loopTimer = setInterval(() => {
    playOnce();
  }, loopInterval.value);
}

function stopLoop(): void {
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
  }
}

watch(loopEnabled, (val) => {
  if (val) startLoop();
  else stopLoop();
});

// 定期刷新活跃计数
let countTimer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  countTimer = setInterval(() => {
    if (ctx) activeCount.value = ctx.activeEffects.length;
  }, 200);
});
onUnmounted(() => {
  if (countTimer) clearInterval(countTimer);
});

// ── 复制参数 ────────────────────────────────────────

function showToast(message: string, duration = 1500): void {
  toastMessage.value = message;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastMessage.value = '';
  }, duration);
}

async function copyParams(): Promise<void> {
  if (!currentEffect.value) return;
  const payload = {
    id: currentEffect.value.id,
    name: currentEffect.value.name,
    params: { ...paramValues.value },
  };
  const json = JSON.stringify(payload, null, 2);
  try {
    await navigator.clipboard.writeText(json);
    showToast('参数已复制到剪贴板');
  } catch {
    showToast('复制失败，请手动复制');
    console.error('Copy failed');
  }
}
</script>
