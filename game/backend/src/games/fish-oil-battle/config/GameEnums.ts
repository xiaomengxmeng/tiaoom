/**
 * 游戏全局枚举 - 单一真相源
 * 统一管理所有硬编码字符串，禁止在业务代码中直接使用字符串字面量。
 */

// ── 武器 ID ──────────────────────────────────────
export enum WeaponId {
  // 侵略者 Aggressor
  SHOCKWAVE_GENERATOR = 'shockwave_generator',
  NANO_RIPPER = 'nano_ripper',
  PURSUIT_PROTOCOL = 'pursuit_protocol',
  // 控制者 Controller
  GRAVITY_WELL = 'gravity_well',
  FIREWALL_PROTOCOL = 'firewall_protocol',
  ENTROPY_DIFFUSER = 'entropy_diffuser',
  // 工程师 Engineer
  HIVE_MOTHER = 'hive_mother',
  BASTION_BUILDER = 'bastion_builder',
  CIRCUIT_WEAVER = 'circuit_weaver',
  // 变奏者 Wildcard
  QUANTUM_RIFT = 'quantum_rift',
  SIZE_WARP = 'size_warp',
  RICOCHET_CORE = 'ricochet_core',
}

// ── 武器名称 ─────────────────────────────────────
export enum WeaponName {
  // 侵略者 Aggressor
  SHOCKWAVE_GENERATOR = '冲击波发生器',
  NANO_RIPPER = '纳米撕裂者',
  PURSUIT_PROTOCOL = '追猎协议',
  // 控制者 Controller
  GRAVITY_WELL = '重力阱',
  FIREWALL_PROTOCOL = '防火墙协议',
  ENTROPY_DIFFUSER = '熵增扩散器',
  // 工程师 Engineer
  HIVE_MOTHER = '蜂巢母体',
  BASTION_BUILDER = '堡垒构筑者',
  CIRCUIT_WEAVER = '电路编织者',
  // 变奏者 Wildcard
  QUANTUM_RIFT = '量子裂隙',
  SIZE_WARP = '体积扭曲',
  RICOCHET_CORE = '弹射核心',
}

// ── 流派 ─────────────────────────────────────────
export enum School {
  AGGRESSOR = 'aggressor',
  CONTROLLER = 'controller',
  ENGINEER = 'engineer',
  WILD = 'wildcard',
}

// ── 武器效果类型（合并 EffectType + WeaponEffectType）────────────────
export enum WeaponEffectType {
  DAMAGE = 'damage',
  AOE_DAMAGE = 'aoe_damage',
  BURST_DAMAGE = 'burst_damage',
  DOT = 'dot',
  SLOW = 'slow',
  SHIELD = 'shield',
  PULL = 'pull',
  PUSH = 'push',
  SPAWN_FIELD = 'spawn_field',
  SPAWN_PROJECTILE = 'spawn_projectile',
  SPAWN_FIREWALL = 'spawn_firewall',
  FIRE_STING = 'fire_sting',
  SHOCKWAVE = 'shockwave',
  VISUAL_ONLY = 'visual_only',
}

// ── 视觉事件类型（前后端共享）────────────────────
export enum VisualEventType {
  SHOCKWAVE_TRIGGER = 'shockwave_trigger',
  FIREWALL_SPAWN = 'firewall_spawn',
  HIVE_STING = 'hive_sting',
  HIVE_STING_FLIGHT = 'hive_sting_flight',
  HIVE_STING_HIT = 'hive_sting_hit',
  HIVE_STING_BOUNCE = 'hive_sting_bounce',
  BURST_TRIGGER = 'burst_trigger',
  BEE_COUNT_CHANGE = 'bee_count_change',
  HIT = 'hit',
  /** 全局彩蛋效果（前后端共享） */
  GLOBAL_EFFECT = 'global_effect',
}

// ── 全局彩蛋效果类型（前后端共享）────────────────
export enum GlobalEffectType {
  /** 无彩蛋 */
  NONE = 'none',
  /** 古今观察者（小梦）- 开局15秒回溯 */
  TIME_OBSERVER = 'time_observer',
  /** 俺寻思之力（薯饼）- 每10秒速度扰动 */
  RANDOM_FORCE = 'random_force',
  /** 万物亲和（君）- 牵引线 + 伤害/速度修正 */
  NATURE_BOND = 'nature_bond',
}

// ── 竞技场形状 ─────────────────────────────────
export enum ArenaShape {
  /** 圆形：参数 arenaRadius */
  CIRCLE = 'circle',
  /** 矩形：参数 arenaHalfW / arenaHalfH */
  RECT = 'rect',
  /** 正六边形：参数 arenaRadius（外接圆半径） */
  HEXAGON = 'hexagon',
}

// ── 游戏结束原因 ─────────────────────────────────
export enum GameEndReason {
  HP_ZERO = 'hp_zero',
  TIMEOUT = 'timeout',
  LAST_STAND = 'last_stand',
}

// ── 消息类型 ────────────────────────────────────
export enum MessageType {
  // Client → Server
  SELECT_WEAPON = 'select_weapon',
  USE_SKILL = 'use_skill',
  PLAYER_READY = 'player_ready',
  // Server → Client
  BATTLE_START = 'battle_start',
  BATTLE_END = 'battle_end',
  GAME_STATE_UPDATE = 'game_state_update',
  VISUAL_EVENT = 'visual_event',
  SKILL_COOLDOWN_UPDATE = 'skill_cooldown_update',
  WEAPON_SELECTED = 'weapon_selected',
}
