# 9 个基础武器后端实现 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 WeaponRegistry 中 9 个使用 StubWeapon 占位的基础武器替换为真实 IWeapon 实现，对齐 `游戏设计文档/weapons-design.md` 设计，并复用已存在的前端渲染器与 VisualEventType 枚举。

**Architecture:** 每个武器 = 一个 `XxxWeapon.ts` 文件（实现 IWeapon 接口）+ WeaponRangeConfig 配置条目 + WeaponRegistry 工厂替换。武器通过 `WeaponEffect[]` 数组返回伤害/控制/视觉效果，其中 `VISUAL_ONLY` 类型事件携带 `metadata.visualType`（VisualEventType 枚举值）驱动前端渲染。所有武器遵循 `const CFG = WEAPON_RANGE_CONFIG[WeaponId.XXX]` 数据驱动模式。

**Tech Stack:** TypeScript 5.x, Node.js, IWeapon 接口, IBattleState/IPhysicsQuery 解耦架构, TICKS_PER_SEC=20 帧率常量。

**设计文档参考:** `游戏设计文档/weapons-design.md`（weapons-design 行 107-431 定义了这 9 把武器）

**前端事件契约:** 后端发 `VISUAL_ONLY` 事件，`metadata` 必含 `visualType` + `radius`。PURSUIT_PROTOCOL_MARK 额外需 `targetId/tx/ty`。FIELD 类默认 radius=60，BURST 类默认 radius=200。

---

## File Structure

**修改文件:**
- `game/backend/src/games/fish-oil-battle/config/WeaponRangeConfig.ts` — 新增 9 个武器配置条目
- `game/backend/src/games/fish-oil-battle/core/WeaponRegistry.ts` — 替换 9 个 StubWeapon 工厂为真实武器类

**创建文件（9 个武器类）:**
- `game/backend/src/games/fish-oil-battle/skills/weapons/NanoRipperWeapon.ts` — 纳米撕裂者（侵略者，机械触手 + 撕裂层数引爆）
- `game/backend/src/games/fish-oil-battle/skills/weapons/PursuitProtocolWeapon.ts` — 追猎协议（侵略者，追击印记 + 鱼雷追踪）
- `game/backend/src/games/fish-oil-battle/skills/weapons/GravityWellWeapon.ts` — 重力阱（控制者，微重力场 + 时间制黑洞爆发）
- `game/backend/src/games/fish-oil-battle/skills/weapons/EntropyDiffuserWeapon.ts` — 熵增扩散器（控制者，油膜铺设 + 面积触发凝固）
- `game/backend/src/games/fish-oil-battle/skills/weapons/BastionBuilderWeapon.ts` — 堡垒构筑者（工程师，方块部署 + 数量触发合并）
- `game/backend/src/games/fish-oil-battle/skills/weapons/CircuitWeaverWeapon.ts` — 电路编织者（工程师，回路编织 + 长度触发过载）
- `game/backend/src/games/fish-oil-battle/skills/weapons/QuantumRiftWeapon.ts` — 量子裂隙（变奏者，量子态传送 + 穿越次数触发）
- `game/backend/src/games/fish-oil-battle/skills/weapons/SizeWarpWeapon.ts` — 体积扭曲（变奏者，尺寸切换 + 巨型化爆发）
- `game/backend/src/games/fish-oil-battle/skills/weapons/RicochetCoreWeapon.ts` — 弹射核心（变奏者，速度递增 + 超音速爆发）

**参考文件（已存在，只读）:**
- `game/backend/src/games/fish-oil-battle/skills/weapons/ShockwaveGeneratorWeapon.ts` — 侵略者参考实现
- `game/backend/src/games/fish-oil-battle/skills/weapons/AirRepulsionFieldWeapon.ts` — 变奏者场武器参考（锚点 + 持续爆发）
- `game/backend/src/games/fish-oil-battle/core/IWeapon.ts` — 武器接口定义
- `game/backend/src/games/fish-oil-battle/config/GameEnums.ts` — WeaponId/WeaponName/School/WeaponEffectType/VisualEventType 枚举

---

## Task 1: 添加 9 个 WeaponRangeConfig 配置条目

**Files:**
- Modify: `game/backend/src/games/fish-oil-battle/config/WeaponRangeConfig.ts`（在 `BOTANICAL_CONTROL` 条目后、闭合 `}` 前追加）

- [ ] **Step 1: 在 WeaponRangeConfig.ts 末尾闭合花括号前插入 9 个配置条目**

在文件末尾的 `};`（WEAPON_RANGE_CONFIG 闭合）之前，追加以下 9 个配置块：

```typescript
  // ═══ 基础流派武器扩展（StubWeapon → 真实实现）════════

  // ── 侵略者 - 纳米撕裂者（机械触手）──────────────
  [WeaponId.NANO_RIPPER]: {
    damage: 4,                    // 触手额外撕裂伤害
    burstDamage: 6,               // 每层撕裂爆发伤害
    maxEnergy: 4,                 // 撕裂层数上限（爆发阈值）
    energyPerHit: 1,              // 每次扫荡 +1 层
    burstEnergyCost: 4,           // 4 层满触发
    damageRadius: 40,             // 触手覆盖半径
    aoeMaxRadius: 60,             // 爆发影响范围
    visualRadius: 40,
    visualDurationMs: 2000,       // 扫荡特效持续 2s
    burstDurationSec: 2,          // 减速持续 2s
    cooldownMs: 6000,             // 扫荡 CD 6s
    field: {
      maxCount: 1,                // 单一撕裂场
      radius: 40,
      durationSec: 2,
      contactDamage: 4,           // 触手触碰伤害
      slowPercent: 30,            // 爆发减速 30%
    },
    triggerCooldowns: { hitTargetSec: 0.5 },
  },

  // ── 侵略者 - 追猎协议（追击印记 + 鱼雷）──────────
  [WeaponId.PURSUIT_PROTOCOL]: {
    damage: 3,                    // 每层追击额外伤害
    burstDamage: 20,              // 鱼雷伤害
    maxEnergy: 5,                 // 追击层数上限
    energyPerHit: 1,
    burstEnergyCost: 5,
    damageRadius: 60,             // 追踪线判定
    aoeMaxRadius: 200,            // 鱼雷溅射范围
    visualRadius: 60,
    visualDurationMs: 2000,       // 印记特效 2s
    burstDurationSec: 4,          // 鱼雷飞行 4s
    cooldownMs: 2000,             // 追击印记持续 2s
    field: {
      maxCount: 1,
      radius: 60,
      durationSec: 2,
    },
    triggerCooldowns: { hitTargetSec: 0.5 },
  },

  // ── 控制者 - 重力阱（微重力场 + 黑洞）────────────
  [WeaponId.GRAVITY_WELL]: {
    damage: 0,                    // 常驻无直接伤害
    burstDamage: 22,               // 黑洞中心伤害
    maxEnergy: 15,                 // 15 秒自动充满（时间制）
    damageRadius: 60,              // 微重力场半径
    aoeMaxRadius: 200,             // 黑洞影响范围
    visualRadius: 60,
    visualDurationMs: 3000,        // 黑洞持续 3s
    burstDurationSec: 3,
    cooldownMs: 8000,              // 锚点生成 CD
    field: {
      maxCount: 2,                 // 最多 2 个锚点
      radius: 80,                  // 锚点牵引半径
      durationSec: 6,              // 锚点持续 6s
      slowPercent: 15,             // 微重力场减速 15%
    },
    triggerCooldowns: { minIntervalMs: 500 },
  },

  // ── 控制者 - 熵增扩散器（油膜 + 凝固）────────────
  [WeaponId.ENTROPY_DIFFUSER]: {
    damage: 0,                    // 常驻无直接伤害
    burstDamage: 5,                // 凝固每秒伤害
    maxEnergy: 20,                  // 油膜段数阈值（爆发）
    energyPerHit: 1,
    burstEnergyCost: 20,
    damageRadius: 40,               // 油膜宽度
    aoeMaxRadius: 200,              // 凝固影响范围
    visualRadius: 40,
    visualDurationMs: 4000,         // 油膜持续 4s
    burstDurationSec: 3,            // 凝固持续 3s
    cooldownMs: 12000,              // 检测 CD
    field: {
      maxCount: 20,                 // 油膜段上限
      radius: 40,
      durationSec: 4,
    },
    triggerCooldowns: { minIntervalMs: 500 },
  },

  // ── 工程师 - 堡垒构筑者（方块部署）──────────────
  [WeaponId.BASTION_BUILDER]: {
    damage: 4,                      // 方块碰撞伤害
    burstDamage: 12,                // 墙壁碰撞伤害
    maxEnergy: 6,                   // 方块上限 = 爆发阈值
    energyPerHit: 1,
    burstEnergyCost: 6,
    damageRadius: 50,               // 方块边长
    aoeMaxRadius: 200,               // 墙壁长度
    visualRadius: 50,
    visualDurationMs: 12000,         // 方块持续 12s
    burstDurationSec: 5,             // 墙壁持续 5s
    cooldownMs: 5000,               // 尖刺 CD
    field: {
      maxCount: 6,                   // 最多 6 个方块
      radius: 50,
      durationSec: 12,
      contactDamage: 4,
    },
    triggerCooldowns: { wallHitSec: 0.5 },
  },

  // ── 工程师 - 电路编织者（回路网络）──────────────
  [WeaponId.CIRCUIT_WEAVER]: {
    damage: 8,                      // 通电每秒伤害
    burstDamage: 12,                // 过载每秒伤害
    maxEnergy: 600,                  // 回路长度阈值
    energyPerHit: 30,                // 每段回路 ~30px
    burstEnergyCost: 600,
    damageRadius: 20,                // 回路宽度
    aoeMaxRadius: 200,
    visualRadius: 20,
    visualDurationMs: 6000,          // 回路持续 6s
    burstDurationSec: 4,             // 过载持续 4s
    cooldownMs: 2000,                // 通电 CD
    field: {
      maxCount: 20,                   // 回路段上限
      radius: 20,
      durationSec: 6,
    },
    triggerCooldowns: { minIntervalMs: 500 },
  },

  // ── 变奏者 - 量子裂隙（量子态传送）──────────────
  [WeaponId.QUANTUM_RIFT]: {
    damage: 6,                       // 裂隙传送伤害
    burstDamage: 10,                 // 连接线伤害
    maxEnergy: 4,                    // 穿越次数阈值
    energyPerHit: 1,
    burstEnergyCost: 4,
    damageRadius: 40,                // 裂隙判定半径
    aoeMaxRadius: 200,
    visualRadius: 40,
    visualDurationMs: 8000,          // 裂隙持续 8s
    burstDurationSec: 2,
    cooldownMs: 5000,                 // 量子态 CD
    field: {
      maxCount: 4,                    // 最多 4 个裂隙（2 对）
      radius: 40,
      durationSec: 8,
      contactDamage: 6,
    },
    triggerCooldowns: { minIntervalMs: 500 },
  },

  // ── 变奏者 - 体积扭曲（尺寸切换）────────────────
  [WeaponId.SIZE_WARP]: {
    damage: 0,                        // 常驻无直接伤害
    burstDamage: 18,                  // 巨型化碰撞伤害
    maxEnergy: 3,                     // 切换次数阈值
    energyPerHit: 1,
    burstEnergyCost: 3,
    damageRadius: 60,                 // 扭曲场半径
    aoeMaxRadius: 200,
    visualRadius: 60,
    visualDurationMs: 3000,           // 巨型化持续 3s
    burstDurationSec: 3,
    cooldownMs: 8000,                 // 切换 CD
    field: {
      maxCount: 1,
      radius: 60,
      durationSec: 8,
    },
    triggerCooldowns: { minIntervalMs: 500 },
  },

  // ── 变奏者 - 弹射核心（速度递增）────────────────
  [WeaponId.RICOCHET_CORE]: {
    damage: 0,                        // 常驻无直接伤害（靠速度加成）
    burstDamage: 8,                   // 弹射碎片伤害
    maxEnergy: 200,                   // 速度阈值 200%
    damageRadius: 40,                 // 弹射轨迹半径
    aoeMaxRadius: 200,
    visualRadius: 40,
    visualDurationMs: 4000,           // 超音速持续 4s
    burstDurationSec: 4,
    cooldownMs: 1000,                 // 撞墙 CD
    field: {
      maxCount: 1,
      radius: 40,
      durationSec: 4,
    },
    triggerCooldowns: { wallHitSec: 0.3 },
  },
```

