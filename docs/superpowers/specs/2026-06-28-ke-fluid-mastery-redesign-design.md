# KE 流体操控彻底重写设计（书海潮汐方案）

## 1. 背景与问题诊断

### 1.1 现状
KE（流体操控）是已完整实现的联动角色武器：
- 后端 `FluidMasteryWeapon.ts`（310 行）：水流尾迹/漩涡反击/水龙卷爆发
- 前端 `FluidMasteryRenderer.ts`（~830 行）：8 层光环 + 螺旋线 + 箭头 + 粒子

### 1.2 问题
1. **前端视觉不够震撼**：简单同心圆叠加 + 螺旋线，与 9 个基础武器重写前同样"模板化"
2. **人设彩蛋完全缺失**：设计文档定义的 4 项彩蛋（书页文字/翻书声/小动物避让/书生愤怒）均未实现
3. **数值偏高**：代码 `damage:8, burstDamage:45`，设计文档 `damage:2, burstDamage:15`
4. **未利用 ParticlePool 扩展**：未使用 gravity/drag/color gradient 等新物理参数

### 1.3 KE 人设（设计文档）
- 古籍书馆书生，热爱阅读
- 水流中浮现书页文字（古籍书馆）
- 水龙卷中心有翻书声环绕
- 对手是小动物相关召唤物时水流自动避开
- 尾迹颜色在血量低于 30% 时变深红（"书生的愤怒"）

## 2. 设计目标

1. **视觉震撼**：按"闲乘月标准"重写，多层渐变 + 独特视觉符号 + 三阶段动画
2. **人设落地**：实现书页文字/翻书声波/书生愤怒 3 项彩蛋（小动物避让 YAGNI）
3. **数值平衡**：按设计文档对齐
4. **继承基类**：继承 `BaseWeaponEffectRenderer`，复用对象池/调色板/三阶段骨架
5. **API 兼容**：`triggerTrail` / `triggerVortex` / `triggerBurst` / `update` / `setScale` / `clear` / `destroy` 签名不变，新增 `setHpRatio`

## 3. 架构设计

### 3.1 文件清单
| 操作 | 文件 | 职责 |
|------|------|------|
| 重写 | `renderer/entities/FluidMasteryRenderer.ts` | 前端视觉（继承基类） |
| 修改 | `skills/weapons/FluidMasteryWeapon.ts` | 后端逻辑（数值+isAngry） |
| 修改 | `config/WeaponRangeConfig.ts` | KE 数值调整 |
| 不变 | `EffectRenderer.ts` | 上层路由（API 不变） |
| 不变 | `CyberFishRenderer.ts` | 特效分发（API 不变） |
| 不变 | `useFishOilBattle.ts` | 事件接收（API 不变） |

### 3.2 类结构
```
FluidMasteryRenderer extends BaseWeaponEffectRenderer
├── activeTrails: Map<string, ActiveTrail>      // 水流尾迹
├── activeVortices: Map<string, ActiveVortex>    // 漩涡牵引
├── activeBursts: Map<string, ActiveBurst>        // 水龙卷爆发
├── hpRatio: number                              // 血量比例（0-1）
├── isAngry: boolean                             // 书生愤怒态
│
├── triggerTrail(playerId, x, y, radius, flowDir, themeColor?, isAngry?)
├── updateTrail(playerId, x, y, flowDir)
├── removeTrail(playerId)
├── triggerVortex(targetId, x, y, radius, pullForce, themeColor?, isAngry?)
├── removeVortex(targetId)
├── triggerBurst(playerId, x, y, radius, themeColor?, durationMs?, isAngry?)
├── setHpRatio(hpRatio: number)                  // 新增：血量同步
├── setScale(scale, canvasW?, canvasH?)          // 继承
├── update(dt)                                   // abstract 实现
├── clear()                                      // abstract 实现
├── destroy()                                    // 继承
│
├── phase1Charge(burst, t)                       // override：蓄压
├── phase2Burst(burst, t)                        // override：爆发
├── phase3Diffuse(burst, t)                      // override：扩散
└── onScaleChange(scale)                         // override
```

