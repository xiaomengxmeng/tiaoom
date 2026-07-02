/**
 * 前端本地武器配置表（开发友好）
 *
 * 作用：
 * 1. 开发时快速迭代（无需后端亦可查看特效效果）
 * 2. 作为后端配置的默认值/兜底
 * 3. 游戏运行时后端推送的 durationSec 等字段会覆盖此处
 *
 * 原则：后端数据为权威来源（Single Source of Truth）
 *       前端本地配置仅作开发和离线兜底
 */

import { WeaponId } from '$/backend/src/games/fish-oil-battle/config/GameEnums';

// ══════════════════════════════════════════════════════
//  接口定义（与后端保持一致）
// ══════════════════════════════════════════════════════

export interface WeaponFieldConfig {
  maxCount: number;
  durationSec: number;
  radius: number;
  hexRadius?: number;
  width?: number;
  height?: number;
  visualWidth?: number;
  visualHeight?: number;
  contactDamage?: number;
  slowPercent?: number;
  damagePerEnergy?: number;
  burstHardenDamage?: number;
  /** 每层冻伤减速百分比（0-100），熵寂之触专用 */
  frostbiteSlowPerStack?: number;
  /** 每层冻伤每秒伤害，熵寂之触专用 */
  frostbiteDamagePerStack?: number;
}

export interface WeaponProjectileConfig {
  speed: number;
  maxBounces: number;
  maxLifetimeSec: number;
  hitRadius: number;
  visualFlightSpeed?: number;
  visualArcBow?: number;
  visualBladeHalfWidth?: number;
  /** 斩击命中角度容差（rad），光学斩击专用，默认 0.1 */
  slashAngleTolerance?: number;
}

export interface WeaponTriggerCooldowns {
  /** onHitTarget 冷却时间（秒），0 或不填 = 无限制 */
  hitTargetSec?: number;
  /** onHitByAttacker 冷却时间（秒），0 或不填 = 无限制 */
  hitByAttackerSec?: number;
  /** onWallHit 冷却时间（秒），0 或不填 = 无限制 */
  wallHitSec?: number;
}

export interface WeaponRangeConfig {
  damageRadius?: number;
  aoeMaxRadius?: number;
  hitRadius?: number;
  visualRadius?: number;
  visualSpeed?: number;
  visualDurationMs?: number;
  projectile?: WeaponProjectileConfig;
  field?: WeaponFieldConfig;
  damage?: number;
  burstDamage?: number;
  maxEnergy?: number;
  burstDurationSec?: number;
  /** 电弧链接持续时长（秒，放电猫猫专用） */
  arcDurationSec?: number;
  /** 伤害间隔时间（秒，放电猫猫专用） */
  damageIntervalSec?: number;
  baseBounces?: number;
  burstWaves?: number;
  burstBounces?: number;
  maxHitsPerWave?: number;
  /** 触发冷却配置（数据驱动，防止极端连击） */
  triggerCooldowns?: WeaponTriggerCooldowns;
  /** 爆发浮动环绕半径（光学斩击专用） */
  burstFloatRadius?: number;
  /** 爆发浮动持续时间（毫秒，光学斩击专用） */
  burstFloatDurationMs?: number;
  /** 爆发突进飞行时间（毫秒，光学斩击专用） */
  burstDashDurationMs?: number;
  /** 爆发逐刀发射间隔（毫秒，光学斩击专用） */
  burstStaggerGapMs?: number;
  /** 爆发同敌人多刀衰减系数（光学斩击专用） */
  burstDecayPerHit?: number;
}

// ══════════════════════════════════════════════════════
//  本地配置表（与后端 WeaponRangeConfig.ts 对齐）
// ══════════════════════════════════════════════════════