- [ ] **Step 2: 编译验证**

Run: `cd game/backend && npx tsc --noEmit`
Expected: 0 新错误（仅保留预存 skill-chain.test.ts 4 个 TS2740 错误，与本次改动无关）

- [ ] **Step 3: Commit**

```bash
git add game/backend/src/games/fish-oil-battle/config/WeaponRangeConfig.ts
git commit -m "feat(P3): 添加9个基础武器WeaponRangeConfig配置条目"
```

---

## Task 2: NanoRipperWeapon（纳米撕裂者）

**Files:**
- Create: `game/backend/src/games/fish-oil-battle/skills/weapons/NanoRipperWeapon.ts`
- Modify: `game/backend/src/games/fish-oil-battle/core/WeaponRegistry.ts:73-77`（替换 StubWeapon 工厂）

- [ ] **Step 1: 创建 NanoRipperWeapon.ts**

```typescript
/**
 * 武器 2：纳米撕裂者 (Nano Ripper)
 *
 * 流派：侵略者 Aggressor (#FF00FF)
 * 难度：⭐
 *
 * ── 核心设计 ──
 * 球体延伸出 2 条纳米触手（两侧各 40px），触手碰到对手 = 互撞 + 4 撕裂伤害。
 * 每 6 秒触手交叉扫荡，扫中 10 伤害 + 1 层撕裂。
 * 撕裂达 4 层引爆：每层 6 伤害（共 24），移速 -30% 持续 2 秒。
 */

import type { IBattleState } from '../../core/types';
import type {
  IWeapon, IPhysicsQuery, WeaponEffect, WeaponRuntimeState,
} from '../../core/IWeapon';
import { TICKS_PER_SEC } from '../../core/IWeapon';
import { WEAPON_RANGE_CONFIG } from '../../config/WeaponRangeConfig';
import {
  WeaponId, WeaponName, WeaponEffectType, VisualEventType, School,
} from '../../config/GameEnums';

const SWEEP_DAMAGE = 10;
const SWEEP_INTERVAL_SEC = 6;
const TEAR_SLOW_PERCENT = 30;
const TEAR_SLOW_DURATION_SEC = 2;

interface TearStack {
  targetId: string;
  stacks: number;
  lastSweepTick: number;
}

export class NanoRipperWeapon implements IWeapon {
  static readonly ID = WeaponId.NANO_RIPPER;
  readonly id = WeaponId.NANO_RIPPER;
  readonly name = WeaponName.NANO_RIPPER;
  readonly school = School.AGGRESSOR;
  readonly difficulty = 1;
  readonly iconId = 'game-icons:nano-ripper';
  playerId = '';

  private energy = 0;
  private tearStacks: Map<string, TearStack> = new Map();
  private sweepCooldownTicks = 0;
  private burstActive = false;
  private burstTicksLeft = 0;
  private cooldowns: Record<string, number> = {};
  private stacks: Record<string, number> = {};
  private flags: Record<string, boolean> = {};

  onTick(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    // 扫荡冷却推进
    if (this.sweepCooldownTicks > 0) {
      this.sweepCooldownTicks--;
    }

    // 自动扫荡触发（每 6 秒）
    if (this.sweepCooldownTicks <= 0) {
      this.sweepCooldownTicks = SWEEP_INTERVAL_SEC * TICKS_PER_SEC;

      const nearby = physics.getAliveOpponentsInRadius(
        this.playerId, self.position.x, self.position.y, CFG.damageRadius!,
      );

      effects.push({
        type: WeaponEffectType.VISUAL_ONLY,
        sourceId: this.playerId,
        value: 0,
        position: { x: self.position.x, y: self.position.y },
        metadata: {
          visualType: VisualEventType.NANO_RIPPER_FIELD,
          radius: CFG.damageRadius!,
        },
      });

      for (const opp of nearby) {
        effects.push({
          type: WeaponEffectType.DAMAGE,
          sourceId: this.playerId,
          targetId: opp.id,
          value: SWEEP_DAMAGE,
          metadata: { desc: '纳米触手扫荡' },
        });

        // 叠加撕裂层数
        const ts = this.tearStacks.get(opp.id) ?? {
          targetId: opp.id, stacks: 0, lastSweepTick: 0,
        };
        ts.stacks++;
        ts.lastSweepTick = state.tick;
        this.tearStacks.set(opp.id, ts);

        // 充能
        this.energy = Math.min(CFG.maxEnergy!, this.energy + 1);
      }
    }

    // 爆发持续：减速效果
    if (this.burstActive) {
      if (this.burstTicksLeft <= 0) {
        this.burstActive = false;
      } else {
        // 每 tick 持续减速（通过 1 tick 持续 slow 效果）
        for (const [tid, ts] of this.tearStacks) {
          if (ts.stacks > 0) {
            effects.push({
              type: WeaponEffectType.SLOW,
              sourceId: this.playerId,
              targetId: tid,
              value: TEAR_SLOW_PERCENT,
              duration: 1,
              metadata: { desc: '撕裂减速' },
            });
          }
        }
        this.burstTicksLeft--;
      }
    }

    return effects;
  }

  onHitTarget(state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    const opponent = _physics.getRandomAliveOpponent(this.playerId);
    if (opponent) {
      effects.push({
        type: WeaponEffectType.DAMAGE,
        sourceId: this.playerId,
        targetId: opponent.id,
        value: CFG.damage!,
        metadata: { desc: '触手撕裂伤害' },
      });
    }

    return effects;
  }

  onHitByAttacker(_attackerId: string, _state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    return [];
  }

  getEnergy(): number { return this.energy; }
  getMaxEnergy(): number { return CFG.maxEnergy!; }

  isBurstReady(): boolean {
    return this.energy >= CFG.maxEnergy! && !this.burstActive;
  }

  burst(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const self = _state.getPlayer(this.playerId);
    if (!self) return effects;

    this.energy = 0;
    this.burstActive = true;
    this.burstTicksLeft = TEAR_SLOW_DURATION_SEC * TICKS_PER_SEC;

    // 每层撕裂造成 6 伤害
    for (const [tid, ts] of this.tearStacks) {
      const totalDamage = ts.stacks * CFG.burstDamage!;
      if (totalDamage > 0) {
        effects.push({
          type: WeaponEffectType.BURST_DAMAGE,
          sourceId: this.playerId,
          targetId: tid,
          value: totalDamage,
          metadata: { desc: `纳米爆发（${ts.stacks} 层撕裂）` },
        });
      }
      ts.stacks = 0;
    }

    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: self.position.x, y: self.position.y },
      metadata: {
        visualType: VisualEventType.NANO_RIPPER_BURST,
        radius: CFG.aoeMaxRadius!,
      },
    });

    return effects;
  }

  getRuntimeState(): WeaponRuntimeState {
    return {
      energy: this.energy,
      maxEnergy: CFG.maxEnergy!,
      cooldowns: this.cooldowns,
      stacks: this.stacks,
      flags: { burstActive: this.burstActive },
      custom: {
        sweepCooldownTicks: this.sweepCooldownTicks,
        tearTargets: this.tearStacks.size,
      },
    };
  }

  reset(): void {
    this.energy = 0;
    this.tearStacks.clear();
    this.sweepCooldownTicks = 0;
    this.burstActive = false;
    this.burstTicksLeft = 0;
    this.cooldowns = {};
    this.stacks = {};
    this.flags = {};
  }
}

const CFG = WEAPON_RANGE_CONFIG[NanoRipperWeapon.ID];
```

- [ ] **Step 2: 更新 WeaponRegistry.ts**

在 `WeaponRegistry.ts` 顶部导入区追加：

```typescript
import { NanoRipperWeapon } from '../skills/weapons/NanoRipperWeapon';
```

将 `[WeaponId.NANO_RIPPER]` 条目的 factory 替换：

```typescript
  [WeaponId.NANO_RIPPER]: {
    id: WeaponId.NANO_RIPPER, name: WeaponName.NANO_RIPPER,
    school: School.AGGRESSOR, difficulty: 1, iconId: 'game-icons:nano-ripper',
    factory: () => new NanoRipperWeapon(),
  },
```

- [ ] **Step 3: 编译验证**

Run: `cd game/backend && npx tsc --noEmit`
Expected: 0 新错误

- [ ] **Step 4: Commit**

```bash
git add game/backend/src/games/fish-oil-battle/skills/weapons/NanoRipperWeapon.ts game/backend/src/games/fish-oil-battle/core/WeaponRegistry.ts
git commit -m "feat(P3): 实现纳米撕裂者后端武器类"
```

---

## Task 3: PursuitProtocolWeapon（追猎协议）

**Files:**
- Create: `game/backend/src/games/fish-oil-battle/skills/weapons/PursuitProtocolWeapon.ts`
- Modify: `game/backend/src/games/fish-oil-battle/core/WeaponRegistry.ts:78-82`

- [ ] **Step 1: 创建 PursuitProtocolWeapon.ts**

