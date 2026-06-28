import * as PIXI from 'pixi.js';
import {
  getLogicalW, getLogicalH,
} from '../constants';
import { WEAPON_RANGE_CONFIG } from '$/backend/src/games/fish-oil-battle/config/WeaponRangeConfig';
import { WeaponId } from '$/backend/src/games/fish-oil-battle/config/GameEnums';
import { ParticlePool } from '../systems/ParticlePool';
import { ShapeEffectPool } from '../systems/ShapeEffectPool';
import type { ShapeDescriptor } from '../systems/ShapeRenderer';
import type { ShapeEffectConfig } from './ShapeEffect';
import type { ActiveEffect } from './VisualEffectUtils';
import type { Palette } from './BaseWeaponEffectRenderer';
import {
  ShockwaveEffectRenderer,
} from './ShockwaveEffectRenderer';
import {
  FirewallEffectRenderer,
} from './FirewallEffectRenderer';
import {
  HiveEffectRenderer,
} from './HiveEffectRenderer';
import {
  OpticalSlashEffectRenderer,
} from './OpticalSlashEffectRenderer';
import {
  AirRepulsionFieldRenderer,
} from './AirRepulsionFieldRenderer';
import {
  EntropicTouchRenderer,
} from './EntropicTouchRenderer';
import {
  DrawingManifestRenderer,
} from './DrawingManifestRenderer';
import {
  DischargeCatRenderer,
} from './DischargeCatRenderer';
import {
  PrecognitiveLensRenderer,
} from './PrecognitiveLensRenderer';
import {
  EmotionalWeatherRenderer,
} from './EmotionalWeatherRenderer';
import {
  EmotionMasteryRenderer,
} from './EmotionMasteryRenderer';
import {
  FluidMasteryRenderer,
} from './FluidMasteryRenderer';
import {
  MemoryCorridorRenderer,
} from './MemoryCorridorRenderer';
import {
  InfiniteFoldRenderer,
} from './InfiniteFoldRenderer';
import {
  BotanicalPartyRenderer,
} from './BotanicalPartyRenderer';
import {
  NanoRipperRenderer,
} from './NanoRipperRenderer';
import {
  PursuitProtocolRenderer,
} from './PursuitProtocolRenderer';
import {
  GravityWellRenderer,
} from './GravityWellRenderer';
import {
  EntropyDiffuserRenderer,
} from './EntropyDiffuserRenderer';
import {
  BastionBuilderRenderer,
} from './BastionBuilderRenderer';
import {
  CircuitWeaverRenderer,
} from './CircuitWeaverRenderer';
import {
  QuantumRiftRenderer,
} from './QuantumRiftRenderer';
import {
  SizeWarpRenderer,
} from './SizeWarpRenderer';
import {
  RicochetCoreRenderer,
} from './RicochetCoreRenderer';
import type {
  ShockwaveVisualConfig,
  FirewallVisualConfig,
  HiveVisualConfig,
  OpticalSlashVisualConfig,
} from './VisualEffectUtils';
import type { DrawingManifestVisualConfig } from './DrawingManifestRenderer';
import type { DischargeCatVisualConfig } from './DischargeCatRenderer';
import type { PrecognitiveLensVisualConfig } from './PrecognitiveLensRenderer';
import type { EmotionMasteryVisualConfig } from './EmotionMasteryRenderer';
import type { EmotionalWeatherVisualConfig } from './EmotionalWeatherRenderer';

/** 闲乘月视觉配置（数据驱动） */
interface EntropicTouchVisualConfig {
  auraRadius: number;
  burstRadius: number;
  burstDurationMs: number;
}

/** 基础武器通用视觉配置（场 + 爆发） */
interface BasicWeaponVisualConfig {
  /** 常驻场半径（逻辑 px） */
  fieldRadius: number;
  /** 爆发半径（逻辑 px） */
  burstRadius: number;
  /** 爆发持续时间（ms） */
  burstDurationMs: number;
}

/**
 * 技能特效渲染总协调器
 *
 * v2.1 重构：拆分为独立子渲染器
 * - ShockwaveEffectRenderer：冲击波
 * - FirewallEffectRenderer：防火墙
 * - HiveEffectRenderer：蜂巢（蜂刺/弹射/闪屏/蜂群）
 *
 * 本类负责：
 * - 组合所有子渲染器
 * - 统一管理 ActiveEffect 生命周期
 * - 暴露公开 API（保持向后兼容）
 * - 管理 ShapeEffectPool（通用形状）
 */
export class EffectRenderer {
  // ── 子渲染器 ──────────────────────────────────────────
  private shockwaveRenderer: ShockwaveEffectRenderer;
  private firewallRenderer: FirewallEffectRenderer;
  private hiveRenderer: HiveEffectRenderer;
  private opticalSlashRenderer: OpticalSlashEffectRenderer;
  private airRepulsionFieldRenderer: AirRepulsionFieldRenderer;
  private entropicTouchRenderer: EntropicTouchRenderer;
  private drawingManifestRenderer: DrawingManifestRenderer;
  private dischargeCatRenderer: DischargeCatRenderer;
  private precognitiveLensRenderer: PrecognitiveLensRenderer;
  private emotionalWeatherRenderer: EmotionalWeatherRenderer;
  private emotionMasteryRenderer: EmotionMasteryRenderer;
  private fluidMasteryRenderer: FluidMasteryRenderer;
  private memoryCorridorRenderer: MemoryCorridorRenderer;
  private infiniteFoldRenderer: InfiniteFoldRenderer;
  private botanicalPartyRenderer: BotanicalPartyRenderer;
  // 基础武器子渲染器
  private nanoRipperRenderer: NanoRipperRenderer;
  private pursuitProtocolRenderer: PursuitProtocolRenderer;
  private gravityWellRenderer: GravityWellRenderer;
  private entropyDiffuserRenderer: EntropyDiffuserRenderer;
  private bastionBuilderRenderer: BastionBuilderRenderer;
  private circuitWeaverRenderer: CircuitWeaverRenderer;
  private quantumRiftRenderer: QuantumRiftRenderer;
  private sizeWarpRenderer: SizeWarpRenderer;
  private ricochetCoreRenderer: RicochetCoreRenderer;

