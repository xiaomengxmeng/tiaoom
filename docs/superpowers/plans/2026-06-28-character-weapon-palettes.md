# 角色武器预设色板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 12 个角色武器特效不再使用头像提取的 themeColor，改用基于角色 IP 设计的固定 6 色色板（Palette 接口）。

**Architecture:** 新建 `WeaponPalettes.ts` 集中定义 `WEAPON_PALETTES: Record<WeaponId, Palette>` 映射；CyberFishRenderer 在 12 个角色武器 case 中查询映射并传 `palette` 参数；EffectRenderer 在 12 个 trigger* 方法中转发 palette；12 个子渲染器 trigger* 方法新增 `palette?: Palette` 可选参数，内部 `palette ?? this.buildPalette(themeColor)` 优先用预设色板。`buildPalette` 保留作为回退。

**Tech Stack:** TypeScript 5.x, PixiJS v8, Vue 3, Palette 接口（6 色：primary/glow/highlight/dim/shadow/accent）

**设计文档:** `docs/superpowers/specs/2026-06-28-character-weapon-palettes-design.md`

---

## File Structure

**新建：**
- `game/frontend/src/components/fish-oil-battle/renderer/entities/WeaponPalettes.ts` — 12 套 Palette 集中定义

**修改（15 个文件）：**
- `game/frontend/src/components/fish-oil-battle/renderer/CyberFishRenderer.ts` — 12 个 case 传 palette 参数
- `game/frontend/src/components/fish-oil-battle/renderer/entities/EffectRenderer.ts` — 12 个 trigger* 方法新增 palette? 参数
- 12 个子渲染器：
  - `OpticalSlashEffectRenderer.ts` — triggerSlash / triggerBurst
  - `AirRepulsionFieldRenderer.ts` — triggerAnchor / triggerBurst
  - `EntropicTouchRenderer.ts` — triggerAura / triggerFrostbite / triggerBurst
  - `DrawingManifestRenderer.ts` — updateRabbit / triggerBurst / triggerDash
  - `DischargeCatRenderer.ts` — updateCat / triggerArc / triggerBurst
  - `PrecognitiveLensRenderer.ts` — updateForesight / triggerEcho / triggerBurst
  - `EmotionalWeatherRenderer.ts` — triggerLightning / triggerHail / triggerBurst
  - `EmotionMasteryRenderer.ts` — updateMood / triggerBurst
  - `FluidMasteryRenderer.ts` — triggerTrail / triggerVortex / triggerBurst
  - `MemoryCorridorRenderer.ts` — triggerEcho / triggerResonance / triggerBurst
  - `InfiniteFoldRenderer.ts` — triggerDodge / triggerReassemble / triggerBurst
  - `BotanicalPartyRenderer.ts` — triggerPlantSpawn / triggerBurst

**Palette 接口（已存在于 BaseWeaponEffectRenderer.ts:22-29）：**
```typescript
export interface Palette {
  primary: number;     // 主色
  glow: number;       // 发光色
  highlight: number;   // 高亮色
  dim: number;         // 暗色
  shadow: number;      // 阴影色
  accent: number;      // 强调色
}
```

---

## Task 1: 创建 WeaponPalettes.ts 色板配置文件

**Files:**
- Create: `game/frontend/src/components/fish-oil-battle/renderer/entities/WeaponPalettes.ts`

- [ ] **Step 1: 创建 WeaponPalettes.ts 文件，定义 12 套 Palette**

文件完整内容：

```typescript
/**
 * 角色武器预设色板
 * - 12 个角色武器各 1 套 6 色 Palette
 * - 完全脱离头像 themeColor，由 CyberFishRenderer 查表传入子渲染器
 * - 设计依据：游戏设计文档/分角色联动文档/*.md + 各渲染器已有颜色常量
 * - 色值格式：0xRRGGBB
 */
import { WeaponId } from '$/backend/src/games/fish-oil-battle/config/GameEnums';
import type { Palette } from './BaseWeaponEffectRenderer';

export const WEAPON_PALETTES: Partial<Record<WeaponId, Palette>> = {
  // ── 1. OPTICAL_SLASH — Liya 光学斩击 ──
  [WeaponId.OPTICAL_SLASH]: {
    primary: 0x0099FF,
    glow: 0x66CCFF,
    highlight: 0xAAEEFF,
    dim: 0x003388,
    shadow: 0x001A44,
    accent: 0xFFD700,
  },

  // ── 2. AIR_REPULSION_FIELD — 开摆 空气斥力场 ──
  [WeaponId.AIR_REPULSION_FIELD]: {
    primary: 0xFFCC44,
    glow: 0xFFEE88,
    highlight: 0xFFFFCC,
    dim: 0xCC8800,
    shadow: 0x664400,
    accent: 0xFF6622,
  },

  // ── 3. ENTROPIC_TOUCH — 闲乘月 熵寂之触 ──
  [WeaponId.ENTROPIC_TOUCH]: {
    primary: 0x88DDFF,
    glow: 0xAAFFFF,
    highlight: 0xFFFFFF,
    dim: 0x9966FF,
    shadow: 0x6600CC,
    accent: 0xFF3333,
  },

  // ── 4. DRAWING_MANIFEST — 白猫 画作实体化 ──
  [WeaponId.DRAWING_MANIFEST]: {
    primary: 0x8B4D9F,
    glow: 0xD4A5DD,
    highlight: 0xF5E1F5,
    dim: 0x4A2C5A,
    shadow: 0x2A1830,
    accent: 0xFFB3D9,
  },

  // ── 5. DISCHARGE_CAT — 小金喵 放电猫猫 ──
  [WeaponId.DISCHARGE_CAT]: {
    primary: 0x00BBFF,
    glow: 0x66EEFF,
    highlight: 0xFFFFFF,
    dim: 0x0044AA,
    shadow: 0x002255,
    accent: 0xFFCC00,
  },

  // ── 6. PRECOGNITIVE_LENS — 风随 预知透镜 ──
  [WeaponId.PRECOGNITIVE_LENS]: {
    primary: 0x4DA6FF,
    glow: 0xA0D8FF,
    highlight: 0xFFFFFF,
    dim: 0x1A4480,
    shadow: 0x0A2244,
    accent: 0xFFD700,
  },

  // ── 7. EMOTIONAL_WEATHER — Carzeye 情绪天气 ──
  [WeaponId.EMOTIONAL_WEATHER]: {
    primary: 0xAAEEFF,
    glow: 0xFFFFFF,
    highlight: 0xE0F7FF,
    dim: 0x4DA6FF,
    shadow: 0x223355,
    accent: 0xFF8800,
  },

  // ── 8. EMOTION_MASTERY — 林澈 情绪掌控 ──
  [WeaponId.EMOTION_MASTERY]: {
    primary: 0xFF3333,
    glow: 0xFF7777,
    highlight: 0xFFBBBB,
    dim: 0x992222,
    shadow: 0x440000,
    accent: 0x4488FF,
  },

  // ── 9. FLUID_MASTERY — KE 流体操控 ──
  [WeaponId.FLUID_MASTERY]: {
    primary: 0x0099FF,
    glow: 0x66CCFF,
    highlight: 0xAAEEFF,
    dim: 0x0044AA,
    shadow: 0x002255,
    accent: 0xCC2200,
  },

  // ── 10. MEMORY_CORRIDOR — 梦 记忆回廊 ──
  [WeaponId.MEMORY_CORRIDOR]: {
    primary: 0xC9A961,
    glow: 0xE0D4A0,
    highlight: 0xF5EFDC,
    dim: 0x8B7340,
    shadow: 0x4A3A20,
    accent: 0x6633CC,
  },

  // ── 11. INFINITE_FOLD — 陈厌孑 无限折叠 ──
  [WeaponId.INFINITE_FOLD]: {
    primary: 0x6633CC,
    glow: 0x9966FF,
    highlight: 0xCC99FF,
    dim: 0x1A1A2E,
    shadow: 0x000000,
    accent: 0xFFD700,
  },

  // ── 12. BOTANICAL_CONTROL — 沐里 植物伙伴派对 ──
  [WeaponId.BOTANICAL_CONTROL]: {
    primary: 0x44AA22,
    glow: 0x88DD44,
    highlight: 0xBBFF88,
    dim: 0x1A3A0A,
    shadow: 0x0A1F05,
    accent: 0xFFB3D9,
  },
};

/**
 * 查询武器预设色板
 * @param weaponId 武器 ID
 * @returns Palette 或 undefined（基础武器或未配置武器返回 undefined，回退到 buildPalette）
 */
export function getWeaponPalette(weaponId: WeaponId): Palette | undefined {
  return WEAPON_PALETTES[weaponId];
}
```

- [ ] **Step 2: 编译验证**

Run: `cd game/frontend && npx vite build`
Expected: 无错误（仅新建文件，未被引用）

- [ ] **Step 3: Commit**

```bash
cd game/frontend && git add src/components/fish-oil-battle/renderer/entities/WeaponPalettes.ts && git commit -m "feat: 新建角色武器预设色板配置文件"
```

---

## Task 2: EffectRenderer 新增 palette 参数并转发（12 个角色武器）

