# 增强测试模式实战测试 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增强测试模式的实战测试能力：能量统一为百分比 0-100、调整 5 个难以爆发武器的数值、新增 4 个调试功能（指定 Bot 武器、禁用武器池、能量/爆发调试、运行时状态查看）。

**Architecture:** 在 IWeapon 接口新增 `setEnergy(percent)` 方法，所有 24 个武器的 `getEnergy()/getMaxEnergy()` 改为返回百分比 0-100。WeaponScheduler 新增 `setEnergy` + `debugForceBurst`。FishOilRoom 新增 5 个命令路由 + `handleStartTestMode` 扩展参数 + `broadcastGameState` 增加 runtimeState 序列化。前端 BattleTestPanel 侧边栏扩展至 4 个折叠区。

**Tech Stack:** TypeScript 5.x, Vue 3 + Composition API, DaisyUI, IWeapon 接口, WeaponScheduler 调度器, TICKS_PER_SEC=20。

**设计文档:** `docs/superpowers/specs/2026-06-28-enhanced-test-mode-design.md`

---

## File Structure

**修改文件:**
- `game/backend/src/games/fish-oil-battle/core/IWeapon.ts` — 接口新增 setEnergy
- `game/backend/src/games/fish-oil-battle/core/WeaponRegistry.ts` — StubWeapon 实现 setEnergy
- `game/backend/src/games/fish-oil-battle/core/WeaponScheduler.ts` — 新增 setEnergy + debugForceBurst
- `game/backend/src/games/fish-oil-battle/config/WeaponRangeConfig.ts` — 5 个武器数值调整
- `game/backend/src/games/fish-oil-battle/FishOilRoom.ts` — 命令路由 + handleStartTestMode + broadcastGameState
- `game/backend/src/games/fish-oil-battle/shared/protocol.ts` — GameStatePlayer.runtimeState
- `game/backend/src/games/fish-oil-battle/skills/weapons/*.ts` (24 个) — 各武器 setEnergy + getEnergy/getMaxEnergy 改百分比
- `game/frontend/src/components/fish-oil-battle/components/BattleTestPanel.vue` — UI 增强

**武器 maxEnergy 引用模式（5 种）:**
- 模式 A: `CFG.maxEnergy!`（文件底部 `const CFG`）— 11 个武器
- 模式 B: `WEAPON_RANGE_CONFIG[this.id].maxEnergy!`（方法内局部）— 3 个武器
- 模式 C: `WEAPON_RANGE_CONFIG[this.id]?.maxEnergy ?? N`（带默认值）— 5 个武器
- 模式 D: `burstEnergyCost ?? maxEnergy`（双字段回退）— 4 个武器
- 模式 E: `CFG.hiveMother!.maxEnergy`（嵌套子对象）— 1 个武器

---

## Task 1: IWeapon 接口扩展 + StubWeapon 实现

**Files:**
- Modify: `game/backend/src/games/fish-oil-battle/core/IWeapon.ts`
- Modify: `game/backend/src/games/fish-oil-battle/core/WeaponRegistry.ts`（StubWeapon 类）

- [ ] **Step 1: 在 IWeapon.ts 接口中新增 setEnergy 方法声明**

在 `game/backend/src/games/fish-oil-battle/core/IWeapon.ts` 的 `IWeapon` interface 中，在 `getMaxEnergy()` 方法声明之后、`isBurstReady()` 之前，插入：

```typescript
  /**
   * 调试用：设置能量值（百分比 0-100）
   * - 接收 0-100 的百分比值
   * - 内部转换为武器原始单位存储
   * - 不触发爆发，需另行调用 burst()
   */
  setEnergy(percent: number): void;
```

- [ ] **Step 2: 修改 IWeapon.ts 中 getEnergy/getMaxEnergy 的注释**

将 `getEnergy()` 和 `getMaxEnergy()` 的 JSDoc 注释更新为：

```typescript
  /**
   * 获取当前能量百分比（0-100）
   * - 内部原单位动态计算为百分比返回
   * - 所有武器统一返回 0-100
   */
  getEnergy(): number;

  /**
   * 获取最大能量值（固定返回 100）
   * - 所有武器统一返回 100
   */
  getMaxEnergy(): number;
```

- [ ] **Step 3: 在 WeaponRegistry.ts 的 StubWeapon 类中实现 setEnergy**

在 `game/backend/src/games/fish-oil-battle/core/WeaponRegistry.ts` 的 `StubWeapon` 类中，在 `getMaxEnergy()` 方法之后插入：

```typescript
  setEnergy(_percent: number): void {}
```

- [ ] **Step 4: 编译验证**

Run: `cd game/backend && npx tsc --noEmit`
Expected: 0 新错误（仅预存 skill-chain.test.ts 4 个 TS2740 错误）

- [ ] **Step 5: Commit**

```bash
cd game/backend && git add src/games/fish-oil-battle/core/IWeapon.ts src/games/fish-oil-battle/core/WeaponRegistry.ts && git commit -m "feat: IWeapon接口新增setEnergy方法 + StubWeapon实现"
```

---

## Task 2: WeaponScheduler 扩展

**Files:**
- Modify: `game/backend/src/games/fish-oil-battle/core/WeaponScheduler.ts`

- [ ] **Step 1: 在 WeaponScheduler.ts 中新增 setEnergy 方法**

在 `game/backend/src/games/fish-oil-battle/core/WeaponScheduler.ts` 的 `forceBurst` 方法之后（约 164 行后），插入：

```typescript
  /**
   * 调试用：设置某玩家武器能量（百分比 0-100）
   * - 仅用于测试模式
   * - percent 范围 0-100
   */
  setEnergy(playerId: string, percent: number): void {
    const weapon = this.bindings.get(playerId);
    if (weapon) weapon.setEnergy(percent);
  }

  /**
   * 调试用：强制爆发（绕过 isBurstReady 检查）
   * - 直接调用 weapon.burst()，不检查能量是否满
   * - 仍会触发 applyWeaponEffects 应用效果
   */
  debugForceBurst(playerId: string, state: IBattleState): WeaponEffect[] {
    const weapon = this.bindings.get(playerId);
    if (!weapon) return [];
    const effects = weapon.burst(state, this.physicsQuery);
    this.applyWeaponEffects(state, effects);
    return effects;
  }
```

- [ ] **Step 2: 确认 IBattleState 和 WeaponEffect 已导入**

检查文件顶部 import 是否已包含 `IBattleState` 和 `WeaponEffect`。若未导入，在现有 import 中补充：

```typescript
import type { IBattleState } from './types';
import type { IWeapon, WeaponEffect, IPhysicsQuery, WeaponRuntimeState } from './IWeapon';
```

- [ ] **Step 3: 编译验证**

Run: `cd game/backend && npx tsc --noEmit`
Expected: 0 新错误

- [ ] **Step 4: Commit**

```bash
cd game/backend && git add src/games/fish-oil-battle/core/WeaponScheduler.ts && git commit -m "feat: WeaponScheduler新增setEnergy和debugForceBurst方法"
```

---

## Task 3: WeaponRangeConfig 数值平衡调整

**Files:**
- Modify: `game/backend/src/games/fish-oil-battle/config/WeaponRangeConfig.ts`

- [ ] **Step 1: 调整 NanoRipper 配置**

在 `game/backend/src/games/fish-oil-battle/config/WeaponRangeConfig.ts` 中找到 `[WeaponId.NANO_RIPPER]` 配置块，修改以下字段：

