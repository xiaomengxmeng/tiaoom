/**
 * 赛博鱼油 · 房间级游戏逻辑
 *
 * v2.0 高可扩展武器系统架构
 *
 * 继承 GameRoom，管理完整对局流程：
 *   1. 武器选择阶段（15s，三选一，选完即开战）
 *   2. 战斗阶段（90s，20fps tick loop）
 *   3. 结算阶段
 *
 * 负责：
 * - 组合 PhysicsEngine + BattleState + WeaponScheduler + PhysicsAdapter
 * - 每 50ms 推进物理 + 武器调度 + 广播 game_state
 * - 广播 visual_event 技能特效事件（从武器 visual_only 效果提取）
 * - 处理武器选择指令
 */

export const name = '赛博鱼油大逃杀';
export const minSize = 2;
export const maxSize = 8;
export const description = '2-8 人大逃杀，选择武器，最后存活者获胜！';

import { RoomPlayer } from 'tiaoom';
import { GameRoom, IGameCommand } from '../index';
import { BotPlayer } from './BotPlayer';
import { BattleState } from './core/SkillScheduler';
import { WeaponScheduler, type PendingVisualEvent } from './core/WeaponScheduler';
import { createWeapon, getImplementedWeaponMetaList } from './core/WeaponRegistry';
import { PhysicsEngine } from './physics/PhysicsEngine';
import { PhysicsAdapter, type PhysicsQueryDeps } from './physics/PhysicsAdapter';

// 共享协议类型
import type {
  GameStatePlayer,
  VisualEventData,
  PlayerSpawnInfo,
  PlayerStats,
} from './shared/protocol';

import { School, VisualEventType, GameEndReason, ArenaShape } from './config/GameEnums';

// ─── 武器元信息 ────────────────────────────────────────────────────
interface WeaponMeta {
  id: string;
  name: string;
  faction: School;
  difficulty: number;
  iconId: string;
}

/** 仅包含已实现的武器（排除 StubWeapon） */
const IMPLEMENTED_WEAPONS: WeaponMeta[] = getImplementedWeaponMetaList().map(w => ({
  id: w.id,
  name: w.name,
  faction: w.school as any,
  difficulty: w.difficulty,
  iconId: w.iconId,
}));

/** Fisher-Yates 洗牌 */
function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ─── 房间类 ────────────────────────────────────────────────────
export default class FishOilRoom extends GameRoom {
  // 子系统
  private battleState!: BattleState;
  private physics!: PhysicsEngine;
  private scheduler!: WeaponScheduler;
  private physicsAdapter!: PhysicsAdapter;

  // 武器绑定
  private weaponSelections: Record<string, string | null> = {}; // playerId → weaponId
  private weaponConfirmed: Set<string> = new Set();

  // 玩家头像
  private playerAvatars: Record<string, string> = {};

  // 战斗阶段
  private phase: 'weapon_select' | 'battle' | 'ended' = 'weapon_select';
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private roundTimer: ReturnType<typeof setInterval> | null = null;
  private roundSecondsRemaining = 90;
  private battleTick = 0;
  /** 大逃杀：已死亡的玩家 ID 集合 */
  private deadPlayers = new Set<string>();

  // 测试模式
  private isTestMode = false;
  private botPlayers = new Map<string, BotPlayer>();