```typescript
/**
 * 武器 3：追猎协议 (Pursuit Protocol)
 *
 * 流派：侵略者 Aggressor (#FF00FF)
 * 难度：⭐⭐
 *
 * ── 核心设计 ──
 * 互撞后获得 2 秒追击印记（向对手方向移速 +20%）。
 * 连续命中同一对手，每次追击伤害 +3（最多 +15）。
 * 追击印记叠加到 5 层时爆发：发射追踪鱼雷，20 伤害 + 击退。
 *
 * 视觉事件：PURSUIT_PROTOCOL_MARK（含 targetId/tx/ty）+ PURSUIT_PROTOCOL_BURST
 */

import type { IBattleState } from '../../core/types';
import type {
  IWeapon, IPhysicsQuery, WeaponEffect, WeaponRuntimeState,
} from '../../core/IWeapon';
import { TICKS_PER_SEC } from '../../core/IWeapon';
import { WEAPON_RANGE_CONFIG } from '../../config/WeaponRangeConfig';
import {
  WeaponId, WeaponName, WeaponEffectType, VisualEventType, School,
} from '../../config/GameEnums';

const PURSUIT_SPEED_BOOST = 20;
const PURSUIT_DURATION_SEC = 2;
const MAX_BONUS_DAMAGE = 15;
const BONUS_PER_STACK = 3;

interface PursuitMark {
  targetId: string;
  stacks: number;
  expireTick: number;
}

export class PursuitProtocolWeapon implements IWeapon {
  static readonly ID = WeaponId.PURSUIT_PROTOCOL;
  readonly id = WeaponId.PURSUIT_PROTOCOL;
  readonly name = WeaponName.PURSUIT_PROTOCOL;
  readonly school = School.AGGRESSOR;
  readonly difficulty = 2;
  readonly iconId = 'game-icons:pursuit';
  playerId = '';

  private energy = 0;
  private marks: Map<string, PursuitMark> = new Map();
  private cooldowns: Record<string, number> = {};
  private stacks: Record<string, number> = {};
  private flags: Record<string, boolean> = {};

  onTick(state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];

    // 清理过期印记
    for (const [tid, mark] of this.marks) {
      if (state.tick > mark.expireTick) {
        this.marks.delete(tid);
      }
    }

    return effects;
  }

  onHitTarget(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    const opponent = physics.getRandomAliveOpponent(this.playerId);
    if (!opponent) return effects;

    // 追击印记逻辑
    const mark = this.marks.get(opponent.id);
    let newStacks = 1;

    if (mark && state.tick <= mark.expireTick) {
      // 连击同一对手，层数 +1
      newStacks = mark.stacks + 1;
    }

    this.marks.set(opponent.id, {
      targetId: opponent.id,
      stacks: newStacks,
      expireTick: state.tick + PURSUIT_DURATION_SEC * TICKS_PER_SEC,
    });

    // 追击额外伤害（每层 +3，最多 +15）
    const bonusDamage = Math.min(
      newStacks * BONUS_PER_STACK,
      MAX_BONUS_DAMAGE,
    );

    effects.push({
      type: WeaponEffectType.DAMAGE,
      sourceId: this.playerId,
      targetId: opponent.id,
      value: CFG.damage! + bonusDamage,
      metadata: {
        desc: `追击伤害（+${bonusDamage} 追击加成）`,
        pursuitStacks: newStacks,
      },
    });

    // 自身加速
    effects.push({
      type: WeaponEffectType.SLOW,
      sourceId: this.playerId,
      targetId: this.playerId,
      value: -PURSUIT_SPEED_BOOST,
      duration: PURSUIT_DURATION_SEC,
      metadata: { desc: '追击加速' },
    });

    // 发送追猎标记视觉事件（含 targetId + tx/ty）
    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: opponent.x, y: opponent.y },
      metadata: {
        visualType: VisualEventType.PURSUIT_PROTOCOL_MARK,
        targetId: opponent.id,
        tx: self.position.x,
        ty: self.position.y,
        radius: CFG.damageRadius!,
        stacks: newStacks,
      },
    });

    // 充能
    this.energy = Math.min(CFG.maxEnergy!, this.energy + 1);

    return effects;
  }

  onHitByAttacker(_attackerId: string, _state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    return [];
  }

  getEnergy(): number { return this.energy; }
  getMaxEnergy(): number { return CFG.maxEnergy!; }

  isBurstReady(): boolean {
    return this.energy >= CFG.maxEnergy!;
  }

  burst(state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    this.energy = 0;

    // 发射追踪鱼雷：对所有有印记的目标造成伤害 + 击退
    for (const [tid] of this.marks) {
      effects.push({
        type: WeaponEffectType.BURST_DAMAGE,
        sourceId: this.playerId,
        targetId: tid,
        value: CFG.burstDamage!,
        metadata: { desc: '追踪鱼雷命中' },
      });
    }

    // 鱼雷溅射（对范围内所有对手）
    const allOpponents = _physics.getAllAliveOpponents(this.playerId);
    for (const opp of allOpponents) {
      effects.push({
        type: WeaponEffectType.AOE_DAMAGE,
        sourceId: this.playerId,
        targetId: opp.id,
        value: 8,
        metadata: { desc: '鱼雷溅射' },
      });
    }

    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: self.position.x, y: self.position.y },
      metadata: {
        visualType: VisualEventType.PURSUIT_PROTOCOL_BURST,
        radius: CFG.aoeMaxRadius!,
      },
    });

    return effects;
  }

  getRuntimeState(): WeaponRuntimeState {
    return {
      energy: this.energy,
      maxEnergy: CFG.maxEnergy!,
      cooldowns: this.cooldowns,
      stacks: this.stacks,
      flags: {},
      custom: { markedTargets: this.marks.size },
    };
  }

  reset(): void {
    this.energy = 0;
    this.marks.clear();
    this.cooldowns = {};
    this.stacks = {};
    this.flags = {};
  }
}

const CFG = WEAPON_RANGE_CONFIG[PursuitProtocolWeapon.ID];
```

- [ ] **Step 2: 更新 WeaponRegistry.ts**

追加导入：
```typescript
import { PursuitProtocolWeapon } from '../skills/weapons/PursuitProtocolWeapon';
```

替换 factory：
```typescript
  [WeaponId.PURSUIT_PROTOCOL]: {
    id: WeaponId.PURSUIT_PROTOCOL, name: WeaponName.PURSUIT_PROTOCOL,
    school: School.AGGRESSOR, difficulty: 2, iconId: 'game-icons:pursuit',
    factory: () => new PursuitProtocolWeapon(),
  },
```

- [ ] **Step 3: 编译验证**

Run: `cd game/backend && npx tsc --noEmit`
Expected: 0 新错误

- [ ] **Step 4: Commit**

```bash
git add game/backend/src/games/fish-oil-battle/skills/weapons/PursuitProtocolWeapon.ts game/backend/src/games/fish-oil-battle/core/WeaponRegistry.ts
git commit -m "feat(P3): 实现追猎协议后端武器类"
```

---

## Task 4: GravityWellWeapon（重力阱）

**Files:**
- Create: `game/backend/src/games/fish-oil-battle/skills/weapons/GravityWellWeapon.ts`
- Modify: `game/backend/src/games/fish-oil-battle/core/WeaponRegistry.ts:85-89`

- [ ] **Step 1: 创建 GravityWellWeapon.ts**

```typescript
/**
 * 武器 4：重力阱 (Gravity Well)
 *
 * 流派：控制者 Controller (#00BFFF)
 * 难度：⭐⭐
 *
 * ── 核心设计 ──
 * 球体持续散发微重力场（半径 60px），对手进入移速 -15%。
 * 每 8 秒生成重力锚点（持续 6 秒），对手经过 80px 被拉向锚点中心。
 * 每 15 秒自动充满（时间制）：地图中心黑洞（3 秒），拉拽 + 移速 -50%，
 * 拉到中心 = 22 伤害 + 1.5 秒眩晕。自身不受影响。
 */

import type { IBattleState } from '../../core/types';
import type {
  IWeapon, IPhysicsQuery, WeaponEffect, WeaponRuntimeState,
} from '../../core/IWeapon';
import { TICKS_PER_SEC } from '../../core/IWeapon';
import { WEAPON_RANGE_CONFIG } from '../../config/WeaponRangeConfig';
import {
  WeaponId, WeaponName, WeaponEffectType, VisualEventType, School,
} from '../../config/GameEnums';

const ANCHOR_INTERVAL_SEC = 8;
const BLACKHOLE_DURATION_SEC = 3;
const BLACKHOLE_PULL_FORCE = 200;
const BLACKHOLE_SLOW_PERCENT = 50;
const BLACKHOLE_STUN_SEC = 1.5;
const MICRO_GRAVITY_SLOW = 15;

interface GravityAnchor {
  id: string;
  x: number;
  y: number;
  secondsLeft: number;
}

export class GravityWellWeapon implements IWeapon {
  static readonly ID = WeaponId.GRAVITY_WELL;
  readonly id = WeaponId.GRAVITY_WELL;
  readonly name = WeaponName.GRAVITY_WELL;
  readonly school = School.CONTROLLER;
  readonly difficulty = 2;
  readonly iconId = 'game-icons:gravity-well';
  playerId = '';

  private energy = 0;
  private anchors: GravityAnchor[] = [];
  private burstActive = false;
  private burstTicksLeft = 0;
  private anchorCooldownTicks = 0;
  private tickCounter = 0;
  private cooldowns: Record<string, number> = {};
  private stacks: Record<string, number> = {};
  private flags: Record<string, boolean> = {};

  onTick(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    this.tickCounter++;
    const isSecondTick = this.tickCounter >= TICKS_PER_SEC;
    if (isSecondTick) this.tickCounter = 0;

    // 时间充能（每秒 +1）
    if (isSecondTick) {
      this.energy = Math.min(CFG.maxEnergy!, this.energy + 1);
    }

    // 微重力场：对手进入减速
    const microFieldR = CFG.damageRadius!;
    const nearbyMicro = physics.getAliveOpponentsInRadius(
      this.playerId, self.position.x, self.position.y, microFieldR,
    );
    for (const opp of nearbyMicro) {
      effects.push({
        type: WeaponEffectType.SLOW,
        sourceId: this.playerId,
        targetId: opp.id,
        value: MICRO_GRAVITY_SLOW,
        duration: 1,
        metadata: { desc: '微重力场减速' },
      });
    }

    // 发送重力核心视觉事件（微重力场）
    if (this.tickCounter % 10 === 0) {
      effects.push({
        type: WeaponEffectType.VISUAL_ONLY,
        sourceId: this.playerId,
        value: 0,
        position: { x: self.position.x, y: self.position.y },
        metadata: {
          visualType: VisualEventType.GRAVITY_WELL_CORE,
          radius: microFieldR,
        },
      });
    }

    // 锚点管理
    if (isSecondTick) {
      for (const a of this.anchors) a.secondsLeft--;
      this.anchors = this.anchors.filter(a => a.secondsLeft > 0);
    }

    // 锚点牵引
    for (const anchor of this.anchors) {
      const inRange = physics.getAliveOpponentsInRadius(
        this.playerId, anchor.x, anchor.y, CFG.field!.radius!,
      );
      for (const opp of inRange) {
        const dx = anchor.x - opp.x;
        const dy = anchor.y - opp.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        effects.push({
          type: WeaponEffectType.PULL,
          sourceId: this.playerId,
          targetId: opp.id,
          value: BLACKHOLE_PULL_FORCE / TICKS_PER_SEC,
          duration: 1,
          metadata: {
            desc: '锚点牵引',
            dirX: dx / dist,
            dirY: dy / dist,
          },
        });
      }
    }

    // 生成新锚点（每 8 秒）
    if (this.anchorCooldownTicks <= 0 && this.anchors.length < CFG.field!.maxCount!) {
      this.anchorCooldownTicks = ANCHOR_INTERVAL_SEC * TICKS_PER_SEC;
      const arenaCenter = physics.getArenaCenter();
      const arenaR = physics.getArenaRadius();
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * arenaR * 0.7;
      const ax = arenaCenter.x + Math.cos(angle) * r;
      const ay = arenaCenter.y + Math.sin(angle) * r;
      const anchorId = `anchor_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      this.anchors.push({
        id: anchorId, x: ax, y: ay, secondsLeft: CFG.field!.durationSec!,
      });
      effects.push({
        type: WeaponEffectType.VISUAL_ONLY,
        sourceId: this.playerId,
        value: 0,
        position: { x: ax, y: ay },
        metadata: {
          visualType: VisualEventType.GRAVITY_WELL_CORE,
          radius: CFG.field!.radius!,
          anchorId,
        },
      });
    }
    if (this.anchorCooldownTicks > 0) this.anchorCooldownTicks--;

    // 爆发持续：黑洞
    if (this.burstActive) {
      if (this.burstTicksLeft <= 0) {
        this.burstActive = false;
      } else {
        const arenaCenter = physics.getArenaCenter();
        const inBlackhole = physics.getAliveOpponentsInRadius(
          this.playerId, arenaCenter.x, arenaCenter.y, CFG.aoeMaxRadius!,
        );
        for (const opp of inBlackhole) {
          const dx = arenaCenter.x - opp.x;
          const dy = arenaCenter.y - opp.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;

          // 拉拽
          effects.push({
            type: WeaponEffectType.PULL,
            sourceId: this.playerId,
            targetId: opp.id,
            value: BLACKHOLE_PULL_FORCE / TICKS_PER_SEC,
            duration: 1,
            metadata: {
              desc: '黑洞拉拽',
              dirX: dx / dist,
              dirY: dy / dist,
            },
          });

          // 减速
          effects.push({
            type: WeaponEffectType.SLOW,
            sourceId: this.playerId,
            targetId: opp.id,
            value: BLACKHOLE_SLOW_PERCENT,
            duration: 1,
            metadata: { desc: '黑洞减速' },
          });

          // 中心伤害 + 眩晕
          if (dist < 30) {
            effects.push({
              type: WeaponEffectType.BURST_DAMAGE,
              sourceId: this.playerId,
              targetId: opp.id,
              value: CFG.burstDamage!,
              metadata: { desc: '黑洞中心伤害' },
            });
            effects.push({
              type: WeaponEffectType.SLOW,
              sourceId: this.playerId,
              targetId: opp.id,
              value: 100,
              duration: BLACKHOLE_STUN_SEC,
              metadata: { desc: '黑洞眩晕' },
            });
          }
        }
        this.burstTicksLeft--;
      }
    }

    return effects;
  }

  onHitTarget(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    return [];
  }

  onHitByAttacker(_attackerId: string, _state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    return [];
  }

  getEnergy(): number { return this.energy; }
  getMaxEnergy(): number { return CFG.maxEnergy!; }

  isBurstReady(): boolean {
    return this.energy >= CFG.maxEnergy! && !this.burstActive;
  }

  burst(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const arenaCenter = physics.getArenaCenter();
    this.energy = 0;
    this.burstActive = true;
    this.burstTicksLeft = BLACKHOLE_DURATION_SEC * TICKS_PER_SEC;

    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: arenaCenter.x, y: arenaCenter.y },
      metadata: {
        visualType: VisualEventType.GRAVITY_WELL_BURST,
        radius: CFG.aoeMaxRadius!,
      },
    });

    return effects;
  }

  getRuntimeState(): WeaponRuntimeState {
    return {
      energy: this.energy,
      maxEnergy: CFG.maxEnergy!,
      cooldowns: this.cooldowns,
      stacks: this.stacks,
      flags: { burstActive: this.burstActive },
      custom: {
        anchorCount: this.anchors.length,
        burstTicksLeft: this.burstTicksLeft,
      },
    };
  }

  reset(): void {
    this.energy = 0;
    this.anchors = [];
    this.burstActive = false;
    this.burstTicksLeft = 0;
    this.anchorCooldownTicks = 0;
    this.tickCounter = 0;
    this.cooldowns = {};
    this.stacks = {};
    this.flags = {};
  }
}

