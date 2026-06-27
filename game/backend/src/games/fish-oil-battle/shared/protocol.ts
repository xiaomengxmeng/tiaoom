/**
 * 赛博鱼油 · 前后端共享消息协议
 *
 * 后端: import from './shared/protocol' (fish-oil-battle 内部)
 * 前端: import from '$/backend/src/games/fish-oil-battle/shared/protocol'
 *
 * 前后端都 import 这份类型，确保消息结构编译期一致。
 */

import { School, VisualEventType, GlobalEffectType, GameEndReason, WeaponId, ArenaShape } from '../config/GameEnums';

// ─── 竞技场配置（数据驱动，根据玩家数量动态调整）────────
export interface ArenaConfig {
  /** 逻辑坐标宽度 */
  width: number;
  /** 逻辑坐标高度 */
  height: number;
  /** 竞技场形状 */
  shape: ArenaShape;
  /** 圆形/六边形：外接圆半径（逻辑单位）；矩形时保留为参考值 */
  arenaRadius: number;
  /** 矩形：半宽（逻辑单位），圆形/六边形时等于 arenaRadius */
  arenaHalfW?: number;
  /** 矩形：半高（逻辑单位），圆形/六边形时等于 arenaRadius */
  arenaHalfH?: number;
  /** 小球碰撞半径（逻辑单位） */
  ballRadius: number;
  /** 墙壁霓虹主色（后端随机生成，保证所有玩家同步） */
  wallColor?: number;
}

