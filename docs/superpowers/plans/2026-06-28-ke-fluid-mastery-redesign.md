# KE 流体操控书海潮汐重写 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底重写 KE 流体操控的前端渲染器（书海潮汐方案）+ 后端数值对齐设计文档 + isAngry 书生愤怒态字段全链路打通。

**Architecture:** 前端 `FluidMasteryRenderer` 继承 `BaseWeaponEffectRenderer` 基类，预渲染书页纹理，实现水流尾迹（8层光环+漂浮书页+墨迹波纹）/漩涡牵引（中心古籍+书页螺旋臂+翻书声波）/水龙卷爆发（三阶段：古籍浮现→书页风暴→落雨飘落）三态视觉。后端 `FluidMasteryWeapon` 新增 `isAngry` 字段（hp<30% 时触发），通过 VISUAL_ONLY metadata → FishOilRoom.extractVisualEvents → protocol.VisualEventData.isAngry → useFishOilBattle → CyberFishRenderer → EffectRenderer → FluidMasteryRenderer 全链路传递。双轨色系：水系基础色 + 古籍人设色 + 愤怒态色。

**Tech Stack:** PixiJS v8（Graphics/Sprite/Container/blendMode ADD）、TypeScript、Vue 3 Composable、Node.js 后端。

---

## File Structure

| 操作 | 文件 | 职责 |
|------|------|------|
| 修改 | `game/backend/src/games/fish-oil-battle/config/WeaponRangeConfig.ts:434-455` | KE 数值对齐设计文档 |
| 修改 | `game/backend/src/games/fish-oil-battle/shared/protocol.ts:176-181` | VisualEventData 新增 isAngry 字段 |
| 修改 | `game/backend/src/games/fish-oil-battle/FishOilRoom.ts:694-697` | extractVisualEvents 映射 isAngry |
| 修改 | `game/backend/src/games/fish-oil-battle/skills/weapons/FluidMasteryWeapon.ts` | 新增 isAngry 字段 + metadata 传递 |
| 重写 | `game/frontend/src/components/fish-oil-battle/renderer/entities/FluidMasteryRenderer.ts` | 前端视觉（继承基类+预渲染纹理+三态+三阶段） |
| 修改 | `game/frontend/src/components/fish-oil-battle/renderer/entities/EffectRenderer.ts:964-1015` | triggerFluidTrail/Vortex/Burst 加 isAngry 参数 |
| 修改 | `game/frontend/src/components/fish-oil-battle/renderer/CyberFishRenderer.ts:593-627` | 3 个 KE case 传递 isAngry |
| 修改 | `game/frontend/src/components/fish-oil-battle/useFishOilBattle.ts:556-590` | 3 个 KE case 读取 data.isAngry |

---

## Task 1: 后端数值对齐 + isAngry 字段全链路

**Files:**
- Modify: `game/backend/src/games/fish-oil-battle/config/WeaponRangeConfig.ts:434-455`
- Modify: `game/backend/src/games/fish-oil-battle/shared/protocol.ts:176-181`
- Modify: `game/backend/src/games/fish-oil-battle/FishOilRoom.ts:694-697`
- Modify: `game/backend/src/games/fish-oil-battle/skills/weapons/FluidMasteryWeapon.ts`

- [ ] **Step 1: 调整 WeaponRangeConfig.ts KE 数值**

打开 `game/backend/src/games/fish-oil-battle/config/WeaponRangeConfig.ts`，定位到 `[WeaponId.FLUID_MASTERY]` 配置块（约 434 行），将数值改为：

```typescript
  [WeaponId.FLUID_MASTERY]: {
    damage: 2,                     // 水流尾迹伤害（原 8）
    burstDamage: 15,               // 水龙卷伤害（原 45）
    maxEnergy: 4,                  // 充能次数（原 100）
    energyPerHit: 1,               // 每次命中 +1 能量（原 12）
    energyPerBurstHit: 1,          // 被击 +1 能量（原 25）
    burstEnergyCost: 4,            // 爆发消耗 4 能量（原 100）
    damageRadius: 45,             // 水流尾迹影响半径
    aoeMaxRadius: 220,            // 水龙卷最大范围
    visualRadius: 45,
    visualDurationMs: 1500,       // 尾迹持续 1.5s
    burstDurationSec: 4,          // 爆发持续 4s
    cooldownMs: 6000,             // 爆发冷却 6s
    field: {
      maxCount: 1,                // 单一水流场
      radius: 45,
      durationSec: 3,
      tickIntervalMs: 500,
      slowFactor: 0.7,            // 水流减速（速度降至 70%）
    },
    triggerCooldowns: { minIntervalMs: 400 },
  },
```

- [ ] **Step 2: protocol.ts VisualEventData 新增 isAngry 字段**

打开 `game/backend/src/games/fish-oil-battle/shared/protocol.ts`，定位到 `fluidPullForce` 字段（约 181 行），在其后新增：

```typescript
  /** KE：漩涡牵引力 */
  fluidPullForce?: number;
  /** KE：书生愤怒态（hp<30% 时触发，色系切换为深红） */
  isAngry?: boolean;
  /** 梦：记忆碎片ID */
  memoryShardId?: string;
```

- [ ] **Step 3: FishOilRoom.ts extractVisualEvents 映射 isAngry**

打开 `game/backend/src/games/fish-oil-battle/FishOilRoom.ts`，定位到 `fluidPullForce` 映射行（约 697 行），在其后新增 isAngry 映射：

```typescript
        // KE - 流体操控
        fluidFlowDir: evt.metadata?.flowDir,
        fluidTrailLength: evt.metadata?.trailLength,
        fluidPullForce: evt.metadata?.pullForce,
        isAngry: evt.metadata?.isAngry,
        // 梦 - 记忆回廊
```

- [ ] **Step 4: FluidMasteryWeapon.ts 新增 isAngry 字段**

打开 `game/backend/src/games/fish-oil-battle/skills/weapons/FluidMasteryWeapon.ts`。

4a. 在私有字段区（约 47 行 `private tickCounter = 0;` 之后）新增：

```typescript
  /** 书生愤怒态（hp<30% 时触发，色系切换为深红） */
  private isAngry = false;
```

4b. 在 `onTick` 方法中，`const self = state.getPlayer(this.playerId);` 之后（约 58 行 `if (!self) return effects;` 之后）新增愤怒态检测：

```typescript
    const self = state.getPlayer(this.playerId);
    if (!self) return effects;

    // 书生愤怒态：hp < 30% 时激活
    const hpRatio = self.hp / self.maxHp;
    this.isAngry = hpRatio < 0.3;
```

4c. 在水流尾迹 VISUAL_ONLY 事件的 metadata 中追加 `isAngry`（约 95-100 行，metadata 对象内）：

```typescript
        effects.push({
          type: WeaponEffectType.VISUAL_ONLY,
          sourceId: this.playerId,
          value: 0,
          position: { x: curX, y: curY },
          metadata: {
            visualType: VisualEventType.FLUID_MASTERY_TRAIL,
            flowDir,
            trailLength,
            radius: CFG.damageRadius ?? 45,
            isAngry: this.isAngry,
          },
        });
```

4d. 在漩涡 VISUAL_ONLY 事件的 metadata 中追加 `isAngry`（约 196-203 行，metadata 对象内）：

```typescript
    effects.push({
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: self?.position ? { x: self.position.x, y: self.position.y } : undefined,
      metadata: {
        visualType: VisualEventType.FLUID_MASTERY_VORTEX,
        vortexRadius,
        pullForce,
        targetId: attackerId,
        radius: vortexRadius,
        isAngry: this.isAngry,
      },
    });
```

4e. 在爆发 VISUAL_ONLY 事件的 metadata 中追加 `isAngry`（约 257-269 行，metadata 对象内）：