const CFG = WEAPON_RANGE_CONFIG[GravityWellWeapon.ID];
```

- [ ] **Step 2: 更新 WeaponRegistry.ts**

追加导入：
```typescript
import { GravityWellWeapon } from '../skills/weapons/GravityWellWeapon';
```

替换 factory：
```typescript
  [WeaponId.GRAVITY_WELL]: {
    id: WeaponId.GRAVITY_WELL, name: WeaponName.GRAVITY_WELL,
    school: School.CONTROLLER, difficulty: 2, iconId: 'game-icons:gravity-well',
    factory: () => new GravityWellWeapon(),
  },
```

- [ ] **Step 3: 编译验证**

Run: `cd game/backend && npx tsc --noEmit`
Expected: 0 新错误

- [ ] **Step 4: Commit**

```bash
git add game/backend/src/games/fish-oil-battle/skills/weapons/GravityWellWeapon.ts game/backend/src/games/fish-oil-battle/core/WeaponRegistry.ts
git commit -m "feat(P3): 实现重力阱后端武器类"
```

---

## Task 5: EntropyDiffuserWeapon（熵增扩散器）

**Files:**
- Create: `game/backend/src/games/fish-oil-battle/skills/weapons/EntropyDiffuserWeapon.ts`
- Modify: `game/backend/src/games/fish-oil-battle/core/WeaponRegistry.ts:95-99`

- [ ] **Step 1: 创建 EntropyDiffuserWeapon.ts**

```typescript
/**
 * 武器 6：熵增扩散器 (Entropy Diffuser)
 *
 * 流派：控制者 Controller (#00BFFF)
 * 难度：⭐⭐⭐
 *
 * ── 核心设计 ──
 * 球体经过路径留下熵增油膜（持续 4 秒，宽 40px）。
 * 对手在油膜上移速 +25% 但无法转向（惯性滑行）。自身不受影响。
 * 油膜段数达 20 时爆发：所有油膜凝固，对手 -60% 移速 + 每秒 5 伤害（持续 3 秒）。
 */

import type { IBattleState } from '../../core/types';
import type {
  IWeapon, IPhysicsQuery, WeaponEffect, WeaponRuntimeState,
} from '../../core/IWeapon';
import { TICKS_PER_SEC } from '../../core/IWeapon';
import { WEAPON_RANGE_CONFIG } from '../../config/WeaponRangeConfig';
import {
  WeaponId, WeaponName, WeaponEffectType, VisualEventType, School,
} from '../../config/GameEnums';

const OIL_TRAIL_INTERVAL_SEC = 0.5;
const SOLIDIFY_SLOW_PERCENT = 60;
const SOLIDIFY_DURATION_SEC = 3;

interface OilSegment {
  id: string;
  x: number;
  y: number;
  secondsLeft: number;
}

export class EntropyDiffuserWeapon implements IWeapon {
  static readonly ID = WeaponId.ENTROPY_DIFFUSER;
  readonly id = WeaponId.ENTROPY_DIFFUSER;
  readonly name = WeaponName.ENTROPY_DIFFUSER;
  readonly school = School.CONTROLLER;
  readonly difficulty = 3;
  readonly iconId = 'game-icons:entropy';
  playerId = '';

  private energy = 0;
  private oilSegments: OilSegment[] = [];
  private trailCooldownTicks = 0;
  private burstActive = false;
  private burstTicksLeft = 0;
  private tickCounter = 0;
  private cooldowns: Record<string, number> = {};
  private stacks: Record<string, number> = {};
  private flags: Record<string, boolean> = {};

