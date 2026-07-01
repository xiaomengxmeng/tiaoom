# 放电猫猫电弧链接特效重构设计

**日期**: 2026-07-01
**主题**: 放电猫猫 (Discharge Cat) 电弧特效重构为"实时跟随链接"

---

## 1. 背景与问题

### 当前实现（已修复但效果不佳）

后端 `DischargeCatWeapon.fireArc` 已改为单段链接（小金喵 → 对手球），不再弹射。
前端 `DischargeCatRenderer.triggerArc` 接收 `arcNodes: Array<{x, y}>` 坐标数组，在 `onUpdate` 闭包中冻结这些坐标，1.2s 特效期间电弧端点固定不变。

### 核心问题

**触发瞬间冻结坐标 → 没有"链接感"**

- 触发时两球在 A、B 位置
- 1.2s 特效期间两球都在物理移动到 A'、B'
- 但电弧端点仍停在 A、B → 看起来像"瞬间闪电"而非"持续连接"
- 用户反馈："效果还是不太好，没有那种两者被电流链接的感觉"

### 用户诉求

1. 电弧要"根据对方小球的位置和自己的位置实时调整"
2. 特效时间延长到 1.5s
3. 视觉表现：单主闪电 + 能量颗粒单向流动
4. 主闪电形式：锯齿 + 平滑光晕叠加
5. 起止点：两球中心
6. 实现方式：前端查询跟随（不增加后端网络推送）

---

## 2. 方案选择

### 已选方案：方案 A — 前端每帧查询 PlayerRenderer

`DischargeCatRenderer` 持有 `CyberFishRenderer` 引用，`triggerArc` 接收 `sourceId + targetId`，`onUpdate` 每帧调 `cyberFish.getPlayerRenderer(id)?.getContainer()` 拿实时画布坐标。

### 否决方案

- **方案 B（回调注入）**：解耦但调用方需额外绑定，多一层间接
- **方案 C（后端每 tick 推送）**：增加网络流量，用户已否决

---

## 3. 架构设计

### 3.1 数据流

```
后端 DischargeCatWeapon.fireArc
  └─ VISUAL_ONLY 事件（携带 sourceId, targetId, catX, catY 兜底坐标）
       ↓ 网络传输 1 次
前端 useFishOilBattle.ts → CyberFishRenderer.triggerSkillEffect
  └─ case DISCHARGE_CAT_ARC:
       └─ this.effectRenderer.triggerDischargeArc(sourceId, targetId, isBurst, ...)
            └─ DischargeCatRenderer.triggerArc(sourceId, targetId, isBurst, ...)
                 └─ ActiveEffect.onUpdate 每帧:
                      ├─ fromPos = cyberFish.getPlayerRenderer(sourceId)?.getContainer()
                      ├─ toPos   = cyberFish.getPlayerRenderer(targetId)?.getContainer()
                      ├─ if (!fromPos || !toPos) → 跳过本帧绘制，life 继续
                      ├─ drawLinkedLightning(fromPos, toPos, ...)  // 实时端点
                      └─ updateAndDrawEnergyParticles(fromPos, toPos, ...)  // 沿 from→to 流动
```

### 3.2 关键改动点

1. **`DischargeCatRenderer` 新增依赖**：构造函数注入 `CyberFishRenderer` 引用
2. **`triggerArc` 签名统一**：`(sourceId, targetId, isBurst, themeColor?, palette?)`
3. **`onUpdate` 每帧查询**：调 `cyberFish.getPlayerRenderer(id)?.getContainer()` 拿 `{x, y}`
4. **后端 `metadata` 补充 `targetId`**：VISUAL_ONLY 事件显式携带目标 ID
5. **`EffectRenderer.triggerDischargeArc` 签名同步调整**
6. **`CyberFishRenderer.case DISCHARGE_CAT_ARC` 调用点**：传 `config.playerId` + `config.metadata.targetId`
7. **测试页 mock**：`EffectTestController` 创建 stub `CyberFishRenderer`，`effectRegistry.ts` 调用改为传 ID

---

## 4. 视觉设计