### 3.3 预渲染纹理
为性能预渲染以下纹理（在构造函数或静态初始化时生成）：
- `bookPageTexture`：古籍书页纹理（矩形 + 古籍黄底 + 模糊文字线条）
- `bookPageBurnedTexture`：焦黑书页纹理（书生愤怒态用）
- `scrollTextTexture`：古籍文字纹理（用于尾迹漂浮书页）

## 4. 颜色系统（双轨）

### 4.1 水系基础色
```typescript
const FLUID_DEEP = 0x0044aa;      // 深海蓝
const FLUID_MAIN = 0x0099ff;      // 主水蓝
const FLUID_LIGHT = 0x66ccff;     // 浅水蓝
const FLUID_HIGHLIGHT = 0xaaeeff; // 高亮浅蓝
const FLUID_WHITE = 0xffffff;     // 浪花白
const FLUID_FOAM = 0xe0f4ff;      // 泡沫白蓝
```

### 4.2 古籍人设色
```typescript
const PARCHMENT_OLD = 0xd4b896;   // 古籍黄（书页底色）
const INK_BLACK = 0x1a1a2e;        // 墨黑（文字）
const SCROLL_GOLD = 0xc9a961;     // 卷轴金（书页边缘/声波）
```

### 4.3 书生愤怒态色
```typescript
const ANGER_DEEP = 0x4a0a0a;      // 深红
const ANGER_MAIN = 0xcc2200;      // 主红
const ANGER_GLOW = 0xff6633;      // 橙红
const BURNED_PAGE = 0x2a2a2a;     // 焦黑书页
```

### 4.4 调色板派生
- 正常态：`buildPalette(FLUID_MAIN)` → primary=水蓝/glow/highlight/dim/shadow/accent
- 愤怒态：`buildPalette(ANGER_MAIN)` → primary=主红/glow=橙红/...
- 切换由 `isAngry` 字段控制，`setHpRatio` 更新 `isAngry = hpRatio < 0.3`

## 5. 水流尾迹 Trail 详细设计

### 5.1 数据结构
```typescript
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

interface ActiveTrail {
  container: PIXI.Container;
  auraGraphics: PIXI.Graphics;      // 8 层光环
  rippleGraphics: PIXI.Graphics;   // 3 条墨迹波纹
  arrowGraphics: PIXI.Graphics;    // 墨迹箭头
  bookPages: BookPage[];           // 漂浮书页（3-5 片）
  particleTimer: number;
  rippleLife: number[];
  rippleMaxLife: number;
  life: number;
  maxLife: number;
  x: number;
  y: number;
  radius: number;
  flowDir: number;
  isAngry: boolean;
}
```

### 5.2 视觉元素
1. **水流光环**：8 层径向渐变（主水蓝→深海蓝→透明）+ ADD 混合模式
2. **漂浮书页**：3-5 片半透明古籍书页缓慢漂浮旋转
   - 书页用预渲染纹理
   - 每片独立旋转速度 + 贝塞尔漂浮轨迹
   - 大小 8-14px，alpha 0.3-0.5
3. **墨迹波纹**：3 条扩散环，环线带轻微抖动（墨水扩散感）
4. **墨迹箭头**：带飞白效果的流向箭头
5. **水滴+书页碎片粒子**：70% 水滴 + 30% 书页碎片
6. **书生愤怒态**：水色变深红，书页变焦黑，光环加红色辉光边缘

### 5.3 触发签名
```typescript
triggerTrail(
  playerId: string,
  x: number, y: number,
  radius: number,
  flowDir: number,
  themeColor?: number,    // 默认 FLUID_MAIN
  isAngry?: boolean,       // 新增：书生愤怒态
): void
```

## 6. 漩涡牵引 Vortex 详细设计

### 6.1 数据结构
```typescript
interface ActiveVortex {
  container: PIXI.Container;
  coreGraphics: PIXI.Graphics;       // 漩涡核心 + 中心古籍
  armGraphics: PIXI.Graphics;        // 书页飞舞螺旋臂
  pullGraphics: PIXI.Graphics;       // 墨迹牵引线
  soundWaveGraphics: PIXI.Graphics;  // 翻书声波环
  soundWaveTimer: number;
  soundWaveRings: Array<{ radius: number; alpha: number }>;
  life: number;
  maxLife: number;
  x: number;
  y: number;
  radius: number;
  pullForce: number;
  themeColor: number;
  isAngry: boolean;
}
```