```typescript
    return [{
      type: WeaponEffectType.VISUAL_ONLY,
      sourceId: this.playerId,
      value: 0,
      position: { x: center.x, y: center.y },
      metadata: {
        visualType: VisualEventType.FLUID_MASTERY_BURST,
        isBurst: true,
        radius,
        durationMs,
        isAngry: this.isAngry,
        desc: '水龙卷启动',
      },
    }];
```

4f. 在 `getRuntimeState` 的 custom 中追加 isAngry（约 289-293 行）：

```typescript
      custom: {
        burstTicksLeft: this.burstTicksLeft,
        burstCooldownTicksLeft: this.burstCooldownTicksLeft,
        isAngry: this.isAngry,
      },
```

4g. 在 `reset` 方法中追加重置（约 305 行 `this.tickCounter = 0;` 之后）：

```typescript
    this.tickCounter = 0;
    this.isAngry = false;
```

- [ ] **Step 5: 后端编译验证**

Run: `cd game/backend && npm run build`
Expected: 编译成功，0 错误

- [ ] **Step 6: 提交后端改动**

```bash
cd game/backend
git add src/games/fish-oil-battle/config/WeaponRangeConfig.ts src/games/fish-oil-battle/shared/protocol.ts src/games/fish-oil-battle/FishOilRoom.ts src/games/fish-oil-battle/skills/weapons/FluidMasteryWeapon.ts
git commit -m "feat(KE): 后端数值对齐设计文档+isAngry书生愤怒态字段全链路打通"
```

---

## Task 2: 前端 FluidMasteryRenderer 完整重写

**Files:**
- Rewrite: `game/frontend/src/components/fish-oil-battle/renderer/entities/FluidMasteryRenderer.ts`

这是本计划的核心任务。渲染器将完全重写为继承 `BaseWeaponEffectRenderer` 的实现，包含预渲染纹理、三态视觉（水流尾迹/漩涡牵引/水龙卷爆发）、三阶段动画（古籍浮现/书页风暴/落雨飘落）、双轨色系（水系+愤怒态）、人设彩蛋（书页文字/翻书声波）。

- [ ] **Step 1: 编写文件头部 + 颜色常量 + 数据结构**

用 Write 工具完全覆盖 `game/frontend/src/components/fish-oil-battle/renderer/entities/FluidMasteryRenderer.ts`，写入以下内容（这是完整文件的第一部分，后续步骤追加）：

```typescript
/**
 * KE 流体操控 (Fluid Mastery) - 鱼油大战
 * 前端视觉渲染器（书海潮汐方案）
 *
 * 视觉设计（书生古籍人设 + 水系三态）：
 * - 水流尾迹 Trail：8 层径向渐变光环 + 漂浮古籍书页（3-5 片）+ 墨迹波纹（3 条）+ 墨迹箭头 + 水滴/书页碎片粒子
 * - 漩涡牵引 Vortex：漩涡核心（6 层）+ 中心古籍（翻开旋转）+ 书页飞舞螺旋臂（3 条×8-10 片）+ 翻书声波环 + 墨迹牵引线
 * - 水龙卷爆发 Burst：三阶段动画
 *   · 蓄压（0-15%T）：水流向心汇聚 + 古籍从地下浮现（scale 0→1）
 *   · 爆发（15-30%T）：水龙卷主体爆发 + 书页风暴（20-30 片带重力飘落）+ 翻书声波环扩散 + 中心古籍旋转
 *   · 扩散（30-100%T）：水龙卷消散 + 书页如落雨飘落 + 古籍核心残留淡出 + 余波涟漪
 *
 * 人设彩蛋：
 * - 漂浮书页用预渲染古籍文字纹理（"鱼排都市志"/"潮生明月"/"书海无涯"/"卷舒云水"/"墨染千秋"）
 * - 翻书声波环（波浪起伏圆环，卷轴金色，区分水流）
 * - 书生愤怒态（hp<30%）：色系切换为深红，书页变焦黑
 *
 * 继承 BaseWeaponEffectRenderer：复用对象池/调色板派生/三阶段动画调度
 */

import * as PIXI from 'pixi.js';
import { ParticlePool } from '../systems/ParticlePool';
import { BaseWeaponEffectRenderer, type ActiveBurstBase, type Palette } from './BaseWeaponEffectRenderer';

// ══════════════════════════════════════════════════════
//  颜色常量（双轨：水系 + 古籍人设 + 愤怒态）
// ══════════════════════════════════════════════════════

// 水系基础色
const FLUID_DEEP = 0x0044aa;      // 深海蓝
const FLUID_MAIN = 0x0099ff;      // 主水蓝
const FLUID_LIGHT = 0x66ccff;     // 浅水蓝
const FLUID_HIGHLIGHT = 0xaaeeff; // 高亮浅蓝
const FLUID_WHITE = 0xffffff;     // 浪花白
const FLUID_FOAM = 0xe0f4ff;      // 泡沫白蓝

// 古籍人设色
const PARCHMENT_OLD = 0xd4b896;    // 古籍黄（书页底色）
const INK_BLACK = 0x1a1a2e;       // 墨黑（文字）
const SCROLL_GOLD = 0xc9a961;     // 卷轴金（书页边缘/声波）

// 书生愤怒态色
const ANGER_DEEP = 0x4a0a0a;      // 深红
const ANGER_MAIN = 0xcc2200;      // 主红
const ANGER_GLOW = 0xff6633;      // 橙红
const BURNED_PAGE = 0x2a2a2a;     // 焦黑书页

// 流动波纹周期（单条波纹从生成到消失的时长，ms）
const TRAIL_RIPPLE_MAX_LIFE = 1500;
// 翻书声波环扩散间隔（ms）
const SOUND_WAVE_INTERVAL = 1500;

// ══════════════════════════════════════════════════════
//  数据结构
// ══════════════════════════════════════════════════════

/** 漂浮书页（预渲染纹理 Sprite） */
interface BookPage {
  sprite: PIXI.Sprite;       // 预渲染书页纹理
  x: number;                 // 相对容器坐标
  y: number;
  rotation: number;
  rotationSpeed: number;     // 弧度/秒
  driftPhase: number;        // 漂浮轨迹相位
  driftRadius: number;       // 漂浮半径
  alpha: number;
  scale: number;
}

/** 活跃水流尾迹实例 */
interface ActiveTrail {
  container: PIXI.Container;
  auraGraphics: PIXI.Graphics;      // 8 层光环
  rippleGraphics: PIXI.Graphics;   // 3 条墨迹波纹
  arrowGraphics: PIXI.Graphics;    // 墨迹箭头
  bookPages: BookPage[];           // 漂浮书页（3-5 片）
  particleTimer: number;
  rippleLife: number[];            // 3 条波纹各自的 life（ms）
  rippleMaxLife: number;
  life: number;
  maxLife: number;
  x: number;
  y: number;
  radius: number;
  flowDir: number;
  palette: Palette;
  isAngry: boolean;
}

/** 活跃漩涡牵引实例 */
interface ActiveVortex {
  container: PIXI.Container;
  coreGraphics: PIXI.Graphics;       // 漩涡核心 + 中心古籍
  armGraphics: PIXI.Graphics;        // 书页飞舞螺旋臂
  pullGraphics: PIXI.Graphics;       // 墨迹牵引线
  soundWaveGraphics: PIXI.Graphics;  // 翻书声波环
  soundWaveTimer: number;
  soundWaveRings: Array<{ radius: number; alpha: number; life: number }>;
  life: number;
  maxLife: number;
  x: number;
  y: number;
  radius: number;
  pullForce: number;
  palette: Palette;
  isAngry: boolean;
}

/** 活跃水龙卷爆发实例（三阶段动画） */
interface ActiveFluidBurst extends ActiveBurstBase {
  columnGraphics: PIXI.Graphics;     // 水龙卷主体
  armGraphics: PIXI.Graphics;        // 螺旋水臂
  coreGraphics: PIXI.Graphics;       // 中心古籍核心
  splashGraphics: PIXI.Graphics;     // 水花范围环
  soundWaveGraphics: PIXI.Graphics;  // 翻书声波环
  soundWaveTimer: number;            // 翻书声波环生成计时器
  stormPages: BookPage[];            // 书页风暴（20-30 片）
  soundWaveRings: Array<{ radius: number; alpha: number; life: number }>;
  x: number;
  y: number;
  isAngry: boolean;
}
```

