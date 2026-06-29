<template>
  <section class="fixed inset-0 z-0 flex flex-col overflow-hidden">
    <!-- 顶部迷你状态条 -->
    <LiteHudBar
      :name="selfHud.name"
      :current-hp="selfHud.currentHp"
      :max-hp="selfHud.maxHp"
      :current-en="selfHud.currentEn"
      :max-en="selfHud.maxEn"
      :alive="selfHud.alive"
      :weapon-name="selfHud.weaponName"
      :is-watcher="isWatcher"
      :round-time="formattedRoundTime"
      :alive-count="aliveCount"
      :total-count="totalPlayerCount"
    />

    <!-- 画布区域 -->
    <div class="flex-1 relative min-h-0 bg-base-300">
      <!-- 敌人迷你血条（顶部居中） -->
      <LiteEnemyHuds
        v-if="!isWatcher && otherPlayerHuds.length > 0"
        :huds="otherPlayerHuds"
        :compact="otherPlayerHuds.length >= 4"
        class="absolute top-1 left-1 right-1 z-10"
      />

      <FishOilBattleCanvas
        ref="canvasRef"
        class="absolute inset-0"
        @ready="onPixiReady"
        @resize="onResize"
      />

      <!-- 武器选择（compact 底部浮层） -->
      <WeaponSelectOverlay
        v-if="showWeaponSelect"
        :show="showWeaponSelect"
        :weapons="weaponPool"
        :selected-id="selectedWeaponId"
        :countdown="selectCountdown"
        compact
        @select="onWeaponSelect"
      />

      <!-- 结算（compact 横幅） -->
      <BattleResultOverlay
        :winner-name="winnerName"
        :winner-player-id="winnerPlayerId"
        :is-draw="isDraw"
        :end-reason="endReason"
        :is-watcher="isWatcher"
        :room-player-name="(roomPlayer as any).name ?? ''"
        compact
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, onMounted, onUnmounted } from 'vue';
import type { RoomPlayer, Room } from 'tiaoom/client';
import { useGameEvents } from '@/hook/useGameEvents';
import FishOilBattleCanvas from './FishOilBattleCanvas.vue';
import LiteHudBar from './components/LiteHudBar.vue';
import LiteEnemyHuds from './components/LiteEnemyHuds.vue';
import WeaponSelectOverlay from './components/WeaponSelectOverlay.vue';
import BattleResultOverlay from './components/BattleResultOverlay.vue';
import type { GameCore } from '@/core/game';
import { CyberFishRenderer } from './renderer/CyberFishRenderer';
import { useFishOilBattle, type SelectableWeapon } from './useFishOilBattle';
import { WeaponId } from '$/backend/src/games/fish-oil-battle/config/GameEnums';

const props = withDefaults(defineProps<{
  roomPlayer: RoomPlayer & { room: Room };
  game: GameCore;
}>(), {});

const emit = defineEmits<{
  (e: 'command', msg: { type: string; data: any }): void;
  (e: 'loaded'): void;
}>();

// ── Pixi.js 渲染器 ──────────────────────────────────────
const canvasRef = ref<InstanceType<typeof FishOilBattleCanvas>>();
const rendererRef = shallowRef<CyberFishRenderer | null>(null);

// 缓存 battle_start 数据，如果它比 Pixi ready 先到达
interface PendingBattleStart {
  weaponPool: SelectableWeapon[];
  countdown: number;
  players?: Array<{ id: string; name: string; avatar?: string; faction?: string; x?: number; y?: number }>;
  arenaConfig?: { width: number; height: number; arenaRadius: number; ballRadius: number };
}
const pendingBattleStart = ref<PendingBattleStart | null>(null);

function onPixiReady(app: any, stage: any): void {
  void stage;
  if (!canvasRef.value) return;
  const appInstance = (canvasRef.value as any).getApp();
  if (!appInstance) return;
  rendererRef.value = new CyberFishRenderer(appInstance);
  rendererRef.value.start();

  // 如果 battle_start 已经先到，现在补上注册玩家和 arenaConfig
  if (pendingBattleStart.value) {
    applyBattleStartToRenderer(pendingBattleStart.value);
    pendingBattleStart.value = null;
  }

  emit('loaded');
}

function onResize(w: number, h: number): void {
  if (rendererRef.value) {
    rendererRef.value.resize(w, h);
  }
}

/** 将缓存的 battle_start 数据应用到渲染器（注册玩家 + 头像 + arenaConfig） */
async function applyBattleStartToRenderer(data: PendingBattleStart): Promise<void> {
  if (!rendererRef.value) return;
  rendererRef.value.setBattleActive(false);

  if (data.arenaConfig) {
    rendererRef.value.setArenaConfig(data.arenaConfig);
  }

  const avatarPromises: Promise<void>[] = [];
  if (data.players) {
    for (const p of data.players) {
      rendererRef.value.addPlayer(p.id, (p.faction as any) || 'aggressor', p.name);
      if (p.x !== undefined && p.y !== undefined) {
        rendererRef.value.updatePlayerState(p.id, {
          tick: 0,
          x: p.x, y: p.y,
          vx: 0, vy: 0,
          hp: 100, maxHp: 100,
          energy: 0, maxEnergy: 100,
        });
      }
      if (p.avatar) {
        const pr = rendererRef.value.getPlayerRenderer(p.id);
        if (pr) avatarPromises.push(pr.setAvatar(p.avatar));
      }
    }
  }
  if (avatarPromises.length > 0) {
    await Promise.allSettled(avatarPromises);
  }
}