### 6.2 视觉元素
1. **漩涡核心**：6 层渐变 + 中心古籍（翻开的书页纹理，随漩涡旋转）
2. **书页飞舞螺旋臂**：3 条螺旋臂，每条由 8-10 片小书页沿螺旋路径排列
   - 书页随螺旋臂旋转
   - 大小从外到内递减（外 6px → 内 2px）
3. **翻书声波环**：每 1.5s 从中心扩散一圈声波环
   - 环线带波浪起伏（模拟声波）
   - alpha 0.6→0，半径 0→radius*1.5
   - 卷轴金色
4. **墨迹牵引线**：4 条 quadraticCurveTo，线宽随距离变化 + 墨点粒子
5. **书生愤怒态**：中心古籍变焦黑，螺旋臂书页变暗红，声波环变红色

### 6.3 触发签名
```typescript
triggerVortex(
  targetId: string,
  x: number, y: number,
  radius: number,
  pullForce: number,
  themeColor?: number,
  isAngry?: boolean,
): void
```

## 7. 水龙卷爆发 Burst 详细设计

### 7.1 数据结构
```typescript
interface ActiveBurst extends ActiveBurstBase {
  columnGraphics: PIXI.Graphics;     // 水龙卷主体
  armGraphics: PIXI.Graphics;        // 螺旋水臂
  coreGraphics: PIXI.Graphics;       // 中心古籍核心
  splashGraphics: PIXI.Graphics;     // 水花范围环
  soundWaveGraphics: PIXI.Graphics;  // 翻书声波环
  stormPages: BookPage[];            // 书页风暴（20-30 片）
  soundWaveRings: Array<{ radius: number; alpha: number }>;
  x: number;
  y: number;
  isAngry: boolean;
}
```

### 7.2 三阶段动画

#### 阶段 1 蓄压（0-15%T）
- 水流从外围向中心汇聚（向心粒子）
- **古籍浮现**：中心古籍书页从地下升起（scale 0→1 + alpha 0→1）
- 环形水流收缩（光环 scale 1.0→0.3）
- 书页碎片向中心聚集

#### 阶段 2 爆发（15-30%T）
- **水龙卷主体爆发**：10 层渐变同心圆 + 多层椭圆模拟 3D 柱体
- **书页风暴**：20-30 片书页沿螺旋轨迹飞舞旋转
  - 每片书页独立旋转 + 飘落物理（ay 重力 + drag 阻力）
  - tintStart/tintEnd 实现古籍黄→水蓝渐变（被水浸染）
- **翻书声波环扩散**：3 圈强烈声波环爆发扩散
  - 波浪起伏 + 卷轴金色
  - 半径快速扩到 radius*1.5
- **中心古籍核心**：翻开的古籍在水龙卷中心旋转
- 水花粒子混入书页碎片（50% 概率）

#### 阶段 3 扩散（30-100%T）
- 水龙卷主体消散（scale 扩张 + alpha 衰减）
- **书页如落雨飘落**：阶段 2 飞舞的书页开始飘落（ay 重力生效）
- 中心古籍核心残留淡出
- 余波涟漪（4 层细环向外扩散）
- 翻书声波环持续扩散但渐弱

### 7.3 书生愤怒态
- 水龙卷色系变深红
- 书页从古籍黄变焦黑
- 翻书声波环变红色
- 中心古籍变焦黑残页

### 7.4 触发签名
```typescript
triggerBurst(
  playerId: string,
  x: number, y: number,
  radius: number,
  themeColor?: number,
  durationMs?: number,
  isAngry?: boolean,
): void
```

## 8. 人设彩蛋实现

