# 角色武器预设色板设计

- **日期**：2026-06-28
- **范围**：12 个角色武器特效渲染器（基础武器与联动角色武器不在范围内）
- **方案**：A — 集中色板配置 + 渲染器接受可选 Palette 参数
- **目标**：让角色武器不再使用头像提取的主题色，改用基于角色 IP 设计的固定 6 色色板

---

## 1. 背景与问题

### 1.1 现状

`CyberFishRenderer.ts:286-288` 中：

```typescript
const themeColor = config.playerId
  ? this.playerRenderers.get(config.playerId)?.getTrailColor()
  : undefined;
```

`PlayerRenderer.getTrailColor()` 返回从头像 URL 提取的主色（`extractColorFromUrl` → `sampleDominantColor` → `vibrantize`）。该色作为 `themeColor` 传入 12 个角色武器渲染器，最终通过 `BaseWeaponEffectRenderer.buildPalette(themeColor)` 派生 6 色调色板。

### 1.2 问题

- **头像主色不可控**：不同玩家头像差异巨大，可能产生与角色 IP 完全不符的配色（如闲乘月本应冰蓝，却可能被红色头像覆盖）
- **算法派生质量不稳定**：`lighten`/`dimColor`/`rotateHue` 算法在某些主色下会产生过曝或浑浊的派生色
- **角色 IP 失真**：每个角色都有明确的视觉主题（如林澈的三心境红蓝绿、梦的琥珀金、陈厌孑的紫黑金），头像色覆盖削弱了角色辨识度

### 1.3 已有基础

12 个渲染器内部已定义大量专属颜色常量（如 `FluidMasteryRenderer` 的 `FLUID_MAIN`/`ANGER_MAIN`/`PARCHMENT_OLD`、`BotanicalPartyRenderer` 的 `PLANT_MAIN` + 三性格色 + `COFFEE_BROWN` 等），但 `buildPalette(themeColor)` 仍以传入的 themeColor 为 primary 派生 6 色，导致这些预设常量仅用于局部细节点缀，主色调仍受头像色支配。

---

## 2. 设计目标

1. **完全脱离头像主题色**：12 个角色武器的 6 色调色板全部来自预设配置
2. **保留渲染器内部特殊色**：如 BotanicalParty 的三性格色、EmotionMastery 的三心境色、EntropicTouch 的牺牲红字等独立常量继续使用
3. **向后兼容**：`trigger*` 方法签名保留 `themeColor?` 可选参数，但优先使用预设色板
4. **集中管理**：所有色板定义在一个文件中，便于全局调整与审查
5. **EffectTestPage 兼容**：测试页面可继续使用 themeColor 参数（回退到 buildPalette），不影响开发调试

---

## 3. 架构设计

### 3.1 数据流

```
┌─────────────────────────────────────────────┐
│  WeaponPalettes.ts（新建）                  │
│  WEAPON_PALETTES: Record<WeaponId, Palette> │
│  └ 12 套预设色板                            │
└────────────┬────────────────────────────────┘
             │ import
             ▼
┌─────────────────────────────────────────────┐
│  CyberFishRenderer.ts（修改）               │
│  - 查询 WEAPON_PALETTES[weaponId]           │
│  - 12 个 case 中改传 palette 给 effectRenderer.trigger* │
│  - 不再查询 playerRenderers.getTrailColor()  │
└────────────┬────────────────────────────────┘
             │ palette 参数
             ▼
┌─────────────────────────────────────────────┐
│  EffectRenderer.ts（修改）                  │
│  - 12 个角色武器 trigger* 方法新增 palette? 参数 │
│  - 转发 palette 给子渲染器                  │
└────────────┬────────────────────────────────┘
             │ palette?
             ▼
┌─────────────────────────────────────────────┐
│  12 个角色武器渲染器（修改）                │
│  - trigger* 方法新增 palette?: Palette 参数 │
│  - 内部 const palette = palette ?? this.buildPalette(themeColor ?? DEFAULT_COLOR); │
│  - buildPalette 保留作为回退                │
│  - 内部特殊色常量（三性格色/三心境色等）继续使用 │
└─────────────────────────────────────────────┘
```

### 3.2 调用契约

子渲染器 `trigger*` 方法签名变更模式：

```typescript
// 修改前
triggerTrail(
  playerId: string, x: number, y: number, radius: number,
  flowDir: number,
  themeColor: number = FLUID_MAIN,
  isAngry: boolean = false,
): void

// 修改后
triggerTrail(
  playerId: string, x: number, y: number, radius: number,
  flowDir: number,
  themeColor: number = FLUID_MAIN,
  isAngry: boolean = false,
  palette?: Palette,              // 新增可选参数
): void
```

内部使用：