```typescript
  [WeaponId.NANO_RIPPER]: {
    damage: 4,
    burstDamage: 6,
    maxEnergy: 3,                  // 旧值 4 → 新值 3（降低爆发阈值）
    energyPerHit: 1,
    burstEnergyCost: 3,           // 旧值 4 → 新值 3（配合 maxEnergy）
    damageRadius: 80,             // 旧值 40 → 新值 80（扩大扫荡半径）
    aoeMaxRadius: 60,
    visualRadius: 80,              // 旧值 40 → 新值 80（配合 damageRadius）
    visualDurationMs: 2000,
    burstDurationSec: 2,
    cooldownMs: 3000,              // 旧值 6000 → 新值 3000（缩短扫荡 CD）
    field: {
      maxCount: 1,
      radius: 80,                  // 旧值 40 → 新值 80（配合 damageRadius）
      durationSec: 2,
      contactDamage: 4,
      slowPercent: 30,
    },
    triggerCooldowns: { hitTargetSec: 0.5 },
  },
```

- [ ] **Step 2: 调整 RicochetCore 配置**

找到 `[WeaponId.RICOCHET_CORE]` 配置块，修改以下字段：

```typescript
  [WeaponId.RICOCHET_CORE]: {
    damage: 0,
    burstDamage: 8,
    maxEnergy: 100,                 // 旧值 200 → 新值 100（速度阈值减半，12 次撞墙即可爆发）
    damageRadius: 40,
    aoeMaxRadius: 200,
    visualRadius: 40,
    visualDurationMs: 4000,
    burstDurationSec: 4,
    cooldownMs: 1000,
    field: {
      maxCount: 1,
      radius: 40,
      durationSec: 4,
    },
    triggerCooldowns: { wallHitSec: 0.3 },
  },
```

- [ ] **Step 3: 调整 CircuitWeaver 配置**

找到 `[WeaponId.CIRCUIT_WEAVER]` 配置块，修改以下字段：

```typescript
  [WeaponId.CIRCUIT_WEAVER]: {
    damage: 8,
    burstDamage: 12,
    maxEnergy: 300,                 // 旧值 600 → 新值 300（回路长度阈值减半）
    energyPerHit: 60,              // 旧值 30 → 新值 60（加快充能速度）
    burstEnergyCost: 300,          // 旧值 600 → 新值 300（配合 maxEnergy）
    damageRadius: 20,
    aoeMaxRadius: 200,
    visualRadius: 20,
    visualDurationMs: 6000,
    burstDurationSec: 4,
    cooldownMs: 2000,
    field: {
      maxCount: 20,
      radius: 20,
      durationSec: 6,
    },
    triggerCooldowns: { minIntervalMs: 500 },
  },
```

- [ ] **Step 4: 调整 BastionBuilder 配置**

找到 `[WeaponId.BASTION_BUILDER]` 配置块，修改以下字段：

```typescript
  [WeaponId.BASTION_BUILDER]: {
    damage: 4,
    burstDamage: 12,
    maxEnergy: 4,                   // 旧值 6 → 新值 4（降低爆发阈值）
    energyPerHit: 1,
    burstEnergyCost: 4,            // 旧值 6 → 新值 4（配合 maxEnergy）
    damageRadius: 50,
    aoeMaxRadius: 200,
    visualRadius: 50,
    visualDurationMs: 12000,
    burstDurationSec: 5,
    cooldownMs: 5000,
    field: {
      maxCount: 4,                  // 旧值 6 → 新值 4（配合 maxEnergy）
      radius: 50,
      durationSec: 12,
      contactDamage: 4,
    },
    triggerCooldowns: { wallHitSec: 0.5 },
  },
```

- [ ] **Step 5: 调整 EntropyDiffuser 配置**

找到 `[WeaponId.ENTROPY_DIFFUSER]` 配置块，修改以下字段：

```typescript
  [WeaponId.ENTROPY_DIFFUSER]: {
    damage: 0,
    burstDamage: 5,
    maxEnergy: 10,                  // 旧值 20 → 新值 10（油膜段数阈值减半）
    energyPerHit: 1,
    burstEnergyCost: 10,           // 旧值 20 → 新值 10（配合 maxEnergy）
    damageRadius: 40,
    aoeMaxRadius: 200,
    visualRadius: 40,
    visualDurationMs: 4000,
    burstDurationSec: 3,
    cooldownMs: 12000,
    field: {
      maxCount: 10,                 // 旧值 20 → 新值 10（配合 maxEnergy）
      radius: 40,
      durationSec: 4,
    },
    triggerCooldowns: { minIntervalMs: 500 },
  },
```

- [ ] **Step 6: 编译验证**

Run: `cd game/backend && npx tsc --noEmit`
Expected: 0 新错误

- [ ] **Step 7: Commit**

```bash
cd game/backend && git add src/games/fish-oil-battle/config/WeaponRangeConfig.ts && git commit -m "feat: 5个难以爆发武器数值平衡调整"
```

---

## Task 4: 5 个 CFG 模式基础武器实现 setEnergy + 修改 getEnergy/getMaxEnergy

**Files:**
- Modify: `game/backend/src/games/fish-oil-battle/skills/weapons/NanoRipperWeapon.ts`
- Modify: `game/backend/src/games/fish-oil-battle/skills/weapons/PursuitProtocolWeapon.ts`
- Modify: `game/backend/src/games/fish-oil-battle/skills/weapons/GravityWellWeapon.ts`
- Modify: `game/backend/src/games/fish-oil-battle/skills/weapons/EntropyDiffuserWeapon.ts`
- Modify: `game/backend/src/games/fish-oil-battle/skills/weapons/BastionBuilderWeapon.ts`

**模式 A 转换公式（适用于所有 CFG.maxEnergy! 模式武器）:**
```typescript
getEnergy(): number {
  return Math.round(this.energy / CFG.maxEnergy! * 100);
}
getMaxEnergy(): number {
  return 100;
}
setEnergy(percent: number): void {
  this.energy = Math.max(0, Math.min(CFG.maxEnergy!, percent / 100 * CFG.maxEnergy!));
}
```

- [ ] **Step 1: 修改 NanoRipperWeapon.ts**

在 `game/backend/src/games/fish-oil-battle/skills/weapons/NanoRipperWeapon.ts` 中：

1. 找到 `getEnergy()` 方法，替换为：
```typescript
  getEnergy(): number {
    return Math.round(this.energy / CFG.maxEnergy! * 100);
  }
```

2. 找到 `getMaxEnergy()` 方法，替换为：
```typescript
  getMaxEnergy(): number {
    return 100;
  }
```

3. 在 `getMaxEnergy()` 方法之后新增 `setEnergy` 方法：
```typescript
  setEnergy(percent: number): void {
    this.energy = Math.max(0, Math.min(CFG.maxEnergy!, percent / 100 * CFG.maxEnergy!));
  }
```

- [ ] **Step 2: 修改 PursuitProtocolWeapon.ts**

对 `game/backend/src/games/fish-oil-battle/skills/weapons/PursuitProtocolWeapon.ts` 执行与 Step 1 完全相同的 3 处修改（getEnergy / getMaxEnergy / 新增 setEnergy）。

- [ ] **Step 3: 修改 GravityWellWeapon.ts**

对 `game/backend/src/games/fish-oil-battle/skills/weapons/GravityWellWeapon.ts` 执行与 Step 1 完全相同的 3 处修改。

- [ ] **Step 4: 修改 EntropyDiffuserWeapon.ts**

对 `game/backend/src/games/fish-oil-battle/skills/weapons/EntropyDiffuserWeapon.ts` 执行与 Step 1 完全相同的 3 处修改。

- [ ] **Step 5: 修改 BastionBuilderWeapon.ts**

对 `game/backend/src/games/fish-oil-battle/skills/weapons/BastionBuilderWeapon.ts` 执行与 Step 1 完全相同的 3 处修改。

- [ ] **Step 6: 编译验证**

