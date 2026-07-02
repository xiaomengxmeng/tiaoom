# 放电猫猫技能优化设计文档

**日期**：2026-07-02  
**优化目标**：使电弧链接造成持续伤害，与视觉效果同步

---

## 一、问题分析

### 当前问题
- 电弧特效持续 1.5 秒，但伤害只在碰撞瞬间造成一次（4 点）
- 视觉与伤害不同步，玩家反馈不够持续

### 优化目标
- 电弧链接期间（1.5 秒）**每 0.5 秒造成一次伤害**
- 总伤害量保持 **4 点不变**（1 + 1 + 2）
- 伤害时间点：0s、0.5s、1.0s 各一次
- CD 从**第一次伤害**开始计算

---

## 二、实现方案（方案 A：后端 onTick 定时造成伤害）

### 2.1 后端状态管理

在 `DischargeCatWeapon.ts` 中添加状态变量：

```typescript
/** 当前电弧链接的目标（null 表示无链接） */
private arcTargetId: string | null = null;

/** 电弧链接开始的时间（tick） */
private arcStartTick: number = 0;

/** 电弧链接持续时长（tick）= 1.5 秒 */
private readonly ARC_DURATION_TICKS = Math.round(1.5 * TICKS_PER_SEC);

/** 已造成的伤害次数（0-3） */
private arcDamageCount: number = 0;

/** 伤害时间点（相对于开始 tick 的偏移，单位：秒） */
private readonly DAMAGE_TIMING = [0, 0.5, 1.0];
```

### 2.2 伤害时机计算

```typescript
private getDamageTicks(): number[] {
  return this.DAMAGE_TIMING.map(t => Math.round(t * TICKS_PER_SEC));
  // 结果：[0, 30, 60] （假设 TICKS_PER_SEC = 60）
}
```

### 2.3 伤害分配逻辑

```typescript
private getDamageAtCount(count: number): number {
  const damages = [1, 1, 2]; // 1 + 1 + 2 = 4
  return damages[count] ?? 0;
}
```

### 2.4 onTick 中的伤害检查

在 `onTick` 方法中添加：

```typescript
// ── 电弧链接持续伤害检查 ──
if (this.arcTargetId) {
  const currentTick = this.tickCounter;
  const elapsedTicks = currentTick - this.arcStartTick;
  
  // 检查是否到达伤害时间点
  const damageTicks = this.getDamageTicks();
  if (this.arcDamageCount < damageTicks.length) {
    const nextDamageTick = damageTicks[this.arcDamageCount];
    if (elapsedTicks >= nextDamageTick) {
      // 造成一次伤害
      const damage = this.getDamageAtCount(this.arcDamageCount);
      effects.push({
        type: WeaponEffectType.DAMAGE,
        targetId: this.arcTargetId,
        value: damage,
        metadata: { desc: `放电猫电弧（第 ${this.arcDamageCount + 1} 次）` },
      });
      this.arcDamageCount++;
      
      // 第一次伤害时记录 CD
      if (this.arcDamageCount === 1) {
        this.cooldowns['fireArc'] = currentTick;
      }
    }
  }
  
  // 检查电弧是否结束
  if (elapsedTicks >= this.ARC_DURATION_TICKS) {
    this.arcTargetId = null;
    this.arcDamageCount = 0;
  }
}
```

### 2.5 修改 fireArc 方法

**原逻辑**：碰撞瞬间造成伤害 + 显示电弧特效  
**新逻辑**：碰撞后启动电弧链接，不再立即造成伤害

```typescript
private fireArc(targetId: string, targetPos: Point, effects: WeaponEffect[]) {
  // 设置电弧链接状态
  this.arcTargetId = targetId;
  this.arcStartTick = this.tickCounter;
  this.arcDamageCount = 0;
  
  // 发送视觉事件（电弧开始）
  const start = this.getOwnerPosition();
  const nodes = this.buildArcNodes(start, targetPos);
  
  effects.push({
    type: WeaponEffectType.VISUAL_ONLY,
    metadata: {
      visualType: VisualEventType.DISCHARGE_CAT_ARC,
      isBurst: this.isBurstActive,
      arcNodes: nodes,
      targetId: targetId,
      // 新增：伤害时间点（相对开始时间的秒数）
      damageTimings: [0, 0.5, 1.0],
      // 新增：每次伤害的值
      damageValues: [1, 1, 2],
    },
  });
}
```

---

## 三、前端配合方案

### 3.1 电弧脉冲效果

在 `DischargeCatRenderer.ts` 的 `triggerArc` 方法中，添加伤害时刻的脉冲效果：

```typescript
onUpdate: (_ef, dt) => {
  const t = _ef.life / _ef.maxLife;
  
  // 检查是否到达伤害时间点（从 metadata 读取）
  const damageTimings = _ef.metadata?.damageTimings ?? [];
  for (const timing of damageTimings) {
    if (Math.abs(t - timing / 1.5) < 0.02) { // 容差 20ms
      // 触发电弧脉冲：宽度 +20%，透明度闪烁
      pulseAlpha = 1.5; // 持续 100ms
    }
  }
  
  // 绘制电弧时应用脉冲效果
  const currentAlpha = alpha * (pulseAlpha > 0 ? pulseAlpha : 1);
  pulseAlpha = Math.max(0, pulseAlpha - dt / 100);
}
```

### 3.2 伤害数字显示

前端无需额外修改，因为后端每次造成伤害时都会发送 `DAMAGE` 事件，前端会自动显示伤害数字（-1、-1、-2）。

---

## 四、爆发模式特殊处理

爆发期间（雷霆万钧）：
- **移除 CD 限制**（已实现）
- **伤害提升**：每次伤害 ×2（1→2, 1→2, 2→4，总伤害 8 点）
- **电弧持续时间缩短**：1.5s → 1.0s（更快的节奏）

实现方式：在 `getDamageAtCount` 中检查 `this.isBurstActive`

```typescript
private getDamageAtCount(count: number): number {
  const damages = [1, 1, 2]; // 1 + 1 + 2 = 4
  let damage = damages[count] ?? 0;
  
  // 爆发模式伤害翻倍
  if (this.isBurstActive) {
    damage *= 2;
  }
  
  return damage;
}
```

---

## 五、修改文件清单

### 后端（2 个文件）
1. ✏️ `DischargeCatWeapon.ts` - 核心逻辑改造
2. ✏️ `WeaponRangeConfig.ts` - 配置调整（可选）

### 前端（1 个文件）
3. ✏️ `DischargeCatRenderer.ts` - 视觉效果优化（电弧脉冲）

---

## 六、测试计划

### 6.1 单元测试（后端）
- 测试伤害时机是否准确（0s, 0.5s, 1.0s）
- 测试总伤害是否为 4 点（1+1+2）
- 测试 CD 计算是否正确（从第一次伤害开始）

### 6.2 手动测试（前端）
- 在测试页面（`BattleTestPanel.vue`）中触发放电猫猫
- 观察电弧链接是否持续 1.5 秒
- 确认伤害数字显示 3 次（-1, -1, -2）
- 确认电弧在伤害时刻有脉冲效果

---

## 七、风险评估

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| 伤害时机不准确（tick 计算误差） | 中 | 中 | 使用容差机制，允许 ±1 tick 误差 |
| 电弧链接期间目标死亡 | 低 | 低 | 在 `onTick` 中检查目标是否存活 |
| 前端伤害数字显示延迟 | 低 | 中 | 确保后端 `DAMAGE` 事件及时发送 |

---

**设计批准**：用户已确认（2026-07-02 21:05）  
**下一步**：开始实现代码修改