  /**
   * 根据玩家数量计算竞技场配置
   * 设计原则：人数越多 → 竞技场越大 → 保持游戏体验
   * 形状随机选择：circle / rect / hexagon
   */
  private computeArenaConfig(playerCount: number): { width: number; height: number; arenaRadius: number; ballRadius: number; shape: ArenaShape; arenaHalfW?: number; arenaHalfH?: number; wallColor?: number } {
    // 基础配置（2人）
    const baseWidth = 1280;
    const baseHeight = 720;
    const baseRadius = 280;
    const baseBallRadius = 40;

    // 人数缩放因子（线性增长）
    // 2人: 1.0x, 4人: 1.2x, 6人: 1.4x, 8人: 1.6x
    const scaleFactor = 1.0 + (playerCount - 2) * 0.1;

    const newWidth = Math.round(baseWidth * scaleFactor);
    const newHeight = Math.round(baseHeight * scaleFactor);
    const newRadius = Math.round(baseRadius * scaleFactor);
    // 小球半径也相应增大（但增长较慢）
    const ballScale = 1.0 + (playerCount - 2) * 0.05;
    const newBallRadius = Math.round(baseBallRadius * ballScale);

    // 随机形状
    const shapes = [ArenaShape.CIRCLE, ArenaShape.RECT, ArenaShape.HEXAGON];
    const shape = shapes[Math.floor(Math.random() * shapes.length)];

    // 随机墙壁颜色（后端权威，保证同一局所有玩家同步）
    const wallColorPalette = [
      0x00FFFF, 0xFF00FF, 0x00FF88, 0xFF6600,
      0xFFDD00, 0x00AAFF, 0xFF4488, 0x88FF00,
      0xCC44FF, 0xFF2266,
    ];
    const wallColor = wallColorPalette[Math.floor(Math.random() * wallColorPalette.length)];

    const result: any = {
      width: newWidth,
      height: newHeight,
      arenaRadius: newRadius,
      ballRadius: newBallRadius,
      shape,
      wallColor,
    };

    if (shape === ArenaShape.RECT) {
      // 矩形：半宽/半高 = 半径 * 0.75（保持面积大致相同）
      result.arenaHalfW = Math.round(newRadius * 0.75);
      result.arenaHalfH = Math.round(newRadius * 0.75);
    }

    console.log(`[FishOil] 竞技场配置: ${playerCount}人 → ${newWidth}x${newHeight}, shape=${shape}, radius=${newRadius}, ballRadius=${newBallRadius}`);

    return result;
  }

  /** 按人数生成 spawn 位置（圆形分布，随机旋转） */
  private computeSpawnPositions(count: number, arenaRadius: number, canvasWidth: number, canvasHeight: number): { x: number; y: number }[] {
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;
    // 出生距离 = 竞技场半径 * 0.5（保持在场内且有一定间隔）
    const spawnDist = arenaRadius * 0.5;
    const baseAngle = Math.random() * Math.PI * 2;
    const positions: { x: number; y: number }[] = [];
    for (let i = 0; i < count; i++) {
      const angle = baseAngle + (Math.PI * 2 / count) * i;
      positions.push({
        x: centerX + Math.cos(angle) * spawnDist,
        y: centerY + Math.sin(angle) * spawnDist,
      });
    }
    return positions;
  }

