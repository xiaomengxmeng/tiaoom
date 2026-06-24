<template>
  <div class="flex h-full">
    <!-- ═══════════════════════════════════════════════ -->
    <!--  控制面板（侧边栏）                              -->
    <!-- ═══════════════════════════════════════════════ -->
    <aside class="w-56 shrink-0 flex flex-col border-r border-base-300 bg-base-200/40 p-3 gap-4 overflow-y-auto">
      <h3 class="text-sm font-bold opacity-70">对局测试</h3>

      <!-- Bot 数量 -->
      <label class="form-control">
        <span class="label-text text-xs flex justify-between">
          <span>Bot 数量</span>
          <span class="font-mono tabular-nums">{{ botCount }}</span>
        </span>
        <input
          v-model.number="botCount"
          type="range"
          class="range range-primary range-xs mt-0.5"
          :min="1" :max="7" :step="1"
          :disabled="isBattleActive"
        />
      </label>

      <!-- 房间状态 -->
      <div v-if="roomStatus" class="text-xs opacity-60">
        <span class="font-mono">{{ roomStatus }}</span>
      </div>

      <!-- 开始 / 停止 -->
      <button
        class="btn btn-primary btn-sm w-full"
        :disabled="isCreating"
        @click="isBattleActive ? stopBattle() : startBattle()"
      >
        <span v-if="isCreating" class="loading loading-spinner loading-xs" />
        {{ isBattleActive ? '结束对局' : '开始对局' }}
      </button>

      <!-- 提示 -->
      <p class="text-[10px] opacity-40 leading-relaxed">
        自动添加 {{ botCount }} 个 Bot，随机选择武器，技能自动释放。完整 HUD 渲染。
      </p>

      <!-- 测试报告 -->
      <button
        class="btn btn-outline btn-sm w-full mt-auto"
        :disabled="!Object.keys(currentStats).length"
        @click="showStatsModal = true"
      >
        测试报告
      </button>
    </aside>

    <!-- ═══════════════════════════════════════════════ -->
    <!--  游戏画布区域                                    -->
    <!-- ═══════════════════════════════════════════════ -->
    <main class="flex-1 relative bg-black">
      <!-- 未开始时显示提示 -->
      <div
        v-if="!isBattleActive && !isCreating"
        class="absolute inset-0 flex items-center justify-center text-white/30 text-sm"
      >
        设置 Bot 数量后点击「开始对局」
      </div>

      <!-- Pixi.js 画布 -->
      <FishOilBattleCanvas
        v-show="isBattleActive"
        ref="canvasRef"
        class="absolute inset-0"
        @ready="onPixiReady"
        @resize="onResize"
      />

      <!-- 战斗 HUD -->
      <template v-if="isBattleActive && battleHudVisible">
        <div class="absolute inset-0 z-10 pointer-events-none">
          <!-- 己方 HUD -->
          <BattleHudPanel
            v-if="selfHud"
            side="left"
            :name="selfHud.name"
            :current-hp="selfHud.currentHp"
            :max-hp="selfHud.maxHp"
            :current-en="selfHud.currentEn"
            :max-en="selfHud.maxEn"
            :weapon-name="selfHud.weaponName"
            :weapon-icon="selfHud.weaponIcon"
            :weapon-cd="selfHud.weaponCd"
            :overheated="selfHud.overheated"
            :dead="!selfHud.alive"
            class="pointer-events-auto absolute left-4 bottom-4"
          />

          <!-- 其他玩家 HUD -->
          <BattleHudPanel
            v-for="(hud, idx) in otherPlayerHuds"
            :key="idx"
            :name="hud.name"
            :current-hp="hud.currentHp"
            :max-hp="hud.maxHp"
            :current-en="hud.currentEn"
            :max-en="hud.maxEn"
            :weapon-name="hud.weaponName"
            :weapon-icon="hud.weaponIcon"
            :weapon-cd="hud.weaponCd"
            :dead="!hud.alive"
            :compact="otherPlayerHuds.length >= 4"
            class="pointer-events-auto absolute"
            :style="getOtherHudStyle(idx)"
          />

          <!-- 回合倒计时 -->
          <div class="pointer-events-auto absolute top-4 left-1/2 -translate-x-1/2">
            <span
              class="badge badge-lg font-mono font-bold shadow-sm"
              :class="roundTimer <= 10 ? 'badge-error animate-pulse' : 'badge-neutral'"
            >
              {{ formattedRoundTime }}
            </span>
          </div>
        </div>
      </template>

      <!-- 武器选择遮罩 -->
      <WeaponSelectOverlay
        v-if="isBattleActive && showWeaponSelect"
        :show="showWeaponSelect"
        :weapons="weaponPool"
        :selected-id="selectedWeaponId"
        :countdown="selectCountdown"
        @select="onWeaponSelect"
        class="absolute inset-0 z-20"
      />

      <!-- 结算遮罩 -->
      <BattleResultOverlay
        v-if="isBattleActive"
        :winner-name="winnerName"
        :winner-player-id="winnerPlayerId"
        :is-draw="isDraw"
        :end-reason="endReason"
        :is-watcher="false"
        :room-player-name="selfName"
      />

      <!-- 测试报告弹窗 -->
      <BattleStatsModal
        :show="showStatsModal"
        :stats="currentStats"
        :player-name-map="playerNameMap"
        :winner-id="statsWinnerId"
        :winner-name="statsWinnerName"
        :end-reason="statsEndReason"
        @close="showStatsModal = false"
      />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useGameStore } from '@/stores/game';