```typescript
const pal: Palette = palette ?? this.buildPalette(isAngry ? ANGER_MAIN : themeColor);
```

**优先级**：
1. 显式传入 palette（来自 CyberFishRenderer 查 WEAPON_PALETTES）→ 使用预设色板
2. 未传 palette → 回退 buildPalette(themeColor)（EffectTestPage 等场景仍可用）

---

## 4. 12 套预设色板

所有色值以 0xRRGGBB 整数表示。色板设计依据角色设定文档 + 已有渲染器常量。

### 4.1 OPTICAL_SLASH — Liya 光学斩击

| 字段 | 色值 | 说明 |
|------|------|------|
| primary | `0x0099FF` | 主光蓝（玻璃刀光主体） |
| glow | `0x66CCFF` | 发光浅蓝（刃辉） |
| highlight | `0xAAEEFF` | 高亮冰蓝（刀刃高光） |
| dim | `0x003388` | 暗深蓝（渐变末端） |
| shadow | `0x001A44` | 阴影近黑（边缘暗线） |
| accent | `0xFFD700` | 强调金色（标记色 / 目标已标记） |

### 4.2 AIR_REPULSION_FIELD — 开摆 空气斥力场

| 字段 | 色值 | 说明 |
|------|------|------|
| primary | `0xFFCC44` | 主懒黄（压缩气罩） |
| glow | `0xFFEE88` | 发光浅黄（锚点光） |
| highlight | `0xFFFFCC` | 高亮米白（核心闪光） |
| dim | `0xCC8800` | 暗深黄褐（渐变末端） |
| shadow | `0x664400` | 阴影棕黑（边缘） |
| accent | `0xFF6622` | 强调橙红（爆发泄压 / 燕子同场暗红） |

### 4.3 ENTROPIC_TOUCH — 闲乘月 熵寂之触

| 字段 | 色值 | 说明 |
|------|------|------|
| primary | `0x88DDFF` | 月华冰蓝（主色） |
| glow | `0xAAFFFF` | 发光浅冰蓝（月辉） |
| highlight | `0xFFFFFF` | 高亮纯白（月核） |
| dim | `0x9966FF` | 暗熵寂紫（边缘辉光） |
| shadow | `0x6600CC` | 阴影深紫（渐变末端） |
| accent | `0xFF3333` | 强调红（牺牲率闪烁 / 爆发提示） |

### 4.4 DRAWING_MANIFEST — 白猫 画作实体化

| 字段 | 色值 | 说明 |
|------|------|------|
| primary | `0x8B4D9F` | 主墨紫粉（墨水主色） |
| glow | `0xD4A5DD` | 发光浅紫粉（高光过渡） |
| highlight | `0xF5E1F5` | 高亮淡紫（纸张白偏紫） |
| dim | `0x4A2C5A` | 暗深墨紫（渐变末端） |
| shadow | `0x2A1830` | 阴影近黑（边缘） |
| accent | `0xFFB3D9` | 强调兔子粉（小兔/肌肉兔点缀） |

> 内部保留 `INK_GOLD = 0xD4AF37` 画笔金作为画笔笔触独立常量。

### 4.5 DISCHARGE_CAT — 小金喵 放电猫猫

| 字段 | 色值 | 说明 |
|------|------|------|
| primary | `0x00BBFF` | 主电青（闪电主色） |
| glow | `0x66EEFF` | 发光浅电蓝（高光过渡） |
| highlight | `0xFFFFFF` | 高亮纯白（闪电核心 / 猫瞳） |
| dim | `0x0044AA` | 暗深电蓝（渐变末端） |
| shadow | `0x002255` | 阴影近黑（边缘） |
| accent | `0xFFCC00` | 强调猫金（鬃毛 / 余电扩散） |

### 4.6 PRECOGNITIVE_LENS — 风随 预知透镜

| 字段 | 色值 | 说明 |
|------|------|------|
| primary | `0x4DA6FF` | 主深蓝（猫眼蓝） |
| glow | `0xA0D8FF` | 发光浅蓝（猫灵回响） |
| highlight | `0xFFFFFF` | 高亮纯白（猫瞳中心） |
| dim | `0x1A4480` | 暗深蓝（渐变末端） |
| shadow | `0x0A2244` | 阴影近黑（边缘） |
| accent | `0xFFD700` | 强调金（6 层已看透轨迹金） |

### 4.7 EMOTIONAL_WEATHER — Carzeye 情绪天气

| 字段 | 色值 | 说明 |
|------|------|------|
| primary | `0xAAEEFF` | 主晴空蓝（前 30s） |
| glow | `0xFFFFFF` | 发光白（落雷核心） |
| highlight | `0xE0F7FF` | 高亮冰白（闪电分支） |
| dim | `0x4DA6FF` | 暗中蓝（渐变末端） |
| shadow | `0x223355` | 阴影暗蓝（60s 后背景） |
| accent | `0xFF8800` | 强调烦躁橙（30-60s 落雷色） |

