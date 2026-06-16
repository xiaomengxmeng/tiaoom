# 《赛博鱼油》技术方案与视觉设计文档

> 版本：v1.0  
> 日期：2026-06-15  
> 主题：赛博朋克 1v1 自动弹球对战  
> 技术栈：Pixi.js + Tiaoom 引擎  

---

## 目录

1. [技术架构方案](#1-技术架构方案)
2. [视觉设计系统](#2-视觉设计系统)
3. [资产制作流程](#3-资产制作流程)
4. [UI/UX 设计方案](#4-uiux-设计方案)
5. [性能预算与优化](#5-性能预算与优化)
6. [实施路线图](#6-实施路线图)

---

## 1. 技术架构方案

### 1.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                     前端（Vue 3）                      │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────┐ │
│  │  Tiaoom SDK  │  │   Pixi.js    │  │ DOM UI  │ │
│  │  (WebSocket) │  │  (WebGL 渲染) │  │ (Overlay)│ │
│  └──────┬───────┘  └──────┬───────┘  └────┬────┘ │
│         │                  │                  │       │
│         └──────────────────┼──────────────────┘       │
│                            │                          │
│                    ┌───────▼────────┐                │
│                    │  游戏状态管理器   │                │
│                    └────────────────┘                │
└─────────────────────────────────────────────────────────┘
                           ↕ WebSocket
┌─────────────────────────────────────────────────────────┐
│                   后端（Tiaoom GameRoom）                │
│  ┌──────────┐  ┌──────────┐  ┌─────────────────┐  │
│  │ 物理引擎   │  │ 武器系统   │  │  状态同步管理器  │  │
│  │ (固定帧率) │  │ (ECS风格) │  │  (20fps 广播)  │  │
│  └──────────┘  └──────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 1.2 渲染管线（Pixi.js）

#### 层级结构（对应原 L1-L5 视觉体系）

| 层级 | Pixi.js 实现 | 混合模式 | 说明 |
|-------|--------------|----------|------|
| **L5 全屏特效** | `Container` + 全屏 `Graphics` | `ADD` | 爆发特效、画面扭曲、闪屏 |
| **L4 数据界面** | HTML DOM Overlay（daisyUI `<progress>`） | `NORMAL` | HUD左右面板（血条/能量进度条）、伤害数字、武器图标 |
| **L3 场地印记** | `ParticleContainer` | `ADD` | 防火墙、油膜、回路、裂隙 |
| **L2 实体投射** | `AnimatedSprite` | `NORMAL` | 蜂刺、鱼雷、弹射碎片 |
| **L1 玩家形象** | `Container`（头像 + 光环 + ID） | `NORMAL` | 圆形头像、流派霓虹光环、浮动 ID |

#### 滤镜配置

```typescript
// 核心滤镜链（伪代码描述）
const bloomFilter = new BloomFilter({
  threshold: 0.3,    // 亮度阈值
  bloomScale: 1.5,    // 发光强度
  blur: 2,            // 模糊半径
});

const scanlineFilter = new ScanlineFilter({
  lineWidth: 2,
  opacity: 0.05,      // 轻微扫描线，增强赛博感
});

app.stage.filters = [bloomFilter, scanlineFilter];
```

### 1.3 物理引擎（后端）

#### 设计原则
- **固定帧率**：每秒 20 次逻辑更新（与状态广播频率一致）
- **确定性**：相同输入 → 相同结果（便于回放和断线重连）
- **简化物理**：不使用真实物理引擎，手写弹球逻辑

#### 核心参数

| 参数 | 值 | 说明 |
|-------|-----|------|
| 球基准速度 | 200 px/s | 可调，随武器变化 |
| 碰撞弹力系数 | 0.9 | 略有能量损失，避免无限加速 |
| 墙壁反弹角度 | 完美镜面反射 | 除非武器修改 |
| 状态广播频率 | 20 fps (50ms) | 前端插值到 60fps |
| 逻辑帧率 | 20 fps | 与广播频率一致 |

### 1.4 武器系统架构（ECS 风格）

#### 接口设计

```
IWeapon (所有武器实现此接口)
├── id: WeaponID
├── name: string
├── color: hex
├── passive(gameState): void          // 常驻特性（每帧调用）
├── active(gameState): void           // 自动触发（按冷却调用）
├── onHit(target: Player): void      // 命中时
├── onHitBy(attacker: Player): void // 被命中时
├── checkEnergyBreak(): boolean       // 检查是否触发爆发
└── burst(gameState): void           // 神话爆发
```

#### 武器状态管理

```typescript
// 每把武器的运行时状态
interface WeaponRuntimeState {
  energy: number;           // 0-6
  cooldowns: Map<string, number>;  // 技能冷却
  stacks: Map<string, number>;     // 层数（如感电、流血）
  flags: Map<string, boolean>;     // 状态标记（如霸体、加速）
}
```

### 1.5 状态同步方案

#### 后端 → 前端广播格式

```json
{
  "type": "game_state",
  "data": {
    "tick": 1234,
    "timestamp": 1718438400000,
    "players": [
      {
        "id": "p1",
        "name": "玩家昵称",
        "avatar": "https://avatar.url/p1.png",
        "x": 640.5,
        "y": 360.0,
        "vx": 150.0,
        "vy": -80.0,
        "hp": 72,
        "weapon": {
          "id": "shockwave_generator",
          "energy": 4,
          "cooldown": 2.3
        }
      }
    ],
    "effects": [
      {
        "type": "shockwave",
        "x": 320,
        "y": 180,
        "radius": 120,
        "growthRate": 300
      }
    ],
    "visualEvents": [
      {
        "type": "burst_trigger",
        "playerId": "p1",
        "weaponId": "shockwave_generator"
      }
    ]
  }
}
```

#### 前端插值策略

```
接收状态 A (tick=1200)
         ↓
接收状态 B (tick=1220)
         ↓
前端在 100ms 内插值：
  - 位置：线性插值（Linear Interpolation）
  - 速度：外推（Extrapolation）+ 修正
  - 特效：独立时间轴，不受插值影响
```

---

## 2. 视觉设计系统

### 2.1 色彩规范

#### 主色调（4 流派）

| 流派 | 主色 | 辅助色 | 用法 |
|-------|--------|--------|------|
| 🟣 侵略者 | `#FF00FF` (品红) | `#FF66FF` | 冲击波、触手、尾焰 |
| 🔵 控制者 | `#00BFFF` (电蓝) | `#66D9FF` | 重力井、防火墙、锚点 |
| 🟢 工程师 | `#39FF14` (酸绿) | `#7FFF66` | 蜂群、回路、方块 |
| 🟡 变奏者 | `#FFD700` (亮黄) | `#FFED66` | 裂隙、尺寸变化、弹射 |

#### 场景色调

| 元素 | 颜色 | 说明 |
|-------|------|------|
| 背景 | `--b1`（daisyUI CSS 变量，跟随主题） | Pixi.js 从 CSS 变量动态读取，支持 35+ 主题 |
| 网格线 | `#1A1A3A` | Pixi.js 绘制，暗蓝紫固定色 |
| 墙壁 | `#00FFFF` 半透明 | 青色霓虹边框，Pixi.js 固定色 |
| 文字 | `#E0E0FF` | Pixi.js 浮空文字固定色 |
| 伤害数字 | `#FF3333` / `#33FF33` | 红色（受伤）、绿色（造成伤害） |

### 2.2 玩家形象设计（L1 本体层）

#### 设计概述

玩家形象以**头像为核心**，取代原有的抽象发光球体。头像外圈有**流派专属霓虹光环**，上方浮动玩家 ID。整体保持"鱼油"的流动感，头像边缘有微弱的液体扭曲效果。

```
核心元素：
  1. 圆形头像（玩家上传或系统默认）
  2. 霓虹光环（流派主色，脉动发光）
  3. 玩家 ID（浮动在头像上方）
  4. 碰撞判定圈（比视觉略大，确保手感）
```

#### 设计规格

```
头像尺寸：
  - 基准直径：80px（视觉），碰撞判定 90px
  - 小球模式：40px
  - 大球模式：120px
  - 巨型化：200px

光环：
  - 宽度：4px
  - 样式：两端渐细（像能量环）
  - 动画：缓慢旋转（0.5Hz）+ 亮度脉动

ID 标签：
  - 字体：OCR A / Courier New（等宽，赛博感）
  - 位置：头像正上方 20px
  - 尺寸：14px
  - 描边：1px 黑色描边（确保可读性）
  - 背景：半透明深色圆角矩形（可选）
```

#### 流派识别设计

| 流派 | 光环颜色 | 光环特效 | 头像边框 |
|-------|----------|----------|----------|
| 🟣 侵略者 | `#FF00FF` 品红 | 光环有裂痕纹理，像过热能量环 | 红色裂纹溢出效果 |
| 🔵 控制者 | `#00BFFF` 电蓝 | 光环上有粒子沿环轨道运行 | 引力扭曲边缘 |
| 🟢 工程师 | `#39FF14` 酸绿 | 光环间断续通电闪烁 | 电路纹理边框 |
| 🟡 变奏者 | `#FFD700` 亮黄 | 光环偶尔信号不良（虚化 0.3秒） | 扫描线覆盖头像 |

#### 头像显示规则

```
默认：显示玩家 Tiaoom 账号头像
未设置头像：显示系统生成的赛博朋克风格默认头像
  - 默认头像基于玩家 ID 哈希生成（确保唯一且风格统一）
  - 风格：低多边形机械脸 / 赛博格面具

头像处理：
  - 上传时自动裁剪成圆形
  - 游戏内实时加载（WebSocket 推送 URL）
  - 加载失败：显示默认头像
  - 加载中：显示占位符（流派主色圆形 + 加载动画）
```

#### 动画规范

| 状态 | 动画描述 |
|-------|-----------|
| Idle（等待开始） | 缓慢上下浮动（正弦波，周期 2 秒）+ 光环旋转 |
| 移动中 | 运动方向有拉伸变形（速度越快拉伸越大）+ 拖尾残影 |
| 受击 | 头像闪白（0.1秒）+ 屏幕震动（2px 偏移，0.2秒缓动） |
| 武器触发 | 光环亮度瞬间翻倍（0.3秒缓动回正常） |
| 爆发激活 | 头像放大 1.2 倍（0.5秒）+ 光环爆炸粒子飞散 |
| 低血（<30% HP） | 头像边缘出现裂纹 + 红色警示脉动 |

### 2.3 武器特效设计（L2-L3 层）

#### 特效清单与设计规格

**#1 冲击波发生器（Aggressor）**
```
L2：无投射物
L3：冲击波环
  - 形状：Torus（圆环），从碰撞点扩散
  - 动画：半径 0→200px，速度 400px/s
  - 视觉：品红色能量环，碰墙后变色（蓝→品红渐变）
  - 爆发：3 道波同时扩散，覆盖全屏
```

**#2 纳米撕裂者（Aggressor）**
```
L2：2 条纳米触手
  - 形状：波浪曲线，从头像两侧延伸 40px
  - 动画：触手摆动（正弦波，2Hz）
  - 爆发：触手巨大化虚影交叉撕裂
L3：触手扫过痕迹
  - 形状：短暂品红划痕（0.3秒后消失）
```

**#4 重力阱（Controller）**
```
L1：头像周围引力环
L3：重力锚点
  - 形状：地面漩涡（螺旋纹理）
  - 动画：纹理旋转（1Hz），对手靠近时被拖拽（拉伸变形）
  - 爆发：黑洞
    - 形状：全屏向中心扭曲（Fragment Shader）
    - 动画：3 秒吸引 + 1 秒爆炸
```

**#10 量子裂隙（Wildcard）**
```
L2：头像量子态
  - 效果：头像虚化（alpha 0.3）+ 扫描线
  - 动画：0.3 秒渐变
L3：裂隙
  - 形状：地面撕裂口（不规则多边形）
  - 颜色：黄色/紫色交替闪烁
  - 连接：裂隙对之间有半透明虚线
  - 爆发：画面碎裂特效（全屏）
```

### 2.4 视觉事件系统

#### 事件类型定义

```typescript
type VisualEvent = 
  | { type: 'weapon_trigger'; weaponId: string; position: Vec2 }
  | { type: 'burst_start'; playerId: string; weaponId: string }
  | { type: 'burst_end'; playerId: string }
  | { type: 'hit'; attackerId: string; defenderId: string; damage: number }
  | { type: 'wall_bounce'; playerId: string; position: Vec2 }
  | { type: 'overheat_start' }  // 80秒过热期开始
  | { type: 'game_end'; winnerId: string | null };
```

#### 事件播放优先级

```
P0（最高）：游戏结束、爆发触发
P1（高）：武器触发、命中特效
P2（中）：墙壁反弹、移动轨迹
P3（低）：环境粒子（油膜、回路等持续特效）
```

---

## 3. 资产制作流程

### 3.1 资产清单

#### 按制作方式分类

| 资产类型 | 制作工具 | 输出格式 | 数量估算 |
|-----------|-----------|-----------|-----------|
| 流派光环动画（4 流派 × 3 状态） | Aseprite | Sprite Sheet (8帧) | 12 个 |
| 武器特效（12 把 × 平均 3 特效） | Aseprite / Phaser | Sprite Sheet (12-24帧) | ~36 个 |
| 地图背景 | Photoshop / GIMP | PNG (静态) | 1 个 |
| UI 元素 | Figma / Photoshop | SVG / PNG | ~20 个 |
| 数据界面字体 | 自定义位图字体 | BMFont | 1 套 |

### 3.2 Sprite Sheet 规范

#### 输出规格

```
画布尺寸：1024×1024px（基础版）
帧排列：网格排列（如 4×4、8×8）
帧尺寸：128×128px（光环动画）、64×64px（小特效）
透明背景：是
命名规范：{weapon_id}_{animation_name}_{frame_number}.png

示例：
  shockwave_generator_idle_01.png
  shockwave_generator_wave_expand_01.png
  gravity_well_anchor_pull_01.png
```

#### 动画帧率

| 动画类型 | 帧数 | 播放 FPS | 循环 |
|-----------|------|----------|------|
| 光环 Idle（脉动旋转） | 8 | 12 | 是 |
| 光环 Hit（受击闪烁） | 6 | 24 | 否 |
| 武器触发 | 12-24 | 24 | 否 |
| 爆发特效 | 36-48 | 30 | 否 |

### 3.3 特效制作指南

#### 霓虹发光效果制作步骤（Aseprite）

```
1. 在纯黑背景上绘制特效形状（如冲击波环）
2. 用亮色（如 #FF00FF）画核心
3. 向外渐变到半透明（加法混合效果）
4. 导出时保留透明通道
5. 在 Pixi.js 中用 blendMode = 'ADD' 播放
```

#### 色差效果（L5 全屏特效）

```
实现方式：Pixi.js Shader（GLSL）
效果：RGB 通道轻微偏移，模拟 CRT 显示器
触发：爆发瞬间（0.5 秒）
```

---

## 4. UI/UX 设计方案

### 4.1 界面布局（1280×720 基准）

采用 **GameView 左右分屏** 布局（复用 LinkLink 布局组件），游戏区域嵌入 Pixi.js 画布 + DOM 覆盖层：

```
GameView
├── 顶部栏（L4 DOM UI，如房间名、设置）
├── <section> 游戏区域（flex-1 relative）
│   ├── Pixi.js Canvas（L1-L3+L5 特效层，absolute inset-0）
│   ├── 战斗HUD 左面板（z-10，己方信息，border-primary/30）
│   ├── 战斗HUD 右面板（z-10，对手信息，border-error/30，EN数值隐藏）
│   ├── HUD 底部中央指示器（z-10，倒计时badge + 过热badge）
│   ├── 武器选择遮罩（z-20，覆盖HUD）
│   └── 结算遮罩（z-10，覆盖Canvas）
└── 底部/侧边栏（L4 DOM UI，如玩家列表/战绩/AI聊天）
```

**HUD面板布局示意**：

```
┌────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌────────────┐                            ┌────────────┐  │
│  │ 自己名字    │                            │   对手名字  │  │
│  │ HP █████   │        Pixi.js 地图         │   █████ HP │  │
│  │ EN ████    │                            │    EN ████ │  │
│  │ ⚔武器名称  │                            │  ⚔武器名称  │  │
│  │ CD ▶ 3s   │                            │  CD ▶ 5s   │  │
│  └────────────┘                            └────────────┘  │
│                                                             │
│                   ⏱ 90s          🔥过热                     │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

- 左右面板各 180px 宽，己方 `border-primary/30`，对手 `border-error/30` 镜像排列
- 对手能量数值隐藏（`opacity-0`），仅显示半透明进度条
- 倒计时 ≤10s 切换红色闪烁

### 4.2 武器选择界面

#### 设计概述

武器选择页在 `battle_start` 事件后显示，使用 `<Transition name="zoom">` 入场/退场。每位玩家只看到自己的 3 张卡片（双方武器池独立随机），15 秒倒计时自动随机选择。

#### 布局

```
居中遮罩（z-20，覆盖游戏区 + HUD）
└── 选择面板（bg-base-100/90，700px 宽，rounded-2xl）
    ├── 标题："选择你的赛博武器"（text-primary）
    ├── 倒计时数字（≤5s 切换 text-error animate-pulse）
    ├── 3 张武器卡片（横向排列，bg-base-200/80 rounded-xl border-2）
    └── 提示语（已选/超时警告）
```

#### 武器卡片

- **尺寸**：`flex-1 max-w-[200px]`，自适应排列
- **内容**：Iconify `game-icons` 图标 + 武器名 + 流派 `badge`（`badge-secondary`/`info`/`success`/`warning`）+ 难度星级
- **交互**：悬停 `scale-105 shadow-lg`，选中 `ring-2 ring-primary/50 scale-105`
- **流派色**：通过 daisyUI 语义类名驱动（`border-secondary`/`border-info`/`border-success`/`border-warning`），不硬编码色值
- 对手卡片不可见，每位玩家只能看到自己的 3 个选项

> 详见 `battle-ui-design.md` 第 2-3 节完整规范。

### 4.3 数据可视化（L4 层）

L4 数据界面全部使用 daisyUI 组件，CSS 变量驱动主题跟随。

#### 血条 / 能量槽

使用 daisyUI `<progress>` 组件（高度 `h-2`，8px）：

| 元素 | 己方（左面板） | 对手（右面板） |
|------|-------------|-------------|
| HP progress | `progress progress-success w-full h-2` | `progress progress-error w-full h-2` |
| EN progress | `progress progress-warning w-full h-2` | `progress progress-warning w-full h-2 opacity-40` |
| EN 数值 | 显示 | 隐藏（`opacity-0`） |

**不再使用** 6 个圆形能量球的旧方案。

#### 伤害数字

```
普通伤害：白色，字号 16px，向上飘动 1 秒后消失
暴击伤害：黄色，字号 24px，带缩放动画
爆发伤害：红色，字号 32px，带震动效果
位置：在目标头像上方生成，跟随头像移动
```

### 4.4 结算界面

对齐 LinkLinkRoom 极简结算风格，使用 `<Transition name="zoom">` 入场（0.3s 缩放+淡入）。

#### 布局

```
半透明遮罩（bg-base-300/40 backdrop-blur-sm，z-10）
└── 结果卡片（bg-base-100/95 shadow-2xl rounded-2xl border-primary/30）
    ├── 胜负图标（🎉 胜 / 💀 败）
    ├── 胜者昵称（text-2xl font-bold text-primary）
    └── 视角相关提示语（三态文案）
```

#### 三态文案

```typescript
if (isWatcher) {
  subtitle = '对局已结束。'
} else if (winnerName === roomPlayer.name) {
  subtitle = '恭喜你，击败对手！'
} else {
  subtitle = '加油，下次再来！'
}
```

#### 简化约束

- **不展示**：胜者头像放大、光柱特效、双方数据面板、数字滚动动画、操作按钮
- **不退场**：卡片保持显示直到离开房间
- **stats 数据**：后端 `game_end` 事件附带，接收但不展示，保留用于后续扩展

> 详见 `settlement-design.md` 完整规范。

---

## 5. 性能预算与优化

### 5.1 渲染性能预算

| 指标 | 目标 | 上限 |
|-------|------|------|
| Draw Call | < 50 | 100 |
| 同屏三角形 | < 10k | 20k |
| 粒子数量 | < 500 | 1000 |
| 纹理内存 | < 50MB | 100MB |
| 帧率 | 60 FPS | 30 FPS (低配) |

### 5.2 优化策略

#### 粒子系统优化

```
使用 ParticleContainer（而非普通 Container）
  - 限制：不能旋转、不能缩放、不能 tint
  - 适用：蜂刺、弹射碎片、油膜粒子

对于需要旋转/缩放的粒子：
  - 用对象池（Object Pool）复用
  - 上限 200 个，超出时回收最旧的
```

#### 纹理优化

```
所有 Sprite Sheet 打包成 1-2 张大图（Texture Atlas）
减少纹理切换（State Change）
Pixi.js 的 Sprite 批处理会自动优化，但需避免频繁创建/销毁
```

#### 特效销毁策略

```
触发型特效（如冲击波）：
  - 播放完毕 → 立即销毁（destroy(true) 释放纹理）

持续型特效（如油膜、回路）：
  - 离开屏幕 → 标记可复用
  - 持续时间到 → 回收到对象池
```

---

## 6. 实施路线图

### Phase 1：技术验证（1-2 周）

```
目标：验证 Pixi.js + Tiaoom 集成可行
交付：
  ✅ Pixi.js 场景初始化代码
  ✅ 两个玩家头像在屏幕上弹跳（无武器，展示光环和 ID）
  ✅ WebSocket 状态同步验证
  ✅ Bloom 滤镜效果验证
```

### Phase 2：核心循环（2-3 周）

```
目标：完整的核心玩法（无武器）
交付：
  ✅ 物理引擎（碰撞、反弹、HP、胜负判定）
  ✅ 地图（16:9 矩形 + 2 个障碍）
  ✅ 基础 UI（血条、能量槽、倒计时）
  ✅ 武器选择界面
```

### Phase 3：武器系统（4-6 周）

```
目标：12 把武器全部实现
交付：
  ✅ 武器系统架构（IWeapon 接口）
  ✅ 4 把代表武器（每流派 1 把）
  ✅ 剩余 8 把武器
  ✅ 交叉对局平衡测试
```

### Phase 4：视觉优化（2-3 周）

```
目标：达到发布品质的视觉效果
交付：
  ✅ 所有 Sprite Sheet 资产
  ✅ L1-L5 视觉分层完整实现
  ✅ 战斗HUD面板（daisyUI progress 进度条，左右镜像布局）
  ✅ 武器选择页（Iconify 图标 + daisyUI 流派色 + zoom transition）
  ✅ 极简结算卡片（对齐 LinkLinkRoom，无数据面板）
  ✅ 观战模式优化
```

### Phase 5：测试与调优（2 周）

```
目标：确保平衡性和可玩性
交付：
  ✅ 12×12 交叉对局测试（144 种组合）
  ✅ 性能测试（中端手机 60fps）
  ✅ 观战测试（10 秒内识别武器）
  ✅ 数值调整（基于测试数据）
```

---

## 附录 A：色彩色卡

```
侵略者（品红系）
  - 主色：#FF00FF
  - 亮色：#FF66FF
  - 暗色：#990099

控制者（电蓝系）
  - 主色：#00BFFF
  - 亮色：#66D9FF
  - 暗色：#006699

工程师（酸绿系）
  - 主色：#39FF14
  - 亮色：#7FFF66
  - 暗色：#1B9900

变奏者（亮黄系）
  - 主色：#FFD700
  - 亮色：#FFED66
  - 暗色：#B39600

场景
  - 背景：#0A0A1A
  - 网格：#1A1A3A
  - 墙壁：#00FFFF (alpha 0.3)
  - 文字：#E0E0FF
```

## 附录 B：文件结构规划

```
game/
  frontend/
    src/
      components/
        fish-oil-battle/
          FishOilBattleRoom.vue     ← 主游戏界面
          FishOilBattleLite.vue     ← 小窗模式
          FishOilBattleReplay.vue   ← 回放界面
          FishOilBattleCanvas.vue   ← Pixi.js 画布封装
          WeaponSelectOverlay.vue   ← 武器选择页（遮罩+3卡片，Iconify+daisyUI）
          BattleHudPanel.vue        ← 左右HUD面板（daisyUI progress，镜像布局）
          CombatResult.vue          ← 结算卡片（极简：胜者名+文案，zoom过渡）
          useCyberFish.ts           ← 状态管理 composable
          useThemeBridge.ts         ← 主题桥接（CSS变量→Pixi.js）
          renderer/
            CyberFishRenderer.ts    ← Pixi.js 渲染器
            entities/
              PlayerAvatar.ts       ← 玩家头像实体（光环、动画）
              WeaponEffect.ts       ← 武器特效实体
              ParticleSystem.ts     ← 粒子系统
            systems/
              RenderSystem.ts       ← 渲染系统
              AnimationSystem.ts    ← 动画系统
              VisualEventSystem.ts  ← 视觉事件系统
  backend/
    src/
      games/
        fish-oil-battle/
          index.ts              ← 游戏配置导出
          FishOilRoom.ts        ← 主游戏逻辑（继承 GameRoom）
          physics/
            BallPhysics.ts      ← 弹球物理
            CollisionDetector.ts ← 碰撞检测
          systems/
            WeaponSystem.ts     ← 武器系统驱动
            EnergySystem.ts     ← 能量管理
            OverheatSystem.ts   ← 过热期管理
          weapons/
            WeaponFactory.ts    ← 武器工厂
            aggressor/
              ShockwaveGenerator.ts
              NanoRipper.ts
              PursuitProtocol.ts
            controller/
              GravityWell.ts
              FirewallProtocol.ts
              EntropyDiffuser.ts
            engineer/
              HiveMother.ts
              BastionBuilder.ts
              CircuitWeaver.ts
            wildcard/
              QuantumRift.ts
              SizeWarp.ts
              RicochetCore.ts
```

---

> **文档状态**：本方案为技术+视觉设计阶段文档，待确认后进入代码实施阶段。  
> **下一步**：确认方案 → 创建实施 Plan → 开始 Phase 1 代码实现