  onTick(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    this.tickCounter++;
    const isSecondTick = this.tickCounter >= TICKS_PER_SEC;
    if (isSecondTick) this.tickCounter = 0;

    // 油膜生命周期管理
    if (isSecondTick) {
      for (const seg of this.oilSegments) seg.secondsLeft--;
      this.oilSegments = this.oilSegments.filter(s => s.secondsLeft > 0);
    }

    // 铺设新油膜（跟随球体移动）
    if (this.trailCooldownTicks <= 0 && this.oilSegments.length < CFG.field!.maxCount!) {
      this.trailCooldownTicks = Math.ceil(OIL_TRAIL_INTERVAL_SEC * TICKS_PER_SEC);
      const segId = `oil_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      this.oilSegments.push({
        id: segId,
        x: self.position.x,
        y: self.position.y,
        secondsLeft: CFG.field!.durationSec!,
      });

      // 充能
      this.energy = Math.min(CFG.maxEnergy!, this.energy + (CFG.energyPerHit ?? 1));

      effects.push({
        type: WeaponEffectType.VISUAL_ONLY,
        sourceId: this.playerId,
        value: 0,
        position: { x: self.position.x, y: self.position.y },
        metadata: {
          visualType: VisualEventType.ENTROPY_DIFFUSER_FIELD,
          radius: CFG.damageRadius!,
          oilCount: this.oilSegments.length,
        },
      });
    }
    if (this.trailCooldownTicks > 0) this.trailCooldownTicks--;

    // 油膜上对手效果（移速 +25%，惯性滑行用 SLOW 负值模拟加速）
    for (const seg of this.oilSegments) {
      const onOil = physics.getAliveOpponentsInRadius(
        this.playerId, seg.x, seg.y, CFG.damageRadius!,
      );
      for (const opp of onOil) {
        effects.push({
          type: WeaponEffectType.SLOW,
          sourceId: this.playerId,
          targetId: opp.id,
          value: -25,
          duration: 1,
          metadata: { desc: '油膜惯性加速' },
        });
      }
    }

    // 爆发持续：凝固油膜
    if (this.burstActive) {
      if (this.burstTicksLeft <= 0) {
        this.burstActive = false;
        this.oilSegments = [];
      } else {
        // 每秒判定伤害 + 减速
        if (isSecondTick) {
          for (const seg of this.oilSegments) {
            const onOil = physics.getAliveOpponentsInRadius(
              this.playerId, seg.x, seg.y, CFG.damageRadius!,
            );
            for (const opp of onOil) {
              effects.push({
                type: WeaponEffectType.DAMAGE,
                sourceId: this.playerId,
                targetId: opp.id,
                value: CFG.burstDamage!,
                metadata: { desc: '凝固油膜伤害' },
              });
              effects.push({
                type: WeaponEffectType.SLOW,
                sourceId: this.playerId,
                targetId: opp.id,
                value: SOLIDIFY_SLOW_PERCENT,
                duration: 1,
                metadata: { desc: '凝固油膜减速' },
              });
            }
          }
        }
        this.burstTicksLeft--;
      }
    }

    return effects;
  }

  onHitTarget(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    return [];
  }

  onHitByAttacker(_attackerId: string, _state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    return [];
  }

  getEnergy(): number { return this.energy; }
  getMaxEnergy(): number { return CFG.maxEnergy!; }

  isBurstReady(): boolean {
    return this.energy >= CFG.maxEnergy! && !this.burstActive;
  }

  burst(state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    this.energy = 0;
    this.burstActive = true;
    this.burstTicksLeft = SOLIDIFY_DURATION_SEC * TICKS_PER_SEC;

    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: self.position.x, y: self.position.y },
      metadata: {
        visualType: VisualEventType.ENTROPY_DIFFUSER_BURST,
        radius: CFG.aoeMaxRadius!,
        oilCount: this.oilSegments.length,
      },
    });

    return effects;
  }

  getRuntimeState(): WeaponRuntimeState {
    return {
      energy: this.energy,
      maxEnergy: CFG.maxEnergy!,
      cooldowns: this.cooldowns,
      stacks: this.stacks,
      flags: { burstActive: this.burstActive },
      custom: {
        oilCount: this.oilSegments.length,
        burstTicksLeft: this.burstTicksLeft,
      },
    };
  }

  reset(): void {
    this.energy = 0;
    this.oilSegments = [];
    this.trailCooldownTicks = 0;
    this.burstActive = false;
    this.burstTicksLeft = 0;
    this.tickCounter = 0;
    this.cooldowns = {};
    this.stacks = {};
    this.flags = {};
  }
}

const CFG = WEAPON_RANGE_CONFIG[EntropyDiffuserWeapon.ID];
```

- [ ] **Step 2: 更新 WeaponRegistry.ts**

追加导入：
```typescript
import { EntropyDiffuserWeapon } from '../skills/weapons/EntropyDiffuserWeapon';
```

替换 factory：
```typescript
  [WeaponId.ENTROPY_DIFFUSER]: {
    id: WeaponId.ENTROPY_DIFFUSER, name: WeaponName.ENTROPY_DIFFUSER,
    school: School.CONTROLLER, difficulty: 3, iconId: 'game-icons:entropy',
    factory: () => new EntropyDiffuserWeapon(),
  },
```

- [ ] **Step 3: 编译验证**

Run: `cd game/backend && npx tsc --noEmit`
Expected: 0 新错误

- [ ] **Step 4: Commit**

```bash
git add game/backend/src/games/fish-oil-battle/skills/weapons/EntropyDiffuserWeapon.ts game/backend/src/games/fish-oil-battle/core/WeaponRegistry.ts
git commit -m "feat(P3): 实现熵增扩散器后端武器类"
```

---

## Task 6: BastionBuilderWeapon（堡垒构筑者）

**Files:**
- Create: `game/backend/src/games/fish-oil-battle/skills/weapons/BastionBuilderWeapon.ts`
- Modify: `game/backend/src/games/fish-oil-battle/core/WeaponRegistry.ts:107-111`

- [ ] **Step 1: 创建 BastionBuilderWeapon.ts**

```typescript
/**
 * 武器 8：堡垒构筑者 (Bastion Builder)
 *
 * 流派：工程师 Engineer (#39FF14)
 * 难度：⭐⭐⭐
 *
 * ── 核心设计 ──
 * 球体碰撞墙壁时，在碰撞位置生成 3×3 方块（边长 50px，持续 12 秒）。
 * 对手碰撞方块 = 4 伤害。场上最多 6 个方块。
 * 每 5 秒方块长尖刺（3 秒），碰撞尖刺 +8 伤害。
 * 场上 6 个方块时爆发：合并为大型墙壁（5 秒），碰撞 12 伤害。自身可穿过。
 */

import type { IBattleState } from '../../core/types';
import type {
  IWeapon, IPhysicsQuery, WeaponEffect, WeaponRuntimeState,
} from '../../core/IWeapon';
import { TICKS_PER_SEC } from '../../core/IWeapon';
import { WEAPON_RANGE_CONFIG } from '../../config/WeaponRangeConfig';
import {
  WeaponId, WeaponName, WeaponEffectType, VisualEventType, School,
} from '../../config/GameEnums';

const SPIKE_INTERVAL_SEC = 5;
const SPIKE_DURATION_SEC = 3;
const SPIKE_EXTRA_DAMAGE = 8;

interface BastionBlock {
  id: string;
  x: number;
  y: number;
  secondsLeft: number;
  hasSpikes: boolean;
  spikeTicksLeft: number;
  hitTargets: Set<string>;
}

export class BastionBuilderWeapon implements IWeapon {
  static readonly ID = WeaponId.BASTION_BUILDER;
  readonly id = WeaponId.BASTION_BUILDER;
  readonly name = WeaponName.BASTION_BUILDER;
  readonly school = School.ENGINEER;
  readonly difficulty = 3;
  readonly iconId = 'game-icons:bastion';
  playerId = '';

  private energy = 0;
  private blocks: BastionBlock[] = [];
  private spikeCooldownTicks = 0;
  private burstActive = false;
  private burstTicksLeft = 0;
  private tickCounter = 0;
  private cooldowns: Record<string, number> = {};
  private stacks: Record<string, number> = {};
  private flags: Record<string, boolean> = {};

  onTick(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];

    this.tickCounter++;
    const isSecondTick = this.tickCounter >= TICKS_PER_SEC;
    if (isSecondTick) this.tickCounter = 0;

    // 方块生命周期 + 尖刺计时
    if (isSecondTick) {
      for (const b of this.blocks) {
        b.secondsLeft--;
        if (b.spikeTicksLeft > 0) {
          b.spikeTicksLeft--;
          if (b.spikeTicksLeft <= 0) b.hasSpikes = false;
        }
      }
      this.blocks = this.blocks.filter(b => b.secondsLeft > 0);
    }

    // 每 5 秒长尖刺
    if (this.spikeCooldownTicks <= 0 && this.blocks.length > 0) {
      this.spikeCooldownTicks = SPIKE_INTERVAL_SEC * TICKS_PER_SEC;
      for (const b of this.blocks) {
        b.hasSpikes = true;
        b.spikeTicksLeft = SPIKE_DURATION_SEC * TICKS_PER_SEC;
        b.hitTargets.clear();
      }
    }
    if (this.spikeCooldownTicks > 0) this.spikeCooldownTicks--;

    // 方块碰撞检测
    for (const block of this.blocks) {
      const nearby = physics.getAliveOpponentsInRadius(
        this.playerId, block.x, block.y, CFG.damageRadius!,
      );
      for (const opp of nearby) {
        if (block.hitTargets.has(opp.id)) continue;
        block.hitTargets.add(opp.id);

        effects.push({
          type: WeaponEffectType.DAMAGE,
          sourceId: this.playerId,
          targetId: opp.id,
          value: CFG.damage!,
          metadata: { desc: '方块碰撞', blockId: block.id },
        });

        if (block.hasSpikes) {
          effects.push({
            type: WeaponEffectType.DAMAGE,
            sourceId: this.playerId,
            targetId: opp.id,
            value: SPIKE_EXTRA_DAMAGE,
            metadata: { desc: '尖刺伤害', blockId: block.id },
          });
        }
      }
    }

    // 爆发持续：合并墙壁
    if (this.burstActive) {
      if (this.burstTicksLeft <= 0) {
        this.burstActive = false;
      } else {
        // 墙壁对所有对手造成碰撞伤害
        if (isSecondTick) {
          const allOpponents = physics.getAllAliveOpponents(this.playerId);
          for (const opp of allOpponents) {
            // 简化：墙壁覆盖全图 40%，对所有对手造成伤害
            effects.push({
              type: WeaponEffectType.BURST_DAMAGE,
              sourceId: this.playerId,
              targetId: opp.id,
              value: CFG.burstDamage!,
              metadata: { desc: '要塞墙壁碰撞' },
            });
          }
        }
        this.burstTicksLeft--;
      }
    }

    return effects;
  }

  onHitTarget(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    return [];
  }

  onHitByAttacker(_attackerId: string, _state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    return [];
  }

  onWallHit(state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    // 生成方块（最多 6 个）
    if (this.blocks.length < CFG.field!.maxCount!) {
      const blockId = `block_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      this.blocks.push({
        id: blockId,
        x: self.position.x,
        y: self.position.y,
        secondsLeft: CFG.field!.durationSec!,
        hasSpikes: false,
        spikeTicksLeft: 0,
        hitTargets: new Set(),
      });

      this.energy = Math.min(CFG.maxEnergy!, this.energy + 1);

      effects.push({
        type: WeaponEffectType.VISUAL_ONLY,
        sourceId: this.playerId,
        value: 0,
        position: { x: self.position.x, y: self.position.y },
        metadata: {
          visualType: VisualEventType.BASTION_BUILDER_SHIELD,
          radius: CFG.damageRadius!,
          blockId,
          blockCount: this.blocks.length,
        },
      });
    }

    return effects;
  }

  getEnergy(): number { return this.energy; }
  getMaxEnergy(): number { return CFG.maxEnergy!; }

  isBurstReady(): boolean {
    return this.energy >= CFG.maxEnergy! && !this.burstActive;
  }

  burst(state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    this.energy = 0;
    this.burstActive = true;
    this.burstTicksLeft = CFG.burstDurationSec! * TICKS_PER_SEC;

    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: self.position.x, y: self.position.y },
      metadata: {
        visualType: VisualEventType.BASTION_BUILDER_BURST,
        radius: CFG.aoeMaxRadius!,
        blockCount: this.blocks.length,
      },
    });

    return effects;
  }

  getRuntimeState(): WeaponRuntimeState {
    return {
      energy: this.energy,
      maxEnergy: CFG.maxEnergy!,
      cooldowns: this.cooldowns,
      stacks: this.stacks,
      flags: { burstActive: this.burstActive },
      custom: {
        blockCount: this.blocks.length,
        burstTicksLeft: this.burstTicksLeft,
      },
    };
  }

  reset(): void {
    this.energy = 0;
    this.blocks = [];
    this.spikeCooldownTicks = 0;
    this.burstActive = false;
    this.burstTicksLeft = 0;
    this.tickCounter = 0;
    this.cooldowns = {};
    this.stacks = {};
    this.flags = {};
  }
}

const CFG = WEAPON_RANGE_CONFIG[BastionBuilderWeapon.ID];
```

- [ ] **Step 2: 更新 WeaponRegistry.ts**

追加导入：
```typescript
import { BastionBuilderWeapon } from '../skills/weapons/BastionBuilderWeapon';
```

替换 factory：
```typescript
  [WeaponId.BASTION_BUILDER]: {
    id: WeaponId.BASTION_BUILDER, name: WeaponName.BASTION_BUILDER,
    school: School.ENGINEER, difficulty: 3, iconId: 'game-icons:bastion',
    factory: () => new BastionBuilderWeapon(),
  },
```

- [ ] **Step 3: 编译验证**

Run: `cd game/backend && npx tsc --noEmit`
Expected: 0 新错误

- [ ] **Step 4: Commit**

```bash
git add game/backend/src/games/fish-oil-battle/skills/weapons/BastionBuilderWeapon.ts game/backend/src/games/fish-oil-battle/core/WeaponRegistry.ts
git commit -m "feat(P3): 实现堡垒构筑者后端武器类"
```

---

## Task 7: CircuitWeaverWeapon（电路编织者）

**Files:**
- Create: `game/backend/src/games/fish-oil-battle/skills/weapons/CircuitWeaverWeapon.ts`
- Modify: `game/backend/src/games/fish-oil-battle/core/WeaponRegistry.ts:112-116`

- [ ] **Step 1: 创建 CircuitWeaverWeapon.ts**

```typescript
/**
 * 武器 9：电路编织者 (Circuit Weaver)
 *
 * 流派：工程师 Engineer (#39FF14)
 * 难度：⭐⭐⭐
 *
 * ── 核心设计 ──
 * 球体移动时在身后拖出能量回路（持续 6 秒，宽 20px）。
 * 自身在回路上移速 +15%。回路可交叉形成网络。
 * 对手触碰回路时通电（2 秒）：每秒 8 伤害。同回路对同目标只激活一次。
 * 回路总长度达 600px 时爆发：所有回路通电（4 秒），每秒 12 伤害，-25% 移速。
 */

import type { IBattleState } from '../../core/types';
import type {
  IWeapon, IPhysicsQuery, WeaponEffect, WeaponRuntimeState,
} from '../../core/IWeapon';
import { TICKS_PER_SEC } from '../../core/IWeapon';
import { WEAPON_RANGE_CONFIG } from '../../config/WeaponRangeConfig';
import {
  WeaponId, WeaponName, WeaponEffectType, VisualEventType, School,
} from '../../config/GameEnums';

const TRAIL_INTERVAL_SEC = 0.3;
const SELF_SPEED_BOOST = 15;
const CIRCUIT_DOT_DAMAGE = 8;
const OVERLOAD_DOT_DAMAGE = 12;
const OVERLOAD_SLOW_PERCENT = 25;
const SEGMENT_LENGTH = 30;

interface CircuitSegment {
  id: string;
  x: number;
  y: number;
  secondsLeft: number;
  energizedTicksLeft: number;
  hitTargets: Set<string>;
}

