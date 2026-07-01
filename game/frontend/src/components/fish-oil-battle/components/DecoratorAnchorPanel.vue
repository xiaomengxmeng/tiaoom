<!--
  装饰锚点调整面板
  在 PIXI 画布上显示：球（固定中心）+ 装饰 sprite（锚点对齐球心）+ 可拖拽锚点指示器
  支持：点击切换装饰、拖拽红色锚点、键盘微调、旋转预览、复制代码
-->
<template>
  <div class="flex h-full">
    <!-- 左侧装饰列表 -->
    <aside class="w-56 shrink-0 flex flex-col border-r border-base-300 bg-base-200/40 overflow-hidden">
      <div class="px-3 py-2 border-b border-base-300">
        <span class="text-xs font-semibold opacity-60">装饰列表</span>
      </div>
      <ul class="menu menu-sm flex-1 overflow-y-auto p-2">
        <li v-for="d in DECOS" :key="d.name">
          <a
            :class="{ active: currentName === d.name }"
            class="text-sm"
            @click="selectDeco(d.name)"
          >
            {{ d.label }}
          </a>
        </li>
      </ul>
      <!-- 底部参数 -->
      <div class="border-t border-base-300 p-3 flex flex-col gap-2">
        <label class="form-control">
          <span class="label-text text-[11px] flex justify-between">
            <span>球半径</span>
            <span class="font-mono tabular-nums">{{ ballRadius }}px</span>
          </span>
          <input
            v-model.number="ballRadius"
            type="range"
            class="range range-primary range-xs mt-0.5"
            :min="20" :max="80" :step="1"
          />
        </label>
        <label class="form-control">
          <span class="label-text text-[11px] flex justify-between">
            <span>装饰缩放</span>
            <span class="font-mono tabular-nums">{{ decoScale.toFixed(2) }}x</span>
          </span>
          <input
            v-model.number="decoScaleInput"
            type="range"
            class="range range-secondary range-xs mt-0.5"
            :min="30" :max="200" :step="1"
          />
        </label>
        <label class="label cursor-pointer gap-1.5 p-0">
          <input v-model="rotateEnabled" type="checkbox" class="toggle toggle-primary toggle-xs" />
          <span class="label-text text-xs">旋转预览</span>
        </label>
      </div>
    </aside>

    <!-- 右侧画布 + 信息栏 -->
    <main class="relative flex-1 flex flex-col bg-black overflow-hidden">
      <div class="flex-1 relative">
        <canvas ref="canvasRef" class="absolute inset-0" />
        <!-- 顶部 HUD -->
        <div class="pointer-events-none absolute top-3 left-3 flex flex-col gap-1">
          <span class="text-[11px] text-white/60 font-mono">
            {{ currentDeco?.label }}
          </span>
          <span class="text-[11px] text-white/40 font-mono tabular-nums">
            anchor: set({{ anchor.x.toFixed(3) }}, {{ anchor.y.toFixed(3) }})
          </span>
          <span v-if="isRotatingDeco" class="text-[11px] text-emerald-400/70 font-mono">
            🔄 旋转类装饰
          </span>
        </div>
        <!-- 操作提示 -->
        <div class="pointer-events-none absolute bottom-3 left-3 text-[10px] text-white/30 font-mono">
          拖拽红色十字调整锚点 · 方向键微调(±0.005) · Shift+方向键(±0.01) · R 重置
        </div>
      </div>
      <!-- 底部信息栏 -->
      <div class="border-t border-base-300 bg-base-100/90 px-4 py-2 flex items-center justify-between gap-3">
        <code class="text-xs font-mono bg-base-300/50 px-2 py-1 rounded text-emerald-600">
          this.sprite.anchor.set({{ anchor.x.toFixed(3) }}, {{ anchor.y.toFixed(3) }});
        </code>
        <div class="flex gap-2">
          <button class="btn btn-ghost btn-xs" @click="resetAnchor">
            <Icon icon="ph:arrow-counter-clockwise" />
            重置
          </button>
          <button class="btn btn-primary btn-xs" @click="copyCurrent">
            <Icon icon="ph:copy" />
            复制
          </button>
          <button class="btn btn-outline btn-xs" @click="copyAll">
            <Icon icon="ph:copy" />
            全部复制
          </button>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import * as PIXI from 'pixi.js';
