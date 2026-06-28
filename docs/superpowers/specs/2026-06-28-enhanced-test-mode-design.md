# 增强测试模式实战测试 设计文档

**日期:** 2026-06-28
**状态:** 已批准
**目标:** 增强测试模式的实战测试能力，方便进行各种技能的测试，平衡各个技能的数值，解决"部分技能始终无法爆发"的问题。

---

## 1. 问题背景

### 1.1 现状缺陷

当前 `BattleTestPanel.vue` 对局测试面板功能有限：
- Bot 武器纯随机分配，无配置入口
- 武器池全局共享 3 选 1，不支持禁用
- 无调试接口（无法一键充满能量、强制爆发、查看 runtime state）

### 1.2 "无法爆发"根因分析

| 武器 | maxEnergy | 充能条件 | 爆发难度 |
|------|-----------|----------|----------|
| NanoRipper | 4 | 对手在 40px 内被扫荡（6s CD） | 🔴 极难（约 24 秒） |
| RicochetCore | 200 | 需 25 次撞墙（每次 +8%） | 🔴 极难（约 50-75 秒） |
| CircuitWeaver | 600 | 需持续移动 6 秒 + maxCount=20 限制 | 🟡 中等 |
| BastionBuilder | 6 | 依赖 onWallHit + maxCount=6 | 🟡 中等 |
| EntropyDiffuser | 20 | 油膜段数达 20 | 🟡 中等 |
| GravityWell | 15 | 每秒 +1（15s 自动充满） | 🟢 唯一可靠 |

### 1.3 能量单位不一致问题

`energy` 字段被复用为完全不同的物理量，前端 HUD 显示混乱：

| 武器 | maxEnergy | energy 单位 | 含义 |
|------|-----------|-------------|------|
| NanoRipper | 4 | 层数 | 撕裂层数 |
| GravityWell | 15 | 秒 | 时间(秒) |
| EntropyDiffuser | 20 | 段数 | 油膜段数 |
| BastionBuilder | 6 | 个数 | 方块数量 |
| CircuitWeaver | 600 | 像素 | 回路总长度(px) |
| RicochetCore | 200 | 百分比 | 速度加成(%) |

---

## 2. 解决方案

### 2.1 核心策略

1. **能量统一为百分比 0-100**：所有武器对外暴露 `getEnergy()/getMaxEnergy()` 统一返回百分比，内部仍用原单位存储
2. **武器数值平衡调整**：修改 `WeaponRangeConfig` 中难以爆发武器的阈值，让所有武器在 15-30 秒内能完成一次爆发
3. **对局测试增强**：新增 4 个调试功能（指定 Bot 武器、禁用武器池、能量/爆发调试、运行时状态查看）
4. **接口扩展方案**：在 `IWeapon` 接口新增 `setEnergy(value: number): void`，类型安全、规范、可维护

### 2.2 不做的事项

- ❌ 不整合 SkillScheduler 与 WeaponScheduler（逻辑一致，SkillScheduler 未被采用，无需整合）
- ❌ 不修改 `burstDamage`（爆发伤害不变，只降低爆发门槛）
- ❌ 不使用反射 hack（违反项目类型安全规范）

---

## 3. 架构设计

### 3.1 整体数据流