**Files:**
- Modify: `game/frontend/src/components/fish-oil-battle/renderer/entities/EffectRenderer.ts`

本 Task 修改 EffectRenderer 中所有 12 个角色武器的公开 API 方法，新增 `palette?: Palette` 参数并转发给子渲染器。修改前需先在文件顶部 import Palette 类型。

- [ ] **Step 1: 在 EffectRenderer.ts 顶部 import Palette**

在现有 `import type { ... } from './BaseWeaponEffectRenderer';` 中追加 `Palette`：

```typescript
import type { Palette } from './BaseWeaponEffectRenderer';
```

- [ ] **Step 2: 修改 triggerOpticalSlash 方法新增 palette? 参数**

找到 `triggerOpticalSlash` 方法（约 413 行），修改为：

```typescript
  triggerOpticalSlash(
    x: number, y: number,
    angle: number, length: number,
    themeColor: number,
    isBurst = false,
    visualCfg?: OpticalSlashVisualConfig,
    palette?: Palette,
  ): void {
    const dataCfg = this.buildOpticalSlashVisualCfg();
    const cfg: OpticalSlashVisualConfig = { ...dataCfg, ...visualCfg };
    const ef = this.opticalSlashRenderer.triggerSlash(x, y, angle, length, themeColor, isBurst, cfg, palette);
    if (ef) this.activeEffects.push(ef);
  }
```

- [ ] **Step 3: 修改 triggerOpticalSlashBurst 方法新增 palette? 参数**

```typescript
  triggerOpticalSlashBurst(
    x: number, y: number,
    themeColor: number,
    radius?: number,
    visualCfg?: OpticalSlashVisualConfig,
    palette?: Palette,
  ): void {
    const dataCfg = this.buildOpticalSlashVisualCfg();
    const cfg: OpticalSlashVisualConfig = { ...dataCfg, ...visualCfg };
    if (radius !== undefined) cfg.maxRadius = radius;
    const effects = this.opticalSlashRenderer.triggerBurst(x, y, themeColor, cfg, palette);
    for (const ef of effects) this.activeEffects.push(ef);
  }
```

- [ ] **Step 4: 修改 triggerAirAnchor 方法新增 palette? 参数**

```typescript
  triggerAirAnchor(
    x: number, y: number,
    anchorId: string,
    themeColor?: number,
    durationMs?: number,
    palette?: Palette,
  ): void {
    const cfg = this.buildAirRepulsionVisualCfg();
    const ef = this.airRepulsionFieldRenderer.triggerAnchor(
      x, y, anchorId, themeColor, durationMs ?? cfg.anchorDurationMs, palette,
    );
    if (ef.effect) this.activeEffects.push(ef.effect);
  }
```

- [ ] **Step 5: 修改 triggerAirBurst 方法新增 palette? 参数**

```typescript
  triggerAirBurst(
    x: number, y: number,
    radius?: number,
    themeColor?: number,
    durationMs?: number,
    palette?: Palette,
  ): void {
    const cfg = this.buildAirRepulsionVisualCfg();
    const ef = this.airRepulsionFieldRenderer.triggerBurst(
      x, y, radius ?? cfg.burstRadius, themeColor, durationMs ?? cfg.burstDurationMs, palette,
    );
    if (ef.effect) this.activeEffects.push(ef.effect);
  }
```

- [ ] **Step 6: 修改 triggerEntropicAura / triggerEntropicFrostbite / triggerEntropicBurst 三个方法新增 palette? 参数**

```typescript
  triggerEntropicAura(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor?: number,
    palette?: Palette,
  ): void {
    this.entropicTouchRenderer.triggerAura(playerId, x, y, radius, themeColor, palette);
  }

  triggerEntropicFrostbite(
    targetId: string,
    stacks: number,
    x: number,
    y: number,
    themeColor?: number,
    palette?: Palette,
  ): void {
    this.entropicTouchRenderer.triggerFrostbite(targetId, stacks, x, y, themeColor, palette);
  }

  triggerEntropicBurst(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor?: number,
    durationMs?: number,
    palette?: Palette,
  ): void {
    const cfg = this.buildEntropicTouchVisualCfg();
    this.entropicTouchRenderer.triggerBurst(
      playerId, x, y, radius, themeColor, durationMs ?? cfg.burstDurationMs, palette,
    );
  }
```

- [ ] **Step 7: 修改 updateDrawingRabbit / triggerDrawingBurst / triggerDrawingDash 三个方法新增 palette? 参数**

```typescript
  updateDrawingRabbit(
    playerId: string,
    x: number,
    y: number,
    inkStacks: number,
    isMuscle: boolean,
    themeColor?: number,
    palette?: Palette,
  ): void {
    const cfg = this.buildDrawingManifestVisualCfg();
    this.drawingManifestRenderer.updateRabbit(playerId, x, y, inkStacks, isMuscle, themeColor, cfg, palette);
  }

  triggerDrawingBurst(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor?: number,
    palette?: Palette,
  ): void {
    const cfg = this.buildDrawingManifestVisualCfg();
    const ef = this.drawingManifestRenderer.triggerBurst(
      playerId, x, y, radius, cfg.burstDurationMs ?? 5000, themeColor, palette,
    );
    if (ef.effect) this.activeEffects.push(ef.effect);
  }

  triggerDrawingDash(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    isHit: boolean,
    themeColor?: number,
    palette?: Palette,
  ): void {
    const ef = this.drawingManifestRenderer.triggerDash(
      fromX, fromY, toX, toY, isHit, themeColor, palette,
    );
    if (ef.effect) this.activeEffects.push(ef.effect);
  }
```

- [ ] **Step 8: 修改 updateDischargeCat / triggerDischargeArc / triggerDischargeBurst 三个方法新增 palette? 参数**

```typescript
  updateDischargeCat(
    playerId: string,
    x: number,
    y: number,
    isBurst: boolean,
    themeColor?: number,
    palette?: Palette,
  ): void {
    this.dischargeCatRenderer.updateCat(playerId, x, y, isBurst, themeColor, palette);
  }

  triggerDischargeArc(
    arcNodes: Array<{ x: number; y: number }>,
    isBurst: boolean,
    themeColor?: number,
    palette?: Palette,
  ): void {
    const ef = this.dischargeCatRenderer.triggerArc(arcNodes, isBurst, themeColor, palette);
    if (ef.effect) this.activeEffects.push(ef.effect);
  }

  triggerDischargeBurst(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor?: number,
    palette?: Palette,
  ): void {
    const cfg = this.buildDischargeCatVisualCfg();
    const ef = this.dischargeCatRenderer.triggerBurst(
      playerId, x, y, radius, cfg.burstDurationMs ?? 4000, themeColor, palette,
    );
    if (ef.effect) this.activeEffects.push(ef.effect);
  }
```

- [ ] **Step 9: 修改 updatePrecognitiveForesight / triggerPrecognitiveEcho / triggerPrecognitiveBurst 三个方法新增 palette? 参数**

```typescript
  updatePrecognitiveForesight(
    playerId: string,
    x: number,
    y: number,
    stacks: number,
    isBurst: boolean,
    themeColor?: number,
    palette?: Palette,
  ): void {
    this.precognitiveLensRenderer.updateForesight(playerId, x, y, stacks, isBurst, themeColor, palette);
  }

  triggerPrecognitiveEcho(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    isBurst: boolean,
    themeColor?: number,
    palette?: Palette,
  ): void {
    const ef = this.precognitiveLensRenderer.triggerEcho(
      fromX, fromY, toX, toY, isBurst, themeColor, palette,
    );
    if (ef.effect) this.activeEffects.push(ef.effect);
  }

  triggerPrecognitiveBurst(
    playerId: string,
    x: number,
    y: number,
    themeColor?: number,
    palette?: Palette,
  ): void {
    const cfg = this.buildPrecognitiveLensVisualCfg();
    const ef = this.precognitiveLensRenderer.triggerBurst(
      playerId, x, y, cfg.burstDurationMs ?? 4000, themeColor, palette,
    );
    if (ef.effect) this.activeEffects.push(ef.effect);
  }
```

- [ ] **Step 10: 修改 triggerWeatherLightning / triggerWeatherHail / triggerWeatherBurst 三个方法新增 palette? 参数**

```typescript
  triggerWeatherLightning(
    x: number, y: number,
    radius: number,
    color: number,
    palette?: Palette,
  ): void {
    const ef = this.emotionalWeatherRenderer.triggerLightning(x, y, radius, color, palette);
    if (ef.effect) this.activeEffects.push(ef.effect);
  }

  triggerWeatherHail(
    x: number, y: number,
    radius: number,
    palette?: Palette,
  ): void {
    const ef = this.emotionalWeatherRenderer.triggerHail(x, y, radius, palette);
    if (ef.effect) this.activeEffects.push(ef.effect);
  }

  triggerWeatherBurst(
    x: number, y: number,
    radius: number,
    palette?: Palette,
  ): void {
    const cfg = this.buildEmotionalWeatherVisualCfg();
    const ef = this.emotionalWeatherRenderer.triggerBurst(
      x, y, radius, cfg.burstDurationMs ?? 4000, palette,
    );
    if (ef.effect) this.activeEffects.push(ef.effect);
  }
```