// ─── 武器元信息 ────────────────────────────────────────────────
export interface WeaponMeta {
  id: string;
  name: string;
  faction: School;
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
  type: VisualEventType;
  playerId?: string;
  weaponId?: WeaponId;
  x?: number; y?: number;
  isBurst?: boolean;
  tx?: number; ty?: number;
  /** 特效/技能生效范围（逻辑 px），前端用此值绘特效 */
  radius?: number;
  /** 防火墙视觉宽度（逻辑 px） */
  visualWidth?: number;
  /** 防火墙视觉高度（逻辑 px） */
  visualHeight?: number;
  /** 场地装置持续时间（秒），前端同步用（如防火墙 18s） */
  durationSec?: number;
  /** 蜂巢母体：当前蜂数（受击减少 / 爆发增加时同步前端） */
  beeCount?: number;
  /** 特效视觉配置（颜色、持续时间等，由后端 WeaponRangeConfig 驱动） */
  effectConfig?: {
    /** 主色（覆盖主题色） */
    primaryColor?: number;
    /** 发光色 */
    glowColor?: number;
    /** 扩散持续时间（ms） */
    expandDurationMs?: number;
    /** 反弹色 */
    bounceColor?: number;
  };
  /** 光学斩击：斩击角度（弧度） */
  angle?: number;
  /** 光学斩击：斩击长度（逻辑 px） */
  length?: number;
  /**
   * 全局彩蛋效果类型（GLOBAL_EFFECT 事件专用）
   * @see GlobalEffectType
   */
  globalEffectType?: GlobalEffectType;
  /**
   * 全局效果的 targets 信息（万物亲和牵引线的对手 ID）
   */
  targetId?: string;
  /**
   * 全局效果持续时间（毫秒），如古今观察者闪白 100ms
   */
  durationMs?: number;
  /**
   * 空气斥力场锚点 ID（AIR_REPULSION_ANCHOR / AIR_REPULSION_BURST 事件专用）
   */
  anchorId?: string;
  /**
   * 熵寂之触：冻伤目标玩家 ID（ENTROPIC_TOUCH_FROSTBITE 事件专用）
   */
  frostbiteTargetId?: string;
  /**
   * 熵寂之触：当前冻伤层数（ENTROPIC_TOUCH_FROSTBITE 事件专用）
   */
  frostbiteStacks?: number;
  /**
   * 白猫：灵感墨水层数（DRAWING_MANIFEST_INK 事件专用）
   */
  inkStacks?: number;
  /**
   * 白猫：是否为肌肉兔形态（DRAWING_MANIFEST_INK/BURST 事件专用）
   */
  isMuscleRabbit?: boolean;
  /**
   * 白猫：小兔/肌肉兔位置 X（DRAWING_MANIFEST 事件专用）
   */
  rabbitX?: number;
  /**
   * 白猫：小兔/肌肉兔位置 Y（DRAWING_MANIFEST 事件专用）
   */
  rabbitY?: number;
  /**
   * 小金喵：电弧弹射次数（DISCHARGE_CAT_ARC 事件专用）
   */
  bounceCount?: number;
  /**
   * 小金喵：放电猫虚影位置 X
   */
  catX?: number;
  /**
   * 小金喵：放电猫虚影位置 Y
   */
  catY?: number;
  /**
   * 小金喵：电弧弹射链节点（DISCHARGE_CAT_ARC 事件专用）
   */
  arcNodes?: Array<{ x: number; y: number; targetId?: string }>;
  /**
   * 风随：先见层数（PRECOGNITIVE_LENS_FORESIGHT 事件专用）
   */
  foresightStacks?: number;
  /**
   * 风随：猫灵回响 ID（PRECOGNITIVE_LENS_ECHO 事件专用）
   */
  echoId?: string;
  /**
   * Carzeye：落雷颜色阶段 (0=蓝, 1=橙, 2=紫)
   */
  weatherPhase?: number;
  /**
   * Carzeye：落雷颜色（数值色值）
   */
  weatherColor?: number;
  /**
   * 林澈：当前心境 ('anger'|'bliss'|'happy')
   */
  currentMood?: string;
  /** KE：流体方向（弧度） */
  fluidFlowDir?: number;
  /** KE：水流尾迹长度 */
  fluidTrailLength?: number;
  /** KE：漩涡牵引力 */
  fluidPullForce?: number;
  /** KE：书生愤怒态（hp<30% 时触发，色系切换为深红） */
  isAngry?: boolean;
  /** 梦：记忆碎片ID */
  memoryShardId?: string;
  /** 梦：回响数量 */
  memoryEchoCount?: number;
  /** 梦：原始伤害值 */
  memoryOriginalDamage?: number;
  /** 梦：共振层数 */
  memoryResonanceStacks?: number;
  /** 陈厌孑：折叠层数 */
  foldLayer?: number;
  /** 陈厌孑：闪避是否成功 */
  foldDodgeSuccess?: boolean;
  /** 陈厌孑：折叠次数 */
  foldCount?: number;
  /** 陈厌孑：位移范围 */
  foldDisplacementRange?: number;
  /** 沐里：植物ID（BOTANICAL_PLANT_SPAWN/DECAY 事件专用） */
  botanicalPlantId?: string;
  /** 沐里：植物性格（gentle 温柔 / fierce 暴躁 / curious 好奇） */
  botanicalPersonality?: string;
  /** 沐里：植物数量（BOTANICAL_BURST 事件专用） */
  botanicalPlantCount?: number;
}

// ─── 游戏统计（game_end 用）───────────────
export interface PlayerStats {
  remainingHp: number;
  /** 受到的伤害总额 */
  totalDamageTaken: number;
  /** 造成的伤害总额 */
  totalDamageDealt: number;
  /** 单次最大伤害 */
  maxHit: number;
  /** 武器技能触发次数 */
  weaponTriggers: number;
  /** 爆发次数 */
  bursts: number;
  /** 击杀数 */
  kills: number;
  /** 死亡数 */
  deaths: number;
  /** 使用的武器 ID */
  weaponId: string;
  /** 存活时间（秒） */
  survivalTimeSec: number;
  /** 是否存活到最后 */
  survived: boolean;
}

// ─── 后端 → 前端消息 ────────────────────────────────
export interface ServerToClientMessages {
  battle_start: {
    weaponPool: WeaponMeta[];
    countdown: number;
    players: PlayerSpawnInfo[];
    /** 竞技场配置（根据人数动态计算） */
    arenaConfig: ArenaConfig;
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
    reason: GameEndReason;
    stats: Record<string, PlayerStats>;
  };
}

// ─── 前端 → 后端消息 ────────────────────────────────
export interface ClientToServerMessages {
  select_weapon: {
    weaponId: string;
  };
}
