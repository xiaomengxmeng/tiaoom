<template>
  <div ref="containerRef" class="absolute inset-0 overflow-hidden">
    <canvas ref="canvasRef" class="block" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import * as PIXI from 'pixi.js';

const props = defineProps({
  /** 画布宽度（px），默认 1280 */
  width: { type: Number, default: 1280 },
  /** 画布高度（px） */
  height: { type: Number, default: 720 },
  /** 是否开启抗锯齿 */
  antialias: { type: Boolean, default: true },
  /** 背景色（默认透明，由 ArenaRenderer 绘制背景） */
  backgroundColor: { type: Number, default: 0x00000000 }, // 透明
});

const emit = defineEmits<{
  (e: 'ready', app: PIXI.Application, container: PIXI.Container): void;
  (e: 'resize', w: number, h: number): void;
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
let app: PIXI.Application | null = null;
let resizeObserver: ResizeObserver | null = null;

async function initPixi() {
  if (!canvasRef.value || !containerRef.value) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  app = new PIXI.Application();
  await app.init({
    canvas: canvasRef.value,
    width: props.width,
    height: props.height,
    antialias: props.antialias,
    background: props.backgroundColor,
    resolution: dpr,
    eventMode: 'none',
  });

  // 缩放 canvas CSS 尺寸到容器大小
  fitCanvasToContainer();

  // ResizeObserver：容器尺寸变化时自适应
  resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        fitCanvasToContainer();
        emit('resize', Math.round(width), Math.round(height));
      }
    }
  });
  if (containerRef.value) {
    resizeObserver.observe(containerRef.value);
  }

  emit('ready', app, app.stage);
}

function fitCanvasToContainer() {
  if (!app || !containerRef.value) return;
  const rect = containerRef.value.getBoundingClientRect();
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  if (w === 0 || h === 0) return;

  // 更新 Pixi 渲染器尺寸
  app.renderer.resize(w, h);

  // CSS：让 canvas 元素铺满容器
  const canvas = app.canvas;
  if (canvas instanceof HTMLCanvasElement) {
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
  }
}

onMounted(() => {
  initPixi();
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (app) {
    app.destroy(true, { children: true });
    app = null;
  }
});

defineExpose({ getApp: () => app });
</script>