```
┌─────────────────────────────────────────────────────────────┐
│  前端 BattleTestPanel.vue（增强）                            │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐    │
│  │ Bot 武器配置  │ │ 禁用武器筛选   │ │ 能量/爆发调试面板  │    │
│  └──────┬───────┘ └──────┬───────┘ └────────┬─────────┘    │
│         └────────────────┴───────────────────┘               │
│                          │ sendCommand                       │
│                          ▼                                   │
│  game_state 事件  ◄──── runtimeState 字段（新增）            │
└──────────────────────────┼──────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────┐
│  后端 FishOilRoom.ts（扩展）                                   │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ onCommand 新增 case：                                │    │
│  │  - set_bot_weapon    (指定 Bot 武器)                  │    │
│  │  - set_weapon_filter (禁用武器池)                     │    │
│  │  - debug_energy      (一键充满/能量倍率)              │    │
│  │  - debug_burst       (强制爆发)                       │    │
│  │  - debug_reset       (重置武器状态)                    │    │
│  └──────────────────────────────────────────────────────┘    │
│  handleStartTestMode 扩展 data: { botWeapons?, disabledWeapons? } │
│  broadcastGameState 增加 runtimeState 序列化                  │
└──────────────────────────┼──────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────┐
│  WeaponScheduler.ts（扩展）                                   │
│  + setEnergy(playerId, percent): void  ← percent: 0-100      │
│  + debugForceBurst(playerId, state): WeaponEffect[]          │
│    （绕过 isBurstReady 检查，直接调用 weapon.burst）          │
└──────────────────────────┼──────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────┐
│  IWeapon.ts（接口扩展）                                       │
│  + setEnergy(percent: number): void  ← 新增, percent: 0-100  │
│  + getEnergy(): number  ← 修改为返回百分比 0-100              │
│  + getMaxEnergy(): number  ← 修改为固定返回 100               │
│  25 个武器实现各修改 getEnergy/getMaxEnergy/setEnergy        │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 能量百分比转换规则

**核心原则：**
- 武器内部 `this.energy` 仍用原单位存储（撕裂层数/像素/秒/百分比等）
- 对外 `getEnergy()` 动态计算百分比，不新增字段
- `setEnergy(percent)` 接收 0-100，内部转换回原单位
- `isBurstReady()` 保留原单位检查，避免精度问题

**转换公式：**
```typescript
// 通用模式（适用于所有武器）
getEnergy(): number {
  return Math.round(this.energy / CFG.maxEnergy! * 100);  // 原值/最大值*100
}
getMaxEnergy(): number {
  return 100;  // 固定返回 100
}
setEnergy(percent: number): void {
  // percent: 0-100 → 转换回原单位
  this.energy = Math.max(0, Math.min(CFG.maxEnergy!, percent / 100 * CFG.maxEnergy!));
}
isBurstReady(): boolean {
  return this.energy >= CFG.maxEnergy!;  // 保留原单位检查
}
```

**特殊处理 - RicochetCore（energy 既是速度值又是充能进度）：**
```typescript
// 速度加成仍用 this.energy 原始值（0-200）
private getCurrentSpeedBonus(): number {
  if (this.burstActive) return BURST_SPEED_MULT;
  return this.energy;  // 原始值，如 80
}
// 对外显示百分比
getEnergy(): number {
  return Math.round(this.energy / CFG.maxEnergy! * 100);  // 80/200*100 = 40
}
```

---

## 4. 武器数值平衡调整

### 4.1 调整原则

- 🎯 保持各武器流派特色（侵略者快爆发、控制者慢爆发、工程师布置型）
- 🎯 所有武器在 15-30 秒内应能完成一次爆发
- 🎯 不削弱爆发伤害（`burstDamage` 不变），只降低爆发门槛
- 🎯 能量百分比统一后，数值调整只影响"充满时间"

### 4.2 具体调整表

修改文件：`game/backend/src/games/fish-oil-battle/config/WeaponRangeConfig.ts`

| 武器 | 字段 | 旧值 | 新值 | 理由 |
|------|------|------|------|------|
| **NanoRipper** | `damageRadius` | 40 | 80 | 扫荡半径太小，对手难入 40px |
| NanoRipper | `cooldownMs` | 6000 | 3000 | 扫荡 CD 太长 |
| NanoRipper | `maxEnergy` | 4 | 3 | 降低爆发阈值 |
| **RicochetCore** | `maxEnergy` | 200 | 100 | 需 25 次撞墙 → 12 次 |
| **CircuitWeaver** | `maxEnergy` | 600 | 300 | 需 6 秒移动 → 3 秒 |
| CircuitWeaver | `energyPerHit` | 30 | 60 | 加快充能速度（配合 maxEnergy 调整） |
| **BastionBuilder** | `maxEnergy` | 6 | 4 | 降低爆发阈值 |
| BastionBuilder | `field.maxCount` | 6 | 4 | 配合阈值调整 |
| **EntropyDiffuser** | `maxEnergy` | 20 | 10 | 油膜段数阈值减半 |
| EntropyDiffuser | `field.maxCount` | 20 | 10 | 配合阈值调整 |
| GravityWell | 保持不变 | - | - | 已是唯一可靠充能 |
| PursuitProtocol | 不变 | - | - | 5 次追击合理 |
| QuantumRift | 不变 | - | - | 4 次穿越合理 |
| SizeWarp | 不变 | - | - | 3 次切换合理 |

### 4.3 调整后充满时间预估

| 武器 | 充满时间(旧) | 充满时间(新) | 状态 |
|------|-------------|-------------|------|
| NanoRipper | 24 秒 | 9 秒 | ✅ 改善 |
| RicochetCore | 50-75 秒 | 25-37 秒 | ✅ 改善 |
| CircuitWeaver | 6 秒 | 3 秒 | ✅ 改善 |
| BastionBuilder | 难(靠撞墙) | 更易 | ✅ 改善 |
| EntropyDiffuser | 20 段 | 10 段 | ✅ 改善 |
| GravityWell | 15 秒 | 15 秒 | 🟢 保持 |
| PursuitProtocol | 5 次追击 | 5 次追击 | 🟢 保持 |
| QuantumRift | 4 次穿越 | 4 次穿越 | 🟢 保持 |
| SizeWarp | 3 次切换 | 3 次切换 | 🟢 保持 |

---

## 5. 后端调试接口设计

### 5.1 IWeapon 接口扩展

文件：`game/backend/src/games/fish-oil-battle/core/IWeapon.ts`

```typescript
export interface IWeapon {
  // ...现有方法...
  
