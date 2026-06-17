import { ref, onUnmounted, type Ref } from 'vue';
import type { RoomPlayer, Room } from 'tiaoom/client';
import type { CyberFishRenderer } from './renderer/CyberFishRenderer';

// 共享协议类型
import type {
  GameStatePlayer,
  VisualEventData,
} from '$/backend/src/shared/protocol';

// ─── 前端扩展的 HUD 类型 ──────────────────────────────
export interface HudPlayerInfo {
  name: string;
  currentHp: number;
  maxHp: number;
  currentEn: number;
  maxEn: number;
  weaponName: string;
  weaponIcon: string;
  weaponCd: number;
  overheated: boolean;
  /** 该玩家是否存活（false 则 HUD 灰掉） */
  alive: boolean;
}

export interface FishOilBattleState {
  showWeaponSelect: Ref<boolean>;
  weaponPool: Ref<SelectableWeapon[]>;
  selectedWeaponId: Ref<string | null>;
  selectCountdown: Ref<number>;
  isWeaponConfirmed: Ref<boolean>;
  battleHudVisible: Ref<boolean>;
  /** 己方 HUD（固定左下） */
  selfHud: Ref<HudPlayerInfo>;
  /** 其他玩家 HUD 列表（动态右上/右下/左上摆放） */
  otherPlayerHuds: Ref<HudPlayerInfo[]>;
  roundTimer: Ref<number>;
  roundDuration: Ref<number>;
  winnerName: Ref<string | null>;
  winnerPlayerId: Ref<string>;
  isDraw: Ref<boolean>;
  endReason: Ref<string>;
  isWatcher: Ref<boolean>;
}

export interface SelectableWeapon {
  id: string;
  name: string;
  faction: 'aggressor' | 'controller' | 'engineer' | 'wildcard';
  difficulty: 1 | 2 | 3;
  iconId: string;
}

export interface FishOilBattleActions {
  selectWeapon: (weaponId: string) => void;
  onBattleStart: (data: { weaponPool: SelectableWeapon[]; countdown: number }) => void;
  onRoundStart: (data: { duration: number }) => void;
  onRoundTimer: (data: { remaining: number }) => void;
  onWeaponConfirmed: (data: { weaponId: string; weaponName: string }) => void;
  onGameState: (data: any) => void;
  onVisualEvent: (data: any) => void;
  onGameEnd: (data: { winnerId?: string; winnerName?: string; reason?: string }) => void;
}

export type SendCommandFn = (type: string, data?: any) => void;

/**
 * 赛博鱼油战斗状态管理 Composable
 */