- [ ] **Step 2: 编写类骨架 + 预渲染纹理生成 + 构造函数**

在文件末尾追加（接续 Step 1 内容）：

```typescript
// ══════════════════════════════════════════════════════
//  预渲染纹理（书页/焦黑书页/古籍文字）
// ══════════════════════════════════════════════════════

let bookPageTexture: PIXI.Texture | null = null;
let bookPageBurnedTexture: PIXI.Texture | null = null;
let scrollTextTextures: PIXI.Texture[] = [];

/** 预渲染古籍书页纹理（黄底 + 模糊文字线条） */
function createBookPageTexture(burned = false): PIXI.Texture {
  const g = new PIXI.Graphics();
  // 书页底色
  g.rect(0, 0, 16, 16);
  g.fill({ color: burned ? BURNED_PAGE : PARCHMENT_OLD, alpha: 0.85 });
  // 边缘卷轴金
  g.rect(0, 0, 16, 1);
  g.fill({ color: burned ? 0x4a0a0a : SCROLL_GOLD, alpha: 0.6 });
  g.rect(0, 15, 16, 1);
  g.fill({ color: burned ? 0x4a0a0a : SCROLL_GOLD, alpha: 0.6 });
  // 模糊文字线条（模拟古籍文字）
  const inkColor = burned ? 0x1a0a0a : INK_BLACK;
  for (let i = 2; i < 15; i += 2) {
    const w = 8 + Math.random() * 6;
    g.rect(2, i, w, 0.8);
    g.fill({ color: inkColor, alpha: 0.4 + Math.random() * 0.3 });
  }
  return g.texture;
}

/** 预渲染古籍文字纹理（5 段古籍词句） */
function createScrollTextTextures(): PIXI.Texture[] {
  const texts = ['鱼排都市志', '潮生明月', '书海无涯', '卷舒云水', '墨染千秋'];
  return texts.map((text) => {
    const g = new PIXI.Graphics();
    g.rect(0, 0, 16, 16);
    g.fill({ color: PARCHMENT_OLD, alpha: 0.3 });
    // 模拟竖排文字
    for (let i = 0; i < text.length; i++) {
      g.rect(2 + i * 2, 2, 1, 12);
      g.fill({ color: INK_BLACK, alpha: 0.5 });
    }
    return g.texture;
  });
}

/** 初始化预渲染纹理（懒加载，首次调用时生成） */
function ensureTextures(): void {
  if (!bookPageTexture) {
    bookPageTexture = createBookPageTexture(false);
    bookPageBurnedTexture = createBookPageTexture(true);
    scrollTextTextures = createScrollTextTextures();
  }
}

// ══════════════════════════════════════════════════════
//  渲染器
// ══════════════════════════════════════════════════════

export class FluidMasteryRenderer extends BaseWeaponEffectRenderer {
  private activeTrails: Map<string, ActiveTrail> = new Map();
  private activeVortices: Map<string, ActiveVortex> = new Map();
  private activeBursts: Map<string, ActiveFluidBurst> = new Map();
  private hpRatio = 1;
  private isAngry = false;

  constructor(fieldContainer: PIXI.Container, particlePool: ParticlePool) {
    super(fieldContainer, particlePool);
    ensureTextures();
  }

  /** 同步血量比例，自动切换愤怒态（hp<30%） */
  setHpRatio(hpRatio: number): void {
    this.hpRatio = hpRatio;
    this.isAngry = hpRatio < 0.3;
  }
```

- [ ] **Step 3: 实现水流尾迹 Trail（triggerTrail + drawTrailAura + 漂浮书页 + 墨迹波纹 + 墨迹箭头 + 粒子）**

在类内追加（接续 Step 2）：