  // ─── 覆盖 onStart ────────────────────────────────────
  onStart() {
    const players = this.room.validPlayers;
    const playerCount = players.length;
    if (!this.isTestMode && (playerCount < 2 || playerCount > 8)) {
      this.say('需要 2-8 名玩家（大逃杀模式）');
      return;
    }

    // 收集头像
    for (const p of players) {
      const avatar = (p.attributes as any)?.avatar as string | undefined;
      if (avatar) this.playerAvatars[p.id] = avatar;
    }

    // 根据人数计算竞技场配置
    const arenaConfig = this.computeArenaConfig(playerCount);

    // 1. 初始化 BattleState（使用动态尺寸）
    this.battleState = new BattleState(arenaConfig.width, arenaConfig.height);
    for (const p of players) {
      this.battleState.addPlayer({
        id: p.id,
        name: p.name,
        hp: 100, maxHp: 100,
        position: { x: arenaConfig.width / 2, y: arenaConfig.height / 2 },
        totalDamageTaken: 0,
        isOverheated: false,
      });
      this.weaponSelections[p.id] = null;
    }

    // 2. 初始化物理引擎（使用动态配置）
    const spawnPositions = this.computeSpawnPositions(playerCount, arenaConfig.arenaRadius, arenaConfig.width, arenaConfig.height);
    this.physics = new PhysicsEngine({
      canvasWidth: arenaConfig.width,
      canvasHeight: arenaConfig.height,
      arenaShape: arenaConfig.shape,
      arenaRadius: arenaConfig.arenaRadius,
      arenaHalfW: arenaConfig.arenaHalfW,
      arenaHalfH: arenaConfig.arenaHalfH,
      ballRadius: arenaConfig.ballRadius,
    });
    for (let i = 0; i < playerCount; i++) {
      this.physics.addBall(players[i].id, spawnPositions[i].x, spawnPositions[i].y);
    }

    // 3. 发送武器选择阶段
    this.phase = 'weapon_select';
    this.weaponConfirmed.clear();

    // 每个玩家随机分配 3 个已实现的武器
    const weaponPoolForClient = shuffleArray(IMPLEMENTED_WEAPONS).slice(0, 3);

    // 按人数分配 faction 颜色（轮转）
    const allFactions: School[] =
      [School.AGGRESSOR, School.CONTROLLER, School.ENGINEER, School.WILD];
    const playerInfos: PlayerSpawnInfo[] = players.map((p, i) => ({
      id: p.id,
      name: p.name,
      avatar: this.playerAvatars[p.id] ?? '',
      faction: allFactions[i % allFactions.length],
      x: spawnPositions[i].x,
      y: spawnPositions[i].y,
    }));

    console.log(`[FishOil] prepareBattle: sending battle_start with ${playerInfos.length} players:`,
      playerInfos.map(p => `${p.name}(${p.id.substring(0, 4)}) faction=${p.faction} spawn=(${p.x},${p.y})`).join(' | '));

    this.command('battle_start', {
      weaponPool: weaponPoolForClient,
      countdown: 15,
      players: playerInfos,
      arenaConfig: {
        width: arenaConfig.width,
        height: arenaConfig.height,
        shape: arenaConfig.shape,
        arenaRadius: arenaConfig.arenaRadius,
        arenaHalfW: arenaConfig.arenaHalfW,
        arenaHalfH: arenaConfig.arenaHalfH,
        ballRadius: arenaConfig.ballRadius,
        wallColor: arenaConfig.wallColor,
      },
    });

    this.say(`大逃杀模式！${playerCount} 名玩家，选择你的武器！15 秒内做出决定。`);

    // 4. 启动武器选择倒计时（15s）
    this.startTimer(() => {
      for (const p of players) {
        if (!this.weaponConfirmed.has(p.id)) {
          const randomWeapon = IMPLEMENTED_WEAPONS[Math.floor(Math.random() * IMPLEMENTED_WEAPONS.length)];
          this.assignWeapon(p.id, randomWeapon);
        }
      }
      this.startBattle();
    }, 15000, 'weapon_select');

    // 测试模式：Bot 立即随机选择武器（人类玩家仍需手动选择）
    if (this.isTestMode) {
      for (const bot of this.botPlayers.values()) {
        if (!this.weaponConfirmed.has(bot.id)) {
          const randomWeapon = IMPLEMENTED_WEAPONS[Math.floor(Math.random() * IMPLEMENTED_WEAPONS.length)];
          this.assignWeapon(bot.id, randomWeapon);
          console.log(`[FishOil] Bot ${bot.id} 自动选择武器: ${randomWeapon.name}`);
        }
      }
      // 如果所有玩家都选了武器（只有人类还没选），提前结束倒计时
      this.checkAllConfirmed();
    }
  }

  /** 检查是否所有玩家都已确认武器，如果是则立即开战 */
  private checkAllConfirmed(): void {
    const totalPlayers = this.room.validPlayers.filter(p => p.role === 'player').length;
    if (this.weaponConfirmed.size >= totalPlayers) {
      console.log('[FishOil] 全部已选择武器（含 Bot），开始战斗！');
      this.stopTimer('weapon_select');
      this.startBattle();
    }
  }

  // ─── 覆盖 onCommand ──────────────────────────────────
  onCommand(message: IGameCommand): void {
    super.onCommand(message);
    const sender = message.sender as RoomPlayer;

    switch (message.type) {
      case 'select_weapon':
        this.handleSelectWeapon(sender, message.data);
        break;
      case 'start_test_mode':
        this.handleStartTestMode(sender, message.data);
        break;
    }
  }

  private handleSelectWeapon(sender: RoomPlayer, data: { weaponId: string }): void {
    if (this.phase !== 'weapon_select') return;
    if (this.weaponConfirmed.has(sender.id)) return;

    const weapon = IMPLEMENTED_WEAPONS.find(w => w.id === data.weaponId);
    if (!weapon) {
      sender.emit('command', { type: 'error', data: { message: '未知武器' } });
      return;
    }

    this.assignWeapon(sender.id, weapon);
    this.say(`${sender.name} 已选择 ${weapon.name}`);
    console.log(`[FishOil] 武器选择: ${sender.name} → ${weapon.name} (${this.weaponConfirmed.size}/${this.room.validPlayers.length})`);

    // 全部选了 → 直接开始战斗
    if (this.weaponConfirmed.size >= this.room.validPlayers.length) {
      console.log('[FishOil] 全部已选择武器，开始战斗！');
      this.stopTimer('weapon_select');
      this.startBattle();
    }
  }

