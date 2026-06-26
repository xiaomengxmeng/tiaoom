/**
 * 赛博鱼油 · 武器注册中心（工厂模式）
 *
 * 新增武器流程：
 * 1. 在 skills/weapons/ 下新建类，实现 IWeapon
 * 2. 在 REGISTRY 中注册一行
 * 3. 完成！核心系统代码零改动
 */

import type { IWeapon } from './IWeapon';
import { School, WeaponId, WeaponName } from '../config/GameEnums';
import { ShockwaveGeneratorWeapon } from '../skills/weapons/ShockwaveGeneratorWeapon';
import { FirewallProtocolWeapon } from '../skills/weapons/FirewallProtocolWeapon';
import { HiveMotherWeapon } from '../skills/weapons/HiveMotherWeapon';
import { OpticalSlashWeapon } from '../skills/weapons/OpticalSlashWeapon';
import { AirRepulsionFieldWeapon } from '../skills/weapons/AirRepulsionFieldWeapon';
import { EntropicTouchWeapon } from '../skills/weapons/EntropicTouchWeapon';
import { DrawingManifestWeapon } from '../skills/weapons/DrawingManifestWeapon';
import { DischargeCatWeapon } from '../skills/weapons/DischargeCatWeapon';
import { PrecognitiveLensWeapon } from '../skills/weapons/PrecognitiveLensWeapon';
import { EmotionalWeatherWeapon } from '../skills/weapons/EmotionalWeatherWeapon';
import { EmotionMasteryWeapon } from '../skills/weapons/EmotionMasteryWeapon';

// ── 武器元信息（工厂模式） ──────────────────────────────────
export interface WeaponEntry {
  id: WeaponId;
  name: string;
  school: School;
  difficulty: number;
  iconId: string;
  factory: () => IWeapon;
}

// ── 占位武器（未实现的武器用此桩） ──────────────────────
import type { IBattleState } from './types';
import type { WeaponEffect, WeaponRuntimeState, IPhysicsQuery } from './IWeapon';

export class StubWeapon implements IWeapon {
  playerId = '';
  constructor(
    readonly id: WeaponId,
    readonly name: string,
    readonly school: School,
    readonly difficulty: number,
    readonly iconId: string,
  ) {}

  onTick(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] { return []; }
  onHitTarget(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] { return []; }
  onHitByAttacker(_attackerId: string, _state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] { return []; }
  getEnergy(): number { return 0; }
  getMaxEnergy(): number { return 100; }
  isBurstReady(): boolean { return false; }
  burst(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] { return []; }
  getRuntimeState(): WeaponRuntimeState {
    return { energy: 0, maxEnergy: 100, cooldowns: {}, stacks: {}, flags: {} };
  }
  reset(): void {}
}

