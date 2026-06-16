---
name: fish-oil-ball-visual-upgrade
overview: 将小球从当前粗糙的霓虹圆形升级为现代简约圆润风格（径向渐变、高光、柔和阴影），增强运动拖尾效果；无头像时用渐变球体占位符，有头像时拖尾颜色取头像主色系
design:
  styleKeywords:
    - Modern Minimalist
    - Soft Sphere
    - Radial Gradient
    - Subtle Specular Highlight
    - Diffuse Ambient Glow
    - Elegant Thin Ring
    - Fluid Motion Trail
  fontSystem:
    fontFamily: system-ui, -apple-system, 'SF Pro Display', 'Inter', sans-serif
    heading:
      size: 20px
      weight: 600
    subheading:
      size: 13px
      weight: 500
    body:
      size: 20px
      weight: 700
  colorSystem:
    primary:
      - "#E850D0"
      - "#30A5E0"
      - "#32D63A"
      - "#E5C000"
    background:
      - "#1A1A2E"
      - "#F0F0FF"
    text:
      - "#FFFFFF"
    functional:
      - "#FFFFFF"
      - "#000000"
todos:
  - id: upgrade-sphere-body
    content: 重写 graphicsToTexture()：Canvas 径向渐变+镜面高光+底部阴影+现代字体实现精致球体占位符
    status: completed
  - id: refine-glow-ring
    content: 柔化 drawGlow() 为5层低alpha弥散光晕 + 细化 drawRing() 为1.5px优雅细线环
    status: completed
  - id: enhance-trail-extract-color
    content: 增强 emitTrailParticle() 密集长拖尾 + 新增 extractDominantColor() 从头像提取主色作拖尾色
    status: completed
  - id: polish-colors-text
    content: 微调 FACTION_COLORS 去饱和 + 优化 idText 为 system-ui 字体去除粗黑描边
    status: completed
    dependencies:
      - upgrade-sphere-body
---

## 产品概述

优化游戏中小球（玩家球体）的视觉表现。当前小球为简陋的深色粗边框圆形 + 首字母数字（如截图所示），视觉效果粗糙。用户要求升级为**现代简约圆润风格**，类似现代 UI 中的柔和球体效果，同时增强运动拖尾。

## 核心功能

- **现代渐变球体占位符**：无头像时用 Canvas 径向渐变绘制立体感球体（中心亮、边缘暗、左上高光、底部阴影），替代当前两层纯色圆
- **真实头像支持 + 拖尾取色**：加载到真实头像后使用圆形裁切显示；同时从头像图片像素中提取主色系作为拖尾粒子颜色（未获取头像时沿用流派色）
- **精致细边光环**：将当前 4px 粗霓虹环改为 1.5px 细线环，低透明度优雅描边
- **柔化环境光晕**：更大范围、更低透明度的多层弥散效果
- **华丽运动拖尾**：更密(22ms)、更长(450ms)、更大(scale 1.2→0)的流体残影，速度越快拖尾越长
- **ID 文字现代化**：system-ui 无衬线字体替代 Courier New 等宽字体，去除粗黑描边

## 技术栈

- **渲染引擎**: Pixi.js v8 (Graphics API + Canvas Texture)
- **语言**: TypeScript
- **修改范围**: 仅 `PlayerRenderer.ts` 单文件

## 实现方案

### 核心策略

全部改动集中在 `PlayerRenderer.ts`，通过改造 Canvas 绘图逻辑实现视觉升级，无需新增文件或依赖。

### 关键技术决策

1. **Canvas RadialGradient 实现球体渐变**: 在 `graphicsToTexture()` 中用 `createRadialGradient` 绘制偏心径向渐变（高光点偏左上），配合 `createLinearGradient` 绘制镜面高光椭圆和底部弧形阴影
2. **头像主色提取**: 在 `setAvatar()` 加载成功后，将纹理绘制到离屏 canvas，采样像素用简化颜色量化算法提取主导色，存入新增的 `trailColor` 字段供 `emitTrailParticle()` 使用
3. **保持架构不变**: 不引入新组件/纹理资源，完全程序化绘制，动态适配流派颜色

### 新增字段

```typescript
private trailColor: number;  // 拖尾粒子颜色（默认=流派primary，有头像时=头像主色）
```