```typescript
  // ═══ 水流尾迹 Trail ═══

  /**
   * 触发水流尾迹视觉效果
   * @param playerId 玩家 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param radius 尾迹光环半径（逻辑 px）
   * @param flowDir 流向角度（弧度）
   * @param themeColor 主题色（默认主水蓝）
   * @param isAngry 书生愤怒态
   */
  triggerTrail(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    flowDir: number,
    themeColor: number = FLUID_MAIN,
    isAngry: boolean = false,
  ): void {
    const existing = this.activeTrails.get(playerId);
    if (existing) {
      existing.x = x;
      existing.y = y;
      existing.radius = radius;
      existing.flowDir = flowDir;
      existing.container.position.set(x, y);
      this.drawTrailArrow(existing.arrowGraphics, radius, flowDir, existing.palette);
      return;
    }

    const palette = this.buildPalette(isAngry ? ANGER_MAIN : themeColor);
    const container = new PIXI.Container();
    container.position.set(x, y);
    container.scale.set(this.scale);
    this.container.addChild(container);

    const auraGraphics = new PIXI.Graphics();
    this.drawTrailAura(auraGraphics, radius, palette, isAngry);
    container.addChild(auraGraphics);

    const rippleGraphics = new PIXI.Graphics();
    container.addChild(rippleGraphics);

    const arrowGraphics = new PIXI.Graphics();
    this.drawTrailArrow(arrowGraphics, radius, flowDir, palette);
    container.addChild(arrowGraphics);

    // 漂浮书页（3-5 片）
    const bookPages = this.createFloatingPages(radius, isAngry);
    for (const page of bookPages) {
      container.addChild(page.sprite);
    }

    this.activeTrails.set(playerId, {
      container,
      auraGraphics,
      rippleGraphics,
      arrowGraphics,
      bookPages,
      particleTimer: 0,
      rippleLife: [0, TRAIL_RIPPLE_MAX_LIFE / 3, (TRAIL_RIPPLE_MAX_LIFE * 2) / 3],
      rippleMaxLife: TRAIL_RIPPLE_MAX_LIFE,
      life: 0,
      maxLife: Number.POSITIVE_INFINITY,
      x,
      y,
      radius,
      flowDir,
      palette,
      isAngry,
    });

    this.spawnTrailParticles(x, y, radius, palette);
  }

  /** 更新水流尾迹位置与方向 */
  updateTrail(playerId: string, x: number, y: number, flowDir: number): void {
    const trail = this.activeTrails.get(playerId);
    if (!trail) return;
    trail.x = x;
    trail.y = y;
    trail.flowDir = flowDir;
    trail.container.position.set(x, y);
    this.drawTrailArrow(trail.arrowGraphics, trail.radius, flowDir, trail.palette);
  }

  /** 移除水流尾迹 */
  removeTrail(playerId: string): void {
    const trail = this.activeTrails.get(playerId);
    if (trail) {
      this.container.removeChild(trail.container);
      trail.container.destroy({ children: true });
      this.activeTrails.delete(playerId);
    }
  }

  /** 绘制水流尾迹光环：8 层同心圆（主色→深色→透明）+ 外环 + 中心水核 */
  private drawTrailAura(g: PIXI.Graphics, radius: number, palette: Palette, isAngry: boolean): void {
    g.clear();
    const deepColor = isAngry ? ANGER_DEEP : FLUID_DEEP;
    // 8 层同心圆叠加模拟径向渐变
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const r = radius * (0.15 + 0.85 * t);
      const color = t < 0.5 ? this.interpolateColor(palette.primary, deepColor, t * 2) : deepColor;
      const alpha = (1 - t) * 0.22;
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }
    // 外环（高亮色细环）+ 内环（泡沫色）
    g.circle(0, 0, radius);
    g.stroke({ color: palette.highlight, width: 1, alpha: 0.7 });
    g.circle(0, 0, radius * 0.95);
    g.stroke({ color: FLUID_FOAM, width: 0.4, alpha: 0.5 });
    // 愤怒态额外红色辉光边缘
    if (isAngry) {
      g.circle(0, 0, radius * 1.05);
      g.stroke({ color: ANGER_GLOW, width: 1.5, alpha: 0.4 });
    }
    // 中心水核
    g.circle(0, 0, 6);
    g.stroke({ color: palette.primary, width: 1, alpha: 0.8 });
    g.circle(0, 0, 4);
    g.fill({ color: FLUID_WHITE, alpha: 1 });
  }

  /** 绘制单条墨迹波纹（扩散环，带轻微抖动模拟墨水扩散） */
  private drawTrailRipple(g: PIXI.Graphics, radius: number, life: number, maxLife: number, palette: Palette): void {
    const t = life / maxLife;
    const r = radius * (0.5 + 1.0 * t);
    const alpha = 0.8 * (1 - t);
    // 墨迹波纹：用多段弧线模拟抖动
    const segments = 16;
    g.moveTo(Math.cos(0) * r, Math.sin(0) * r);
    for (let s = 1; s <= segments; s++) {
      const angle = (s / segments) * Math.PI * 2;
      const jitter = 1 + (Math.random() - 0.5) * 0.05;
      g.lineTo(Math.cos(angle) * r * jitter, Math.sin(angle) * r * jitter);
    }
    g.stroke({ color: palette.glow, width: 1.2, alpha });
  }

  /** 绘制墨迹箭头（带飞白效果） */
  private drawTrailArrow(g: PIXI.Graphics, radius: number, flowDir: number, palette: Palette): void {
    g.clear();
    const innerR = radius * 0.4;
    const outerR = radius * 0.95;
    const tipX = Math.cos(flowDir) * outerR;
    const tipY = Math.sin(flowDir) * outerR;
    const tailX = Math.cos(flowDir) * innerR;
    const tailY = Math.sin(flowDir) * innerR;
    // 主线（带飞白：多条平行细线）
    for (let i = 0; i < 3; i++) {
      const offset = (i - 1) * 0.5;
      g.moveTo(tailX + offset, tailY + offset);
      g.lineTo(tipX + offset, tipY + offset);
      g.stroke({ color: palette.highlight, width: 0.6, alpha: 0.4 });
    }
    // 三角箭头头
    const arrowSize = 5;
    const leftA = flowDir + Math.PI - Math.PI / 6;
    const rightA = flowDir + Math.PI + Math.PI / 6;
    g.moveTo(tipX, tipY);
    g.lineTo(tipX + Math.cos(leftA) * arrowSize, tipY + Math.sin(leftA) * arrowSize);
    g.moveTo(tipX, tipY);
    g.lineTo(tipX + Math.cos(rightA) * arrowSize, tipY + Math.sin(rightA) * arrowSize);
    g.stroke({ color: palette.highlight, width: 1, alpha: 0.6 });
  }

  /** 创建漂浮书页（3-5 片，预渲染纹理） */
  private createFloatingPages(radius: number, isAngry: boolean): BookPage[] {
    const count = 3 + Math.floor(Math.random() * 3);
    const pages: BookPage[] = [];
    const texture = isAngry ? bookPageBurnedTexture! : (scrollTextTextures[Math.floor(Math.random() * scrollTextTextures.length)] ?? bookPageTexture!);
    for (let i = 0; i < count; i++) {
      const sprite = new PIXI.Sprite(texture);
      const angle = Math.random() * Math.PI * 2;
      const dist = radius * (0.3 + Math.random() * 0.5);
      sprite.anchor.set(0.5);
      sprite.position.set(Math.cos(angle) * dist, Math.sin(angle) * dist);
      sprite.scale.set(0.5 + Math.random() * 0.4);
      sprite.alpha = 0.3 + Math.random() * 0.2;
      pages.push({
        sprite,
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 1.5,
        driftPhase: Math.random() * Math.PI * 2,
        driftRadius: 3 + Math.random() * 5,
        alpha: sprite.alpha,
        scale: sprite.scale.x,
      });
    }
    return pages;
  }

  /** 生成水滴/书页碎片粒子（70% 水滴 + 30% 书页碎片） */
  private spawnTrailParticles(x: number, y: number, radius: number, palette: Palette): void {
    const s = this.scale;
    const count = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const startDist = radius * s * (0.3 + Math.random() * 0.2);
      const px = x + Math.cos(angle) * startDist;
      const py = y + Math.sin(angle) * startDist;
      const speed = (25 + Math.random() * 20) * s;
      const isPageFragment = Math.random() < 0.3;
      this.particlePool.emit({
        x: px,
        y: py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1500,
        scaleStart: isPageFragment ? 1.2 : 1,
        scaleEnd: 0,
        alphaStart: 0.8,
        alphaEnd: 0,
        tint: isPageFragment ? PARCHMENT_OLD : palette.glow,
        tintStart: isPageFragment ? SCROLL_GOLD : palette.highlight,
        tintEnd: isPageFragment ? INK_BLACK : palette.shadow,
        radius: (1.5 + Math.random() * 1.5) * s,
        rotationSpeed: isPageFragment ? (Math.random() - 0.5) * 8 : 0,
      });
    }
  }
```

- [ ] **Step 4: 实现漩涡牵引 Vortex（triggerVortex + 中心古籍 + 书页螺旋臂 + 翻书声波 + 牵引线）**

在类内追加：

