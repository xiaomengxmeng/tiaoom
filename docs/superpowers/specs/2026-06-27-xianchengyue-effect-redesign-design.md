# 闲乘月（熵寂之触）特效重设计

**日期**：2026-06-27
**范围**：仅 `EntropicTouchRenderer.ts` 单文件重写
**目标**：解决"特效特别丑"问题，提升角色 IP 还原度

---

## 1. 背景与问题

### 1.1 当前实现的问题

`game/frontend/src/components/fish-oil-battle/renderer/entities/EntropicTouchRenderer.ts` 存在 6 个核心问题：

| # | 严重度 | 问题 | 代码位置 |
|---|--------|------|---------|
| 1 | 🔴 | 爆发螺旋是单色暗紫（注释承诺"冰蓝→暗紫渐变"未实现） | `drawVortex` L479-480 |
| 2 | 🔴 | 中心是黑色实心圆点（"热力学奇点"画成墨水滴） | `drawVortex` L483-484 |
| 3 | 🟠 | "长发残影"是 5 条平行 bezier（像紫色面条） | `drawHairAfterimage` L511-528 |
| 4 | 🟠 | 爆发文字像调试输出（">最优解执行中... >牺牲率：1%"） | `showBurstText` L488-498 |
| 5 | 🟡 | 印章"批准"是矩形框（注释说是字样） | `drawCouncilSeal` L323-345 |
| 6 | 🟡 | 动画驱动混乱（update 用 dt，但粒子/印章/漩涡/文字用 rAF/setTimeout） | `animateParticle`/`animateSealStamp`/`animateVortex`/`animateBurstText` |

### 1.2 角色 IP 暗示的应有视觉风格

- **闲** → 悠然、清冷、超脱（旁观者姿态）
- **乘月** → 乘风而行、月色为伴（飘逸、空灵、月华）
- **熵寂之触** → 热寂、绝对零度、熵增（冰冷、寂灭、吸光）

### 1.3 设计哲学

闲乘月是"旁观者"性格 —— 平时如月华般清冷超脱，但"熵寂之触"爆发时揭示其作为热寂执行者的恐怖面。**这种反差是角色魅力的核心**。

---

## 2. 设计方案：双形态融合

**普通技能** = 月华清辉派（仙气空灵）
**爆发** = 熵寂吸光派（震撼反转）

### 2.1 普通技能 — 月华清辉派

#### 2.1.1 低温场 Aura 重设计

**当前**：六边形 + 8 个小六边形 + 16℃ 温度标签

**新设计**：月轮光环结构

| 元素 | 绘制方式 |
|------|---------|
| 月华外晕 | 径向渐变圆（中心白 0.8 → 冰蓝 0.4 → 透明），半径 = 场半径 |
| 月轮主环 | 双层圆环（外环 `#aaffff` width 1 alpha 0.7 + 内环 `#ffffff` width 0.4 alpha 0.5） |
| 六角放射光线 | 6 条短线从内环到外环（60° 均分，模拟冰晶折射） |
| 中心月核 | 白色实心圆（r=4）+ 冰蓝外环（r=6 width 0.5 alpha 0.6） |

**剔除**：16℃ 温度标签彩蛋

**动画**（接入 `update(dt)`）：
- 月轮呼吸：scale 1.0 ↔ 1.05，周期 2s（`Math.sin(life * 0.001 * Math.PI)`）
- 月华晕脉动：alpha 0.6 ↔ 0.9
- 六角光线旋转：0.5 转/秒（`rotation += dt * 0.001 * Math.PI`）
- 冰晶粒子：每 1.5s 生成 1-2 个，从内向外飘散（保留 `ParticlePool.emit`）

#### 2.1.2 冻伤 Frostbite 重设计

**当前**：外圈圆 + 矩形描边（"批准"字样）+ 中心黑点 + 加粗同心环（层数）

**新设计**：霜花六瓣纹结构

| 元素 | 绘制方式 |
|------|---------|
| 霜花光晕 | 径向渐变圆（中心白 0.9 → 冰蓝 0.3 → 透明），半径 25px |
| 霜花六瓣 | 3 条贯穿线（60° 均分）+ 6 组分叉短线，形成雪花结构 |
| 层数环 | 外圈细环累加（每层 +4px 半径，width 0.4→0.3→0.2，alpha 0.4→0.3→0.2） |
| 中心冰核 | 白色实心圆（r=3），高亮 |

**剔除**：矩形"批准"印章、理事会印章概念

**动画**（接入 `update(dt)`）：
- 戳印入场：scale 0 → 1.2 → 1.0（`easeOutBack`，300ms）
- 层数变化时：新增外环淡入（alpha 0 → 0.4，200ms）

### 2.2 爆发 — 熵寂吸光派

**当前**：单色螺旋 + 黑点 + 5 条平行面条 + 调试文字（总时长 5s）

