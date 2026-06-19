<template>
  <template v-if="show">
    <!-- compact 模式：底部浮层面板，地图仍然可见 -->
    <Transition name="slide-up" appear>
      <div
        v-if="compact"
        class="absolute bottom-0 left-0 right-0 z-20 bg-base-100/95 backdrop-blur-md border-t border-primary/30 rounded-t-2xl shadow-2xl px-3 pt-2 pb-3 max-h-[52vh] overflow-y-auto"
      >
        <!-- 标题行 -->
        <div class="flex items-center justify-between mb-2">
          <h2 class="font-bold text-primary text-sm">选择赛博武器</h2>
          <span
            class="font-mono font-bold tabular-nums text-sm"
            :class="countdown <= 5 ? 'text-error animate-pulse' : 'text-base-content/70'"
          >
            {{ countdown }}s
          </span>
        </div>

        <!-- 武器卡片网格：2~4 列自适应 -->
        <div v-if="weapons.length > 0" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
          <div
            v-for="weapon in weapons"
            :key="weapon.id"
            class="bg-base-200/80 rounded-lg border cursor-pointer transition-all duration-150
                        active:scale-95 hover:shadow-md px-2 py-1.5 flex items-center gap-2 min-w-0"
            :class="cardClass(weapon)"
            @click="selectWeapon(weapon.id)"
          >
            <!-- 图标 -->
            <div class="rounded-full bg-base-300/50 p-1 flex-none">
              <Icon :icon="weapon.iconId" :class="['text-lg', iconClass(weapon.faction)]" />
            </div>
            <!-- 文字 -->
            <div class="min-w-0 flex-1">
              <div class="font-bold text-base-content text-xs truncate">{{ weapon.name }}</div>
              <div class="flex items-center gap-1 mt-0.5">
                <span class="badge badge-xs" :class="factionBadgeClass(weapon.faction)">
                  {{ factionShortLabel(weapon.faction) }}
                </span>
                <span class="text-[10px]" :class="starColorClass(weapon.difficulty)">
                  {{ '⭐'.repeat(weapon.difficulty) }}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="text-center py-3">
          <span class="text-base-content/40 text-xs">武器加载中，请稍候…</span>
        </div>

        <!-- 提示 -->
        <div class="text-center mt-2">
          <span v-if="selectedId" class="text-success text-xs">已选定，等待对手...</span>
          <span v-else class="text-error/60 text-xs">超时后自动随机选择</span>
        </div>
      </div>
    </Transition>

    <!-- 非 compact 模式：全屏居中面板 -->
    <Transition name="zoom" appear>
      <div
        v-if="!compact"
        class="absolute inset-0 z-20 flex items-center justify-center
                    bg-base-300/60 backdrop-blur-md rounded-xl"
      >
        <div class="bg-base-100/90 shadow-2xl rounded-2xl border border-primary/20 px-8 py-6 w-[700px] max-w-[95vw]">
          <!-- 标题 -->
          <div class="text-center mb-6">
            <h2 class="font-bold text-primary text-2xl">选择你的赛博武器</h2>
            <div class="flex items-center justify-center gap-2 mt-2">
              <span class="text-base-content/60 text-sm">剩余时间</span>
              <span
                class="font-mono font-bold tabular-nums text-3xl"
                :class="countdown <= 5 ? 'text-error animate-pulse' : ''"
              >
                {{ countdown }}
              </span>
              <span class="text-base-content/60 text-sm">秒</span>
            </div>
          </div>

          <!-- 武器卡片网格 -->
          <div v-if="weapons.length > 0" class="grid grid-cols-3 gap-4 justify-center">
            <div
              v-for="weapon in weapons"
              :key="weapon.id"
              class="bg-base-200/80 rounded-xl border-2 cursor-pointer transition-all duration-200
                          hover:scale-105 hover:shadow-lg p-4"
              :class="cardClass(weapon)"
              @click="selectWeapon(weapon.id)"
            >
              <div class="flex justify-center mb-3">
                <div class="rounded-full bg-base-300/50 p-3">
                  <Icon :icon="weapon.iconId" :class="['text-4xl', iconClass(weapon.faction)]" />
                </div>
              </div>
              <h3 class="text-center font-bold text-base-content mb-2">{{ weapon.name }}</h3>
              <div class="text-center mb-2">
                <span class="badge text-xs" :class="factionBadgeClass(weapon.faction)">
                  {{ factionLabel(weapon.faction) }}
                </span>
              </div>
              <div class="text-center text-xs" :class="starColorClass(weapon.difficulty)">
                {{ '⭐'.repeat(weapon.difficulty) }}
              </div>
            </div>
          </div>
          <div v-else class="text-center py-4">
            <span class="text-base-content/40 text-sm">武器加载中，请稍候…</span>
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
</template>

<script setup lang="ts">
import Icon from '@/components/common/Icon.vue';
import type { SelectableWeapon } from '../useFishOilBattle';

const props = withDefaults(defineProps<{
  show: boolean;
  weapons: SelectableWeapon[];
  selectedId: string | null;
  countdown: number;
  /** 紧凑模式：单列布局，适配小窗口 */
  compact?: boolean;
}>(), {
  countdown: 15,
  compact: false,
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

/** compact 模式下的简称 */
function factionShortLabel(faction: string): string {
  const map: Record<string, string> = {
    aggressor: '侵略',
    controller: '控制',
    engineer: '工程',
    wildcard: '变奏',
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

.slide-up-enter-active, .slide-up-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.slide-up-enter-from, .slide-up-leave-to {
  opacity: 0;
  transform: translateY(100%);
}
</style>
