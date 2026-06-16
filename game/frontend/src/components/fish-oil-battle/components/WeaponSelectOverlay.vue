<template>
  <Transition name="zoom">
    <div
      v-if="show"
      class="absolute inset-0 z-20 flex items-center justify-center
                  bg-base-300/60 backdrop-blur-md rounded-xl"
    >
      <!-- 选择面板 -->
      <div
        class="bg-base-100/90 shadow-2xl px-8 py-6 rounded-2xl
                    border border-primary/20 w-[700px] max-w-[95vw]"
      >
        <!-- 标题 -->
        <div class="text-center mb-6">
          <h2 class="text-2xl font-bold text-primary">选择你的赛博武器</h2>
          <div class="flex items-center justify-center gap-2 mt-2">
            <span class="text-base-content/60 text-sm">剩余时间</span>
            <span
              class="text-3xl font-mono font-bold tabular-nums"
              :class="{ 'text-error animate-pulse': countdown <= 5 }"
            >
              {{ countdown }}
            </span>
            <span class="text-base-content/60 text-sm">秒</span>
          </div>
        </div>

        <!-- 武器卡片网格 -->
        <div class="grid grid-cols-3 gap-4 justify-center">
          <div
            v-for="weapon in weapons"
            :key="weapon.id"
            class="bg-base-200/80 rounded-xl p-4
                        border-2 cursor-pointer transition-all duration-200
                        hover:scale-105 hover:shadow-lg"
            :class="[cardClass(weapon)]"
            @click="selectWeapon(weapon.id)"
          >
            <!-- 图标 -->
            <div class="flex justify-center mb-3">
              <div class="p-3 rounded-full bg-base-300/50">
                <Icon :icon="weapon.iconId" class="text-4xl" :class="iconClass(weapon.faction)" />
              </div>
            </div>

            <!-- 名称 -->
            <h3 class="text-center font-bold text-base-content mb-2">
              {{ weapon.name }}
            </h3>

            <!-- 流派 badge -->
            <div class="text-center mb-2">
              <span class="badge text-xs" :class="factionBadgeClass(weapon.faction)">
                {{ factionLabel(weapon.faction) }}
              </span>
            </div>

            <!-- 难度星级 -->
            <div class="text-center text-xs" :class="starColorClass(weapon.difficulty)">
              {{ '⭐'.repeat(weapon.difficulty) }}
            </div>
          </div>
        </div>

        <!-- 提示 -->
        <div class="text-center mt-4">
          <span v-if="selectedId" class="text-success text-sm">已选定，等待对手...</span>
          <span v-else class="text-error/70 text-sm">超时后将自动随机选择</span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import Icon from '@/components/common/Icon.vue';
import type { SelectableWeapon } from '../useFishOilBattle';

const props = withDefaults(defineProps<{
  show: boolean;
  weapons: SelectableWeapon[];
  selectedId: string | null;
  countdown: number;
}>(), {
  countdown: 15,
});

const emit = defineEmits<{
  (e: 'select', weaponId: string): void;
}>();

function selectWeapon(weaponId: string): void {
  if (props.selectedId) return; // 已选不能再选
  emit('select', weaponId);
}

// ── 流派色类名映射 ──────────────────────────────────────
const factionColorMap: Record<string, string> = {
  aggressor: 'secondary',
  controller: 'info',
  engineer: 'success',
  wildcard: 'warning',
};

function cardClass(w: SelectableWeapon): string {
  const color = factionColorMap[w.faction] ?? 'primary';
  const isSelected = props.selectedId === w.id;
  return [
    `border-${color}/40`,
    isSelected ? `border-${color} ring-2 ring-${color}/50 scale-105` : 'border-transparent',
  ].join(' ');
}

function iconClass(faction: string): string {
  return `text-${factionColorMap[faction] ?? 'primary'}`;
}

function factionBadgeClass(faction: string): string {
  return `badge-${factionColorMap[faction] ?? 'primary'}`;
}

function factionLabel(faction: string): string {
  const map: Record<string, string> = {
    aggressor: '🟣 侵略者',
    controller: '🔵 控制者',
    engineer: '🟢 工程师',
    wildcard: '🟡 变奏者',
  };
  return map[faction] ?? faction;
}

function starColorClass(difficulty: number): string {
  if (difficulty === 1) return 'text-success';
  if (difficulty === 2) return 'text-warning';
  return 'text-error';
}
</script>

<style scoped>
.zoom-enter-active, .zoom-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.zoom-enter-from, .zoom-leave-to {
  opacity: 0;
  transform: scale(0.9);
}
</style>