**新设计**：吸光奇点 + 能量撕裂 + 月华长发向心被吸（总时长 = `burstDurationMs`，数据驱动）

#### 2.2.1 视觉元素

| 元素 | 绘制方式 |
|------|---------|
| 吸光奇点核心 | 径向渐变圆（中心黑 1.0 → 暗紫 0.9 → 冰蓝 0.5 → 透明），半径 = 爆发半径 |
| 事件视界环 | 双层细高亮环（外 `#aaffff` width 0.6 alpha 0.7 + 内 `#ffffff` width 0.3 alpha 0.5） |
| 中心吸光核 | 纯黑实心圆（r=6）+ 紫色边缘辉光环（r=7 stroke `#9966ff` width 0.5 alpha 0.9） |
| 能量撕裂线 | 6 条 bezier 从外向内汇聚（渐变笔触：外端透明 → 中段高亮 → 内端暗紫） |
| 月华长发 | 4 条非平行 bezier（左右各 2，主细搭配），向心被吸向奇点 |

**剔除**：
- 单色暗紫螺旋线
- ">最优解执行中..." 文字
- ">牺牲率：1%" 文字
- 5 条平行 bezier 长发

#### 2.2.2 三阶段戏剧动画

基于 `burst.life += dt` 累计时间（毫秒），**总时长 `T = burst.maxLife`（由 `buildEntropicTouchVisualCfg()` 从 `WeaponRangeConfig.burstDurationSec` 读取并转换）**。三阶段按比例划分：

设 `T = burstDurationMs`（当前后端配置 5s = 5000ms），则：
- 阶段 1 蓄压：`[0, T*0.15]`（5s 时为 0-750ms）
- 阶段 2 坍缩：`[T*0.15, T*0.25]`（5s 时为 750-1250ms）
- 阶段 3 扩散：`[T*0.25, T]`（5s 时为 1250-5000ms）

**阶段 1：蓄压（0 ~ T*0.15）**
- 月华从外围收缩向中心（scale 1.0 → 0.3）
- 光线变暗（alpha 1.0 → 0.3）
- 中心吸光核逐渐显现（alpha 0 → 1）

**阶段 2：坍缩（T*0.15 ~ T*0.25）**
- 奇点爆发：吸光核 scale 0.3 → 1.0（`easeOutCubic`）
- 能量撕裂线从外向内闪现（alpha 0 → 0.8）
- 事件视界环展开（scale 0 → 1.0）

**阶段 3：扩散（T*0.25 ~ T）**
- 事件视界环持续扩散（scale 1.0 → 2.0，alpha 1.0 → 0）
- 月华长发飘逸消散（alpha 0.7 → 0，位置用 `Math.sin(life * 0.003)` 波动，幅度 ±5px）
- 能量撕裂线逐渐消散（alpha 0.8 → 0）
- 吸光核保持但逐渐透明（alpha 1.0 → 0.3）

> 进度映射（阶段3）：`t = (burst.life - T*0.25) / (T*0.75)`，t∈[0,1]，用 `t` 驱动所有插值。这样无论后端把 `burstDurationSec` 改成 3s、5s 还是 8s，视觉表现都会自动同步。

### 2.3 颜色规范

| 用途 | 颜色值 | 说明 |
|------|--------|------|
| 月华主色 | `#88ddff` (0x88DDFF) | 冰蓝，普通技能主色 |
| 月华高亮 | `#aaffff` (0xAAFFFF) | 浅冰蓝，环线高亮 |
| 月核白 | `#ffffff` (0xFFFFFF) | 纯白，中心光点 |
| 熵寂暗紫 | `#9966ff` (0x9966FF) | 爆发紫，边缘辉光 |
| 熵寂深紫 | `#6600cc` (0x6600CC) | 渐变中段 |
| 熵寂黑 | `#000000` (0x000000) | 吸光核中心 |

---

## 3. 技术实现

### 3.1 约束

- **不引入新依赖**：仍用 `PIXI.Graphics` + 现有 `ParticlePool`
- **不使用彩蛋**：剔除所有">xxx"调试风格文字
- **时长数据驱动**：爆发时长必须从 `WeaponRangeConfig.burstDurationSec` 读取，不可硬编码（与其他武器保持一致）
- **API 向后兼容**：新增的 `durationMs` 参数为可选参数，默认值从 WeaponRangeConfig 兜底

### 3.1.1 数据驱动链路修复（关键）

**当前问题**：闲乘月爆发时长在渲染器内硬编码 `maxLife: 5000`，未与后端 `burstDurationSec` 联动。