Run: `cd game/backend && npx tsc --noEmit`
Expected: 0 新错误

- [ ] **Step 7: Commit**

```bash
cd game/backend && git add src/games/fish-oil-battle/skills/weapons/NanoRipperWeapon.ts src/games/fish-oil-battle/skills/weapons/PursuitProtocolWeapon.ts src/games/fish-oil-battle/skills/weapons/GravityWellWeapon.ts src/games/fish-oil-battle/skills/weapons/EntropyDiffuserWeapon.ts src/games/fish-oil-battle/skills/weapons/BastionBuilderWeapon.ts && git commit -m "feat: 5个CFG模式基础武器能量百分比转换"
```

---

## Task 5: 5 个 CFG 模式现有武器实现 setEnergy + 修改 getEnergy/getMaxEnergy

**Files:**
- Modify: `game/backend/src/games/fish-oil-battle/skills/weapons/ShockwaveGeneratorWeapon.ts`
- Modify: `game/backend/src/games/fish-oil-battle/skills/weapons/FirewallProtocolWeapon.ts`
- Modify: `game/backend/src/games/fish-oil-battle/skills/weapons/CircuitWeaverWeapon.ts`
- Modify: `game/backend/src/games/fish-oil-battle/skills/weapons/QuantumRiftWeapon.ts`
- Modify: `game/backend/src/games/fish-oil-battle/skills/weapons/SizeWarpWeapon.ts`

**转换公式（与 Task 4 相同的模式 A）:**
```typescript
getEnergy(): number {
  return Math.round(this.energy / CFG.maxEnergy! * 100);
}
getMaxEnergy(): number {
  return 100;
}
setEnergy(percent: number): void {
  this.energy = Math.max(0, Math.min(CFG.maxEnergy!, percent / 100 * CFG.maxEnergy!));
}
```

- [ ] **Step 1: 修改 ShockwaveGeneratorWeapon.ts**

在 `game/backend/src/games/fish-oil-battle/skills/weapons/ShockwaveGeneratorWeapon.ts` 中：

1. 找到 `getEnergy()` 方法，替换为：
```typescript
  getEnergy(): number {
    return Math.round(this.energy / CFG.maxEnergy! * 100);
  }
```

2. 找到 `getMaxEnergy()` 方法，替换为：
```typescript
  getMaxEnergy(): number {
    return 100;
  }
```

3. 在 `getMaxEnergy()` 方法之后新增 `setEnergy` 方法：
```typescript
  setEnergy(percent: number): void {
    this.energy = Math.max(0, Math.min(CFG.maxEnergy!, percent / 100 * CFG.maxEnergy!));
  }
```

- [ ] **Step 2: 修改 FirewallProtocolWeapon.ts**

对 `game/backend/src/games/fish-oil-battle/skills/weapons/FirewallProtocolWeapon.ts` 执行与 Step 1 完全相同的 3 处修改。

- [ ] **Step 3: 修改 CircuitWeaverWeapon.ts**

对 `game/backend/src/games/fish-oil-battle/skills/weapons/CircuitWeaverWeapon.ts` 执行与 Step 1 完全相同的 3 处修改。

- [ ] **Step 4: 修改 QuantumRiftWeapon.ts**

对 `game/backend/src/games/fish-oil-battle/skills/weapons/QuantumRiftWeapon.ts` 执行与 Step 1 完全相同的 3 处修改。

- [ ] **Step 5: 修改 SizeWarpWeapon.ts**

对 `game/backend/src/games/fish-oil-battle/skills/weapons/SizeWarpWeapon.ts` 执行与 Step 1 完全相同的 3 处修改。

- [ ] **Step 6: 编译验证**

Run: `cd game/backend && npx tsc --noEmit`
Expected: 0 新错误

- [ ] **Step 7: Commit**

```bash
cd game/backend && git add src/games/fish-oil-battle/skills/weapons/ShockwaveGeneratorWeapon.ts src/games/fish-oil-battle/skills/weapons/FirewallProtocolWeapon.ts src/games/fish-oil-battle/skills/weapons/CircuitWeaverWeapon.ts src/games/fish-oil-battle/skills/weapons/QuantumRiftWeapon.ts src/games/fish-oil-battle/skills/weapons/SizeWarpWeapon.ts && git commit -m "feat: 5个CFG模式现有武器能量百分比转换"
```

---

## Task 6: RicochetCoreWeapon 特殊处理

**Files:**
- Modify: `game/backend/src/games/fish-oil-battle/skills/weapons/RicochetCoreWeapon.ts`

**特殊原因：**
1. `isBurstReady()` 使用硬编码常量 `SPEED_THRESHOLD = 200`，但 Task 3 已将 `maxEnergy` 改为 100，需同步修改
2. `burst()` 不清零 energy（设计如此，速度加成持续累积），无需修改
3. energy 既用于速度加成又用于充能，`getCurrentSpeedBonus()` 使用原始 `this.energy` 值，不受百分比影响

- [ ] **Step 1: 修改 isBurstReady() 使用 CFG.maxEnergy! 代替硬编码常量**

在 `game/backend/src/games/fish-oil-battle/skills/weapons/RicochetCoreWeapon.ts` 中：

找到 `isBurstReady()` 方法，替换为：
```typescript
  isBurstReady(): boolean {
    return this.energy >= CFG.maxEnergy! && !this.burstActive;
  }
```

- [ ] **Step 2: 修改 getEnergy() 返回百分比**

找到 `getEnergy()` 方法，替换为：
```typescript
  getEnergy(): number {
    return Math.round(this.energy / CFG.maxEnergy! * 100);
  }
```

- [ ] **Step 3: 修改 getMaxEnergy() 返回固定 100**

找到 `getMaxEnergy()` 方法，替换为：
```typescript
  getMaxEnergy(): number {
    return 100;
  }
```

- [ ] **Step 4: 新增 setEnergy 方法**

在 `getMaxEnergy()` 方法之后新增：
```typescript
  setEnergy(percent: number): void {
    this.energy = Math.max(0, Math.min(CFG.maxEnergy!, percent / 100 * CFG.maxEnergy!));
  }
```

- [ ] **Step 5: 确认 getCurrentSpeedBonus() 仍使用原始 this.energy**

确认 `getCurrentSpeedBonus()` 方法未被修改，仍为：
```typescript
  private getCurrentSpeedBonus(): number {
    if (this.burstActive) return BURST_SPEED_MULT;
    return this.energy;
  }
```

- [ ] **Step 6: 编译验证**

Run: `cd game/backend && npx tsc --noEmit`
Expected: 0 新错误

- [ ] **Step 7: Commit**

```bash
cd game/backend && git add src/games/fish-oil-battle/skills/weapons/RicochetCoreWeapon.ts && git commit -m "feat: RicochetCore能量百分比转换+isBurstReady修复"
```

---

## Task 7: 3 个 WEAPON_RANGE_CONFIG[this.id] 模式武器实现 setEnergy

**Files:**
- Modify: `game/backend/src/games/fish-oil-battle/skills/weapons/OpticalSlashWeapon.ts`
- Modify: `game/backend/src/games/fish-oil-battle/skills/weapons/AirRepulsionFieldWeapon.ts`
- Modify: `game/backend/src/games/fish-oil-battle/skills/weapons/EntropicTouchWeapon.ts`

**模式 B 转换公式:**
```typescript
getEnergy(): number {
  return Math.round(this.energy / WEAPON_RANGE_CONFIG[this.id].maxEnergy! * 100);
}
getMaxEnergy(): number {
  return 100;
}
setEnergy(percent: number): void {
  const max = WEAPON_RANGE_CONFIG[this.id].maxEnergy!;
  this.energy = Math.max(0, Math.min(max, percent / 100 * max));
}
```