- [ ] **Step 11: 修改 updateEmotionMood / triggerEmotionBurst 两个方法新增 palette? 参数**

```typescript
  updateEmotionMood(
    playerId: string,
    x: number,
    y: number,
    mood: string,
    themeColor?: number,
    palette?: Palette,
  ): void {
    this.emotionMasteryRenderer.updateMood(playerId, x, y, mood, themeColor, palette);
  }

  triggerEmotionBurst(
    playerId: string,
    x: number,
    y: number,
    themeColor?: number,
    palette?: Palette,
  ): void {
    const cfg = this.buildEmotionMasteryVisualCfg();
    const ef = this.emotionMasteryRenderer.triggerBurst(
      playerId, x, y, cfg.burstDurationMs ?? 4000, themeColor, cfg.orbitRadius ?? 80, palette,
    );
    if (ef.effect) this.activeEffects.push(ef.effect);
  }
```

- [ ] **Step 12: 修改 triggerFluidTrail / triggerFluidVortex / triggerFluidBurst 三个方法新增 palette? 参数**

```typescript
  triggerFluidTrail(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    flowDir: number,
    themeColor?: number,
    isAngry?: boolean,
    palette?: Palette,
  ): void {
    this.fluidMasteryRenderer.triggerTrail(playerId, x, y, radius, flowDir, themeColor, isAngry, palette);
  }

  triggerFluidVortex(
    targetId: string,
    x: number,
    y: number,
    radius: number,
    pullForce: number,
    themeColor?: number,
    isAngry?: boolean,
    palette?: Palette,
  ): void {
    this.fluidMasteryRenderer.triggerVortex(targetId, x, y, radius, pullForce, themeColor, isAngry, palette);
  }

  triggerFluidBurst(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor?: number,
    durationMs?: number,
    isAngry?: boolean,
    palette?: Palette,
  ): void {
    const cfg = this.buildFluidMasteryVisualCfg();
    this.fluidMasteryRenderer.triggerBurst(
      playerId, x, y, radius, themeColor, durationMs ?? cfg.burstDurationMs, isAngry, palette,
    );
  }
```

- [ ] **Step 13: 修改 triggerMemoryEcho / triggerMemoryResonance / triggerMemoryBurst 三个方法新增 palette? 参数**

```typescript
  triggerMemoryEcho(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    echoCount: number,
    shardId: string,
    themeColor?: number,
    palette?: Palette,
  ): void {
    void shardId;
    this.memoryCorridorRenderer.triggerEcho(
      playerId, x, y, radius, echoCount, 0, themeColor, palette,
    );
  }

  triggerMemoryResonance(
    targetId: string,
    x: number,
    y: number,
    resonanceStacks: number,
    themeColor?: number,
    palette?: Palette,
  ): void {
    this.memoryCorridorRenderer.triggerResonance(targetId, x, y, resonanceStacks, themeColor, palette);
  }

  triggerMemoryBurst(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    echoCount: number,
    themeColor?: number,
    durationMs?: number,
    palette?: Palette,
  ): void {
    const cfg = this.buildMemoryCorridorVisualCfg();
    this.memoryCorridorRenderer.triggerBurst(
      playerId, x, y, radius, echoCount, themeColor, durationMs ?? cfg.burstDurationMs, palette,
    );
  }
```

- [ ] **Step 14: 修改 triggerFoldDodge / triggerFoldReassemble / triggerFoldBurst 三个方法新增 palette? 参数**

```typescript
  triggerFoldDodge(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    foldLayer: number,
    dodgeSuccess: boolean,
    themeColor?: number,
    palette?: Palette,
  ): void {
    this.infiniteFoldRenderer.triggerDodge(playerId, x, y, radius, foldLayer, dodgeSuccess, themeColor, palette);
  }

  triggerFoldReassemble(
    targetId: string,
    x: number,
    y: number,
    foldCount: number,
    themeColor?: number,
    palette?: Palette,
  ): void {
    this.infiniteFoldRenderer.triggerReassemble(targetId, x, y, foldCount, themeColor, palette);
  }

  triggerFoldBurst(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor?: number,
    durationMs?: number,
    palette?: Palette,
  ): void {
    const cfg = this.buildInfiniteFoldVisualCfg();
    this.infiniteFoldRenderer.triggerBurst(
      playerId, x, y, radius, themeColor, durationMs ?? cfg.burstDurationMs, palette,
    );
  }
```

- [ ] **Step 15: 修改 triggerPlantSpawn / triggerBotanicalBurst 两个方法新增 palette? 参数**

```typescript
  triggerPlantSpawn(
    plantId: string,
    x: number,
    y: number,
    personality: 'gentle' | 'fierce' | 'curious',
    radius: number,
    themeColor?: number,
    palette?: Palette,
  ): void {
    const cfg = this.buildBotanicalPartyVisualCfg();
    this.botanicalPartyRenderer.triggerPlantSpawn(
      plantId, x, y, personality, radius ?? cfg.plantRadius, themeColor, palette,
    );
  }

  triggerBotanicalBurst(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    plantCount: number,
    themeColor?: number,
    durationMs?: number,
    palette?: Palette,
  ): void {
    const cfg = this.buildBotanicalPartyVisualCfg();
    this.botanicalPartyRenderer.triggerBurst(
      playerId, x, y, radius, plantCount, themeColor, durationMs ?? cfg.burstDurationMs, palette,
    );
  }
```

- [ ] **Step 16: 编译验证**

Run: `cd game/frontend && npx vite build`
Expected: 大量 TS 错误（子渲染器尚未实现 palette 参数）—— 这是预期错误，下一步 Task 3-14 会逐个修复

- [ ] **Step 17: Commit（即使有错误也提交，下个 Task 会修复）**

```bash
cd game/frontend && git add src/components/fish-oil-battle/renderer/entities/EffectRenderer.ts && git commit -m "feat: EffectRenderer 12个角色武器 trigger* 方法新增 palette? 参数"
```

---

## Task 3: OpticalSlashEffectRenderer 新增 palette? 参数

**Files:**
- Modify: `game/frontend/src/components/fish-oil-battle/renderer/entities/OpticalSlashEffectRenderer.ts`

- [ ] **Step 1: 在文件顶部 import Palette**

在现有 import 中追加：

```typescript
import type { Palette } from './BaseWeaponEffectRenderer';
```

- [ ] **Step 2: 修改 triggerSlash 方法签名**

找到 `triggerSlash` 方法（约 132 行），在 `config?: OpticalSlashVisualConfig` 之后追加 `palette?: Palette`：

```typescript
  triggerSlash(
    x: number,
    y: number,
    angle: number,
    length: number,
    themeColor: number,
    isBurst = false,
    config?: OpticalSlashVisualConfig,
    palette?: Palette,
  ): ActiveEffect | null {
```

- [ ] **Step 3: 在 triggerSlash 方法体内使用 palette**

在 triggerSlash 方法体内，找到使用 themeColor 派生 6 色的位置（通常是 `const mainColor = themeColor;` 或直接用 themeColor），替换为：

```typescript
    const pal: Palette = palette ?? {
      primary: themeColor,
      glow: lighten(themeColor, 50),
      highlight: lighten(themeColor, 100),
      dim: dimColor(themeColor, 0.6),
      shadow: dimColor(themeColor, 0.3),
      accent: this.rotateHue(themeColor, 30),
    };
```

如果文件未导入 `lighten` / `dimColor`，需在顶部追加：

```typescript
import { lighten, dimColor } from './VisualEffectUtils';
```

然后将方法体内引用 `themeColor` 作为主色的位置替换为 `pal.primary`，引用其他派生色的位置替换为对应的 `pal.glow` / `pal.highlight` / `pal.dim` / `pal.shadow` / `pal.accent`。

- [ ] **Step 4: 修改 triggerBurst 方法签名**

找到 `triggerBurst` 方法（约 401 行），在 `durationMs?: number` 之后追加 `palette?: Palette`：

```typescript
  triggerBurst(
    x: number,
    y: number,
    themeColor: number,
    config?: OpticalSlashVisualConfig,
    durationMs?: number,
    palette?: Palette,
  ): ActiveEffect[] {
```

- [ ] **Step 5: 在 triggerBurst 方法体内使用 palette**

同 Step 3，在 triggerBurst 方法体内用 `const pal = palette ?? { ...buildPalette(themeColor) };` 替换派生色逻辑。

- [ ] **Step 6: 编译验证**

Run: `cd game/frontend && npx vite build`
Expected: OpticalSlash 相关错误消失

- [ ] **Step 7: Commit**

```bash
cd game/frontend && git add src/components/fish-oil-battle/renderer/entities/OpticalSlashEffectRenderer.ts && git commit -m "feat: OpticalSlashEffectRenderer 新增 palette? 参数"
```

---

## Task 4: AirRepulsionFieldRenderer 新增 palette? 参数

**Files:**
- Modify: `game/frontend/src/components/fish-oil-battle/renderer/entities/AirRepulsionFieldRenderer.ts`

- [ ] **Step 1: 在文件顶部 import Palette 与工具函数**