import FishOilBattleCanvas from '../FishOilBattleCanvas.vue';
import BattleHudPanel from './BattleHudPanel.vue';
import WeaponSelectOverlay from './WeaponSelectOverlay.vue';
import BattleResultOverlay from './BattleResultOverlay.vue';
import { CyberFishRenderer } from '../renderer/CyberFishRenderer';
import type { SelectableWeapon, HudPlayerInfo } from '../useFishOilBattle';
import type { ArenaConfig, PlayerStats } from '$/backend/src/games/fish-oil-battle/shared/protocol';
import { VisualEventType, WeaponId } from '$/backend/src/games/fish-oil-battle/config/GameEnums';
import BattleStatsModal from './BattleStatsModal.vue';

const router = useRouter();
const gameStore = useGameStore();

// ── 控制面板状态 ──────────────────────────────────
const botCount = ref(3);
const isCreating = ref(false);
const isBattleActive = ref(false);
const roomStatus = ref('');
const roomId = ref('');

// ── Pixi.js 渲染器 ────────────────────────────────
const canvasRef = ref<InstanceType<typeof FishOilBattleCanvas>>();
const rendererRef = shallowRef<CyberFishRenderer | null>(null);
const selfName = computed(() => gameStore.player?.nickname ?? '我');

function onPixiReady(_app: any, _stage: any): void {
  if (!canvasRef.value) return;
  const appInstance = (canvasRef.value as any).getApp();
  if (!appInstance) return;
  rendererRef.value = new CyberFishRenderer(appInstance);
  rendererRef.value.start();
}

function onResize(w: number, h: number): void {
  if (rendererRef.value) {
    rendererRef.value.resize(w, h);
  }
}

// ── 战斗状态 ──────────────────────────────────────
const showWeaponSelect = ref(false);
const weaponPool = ref<SelectableWeapon[]>([]);
const selectedWeaponId = ref<string | null>(null);
const selectCountdown = ref(15);
const isWeaponConfirmed = ref(false);

const battleHudVisible = ref(false);
const selfHud = ref<HudPlayerInfo>({
  name: selfName.value,
  currentHp: 100, maxHp: 100,
  currentEn: 0, maxEn: 100,
  weaponName: '未选择',
  weaponIcon: 'game-icons:help',
  weaponCd: 0, overheated: false, alive: true,
});
const otherPlayerHuds = ref<HudPlayerInfo[]>([]);
const roundTimer = ref(90);

const winnerName = ref<string | null>(null);
const winnerPlayerId = ref('');
const isDraw = ref(false);
const endReason = ref('');

// ── 测试报告 ──────────────────────────────────────
const showStatsModal = ref(false);
const currentStats = ref<Record<string, PlayerStats>>({});
/** playerId → name 映射 */
const playerNameMap = ref<Record<string, string>>({});
const statsWinnerId = ref('');
const statsWinnerName = ref('');
const statsEndReason = ref('');

let countdownTimer: ReturnType<typeof setInterval> | null = null;
const prevHp = new Map<string, number>();

const formattedRoundTime = computed(() => {
  const m = Math.floor(roundTimer.value / 60);
  const s = roundTimer.value % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
});

