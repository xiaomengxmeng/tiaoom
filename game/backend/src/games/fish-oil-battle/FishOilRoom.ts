/**
 * 赛博鱼油 · 房间级游戏逻辑
 *
 * 继承 GameRoom，管理完整对局流程：
 *   1. 武器选择阶段（15s，三选一，选完即开战）
 *   2. 战斗阶段（90s，20fps tick loop）
 *   3. 结算阶段
 *
 * 负责：
 * - 组合 PhysicsEngine + BattleState + SkillScheduler
 * - 每 50ms 推进物理 + 技能调度 + 广播 game_state
 * - 广播 visual_event 技能特效事件
 * - 处理武器选择指令
 */

export const name = '赛博鱼油大逃杀';
export const minSize = 2;
export const maxSize = 4;
export const description = '2-4 人大逃杀，选择武器，最后存活者获胜！';

import { RoomPlayer, RoomStatus } from 'tiaoom';
import { GameRoom, IGameCommand } from '../index';
import { BattleState, SkillScheduler, PlayerSkillBinding } from './core/SkillScheduler';
import type { ISkill } from './core/types';
import { PhysicsEngine, CollisionEvent } from './physics/PhysicsEngine';

// 3 把武器
import { ShockwaveGenerator } from './skills/ShockwaveGenerator';
import { FirewallProtocol } from './skills/FirewallProtocol';
import { HiveMother } from './skills/HiveMother';

// 共享协议类型
import type {
  GameStatePlayer,
  VisualEventData,
  PlayerSpawnInfo,
  PlayerStats,
} from '@/shared/protocol';

// ─── 武器元信息（后端扩展了 factory）────────────────────────────
interface WeaponMeta {
  id: string;
  name: string;
  faction: 'aggressor' | 'controller' | 'engineer' | 'wildcard';
  difficulty: 1 | 2 | 3;
  iconId: string;
  factory: () => ISkill;
}

const WEAPON_POOL: WeaponMeta[] = [
  {
    id: 'shockwave', name: '冲击波发生器',
    faction: 'aggressor', difficulty: 1,
    iconId: 'game-icons:lightning-dome',
    factory: () => new ShockwaveGenerator(),
  },
  {
    id: 'firewall', name: '防火墙协议',
    faction: 'controller', difficulty: 2,
    iconId: 'game-icons:firewall',
    factory: () => new FirewallProtocol(),
  },
  {
    id: 'hive', name: '蜂巢母体',
    faction: 'engineer', difficulty: 3,
    iconId: 'game-icons:hive-mind',
    factory: () => new HiveMother(),
  },
];

// ─── 房间类 ────────────────────────────────────────────────────
export default class FishOilRoom extends GameRoom {
  // 子系统
  private battleState!: BattleState;
  private physics!: PhysicsEngine;
  private scheduler: SkillScheduler = new SkillScheduler();

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