export function useFishOilBattle(
  roomPlayer: RoomPlayer & { room: Room },
  rendererRef: Ref<CyberFishRenderer | null>,
  sendCommand?: SendCommandFn,
): FishOilBattleState & FishOilBattleActions {

  const selfId = (roomPlayer as any).id ?? '';
  const selfName = (roomPlayer as any).name ?? '我';

  // ── 武器选择阶段状态 ───────────────────────────────
  const showWeaponSelect = ref(true);
  const weaponPool = ref<SelectableWeapon[]>([]);
  const selectedWeaponId = ref<string | null>(null);
  const selectCountdown = ref(15);
  const isWeaponConfirmed = ref(false);

  // ── 战斗阶段状态 ───────────────────────────────────
  const battleHudVisible = ref(false);

  // 所有玩家 HUD（Map: playerId → Hud）
  const playerHudMap = ref<Map<string, HudPlayerInfo>>(new Map());

  // 己方 HUD（始终从 Map 中取）
  const selfHud = ref<HudPlayerInfo>({
    name: selfName,
    currentHp: 100, maxHp: 100,
    currentEn: 0, maxEn: 100,
    weaponName: '未选择',
    weaponIcon: 'game-icons:help',
    weaponCd: 0, overheated: false,
    alive: true,
  });

  // 其他玩家 HUD 列表（动态排序）
  const otherPlayerHuds = ref<HudPlayerInfo[]>([]);

  const roundTimer = ref(90);
  const roundDuration = ref(90);

  // ── 结算状态 ────────────────────────────────────
  const winnerName = ref<string | null>(null);
  const winnerPlayerId = ref('');
  const isDraw = ref(false);
  const endReason = ref('');
  const isWatcher = ref((roomPlayer as any).role !== 'player');

  // ── 内部倒计时 timer ───────────────────────────────
  let countdownTimer: ReturnType<typeof setInterval> | null = null;

  // ── 方法 ───────────────────────────────────────────

  function selectWeapon(weaponId: string): void {
    if (isWeaponConfirmed.value || !weaponPool.value.length) return;
    selectedWeaponId.value = weaponId;
    isWeaponConfirmed.value = true;
    console.log('[FishOilBattle] 发送 select_weapon:', weaponId);
    sendCommand?.('select_weapon', { weaponId });
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
          selectedWeaponId.value = random.id;
          isWeaponConfirmed.value = true;
          sendCommand?.('select_weapon', { weaponId: random.id });
        }
        stopCountdown();
      }
    }, 1000);
  }

  function stopCountdown(): void {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  // ── WebSocket 事件处理 ───────────────────────────────

  function onBattleStart(data: { weaponPool: SelectableWeapon[]; countdown: number }): void {
    winnerName.value = null;
    winnerPlayerId.value = '';
    isDraw.value = false;
    endReason.value = '';

    weaponPool.value = data.weaponPool;
    showWeaponSelect.value = true;
    battleHudVisible.value = false;
    startCountdown();
    console.log('[FishOilBattle] onBattleStart: reset, weapons=', data.weaponPool.map(w => w.name));
  }

  /** 记录上一帧各玩家的 HP */
  const prevHp = new Map<string, number>();

  /** 处理 game_state 事件（高频，20fps） */
  function onGameState(data: {
    players: GameStatePlayer[];
    tick: number;
    timestamp: number;
  }): void {
    if (!rendererRef.value) return;

    if (data.tick % 100 === 0 || data.tick < 5) {
      console.log(
        `[FishOilBattle] game_state tick=${data.tick}:`,
        data.players.map(p => `${p.id.substring(0, 4)}=(${p.x.toFixed(0)},${p.y.toFixed(0)}) alive=${p.alive}`).join(' | '),
      );
    }

    const newOtherHuds: HudPlayerInfo[] = [];

    for (const p of data.players) {
      // 检测掉血
      const prev = prevHp.get(p.id);
      if (prev !== undefined && prev > p.hp && p.alive) {
        const dmg = prev - p.hp;
        rendererRef.value.playHitEffect(p.id);
        rendererRef.value.showDamageNumber(p.id, dmg);
      }
      prevHp.set(p.id, p.hp);

      // 更新物理系统
      rendererRef.value.updatePlayerState(p.id, {
        tick: data.tick,
        x: p.x, y: p.y,
        vx: p.vx, vy: p.vy,
        hp: p.hp, maxHp: p.maxHp,
        energy: p.energy, maxEnergy: p.maxEnergy,
      });

      // 构建 HUD 信息
      const hudInfo: HudPlayerInfo = {
        name: p.name,
        currentHp: p.hp,
        maxHp: p.maxHp,
        currentEn: p.energy,
        maxEn: p.maxEnergy,
        weaponName: p.weapon?.name ?? '未知',
        weaponIcon: p.weapon?.iconId ?? 'game-icons:help',
        weaponCd: p.weapon?.cd ?? 0,
        overheated: p.overheated ?? false,
        alive: p.alive,
      };

      // 更新到 Map
      playerHudMap.value.set(p.id, hudInfo);

      // 分类：自己 vs 其他玩家
      if (p.id === selfId || p.name === selfName) {
        selfHud.value = hudInfo;
      } else {
        newOtherHuds.push(hudInfo);
      }
    }

    // 更新其他玩家列表
    otherPlayerHuds.value = newOtherHuds;

    // 处理死亡：通知渲染器玩家不可见
    for (const p of data.players) {
      if (!p.alive && rendererRef.value) {
        rendererRef.value.setPlayerAlive(p.id, false);
      }
    }
  }

  /** 处理 visual_event 事件 */
  function onVisualEvent(data: VisualEventData): void {
    if (!rendererRef.value) return;

    switch (data.type) {
      case 'shockwave_trigger':
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: 'shockwave',
            x: data.x, y: data.y,
            isBurst: data.isBurst ?? false,
            playerId: data.playerId,
          });
        }
        break;
      case 'firewall_spawn':
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: 'firewall',
            x: data.x, y: data.y,
            isBurst: data.isBurst ?? false,
            playerId: data.playerId,
          });
        }
        break;
      case 'hive_sting':
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
      case 'burst_trigger':
        rendererRef.value.triggerSkillEffect({
          type: 'burst_flash',
          playerId: data.playerId,
        });
        if (data.playerId) {
          rendererRef.value.playBurstEffect(data.playerId);
        }
        break;
      case 'hit':
        break;
    }
  }

  function onRoundStart(data: { duration: number }): void {
    console.log('[FishOilBattle] onRoundStart: 进入战斗阶段, duration=', data.duration);
    showWeaponSelect.value = false;
    battleHudVisible.value = true;
    roundTimer.value = data.duration;
    roundDuration.value = data.duration;
    stopCountdown();
  }

  function onRoundTimer(data: { remaining: number }): void {
    roundTimer.value = data.remaining;
  }

  function onWeaponConfirmed(data: { weaponId: string; weaponName: string }): void {
    selfHud.value.weaponName = data.weaponName;
    selfHud.value.weaponIcon = `game-icons:${data.weaponId}`;
  }

  function onGameEnd(data: { winnerId?: string; winnerName?: string; reason?: string }): void {
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
    console.log('[FishOilBattle] 游戏结束', {
      winnerName: data.winnerName, winnerId: data.winnerId,
      reason: data.reason, isDraw: isDraw.value,
    });
  }

  // ── 生命周期清理 ───────────────────────────────────
  onUnmounted(() => {
    stopCountdown();
  });

  return {
    showWeaponSelect: showWeaponSelect as any,
    weaponPool: weaponPool as any,
    selectedWeaponId: selectedWeaponId as any,
    selectCountdown: selectCountdown as any,
    isWeaponConfirmed: isWeaponConfirmed as any,
    battleHudVisible: battleHudVisible as any,
    selfHud: selfHud as any,
    otherPlayerHuds: otherPlayerHuds as any,
    roundTimer: roundTimer as any,
    roundDuration: roundDuration as any,
    winnerName: winnerName as any,
    winnerPlayerId: winnerPlayerId as any,
    isDraw: isDraw as any,
    endReason: endReason as any,
    isWatcher: isWatcher as any,
    selectWeapon,
    onBattleStart,
    onRoundStart,
    onRoundTimer,
    onWeaponConfirmed,
    onGameState,
    onVisualEvent,
    onGameEnd,
  };
}
