---
name: weapon-cooldown-system
overview: 在 SkillScheduler 层面添加统一冷却守卫（防止极端连击），同时在 WeaponRangeConfig 配置表中定义每种触发类型的冷却时间，各武器保留自定义子冷却能力
todos:
  - id: config-cooldown-types
    content: 在 WeaponRangeConfig 后端添加 WeaponTriggerCooldowns 接口和 triggerCooldowns 配置字段，含 4 种武器的具体冷却数值
    status: completed
  - id: scheduler-guard
    content: 在 SkillScheduler 实现 CooldownTracker 内部类，改造 processHit() 和 onWallHit() 调用路径加入冷却守卫
    status: completed
    dependencies:
      - config-cooldown-types
  - id: frontend-sync
    content: 同步前端 WeaponRangeConfig.ts 新增接口和配置值
    status: completed
    dependencies:
      - config-cooldown-types
  - id: weapon-docs-sync
    content: 更新相关设计文档，补充冷却机制说明和配置表变更
    status: completed
    dependencies:
      - config-cooldown-types
      - frontend-sync
  - id: test-cooldown
    content: 编写冷却机制单元测试：验证连击抑制、冷却到期恢复、reset 清空、边界情况
    status: completed
    dependencies:
      - scheduler-guard
---

## Product Overview

为 Fish Oil Battle 的武器系统添加冷却机制（Cooldown），解决极端条件下武器被连续触发的问题。当前物理引擎以 20fps 检测碰撞，两球紧贴时 `processHit` 每帧调用一次，导致冲击波/光学斩击等武器每秒触发 20 次、DPS 严重超标。

## Core Features

- **统一冷却守卫层**：在 `SkillScheduler.processHit()` 中加入全局 cooldown 检查，防止任何武器在冷却期内被连续触发
- **数据驱动冷却配置**：每种武器在 `WeaponRangeConfig` 中定义独立的冷却时间（按触发类型区分：hitTarget / hitByAttacker / wallHit）
- **子冷却能力保留**：各武器仍可自行管理更精细的内部冷却（如蜂巢母体的轮流发射），与统一守卫不冲突
- **前后端配置同步**：前端 `WeaponRangeConfig` 同步添加冷却字段
- **冷却可视化**（可选）：前端渲染器可读取冷却状态用于 UI 反馈

## Tech Stack

- TypeScript（后端 + 前端共用类型定义）
- 数据驱动配置表模式（复用现有 WeaponRangeConfig 架构）

## 实现策略：两层冷却架构

### 第一层 — SkillScheduler 全局守卫（防止极端连击）

**核心思路**：在 `SkillScheduler` 内部维护一个 `Map<string, { hitTarget: number, hitByAttacker: number, wallHit: number }>` 冷却计时器，记录每个玩家各触发类型的"下次允许触发时间（tick序号）"。`processHit()` 调用前先检查冷却，未到期则跳过。

**为什么放在 Scheduler 而非 IWeapon 接口内**：

- 防御性编程——即使某武器忘记检查自身冷却，全局守卫也能兜底
- 单一修改点——4 把武器零改动即可获得保护
- 与现有 `IWeapon` 接口解耦——不破坏接口契约

**关键设计决策**：

- 使用 tick 序号而非时间戳（与现有 TICKS_PER_SEC=20 对齐，避免浮点精度问题）
- 配置读取从 `WeaponRangeConfig` 新增字段 `triggerCooldowns` 获取
- 冷却时间为 0 或未配置 = 不限制（完全向后兼容）
- `reset()` 时清空所有冷却

### 第二层 — 武器内部子冷却（精细控制）

各武器已有的自定义冷却机制（如 HiveMother 的 `globalFireCooldown` / `beeCooldowns`）保持不变，作为第二层精细化控制运行在统一守卫之上。两层是 AND 关系——任一层冷却未到期都阻止触发。

### 配置结构设计

```typescript
// WeaponRangeConfig 新增字段
export interface WeaponTriggerCooldowns {
  /** onHitTarget 冷却时间（秒），0 = 无限制 */
  hitTargetSec?: number;
  /** onHitByAttacker 冷却时间（秒），0 = 无限制 */
  hitByAttackerSec?: number;
  /** onWallHit 冷却时间（秒），0 = 无限制 */
  wallHitSec?: number;
}

// 挂载到 WeaponRangeConfig
export interface WeaponRangeConfig {
  // ... 现有字段 ...
  /** 触发冷却配置（数据驱动） */
  triggerCooldowns?: WeaponTriggerCooldowns;
}
```

