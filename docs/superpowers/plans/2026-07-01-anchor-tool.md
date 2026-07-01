# 装饰锚点调整工具 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建一个零依赖的本地网页工具，让用户拖拽调整 12 个武器装饰 PNG 的 sprite 锚点，并一键复制 TypeScript 代码到剪贴板。

**Architecture:** 单文件 HTML（HTML+CSS+JS 全部内联）。Canvas 2D 渲染大图，PointerEvent 实现拖拽，localStorage 持久化 12 个装饰的 anchor 状态，Clipboard API + 降级方案实现复制。

**Tech Stack:** HTML5 Canvas 2D, 原生 ES2017+ JavaScript, localStorage, Clipboard API, Python (用于本地 http server 启动)

---

## 文件清单

| 文件 | 类型 | 职责 |
|------|------|------|
| `temp/decorators/anchor-tool.html` | 新增 | 单文件工具（HTML+CSS+JS 全部内联） |
| `docs/superpowers/plans/2026-07-01-anchor-tool.md` | 新增 | 本计划文件 |
| `game/frontend/src/components/fish-oil-battle/renderer/entities/decorators/WeaponDecorators.ts` | 修改 | 粘贴工具生成的 anchor 代码到对应 `onTextureReady` |

---

## Task 1: 工具骨架与样式

**Files:**
- Create: `temp/decorators/anchor-tool.html`

- [ ] **Step 1: 创建 HTML 骨架**

