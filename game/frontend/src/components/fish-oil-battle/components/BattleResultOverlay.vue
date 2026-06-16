<template>
  <Transition name="zoom">
    <div
      v-if="winnerName || isDraw"
      class="absolute inset-0 z-10 flex items-center justify-center
             bg-base-300/40 backdrop-blur-sm rounded-xl"
    >
      <div
        class="bg-base-100/95 shadow-2xl px-8 py-6
                  rounded-2xl border text-2xl font-bold text-center"
        :class="isDraw ? 'text-warning border-warning/30' : 'text-primary border-primary/30'"
      >
        <template v-if="isDraw">
          ⚖️ 平局！
          <div class="text-base font-normal text-base-content/60 mt-2">
            {{ drawSubtitleText }}
          </div>
        </template>
        <template v-else>
          {{ resultIcon }} {{ winnerName }} 获胜！
          <div class="text-base font-normal text-base-content/60 mt-2">
            {{ subtitleText }}
          </div>
        </template>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  /** 胜者昵称，非空时显示结算遮罩 */
  winnerName: string | null;
  /** 胜者 ID */
  winnerPlayerId: string;
  /** 是否平局 */
  isDraw: boolean;
  /** 结束原因 */
  endReason: string;
  /** 当前玩家是否为观战者 */
  isWatcher: boolean;
  /** 当前玩家昵称 */
  roomPlayerName: string;
}>();

const resultIcon = computed(() => {
  if (!props.winnerName) return '';
  return props.winnerPlayerId && props.winnerName === props.roomPlayerName ? '🎉' : '💀';
});

const subtitleText = computed(() => {
  if (props.isWatcher) {
    return '对局已结束。';
  }
  if (props.winnerName === props.roomPlayerName) {
    return '恭喜你，击败对手，赢得胜利！';
  }
  return '加油，下次再来！';
});

const drawSubtitleText = computed(() => {
  if (props.isWatcher) {
    return '时间耗尽，双方血量相同，对局以平局结束。';
  }
  if (props.endReason === 'timeout') {
    return '回合时间耗尽，双方血量相同，势均力敌！';
  }
  return '双方势均力敌，真正的旗鼓相当！';
});
</script>

<style scoped>
.zoom-enter-active, .zoom-leave-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.zoom-enter-from,  .zoom-leave-to      { opacity: 0; transform: scale(0.9); }
</style>