```typescript
import type { Palette } from './BaseWeaponEffectRenderer';
import { lighten, dimColor } from './VisualEffectUtils';
```

- [ ] **Step 2: 修改 triggerAnchor 方法新增 palette? 参数**

找到 `triggerAnchor` 方法（约 85 行），在 `radius = 55` 之后追加 `palette?: Palette`：

```typescript
  triggerAnchor(
    x: number,
    y: number,
    anchorId: string,
    themeColor?: number,
    maxLifeMs = 5000,
    radius = 55,
    palette?: Palette,
  ): { effect: ActiveEffect | null; anchorId: string } {
```

在方法体内使用：

```typescript
    const baseColor = themeColor ?? 0xFFCC44;
    const pal: Palette = palette ?? {
      primary: baseColor,
      glow: lighten(baseColor, 50),
      highlight: lighten(baseColor, 100),
      dim: dimColor(baseColor, 0.6),
      shadow: dimColor(baseColor, 0.3),
      accent: 0xFF6622,
    };
```

- [ ] **Step 3: 修改 triggerBurst 方法新增 palette? 参数**

找到 `triggerBurst` 方法（约 238 行），在 `durationMs = 4000` 之后追加 `palette?: Palette`：

```typescript
  triggerBurst(
    x: number,
    y: number,
    radius = 180,
    themeColor?: number,
    durationMs = 4000,
    palette?: Palette,
  ): { effect: ActiveEffect | null } {
```

在方法体内用同样的 `pal` 派生逻辑。

- [ ] **Step 4: 编译验证**

Run: `cd game/frontend && npx vite build`
Expected: AirRepulsion 相关错误消失

- [ ] **Step 5: Commit**

```bash
cd game/frontend && git add src/components/fish-oil-battle/renderer/entities/AirRepulsionFieldRenderer.ts && git commit -m "feat: AirRepulsionFieldRenderer 新增 palette? 参数"
```

---

## Task 5: EntropicTouchRenderer 新增 palette? 参数

**Files:**
- Modify: `game/frontend/src/components/fish-oil-battle/renderer/entities/EntropicTouchRenderer.ts`

- [ ] **Step 1: 在文件顶部 import Palette 与工具函数**

```typescript
import type { Palette } from './BaseWeaponEffectRenderer';
import { lighten, dimColor } from './VisualEffectUtils';
```

- [ ] **Step 2: 修改 triggerAura 方法新增 palette? 参数**

找到 `triggerAura` 方法（约 109 行）：

```typescript
  triggerAura(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor = MOON_COLOR,
    palette?: Palette,
  ): void {
```

- [ ] **Step 3: 修改 triggerFrostbite 方法新增 palette? 参数**

找到 `triggerFrostbite` 方法（约 274 行）：

```typescript
  triggerFrostbite(
    targetId: string,
    stacks: number,
    x: number,
    y: number,
    themeColor = MOON_COLOR,
    palette?: Palette,
  ): void {
```

- [ ] **Step 4: 修改 triggerBurst 方法新增 palette? 参数**

找到 `triggerBurst` 方法（约 388 行）：

```typescript
  triggerBurst(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor = MOON_COLOR,
    durationMs?: number,
    palette?: Palette,
  ): void {
```

- [ ] **Step 5: 在三个方法体内使用 palette**

在每个方法体内派生 pal：

```typescript
    const pal: Palette = palette ?? {
      primary: themeColor,
      glow: lighten(themeColor, 50),
      highlight: lighten(themeColor, 100),
      dim: dimColor(themeColor, 0.6),
      shadow: dimColor(themeColor, 0.3),
      accent: 0xFF3333,
    };
```

- [ ] **Step 6: 编译验证**

Run: `cd game/frontend && npx vite build`
Expected: EntropicTouch 相关错误消失

- [ ] **Step 7: Commit**

```bash
cd game/frontend && git add src/components/fish-oil-battle/renderer/entities/EntropicTouchRenderer.ts && git commit -m "feat: EntropicTouchRenderer 新增 palette? 参数"
```

---

## Task 6: DrawingManifestRenderer 新增 palette? 参数

**Files:**
- Modify: `game/frontend/src/components/fish-oil-battle/renderer/entities/DrawingManifestRenderer.ts`

- [ ] **Step 1: 在文件顶部 import Palette 与工具函数**

```typescript
import type { Palette } from './BaseWeaponEffectRenderer';
import { lighten, dimColor } from './VisualEffectUtils';
```

- [ ] **Step 2: 修改 updateRabbit 方法新增 palette? 参数**

找到 `updateRabbit` 方法（约 107 行），在 `visualCfg?: DrawingManifestVisualConfig` 之后追加 `palette?: Palette`：

```typescript
  updateRabbit(
    playerId: string,
    x: number,
    y: number,
    inkStacks: number,
    isMuscle: boolean,
    _themeColor = 0xff69b4,
    visualCfg?: DrawingManifestVisualConfig,
    palette?: Palette,
  ): void {
```

- [ ] **Step 3: 修改 triggerBurst 方法新增 palette? 参数**

找到 `triggerBurst` 方法（约 385 行）：

```typescript
  triggerBurst(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    durationMs: number,
    _themeColor = 0xff69b4,
    palette?: Palette,
  ): { effect: ActiveEffect | null } {
```

- [ ] **Step 4: 修改 triggerDash 方法新增 palette? 参数**

找到 `triggerDash` 方法（约 604 行）：

```typescript
  triggerDash(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    isHit: boolean,
    _themeColor = 0xff69b4,
    palette?: Palette,
  ): { effect: ActiveEffect | null } {
```

- [ ] **Step 5: 在三个方法体内使用 palette**

```typescript
    const baseColor = 0x8B4D9F;
    const pal: Palette = palette ?? {
      primary: baseColor,
      glow: lighten(baseColor, 50),
      highlight: lighten(baseColor, 100),
      dim: dimColor(baseColor, 0.6),
      shadow: dimColor(baseColor, 0.3),
      accent: 0xFFB3D9,
    };
```

- [ ] **Step 6: 编译验证**

Run: `cd game/frontend && npx vite build`
Expected: DrawingManifest 相关错误消失

- [ ] **Step 7: Commit**

```bash
cd game/frontend && git add src/components/fish-oil-battle/renderer/entities/DrawingManifestRenderer.ts && git commit -m "feat: DrawingManifestRenderer 新增 palette? 参数"
```

---

## Task 7: DischargeCatRenderer 新增 palette? 参数

**Files:**
- Modify: `game/frontend/src/components/fish-oil-battle/renderer/entities/DischargeCatRenderer.ts`

- [ ] **Step 1: 在文件顶部 import Palette 与工具函数**

```typescript
import type { Palette } from './BaseWeaponEffectRenderer';
import { lighten, dimColor } from './VisualEffectUtils';
```

- [ ] **Step 2: 修改 updateCat 方法新增 palette? 参数**

找到 `updateCat` 方法（约 93 行）：

```typescript
  updateCat(
    playerId: string,
    x: number,
    y: number,
    isBurst: boolean,
    themeColor = DEFAULT_THEME,
    palette?: Palette,
  ): void {
```

- [ ] **Step 3: 修改 triggerArc 方法新增 palette? 参数**

找到 `triggerArc` 方法（约 215 行）：

```typescript
  triggerArc(
    arcNodes: Array<{ x: number; y: number }>,
    isBurst: boolean,
    themeColor = DEFAULT_THEME,
    palette?: Palette,
  ): { effect: ActiveEffect | null } {
```

- [ ] **Step 4: 修改 triggerBurst 方法新增 palette? 参数**

找到 `triggerBurst` 方法（约 341 行）：

```typescript
  triggerBurst(
    _playerId: string,
    x: number,
    y: number,
    radius: number,
    durationMs: number,
    themeColor = DEFAULT_THEME,
    palette?: Palette,
  ): { effect: ActiveEffect | null } {
```

- [ ] **Step 5: 在三个方法体内使用 palette**

```typescript
    const pal: Palette = palette ?? {
      primary: themeColor,
      glow: lighten(themeColor, 50),
      highlight: lighten(themeColor, 100),
      dim: dimColor(themeColor, 0.6),
      shadow: dimColor(themeColor, 0.3),
      accent: 0xFFCC00,
    };
```

- [ ] **Step 6: 编译验证**

Run: `cd game/frontend && npx vite build`
Expected: DischargeCat 相关错误消失

- [ ] **Step 7: Commit**

```bash
cd game/frontend && git add src/components/fish-oil-battle/renderer/entities/DischargeCatRenderer.ts && git commit -m "feat: DischargeCatRenderer 新增 palette? 参数"
```

---

## Task 8: PrecognitiveLensRenderer 新增 palette? 参数

**Files:**
- Modify: `game/frontend/src/components/fish-oil-battle/renderer/entities/PrecognitiveLensRenderer.ts`

- [ ] **Step 1: 在文件顶部 import Palette 与工具函数**

```typescript
import type { Palette } from './BaseWeaponEffectRenderer';
import { lighten, dimColor } from './VisualEffectUtils';
```

- [ ] **Step 2: 修改 updateForesight 方法新增 palette? 参数**

找到 `updateForesight` 方法（约 67 行）：