  // ── 形状特效池 ────────────────────────────────────────
  private shapeEffectPool: ShapeEffectPool;
  /** 场地持续特效映射：stringKey → shapeEffectId */
  private sustainedShapes: Map<string, number> = new Map();

  // ── 统一特效生命周期 ──────────────────────────────────
  private activeEffects: ActiveEffect[] = [];

  /** 缩放 + 画布 */
  private scale = 1;
  private canvasW = getLogicalW();
  private canvasH = getLogicalH();

  /** 防重复销毁 */
  private _destroyed = false;

  constructor(
    entityContainer: PIXI.Container,
    fieldContainer: PIXI.Container,
    hologramContainer: PIXI.Container,
    particlePool: ParticlePool,
  ) {
    // 初始化子渲染器
    // 冲击波渲染器（注入 particlePool 用于震波飞溅粒子）
    this.shockwaveRenderer = new ShockwaveEffectRenderer(fieldContainer, this.canvasW, this.canvasH, particlePool);
    // 防火墙渲染器（注入 particlePool 用于数据流粒子）
    this.firewallRenderer = new FirewallEffectRenderer(fieldContainer, particlePool);
    this.hiveRenderer = new HiveEffectRenderer(
      entityContainer, hologramContainer, particlePool,
      this.canvasW, this.canvasH,
    );

    // 光学斩击渲染器（注入 particlePool 用于飞行拖尾 / 爆发光学粒子飞溅）
    this.opticalSlashRenderer = new OpticalSlashEffectRenderer(
      fieldContainer, hologramContainer, 20, particlePool,
    );

    // 空气斥力场渲染器（注入 particlePool 用于懒散/扬尘粒子）
    this.airRepulsionFieldRenderer = new AirRepulsionFieldRenderer(fieldContainer, particlePool);

    // 熵寂之触渲染器
    this.entropicTouchRenderer = new EntropicTouchRenderer(fieldContainer, particlePool);

    // 画作实体化渲染器（注入 particlePool 用于墨水粒子）
    this.drawingManifestRenderer = new DrawingManifestRenderer(entityContainer, fieldContainer, particlePool);

    // 放电猫猫渲染器
    this.dischargeCatRenderer = new DischargeCatRenderer(entityContainer, fieldContainer);

    // 预知透镜渲染器
    this.precognitiveLensRenderer = new PrecognitiveLensRenderer(entityContainer, fieldContainer);

    // 情绪天气渲染器
    this.emotionalWeatherRenderer = new EmotionalWeatherRenderer(fieldContainer);

    // 情绪掌控渲染器
    this.emotionMasteryRenderer = new EmotionMasteryRenderer(fieldContainer, entityContainer);

    // 流体操控渲染器（KE）
    this.fluidMasteryRenderer = new FluidMasteryRenderer(fieldContainer, particlePool);
    // 记忆回廊渲染器（梦）
    this.memoryCorridorRenderer = new MemoryCorridorRenderer(fieldContainer, particlePool);
    // 无限折叠渲染器（陈厌孑）
    this.infiniteFoldRenderer = new InfiniteFoldRenderer(fieldContainer, particlePool);

    // 植物伙伴派对渲染器（沐里）
    this.botanicalPartyRenderer = new BotanicalPartyRenderer(fieldContainer, particlePool);

    // 基础武器渲染器（注入 fieldContainer + particlePool，由各自 update 驱动动画）
    this.nanoRipperRenderer = new NanoRipperRenderer(fieldContainer, particlePool);
    this.pursuitProtocolRenderer = new PursuitProtocolRenderer(fieldContainer, particlePool);
    this.gravityWellRenderer = new GravityWellRenderer(fieldContainer, particlePool);
    this.entropyDiffuserRenderer = new EntropyDiffuserRenderer(fieldContainer, particlePool);
    this.bastionBuilderRenderer = new BastionBuilderRenderer(fieldContainer, particlePool);
    this.circuitWeaverRenderer = new CircuitWeaverRenderer(fieldContainer, particlePool);
    this.quantumRiftRenderer = new QuantumRiftRenderer(fieldContainer, particlePool);
    this.sizeWarpRenderer = new SizeWarpRenderer(fieldContainer, particlePool);
    this.ricochetCoreRenderer = new RicochetCoreRenderer(fieldContainer, particlePool);

    // 初始化形状特效池
    this.shapeEffectPool = new ShapeEffectPool(fieldContainer, 20);
  }

  /**
   * 同步缩放因子（由 CyberFishRenderer.resize 驱动）
   */
  setScale(s: number, w: number, h: number): void {
    this.scale = s;
    this.canvasW = w;
    this.canvasH = h;

    this.shockwaveRenderer.setScale(s, w, h);
    this.firewallRenderer.setScale(s);
    this.hiveRenderer.setScale(s, w, h);
    this.opticalSlashRenderer.setScale(s, w, h);
    this.airRepulsionFieldRenderer.setScale(s);
    this.entropicTouchRenderer.setScale(s);
    this.drawingManifestRenderer.setScale(s);
    this.dischargeCatRenderer.setScale(s);
    this.precognitiveLensRenderer.setScale(s);
    this.emotionalWeatherRenderer.setScale(s);
    this.emotionMasteryRenderer.setScale(s);
    this.fluidMasteryRenderer.setScale(s);
    this.memoryCorridorRenderer.setScale(s);
    this.infiniteFoldRenderer.setScale(s);
    this.botanicalPartyRenderer.setScale(s);
    // 基础武器渲染器统一同步缩放
    this.nanoRipperRenderer.setScale(s);
    this.pursuitProtocolRenderer.setScale(s);
    this.gravityWellRenderer.setScale(s);
    this.entropyDiffuserRenderer.setScale(s);
    this.bastionBuilderRenderer.setScale(s);
    this.circuitWeaverRenderer.setScale(s);
    this.quantumRiftRenderer.setScale(s);
    this.sizeWarpRenderer.setScale(s);
    this.ricochetCoreRenderer.setScale(s);
  }

  // ════════════════════════════════════════
  //  公开 API：空气斥力场
  // ════════════════════════════════════════

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

