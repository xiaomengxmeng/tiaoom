<template>
  <!--
    设计参考：主体设计图.png
    - 底部角落的紧凑信息卡片
    - 名字 + HP条 + 技能圆球（5个）
  -->
  <div
    :class="containerClass"
    class="bg-base-100/80 backdrop-blur-sm rounded-lg border shadow-lg px-4 py-3 flex items-center gap-3"
  >
    <!-- 左侧：名字 + HP -->
    <div class="flex flex-col gap-1 min-w-0">
      <div :class="nameClass" class="font-bold text-sm truncate">
        {{ name }}
      </div>
      <div class="flex items-center gap-2">
        <span class="text-[10px] text-base-content/50 font-mono">HP</span>
        <progress
          class="progress w-24 h-2"
          :class="hpProgressClass"
          :value="currentHp"
          :max="maxHp"
        />
        <span class="text-[10px] font-mono text-base-content/60">
          {{ currentHp }} / {{ maxHp }}
        </span>
      </div>
    </div>

    <!-- 右侧：技能圆球（5个） -->
    <div class="flex gap-1.5">
      <div
        v-for="i in 5"
        :key="i"
        class="w-6 h-6 rounded-full ring-2 transition-all duration-300"
        :class="skillOrbClass(i)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  side: 'left' | 'right';
  name: string;
  currentHp: number;
  maxHp: number;
  currentEn: number;
  maxEn: number;
  weaponName: string;
  weaponIcon: string;
  weaponCd: number;       // 秒，0=就绪
  overheated?: boolean;
}>(), {
  overheated: false,
});

const isLeft = computed(() => props.side === 'left');

// ── 样式计算 ──────────────────────────────────────

/** 容器位置 */
const containerClass = computed(() =>
  isLeft.value ? '' : ''
);

/** 玩家名颜色 */
const nameClass = computed(() =>
  isLeft.value ? 'text-primary' : 'text-error'
);

/** HP 进度条颜色 */
const hpProgressClass = computed(() =>
  isLeft.value ? 'progress-success' : 'progress-error'
);

/**
 * 技能圆球样式（根据能量百分比显示充能状态）
 * 能量 0-20%: 暗淡
 * 能量 20-60%: 半亮
 * 能量 60-100%: 全亮发光
 * 过热: 闪烁警告色
 */
function skillOrbClass(index: number): string {
  const enRatio = props.maxEn > 0 ? props.currentEn / props.maxEn : 0;
  const thresholdPerOrb = 1 / 5;
  const orbFillLevel = (index - 1) * thresholdPerOrb;

  if (props.overheated) {
    return isLeft.value
      ? 'bg-warning/30 ring-warning animate-pulse'
      : 'bg-warning/30 ring-warning animate-pulse';
  }

  // 这个球应该亮起的能量阈值
  const baseColor = isLeft.value ? 'primary' : 'error';

  if (enRatio >= orbFillLevel + thresholdPerOrb) {
    return `bg-${baseColor} ring-${baseColor}/60`;
  } else if (enRatio >= orbFillLevel) {
    return `bg-${baseColor}/40 ring-${baseColor}/30`;
  }
  return `bg-base-300 ring-base-content/10`;
}
</script>