- [ ] **Step 1: 修改 OpticalSlashWeapon.ts**

在 `game/backend/src/games/fish-oil-battle/skills/weapons/OpticalSlashWeapon.ts` 中：

1. 找到 `getEnergy()` 方法，替换为：
```typescript
  getEnergy(): number {
    return Math.round(this.energy / WEAPON_RANGE_CONFIG[this.id].maxEnergy! * 100);
  }
```

2. 找到 `getMaxEnergy()` 方法，替换为：
```typescript
  getMaxEnergy(): number {
    return 100;
  }
```

3. 在 `getMaxEnergy()` 方法之后新增 `setEnergy` 方法：
```typescript
  setEnergy(percent: number): void {
    const max = WEAPON_RANGE_CONFIG[this.id].maxEnergy!;
    this.energy = Math.max(0, Math.min(max, percent / 100 * max));
  }
```

- [ ] **Step 2: 修改 AirRepulsionFieldWeapon.ts**

对 `game/backend/src/games/fish-oil-battle/skills/weapons/AirRepulsionFieldWeapon.ts` 执行与 Step 1 完全相同的 3 处修改。

- [ ] **Step 3: 修改 EntropicTouchWeapon.ts**

对 `game/backend/src/games/fish-oil-battle/skills/weapons/EntropicTouchWeapon.ts` 执行与 Step 1 完全相同的 3 处修改。

- [ ] **Step 4: 编译验证**

Run: `cd game/backend && npx tsc --noEmit`
Expected: 0 新错误

- [ ] **Step 5: Commit**

```bash
cd game/backend && git add src/games/fish-oil-battle/skills/weapons/OpticalSlashWeapon.ts src/games/fish-oil-battle/skills/weapons/AirRepulsionFieldWeapon.ts src/games/fish-oil-battle/skills/weapons/EntropicTouchWeapon.ts && git commit -m "feat: 3个模式B武器能量百分比转换"
```

---

## Task 8: 5 个 ?? N 默认值模式武器实现 setEnergy

**Files:**
- Modify: `game/backend/src/games/fish-oil-battle/skills/weapons/DrawingManifestWeapon.ts`
- Modify: `game/backend/src/games/fish-oil-battle/skills/weapons/DischargeCatWeapon.ts`
- Modify: `game/backend/src/games/fish-oil-battle/skills/weapons/PrecognitiveLensWeapon.ts`
- Modify: `game/backend/src/games/fish-oil-battle/skills/weapons/EmotionalWeatherWeapon.ts`
- Modify: `game/backend/src/games/fish-oil-battle/skills/weapons/EmotionMasteryWeapon.ts`

**模式 C 转换公式（带默认值兜底）:**
```typescript
getEnergy(): number {
  const max = WEAPON_RANGE_CONFIG[this.id]?.maxEnergy ?? DEFAULT_MAX;
  return Math.round(this.energy / max * 100);
}
getMaxEnergy(): number {
  return 100;
}
setEnergy(percent: number): void {
  const max = WEAPON_RANGE_CONFIG[this.id]?.maxEnergy ?? DEFAULT_MAX;
  this.energy = Math.max(0, Math.min(max, percent / 100 * max));
}
```

**各武器默认值：** DrawingManifest=6, DischargeCat=6, PrecognitiveLens=6, EmotionalWeather=5, EmotionMastery=3

- [ ] **Step 1: 修改 DrawingManifestWeapon.ts**

在 `game/backend/src/games/fish-oil-battle/skills/weapons/DrawingManifestWeapon.ts` 中：

1. 找到 `getEnergy()` 方法，替换为：
```typescript
  getEnergy(): number {
    const max = WEAPON_RANGE_CONFIG[this.id]?.maxEnergy ?? 6;
    return Math.round(this.energy / max * 100);
  }
```

2. 找到 `getMaxEnergy()` 方法，替换为：
```typescript
  getMaxEnergy(): number {
    return 100;
  }
```

3. 在 `getMaxEnergy()` 方法之后新增 `setEnergy` 方法：
```typescript
  setEnergy(percent: number): void {
    const max = WEAPON_RANGE_CONFIG[this.id]?.maxEnergy ?? 6;
    this.energy = Math.max(0, Math.min(max, percent / 100 * max));
  }
```

- [ ] **Step 2: 修改 DischargeCatWeapon.ts**

对 `game/backend/src/games/fish-oil-battle/skills/weapons/DischargeCatWeapon.ts` 执行与 Step 1 完全相同的 3 处修改（默认值同为 6）。

- [ ] **Step 3: 修改 PrecognitiveLensWeapon.ts（特殊：字段名为 foresightStacks）**

在 `game/backend/src/games/fish-oil-battle/skills/weapons/PrecognitiveLensWeapon.ts` 中：

1. 找到 `getEnergy()` 方法，替换为：
```typescript
  getEnergy(): number {
    const max = WEAPON_RANGE_CONFIG[this.id]?.maxEnergy ?? 6;
    return Math.round(this.foresightStacks / max * 100);
  }
```

2. 找到 `getMaxEnergy()` 方法，替换为：
```typescript
  getMaxEnergy(): number {
    return 100;
  }
```

3. 在 `getMaxEnergy()` 方法之后新增 `setEnergy` 方法：
```typescript
  setEnergy(percent: number): void {
    const max = WEAPON_RANGE_CONFIG[this.id]?.maxEnergy ?? 6;
    this.foresightStacks = Math.max(0, Math.min(max, percent / 100 * max));
  }
```

- [ ] **Step 4: 修改 EmotionalWeatherWeapon.ts**

在 `game/backend/src/games/fish-oil-battle/skills/weapons/EmotionalWeatherWeapon.ts` 中执行类似 Step 1 的修改，但默认值改为 5：

```typescript
  getEnergy(): number {
    const max = WEAPON_RANGE_CONFIG[this.id]?.maxEnergy ?? 5;
    return Math.round(this.energy / max * 100);
  }
  getMaxEnergy(): number {
    return 100;
  }
  setEnergy(percent: number): void {
    const max = WEAPON_RANGE_CONFIG[this.id]?.maxEnergy ?? 5;
    this.energy = Math.max(0, Math.min(max, percent / 100 * max));
  }
```

- [ ] **Step 5: 修改 EmotionMasteryWeapon.ts**

在 `game/backend/src/games/fish-oil-battle/skills/weapons/EmotionMasteryWeapon.ts` 中执行类似 Step 1 的修改，但默认值改为 3：

```typescript
  getEnergy(): number {
    const max = WEAPON_RANGE_CONFIG[this.id]?.maxEnergy ?? 3;
    return Math.round(this.energy / max * 100);
  }
  getMaxEnergy(): number {
    return 100;
  }
  setEnergy(percent: number): void {
    const max = WEAPON_RANGE_CONFIG[this.id]?.maxEnergy ?? 3;
    this.energy = Math.max(0, Math.min(max, percent / 100 * max));
  }
```

- [ ] **Step 6: 编译验证**

Run: `cd game/backend && npx tsc --noEmit`
Expected: 0 新错误

- [ ] **Step 7: Commit**

```bash
cd game/backend && git add src/games/fish-oil-battle/skills/weapons/DrawingManifestWeapon.ts src/games/fish-oil-battle/skills/weapons/DischargeCatWeapon.ts src/games/fish-oil-battle/skills/weapons/PrecognitiveLensWeapon.ts src/games/fish-oil-battle/skills/weapons/EmotionalWeatherWeapon.ts src/games/fish-oil-battle/skills/weapons/EmotionMasteryWeapon.ts && git commit -m "feat: 5个模式C武器能量百分比转换(含PrecognitiveLens特殊字段)"
```