```typescript
  // ═══ 漩涡牵引 Vortex ═══

  /**
   * 触发漩涡牵引视觉效果
   * @param targetId 目标 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param radius 漩涡半径（逻辑 px）
   * @param pullForce 牵引力（0-1，影响牵引线 alpha）
   * @param themeColor 主题色
   * @param isAngry 书生愤怒态
   */
  triggerVortex(
    targetId: string,
    x: number,
    y: number,
    radius: number,
    pullForce: number,
    themeColor: number = FLUID_MAIN,
    isAngry: boolean = false,
  ): void {
    const old = this.activeVortices.get(targetId);
    if (old) {
      this.container.removeChild(old.container);
      old.container.destroy({ children: true });
    }

    const palette = this.buildPalette(isAngry ? ANGER_MAIN : themeColor);
    const container = new PIXI.Container();
    container.position.set(x, y);
    container.scale.set(this.scale);
    this.container.addChild(container);

    const coreGraphics = new PIXI.Graphics();
    this.drawVortexCore(coreGraphics, radius, palette, isAngry);
    container.addChild(coreGraphics);

    const armGraphics = new PIXI.Graphics();
    this.drawVortexArms(armGraphics, radius, palette, isAngry);
    container.addChild(armGraphics);

    const pullGraphics = new PIXI.Graphics();
    this.drawVortexPull(pullGraphics, radius, pullForce, palette);
    container.addChild(pullGraphics);

    const soundWaveGraphics = new PIXI.Graphics();
    container.addChild(soundWaveGraphics);

    this.activeVortices.set(targetId, {
      container,
      coreGraphics,
      armGraphics,
      pullGraphics,
      soundWaveGraphics,
      soundWaveTimer: 0,
      soundWaveRings: [],
      life: 0,
      maxLife: 6000,
      x,
      y,
      radius,
      pullForce,
      palette,
      isAngry,
    });
  }

  /** 移除漩涡牵引 */
  removeVortex(targetId: string): void {
    const vortex = this.activeVortices.get(targetId);
    if (vortex) {
      this.container.removeChild(vortex.container);
      vortex.container.destroy({ children: true });
      this.activeVortices.delete(targetId);
    }
  }

  /** 绘制漩涡核心：6 层同心圆 + 中心古籍（翻开旋转） */
  private drawVortexCore(g: PIXI.Graphics, radius: number, palette: Palette, isAngry: boolean): void {
    g.clear();
    const deepColor = isAngry ? ANGER_DEEP : FLUID_DEEP;
    const coreR = radius * 0.7;
    // 6 层同心圆叠加
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const r = coreR * (0.15 + 0.85 * t);
      const color = t < 0.5 ? this.interpolateColor(palette.primary, deepColor, t * 2) : deepColor;
      const alpha = (1 - t) * 0.25;
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }
    // 中心古籍（翻开的书页：两个矩形模拟左右页）
    const pageColor = isAngry ? BURNED_PAGE : PARCHMENT_OLD;
    const inkColor = isAngry ? 0x4a0a0a : SCROLL_GOLD;
    // 左页
    g.moveTo(-4, -5);
    g.lineTo(-0.5, -5);
    g.lineTo(-0.5, 5);
    g.lineTo(-4, 5);
    g.fill({ color: pageColor, alpha: 0.9 });
    // 右页
    g.moveTo(0.5, -5);
    g.lineTo(4, -5);
    g.lineTo(4, 5);
    g.lineTo(0.5, 5);
    g.fill({ color: pageColor, alpha: 0.9 });
    // 中线（书脊）
    g.moveTo(-0.5, -5);
    g.lineTo(-0.5, 5);
    g.stroke({ color: inkColor, width: 0.8, alpha: 0.8 });
    // 文字线条
    for (let i = -3; i <= 3; i += 2) {
      g.moveTo(-3, i);
      g.lineTo(-1, i);
      g.stroke({ color: inkColor, width: 0.4, alpha: 0.5 });
      g.moveTo(1, i);
      g.lineTo(3, i);
      g.stroke({ color: inkColor, width: 0.4, alpha: 0.5 });
    }
  }

  /** 绘制书页飞舞螺旋臂：3 条螺旋线，每条由小书页沿螺旋路径排列 */
  private drawVortexArms(g: PIXI.Graphics, radius: number, palette: Palette, isAngry: boolean): void {
    g.clear();
    const steps = 8;
    const turns = 1.5;
    const pageColor = isAngry ? BURNED_PAGE : PARCHMENT_OLD;
    for (let i = 0; i < 3; i++) {
      const baseAngle = (i * 2 * Math.PI) / 3;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const theta = t * Math.PI * 2 * turns;
        const r = t * radius;
        const angle = baseAngle + theta;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        // 小书页（矩形，大小从外到内递减）
        const size = 2 + t * 4;
        g.moveTo(x - size / 2, y - size / 2);
        g.lineTo(x + size / 2, y - size / 2);
        g.lineTo(x + size / 2, y + size / 2);
        g.lineTo(x - size / 2, y + size / 2);
        g.fill({ color: pageColor, alpha: 0.6 * (1 - t * 0.5) });
        // 螺旋线连接
        if (s > 1) {
          const prevT = (s - 1) / steps;
          const prevTheta = prevT * Math.PI * 2 * turns;
          const prevR = prevT * radius;
          const prevAngle = baseAngle + prevTheta;
          const prevX = Math.cos(prevAngle) * prevR;
          const prevY = Math.sin(prevAngle) * prevR;
          g.moveTo(prevX, prevY);
          g.lineTo(x, y);
          g.stroke({ color: palette.glow, width: 0.8, alpha: 0.5 });
        }
      }
    }
  }

  /** 绘制墨迹牵引线：4 条 quadraticCurveTo 从外向内汇聚 */
  private drawVortexPull(g: PIXI.Graphics, radius: number, pullForce: number, palette: Palette): void {
    g.clear();
    const baseAlpha = 0.4 + 0.4 * pullForce;
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2 + Math.PI / 4;
      const startX = Math.cos(angle) * radius;
      const startY = Math.sin(angle) * radius;
      const ctrlAngle = angle + Math.PI / 6;
      const ctrlX = Math.cos(ctrlAngle) * radius * 0.6;
      const ctrlY = Math.sin(ctrlAngle) * radius * 0.6;
      g.moveTo(startX, startY);
      g.quadraticCurveTo(ctrlX, ctrlY, 0, 0);
      g.stroke({ color: palette.highlight, width: 1, alpha: baseAlpha });
      // 墨点粒子（起点处）
      g.circle(startX, startY, 1.5);
      g.fill({ color: palette.primary, alpha: baseAlpha });
    }
  }

  /** 绘制翻书声波环（波浪起伏圆环，卷轴金色） */
  private drawSoundWaveRing(g: PIXI.Graphics, radius: number, alpha: number, isAngry: boolean): void {
    const segments = 32;
    const waveAmp = 2;
    const color = isAngry ? ANGER_GLOW : SCROLL_GOLD;
    g.moveTo(Math.cos(0) * (radius + waveAmp), Math.sin(0) * (radius + waveAmp));
    for (let s = 1; s <= segments; s++) {
      const angle = (s / segments) * Math.PI * 2;
      const wave = Math.sin(angle * 8) * waveAmp;
      g.lineTo(Math.cos(angle) * (radius + wave), Math.sin(angle) * (radius + wave));
    }
    g.stroke({ color, width: 1.2, alpha });
  }
```

- [ ] **Step 5: 实现水龙卷爆发 Burst + triggerBurst + 三阶段钩子**

在类内追加：