在 `temp/decorators/anchor-tool.html` 中创建基本结构：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>装饰锚点调整工具</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #1e1e2e; color: #cdd6f4; padding: 16px; }
    h1 { font-size: 18px; margin-bottom: 12px; }
    .toolbar { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;
               align-items: center; padding: 8px; background: #313244; border-radius: 6px; }
    .toolbar button { padding: 6px 12px; background: #89b4fa; color: #1e1e2e;
                      border: none; border-radius: 4px; cursor: pointer; font-weight: 600; }
    .toolbar button:hover { background: #b4befe; }
    .toolbar button:disabled { background: #45475a; color: #6c7086; cursor: not-allowed; }
    .toolbar label { display: flex; align-items: center; gap: 4px; font-size: 13px; }
    .container { display: grid; grid-template-columns: 280px 1fr; gap: 16px; }
    .grid-panel { background: #313244; border-radius: 6px; padding: 12px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .grid-item { aspect-ratio: 1; background: #1e1e2e; border: 2px solid transparent;
                 border-radius: 4px; cursor: pointer; overflow: hidden; position: relative; }
    .grid-item img { width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated; }
    .grid-item.active { border-color: #89b4fa; }
    .grid-item .label { position: absolute; bottom: 0; left: 0; right: 0;
                        background: rgba(0,0,0,0.7); color: #cdd6f4; font-size: 9px;
                        text-align: center; padding: 1px 0; }
    .grid-item .cross { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                        color: #f38ba8; font-size: 10px; pointer-events: none; }
    .canvas-panel { background: #313244; border-radius: 6px; padding: 12px; }
    .canvas-wrap { display: flex; justify-content: center; align-items: center;
                   background: #1e1e2e; border-radius: 4px; padding: 8px; }
    canvas { display: block; cursor: crosshair; image-rendering: pixelated; }
    .info-bar { margin-top: 12px; padding: 12px; background: #1e1e2e;
                border-radius: 4px; display: flex; justify-content: space-between;
                align-items: center; flex-wrap: wrap; gap: 8px; }
    .info-bar .meta { font-size: 13px; }
    .info-bar .meta strong { color: #f9e2af; }
    .info-bar code { background: #45475a; padding: 2px 6px; border-radius: 3px;
                     font-family: 'Consolas', monospace; color: #a6e3a1; }
    .info-bar .actions { display: flex; gap: 6px; }
    .info-bar button { padding: 5px 10px; background: #94e2d5; color: #1e1e2e;
                       border: none; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 12px; }
    .info-bar button.reset { background: #fab387; }
    .warning { background: #f9e2af; color: #1e1e2e; padding: 6px 12px;
               border-radius: 4px; font-size: 12px; margin-bottom: 8px; }
    .copied-toast { position: fixed; top: 20px; right: 20px; background: #a6e3a1;
                    color: #1e1e2e; padding: 8px 16px; border-radius: 4px;
                    font-weight: 600; opacity: 0; transition: opacity 0.2s; pointer-events: none; }
    .copied-toast.show { opacity: 1; }
  </style>
</head>
<body>
  <h1>🎨 装饰锚点调整工具</h1>
  <div id="warning" class="warning" style="display:none"></div>
  <div class="toolbar">
    <button id="btn-copy-all">📋 全部复制</button>
    <button id="btn-reset-all" class="reset">↺ 重置全部</button>
    <span style="width:16px"></span>
    <label><input type="checkbox" id="chk-grid" checked> 显示网格</label>
    <label><input type="checkbox" id="chk-bbox"> 显示 bbox</label>
    <span style="width:16px"></span>
    <button id="btn-import">📂 导入</button>
    <button id="btn-export">💾 导出</button>
    <input type="file" id="file-import" accept=".json" style="display:none">
  </div>
  <div class="container">
    <div class="grid-panel">
      <div id="deco-grid" class="grid"></div>
    </div>
    <div class="canvas-panel">
      <div class="canvas-wrap">
        <canvas id="canvas" width="512" height="512"></canvas>
      </div>
      <div class="info-bar">
        <div class="meta">
          <div id="deco-name">—</div>
          <div>anchor: <code id="anchor-val">set(0.500, 0.500)</code></div>
        </div>
        <div class="actions">
          <button id="btn-reset" class="reset">重置</button>
          <button id="btn-copy-one">📋 复制</button>
        </div>
      </div>
    </div>
  </div>
  <div id="toast" class="copied-toast">✓ 已复制</div>
  <script>
    // 后续 Task 添加
  </script>
</body>
</html>
```

- [ ] **Step 2: 验证骨架可显示**

双击 `temp/decorators/anchor-tool.html` 在浏览器打开，验证：
- 顶部 h1 标题显示
- 工具栏按钮可见
- 左侧网格区域和右侧画布区域布局正确
- 底部信息栏显示占位文本

预期：界面正常显示，网格和画布区域为空（待 Task 2 添加）。

- [ ] **Step 3: 提交**

```bash
cd d:\TraePro\fishoil\tiaoom
git add temp/decorators/anchor-tool.html
git commit -m "feat: 装饰锚点调整工具 HTML 骨架与样式"
```

---

## Task 2: 装饰列表与缩略图

**Files:**
- Modify: `temp/decorators/anchor-tool.html` (在 `<script>` 中添加代码)

- [ ] **Step 1: 添加装饰数据与状态**

在 `<script>` 标签内、`// 后续 Task 添加` 注释处替换为：

```javascript
const DECOS = [
  { name: 'cat-ear',         label: '放电猫猫 - 猫耳' },
  { name: 'cloud-bolt',      label: '情绪天气 - 云朵+闪电' },
  { name: 'floating-book',   label: '流体操控 - 漂浮古籍' },
  { name: 'vine-bud',        label: '植物伙伴 - 藤蔓' },
  { name: 'triple-triangle', label: '无限折叠 - 3 个三角形' },
  { name: 'hex-shard-ring',  label: '记忆回廊 - 6 边形环' },
  { name: 'triple-blade',    label: '光学斩击 - 3 把刀' },
  { name: 'palette-brush',   label: '画作实体化 - 画板' },
  { name: 'air-field',       label: '空气斥力场 - 双圈虚线' },
  { name: 'moon-halo',       label: '熵寂之触 - 月轮' },
  { name: 'lens-crosshair',  label: '预知透镜 - 准星' },
  { name: 'mood-aura',       label: '情绪掌控 - 心境光环' },
];

const state = {
  current: 'cat-ear',
  anchors: Object.fromEntries(DECOS.map(d => [d.name, { x: 0.5, y: 0.5 }])),
  showGrid: true,
  showBBox: false,
  storageOk: true,
};
state.anchors['triple-blade'] = { x: 0.609, y: 0.594 };  // 预设 Python 诊断值

const images = {};  // name -> HTMLImageElement
```

- [ ] **Step 2: 添加 localStorage 持久化**

```javascript
const STORAGE_KEY = 'decorator-anchors-v1';

function saveState() {
  if (!state.storageOk) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.anchors));
  } catch (e) {
    state.storageOk = false;
    document.getElementById('warning').textContent = '⚠ localStorage 不可用，调整不会持久化';
    document.getElementById('warning').style.display = 'block';
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) Object.assign(state.anchors, JSON.parse(raw));
  } catch (e) {
    state.storageOk = false;
  }
}
```

- [ ] **Step 3: 添加缩略图渲染**

```javascript
function renderGrid() {
  const grid = document.getElementById('deco-grid');
  grid.innerHTML = '';
  for (const d of DECOS) {
    const item = document.createElement('div');
    item.className = 'grid-item' + (d.name === state.current ? ' active' : '');
    item.dataset.name = d.name;
    item.innerHTML = `
      <img src="output/${d.name}.png" alt="${d.label}" loading="lazy"
           onerror="this.style.background='#f38ba8'">
      <div class="cross">+</div>
      <div class="label">${d.name}</div>
    `;
    item.addEventListener('click', () => {
      state.current = d.name;
      renderGrid();
      drawCanvas();
      updateInfo();
    });
    grid.appendChild(item);
  }
}
```

- [ ] **Step 4: 预加载所有 PNG**

```javascript
function preloadImages() {
  for (const d of DECOS) {
    const img = new Image();
    img.src = `output/${d.name}.png`;
    img.onload = () => { if (d.name === state.current) drawCanvas(); };
    img.onerror = () => { console.error('PNG 加载失败:', d.name); };
    images[d.name] = img;
  }
}
```

- [ ] **Step 5: 初始化**

```javascript
loadState();
renderGrid();
preloadImages();
```

- [ ] **Step 6: 验证缩略图显示**

在浏览器打开（通过 http server 启动：`cd temp/decorators && python -m http.server 8765`，访问 `http://localhost:8765/anchor-tool.html`），验证：
- 左侧显示 12 个装饰缩略图（4×3 网格）
- 每个缩略图下方有装饰名标签
- 缩略图中央有红色 "+" 标记
- 点击缩略图，蓝色边框切换

预期：12 个缩略图全部加载并显示，PNG 文件路径 `output/{name}.png` 正确。

- [ ] **Step 7: 提交**

```bash
cd d:\TraePro\fishoil\tiaoom
git add temp/decorators/anchor-tool.html
git commit -m "feat: 装饰缩略图网格 + 状态持久化"
```

---

## Task 3: 大图画布与锚点拖拽

**Files:**
- Modify: `temp/decorators/anchor-tool.html` (在 `<script>` 中添加 `drawCanvas`、`AnchorDrag`)

- [ ] **Step 1: 添加 Canvas 渲染**

```javascript
function drawCross(ctx, x, y, len) {
  ctx.beginPath();
  ctx.moveTo(x - len, y); ctx.lineTo(x + len, y);
  ctx.moveTo(x, y - len); ctx.lineTo(x, y + len);
  ctx.stroke();
}

function drawCanvas() {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const W = 512, H = 512;
  ctx.clearRect(0, 0, W, H);

  // 1. PNG
  const img = images[state.current];
  if (img && img.complete) ctx.drawImage(img, 0, 0, W, H);

  // 2. 8px 网格（PNG 256px → 画布 512px，2 倍）
  if (state.showGrid) {
    ctx.strokeStyle = 'rgba(0,0,0,0.10)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= W; i += 16) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(W, i); ctx.stroke();
    }
  }

  // 3. 图像中心（蓝十字）
  ctx.strokeStyle = 'rgba(0,100,255,0.85)';
  ctx.lineWidth = 2;
  drawCross(ctx, W/2, H/2, 14);

  // 4. 锚点（红十字 + 圆点）
  const a = state.anchors[state.current];
  const ax = a.x * W;
  const ay = a.y * H;
  ctx.strokeStyle = 'rgba(255,0,0,0.95)';
  ctx.lineWidth = 3;
  drawCross(ctx, ax, ay, 14);
  ctx.fillStyle = '#f38ba8';
  ctx.beginPath(); ctx.arc(ax, ay, 5, 0, Math.PI*2); ctx.fill();
}
```

- [ ] **Step 2: 添加拖拽事件处理**

```javascript
let dragging = false;

function setupDrag() {
  const canvas = document.getElementById('canvas');
  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const a = state.anchors[state.current];
    // 容差 0.05（= 25px @512）
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
    state.anchors[state.current] = { x: nx, y: ny };
    saveState();
    requestAnimationFrame(() => { drawCanvas(); updateInfo(); });
  });
  const stopDrag = () => { dragging = false; };
  canvas.addEventListener('pointerup', stopDrag);
  canvas.addEventListener('pointercancel', stopDrag);
  canvas.addEventListener('pointerleave', stopDrag);
}
```

- [ ] **Step 3: 添加键盘快捷键**

```javascript
function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    const step = e.shiftKey ? 0.01 : 0.005;
    const a = state.anchors[state.current];
    let changed = false;
    if (e.key === 'ArrowLeft')  { a.x = Math.max(0, a.x - step); changed = true; }
    if (e.key === 'ArrowRight') { a.x = Math.min(1, a.x + step); changed = true; }
    if (e.key === 'ArrowUp')    { a.y = Math.max(0, a.y - step); changed = true; }
    if (e.key === 'ArrowDown')  { a.y = Math.min(1, a.y + step); changed = true; }
    if (e.key === 'r' || e.key === 'R') {
      state.anchors[state.current] = { x: 0.5, y: 0.5 };
      changed = true;
    }
    if (changed) {
      e.preventDefault();
      saveState();
      drawCanvas();
      updateInfo();
    }
  });
}
```

- [ ] **Step 4: 添加工具栏事件**

```javascript
function setupToolbar() {
  document.getElementById('btn-reset').addEventListener('click', () => {
    state.anchors[state.current] = { x: 0.5, y: 0.5 };
    saveState();
    drawCanvas();
    updateInfo();
  });
  document.getElementById('btn-reset-all').addEventListener('click', () => {
    if (!confirm('重置所有 12 个装饰的 anchor 到 (0.5, 0.5)？')) return;
    for (const d of DECOS) state.anchors[d.name] = { x: 0.5, y: 0.5 };
    saveState();
    drawCanvas();
    updateInfo();
  });
  document.getElementById('chk-grid').addEventListener('change', (e) => {
    state.showGrid = e.target.checked;
    drawCanvas();
  });
  document.getElementById('chk-bbox').addEventListener('change', (e) => {
    state.showBBox = e.target.checked;
    drawCanvas();
  });
}
```

- [ ] **Step 5: 在初始化中调用**

```javascript
loadState();
renderGrid();
preloadImages();
setupDrag();
setupKeyboard();
setupToolbar();
```

- [ ] **Step 6: 验证拖拽功能**

1. 启动 http server，访问 `http://localhost:8765/anchor-tool.html`
2. 右侧大图应显示当前装饰（默认 cat-ear）
3. 红色锚点显示在 (256, 256) 位置
4. 蓝色十字显示在图像中心
5. 鼠标按住红色锚点拖动，坐标实时变化
6. 释放后刷新页面，anchor 位置保留
7. 方向键微调，Shift+方向键粗调
8. 点击 `[重置]`，当前装饰回到 (0.5, 0.5)
9. 点击 `[重置全部]`，所有装饰回到 (0.5, 0.5)

预期：拖拽流畅，坐标实时更新，刷新后保留状态。

- [ ] **Step 7: 提交**

```bash
cd d:\TraePro\fishoil\tiaoom
git add temp/decorators/anchor-tool.html
git commit -m "feat: 大图画布渲染 + 锚点拖拽 + 键盘快捷键"
```

---

## Task 4: 信息栏 + 复制功能

**Files:**
- Modify: `temp/decorators/anchor-tool.html` (添加 `updateInfo`、`copyAnchor`、`copyAll`、`exportJSON`、`importJSON`)

- [ ] **Step 1: 添加信息栏更新**

```javascript
function updateInfo() {
  const d = DECOS.find(x => x.name === state.current);
  document.getElementById('deco-name').textContent = d ? d.label : state.current;
  const a = state.anchors[state.current];
  document.getElementById('anchor-val').textContent =
    `set(${a.x.toFixed(3)}, ${a.y.toFixed(3)})`;
}
```

- [ ] **Step 2: 添加复制功能（含降级方案）**

```javascript
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error('execCommand 失败'));
    } catch (e) { reject(e); }
  });
}

function formatAnchor(name) {
  const d = DECOS.find(x => x.name === name);
  const a = state.anchors[name];
  return `/** ${d ? d.label : name} */\nthis.sprite.anchor.set(${a.x.toFixed(3)}, ${a.y.toFixed(3)});`;
}

function copyCurrent() {
  copyToClipboard(formatAnchor(state.current))
    .then(() => showToast('✓ 已复制'))
    .catch(() => showToast('❌ 复制失败'));
}

function copyAll() {
  const text = DECOS.map(d => formatAnchor(d.name)).join('\n');
  copyToClipboard(text)
    .then(() => showToast(`✓ 已复制 ${DECOS.length} 项`))
    .catch(() => showToast('❌ 复制失败'));
}
```

- [ ] **Step 3: 添加工具栏按钮事件 + JSON 导入导出**

```javascript
function setupCopyButtons() {
  document.getElementById('btn-copy-one').addEventListener('click', copyCurrent);
  document.getElementById('btn-copy-all').addEventListener('click', copyAll);
}

function exportJSON() {
  const data = { version: 1, anchors: state.anchors };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'anchors.json'; a.click();
  URL.revokeObjectURL(url);
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.anchors) Object.assign(state.anchors, data.anchors);
      saveState();
      drawCanvas();
      updateInfo();
      showToast('✓ 已导入');
    } catch (err) {
      showToast('❌ JSON 解析失败');
    }
  };
  reader.readAsText(file);
}

function setupImportExport() {
  document.getElementById('btn-export').addEventListener('click', exportJSON);
  const fileInput = document.getElementById('file-import');
  document.getElementById('btn-import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) importJSON(e.target.files[0]);
    e.target.value = '';
  });
}
```

- [ ] **Step 4: 在初始化中调用**

```javascript
loadState();
renderGrid();
preloadImages();
setupDrag();
setupKeyboard();
setupToolbar();
setupCopyButtons();
setupImportExport();
updateInfo();
```

- [ ] **Step 5: 验证复制功能**

1. 调整几个装饰的 anchor
2. 点击 `[📋 复制]`（复制当前）
3. 粘贴到记事本，验证格式：`/** 装饰名 */\nthis.sprite.anchor.set(0.500, 0.500);`
4. 点击 `[📋 全部复制]`
5. 粘贴到记事本，验证 12 个装饰的代码片段，格式正确
6. 点击 `[💾 导出]`，下载 `anchors.json`
7. 验证 JSON 内容包含 12 个 anchor 项

预期：复制功能工作，剪贴板内容格式正确，导入/导出 JSON 工作。

- [ ] **Step 6: 提交**

```bash
cd d:\TraePro\fishoil\tiaoom
git add temp/decorators/anchor-tool.html
git commit -m "feat: 信息栏 + 全部复制 + 导入导出 JSON"
```

---

## Task 5: 端到端验证

**Files:** 无新增/修改

- [ ] **Step 1: 启动 http server**

```bash
cd d:\TraePro\fishoil\tiaoom\temp\decorators
python -m http.server 8765
```

- [ ] **Step 2: 在浏览器中验证**

访问 `http://localhost:8765/anchor-tool.html`，验证：

| 验证项 | 预期 |
|--------|------|
| 12 个缩略图加载 | 全部显示，无 404 |
| 点击 `triple-blade` 缩略图 | 大图显示三把刀 |
| 拖拽锚点到 (0.609, 0.594) | 红色十字停在三把刀汇合点附近 |
| 信息栏坐标 | `set(0.609, 0.594)` |
| 点击 `[全部复制]` | Toast 显示 "✓ 已复制 12 项" |
| 粘贴到记事本 | 12 个代码片段，格式正确 |
| 刷新页面 | 锚点位置保留（localStorage） |
| 点击 `[重置全部]` 确认 | 所有锚点回到中心 |
| 点击 `[导出]` | 下载 `anchors.json` |
| 方向键微调 | 坐标 ±0.005 变化 |
| Shift+方向键 | 坐标 ±0.01 变化 |
| R 键 | 当前装饰回到 (0.5, 0.5) |
| 显示/隐藏网格 | 8px 网格切换 |
| 显示/隐藏 bbox | （可选，bbox 计算可在后续 task 完善） |

- [ ] **Step 3: 停止 http server**

任务完成后停止 `python -m http.server` 进程。

- [ ] **Step 4: 提交（如有调整）**

若无调整可跳过；如有调整则：

```bash
cd d:\TraePro\fishoil\tiaoom
git add temp/decorators/anchor-tool.html
git commit -m "fix: 端到端测试中发现的问题"
```

---

## Task 6: 集成到游戏代码

**Files:**
- Modify: `game/frontend/src/components/fish-oil-battle/renderer/entities/decorators/WeaponDecorators.ts`

- [ ] **Step 1: 调整锚点**

使用 `temp/decorators/anchor-tool.html` 调整 12 个装饰的 anchor 值，调整到满意为止。

- [ ] **Step 2: 复制全部代码**

点击工具的 `[全部复制]` 按钮，复制 12 个代码片段。

- [ ] **Step 3: 粘贴到 WeaponDecorators.ts**

对于每个非默认 anchor（≠ 0.5, 0.5）的装饰，在对应类的 `onTextureReady` 中粘贴代码。`SpriteDecorator` 基类默认 anchor = (0.5, 0.5)，只有需要调整的子类才需要覆盖。

例如 triple-blade（已预设 anchor (0.609, 0.594)）：

```typescript
protected onTextureReady(tex: PIXI.Texture): void {
  super.onTextureReady(tex);
  if (this.sprite) {
    this.sprite.anchor.set(0.609, 0.594);
  }
}
```

- [ ] **Step 4: 运行构建验证**

```bash
cd d:\TraePro\fishoil\tiaoom\game\frontend
npm run build 2>&1 | Select-Object -Last 10
```

预期：构建成功（exit code 0），无 TypeScript 错误。

- [ ] **Step 5: 启动游戏验证**

启动游戏（npm run dev 或其他方式），进入战斗，检查：
- 旋转类装饰的旋转中心对齐球心
- 静态装饰的 y 位置合适
- 视觉上没有明显偏移

预期：12 个装饰位置/旋转中心正确。

- [ ] **Step 6: 提交**

```bash
cd d:\TraePro\fishoil\tiaoom
git add game/frontend/src/components/fish-oil-battle/renderer/entities/decorators/WeaponDecorators.ts
git commit -m "fix: 应用工具调整的 12 个装饰 anchor 值"
```

---

## 验收标准

1. ✅ 工具可在 `http://localhost:8765/anchor-tool.html` 访问
2. ✅ 12 个装饰缩略图全部显示
3. ✅ 拖拽锚点实时更新坐标
4. ✅ localStorage 持久化生效
5. ✅ 全部复制输出 12 个正确格式的代码片段
6. ✅ 导入/导出 JSON 正常工作
7. ✅ 键盘快捷键工作
8. ✅ 应用到游戏代码后，构建通过 + 视觉无偏移

## 风险与限制

- **file:// 协议可能 CORS 失败**：必须用 http server
- **Clipboard API 需要 localhost 或 HTTPS**：localhost 满足
- **bbox 显示功能可能未完整实现**：可在后续迭代
- **工具仅供开发期间使用**：项目稳定后可删除

## 后续清理

工具使用完成后可删除：
- `temp/decorators/anchor-tool.html`
- `temp/decorators/diagnose_*.py`（诊断脚本）
- `temp/decorators/raw_v18/`（拆分缓存）

保留：
- `temp/decorators/output/*.png`（最终装饰）
- `temp/decorators/process_final.py`（可复用后处理）
- `temp/decorators/grid_v7.png`（源图）
- `temp/decorators/make_preview.py`（预览生成）