  private assignWeapon(playerId: string, weapon: WeaponMeta): void {
    this.weaponSelections[playerId] = weapon.id;
    this.weaponConfirmed.add(playerId);
    const player = this.room.validPlayers.find(p => p.id === playerId);
    if (player) {
      player.emit('command', {
        type: 'weapon_confirmed',
        data: { weaponId: weapon.id, weaponName: weapon.name },
      });
    }
  }

  // ─── 测试模式：自动添加 Bot ─────────────────────────
  private handleStartTestMode(sender: RoomPlayer, data: { botCount: number }): void {
    const botCount = Math.max(1, Math.min(7, data.botCount ?? 1));
    const totalPlayers = 1 + botCount; // 1 human + N bots

    if (totalPlayers > this.room.size && this.room.size > 0) {
      this.say(`房间容量不足：当前容量 ${this.room.size}，需要至少 ${totalPlayers} 个位置`);
      return;
    }

    console.log(`[FishOil] 测试模式启动: botCount=${botCount}, totalPlayers=${totalPlayers}`);

    // 清理旧 bot
    this.cleanupBots();

    this.isTestMode = true;

    // 创建并添加 Bot 玩家
    for (let i = 0; i < botCount; i++) {
      const bot = new BotPlayer(i + 1);
      bot.roomId = this.room.id;
      this.room.addPlayer(bot);
      this.botPlayers.set(bot.id, bot);
    }

    console.log(`[FishOil] 已添加 ${botCount} 个 Bot: ${Array.from(this.botPlayers.keys()).join(', ')}`);

    // 设置 human 玩家为 ready
    sender.isReady = true;
    sender.emit('command', { type: 'test_mode_ready', data: { botCount } });

    // 直接启动游戏（绕过准备检查）
    this.room.start(sender);
  }

  /** 清理所有 Bot 玩家 */
  private cleanupBots(): void {
    for (const [id] of this.botPlayers) {
      const idx = this.room.players.findIndex(p => p.id === id);
      if (idx >= 0) {
        this.room.players.splice(idx, 1);
      }
    }
    this.botPlayers.clear();
    this.isTestMode = false;
  }

  // ═══════════════════════════════════════════════════
  //  战斗阶段
  // ═══════════════════════════════════════════════════

  private startBattle(): void {
    this.phase = 'battle';
    this.battleTick = 0;
    this.roundSecondsRemaining = 90;
    this.deadPlayers.clear();

    // 创建 PhysicsAdapter 和 WeaponScheduler
    const deps: PhysicsQueryDeps = {
      getAllBalls: () => this.physics.getAllBalls(),
      getPlayer: (id) => this.battleState.getPlayer(id),
      getAllAliveOpponents: (selfId) => {
        const result: import('./core/types').PlayerState[] = [];
        for (const [, ps] of this.battleState.players) {
          if (ps.id !== selfId && ps.hp > 0) result.push(ps);
        }
        return result;
      },
      getArenaCenter: () => ({
        x: this.physics.config.canvasWidth / 2,
        y: this.physics.config.canvasHeight / 2,
      }),
      getArenaRadius: () => this.physics.config.arenaRadius,
    };
    this.physicsAdapter = new PhysicsAdapter(deps);
    this.scheduler = new WeaponScheduler(this.physicsAdapter);

    // 注册武器技能（使用 WeaponRegistry 工厂）
    for (const p of this.room.validPlayers) {
      const weaponId = this.weaponSelections[p.id];
      if (weaponId) {
        try {
          const weapon = createWeapon(weaponId);
          this.scheduler.register(p.id, weapon);
          console.log(`[FishOil] 注册武器: ${p.name} → ${weapon.name} (${weapon.school})`);
        } catch (err) {
          console.error(`[FishOil] 创建武器失败: ${weaponId}`, err);
        }
      }
    }

    this.say('⚔ 战斗开始！');

    const weaponNames = this.room.validPlayers.map(p => {
      const wid = this.weaponSelections[p.id];
      const wm = IMPLEMENTED_WEAPONS.find(w => w.id === wid);
      return `${p.name}:${wm?.name ?? '未知'}`;
    });
    console.log('[FishOil] startBattle: ' + weaponNames.join(', '));

    // 广播倒计时
    this.command('round_start', {
      duration: 90,
      players: this.room.validPlayers.map(p => ({
        id: p.id,
        weaponId: this.weaponSelections[p.id] ?? 'unknown',
      })),
    });

    // 启动 20fps 战斗循环
    const TICK_MS = 50;
    this.tickTimer = setInterval(() => this.battleTickLoop(), TICK_MS);

    // 启动 1s 回合倒计时
    this.roundTimer = setInterval(() => {
      this.roundSecondsRemaining--;
      if (this.roundSecondsRemaining % 5 === 0 || this.roundSecondsRemaining <= 10) {
        this.command('round_timer', { remaining: this.roundSecondsRemaining });
      }
      if (this.roundSecondsRemaining <= 0) {
        this.endBattle(null);
      }
    }, 1000);
  }