function getOtherHudStyle(index: number): Record<string, string> {
  const total = otherPlayerHuds.value.length + 1;
  if (total <= 4) {
    const positions: Record<string, string>[] = [
      { right: '16px', top: '16px' },
      { right: '16px', bottom: '16px' },
      { left: '16px', top: '16px' },
    ];
    return positions[index] ?? positions[0];
  }
  // 多玩家：均匀分布在右侧
  const top = 16 + index * 80;
  return { right: '16px', top: `${top}px` };
}

// ── 武器选择 ──────────────────────────────────────
function onWeaponSelect(weaponId: string): void {
  if (isWeaponConfirmed.value || !weaponPool.value.length) return;
  selectedWeaponId.value = weaponId;
  isWeaponConfirmed.value = true;
  sendCommand('select_weapon', { weaponId });
}

function startCountdown(): void {
  selectCountdown.value = 15;
  isWeaponConfirmed.value = false;
  selectedWeaponId.value = null;
  stopCountdown();
  countdownTimer = setInterval(() => {
    selectCountdown.value--;
    if (selectCountdown.value <= 0) {
      if (!isWeaponConfirmed.value && weaponPool.value.length > 0) {
        const random = weaponPool.value[Math.floor(Math.random() * weaponPool.value.length)];
        onWeaponSelect(random.id);
      }
      stopCountdown();
    }
  }, 1000);
}

function stopCountdown(): void {
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
}

// ── 发送命令 ──────────────────────────────────────
function sendCommand(type: string, data?: any): void {
  const id = gameStore.roomPlayer?.room?.id ?? roomId.value;
  if (id && gameStore.game) {
    gameStore.game.command(id, { type, data });
  }
}

// ── 后端事件处理 ──────────────────────────────────
let removeRoomCmdListener: (() => void) | null = null;

function handleRoomCommand(cmd: any): void {
  switch (cmd.type) {
    case 'battle_start':
      handleBattleStart(cmd.data);
      break;
    case 'round_start':
      handleRoundStart(cmd.data);
      break;
    case 'round_timer':
      roundTimer.value = cmd.data.remaining;
      break;
    case 'weapon_confirmed':
      selfHud.value = { ...selfHud.value, weaponName: cmd.data.weaponName };
      break;
    case 'game_state':
      handleGameState(cmd.data);
      break;
    case 'visual_event':
      handleVisualEvent(cmd.data);
      break;
    case 'game_end':
      handleGameEnd(cmd.data);
      break;
  }
}

function handleBattleStart(data: {
  weaponPool: SelectableWeapon[];
  countdown: number;
  players?: Array<{ id: string; name: string; avatar?: string; faction?: string; x?: number; y?: number }>;
  arenaConfig?: ArenaConfig;
}): void {
  // 重置状态
  winnerName.value = null;
  winnerPlayerId.value = '';
  isDraw.value = false;
  endReason.value = '';
  weaponPool.value = data.weaponPool;
  showWeaponSelect.value = true;
  battleHudVisible.value = false;
  prevHp.clear();

  // 构建玩家名映射（供测试报告用）
  playerNameMap.value = {};
  if (data.players) {
    for (const p of data.players) {
      playerNameMap.value[p.id] = p.name;
    }
  }

  if (data.arenaConfig && rendererRef.value) {
    rendererRef.value.setArenaConfig(data.arenaConfig);
  }

  // 注册玩家
  if (data.players && rendererRef.value) {
    rendererRef.value.setBattleActive(false);
    for (const p of data.players) {
      rendererRef.value.addPlayer(
        p.id,
        (p.faction as any) || 'aggressor',
        p.name,
      );
      if (p.x !== undefined && p.y !== undefined) {
        rendererRef.value.updatePlayerState(p.id, {
          tick: 0, x: p.x, y: p.y, vx: 0, vy: 0,
          hp: 100, maxHp: 100, energy: 0, maxEnergy: 100,
        });
      }
    }
  }

  startCountdown();
  console.log('[BattleTest] battle_start: weapons=', data.weaponPool.map(w => w.name),
    'players=', data.players?.map(p => p.name));
}

function handleRoundStart(data: { duration: number; players?: Array<{ id: string; weaponId: string }> }): void {
  console.log('[BattleTest] round_start: duration=', data.duration);
  showWeaponSelect.value = false;
  battleHudVisible.value = true;
  roundTimer.value = data.duration;
  stopCountdown();

  if (rendererRef.value) {
    rendererRef.value.setBattleActive(true);
  }

  // 为蜂巢母体玩家启用蜂群渲染
  if (data.players && rendererRef.value) {
    for (const p of data.players) {
      if (p.weaponId === WeaponId.HIVE_MOTHER) {
        rendererRef.value.setPlayerHiveActive(p.id, 3, false);
      }
    }
  }
}

