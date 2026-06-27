import { ref, onUnmounted, type Ref } from 'vue';
import type { RoomPlayer, Room } from 'tiaoom/client';
import type { CyberFishRenderer } from './renderer/CyberFishRenderer';

// 共享协议类型
import type {
  GameStatePlayer,
  VisualEventData,
  ArenaConfig,
} from '$/backend/src/games/fish-oil-battle/shared/protocol';
import { VisualEventType, WeaponId } from '$/backend/src/games/fish-oil-battle/config/GameEnums';

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
  onBattleStart: (data: { weaponPool: SelectableWeapon[]; countdown: number; arenaConfig?: ArenaConfig }) => void;
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

  function onBattleStart(data: { weaponPool: SelectableWeapon[]; countdown: number; arenaConfig?: ArenaConfig }): void {
    winnerName.value = null;
    winnerPlayerId.value = '';
    isDraw.value = false;
    endReason.value = '';

    weaponPool.value = data.weaponPool;
    showWeaponSelect.value = true;
    battleHudVisible.value = false;

    // 设置竞技场配置
    if (data.arenaConfig && rendererRef.value) {
      rendererRef.value.setArenaConfig(data.arenaConfig);
    }

    startCountdown();
    console.log('[FishOilBattle] onBattleStart: reset, weapons=', data.weaponPool.map(w => w.name), 'arenaConfig=', data.arenaConfig);
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
      case VisualEventType.SHOCKWAVE_TRIGGER:
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            isBurst: data.isBurst ?? false,
            radius: data.radius,
            playerId: data.playerId,
          });
        }
        break;
      case VisualEventType.FIREWALL_SPAWN:
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            isBurst: data.isBurst ?? false,
            radius: data.radius,
            visualWidth: data.visualWidth,
            visualHeight: data.visualHeight,
            durationSec: data.durationSec,
            playerId: data.playerId,
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
          type: data.type,
          playerId: data.playerId,
        });
        if (data.playerId) {
          rendererRef.value.playBurstEffect(data.playerId);
          // 蜂巢母体爆发：蜂群数量永久增加，5秒后仅恢复蜂的视觉大小
          if (data.weaponId === WeaponId.HIVE_MOTHER) {
            const pid = data.playerId;
            const beeCount = data.beeCount ?? 6;
            rendererRef.value.setPlayerHiveActive(pid, beeCount, true);
            setTimeout(() => {
              // 爆发效果结束：保持蜂数，仅取消爆发视觉
              rendererRef.value?.setPlayerHiveActive(pid, beeCount, false);
            }, 5000);
          }
        }
        break;
      case VisualEventType.BEE_COUNT_CHANGE:
        // 蜂巢母体蜂数变化（受击惩罚）
        if (data.playerId && data.beeCount !== undefined) {
          rendererRef.value.setPlayerHiveActive(
            data.playerId,
            data.beeCount,
            data.isBurst ?? false,
          );
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
      case VisualEventType.DRAWING_MANIFEST_INK:
        // 小兔/肌肉兔状态同步
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
        // 肌肉兔降临爆发
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
        // 肌肉兔冲刺撞击
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
      case VisualEventType.DISCHARGE_CAT_ARC:
        // 电弧弹射链
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
        // 雷霆万钧爆发
        rendererRef.value.triggerSkillEffect({
          type: data.type,
          x: data.x, y: data.y,
          radius: data.radius ?? 120,
          playerId: data.playerId,
          catX: data.catX,
          catY: data.catY,
        });
        break;
      case VisualEventType.PRECOGNITIVE_LENS_FORESIGHT:
        // 先见层数同步
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
        // 猫灵回响投射物
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
        // 无限洞察爆发
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            playerId: data.playerId,
          });
        }
        break;
      case VisualEventType.EMOTIONAL_WEATHER_LIGHTNING:
        // 落雷
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
        // 冰雹
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
        // 极端气候爆发
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            radius: data.radius ?? 200,
            playerId: data.playerId,
          });
        }
        break;
      case VisualEventType.EMOTION_MASTERY_MOOD:
        // 心境轮转同步
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
        // 情绪实体化爆发
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            playerId: data.playerId,
            radius: data.radius ?? 80,
          });
        }
        break;
      case VisualEventType.FLUID_MASTERY_TRAIL:
        // KE 水流尾迹
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            playerId: data.playerId,
            x: data.x, y: data.y,
            radius: data.radius ?? 45,
            flowDir: data.fluidFlowDir ?? 0,
          });
        }
        break;
      case VisualEventType.FLUID_MASTERY_VORTEX:
        // KE 漩涡牵引
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            targetId: data.targetId,
            x: data.x, y: data.y,
            radius: data.radius ?? 45,
            pullForce: data.fluidPullForce ?? 0.5,
          });
        }
        break;
      case VisualEventType.FLUID_MASTERY_BURST:
        // KE 水龙卷爆发
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            playerId: data.playerId,
            x: data.x, y: data.y,
            radius: data.radius ?? 220,
          });
        }
        break;
      case VisualEventType.MEMORY_CORRIDOR_ECHO:
        // 梦回响光环
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
        // 梦历史共振
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
        // 梦记忆洪流爆发
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
      case VisualEventType.INFINITE_FOLD_DODGE:
        // 陈厌孑空间闪避
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
        // 陈厌孑空间重组
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
        // 陈厌孑维度坍缩爆发
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            playerId: data.playerId,
            x: data.x, y: data.y,
            radius: data.radius ?? 180,
          });
        }
        break;
      case VisualEventType.BOTANICAL_PLANT_SPAWN:
        // 沐里 - 植物生成
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
        // 沐里 - 植物枯萎
        rendererRef.value.triggerSkillEffect({
          type: data.type,
          x: data.x, y: data.y,
          playerId: data.playerId,
          plantId: data.botanicalPlantId,
        });
        break;
      case VisualEventType.BOTANICAL_BURST:
        // 沐里 - 植物派对爆发
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
      case VisualEventType.GLOBAL_EFFECT:
        if (rendererRef.value) {
          rendererRef.value.handleGlobalEffect(data);
        }
        break;
      // ── 基础武器扩展（9 个，场 + 爆发） ──────────────
      case VisualEventType.NANO_RIPPER_FIELD:
        // 纳米撕裂者 - 撕裂场
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value?.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            radius: data.radius ?? 60,
            playerId: data.playerId,
          });
        }
        break;
      case VisualEventType.NANO_RIPPER_BURST:
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            radius: data.radius ?? 200,
            playerId: data.playerId,
          });
        }
        break;
      case VisualEventType.PURSUIT_PROTOCOL_MARK:
        // 追猎协议 - 追猎标记（x/y=目标位置，tx/ty=追猎者位置）
        if (data.targetId && data.x !== undefined && data.y !== undefined &&
            data.tx !== undefined && data.ty !== undefined) {
          rendererRef.value?.triggerSkillEffect({
            type: data.type,
            targetId: data.targetId,
            playerId: data.playerId,
            x: data.x, y: data.y,
            hunterX: data.tx, hunterY: data.ty,
            radius: data.radius ?? 60,
          });
        }
        break;
      case VisualEventType.PURSUIT_PROTOCOL_BURST:
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            radius: data.radius ?? 200,
            playerId: data.playerId,
          });
        }
        break;
      case VisualEventType.GRAVITY_WELL_CORE:
        // 重力阱 - 重力核心
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value?.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            radius: data.radius ?? 60,
            playerId: data.playerId,
          });
        }
        break;
      case VisualEventType.GRAVITY_WELL_BURST:
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            radius: data.radius ?? 200,
            playerId: data.playerId,
          });
        }
        break;
      case VisualEventType.ENTROPY_DIFFUSER_FIELD:
        // 熵增扩散器 - 熵增场
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value?.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            radius: data.radius ?? 60,
            playerId: data.playerId,
          });
        }
        break;
      case VisualEventType.ENTROPY_DIFFUSER_BURST:
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            radius: data.radius ?? 200,
            playerId: data.playerId,
          });
        }
        break;
      case VisualEventType.BASTION_BUILDER_SHIELD:
        // 堡垒构筑者 - 堡垒护盾
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value?.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            radius: data.radius ?? 60,
            playerId: data.playerId,
          });
        }
        break;
      case VisualEventType.BASTION_BUILDER_BURST:
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            radius: data.radius ?? 200,
            playerId: data.playerId,
          });
        }
        break;
      case VisualEventType.CIRCUIT_WEAVER_NETWORK:
        // 电路编织者 - 电路网络
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value?.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            radius: data.radius ?? 60,
            playerId: data.playerId,
          });
        }
        break;
      case VisualEventType.CIRCUIT_WEAVER_BURST:
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            radius: data.radius ?? 200,
            playerId: data.playerId,
          });
        }
        break;
      case VisualEventType.QUANTUM_RIFT_FISSURE:
        // 量子裂隙 - 裂隙
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value?.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            radius: data.radius ?? 60,
            playerId: data.playerId,
          });
        }
        break;
      case VisualEventType.QUANTUM_RIFT_BURST:
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            radius: data.radius ?? 200,
            playerId: data.playerId,
          });
        }
        break;
      case VisualEventType.SIZE_WARP_FIELD:
        // 体积扭曲 - 扭曲场
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value?.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            radius: data.radius ?? 60,
            playerId: data.playerId,
          });
        }
        break;
      case VisualEventType.SIZE_WARP_BURST:
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            radius: data.radius ?? 200,
            playerId: data.playerId,
          });
        }
        break;
      case VisualEventType.RICOCHET_CORE_TRAIL:
        // 弹射核心 - 弹射轨迹
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value?.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            radius: data.radius ?? 60,
            playerId: data.playerId,
          });
        }
        break;
      case VisualEventType.RICOCHET_CORE_BURST:
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            x: data.x, y: data.y,
            radius: data.radius ?? 200,
            playerId: data.playerId,
          });
        }
        break;
      default:
        console.warn('[FishOilBattle] 未处理的 VisualEventType:', data.type);
        break;
    }
  }

  function onRoundStart(data: { duration: number; players?: Array<{ id: string; weaponId: string }> }): void {
    console.log('[FishOilBattle] onRoundStart: 进入战斗阶段, duration=', data.duration);
    showWeaponSelect.value = false;
    battleHudVisible.value = true;
    roundTimer.value = data.duration;
    roundDuration.value = data.duration;
    stopCountdown();

    // 为蜂巢母体玩家启用蜂群绕球公转渲染
    if (data.players && rendererRef.value) {
      for (const p of data.players) {
        if (p.weaponId === WeaponId.HIVE_MOTHER) {
          console.log(`[FishOilBattle] 启用蜂群渲染: playerId=${p.id}`);
          rendererRef.value.setPlayerHiveActive(p.id, 3, false);
        }
      }
    }
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
