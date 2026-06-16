---
name: fish-oil-ball-visual-upgrade
overview: 将小球从当前粗糙的霓虹圆形升级为现代简约圆润风格（径向渐变、高光、柔和阴影），并增强运动拖尾效果使其更长更华丽
---

所有代码细节已确认，现在生成最终方案：<plan_result>
<req>

## 产品概述

优化游戏中小球（玩家球体）的视觉表现。当前小球为简陋的深色粗边框圆形 + 首字母数字，视觉效果粗糙（如截图所示）。用户要求升级为**现代简约圆润风格**，类似现代 UI 中的柔和球体效果。

## 核心功能

- **现代渐变球体**：用 Canvas 径向渐变替代当前两层纯色圆填充，实现从中心亮到边缘暗的立体感
- **高光与阴影**：在球体左上角添加镜面高光点，底部添加柔和内阴影，增强 3D 球体质感
- **精致细边光环**：将当前 4px 粗霓虹环改为 1-1.5px 细线环，降低透明度，营造优雅边框感而非霓虹灯感
- **柔化环境光晕**：将光晕改为更大范围、更低透明度的弥散效果，模拟自然环境光照
- **华丽运动拖尾**：增强拖尾粒子效果——更密集发射、更长生命周期、更大粒子尺寸、速度相关的长度变化，形成流动的残影轨迹
- **色彩体系微调**：对流派主色调做轻微去饱和处理，适配现代简约风格
</req>

<tech>

## 技术栈

- **渲染引擎**: Pixi.js v8 (Graphics API + Canvas Texture)
- **语言**: TypeScript
- **项目**: Vue 3 前端游戏模块

## 实现方案

### 核心策略

全部改动集中在 `PlayerRenderer.ts` 单一文件内，通过改造 Canvas 绘图逻辑实现视觉升级，无需新增依赖或修改其他文件。

### 关键技术决策

1. **Canvas RadialGradient 实现球体渐变**: 在 `graphicsToTexture()` 方法中利用 Canvas 2D API 的 `createRadialGradient` 绘制从亮到暗的球形渐变，配合 `createLinearGradient` 模拟高光和阴影层
2. **保持现有架构不变**: 不引入新组件或纹理资源，完全通过程序化绘制实现，保持轻量和动态性（不同流派颜色自动适配）
3. **拖尾增强策略**: 通过调整 `emitTrailParticle()` 的参数（interval、life、scale、radius、alpha）以及根据 speed 动态控制发射频率和粒子尺寸，实现速度越快拖尾越长越华丽的视觉效果

### 架构设计

```
PlayerRenderer (单文件改造)
├── FACTION_COLORS [MODIFY] — 色彩微调（轻微去饱和）
├── graphicsToTexture() [MODIFY] — 核心重写：
│   ├── 径向渐变底色（center→edge）
│   ├── 左上角高光椭圆
│   ├── 底部弧形阴影
│   └── 精致的数字/首字母文字
├── drawGlow() [MODIFY] — 弥散化光晕
├── drawRing() [MODIFY] — 细线优雅环
└── emitTrailParticle() [MODIFY] — 华丽拖尾
    ├── 缩短发射间隔 (40ms → ~22ms)
    ├── 延长生命周期 (250ms → 450ms)
    ├── 加大初始尺寸并平滑衰减
    └── 速度相关参数动态调节
```

### 性能考量

- `graphicsToTexture()` 仅在初始化/切换流派时调用一次，不影响每帧性能
- 光晕和光环的 `clear()+redraw` 模式保持不变（已有开销可控）
- 拖尾粒子增加约 2x 发射量，但 ParticlePool 容量为 300 已有足够余量；可通过最小速度阈值限制低速时不发拖尾来节省

## 目录结构

```
game/frontend/src/components/fish-oil-battle/renderer/entities/
└── PlayerRenderer.ts   # [MODIFY] 小球视觉全面升级的唯一修改目标
```

</tech>

<design framework="Pixi.js" component="">
<description>

## 设计方向：Modern Minimalist Sphere（现代简约圆润风）

整体设计理念借鉴 Apple HIG 和现代 UI 设计中的"软球体"(Soft Sphere)美学——圆润、柔和、微妙的光影层次感，摒弃当前粗糙的霓虹粗边风格。

### 页面/元素规划（小球本体视觉分层，由底层到顶层）

#### Block 1: 环境光晕层（最底层 - glow）

- **布局**: 以球心为圆心的多层弥散圆形光晕
- **样式**: 3 层同心圆，从内到外透明度递减，颜色使用流派色的低饱和版本。最大半径约为球体的 2 倍，形成柔和的环境光氛围
- **交互**: 强度随运动速度线性增长（静止时微弱，高速时明亮），无脉动闪烁
- **设计要点**: 模拟 soft box lighting 的自然弥散效果，alpha 控制在 0.03~0.12 范围内

#### Block 2: 流派标识光环（中层 - ring）

