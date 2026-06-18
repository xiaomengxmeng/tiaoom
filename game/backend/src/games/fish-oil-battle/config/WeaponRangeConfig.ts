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

  /** 普通伤害（冲击波等） */
  damage?: number;
  /** 爆发伤害 */
  burstDamage?: number;
  /** 最大能量 */
  maxEnergy?: number;
  /** 爆发持续时间（秒） */
  burstDurationSec?: number;
  /** 普通反弹次数（冲击波） */
  baseBounces?: number;
  /** 爆发波数（冲击波） */
  burstWaves?: number;
  /** 爆发反弹次数（冲击波） */
  burstBounces?: number;
  /** 单波最大命中数（冲击波） */
  maxHitsPerWave?: number;
}

// ── 配置表 ──────────────────────────────────────────

export const WEAPON_RANGE_CONFIG: Record<string, WeaponRangeConfig> = {
  // ═══ 侵略者 Aggressor (#FF00FF) ═══════════════════

  /** 冲击波发生器 */
  [WeaponId.SHOCKWAVE_GENERATOR]: {
    damageRadius: 350,
    aoeMaxRadius: 350,
    visualRadius: 350,
    visualSpeed: 500,
    visualDurationMs: 1000,
    damage: 6,
    burstDamage: 10,
    maxEnergy: 4,
    baseBounces: 1,
    burstWaves: 3,
    burstBounces: 2,
    maxHitsPerWave: 2,
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
      hexRadius: 80,
      width: 100,
      height: 40,
      visualWidth: 100,
      visualHeight: 40,
      contactDamage: 3,
      slowPercent: 40,
      damagePerEnergy: 15,
      burstHardenDamage: 4.2,
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
  },
};
