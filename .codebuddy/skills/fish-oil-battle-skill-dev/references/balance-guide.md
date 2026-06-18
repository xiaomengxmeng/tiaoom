# 数值平衡指南

## 数值设计原则

### 伤害基准（参考）

| 武器类型 | 普通伤害 | 爆发伤害 | 能量需求 | 示例 |
|----------|----------|----------|----------|------|
| 近距离高伤 | 8-12 | 15-20 | 3-4 | 纳米撕裂者 |
| 中距离 | 5-8 | 10-15 | 4-5 | 冲击波发生器（6/10） |
| 控制型 | 3-5 | 8-12 | 4-6 | 防火墙协议（3 接触伤害） |
| 召唤型 | 1-3×N | 2-5×N | 5-7 | 蜂巢母体（1 蜂刺×3-9蜂） |

### 半径基准

| 效果类型 | 半径（逻辑 px） | 说明 |
|----------|----------------|------|
| 近战范围 | 100-150 | 贴身碰撞 |
| 中等范围 | 200-300 | 中距离技能 |
| 大范围 | 300-400 | 全场技能 |
| 竞技场半径 | ~400 | 最大值参考 |

### 持续时间基准

| 效果类型 | 持续时间 |
|----------|----------|
| 瞬时效果 | 0.5-1.5s（视觉） |
| 持续伤害 DoT | 3-8s |
| 场地效果 | 10-18s |
| 减速效果 | 2-5s |

### 能量积攒参考

| 积攒方式 | 每格能量需求 |
|----------|-------------|
| 命中对手 | 1 格/次 |
| 受击积攒 | 1 格/次 |
| 场地伤害转换 | 每 15 伤害 = 1 格 |
| 时间自动 | 约 20s 充满 |

## WeaponRangeConfig 字段说明

```typescript
interface WeaponRangeConfig {
  // ── 伤害相关 ──
  damageRadius?: number;     // 伤害作用半径（逻辑 px）
  aoeMaxRadius?: number;     // AOE 最大扩散半径
  hitRadius?: number;        // 命中判定半径（如蜂刺球）
  damage?: number;           // 普通伤害
  burstDamage?: number;      // 爆发伤害

  // ── 视觉相关 ──
  visualRadius?: number;     // 特效视觉半径（默认 = damageRadius）
  visualSpeed?: number;      // 特效扩散速度 px/s
  visualDurationMs?: number; // 特效持续时间 ms

  // ── 能量相关 ──
  maxEnergy?: number;        // 最大能量格数
  burstDurationSec?: number; // 爆发持续时间

  // ── 投射物 ──
  projectile?: {
    speed: number;           // 飞行速度 px/s
    maxBounces: number;      // 最大反弹次数
    maxLifetimeSec: number;  // 最大存活时间
    hitRadius: number;       // 命中半径
  };

  // ── 场地装置 ──
  field?: {
    maxCount: number;        // 场上最大数量
    durationSec: number;     // 持续时间
    radius: number;          // 影响半径
    contactDamage?: number;  // 接触伤害
    slowPercent?: number;    // 减速百分比（0-100）
    damagePerEnergy?: number;// 每多少伤害充能 1 格
    burstHardenDamage?: number; // 硬化碰墙伤害
  };

  // ── 冲击波专用 ──
  baseBounces?: number;      // 普通反弹次数
  burstWaves?: number;       // 爆发波数
  burstBounces?: number;     // 爆发反弹次数
  maxHitsPerWave?: number;   // 单波最大命中数

  // ── 蜂巢母体专用 ──
  hiveMother?: {
    initialBeeCount: number;
    maxBeeCount: number;
    stingerCooldownPerBee: number;
    stingerLaunchInterval: number;
    stingerDamage: number;
    burstBeeBonus: number;
    burstDamage: number;
    burstDurationSec: number;
    maxEnergy: number;
  };
}
```

## 平衡检查清单

- [ ] 伤害与能量需求成比例（高伤害 = 高能量需求）
- [ ] 爆发伤害不超过普通伤害的 2.5 倍
- [ ] 控制效果的减速不超过 60%
- [ ] 射程与伤害成反比（远程 = 低伤害）
- [ ] 能量积攒速度合理（约 10-20 秒充满）
- [ ] 场地持续时间不超过 20 秒
- [ ] 多段伤害总和 ≤ 单次高伤武器的伤害
- [ ] 投射物速度与反弹次数成反比
- [ ] 考虑流派平衡：同流派武器间有互补性

## 已实现武器数值参考

### 冲击波发生器（侵略者 #FF00FF）
```
伤害: 6  |  爆发伤害: 10  |  能量: 4
范围: 350px  |  扩散速度: 300px/s
普通反弹: 1次  |  爆发波数: 3波  |  爆发反弹: 2次
单波最大命中: 2人
```

### 防火墙协议（控制者 #00BFFF）
```
能量: 4  |  爆发持续: 8s
场地数量: 3个  |  持续: 18s  |  范围: 80px
接触伤害: 3  |  减速: 40%
硬化碰墙伤害: 4.2  |  伤害充能: 15伤害/格
```

### 蜂巢母体（工程师 #39FF14）
```
初始蜂: 3只  |  最大蜂: 6只  |  能量: 7
蜂刺伤害: 1  |  蜂刺冷却: 1.2s  |  发射间隔: 0.4s
爆发蜂加成: +3只  |  爆发伤害: 2  |  爆发持续: 5s
蜂刺球半径: 40px  |  公转半径: 50px
```