```typescript
  updateForesight(
    playerId: string,
    x: number,
    y: number,
    stacks: number,
    isBurst: boolean,
    themeColor = 0x4DA6FF,
    palette?: Palette,
  ): void {
```

- [ ] **Step 3: 修改 triggerEcho 方法新增 palette? 参数**

找到 `triggerEcho` 方法（约 191 行）：

```typescript
  triggerEcho(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    isBurst: boolean,
    themeColor = 0x4DA6FF,
    palette?: Palette,
  ): { effect: ActiveEffect | null } {
```

- [ ] **Step 4: 修改 triggerBurst 方法新增 palette? 参数**

找到 `triggerBurst` 方法（约 270 行）：

```typescript
  triggerBurst(
    _playerId: string,
    x: number,
    y: number,
    durationMs: number,
    themeColor = 0x4DA6FF,
    palette?: Palette,
  ): { effect: ActiveEffect | null } {
```

- [ ] **Step 5: 在三个方法体内使用 palette**

```typescript
    const pal: Palette = palette ?? {
      primary: themeColor,
      glow: lighten(themeColor, 50),
      highlight: lighten(themeColor, 100),
      dim: dimColor(themeColor, 0.6),
      shadow: dimColor(themeColor, 0.3),
      accent: 0xFFD700,
    };
```

- [ ] **Step 6: 编译验证**

Run: `cd game/frontend && npx vite build`
Expected: PrecognitiveLens 相关错误消失

- [ ] **Step 7: Commit**

```bash
cd game/frontend && git add src/components/fish-oil-battle/renderer/entities/PrecognitiveLensRenderer.ts && git commit -m "feat: PrecognitiveLensRenderer 新增 palette? 参数"
```

---

## Task 9: EmotionalWeatherRenderer 新增 palette? 参数

**Files:**
- Modify: `game/frontend/src/components/fish-oil-battle/renderer/entities/EmotionalWeatherRenderer.ts`

注意：triggerLightning 已有 color 参数，triggerHail / triggerBurst 无 color 参数。本 Task 在三者均新增 palette? 参数。

- [ ] **Step 1: 在文件顶部 import Palette 与工具函数**

```typescript
import type { Palette } from './BaseWeaponEffectRenderer';
import { lighten, dimColor } from './VisualEffectUtils';
```

- [ ] **Step 2: 修改 triggerLightning 方法新增 palette? 参数**

找到 `triggerLightning` 方法（约 67 行）：

```typescript
  triggerLightning(
    x: number,
    y: number,
    radius: number,
    color: number,
    palette?: Palette,
  ): { effect: ActiveEffect | null } {
```

在方法体内派生 pal：

```typescript
    const pal: Palette = palette ?? {
      primary: color,
      glow: lighten(color, 50),
      highlight: lighten(color, 100),
      dim: dimColor(color, 0.6),
      shadow: dimColor(color, 0.3),
      accent: 0xFF8800,
    };
```

- [ ] **Step 3: 修改 triggerHail 方法新增 palette? 参数**

找到 `triggerHail` 方法（约 142 行）：

```typescript
  triggerHail(
    x: number,
    y: number,
    radius: number,
    palette?: Palette,
  ): { effect: ActiveEffect | null } {
```

在方法体内派生 pal（使用晴空蓝作为默认主色）：

```typescript
    const baseColor = 0xAAEEFF;
    const pal: Palette = palette ?? {
      primary: baseColor,
      glow: lighten(baseColor, 50),
      highlight: lighten(baseColor, 100),
      dim: dimColor(baseColor, 0.6),
      shadow: dimColor(baseColor, 0.3),
      accent: 0xFF8800,
    };
```

- [ ] **Step 4: 修改 triggerBurst 方法新增 palette? 参数**

找到 `triggerBurst` 方法（约 194 行）：

```typescript
  triggerBurst(
    x: number,
    y: number,
    radius: number,
    durationMs: number,
    palette?: Palette,
  ): { effect: ActiveEffect | null } {
```

在方法体内派生 pal（同 triggerHail 使用晴空蓝默认主色）。

- [ ] **Step 5: 编译验证**

Run: `cd game/frontend && npx vite build`
Expected: EmotionalWeather 相关错误消失

- [ ] **Step 6: Commit**

```bash
cd game/frontend && git add src/components/fish-oil-battle/renderer/entities/EmotionalWeatherRenderer.ts && git commit -m "feat: EmotionalWeatherRenderer 新增 palette? 参数"
```

---

## Task 10: EmotionMasteryRenderer 新增 palette? 参数

**Files:**
- Modify: `game/frontend/src/components/fish-oil-battle/renderer/entities/EmotionMasteryRenderer.ts`

- [ ] **Step 1: 在文件顶部 import Palette 与工具函数**

```typescript
import type { Palette } from './BaseWeaponEffectRenderer';
import { lighten, dimColor } from './VisualEffectUtils';
```

- [ ] **Step 2: 修改 updateMood 方法新增 palette? 参数**

找到 `updateMood` 方法（约 93 行）：

```typescript
  updateMood(
    playerId: string,
    x: number,
    y: number,
    mood: string,
    themeColor?: number,
    palette?: Palette,
  ): void {
```

- [ ] **Step 3: 修改 triggerBurst 方法新增 palette? 参数**

找到 `triggerBurst` 方法（约 181 行）：

```typescript
  triggerBurst(
    playerId: string,
    x: number,
    y: number,
    durationMs: number,
    themeColor?: number,
    orbitRadius = 80,
    palette?: Palette,
  ): { effect: ActiveEffect | null } {
```

- [ ] **Step 4: 在两个方法体内使用 palette**

```typescript
    const baseColor = themeColor ?? 0xFF3333;
    const pal: Palette = palette ?? {
      primary: baseColor,
      glow: lighten(baseColor, 50),
      highlight: lighten(baseColor, 100),
      dim: dimColor(baseColor, 0.6),
      shadow: dimColor(baseColor, 0.3),
      accent: 0x4488FF,
    };
```

注意：内部 `MOOD_COLORS = { anger: 0xFF3333, bliss: 0x4488FF, happy: 0x44DD44 }` 三心境独立常量保持原引用不变，仅替换 buildPalette 派生色为 pal。

- [ ] **Step 5: 编译验证**

Run: `cd game/frontend && npx vite build`
Expected: EmotionMastery 相关错误消失

- [ ] **Step 6: Commit**

```bash
cd game/frontend && git add src/components/fish-oil-battle/renderer/entities/EmotionMasteryRenderer.ts && git commit -m "feat: EmotionMasteryRenderer 新增 palette? 参数"
```

---

## Task 11: FluidMasteryRenderer 新增 palette? 参数

**Files:**
- Modify: `game/frontend/src/components/fish-oil-battle/renderer/entities/FluidMasteryRenderer.ts`

注意：该类继承 BaseWeaponEffectRenderer，可直接使用 `this.buildPalette(themeColor)`。

- [ ] **Step 1: 在文件顶部 import Palette**

```typescript
import type { Palette } from './BaseWeaponEffectRenderer';
```

（如已导入则跳过）

- [ ] **Step 2: 修改 triggerTrail 方法新增 palette? 参数**

找到 `triggerTrail` 方法（约 189 行），在 `isAngry: boolean = false` 之后追加 `palette?: Palette`：

```typescript
  triggerTrail(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    flowDir: number,
    themeColor: number = FLUID_MAIN,
    isAngry: boolean = false,
    palette?: Palette,
  ): void {
```

在方法体内使用：

```typescript
    const pal: Palette = palette ?? this.buildPalette(isAngry ? ANGER_MAIN : themeColor);
```

- [ ] **Step 3: 修改 triggerVortex 方法新增 palette? 参数**

找到 `triggerVortex` 方法（约 393 行）：

```typescript
  triggerVortex(
    targetId: string,
    x: number,
    y: number,
    radius: number,
    pullForce: number,
    themeColor: number = FLUID_MAIN,
    isAngry: boolean = false,
    palette?: Palette,
  ): void {
```

在方法体内使用：

```typescript
    const pal: Palette = palette ?? this.buildPalette(isAngry ? ANGER_MAIN : themeColor);
```

- [ ] **Step 4: 修改 triggerBurst 方法新增 palette? 参数**

找到 `triggerBurst` 方法（约 561 行）：

```typescript
  triggerBurst(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor: number = FLUID_MAIN,
    durationMs?: number,
    isAngry: boolean = false,
    palette?: Palette,
  ): void {
```

在方法体内使用：

```typescript
    const pal: Palette = palette ?? this.buildPalette(isAngry ? ANGER_MAIN : themeColor);
```

- [ ] **Step 5: 编译验证**

Run: `cd game/frontend && npx vite build`
Expected: FluidMastery 相关错误消失

- [ ] **Step 6: Commit**

```bash
cd game/frontend && git add src/components/fish-oil-battle/renderer/entities/FluidMasteryRenderer.ts && git commit -m "feat: FluidMasteryRenderer 新增 palette? 参数"
```

---

## Task 12: MemoryCorridorRenderer 新增 palette? 参数

**Files:**
- Modify: `game/frontend/src/components/fish-oil-battle/renderer/entities/MemoryCorridorRenderer.ts`

