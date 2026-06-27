/**
 * 赛博鱼油 · 武器范围与特效数据配置中心
 *
 * 数据驱动：所有武器的伤害范围、特效视觉范围、投射物参数、场地装置参数
 * 统一在此定义，前后端共享引用。
 *
 * 后端: import from '@/games/fish-oil-battle/config/WeaponRangeConfig'
 * 前端: import from '$/backend/src/games/fish-oil-battle/config/WeaponRangeConfig'
 */

import { WeaponId } from './GameEnums';

// ── 接口定义 ──────────────────────────────────────────

export interface WeaponProjectileConfig {
  /** 飞行速度（px/s） */
  speed: number;
  /** 最大碰墙反弹次数 */
  maxBounces: number;
  /** 最大存活时间（秒），防止无限飞行 */
  maxLifetimeSec: number;
  /** 命中判定半径（逻辑 px） */
  hitRadius: number;
  /** 视觉飞行速度（px/s），前端渲染用 */
  visualFlightSpeed?: number;
  /** 弧月弓弯距离（逻辑 px），飞行弹道武器视觉用 */
  visualArcBow?: number;
  /** 投射物视觉半宽（逻辑 px），飞行弹道武器视觉用 */
  visualBladeHalfWidth?: number;
  /** 斩击命中角度容差（rad），光学斩击专用，默认 0.1 */
  slashAngleTolerance?: number;
}

export interface WeaponFieldConfig {
  /** 场上最大数量 */
  maxCount: number;
  /** 存活时间（秒） */
  durationSec: number;
  /** 影响半径（逻辑 px） */
  radius: number;
  /** 视觉六边形半径（可 ≠ radius） */
  hexRadius?: number;
  /** 碰撞矩形宽度（逻辑 px） */
  width?: number;
  /** 碰撞矩形高度（逻辑 px） */
  height?: number;
  /** 视觉矩形宽度（逻辑 px） */
  visualWidth?: number;
  /** 视觉矩形高度（逻辑 px） */
  visualHeight?: number;
  /** 接触伤害（替代 DoT，对手进入范围时触发一次） */
  contactDamage?: number;
  /** 减速百分比（0-100） */
  slowPercent?: number;
  /** 每多少伤害充能 1 格 */
  damagePerEnergy?: number;
  /** 硬化碰墙伤害（每次碰撞） */
  burstHardenDamage?: number;
  /** 每层冻伤减速百分比（0-100），熵寂之触专用 */
  frostbiteSlowPerStack?: number;
  /** 每层冻伤每秒伤害，熵寂之触专用 */
  frostbiteDamagePerStack?: number;
  /** 标记伤害加成倍率（如预知透镜猎物标记，0.5 = +50%） */
  damageModifier?: number;
  /** 每跳间隔（毫秒），持续伤害/效果场使用 */
  tickIntervalMs?: number;
  /** 速度因子（0-1，最终速度 = 原速 × slowFactor），与 slowPercent 二选一 */
  slowFactor?: number;
}

/** 蜂巢母体专用数值配置 */
export interface HiveMotherConfig {
  /** 初始蜂数 */
  initialBeeCount: number;
  /** 最大蜂数 */
  maxBeeCount: number;
  /** 每只蜂独立发射冷却（秒） */
  stingerCooldownPerBee: number;
  /** 相邻两次蜂刺发射的全局间隔（秒） */
  stingerLaunchInterval: number;
  /** 蜂刺伤害 */
  stingerDamage: number;
  /** 爆发时额外增加的蜂数（永久） */
  burstBeeBonus: number;
  /** 爆发期间伤害 */
  burstDamage: number;
  /** 爆发持续时间（秒） */
  burstDurationSec: number;
  /** 充能满能量 */
  maxEnergy: number;
  /** 蜂群公转半径（逻辑 px） */
  orbitRadius?: number;
  /** 蜂刺判定球半径（逻辑 px） */
  ballRadius?: number;
}

/** 冲击波视觉参数（数据驱动，前后端共享） */
export interface ShockwaveVisualParams {
  /** 主环描边宽度（逻辑 px） */
  strokeWidth: number;
}

