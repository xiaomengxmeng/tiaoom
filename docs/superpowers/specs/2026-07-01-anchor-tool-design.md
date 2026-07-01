# 装饰锚点调整工具 设计文档

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提供一个零依赖的本地网页工具，让用户直观调整 12 个武器装饰 PNG 的 sprite 锚点，生成可粘贴到 `WeaponDecorators.ts` 的 TypeScript 代码片段。

**Architecture:** 单文件 HTML + 原生 JavaScript + Canvas 2D。左侧 4×3 装饰缩略图网格，右侧 512×512 大图画布，可拖拽红色锚点，叠加 8 像素网格 + 图像几何中心参考。`localStorage` 持久化所有调整，[全部复制] 按钮一次性复制 12 个装饰的代码。

**Tech Stack:** HTML5 Canvas 2D, 原生 ES2017+ JavaScript, localStorage, Clipboard API。零运行时依赖。

---

## 1. 背景与动机

### 1.1 当前问题

`game/frontend/src/components/fish-oil-battle/renderer/entities/decorators/WeaponDecorators.ts` 中，12 个武器装饰的 `SpriteDecorator` 基类将所有 sprite 的 `anchor` 硬编码为 `(0.5, 0.5)`（PNG 几何中心）。但 AI 生成的装饰 PNG 存在以下问题：

- **旋转类装饰（triple-blade、triple-triangle、hex-shard-ring）**：3 把刀/3 个三角形/6 个六边形在球周围分布不对称，真实对称中心偏离几何中心，导致旋转动画时装饰"绕错中心"旋转
- **非旋转装饰（cat-ear、cloud-bolt、floating-book 等）**：需要 yOffset 补偿才能让装饰视觉上与球顶/球心对齐

直接改 `.ts` 中的 `anchor` 值需要反复编辑 + 构建 + 启动游戏 + 截图 + 调坐标的循环，效率极低。

### 1.2 目标

提供一个所见即所得（拖拽 + 实时坐标显示 + 网格参考）的本地工具，让用户：
1. 在浏览器中直接看到 PNG + 可拖拽的锚点
2. 实时看坐标值是否符合预期
3. 一键复制 12 个装饰的代码片段到剪贴板
4. 粘贴到 `WeaponDecorators.ts` 中，重新构建即可生效

## 2. 文件清单

### 2.1 新增文件

- `temp/decorators/anchor-tool.html` — 单文件工具，HTML+CSS+JS 全部内联

### 2.2 修改文件

- `game/frontend/src/components/fish-oil-battle/renderer/entities/decorators/WeaponDecorators.ts` — 粘贴工具生成的 anchor 代码到对应 `onTextureReady`

### 2.3 不修改文件

- `temp/decorators/output/*.png` — 12 个装饰 PNG 保持不变
- 其他 12 个 `SpriteDecorator` 子类结构

## 3. 架构

### 3.1 总体结构

单 HTML 文件分为 4 个区域：

```
┌────────────────────────────────────────────────────┐
│ 顶部工具栏：[全部复制] [重置全部] [显示网格✓]      │
│              [显示 bbox✓] [导入] [导出]            │
├──────────────┬─────────────────────────────────────┤
│              │                                     │
│  缩略图网格   │   大图画布（512×512）               │
│  4×3 布局    │   - PNG 居中显示                    │
│  12 个装饰    │   - 8px 网格（淡灰）               │
│  蓝色高亮     │   - 图像中心（蓝十字）             │
│  当前选中     │   - 可拖拽锚点（红十字+圆点）      │
│              │   - bbox 包围盒（绿色）             │
│              │                                     │
│              ├─────────────────────────────────────┤
│              │  信息栏：装饰名 + 坐标值 + 重置     │
│              │  [复制当前] [✓ 已复制]              │
└──────────────┴─────────────────────────────────────┘
```

### 3.2 组件边界

| 组件 | 职责 | 输入 | 输出 |
|------|------|------|------|
| `DecoGrid` | 渲染 12 个缩略图，处理选中事件 | 装饰列表 | `onSelect(name)` |
| `DecoCanvas` | 在大图画布上渲染 PNG + 网格 + 锚点 | PNG Image, anchor state | Canvas DOM |
| `AnchorDrag` | 处理鼠标/触摸拖拽锚点 | DOM 事件 | 更新 anchor state |
| `CodeExporter` | 格式化代码片段并复制到剪贴板 | 12 个装饰的 anchor | 剪贴板内容 |
| `State` | 维护 12 个装饰的 anchor 状态，localStorage 持久化 | — | 内存 + localStorage |

### 3.3 数据流

