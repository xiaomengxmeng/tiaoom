<template>
  <GameView :room-player="roomPlayer" :game="game" @command="onCommand">
    <!-- 游戏区域：地图居中 + 底部两侧 HUD（匹配设计图） -->
    <section class="flex-1 relative overflow-hidden bg-base-200/30">
      <!-- Pixi.js 画布容器（铺满，竞技场背景由 ArenaRenderer 绘制） -->
      <FishOilBattleCanvas
        ref="canvasRef"
        class="absolute inset-0"
        @ready="onPixiReady"
        @resize="onResize"
      />

      <!-- 战斗 HUD：动态多玩家布局（统一缩放适配容器） -->
      <template v-if="battleHudVisible">
        <div
          class="absolute inset-0 z-10 pointer-events-none"
          :style="{ transform: `scale(${hudScale})`, transformOrigin: 'center center' }"
        >
          <!-- 己方 HUD：固定左下 -->
          <BattleHudPanel
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

          <!-- 其他玩家 HUD：右上 / 右下 / 左上 按人数动态摆放 -->
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
            class="pointer-events-auto"
            :class="getOtherHudClass(idx)"
          />

          <!-- 顶部中央：回合倒计时 -->
          <div
            class="pointer-events-auto absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-3"
          >
            <span
              class="badge badge-lg font-mono font-bold shadow-sm"
              :class="roundTimer <= 10 ? 'badge-error animate-pulse' : 'badge-neutral'"
            >
              {{ formattedRoundTime }}
            </span>
            <span
              v-if="selfHud.overheated"
              class="badge badge-lg badge-error animate-pulse font-bold shadow-sm"
            >
              过热
            </span>
          </div>
        </div>
      </template>

      <!-- 武器选择遮罩（z-20，覆盖一切） -->
      <WeaponSelectOverlay
        v-if="showWeaponSelect"
        :show="showWeaponSelect"
        :weapons="weaponPool"
        :selected-id="selectedWeaponId"
        :countdown="selectCountdown"
        @select="onWeaponSelect"
        class="absolute inset-0 z-20"
      />

      <!-- 结算遮罩（z-10，覆盖 Canvas，与 LinkLinkRoom 一致） -->
      <BattleResultOverlay
        :winner-name="winnerName"
        :winner-player-id="winnerPlayerId"
        :is-draw="isDraw"
        :end-reason="endReason"
        :is-watcher="isWatcher"
        :room-player-name="(roomPlayer as any).name ?? ''"
      />
    </section>

    <!-- 玩家列表 slot -->
    <template #player="{ player: p }">
      <span v-if="p.role === 'player'" class="inline-flex gap-2 items-center">
        <span>[{{ getPlayerStatus(p) }}]</span>
        <span>{{ p.name }}</span>
      </span>
      <span v-else>{{ watcherStatusTpl(p) ?? '[围观中]' }}</span>
    </template>

    <!-- 规则说明 -->
    <template #rules>
      <ul class="space-y-1 text-sm">
        <li>1. 2-4 人大逃杀，从 3 把武器中选择 1 把，15 秒内选完即开战。</li>
        <li>2. 小球自动弹跳不可操控，通过碰撞造成伤害。</li>
        <li>3. 武器能量充满后可触发爆发技能。</li>
        <li>4. 每回合 90 秒，最后存活的玩家获胜。</li>
      </ul>
    </template>
  </GameView>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, onMounted, onUnmounted, type Ref } from 'vue';
import type { RoomPlayer, Room } from 'tiaoom/client';
import GameView from '@/components/common/GameView.vue';
import FishOilBattleCanvas from './FishOilBattleCanvas.vue';
import BattleHudPanel from './components/BattleHudPanel.vue';
import WeaponSelectOverlay from './components/WeaponSelectOverlay.vue';
import BattleResultOverlay from './components/BattleResultOverlay.vue';
import type { GameCore } from '@/core/game';
import { CyberFishRenderer } from './renderer/CyberFishRenderer';
import { useFishOilBattle, type HudPlayerInfo, type SelectableWeapon } from './useFishOilBattle';

