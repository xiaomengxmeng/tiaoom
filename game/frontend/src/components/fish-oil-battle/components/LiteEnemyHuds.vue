<template>
  <div class="flex flex-wrap justify-center gap-1 pointer-events-none">
    <div
      v-for="hud in huds"
      :key="hud.name"
      class="bg-base-100/80 backdrop-blur-sm rounded px-1.5 py-0.5 flex items-center gap-1 min-w-0"
      :class="[
        !hud.alive ? 'opacity-40 grayscale' : '',
        compact ? 'max-w-[22%]' : 'max-w-[32%]',
      ]"
    >
      <span class="text-[10px] truncate leading-none text-base-content/80">{{ hud.name }}</span>
      <progress
        class="progress h-1"
        :class="[hpPercent(hud) > 30 ? 'progress-success' : 'progress-error', compact ? 'w-8' : 'w-12']"
        :value="hud.currentHp"
        :max="hud.maxHp"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { HudPlayerInfo } from '../useFishOilBattle';

defineProps<{
  huds: HudPlayerInfo[];
  compact: boolean;
}>();

function hpPercent(hud: HudPlayerInfo): number {
  return hud.maxHp > 0 ? (hud.currentHp / hud.maxHp) * 100 : 0;
}
</script>
