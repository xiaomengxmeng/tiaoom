/**
 * 角色武器预设色板
 * - 12 个角色武器各 1 套 6 色 Palette
 * - 完全脱离头像 themeColor，由 CyberFishRenderer 查表传入子渲染器
 * - 设计依据：游戏设计文档/分角色联动文档/*.md + 各渲染器已有颜色常量
 * - 色值格式：0xRRGGBB
 */
import { WeaponId } from '$/backend/src/games/fish-oil-battle/config/GameEnums';
import type { Palette } from './BaseWeaponEffectRenderer';

export const WEAPON_PALETTES: Partial<Record<WeaponId, Palette>> = {
  // ── 1. OPTICAL_SLASH — Liya 光学斩击 ──
  [WeaponId.OPTICAL_SLASH]: {
    primary: 0x0099FF,
    glow: 0x66CCFF,
    highlight: 0xAAEEFF,
    dim: 0x003388,
    shadow: 0x001A44,
    accent: 0xFFD700,
  },

  // ── 2. AIR_REPULSION_FIELD — 开摆 空气斥力场 ──
  [WeaponId.AIR_REPULSION_FIELD]: {
    primary: 0xFFCC44,
    glow: 0xFFEE88,
    highlight: 0xFFFFCC,
    dim: 0xCC8800,
    shadow: 0x664400,
    accent: 0xFF6622,
  },

  // ── 3. ENTROPIC_TOUCH — 闲乘月 熵寂之触 ──
  [WeaponId.ENTROPIC_TOUCH]: {
    primary: 0x88DDFF,
    glow: 0xAAFFFF,
    highlight: 0xFFFFFF,
    dim: 0x9966FF,
    shadow: 0x6600CC,
    accent: 0xFF3333,
  },

  // ── 4. DRAWING_MANIFEST — 白猫 画作实体化 ──
  [WeaponId.DRAWING_MANIFEST]: {
    primary: 0x8B4D9F,
    glow: 0xD4A5DD,
    highlight: 0xF5E1F5,
    dim: 0x4A2C5A,
    shadow: 0x2A1830,
    accent: 0xFFB3D9,
  },

  // ── 5. DISCHARGE_CAT — 小金喵 放电猫猫 ──
  [WeaponId.DISCHARGE_CAT]: {
    primary: 0x00BBFF,
    glow: 0x66EEFF,
    highlight: 0xFFFFFF,
    dim: 0x0044AA,
    shadow: 0x002255,
    accent: 0xFFCC00,
  },

  // ── 6. PRECOGNITIVE_LENS — 风随 预知透镜 ──
  [WeaponId.PRECOGNITIVE_LENS]: {
    primary: 0x4DA6FF,
    glow: 0xA0D8FF,
    highlight: 0xFFFFFF,
    dim: 0x1A4480,
    shadow: 0x0A2244,
    accent: 0xFFD700,
  },

  // ── 7. EMOTIONAL_WEATHER — Carzeye 情绪天气 ──
  [WeaponId.EMOTIONAL_WEATHER]: {
    primary: 0xAAEEFF,
    glow: 0xFFFFFF,
    highlight: 0xE0F7FF,
    dim: 0x4DA6FF,
    shadow: 0x223355,
    accent: 0xFF8800,
  },

  // ── 8. EMOTION_MASTERY — 林澈 情绪掌控 ──
  [WeaponId.EMOTION_MASTERY]: {
    primary: 0xFF3333,
    glow: 0xFF7777,
    highlight: 0xFFBBBB,
    dim: 0x992222,
    shadow: 0x440000,
    accent: 0x4488FF,
  },

  // ── 9. FLUID_MASTERY — KE 流体操控 ──
  [WeaponId.FLUID_MASTERY]: {
    primary: 0x0099FF,
    glow: 0x66CCFF,
    highlight: 0xAAEEFF,
    dim: 0x0044AA,
    shadow: 0x002255,
    accent: 0xCC2200,
  },

  // ── 10. MEMORY_CORRIDOR — 梦 记忆回廊 ──
  [WeaponId.MEMORY_CORRIDOR]: {
    primary: 0xC9A961,
    glow: 0xE0D4A0,
    highlight: 0xF5EFDC,
    dim: 0x8B7340,
    shadow: 0x4A3A20,
    accent: 0x6633CC,
  },

  // ── 11. INFINITE_FOLD — 陈厌孑 无限折叠 ──
  [WeaponId.INFINITE_FOLD]: {
    primary: 0x6633CC,
    glow: 0x9966FF,
    highlight: 0xCC99FF,
    dim: 0x1A1A2E,
    shadow: 0x000000,
    accent: 0xFFD700,
  },

  // ── 12. BOTANICAL_CONTROL — 沐里 植物伙伴派对 ──
  [WeaponId.BOTANICAL_CONTROL]: {
    primary: 0x44AA22,
    glow: 0x88DD44,
    highlight: 0xBBFF88,
    dim: 0x1A3A0A,
    shadow: 0x0A1F05,
    accent: 0xFFB3D9,
  },
};

/**
 * 查询武器预设色板
 * @param weaponId 武器 ID
 * @returns Palette 或 undefined（基础武器或未配置武器返回 undefined，回退到 buildPalette）
 */
export function getWeaponPalette(weaponId: WeaponId): Palette | undefined {
  return WEAPON_PALETTES[weaponId];
}
