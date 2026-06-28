<template>
  <div class="flex h-full">
    <!-- ═══════════════════════════════════════════════ -->
    <!--  控制面板（侧边栏）                              -->
    <!-- ═══════════════════════════════════════════════ -->
    <aside class="w-72 shrink-0 flex flex-col border-r border-base-300 bg-base-200/40 p-3 gap-3 overflow-y-auto">
      <h3 class="text-sm font-bold opacity-70">对局测试</h3>

      <!-- 基础配置 -->
      <div class="collapse collapse-arrow bg-base-200/50">
        <input type="checkbox" checked />
        <div class="collapse-title text-xs font-semibold">基础配置</div>
        <div class="collapse-content flex flex-col gap-2">
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
          <div v-if="roomStatus" class="text-xs opacity-60">
            <span class="font-mono">{{ roomStatus }}</span>
          </div>
          <button
            class="btn btn-primary btn-sm w-full"
            :disabled="isCreating"
            @click="isBattleActive ? stopBattle() : startBattle()"
          >
            <span v-if="isCreating" class="loading loading-spinner loading-xs" />
            {{ isBattleActive ? '结束对局' : '开始对局' }}
          </button>
        </div>
      </div>

      <!-- 武器配置 -->
      <div class="collapse collapse-arrow bg-base-200/50">
        <input type="checkbox" :disabled="isBattleActive" />
        <div class="collapse-title text-xs font-semibold">武器配置</div>
        <div class="collapse-content flex flex-col gap-2">
          <label class="form-control">
            <span class="label-text text-xs">禁用武器（多选）</span>
            <select
              v-model="disabledWeapons"
              multiple
              class="select select-bordered select-xs mt-0.5 h-24"
              :disabled="isBattleActive"
            >
              <option v-for="w in implementedWeapons" :key="w.id" :value="w.id">
                {{ w.name }}
              </option>
            </select>
          </label>
          <div class="text-[10px] opacity-50 mt-1">Bot 武器配置</div>
          <label
            v-for="i in botCount"
            :key="`bot-weapon-${i}`"
            class="form-control"
          >
            <span class="label-text text-xs">Bot {{ i }} 武器</span>
            <select
              :value="botWeapons[i - 1] || ''"
              class="select select-bordered select-xs mt-0.5"
              :disabled="isBattleActive"
              @change="botWeapons[i - 1] = ($event.target as HTMLSelectElement).value"
            >
              <option value="">随机</option>
              <option v-for="w in implementedWeapons" :key="w.id" :value="w.id">
                {{ w.name }}
              </option>
            </select>
          </label>
        </div>
      </div>

      <!-- 调试面板 -->
      <div v-if="isBattleActive" class="collapse collapse-arrow bg-base-200/50">
        <input type="checkbox" checked />
        <div class="collapse-title text-xs font-semibold">调试面板</div>
        <div class="collapse-content flex flex-col gap-2">
          <label class="form-control">
            <span class="label-text text-xs">目标玩家</span>
            <select
              v-model="debugTargetPlayerId"
              class="select select-bordered select-xs mt-0.5"
            >
              <option value="">选择玩家</option>
              <option v-for="p in debugTargetOptions" :key="p.id" :value="p.id">
                {{ p.name }}
              </option>
            </select>
          </label>
          <div class="grid grid-cols-3 gap-1">
            <button class="btn btn-primary btn-xs" @click="debugFillEnergy">
              <Icon icon="ph:lightning-fill" />
              充满
            </button>
            <button class="btn btn-error btn-xs" @click="debugForceBurst">
              <Icon icon="ph:explosion-fill" />
              爆发
            </button>
            <button class="btn btn-ghost btn-xs" @click="debugResetWeapon">
              <Icon icon="ph:arrow-counter-clockwise" />
              重置
            </button>
          </div>
          <label class="form-control">
            <span class="label-text text-xs flex justify-between">
              <span>能量倍率</span>
              <span class="font-mono tabular-nums">{{ energyMultiplier }}%</span>
            </span>
            <input
              v-model.number="energyMultiplier"
              type="range"
              class="range range-secondary range-xs mt-0.5"
              :min="0" :max="100" :step="10"
              @change="debugSetEnergy"
            />
          </label>
        </div>
      </div>

      <!-- 运行时状态 -->
      <div v-if="isBattleActive && debugTargetPlayerId" class="collapse collapse-arrow bg-base-200/50">
        <input type="checkbox" checked />
        <div class="collapse-title text-xs font-semibold">运行时状态</div>
        <div class="collapse-content flex flex-col gap-1 text-[11px] font-mono">
          <template v-if="runtimeStates[debugTargetPlayerId]">
            <div class="flex justify-between">
              <span class="opacity-60">能量</span>
              <span class="tabular-nums">{{ runtimeStates[debugTargetPlayerId].energy }}/{{ runtimeStates[debugTargetPlayerId].maxEnergy }}</span>
            </div>
            <div class="opacity-60 mt-1">冷却</div>
            <pre class="bg-base-300/50 p-1 rounded text-[10px] overflow-x-auto">{{ JSON.stringify(runtimeStates[debugTargetPlayerId].cooldowns, null, 2) }}</pre>
            <div class="opacity-60 mt-1">层数</div>
            <pre class="bg-base-300/50 p-1 rounded text-[10px] overflow-x-auto">{{ JSON.stringify(runtimeStates[debugTargetPlayerId].stacks, null, 2) }}</pre>
            <div class="opacity-60 mt-1">标记</div>
            <pre class="bg-base-300/50 p-1 rounded text-[10px] overflow-x-auto">{{ JSON.stringify(runtimeStates[debugTargetPlayerId].flags, null, 2) }}</pre>
            <template v-if="runtimeStates[debugTargetPlayerId].custom">
              <div class="opacity-60 mt-1">自定义</div>
              <pre class="bg-base-300/50 p-1 rounded text-[10px] overflow-x-auto">{{ JSON.stringify(runtimeStates[debugTargetPlayerId].custom, null, 2) }}</pre>
            </template>
          </template>
          <div v-else class="opacity-40 text-center py-2">无数据</div>
        </div>
      </div>

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
import Icon from '@/components/common/Icon.vue';
import FishOilBattleCanvas from '../FishOilBattleCanvas.vue';
import BattleHudPanel from './BattleHudPanel.vue';
import WeaponSelectOverlay from './WeaponSelectOverlay.vue';
import BattleResultOverlay from './BattleResultOverlay.vue';
import { CyberFishRenderer } from '../renderer/CyberFishRenderer';
import type { SelectableWeapon, HudPlayerInfo } from '../useFishOilBattle';
import type { ArenaConfig, PlayerStats } from '$/backend/src/games/fish-oil-battle/shared/protocol';
import { VisualEventType, WeaponId } from '$/backend/src/games/fish-oil-battle/config/GameEnums';
import BattleStatsModal from './BattleStatsModal.vue';
import { getImplementedWeaponMetaList } from '$/backend/src/games/fish-oil-battle/core/WeaponRegistry';
import type { WeaponRuntimeState } from '$/backend/src/games/fish-oil-battle/core/IWeapon';