---

## Task 9: 4 个 burstEnergyCost ?? maxEnergy 模式武器实现 setEnergy

**Files:**
- Modify: `game/backend/src/games/fish-oil-battle/skills/weapons/FluidMasteryWeapon.ts`
- Modify: `game/backend/src/games/fish-oil-battle/skills/weapons/MemoryCorridorWeapon.ts`
- Modify: `game/backend/src/games/fish-oil-battle/skills/weapons/InfiniteFoldWeapon.ts`
- Modify: `game/backend/src/games/fish-oil-battle/skills/weapons/BotanicalControlWeapon.ts`

**模式 D 转换公式（双字段回退）:**
```typescript
getEnergy(): number {
  const max = WEAPON_RANGE_CONFIG[this.id].burstEnergyCost ?? WEAPON_RANGE_CONFIG[this.id].maxEnergy!;
  return Math.round(this.energy / max * 100);
}
getMaxEnergy(): number {
  return 100;
}
setEnergy(percent: number): void {
  const max = WEAPON_RANGE_CONFIG[this.id].burstEnergyCost ?? WEAPON_RANGE_CONFIG[this.id].maxEnergy!;
  this.energy = Math.max(0, Math.min(max, percent / 100 * max));
}
```

- [ ] **Step 1: 修改 FluidMasteryWeapon.ts**

在 `game/backend/src/games/fish-oil-battle/skills/weapons/FluidMasteryWeapon.ts` 中：

1. 找到 `getEnergy()` 方法，替换为：
```typescript
  getEnergy(): number {
    const max = WEAPON_RANGE_CONFIG[this.id].burstEnergyCost ?? WEAPON_RANGE_CONFIG[this.id].maxEnergy!;
    return Math.round(this.energy / max * 100);
  }
```

2. 找到 `getMaxEnergy()` 方法，替换为：
```typescript
  getMaxEnergy(): number {
    return 100;
  }
```

3. 在 `getMaxEnergy()` 方法之后新增 `setEnergy` 方法：
```typescript
  setEnergy(percent: number): void {
    const max = WEAPON_RANGE_CONFIG[this.id].burstEnergyCost ?? WEAPON_RANGE_CONFIG[this.id].maxEnergy!;
    this.energy = Math.max(0, Math.min(max, percent / 100 * max));
  }
```

- [ ] **Step 2: 修改 MemoryCorridorWeapon.ts**

对 `game/backend/src/games/fish-oil-battle/skills/weapons/MemoryCorridorWeapon.ts` 执行与 Step 1 完全相同的 3 处修改。

- [ ] **Step 3: 修改 InfiniteFoldWeapon.ts**

对 `game/backend/src/games/fish-oil-battle/skills/weapons/InfiniteFoldWeapon.ts` 执行与 Step 1 完全相同的 3 处修改。

- [ ] **Step 4: 修改 BotanicalControlWeapon.ts**

对 `game/backend/src/games/fish-oil-battle/skills/weapons/BotanicalControlWeapon.ts` 执行与 Step 1 完全相同的 3 处修改。

- [ ] **Step 5: 编译验证**

Run: `cd game/backend && npx tsc --noEmit`
Expected: 0 新错误

- [ ] **Step 6: Commit**

```bash
cd game/backend && git add src/games/fish-oil-battle/skills/weapons/FluidMasteryWeapon.ts src/games/fish-oil-battle/skills/weapons/MemoryCorridorWeapon.ts src/games/fish-oil-battle/skills/weapons/InfiniteFoldWeapon.ts src/games/fish-oil-battle/skills/weapons/BotanicalControlWeapon.ts && git commit -m "feat: 4个模式D武器能量百分比转换"
```

---

## Task 10: HiveMotherWeapon 嵌套配置实现 setEnergy

**Files:**
- Modify: `game/backend/src/games/fish-oil-battle/skills/weapons/HiveMotherWeapon.ts`

**模式 E 转换公式（嵌套子对象）:**
```typescript
getEnergy(): number {
  return Math.round(this.energy / CFG.hiveMother!.maxEnergy * 100);
}
getMaxEnergy(): number {
  return 100;
}
setEnergy(percent: number): void {
  const max = CFG.hiveMother!.maxEnergy;
  this.energy = Math.max(0, Math.min(max, percent / 100 * max));
}
```

- [ ] **Step 1: 修改 HiveMotherWeapon.ts**

在 `game/backend/src/games/fish-oil-battle/skills/weapons/HiveMotherWeapon.ts` 中：

1. 找到 `getEnergy()` 方法，替换为：
```typescript
  getEnergy(): number {
    return Math.round(this.energy / CFG.hiveMother!.maxEnergy * 100);
  }
```

2. 找到 `getMaxEnergy()` 方法，替换为：
```typescript
  getMaxEnergy(): number {
    return 100;
  }
```

3. 在 `getMaxEnergy()` 方法之后新增 `setEnergy` 方法：
```typescript
  setEnergy(percent: number): void {
    const max = CFG.hiveMother!.maxEnergy;
    this.energy = Math.max(0, Math.min(max, percent / 100 * max));
  }
```

- [ ] **Step 2: 编译验证**

Run: `cd game/backend && npx tsc --noEmit`
Expected: 0 新错误

- [ ] **Step 3: Commit**

```bash
cd game/backend && git add src/games/fish-oil-battle/skills/weapons/HiveMotherWeapon.ts && git commit -m "feat: HiveMother能量百分比转换(嵌套配置模式)"
```

---

## Task 11: protocol.ts GameStatePlayer 扩展 + broadcastGameState 增强

**Files:**
- Modify: `game/backend/src/games/fish-oil-battle/shared/protocol.ts`
- Modify: `game/backend/src/games/fish-oil-battle/FishOilRoom.ts`

- [ ] **Step 1: 在 protocol.ts 中为 GameStatePlayer 新增 runtimeState 字段**

在 `game/backend/src/games/fish-oil-battle/shared/protocol.ts` 中找到 `GameStatePlayer` interface，在 `alive: boolean;` 字段之后新增：

```typescript
  /** 调试模式：武器运行时状态（仅在 isTestMode 时序列化） */
  runtimeState?: {
    energy: number;
    maxEnergy: number;
    cooldowns: Record<string, number>;
    stacks: Record<string, number>;
    flags: Record<string, boolean>;
    custom?: Record<string, any>;
  };
```

- [ ] **Step 2: 在 FishOilRoom.ts 中导入 WeaponRuntimeState 类型**

在 `game/backend/src/games/fish-oil-battle/FishOilRoom.ts` 文件顶部的 import 区域，找到已有的 IWeapon 相关 import，补充 WeaponRuntimeState 类型导入：

```typescript
import type { WeaponRuntimeState } from './core/IWeapon';
```

- [ ] **Step 3: 在 broadcastGameState 方法中附加 runtimeState**

在 `game/backend/src/games/fish-oil-battle/FishOilRoom.ts` 中找到 `broadcastGameState` 方法（约 718-763 行）。

在 `players.push({...})` 之前，找到构建 playerData 对象的位置，在对象字面量中新增 `runtimeState` 字段。

找到类似以下代码：
```typescript
    players.push({
      id: p.id,
      name: p.name,
      // ...其他字段...
      alive: !isDead,
    });
```