  private battleTickLoop(): void {
    if (this.phase !== 'battle') return;
    this.battleTick++;

    const dt = 0.05;

    // 0. 设置动态障碍物（硬化防火墙等）供物理引擎碰撞
    this.physics.setObstacles(this.scheduler.getObstacles());

    // 1. 物理引擎推进
    const collisions = this.physics.tick(dt);

    // 同步物理位置回 BattleState
    for (const ball of this.physics.getAllBalls()) {
      const player = this.battleState.getPlayer(ball.id);
      if (player) {
        player.position.x = ball.x;
        player.position.y = ball.y;
      }
    }

    // 2. 处理碰撞 → 武器系统
    const visualEvents: VisualEventData[] = [];
    for (const col of collisions) {
      if (col.type === 'ball') {
        const [a, b] = col.ballIds;
        this.scheduler.processHit(a, b, this.battleState);
        this.scheduler.processHit(b, a, this.battleState);

        // 收集碰撞产生的视觉事件
        visualEvents.push(...this.extractVisualEvents(this.scheduler.getVisualEvents()));

        // 碰撞视觉事件由武器系统自行管理，不再添加默认冲击波
      } else if (col.type === 'wall') {
        // 竞技场墙壁碰撞传递给武器
        this.scheduler.processWallHit(col.ballIds[0], this.battleState);
      } else if (col.type === 'obstacle') {
        // 动态障碍物碰撞（硬化防火墙等）
        // 1. 物理反弹已在 PhysicsEngine 中处理
        // 2. 通知武器系统：障碍物碰撞伤害（如硬化防火墙的额外伤害）
        if (col.sourceId && col.ballIds.length > 0) {
          for (const ballId of col.ballIds) {
            this.scheduler.processObstacleHit(col.sourceId, ballId, this.battleState);
          }
        }
        visualEvents.push(...this.extractVisualEvents(this.scheduler.getVisualEvents()));
      }
    }

    // 3. 武器调度器 tick
    this.scheduler.tick(this.battleState);
    visualEvents.push(...this.extractVisualEvents(this.scheduler.getVisualEvents()));

    // 4. 触发爆发（能量满则自动爆）
    for (const playerId of this.scheduler.playerIds) {
      const weapon = this.scheduler.getWeapon(playerId);
      if (weapon && weapon.isBurstReady()) {
        this.scheduler.forceBurst(playerId, this.battleState);
        const player = this.battleState.getPlayer(playerId);

        // 收集爆发视觉事件
        const burstVisuals = this.extractVisualEvents(this.scheduler.getVisualEvents());
        visualEvents.push(...burstVisuals);

        // 通用爆发事件
        visualEvents.push({
          type: VisualEventType.BURST_TRIGGER,
          playerId,
          weaponId: weapon.id,
          x: player?.position.x, y: player?.position.y,
          isBurst: true,
        });
      }
    }

    // 5. 大逃杀：检查死亡，移除死球
    for (const [pid, pstate] of this.battleState.players) {
      if (pstate.hp <= 0 && !this.deadPlayers.has(pid)) {
        this.deadPlayers.add(pid);
        this.physics.removeBall(pid);
        console.log(`[FishOil] 玩家死亡: ${pstate.name} (tick=${this.battleTick})`);
      }
    }

    // 6. 广播 game_state
    this.broadcastGameState();

    // 7. 发送 visual_event
    for (const evt of visualEvents) {
      this.command('visual_event', evt);
    }

    // 8. 大逃杀胜负判定
    const aliveCount = Array.from(this.battleState.players.values())
      .filter(p => p.hp > 0).length;

    if (aliveCount <= 1) {
      if (aliveCount === 1) {
        const survivor = Array.from(this.battleState.players.values())
          .find(p => p.hp > 0)!;
        const winnerPlayer = this.room.validPlayers.find(p => p.id === survivor.id);
        console.log(`[FishOil] 大逃杀结束: 胜者=${winnerPlayer?.name ?? survivor.name} (tick=${this.battleTick})`);
        this.endBattle(winnerPlayer ? [winnerPlayer] : null);
      } else {
        console.log(`[FishOil] 大逃杀结束: 全体阵亡 (tick=${this.battleTick})`);
        this.endBattle(null);
      }
      return;
    }

    // 每 20 tick 打印一次 HP 快照
    if (this.battleTick % 20 === 0) {
      const status: string[] = [];
      for (const [, ps] of this.battleState.players) {
        const deadTag = this.deadPlayers.has(ps.id) ? '[DEAD]' : '';
        status.push(`${ps.name}${deadTag}: ${ps.hp}/${ps.maxHp}HP`);
      }
      console.log(`[FishOil] tick=${this.battleTick} alive=${aliveCount} | ${status.join(' | ')}`);
    }
  }