- [ ] **Step 1: 在文件顶部 import Palette 与工具函数**

```typescript
import type { Palette } from './BaseWeaponEffectRenderer';
import { lighten, dimColor } from './VisualEffectUtils';
```

- [ ] **Step 2: 修改 triggerEcho 方法新增 palette? 参数**

找到 `triggerEcho` 方法（约 122 行）：

```typescript
  triggerEcho(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    echoCount: number,
    shardId: number,
    themeColor = MEMORY_MAIN,
    palette?: Palette,
  ): void {
```

在方法体内派生 pal：

```typescript
    const pal: Palette = palette ?? {
      primary: themeColor,
      glow: lighten(themeColor, 50),
      highlight: lighten(themeColor, 100),
      dim: dimColor(themeColor, 0.6),
      shadow: dimColor(themeColor, 0.3),
      accent: 0x6633CC,
    };
```

- [ ] **Step 3: 修改 triggerResonance 方法新增 palette? 参数**

找到 `triggerResonance` 方法（约 381 行）：

```typescript
  triggerResonance(
    targetId: string,
    x: number,
    y: number,
    resonanceStacks: number,
    themeColor = MEMORY_MAIN,
    palette?: Palette,
  ): void {
```

- [ ] **Step 4: 修改 triggerBurst 方法新增 palette? 参数**

找到 `triggerBurst` 方法（约 488 行）：

```typescript
  triggerBurst(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    echoCount: number,
    themeColor = MEMORY_MAIN,
    durationMs?: number,
    palette?: Palette,
  ): void {
```

- [ ] **Step 5: 编译验证**

Run: `cd game/frontend && npx vite build`
Expected: MemoryCorridor 相关错误消失

- [ ] **Step 6: Commit**

```bash
cd game/frontend && git add src/components/fish-oil-battle/renderer/entities/MemoryCorridorRenderer.ts && git commit -m "feat: MemoryCorridorRenderer 新增 palette? 参数"
```

---

## Task 13: InfiniteFoldRenderer 新增 palette? 参数

**Files:**
- Modify: `game/frontend/src/components/fish-oil-battle/renderer/entities/InfiniteFoldRenderer.ts`

注意：triggerReassemble 默认色用 FOLD_GOLD（金色），triggerDodge 用 FOLD_PURPLE（紫色），triggerBurst 用 FOLD_GOLD。

- [ ] **Step 1: 在文件顶部 import Palette 与工具函数**

```typescript
import type { Palette } from './BaseWeaponEffectRenderer';
import { lighten, dimColor } from './VisualEffectUtils';
```

- [ ] **Step 2: 修改 triggerDodge 方法新增 palette? 参数**

找到 `triggerDodge` 方法（约 119 行）：

```typescript
  triggerDodge(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    foldLayer: number,
    dodgeSuccess: boolean,
    themeColor = FOLD_PURPLE,
    palette?: Palette,
  ): void {
```

在方法体内派生 pal（紫色主调）：

```typescript
    const pal: Palette = palette ?? {
      primary: themeColor,
      glow: lighten(themeColor, 50),
      highlight: lighten(themeColor, 100),
      dim: dimColor(themeColor, 0.6),
      shadow: dimColor(themeColor, 0.3),
      accent: 0xFFD700,
    };
```

- [ ] **Step 3: 修改 triggerReassemble 方法新增 palette? 参数**

找到 `triggerReassemble` 方法（约 352 行）：

```typescript
  triggerReassemble(
    targetId: string,
    x: number,
    y: number,
    foldCount: number,
    themeColor = FOLD_GOLD,
    palette?: Palette,
  ): void {
```

在方法体内派生 pal（金色主调）：

```typescript
    const pal: Palette = palette ?? {
      primary: themeColor,
      glow: lighten(themeColor, 50),
      highlight: lighten(themeColor, 100),
      dim: dimColor(themeColor, 0.6),
      shadow: dimColor(themeColor, 0.3),
      accent: 0x6633CC,
    };
```

- [ ] **Step 4: 修改 triggerBurst 方法新增 palette? 参数**

找到 `triggerBurst` 方法（约 559 行）：

```typescript
  triggerBurst(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor = FOLD_GOLD,
    durationMs?: number,
    palette?: Palette,
  ): void {
```

注意：burst 接受的 themeColor 默认是 FOLD_GOLD，但本设计希望 burst 用紫色主调（accent 为金色）。在方法体内：

```typescript
    const pal: Palette = palette ?? {
      primary: 0x6633CC,
      glow: 0x9966FF,
      highlight: 0xCC99FF,
      dim: 0x1A1A2E,
      shadow: 0x000000,
      accent: themeColor,
    };
```

这样未传 palette 时，默认使用紫色主调色板，传入的 themeColor 作为 accent 金色。

- [ ] **Step 5: 编译验证**

Run: `cd game/frontend && npx vite build`
Expected: InfiniteFold 相关错误消失

- [ ] **Step 6: Commit**

```bash
cd game/frontend && git add src/components/fish-oil-battle/renderer/entities/InfiniteFoldRenderer.ts && git commit -m "feat: InfiniteFoldRenderer 新增 palette? 参数"
```

---

## Task 14: BotanicalPartyRenderer 新增 palette? 参数

**Files:**
- Modify: `game/frontend/src/components/fish-oil-battle/renderer/entities/BotanicalPartyRenderer.ts`

- [ ] **Step 1: 在文件顶部 import Palette 与工具函数**

```typescript
import type { Palette } from './BaseWeaponEffectRenderer';
import { lighten, dimColor } from './VisualEffectUtils';
```

- [ ] **Step 2: 修改 triggerPlantSpawn 方法新增 palette? 参数**

找到 `triggerPlantSpawn` 方法（约 135 行）：

```typescript
  triggerPlantSpawn(
    plantId: string,
    x: number,
    y: number,
    personality: PlantPersonality,
    radius: number,
    themeColor = PLANT_MAIN,
    palette?: Palette,
  ): void {
```

在方法体内派生 pal：

```typescript
    const pal: Palette = palette ?? {
      primary: themeColor,
      glow: lighten(themeColor, 50),
      highlight: lighten(themeColor, 100),
      dim: dimColor(themeColor, 0.6),
      shadow: dimColor(themeColor, 0.3),
      accent: 0xFFB3D9,
    };
```

注意：内部 `PERSONALITY_GENTLE` / `PERSONALITY_FIERCE` / `PERSONALITY_CURIOUS` 三性格色独立常量保持原引用不变，仅 buildPalette 派生色替换为 pal。

- [ ] **Step 3: 修改 triggerBurst 方法新增 palette? 参数**

找到 `triggerBurst` 方法（约 475 行）：

```typescript
  triggerBurst(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    plantCount: number,
    themeColor = PLANT_MAIN,
    durationMs?: number,
    palette?: Palette,
  ): void {
```

- [ ] **Step 4: 编译验证**

Run: `cd game/frontend && npx vite build`
Expected: BotanicalParty 相关错误消失

- [ ] **Step 5: Commit**

```bash
cd game/frontend && git add src/components/fish-oil-battle/renderer/entities/BotanicalPartyRenderer.ts && git commit -m "feat: BotanicalPartyRenderer 新增 palette? 参数"
```

---

## Task 15: CyberFishRenderer 在 12 个角色武器 case 中传 palette

**Files:**
- Modify: `game/frontend/src/components/fish-oil-battle/renderer/CyberFishRenderer.ts`

本 Task 修改 CyberFishRenderer 的 `handleVisualEvent` 方法中 12 个角色武器 case，从 `playerRenderers.getTrailColor()` 改为查询 `WEAPON_PALETTES[weaponId]`。

- [ ] **Step 1: 在文件顶部 import getWeaponPalette 与 WeaponId**

在现有 import 中追加：

```typescript
import { getWeaponPalette } from './entities/WeaponPalettes';
import { WeaponId } from '$/backend/src/games/fish-oil-battle/config/GameEnums';
```

（WeaponId 如已导入则跳过）

- [ ] **Step 2: 在 handleVisualEvent 方法开头查询 weaponId 对应的 palette**

在 `handleVisualEvent` 方法中，找到 `const themeColor = config.playerId ? this.playerRenderers.get(config.playerId)?.getTrailColor() : undefined;` 这一行（约 286-288 行），在其下方追加：

```typescript
  // 角色武器优先使用预设色板（不再依赖头像 themeColor）
  const weaponPalette = config.weaponId ? getWeaponPalette(config.weaponId as WeaponId) : undefined;
```

注意：config.weaponId 字段需确认存在；若不存在，则通过 VisualEventType 反查 WeaponId 映射。备选方案是直接根据 VisualEventType 判断属于哪个武器，再查 WEAPON_PALETTES。

如果 config 没有 weaponId 字段，使用备选方案——在 12 个 case 中分别传具体 WeaponId：

```typescript
  // 备选方案：在 case 中直接传 WeaponId
  // 例如 OPTICAL_SLASH_TRIGGER case 中：
  // this.effectRenderer.triggerOpticalSlash(..., getWeaponPalette(WeaponId.OPTICAL_SLASH));
```

