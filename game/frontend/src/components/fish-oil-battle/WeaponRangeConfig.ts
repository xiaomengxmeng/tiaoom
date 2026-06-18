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
}

export interface WeaponProjectileConfig {
  speed: number;
  maxBounces: number;
  maxLifetimeSec: number;
  hitRadius: number;
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
  baseBounces?: number;
  burstWaves?: number;
  burstBounces?: number;
  maxHitsPerWave?: number;
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