/** 武器触发冷却配置（数据驱动，防止极端条件下连续触发） */
export interface WeaponTriggerCooldowns {
  /** onHitTarget 冷却时间（秒），0 或不填 = 无限制 */
  hitTargetSec?: number;
  /** onHitByAttacker 冷却时间（秒），0 或不填 = 无限制 */
  hitByAttackerSec?: number;
  /** onWallHit 冷却时间（秒），0 或不填 = 无限制 */
  wallHitSec?: number;
  /** 最小触发间隔（毫秒），通用限频 */
  minIntervalMs?: number;
}

export interface WeaponRangeConfig {
  /** 主要伤害/效果作用半径（逻辑 px） */
  damageRadius?: number;
  /** AOE 扩散最大半径（如冲击波） */
  aoeMaxRadius?: number;
  /** 命中判定半径（如蜂刺） */
  hitRadius?: number;

  /** 主要特效视觉半径（逻辑 px），默认 = damageRadius */
  visualRadius?: number;
  /** 特效扩散速度（px/s，如冲击波） */
  visualSpeed?: number;
  /** 特效持续时间（ms），如冲击波扩散至最大半径的时间 */
  visualDurationMs?: number;

  /** 投射物参数 */
  projectile?: WeaponProjectileConfig;

  /** 场地装置参数 */
  field?: WeaponFieldConfig;

  /** 蜂巢母体专用配置 */
  hiveMother?: HiveMotherConfig;

  /** 冲击波视觉参数（数据驱动） */
  shockwaveVisual?: ShockwaveVisualParams;

  /** 触发冷却配置（数据驱动，防止极端连击） */
  triggerCooldowns?: WeaponTriggerCooldowns;

  /** 普通伤害（冲击波等） */
  damage?: number;
  /** 爆发伤害 */
  burstDamage?: number;
  /** 最大能量 */
  maxEnergy?: number;
  /** 爆发持续时间（秒） */
  burstDurationSec?: number;
  /** 爆发波数（冲击波） */
  burstWaves?: number;
  /** 单波最大命中数（冲击波） */
  maxHitsPerWave?: number;
  /** 每次命中获得能量 */
  energyPerHit?: number;
  /** 爆发期间每次命中获得能量 */
  energyPerBurstHit?: number;
  /** 爆发消耗能量 */
  burstEnergyCost?: number;
  /** 爆发冷却（毫秒） */
  cooldownMs?: number;
}

// ── 配置表 ──────────────────────────────────────────