**对比其他武器的正确链路**（以 DischargeCat 为例）：
```
WeaponRangeConfig.burstDurationSec (4)
  → EffectRenderer.buildDischargeCatVisualCfg() 读取
  → cfg.burstDurationMs = burstDurationSec * 1000
  → effectRenderer.triggerBurst(..., cfg.burstDurationMs ?? 4000, ...)
  → dischargeCatRenderer.triggerBurst(..., durationMs, ...)
  → burst.maxLife = durationMs
```

**闲乘月需补齐的链路**：
```
WeaponRangeConfig.ENTROPIC_TOUCH.burstDurationSec (5)
  → 【新增】EffectRenderer.buildEntropicTouchVisualCfg()
  → cfg.burstDurationMs = burstDurationSec * 1000 = 5000
  → effectRenderer.triggerEntropicBurst(..., cfg.burstDurationMs ?? 5000, ...)
  → entropicTouchRenderer.triggerBurst(..., durationMs, ...)
  → burst.maxLife = durationMs
```

**涉及修改**：

1. `EffectRenderer.ts`：
   - 新增 `buildEntropicTouchVisualCfg()` 方法（参考 `buildDischargeCatVisualCfg`）
   - `triggerEntropicBurst` 签名新增 `durationMs?: number` 参数
   - 调用 `entropicTouchRenderer.triggerBurst(playerId, x, y, radius, themeColor, durationMs ?? cfg.burstDurationMs)`

2. `EntropicTouchRenderer.ts`：
   - `triggerBurst` 签名新增 `durationMs?: number` 参数
   - `burst.maxLife = durationMs ?? 5000`（兜底 5s，与后端默认一致）

3. `CyberFishRenderer.ts`：
   - 调用 `triggerEntropicBurst` 处可选择性传入 durationMs（若后端事件携带则用，否则由 EffectRenderer 兜底）

### 3.2 径向渐变实现

PixiJS v8 `Graphics.fill()` 支持渐变填充：

```typescript
// 方式1：使用 FillGradient（PixiJS v8 原生）
import { FillGradient } from 'pixi.js';
const grad = new FillGradient(0, 0, 0, radius);
grad.addColorStop(0, 0xffffff);
grad.addColorStop(0.3, 0x88ddff);
grad.addColorStop(1, 0x000000);
g.circle(0, 0, radius);
g.fill(grad);

// 方式2：多层同心圆叠加（兜底，若 FillGradient 在 Graphics 中表现不佳）
for (let i = 0; i < 8; i++) {
  const t = i / 8;
  const r = radius * (1 - t * 0.7);
  const color = interpolateColor(0x000000, 0x88ddff, t);
  g.circle(0, 0, r);
  g.fill({ color, alpha: 0.15 });
}
```

**推荐方式 2**（多层同心圆叠加）—— 更可控，无 v8 兼容性风险。

### 3.3 动画驱动迁移

**移除所有 `requestAnimationFrame` / `setTimeout`**：

```typescript
// ❌ 旧：rAF 驱动
private animateVortex(vortex: PIXI.Graphics): void {
  let angle = 0;
  const tick = () => {
    angle += 0.02;
    vortex.rotation = angle;
    if (vortex.parent) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ✅ 新：update(dt) 驱动
update(dt: number): void {
  this.activeBursts.forEach((burst) => {
    burst.life += dt; // 时间累加（毫秒）
    burst.vortexGraphics.rotation += dt * 0.001 * 2; // 2 rad/s

    // 三阶段动画
    if (burst.life < 300) {
      // 阶段1：蓄压
    } else if (burst.life < 500) {
      // 阶段2：坍缩
    } else {
      // 阶段3：扩散
    }
  });
}
```

### 3.4 数据结构更新

```typescript
interface ActiveAura {
  container: PIXI.Container;
  moonGraphics: PIXI.Graphics;     // 替代 hexGraphics
  rayGraphics: PIXI.Graphics;     // 六角放射光线（独立旋转）
  particleTimer: number;
  life: number;                    // ms（改自原 life++ 整数）
  maxLife: number;
  x: number;
  y: number;
  radius: number;
}

interface ActiveFrostbite {
  container: PIXI.Container;
  frostGraphics: PIXI.Graphics;   // 替代 sealGraphics + iceGraphics
  life: number;                    // ms
  maxLife: number;
  stacks: number;
}

interface ActiveBurst {
  container: PIXI.Container;
  coreGraphics: PIXI.Graphics;     // 吸光奇点（替代 vortexGraphics）
  tearGraphics: PIXI.Graphics;     // 能量撕裂线
  hairGraphics: PIXI.Graphics;     // 月华长发
  horizonGraphics: PIXI.Graphics;  // 事件视界环
  life: number;                    // ms
  maxLife: number;                 // 2000
}
```

### 3.5 删除项清单