  /**
   * 从 WeaponRangeConfig 构建空气斥力场视觉配置
   */
  private buildAirRepulsionVisualCfg() {
    const rc = WEAPON_RANGE_CONFIG[WeaponId.AIR_REPULSION_FIELD];
    return {
      anchorRadius: rc?.field?.radius ?? 55,
      anchorDurationMs: (rc?.field?.durationSec ?? 5) * 1000,
      burstRadius: rc?.aoeMaxRadius ?? 180,
      burstDurationMs: (rc?.burstDurationSec ?? 4) * 1000,
    };
  }

  // ══════════════════════════════════════════════════════
  //  公开 API：冲击波
  // ══════════════════════════════════════════════════════

  triggerShockwave(
    x: number, y: number,
    isBurst = false,
    _angleOverride = -1,
    themeColor?: number,
    radiusOverride?: number,
    visualCfg?: ShockwaveVisualConfig,
  ): void {
    const dataCfg = this.buildShockwaveVisualCfg(themeColor);
    const cfg: ShockwaveVisualConfig = {
      ...dataCfg,
      ...visualCfg,
      maxRadius: radiusOverride ?? visualCfg?.maxRadius ?? dataCfg.maxRadius,
    };
    const effects = this.shockwaveRenderer.trigger(x, y, isBurst, themeColor, cfg);
    for (const ef of effects) {
      this.activeEffects.push(ef);
    }
  }

  // ══════════════════════════════════════════════════════
  //  公开 API：防火墙
  // ══════════════════════════════════════════════════════

  triggerFirewall(
    x: number, y: number,
    isHardened = false,
    wallId = `fw_${Date.now()}`,
    themeColor?: number,
    _radiusOverride?: number,
    widthOverride?: number,
    heightOverride?: number,
    durationSec?: number,
    visualCfg?: FirewallVisualConfig,
  ): string {
    const cfg: FirewallVisualConfig = {
      ...visualCfg,
      visualWidth: widthOverride ?? visualCfg?.visualWidth,
      visualHeight: heightOverride ?? visualCfg?.visualHeight,
      maxLifeMs: durationSec != null ? durationSec * 1000 : visualCfg?.maxLifeMs,
    };
    const result = this.firewallRenderer.trigger(x, y, isHardened, wallId, themeColor, cfg);
    if (result.effect) {
      this.activeEffects.push(result.effect);
    }
    return result.wallId;
  }

  // ══════════════════════════════════════════════════════
  //  公开 API：蜂巢
  // ══════════════════════════════════════════════════════

  triggerHiveSting(
    fromX: number, fromY: number,
    toX: number, toY: number,
    themeColor?: number,
    visualCfg?: HiveVisualConfig,
  ): void {
    const ef = this.hiveRenderer.triggerSting(fromX, fromY, toX, toY, themeColor, visualCfg);
    if (ef) this.activeEffects.push(ef);
  }

  triggerHiveStingBounce(x: number, y: number, themeColor?: number): void {
    const ef = this.hiveRenderer.triggerStingBounce(x, y, themeColor);
    if (ef) this.activeEffects.push(ef);
  }

  triggerBurstFlash(factionColor: number, duration?: number): void {
    const visualCfg: HiveVisualConfig | undefined = duration != null
      ? { burstFlashDuration: duration }
      : undefined;
    const ef = this.hiveRenderer.triggerBurstFlash(factionColor, visualCfg);
    if (ef) this.activeEffects.push(ef);
  }

  updateHiveBees(
    playerId: string,
    playerX: number, playerY: number,
    beeCount: number, isBurst: boolean,
    dt: number,
    themeColor?: number,
  ): void {
    this.hiveRenderer.updateHiveBees(playerId, playerX, playerY, beeCount, isBurst, dt, themeColor);
  }

  removeHiveBees(playerId: string): void {
    this.hiveRenderer.removeHiveBees(playerId);
  }

  // ══════════════════════════════════════════════════════
  //  公开 API：光学斩击
  // ══════════════════════════════════════════════════════

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

  // ══════════════════════════════════════════════════════
  //  公开 API：通用形状特效
  // ══════════════════════════════════════════════════════

  triggerSustainedShape(
    key: string,
    desc: ShapeDescriptor,
    x: number, y: number,
    config?: {
      pulseSpeed?: number;
      rotationSpeed?: number;
      alphaPulse?: boolean;
      onTick?: (ef: import('./ShapeEffect').ShapeEffect, t: number, dt: number) => void;
    },
  ): string {
    const s = this.scale;

    const effectId = this.shapeEffectPool.acquireSustained(
      {
        shape: desc,
        x, y,
        sustained: true,
        onTick: (_ef, _t, dt) => {
          if (config?.pulseSpeed) {
            const pulse = 1 + 0.1 * Math.sin(_ef.life * config.pulseSpeed);
            _ef.scale = pulse;
          }
          if (config?.rotationSpeed) {
            _ef.rotation += config.rotationSpeed * dt / 1000;
          }
          if (config?.alphaPulse) {
            _ef.alpha = 0.5 + 0.5 * Math.sin(_ef.life / 200);
          }
          config?.onTick?.(_ef, _t, dt);
        },
        onDestroy: () => {
          this.sustainedShapes.delete(key);
        },
      },
      s,
    );

    if (effectId >= 0) {
      this.sustainedShapes.set(key, effectId);
    }
    return key;
  }

  updateSustainedShape(key: string, partial: Partial<ShapeEffectConfig>): void {
    const effectId = this.sustainedShapes.get(key);
    if (effectId === undefined) return;
    this.shapeEffectPool.updateSustained(effectId, partial, this.scale);
  }

  removeSustainedShape(key: string): void {
    const effectId = this.sustainedShapes.get(key);
    if (effectId === undefined) return;
    this.shapeEffectPool.removeSustained(effectId);
  }