### 各武器建议冷却值

| 武器 | hitTarget | hitByAttacker | 理由 |
| --- | --- | --- | --- |
| ShockwaveGenerator | 0.5s | 0s | 冲击波主伤害需限频；被击中无效果 |
| OpticalSlash | 0.3s | 0s | 斩击需限频；被击中无效果 |
| FirewallProtocol | 0s | 0.5s | 碰撞不触发；被击中充能需限频 |
| HiveMother | 0s | 1.0s | 碰撞不触发；被击中充能+内部已有 0.4s 全局 CD |


## 实现细节

### 修改文件清单

```
game/backend/src/games/fish-oil-battle/
├── config/WeaponRangeConfig.ts              # [MODIFY] 新增 WeaponTriggerCooldowns 接口 + triggerCooldowns 字段 + 各武器配置值
├── core/SkillScheduler.ts                   # [MODIFY] 新增 CooldownTracker 内部类，processHit/onWallHit 加入冷却检查和刷新
├── core/IWeapon.ts                          # [MINOR] 接口不变（cooldowns 已在 RuntimeState 中），仅更新注释
├── skills/weapons/*.ts                      # [NO CHANGE] 四把武器代码无需改动（可选优化：移除已被全局守卫覆盖的冗余冷却逻辑）
└── skill-chain.test.ts                      # [MODIFY] 添加冷却机制的单元测试

game/frontend/src/components/fish-oil-battle/
├── WeaponRangeConfig.ts                     # [MODIFY] 同步新增接口和配置值
```

### SkillScheduler 冷却追踪器设计

```typescript
// SkillScheduler 内部私有类
class CooldownTracker {
  // key = playerId, value = { hitTargetTick, hitByAttackerTick, wallHitTick }
  private cdEndTicks = new Map<string, {
    hitTarget: number;
    hitByAttacker: number;
    wallHit: number;
  }>();

  /** 检查是否可以触发，可以则自动记录冷却 */
  tryTrigger(playerId: string, type: 'hitTarget' | 'hitByAttacker' | 'wallHit', 
             cooldownSec: number, currentTick: number): boolean;

  /** 清除指定玩家所有冷却 */
  reset(playerId: string): void;

  /** 清除所有 */
  clearAll(): void;
}
```

**tryTrigger 逻辑**：

1. 从 Map 取该玩家的冷却结束 tick
2. 如果 `currentTick >= endTick` → 允许触发，更新 endTick = currentTick + ceil(cooldownSec * TICKS_PER_SEC)
3. 如果 `currentTick < endTick` → 拒绝触发，返回 false

**processHit 修改后流程**：

```typescript
processHit(attackerId, targetId, state) {
  const effects: WeaponEffect[] = [];
  
  // 攻击者 onHitTarget — 带冷却守卫
  const atkWep = this.bindings.get(attackerId);
  if (atkWep && this.cooldowns.tryTrigger(attackerId, 'hitTarget', 
      atkCfg.triggerCooldowns?.hitTargetSec ?? 0, state.tick)) {
    effects.push(...atkWep.onHitTarget(state, this.physicsQuery));
  }
  
  // 目标 onHitByAttacker — 带冷却守卫
  const defWep = this.bindings.get(targetId);
  if (defWep && this.cooldowns.tryTrigger(targetId, 'hitByAttacker',
      defCfg.triggerCooldowns?.hitByAttackerSec ?? 0, state.tick)) {
    effects.push(...defWep.onHitByAttacker(state, this.physicsQuery));
  }
  
  // ... applyEffects unchanged
}
```

### 性能影响评估

- 每次 processHit 增加 2 次 Map.get + 2 次数值比较 —— O(1)，对 20fps 完全无压力
- 内存增加：每玩家 3 个 number —— 可忽略

### 向后兼容性

- `triggerCooldowns` 未配置或值为 0 → `tryTrigger` 直接返回 true → 行为与现在一致
- 所有现有测试无需修改（冷却默认为 0 = 无限制）

## Agent Extensions

- **fish-oil-battle-skill-dev**
- Purpose: 利用鱼油战斗技能开发知识，确保冷却机制设计符合现有武器系统架构规范（IWeapon 接口约定、WeaponRangeConfig 数据驱动模式、SkillScheduler 调度流程）
- Expected outcome: 生成的冷却系统无缝融入现有 12 武器扩展架构，新武器可通过配置表一键接入冷却