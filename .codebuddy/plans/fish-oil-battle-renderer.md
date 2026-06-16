# 计划：赛博鱼油前端高性能渲染器

## 状态
ready

## 概述
实现赛博鱼油（Cyber Fish Oil）游戏前端的高性能 Pixi.js 渲染器，包含：
1. **小球实体渲染**：圆形头像 + 流派霓虹光环 + 浮动ID + 动态光影 + 拖尾残影
2. **物理运动系统**：位移、碰撞检测、边界反弹（与后端20fps逻辑帧同步，前端插值60fps）
3. **技能特效系统**：完整生命周期（触发→持续→消散），含光效、拖尾、ADD混合模式
4. **解耦架构**：`PlayerRenderer` 与 `EffectRenderer` 完全独立，通过事件总线通信

## 文件结构

```
game/frontend/src/components/fish-oil-battle/
├── FishOilBattleRoom.vue      ← 主房间组件（嵌入 GameView）
├── FishOilBattleCanvas.vue    ← Pixi.js 画布封装（负责初始化和resize）
├── components/
│   ├── WeaponSelectOverlay.vue  ← 武器选择遮罩（3选1）
│   └── BattleHudPanel.vue     ← 左右HUD面板
├── renderer/
│   ├── CyberFishRenderer.ts     ← Pixi.js 主渲染器（管理所有层）
│   ├── entities/
│   │   ├── PlayerRenderer.ts    ← 小球实体渲染（L1层，纯视觉）
│   │   └── EffectRenderer.ts    ← 特效渲染（L2-L3+L5层，纯视觉）
│   ├── systems/
│   │   ├── PhysicsSystem.ts     ← 前端预测/插值物理系统
│   │   └── ParticlePool.ts     ← 对象池化粒子系统
│   └── filters/
│       └── BloomFilter.ts       ← Bloom后处理滤镜封装
└── useFishOilBattle.ts         ← Composable（状态管理+WebSocket事件）
```

## 详细实施步骤

### Step 1：安装 Pixi.js 依赖
- 在 `game/frontend/` 下 `npm install pixi.js@8`
- 确认 `package.json` 包含 `"pixi.js": "^8.0.0"`

### Step 2：创建 `FishOilBattleCanvas.vue`（Pixi.js 初始化）
- `<canvas>` ref + 初始化 Pixi.js Application
- 自动适配 `GameView` slot 尺寸（ResizeObserver）
- 导出 `app` 实例供 `CyberFishRenderer` 使用
- 处理 `beforeDestroy` 生命周期（销毁 Pixi.js app）

### Step 3：创建 `PhysicsSystem.ts`（物理插值系统）
- 接收后端20fps广播状态（tick + x/y/vx/vy）
- **位置插值**：当前显示帧在两个逻辑帧之间线性插值
- **速度外推**：基于上一帧速度预测，收到新状态时修正
- 碰撞反弹：纯前端预测（与后端逻辑一致：完美镜面反射，弹力系数0.9）
- 导出接口：
  ```typescript
  interface PhysicsState {
    tick: number;
    x: number; y: number;
    vx: number; vy: number;
    hp: number; energy: number;
  }
  function updateState(playerId: string, state: PhysicsState): void
  function interpolate(playerId: string, renderTime: number): InterpolatedState
  ```

### Step 4：创建 `PlayerRenderer.ts`（小球实体渲染，L1层）
**严格只负责视觉渲染，不含任何物理逻辑**

视觉元素：
1. **头像纹理**：通过 `PIXI.Sprite.from(avatarUrl)` 加载玩家头像，圆形遮罩（`PIXI.Graphics` 裁切）
2. **流派光环**：`PIXI.Graphics` 绘制霓虹圆环，每帧旋转 + 亮度脉动（用 `Math.sin(time)` 控制 alpha）
3. **浮动ID**：`PIXI.Text` 显示玩家昵称，跟随头像上方
4. **拖尾残影**：用 `ParticlePool` 管理，每帧在上一帧位置生成低透明度残影精灵，0.3秒后回收
5. **动态光影**：`pixi.js MeshRope` + 自定义着色器 或 用 `pixi.js.filters.AlphaFilter` 模拟光晕

渲染接口：
```typescript
class PlayerRenderer {
  constructor(container: PIXI.Container, playerId: string, faction: Faction)
  update(state: InterpolatedState): void   // 每帧调用，只更新视觉
  setFaction(faction: Faction): void      // 切换流派颜色
  playHitEffect(): void                   // 受击闪白
  playBurstEffect(): void                 // 爆发光效
  destroy(): void
}
```

### Step 5：创建 `ParticlePool.ts`（对象池化粒子系统）
- 固定容量数组（上限500个粒子，超出回收最旧）
- 粒子属性：`x, y, alpha, scale, tint, life, maxLife`
- 用于：
  - 拖尾残影（`PlayerRenderer` 调用）
  - 碰撞火花（`EffectRenderer` 调用）
  - 通用粒子特效
- `ParticlePool` 与 `EffectRenderer` 解耦：前者只管理粒子生命周期，后者决策何时生成粒子

### Step 6：创建 `EffectRenderer.ts`（特效渲染，L2-L3+L5层）
**严格只负责特效视觉，不含任何游戏逻辑**

特效生命周期管理：
```
Trigger（触发）
  └── 生成特效实例（ShockwaveEffect / FirewallEffect / HiveEffect）
  └── 播放触发音效（预留接口）
  └── 添加到 L2/L3/L5 对应 Container

Sustain（持续）
  └── 每帧 update(dt)
  └── 扩散/旋转/颜色渐变
  └── ADD 混合模式（`sprite.blendMode = PIXI.BLEND_MODES.ADD`）

Decay（消散）
  └── alpha 线性降至 0
  └── 缩放至 0
  └── 从 Container 移除
  └── 回收到对象池
```