const router = useRouter();
const gameStore = useGameStore();

// ── 控制面板状态 ──────────────────────────────────
const botCount = ref(3);
// ── 武器配置状态 ──
const implementedWeapons = getImplementedWeaponMetaList();
const disabledWeapons = ref<string[]>([]);
const botWeapons = ref<Record<number, string>>({});

// ── 调试面板状态 ──
const debugTargetPlayerId = ref<string>('');
const energyMultiplier = ref(100);

// ── 运行时状态 ──
const runtimeStates = ref<Record<string, WeaponRuntimeState>>({});
const playerNameToId = ref<Record<string, string>>({});
const debugTargetOptions = ref<Array<{ id: string; name: string }>>([]);

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

/** 调试：一键充满目标玩家能量 */
function debugFillEnergy(): void {
  if (!debugTargetPlayerId.value) return;
  sendCommand('debug_energy', { playerId: debugTargetPlayerId.value, action: 'fill' });
}

/** 调试：强制目标玩家爆发 */
function debugForceBurst(): void {
  if (!debugTargetPlayerId.value) return;
  sendCommand('debug_burst', { playerId: debugTargetPlayerId.value });
}

/** 调试：重置目标玩家武器状态 */
function debugResetWeapon(): void {
  if (!debugTargetPlayerId.value) return;
  sendCommand('debug_reset', { playerId: debugTargetPlayerId.value });
}