function handleGameState(data: { players: any[]; tick: number; timestamp: number }): void {
  if (!rendererRef.value) return;

  const selfId = gameStore.player?.id ?? '';
  const selfName = gameStore.player?.nickname ?? '';

  const newOtherHuds: HudPlayerInfo[] = [];

  for (const p of data.players) {
    // 检测掉血
    const prev = prevHp.get(p.id);
    if (prev !== undefined && prev > p.hp && p.alive) {
      rendererRef.value.playHitEffect(p.id);
      rendererRef.value.showDamageNumber(p.id, prev - p.hp);
    }
    prevHp.set(p.id, p.hp);

    // 更新物理系统
    rendererRef.value.updatePlayerState(p.id, {
      tick: data.tick, x: p.x, y: p.y,
      vx: p.vx, vy: p.vy,
      hp: p.hp, maxHp: p.maxHp,
      energy: p.energy, maxEnergy: p.maxEnergy,
    });

    const hudInfo: HudPlayerInfo = {
      name: p.name,
      currentHp: p.hp, maxHp: p.maxHp,
      currentEn: p.energy, maxEn: p.maxEnergy,
      weaponName: p.weapon?.name ?? '未知',
      weaponIcon: p.weapon?.iconId ?? 'game-icons:help',
      weaponCd: p.weapon?.cd ?? 0,
      overheated: p.overheated ?? false,
      alive: p.alive,
    };

    if (p.id === selfId || p.name === selfName) {
      selfHud.value = hudInfo;
    } else {
      newOtherHuds.push(hudInfo);
    }

    // 死亡标记
    if (!p.alive) {
      rendererRef.value.setPlayerAlive(p.id, false);
    }
  }

  otherPlayerHuds.value = newOtherHuds;
}

function handleVisualEvent(data: any): void {
  if (!rendererRef.value) return;

  switch (data.type) {
    case VisualEventType.SHOCKWAVE_TRIGGER:
      if (data.x !== undefined && data.y !== undefined) {
        rendererRef.value.triggerSkillEffect({
          type: 'shockwave', x: data.x, y: data.y,
          isBurst: data.isBurst ?? false, radius: data.radius,
          playerId: data.playerId,
        });
      }
      break;
    case VisualEventType.FIREWALL_SPAWN:
      if (data.x !== undefined && data.y !== undefined) {
        rendererRef.value.triggerSkillEffect({
          type: 'firewall', x: data.x, y: data.y,
          isBurst: data.isBurst ?? false, radius: data.radius,
          visualWidth: data.visualWidth, visualHeight: data.visualHeight,
          durationSec: data.durationSec, playerId: data.playerId,
        });
      }
      break;
    case VisualEventType.HIVE_STING:
      if (data.x !== undefined && data.y !== undefined &&
          data.tx !== undefined && data.ty !== undefined) {
        rendererRef.value.triggerSkillEffect({
          type: 'hive_sting',
          fromX: data.x, fromY: data.y,
          toX: data.tx, toY: data.ty,
          playerId: data.playerId,
        });
      }
      break;
    case VisualEventType.HIVE_STING_BOUNCE:
      if (data.x !== undefined && data.y !== undefined) {
        rendererRef.value.triggerSkillEffect({
          type: 'hive_sting_bounce',
          x: data.x, y: data.y,
          playerId: data.playerId,
        });
      }
      break;
    case VisualEventType.BURST_TRIGGER:
      rendererRef.value.triggerSkillEffect({
        type: 'burst_flash', playerId: data.playerId,
      });
      if (data.playerId) {
        rendererRef.value.playBurstEffect(data.playerId);
        if (data.weaponId === WeaponId.HIVE_MOTHER) {
          const beeCount = data.beeCount ?? 6;
          rendererRef.value.setPlayerHiveActive(data.playerId, beeCount, true);
          setTimeout(() => {
            rendererRef.value?.setPlayerHiveActive(data.playerId, beeCount, false);
          }, 5000);
        }
      }
      break;
    case VisualEventType.BEE_COUNT_CHANGE:
      if (data.playerId && data.beeCount !== undefined) {
        rendererRef.value.setPlayerHiveActive(data.playerId, data.beeCount, data.isBurst ?? false);
      }
      break;
    case VisualEventType.OPTICAL_SLASH_TRIGGER:
      if (data.x !== undefined && data.y !== undefined) {
        rendererRef.value.triggerSkillEffect({
          type: 'optical_slash',
          x: data.x, y: data.y,
          radius: data.length ?? 100,
          angle: data.angle ?? 0,
          playerId: data.playerId,
        });
      }
      break;
    case VisualEventType.OPTICAL_SLASH_BURST:
      if (data.x !== undefined && data.y !== undefined) {
        rendererRef.value.triggerSkillEffect({
          type: 'optical_slash_burst',
          x: data.x, y: data.y,
          radius: data.length ?? 150,
          playerId: data.playerId,
        });
      }
      break;
  }
}

