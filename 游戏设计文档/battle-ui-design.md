# 《赛博鱼油》战斗UI设计文档

> 版本：v1.0  
> 日期：2026-06-15  
> 涵盖页面：武器选择页（技能3选1） + 战斗HUD  
> 主题方案：daisyUI CSS 变量驱动，与项目全局主题无缝跟随  

---

## 目录

1. [概述](#1-概述)
2. [武器选择页 - 布局与结构](#2-武器选择页---布局与结构)
3. [武器选择页 - 视觉规范](#3-武器选择页---视觉规范)
4. [战斗HUD - 布局与结构](#4-战斗hud---布局与结构)
5. [战斗HUD - 视觉规范](#5-战斗hud---视觉规范)
6. [动画方案](#6-动画方案)
7. [数据接口](#7-数据接口)
8. [集成方式](#8-集成方式)

---

## 1. 概述

### 1.1 设计目标

战斗UI由两个页面组成：

- **武器选择页**：对局开始前，每位玩家从3把随机武器中选择1把，15秒倒计时
- **战斗HUD**：对局进行中，左右两侧小矩形面板显示双方实时状态

整体风格与结算页一致：**半透明遮罩 + daisyUI类名驱动 + Transition zoom动画**，不引入任何硬编码颜色。

### 1.2 核心原则

- **CSS 变量主题跟随**：所有 UI 样式通过 daisyUI 类名（`bg-base-100`、`text-primary`、`border-secondary` 等）实现，颜色由当前 `data-theme` 自动决定
- **零硬编码色值**：禁止在 `<style scoped>` 或内联样式中直接写颜色代码
- **Pixi.js 层分离**：战斗地图/技能特效不参与主题跟随，可用固定赛博色值
- **双视角独立**：武器选择页每位玩家只看自己的卡片池，对手卡片不可见
- **Iconify 图标方案**：武器卡片用 `@iconify/vue` + `Icon.vue` 组件，不用 emoji

### 1.3 流派色映射

武器流派通过 daisyUI 语义色进行视觉区分，无需为每个流派硬编码颜色：

| 流派 | daisyUI 语义色 | 用途 |
|------|---------------|------|
| 🟣 侵略者 (Aggressor) | `secondary` | 卡片边框、badge、图标色 |
| 🔵 控制者 (Controller) | `info` | 卡片边框、badge、图标色 |
| 🟢 工程师 (Engineer) | `success` | 卡片边框、badge、图标色 |
| 🟡 变奏者 (Wildcard) | `warning` | 卡片边框、badge、图标色 |

### 1.4 主题分工

| 层级 | 主题方案 | 说明 |
|------|----------|------|
| DOM UI（武器卡片、HUD面板、倒计时等） | daisyUI CSS 变量 | 随 `data-theme` 自动切换 |
| Pixi.js 层（技能特效、光环等） | 硬编码赛博色值 | 不参与主题跟随 |

---

## 2. 武器选择页 - 布局与结构

### 2.1 页面概述

武器选择页在 `battle.start` 事件触发后显示，覆盖整个游戏区域。每位玩家只看到自己的3张卡片（双方武器池独立随机），15秒内必须完成选择，超时自动随机分配。

### 2.2 DOM 层级

```
FishOilRoom.vue（GameView 内部）
└── <Transition name="zoom">
    └── 遮罩层（z-10，全屏覆盖）
        └── 选择面板（居中容器）
            ├── 标题栏（"选择你的赛博武器" + 倒计时）
            ├── 卡牌容器（横向排列 3 张武器卡片）
            │   ├── 武器卡片 1
            │   ├── 武器卡片 2
            │   └── 武器卡片 3
            └── 提示文字（超时随机选择）
```

### 2.3 遮罩层

```html
<div class="absolute inset-0 z-20 flex items-center justify-center 
            bg-base-300/60 backdrop-blur-md rounded-xl">
```

- `absolute inset-0`：覆盖整个游戏区域
- `z-20`：高于 HUD（z-10），确保全屏遮罩
- `bg-base-300/60`：60% 透明度背景
- `backdrop-blur-md`：中度模糊，突出选择面板

### 2.4 选择面板

```html
<div class="bg-base-100/90 shadow-2xl px-8 py-6 rounded-2xl 
            border border-primary/20 w-[700px] max-w-[95vw]">
```

- `bg-base-100/90`：90% 不透明基础背景
- `w-[700px] max-w-[95vw]`：固定宽度 700px，小屏自适应
- `border-primary/20`：20% 透明度主色描边

### 2.5 标题栏

```html
<div class="text-center mb-6">
  <h2 class="text-2xl font-bold text-primary">选择你的赛博武器</h2>
  <div class="flex items-center justify-center gap-2 mt-2">
    <span class="text-base-content/60 text-sm">剩余时间</span>
    <span class="text-3xl font-mono font-bold text-primary tabular-nums"
          :class="{ 'text-error animate-pulse': countdown <= 5 }">
      {{ countdown }}
    </span>
    <span class="text-base-content/60 text-sm">秒</span>
  </div>
</div>
```

- 倒计时 ≤5 秒时切换为 `text-error` + `animate-pulse`，视觉警示
- `tabular-nums` 确保数字等宽，跳动不位移

### 2.6 武器卡片容器

```html
<div class="flex gap-4 justify-center">
  <div v-for="(weapon, idx) in weaponPool" :key="weapon.id"
       class="weapon-card ..."
       @click="selectWeapon(weapon.id)">
    <!-- 卡片内容 -->
  </div>
</div>
```

### 2.7 武器卡片（单张）

```html
<div class="flex-1 max-w-[200px] bg-base-200/80 rounded-xl p-4 
            border-2 cursor-pointer transition-all duration-200
            hover:scale-105 hover:shadow-lg"
     :class="cardBorderClass(weapon.faction)">
  
  <!-- 武器图标 -->
  <div class="flex justify-center mb-3">
    <div class="p-3 rounded-full bg-base-300/50">
      <Icon :icon="weapon.iconId" class="text-4xl" :class="iconColorClass(weapon.faction)" />
    </div>
  </div>

  <!-- 武器名称 -->
  <h3 class="text-center font-bold text-base-content mb-2">
    {{ weapon.name }}
  </h3>

  <!-- 流派 badge -->
  <div class="text-center mb-2">
    <span class="badge text-xs" :class="factionBadgeClass(weapon.faction)">
      {{ factionLabel(weapon.faction) }}
    </span>
  </div>

  <!-- 难度星级 -->
  <div class="text-center text-xs" :class="starColorClass(weapon.difficulty)">
    {{ '⭐'.repeat(weapon.difficulty) }}
  </div>

</div>
```

### 2.8 卡片选中态

选中的卡片在基础样式上叠加：

```html
<!-- v-bind 动态类名 -->
:class="{
  'border-primary ring-2 ring-primary/50 scale-105': selectedWeaponId === weapon.id,
  'border-transparent': selectedWeaponId !== weapon.id
}"
```

- `border-primary`：daisyUI 主色 2px 边框
- `ring-2 ring-primary/50`：发光外环，50% 透明度
- `scale-105`：轻微放大
- `cursor-pointer` → 选中后改为 `cursor-default`

### 2.9 确认 / 超时提示

```html
<!-- 已选择时 -->
<div v-if="selectedWeaponId" class="text-center mt-4">
  <span class="text-success text-sm">已选定，等待对手...</span>
</div>

<!-- 超时警告 -->
<div v-else class="text-center mt-4">
  <span class="text-error/70 text-sm">超时后将自动随机选择</span>
</div>
```

---

## 3. 武器选择页 - 视觉规范

### 3.1 类名映射表

| 元素 | daisyUI 类名 | 备注 |
|------|-------------|------|
| 遮罩层 | `bg-base-300/60 backdrop-blur-md` | 60% 透明度 + 中度模糊 |
| 选择面板 | `bg-base-100/90 shadow-2xl border-primary/20 rounded-2xl` | 90% 不透明 |
| 标题 | `text-2xl font-bold text-primary` | 主色加粗 |
| 倒计时（正常） | `text-3xl font-mono font-bold text-primary tabular-nums` | 等宽数字 |
| 倒计时（紧迫） | `text-error animate-pulse` | ≤5s 红色闪烁 |
| 卡片容器 | `bg-base-200/80 rounded-xl border-2` | 80% 透明基础 |
| 卡片悬停 | `hover:scale-105 hover:shadow-lg` | 轻微放大 + 阴影 |
| 卡片选中 | `border-primary ring-2 ring-primary/50 scale-105` | 主色发光环 |
| 图标底圈 | `bg-base-300/50 rounded-full p-3` | 50% 透明圆底 |
| 流派 badge | `badge text-xs` | daisyUI badge 基础 |
| 已选提示 | `text-success text-sm` | 绿色确认 |
| 超时提示 | `text-error/70 text-sm` | 红色警告 |

### 3.2 流派色类名函数

```typescript
// 流派 → daisyUI 语义色映射
const factionColorMap: Record<Faction, string> = {
  aggressor:  'secondary',  // 🟣 侵略者 → secondary（紫/品红）
  controller: 'info',       // 🔵 控制者 → info（蓝/电蓝）
  engineer:   'success',    // 🟢 工程师 → success（绿/酸绿）
  wildcard:   'warning',    // 🟡 变奏者 → warning（黄/金色）
}

function cardBorderClass(faction: Faction): string {
  const color = factionColorMap[faction]
  return `border-${color}/40 hover:border-${color}`
}

function iconColorClass(faction: Faction): string {
  return `text-${factionColorMap[faction]}`
}

function factionBadgeClass(faction: Faction): string {
  return `badge-${factionColorMap[faction]}`
}
```

### 3.3 12把武器 Iconify 图标映射

基于 `weapons-design.md` 的12把武器，映射到 Iconify `game-icons` / `mdi` 图标：

| # | 武器名称 | 流派 | 难度 | Iconify ID |
|---|---------|------|------|-----------|
| 1 | 冲击波发生器 | 侵略者 | ⭐⭐ | `game-icons:sonic-wave` |
| 2 | 纳米撕裂者 | 侵略者 | ⭐ | `game-icons:tentacles-skull` |
| 3 | 追击协议 | 侵略者 | ⭐⭐ | `game-icons:target-arrows` |
| 4 | 重力阱 | 控制者 | ⭐⭐ | `game-icons:black-hole-bolas` |
| 5 | 防火墙协议 | 控制者 | ⭐ | `game-icons:shield-bash` |
| 6 | 熵增扩散器 | 控制者 | ⭐⭐⭐ | `game-icons:radioactive` |
| 7 | 蜂巢母体 | 工程师 | ⭐⭐ | `game-icons:hive-mind` |
| 8 | 阵地构筑者 | 工程师 | ⭐⭐⭐ | `game-icons:stone-tower` |
| 9 | 回路编织者 | 工程师 | ⭐⭐⭐ | `game-icons:circuitry` |
| 10 | 量子裂隙 | 变奏者 | ⭐⭐⭐ | `game-icons:spawn-node` |
| 11 | 尺寸畸变 | 变奏者 | ⭐ | `game-icons:size-diverse` |
| 12 | 弹射核心 | 变奏者 | ⭐⭐ | `game-icons:ricochet` |

> **备选方案**：若上述图标不可用，可用 `mdi:wave` / `mdi:tentacle` / `mdi:shield-sword` 等 `mdi` 系列替代。详见 Iconify 搜索。

### 3.4 难度星级显示

```typescript
function starColorClass(difficulty: number): string {
  if (difficulty === 1) return 'text-success'       // ⭐ 绿色
  if (difficulty === 2) return 'text-warning'       // ⭐⭐ 黄色
  return 'text-error'                                // ⭐⭐⭐ 红色
}
```

### 3.5 布局示意

```
┌─────────────────────────────────────────────────────────┐
│                    bg-base-300/60 + blur                  │
│  ┌─────────────────────────────────────────────────────┐│
│  │              bg-base-100/90 (700px)                  ││
│  │                                                      ││
│  │           选择你的赛博武器                             ││
│  │               ⏱ 15  秒                               ││
│  │                                                      ││
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐       ││
│  │  │  ⚔ icon  │  │  ⚔ icon  │  │  ⚔ icon  │       ││
│  │  │  武器名1  │  │  武器名2  │  │  武器名3  │       ││
│  │  │ badge流派 │  │ badge流派 │  │ badge流派 │       ││
│  │  │   ⭐⭐    │  │   ⭐⭐⭐  │  │    ⭐     │       ││
│  │  └───────────┘  └───────────┘  └───────────┘       ││
│  │                                                      ││
│  │            超时后将自动随机选择                        ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

### 3.6 无需自定义 CSS

武器选择页不引入任何 `scoped <style>` 块中的硬编码颜色。所有视觉效果完全由 Tailwind + daisyUI 类名 + 三元动态类名覆盖。

---

## 4. 战斗HUD - 布局与结构

### 4.1 布局概述

战斗HUD采用**左右两侧小矩形面板**布局：

- **左面板**：己方信息（名字、HP、EN、武器图标+名称、CD状态）
- **右面板**：对手信息（镜像排列，不可见能量数值）
- **底部中央**：倒计时 + 过热标记

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

### 4.2 DOM 层级

```
FishOilRoom.vue（GameView 内部）
└── <section> 游戏区域（relative）
    ├── Pixi.js Canvas（absolute inset-0）
    │
    ├── <!-- 左 HUD 面板：己方 -->
    │   <div class="absolute left-3 top-1/2 -translate-y-1/2 z-10">
    │       └── 己方面板内容
    │
    ├── <!-- 右 HUD 面板：对手 -->
    │   <div class="absolute right-3 top-1/2 -translate-y-1/2 z-10">
    │       └── 对手面板内容
    │
    └── <!-- 底部中央指示器 -->
        <div class="absolute bottom-3 left-1/2 -translate-x-1/2 z-10">
            └── 倒计时 + 过热
```

### 4.3 左 HUD 面板（己方）

```html
<div class="absolute left-3 top-1/2 -translate-y-1/2 z-10
            w-[180px] bg-base-200/70 backdrop-blur-sm 
            rounded-xl border border-primary/30 p-3
            flex flex-col gap-2 text-sm">
  
  <!-- 玩家名字 -->
  <div class="text-primary font-bold text-base truncate">
    {{ selfName }}
  </div>

  <!-- HP 血条 -->
  <div class="flex flex-col gap-1">
    <div class="flex justify-between text-xs text-base-content/60">
      <span>HP</span>
      <span>{{ selfCurrentHp }}/{{ selfMaxHp }}</span>
    </div>
    <progress class="progress progress-success w-full h-2" 
              :value="selfCurrentHp" :max="selfMaxHp" />
  </div>

  <!-- EN 能量槽 -->
  <div class="flex flex-col gap-1">
    <div class="flex justify-between text-xs text-base-content/60">
      <span>EN</span>
      <span>{{ selfCurrentEn }}/{{ selfMaxEn }}</span>
    </div>
    <progress class="progress progress-warning w-full h-2" 
              :value="selfCurrentEn" :max="selfMaxEn" />
  </div>

  <!-- 武器信息 -->
  <div class="flex items-center gap-2 mt-1 pt-2 border-t border-base-300/50">
    <Icon :icon="selfWeapon.iconId" class="text-lg text-primary" />
    <div class="flex-1 min-w-0">
      <div class="text-xs text-base-content font-medium truncate">
        {{ selfWeapon.name }}
      </div>
      <!-- CD 状态 -->
      <div class="text-xs text-base-content/50">
        <span v-if="selfWeaponCd > 0">CD {{ selfWeaponCd }}s</span>
        <span v-else class="text-success">就绪</span>
      </div>
    </div>
  </div>

</div>
```

### 4.4 右 HUD 面板（对手）

右面板与左面板结构一致，但采用镜像排列（文本右对齐、进度条反向），且对手能量不可见：

```html
<div class="absolute right-3 top-1/2 -translate-y-1/2 z-10
            w-[180px] bg-base-200/70 backdrop-blur-sm 
            rounded-xl border border-error/30 p-3
            flex flex-col gap-2 text-sm">

  <!-- 玩家名字（右对齐） -->
  <div class="text-error font-bold text-base truncate text-right">
    {{ opponentName }}
  </div>

  <!-- HP 血条（右对齐） -->
  <div class="flex flex-col gap-1">
    <div class="flex justify-between text-xs text-base-content/60 flex-row-reverse">
      <span>HP</span>
      <span>{{ opponentCurrentHp }}/{{ opponentMaxHp }}</span>
    </div>
    <progress class="progress progress-error w-full h-2" 
              :value="opponentCurrentHp" :max="opponentMaxHp" />
  </div>

  <!-- EN 能量槽（对手不可见具体数值，仅显示进度） -->
  <div class="flex flex-col gap-1">
    <div class="flex justify-between text-xs text-base-content/60">
      <span>EN</span>
      <span class="opacity-0">---</span>
    </div>
    <progress class="progress progress-warning w-full h-2 opacity-40" 
              :value="opponentCurrentEn" :max="opponentMaxEn" />
  </div>

  <!-- 武器信息（右对齐） -->
  <div class="flex items-center gap-2 mt-1 pt-2 border-t border-base-300/50 flex-row-reverse text-right">
    <Icon :icon="opponentWeapon.iconId" class="text-lg text-error" />
    <div class="flex-1 min-w-0">
      <div class="text-xs text-base-content font-medium truncate">
        {{ opponentWeapon.name }}
      </div>
      <div class="text-xs text-base-content/50">
        <span v-if="opponentWeaponCd > 0">CD {{ opponentWeaponCd }}s</span>
        <span v-else class="text-success">就绪</span>
      </div>
    </div>
  </div>

</div>
```

### 4.5 底部中央指示器

```html
<div class="absolute bottom-3 left-1/2 -translate-x-1/2 z-10
            flex items-center gap-4">
  
  <!-- 回合倒计时 -->
  <div class="badge badge-lg font-mono font-bold"
       :class="roundTimer <= 10 ? 'badge-error animate-pulse' : 'badge-primary'">
    ⏱ {{ formattedRoundTime }}
  </div>

  <!-- 过热标记（已有武器过热时显示） -->
  <div v-if="selfOverheated" 
       class="badge badge-lg badge-error animate-pulse font-bold">
    🔥 过热
  </div>

</div>
```

- `rounded-full` 默认包含在 `badge` 中
- 倒计时 ≤10 秒时切换为红色闪烁
- 过热标记仅在触发时显示，否则不渲染

---

## 5. 战斗HUD - 视觉规范

### 5.1 面板容器类名

| 元素 | 己方（左） | 对手（右） |
|------|----------|----------|
| 位置 | `absolute left-3 top-1/2 -translate-y-1/2` | `absolute right-3 top-1/2 -translate-y-1/2` |
| 背景 | `bg-base-200/70 backdrop-blur-sm` | `bg-base-200/70 backdrop-blur-sm` |
| 边框 | `border-primary/30` | `border-error/30` |
| 宽高 | `w-[180px]` | `w-[180px]` |
| 圆角 | `rounded-xl` | `rounded-xl` |
| 排列 | `flex flex-col gap-2` | `flex flex-col gap-2` |
| 文本排列 | 默认（左对齐） | `text-right` + `flex-row-reverse` |

### 5.2 血条/能量对比

| 元素 | 己方（左） | 对手（右） |
|------|----------|----------|
| HP progress | `progress progress-success w-full h-2` | `progress progress-error w-full h-2` |
| EN progress | `progress progress-warning w-full h-2` | `progress progress-warning w-full h-2 opacity-40` |
| EN 数值显示 | 显示 `{{ en }}/{{ maxEn }}` | 隐藏（`opacity-0`） |
| HP 标签 | `text-xs text-base-content/60` | `text-xs text-base-content/60 flex-row-reverse` |

### 5.3 武器信息对比

| 元素 | 己方（左） | 对手（右） |
|------|----------|----------|
| 图标色 | `text-primary` | `text-error` |
| 分隔线 | `border-t border-base-300/50` | `border-t border-base-300/50 flex-row-reverse` |
| CD就绪 | `text-success` | `text-success` |
| CD冷却中 | `text-base-content/50` | `text-base-content/50` |

### 5.4 中央指示器类名

| 元素 | 正常态 | 紧迫态 |
|------|--------|--------|
| 倒计时 | `badge badge-lg badge-primary font-mono font-bold` | `badge badge-lg badge-error animate-pulse` |
| 过热 | `badge badge-lg badge-error animate-pulse font-bold` | （始终相同） |

### 5.5 进度条设计约束

- 使用 daisyUI `<progress>` 组件，而非自定义 `<div>` 进度条
- HP：己方 `success` 绿色，对手 `error` 红色
- EN：双方均为 `warning` 橙色，对手半透明
- 高度统一 `h-2`（8px），与 daisyUI 默认匹配

### 5.6 布局自适应规则

```css
/* 小屏（<640px）面板缩窄 */
@media (max-width: 639px) {
  .hud-panel { width: 140px; }
}

/* 极小屏（<400px）面板进一步缩小字体 */
@media (max-width: 399px) {
  .hud-panel { width: 120px; font-size: 11px; }
}
```

> 注：这些媒体查询通过 Tailwind 响应式前缀（`sm:` / `xs:`）或直接类名实现，不写自定义 CSS。

---

## 6. 动画方案

### 6.1 Transition 配置

武器选择页入场使用与结算页一致的 `zoom` transition：

```css
.zoom-enter-active, .zoom-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.zoom-enter-from, .zoom-leave-to {
  opacity: 0;
  transform: scale(0.9);
}
```

### 6.2 武器选择页入场时序

```
t=0s    ─── battle.start 事件触发，weaponPool 数据到达
t=0s    ─── v-if="showWeaponSelect" → true
t=0s    ─── Transition zoom enter 开始
t=0.2s  ─── 遮罩 fade in 完成
t=0.3s  ─── Transition 完成，选择面板完全显示
t=0.5s  ─── 3 张卡片 stagger 逐个弹出（可选）
t=15s   ─── 超时 → 自动随机选择 → Transition zoom leave
t=15.3s ─── 动画完成 → showWeaponSelect = false
```

### 6.3 卡片交互反馈

```css
/* 点击卡片瞬间 → 简短弹跳 */
@keyframes card-bounce {
  0%   { transform: scale(1); }
  50%  { transform: scale(0.95); }
  100% { transform: scale(1.05); }
}
.weapon-card:active {
  animation: card-bounce 0.15s ease;
}
```

- 选中确认无需额外动画（`ring` + `scale-105` 即时切换即可）
- 卡片 hover 已有 `scale-105` + `shadow-lg` 平滑过渡

### 6.4 战斗HUD入场

战斗HUD与武器选择页退场衔接：

```
武器选择结束 → zoom leave（0.3s）→ showWeaponSelect = false
              → battleHudVisible = true
              → HUD 面板直接显示（无需动画，透明度 1 直接出现）
```

HUD 面板为持久显示，不需要 enter/leave 动画。仅在血量/能量值变化时有数字跳变效果（CSS `transition` 或 `requestAnimationFrame`）。

### 6.5 设计原则

- 武器选择页：与结算页一致的 zoom transition，不增加复杂度
- 战斗HUD：静态显示，无入场动画，仅值变化时进度条平滑过渡
- 不实现卡片旋转、翻转等复杂动画（保持简洁）

---

## 7. 数据接口

### 7.1 武器选择页 Props

```typescript
interface WeaponSelectProps {
  /** 是否显示武器选择页 */
  show: boolean;
  /** 当前玩家的3把可选武器（双方独立随机池） */
  weaponPool: SelectableWeapon[];
  /** 当前选中的武器ID（null 表示未选择） */
  selectedWeaponId: string | null;
  /** 倒计时秒数 */
  countdown: number;
  /** 是否已确认（等待对手中） */
  isConfirmed: boolean;
}

interface SelectableWeapon {
  id: string;           // 武器唯一ID（如 'shockwave_generator'）
  name: string;          // 中文名称（如 '冲击波发生器'）
  faction: 'aggressor' | 'controller' | 'engineer' | 'wildcard';
  difficulty: 1 | 2 | 3; // 难度星级
  iconId: string;        // Iconify 图标 ID
}
```

### 7.2 武器选择页 Emits

```typescript
interface WeaponSelectEmits {
  /** 玩家选择武器 */
  (e: 'select', weaponId: string): void;
  /** 倒计时结束自动随机选择 */
  (e: 'timeout'): void;
}
```

### 7.3 战斗HUD Props

```typescript
interface BattleHudProps {
  // ── 己方信息 ──
  selfName: string;
  selfCurrentHp: number;
  selfMaxHp: number;
  selfCurrentEn: number;
  selfMaxEn: number;
  selfWeapon: HudWeaponInfo;
  selfWeaponCd: number;     // 当前冷却剩余秒数，0=就绪
  selfOverheated: boolean;  // 武器是否过热

  // ── 对手信息 ──
  opponentName: string;
  opponentCurrentHp: number;
  opponentMaxHp: number;
  opponentCurrentEn: number;
  opponentMaxEn: number;
  opponentWeapon: HudWeaponInfo;
  opponentWeaponCd: number;

  // ── 全局信息 ──
  roundTimer: number;       // 回合剩余秒数
  roundDuration: number;    // 回合总秒数
}

interface HudWeaponInfo {
  name: string;
  iconId: string;           // Iconify 图标 ID
}
```

### 7.4 Composable 数据来源

```typescript
// useFishOilBattle.ts
export function useFishOilBattle() {
  // ── 武器选择阶段 ──
  const showWeaponSelect = ref<boolean>(false);
  const weaponPool = ref<SelectableWeapon[]>([]);
  const selectedWeaponId = ref<string | null>(null);
  const selectCountdown = ref<number>(15);
  const isWeaponConfirmed = ref<boolean>(false);

  // ── 战斗阶段 ──
  const battleHudVisible = ref<boolean>(false);
  const selfHud = ref<PlayerHudState>({ ... });
  const opponentHud = ref<PlayerHudState>({ ... });
  const roundTimer = ref<number>(0);
  const roundDuration = ref<number>(90);
  const selfOverheated = ref<boolean>(false);

  return {
    showWeaponSelect,
    weaponPool,
    selectedWeaponId,
    selectCountdown,
    isWeaponConfirmed,
    battleHudVisible,
    selfHud,
    opponentHud,
    roundTimer,
    roundDuration,
    selfOverheated,
  };
}
```

### 7.5 后端事件格式

**battle.start（武器选择阶段开始）**

```json
{
  "type": "battle_start",
  "data": {
    "weaponPool": [
      { "id": "shockwave_generator", "name": "冲击波发生器", "faction": "aggressor", "difficulty": 2, "iconId": "game-icons:sonic-wave" },
      { "id": "nano_ripper", "name": "纳米撕裂者", "faction": "aggressor", "difficulty": 1, "iconId": "game-icons:tentacles-skull" },
      { "id": "pursuit_protocol", "name": "追击协议", "faction": "aggressor", "difficulty": 2, "iconId": "game-icons:target-arrows" }
    ],
    "countdown": 15
  }
}
```

**battle.hud_update（HUD状态同步，高频）**

```json
{
  "type": "hud_update",
  "data": {
    "self": {
      "name": "玩家A",
      "currentHp": 85,
      "maxHp": 100,
      "currentEn": 60,
      "maxEn": 100,
      "weapon": { "name": "冲击波发生器", "iconId": "game-icons:sonic-wave" },
      "weaponCd": 3.2,
      "overheated": false
    },
    "opponent": {
      "name": "玩家B",
      "currentHp": 72,
      "maxHp": 100,
      "currentEn": 45,
      "maxEn": 100,
      "weapon": { "name": "防火墙协议", "iconId": "game-icons:shield-bash" },
      "weaponCd": 0
    },
    "roundTimer": 67
  }
}
```

---

## 8. 集成方式

### 8.1 文件位置

```
game/frontend/src/components/fish-oil-battle/
├── FishOilRoom.vue              ← 主游戏界面，HUD和武器选择置于此
├── FishOilRoomLite.vue          ← 小窗模式（如有）
├── components/
│   ├── WeaponSelectOverlay.vue  ← 武器选择页组件（可选拆分）
│   └── BattleHudPanel.vue       ← 左右HUD面板组件（可选拆分）
├── renderer/                    ← Pixi.js 渲染器
└── useFishOilBattle.ts          ← Composable，管理战斗状态
```

### 8.2 嵌入位置（FishOilRoom.vue）

```html
<GameView :room-player="roomPlayer" :game="game" @command="onCommand">
  <section class="flex-1 relative">
    
    <!-- Pixi.js Canvas 挂载点 -->
    <div ref="pixiContainer" class="absolute inset-0" />
    
    <!-- ============================================ -->
    <!-- 战斗HUD（常驻显示，z-10） -->
    <!-- ============================================ -->
    <template v-if="battleHudVisible">
      
      <!-- 左面板：己方 -->
      <BattleHudPanel 
        v-bind="selfHud"
        side="left"
        class="absolute left-3 top-1/2 -translate-y-1/2 z-10"
      />
      
      <!-- 右面板：对手 -->
      <BattleHudPanel 
        v-bind="opponentHud"
        side="right"
        class="absolute right-3 top-1/2 -translate-y-1/2 z-10"
      />
      
      <!-- 底部中央指示器 -->
      <div class="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex gap-4">
        <span class="badge badge-lg" ...>⏱ {{ formattedRoundTime }}</span>
        <span v-if="selfOverheated" class="badge badge-lg badge-error animate-pulse">🔥 过热</span>
      </div>
      
    </template>
    
    <!-- ============================================ -->
    <!-- 武器选择页（覆盖HUD之上，z-20） -->
    <!-- ============================================ -->
    <Transition name="zoom">
      <div v-if="showWeaponSelect" class="absolute inset-0 z-20 ...">
        <!-- 遮罩 + 3选1面板 -->
      </div>
    </Transition>
    
  </section>
</GameView>
```

### 8.3 与 GameView 的层级关系

```
GameView
├── 顶部栏（L4 DOM UI，如房间名、设置）
├── <section> 游戏区域 (relative)
│   ├── Pixi.js Canvas（L1-L5 特效层）
│   ├── 战斗HUD 左面板（z-10）
│   ├── 战斗HUD 右面板（z-10）
│   ├── HUD 底部指示器（z-10）
│   └── 武器选择遮罩（z-20，高于 HUD）
└── 底部栏（L4 DOM UI，如玩家信息）
```

层级关系：
- **z-10**：战斗HUD面板，覆盖 Pixi.js 但不遮挡武器选择
- **z-20**：武器选择页，覆盖所有内容（包括 HUD）
- HUD不遮挡 GameView 的顶部/底部 UI 栏

### 8.4 生命周期触发时序

```
对局开始
  │
  ├─[1] battle_start 事件
  │    → showWeaponSelect = true（武器选择页显示，z-20）
  │    → battleHudVisible = false（HUD隐藏）
  │
  ├─[2] 玩家选择武器 / 超时自动选择
  │    → emit('select', weaponId) / emit('timeout')
  │    → isWeaponConfirmed = true
  │
  ├─[3] 双方确认完毕 / 倒计时归零
  │    → showWeaponSelect = false（zoom leave 退场动画 0.3s）
  │    → battleHudVisible = true（HUD直接显示）
  │
  ├─[4] 战斗进行中
  │    → hud_update 高频事件 → 更新 selfHud / opponentHud
  │    → roundTimer 递减
  │
  └─[5] 对局结束
       → game_end 事件 → battleHudVisible = false
       → 转入结算页
```

### 8.5 状态管理汇总

```typescript
// 武器选择阶段状态
showWeaponSelect: Ref<boolean>       // v-if 控制武器选择页显示
weaponPool: Ref<SelectableWeapon[]>  // 3张卡片数据
selectedWeaponId: Ref<string | null> // 当前选中
selectCountdown: Ref<number>         // 倒计时
isWeaponConfirmed: Ref<boolean>      // 已确认

// 战斗阶段状态
battleHudVisible: Ref<boolean>       // v-if 控制 HUD 显示
selfHud: Ref<PlayerHudState>         // 己方 HUD 完整数据
opponentHud: Ref<PlayerHudState>     // 对手 HUD 完整数据
roundTimer: Ref<number>              // 回合剩余秒数
selfOverheated: Ref<boolean>         // 己方武器过热状态
```

---

> **文档状态**：设计阶段完成，待代码实施。  
> **下一步**：在 `FishOilRoom.vue` 中嵌入武器选择页组件和战斗HUD面板，在 `useFishOilBattle.ts` 中实现完整状态管理。