import Icon from '@/components/common/Icon.vue';

// ══════════════════════════════════════════════════════
// 装饰定义（与 WeaponDecorators.ts 保持一致）
// ══════════════════════════════════════════════════════

interface DecoDef {
  name: string;
  label: string;
  rotate: boolean;
  baseScale: number;
  yOffset: number;
  defaultAnchor?: { x: number; y: number };
}

const DECOS: DecoDef[] = [
  { name: 'cat-ear',         label: '放电猫猫 - 猫耳',           rotate: false, baseScale: 0.44, yOffset: -30 },
  { name: 'cloud-bolt',      label: '情绪天气 - 云朵+闪电',      rotate: false, baseScale: 0.44, yOffset: -25, defaultAnchor: { x: 0.507, y: 0.435 } },
  { name: 'floating-book',   label: '流体操控 - 漂浮古籍',       rotate: false, baseScale: 0.48, yOffset: -15 },
  { name: 'vine-bud',        label: '植物伙伴 - 藤蔓',           rotate: false, baseScale: 0.48, yOffset: 0 },
  { name: 'triple-triangle', label: '无限折叠 - 3 个三角形',     rotate: true,  baseScale: 0.48, yOffset: 0 },
  { name: 'hex-shard-ring',  label: '记忆回廊 - 6 边形环',       rotate: true,  baseScale: 0.48, yOffset: 0 },
  { name: 'triple-blade',    label: '光学斩击 - 3 把刀',         rotate: true,  baseScale: 0.48, yOffset: 0, defaultAnchor: { x: 0.649, y: 0.586 } },
  { name: 'palette-brush',   label: '画作实体化 - 画板',         rotate: false, baseScale: 0.48, yOffset: 0, defaultAnchor: { x: 0.443, y: 0.690 } },
  { name: 'air-field',       label: '空气斥力场 - 双圈虚线',     rotate: true,  baseScale: 0.55, yOffset: 0 },
  { name: 'moon-halo',       label: '熵寂之触 - 月轮',           rotate: true,  baseScale: 0.55, yOffset: 0 },
  { name: 'lens-crosshair',  label: '预知透镜 - 准星',           rotate: true,  baseScale: 0.55, yOffset: 0 },
  { name: 'mood-aura',       label: '情绪掌控 - 心境光环',       rotate: true,  baseScale: 0.55, yOffset: 0 },
];

// Vite 预加载所有装饰 PNG 资源 URL
const decoratorAssets = import.meta.glob<{ default: string }>(
  '../renderer/entities/decorators/assets/*.png',
  { eager: true, query: '?url', import: 'default' },
);

// ══════════════════════════════════════════════════════
// 状态
// ══════════════════════════════════════════════════════

const canvasRef = ref<HTMLCanvasElement | null>(null);
const currentName = ref<string>(DECOS[0].name);
const ballRadius = ref(36);  // 与游戏 PLAYER_BASE_RADIUS 一致
const decoScaleInput = ref(100);
const decoScale = computed(() => decoScaleInput.value / 100);
const rotateEnabled = ref(true);

// 12 个装饰的 anchor 状态
const anchors = ref<Record<string, { x: number; y: number }>>(
  Object.fromEntries(DECOS.map(d => [d.name, d.defaultAnchor ?? { x: 0.5, y: 0.5 }])),
);
const anchor = computed(() => anchors.value[currentName.value]);
const currentDeco = computed(() => DECOS.find(d => d.name === currentName.value));
const isRotatingDeco = computed(() => currentDeco.value?.rotate ?? false);

// ══════════════════════════════════════════════════════
// PIXI 资源
// ══════════════════════════════════════════════════════

let app: PIXI.Application | null = null;
let ballSprite: PIXI.Graphics | null = null;
let decoSprite: PIXI.Sprite | null = null;
let anchorIndicator: PIXI.Graphics | null = null;
let centerIndicator: PIXI.Graphics | null = null;
let dragging = false;
let rotation = 0;
let lastTime = 0;

const LOGICAL_SIZE = 400;  // 画布逻辑尺寸 400×400