```
PNG 加载 → Image 对象
    ↓
用户点击缩略图 → 更新 currentName
    ↓
DecoCanvas 渲染：drawImage + drawGrid + drawCenter + drawAnchor
    ↓
用户拖拽锚点 → AnchorDrag 监听 → 更新 state[name].anchor
    ↓
requestAnimationFrame 重绘 Canvas
    ↓
[全部复制] 触发 → CodeExporter 遍历 state → 拼接代码 → 剪贴板
```

## 4. 详细设计

### 4.1 状态结构

```javascript
const state = {
  current: 'cat-ear',  // 当前选中装饰名
  anchors: {            // 12 个装饰的 anchor
    'cat-ear':          { x: 0.5, y: 0.5 },
    'cloud-bolt':       { x: 0.5, y: 0.5 },
    'floating-book':    { x: 0.5, y: 0.5 },
    'vine-bud':         { x: 0.5, y: 0.5 },
    'triple-triangle':  { x: 0.5, y: 0.5 },
    'hex-shard-ring':   { x: 0.5, y: 0.5 },
    'triple-blade':     { x: 0.609, y: 0.594 },  // 已由 Python 诊断得到
    'palette-brush':    { x: 0.5, y: 0.5 },
    'air-field':        { x: 0.5, y: 0.5 },
    'moon-halo':        { x: 0.5, y: 0.5 },
    'lens-crosshair':   { x: 0.5, y: 0.5 },
    'mood-aura':        { x: 0.5, y: 0.5 },
  },
  showGrid: true,    // 是否显示 8px 网格
  showBBox: false,   // 是否显示 bbox 包围盒
  storageOk: true,   // localStorage 是否可用
}
```

### 4.2 装饰名映射

```javascript
const DECOS = [
  { name: 'cat-ear',        label: '放电猫猫 - 猫耳' },
  { name: 'cloud-bolt',     label: '情绪天气 - 云朵+闪电' },
  { name: 'floating-book',  label: '流体操控 - 漂浮古籍' },
  { name: 'vine-bud',       label: '植物伙伴 - 藤蔓' },
  { name: 'triple-triangle',label: '无限折叠 - 3 个三角形' },
  { name: 'hex-shard-ring', label: '记忆回廊 - 6 边形环' },
  { name: 'triple-blade',   label: '光学斩击 - 3 把刀' },
  { name: 'palette-brush',  label: '画作实体化 - 画板' },
  { name: 'air-field',      label: '空气斥力场 - 双圈虚线' },
  { name: 'moon-halo',      label: '熵寂之触 - 月轮' },
  { name: 'lens-crosshair', label: '预知透镜 - 准星' },
  { name: 'mood-aura',      label: '情绪掌控 - 心境光环' },
];
```

### 4.3 Canvas 渲染

画布尺寸：512×512（PNG 是 256×256，2 倍放大方便看细节）

```javascript
function drawCanvas() {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 512);
  
  // 1. 绘制 PNG（2 倍放大）
  ctx.drawImage(images[currentName], 0, 0, 512, 512);
  
  // 2. 绘制 8px 网格
  if (state.showGrid) {
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    for (let i = 0; i <= 512; i += 32) {  // 8px × 2 倍
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
    }
  }
  
  // 3. 绘制图像中心（蓝十字）
  ctx.strokeStyle = 'rgba(0,100,255,0.8)';
  ctx.lineWidth = 2;
  drawCross(ctx, 256, 256, 16);
  
  // 4. 绘制 bbox（半透明绿线）
  if (state.showBBox) {
    const bbox = computeBBox(images[currentName]);
    ctx.strokeStyle = 'rgba(0,200,0,0.6)';
    ctx.strokeRect(bbox.x * 2, bbox.y * 2, bbox.w * 2, bbox.h * 2);
  }
  
  // 5. 绘制锚点（红十字 + 红圆点）
  const a = state.anchors[currentName];
  const ax = a.x * 512;
  const ay = a.y * 512;
  ctx.strokeStyle = 'rgba(255,0,0,0.9)';
  ctx.lineWidth = 3;
  drawCross(ctx, ax, ay, 14);
  ctx.fillStyle = 'rgba(255,0,0,1)';
  ctx.beginPath(); ctx.arc(ax, ay, 4, 0, Math.PI*2); ctx.fill();
}
```

### 4.4 拖拽交互