- [ ] **Step 3: 修改 12 个角色武器 case 传 palette 参数**

依次修改 12 个角色武器 case：

**OPTICAL_SLASH_TRIGGER（约 333 行）：**
```typescript
      case VisualEventType.OPTICAL_SLASH_TRIGGER:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined && config.radius !== undefined) {
          this.effectRenderer.triggerOpticalSlash(
            mapCfg.x, mapCfg.y,
            (config as any).angle ?? 0, config.radius,
            themeColor ?? config.factionColor ?? 0x00BFFF,
            false,
            undefined,
            weaponPalette,
          );
        }
        break;
```

**OPTICAL_SLASH_BURST（约 343 行）：**
```typescript
      case VisualEventType.OPTICAL_SLASH_BURST:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerOpticalSlashBurst(
            mapCfg.x, mapCfg.y,
            themeColor ?? config.factionColor ?? 0x00BFFF,
            config.radius,
            undefined,
            weaponPalette,
          );
        }
        break;
```

**AIR_REPULSION_ANCHOR（约 378 行）：**
```typescript
      case VisualEventType.AIR_REPULSION_ANCHOR:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerAirAnchor(
            mapCfg.x, mapCfg.y,
            (config as any).anchorId ?? `anchor_${Date.now()}`,
            themeColor,
            undefined,
            weaponPalette,
          );
        }
        break;
```

**AIR_REPULSION_BURST（约 387 行）：**
```typescript
      case VisualEventType.AIR_REPULSION_BURST:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerAirBurst(
            mapCfg.x, mapCfg.y,
            config.radius,
            themeColor,
            undefined,
            weaponPalette,
          );
        }
        break;
```

**ENTROPIC_TOUCH_AURA / FROSTBITE / BURST（约 396-428 行）：**
```typescript
      case VisualEventType.ENTROPIC_TOUCH_AURA:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerEntropicAura(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.radius ?? 50,
            themeColor,
            weaponPalette,
          );
        }
        break;
      case VisualEventType.ENTROPIC_TOUCH_FROSTBITE:
        if (config.targetId && mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerEntropicFrostbite(
            config.targetId,
            config.frostbiteStacks ?? 1,
            mapCfg.x, mapCfg.y,
            themeColor,
            weaponPalette,
          );
        }
        break;
      case VisualEventType.ENTROPIC_TOUCH_BURST:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerEntropicBurst(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.radius ?? 200,
            themeColor,
            undefined,
            weaponPalette,
          );
        }
        break;
```

**DRAWING_MANIFEST_INK / BURST / DASH（约 429-473 行）：**
```typescript
      case VisualEventType.DRAWING_MANIFEST_INK:
        {
          const rx = config.rabbitX !== undefined ? this.mapX(config.rabbitX) : mapCfg.x;
          const ry = config.rabbitY !== undefined ? this.mapY(config.rabbitY) : mapCfg.y;
          if (rx !== undefined && ry !== undefined) {
            this.effectRenderer.updateDrawingRabbit(
              config.playerId ?? 'unknown',
              rx, ry,
              config.inkStacks ?? 0,
              config.isMuscleRabbit ?? false,
              themeColor,
              weaponPalette,
            );
          }
        }
        break;
      case VisualEventType.DRAWING_MANIFEST_BURST:
        {
          const bx = config.rabbitX !== undefined ? this.mapX(config.rabbitX) : mapCfg.x;
          const by = config.rabbitY !== undefined ? this.mapY(config.rabbitY) : mapCfg.y;
          if (bx !== undefined && by !== undefined) {
            this.effectRenderer.triggerDrawingBurst(
              config.playerId ?? 'unknown',
              bx, by,
              config.radius ?? 50,
              themeColor,
              weaponPalette,
            );
          }
        }
        break;
      case VisualEventType.DRAWING_MANIFEST_DASH:
        {
          const isHit = (config as any).isHit ?? false;
          if (mapCfg.x !== undefined && mapCfg.y !== undefined &&
              config.toX !== undefined && config.toY !== undefined) {
            this.effectRenderer.triggerDrawingDash(
              mapCfg.x, mapCfg.y,
              this.mapX(config.toX), this.mapY(config.toY),
              isHit,
              themeColor,
              weaponPalette,
            );
          }
        }
        break;
```

**DISCHARGE_CAT_ARC / BURST（约 475-510 行）：**
```typescript
      case VisualEventType.DISCHARGE_CAT_ARC:
        {
          const isBurst = config.isBurst ?? false;
          const cx = config.catX !== undefined ? this.mapX(config.catX) : mapCfg.x;
          const cy = config.catY !== undefined ? this.mapY(config.catY) : mapCfg.y;
          if (cx !== undefined && cy !== undefined) {
            this.effectRenderer.updateDischargeCat(
              config.playerId ?? 'unknown', cx, cy, isBurst, themeColor, weaponPalette,
            );
          }
          if (config.arcNodes && config.arcNodes.length >= 2) {
            const mappedNodes = config.arcNodes.map(n => ({
              x: this.mapX(n.x),
              y: this.mapY(n.y),
            }));
            this.effectRenderer.triggerDischargeArc(mappedNodes, isBurst, themeColor, weaponPalette);
          }
        }
        break;
      case VisualEventType.DISCHARGE_CAT_BURST:
        {
          const bx = config.catX !== undefined ? this.mapX(config.catX) : mapCfg.x;
          const by = config.catY !== undefined ? this.mapY(config.catY) : mapCfg.y;
          if (bx !== undefined && by !== undefined) {
            this.effectRenderer.triggerDischargeBurst(
              config.playerId ?? 'unknown',
              bx, by,
              config.radius ?? 120,
              themeColor,
              weaponPalette,
            );
          }
        }
        break;
```

**PRECOGNITIVE_LENS_FORESIGHT / ECHO / BURST（约 512-545 行）：**
```typescript
      case VisualEventType.PRECOGNITIVE_LENS_FORESIGHT:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.updatePrecognitiveForesight(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.foresightStacks ?? 0,
            config.isBurst ?? false,
            themeColor,
            weaponPalette,
          );
        }
        break;
      case VisualEventType.PRECOGNITIVE_LENS_ECHO:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined &&
            config.toX !== undefined && config.toY !== undefined) {
          this.effectRenderer.triggerPrecognitiveEcho(
            mapCfg.x, mapCfg.y,
            this.mapX(config.toX), this.mapY(config.toY),
            config.isBurst ?? false,
            themeColor,
            weaponPalette,
          );
        }
        break;
      case VisualEventType.PRECOGNITIVE_LENS_BURST:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerPrecognitiveBurst(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            themeColor,
            weaponPalette,
          );
        }
        break;
```

**EMOTIONAL_WEATHER_LIGHTNING / HAIL / BURST（约 546-573 行）：**
```typescript
      case VisualEventType.EMOTIONAL_WEATHER_LIGHTNING:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerWeatherLightning(
            mapCfg.x, mapCfg.y,
            config.radius ?? 40,
            config.weatherColor ?? 0x4DA6FF,
            weaponPalette,
          );
        }
        break;
      case VisualEventType.EMOTIONAL_WEATHER_HAIL:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerWeatherHail(
            mapCfg.x, mapCfg.y,
            config.radius ?? 30,
            weaponPalette,
          );
        }
        break;
      case VisualEventType.EMOTIONAL_WEATHER_BURST:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerWeatherBurst(
            mapCfg.x, mapCfg.y,
            config.radius ?? 200,
            weaponPalette,
          );
        }
        break;
```

**EMOTION_MASTERY_MOOD / BURST（约 574-594 行）：**
```typescript
      case VisualEventType.EMOTION_MASTERY_MOOD:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.updateEmotionMood(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.currentMood ?? 'anger',
            themeColor,
            weaponPalette,
          );
        }
        break;
      case VisualEventType.EMOTION_MASTERY_BURST:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerEmotionBurst(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            themeColor,
            weaponPalette,
          );
        }
        break;
```

**FLUID_MASTERY_TRAIL / VORTEX / BURST（约 595-633 行）：**
```typescript
      case VisualEventType.FLUID_MASTERY_TRAIL:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerFluidTrail(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.radius ?? 45,
            config.flowDir ?? 0,
            themeColor ?? config.factionColor,
            config.isAngry,
            weaponPalette,
          );
        }
        break;
      case VisualEventType.FLUID_MASTERY_VORTEX:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerFluidVortex(
            config.targetId ?? '',
            mapCfg.x, mapCfg.y,
            config.radius ?? 45,
            config.pullForce ?? 0.5,
            themeColor ?? config.factionColor,
            config.isAngry,
            weaponPalette,
          );
        }
        break;
      case VisualEventType.FLUID_MASTERY_BURST:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerFluidBurst(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.radius ?? 220,
            themeColor ?? config.factionColor,
            undefined,
            config.isAngry,
            weaponPalette,
          );
        }
        break;
```

