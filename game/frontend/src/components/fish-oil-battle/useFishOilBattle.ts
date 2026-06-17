import { ref, onUnmounted, type Ref } from 'vue';
import type { RoomPlayer, Room } from 'tiaoom/client';
import type { CyberFishRenderer } from './renderer/CyberFishRenderer';

export interface HudPlayerInfo {
  name: string;
  currentHp: number;
  maxHp: number;
  currentEn: number;
  maxEn: number;
  weaponName: string;
  weaponIcon: string;
  weaponCd: number;    // 秒，0=就绪
  overheated: boolean;
}

export interface FishOilBattleState {
  /** 是否显示武器选择页 */
  showWeaponSelect: Ref<boolean>;
  /** 当前玩家的武器池 */
  weaponPool: Ref<SelectableWeapon[]>;
  /** 已选武器 ID */
  selectedWeaponId: Ref<string | null>;
  /** 选择倒计时（秒） */
  selectCountdown: Ref<number>;
  /** 已确认选择 */
  isWeaponConfirmed: Ref<boolean>;

  /** 战斗 HUD 是否可见 */
  battleHudVisible: Ref<boolean>;
  /** 己方 HUD 数据 */
  selfHud: Ref<HudPlayerInfo>;
  /** 对手 HUD 数据 */
  opponentHud: Ref<HudPlayerInfo>;
  /** 回合剩余秒数 */
  roundTimer: Ref<number>;
  /** 回合总秒数 */
  roundDuration: Ref<number>;

  /** 胜者昵称，非空时显示结算遮罩 */
  winnerName: Ref<string | null>;
  /** 胜者 ID */
  winnerPlayerId: Ref<string>;
  /** 是否平局 */
  isDraw: Ref<boolean>;
  /** 结束原因 */
  endReason: Ref<string>;
  /** 当前玩家是否为观战者 */
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

  // ── 武器选择阶段状态 ───────────────────────────────
  const showWeaponSelect = ref(true);
  const weaponPool = ref<SelectableWeapon[]>([]);
  const selectedWeaponId = ref<string | null>(null);
  const selectCountdown = ref(15);
  const isWeaponConfirmed = ref(false);

  // ── 战斗阶段状态 ───────────────────────────────────
  const battleHudVisible = ref(false);

  const selfHud = ref<HudPlayerInfo>({
    name: (roomPlayer as any).name ?? '我',
    currentHp: 100, maxHp: 100,
    currentEn: 0, maxEn: 100,
    weaponName: '未选择',
    weaponIcon: 'game-icons:help',
    weaponCd: 0, overheated: false,
  });

  const opponentHud = ref<HudPlayerInfo>({
    name: '对手',
    currentHp: 100, maxHp: 100,
    currentEn: 0, maxEn: 100,
    weaponName: '未知',
    weaponIcon: 'game-icons:help',
    weaponCd: 0, overheated: false,
  });

  const roundTimer = ref(90);
  const roundDuration = ref(90);

  // ── 结算状态 ────────────────────────────────────
  const winnerName = ref<string | null>(null);
  const winnerPlayerId = ref('');
  const isDraw = ref(false);        // 是否平局
  const endReason = ref('');        // 结束原因（hp_zero / timeout）
  const isWatcher = ref((roomPlayer as any).role !== 'player');

  // ── 内部倒计时 timer ───────────────────────────────
  let countdownTimer: ReturnType<typeof setInterval> | null = null;

  // ── 方法 ───────────────────────────────────────────

  /** 选择武器 */
  function selectWeapon(weaponId: string): void {
    if (isWeaponConfirmed.value || !weaponPool.value.length) return;
    selectedWeaponId.value = weaponId;
    isWeaponConfirmed.value = true;

    // 通过回调发送选择指令到后端
    console.log('[FishOilBattle] 发送 select_weapon:', weaponId);
    sendCommand?.('select_weapon', { weaponId });
  }