### 方法改造清单

| 方法 | 改动类型 | 说明 |
| --- | --- | --- |
| `FACTION_COLORS` | MODIFY | 轻微去饱和适配现代简约风 |
| `graphicsToTexture()` | 重写 | 径向渐变+高光+阴影+现代字体 |
| `drawGlow()` | MODIFY | 更多层(5层)、更低alpha、更大半径 |
| `drawRing()` | MODIFY | width 4→1.5, alpha降低, pulse幅度收窄 |
| `emitTrailParticle()` | MODIFY | interval/life/scale/radius全面增强, 用trailColor |
| `setAvatar()` | MODIFY | 加载成功后调用extractDominantColor() |
| `extractDominantColor()` | 新增 | canvas像素采样+颜色量化, 返回number色值 |
| idText style | MODIFY | fontFamily改system-ui, 去除粗黑描边 |


### 头像主色提取算法 (`extractDominantColor`)

1. 将 PIXI.Texture 绘制到离屏 canvas（小尺寸如 16x16 降采样加速）
2. 遍历所有像素，跳过 alpha < 128 的透明像素
3. 将 RGB 各通道量化到 32 级（右移 3 位）做颜色桶统计
4. 返回出现频率最高的桶的中心色值
5. 提取结果缓存到 `this.trailColor`，后续 `emitTrailParticle()` 直接使用

### 性能考量

- `graphicsToTexture()` 和颜色提取仅在初始化/切换流派/加载头像时调用一次，不影响每帧性能
- 光晕光环 clear+redraw 模式不变，开销可控
- 拖尾发射量约增加 2x，ParticlePool 容量 300 有余量；低速时(min speed < 30)不发拖尾节省粒子

### 目录结构

```
game/frontend/src/components/fish-oil-battle/renderer/entities/
└── PlayerRenderer.ts   # [MODIFY] 小球视觉全面升级的唯一修改目标
```

## 设计方向：Modern Minimalist Sphere（现代简约圆润风）

整体设计理念借鉴 Apple HIG 的软球体美学——圆润、柔和、微妙的光影层次感。

### 视觉分层（底层→顶层）

#### Block 1: 环境光晕层（glow）

以球心为中心的多层弥散圆形。5层同心圆从内到外 alpha 递减（0.08/0.05/0.03/0.015/0.008），最大半径约球体2倍。强度随速度线性增长，静止微弱高速明亮。模拟 soft box lighting 自然弥散。

#### Block 2: 流派标识光环（ring）

紧贴球体外缘 3px 的极细圆环。1.5px 宽度，alpha 0.35~0.45，带微弱呼吸脉动(0.85~1.0)，2Hz 脉频，缓慢旋转 0.5Hz。现代 UI 图标级精致描边，非霓虹灯管。

#### Block 3: 球体本体（avatar / graphicsToTexture）

直径 72px 正圆形：

- **径向渐变**: 偏左上中心点 createRadialGradient，中心亮(白+派系色tint)→边缘暗(dim色)，制造立体球形
- **镜面高光**: 左上(-10,-10)白色椭圆斑(alpha 0.35→0.1线性渐变)
- **底部弧影**: 底部内侧深色弧段(alpha 0.18)
- **数字**: 球心 system-ui 字体 20px bold, #FFFFFF alpha 0.9, 无粗黑描边

#### Block 4: 运动拖尾（emitTrailParticle）

沿运动反方向的流体残影：interval 22ms, life 450ms, scaleStart 1.2→0, alphaStart 0.5→0, radius 6~8, 速度>30才发射。高速时密集长拖尾，低速稀疏/无。颜色来自 trailColor（头像主色或流派色）。

#### Block 5: 浮动 ID 文字（idText）

球体上方 8px 悬浮。12px system-ui 无衬线, 白色 alpha 0.85, 1px 半透明暗色描边(width:1 color:#000 alpha:0.3)。取代当前突兀的 Courier New + 粗黑描边。

## Agent Extensions

- **UI设计Skill**
- Purpose: 确保小球视觉升级符合现代设计标准（Google Material Design / Apple HIG / Pinterest 级审美），输出高质量的视觉设计方案
- Expected outcome: 为配色建议、光影层次、动效规范提供设计决策依据