| 删除内容 | 原因 |
|---------|------|
| `drawAuraHex()` | 替换为 `drawMoonAura()` |
| `drawTinyHex()` | 替换为六角放射光线 |
| `drawCouncilSeal()` | 印章概念废弃 |
| `drawVortex()` | 螺旋废弃，替换为 `drawSingularity()` |
| `drawHairAfterimage()` | 平行面条废弃，替换为 `drawMoonHair()` |
| `showBurstText()` | 调试文字废弃 |
| `showTempLabel()` | 16℃ 彩蛋废弃 |
| `animateParticle()` | rAF 废弃，迁移到 update |
| `animateSealStamp()` | rAF 废弃，迁移到 update |
| `animateVortex()` | rAF 废弃，迁移到 update |
| `animateBurstText()` | setTimeout 废弃，文字删除 |
| `spawnIceCrystals()` | rAF 废弃，改用 `particlePool.emit()` 并由 ParticlePool 内部 update 驱动 |
| `tempLabels` Map | 温度标签废弃 |
| `removeAura` 中的 `tempLabels` 清理逻辑 | 标签已废弃，移除相关代码 |

---

## 4. 影响范围

### 4.1 修改文件

- `game/frontend/src/components/fish-oil-battle/renderer/entities/EntropicTouchRenderer.ts`（完全重写）
- `game/frontend/src/components/fish-oil-battle/renderer/entities/EffectRenderer.ts`（新增 `buildEntropicTouchVisualCfg()` + `triggerEntropicBurst` 加 `durationMs` 参数）
- `game/frontend/src/components/fish-oil-battle/renderer/CyberFishRenderer.ts`（可选：调用处传入 durationMs）

### 4.2 ParticlePool 接口前置检查（实现前需确认）

`spawnIceCrystals` 改用 `particlePool.emit()` 前，需先确认 ParticlePool 的 `emit` 方法签名支持以下参数：
- 起始位置 x, y
- 速度向量（或角度+速度）
- 生命周期
- 颜色（tintStart/tintEnd）
- 尺寸（scaleStart/scaleEnd）

若 ParticlePool.emit 签名不匹配，则保留自定义冰晶粒子绘制逻辑，但**动画驱动必须迁移到 `update(dt)`**（不再用 rAF）。

### 4.3 不修改

- `EffectRenderer.ts`（调用方，API 不变）
- `WeaponRangeConfig.ts`（配置不变）
- 后端逻辑（视觉层无关）

### 4.4 API 兼容性

**保持不变**：
- `triggerAura(playerId, x, y, radius, themeColor?)`
- `removeAura(playerId)`
- `triggerFrostbite(targetId, x, y, stacks, themeColor?)`
- `removeFrostbite(targetId)`
- `update(dt)`
- `setScale(scale)`
- `clear()`

**签名变更（新增可选参数，向后兼容）**：
- `EntropicTouchRenderer.triggerBurst(playerId, x, y, radius, themeColor?, durationMs?: number)`
- `EffectRenderer.triggerEntropicBurst(playerId, x, y, radius, themeColor?, durationMs?: number)`

> 默认值由 `buildEntropicTouchVisualCfg()` 从 `WeaponRangeConfig.burstDurationSec ?? 5` 兜底，确保不传参时行为与当前一致（5s）。

---

## 5. 验收标准

1. ✅ 低温场显示月轮光环 + 六角光线 + 月核，无六边形/温度标签
2. ✅ 冻伤显示霜花六瓣纹 + 层数细环，无矩形印章
3. ✅ 爆发显示吸光奇点 + 能量撕裂 + 月华长发，无单色螺旋/黑点/调试文字
4. ✅ 爆发时长由 `WeaponRangeConfig.burstDurationSec` 数据驱动（当前 5s），不再硬编码
5. ✅ 三阶段动画按比例划分（0.15T / 0.10T / 0.75T），随 durationMs 自动缩放
6. ✅ `EffectRenderer` 新增 `buildEntropicTouchVisualCfg()`，与其他武器链路一致
7. ✅ 所有动画由 `update(dt)` 驱动，无 `requestAnimationFrame` / `setTimeout`
8. ✅ 代码无 TypeScript 错误，构建通过
9. ✅ `triggerBurst` / `triggerEntropicBurst` 新增 `durationMs?` 可选参数，向后兼容

---

## 6. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 多层同心圆叠加性能 | 单个特效最多 8 层圆，可接受 |
| 径向渐变视觉不如 SVG | 调整层数和 alpha 值迭代优化 |
| 三阶段动画时序边界 | 用比例 `T*0.15` 等划分，严格 `if-else` 分段 |
| `life` 从整数改 ms 导致旧逻辑失效 | 本文件内所有 life 使用都重写 |
| `durationMs` 未传导致回退硬编码 | `buildEntropicTouchVisualCfg()` 兜底 `burstDurationSec ?? 5` |
| 后端 `burstDurationSec` 调整后视觉不同步 | 视觉完全依赖该值，无需改前端代码 |