### 4.1 持续时间

固定 `1500ms`（不区分爆发态）。

### 4.2 主闪电（锯齿 + 平滑光晕）

每帧重新生成，端点为 `fromPos` / `toPos` 实时坐标：

| 层 | 形式 | 颜色 | 宽度 | 透明度 |
|----|------|------|------|--------|
| 外层光晕 | 平滑曲线（4 控制点 Bezier 或 Catmull-Rom，仅 1 条） | 白色 `0xffffff` | `baseWidth * 2.0` | `0.25 * alpha` |
| 主题辉光 | 平滑曲线（同上） | 主题金 `0xffcc00` | `baseWidth * 1.4` | `0.45 * alpha` |
| 主色闪电 | 锯齿折线（8-12 段，每帧随机抖动 ±15px） | 电青 `0x00bbff` | `baseWidth * 0.8` | `0.9 * alpha` |
| 核心高亮 | 锯齿折线（同上同点） | 纯白 `0xffffff` | `baseWidth * 0.3` | `1.0 * alpha` |

- `baseWidth = (isBurst ? 8 : 6) * scale`
- 平滑曲线与锯齿折线共享相同端点，叠加产生"动态光弦"质感

### 4.3 能量颗粒（单向流动）

- **数量**：常驻 6-8 个颗粒沿主线分布
- **运动**：每颗粒有 `progress ∈ [0, 1]`，每帧 `progress += speed * dt / lineLength`，到达 1 后重置为 0（循环）
- **位置**：`pos = lerp(fromPos, toPos, progress)` + 沿法线方向小抖动（±3px）
- **绘制**：双层圆（外晕电青 + 核心白），半径 `2-3px * scale`
- **透明度**：`alpha = sin(progress * π)`（中段最亮，两端淡入淡出）
- **生命周期**：颗粒随特效自然存活，不单独 maxLife

### 4.4 两端电场节点（端点高亮）

替代旧版"命中点放射闪电"：
- 在 `fromPos` 和 `toPos` 各画一个小电场环（多层径向渐变圆，半径 `8-12px * scale`）
- `fromPos` 端：金色为主（小金喵端）
- `toPos` 端：电青为主（受击端，更亮一些表现"被击中"）
- 随 `t` 脉动：`r *= 1 + 0.2 * sin(t * 20)`

### 4.5 整体透明度曲线

替换旧版"双回闪"，改为更连贯的"持续链接 + 收尾消散"：

| t 区间 | alpha |
|--------|-------|
| 0 - 0.15 | 0 → 1（快速亮起） |
| 0.15 - 0.75 | 1（持续满亮，颗粒流动） |
| 0.75 - 1.0 | 1 → 0（消散） |

### 4.6 移除元素

- ❌ 旧版"双回闪"闪烁曲线
- ❌ 旧版"命中点放射闪电"（4-8 条向外爆散）
- ❌ 旧版"命中点闪光多层径向渐变"
- ❌ 旧版"电弧粒子向四周飞溅"（被能量颗粒取代）

### 4.7 保留并调整

- ✅ `drawLightningSegment` 重写为 `drawLinkedLightning(from, to, baseWidth, alpha, themeColor)`，内部生成 1 条平滑曲线 + 1 条锯齿折线
- ✅ `generateJaggedPoints` 保留，用于锯齿层
- ✅ `strokePolyline` 保留

---

## 5. 接口设计

### 5.1 `DischargeCatRenderer` 类

```typescript
constructor(
  entityContainer: PIXI.Container,
  fieldContainer: PIXI.Container,
  cyberFish: CyberFishRenderer,  // 新增依赖
)
```

### 5.2 `triggerArc` 新签名

```typescript
triggerArc(
  sourceId: string,
  targetId: string,
  isBurst: boolean,
  themeColor?: number,
  palette?: Palette,
): { effect: ActiveEffect | null }
```

闭包只存 `sourceId` / `targetId`，不存坐标。

### 5.3 `EffectRenderer.triggerDischargeArc` 新签名