- **布局**: 紧贴球体外缘的细圆环，距离球面 3px
- **样式**: 1.5px 宽度的极细线条，颜色为流派主色调，透明度 0.35~0.5，带极其微弱的呼吸脉动（幅度 0.85~1.0 而非当前的 0.7~1.0）
- **交互**: 整体缓慢旋转（0.5Hz 保持不变），脉动频率降至 2Hz 使其更加沉稳
- **设计要点**: 类似现代 UI 图标的精致描边，不是霓虹灯管而是优雅的分隔线

#### Block 3: 球体本体（核心层 - avatar/graphicsToTexture）

- **布局**: 直径 72px (AVATAR_RADIUS=36) 的正圆形
- **样式**: 
- **径向渐变填充**: 从中心偏左上的高亮点向边缘过渡。中心区域接近白色(带流派色 tint)，边缘为深色（流派 dim 色）。使用 Canvas `createRadialGradient` 实现，偏移中心制造立体球体感
- **镜面高光**: 左上角 (-10, -10) 位置一个椭圆形高光斑（白色，alpha 0.35~0.45），模拟光源反射
- **底部弧形阴影**: 底部边缘内侧一段深色弧形（alpha 0.15~0.25），增强球体厚度感
- **数字/ID**: 球心位置显示玩家编号，使用 Inter/SF Pro 风格字体（降级为 system-ui），字号 20px bold，颜色为半透明白(#FFFFFF, alpha 0.9)，无黑色描边（当前的黑边太粗糙）
- **设计要点**: 这是视觉核心，必须一眼看出是精致的 3D 球体而非扁平色块

#### Block 4: 运动拖尾（动态层 - emitTrailParticle）

- **布局**: 从球体后方延伸出的粒子流，沿运动反方向分布
- **样式**: 多个圆形粒子组成，每个粒子为流派色的柔和圆形（非纯色，带 alpha 渐变）
- **交互**: 
- 高速运动时：密集、长拖尾（粒子大、生命长、数量多）
- 低速/静止时：稀疏或无拖尾（最小速度阈值过滤）
- 粒子从大到小、从不透明到透明的 smooth 过渡
- **设计要点**: 形成类似流体拖尾(flow trail)的效果，而非当前稀疏的小点

#### Block 5: 浮动 ID 文字（顶层 - idText）

- **布局**: 球体上方 8px 处悬浮
- **样式**: 字号 12px，使用 system-ui 无衬线字体，白色(alpha 0.85)，无描边或仅 1px 半透明暗色描边
- **设计要点**: 当前 Courier New 等宽字体+粗黑描边过于突兀，需改为现代 UI 常用的纤细无衬线风格
</description>
<style_keywords>
<keyword>Modern Minimalist</keyword>
<keyword>Soft Sphere</keyword>
<keyword>Radial Gradient</keyword>
<keywoed>Subtle Specular Highlight</keyword>
<keyword>Diffuse Ambient Glow</keyword>
<keyword>Elegant Thin Ring</keyword>
<keyword>Fluid Motion Trail</keyword>
</style_keywords>
<font_system fontFamily="system-ui, -apple-system, 'SF Pro Display', 'Inter', sans-serif">
<heading size="20px" weight="600"></heading>
<subheading size="13px" weight="500"></subheading>
<body size="20px" weight="700"></body>
</font_system>
<color_system>
<primary_colors>
<!-- aggressor: 品红 → 降低饱和度 -->
<color>#E850D0</color>
<!-- controller: 天蓝 → 降低饱和度 -->
<color>#30A5E0</color>
<!-- engineer: 翠绿 → 降低饱和度 -->
<color="#32D63A</color>
<!-- wildcard: 金黄 → 微调 -->
<color>#E5C000</color>
</primary_colors>
<background_colors>
<!-- 球体内核深色 -->
<color>#1A1A2E</color>
<!-- 球体高光区 -->
<color>#F0F0FF</color>
</background_colors>
<text_colors>
<!-- ID 文字 -->
<color>#FFFFFF</color>
<!-- 球心数字 -->
<color>#F0F0FF</color>
</text_colors>
<functional_colors>
<!-- 高光 -->
<color>#FFFFFF</color>
<!-- 阴影 -->
<color>#000000</color>
</functional_colors>
</color_system>
</design>

<extensions>

## Agent Extensions

### Skill

- **UI设计Skill**
- Purpose: 提供专业 UI 视觉设计方案参考，确保小球视觉升级符合现代设计标准（Google Material Design / Apple HIG / Pinterest 级审美）
- Expected outcome: 输出高质量的视觉设计方案，包括配色建议、光影层次、动效规范等设计决策依据
</extensions>

<todolist>
<item id="upgrade-sphere-body" deps="">重写 graphicsToTexture(): 用 Canvas 径向渐变+高光+阴影实现现代球体</item>
<item id="refine-glow-ring" deps="">柔化 drawGlow() 光晕 + 细化 drawRing() 光环为优雅细线</item>
<item id="enhance-trail" deps="">增强 emitTrailParticle(): 更密更长更大的华丽拖尾效果</item>
<item id="polish-colors-text" deps="upgrade-sphere-body">微调 FACTION_COLORS 色彩 + 优化 idText 字体样式</item>
</todolist>
</plan_result>