修改为：
```typescript
    const playerData: GameStatePlayer = {
      id: p.id,
      name: p.name,
      x: Math.round(ball?.x ?? state.position.x),
      y: Math.round(ball?.y ?? state.position.y),
      vx: isDead ? 0 : Math.round(ball?.vx ?? 0),
      vy: isDead ? 0 : Math.round(ball?.vy ?? 0),
      hp: state.hp,
      maxHp: state.maxHp,
      energy: weapon?.getEnergy() ?? 0,
      maxEnergy: weapon?.getMaxEnergy() ?? 100,
      weapon: {
        name: weaponMeta?.name ?? '未知',
        iconId: weaponMeta?.iconId ?? 'game-icons:help',
        cd: 0,
      },
      overheated: state.isOverheated,
      avatar: this.playerAvatars[p.id] ?? '',
      alive: !isDead,
    };

    // 测试模式下附加 runtimeState
    if (this.isTestMode && weapon) {
      playerData.runtimeState = weapon.getRuntimeState();
    }

    players.push(playerData);
```

- [ ] **Step 4: 编译验证**

Run: `cd game/backend && npx tsc --noEmit`
Expected: 0 新错误

- [ ] **Step 5: Commit**

```bash
cd game/backend && git add src/games/fish-oil-battle/shared/protocol.ts src/games/fish-oil-battle/FishOilRoom.ts && git commit -m "feat: GameStatePlayer新增runtimeState字段+broadcastGameState增强"
```

---

## Task 12: FishOilRoom handleStartTestMode 参数扩展 + 命令路由

**Files:**
- Modify: `game/backend/src/games/fish-oil-battle/FishOilRoom.ts`

- [ ] **Step 1: 扩展 handleStartTestMode 方法参数**

在 `game/backend/src/games/fish-oil-battle/FishOilRoom.ts` 中找到 `handleStartTestMode` 方法（约 359-391 行），修改方法签名和内部 Bot 武器分配逻辑。

将方法签名从：
```typescript
private handleStartTestMode(sender: RoomPlayer, data: { botCount: number }): void {
```

修改为：
```typescript
private handleStartTestMode(sender: RoomPlayer, data: {
    botCount: number;
    botWeapons?: string[];        // 新增：每个 Bot 的武器 ID（按顺序，缺省随机）
    disabledWeapons?: string[];   // 新增：禁用的武器 ID 列表
  }): void {
```

在方法体内，找到存储 disabledWeapons 的位置（在 `this.isTestMode = true;` 之后新增）：
```typescript
  this.isTestMode = true;
  // 新增：存储测试模式武器配置
  this.testBotWeapons = data.botWeapons ?? [];
  this.testDisabledWeapons = data.disabledWeapons ?? [];
```

- [ ] **Step 2: 在 FishOilRoom 类中新增测试配置字段**

在 `game/backend/src/games/fish-oil-battle/FishOilRoom.ts` 的 `FishOilRoom` 类中，找到 `private isTestMode = false;` 字段声明附近，新增：

```typescript
  private isTestMode = false;
  /** 测试模式：Bot 武器配置（按顺序，空数组=随机） */
  private testBotWeapons: string[] = [];
  /** 测试模式：禁用的武器 ID 列表 */
  private testDisabledWeapons: string[] = [];
```

- [ ] **Step 3: 修改 Bot 武器分配逻辑使用 testBotWeapons**

在 `onStart` 方法中（约 285-296 行），找到 Bot 武器分配代码：

```typescript
if (this.isTestMode) {
  for (const bot of this.botPlayers.values()) {
    if (!this.weaponConfirmed.has(bot.id)) {
      const randomWeapon = IMPLEMENTED_WEAPONS[Math.floor(Math.random() * IMPLEMENTED_WEAPONS.length)];
      this.assignWeapon(bot.id, randomWeapon);
      console.log(`[FishOil] Bot ${bot.id} 自动选择武器: ${randomWeapon.name}`);
    }
  }
  this.checkAllConfirmed();
}
```

修改为：
```typescript
if (this.isTestMode) {
  let botIndex = 0;
  for (const bot of this.botPlayers.values()) {
    if (!this.weaponConfirmed.has(bot.id)) {
      // 优先使用 testBotWeapons 配置，否则随机
      const assignedId = this.testBotWeapons[botIndex];
      const weapon = assignedId
        ? IMPLEMENTED_WEAPONS.find(w => w.id === assignedId)
        : IMPLEMENTED_WEAPONS[Math.floor(Math.random() * IMPLEMENTED_WEAPONS.length)];
      if (weapon) {
        this.assignWeapon(bot.id, weapon);
        console.log(`[FishOil] Bot ${bot.id} 自动选择武器: ${weapon.name}`);
      }
      botIndex++;
    }
  }
  this.checkAllConfirmed();
}
```

- [ ] **Step 4: 修改武器池生成逻辑过滤 disabledWeapons**

在 `onStart` 方法中（约 239 行），找到武器池生成代码：

```typescript
const weaponPoolForClient = shuffleArray(IMPLEMENTED_WEAPONS).slice(0, 3);
```

修改为：
```typescript
// 测试模式：过滤禁用武器
const availableWeapons = this.isTestMode
  ? IMPLEMENTED_WEAPONS.filter(w => !this.testDisabledWeapons.includes(w.id))
  : IMPLEMENTED_WEAPONS;
const weaponPoolForClient = shuffleArray(availableWeapons).slice(0, 3);
```

- [ ] **Step 5: 在 onCommand 中新增 debug 命令路由**

在 `game/backend/src/games/fish-oil-battle/FishOilRoom.ts` 中找到 `onCommand` 方法（约 310-322 行），在现有 `switch` 语句中新增 case：

```typescript
  switch (message.type) {
    case 'select_weapon':
      this.handleSelectWeapon(sender, message.data);
      break;
    case 'start_test_mode':
      this.handleStartTestMode(sender, message.data);
      break;
    // ── 新增：测试模式调试命令 ──
    case 'debug_energy':
      this.handleDebugEnergy(sender, message.data);
      break;
    case 'debug_burst':
      this.handleDebugBurst(sender, message.data);
      break;
    case 'debug_reset':
      this.handleDebugReset(sender, message.data);
      break;
  }
```

- [ ] **Step 6: 实现 handleDebugEnergy 方法**

在 `FishOilRoom` 类中（`handleStartTestMode` 方法之后），新增：

```typescript
  /** 调试：设置某玩家武器能量（百分比 0-100） */
  private handleDebugEnergy(_sender: RoomPlayer, data: { playerId: string; action: 'fill' | 'set'; value?: number }): void {
    if (!this.isTestMode) return;
    const weapon = this.scheduler.getWeapon(data.playerId);
    if (!weapon) return;

    if (data.action === 'fill') {
      this.scheduler.setEnergy(data.playerId, 100);
    } else if (data.action === 'set' && data.value !== undefined) {
      this.scheduler.setEnergy(data.playerId, Math.max(0, Math.min(100, data.value)));
    }
    console.log(`[FishOil] debug_energy: player=${data.playerId} action=${data.action} value=${data.value ?? '-'}`);
  }
```

- [ ] **Step 7: 实现 handleDebugBurst 方法**

在 `handleDebugEnergy` 方法之后，新增：

```typescript
  /** 调试：强制某玩家武器爆发（绕过 isBurstReady 检查） */
  private handleDebugBurst(_sender: RoomPlayer, data: { playerId: string }): void {
    if (!this.isTestMode) return;
    const effects = this.scheduler.debugForceBurst(data.playerId, this.battleState);
    const player = this.battleState.getPlayer(data.playerId);
    if (player) player.bursts++;
    console.log(`[FishOil] debug_burst: player=${data.playerId} effects=${effects.length}`);
  }
```

- [ ] **Step 8: 实现 handleDebugReset 方法**

在 `handleDebugBurst` 方法之后，新增：

```typescript
  /** 调试：重置某玩家武器状态 */
  private handleDebugReset(_sender: RoomPlayer, data: { playerId: string }): void {
    if (!this.isTestMode) return;
    const weapon = this.scheduler.getWeapon(data.playerId);
    if (!weapon) return;
    weapon.reset();
    console.log(`[FishOil] debug_reset: player=${data.playerId}`);
  }
```