function handleGameEnd(data: { winnerId?: string; winnerName?: string; reason?: string; stats?: Record<string, PlayerStats> }): void {
  battleHudVisible.value = false;
  stopCountdown();
  if (data.winnerName) {
    winnerName.value = data.winnerName;
    winnerPlayerId.value = data.winnerId ?? '';
    isDraw.value = false;
    endReason.value = data.reason ?? '';
  } else {
    winnerName.value = null;
    winnerPlayerId.value = '';
    isDraw.value = true;
    endReason.value = data.reason ?? 'timeout';
  }
  showWeaponSelect.value = false;

  // 存储统计数据（供测试报告使用）
  if (data.stats) {
    currentStats.value = data.stats;
  }
  statsWinnerId.value = data.winnerId ?? '';
  statsWinnerName.value = data.winnerName ?? '';
  statsEndReason.value = data.reason ?? '';
}

// ── 开始 / 停止对局 ──────────────────────────────
async function startBattle(): Promise<void> {
  if (!gameStore.game || !gameStore.player) {
    roomStatus.value = '请先登录';
    return;
  }

  isCreating.value = true;
  roomStatus.value = '创建房间中...';

  // 拦截自动跳转
  const removeGuard = router.beforeEach((to, _from) => {
    if (to.path.startsWith('/r/') && isCreating.value) {
      roomId.value = to.params.id as string;
      removeGuard();
      return false;
    }
  });

  // 安全超时：10 秒后强制移除 guard（防止异常情况下 guard 泄漏）
  setTimeout(() => {
    try { removeGuard(); } catch { /* already removed */ }
  }, 10000);

  try {
    const roomName = `test_battle_${Date.now() % 100000}`;
    await gameStore.game.createRoom({
      name: roomName,
      size: botCount.value + 1,
      minSize: 2,
      requireAllReadyToStart: true,
      attrs: { type: 'fish-oil-battle' },
    });

    // 等待 roomPlayer 就绪
    await waitForRoomPlayer();

    if (!gameStore.roomPlayer) {
      roomStatus.value = '房间创建失败';
      isCreating.value = false;
      return;
    }

    // 发送测试模式命令
    sendCommand('start_test_mode', { botCount: botCount.value });
    roomStatus.value = `测试模式启动中 (${botCount.value} Bot)`;

    // 监听房间命令
    if (gameStore.game) {
      removeRoomCmdListener = () => {
        gameStore.game!.off('room.command', handleRoomCommand as any);
      };
      gameStore.game.onRoomCommand(handleRoomCommand);
    }

    isBattleActive.value = true;
    isCreating.value = false;
    roomStatus.value = `战斗中 (${botCount.value} Bot)`;

  } catch (err) {
    console.error('[BattleTest] 创建房间失败:', err);
    roomStatus.value = '创建失败';
    isCreating.value = false;
  }
}

function waitForRoomPlayer(): Promise<void> {
  return new Promise((resolve) => {
    if (gameStore.roomPlayer) { resolve(); return; }
    const check = setInterval(() => {
      if (gameStore.roomPlayer) {
        clearInterval(check);
        resolve();
      }
    }, 100);
    // 超时保护
    setTimeout(() => { clearInterval(check); resolve(); }, 5000);
  });
}

function stopBattle(): void {
  if (removeRoomCmdListener) {
    removeRoomCmdListener();
    removeRoomCmdListener = null;
  }
  stopCountdown();
  isBattleActive.value = false;
  battleHudVisible.value = false;
  showWeaponSelect.value = false;
  roomStatus.value = '已结束';
  roomId.value = '';
}

// ── 生命周期清理 ──────────────────────────────────
onUnmounted(() => {
  stopBattle();
  if (rendererRef.value) {
    rendererRef.value.stop();
    rendererRef.value.destroy();
    rendererRef.value = null;
  }
});
</script>
