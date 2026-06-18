# 鱼油战斗框架 API 参考

## 架构概览

```
后端武器层                  前端渲染层
┌─────────────────┐     ┌──────────────────────┐
│ IWeapon 实现     │     │ EffectRenderer 子渲染器 │
│ (onTick/onHit)   │     │ (trigger/update)      │
├─────────────────┤     ├──────────────────────┤
│ WeaponEffect[]   │────▶│ VisualEventData       │
│ (效果输出)       │ 网络 │ (视觉事件数据)        │
├─────────────────┤     ├──────────────────────┤
│ WeaponRangeConfig│◀────│ CyberFishRenderer     │
│ (数值配置)       │共享 │ (集成 + 渲染循环)     │
└─────────────────┘     └──────────────────────┘
```

## IWeapon 接口

所有武器必须实现此接口。文件位于 `core/IWeapon.ts`。

```typescript
interface IWeapon {
  readonly id: WeaponId;         // 武器唯一 ID
  readonly name: string;         // 武器名称
  readonly school: School;       // 所属流派
  readonly difficulty: number;   // 难度 1-3
  readonly iconId: string;       // 图标 ID
  playerId: string;              // 所属玩家 ID（调度器注册时注入）

  // 生命周期钩子
  onTick(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[];
  onHitTarget(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[];
  onHitByAttacker(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[];
  onWallHit?(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[];
  onObstacleHit?(hittingPlayerId: string, state: IBattleState, physics: IPhysicsQuery): WeaponEffect[];

  // 物理障碍（可选）
  getObstacles?(): PhysicsObstacle[];

  // 能量/爆发
  getEnergy(): number;
  getMaxEnergy(): number;
  isBurstReady(): boolean;
  burst(state: IBattleState, physics: IPhysicsQuery): WeaponEffect[];

  // 状态查询
  getRuntimeState(): WeaponRuntimeState;
  reset(): void;
}
```

### TICKS_PER_SEC = 20

帧率常量为 20 tick/秒，武器实现与调度器共享。所有时间计算需据此转换。

## WeaponEffect 类型

```typescript
interface WeaponEffect {
  type: WeaponEffectType;  // 效果类型
  sourceId: string;         // 来源玩家 ID
  targetId?: string;        // 目标玩家 ID
  value: number;            // 数值（伤害/DPS/减速百分比）
  duration?: number;        // 持续时间（秒）
  aoe?: { x: number; y: number; radius: number };  // 范围效果
  position?: { x: number; y: number };              // 位置
  metadata?: WeaponEffectMetadata;
}

interface WeaponEffectMetadata {
  visualType?: VisualEventType;
  weaponId?: WeaponId;
  radius?: number;
  isBurst?: boolean;
  burst?: boolean;
  tx?: number;
  ty?: number;
  desc?: string;
  [key: string]: any;  // 武器特有字段
}
```

## WeaponEffectType 枚举

| 类型 | 说明 |
|------|------|
| `DAMAGE` | 直接伤害（对 targetId 造成 value 伤害） |
| `AOE_DAMAGE` | 范围伤害（对 aoe 内所有对手造成伤害） |
| `BURST_DAMAGE` | 爆发伤害 |
| `DOT` | 持续伤害（value = 每秒伤害 DPS，调度器自动缩放为每 tick 实际伤害） |
| `SLOW` | 减速（value = 减速百分比 0-100） |
| `SHIELD` | 护盾 |
| `PULL` | 牵引 |
| `PUSH` | 推斥 |
| `SPAWN_FIELD` | 生成场地 |
| `SPAWN_PROJECTILE` | 生成投射物 |
| `SPAWN_FIREWALL` | 生成防火墙 |
| `FIRE_STING` | 蜂刺伤害 |
| `SHOCKWAVE` | 冲击波伤害 |
| `VISUAL_ONLY` | 仅视觉效果（不影响游戏逻辑） |

## IPhysicsQuery 接口

