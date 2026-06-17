/**
 * 赛博鱼油 · 前后端共享消息协议
 *
 * 后端: import from '@/shared/protocol'
 * 前端: import from '$/backend/src/shared/protocol'
 *
 * 前后端都 import 这份类型，确保消息结构编译期一致。
 */

// ─── 武器元信息 ────────────────────────────────────────────────
export interface WeaponMeta {
  id: string;
  name: string;
  faction: 'aggressor' | 'controller' | 'engineer' | 'wildcard';
  difficulty: 1 | 2 | 3;
  iconId: string;
}

// ─── 玩家初始信息（battle_start 用）───────────────
export interface PlayerSpawnInfo {
  id: string;
  name: string;
  avatar: string;
  faction: string;
  x: number;
  y: number;
}

// ─── 游戏状态中的玩家数据（game_state 用）──────────
export interface GameStatePlayer {
  id: string;
  name: string;
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  energy: number; maxEnergy: number;
  weapon: { name: string; iconId: string; cd: number };
  overheated: boolean;
  avatar?: string;
  /** 玩家是否存活（大逃杀模式，死亡后 HP=0 且开始灰化） */
  alive: boolean;
}

// ─── 视觉事件（visual_event 用）───────────────
export interface VisualEventData {
  type: 'shockwave_trigger' | 'firewall_spawn' | 'hive_sting' | 'burst_trigger' | 'hit';
  playerId?: string;
  weaponId?: string;
  x?: number; y?: number;
  isBurst?: boolean;
  tx?: number; ty?: number;
}

// ─── 游戏统计（game_end 用）───────────────
export interface PlayerStats {
  remainingHp: number;
  totalDamage: number;
  maxHit: number;
  weaponTriggers: number;
  bursts: number;
  /** 是否存活到最后 */
  survived: boolean;
}

// ─── 后端 → 前端消息 ────────────────────────────────
export interface ServerToClientMessages {
  battle_start: {
    weaponPool: WeaponMeta[];
    countdown: number;
    players: PlayerSpawnInfo[];
  };
  weapon_confirmed: {
    weaponId: string;
    weaponName: string;
  };
  round_start: {
    duration: number;
    players: Array<{ id: string; weaponId: string }>;
  };
  round_timer: {
    remaining: number;
  };
  game_state: {
    players: GameStatePlayer[];
    tick: number;
    timestamp: number;
  };
  visual_event: VisualEventData;
  game_end: {
    winnerId: string;
    winnerName: string;
    reason: 'hp_zero' | 'timeout' | 'last_stand';
    stats: Record<string, PlayerStats>;
  };
}

// ─── 前端 → 后端消息 ────────────────────────────────
export interface ClientToServerMessages {
  select_weapon: {
    weaponId: string;
  };
}
