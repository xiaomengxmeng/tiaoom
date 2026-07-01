# 装饰图片 V18 重新生成设计

## 背景

V7-V17 多轮尝试后，5.0-lite 生成的旋转类装饰元素分布不均匀、粘连，后处理（连通组件/角度密度/扇区切割）都无法可靠提取单个元素旋转复制。

## 目标

重新生成 12 个武器装饰 PNG，解决旋转类对称问题。

## 方案

### 核心策略
- **换用 4.5 模型**（质量更高，1024×1024）
- **逐个生成 12 张图**（不再用网格图）
- **旋转类：AI 只生成扇形（1 个元素），程序旋转 N 次拼接**

### 旋转类生成策略

| 装饰 | N | AI 生成扇形 | 程序处理 |
|------|---|------------|---------|
| triple-triangle | 3 | 120° (1 个三角形居右) | 旋转 0°/120°/240° |
| triple-blade | 3 | 120° (1 把刀居右) | 旋转 0°/120°/240° |
| hex-shard-ring | 6 | 60° (1 个六边形碎片居右) | 旋转 0°/60°/120°/180°/240°/300° |

**关键约束**：
- 球居中
- 元素放在 3 点钟方向（右侧水平）
- 扇形外区域留空
- 程序以球心为中心正向映射旋转

### 非旋转类生成策略

| 类型 | 装饰 | Prompt 策略 |
|------|------|------------|
| 顶部类 | cat-ear, cloud-bolt | 完整装饰 + 球，顶部 |
| 中心类 | floating-book, vine-bud, palette-brush | 完整装饰 + 球，中心 |
| 外圈类 | air-field, moon-halo, lens-crosshair, mood-aura | 完整装饰 + 球，外圈 |

### 生成参数
- 模型：doubao-seedream-4-5
- 尺寸：1024×1024
- 参考：`游戏设计文档/装饰.png`
- 风格：扁平矢量卡通游戏图标，锐利边缘，无投影

### 后处理流水线（每张独立处理）
1. 去白背景（flood fill，4 角种子，RGB>220）
2. 检测黑球圆心 + 去黑（RGB<30）
3. 去残余孤立黑点（<30 像素簇）
4. 旋转类：以球心为中心，正向映射旋转复制 N 份
5. 等比缩放到 256×256（margin=8）

### 输出
- 临时：`temp/decorators/output/{name}.png`
- 最终（确认后）：`game/frontend/src/components/fish-oil-battle/renderer/entities/decorators/assets/{name}.png`

### 生成顺序（逐张检查）
1. **hex-shard-ring**（60° 验证）
2. triple-triangle（120°）
3. triple-blade（120°）
4. cat-ear / cloud-bolt / floating-book / vine-bud / palette-brush
5. air-field / moon-halo / lens-crosshair / mood-aura

## 验收标准

- 旋转类装饰：N 个元素完美对称分布
- 黑球完全去除，无黑点残留
- 透明背景
- 256×256 尺寸
- 装饰位置居中
