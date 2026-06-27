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
  // ── 角色武器（按角色名命名）────────────────────
  OPTICAL_SLASH = 'optical_slash', // Liya - 光学斩击
  // 扩展角色武器
  AIR_REPULSION_FIELD = 'air_repulsion_field', // 开摆 - 空气斥力场
  ENTROPIC_TOUCH = 'entropic_touch', // 闲乘月 - 熵寂之触
  DRAWING_MANIFEST = 'drawing_manifest', // 白猫 - 画作实体化
  DISCHARGE_CAT = 'discharge_cat', // 小金喵 - 放电猫猫
  PRECOGNITIVE_LENS = 'precognitive_lens', // 风随 - 预知透镜
  EMOTIONAL_WEATHER = 'emotional_weather', // Carzeye - 情绪天气
  EMOTION_MASTERY = 'emotion_mastery', // 林澈 - 情绪掌控
  // ── 联动角色武器扩展 ─────────────────────────
  FLUID_MASTERY = 'fluid_mastery',         // KE - 流体操控
  MEMORY_CORRIDOR = 'memory_corridor',     // 梦 - 记忆回廊
  INFINITE_FOLD = 'infinite_fold',         // 陈厌孑 - 无限折叠
  BOTANICAL_CONTROL = 'botanical_control',  // 沐里 - 植物伙伴派对
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
  // ── 角色武器 ─────────────────────────────────
  OPTICAL_SLASH = '光学斩击', // Liya
  AIR_REPULSION_FIELD = '空气斥力场', // 开摆
  ENTROPIC_TOUCH = '熵寂之触', // 闲乘月
  DRAWING_MANIFEST = '画作实体化', // 白猫
  DISCHARGE_CAT = '放电猫猫', // 小金喵
  PRECOGNITIVE_LENS = '预知透镜', // 风随
  EMOTIONAL_WEATHER = '情绪天气', // Carzeye
  EMOTION_MASTERY = '情绪掌控', // 林澈
  // ── 联动角色武器扩展 ─────────────────────────
  FLUID_MASTERY = '流体操控', // KE
  MEMORY_CORRIDOR = '记忆回廊', // 梦
  INFINITE_FOLD = '无限折叠', // 陈厌孑
  BOTANICAL_CONTROL = '植物伙伴派对', // 沐里
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
  /** Liya - 光学斩击触发 */
  OPTICAL_SLASH_TRIGGER = 'optical_slash_trigger',
  /** Liya - 光学斩击爆发（无限剑制） */
  OPTICAL_SLASH_BURST = 'optical_slash_burst',
  /** 开摆 - 空气斥力场锚点生成 */
  AIR_REPULSION_ANCHOR = 'air_repulsion_anchor',
  /** 开摆 - 空气斥力场爆发（重力反转场） */
  AIR_REPULSION_BURST = 'air_repulsion_burst',
  /** 闲乘月 - 熵寂之触低温场 */
  ENTROPIC_TOUCH_AURA = 'entropic_touch_aura',
  /** 闲乘月 - 熵寂之触冻伤叠加 */
  ENTROPIC_TOUCH_FROSTBITE = 'entropic_touch_frostbite',
  /** 闲乘月 - 熵寂之触爆发（热力学奇点） */
  ENTROPIC_TOUCH_BURST = 'entropic_touch_burst',
  /** 白猫 - 画作实体化·灵感墨水（小兔跟随 + 层数同步） */
  DRAWING_MANIFEST_INK = 'drawing_manifest_ink',
  /** 白猫 - 画作实体化·肌肉兔降临（爆发巨大化） */
  DRAWING_MANIFEST_BURST = 'drawing_manifest_burst',
  /** 白猫 - 画作实体化·肌肉兔冲刺撞击 */
  DRAWING_MANIFEST_DASH = 'drawing_manifest_dash',
  /** 小金喵 - 放电猫猫·电弧（碰撞触发弹射） */
  DISCHARGE_CAT_ARC = 'discharge_cat_arc',
  /** 小金喵 - 放电猫猫·雷霆万钧爆发 */
  DISCHARGE_CAT_BURST = 'discharge_cat_burst',
  /** 风随 - 预知透镜·猫灵回响（投射物飞行） */
  PRECOGNITIVE_LENS_ECHO = 'precognitive_lens_echo',
  /** 风随 - 预知透镜·先见层数同步 */
  PRECOGNITIVE_LENS_FORESIGHT = 'precognitive_lens_foresight',
  /** 风随 - 预知透镜·无限洞察爆发 */
  PRECOGNITIVE_LENS_BURST = 'precognitive_lens_burst',
  /** Carzeye - 情绪天气·落雷 */
  EMOTIONAL_WEATHER_LIGHTNING = 'emotional_weather_lightning',
  /** Carzeye - 情绪天气·冰雹（爆发持续 AOE） */
  EMOTIONAL_WEATHER_HAIL = 'emotional_weather_hail',
  /** Carzeye - 情绪天气·极端气候爆发 */
  EMOTIONAL_WEATHER_BURST = 'emotional_weather_burst',
  /** 林澈 - 情绪掌控·心境轮转同步 */
  EMOTION_MASTERY_MOOD = 'emotion_mastery_mood',
  /** 林澈 - 情绪掌控·情绪实体化爆发 */
  EMOTION_MASTERY_BURST = 'emotion_mastery_burst',
  // ── 联动角色扩展 ───────────────────────────────
  /** KE - 流体操控·水流尾迹 */
  FLUID_MASTERY_TRAIL = 'fluid_mastery_trail',
  /** KE - 流体操控·漩涡牵引 */
  FLUID_MASTERY_VORTEX = 'fluid_mastery_vortex',
  /** KE - 流体操控·水龙卷爆发 */
  FLUID_MASTERY_BURST = 'fluid_mastery_burst',
  /** 梦 - 记忆回廊·回响FIFO */
  MEMORY_CORRIDOR_ECHO = 'memory_corridor_echo',
  /** 梦 - 记忆回廊·历史共振 */
  MEMORY_CORRIDOR_RESONANCE = 'memory_corridor_resonance',
  /** 梦 - 记忆回廊·记忆洪流爆发 */
  MEMORY_CORRIDOR_BURST = 'memory_corridor_burst',
  /** 陈厌孑 - 无限折叠·概率闪避 */
  INFINITE_FOLD_DODGE = 'infinite_fold_dodge',
  /** 陈厌孑 - 无限折叠·空间重组 */
  INFINITE_FOLD_REASSEMBLE = 'infinite_fold_reassemble',
  /** 陈厌孑 - 无限折叠·维度坍缩爆发 */
  INFINITE_FOLD_BURST = 'infinite_fold_burst',
  // 沐里 - 植物伙伴派对
  /** 沐里 - 植物生成 */
  BOTANICAL_PLANT_SPAWN = 'botanical_plant_spawn',
  /** 沐里 - 植物枯萎 */
  BOTANICAL_PLANT_DECAY = 'botanical_plant_decay',
  /** 沐里 - 植物派对爆发 */
  BOTANICAL_BURST = 'botanical_burst',
  /** 形状特效（一次性） */
  SHAPE_EFFECT = 'shape',
  /** 持续形状特效（常驻，需 sustainedKey） */
  SUSTAINED_SHAPE = 'sustained_shape',
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