export const LOCAL_WEAPON_CONFIG: Record<string, WeaponRangeConfig> = {
  // ── 冲击波发生器 ─────────────────────────────────
  [WeaponId.SHOCKWAVE_GENERATOR]: {
    damageRadius: 200,
    aoeMaxRadius: 200,
    visualRadius: 200,
    visualSpeed: 400,
    visualDurationMs: 800,
    damage: 6,
    burstDamage: 10,
    maxEnergy: 4,
    baseBounces: 1,
    burstWaves: 3,
    burstBounces: 2,
    maxHitsPerWave: 2,
    triggerCooldowns: {
      hitTargetSec: 0.5,
    },
  },

  // ── 防火墙协议 ───────────────────────────────────
  [WeaponId.FIREWALL_PROTOCOL]: {
    damageRadius: 80,
    visualRadius: 80,
    maxEnergy: 4,
    burstDurationSec: 8,
    field: {
      maxCount: 3,
      durationSec: 18,        // ★ 防火墙持续 18 秒（前端特效以此为基准）
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
      hitByAttackerSec: 0.5,
    },
  },

  // ── 光学斩击 (Liya) ──────────────────────────────
  [WeaponId.OPTICAL_SLASH]: {
    damage: 5,
    burstDamage: 10,
    maxEnergy: 6,
    damageRadius: 100,
    visualRadius: 150,
    visualDurationMs: 800,
    burstFloatRadius: 60,        // 浮动环绕半径
    burstFloatDurationMs: 800,   // 浮动持续时间
    burstDashDurationMs: 400,    // 突进飞行时间
    burstStaggerGapMs: 133,     // 逐刀发射间隔
    burstDecayPerHit: 0.5,       // 同敌人多刀衰减系数
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
      hitTargetSec: 0.3,
    },
  },

  // ── 熵寂之触 - 闲乘月 ──────────────────────────
  [WeaponId.ENTROPIC_TOUCH]: {
    damage: 0,
    burstDamage: 10,
    maxEnergy: 6,
    damageRadius: 50,
    aoeMaxRadius: 200,
    burstDurationSec: 5,
    visualRadius: 200,
    visualDurationMs: 5000,
    field: {
      maxCount: 3,
      durationSec: 5,
      radius: 50,
      slowPercent: 8,
      frostbiteSlowPerStack: 10,
      frostbiteDamagePerStack: 2,
    },
    triggerCooldowns: {
      hitByAttackerSec: 0.5,
    },
  },

  // ── 空气斥力场 - 开摆 ─────────────────────────────
  [WeaponId.AIR_REPULSION_FIELD]: {
    damage: 4,
    burstDamage: 6,
    maxEnergy: 6,
    damageRadius: 35,
    aoeMaxRadius: 180,
    burstDurationSec: 4,
    visualRadius: 180,
    visualDurationMs: 4000,
    field: {
      maxCount: 3,
      durationSec: 5,
      radius: 55,
      contactDamage: 4,
    },
    triggerCooldowns: {
      hitTargetSec: 0.5,
    },
  },

  // ── 蜂巢母体 ─────────────────────────────────────
  [WeaponId.HIVE_MOTHER]: {
    hitRadius: 30,
    visualRadius: 30,
    projectile: {
      speed: 300,
      maxBounces: 0,
      maxLifetimeSec: 4,
      hitRadius: 30,
    },
    triggerCooldowns: {
      hitByAttackerSec: 1.0,
    },
  },

  // ── 放电猫猫 - 小金喵 ──────────────────────
  [WeaponId.DISCHARGE_CAT]: {
    damage: 4,                 // 电弧总伤害（分 3 次造成：1 + 1 + 2）
    burstDamage: 8,            // 爆发电弧总伤害（分 3 次造成：2 + 2 + 4）
    maxEnergy: 6,              // 充能次数上限（爆发阈值）
    damageRadius: 120,         // 电弧判定范围
    visualRadius: 30,          // 放电猫虚影半径
    arcDurationSec: 1.5,      // 电弧链接持续时长（秒）
    damageIntervalSec: 0.5,   // 伤害间隔时间（秒）
    burstDurationSec: 4,
    field: {
      maxCount: 1,             // 放电猫实体（爆发时实体化）
      durationSec: 4,
      radius: 120,
      contactDamage: 8,
    },
    triggerCooldowns: {
      hitTargetSec: 0.5,       // 电弧触发限频
    },
  },
};

// ══════════════════════════════════════════════════════
//  运行时配置（后端推送后覆盖）
// ══════════════════════════════════════════════════════

let runtimeConfig: Record<string, WeaponRangeConfig> = { ...LOCAL_WEAPON_CONFIG };

/**
 * 更新运行时配置（后端推送时调用）
 */
export function updateWeaponConfig(partial: Record<string, Partial<WeaponRangeConfig>>): void {
  runtimeConfig = { ...runtimeConfig };
  for (const [key, value] of Object.entries(partial)) {
    runtimeConfig[key] = { ...runtimeConfig[key], ...value };
  }
  console.log('[Frontend Config] 武器配置已更新:', Object.keys(partial));
}

/**
 * 获取当前生效的武器配置（运行时 > 本地兜底）
 */
export function getWeaponConfig(weaponId: string): WeaponRangeConfig | undefined {
  return runtimeConfig[weaponId] ?? LOCAL_WEAPON_CONFIG[weaponId];
}

/**
 * 重置为本地配置（开发/测试用）
 */
export function resetToLocalConfig(): void {
  runtimeConfig = { ...LOCAL_WEAPON_CONFIG };
  console.log('[Frontend Config] 已重置为本地配置');
}