export const WEAPON_RANGE_CONFIG: Record<string, WeaponRangeConfig> = {
  // ═══ 侵略者 Aggressor (#FF00FF) ═══════════════════

  /** 冲击波发生器 */
  [WeaponId.SHOCKWAVE_GENERATOR]: {
    damageRadius: 180,
    aoeMaxRadius: 180,
    visualRadius: 180,
    visualSpeed: 300,
    visualDurationMs: 1500,
    shockwaveVisual: {
      strokeWidth: 15,
    },
    damage: 6,
    burstDamage: 10,
    maxEnergy: 4,
    burstWaves: 3,
    maxHitsPerWave: 2,
    triggerCooldowns: {
      hitTargetSec: 0.5,   // 冲击波主伤害限频：每 0.5s 最多触发 1 次
    },
  },

  // ═══ 控制者 Controller (#00BFFF) ══════════════════

  /** 防火墙协议 */
  [WeaponId.FIREWALL_PROTOCOL]: {
    damageRadius: 80,
    visualRadius: 80,
    maxEnergy: 4,
    burstDurationSec: 8,
    field: {
      maxCount: 3,
      durationSec: 18,
      radius: 80,
      hexRadius: 16,
      width: 130,
      height: 45,
      visualWidth: 130,
      visualHeight: 45,
      contactDamage: 3,
      slowPercent: 40,
      damagePerEnergy: 15,
      burstHardenDamage: 4.2,
    },
    triggerCooldowns: {
      hitByAttackerSec: 0.5,   // 被击中充能限频
    },
  },

  // ═══ 工程师 Engineer (#39FF14) ═══════════════════

  /** 蜂巢母体 */
  [WeaponId.HIVE_MOTHER]: {
    hitRadius: 30,
    visualRadius: 30,
    projectile: {
      speed: 300,
      maxBounces: 0,
      maxLifetimeSec: 4,
      hitRadius: 30,
    },
    hiveMother: {
      initialBeeCount: 3,
      maxBeeCount: 6,
      stingerCooldownPerBee: 1.2,
      stingerLaunchInterval: 0.4,
      stingerDamage: 1,
      burstBeeBonus: 3,
      burstDamage: 2,
      burstDurationSec: 5,
      maxEnergy: 7,
      orbitRadius: 50,
      ballRadius: 40,
    },
    triggerCooldowns: {
      hitByAttackerSec: 1.0,   // 被击中充能限频（内部已有 0.4s 全局 CD，此为额外保险）
    },
  },

  // ── 角色武器 ──────────────────────────────────────

  // ── 扩展角色武器 ──────────────────────────────

  /** 空气斥力场 - 开摆 */
  [WeaponId.AIR_REPULSION_FIELD]: {
    damage: 4,
    burstDamage: 6,
    maxEnergy: 6,
    damageRadius: 35,           // 气罩半径
    aoeMaxRadius: 180,        // 爆发范围
    burstDurationSec: 4,
    visualRadius: 180,
    visualDurationMs: 4000,
    field: {
      maxCount: 3,             // 锚点上限
      durationSec: 5,           // 锚点持续 5 秒
      radius: 55,              // 锚点作用半径
      contactDamage: 4,         // 锚点接触伤害
    },
    triggerCooldowns: {
      hitTargetSec: 0.5,    // 碰撞生成锚点限频
    },
  },

  // ── 闲乘月 - 熵寂之触 ──────────────────────────
  [WeaponId.ENTROPIC_TOUCH]: {
    damage: 0,                   // 常驻无直接伤害
    burstDamage: 10,             // 爆发每秒伤害
    maxEnergy: 6,                // 冻伤伤害计数（6次 = 充能满）
    damageRadius: 50,            // 低温场半径
    aoeMaxRadius: 200,           // 爆发范围
    burstDurationSec: 5,
    visualRadius: 200,
    visualDurationMs: 5000,
    field: {
      maxCount: 3,               // 冻伤上限层数
      durationSec: 5,            // 冻伤持续 5 秒
      radius: 50,                // 低温场半径（同 damageRadius）
      slowPercent: 8,            // 每秒减速 8%
      frostbiteSlowPerStack: 10, // 每层冻伤减速 10%
      frostbiteDamagePerStack: 2, // 每层冻伤每秒伤害
    },
    triggerCooldowns: {
      hitByAttackerSec: 0.5,     // 受击加冻伤限频
    },
  },

  /** 光学斩击 - Liya */
  [WeaponId.OPTICAL_SLASH]: {
    damage: 5,
    burstDamage: 10,
    maxEnergy: 6,
    damageRadius: 100,
    visualRadius: 150,
    visualDurationMs: 800,
    projectile: {
      speed: 0,
      maxBounces: 0,
      maxLifetimeSec: 0.8,
      hitRadius: 4,
      visualFlightSpeed: 300,
      visualArcBow: 28,
      visualBladeHalfWidth: 20,
      slashAngleTolerance: 0.15,   // 斩击命中锥角 (rad)，100px处有效宽度≈30px
    },
    triggerCooldowns: {
      hitTargetSec: 0.3,   // 斩击限频：每 0.3s 最多触发 1 次（比冲击波快，因为是近战）
    },
  },

  // ── 白猫 - 画作实体化 ──────────────────────────
  [WeaponId.DRAWING_MANIFEST]: {
    damage: 2,                 // 小兔互撞伤害
    burstDamage: 12,           // 肌肉兔碰撞伤害
    maxEnergy: 6,              // 灵感墨水层数上限（爆发阈值）
    damageRadius: 20,          // 小兔判定半径
    aoeMaxRadius: 50,          // 肌肉兔巨大化半径
    burstDurationSec: 5,       // 肌肉兔持续 5 秒
    visualRadius: 50,
    visualDurationMs: 5000,
    projectile: {
      speed: 200,              // 肌肉兔冲刺速度
      maxBounces: 0,
      maxLifetimeSec: 1.5,     // 冲刺存活上限
      hitRadius: 20,           // 冲刺命中判定
    },
    triggerCooldowns: {
      hitTargetSec: 0.5,       // 小兔互撞伤害限频
      wallHitSec: 1.0,         // 撞墙触发冲刺 CD
    },
  },

  // ── 小金喵 - 放电猫猫 ──────────────────────────
  [WeaponId.DISCHARGE_CAT]: {
    damage: 4,                 // 电弧基础伤害
    burstDamage: 8,            // 爆发电弧伤害
    maxEnergy: 6,              // 弹射次数上限（爆发阈值）
    damageRadius: 120,         // 电弧判定范围
    visualRadius: 30,          // 放电猫虚影半径
    visualDurationMs: 4000,    // 爆发持续 4 秒
    burstDurationSec: 4,
    field: {
      maxCount: 1,             // 放电猫实体（爆发时实体化）
      durationSec: 4,
      radius: 120,             // 爆发电弧距离
      contactDamage: 8,
    },
    triggerCooldowns: {
      hitTargetSec: 0.5,       // 电弧触发限频
    },
  },

  // ── 风随 - 预知透镜 ──────────────────────────
  [WeaponId.PRECOGNITIVE_LENS]: {
    damage: 1,                 // 每层先见增加的碰撞伤害
    burstDamage: 14,           // 爆发回响伤害
    maxEnergy: 6,              // 先见层数上限（爆发阈值）
    damageRadius: 30,          // 回响命中判定
    visualRadius: 30,
    visualDurationMs: 2000,    // 回响持续 2 秒
    burstDurationSec: 4,       // 无限洞察持续 4 秒
    projectile: {
      speed: 500,              // 猫灵回响飞行速度
      maxBounces: 0,
      maxLifetimeSec: 2,       // 回响存活 2 秒
      hitRadius: 30,
    },
    field: {
      maxCount: 2,             // 场上最多 2 只回响（爆发 3 只）
      durationSec: 4,          // 猎物标记持续
      radius: 30,
      damageModifier: 0.5,     // 标记伤害加成 50%
    },
    triggerCooldowns: {
      wallHitSec: 0.3,         // 撞墙触发限频
    },
  },

  // ── 林澈 - 情绪掌控 ──────────────────────────
  [WeaponId.EMOTION_MASTERY]: {
    damage: 0,                   // 常驻无基础伤害（心境决定效果）
    burstDamage: 10,             // 愤怒恶魔碰撞伤害
    maxEnergy: 3,                // 3 种心境（完整轮转 = 充能满）
    damageRadius: 80,            // 情绪实体公转半径
    visualRadius: 80,
    visualDurationMs: 4000,      // 爆发持续 4 秒
    burstDurationSec: 4,
    field: {
      maxCount: 3,               // 三个情绪实体
      durationSec: 4,
      radius: 80,                // 实体公转半径
      contactDamage: 10,         // 愤怒恶魔碰撞伤害
      slowPercent: 20,           // 幸福老者减速
    },
    triggerCooldowns: {
      hitTargetSec: 0.3,         // 碰撞效果限频
    },
  },

  // ── Carzeye - 情绪天气 ──────────────────────────
  [WeaponId.EMOTIONAL_WEATHER]: {
    damage: 6,                 // 落雷伤害
    burstDamage: 4,            // 冰雹每颗伤害
    maxEnergy: 5,              // 落雷命中次数上限（爆发阈值）
    damageRadius: 40,          // 落雷判定半径
    aoeMaxRadius: 200,         // 爆发冰雹范围
    visualRadius: 40,
    visualDurationMs: 4000,    // 爆发持续 4 秒
    burstDurationSec: 4,
    field: {
      maxCount: 1,
      durationSec: 4,
      radius: 30,              // 冰雹每颗半径
      contactDamage: 4,
      slowPercent: 20,         // 冰雹减速
    },
    triggerCooldowns: {
      hitTargetSec: 1.5,       // 落雷 CD 1.5 秒
    },
  },

  // ═══ 联动角色武器扩展 ═════════════════════════

  // ── KE - 流体操控（水系流派）──────────────────
  [WeaponId.FLUID_MASTERY]: {
    damage: 2,                    // 普通伤害
    burstDamage: 15,              // 爆发伤害
    maxEnergy: 4,
    energyPerHit: 1,
    energyPerBurstHit: 1,
    burstEnergyCost: 4,
    damageRadius: 45,             // 水流尾迹影响半径
    aoeMaxRadius: 220,            // 水龙卷最大范围
    visualRadius: 45,
    visualDurationMs: 1500,       // 尾迹持续 1.5s
    burstDurationSec: 4,          // 爆发持续 4s
    cooldownMs: 6000,             // 爆发冷却 6s
    field: {
      maxCount: 1,                // 单一水流场
      radius: 45,
      durationSec: 3,
      tickIntervalMs: 500,
      slowFactor: 0.7,            // 水流减速（速度降至 70%）
    },
    triggerCooldowns: { minIntervalMs: 400 },
  },

  // ── 梦 - 记忆回廊（虚空系流派）────────────────
  [WeaponId.MEMORY_CORRIDOR]: {
    damage: 5,                    // 回响触碰伤害
    burstDamage: 8,               // 共振 AOE 伤害
    maxEnergy: 6,                 // 回响数量上限（同时也是爆发阈值）
    energyPerHit: 1,              // 每次碰撞生成 1 回响
    energyPerBurstHit: 1,         // 被击也 +1 回响
    burstEnergyCost: 6,           // 6 回响满触发
    damageRadius: 35,             // 回响判定半径
    aoeMaxRadius: 60,             // 爆发共振半径
    visualRadius: 35,
    visualDurationMs: 7000,       // 回响持续 7s
    burstDurationSec: 0.5,        // 共振持续半秒
    cooldownMs: 7000,
    field: {
      maxCount: 6,                // 最多 6 个回响
      durationSec: 7,             // 回响持续 7 秒
      radius: 35,
      contactDamage: 5,           // 回响触碰伤害
      slowPercent: 0,             // 无减速，仅拖拽
    },
    triggerCooldowns: { minIntervalMs: 500 },
  },

  // ── 陈厌孑 - 无限折叠（空间系流派）────────────
  [WeaponId.INFINITE_FOLD]: {
    damage: 0,                    // 常驻无直接伤害
    burstDamage: 18,              // 空间重组伤害
    maxEnergy: 6,                 // 标记总层数阈值（6 层自动触发）
    energyPerHit: 1,              // 每次碰撞 +1 层
    energyPerBurstHit: 1,         // 被击也 +1 层
    burstEnergyCost: 6,           // 6 层满触发
    damageRadius: 30,             // 折叠影响半径
    aoeMaxRadius: 200,            // 弹飞范围
    visualRadius: 30,
    visualDurationMs: 1200,       // 闪避特效 1.2s
    burstDurationSec: 5,          // 空间重组 5s
    cooldownMs: 5000,
    field: {
      maxCount: 3,                // 单目标标记上限 3 层
      radius: 30,
      durationSec: 6,             // 标记持续 6 秒
      contactDamage: 3,           // 每层附加伤害（3 层 +9）
      slowPercent: 4,             // 每层减速 4%（3 层 -12%）
    },
    triggerCooldowns: { minIntervalMs: 350 },
  },

  // ── 沐里 - 植物伙伴派对（植物伙伴流派）──────────
  [WeaponId.BOTANICAL_CONTROL]: {
    damage: 3,                    // 暴躁型每秒伤害
    burstDamage: 6,               // 爆发期暴躁型伤害翻倍
    maxEnergy: 100,
    energyPerHit: 25,             // 每次碰撞获得 25 能量
    burstEnergyCost: 100,
    damageRadius: 40,             // 植物影响半径
    aoeMaxRadius: 60,             // 爆发影响范围
    visualRadius: 40,
    visualDurationMs: 6000,       // 植物持续 6 秒
    burstDurationSec: 4,          // 爆发持续 4 秒
    cooldownMs: 8000,             // 爆发冷却
    field: {
      maxCount: 5,                // 最大 5 株
      durationSec: 6,
      radius: 40,
    },
    triggerCooldowns: { minIntervalMs: 500 }, // 生成冷却 0.5 秒
  },
};