```typescript
triggerDischargeArc(
  sourceId: string,
  targetId: string,
  isBurst: boolean,
  themeColor?: number,
  palette?: Palette,
): void
```

### 5.4 `CyberFishRenderer.case DISCHARGE_CAT_ARC` 调用

```typescript
case VisualEventType.DISCHARGE_CAT_ARC: {
  const isBurst = config.isBurst ?? false;
  const sourceId = config.playerId ?? '';
  const targetId = (config.metadata?.targetId as string) ?? '';
  if (sourceId && targetId) {
    this.effectRenderer.triggerDischargeArc(
      sourceId, targetId, isBurst,
      themeColor,
      getWeaponPalette(WeaponId.DISCHARGE_CAT),
    );
  }
  break;
}
```

### 5.5 后端 `metadata` 字段补充

`DischargeCatWeapon.fireArc` 的 VISUAL_ONLY 事件 `metadata` 增加 `targetId`：

```typescript
metadata: {
  visualType: VisualEventType.DISCHARGE_CAT_ARC,
  isBurst: this.isBurstActive,
  catX: this.catX,
  catY: this.catY,
  sourceId: this.playerId,
  targetId: target.id,        // 新增
  bounceCount: 0,
  arcNodes: [...],            // 保留作为初始坐标兜底
},
```

---

## 6. 边界处理

| 情况 | 处理 |
|------|------|
| `cyberFish === null`（测试页未注入） | 测试页通过 stub mock，不进入此分支 |
| `getPlayerRenderer(sourceId)` 返回 undefined | 跳过本帧绘制，`life` 继续推进 |
| `getPlayerRenderer(targetId)` 返回 undefined | 同上 |
| 两球位置完全重叠（dist < 1px） | 跳过主线，仅画两端电场环 |
| `targetId` 为空字符串（后端未传） | 跳过整次触发（不创建 ActiveEffect） |

---

## 7. 测试页兼容

### `EffectTestController.ts`

创建 stub `CyberFishRenderer`：

```typescript
const stubCyberFish = {
  getPlayerRenderer: (id: string) => {
    // 返回固定的 mock PlayerRenderer，container 在指定坐标
    if (id === 'test_source') return { getContainer: () => ({ x: 400, y: 225 }) };
    if (id === 'test_target') return { getContainer: () => ({ x: 480, y: 185 }) };
    return undefined;
  },
};
this.dischargeCatRenderer = new DischargeCatRenderer(l2Entity, l3Field, stubCyberFish as any);
```

### `effectRegistry.ts` `case DISCHARGE_CAT_ARC`

```typescript
case VisualEventType.DISCHARGE_CAT_ARC: {
  const result = ctx.dischargeCatRenderer?.triggerArc(
    'test_source', 'test_target',
    false, color, palette,
  );
  if (result?.effect) ctx.activeEffects.push(result.effect);
  break;
}
```

---

## 8. 涉及文件

### 后端

- `game/backend/src/games/fish-oil-battle/skills/weapons/DischargeCatWeapon.ts` — `fireArc` 的 `metadata` 增加 `targetId`

### 前端

- `game/frontend/src/components/fish-oil-battle/renderer/entities/DischargeCatRenderer.ts` — 核心重构
- `game/frontend/src/components/fish-oil-battle/renderer/entities/EffectRenderer.ts` — `triggerDischargeArc` 签名调整
- `game/frontend/src/components/fish-oil-battle/renderer/CyberFishRenderer.ts` — `case DISCHARGE_CAT_ARC` 调用调整 + `DischargeCatRenderer` 实例化注入 `this`
- `game/frontend/src/components/fish-oil-battle/test/EffectTestController.ts` — stub `CyberFishRenderer` + 实例化调整
- `game/frontend/src/components/fish-oil-battle/test/effectRegistry.ts` — `case DISCHARGE_CAT_ARC` 调用调整

---

## 9. 不在本次范围

- ❌ 爆发态（DISCHARGE_CAT_BURST）特效调整
- ❌ 放电猫虚影（CatEarDecorator）调整
- ❌ 后端伤害逻辑调整（已在前序提交完成）
- ❌ 能量积攒速度调整