  /** 按人数生成 spawn 位置（2人=对侧，3人=正三角，4人=正方顶点，随机旋转） */
  private computeSpawnPositions(count: number): { x: number; y: number }[] {
    const centerX = 640;
    const centerY = 360;
    const spawnDist = 100 + Math.random() * 80;          // 100~180 px 离圆心
    const baseAngle = Math.random() * Math.PI * 2;        // 随机基准角度
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
    if (playerCount < 2 || playerCount > 4) {
      this.say('需要 2-4 名玩家（大逃杀模式）');
      return;
    }

    // 收集头像
    for (const p of players) {
      const avatar = (p.attributes as any)?.avatar as string | undefined;
      if (avatar) this.playerAvatars[p.id] = avatar;
    }

    // 1. 初始化 BattleState
    this.battleState = new BattleState(1280, 720);
    for (const p of players) {
      this.battleState.addPlayer({
        id: p.id,
        name: p.name,
        hp: 100, maxHp: 100,
        position: { x: 640, y: 360 },
        totalDamageTaken: 0,
        isOverheated: false,
      });
      this.weaponSelections[p.id] = null;
    }

    // 2. 初始化物理引擎（圆形竞技场，N 人均匀分布在圆上）
    // 按人数生成 spawn 位置：2人=对侧，3人=正三角，4人=正方
    const spawnPositions = this.computeSpawnPositions(playerCount);

    this.physics = new PhysicsEngine({ canvasWidth: 1280, canvasHeight: 720, arenaRadius: 280 });
    for (let i = 0; i < playerCount; i++) {
      this.physics.addBall(players[i].id, spawnPositions[i].x, spawnPositions[i].y);
    }

    // 3. 发送武器选择阶段
    this.phase = 'weapon_select';
    this.weaponConfirmed.clear();

    const weaponPoolForClient = WEAPON_POOL.map(w => ({
      id: w.id,
      name: w.name,
      faction: w.faction as any,
      difficulty: w.difficulty,
      iconId: w.iconId,
    }));

    // 按人数分配 faction 颜色（轮转）
    const allFactions: ('aggressor' | 'controller' | 'engineer' | 'wildcard')[] =
      ['aggressor', 'controller', 'engineer', 'wildcard'];
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
    });

    this.say(`大逃杀模式！${playerCount} 名玩家，选择你的武器！15 秒内做出决定。`);

    // 4. 启动武器选择倒计时（15s）
    this.startTimer(() => {
      // 超时自动随机分配
      for (const p of players) {
        if (!this.weaponConfirmed.has(p.id)) {
          const randomWeapon = WEAPON_POOL[Math.floor(Math.random() * WEAPON_POOL.length)];
          this.assignWeapon(p.id, randomWeapon);
        }
      }
      this.startBattle();
    }, 15000, 'weapon_select');
  }

  // ─── 覆盖 onCommand ──────────────────────────────────
  onCommand(message: IGameCommand): void {
    super.onCommand(message);
    const sender = message.sender as RoomPlayer;

    switch (message.type) {
      case 'select_weapon':
        this.handleSelectWeapon(sender, message.data);
        break;
    }
  }

  private handleSelectWeapon(sender: RoomPlayer, data: { weaponId: string }): void {
    if (this.phase !== 'weapon_select') return;
    if (this.weaponConfirmed.has(sender.id)) return;

    const weapon = WEAPON_POOL.find(w => w.id === data.weaponId);
    if (!weapon) {
      sender.emit('command', { type: 'error', data: { message: '未知武器' } });
      return;
    }

    this.assignWeapon(sender.id, weapon);
    this.say(`${sender.name} 已选择 ${weapon.name}`);
    console.log(`[FishOil] 武器选择: ${sender.name} → ${weapon.name} (${this.weaponConfirmed.size}/${this.room.validPlayers.length})`);

    // 两人都选了 → 直接开始战斗
    if (this.weaponConfirmed.size >= this.room.validPlayers.length) {
      console.log('[FishOil] 双方已选择武器，开始战斗！');
      this.stopTimer('weapon_select');
      this.startBattle();
    }
  }

  private assignWeapon(playerId: string, weapon: WeaponMeta): void {
    this.weaponSelections[playerId] = weapon.id;
    this.weaponConfirmed.add(playerId);
    const player = this.room.validPlayers.find(p => p.id === playerId);
    if (player) {
      // 私发确认
      player.emit('command', {
        type: 'weapon_confirmed',
        data: { weaponId: weapon.id, weaponName: weapon.name },
      });
    }
  }

  // ═══════════════════════════════════════════════════
  //  战斗阶段
  // ═══════════════════════════════════════════════════

  private startBattle(): void {
    this.phase = 'battle';
    this.battleTick = 0;
    this.roundSecondsRemaining = 90;
    this.deadPlayers.clear();
    this.scheduler = new SkillScheduler();

    // 注册武器技能
    for (const p of this.room.validPlayers) {
      const weaponId = this.weaponSelections[p.id];
      const weaponMeta = WEAPON_POOL.find(w => w.id === weaponId);
      if (weaponMeta) {
        this.scheduler.register(p.id, weaponMeta.factory());
      }
    }

    this.say('⚔ 战斗开始！');
    const weaponNames = this.room.validPlayers.map(p => {
      const wid = this.weaponSelections[p.id];
      const wm = WEAPON_POOL.find(w => w.id === wid);
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
    const TICK_MS = 50; // 20fps
    this.tickTimer = setInterval(() => this.battleTickLoop(), TICK_MS);

    // 启动 1s 回合倒计时
    this.roundTimer = setInterval(() => {
      this.roundSecondsRemaining--;
      if (this.roundSecondsRemaining % 5 === 0 || this.roundSecondsRemaining <= 10) {
        this.command('round_timer', { remaining: this.roundSecondsRemaining });
      }
      if (this.roundSecondsRemaining <= 0) {
        this.endBattle(null); // 超时 → 平局
      }
    }, 1000);
  }

  private battleTickLoop(): void {
    if (this.phase !== 'battle') return;
    this.battleTick++;

    const dt = 0.05; // 50ms

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

    // 2. 处理碰撞 → 技能系统
    const visualEvents: VisualEventData[] = [];
    for (const col of collisions) {
      if (col.type === 'ball') {
        // N 人碰撞：双方触发 onHitTarget
        const [a, b] = col.ballIds;
        this.scheduler.processHit(a, b, this.battleState);
        this.scheduler.processHit(b, a, this.battleState);

        visualEvents.push({
          type: 'shockwave_trigger',
          x: col.position.x, y: col.position.y,
          isBurst: false,
          playerId: col.ballIds[0],
        });
      } else if (col.type === 'wall') {
        // 碰墙不再发送视觉事件
      }
    }

    // 3. 技能调度器 tick
    this.scheduler.tick(this.battleState);

    // 4. 触发爆发（能量满则自动爆）
    for (const playerId of this.scheduler.playerIds) {
      const skill = this.scheduler.getSkill(playerId);
      if (skill && skill.isBurstReady()) {
        const burstEffects = this.scheduler.forceBurst(playerId, this.battleState);
        const player = this.battleState.getPlayer(playerId);

        visualEvents.push({
          type: 'burst_trigger',
          playerId,
          weaponId: skill.id,
          x: player?.position.x, y: player?.position.y,
          isBurst: true,
        });

        // 爆发特效映射
        if (skill.id === 'shockwave') {
          visualEvents.push({
            type: 'shockwave_trigger',
            x: player?.position.x, y: player?.position.y,
            isBurst: true,
            playerId,
          });
        } else if (skill.id === 'firewall') {
          visualEvents.push({
            type: 'firewall_spawn',
            x: player?.position.x, y: player?.position.y,
            isBurst: true,
            playerId,
          });
        } else if (skill.id === 'hive_mother' || skill.id === 'hive') {
          // 大逃杀：随机选一个存活对手作为蜂刺目标
          const opponent = this.battleState.getRandomAliveOpponent(playerId);
          if (opponent) {
            visualEvents.push({
              type: 'hive_sting',
              x: player?.position.x, y: player?.position.y,
              tx: opponent.position.x, ty: opponent.position.y,
              playerId,
            });
          }
        }
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

    // 8. 大逃杀胜负判定：存活人数 ≤ 1 → 结束
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
        this.endBattle(null); // 全灭 → 平局
      }
      return;
    }

    // 每 20 tick（1秒）打印一次 HP 快照
    if (this.battleTick % 20 === 0) {
      const status: string[] = [];
      for (const [, ps] of this.battleState.players) {
        const deadTag = this.deadPlayers.has(ps.id) ? '[DEAD]' : '';
        status.push(`${ps.name}${deadTag}: ${ps.hp}/${ps.maxHp}HP`);
      }
      console.log(`[FishOil] tick=${this.battleTick} alive=${aliveCount} | ${status.join(' | ')}`);
    }
  }

  private broadcastGameState(): void {
    const players: GameStatePlayer[] = [];
    for (const p of this.room.validPlayers) {
      const state = this.battleState.getPlayer(p.id);
      if (!state) continue;

      const isDead = this.deadPlayers.has(p.id);
      const ball = this.physics.getBall(p.id);
      const skill = this.scheduler.getSkill(p.id);
      const weaponMeta = WEAPON_POOL.find(w => w.id === this.weaponSelections[p.id]);

      players.push({
        id: p.id,
        name: p.name,
        x: Math.round(ball?.x ?? state.position.x),
        y: Math.round(ball?.y ?? state.position.y),
        vx: isDead ? 0 : Math.round(ball?.vx ?? 0),
        vy: isDead ? 0 : Math.round(ball?.vy ?? 0),
        hp: state.hp,
        maxHp: state.maxHp,
        energy: skill?.getEnergy() ?? 0,
        maxEnergy: skill?.getMaxEnergy() ?? 100,
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

    // 调试日志：每 20 tick 输出位置（约每秒一次）
    if (this.battleTick % 20 === 0 || this.battleTick <= 2) {
      console.log(
        `[FishOil] broadcast tick=${this.battleTick}:`,
        players.map(p => `${p.name}(${p.id.substring(0,4)})=(${p.x},${p.y}) v=(${p.vx},${p.vy})`).join(' | '),
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

    // 构建对战统计
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
        reason: 'last_stand',
        stats,
      });
    } else {
      const msg = this.roundSecondsRemaining <= 0 ? '⌛ 时间到，平局！' : '💀 全体阵亡！';
      this.say(msg);
      this.command('game_end', {
        winnerId: '',
        winnerName: '',
        reason: this.roundSecondsRemaining <= 0 ? 'timeout' : 'last_stand',
        stats,
      });
    }

    // 保存成就并结束房间
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
    // 断线重连：根据当前阶段发送相应数据
    if (this.phase === 'weapon_select') {
      return {
        ...base,
        phase: 'weapon_select',
        weaponPool: WEAPON_POOL.map(w => ({
          id: w.id, name: w.name,
          faction: w.faction, difficulty: w.difficulty,
          iconId: w.iconId,
        })),
        players: this.room.validPlayers.map(p => ({
          id: p.id, name: p.name,
          avatar: this.playerAvatars[p.id] ?? '',
        })),
      };
    }
    if (this.phase === 'battle') {
      // 战斗中断线重连：补发当前状态
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
  // GameRoom.init() 已在基类注册 'start'/'end'/'close' 等事件，
  // 此处仅需在 onStart 中添加 close 监听。
  init() {
    const room = super.init();
    this.room.on('close', () => this.stopBattleLoop());
    // 玩家离开时：战斗中则标记死亡并检查是否结束，武器选择阶段则清除确认状态
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