  triggerShapeEffect(
    desc: ShapeDescriptor,
    x: number, y: number,
    animCfg?: {
      life?: number;
      scaleStart?: number; scaleEnd?: number;
      alphaStart?: number; alphaEnd?: number;
      rotationSpeed?: number;
      ease?: 'linear' | 'easeOut' | 'easeIn' | 'easeInOut';
    },
  ): void {
    const s = this.scale;
    const maxLife = animCfg?.life ?? 800;

    this.shapeEffectPool.acquire(
      {
        shape: desc,
        x, y,
        sustained: false,
        life: maxLife,
        onTick: (_ef, t) => {
          let pt = t;
          switch (animCfg?.ease) {
            case 'easeOut':
              pt = 1 - Math.pow(1 - t, 3); break;
            case 'easeIn':
              pt = t * t * t; break;
            case 'easeInOut':
              pt = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; break;
          }
          const scaleVal = (animCfg?.scaleStart ?? 0) + ((animCfg?.scaleEnd ?? 1) - (animCfg?.scaleStart ?? 0)) * pt;
          const alphaVal = (animCfg?.alphaStart ?? 1) + ((animCfg?.alphaEnd ?? 0) - (animCfg?.alphaStart ?? 1)) * t;
          _ef.scale = scaleVal;
          _ef.alpha = alphaVal;
          _ef.rotation += (animCfg?.rotationSpeed ?? 0) * (16.67 / 1000);
        },
      },
      s,
    );
  }

  // ══════════════════════════════════════════════════════
  //  数据驱动视觉配置构建
  // ══════════════════════════════════════════════════════

  /**
   * 从 WeaponRangeConfig 构建 ShockwaveVisualConfig
   * 所有视觉参数由后端配置驱动，无硬编码常量
   */
  private buildShockwaveVisualCfg(themeColor?: number): ShockwaveVisualConfig {
    const rangeCfg = WEAPON_RANGE_CONFIG[WeaponId.SHOCKWAVE_GENERATOR];
    const swv = rangeCfg?.shockwaveVisual;

    return {
      primaryColor: themeColor,
      strokeWidth: swv?.strokeWidth ?? 15,
      expandDurationMs: rangeCfg?.visualDurationMs ?? 1500,
      maxRadius: rangeCfg?.aoeMaxRadius ?? rangeCfg?.visualRadius ?? 350,
    };
  }

  /**
   * 从 WeaponRangeConfig 构建 OpticalSlashVisualConfig
   * 所有视觉参数由后端配置驱动，无硬编码常量
   */
  private buildOpticalSlashVisualCfg(): OpticalSlashVisualConfig {
    const rc = WEAPON_RANGE_CONFIG[WeaponId.OPTICAL_SLASH];
    const p = rc?.projectile;
    return {
      expandDurationMs: rc?.visualDurationMs ?? 800,
      maxRadius: rc?.visualRadius ?? 150,
      flightSpeed: p?.visualFlightSpeed ?? 300,
      arcBow: p?.visualArcBow ?? 28,
      bladeHalfWidth: p?.visualBladeHalfWidth ?? 20,
    };
  }

  // ══════════════════════════════════════════════════════
  //  公开 API：熵寂之触
  // ══════════════════════════════════════════════════════

  /**
   * 从 WeaponRangeConfig 构建熵寂之触视觉配置
   */
  private buildEntropicTouchVisualCfg(): EntropicTouchVisualConfig {
    const rc = WEAPON_RANGE_CONFIG[WeaponId.ENTROPIC_TOUCH];
    return {
      auraRadius: rc?.damageRadius ?? 50,
      burstRadius: rc?.aoeMaxRadius ?? 200,
      burstDurationMs: (rc?.burstDurationSec ?? 5) * 1000,
    };
  }

  /**
   * 触发低温场 aura 视觉效果
   */
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

  /**
   * 触发冻伤叠加视觉效果
   */
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

  /**
   * 触发爆发视觉效果（热力学奇点）
   */
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

  /**
   * 移除低温场
   */
  removeEntropicAura(playerId: string): void {
    this.entropicTouchRenderer.removeAura(playerId);
  }

  // ══════════════════════════════════════════════════════
  //  公开 API：画作实体化
  // ══════════════════════════════════════════════════════

  /**
   * 更新小兔/肌肉兔状态（墨水层数 + 形态 + 位置）
   */
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

  /**
   * 触发肌肉兔降临爆发
   */
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

  /**
   * 触发肌肉兔冲刺撞击特效
   */
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

  /**
   * 移除玩家兔子
   */
  removeDrawingRabbit(playerId: string): void {
    this.drawingManifestRenderer.removeRabbit(playerId);
  }

  /**
   * 从 WeaponRangeConfig 构建 DrawingManifestVisualConfig
   */
  private buildDrawingManifestVisualCfg(): DrawingManifestVisualConfig {
    const rc = WEAPON_RANGE_CONFIG[WeaponId.DRAWING_MANIFEST];
    return {
      rabbitRadius: rc?.damageRadius ?? 20,
      muscleRadius: rc?.aoeMaxRadius ?? 50,
      dashSpeed: rc?.projectile?.speed ?? 200,
      burstDurationMs: (rc?.burstDurationSec ?? 5) * 1000,
    };
  }

  // ══════════════════════════════════════════════════════
  //  公开 API：放电猫猫
  // ══════════════════════════════════════════════════════

  /**
   * 更新放电猫虚影位置
   */
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

  /**
   * 触发电弧弹射链特效
   */
  triggerDischargeArc(
    arcNodes: Array<{ x: number; y: number }>,
    isBurst: boolean,
    themeColor?: number,
    palette?: Palette,
  ): void {
    const ef = this.dischargeCatRenderer.triggerArc(arcNodes, isBurst, themeColor, palette);
    if (ef.effect) this.activeEffects.push(ef.effect);
  }

  /**
   * 触发雷霆万钧爆发
   */
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

  /**
   * 移除玩家放电猫
   */
  removeDischargeCat(playerId: string): void {
    this.dischargeCatRenderer.removeCat(playerId);
  }

  /**
   * 从 WeaponRangeConfig 构建 DischargeCatVisualConfig
   */
  private buildDischargeCatVisualCfg(): DischargeCatVisualConfig {
    const rc = WEAPON_RANGE_CONFIG[WeaponId.DISCHARGE_CAT];
    return {
      catRadius: rc?.visualRadius ?? 15,
      arcRange: rc?.damageRadius ?? 120,
      burstDurationMs: (rc?.burstDurationSec ?? 4) * 1000,
    };
  }