// ══════════════════════════════════════════════════════
// 初始化 PIXI
// ══════════════════════════════════════════════════════

onMounted(async () => {
  if (!canvasRef.value) return;
  app = new PIXI.Application();
  await app.init({
    canvas: canvasRef.value,
    width: LOGICAL_SIZE,
    height: LOGICAL_SIZE,
    antialias: true,
    background: 0x0a0a1a,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  canvasRef.value.style.width = '100%';
  canvasRef.value.style.height = '100%';

  const stage = app.stage;
  stage.sortableChildren = true;

  // 1. 球（深灰 + 高光）
  ballSprite = new PIXI.Graphics();
  ballSprite.zIndex = 10;
  stage.addChild(ballSprite);

  // 2. 装饰 sprite
  decoSprite = new PIXI.Sprite();
  decoSprite.zIndex = 5;
  stage.addChild(decoSprite);

  // 3. 中心参考点（蓝色十字）
  centerIndicator = new PIXI.Graphics();
  centerIndicator.zIndex = 20;
  stage.addChild(centerIndicator);

  // 4. 锚点指示器（红色十字 + 圆点，可拖拽）
  anchorIndicator = new PIXI.Graphics();
  anchorIndicator.zIndex = 30;
  anchorIndicator.eventMode = 'static';
  anchorIndicator.cursor = 'grab';
  stage.addChild(anchorIndicator);

  // 拖拽事件
  anchorIndicator.on('pointerdown', (e) => {
    dragging = true;
    anchorIndicator!.cursor = 'grabbing';
  });
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;
  app.stage.on('pointermove', (e) => {
    if (!dragging) return;
    const pos = e.global;
    const nx = Math.max(0, Math.min(1, pos.x / LOGICAL_SIZE));
    const ny = Math.max(0, Math.min(1, pos.y / LOGICAL_SIZE));
    anchors.value[currentName.value] = { x: nx, y: ny };
  });
  app.stage.on('pointerup', () => {
    dragging = false;
    if (anchorIndicator) anchorIndicator.cursor = 'grab';
  });
  app.stage.on('pointerupoutside', () => {
    dragging = false;
    if (anchorIndicator) anchorIndicator.cursor = 'grab';
  });

  // 渲染循环
  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS / 1000;
    if (rotateEnabled.value && isRotatingDeco.value) {
      rotation += dt * 0.6;
    }
    render();
  });

  // 加载初始装饰
  await loadDeco(currentName.value);
  render();
});

onUnmounted(() => {
  app?.destroy(true);
  app = null;
});

// ══════════════════════════════════════════════════════
// 装饰加载
// ══════════════════════════════════════════════════════

async function loadDeco(name: string): Promise<void> {
  if (!app) return;
  const url = decoratorAssets[`../renderer/entities/decorators/assets/${name}.png`];
  if (!url) {
    console.warn('[DecoratorAnchorPanel] 装饰资源未找到:', name);
    return;
  }
  let tex = PIXI.Assets.get(url);
  if (!tex) {
    tex = await PIXI.Assets.load(url);
  }
  if (decoSprite) {
    decoSprite.texture = tex;
  }
}

// ══════════════════════════════════════════════════════
// 渲染
// ══════════════════════════════════════════════════════