const props = withDefaults(defineProps<{
  roomPlayer: RoomPlayer & { room: Room };
  game: GameCore;
  demo?: boolean;
}>(), {
  demo: false,
});

const emit = defineEmits<{
  (e: 'command', msg: { type: string; data: any }): void;
  (e: 'loaded'): void;
}>();

// ── Pixi.js 渲染器 ──────────────────────────────────────
const canvasRef = ref<InstanceType<typeof FishOilBattleCanvas>>();
const rendererRef = shallowRef<CyberFishRenderer | null>(null);

/** HUD 缩放因子（跟随 canvas uniformScale，最小 0.5，最大 1.0） */
const hudScale = ref(1);

function onPixiReady(app: any, stage: any): void {
  void stage; // 消除未使用警告
  if (!canvasRef.value) return;
  const appInstance = (canvasRef.value as any).getApp();
  if (!appInstance) return;
  rendererRef.value = new CyberFishRenderer(appInstance);
  rendererRef.value.start();

  // 初始化 HUD 缩放
  hudScale.value = Math.max(0.5, Math.min(1, rendererRef.value.getUniformScale()));

  // 演示模式：添加模拟玩家
  if (props.demo) {
    initDemo(rendererRef.value!);
  }

  emit('loaded');
}

function onResize(w: number, h: number): void {
  console.log(`[CyberFish] canvas resized: ${w}x${h}`);
  if (rendererRef.value) {
    rendererRef.value.resize(w, h);
    // 同步 HUD 缩放因子（限制范围防止过小/过大）
    hudScale.value = Math.max(0.5, Math.min(1, rendererRef.value.getUniformScale()));
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
const battleHudVisible = computed(() => battleState.battleHudVisible.value);
const selfHud = computed(() => battleState.selfHud.value);
const otherPlayerHuds = computed(() => battleState.otherPlayerHuds.value);
const roundTimer = computed(() => battleState.roundTimer.value);
const roundDuration = computed(() => battleState.roundDuration.value);
const winnerName = computed(() => battleState.winnerName.value as string | null);
const winnerPlayerId = computed(() => battleState.winnerPlayerId.value as string);
const isDraw = computed(() => battleState.isDraw.value as boolean);
const endReason = computed(() => battleState.endReason.value as string);
const isWatcher = computed(() => battleState.isWatcher.value as boolean);

// 格式化倒计时 mm:ss
const formattedRoundTime = computed(() => {
  const m = Math.floor(roundTimer.value / 60);
  const s = roundTimer.value % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
});

function getPlayerStatus(p: RoomPlayer): string {
  if (props.roomPlayer.room.status === 'playing') return '游戏中';
  if (p.isReady) return '已准备';
  return '未准备';
}

function watcherStatusTpl(p: RoomPlayer): string | undefined {
  void p;
  return undefined;
}

// ── 武器选择处理 ──────────────────────────────────────
function onWeaponSelect(weaponId: string): void {
  battleState.selectWeapon(weaponId);
}

/** 按索引动态分配其他玩家 HUD 位置：右上 / 右下 / 左上 */
function getOtherHudClass(index: number): string {
  const positions = [
    'absolute right-4 top-4 z-10',       // 第1个对手：右上
    'absolute right-4 bottom-4 z-10',     // 第2个对手：右下
    'absolute left-4 top-4 z-10',         // 第3个对手：左上
  ];
  return positions[index] ?? positions[0];
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

/** 战斗开始：注册玩家 + 头像 + 显示武器选择 + 重置结算状态 */
async function handleBattleStart(data: {
  weaponPool: SelectableWeapon[];
  countdown: number;
  players?: Array<{ id: string; name: string; avatar?: string; faction?: string; x?: number; y?: number }>;
}): Promise<void> {
  console.log('[FishOilBattle] handleBattleStart:', JSON.stringify(data.players));

  // 重置上一轮的结算状态（修复重启后弹窗不消失）
  battleState.onBattleStart({
    weaponPool: data.weaponPool,
    countdown: data.countdown,
  });

  // 注册玩家到渲染器
  if (data.players && rendererRef.value) {
    // 停用物理运动（武器选择阶段小球保持静止）
    rendererRef.value.setBattleActive(false);

    const avatarPromises: Promise<void>[] = [];

    for (const p of data.players) {
      console.log(`[FishOilBattle] registering player: id=${p.id} name=${p.name} faction=${p.faction} pos=(${p.x},${p.y})`);
      rendererRef.value.addPlayer(
        p.id,
        (p.faction as any) || 'aggressor',
        p.name,
      );
      // 设置初始静止位置
      if (p.x !== undefined && p.y !== undefined) {
        rendererRef.value.updatePlayerState(p.id, {
          tick: 0,
          x: p.x, y: p.y,
          vx: 0, vy: 0,
          hp: 100, maxHp: 100,
          energy: 0, maxEnergy: 100,
        });
      }
      // 加载头像并提取主题色（await 确保战斗开始前颜色已就绪）
      if (p.avatar) {
        const pr = rendererRef.value.getPlayerRenderer(p.id);
        if (pr) {
          avatarPromises.push(pr.setAvatar(p.avatar));
        }
      }
    }

    // 等待所有头像加载和主题色提取完成
    if (avatarPromises.length > 0) {
      await Promise.allSettled(avatarPromises);
      console.log('[FishOilBattle] 所有头像主题色提取完成');
    }

    console.log(`[FishOilBattle] total players registered: ${data.players?.length ?? 0}`);
  }
}

/** 回合开始：激活物理运动 + 切换 Hud 可见 + 设置倒计时 */
function handleRoundStart(data: { duration: number }): void {
  console.log('[FishOilBattle] round_start 收到, duration=', data.duration);
  // 激活小球物理运动
  if (rendererRef.value) {
    rendererRef.value.setBattleActive(true);
  }
  battleState.onRoundStart(data);
}

// ── 演示模式 ──────────────────────────────────────
function initDemo(ren: CyberFishRenderer): void {
  ren.addPlayer(
    props.roomPlayer.id ?? 'self',
    'aggressor',
    props.roomPlayer.name ?? '我',
  );
  ren.addPlayer('opponent', 'controller', '对手');

  // 设置演示模式的初始位置（后端逻辑坐标，会被自动映射到画布）
  ren.updatePlayerState(props.roomPlayer.id ?? 'self', {
    tick: 0, x: 540, y: 360, vx: 0, vy: 0,
    hp: 100, maxHp: 100, energy: 0, maxEnergy: 100,
  });
  ren.updatePlayerState('opponent', {
    tick: 0, x: 740, y: 360, vx: 0, vy: 0,
    hp: 100, maxHp: 100, energy: 0, maxEnergy: 100,
  });
  // 演示模式激活战斗运动
  ren.setBattleActive(true);

  let demoTick = 0;
  const demoInterval = setInterval(() => {
    if (!ren) { clearInterval(demoInterval); return; }
    demoTick++;
    const now = Date.now();
    // 使用逻辑坐标（triggerSkillEffect 内部会自动映射）
    const cx = 640 + Math.sin(now / 500) * 300;
    const cy = 360 + Math.cos(now / 500) * 200;

    if (demoTick % 3 === 0) {
      ren.triggerSkillEffect({
        type: 'shockwave',
        x: cx, y: cy,
        isBurst: demoTick % 9 === 0,
      });
    }

    if (demoTick % 5 === 0) {
      ren.triggerSkillEffect({
        type: 'firewall',
        x: 320 + Math.random() * 600,
        y: 360 + Math.random() * 300,
        isBurst: false,
      });
    }

    if (demoTick % 2 === 0) {
      ren.triggerSkillEffect({
        type: 'hive_sting',
        fromX: 200, fromY: 360,
        toX: 1080, toY: 360,
      });
    }
  }, 1000);
}

// ── 生命周期 ──────────────────────────────────────
onUnmounted(() => {
  if (rendererRef.value) {
    rendererRef.value.stop();
    rendererRef.value.destroy();
    rendererRef.value = null;
  }
});
</script>