> 时间段切换由渲染器内部逻辑处理（前 30s 用 primary、30-60s 用 accent、60s 后用 shadow），整体色板提供三段色源。

### 4.8 EMOTION_MASTERY — 林澈 情绪掌控

| 字段 | 色值 | 说明 |
|------|------|------|
| primary | `0xFF3333` | 主愤怒红（默认心境） |
| glow | `0xFF7777` | 发光浅红（恶魔实体） |
| highlight | `0xFFBBBB` | 高亮粉红（情绪高光） |
| dim | `0x992222` | 暗深红（渐变末端） |
| shadow | `0x440000` | 阴影近黑（边缘） |
| accent | `0x4488FF` | 强调幸福蓝（BLISS 心境切换色） |

> 内部保留 `MOOD_COLORS = { anger: 0xFF3333, bliss: 0x4488FF, happy: 0x44DD44 }` 三心境独立常量，accent 作为切换提示色。

### 4.9 FLUID_MASTERY — KE 流体操控

| 字段 | 色值 | 说明 |
|------|------|------|
| primary | `0x0099FF` | 主水蓝（水流主色） |
| glow | `0x66CCFF` | 发光浅蓝（水花高光） |
| highlight | `0xAAEEFF` | 高亮冰蓝（水龙卷核心） |
| dim | `0x0044AA` | 暗深蓝（渐变末端） |
| shadow | `0x002255` | 阴影近黑（边缘） |
| accent | `0xCC2200` | 强调血红（isAngry 怒态切换） |

> 内部保留 `PARCHMENT_OLD`、`INK_BLACK`、`SCROLL_GOLD` 书页独立常量。

### 4.10 MEMORY_CORRIDOR — 梦 记忆回廊

| 字段 | 色值 | 说明 |
|------|------|------|
| primary | `0xC9A961` | 主琥珀金（千年光晕） |
| glow | `0xE0D4A0` | 发光浅琥珀（涟漪扩散） |
| highlight | `0xF5EFDC` | 高亮米金（书页高光） |
| dim | `0x8B7340` | 暗深金（渐变末端） |
| shadow | `0x4A3A20` | 阴影棕黑（边缘） |
| accent | `0x6633CC` | 强调深紫（记忆碎片共振色） |

### 4.11 INFINITE_FOLD — 陈厌孑 无限折叠

| 字段 | 色值 | 说明 |
|------|------|------|
| primary | `0x6633CC` | 主空间紫（维度色） |
| glow | `0x9966FF` | 发光浅紫（折叠辉光） |
| highlight | `0xCC99FF` | 高亮淡紫（裂缝高光） |
| dim | `0x1A1A2E` | 暗黑蓝（折叠暗面） |
| shadow | `0x000000` | 阴影纯黑（空间裂缝） |
| accent | `0xFFD700` | 强调金（重组能量 / LV5 爆发） |

### 4.12 BOTANICAL_CONTROL — 沐里 植物伙伴派对

| 字段 | 色值 | 说明 |
|------|------|------|
| primary | `0x44AA22` | 主草绿（植物主色） |
| glow | `0x88DD44` | 发光浅嫩绿（兴奋态） |
| highlight | `0xBBFF88` | 高亮浅绿（高光） |
| dim | `0x1A3A0A` | 暗深绿黑（渐变末端） |
| shadow | `0x0A1F05` | 阴影近黑（边缘） |
| accent | `0xFFB3D9` | 强调温柔粉（默认性格点缀色） |

> 内部保留 `PERSONALITY_GENTLE = 0xFFB3D9`、`PERSONALITY_FIERCE = 0xFF4422`、`PERSONALITY_CURIOUS = 0x66DDFF` 三性格色 + `COFFEE_BROWN` 枯萎色独立常量。

---

## 5. 实施范围