// ── 战斗状态管理 ──────────────────────────────────────
const sendCommand = (type: string, data?: any) => {
  const roomId = props.roomPlayer.room.id;
  if (roomId) {
    props.game.command(roomId, { type, data });
  }
};

const battleState = useFishOilBattle(props.roomPlayer, rendererRef, sendCommand);

const showWeaponSelect = computed(() => battleState.showWeaponSelect.value);
const weaponPool = computed(() => battleState.weaponPool.value);
const selectedWeaponId = computed(() => battleState.selectedWeaponId.value);
const selectCountdown = computed(() => battleState.selectCountdown.value);
const selfHud = computed(() => battleState.selfHud.value);
const otherPlayerHuds = computed(() => battleState.otherPlayerHuds.value);
const roundTimer = computed(() => battleState.roundTimer.value);
const winnerName = computed(() => battleState.winnerName.value as string | null);
const winnerPlayerId = computed(() => battleState.winnerPlayerId.value as string);
const isDraw = computed(() => battleState.isDraw.value as boolean);
const endReason = computed(() => battleState.endReason.value as string);
const isWatcher = computed(() => battleState.isWatcher.value as boolean);

// 存活人数
const aliveCount = computed(() => {
  const othersAlive = otherPlayerHuds.value.filter(h => h.alive).length;
  return selfHud.value.alive ? othersAlive + 1 : othersAlive;
});

// 总玩家数（其他玩家 + 自己）
const totalPlayerCount = computed(() => otherPlayerHuds.value.length + 1);

// 格式化倒计时 mm:ss
const formattedRoundTime = computed(() => {
  const m = Math.floor(roundTimer.value / 60);
  const s = roundTimer.value % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
});

// ── 武器选择处理 ──────────────────────────────────────
function onWeaponSelect(weaponId: string): void {
  battleState.selectWeapon(weaponId);
}

// ── 后端指令处理 ──────────────────────────────────────
function onCommand(msg: { type: string; data: any }): void {
  switch (msg.type) {
    case 'battle_start':
      handleBattleStart(msg.data);
      break;
    case 'round_start':
      handleRoundStart(msg.data);
      break;
    case 'round_timer':
      battleState.onRoundTimer(msg.data);
      break;
    case 'weapon_confirmed':
      battleState.onWeaponConfirmed(msg.data);
      break;
    case 'game_state':
      battleState.onGameState(msg.data);
      break;
    case 'visual_event':
      battleState.onVisualEvent(msg.data);
      break;
    case 'game_end':
      battleState.onGameEnd(msg.data);
      break;
    default:
      emit('command', msg);
  }
}

/** 战斗开始：先更新武器池/倒计时等状态（不依赖 renderer），缓存数据等 Pixi ready 后注册玩家 */
async function handleBattleStart(data: {
  weaponPool: SelectableWeapon[];
  countdown: number;
  players?: Array<{ id: string; name: string; avatar?: string; faction?: string; x?: number; y?: number }>;
  arenaConfig?: { width: number; height: number; arenaRadius: number; ballRadius: number };
}): Promise<void> {
  // 先更新武器池/倒计时等状态（不依赖 renderer）
  battleState.onBattleStart({
    weaponPool: data.weaponPool,
    countdown: data.countdown,
    arenaConfig: data.arenaConfig,
  });

  // 缓存数据，等 Pixi ready 再注册玩家
  pendingBattleStart.value = data;

  // 如果 renderer 已经 ready，立即应用
  if (rendererRef.value) {
    await applyBattleStartToRenderer(data);
    pendingBattleStart.value = null;
  }
}

/** 回合开始：激活物理运动 + 切换 Hud 可见 + 设置倒计时 + 注册武器装饰器 */
function handleRoundStart(data: { duration: number; players?: Array<{ id: string; weaponId: string }> }): void {
  if (rendererRef.value) {
    rendererRef.value.setBattleActive(true);
    // 注册玩家武器装饰器（round_start 时 weaponId 才有效）
    if (data.players) {
      for (const p of data.players) {
        if (p.weaponId !== undefined) {
          rendererRef.value.setWeaponDecorator(p.id, p.weaponId as WeaponId);
        }
      }
    }
  }
  battleState.onRoundStart(data);
}

// ── 事件监听（替代 GameView 的 @command 转发） ──────────
useGameEvents(props.game, {
  'player.command': onCommand,
  'room.command': onCommand,
});

onMounted(() => emit('loaded'));

// ── 生命周期 ──────────────────────────────────────
onUnmounted(() => {
  if (rendererRef.value) {
    rendererRef.value.stop();
    rendererRef.value.destroy();
    rendererRef.value = null;
  }
});
</script>