  /**
   * visualType → VisualEventData.type 映射表。
   * 1:1 透传的事件直接列出，合并映射的（如 HIVE_STING_HIT/FLIGHT → HIVE_STING）显式标注。
   * 不在表中的 visualType 会被过滤掉。
   */
  private static readonly VISUAL_TYPE_MAP: Partial<Record<VisualEventType, VisualEventType>> = {
    [VisualEventType.SHOCKWAVE_TRIGGER]:  VisualEventType.SHOCKWAVE_TRIGGER,
    [VisualEventType.FIREWALL_SPAWN]:     VisualEventType.FIREWALL_SPAWN,
    [VisualEventType.HIVE_STING_HIT]:     VisualEventType.HIVE_STING,
    [VisualEventType.HIVE_STING_FLIGHT]:  VisualEventType.HIVE_STING,
    [VisualEventType.HIVE_STING_BOUNCE]:  VisualEventType.HIVE_STING_BOUNCE,
    [VisualEventType.BURST_TRIGGER]:      VisualEventType.BURST_TRIGGER,
    [VisualEventType.BEE_COUNT_CHANGE]:   VisualEventType.BEE_COUNT_CHANGE,
  };

  /** 从 WeaponScheduler 的 PendingVisualEvent 转换为 VisualEventData */
  private extractVisualEvents(events: PendingVisualEvent[]): VisualEventData[] {
    const result: VisualEventData[] = [];
    for (const evt of events) {
      if (evt.visualType === undefined) continue;
      const mappedType = FishOilRoom.VISUAL_TYPE_MAP[evt.visualType];
      if (mappedType === undefined) continue;

      result.push({
        type: mappedType,
        playerId: evt.playerId,
        weaponId: evt.weaponId,
        x: evt.x,
        y: evt.y,
        radius: evt.radius,
        isBurst: evt.isBurst,
        tx: evt.tx,
        ty: evt.ty,
        beeCount: evt.metadata?.beeCount,
        visualWidth: evt.metadata?.visualWidth,
        visualHeight: evt.metadata?.visualHeight,
        durationSec: evt.metadata?.durationSec,
      });
    }
    return result;
  }

  private broadcastGameState(): void {
    const players: GameStatePlayer[] = [];
    for (const p of this.room.validPlayers) {
      const state = this.battleState.getPlayer(p.id);
      if (!state) continue;

      const isDead = this.deadPlayers.has(p.id);
      const ball = this.physics.getBall(p.id);
      const weapon = this.scheduler.getWeapon(p.id);
      const weaponMeta = IMPLEMENTED_WEAPONS.find(w => w.id === this.weaponSelections[p.id]);

      players.push({
        id: p.id,
        name: p.name,
        x: Math.round(ball?.x ?? state.position.x),
        y: Math.round(ball?.y ?? state.position.y),
        vx: isDead ? 0 : Math.round(ball?.vx ?? 0),
        vy: isDead ? 0 : Math.round(ball?.vy ?? 0),
        hp: state.hp,
        maxHp: state.maxHp,
        energy: weapon?.getEnergy() ?? 0,
        maxEnergy: weapon?.getMaxEnergy() ?? 100,
        weapon: {
          name: weaponMeta?.name ?? '未知',
          iconId: weaponMeta?.iconId ?? 'game-icons:help',
          cd: 0,
        },
        overheated: state.isOverheated,
        avatar: this.playerAvatars[p.id] ?? '',
        alive: !isDead,
      });
    }

    if (this.battleTick % 20 === 0 || this.battleTick <= 2) {
      console.log(
        `[FishOil] broadcast tick=${this.battleTick}:`,
        players.map(p => `${p.name}(${p.id.substring(0, 4)})=(${p.x},${p.y}) v=(${p.vx},${p.vy})`).join(' | '),
      );
    }

    this.command('game_state', {
      players,
      tick: this.battleTick,
      timestamp: Date.now(),
    });
  }