3个MVP技能特效实现：

**ShockwaveGenerator（冲击波）**
- L3层：`PIXI.Graphics` 绘制 expanding ring（半径0→200px，速度400px/s）
- 碰墙变色：检测到墙壁边界时 `tint = 0x00BFFF`（电蓝→品红渐变）
- ADD混合模式
- 爆发（burst）：同时生成3个 `Graphics` ring，角度间隔120°

**FirewallProtocol（防火墙）**
- L3层：`PIXI.Sprite` + 六边形网格纹理（程序生成或占位精灵）
- 半透明：`alpha = 0.4`
- 持续伤害指示：每帧对对手方向投射射线检测
- 爆发：所有防火墙 `tint = 0xFF0000`（红色警报），`alpha = 1.0`

**HiveMother（蜂巢母体）**
- L2层：3个 `PIXI.Graphics` 绘制小六边形（酸绿 `#39FF14`）
- 公转动画：`orbitAngle += dt * orbitSpeed`
- 蜂刺：`ParticlePool` 生成绿色细光线精灵
- 爆发：额外生成3个六边形 + 所有蜂 `scale *= 1.5` + 颜色 `tint = 0xFFFFFF`（白热）

渲染接口：
```typescript
class EffectRenderer {
  constructor(layers: { l2: PIXI.Container; l3: PIXI.Container; l5: PIXI.Container })
  
  // 特效触发（由外部事件驱动）
  triggerShockwave(x: number, y: number, isBurst: boolean): void
  triggerFirewall(x: number, y: number, isHardened: boolean): void
  triggerHiveSting(fromX: number, fromY: number, toX: number, toY: number): void
  triggerBurst(playerId: string, weaponId: string): void
  
  // 持续更新
  update(dt: number): void
  
  // 清理
  clear(): void
}
```

### Step 7：创建 `CyberFishRenderer.ts`（主渲染器，编排层）
- 初始化 Pixi.js `Application`，创建 L1-L5 层容器
- 组合 `PlayerRenderer` + `EffectRenderer` + `PhysicsSystem`
- **解耦关键**：`PlayerRenderer` 和 `EffectRenderer` 互相不知道对方存在，只通过 `CyberFishRenderer` 协调
- 渲染循环：`app.ticker.add(dt => { physics.interpolate(); playerRenderer.update(); effectRenderer.update(dt); })`
- 后处理：`app.stage.filters = [new BloomFilter()]`

### Step 8：创建 `useFishOilBattle.ts`（Composable 状态管理）
- 连接 Tiaoom WebSocket，监听后端事件：
  - `battle_start` → 显示武器选择
  - `game_state` → 更新 `PhysicsSystem` 状态
  - `visual_event` → 触发 `EffectRenderer` 特效
  - `game_end` → 显示结算
- 管理响应式状态：`showWeaponSelect`, `battleHudVisible`, `selfHud`, `opponentHud`
- 不直接操作 Pixi.js，只通过事件驱动 `CyberFishRenderer`

### Step 9：创建 `FishOilBattleRoom.vue`（主Vue组件）
- 嵌入 `GameView` 组件（复用通用布局）
- 在 `<section>` slot 中放置：
  1. `FishOilBattleCanvas`（Pixi.js 画布）
  2. `BattleHudPanel`（左右HUD，z-10）
  3. `WeaponSelectOverlay`（武器选择，z-20）
- 生命周期：`onMounted` → 初始化 `CyberFishRenderer` → 启动渲染循环
- 清理：`onUnmounted` → 销毁渲染器

### Step 10：性能优化
1. **ParticlePool**：对象池复用，避免GC
2. **ParticleContainer**：对于纯色粒子（蜂刺、残影），使用 `PIXI.ParticleContainer`（跳过迭代，大幅减少Draw Call）
3. **Texture Atlas**：所有程序化纹理打包到一张 Sprite Sheet（后续优化，MVP先用程序化生成）
4. **BloomFilter**：只在爆发时启用，平时关闭
5. **插值降频**：物理插值30fps即可，不必每帧重算
6. **特效上限**：同屏特效数量上限50个，超出跳过

## 架构解耦验证

```
CyberFishRenderer（编排层）
    │
    ├── PhysicsSystem（纯数据，无渲染）
    │        ↑ 接收后端状态
    │        ↓ 输出插值状态
    │
    ├── PlayerRenderer（纯渲染，无逻辑）
    │        ↑ 读取插值状态 → 更新视觉
    │
    └── EffectRenderer（纯渲染，无逻辑）
             ↑ 接收事件 → 生成/更新/销毁特效

useFishOilBattle（Composable）
    │
    └── 监听 WebSocket → 驱动 CyberFishRenderer
```

**解耦要点**：
- `PlayerRenderer` 不知道 `EffectRenderer` 存在
- `EffectRenderer` 不知道 `PlayerRenderer` 存在
- `PhysicsSystem` 只管理数据，不调用任何渲染器
- 所有通信通过 `CyberFishRenderer` 或事件总线

## 依赖安装
```bash
cd d:/TraePro/fishoil/tiaoom/game/frontend
npm install pixi.js@8
```

## 测试验证
1. `FishOilBattleRoom.vue` 能正确嵌入 `GameView`
2. 两个小球在 Canvas 中弹跳（用模拟数据）
3. 拖尾残影正确显示并自动回收
4. 技能特效触发→持续→消散完整生命周期
5. 60fps 渲染不卡顿（Chrome DevTools Performance 验证）
6. 特效与小球渲染模块独立运行（单元测试隔离验证）
