<template>
  <div class="flex-none flex items-center justify-between px-2 py-1 bg-base-100/90 backdrop-blur-sm border-b border-base-content/10 text-xs gap-1">
    <!-- 左侧：身份 + 昵称 + 武器名（窄屏隐藏） -->
    <div class="flex items-center gap-1 min-w-0 flex-shrink">
      <span
        class="badge badge-xs font-mono flex-none"
        :class="isWatcher ? 'badge-ghost' : alive ? 'badge-primary' : 'badge-error'"
      >
        {{ isWatcher ? '观' : alive ? '我' : '亡' }}
      </span>
      <span class="truncate font-medium text-base-content/80">{{ name }}</span>
      <span v-if="weaponName" class="truncate text-base-content/40 hidden sm:inline text-[10px]">{{ weaponName }}</span>
    </div>

    <!-- 中间：血条 + 能量条（弹性宽度） -->
    <template v-if="!isWatcher">
      <div class="flex items-center gap-1 min-w-0 flex-1 justify-center">
        <progress
          class="progress progress-success h-1.5 max-w-24 min-w-10 flex-1"
          :class="hpPercent > 30 ? 'progress-success' : 'progress-error'"
          :value="currentHp"
          :max="maxHp"
        />
        <progress
          class="progress progress-warning h-1.5 max-w-16 min-w-8 flex-1"
          :value="currentEn"
          :max="maxEn"
        />
      </div>
    </template>
    <div v-else class="flex-1" />

    <!-- 右侧：回合时间 + 存活数 -->
    <div class="flex items-center gap-1.5 flex-none">
      <span
        class="font-mono font-bold tabular-nums text-[11px]"
        :class="roundTimeUrgent ? 'text-error animate-pulse' : 'text-base-content/80'"
      >
        {{ roundTime }}
      </span>
      <span class="text-base-content/40 tabular-nums text-[10px]">{{ aliveCount }}/{{ totalCount }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  name: string;
  currentHp: number;
  maxHp: number;
  currentEn: number;
  maxEn: number;
  alive: boolean;
  weaponName?: string;
  isWatcher: boolean;
  roundTime: string;
  aliveCount: number;
  totalCount: number;
}>(), {
  weaponName: '',
});

const hpPercent = computed(() =>
  props.maxHp > 0 ? (props.currentHp / props.maxHp) * 100 : 0
);

const roundTimeUrgent = computed(() => {
  // roundTime 格式为 "mm:ss"，解析秒数
  const parts = props.roundTime.split(':');
  if (parts.length === 2) {
    const totalSec = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    return totalSec <= 10;
  }
  return false;
});
</script>
