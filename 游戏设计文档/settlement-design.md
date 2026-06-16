# 《赛博鱼油》结算页面设计文档

> 版本：v1.0  
> 日期：2026-06-15  
> 参考：LinkLinkRoom.vue 结算实现  
> 主题方案：daisyUI CSS 变量驱动，与项目全局主题无缝跟随  

---

## 目录

1. [概述](#1-概述)
2. [布局与结构](#2-布局与结构)
3. [视觉规范](#3-视觉规范)
4. [动画方案](#4-动画方案)
5. [数据接口](#5-数据接口)
6. [集成方式](#6-集成方式)
7. [参考代码（连连看结算实现）](#7-参考代码连连看结算实现)

---

## 1. 概述

### 1.1 设计目标

结算页面采用与连连看一致的**极简风格**：半透明遮罩 + 居中卡片，仅显示胜负结果和简短胜负语。不展示数据面板、不多步动画序列，保持最轻量的对局结束反馈。

### 1.2 核心原则

- **CSS 变量主题跟随**：所有 UI 样式通过 daisyUI 类名（`bg-base-100`、`text-primary`、`text-base-content` 等）实现，颜色由当前 `data-theme` 自动决定，不硬编码任何颜色值
- **技能特效不参与**：Pixi.js 层的粒子、光环、武器特效不受主题约束，可使用固定的赛博朋克色值
- **简洁优先**：参考 LinkLinkRoom 第 18–30 行实现，不做额外复杂度

### 1.3 主题分工

| 层级 | 主题方案 | 说明 |
|------|----------|------|
| DOM UI（结算卡片、血量、能量等） | daisyUI CSS 变量 | 随 `data-theme` 自动切换 |
| Pixi.js 层（技能特效、光环等） | 硬编码赛博色值 | 不参与主题跟随 |

---

## 2. 布局与结构

### 2.1 DOM 层级

```
FishOilRoom.vue（GameView 内部）
└── <Transition name="zoom">
    └── 遮罩层
        └── 结果卡片
            ├── 胜负图标
            ├── 胜者昵称
            └── 视角相关提示语
```

### 2.2 遮罩层

```html
<div class="absolute inset-0 z-10 flex items-center justify-center 
            bg-base-300/40 backdrop-blur-sm rounded-xl">
```

- `absolute inset-0`：覆盖整个游戏区域
- `z-10`：高于 Pixi.js Canvas，低于顶部栏（如有）
- `bg-base-300/40`：40% 透明度背景色（daisyUI 变量）
- `backdrop-blur-sm`：轻微模糊，增强层次感

### 2.3 结果卡片

```html
<div class="bg-base-100/95 text-primary shadow-2xl px-8 py-6 
            rounded-2xl border border-primary/30 text-2xl font-bold text-center">
```

- `bg-base-100/95`：95% 不透明基础背景（毛玻璃感）
- `border border-primary/30`：30% 透明度主色边框
- `rounded-2xl`：大圆角
- `shadow-2xl`：深度阴影

### 2.4 内容元素

| 元素 | 类名 | 内容 |
|------|------|------|
| 胜负图标 | 无特殊类名 | 🎉（胜）/ 💀（败） |
| 胜者昵称 | `text-2xl font-bold text-primary` | `{{ winnerName }} 获胜！` |
| 提示语 | `text-base font-normal text-base-content/60 mt-2` | 视角相关文案（见 2.5） |

### 2.5 三态文案

```typescript
// 视角适配
if (isWatcher) {
  subtitle = '对局已结束。'
} else if (winnerName === roomPlayer.name) {
  subtitle = '恭喜你，击败对手，赢得胜利！'
} else {
  subtitle = '加油，下次再来！'
}
```

---

## 3. 视觉规范

### 3.1 类名映射表

| 层级 | daisyUI 类名 | 语义 | 主题变量来源 |
|------|-------------|------|-------------|
| 遮罩 | `bg-base-300/40` | 40% 透明背景 | `--b3` (base-300) |
| 遮罩 | `backdrop-blur-sm` | 模糊 | 固定 blur 值 |
| 卡片 | `bg-base-100/95` | 95% 不透明卡片 | `--b1` (base-100) |
| 卡片 | `border-primary/30` | 30% 透明主色边框 | `--p` (primary) |
| 卡片 | `shadow-2xl` | 阴影 | Tailwind 预设 |
| 卡片 | `rounded-2xl` | 圆角 | Tailwind 预设 |
| 胜者文字 | `text-primary` | 主色文字 | `--p` (primary) |
| 胜者文字 | `font-bold text-2xl` | 加粗 24px | Tailwind 预设 |
| 提示文字 | `text-base-content/60` | 60% 透明基础文字 | `--bc` (base-content) |
| 提示文字 | `text-base font-normal` | 常规 16px | Tailwind 预设 |
| 内边距 | `px-8 py-6` | 水平 32px 垂直 24px | Tailwind 预设 |

### 3.2 主题切换效果

当玩家通过 `ThemeController` 切换 `data-theme` 时，以上所有 CSS 变量自动更新。例如：

| 主题 | --b1 (卡片背景) | --p (胜者文字) | --bc (提示语) |
|------|----------------|---------------|--------------|
| dark | `#1d232a` | `#661AE6` | `#A6ADBB` |
| cyberpunk | `#ffee00` | `#00ffff` | `#000000` |
| synthwave | `#2d1b69` | `#e779c1` | `#ffffff` |

无需在结算页面中处理任何主题切换逻辑。

### 3.3 无需自定义 CSS

结算页面不引入任何 `scoped <style>` 块中的硬编码颜色。所有视觉效果完全由 Tailwind + daisyUI 类名覆盖。

---

## 4. 动画方案

### 4.1 Transition 配置

```css
.zoom-enter-active, .zoom-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.zoom-enter-from, .zoom-leave-to {
  opacity: 0;
  transform: scale(0.9);
}
```

### 4.2 时序

```
t=0s    ─── 游戏结束，game_end 事件触发
t=0s    ─── Transition enter 开始（opacity 0, scale 0.9）
t=0.3s  ─── Transition enter 完成（opacity 1, scale 1.0）
         ─── 遮罩 + 卡片完全显示
         ─── 结束，不设自动消失
```

### 4.3 设计原则

- 仅使用 `Transition name="zoom"`，与 LinkLinkRoom 保持一致
- 不实现慢动作回放、光柱射出、数据面板滑入等多步序列
- 不退场（结算卡片保持显示直到玩家离开房间）

---

## 5. 数据接口

### 5.1 Component Props

```typescript
interface SettlementProps {
  /** 胜者昵称，非空时显示结算遮罩 */
  winnerName: string | null;
  /** 胜者 ID（用于判断是否自己获胜） */
  winnerPlayerId: string;
  /** 当前玩家是否为观战者 */
  isWatcher: boolean;
  /** 当前玩家昵称（用于三态文案判断） */
  roomPlayerName: string;
}
```

### 5.2 数据来源

| 字段 | 来源 | 类型 |
|------|------|------|
| `winnerName` | `useFishOilBattle` composable 响应式状态 | `Ref<string \| null>` |
| `winnerPlayerId` | 后端 `game_end` 事件 payload | `string` |
| `isWatcher` | `useFishOilBattle` composable | `Ref<boolean>` |
| `roomPlayerName` | `roomPlayer.name`（Tiaoom RoomPlayer） | `string` |

### 5.3 后端 game_end 事件格式

```json
{
  "type": "game_end",
  "data": {
    "winnerId": "p1",
    "winnerName": "玩家昵称",
    "reason": "hp_zero",
    "stats": {
      "p1": { "remainingHp": 23, "totalDamage": 156, "maxHit": 36, "weaponTriggers": 8, "bursts": 2 },
      "p2": { "remainingHp": 0, "totalDamage": 98, "maxHit": 20, "weaponTriggers": 5, "bursts": 1 }
    }
  }
}
```

> **注意**：`stats` 数据虽然接收，但**不在结算卡片上展示**。保留用于后续扩展（如观战调试面板）。

---

## 6. 集成方式

### 6.1 文件位置

```
game/frontend/src/components/fish-oil-battle/
├── FishOilRoom.vue          ← 主游戏界面，结算遮罩放此处
├── FishOilRoomLite.vue      ← 小窗模式（如有）
├── components/              ← 子组件
├── renderer/                ← Pixi.js 渲染器
└── useFishOilBattle.ts      ← Composable，管理 winnerName 状态
```

### 6.2 嵌入位置

结算遮罩放在 `FishOilRoom.vue` 的 `<GameView>` 内部 `<section>` 中，与 Pixi.js Canvas 同级 DOM：

```html
<GameView :room-player="roomPlayer" :game="game" @command="onCommand">
  <section class="flex-1 ... relative">
    
    <!-- Pixi.js Canvas 挂载点 -->
    <div ref="pixiContainer" class="absolute inset-0" />
    
    <!-- 结算遮罩（z-10，覆盖 Canvas） -->
    <Transition name="zoom">
      <div v-if="winnerName" class="absolute inset-0 z-10 ...">
        <div class="...">
          🎉 {{ winnerName }} 获胜！
          <div class="...">{{ subtitleText }}</div>
        </div>
      </div>
    </Transition>
    
  </section>
</GameView>
```

### 6.3 触发时机

```
后端 game_end 事件
  → useFishOilBattle 更新 winnerName Ref
  → v-if="winnerName" 变为 true
  → Transition zoom enter 播放
  → 结算卡片显示
```

### 6.4 与 GameView 的层级关系

```
GameView
├── 顶部栏（L4 DOM UI，如房间名、设置）
├── <section> 游戏区域
│   ├── Pixi.js Canvas（L1-L3+L5 特效层）
│   └── 结算遮罩（z-10，高于 Canvas，低于顶部栏）
└── 底部栏（L4 DOM UI，如玩家信息）
```

`z-10` 确保结算遮罩覆盖 Pixi.js 渲染内容，但不遮挡 GameView 的顶部/底部 UI 栏。

---

## 7. 参考代码（连连看结算实现）

### 7.1 LinkLinkRoom.vue 核心片段

```html
<!-- 第 18–30 行 -->
<Transition name="zoom">
  <div
    v-if="winnerName"
    class="absolute inset-0 z-10 flex items-center justify-center 
           bg-base-300/40 backdrop-blur-sm rounded-xl"
  >
    <div class="bg-base-100/95 text-primary shadow-2xl px-8 py-6 
                rounded-2xl border border-primary/30 text-2xl font-bold text-center">
      🎉 {{ winnerName }} 获胜！
      <div class="text-base font-normal text-base-content/60 mt-2">
        {{ isWatcher ? '对局已结束。' : (winnerName === roomPlayer.name ? '恭喜你，率先清空棋盘！' : '加油，下次再来！') }}
      </div>
    </div>
  </div>
</Transition>
```

### 7.2 Transition CSS

```css
/* 第 130–131 行 */
.zoom-enter-active, .zoom-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.zoom-enter-from, .zoom-leave-to {
  opacity: 0;
  transform: scale(0.9);
}
```

---

> **文档状态**：设计阶段完成，待代码实施。  
> **下一步**：在 `FishOilRoom.vue` 中实现结算遮罩，在 `useFishOilBattle.ts` 中添加 `winnerName` 状态管理。