- [ ] **Step 9: 编译验证**

Run: `cd game/backend && npx tsc --noEmit`
Expected: 0 新错误

- [ ] **Step 10: Commit**

```bash
cd game/backend && git add src/games/fish-oil-battle/FishOilRoom.ts && git commit -m "feat: FishOilRoom新增测试模式命令路由+handleStartTestMode参数扩展"
```

---

## Task 13: BattleTestPanel.vue UI 增强

**Files:**
- Modify: `game/frontend/src/components/fish-oil-battle/components/BattleTestPanel.vue`

- [ ] **Step 1: 导入 WeaponRuntimeState 类型和武器列表 API**

在 `game/frontend/src/components/fish-oil-battle/components/BattleTestPanel.vue` 的 `<script setup>` 顶部，找到现有 import 区域，新增：

```typescript
import { getImplementedWeaponMetaList } from '$/backend/src/games/fish-oil-battle/core/WeaponRegistry';
import type { WeaponRuntimeState } from '$/backend/src/games/fish-oil-battle/core/IWeapon';
```

- [ ] **Step 2: 新增组件状态变量**

在 `<script setup>` 的 `// ── 控制面板状态 ──` 区域，找到 `const botCount = ref(3);` 之后，新增：

```typescript
// ── 武器配置状态 ──
/** 全部已实现武器列表（供下拉选择） */
const implementedWeapons = getImplementedWeaponMetaList();
/** 禁用的武器 ID 列表 */
const disabledWeapons = ref<string[]>([]);
/** 每个 Bot 的武器配置（key=Bot 索引, value=武器 ID，空=随机） */
const botWeapons = ref<Record<number, string>>({});

// ── 调试面板状态 ──
/** 调试目标玩家 ID（真实 playerId，非 name） */
const debugTargetPlayerId = ref<string>('');
/** 能量倍率（0-100，直接对应百分比） */
const energyMultiplier = ref(100);

// ── 运行时状态 ──
/** playerId → runtimeState 映射（实时刷新） */
const runtimeStates = ref<Record<string, WeaponRuntimeState>>({});
/** 玩家名 → playerId 映射（用于下拉选择转换） */
const playerNameToId = ref<Record<string, string>>({});
/** 可选调试目标列表（id + name） */
const debugTargetOptions = ref<Array<{ id: string; name: string }>>([]);
```

- [ ] **Step 3: 修改 startBattle 发送扩展参数**

在 `startBattle` 函数中，找到 `sendCommand('start_test_mode', { botCount: botCount.value });`，替换为：

```typescript
    // 发送测试模式命令（含武器配置）
    sendCommand('start_test_mode', {
      botCount: botCount.value,
      botWeapons: Array.from({ length: botCount.value }, (_, i) => botWeapons.value[i] || ''),
      disabledWeapons: disabledWeapons.value,
    });
```

- [ ] **Step 4: 在 handleGameState 中提取 runtimeState + 构建 playerId 映射**

在 `handleGameState` 函数中，找到 `for (const p of data.players)` 循环内，在 `prevHp.set(p.id, p.hp);` 之后新增：

```typescript
    // 提取 runtimeState（测试模式）
    if (p.runtimeState) {
      runtimeStates.value[p.id] = p.runtimeState;
    }
    // 构建 玩家名 → playerId 映射（供调试面板下拉用）
    playerNameToId.value[p.name] = p.id;
```

在 `handleGameState` 函数的循环结束后，在 `otherPlayerHuds.value = newOtherHuds;` 之后新增：

```typescript
  // 更新调试目标选项列表
  debugTargetOptions.value = data.players.map(p => ({ id: p.id, name: p.name }));
```

- [ ] **Step 5: 新增调试命令发送函数**

在 `// ── 发送命令 ──` 区域，找到 `sendCommand` 函数之后，新增：

```typescript
/** 调试：一键充满目标玩家能量 */
function debugFillEnergy(): void {
  if (!debugTargetPlayerId.value) return;
  sendCommand('debug_energy', { playerId: debugTargetPlayerId.value, action: 'fill' });
}

/** 调试：强制目标玩家爆发 */
function debugForceBurst(): void {
  if (!debugTargetPlayerId.value) return;
  sendCommand('debug_burst', { playerId: debugTargetPlayerId.value });
}

/** 调试：重置目标玩家武器状态 */
function debugResetWeapon(): void {
  if (!debugTargetPlayerId.value) return;
  sendCommand('debug_reset', { playerId: debugTargetPlayerId.value });
}

/** 调试：设置能量倍率 */
function debugSetEnergy(): void {
  if (!debugTargetPlayerId.value) return;
  sendCommand('debug_energy', {
    playerId: debugTargetPlayerId.value,
    action: 'set',
    value: energyMultiplier.value,
  });
}
```

- [ ] **Step 6: 替换侧边栏模板（w-56 → w-72 + 4 个折叠区）**

在 `<template>` 中，找到 `<aside class="w-56 shrink-0 flex flex-col border-r border-base-300 bg-base-200/40 p-3 gap-4 overflow-y-auto">` 整块，替换为：