```typescript
  // ═══ 水龙卷爆发 Burst ═══

  /**
   * 触发水龙卷爆发视觉效果
   * @param playerId 玩家 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param radius 水龙卷半径
   * @param themeColor 主题色
   * @param durationMs 持续时间（ms）
   * @param isAngry 书生愤怒态
   */
  triggerBurst(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor: number = FLUID_MAIN,
    durationMs?: number,
    isAngry: boolean = false,
  ): void {
    const existing = this.activeBursts.get(playerId);
    if (existing) {
      this.removeBurstInstance(existing);
    }

    const palette = this.buildPalette(isAngry ? ANGER_MAIN : themeColor);
    const container = new PIXI.Container();
    container.position.set(x, y);
    container.scale.set(this.scale);
    this.container.addChild(container);

    const columnGraphics = new PIXI.Graphics();
    const armGraphics = new PIXI.Graphics();
    const coreGraphics = new PIXI.Graphics();
    const splashGraphics = new PIXI.Graphics();
    const soundWaveGraphics = new PIXI.Graphics();
    container.addChild(columnGraphics, armGraphics, coreGraphics, splashGraphics, soundWaveGraphics);

    // 书页风暴（20-30 片，带重力飘落物理）
    const stormPages = this.createStormPages(radius, isAngry);
    for (const page of stormPages) {
      container.addChild(page.sprite);
    }

    this.activeBursts.set(playerId, {
      container,
      life: 0,
      maxLife: durationMs ?? 4000,
      themeColor,
      radius,
      particleTimer: 0,
      palette,
      columnGraphics,
      armGraphics,
      coreGraphics,
      splashGraphics,
      soundWaveGraphics,
      soundWaveTimer: 0,
      stormPages,
      soundWaveRings: [],
      x,
      y,
      isAngry,
    });
  }

  /** 创建书页风暴（20-30 片，带独立旋转+飘落物理） */
  private createStormPages(radius: number, isAngry: boolean): BookPage[] {
    const count = 20 + Math.floor(Math.random() * 11);
    const pages: BookPage[] = [];
    const texture = isAngry ? bookPageBurnedTexture! : bookPageTexture!;
    for (let i = 0; i < count; i++) {
      const sprite = new PIXI.Sprite(texture);
      const angle = Math.random() * Math.PI * 2;
      const dist = radius * (0.2 + Math.random() * 0.8);
      sprite.anchor.set(0.5);
      sprite.position.set(Math.cos(angle) * dist, Math.sin(angle) * dist);
      sprite.scale.set(0.4 + Math.random() * 0.6);
      sprite.alpha = 0.5 + Math.random() * 0.3;
      pages.push({
        sprite,
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 6,
        driftPhase: Math.random() * Math.PI * 2,
        driftRadius: 5 + Math.random() * 15,
        alpha: sprite.alpha,
        scale: sprite.scale.x,
      });
    }
    return pages;
  }

  /** 绘制水龙卷主体：10 层渐变同心圆 + 多层椭圆模拟 3D 柱体 */
  private drawBurstColumn(g: PIXI.Graphics, radius: number, palette: Palette, progress: number, isAngry: boolean): void {
    g.clear();
    const deepColor = isAngry ? ANGER_DEEP : FLUID_DEEP;
    // 10 层同心圆
    for (let i = 0; i < 10; i++) {
      const t = i / 9;
      const r = radius * (0.1 + 0.9 * t) * progress;
      const color = t < 0.5 ? this.interpolateColor(palette.primary, deepColor, t * 2) : deepColor;
      const alpha = (1 - t) * 0.2 * progress;
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }
    // 多层椭圆模拟 3D 柱体
    for (let i = 0; i < 4; i++) {
      const t = i / 3;
      g.ellipse(0, 0, radius * progress * (0.3 + t * 0.2), radius * progress * (0.1 + t * 0.05));
      g.stroke({ color: palette.glow, width: 0.8, alpha: 0.4 * progress });
    }
  }

  /** 绘制螺旋水臂：4 条阿基米德螺旋 */
  private drawBurstArms(g: PIXI.Graphics, radius: number, palette: Palette, progress: number): void {
    g.clear();
    const steps = 24;
    const turns = 1.5;
    for (let i = 0; i < 4; i++) {
      const baseAngle = (i * Math.PI) / 2;
      g.moveTo(0, 0);
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const theta = t * Math.PI * 2 * turns;
        const r = t * radius * progress;
        const angle = baseAngle + theta;
        g.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
      }
      g.stroke({ color: palette.glow, width: 1.5, alpha: 0.7 * progress });
    }
  }

  /** 绘制中心古籍核心（翻开旋转） */
  private drawBurstCore(g: PIXI.Graphics, radius: number, palette: Palette, progress: number, isAngry: boolean): void {
    g.clear();
    const pageColor = isAngry ? BURNED_PAGE : PARCHMENT_OLD;
    const inkColor = isAngry ? 0x4a0a0a : SCROLL_GOLD;
    const size = radius * 0.15 * progress;
    // 古籍翻开（两个梯形模拟左右页）
    g.moveTo(-size, -size * 0.8);
    g.lineTo(-size * 0.1, -size);
    g.lineTo(-size * 0.1, size);
    g.lineTo(-size, size * 0.8);
    g.fill({ color: pageColor, alpha: 0.85 });
    g.moveTo(size * 0.1, -size);
    g.lineTo(size, -size * 0.8);
    g.lineTo(size, size * 0.8);
    g.lineTo(size * 0.1, size);
    g.fill({ color: pageColor, alpha: 0.85 });
    // 书脊
    g.moveTo(-size * 0.1, -size);
    g.lineTo(-size * 0.1, size);
    g.stroke({ color: inkColor, width: 1, alpha: 0.8 });
    // 文字线条
    for (let i = -2; i <= 2; i++) {
      g.moveTo(-size * 0.8, i * size * 0.3);
      g.lineTo(-size * 0.2, i * size * 0.3);
      g.stroke({ color: inkColor, width: 0.3, alpha: 0.5 });
      g.moveTo(size * 0.2, i * size * 0.3);
      g.lineTo(size * 0.8, i * size * 0.3);
      g.stroke({ color: inkColor, width: 0.3, alpha: 0.5 });
    }
  }

  /** 绘制水花范围环 */
  private drawBurstSplash(g: PIXI.Graphics, radius: number, palette: Palette, progress: number): void {
    g.clear();
    g.circle(0, 0, radius * progress);
    g.stroke({ color: palette.highlight, width: 2, alpha: 0.5 * (1 - progress) });
  }

  // ═══ 三阶段动画钩子 ═══

  protected phase1Charge(burst: ActiveBurstBase, t: number): void {
    const b = burst as ActiveFluidBurst;
    const ease = this.easeOutCubic(t);
    // 水流向心汇聚（光环收缩）
    b.columnGraphics.clear();
    const shrinkR = b.radius * (1 - ease * 0.7);
    for (let i = 0; i < 8; i++) {
      const layerT = i / 7;
      const r = shrinkR * (0.15 + 0.85 * layerT);
      b.columnGraphics.circle(0, 0, r);
      b.columnGraphics.fill({ color: b.palette.primary, alpha: 0.15 * (1 - layerT) });
    }
    // 古籍浮现（scale 0→1 + alpha 0→1）
    this.drawBurstCore(b.coreGraphics, b.radius * 0.5, b.palette, ease, b.isAngry);
    b.coreGraphics.alpha = ease;
    // 向心粒子
    b.particleTimer += 16;
    if (b.particleTimer > 40) {
      b.particleTimer = 0;
      this.spawnConvergeParticles(b, 2);
    }
    b.armGraphics.alpha = 0;
    b.splashGraphics.alpha = 0;
  }

  protected phase2Burst(burst: ActiveBurstBase, t: number): void {
    const b = burst as ActiveFluidBurst;
    const ease = this.easeOutCubic(t);
    // 水龙卷主体爆发
    this.drawBurstColumn(b.columnGraphics, b.radius, b.palette, ease, b.isAngry);
    b.columnGraphics.alpha = 1;
    // 螺旋水臂
    this.drawBurstArms(b.armGraphics, b.radius, b.palette, ease);
    b.armGraphics.alpha = 1;
    // 中心古籍旋转
    b.coreGraphics.rotation = ease * Math.PI * 2;
    // 水花范围环
    this.drawBurstSplash(b.splashGraphics, b.radius, b.palette, ease);
    b.splashGraphics.alpha = 1;
    // 翻书声波环扩散（阶段2扩散3圈）
    b.soundWaveTimer += 16;
    if (b.soundWaveTimer > 200) {
      b.soundWaveTimer = 0;
      b.soundWaveRings.push({ radius: 0, alpha: 0.8, life: 0 });
    }
    this.updateSoundWaves(b);
    // 书页风暴飞舞 + 碎片粒子
    b.particleTimer += 16;
    if (b.particleTimer > 50) {
      b.particleTimer = 0;
      this.spawnStormParticles(b, 3);
    }
  }

  protected phase3Diffuse(burst: ActiveBurstBase, t: number): void {
    const b = burst as ActiveFluidBurst;
    const ease = this.easeOutCubic(t);
    // 水龙卷主体消散（scale 扩张 + alpha 衰减）
    b.columnGraphics.scale.set(1 + ease * 0.5);
    b.columnGraphics.alpha = 1 - ease;
    // 螺旋水臂消散
    b.armGraphics.alpha = (1 - ease) * 0.6;
    // 中心古籍核心残留淡出
    b.coreGraphics.alpha = (1 - ease) * 0.7;
    // 余波涟漪（4 层细环扩散）
    b.splashGraphics.clear();
    for (let i = 0; i < 4; i++) {
      const ringT = (ease + i * 0.25) % 1;
      const r = b.radius * (0.5 + ringT * 1.5);
      b.splashGraphics.circle(0, 0, r);
      b.splashGraphics.stroke({ color: b.palette.glow, width: 0.8, alpha: 0.4 * (1 - ringT) });
    }
    b.splashGraphics.alpha = 1;
    // 翻书声波环持续扩散但渐弱
    this.updateSoundWaves(b);
    // 书页飘落（ay 重力生效）
    b.particleTimer += 16;
    if (b.particleTimer > 80) {
      b.particleTimer = 0;
      this.spawnStormParticles(b, 1);
    }
  }

  /** 更新翻书声波环 */
  private updateSoundWaves(b: ActiveFluidBurst): void {
    b.soundWaveGraphics.clear();
    const alive: typeof b.soundWaveRings = [];
    for (const ring of b.soundWaveRings) {
      ring.life += 16;
      const t = ring.life / 1500;
      if (t >= 1) continue;
      ring.radius = b.radius * 1.5 * t;
      ring.alpha = 0.8 * (1 - t);
      this.drawSoundWaveRing(b.soundWaveGraphics, ring.radius, ring.alpha, b.isAngry);
      alive.push(ring);
    }
    b.soundWaveRings = alive;
  }

  /** 生成向心汇聚粒子（阶段1） */
  private spawnConvergeParticles(b: ActiveFluidBurst, count: number): void {
    const s = this.scale;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = b.radius * s * 0.8;
      const px = b.x + Math.cos(angle) * dist;
      const py = b.y + Math.sin(angle) * dist;
      this.particlePool.emit({
        x: px,
        y: py,
        vx: -Math.cos(angle) * 60,
        vy: -Math.sin(angle) * 60,
        life: 600,
        scaleStart: 1,
        scaleEnd: 0,
        alphaStart: 0.8,
        alphaEnd: 0,
        tint: b.palette.glow,
        radius: 1.5 * s,
        drag: 0.5,
      });
    }
  }

  /** 生成书页风暴碎片粒子（阶段2/3，带重力+颜色渐变） */
  private spawnStormParticles(b: ActiveFluidBurst, count: number): void {
    const s = this.scale;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (40 + Math.random() * 60) * s;
      const isPage = Math.random() < 0.5;
      this.particlePool.emit({
        x: b.x,
        y: b.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 30,
        ax: 0,
        ay: 150, // 重力下落
        drag: 0.3,
        life: 1000 + Math.random() * 800,
        scaleStart: isPage ? 1.5 : 1,
        scaleEnd: 0,
        alphaStart: 0.9,
        alphaEnd: 0,
        tint: isPage ? (b.isAngry ? BURNED_PAGE : PARCHMENT_OLD) : b.palette.glow,
        tintStart: isPage ? (b.isAngry ? 0x4a0a0a : SCROLL_GOLD) : b.palette.highlight,
        tintEnd: isPage ? (b.isAngry ? 0x1a0a0a : INK_BLACK) : b.palette.shadow,
        radius: (1.5 + Math.random() * 2) * s,
        rotationSpeed: (Math.random() - 0.5) * 10,
      });
    }
  }
```

