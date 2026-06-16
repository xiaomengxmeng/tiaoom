---
name: settlement-page-design
overview: 为赛博鱼油游戏创建结算页面设计文档，采用类似连连看的简洁风格，只显示胜负结果和简短胜负语，输出为独立的 settlement-design.md
design:
  architecture:
    framework: vue
  styleKeywords:
    - Cyberpunk
    - Neon
    - Glassmorphism
    - Minimalism
  fontSystem:
    fontFamily: PingFang-SC
    heading:
      size: 24px
      weight: 700
    subheading:
      size: 14px
      weight: 400
    body:
      size: 16px
      weight: 600
  colorSystem:
    primary:
      - "#FF00FF"
      - "#00BFFF"
      - "#39FF14"
      - "#FFD700"
    background:
      - "#0A0A1A"
      - "#0A0A1ACC"
    text:
      - "#E0E0FF"
      - "#FFFFFF"
    functional:
      - "#00FFFF"
      - "#33FF33"
todos:
  - id: brainstorm-design
    content: Use [skill:Brainstorming] 构思结算页面设计文档结构与内容要点
    status: completed
  - id: write-doc
    content: 撰写 settlement-design.md 结算页面设计文档
    status: completed
    dependencies:
      - brainstorm-design
---

## 产品概述

为赛博鱼油游戏创建一份结算页面设计文档，参考连连看的简洁结算风格，融入赛博朋克主题视觉。

## 核心功能

- 结算页面采用半透明遮罩 + 居中卡片的简洁布局（类连连看）
- 显示胜负结果（胜者昵称 + 获胜提示语）
- 区分玩家视角与观战视角的不同提示文案
- 融入赛博朋克视觉风格（霓虹色、深色背景、流派色标识）
- 适配 Vue Transition 进入/退出动画
- 输出为独立设计文档 settlement-design.md

## 技术栈

- 文档格式：Markdown
- 参考框架：Vue 3 + Tiaoom SDK + GameView 通用组件
- 视觉风格对齐：赛博朋克主题（现有色彩规范 #0A0A1A 背景、#00FFFF 霓虹边框、4流派色）

## 实现方案

编写一份独立结算页面设计文档，内容覆盖：

1. 页面布局与结构（对照连连看遮罩+卡片模式）
2. 赛博朋克风格视觉规范（色彩、字体、边框、背景）
3. 动画方案（进入/退出过渡、微动效）
4. 视角适配（玩家/观战者不同文案）
5. 组件接口定义（winnerName、isWatcher 等数据依赖）
6. 与现有 GameView 框架的集成方式

## 实现要点

- 严格对齐连连看的简洁模式：不做数据面板、不做多步动画序列
- 赛博朋克风格通过边框颜色（流派主色）、背景透明度、霓虹发光效果体现，不增加复杂度
- 文档需为后续代码实现提供足够细节，包括 CSS 类名建议和 Transition 配置

## 目录结构

```
d:\TraePro\fishoil\tiaoom\游戏设计文档\
└── settlement-design.md  # [NEW] 赛博鱼油结算页面设计文档
```

## 设计风格

赛博朋克极简结算页。深色半透明遮罩覆盖游戏画面，中央弹出霓虹风格结果卡片，显示胜者昵称与胜负提示语。卡片边框使用胜者流派主色发光，背景为深蓝黑半透明毛玻璃，文字使用赛博感等宽字体。整体视觉与赛博鱼缸战场风格统一，但保持连连看式的简洁交互。

## 页面结构（单页单屏）

- **遮罩层**：全屏覆盖，bg #0A0A1A/40 + backdrop-blur
- **结果卡片**：居中圆角矩形，bg #0A0A1A/95，border 流派主色 + glow，内容含：
- 胜利标识（霓虹图标 + "获胜！"文字）
- 胜者昵称（流派主色高亮）
- 视角适配提示语（玩家胜/负/观战三态）
- **动画**：Vue Transition zoom 进入（scale 0.9→1 + opacity），0.3s ease

## Agent Extensions

### Skill

- **Brainstorming**
- Purpose: 引导设计文档的结构和内容构思，确保文档覆盖全面
- Expected outcome: 产出结构清晰、内容完整的结算页面设计文档大纲