// ── 武器注册表 ────────────────────────────────────────────
export const REGISTRY: Record<string, WeaponEntry> = {
  // ── 侵略者 Aggressor (#FF00FF) ──────────────────
  [WeaponId.SHOCKWAVE_GENERATOR]: {
    id: WeaponId.SHOCKWAVE_GENERATOR, name: WeaponName.SHOCKWAVE_GENERATOR,
    school: School.AGGRESSOR, difficulty: 2, iconId: 'game-icons:lightning-dome',
    factory: () => new ShockwaveGeneratorWeapon(),
  },
  [WeaponId.NANO_RIPPER]: {
    id: WeaponId.NANO_RIPPER, name: WeaponName.NANO_RIPPER,
    school: School.AGGRESSOR, difficulty: 1, iconId: 'game-icons:nano-ripper',
    factory: () => new StubWeapon(WeaponId.NANO_RIPPER, WeaponName.NANO_RIPPER, School.AGGRESSOR, 1, 'game-icons:nano-ripper'),
  },
  [WeaponId.PURSUIT_PROTOCOL]: {
    id: WeaponId.PURSUIT_PROTOCOL, name: WeaponName.PURSUIT_PROTOCOL,
    school: School.AGGRESSOR, difficulty: 2, iconId: 'game-icons:pursuit',
    factory: () => new StubWeapon(WeaponId.PURSUIT_PROTOCOL, WeaponName.PURSUIT_PROTOCOL, School.AGGRESSOR, 2, 'game-icons:pursuit'),
  },

  // ── 控制者 Controller (#00BFFF) ─────────────────
  [WeaponId.GRAVITY_WELL]: {
    id: WeaponId.GRAVITY_WELL, name: WeaponName.GRAVITY_WELL,
    school: School.CONTROLLER, difficulty: 2, iconId: 'game-icons:gravity-well',
    factory: () => new StubWeapon(WeaponId.GRAVITY_WELL, WeaponName.GRAVITY_WELL, School.CONTROLLER, 2, 'game-icons:gravity-well'),
  },
  [WeaponId.FIREWALL_PROTOCOL]: {
    id: WeaponId.FIREWALL_PROTOCOL, name: WeaponName.FIREWALL_PROTOCOL,
    school: School.CONTROLLER, difficulty: 1, iconId: 'game-icons:firewall',
    factory: () => new FirewallProtocolWeapon(),
  },
  [WeaponId.ENTROPY_DIFFUSER]: {
    id: WeaponId.ENTROPY_DIFFUSER, name: WeaponName.ENTROPY_DIFFUSER,
    school: School.CONTROLLER, difficulty: 3, iconId: 'game-icons:entropy',
    factory: () => new StubWeapon(WeaponId.ENTROPY_DIFFUSER, WeaponName.ENTROPY_DIFFUSER, School.CONTROLLER, 3, 'game-icons:entropy'),
  },

  // ── 工程师 Engineer (#39FF14) ───────────────────
  [WeaponId.HIVE_MOTHER]: {
    id: WeaponId.HIVE_MOTHER, name: WeaponName.HIVE_MOTHER,
    school: School.ENGINEER, difficulty: 2, iconId: 'game-icons:hive-mind',
    factory: () => new HiveMotherWeapon(),
  },
  [WeaponId.BASTION_BUILDER]: {
    id: WeaponId.BASTION_BUILDER, name: WeaponName.BASTION_BUILDER,
    school: School.ENGINEER, difficulty: 3, iconId: 'game-icons:bastion',
    factory: () => new StubWeapon(WeaponId.BASTION_BUILDER, WeaponName.BASTION_BUILDER, School.ENGINEER, 3, 'game-icons:bastion'),
  },
  [WeaponId.CIRCUIT_WEAVER]: {
    id: WeaponId.CIRCUIT_WEAVER, name: WeaponName.CIRCUIT_WEAVER,
    school: School.ENGINEER, difficulty: 3, iconId: 'game-icons:circuit',
    factory: () => new StubWeapon(WeaponId.CIRCUIT_WEAVER, WeaponName.CIRCUIT_WEAVER, School.ENGINEER, 3, 'game-icons:circuit'),
  },

  // ── 变奏者 Wildcard (#FFD700) ───────────────────
  [WeaponId.QUANTUM_RIFT]: {
    id: WeaponId.QUANTUM_RIFT, name: WeaponName.QUANTUM_RIFT,
    school: School.WILD, difficulty: 3, iconId: 'game-icons:quantum-rift',
    factory: () => new StubWeapon(WeaponId.QUANTUM_RIFT, WeaponName.QUANTUM_RIFT, School.WILD, 3, 'game-icons:quantum-rift'),
  },
  [WeaponId.SIZE_WARP]: {
    id: WeaponId.SIZE_WARP, name: WeaponName.SIZE_WARP,
    school: School.WILD, difficulty: 1, iconId: 'game-icons:size-warp',
    factory: () => new StubWeapon(WeaponId.SIZE_WARP, WeaponName.SIZE_WARP, School.WILD, 1, 'game-icons:size-warp'),
  },
  [WeaponId.RICOCHET_CORE]: {
    id: WeaponId.RICOCHET_CORE, name: WeaponName.RICOCHET_CORE,
    school: School.WILD, difficulty: 2, iconId: 'game-icons:ricochet',
    factory: () => new StubWeapon(WeaponId.RICOCHET_CORE, WeaponName.RICOCHET_CORE, School.WILD, 2, 'game-icons:ricochet'),
  },

  // ── 角色武器 ──────────────────────────────────────
  [WeaponId.OPTICAL_SLASH]: {
    id: WeaponId.OPTICAL_SLASH, name: WeaponName.OPTICAL_SLASH,
    school: School.AGGRESSOR, difficulty: 2, iconId: 'game-icons:sword-cut',
    factory: () => new OpticalSlashWeapon(),
  },
  // ── 扩展角色武器 ──────────────────────────────
  [WeaponId.AIR_REPULSION_FIELD]: {
    id: WeaponId.AIR_REPULSION_FIELD, name: WeaponName.AIR_REPULSION_FIELD,
    school: School.WILD, difficulty: 1, iconId: 'game-icons:air-repulsion',
    factory: () => new AirRepulsionFieldWeapon(),
  },
  // ── 闲乘月 - 熵寂之触 ──────────────────────────
  [WeaponId.ENTROPIC_TOUCH]: {
    id: WeaponId.ENTROPIC_TOUCH,
    name: WeaponName.ENTROPIC_TOUCH,
    school: School.WILD,
    difficulty: 2,
    iconId: 'game-icons:entropy-touch',
    factory: () => new EntropicTouchWeapon(),
  },
  // ── 白猫 - 画作实体化 ──────────────────────────
  [WeaponId.DRAWING_MANIFEST]: {
    id: WeaponId.DRAWING_MANIFEST,
    name: WeaponName.DRAWING_MANIFEST,
    school: School.WILD,
    difficulty: 2,
    iconId: 'game-icons:rabbit',
    factory: () => new DrawingManifestWeapon(),
  },
  // ── 小金喵 - 放电猫猫 ──────────────────────────
  [WeaponId.DISCHARGE_CAT]: {
    id: WeaponId.DISCHARGE_CAT,
    name: WeaponName.DISCHARGE_CAT,
    school: School.WILD,
    difficulty: 2,
    iconId: 'game-icons:cat',
    factory: () => new DischargeCatWeapon(),
  },
  // ── 风随 - 预知透镜 ──────────────────────────
  [WeaponId.PRECOGNITIVE_LENS]: {
    id: WeaponId.PRECOGNITIVE_LENS,
    name: WeaponName.PRECOGNITIVE_LENS,
    school: School.WILD,
    difficulty: 3,
    iconId: 'game-icons:eye',
    factory: () => new PrecognitiveLensWeapon(),
  },
  // ── Carzeye - 情绪天气 ──────────────────────────
  [WeaponId.EMOTIONAL_WEATHER]: {
    id: WeaponId.EMOTIONAL_WEATHER,
    name: WeaponName.EMOTIONAL_WEATHER,
    school: School.WILD,
    difficulty: 2,
    iconId: 'game-icons:lightning-storm',
    factory: () => new EmotionalWeatherWeapon(),
  },
  // ── 林澈 - 情绪掌控 ──────────────────────────
  [WeaponId.EMOTION_MASTERY]: {
    id: WeaponId.EMOTION_MASTERY,
    name: WeaponName.EMOTION_MASTERY,
    school: School.WILD,
    difficulty: 2,
    iconId: 'game-icons:sparkles',
    factory: () => new EmotionMasteryWeapon(),
  },
};

export type WeaponIdType = WeaponId;

/** 根据 ID 创建武器实例 */
export function createWeapon(id: string): IWeapon {
  const entry = REGISTRY[id];
  if (!entry) throw new Error(`Unknown weapon: ${id}`);
  return entry.factory();
}

/** 获取武器元信息（前端武器选择界面用） */
export function getWeaponMetaList(): Array<{
  id: string; name: string; school: School; difficulty: number; iconId: string;
}> {
  return Object.values(REGISTRY).map(({ id, name, school, difficulty, iconId }) => ({
    id, name, school, difficulty, iconId,
  }));
}

/** 获取已实现的武器元信息（排除 StubWeapon 占位武器） */
export function getImplementedWeaponMetaList(): Array<{
  id: string; name: string; school: School; difficulty: number; iconId: string;
}> {
  return Object.values(REGISTRY)
    .filter(({ factory }) => !(factory() instanceof StubWeapon))
    .map(({ id, name, school, difficulty, iconId }) => ({
      id, name, school, difficulty, iconId,
    }));
}