  // ══════════════════════════════════════════════════════
  //  公开 API：预知透镜
  // ══════════════════════════════════════════════════════

  /**
   * 更新先见层数光环
   */
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

  /**
   * 触发猫灵回响飞行特效
   */
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

  /**
   * 触发无限洞察爆发
   */
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

  /**
   * 移除玩家先见光环
   */
  removePrecognitiveForesight(playerId: string): void {
    this.precognitiveLensRenderer.removeForesight(playerId);
  }

  /**
   * 从 WeaponRangeConfig 构建 PrecognitiveLensVisualConfig
   */
  private buildPrecognitiveLensVisualCfg(): PrecognitiveLensVisualConfig {
    const rc = WEAPON_RANGE_CONFIG[WeaponId.PRECOGNITIVE_LENS];
    return {
      echoSpeed: rc?.projectile?.speed ?? 500,
      echoRadius: rc?.projectile?.hitRadius ?? 30,
      burstDurationMs: (rc?.burstDurationSec ?? 4) * 1000,
    };
  }

  // ══════════════════════════════════════════════════════
  //  公开 API：情绪天气
  // ══════════════════════════════════════════════════════

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

  /**
   * 从 WeaponRangeConfig 构建 EmotionalWeatherVisualConfig
   * 所有视觉参数由后端配置驱动，无硬编码常量
   */
  private buildEmotionalWeatherVisualCfg(): EmotionalWeatherVisualConfig {
    const rc = WEAPON_RANGE_CONFIG[WeaponId.EMOTIONAL_WEATHER];
    return {
      lightningRadius: rc?.damageRadius ?? 40,
      hailRadius: rc?.aoeMaxRadius ?? 200,
      hailStoneRadius: rc?.field?.radius ?? 30,
      burstDurationMs: (rc?.burstDurationSec ?? 4) * 1000,
    };
  }

  // ══════════════════════════════════════════════════════
  //  公开 API：情绪掌控
  // ══════════════════════════════════════════════════════

  /**
   * 更新心境指示文字
   */
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

  /**
   * 移除玩家心境显示
   */
  removeEmotionMood(playerId: string): void {
    this.emotionMasteryRenderer.removeMood(playerId);
  }

  /**
   * 触发情绪实体化爆发
   */
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

  /**
   * 从 WeaponRangeConfig 构建 EmotionMasteryVisualConfig
   */
  private buildEmotionMasteryVisualCfg(): EmotionMasteryVisualConfig {
    const rc = WEAPON_RANGE_CONFIG[WeaponId.EMOTION_MASTERY];
    return {
      orbitRadius: rc?.damageRadius ?? 80,
      burstDurationMs: (rc?.burstDurationSec ?? 4) * 1000,
    };
  }

  // ══════════════════════════════════════════════════════
  //  公开 API：流体操控（KE）
  // ══════════════════════════════════════════════════════

  /**
   * 从 WeaponRangeConfig 构建流体操控视觉配置
   */
  private buildFluidMasteryVisualCfg() {
    const rc = WEAPON_RANGE_CONFIG[WeaponId.FLUID_MASTERY];
    return {
      trailRadius: rc?.damageRadius ?? 45,
      burstRadius: rc?.aoeMaxRadius ?? 220,
      burstDurationMs: (rc?.burstDurationSec ?? 4) * 1000,
    };
  }

  /** 触发水流尾迹视觉效果（常驻光环） */
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

  /** 更新水流尾迹位置与流向 */
  updateFluidTrail(playerId: string, x: number, y: number, flowDir: number): void {
    this.fluidMasteryRenderer.updateTrail(playerId, x, y, flowDir);
  }

  /** 移除水流尾迹 */
  removeFluidTrail(playerId: string): void {
    this.fluidMasteryRenderer.removeTrail(playerId);
  }

  /** 触发漩涡牵引视觉效果 */
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

  /** 移除漩涡牵引 */
  removeFluidVortex(targetId: string): void {
    this.fluidMasteryRenderer.removeVortex(targetId);
  }

  /** 触发水龙卷爆发视觉效果 */
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

  // ══════════════════════════════════════════════════════
  //  公开 API：记忆回廊（梦）
  // ══════════════════════════════════════════════════════

  /**
   * 从 WeaponRangeConfig 构建记忆回廊视觉配置
   */
  private buildMemoryCorridorVisualCfg() {
    const rc = WEAPON_RANGE_CONFIG[WeaponId.MEMORY_CORRIDOR];
    return {
      echoRadius: rc?.damageRadius ?? 50,
      burstRadius: rc?.aoeMaxRadius ?? 200,
      burstDurationMs: (rc?.burstDurationSec ?? 5) * 1000,
    };
  }