function render(): void {
  if (!app || !ballSprite || !decoSprite || !anchorIndicator || !centerIndicator) return;
  const cx = LOGICAL_SIZE / 2;
  const cy = LOGICAL_SIZE / 2;
  const r = ballRadius.value;

  // 1. 球（深灰 + 高光，模拟游戏中的 skill orb）
  ballSprite.clear();
  // 主体深灰
  ballSprite.circle(cx, cy, r);
  ballSprite.fill({ color: 0x2a2a35 });
  // 高光
  ballSprite.ellipse(cx - r * 0.3, cy - r * 0.35, r * 0.35, r * 0.22);
  ballSprite.fill({ color: 0xffffff, alpha: 0.18 });
  // 边缘暗化
  ballSprite.circle(cx, cy, r);
  ballSprite.stroke({ color: 0x000000, width: 2, alpha: 0.45 });

  // 2. 装饰 sprite
  const deco = currentDeco.value;
  if (deco && decoSprite.texture) {
    const a = anchor.value;
    // 装饰 sprite 位置 = 球心 + yOffset
    decoSprite.position.set(cx, cy + deco.yOffset);
    decoSprite.anchor.set(a.x, a.y);
    // PNG 256×256 → 实际显示：baseScale * decoScale * (LOGICAL_SIZE / 256) 让 1.0 缩放 = 画布大小
    const pngPixels = 256;
    const targetScale = (LOGICAL_SIZE / pngPixels) * deco.baseScale * decoScale.value * 2.5;
    decoSprite.scale.set(targetScale);
    decoSprite.rotation = (rotateEnabled.value && deco.rotate) ? rotation : 0;
    decoSprite.alpha = 1;
  } else {
    decoSprite.alpha = 0;
  }

  // 3. 中心参考点（蓝色十字）
  centerIndicator.clear();
  centerIndicator.moveTo(cx - 8, cy).lineTo(cx + 8, cy);
  centerIndicator.moveTo(cx, cy - 8).lineTo(cx, cy + 8);
  centerIndicator.stroke({ color: 0x4DA6FF, width: 1.5, alpha: 0.7 });

  // 4. 锚点指示器（红色十字 + 圆点）
  const a = anchor.value;
  const ax = a.x * LOGICAL_SIZE;
  const ay = a.y * LOGICAL_SIZE;
  anchorIndicator.clear();
  // 十字
  anchorIndicator.moveTo(ax - 10, ay).lineTo(ax + 10, ay);
  anchorIndicator.moveTo(ax, ay - 10).lineTo(ax, ay + 10);
  anchorIndicator.stroke({ color: 0xF38BA8, width: 2.5, alpha: 0.95 });
  // 中心圆点（可点击区域）
  anchorIndicator.circle(ax, ay, 6);
  anchorIndicator.fill({ color: 0xF38BA8, alpha: 0.3 });
  anchorIndicator.stroke({ color: 0xF38BA8, width: 1.5, alpha: 0.95 });
  // 扩展点击区域（透明）
  anchorIndicator.circle(ax, ay, 14);
  anchorIndicator.fill({ color: 0x000000, alpha: 0 });
}

// ══════════════════════════════════════════════════════
// 交互
// ══════════════════════════════════════════════════════

function selectDeco(name: string): void {
  currentName.value = name;
  loadDeco(name);
}

function resetAnchor(): void {
  const d = currentDeco.value;
  anchors.value[currentName.value] = d?.defaultAnchor ?? { x: 0.5, y: 0.5 };
}

// 键盘事件
function onKeyDown(e: KeyboardEvent): void {
  if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
  const step = e.shiftKey ? 0.01 : 0.005;
  const a = anchors.value[currentName.value];
  let changed = false;
  if (e.key === 'ArrowLeft')  { a.x = Math.max(0, a.x - step); changed = true; }
  if (e.key === 'ArrowRight') { a.x = Math.min(1, a.x + step); changed = true; }
  if (e.key === 'ArrowUp')    { a.y = Math.max(0, a.y - step); changed = true; }
  if (e.key === 'ArrowDown')  { a.y = Math.min(1, a.y + step); changed = true; }
  if (e.key === 'r' || e.key === 'R') { resetAnchor(); changed = true; }
  if (changed) e.preventDefault();
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', onKeyDown);
  onUnmounted(() => window.removeEventListener('keydown', onKeyDown));
}

// ══════════════════════════════════════════════════════
// 复制
// ══════════════════════════════════════════════════════

function formatAnchor(name: string): string {
  const d = DECOS.find(x => x.name === name);
  const a = anchors.value[name];
  return `/** ${d?.label ?? name} */\nthis.sprite.anchor.set(${a.x.toFixed(3)}, ${a.y.toFixed(3)});`;
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

async function copyCurrent(): Promise<void> {
  await copyText(formatAnchor(currentName.value));
}

async function copyAll(): Promise<void> {
  const text = DECOS.map(d => formatAnchor(d.name)).join('\n');
  await copyText(text);
}

// 监听状态变化触发重渲染（render 已在 ticker 中每帧调用，这里无需额外操作）
watch([ballRadius, decoScale, rotateEnabled], () => {});
</script>