- [ ] **Step 6: 实现 update + 生命周期方法（clear/onScaleChange/destroy/removeBurstInstance）**

在类内追加：

```typescript
  // ═══ 生命周期 ═══

  update(dt: number): void {
    // 更新水流尾迹
    this.activeTrails.forEach((trail) => {
      if (trail.container.destroyed) return;
      trail.life += dt;
      // 光环呼吸
      const breath = 1 + 0.05 * Math.sin(trail.life * 0.002 * Math.PI);
      trail.auraGraphics.scale.set(breath);
      // 墨迹波纹扩散重绘
      trail.rippleGraphics.clear();
      for (let i = 0; i < 3; i++) {
        trail.rippleLife[i] += dt;
        if (trail.rippleLife[i] > trail.rippleMaxLife) {
          trail.rippleLife[i] -= trail.rippleMaxLife;
        }
        this.drawTrailRipple(trail.rippleGraphics, trail.radius, trail.rippleLife[i], trail.rippleMaxLife, trail.palette);
      }
      // 漂浮书页旋转 + 漂浮轨迹
      for (const page of trail.bookPages) {
        page.rotation += page.rotationSpeed * (dt / 1000);
        page.driftPhase += dt * 0.001;
        const driftX = Math.cos(page.driftPhase) * page.driftRadius;
        const driftY = Math.sin(page.driftPhase) * page.driftRadius;
        page.sprite.position.set(page.x + driftX, page.y + driftY);
        page.sprite.rotation = page.rotation;
      }
      // 粒子节流（每 800ms）
      trail.particleTimer += dt;
      if (trail.particleTimer > 800) {
        trail.particleTimer = 0;
        this.spawnTrailParticles(trail.x, trail.y, trail.radius, trail.palette);
      }
    });

    // 更新漩涡牵引
    this.activeVortices.forEach((vortex) => {
      if (vortex.container.destroyed) return;
      vortex.life += dt;
      // 核心旋转（古籍旋转）
      vortex.coreGraphics.rotation = vortex.life * 0.001 * Math.PI;
      // 螺旋臂旋转
      vortex.armGraphics.rotation = -vortex.life * 0.0008 * Math.PI;
      // 翻书声波环扩散
      vortex.soundWaveTimer += dt;
      if (vortex.soundWaveTimer > SOUND_WAVE_INTERVAL) {
        vortex.soundWaveTimer = 0;
        vortex.soundWaveRings.push({ radius: 0, alpha: 0.8, life: 0 });
      }
      vortex.soundWaveGraphics.clear();
      const aliveRings: typeof vortex.soundWaveRings = [];
      for (const ring of vortex.soundWaveRings) {
        ring.life += dt;
        const t = ring.life / 1500;
        if (t >= 1) continue;
        ring.radius = vortex.radius * 1.5 * t;
        ring.alpha = 0.8 * (1 - t);
        this.drawSoundWaveRing(vortex.soundWaveGraphics, ring.radius, ring.alpha, vortex.isAngry);
        aliveRings.push(ring);
      }
      vortex.soundWaveRings = aliveRings;
    });

    // 更新水龙卷爆发（三阶段动画调度）
    const expired: string[] = [];
    this.activeBursts.forEach((burst, key) => {
      if (burst.container.destroyed) {
        expired.push(key);
        return;
      }
      // 书页风暴飞舞旋转 + 飘落物理
      for (const page of burst.stormPages) {
        page.rotation += page.rotationSpeed * (dt / 1000);
        page.driftPhase += dt * 0.001;
        const driftX = Math.cos(page.driftPhase) * page.driftRadius;
        const driftY = Math.sin(page.driftPhase) * page.driftRadius;
        page.sprite.position.set(page.x + driftX, page.y + driftY);
        page.sprite.rotation = page.rotation;
      }
      const isExpired = this.runBurstAnimation(burst, dt);
      if (isExpired) {
        expired.push(key);
      }
    });
    for (const key of expired) {
      const b = this.activeBursts.get(key);
      if (b) this.removeBurstInstance(b);
      this.activeBursts.delete(key);
    }
  }

  private removeBurstInstance(b: ActiveFluidBurst): void {
    this.container.removeChild(b.container);
    b.container.destroy({ children: true });
  }

  protected onScaleChange(scale: number): void {
    this.activeTrails.forEach((t) => {
      if (!t.container.destroyed) t.container.scale.set(scale);
    });
    this.activeVortices.forEach((v) => {
      if (!v.container.destroyed) v.container.scale.set(scale);
    });
    this.activeBursts.forEach((b) => {
      if (!b.container.destroyed) b.container.scale.set(scale);
    });
  }

  clear(): void {
    this.activeTrails.forEach((t) => {
      this.container.removeChild(t.container);
      t.container.destroy({ children: true });
    });
    this.activeTrails.clear();
    this.activeVortices.forEach((v) => {
      this.container.removeChild(v.container);
      v.container.destroy({ children: true });
    });
    this.activeVortices.clear();
    this.activeBursts.forEach((b) => {
      this.container.removeChild(b.container);
      b.container.destroy({ children: true });
    });
    this.activeBursts.clear();
  }
}
```

- [ ] **Step 7: 前端编译验证**