解耦武器与物理引擎，武器只做"空间查询"。

```typescript
interface IPhysicsQuery {
  getAliveOpponentsInRadius(selfId: string, x: number, y: number, radius: number): AliveOpponent[];
  getSelfPosition(playerId: string): { x: number; y: number } | undefined;
  getRandomAliveOpponent(selfId: string): AliveOpponent | undefined;
  getAllAliveOpponents(selfId: string): AliveOpponent[];
  getArenaCenter(): { x: number; y: number };
  getArenaRadius(): number;
}

interface AliveOpponent {
  id: string; x: number; y: number; hp: number; name: string;
}
```

## IBattleState 接口

```typescript
interface IBattleState {
  tick: number;
  players: Map<string, PlayerState>;
  pendingEffects: SkillEffect[];
  activeEffects: SkillEffect[];
  canvasWidth: number;
  canvasHeight: number;

  getPlayer(id: string): PlayerState | undefined;
  getOpponent(id: string): PlayerState | undefined;
  getRandomAliveOpponent(id: string): PlayerState | undefined;
  applyDamage(targetId: string, amount: number, sourceId?: string): void;
}
```

## WeaponRuntimeState

```typescript
interface WeaponRuntimeState {
  energy: number;
  maxEnergy: number;
  cooldowns: Record<string, number>;
  stacks: Record<string, number>;
  flags: Record<string, boolean>;
  custom?: Record<string, any>;  // 武器自定义状态
}
```

## School 流派枚举

| 流派 | 值 | 主题色 | 已实现武器 |
|------|-----|--------|-----------|
| 侵略者 Aggressor | `aggressor` | `#FF00FF` | 冲击波发生器 |
| 控制者 Controller | `controller` | `#00BFFF` | 防火墙协议 |
| 工程师 Engineer | `engineer` | `#39FF14` | 蜂巢母体 |
| 变奏者 Wildcard | `wildcard` | 多变 | 无 |

## VisualEventType 枚举（前后端共享）

```typescript
enum VisualEventType {
  SHOCKWAVE_TRIGGER = 'shockwave_trigger',
  FIREWALL_SPAWN = 'firewall_spawn',
  HIVE_STING = 'hive_sting',
  HIVE_STING_FLIGHT = 'hive_sting_flight',
  HIVE_STING_HIT = 'hive_sting_hit',
  HIVE_STING_BOUNCE = 'hive_sting_bounce',
  SHOCKWAVE_BOUNCE = 'shockwave_bounce',
  SHOCKWAVE_RING_BOUNCE = 'shockwave_ring_bounce',
  SHOCKWAVE_WAVEFRONT_TRIGGER = 'shockwave_wavefront_trigger',
  SHOCKWAVE_WAVEFRONT_UPDATE = 'shockwave_wavefront_update',
  SHOCKWAVE_WAVEFRONT_REMOVE = 'shockwave_wavefront_remove',
  BURST_TRIGGER = 'burst_trigger',
  BEE_COUNT_CHANGE = 'bee_count_change',
  HIT = 'hit',
}
```

## WeaponRegistry 注册机制

文件位于 `core/WeaponRegistry.ts`，工厂模式：

```typescript
interface WeaponEntry {
  id: string;
  name: string;
  school: School;
  difficulty: number;
  iconId: string;
  factory: () => IWeapon;  // 工厂函数
}

const REGISTRY: Record<string, WeaponEntry> = {
  [WeaponId.SHOCKWAVE_GENERATOR]: {
    id: WeaponId.SHOCKWAVE_GENERATOR,
    name: WeaponName.SHOCKWAVE_GENERATOR,
    school: School.AGGRESSOR,
    difficulty: 2,
    iconId: 'game-icons:sonic-wave',
    factory: () => new ShockwaveGeneratorWeapon(),
  },
  // ... 其他武器
};
```

新增武器只需在 `REGISTRY` 中加一行即可注册。