### 5.1 修改文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `renderer/entities/WeaponPalettes.ts` | 新建 | 12 套 Palette 定义 + 导出 WEAPON_PALETTES 映射 |
| `renderer/CyberFishRenderer.ts` | 修改 | 12 个 case 中查询 WEAPON_PALETTES 并传 palette 参数 |
| `renderer/entities/EffectRenderer.ts` | 修改 | 12 个角色武器 trigger* 方法新增 palette? 参数并转发 |
| `renderer/entities/OpticalSlashEffectRenderer.ts` | 修改 | triggerSlash / triggerBurst 新增 palette? 参数 |
| `renderer/entities/AirRepulsionFieldRenderer.ts` | 修改 | triggerAnchor / triggerBurst 新增 palette? 参数 |
| `renderer/entities/EntropicTouchRenderer.ts` | 修改 | triggerAura / triggerFrostbite / triggerBurst 新增 palette? 参数 |
| `renderer/entities/DrawingManifestRenderer.ts` | 修改 | updateRabbit / triggerBurst / triggerDash 新增 palette? 参数 |
| `renderer/entities/DischargeCatRenderer.ts` | 修改 | updateCat / triggerArc / triggerBurst 新增 palette? 参数 |
| `renderer/entities/PrecognitiveLensRenderer.ts` | 修改 | updateForesight / triggerBurst 新增 palette? 参数 |
| `renderer/entities/EmotionalWeatherRenderer.ts` | 修改 | triggerLightning / triggerHail / triggerBurst 新增 palette? 参数 |
| `renderer/entities/EmotionMasteryRenderer.ts` | 修改 | updateMood / triggerBurst 新增 palette? 参数 |
| `renderer/entities/FluidMasteryRenderer.ts` | 修改 | triggerTrail / triggerVortex / triggerBurst 新增 palette? 参数 |
| `renderer/entities/MemoryCorridorRenderer.ts` | 修改 | triggerEcho / triggerResonance / triggerBurst 新增 palette? 参数 |
| `renderer/entities/InfiniteFoldRenderer.ts` | 修改 | triggerDodge / triggerReassemble / triggerBurst 新增 palette? 参数 |
| `renderer/entities/BotanicalPartyRenderer.ts` | 修改 | triggerPlantSpawn / triggerBurst 新增 palette? 参数 |

总计：1 新建 + 14 修改 = 15 个文件。

### 5.2 不变项

- `BaseWeaponEffectRenderer.buildPalette(themeColor)` 保留作为回退实现
- `PlayerRenderer.getTrailColor()` / `extractColorFromUrl()` / `trailColor` 字段保留（玩家球体拖尾仍用头像色，仅武器特效不再用）
- `WeaponRangeConfig.ts` 不变
- 9 个基础武器渲染器（NanoRipper / SizeWarp / PursuitProtocol / GravityWell / EntropyDiffuser / BastionBuilder / CircuitWeaver / QuantumRift / RicochetCore）不在范围内
- `ShockwaveEffectRenderer` / `FirewallEffectRenderer` / `HiveEffectRenderer` / `GlobalEffectRenderer` 不变
- 后端武器逻辑不变

---

## 6. 验证标准

| 验证项 | 方法 | 通过标准 |
|--------|------|---------|
| 编译通过 | `cd game/frontend && npx vite build` | 无错误 |
| 头像色隔离 | 修改头像 URL 后触发任意角色武器 | 特效颜色不变 |
| 预设色板生效 | EffectTestPage 触发 12 个角色武器 | 各武器颜色与设计文档一致 |
| 向后兼容 | EffectTestPage 传 themeColor 仍工作 | 不报错，回退到 buildPalette |
| 性能 | 12 个角色武器同时活跃 | ≥ 30fps |
| 性格色保留 | BotanicalParty 触发不同性格植物 | 三性格色（粉/红/青）仍可见 |
| 心境色保留 | EmotionMastery 切换心境 | 三心境色（红/蓝/绿）仍可见 |
| isAngry 切换 | FluidMastery 低血量触发 | 怒态红色切换仍可见 |

---

## 7. 边界与风险

### 7.1 边界

- 本设计仅覆盖「角色武器」（12 个）。「基础武器」（9 个）继续使用头像主题色，因为基础武器无角色 IP 绑定，头像色反而能体现玩家个性
- 渲染器内部独立常量（性格色/心境色/书页色等）不在 Palette 6 色中重复定义，保持单一职责

### 7.2 风险

- **风险 A：palette 参数穿透链较长**（CyberFishRenderer → EffectRenderer → 子渲染器）
  - 缓解：仅在 12 个角色武器 case 中传 palette，基础武器 case 不传
- **风险 B：EffectTestPage 失去预设色板展示能力**
  - 缓解：EffectTestPage 可选传 themeColor 触发回退路径；后续可在 effectRegistry 中为角色武器默认填充 WEAPON_PALETTES[weaponId]
- **风险 C：内部独立常量与 Palette 冲突**
  - 缓解：渲染器内部使用 palette.{field} 替换原 buildPalette 派生色，独立常量（如 MOOD_COLORS）保持原引用不变

---

## 8. 参考文件

- 角色设定文档：`游戏设计文档/分角色联动文档/*.md`（12 个）
- 渲染器现有色板常量：`renderer/entities/*.ts` 文件顶部
- Palette 接口定义：`renderer/entities/BaseWeaponEffectRenderer.ts:22-29`
- 当前 themeColor 流转：`renderer/CyberFishRenderer.ts:286-288`