### 8.1 书页文字浮现
- 预渲染 3-5 段古籍文字纹理（"鱼排都市志"、"潮生明月"、"书海无涯"、"卷舒云水"、"墨染千秋"）
- 尾迹漂浮书页随机使用这些纹理
- alpha 极低（0.15-0.25），不抢主视觉

### 8.2 翻书声波环
- 波浪起伏圆环模拟声波视觉
- 卷轴金色区分于水流
- 漩涡每 1.5s 扩散一圈，爆发阶段 2 扩散 3 圈

### 8.3 书生愤怒态
- 后端 `FluidMasteryWeapon.onTick` 检测 hp < 30% 时，在 VISUAL_ONLY 事件 metadata 加 `isAngry: true`
- 前端 trigger 方法接收 `isAngry` 参数切换色系
- `setHpRatio(hpRatio)` 实时同步（EffectRenderer 调用）

### 8.4 小动物避让
- **不实现**（YAGNI：需识别对手武器类型，复杂度高，彩蛋优先级低）

## 9. 后端逻辑调整（FluidMasteryWeapon.ts）

### 9.1 数值调整
| 字段 | 现值 | 新值 | 说明 |
|------|------|------|------|
| damage | 8 | 2 | 水流尾迹伤害 |
| burstDamage | 45 | 15 | 水龙卷伤害 |
| maxEnergy | 100 | 4 | 充能次数（命中 4 次满能量） |
| energyPerHit | 12 | 1 | 每次命中 +1 能量 |
| energyPerBurstHit | 25 | 1 | 被击 +1 能量 |
| burstEnergyCost | 100 | 4 | 爆发消耗 4 能量 |

### 9.2 isAngry 字段
- `onTick` 中检测自身 hp < 30% 时设置 `this.isAngry = true`
- 尾迹/漩涡/爆发 VISUAL_ONLY 事件 metadata 加 `isAngry: this.isAngry`
- `getRuntimeState` 的 custom 加 `isAngry` 字段

### 9.3 前端事件接收
`useFishOilBattle.ts` 的 3 个 KE case（TRAIL/VORTEX/BURST）读取 `data` 中新增的 `isAngry` 字段并传入 trigger 方法。需修改这 3 个 case（改动极小）。

## 10. 集成点

### 10.1 EffectRenderer.ts
- `triggerFluidTrail` / `triggerFluidVortex` / `triggerFluidBurst` 签名增加 `isAngry` 参数
- `updateFluidTrail` 签名不变

### 10.2 CyberFishRenderer.ts
- `FLUID_MASTERY_TRAIL` / `VORTEX` / `BURST` case 传递 `isAngry`

### 10.3 useFishOilBattle.ts
- 3 个 KE case 读取 `data.isAngry` 并传入

### 10.4 WeaponRangeConfig.ts
- `[WeaponId.FLUID_MASTERY]` 数值调整

## 11. 测试与验证

### 11.1 编译验证
- `cd game/frontend && npm run build`
- `cd game/backend && npm run build`

### 11.2 视觉验证（EffectTestPage）
1. 水流尾迹：8 层光环 + 漂浮书页 + 墨迹波纹
2. 漩涡牵引：中心古籍 + 书页螺旋 + 翻书声波
3. 水龙卷爆发：三阶段 + 书页风暴 + 翻书声波
4. 书生愤怒态：切换色系（手动测试 setHpRatio）

### 11.3 实战验证
- KE 在对战中移动留尾迹（含书页）
- 被击触发漩涡（含古籍+声波）
- 能量满爆发水龙卷（含书页风暴）

## 12. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 书页纹理预渲染增加启动时间 | 在构造函数一次性生成，纹理极小（16x16） |
| 书页风暴 20-30 片精灵性能 | 用 PIXI.Sprite 对象池（复用基类 graphicsPool 思路） |
| isAngry 状态同步延迟 | setHpRatio 由 EffectRenderer 每帧调用 |
| 数值调整影响平衡 | 按设计文档对齐，可在 P2 全局平衡时再微调 |

## 13. 不在范围内
- 小动物避让彩蛋（YAGNI）
- 后端武器机制重写（仅调整数值+isAngry，机制不变）
- 其他联动角色武器调整（P1 仅 KE）