  // ─── 战斗结束 ────────────────────────────────────
  private endBattle(winners: RoomPlayer[] | null): void {
    this.phase = 'ended';
    this.stopBattleLoop();

    const stats: Record<string, PlayerStats> = {};
    for (const [pid, pstate] of this.battleState.players) {
      stats[pid] = {
        remainingHp: pstate.hp,
        totalDamage: pstate.totalDamageTaken,
        maxHit: 0,
        weaponTriggers: 0,
        bursts: 0,
        survived: !this.deadPlayers.has(pid),
      };
    }

    if (winners && winners.length > 0) {
      const winner = winners[0];
      this.say(`🏆 ${winner.name} 获胜！`);
      this.command('game_end', {
        winnerId: winner.id,
        winnerName: winner.name,
        reason: GameEndReason.LAST_STAND,
        stats,
      });
    } else {
      const msg = this.roundSecondsRemaining <= 0 ? '⌛ 时间到，平局！' : '💀 全体阵亡！';
      this.say(msg);
      this.command('game_end', {
        winnerId: '',
        winnerName: '',
        reason: this.roundSecondsRemaining <= 0 ? GameEndReason.TIMEOUT : GameEndReason.LAST_STAND,
        stats,
      });
    }

    setTimeout(() => {
      this.saveAchievements(winners).catch(console.error);
      this.room.end();
    }, 3000);
  }

  private stopBattleLoop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.roundTimer) {
      clearInterval(this.roundTimer);
      this.roundTimer = null;
    }
  }

  // ─── 覆盖 getStatus (断线重连) ─────────────────────
  getStatus(sender: RoomPlayer): any {
    const base = super.getStatus(sender);
    if (this.phase === 'weapon_select') {
      return {
        ...base,
        phase: 'weapon_select',
        weaponPool: IMPLEMENTED_WEAPONS,
        players: this.room.validPlayers.map(p => ({
          id: p.id, name: p.name,
          avatar: this.playerAvatars[p.id] ?? '',
        })),
      };
    }
    if (this.phase === 'battle') {
      const players = this.room.validPlayers.map(p => {
        const ball = this.physics.getBall(p.id);
        const state = this.battleState.getPlayer(p.id);
        return {
          id: p.id, name: p.name,
          x: ball?.x ?? 0, y: ball?.y ?? 0,
          hp: state?.hp ?? 0, maxHp: state?.maxHp ?? 0,
          weaponId: this.weaponSelections[p.id] ?? '',
          avatar: this.playerAvatars[p.id] ?? '',
        };
      });
      return {
        ...base,
        phase: 'battle',
        roundRemaining: this.roundSecondsRemaining,
        players,
      };
    }
    return base;
  }

  // ─── 生命周期清理 ──────────────────────────────────
  init() {
    const room = super.init();
    this.room.on('close', () => {
      this.stopBattleLoop();
      this.cleanupBots();
    });
    this.room.on('leave', (player: any) => {
      const pid = player.id;
      if (this.phase === 'battle' && this.battleState) {
        this.deadPlayers.add(pid);
        this.physics?.removeBall(pid);
        const aliveCount = Array.from(this.battleState.players.values())
          .filter(p => p.hp > 0 && !this.deadPlayers.has(p.id)).length;
        if (aliveCount <= 1) {
          this.endBattle(null);
        }
      }
      if (this.phase === 'weapon_select') {
        this.weaponConfirmed.delete(pid);
      }
    });
    return room;
  }
}