```html
    <aside class="w-72 shrink-0 flex flex-col border-r border-base-300 bg-base-200/40 p-3 gap-3 overflow-y-auto">
      <h3 class="text-sm font-bold opacity-70">对局测试</h3>

      <!-- ═══ 基础配置 ═══ -->
      <div class="collapse collapse-arrow bg-base-200/50">
        <input type="checkbox" checked />
        <div class="collapse-title text-xs font-semibold">基础配置</div>
        <div class="collapse-content flex flex-col gap-2">
          <label class="form-control">
            <span class="label-text text-xs flex justify-between">
              <span>Bot 数量</span>
              <span class="font-mono tabular-nums">{{ botCount }}</span>
            </span>
            <input
              v-model.number="botCount"
              type="range"
              class="range range-primary range-xs mt-0.5"
              :min="1" :max="7" :step="1"
              :disabled="isBattleActive"
            />
          </label>
          <div v-if="roomStatus" class="text-xs opacity-60">
            <span class="font-mono">{{ roomStatus }}</span>
          </div>
          <button
            class="btn btn-primary btn-sm w-full"
            :disabled="isCreating"
            @click="isBattleActive ? stopBattle() : startBattle()"
          >
            <span v-if="isCreating" class="loading loading-spinner loading-xs" />
            {{ isBattleActive ? '结束对局' : '开始对局' }}
          </button>
        </div>
      </div>

      <!-- ═══ 武器配置 ═══ -->
      <div class="collapse collapse-arrow bg-base-200/50">
        <input type="checkbox" :disabled="isBattleActive" />
        <div class="collapse-title text-xs font-semibold">武器配置</div>
        <div class="collapse-content flex flex-col gap-2">
          <!-- 禁用武器 -->
          <label class="form-control">
            <span class="label-text text-xs">禁用武器（多选）</span>
            <select
              v-model="disabledWeapons"
              multiple
              class="select select-bordered select-xs mt-0.5 h-24"
              :disabled="isBattleActive"
            >
              <option v-for="w in implementedWeapons" :key="w.id" :value="w.id">
                {{ w.name }}
              </option>
            </select>
          </label>
          <!-- Bot 武器配置 -->
          <div class="text-[10px] opacity-50 mt-1">Bot 武器配置</div>
          <label
            v-for="i in botCount"
            :key="`bot-weapon-${i}`"
            class="form-control"
          >
            <span class="label-text text-xs">Bot {{ i }} 武器</span>
            <select
              :value="botWeapons[i - 1] || ''"
              class="select select-bordered select-xs mt-0.5"
              :disabled="isBattleActive"
              @change="botWeapons[i - 1] = ($event.target as HTMLSelectElement).value"
            >
              <option value="">随机</option>
              <option v-for="w in implementedWeapons" :key="w.id" :value="w.id">
                {{ w.name }}
              </option>
            </select>
          </label>
        </div>
      </div>

      <!-- ═══ 调试面板 ═══ -->
      <div v-if="isBattleActive" class="collapse collapse-arrow bg-base-200/50">
        <input type="checkbox" checked />
        <div class="collapse-title text-xs font-semibold">调试面板</div>
        <div class="collapse-content flex flex-col gap-2">
          <!-- 目标玩家 -->
          <label class="form-control">
            <span class="label-text text-xs">目标玩家</span>
            <select
              v-model="debugTargetPlayerId"
              class="select select-bordered select-xs mt-0.5"
            >
              <option value="">选择玩家</option>
              <option v-for="p in debugTargetOptions" :key="p.id" :value="p.id">
                {{ p.name }}
              </option>
            </select>
          </label>
          <!-- 调试按钮 -->
          <div class="grid grid-cols-3 gap-1">
            <button class="btn btn-primary btn-xs" @click="debugFillEnergy">
              <Icon icon="ph:lightning-fill" />
              充满
            </button>
            <button class="btn btn-error btn-xs" @click="debugForceBurst">
              <Icon icon="ph:explosion-fill" />
              爆发
            </button>
            <button class="btn btn-ghost btn-xs" @click="debugResetWeapon">
              <Icon icon="ph:arrow-counter-clockwise" />
              重置
            </button>
          </div>
          <!-- 能量倍率 -->
          <label class="form-control">
            <span class="label-text text-xs flex justify-between">
              <span>能量倍率</span>
              <span class="font-mono tabular-nums">{{ energyMultiplier }}%</span>
            </span>
            <input
              v-model.number="energyMultiplier"
              type="range"
              class="range range-secondary range-xs mt-0.5"
              :min="0" :max="100" :step="10"
              @change="debugSetEnergy"
            />
          </label>
        </div>
      </div>

      <!-- ═══ 运行时状态 ═══ -->
      <div v-if="isBattleActive && debugTargetPlayerId" class="collapse collapse-arrow bg-base-200/50">
        <input type="checkbox" checked />
        <div class="collapse-title text-xs font-semibold">运行时状态</div>
        <div class="collapse-content flex flex-col gap-1 text-[11px] font-mono">
          <template v-if="runtimeStates[debugTargetPlayerId]">
            <div class="flex justify-between">
              <span class="opacity-60">能量</span>
              <span class="tabular-nums">{{ runtimeStates[debugTargetPlayerId].energy }}/{{ runtimeStates[debugTargetPlayerId].maxEnergy }}</span>
            </div>
            <div class="opacity-60 mt-1">冷却</div>
            <pre class="bg-base-300/50 p-1 rounded text-[10px] overflow-x-auto">{{ JSON.stringify(runtimeStates[debugTargetPlayerId].cooldowns, null, 2) }}</pre>
            <div class="opacity-60 mt-1">层数</div>
            <pre class="bg-base-300/50 p-1 rounded text-[10px] overflow-x-auto">{{ JSON.stringify(runtimeStates[debugTargetPlayerId].stacks, null, 2) }}</pre>
            <div class="opacity-60 mt-1">标记</div>
            <pre class="bg-base-300/50 p-1 rounded text-[10px] overflow-x-auto">{{ JSON.stringify(runtimeStates[debugTargetPlayerId].flags, null, 2) }}</pre>
            <template v-if="runtimeStates[debugTargetPlayerId].custom">
              <div class="opacity-60 mt-1">自定义</div>
              <pre class="bg-base-300/50 p-1 rounded text-[10px] overflow-x-auto">{{ JSON.stringify(runtimeStates[debugTargetPlayerId].custom, null, 2) }}</pre>
            </template>
          </template>
          <div v-else class="opacity-40 text-center py-2">无数据</div>
        </div>
      </div>

      <!-- ═══ 测试报告 ═══ -->
      <button
        class="btn btn-outline btn-sm w-full mt-auto"
        :disabled="!Object.keys(currentStats).length"
        @click="showStatsModal = true"
      >
        测试报告
      </button>
    </aside>
```

- [ ] **Step 7: 在 stopBattle 中清空调试状态**

在 `stopBattle` 函数中，找到 `roomStatus.value = '已结束';` 之后，新增：

```typescript
  // 清空调试状态
  debugTargetPlayerId.value = '';
  runtimeStates.value = {};
  playerNameToId.value = {};
  debugTargetOptions.value = [];
```

- [ ] **Step 8: 编译验证**

Run: `cd game/frontend && npx vue-tsc --noEmit`
Expected: 0 新错误

- [ ] **Step 9: Commit**

```bash
cd game/frontend && git add src/components/fish-oil-battle/components/BattleTestPanel.vue && git commit -m "feat: BattleTestPanel增强UI(武器配置+调试面板+运行时状态)"
```

---

## Task 14: 最终编译验证

**Files:**
- 无修改，仅验证

- [ ] **Step 1: 后端编译验证**

Run: `cd game/backend && npx tsc --noEmit`
Expected: 0 新错误（仅预存 skill-chain.test.ts 4 个 TS2740 错误，与本次改动无关）

- [ ] **Step 2: 前端编译验证**

Run: `cd game/frontend && npx vue-tsc --noEmit`
Expected: 0 新错误

- [ ] **Step 3: 验证武器能量百分比一致性**

在 `game/backend/src/games/fish-oil-battle/skills/weapons/` 目录下执行 grep 确认所有武器已修改：

Run: `grep -r "return this\.energy;" game/backend/src/games/fish-oil-battle/skills/weapons/`
Expected: 0 匹配（所有 getEnergy() 应返回百分比，不应直接返回 this.energy）

Run: `grep -r "return CFG\.maxEnergy" game/backend/src/games/fish-oil-battle/skills/weapons/`
Expected: 0 匹配（所有 getMaxEnergy() 应返回 100，不应返回 CFG.maxEnergy）

- [ ] **Step 4: 最终 Commit（如有修正）**

```bash
git add -A && git commit -m "fix: 最终编译验证修正"
```

---

## 验收检查清单

- [ ] 所有 24 个武器的 `getEnergy()` 返回 0-100 百分比
- [ ] 所有 24 个武器的 `getMaxEnergy()` 固定返回 100
- [ ] 所有 24 个武器实现 `setEnergy(percent)` 方法
- [ ] StubWeapon 实现 `setEnergy` 空方法
- [ ] WeaponScheduler 新增 `setEnergy` + `debugForceBurst`
- [ ] WeaponRangeConfig 5 个武器数值已调整（NanoRipper/RicochetCore/CircuitWeaver/BastionBuilder/EntropyDiffuser）
- [ ] RicochetCore 的 `isBurstReady()` 使用 `CFG.maxEnergy!` 代替硬编码 `SPEED_THRESHOLD`
- [ ] PrecognitiveLens 的 `setEnergy` 操作 `foresightStacks` 字段
- [ ] GameStatePlayer 新增 `runtimeState?` 字段
- [ ] broadcastGameState 在 isTestMode 时附加 runtimeState
- [ ] handleStartTestMode 支持 `botWeapons` + `disabledWeapons` 参数
- [ ] FishOilRoom 新增 3 个 debug 命令路由（debug_energy/debug_burst/debug_reset）
- [ ] BattleTestPanel 侧边栏扩展至 w-72，含 4 个折叠区
- [ ] 后端编译 0 新错误
- [ ] 前端编译 0 新错误