  /**
   * 调试用：设置能量值（百分比 0-100）
   * - 接收 0-100 的百分比值
   * - 内部转换为武器原始单位存储
   * - 不触发爆发，需另行调用 burst()
   */
  setEnergy(percent: number): void;
}
```

### 5.2 IWeapon 接口方法行为变更

```typescript
export interface IWeapon {
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
  
  // ...其他方法不变...
}
```

### 5.3 WeaponScheduler 扩展

文件：`game/backend/src/games/fish-oil-battle/core/WeaponScheduler.ts`

```typescript
class WeaponScheduler {
  // ...现有方法...
  
  /**
   * 调试用：设置某玩家武器能量（百分比 0-100）
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
}
```

### 5.4 FishOilRoom 命令路由扩展

文件：`game/backend/src/games/fish-oil-battle/FishOilRoom.ts`

`onCommand` 新增 case 分支：

```typescript
case 'set_bot_weapon':      // 指定 Bot 武器
case 'set_weapon_filter':   // 禁用武器池
case 'debug_energy':         // 一键充满/能量倍率
case 'debug_burst':          // 强制爆发
case 'debug_reset':          // 重置武器状态（调用 weapon.reset()）
```

### 5.5 handleStartTestMode 参数扩展

```typescript
interface StartTestModeData {
  botCount: number;
  botWeapons?: string[];        // 新增：每个 Bot 的武器 ID（按顺序，缺省随机）
  disabledWeapons?: string[];   // 新增：禁用的武器 ID 列表
}
```

**Bot 武器分配逻辑变更：**
- 原：`IMPLEMENTED_WEAPONS[Math.floor(Math.random() * IMPLEMENTED_WEAPONS.length)]`
- 新：若 `botWeapons[i]` 存在且有效，使用指定武器；否则随机

**武器池过滤逻辑变更：**
- 原：`shuffleArray(IMPLEMENTED_WEAPONS).slice(0, 3)`
- 新：`shuffleArray(IMPLEMENTED_WEAPONS.filter(w => !disabledWeapons.includes(w.id))).slice(0, 3)`

### 5.6 GameStatePlayer 协议扩展

文件：`game/backend/src/games/fish-oil-battle/shared/protocol.ts`

```typescript
export interface GameStatePlayer {
  // ...现有字段...
  runtimeState?: WeaponRuntimeState;  // 新增：调试模式下携带
}
```

**序列化规则：**
- 仅在 `isTestMode === true` 时序列化 `runtimeState` 字段
- 生产环境不发送，避免流量浪费

### 5.7 broadcastGameState 增强

文件：`game/backend/src/games/fish-oil-battle/FishOilRoom.ts`

```typescript
private broadcastGameState(): void {
  const players: GameStatePlayer[] = [];
  for (const p of this.room.validPlayers) {
    // ...现有逻辑...
    const playerData: GameStatePlayer = {
      // ...现有字段...
    };
    
    // 测试模式下附加 runtimeState
    if (this.isTestMode && weapon) {
      playerData.runtimeState = weapon.getRuntimeState();
    }
    
    players.push(playerData);
  }
  // ...
}
```

---

## 6. 前端 BattleTestPanel UI 增强

### 6.1 布局调整

侧边栏从 `w-56` 扩展到 `w-72`，分 4 个折叠区：

```
┌────────────────────────────────────────┐
│ 对局测试                               │
├────────────────────────────────────────┤
│ ▼ 基础配置                              │
│   Bot 数量: [滑块 1-7]                  │
│   开始对局 / 结束对局                    │
├────────────────────────────────────────┤
│ ▼ 武器配置（开始前设置）                 │
│   禁用武器: [多选下拉]                   │
│   Bot1 武器: [下拉选择]                 │
│   Bot2 武器: [下拉选择]                 │
│   Bot3 武器: [下拉选择]                 │
│   ...（根据 botCount 动态生成）          │
├────────────────────────────────────────┤
│ ▼ 调试面板（对局进行中可用）             │
│   目标玩家: [下拉选择]                  │
│   [一键充满] [强制爆发] [重置状态]       │
│   能量倍率: [滑块 0-200%]              │
├────────────────────────────────────────┤
│ ▼ 运行时状态（实时刷新）                 │
│   能量: 45/100                          │
│   冷却: { sweep: 2.3s }                │
│   层数: { tear: 2 }                    │
│   标记: { burstReady: false }          │
│   自定义: { activeWaves: 1 }           │
├────────────────────────────────────────┤
│ [测试报告]                              │
└────────────────────────────────────────┘
```

### 6.2 组件状态新增

```typescript
// 武器配置
const disabledWeapons = ref<string[]>([]);
const botWeapons = ref<Record<number, string>>({});  // {0: 'NANO_RIPPER', 1: 'GRAVITY_WELL'}

// 调试面板
const debugTargetPlayerId = ref<string>('');
const energyMultiplier = ref(100);  // 0-200

// 运行时状态
const runtimeStates = ref<Record<string, WeaponRuntimeState>>({});
```

---

## 7. 命令协议设计

### 7.1 命令清单

| 命令 | data 参数 | 后端处理 | 前端触发 | 约束 |
|------|----------|----------|----------|------|
| `start_test_mode` | `{ botCount, botWeapons?, disabledWeapons? }` | 扩展参数 | 开始对局按钮 | - |
| `debug_energy` | `{ playerId, action: 'fill'\|'set', value? }` | `scheduler.setEnergy()` | 一键充满/倍率滑块 | `isTestMode === true` |
| `debug_burst` | `{ playerId }` | `scheduler.debugForceBurst()` | 强制爆发按钮 | `isTestMode === true` |
| `debug_reset` | `{ playerId }` | `weapon.reset()` | 重置状态按钮 | `isTestMode === true` |
| `game_state` 事件 | `players[].runtimeState` | `weapon.getRuntimeState()` | 自动刷新状态面板 | `isTestMode === true` |

### 7.2 安全约束

- 🚫 所有 `debug_*` 命令仅在 `isTestMode === true` 时生效，生产环境拒绝
- 🚫 `set_bot_weapon` / `set_weapon_filter` 仅在 `phase === 'weapon_select'` 前生效
- ✅ `runtimeState` 字段仅在 `isTestMode === true` 时序列化发送
- ✅ `debugForceBurst` 仍会触发 `applyWeaponEffects`，确保伤害/控制效果正确应用

---

## 8. 文件改动清单

### 8.1 后端改动

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `core/IWeapon.ts` | 接口扩展 | 新增 `setEnergy(percent)` 方法声明 |
| `core/WeaponScheduler.ts` | 方法新增 | 新增 `setEnergy` + `debugForceBurst` |
| `FishOilRoom.ts` | 命令路由 | 新增 5 个 case + `handleStartTestMode` 扩展参数 |
| `shared/protocol.ts` | 字段新增 | `GameStatePlayer.runtimeState?` |
| `config/WeaponRangeConfig.ts` | 数值调整 | 5 个武器配置调整 |
| `skills/weapons/*.ts` (25 个) | 方法实现 | 每个武器实现 `setEnergy` + 修改 `getEnergy/getMaxEnergy` |

### 8.2 前端改动

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `components/BattleTestPanel.vue` | UI 增强 | 侧边栏扩展至 `w-72`，4 个折叠区 |

---

## 9. 验收标准

### 9.1 功能验收

- ✅ 所有 25 个武器的 `getEnergy()` 返回 0-100 百分比
- ✅ 所有 25 个武器的 `getMaxEnergy()` 固定返回 100
- ✅ `setEnergy(50)` 将武器能量设置为 50%
- ✅ `debugForceBurst` 可绕过 `isBurstReady` 检查强制爆发
- ✅ 测试模式可指定每个 Bot 的武器
- ✅ 测试模式可禁用武器池中的武器
- ✅ 前端实时显示目标玩家的 runtimeState
- ✅ 能量倍率滑块可实时调节武器能量

### 9.2 数值平衡验收

- ✅ NanoRipper 在 15 秒内可爆发（原 24 秒）
- ✅ RicochetCore 在 30 秒内可爆发（原 50-75 秒）
- ✅ CircuitWeaver 在 5 秒内可爆发（原 6 秒）
- ✅ 所有武器在 30 秒内应能完成至少一次爆发

### 9.3 安全性验收

- ✅ 所有 `debug_*` 命令在非测试模式返回错误
- ✅ `runtimeState` 字段仅在测试模式序列化
- ✅ 生产环境编译无影响

### 9.4 编译验收

- ✅ `cd game/backend && npx tsc --noEmit` 0 新错误
- ✅ `cd game/frontend && npx vue-tsc --noEmit` 0 新错误