  /** 触发回响光环视觉效果（常驻光环 + FIFO 队列） */
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
    // 渲染器 triggerEcho 的 shardId 参数为 number 占位（当前未深度使用），传 0 即可
    void shardId;
    this.memoryCorridorRenderer.triggerEcho(
      playerId, x, y, radius, echoCount, 0, themeColor, palette,
    );
  }

  /** 更新回响光环位置与碎片数 */
  updateMemoryEcho(playerId: string, x: number, y: number, echoCount: number): void {
    this.memoryCorridorRenderer.updateEcho(playerId, x, y, echoCount);
  }

  /** 移除回响光环 */
  removeMemoryEcho(playerId: string): void {
    this.memoryCorridorRenderer.removeEcho(playerId);
  }

  /** 触发历史共振视觉效果 */
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

  /** 移除历史共振 */
  removeMemoryResonance(targetId: string): void {
    this.memoryCorridorRenderer.removeResonance(targetId);
  }

  /** 触发记忆洪流爆发视觉效果 */
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

  // ══════════════════════════════════════════════════════
  //  公开 API：无限折叠（陈厌孑）
  // ══════════════════════════════════════════════════════

  /**
   * 从 WeaponRangeConfig 构建无限折叠视觉配置
   */
  private buildInfiniteFoldVisualCfg() {
    const rc = WEAPON_RANGE_CONFIG[WeaponId.INFINITE_FOLD];
    return {
      dodgeRadius: rc?.damageRadius ?? 40,
      burstRadius: rc?.aoeMaxRadius ?? 180,
      burstDurationMs: (rc?.burstDurationSec ?? 3) * 1000,
    };
  }

  /** 触发空间闪避视觉效果 */
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

  /** 移除闪避特效 */
  removeFoldDodge(playerId: string): void {
    this.infiniteFoldRenderer.removeDodge(playerId);
  }

  /** 触发空间重组视觉效果 */
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

  /** 移除空间重组特效 */
  removeFoldReassemble(targetId: string): void {
    this.infiniteFoldRenderer.removeReassemble(targetId);
  }

  /** 触发维度坍缩爆发视觉效果 */
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

  // ══════════════════════════════════════════════════════
  //  公开 API：植物伙伴派对（沐里）
  // ══════════════════════════════════════════════════════

  /**
   * 从 WeaponRangeConfig 构建植物伙伴派对视觉配置
   */
  private buildBotanicalPartyVisualCfg() {
    const rc = WEAPON_RANGE_CONFIG[WeaponId.BOTANICAL_CONTROL];
    return {
      plantRadius: rc?.field?.radius ?? 40,
      burstRadius: rc?.aoeMaxRadius ?? 60,
      burstDurationMs: (rc?.burstDurationSec ?? 4) * 1000,
    };
  }

  /**
   * 触发植物生成视觉效果
   * @param plantId 植物 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param personality 性格（gentle 温柔 / fierce 暴躁 / curious 好奇）
   * @param radius 植物影响半径（逻辑 px）
   * @param themeColor 主题色
   */
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

  /**
   * 触发单株植物枯萎（飘出咖啡香气粒子）
   */
  triggerPlantDecay(plantId: string): void {
    this.botanicalPartyRenderer.triggerPlantDecay(plantId);
  }

  /**
   * 移除单株植物
   */
  removePlant(plantId: string): void {
    this.botanicalPartyRenderer.removePlant(plantId);
  }

  /**
   * 触发植物派对爆发视觉效果
   * @param playerId 玩家 ID
   * @param x 逻辑坐标 X
   * @param y 逻辑坐标 Y
   * @param radius 爆发范围（逻辑 px）
   * @param plantCount 当前植物数量
   * @param themeColor 主题色
   * @param durationMs 持续时间（ms）
   */
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

  // ══════════════════════════════════════════════════════
  //  公开 API：基础武器（9 个）
  // ══════════════════════════════════════════════════════

  // ── 纳米撕裂者 (NANO_RIPPER) ─────────────────────────
  private buildNanoRipperVisualCfg(): BasicWeaponVisualConfig {
    const rc = WEAPON_RANGE_CONFIG[WeaponId.NANO_RIPPER];
    return {
      fieldRadius: rc?.damageRadius ?? 60,
      burstRadius: rc?.aoeMaxRadius ?? 200,
      burstDurationMs: (rc?.burstDurationSec ?? 5) * 1000,
    };
  }
  triggerNanoRipperField(playerId: string, x: number, y: number, radius: number, themeColor?: number): void {
    this.nanoRipperRenderer.triggerRipperField(playerId, x, y, radius, themeColor);
  }
  removeNanoRipperField(playerId: string): void {
    this.nanoRipperRenderer.removeRipperField(playerId);
  }
  triggerNanoRipperBurst(playerId: string, x: number, y: number, radius: number, themeColor?: number, durationMs?: number): void {
    const cfg = this.buildNanoRipperVisualCfg();
    this.nanoRipperRenderer.triggerBurst(playerId, x, y, radius, themeColor, durationMs ?? cfg.burstDurationMs);
  }

  // ── 追猎协议 (PURSUIT_PROTOCOL) ─────────────────────
  private buildPursuitProtocolVisualCfg(): BasicWeaponVisualConfig {
    const rc = WEAPON_RANGE_CONFIG[WeaponId.PURSUIT_PROTOCOL];
    return {
      fieldRadius: rc?.damageRadius ?? 60,
      burstRadius: rc?.aoeMaxRadius ?? 200,
      burstDurationMs: (rc?.burstDurationSec ?? 5) * 1000,
    };
  }
  triggerPursuitMark(targetId: string, targetX: number, targetY: number, hunterX: number, hunterY: number, radius: number, themeColor?: number): void {
    this.pursuitProtocolRenderer.triggerPursuitMark(targetId, targetX, targetY, hunterX, hunterY, radius, themeColor);
  }
  updatePursuitMark(targetId: string, targetX: number, targetY: number, hunterX: number, hunterY: number): void {
    this.pursuitProtocolRenderer.updatePursuitMark(targetId, targetX, targetY, hunterX, hunterY);
  }
  removePursuitMark(targetId: string): void {
    this.pursuitProtocolRenderer.removePursuitMark(targetId);
  }
  triggerPursuitBurst(playerId: string, x: number, y: number, radius: number, themeColor?: number, durationMs?: number): void {
    const cfg = this.buildPursuitProtocolVisualCfg();
    this.pursuitProtocolRenderer.triggerBurst(playerId, x, y, radius, themeColor, durationMs ?? cfg.burstDurationMs);
  }

  // ── 重力阱 (GRAVITY_WELL) ────────────────────────────
  private buildGravityWellVisualCfg(): BasicWeaponVisualConfig {
    const rc = WEAPON_RANGE_CONFIG[WeaponId.GRAVITY_WELL];
    return {
      fieldRadius: rc?.damageRadius ?? 60,
      burstRadius: rc?.aoeMaxRadius ?? 200,
      burstDurationMs: (rc?.burstDurationSec ?? 5) * 1000,
    };
  }
  triggerGravityCore(playerId: string, x: number, y: number, radius: number, themeColor?: number): void {
    this.gravityWellRenderer.triggerGravityCore(playerId, x, y, radius, themeColor);
  }
  removeGravityCore(playerId: string): void {
    this.gravityWellRenderer.removeGravityCore(playerId);
  }
  triggerGravityBurst(playerId: string, x: number, y: number, radius: number, themeColor?: number, durationMs?: number): void {
    const cfg = this.buildGravityWellVisualCfg();
    this.gravityWellRenderer.triggerBurst(playerId, x, y, radius, themeColor, durationMs ?? cfg.burstDurationMs);
  }

  // ── 熵增扩散器 (ENTROPY_DIFFUSER) ───────────────────
  private buildEntropyDiffuserVisualCfg(): BasicWeaponVisualConfig {
    const rc = WEAPON_RANGE_CONFIG[WeaponId.ENTROPY_DIFFUSER];
    return {
      fieldRadius: rc?.damageRadius ?? 60,
      burstRadius: rc?.aoeMaxRadius ?? 200,
      burstDurationMs: (rc?.burstDurationSec ?? 5) * 1000,
    };
  }
  triggerEntropyDiffuserField(playerId: string, x: number, y: number, radius: number, themeColor?: number): void {
    this.entropyDiffuserRenderer.triggerEntropyField(playerId, x, y, radius, themeColor);
  }
  removeEntropyDiffuserField(playerId: string): void {
    this.entropyDiffuserRenderer.removeEntropyField(playerId);
  }
  triggerEntropyDiffuserBurst(playerId: string, x: number, y: number, radius: number, themeColor?: number, durationMs?: number): void {
    const cfg = this.buildEntropyDiffuserVisualCfg();
    this.entropyDiffuserRenderer.triggerBurst(playerId, x, y, radius, themeColor, durationMs ?? cfg.burstDurationMs);
  }

  // ── 堡垒构筑者 (BASTION_BUILDER) ───────────────────
  private buildBastionBuilderVisualCfg(): BasicWeaponVisualConfig {
    const rc = WEAPON_RANGE_CONFIG[WeaponId.BASTION_BUILDER];
    return {
      fieldRadius: rc?.damageRadius ?? 60,
      burstRadius: rc?.aoeMaxRadius ?? 200,
      burstDurationMs: (rc?.burstDurationSec ?? 5) * 1000,
    };
  }
  triggerBastionShield(playerId: string, x: number, y: number, radius: number, themeColor?: number): void {
    this.bastionBuilderRenderer.triggerBastion(playerId, x, y, radius, themeColor);
  }
  removeBastionShield(playerId: string): void {
    this.bastionBuilderRenderer.removeBastion(playerId);
  }
  triggerBastionBurst(playerId: string, x: number, y: number, radius: number, themeColor?: number, durationMs?: number): void {
    const cfg = this.buildBastionBuilderVisualCfg();
    this.bastionBuilderRenderer.triggerBurst(playerId, x, y, radius, themeColor, durationMs ?? cfg.burstDurationMs);
  }

  // ── 电路编织者 (CIRCUIT_WEAVER) ────────────────────
  private buildCircuitWeaverVisualCfg(): BasicWeaponVisualConfig {
    const rc = WEAPON_RANGE_CONFIG[WeaponId.CIRCUIT_WEAVER];
    return {
      fieldRadius: rc?.damageRadius ?? 60,
      burstRadius: rc?.aoeMaxRadius ?? 200,
      burstDurationMs: (rc?.burstDurationSec ?? 5) * 1000,
    };
  }
  triggerCircuitNetwork(playerId: string, x: number, y: number, radius: number, themeColor?: number): void {
    this.circuitWeaverRenderer.triggerCircuit(playerId, x, y, radius, themeColor);
  }
  removeCircuitNetwork(playerId: string): void {
    this.circuitWeaverRenderer.removeCircuit(playerId);
  }
  triggerCircuitBurst(playerId: string, x: number, y: number, radius: number, themeColor?: number, durationMs?: number): void {
    const cfg = this.buildCircuitWeaverVisualCfg();
    this.circuitWeaverRenderer.triggerBurst(playerId, x, y, radius, themeColor, durationMs ?? cfg.burstDurationMs);
  }

  // ── 量子裂隙 (QUANTUM_RIFT) ─────────────────────────
  private buildQuantumRiftVisualCfg(): BasicWeaponVisualConfig {
    const rc = WEAPON_RANGE_CONFIG[WeaponId.QUANTUM_RIFT];
    return {
      fieldRadius: rc?.damageRadius ?? 60,
      burstRadius: rc?.aoeMaxRadius ?? 200,
      burstDurationMs: (rc?.burstDurationSec ?? 5) * 1000,
    };
  }
  triggerQuantumRift(playerId: string, x: number, y: number, radius: number, themeColor?: number): void {
    this.quantumRiftRenderer.triggerRift(playerId, x, y, radius, themeColor);
  }
  removeQuantumRift(playerId: string): void {
    this.quantumRiftRenderer.removeRift(playerId);
  }
  triggerQuantumBurst(playerId: string, x: number, y: number, radius: number, themeColor?: number, durationMs?: number): void {
    const cfg = this.buildQuantumRiftVisualCfg();
    this.quantumRiftRenderer.triggerBurst(playerId, x, y, radius, themeColor, durationMs ?? cfg.burstDurationMs);
  }

  // ── 体积扭曲 (SIZE_WARP) ─────────────────────────────
  private buildSizeWarpVisualCfg(): BasicWeaponVisualConfig {
    const rc = WEAPON_RANGE_CONFIG[WeaponId.SIZE_WARP];
    return {
      fieldRadius: rc?.damageRadius ?? 60,
      burstRadius: rc?.aoeMaxRadius ?? 200,
      burstDurationMs: (rc?.burstDurationSec ?? 5) * 1000,
    };
  }
  triggerSizeWarpField(playerId: string, x: number, y: number, radius: number, themeColor?: number): void {
    this.sizeWarpRenderer.triggerWarp(playerId, x, y, radius, themeColor);
  }
  removeSizeWarpField(playerId: string): void {
    this.sizeWarpRenderer.removeWarp(playerId);
  }
  triggerSizeWarpBurst(playerId: string, x: number, y: number, radius: number, themeColor?: number, durationMs?: number): void {
    const cfg = this.buildSizeWarpVisualCfg();
    this.sizeWarpRenderer.triggerBurst(playerId, x, y, radius, themeColor, durationMs ?? cfg.burstDurationMs);
  }

  // ── 弹射核心 (RICOCHET_CORE) ────────────────────────
  private buildRicochetCoreVisualCfg(): BasicWeaponVisualConfig {
    const rc = WEAPON_RANGE_CONFIG[WeaponId.RICOCHET_CORE];
    return {
      fieldRadius: rc?.damageRadius ?? 60,
      burstRadius: rc?.aoeMaxRadius ?? 200,
      burstDurationMs: (rc?.burstDurationSec ?? 5) * 1000,
    };
  }
  triggerRicochetTrail(playerId: string, x: number, y: number, radius: number, themeColor?: number): void {
    this.ricochetCoreRenderer.triggerRicochet(playerId, x, y, radius, themeColor);
  }
  removeRicochetTrail(playerId: string): void {
    this.ricochetCoreRenderer.removeRicochet(playerId);
  }
  triggerRicochetBurst(playerId: string, x: number, y: number, radius: number, themeColor?: number, durationMs?: number): void {
    const cfg = this.buildRicochetCoreVisualCfg();
    this.ricochetCoreRenderer.triggerBurst(playerId, x, y, radius, themeColor, durationMs ?? cfg.burstDurationMs);
  }

  // ══════════════════════════════════════════════════════
  //  生命周期
  // ══════════════════════════════════════════════════════

  update(dt: number): void {
    // 更新熵寂之触渲染器
    this.entropicTouchRenderer.update(dt);

    // 更新画作实体化渲染器（驱动兔子呼吸/光环脉动/墨水粒子）
    this.drawingManifestRenderer.update(dt);

    // 更新预知透镜渲染器（驱动"已看透"文字等基于 update(dt) 的生命周期）
    this.precognitiveLensRenderer.update(dt);

    // 更新情绪天气渲染器（驱动"气象局特供"文字等基于 update(dt) 的生命周期）
    this.emotionalWeatherRenderer.update(dt);

    // 更新流体操控渲染器（驱动水流尾迹/漩涡/水龙卷动画）
    this.fluidMasteryRenderer.update(dt);

    // 更新记忆回廊渲染器（驱动回响/共振/记忆洪流动画）
    this.memoryCorridorRenderer.update(dt);

    // 更新无限折叠渲染器（驱动闪避/重组/爆发动画）
    this.infiniteFoldRenderer.update(dt);

    // 更新植物伙伴派对渲染器（驱动植物出生/呼吸/枯萎+爆发三阶段动画）
    this.botanicalPartyRenderer.update(dt);

    // 更新基础武器渲染器（驱动常驻场旋转/粒子 + 爆发三阶段动画）
    this.nanoRipperRenderer.update(dt);
    this.pursuitProtocolRenderer.update(dt);
    this.gravityWellRenderer.update(dt);
    this.entropyDiffuserRenderer.update(dt);
    this.bastionBuilderRenderer.update(dt);
    this.circuitWeaverRenderer.update(dt);
    this.quantumRiftRenderer.update(dt);
    this.sizeWarpRenderer.update(dt);
    this.ricochetCoreRenderer.update(dt);

    // 更新形状特效池
    this.shapeEffectPool.tick(dt);

    // 统一更新所有 ActiveEffect
    for (let i = this.activeEffects.length - 1; i >= 0; i--) {
      const ef = this.activeEffects[i];
      ef.life += dt;
      if (ef.life >= ef.maxLife) {
        ef.onDecay(ef);
        this.activeEffects.splice(i, 1);
      } else {
        ef.onUpdate(ef, dt);
      }
    }
  }

  clear(): void {
    for (let i = this.activeEffects.length - 1; i >= 0; i--) {
      this.activeEffects[i].onDecay(this.activeEffects[i]);
    }
    this.activeEffects.length = 0;

    this.shockwaveRenderer.clear();
    this.firewallRenderer.clear();
    this.hiveRenderer.clear();
    this.shapeEffectPool.clear();
    this.sustainedShapes.clear();
    this.drawingManifestRenderer.clear();
    this.dischargeCatRenderer.clear();
    this.precognitiveLensRenderer.clear();
    this.emotionalWeatherRenderer.clear();
    this.emotionMasteryRenderer.clear();
    this.fluidMasteryRenderer.clear();
    this.memoryCorridorRenderer.clear();
    this.infiniteFoldRenderer.clear();
    this.botanicalPartyRenderer.clear();
    // 清理基础武器渲染器
    this.nanoRipperRenderer.clear();
    this.pursuitProtocolRenderer.clear();
    this.gravityWellRenderer.clear();
    this.entropyDiffuserRenderer.clear();
    this.bastionBuilderRenderer.clear();
    this.circuitWeaverRenderer.clear();
    this.quantumRiftRenderer.clear();
    this.sizeWarpRenderer.clear();
    this.ricochetCoreRenderer.clear();
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this.clear();

    this.shockwaveRenderer.destroy();
    this.firewallRenderer.destroy();
    this.hiveRenderer.destroy();
    this.opticalSlashRenderer.destroy();
    this.airRepulsionFieldRenderer.destroy();
    this.entropicTouchRenderer.destroy();
    this.drawingManifestRenderer.destroy();
    this.dischargeCatRenderer.destroy();
    this.precognitiveLensRenderer.destroy();
    this.emotionalWeatherRenderer.destroy();
    this.emotionMasteryRenderer.destroy();
    this.fluidMasteryRenderer.destroy();
    this.memoryCorridorRenderer.destroy();
    this.infiniteFoldRenderer.destroy();
    this.botanicalPartyRenderer.destroy();
    // 销毁基础武器渲染器
    this.nanoRipperRenderer.destroy();
    this.pursuitProtocolRenderer.destroy();
    this.gravityWellRenderer.destroy();
    this.entropyDiffuserRenderer.destroy();
    this.bastionBuilderRenderer.destroy();
    this.circuitWeaverRenderer.destroy();
    this.quantumRiftRenderer.destroy();
    this.sizeWarpRenderer.destroy();
    this.ricochetCoreRenderer.destroy();
    this.shapeEffectPool.destroy();
  }
}