```javascript
let dragging = false;

canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const px = (e.clientX - rect.left) / rect.width;  // 归一化
  const py = (e.clientY - rect.top) / rect.height;
  
  // 检查是否点中锚点附近（容差 0.05）
  const a = state.anchors[currentName];
  if (Math.abs(px - a.x) < 0.05 && Math.abs(py - a.y) < 0.05) {
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const rect = canvas.getBoundingClientRect();
  let nx = (e.clientX - rect.left) / rect.width;
  let ny = (e.clientY - rect.top) / rect.height;
  nx = Math.max(0, Math.min(1, nx));
  ny = Math.max(0, Math.min(1, ny));
  state.anchors[currentName] = { x: nx, y: ny };
  saveState();
  requestAnimationFrame(drawCanvas);
  updateInfoBar();
});

canvas.addEventListener('pointerup', () => { dragging = false; });
```

键盘快捷键：
- `←/→/↑/↓`：移动当前装饰锚点 ±0.005
- `Shift+方向键`：±0.01
- `Esc`：取消拖拽（实际拖拽中无效，仅初始状态）
- `R`：重置当前装饰

### 4.5 全部复制代码

```javascript
function copyAll() {
  const lines = [];
  for (const d of DECOS) {
    const a = state.anchors[d.name];
    lines.push(`/** ${d.label} */`);
    lines.push(`this.sprite.anchor.set(${a.x.toFixed(3)}, ${a.y.toFixed(3)});`);
  }
  const text = lines.join('\n');
  
  // 复制到剪贴板
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => showCopied());
  } else {
    // 降级方案
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showCopied();
  }
}
```

输出示例：
```typescript
/** 放电猫猫 - 猫耳 */
this.sprite.anchor.set(0.500, 0.500);
/** 情绪天气 - 云朵+闪电 */
this.sprite.anchor.set(0.500, 0.500);
// ... 共 12 个
```

### 4.6 localStorage 持久化

```javascript
const STORAGE_KEY = 'decorator-anchors';

function saveState() {
  if (!state.storageOk) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.anchors));
  } catch (e) {
    state.storageOk = false;
    showWarning('localStorage 不可用，调整不会持久化');
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      Object.assign(state.anchors, saved);
    }
  } catch (e) {
    state.storageOk = false;
  }
}
```

### 4.7 PNG 加载

12 个 PNG 通过相对路径加载：
```html
<img src="output/cat-ear.png" crossorigin="anonymous" />
```

注意：因为是 `file://` 协议，跨域限制可能存在。建议用户通过 `python -m http.server` 启动（端口如 8765），访问 `http://localhost:8765/anchor-tool.html`。

工具在文件加载失败时：
- 缩略图位置显示红色占位
- 控制台 `console.error` 详细日志
- 不阻塞其他装饰

## 5. 错误处理

| 场景 | 处理 |
|------|------|
| 单个 PNG 加载失败 | 缩略图红 X + 跳过该装饰 |
| localStorage 不可用 | 降级为内存存储 + 顶部黄色提示 |
| Clipboard API 不可用 | 降级为 execCommand + textarea |
| HTTP 协议 | 全部功能正常工作 |
| file:// 协议 | PNG 可能因 CORS 失败，提示用户改用 http server |

## 6. 验证

### 6.1 工具自身验证

1. 双击 `anchor-tool.html` 打开（HTTP 协议优先）
2. 默认显示 12 个缩略图
3. 点击 `triple-blade`，右侧大图显示三把刀
4. 拖拽红色锚点，坐标实时变化
5. 调整到合适位置后点 `[全部复制]`
6. 粘贴到记事本，验证格式正确

### 6.2 集成到游戏验证

1. 将复制的代码粘贴到 `WeaponDecorators.ts` 的对应 `onTextureReady` 中
2. 若锚点 = `(0.5, 0.5)`，无需覆盖（基类已默认）
3. 运行 `npm run build`，确认无 TS 错误
4. 启动游戏，检查装饰位置/旋转中心是否正确
5. 若仍有偏差，回到工具微调

## 7. 不在本设计范围

- 实时旋转预览（用户已确认不需要）
- 球参考圆叠加（用户已确认不需要）
- 多套配置切换/保存
- PNG 重新生成

## 8. 后续可清理

工具仅在开发期间使用，项目稳定后可删除：
- `temp/decorators/anchor-tool.html`
- `temp/decorators/diagnose_*.py`（诊断脚本）
- `temp/decorators/raw_v18/`（拆分缓存）
- 保留 `temp/decorators/output/*.png`（最终装饰）和 `process_final.py`（可复用的后处理脚本）

## 9. 风险与限制

- **file:// 协议下 PNG 加载可能失败**：建议用 http server
- **Clipboard API 需要 HTTPS 或 localhost**：localhost 满足，file:// 不满足（需降级）
- **每次调整后需手动复制粘贴**：无自动同步机制
- **12 个装饰逐个调整耗时**：但比反复编辑 + 构建快 10× 以上