  /** 开始武器选择倒计时 */
  function startCountdown(): void {
    selectCountdown.value = 15;
    isWeaponConfirmed.value = false;
    selectedWeaponId.value = null;

    stopCountdown(); // 清除旧 timer
    countdownTimer = setInterval(() => {
      selectCountdown.value--;
      if (selectCountdown.value <= 0) {
        // 超时自动随机
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

  /** 处理 battle_start 事件（新一轮开始，重置所有状态） */
  function onBattleStart(data: { weaponPool: SelectableWeapon[]; countdown: number }): void {
    // 重置结算状态（修复重启后结算弹窗不消失）
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

  /** 记录上一帧各玩家的 HP（用于检测掉血） */
  const prevHp = new Map<string, number>();

  /** 处理 game_state 事件（高频，20fps） */
  function onGameState(data: {
    players: Array<{
      id: string;
      name: string;
      x: number; y: number;
      vx: number; vy: number;
      hp: number; maxHp: number;
      energy: number; maxEnergy: number;
      weapon?: { name: string; iconId: string; cd: number };
      overheated?: boolean;
    }>;
    tick: number;
    timestamp: number;
  }): void {
    if (!rendererRef.value) return;

    // 日志：每 100 帧输出一次位置（避免刷屏）
    if (data.tick % 100 === 0 || data.tick < 5) {
      console.log(
        `[FishOilBattle] game_state tick=${data.tick}:`,
        data.players.map(p => `${p.id}=(${p.x.toFixed(0)},${p.y.toFixed(0)})`).join(' | '),
      );
    }

    for (const p of data.players) {
      // 检测掉血
      const prev = prevHp.get(p.id);
      if (prev !== undefined && prev > p.hp) {
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

      // 更新 HUD 数据
      const selfName = (roomPlayer as any).name ?? '';
      if (p.name === selfName || p.id === (roomPlayer as any).id) {
        selfHud.value.currentHp = p.hp;
        selfHud.value.maxHp = p.maxHp;
        selfHud.value.currentEn = p.energy;
        selfHud.value.maxEn = p.maxEnergy;
        if (p.weapon) {
          selfHud.value.weaponName = p.weapon.name;
          selfHud.value.weaponIcon = p.weapon.iconId;
          selfHud.value.weaponCd = p.weapon.cd;
        }
        selfHud.value.overheated = p.overheated ?? false;
      } else {
        opponentHud.value.name = p.name;
        opponentHud.value.currentHp = p.hp;
        opponentHud.value.maxHp = p.maxHp;
        opponentHud.value.currentEn = p.energy;
        opponentHud.value.maxEn = p.maxEnergy;
        if (p.weapon) {
          opponentHud.value.weaponName = p.weapon.name;
          opponentHud.value.weaponIcon = p.weapon.iconId;
          opponentHud.value.weaponCd = p.weapon.cd;
        }
      }
    }
  }

  /** 处理 visual_event 事件（特效触发） */
  function onVisualEvent(data: {
    type: string;
    playerId?: string;
    weaponId?: string;
    x?: number; y?: number;
    isBurst?: boolean;
    tx?: number; ty?: number;
  }): void {
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
        // 碰墙不再闪白，仅保留受伤时的闪白反馈（在 game_state 中检测 HP 变化触发）
        break;
    }
  }

  /** 处理 round_start 事件（真正开始战斗） */
  function onRoundStart(data: { duration: number }): void {
    console.log('[FishOilBattle] onRoundStart: 进入战斗阶段, duration=', data.duration);
    showWeaponSelect.value = false;
    battleHudVisible.value = true;
    roundTimer.value = data.duration;
    roundDuration.value = data.duration;
    stopCountdown();
  }

  /** 处理 round_timer 事件 */
  function onRoundTimer(data: { remaining: number }): void {
    roundTimer.value = data.remaining;
  }

  /** 处理 weapon_confirmed 事件（后端确认已选） */
  function onWeaponConfirmed(data: { weaponId: string; weaponName: string }): void {
    selfHud.value.weaponName = data.weaponName;
    selfHud.value.weaponIcon = `game-icons:${data.weaponId}`;
  }

  /** 处理 game_end 事件 */
  function onGameEnd(data: { winnerId?: string; winnerName?: string; reason?: string }): void {
    battleHudVisible.value = false;
    stopCountdown();

    if (data.winnerName) {
      winnerName.value = data.winnerName;
      winnerPlayerId.value = data.winnerId ?? '';
      isDraw.value = false;
      endReason.value = data.reason ?? '';
    } else {
      // 平局：无胜者，显示平局结算
      winnerName.value = null;
      winnerPlayerId.value = '';
      isDraw.value = true;
      endReason.value = data.reason ?? 'timeout';
    }

    showWeaponSelect.value = false;

    console.log('[FishOilBattle] 游戏结束', { winnerName: data.winnerName, winnerId: data.winnerId, reason: data.reason, isDraw: isDraw.value });
  }

  // ── 生命周期清理 ───────────────────────────────────
  onUnmounted(() => {
    stopCountdown();
  });

  return {
    // 状态
    showWeaponSelect: showWeaponSelect as any,
    weaponPool: weaponPool as any,
    selectedWeaponId: selectedWeaponId as any,
    selectCountdown: selectCountdown as any,
    isWeaponConfirmed: isWeaponConfirmed as any,
    battleHudVisible: battleHudVisible as any,
    selfHud: selfHud as any,
    opponentHud: opponentHud as any,
    roundTimer: roundTimer as any,
    roundDuration: roundDuration as any,
    winnerName: winnerName as any,
    winnerPlayerId: winnerPlayerId as any,
    isDraw: isDraw as any,
    endReason: endReason as any,
    isWatcher: isWatcher as any,
    // 方法
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