Run: `cd game/frontend && npm run build`
Expected: 编译成功，0 错误 0 警告

- [ ] **Step 8: 提交前端渲染器重写**

```bash
cd game/frontend
git add src/components/fish-oil-battle/renderer/entities/FluidMasteryRenderer.ts
git commit -m "feat(KE): 重写FluidMasteryRenderer为书海潮汐方案(继承基类+预渲染书页+三阶段动画+人设彩蛋)"
```

---

## Task 3: 前端集成点传递 isAngry（EffectRenderer + CyberFishRenderer + useFishOilBattle）

**Files:**
- Modify: `game/frontend/src/components/fish-oil-battle/renderer/entities/EffectRenderer.ts:964-1015`
- Modify: `game/frontend/src/components/fish-oil-battle/renderer/CyberFishRenderer.ts:593-627`
- Modify: `game/frontend/src/components/fish-oil-battle/useFishOilBattle.ts:556-590`

- [ ] **Step 1: EffectRenderer.ts 三个 triggerFluid 方法加 isAngry 参数**

打开 `game/frontend/src/components/fish-oil-battle/renderer/entities/EffectRenderer.ts`。

1a. 修改 `triggerFluidTrail`（约 964 行），增加 `isAngry` 参数并传递：

```typescript
  /** 触发水流尾迹视觉效果（常驻光环） */
  triggerFluidTrail(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    flowDir: number,
    themeColor?: number,
    isAngry?: boolean,
  ): void {
    this.fluidMasteryRenderer.triggerTrail(playerId, x, y, radius, flowDir, themeColor, isAngry);
  }
```

1b. 修改 `triggerFluidVortex`（约 986 行），增加 `isAngry` 参数并传递：

```typescript
  /** 触发漩涡牵引视觉效果 */
  triggerFluidVortex(
    targetId: string,
    x: number,
    y: number,
    radius: number,
    pullForce: number,
    themeColor?: number,
    isAngry?: boolean,
  ): void {
    this.fluidMasteryRenderer.triggerVortex(targetId, x, y, radius, pullForce, themeColor, isAngry);
  }
```

1c. 修改 `triggerFluidBurst`（约 1003 行），增加 `isAngry` 参数并传递：

```typescript
  /** 触发水龙卷爆发视觉效果 */
  triggerFluidBurst(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor?: number,
    durationMs?: number,
    isAngry?: boolean,
  ): void {
    const cfg = this.buildFluidMasteryVisualCfg();
    this.fluidMasteryRenderer.triggerBurst(
      playerId, x, y, radius, themeColor, durationMs ?? cfg.burstDurationMs, isAngry,
    );
  }
```

- [ ] **Step 2: CyberFishRenderer.ts 三个 KE case 传递 isAngry**

打开 `game/frontend/src/components/fish-oil-battle/renderer/CyberFishRenderer.ts`。

2a. 首先在 `triggerSkillEffect` 的 config 参数类型中（约 271 行 `}): void {` 之前）增加 `isAngry` 字段。在 `hunterY?: number;` 之后新增：

```typescript
    /** 追猎协议：追猎者位置 Y（PURSUIT_PROTOCOL_MARK 专用，追踪线起点） */
    hunterY?: number;
    /** KE：书生愤怒态（hp<30% 时触发，色系切换为深红） */
    isAngry?: boolean;
  }): void {
```

2b. 修改 `FLUID_MASTERY_TRAIL` case（约 593 行），传递 `isAngry`：

```typescript
      case VisualEventType.FLUID_MASTERY_TRAIL:
        // KE 水流尾迹
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerFluidTrail(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.radius ?? 45,
            config.flowDir ?? 0,
            themeColor ?? config.factionColor,
            config.isAngry,
          );
        }
        break;
```

2c. 修改 `FLUID_MASTERY_VORTEX` case（约 605 行），传递 `isAngry`：

```typescript
      case VisualEventType.FLUID_MASTERY_VORTEX:
        // KE 漩涡牵引
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerFluidVortex(
            config.targetId ?? '',
            mapCfg.x, mapCfg.y,
            config.radius ?? 45,
            config.pullForce ?? 0.5,
            themeColor ?? config.factionColor,
            config.isAngry,
          );
        }
        break;
```

2d. 修改 `FLUID_MASTERY_BURST` case（约 617 行），传递 `isAngry`：

```typescript
      case VisualEventType.FLUID_MASTERY_BURST:
        // KE 水龙卷爆发
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerFluidBurst(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.radius ?? 220,
            themeColor ?? config.factionColor,
            undefined,
            config.isAngry,
          );
        }
        break;
```

- [ ] **Step 3: useFishOilBattle.ts 三个 KE case 读取 data.isAngry**

打开 `game/frontend/src/components/fish-oil-battle/useFishOilBattle.ts`。

3a. 修改 `FLUID_MASTERY_TRAIL` case（约 556 行），增加 `isAngry`：

```typescript
      case VisualEventType.FLUID_MASTERY_TRAIL:
        // KE 水流尾迹
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            playerId: data.playerId,
            x: data.x, y: data.y,
            radius: data.radius ?? 45,
            flowDir: data.fluidFlowDir ?? 0,
            isAngry: data.isAngry,
          });
        }
        break;
```

3b. 修改 `FLUID_MASTERY_VORTEX` case（约 568 行），增加 `isAngry`：

```typescript
      case VisualEventType.FLUID_MASTERY_VORTEX:
        // KE 漩涡牵引
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            targetId: data.targetId,
            x: data.x, y: data.y,
            radius: data.radius ?? 45,
            pullForce: data.fluidPullForce ?? 0.5,
            isAngry: data.isAngry,
          });
        }
        break;
```

3c. 修改 `FLUID_MASTERY_BURST` case（约 580 行），增加 `isAngry`：

```typescript
      case VisualEventType.FLUID_MASTERY_BURST:
        // KE 水龙卷爆发
        if (data.x !== undefined && data.y !== undefined) {
          rendererRef.value.triggerSkillEffect({
            type: data.type,
            playerId: data.playerId,
            x: data.x, y: data.y,
            radius: data.radius ?? 220,
            isAngry: data.isAngry,
          });
        }
        break;
```

- [ ] **Step 4: 前端编译验证**

Run: `cd game/frontend && npm run build`
Expected: 编译成功，0 错误 0 警告

- [ ] **Step 5: 提交前端集成点改动**

```bash
cd game/frontend
git add src/components/fish-oil-battle/renderer/entities/EffectRenderer.ts src/components/fish-oil-battle/renderer/CyberFishRenderer.ts src/components/fish-oil-battle/useFishOilBattle.ts
git commit -m "feat(KE): isAngry字段前端全链路打通(EffectRenderer+CyberFishRenderer+useFishOilBattle)"
```

---

## Task 4: 全量编译验证 + 视觉验证

- [ ] **Step 1: 前后端全量编译**

Run: `cd game/backend && npm run build`
Expected: 编译成功

Run: `cd game/frontend && npm run build`
Expected: 编译成功，0 错误 0 警告

- [ ] **Step 2: 视觉验证（EffectTestPage）**

Run: `cd game/frontend && npm run dev`
打开浏览器 EffectTestPage，验证：
1. 水流尾迹：8 层光环 + 漂浮书页 + 墨迹波纹 + 墨迹箭头
2. 漩涡牵引：中心古籍 + 书页螺旋 + 翻书声波
3. 水龙卷爆发：三阶段（古籍浮现→书页风暴→落雨飘落）+ 翻书声波
4. 书生愤怒态：色系切换为深红（手动调用 setHpRatio(0.2) 测试）

- [ ] **Step 3: 实战验证**

在对战中验证：
- KE 移动留尾迹（含书页）
- 被击触发漩涡（含古籍+声波）
- 能量满爆发水龙卷（含书页风暴）
- hp<30% 时色系变深红（书生愤怒态）