/** 调试：设置能量倍率 */
function debugSetEnergy(): void {
  if (!debugTargetPlayerId.value) return;
  sendCommand('debug_energy', {
    playerId: debugTargetPlayerId.value,
    action: 'set',
    value: energyMultiplier.value,
  });
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

    // 提取 runtimeState（测试模式）
    if (p.runtimeState) {
      runtimeStates.value[p.id] = p.runtimeState;
    }
    // 构建 玩家名 → playerId 映射
    playerNameToId.value[p.name] = p.id;

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

  // 更新调试目标选项列表
  debugTargetOptions.value = data.players.map(p => ({ id: p.id, name: p.name }));
}

function handleVisualEvent(data: any): void {
  if (!rendererRef.value) return;

  switch (data.type) {
    case VisualEventType.HIT_FEEDBACK: {
      const reaction = (data as any).hitReaction ?? 'flash';
      const damage = (data as any).hitDamage;
      const targetId = (data as any).targetId;
      if (targetId) {
        rendererRef.value.playHitEffect(targetId, reaction);
        if (damage !== undefined) {
          rendererRef.value.showDamageNumber(targetId, damage);
        }
      }
      break;
    }
    case VisualEventType.SHOCKWAVE_TRIGGER:
      if (data.x !== undefined && data.y !== undefined) {
        rendererRef.value.triggerSkillEffect({
          type: data.type, x: data.x, y: data.y,
          isBurst: data.isBurst ?? false, radius: data.radius,
          playerId: data.playerId,
        });
      }
      break;
    case VisualEventType.FIREWALL_SPAWN:
      if (data.x !== undefined && data.y !== undefined) {
        rendererRef.value.triggerSkillEffect({
          type: data.type, x: data.x, y: data.y,
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
          type: data.type,
          fromX: data.x, fromY: data.y,
          toX: data.tx, toY: data.ty,
          playerId: data.playerId,
        });
      }
      break;
    case VisualEventType.HIVE_STING_BOUNCE:
      if (data.x !== undefined && data.y !== undefined) {
        rendererRef.value.triggerSkillEffect({
          type: data.type,
          x: data.x, y: data.y,
          playerId: data.playerId,
        });
      }
      break;
    case VisualEventType.BURST_TRIGGER:
      rendererRef.value.triggerSkillEffect({
        type: data.type, playerId: data.playerId,
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
          type: data.type,
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
            type: data.type,
            x: data.x, y: data.y,
            radius: data.length ?? 150,
            playerId: data.playerId,
          });
        }
        break;
      case VisualEventType.AIR_REPULSION_ANCHOR:
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            anchorId: data.anchorId,
            playerId: data.playerId,
          });
        }
        break;
      case VisualEventType.AIR_REPULSION_BURST:
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            radius: data.radius ?? 180,
            playerId: data.playerId,
          });
        }
        break;
      case VisualEventType.ENTROPIC_TOUCH_AURA:
        // 低温场 aura
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value?.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            radius: data.radius ?? 50,
            playerId: data.playerId,
          });
        }
        break;
      case VisualEventType.ENTROPIC_TOUCH_FROSTBITE:
        // 冻伤叠加
        if (data.targetId && data.x !== undefined && data.y !== undefined) {
          rendererRef.value?.triggerSkillEffect({
            type: data.type,
            targetId: data.targetId,
            frostbiteStacks: data.frostbiteStacks ?? 1,
            x: data.x, y: data.y,
            playerId: data.playerId,
          });
        }
        break;
      case VisualEventType.ENTROPIC_TOUCH_BURST:
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            radius: data.radius ?? 200,
            playerId: data.playerId,
          });
        }
        break;
      // ── 画作实体化（白猫） ─────────────────────────
      case VisualEventType.DRAWING_MANIFEST_INK:
        rendererRef.value.triggerSkillEffect({
          type: data.type,
          x: data.x, y: data.y,
          playerId: data.playerId,
          inkStacks: data.inkStacks ?? 0,
          isMuscleRabbit: data.isMuscleRabbit ?? false,
          rabbitX: data.rabbitX,
          rabbitY: data.rabbitY,
        });
        break;
      case VisualEventType.DRAWING_MANIFEST_BURST:
        rendererRef.value.triggerSkillEffect({
          type: data.type,
          x: data.x, y: data.y,
          radius: data.radius ?? 50,
          playerId: data.playerId,
          rabbitX: data.rabbitX,
          rabbitY: data.rabbitY,
        });
        break;
      case VisualEventType.DRAWING_MANIFEST_DASH:
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            toX: data.tx,
            toY: data.ty,
            playerId: data.playerId,
          });
        }
        break;
      // ── 放电猫猫（小金喵） ─────────────────────────
      case VisualEventType.DISCHARGE_CAT_ARC:
        rendererRef.value.triggerSkillEffect({
          type: data.type,
          x: data.x, y: data.y,
          playerId: data.playerId,
          isBurst: data.isBurst ?? false,
          catX: data.catX,
          catY: data.catY,
          arcNodes: data.arcNodes,
        });
        break;
      case VisualEventType.DISCHARGE_CAT_BURST:
        rendererRef.value.triggerSkillEffect({
          type: data.type,
          x: data.x, y: data.y,
          radius: data.radius ?? 120,
          playerId: data.playerId,
          catX: data.catX,
          catY: data.catY,
        });
        break;
      // ── 预知透镜（风随） ───────────────────────────
      case VisualEventType.PRECOGNITIVE_LENS_FORESIGHT:
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            playerId: data.playerId,
            foresightStacks: data.foresightStacks ?? 0,
            isBurst: data.isBurst ?? false,
          });
        }
        break;
      case VisualEventType.PRECOGNITIVE_LENS_ECHO:
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            toX: data.tx,
            toY: data.ty,
            playerId: data.playerId,
            isBurst: data.isBurst ?? false,
          });
        }
        break;
      case VisualEventType.PRECOGNITIVE_LENS_BURST:
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            playerId: data.playerId,
          });
        }
        break;
      // ── 情绪天气（Carzeye） ────────────────────────
      case VisualEventType.EMOTIONAL_WEATHER_LIGHTNING:
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            radius: data.radius ?? 40,
            weatherColor: data.weatherColor,
            playerId: data.playerId,
          });
        }
        break;
      case VisualEventType.EMOTIONAL_WEATHER_HAIL:
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            radius: data.radius ?? 30,
            playerId: data.playerId,
          });
        }
        break;
      case VisualEventType.EMOTIONAL_WEATHER_BURST:
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            radius: data.radius ?? 200,
            playerId: data.playerId,
          });
        }
        break;
      // ── 情绪掌控（林澈） ───────────────────────────
      case VisualEventType.EMOTION_MASTERY_MOOD:
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            playerId: data.playerId,
            currentMood: data.currentMood ?? 'anger',
          });
        }
        break;
      case VisualEventType.EMOTION_MASTERY_BURST:
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            playerId: data.playerId,
            radius: data.radius ?? 80,
          });
        }
        break;
      // ── 流体操控（KE） ─────────────────────────────
      case VisualEventType.FLUID_MASTERY_TRAIL:
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            playerId: data.playerId,
            x: data.x, y: data.y,
            radius: data.radius ?? 45,
            flowDir: data.fluidFlowDir ?? 0,
            isAngry: data.isAngry,
          });
        }
        break;
      case VisualEventType.FLUID_MASTERY_VORTEX:
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            targetId: data.targetId,
            x: data.x, y: data.y,
            radius: data.radius ?? 45,
            pullForce: data.fluidPullForce ?? 0.5,
            isAngry: data.isAngry,
          });
        }
        break;
      case VisualEventType.FLUID_MASTERY_BURST:
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            playerId: data.playerId,
            x: data.x, y: data.y,
            radius: data.radius ?? 220,
            isAngry: data.isAngry,
          });
        }
        break;
      // ── 记忆回廊（梦） ─────────────────────────────
      case VisualEventType.MEMORY_CORRIDOR_ECHO:
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            playerId: data.playerId,
            x: data.x, y: data.y,
            radius: data.radius ?? 50,
            echoCount: data.memoryEchoCount ?? 0,
            shardId: data.memoryShardId,
          });
        }
        break;
      case VisualEventType.MEMORY_CORRIDOR_RESONANCE:
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            targetId: data.targetId,
            x: data.x, y: data.y,
            resonanceStacks: data.memoryResonanceStacks ?? 1,
          });
        }
        break;
      case VisualEventType.MEMORY_CORRIDOR_BURST:
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            playerId: data.playerId,
            x: data.x, y: data.y,
            radius: data.radius ?? 200,
            echoCount: data.memoryEchoCount ?? 0,
          });
        }
        break;
      // ── 无限折叠（陈厌孑） ─────────────────────────
      case VisualEventType.INFINITE_FOLD_DODGE:
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            playerId: data.playerId,
            x: data.x, y: data.y,
            radius: data.radius ?? 40,
            foldLayer: data.foldLayer ?? 1,
            dodgeSuccess: data.foldDodgeSuccess ?? false,
          });
        }
        break;
      case VisualEventType.INFINITE_FOLD_REASSEMBLE:
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            targetId: data.targetId,
            x: data.x, y: data.y,
            foldCount: data.foldCount ?? 1,
          });
        }
        break;
      case VisualEventType.INFINITE_FOLD_BURST:
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            playerId: data.playerId,
            x: data.x, y: data.y,
            radius: data.radius ?? 180,
          });
        }
        break;
      // ── 植物伙伴派对（沐里） ───────────────────────
      case VisualEventType.BOTANICAL_PLANT_SPAWN:
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            radius: data.radius ?? 40,
            playerId: data.playerId,
            plantId: data.botanicalPlantId,
            personality: data.botanicalPersonality ?? 'gentle',
          });
        }
        break;
      case VisualEventType.BOTANICAL_PLANT_DECAY:
        rendererRef.value.triggerSkillEffect({
          type: data.type,
          x: data.x, y: data.y,
          playerId: data.playerId,
          plantId: data.botanicalPlantId,
        });
        break;
      case VisualEventType.BOTANICAL_BURST:
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            radius: data.radius ?? 60,
            playerId: data.playerId,
            plantCount: data.botanicalPlantCount ?? 0,
            durationMs: data.durationMs,
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
    sendCommand('start_test_mode', {
      botCount: botCount.value,
      botWeapons: Array.from({ length: botCount.value }, (_, i) => botWeapons.value[i] || ''),
      disabledWeapons: disabledWeapons.value,
    });
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

  // 清空调试状态
  debugTargetPlayerId.value = '';
  runtimeStates.value = {};
  playerNameToId.value = {};
  debugTargetOptions.value = [];

  // 离开房间，确保下次能重新创建
  const room = gameStore.roomPlayer?.room;
  if (gameStore.game && room) {
    try {
      gameStore.game.leaveRoom(room.id);
    } catch (err) {
      console.warn('[BattleTest] leaveRoom failed:', err);
    }
  }
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