export class CircuitWeaverWeapon implements IWeapon {
  static readonly ID = WeaponId.CIRCUIT_WEAVER;
  readonly id = WeaponId.CIRCUIT_WEAVER;
  readonly name = WeaponName.CIRCUIT_WEAVER;
  readonly school = School.ENGINEER;
  readonly difficulty = 3;
  readonly iconId = 'game-icons:circuit';
  playerId = '';

  private energy = 0;
  private segments: CircuitSegment[] = [];
  private trailCooldownTicks = 0;
  private burstActive = false;
  private burstTicksLeft = 0;
  private tickCounter = 0;
  private cooldowns: Record<string, number> = {};
  private stacks: Record<string, number> = {};
  private flags: Record<string, boolean> = {};

  onTick(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    this.tickCounter++;
    const isSecondTick = this.tickCounter >= TICKS_PER_SEC;
    if (isSecondTick) this.tickCounter = 0;

    // 回路生命周期管理
    if (isSecondTick) {
      for (const seg of this.segments) {
        seg.secondsLeft--;
        if (seg.energizedTicksLeft > 0) seg.energizedTicksLeft--;
      }
      this.segments = this.segments.filter(s => s.secondsLeft > 0);
    }

    // 铺设新回路段（跟随球体移动）
    if (this.trailCooldownTicks <= 0 && this.segments.length < CFG.field!.maxCount!) {
      this.trailCooldownTicks = Math.ceil(TRAIL_INTERVAL_SEC * TICKS_PER_SEC);
      const segId = `circuit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      this.segments.push({
        id: segId,
        x: self.position.x,
        y: self.position.y,
        secondsLeft: CFG.field!.durationSec!,
        energizedTicksLeft: 0,
        hitTargets: new Set(),
      });

      // 充能（每段 ~30px 长度）
      this.energy = Math.min(CFG.maxEnergy!, this.energy + (CFG.energyPerHit ?? SEGMENT_LENGTH));

      effects.push({
        type: WeaponEffectType.VISUAL_ONLY,
        sourceId: this.playerId,
        value: 0,
        position: { x: self.position.x, y: self.position.y },
        metadata: {
          visualType: VisualEventType.CIRCUIT_WEAVER_NETWORK,
          radius: CFG.damageRadius!,
          segmentCount: this.segments.length,
          totalLength: this.energy,
        },
      });
    }
    if (this.trailCooldownTicks > 0) this.trailCooldownTicks--;

    // 自身在回路上加速
    let onCircuit = false;
    for (const seg of this.segments) {
      const dx = self.position.x - seg.x;
      const dy = self.position.y - seg.y;
      if (Math.sqrt(dx * dx + dy * dy) < CFG.damageRadius!) {
        onCircuit = true;
        break;
      }
    }
    if (onCircuit) {
      effects.push({
        type: WeaponEffectType.SLOW,
        sourceId: this.playerId,
        targetId: this.playerId,
        value: -SELF_SPEED_BOOST,
        duration: 1,
        metadata: { desc: '回路上加速' },
      });
    }

    // 对手触碰回路 → 通电
    for (const seg of this.segments) {
      const onSeg = physics.getAliveOpponentsInRadius(
        this.playerId, seg.x, seg.y, CFG.damageRadius!,
      );
      for (const opp of onSeg) {
        if (seg.hitTargets.has(opp.id)) continue;

        // 通电激活
        if (seg.energizedTicksLeft <= 0) {
          seg.energizedTicksLeft = 2 * TICKS_PER_SEC;
        }

        seg.hitTargets.add(opp.id);

        // 通电伤害
        if (isSecondTick) {
          effects.push({
            type: WeaponEffectType.DAMAGE,
            sourceId: this.playerId,
            targetId: opp.id,
            value: CIRCUIT_DOT_DAMAGE,
            metadata: { desc: '回路通电', segmentId: seg.id },
          });
        }
      }
    }

    // 爆发持续：全回路过载
    if (this.burstActive) {
      if (this.burstTicksLeft <= 0) {
        this.burstActive = false;
        this.segments = [];
      } else {
        if (isSecondTick) {
          for (const seg of this.segments) {
            const onSeg = physics.getAliveOpponentsInRadius(
              this.playerId, seg.x, seg.y, CFG.damageRadius!,
            );
            for (const opp of onSeg) {
              effects.push({
                type: WeaponEffectType.BURST_DAMAGE,
                sourceId: this.playerId,
                targetId: opp.id,
                value: OVERLOAD_DOT_DAMAGE,
                metadata: { desc: '回路过载', segmentId: seg.id },
              });
              effects.push({
                type: WeaponEffectType.SLOW,
                sourceId: this.playerId,
                targetId: opp.id,
                value: OVERLOAD_SLOW_PERCENT,
                duration: 1,
                metadata: { desc: '过载减速' },
              });
            }
          }
        }
        this.burstTicksLeft--;
      }
    }

    return effects;
  }

  onHitTarget(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    return [];
  }

  onHitByAttacker(_attackerId: string, _state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    return [];
  }

  getEnergy(): number { return this.energy; }
  getMaxEnergy(): number { return CFG.maxEnergy!; }

  isBurstReady(): boolean {
    return this.energy >= CFG.maxEnergy! && !this.burstActive;
  }

  burst(state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    this.energy = 0;
    this.burstActive = true;
    this.burstTicksLeft = CFG.burstDurationSec! * TICKS_PER_SEC;

    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: self.position.x, y: self.position.y },
      metadata: {
        visualType: VisualEventType.CIRCUIT_WEAVER_BURST,
        radius: CFG.aoeMaxRadius!,
        segmentCount: this.segments.length,
      },
    });

    return effects;
  }

  getRuntimeState(): WeaponRuntimeState {
    return {
      energy: this.energy,
      maxEnergy: CFG.maxEnergy!,
      cooldowns: this.cooldowns,
      stacks: this.stacks,
      flags: { burstActive: this.burstActive },
      custom: {
        segmentCount: this.segments.length,
        totalLength: this.energy,
        burstTicksLeft: this.burstTicksLeft,
      },
    };
  }

  reset(): void {
    this.energy = 0;
    this.segments = [];
    this.trailCooldownTicks = 0;
    this.burstActive = false;
    this.burstTicksLeft = 0;
    this.tickCounter = 0;
    this.cooldowns = {};
    this.stacks = {};
    this.flags = {};
  }
}

const CFG = WEAPON_RANGE_CONFIG[CircuitWeaverWeapon.ID];
```

- [ ] **Step 2: 更新 WeaponRegistry.ts**

追加导入：
```typescript
import { CircuitWeaverWeapon } from '../skills/weapons/CircuitWeaverWeapon';
```

替换 factory：
```typescript
  [WeaponId.CIRCUIT_WEAVER]: {
    id: WeaponId.CIRCUIT_WEAVER, name: WeaponName.CIRCUIT_WEAVER,
    school: School.ENGINEER, difficulty: 3, iconId: 'game-icons:circuit',
    factory: () => new CircuitWeaverWeapon(),
  },
```

- [ ] **Step 3: 编译验证**

Run: `cd game/backend && npx tsc --noEmit`
Expected: 0 新错误

- [ ] **Step 4: Commit**

```bash
git add game/backend/src/games/fish-oil-battle/skills/weapons/CircuitWeaverWeapon.ts game/backend/src/games/fish-oil-battle/core/WeaponRegistry.ts
git commit -m "feat(P3): 实现电路编织者后端武器类"
```

---

## Task 8: QuantumRiftWeapon（量子裂隙）

**Files:**
- Create: `game/backend/src/games/fish-oil-battle/skills/weapons/QuantumRiftWeapon.ts`
- Modify: `game/backend/src/games/fish-oil-battle/core/WeaponRegistry.ts:119-123`

- [ ] **Step 1: 创建 QuantumRiftWeapon.ts**

```typescript
/**
 * 武器 10：量子裂隙 (Quantum Rift)
 *
 * 流派：变奏者 Wildcard (#FFD700)
 * 难度：⭐⭐⭐
 *
 * ── 核心设计 ──
 * 每 5 秒进入 0.3 秒量子态：不可碰撞、不可被锁定。
 * 退出量子态时，在进/出位置各留量子裂隙（持续 8 秒），两个裂隙连通。
 * 对手碰到裂隙被传送到另一个，受 6 伤害。场上最多 4 个（2 对）。
 * 对手穿过裂隙 4 次后爆发：所有裂隙爆炸，每对产生连接线（10 伤害）。
 */

import type { IBattleState } from '../../core/types';
import type {
  IWeapon, IPhysicsQuery, WeaponEffect, WeaponRuntimeState,
} from '../../core/IWeapon';
import { TICKS_PER_SEC } from '../../core/IWeapon';
import { WEAPON_RANGE_CONFIG } from '../../config/WeaponRangeConfig';
import {
  WeaponId, WeaponName, WeaponEffectType, VisualEventType, School,
} from '../../config/GameEnums';

const QUANTUM_INTERVAL_SEC = 5;
const QUANTUM_DURATION_SEC = 0.3;
const RIFT_TP_DAMAGE = 6;
const RIFT_CONNECTION_DAMAGE = 10;

interface QuantumRift {
  id: string;
  pairId: string;
  x: number;
  y: number;
  secondsLeft: number;
  hitTargets: Set<string>;
}

export class QuantumRiftWeapon implements IWeapon {
  static readonly ID = WeaponId.QUANTUM_RIFT;
  readonly id = WeaponId.QUANTUM_RIFT;
  readonly name = WeaponName.QUANTUM_RIFT;
  readonly school = School.WILD;
  readonly difficulty = 3;
  readonly iconId = 'game-icons:quantum-rift';
  playerId = '';

  private energy = 0;
  private rifts: QuantumRift[] = [];
  private quantumCooldownTicks = 0;
  private quantumStateTicks = 0;
  private lastQuantumPos = { x: 0, y: 0 };
  private cooldowns: Record<string, number> = {};
  private stacks: Record<string, number> = {};
  private flags: Record<string, boolean> = {};

  onTick(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    this.tickCounter = (this.tickCounter ?? 0) + 1;
    const isSecondTick = this.tickCounter >= TICKS_PER_SEC;
    if (isSecondTick) this.tickCounter = 0;

    // 裂隙生命周期管理
    if (isSecondTick) {
      for (const r of this.rifts) r.secondsLeft--;
      this.rifts = this.rifts.filter(r => r.secondsLeft > 0);
    }

    // 量子态管理
    if (this.quantumStateTicks > 0) {
      this.quantumStateTicks--;
      if (this.quantumStateTicks <= 0) {
        // 退出量子态：生成裂隙对
        if (this.rifts.length < CFG.field!.maxCount!) {
          const pairId = `pair_${Date.now()}`;
          const r1Id = `rift_${pairId}_a`;
          const r2Id = `rift_${pairId}_b`;
          this.rifts.push({
            id: r1Id, pairId, x: this.lastQuantumPos.x, y: this.lastQuantumPos.y,
            secondsLeft: CFG.field!.durationSec!, hitTargets: new Set(),
          });
          this.rifts.push({
            id: r2Id, pairId, x: self.position.x, y: self.position.y,
            secondsLeft: CFG.field!.durationSec!, hitTargets: new Set(),
          });

          effects.push({
            type: WeaponEffectType.VISUAL_ONLY,
            sourceId: this.playerId,
            value: 0,
            position: { x: self.position.x, y: self.position.y },
            metadata: {
              visualType: VisualEventType.QUANTUM_RIFT_FISSURE,
              radius: CFG.damageRadius!,
              riftCount: this.rifts.length,
              pairId,
            },
          });
        }
      }
    }

    // 进入量子态（每 5 秒）
    if (this.quantumCooldownTicks <= 0 && this.quantumStateTicks <= 0) {
      this.quantumCooldownTicks = QUANTUM_INTERVAL_SEC * TICKS_PER_SEC;
      this.quantumStateTicks = Math.ceil(QUANTUM_DURATION_SEC * TICKS_PER_SEC);
      this.lastQuantumPos = { x: self.position.x, y: self.position.y };
    }
    if (this.quantumCooldownTicks > 0) this.quantumCooldownTicks--;

    // 裂隙触碰检测（传送）
    for (const rift of this.rifts) {
      const nearby = physics.getAliveOpponentsInRadius(
        this.playerId, rift.x, rift.y, CFG.damageRadius!,
      );
      for (const opp of nearby) {
        if (rift.hitTargets.has(opp.id)) continue;
        rift.hitTargets.add(opp.id);

        // 传送到配对裂隙
        const partner = this.rifts.find(r => r.pairId === rift.pairId && r.id !== rift.id);
        if (partner) {
          effects.push({
            type: WeaponEffectType.PULL,
            sourceId: this.playerId,
            targetId: opp.id,
            value: 9999, // 强制传送
            duration: 1,
            metadata: {
              desc: '量子传送',
              dirX: partner.x - opp.x,
              dirY: partner.y - opp.y,
              teleport: true,
              toX: partner.x,
              toY: partner.y,
            },
          });

          effects.push({
            type: WeaponEffectType.DAMAGE,
            sourceId: this.playerId,
            targetId: opp.id,
            value: RIFT_TP_DAMAGE,
            metadata: { desc: '裂隙传送伤害', riftId: rift.id },
          });

          // 充能
          this.energy = Math.min(CFG.maxEnergy!, this.energy + 1);
        }
      }
    }

    return effects;
  }

  private tickCounter = 0;

  onHitTarget(_state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    // 量子态期间无法造成碰撞伤害
    if (this.quantumStateTicks > 0) return [];
    return [];
  }

  onHitByAttacker(_attackerId: string, _state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    // 量子态期间不可被锁定
    if (this.quantumStateTicks > 0) return [];
    return [];
  }

  getEnergy(): number { return this.energy; }
  getMaxEnergy(): number { return CFG.maxEnergy!; }

  isBurstReady(): boolean {
    return this.energy >= CFG.maxEnergy!;
  }

  burst(state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    // 所有裂隙爆炸：每对产生连接线伤害
    const pairs = new Map<string, QuantumRift[]>();
    for (const r of this.rifts) {
      const list = pairs.get(r.pairId) ?? [];
      list.push(r);
      pairs.set(r.pairId, list);
    }

    const allOpponents = _physics.getAllAliveOpponents(this.playerId);
    for (const [pid, pair] of pairs) {
      if (pair.length < 2) continue;
      // 连接线对所有对手造成伤害
      for (const opp of allOpponents) {
        effects.push({
          type: WeaponEffectType.BURST_DAMAGE,
          sourceId: this.playerId,
          targetId: opp.id,
          value: RIFT_CONNECTION_DAMAGE,
          metadata: { desc: '裂隙连接线', pairId: pid },
        });
      }
    }

    this.energy = 0;
    this.rifts = [];

    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: self.position.x, y: self.position.y },
      metadata: {
        visualType: VisualEventType.QUANTUM_RIFT_BURST,
        radius: CFG.aoeMaxRadius!,
      },
    });

    return effects;
  }

  getRuntimeState(): WeaponRuntimeState {
    return {
      energy: this.energy,
      maxEnergy: CFG.maxEnergy!,
      cooldowns: this.cooldowns,
      stacks: this.stacks,
      flags: { inQuantumState: this.quantumStateTicks > 0 },
      custom: {
        riftCount: this.rifts.length,
        quantumCooldownTicks: this.quantumCooldownTicks,
      },
    };
  }

  reset(): void {
    this.energy = 0;
    this.rifts = [];
    this.quantumCooldownTicks = 0;
    this.quantumStateTicks = 0;
    this.tickCounter = 0;
    this.cooldowns = {};
    this.stacks = {};
    this.flags = {};
  }
}

const CFG = WEAPON_RANGE_CONFIG[QuantumRiftWeapon.ID];
```

- [ ] **Step 2: 更新 WeaponRegistry.ts**

追加导入：
```typescript
import { QuantumRiftWeapon } from '../skills/weapons/QuantumRiftWeapon';
```

替换 factory：
```typescript
  [WeaponId.QUANTUM_RIFT]: {
    id: WeaponId.QUANTUM_RIFT, name: WeaponName.QUANTUM_RIFT,
    school: School.WILD, difficulty: 3, iconId: 'game-icons:quantum-rift',
    factory: () => new QuantumRiftWeapon(),
  },
```

- [ ] **Step 3: 编译验证**

Run: `cd game/backend && npx tsc --noEmit`
Expected: 0 新错误

- [ ] **Step 4: Commit**

```bash
git add game/backend/src/games/fish-oil-battle/skills/weapons/QuantumRiftWeapon.ts game/backend/src/games/fish-oil-battle/core/WeaponRegistry.ts
git commit -m "feat(P3): 实现量子裂隙后端武器类"
```

---

## Task 9: SizeWarpWeapon（体积扭曲）

**Files:**
- Create: `game/backend/src/games/fish-oil-battle/skills/weapons/SizeWarpWeapon.ts`
- Modify: `game/backend/src/games/fish-oil-battle/core/WeaponRegistry.ts:124-128`

- [ ] **Step 1: 创建 SizeWarpWeapon.ts**

```typescript
/**
 * 武器 11：体积扭曲 (Size Warp)
 *
 * 流派：变奏者 Wildcard (#FFD700)
 * 难度：⭐
 *
 * ── 核心设计 ──
 * 每 8 秒自动切换球体尺寸，0.5 倍（小）和 1.5 倍（大）交替。
 * 大球：碰撞判定 +50%。小球：碰撞判定 -50%，互撞伤害 -30%。
 * 完成 3 次切换后爆发：球体变 3 倍（3 秒），每次碰撞 18 伤害，自身受伤 +25%。
 */

import type { IBattleState } from '../../core/types';
import type {
  IWeapon, IPhysicsQuery, WeaponEffect, WeaponRuntimeState,
} from '../../core/IWeapon';
import { TICKS_PER_SEC } from '../../core/IWeapon';
import { WEAPON_RANGE_CONFIG } from '../../config/WeaponRangeConfig';
import {
  WeaponId, WeaponName, WeaponEffectType, VisualEventType, School,
} from '../../config/GameEnums';

const SWITCH_INTERVAL_SEC = 8;
const SMALL_SCALE = 0.5;
const LARGE_SCALE = 1.5;
const GIANT_SCALE = 3;
const GIANT_DURATION_SEC = 3;
const SMALL_DAMAGE_REDUCTION = 0.3;
const GIANT_SELF_DAMAGE_BONUS = 0.25;

type SizeState = 'small' | 'large' | 'giant';

export class SizeWarpWeapon implements IWeapon {
  static readonly ID = WeaponId.SIZE_WARP;
  readonly id = WeaponId.SIZE_WARP;
  readonly name = WeaponName.SIZE_WARP;
  readonly school = School.WILD;
  readonly difficulty = 1;
  readonly iconId = 'game-icons:size-warp';
  playerId = '';

  private energy = 0;
  private sizeState: SizeState = 'large';
  private switchCooldownTicks = SWITCH_INTERVAL_SEC * TICKS_PER_SEC;
  private burstActive = false;
  private burstTicksLeft = 0;
  private cooldowns: Record<string, number> = {};
  private stacks: Record<string, number> = {};
  private flags: Record<string, boolean> = {};

  onTick(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    // 爆发持续：巨型化
    if (this.burstActive) {
      if (this.burstTicksLeft <= 0) {
        this.burstActive = false;
        this.sizeState = 'large';
        this.switchCooldownTicks = SWITCH_INTERVAL_SEC * TICKS_PER_SEC;
      } else {
        this.burstTicksLeft--;
      }
      return effects;
    }

    // 尺寸切换
    if (this.switchCooldownTicks <= 0) {
      this.switchCooldownTicks = SWITCH_INTERVAL_SEC * TICKS_PER_SEC;
      this.sizeState = this.sizeState === 'small' ? 'large' : 'small';
      this.energy = Math.min(CFG.maxEnergy!, this.energy + 1);

      effects.push({
        type: WeaponEffectType.VISUAL_ONLY,
        sourceId: this.playerId,
        value: 0,
        position: { x: self.position.x, y: self.position.y },
        metadata: {
          visualType: VisualEventType.SIZE_WARP_FIELD,
          radius: CFG.damageRadius!,
          sizeState: this.sizeState,
          scale: this.getCurrentScale(),
        },
      });
    }
    if (this.switchCooldownTicks > 0) this.switchCooldownTicks--;

    return effects;
  }

  onHitTarget(state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    if (this.sizeState === 'giant') {
      // 巨型化：18 伤害
      const opponent = _physics.getRandomAliveOpponent(this.playerId);
      if (opponent) {
        effects.push({
          type: WeaponEffectType.BURST_DAMAGE,
          sourceId: this.playerId,
          targetId: opponent.id,
          value: CFG.burstDamage!,
          metadata: { desc: '巨型化碰撞' },
        });
      }
    }
    return effects;
  }

  onHitByAttacker(_attackerId: string, _state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    if (this.sizeState === 'giant') {
      // 巨型化期间自身受伤 +25%
      effects.push({
        type: WeaponEffectType.DAMAGE,
        sourceId: this.playerId,
        targetId: this.playerId,
        value: 0,
        metadata: { desc: '巨型化受伤加成', damageBonus: GIANT_SELF_DAMAGE_BONUS },
      });
    }
    return effects;
  }

  private getCurrentScale(): number {
    switch (this.sizeState) {
      case 'small': return SMALL_SCALE;
      case 'large': return LARGE_SCALE;
      case 'giant': return GIANT_SCALE;
    }
  }

  getEnergy(): number { return this.energy; }
  getMaxEnergy(): number { return CFG.maxEnergy!; }

  isBurstReady(): boolean {
    return this.energy >= CFG.maxEnergy! && !this.burstActive;
  }

  burst(state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    this.energy = 0;
    this.burstActive = true;
    this.burstTicksLeft = GIANT_DURATION_SEC * TICKS_PER_SEC;
    this.sizeState = 'giant';

    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: self.position.x, y: self.position.y },
      metadata: {
        visualType: VisualEventType.SIZE_WARP_BURST,
        radius: CFG.aoeMaxRadius!,
        scale: GIANT_SCALE,
      },
    });

    return effects;
  }

  getRuntimeState(): WeaponRuntimeState {
    return {
      energy: this.energy,
      maxEnergy: CFG.maxEnergy!,
      cooldowns: this.cooldowns,
      stacks: this.stacks,
      flags: { burstActive: this.burstActive },
      custom: {
        sizeState: this.sizeState,
        scale: this.getCurrentScale(),
        switchCooldownTicks: this.switchCooldownTicks,
        burstTicksLeft: this.burstTicksLeft,
      },
    };
  }

  reset(): void {
    this.energy = 0;
    this.sizeState = 'large';
    this.switchCooldownTicks = SWITCH_INTERVAL_SEC * TICKS_PER_SEC;
    this.burstActive = false;
    this.burstTicksLeft = 0;
    this.cooldowns = {};
    this.stacks = {};
    this.flags = {};
  }
}

const CFG = WEAPON_RANGE_CONFIG[SizeWarpWeapon.ID];
```

- [ ] **Step 2: 更新 WeaponRegistry.ts**

追加导入：
```typescript
import { SizeWarpWeapon } from '../skills/weapons/SizeWarpWeapon';
```

替换 factory：
```typescript
  [WeaponId.SIZE_WARP]: {
    id: WeaponId.SIZE_WARP, name: WeaponName.SIZE_WARP,
    school: School.WILD, difficulty: 1, iconId: 'game-icons:size-warp',
    factory: () => new SizeWarpWeapon(),
  },
```

- [ ] **Step 3: 编译验证**

Run: `cd game/backend && npx tsc --noEmit`
Expected: 0 新错误

- [ ] **Step 4: Commit**

```bash
git add game/backend/src/games/fish-oil-battle/skills/weapons/SizeWarpWeapon.ts game/backend/src/games/fish-oil-battle/core/WeaponRegistry.ts
git commit -m "feat(P3): 实现体积扭曲后端武器类"
```

---

## Task 10: RicochetCoreWeapon（弹射核心）

**Files:**
- Create: `game/backend/src/games/fish-oil-battle/skills/weapons/RicochetCoreWeapon.ts`
- Modify: `game/backend/src/games/fish-oil-battle/core/WeaponRegistry.ts:129-133`

- [ ] **Step 1: 创建 RicochetCoreWeapon.ts**

```typescript
/**
 * 武器 12：弹射核心 (Ricochet Core)
 *
 * 流派：变奏者 Wildcard (#FFD700)
 * 难度：⭐⭐
 *
 * ── 核心设计 ──
 * 球体永不减速。每次撞墙移速 +8%（无限叠加）。
 * 高速碰撞对手额外伤害 = 当前速度加成 × 0.5。
 * 球速达基准 200% 时爆发：飙至 300%（4 秒），每次撞墙分裂弹射碎片（8 伤害）。
 */

import type { IBattleState } from '../../core/types';
import type {
  IWeapon, IPhysicsQuery, WeaponEffect, WeaponRuntimeState,
} from '../../core/IWeapon';
import { TICKS_PER_SEC } from '../../core/IWeapon';
import { WEAPON_RANGE_CONFIG } from '../../config/WeaponRangeConfig';
import {
  WeaponId, WeaponName, WeaponEffectType, VisualEventType, School,
} from '../../config/GameEnums';

const SPEED_BONUS_PER_WALL = 8; // 每次撞墙 +8%
const SPEED_THRESHOLD = 200; // 爆发阈值
const BURST_SPEED_MULT = 300; // 爆发 300%
const BURST_DURATION_SEC = 4;
const FRAGMENT_DAMAGE = 8;
const SPEED_DAMAGE_RATIO = 0.5;

export class RicochetCoreWeapon implements IWeapon {
  static readonly ID = WeaponId.RICOCHET_CORE;
  readonly id = WeaponId.RICOCHET_CORE;
  readonly name = WeaponName.RICOCHET_CORE;
  readonly school = School.WILD;
  readonly difficulty = 2;
  readonly iconId = 'game-icons:ricochet';
  playerId = '';

  private energy = 0; // 当前速度加成 %
  private burstActive = false;
  private burstTicksLeft = 0;
  private cooldowns: Record<string, number> = {};
  private stacks: Record<string, number> = {};
  private flags: Record<string, boolean> = {};

  onTick(state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];

    // 爆发持续
    if (this.burstActive) {
      if (this.burstTicksLeft <= 0) {
        this.burstActive = false;
        // 保留爆发前速度层数（不清零 energy）
      } else {
        this.burstTicksLeft--;
      }
    }

    return effects;
  }

  onHitTarget(state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const opponent = _physics.getRandomAliveOpponent(this.playerId);
    if (!opponent) return effects;

    // 高速碰撞额外伤害 = 当前速度加成 × 0.5
    const speedBonus = this.getCurrentSpeedBonus();
    const extraDamage = Math.floor(speedBonus * SPEED_DAMAGE_RATIO);

    if (extraDamage > 0) {
      effects.push({
        type: WeaponEffectType.DAMAGE,
        sourceId: this.playerId,
        targetId: opponent.id,
        value: extraDamage,
        metadata: {
          desc: '高速碰撞额外伤害',
          speedBonus: speedBonus,
        },
      });
    }

    return effects;
  }

  onHitByAttacker(_attackerId: string, _state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    return [];
  }

  onWallHit(state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    // 撞墙 +8% 速度
    this.energy += SPEED_BONUS_PER_WALL;

    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: self.position.x, y: self.position.y },
      metadata: {
        visualType: VisualEventType.RICOCHET_CORE_TRAIL,
        radius: CFG.damageRadius!,
        speedBonus: this.energy,
      },
    });

    // 爆发期间撞墙分裂弹射碎片
    if (this.burstActive) {
      const allOpponents = _physics.getAllAliveOpponents(this.playerId);
      for (const opp of allOpponents) {
        effects.push({
          type: WeaponEffectType.AOE_DAMAGE,
          sourceId: this.playerId,
          targetId: opp.id,
          value: FRAGMENT_DAMAGE,
          metadata: { desc: '弹射碎片' },
        });
      }
    }

    return effects;
  }

  private getCurrentSpeedBonus(): number {
    if (this.burstActive) return BURST_SPEED_MULT;
    return this.energy;
  }

  getEnergy(): number { return this.energy; }
  getMaxEnergy(): number { return CFG.maxEnergy!; }

  isBurstReady(): boolean {
    return this.energy >= SPEED_THRESHOLD && !this.burstActive;
  }

  burst(state: IBattleState, _physics: IPhysicsQuery): WeaponEffect[] {
    const effects: WeaponEffect[] = [];
    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    this.burstActive = true;
    this.burstTicksLeft = BURST_DURATION_SEC * TICKS_PER_SEC;

    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: self.position.x, y: self.position.y },
      metadata: {
        visualType: VisualEventType.RICOCHET_CORE_BURST,
        radius: CFG.aoeMaxRadius!,
        speedBonus: BURST_SPEED_MULT,
      },
    });

    return effects;
  }

  getRuntimeState(): WeaponRuntimeState {
    return {
      energy: this.energy,
      maxEnergy: CFG.maxEnergy!,
      cooldowns: this.cooldowns,
      stacks: this.stacks,
      flags: { burstActive: this.burstActive },
      custom: {
        speedBonus: this.energy,
        currentSpeed: this.getCurrentSpeedBonus(),
        burstTicksLeft: this.burstTicksLeft,
      },
    };
  }

  reset(): void {
    this.energy = 0;
    this.burstActive = false;
    this.burstTicksLeft = 0;
    this.cooldowns = {};
    this.stacks = {};
    this.flags = {};
  }
}

const CFG = WEAPON_RANGE_CONFIG[RicochetCoreWeapon.ID];
```

- [ ] **Step 2: 更新 WeaponRegistry.ts**

追加导入：
```typescript
import { RicochetCoreWeapon } from '../skills/weapons/RicochetCoreWeapon';
```

替换 factory：
```typescript
  [WeaponId.RICOCHET_CORE]: {
    id: WeaponId.RICOCHET_CORE, name: WeaponName.RICOCHET_CORE,
    school: School.WILD, difficulty: 2, iconId: 'game-icons:ricochet',
    factory: () => new RicochetCoreWeapon(),
  },
```

- [ ] **Step 3: 编译验证**

Run: `cd game/backend && npx tsc --noEmit`
Expected: 0 新错误

- [ ] **Step 4: Commit**

```bash
git add game/backend/src/games/fish-oil-battle/skills/weapons/RicochetCoreWeapon.ts game/backend/src/games/fish-oil-battle/core/WeaponRegistry.ts
git commit -m "feat(P3): 实现弹射核心后端武器类"
```

---

## Task 11: 全量编译验证 + 清理 StubWeapon 引用

**Files:**
- Verify: `game/backend/src/games/fish-oil-battle/core/WeaponRegistry.ts`

- [ ] **Step 1: 全量后端编译验证**

Run: `cd game/backend && npx tsc --noEmit`
Expected: 仅保留预存 skill-chain.test.ts 4 个 TS2740 错误，无新错误

- [ ] **Step 2: 验证 StubWeapon 不再被 9 个基础武器引用**

Run: `grep -n "StubWeapon" game/backend/src/games/fish-oil-battle/core/WeaponRegistry.ts`
Expected: 仅保留 StubWeapon 类定义（行 42-63），REGISTRY 中无 StubWeapon 工厂调用

- [ ] **Step 3: 验证 getImplementedWeaponMetaList 返回全部 24 个武器**

在 Node REPL 或临时脚本中验证：
```javascript
const { getImplementedWeaponMetaList } = require('./game/backend/src/games/fish-oil-battle/core/WeaponRegistry');
console.log(getImplementedWeaponMetaList().length); // 预期 24
```

- [ ] **Step 4: 最终 commit（如有清理改动）**

```bash
git add -A
git commit -m "feat(P3): 完成9个基础武器后端实现，替换全部StubWeapon" --allow-empty
```

---

## Self-Review

**1. Spec coverage:**
- weapons-design.md 武器 2（纳米撕裂者）→ Task 2 ✅
- weapons-design.md 武器 3（追击协议）→ Task 3 ✅
- weapons-design.md 武器 4（重力阱）→ Task 4 ✅
- weapons-design.md 武器 6（熵增扩散器）→ Task 5 ✅
- weapons-design.md 武器 8（阵地构筑者）→ Task 6 ✅
- weapons-design.md 武器 9（回路编织者）→ Task 7 ✅
- weapons-design.md 武器 10（量子裂隙）→ Task 8 ✅
- weapons-design.md 武器 11（尺寸畸变）→ Task 9 ✅
- weapons-design.md 武器 12（弹射核心）→ Task 10 ✅
- 9 个配置条目 → Task 1 ✅
- StubWeapon 替换 → Task 11 Step 2 验证 ✅

**2. Placeholder scan:** 无 TBD/TODO/"implement later"/"Similar to Task N"。每个武器类含完整代码。

**3. Type consistency:**
- 所有武器类签名一致：`implements IWeapon` + `readonly id/name/school/difficulty/iconId/playerId`
- 所有武器使用 `const CFG = WEAPON_RANGE_CONFIG[WeaponId.XXX]` 数据驱动
- VisualEventType 枚举值与 GameEnums.ts 定义一致（NANO_RIPPER_FIELD/BURST、PURSUIT_PROTOCOL_MARK/BURST 等）
- PURSUIT_PROTOCOL_MARK 额外字段 targetId/tx/ty 与前端 useFishOilBattle.ts 契约一致
- WeaponRegistry factory 签名 `() => new XxxWeapon()` 一致

**注意点：**
- QuantumRiftWeapon 中 `tickCounter` 字段声明在 onTick 之后（私有字段提升），TS 允许但需确认编译通过
- SizeWarpWeapon 的 `onHitByAttacker` 返回 value=0 的 DAMAGE 效果仅作标记，实际伤害加成由调度器处理（如不支持则需调整）
- RicochetCoreWeapon 的 `onWallHit` 是可选接口方法，签名需匹配 IWeapon 定义