**MEMORY_CORRIDOR_ECHO / RESONANCE / BURST（约 634-669 行）：**
```typescript
      case VisualEventType.MEMORY_CORRIDOR_ECHO:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerMemoryEcho(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.radius ?? 50,
            config.echoCount ?? 0,
            config.shardId ?? '',
            themeColor ?? config.factionColor,
            weaponPalette,
          );
        }
        break;
      case VisualEventType.MEMORY_CORRIDOR_RESONANCE:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerMemoryResonance(
            config.targetId ?? '',
            mapCfg.x, mapCfg.y,
            config.resonanceStacks ?? 1,
            themeColor ?? config.factionColor,
            weaponPalette,
          );
        }
        break;
      case VisualEventType.MEMORY_CORRIDOR_BURST:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerMemoryBurst(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.radius ?? 200,
            config.echoCount ?? 0,
            themeColor ?? config.factionColor,
            undefined,
            weaponPalette,
          );
        }
        break;
```

**INFINITE_FOLD_DODGE / REASSEMBLE / BURST（约 670-704 行）：**
```typescript
      case VisualEventType.INFINITE_FOLD_DODGE:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerFoldDodge(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.radius ?? 40,
            config.foldLayer ?? 1,
            config.dodgeSuccess ?? false,
            themeColor ?? config.factionColor,
            weaponPalette,
          );
        }
        break;
      case VisualEventType.INFINITE_FOLD_REASSEMBLE:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerFoldReassemble(
            config.targetId ?? '',
            mapCfg.x, mapCfg.y,
            config.foldCount ?? 1,
            themeColor ?? config.factionColor,
            weaponPalette,
          );
        }
        break;
      case VisualEventType.INFINITE_FOLD_BURST:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerFoldBurst(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.radius ?? 180,
            themeColor ?? config.factionColor,
            undefined,
            weaponPalette,
          );
        }
        break;
```

**BOTANICAL_PLANT_SPAWN / BURST（约 705-735 行）：**
```typescript
      case VisualEventType.BOTANICAL_PLANT_SPAWN:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerPlantSpawn(
            config.plantId ?? `plant_${Date.now()}`,
            mapCfg.x, mapCfg.y,
            (config.personality ?? 'gentle') as 'gentle' | 'fierce' | 'curious',
            config.radius ?? 40,
            themeColor,
            weaponPalette,
          );
        }
        break;
      case VisualEventType.BOTANICAL_BURST:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerBotanicalBurst(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.radius ?? 60,
            config.plantCount ?? 0,
            themeColor,
            config.durationMs,
            weaponPalette,
          );
        }
        break;
```

- [ ] **Step 4: 编译验证**

Run: `cd game/frontend && npx vite build`
Expected: 无错误（全部 12 个角色武器 case 已传 palette）

- [ ] **Step 5: Commit**

```bash
cd game/frontend && git add src/components/fish-oil-battle/renderer/CyberFishRenderer.ts && git commit -m "feat: CyberFishRenderer 12个角色武器 case 传 weaponPalette"
```

---

## Task 16: 最终编译验证 + 回归测试

**Files:**
- 无修改，仅验证

- [ ] **Step 1: 前端编译验证**

Run: `cd game/frontend && npx vite build`
Expected: 无错误，构建成功

- [ ] **Step 2: 后端编译验证（确认未受影响）**

Run: `cd game/backend && npx tsc --noEmit`
Expected: 仅 4 个预存 skill-chain.test.ts 错误

- [ ] **Step 3: grep 确认头像 themeColor 已隔离**

Run（在 frontend 目录）: 搜索 `getTrailColor()` 在 weapons 相关渲染器中的引用

```bash
grep -r "getTrailColor" src/components/fish-oil-battle/renderer/entities/
```
Expected: 0 匹配（角色武器渲染器内部不再调用 getTrailColor）

```bash
grep -r "getTrailColor" src/components/fish-oil-battle/renderer/CyberFishRenderer.ts
```
Expected: 仅 1 处保留（line 286-288 的 themeColor 变量，用于其他基础武器或玩家球体拖尾）

- [ ] **Step 4: grep 确认 palette 参数已覆盖 12 个角色武器**

```bash
grep -r "palette?: Palette" src/components/fish-oil-battle/renderer/entities/
```
Expected: 至少 12 个文件匹配（OpticalSlash / AirRepulsion / EntropicTouch / DrawingManifest / DischargeCat / PrecognitiveLens / EmotionalWeather / EmotionMastery / FluidMastery / MemoryCorridor / InfiniteFold / BotanicalParty）

```bash
grep -c "weaponPalette" src/components/fish-oil-battle/renderer/CyberFishRenderer.ts
```
Expected: ≥ 25 处（1 处定义 + 12 个 case × 2 行 = 25）

- [ ] **Step 5: 手动验证（用户执行）**

启动 `npm run dev` 在前端目录，打开 EffectTestPage：

1. 触发 OPTICAL_SLASH_TRIGGER — 应见冷蓝刀光 + 金色标记
2. 触发 AIR_REPULSION_BURST — 应见懒黄气罩 + 橙红泄压
3. 触发 ENTROPIC_TOUCH_BURST — 应见冰蓝奇点 + 紫黑边缘
4. 触发 DRAWING_MANIFEST_BURST — 应见墨紫粉肌肉兔
5. 触发 DISCHARGE_CAT_BURST — 应见电青闪电 + 猫金
6. 触发 PRECOGNITIVE_LENS_BURST — 应见深蓝猫眼 + 金轨迹
7. 触发 EMOTIONAL_WEATHER_BURST — 应见晴空蓝 + 橙烦躁
8. 触发 EMOTION_MASTERY_BURST — 应见愤怒红 + 蓝幸福
9. 触发 FLUID_MASTERY_BURST — 应见水蓝 + isAngry 时血红
10. 触发 MEMORY_CORRIDOR_BURST — 应见琥珀金 + 紫共振
11. 触发 INFINITE_FOLD_BURST — 应见空间紫 + 金重组
12. 触发 BOTANICAL_BURST — 应见草绿 + 粉温柔点缀 + 三性格色仍可见

- [ ] **Step 6: Commit（如有手动调整）**

```bash
cd game/frontend && git add -A && git commit -m "chore: 角色武器预设色板手动验证通过"
```

---

## Self-Review

### Spec coverage

| 设计文档章节 | 对应 Task |
|------------|----------|
| §3 架构设计 - WeaponPalettes.ts | Task 1 |
| §3 架构设计 - CyberFishRenderer | Task 15 |
| §3 架构设计 - EffectRenderer | Task 2 |
| §3 架构设计 - 12 个子渲染器 | Task 3-14 |
| §4.1 OPTICAL_SLASH | Task 1（色板）+ Task 3（渲染器）+ Task 15（case） |
| §4.2 AIR_REPULSION_FIELD | Task 1 + Task 4 + Task 15 |
| §4.3 ENTROPIC_TOUCH | Task 1 + Task 5 + Task 15 |
| §4.4 DRAWING_MANIFEST | Task 1 + Task 6 + Task 15 |
| §4.5 DISCHARGE_CAT | Task 1 + Task 7 + Task 15 |
| §4.6 PRECOGNITIVE_LENS | Task 1 + Task 8 + Task 15 |
| §4.7 EMOTIONAL_WEATHER | Task 1 + Task 9 + Task 15 |
| §4.8 EMOTION_MASTERY | Task 1 + Task 10 + Task 15 |
| §4.9 FLUID_MASTERY | Task 1 + Task 11 + Task 15 |
| §4.10 MEMORY_CORRIDOR | Task 1 + Task 12 + Task 15 |
| §4.11 INFINITE_FOLD | Task 1 + Task 13 + Task 15 |
| §4.12 BOTANICAL_CONTROL | Task 1 + Task 14 + Task 15 |
| §5.2 不变项 - buildPalette 保留 | ✓（各 Task 中 `palette ?? this.buildPalette(themeColor)`） |
| §5.2 不变项 - 基础武器不变 | ✓（Task 15 仅改 12 个角色武器 case） |
| §5.2 不变项 - 后端不变 | ✓（Task 16 Step 2 验证） |
| §6 验证标准 - 编译通过 | Task 16 Step 1 |
| §6 验证标准 - 头像色隔离 | Task 16 Step 3 |
| §6 验证标准 - 预设色板生效 | Task 16 Step 5 |
| §6 验证标准 - 性格色保留 | Task 14 Step 3 注释 |
| §6 验证标准 - 心境色保留 | Task 10 Step 4 注释 |
| §6 验证标准 - isAngry 切换 | Task 11 Step 2-4 |

### Placeholder scan

✓ 无 TBD/TODO/「类似 Task N」/「适当处理」/「fill in details」
✓ 所有 Step 都有完整代码块或具体命令

### Type consistency

- `Palette` 接口 6 字段（primary/glow/highlight/dim/shadow/accent）— Task 1 与所有子渲染器一致 ✓
- `WEAPON_PALETTES: Partial<Record<WeaponId, Palette>>` — Task 1 定义，Task 15 引用 ✓
- `getWeaponPalette(weaponId: WeaponId): Palette | undefined` — Task 1 定义，Task 15 调用 ✓
- 12 个子渲染器 trigger* 方法签名 — Task 2 转发参数与 Task 3-14 实现一致 ✓
- weaponPalette 变量名 — Task 15 全部使用 `weaponPalette` ✓

无遗漏，进入执行阶段。
