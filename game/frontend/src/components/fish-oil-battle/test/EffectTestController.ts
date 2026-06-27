import * as PIXI from 'pixi.js';
import {
  getLogicalW, getLogicalH,
  updateArenaConfig,
} from '../renderer/constants';
import { ParticlePool } from '../renderer/systems/ParticlePool';
import { ArenaRenderer, type WallStyle } from '../renderer/systems/ArenaRenderer';
import { ShockwaveEffectRenderer } from '../renderer/entities/ShockwaveEffectRenderer';
import { FirewallEffectRenderer } from '../renderer/entities/FirewallEffectRenderer';
import { HiveEffectRenderer } from '../renderer/entities/HiveEffectRenderer';
import { OpticalSlashEffectRenderer } from '../renderer/entities/OpticalSlashEffectRenderer';
import { AirRepulsionFieldRenderer } from '../renderer/entities/AirRepulsionFieldRenderer';
import { EntropicTouchRenderer } from '../renderer/entities/EntropicTouchRenderer';
import { DrawingManifestRenderer } from '../renderer/entities/DrawingManifestRenderer';
import { DischargeCatRenderer } from '../renderer/entities/DischargeCatRenderer';
import { PrecognitiveLensRenderer } from '../renderer/entities/PrecognitiveLensRenderer';
import { EmotionalWeatherRenderer } from '../renderer/entities/EmotionalWeatherRenderer';
import { EmotionMasteryRenderer } from '../renderer/entities/EmotionMasteryRenderer';
import { FluidMasteryRenderer } from '../renderer/entities/FluidMasteryRenderer';
import { MemoryCorridorRenderer } from '../renderer/entities/MemoryCorridorRenderer';
import { InfiniteFoldRenderer } from '../renderer/entities/InfiniteFoldRenderer';
import { BotanicalPartyRenderer } from '../renderer/entities/BotanicalPartyRenderer';
import { NanoRipperRenderer } from '../renderer/entities/NanoRipperRenderer';
import { PursuitProtocolRenderer } from '../renderer/entities/PursuitProtocolRenderer';
import { GravityWellRenderer } from '../renderer/entities/GravityWellRenderer';
import { EntropyDiffuserRenderer } from '../renderer/entities/EntropyDiffuserRenderer';
import { BastionBuilderRenderer } from '../renderer/entities/BastionBuilderRenderer';
import { CircuitWeaverRenderer } from '../renderer/entities/CircuitWeaverRenderer';
import { QuantumRiftRenderer } from '../renderer/entities/QuantumRiftRenderer';
import { SizeWarpRenderer } from '../renderer/entities/SizeWarpRenderer';
import { RicochetCoreRenderer } from '../renderer/entities/RicochetCoreRenderer';
import type { ActiveEffect } from '../renderer/entities/VisualEffectUtils';

/**
 * 特效测试控制器
 *
 * 复刻游戏里的分层容器结构 + 竞技场背景 + 坐标映射系统，
 * 提供独立的 PIXI Application 和 ticker 驱动，
 * 方便在测试页中循环播放和实时调参。
 *
 * 分层（从后到前）：
 * Arena bg → L5 hologram（爆发闪屏）→ L3 field（防火墙+冲击波）→ L2 entity（粒子+蜂刺反弹）
 *
 * 坐标系统（与 CyberFishRenderer 一致）：
 * - 后端逻辑坐标系 1280×720（可配置）
 * - uniformScale = min(canvasW/logicalW, canvasH/logicalH)
 * - mapX/mapY 等比缩放 + 居中偏移
 */
export interface EffectTestContext {
  app: PIXI.Application;
  stage: PIXI.Container;
  l2Entity: PIXI.Container;
  l3Field: PIXI.Container;
  l5Hologram: PIXI.Container;
  particlePool: ParticlePool;
  arenaRenderer: ArenaRenderer;
  shockwaveRenderer: ShockwaveEffectRenderer;
  firewallRenderer: FirewallEffectRenderer;
  hiveRenderer: HiveEffectRenderer;
  opticalSlashRenderer: OpticalSlashEffectRenderer;
  airRepulsionRenderer: AirRepulsionFieldRenderer;
  entropicTouchRenderer: EntropicTouchRenderer;
  /** 画作实体化渲染器 */
  drawingManifestRenderer: DrawingManifestRenderer;
  /** 放电猫猫渲染器 */
  dischargeCatRenderer: DischargeCatRenderer;
  /** 预知透镜渲染器 */
  precognitiveLensRenderer: PrecognitiveLensRenderer;
  /** 情绪天气渲染器 */
  emotionalWeatherRenderer: EmotionalWeatherRenderer;
  /** 情绪掌控渲染器 */
  emotionMasteryRenderer: EmotionMasteryRenderer;
  /** KE - 流体操控渲染器 */
  fluidMasteryRenderer: FluidMasteryRenderer;
  /** 梦 - 记忆回廊渲染器 */
  memoryCorridorRenderer: MemoryCorridorRenderer;
  /** 陈厌孑 - 无限折叠渲染器 */
  infiniteFoldRenderer: InfiniteFoldRenderer;
  /** 沐里 - 植物伙伴派对渲染器 */
  botanicalPartyRenderer: BotanicalPartyRenderer;
  /** 纳米撕裂者渲染器 */
  nanoRipperRenderer: NanoRipperRenderer;
  /** 追猎协议渲染器 */
  pursuitProtocolRenderer: PursuitProtocolRenderer;
  /** 重力阱渲染器 */
  gravityWellRenderer: GravityWellRenderer;
  /** 熵增扩散器渲染器 */
  entropyDiffuserRenderer: EntropyDiffuserRenderer;
  /** 堡垒构筑者渲染器 */
  bastionBuilderRenderer: BastionBuilderRenderer;
  /** 电路编织者渲染器 */
  circuitWeaverRenderer: CircuitWeaverRenderer;
  /** 量子裂隙渲染器 */
  quantumRiftRenderer: QuantumRiftRenderer;
  /** 体积扭曲渲染器 */
  sizeWarpRenderer: SizeWarpRenderer;
  /** 弹射核心渲染器 */
  ricochetCoreRenderer: RicochetCoreRenderer;
  /** 活跃特效列表 */
  activeEffects: ActiveEffect[];
  /** 添加活跃特效 */
  addEffect: (ef: ActiveEffect | ActiveEffect[] | null) => void;
  /** 清空所有特效 */
  clearEffects: () => void;
  /** 获取当前 uniformScale */
  getUniformScale: () => number;
  /** 逻辑坐标 → 画布像素映射 */
  mapX: (logicalX: number) => number;
  mapY: (logicalY: number) => number;
  /** 更新竞技场配置（逻辑尺寸 + 形状 + 半径），触发 resize */
  setArenaConfig: (config: { width: number; height: number; arenaRadius: number; shape?: string; arenaHalfW?: number; arenaHalfH?: number }) => void;
  /** 设置墙壁风格 */
  setWallStyle: (style: WallStyle) => void;
  /** 销毁控制器 */
  destroy: () => void;
}

/**
 * 创建测试环境
 * @param canvas 目标 canvas 元素
 */
export async function createEffectTestController(canvas: HTMLCanvasElement): Promise<EffectTestContext> {
  let logicalW = getLogicalW();
  let logicalH = getLogicalH();

  // 1. 创建 PIXI Application
  const app = new PIXI.Application();
  await app.init({
    canvas,
    width: logicalW,
    height: logicalH,
    antialias: true,
    background: 0x0a0a1a,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    eventMode: 'none',
  });

  // CSS 适配
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';

  const stage = app.stage;
  stage.sortableChildren = true;

  // 2. 创建分层容器
  const l5Hologram = new PIXI.Container();
  l5Hologram.zIndex = -100;
  stage.addChild(l5Hologram);

  const l3Field = new PIXI.Container();
  l3Field.zIndex = 10;
  stage.addChild(l3Field);

  const l2Entity = new PIXI.Container();
  l2Entity.zIndex = 20;
  stage.addChild(l2Entity);

  // 3. 竞技场背景（与游戏内一致）
  const arenaRenderer = new ArenaRenderer(stage);

  // 4. 初始化粒子池
  const particlePool = new ParticlePool(l2Entity, 500);

  // 5. 初始化特效渲染器
  const shockwaveRenderer = new ShockwaveEffectRenderer(l3Field, logicalW, logicalH, particlePool, 20);
  const firewallRenderer = new FirewallEffectRenderer(l3Field, particlePool, 16);
  const hiveRenderer = new HiveEffectRenderer(l2Entity, l5Hologram, particlePool, logicalW, logicalH, 60);
  const opticalSlashRenderer = new OpticalSlashEffectRenderer(l3Field, l5Hologram);
  const airRepulsionRenderer = new AirRepulsionFieldRenderer(l3Field, particlePool);
  const entropicTouchRenderer = new EntropicTouchRenderer(l3Field, particlePool);
  const drawingManifestRenderer = new DrawingManifestRenderer(l2Entity, l3Field);
  const dischargeCatRenderer = new DischargeCatRenderer(l2Entity, l3Field);
  const precognitiveLensRenderer = new PrecognitiveLensRenderer(l2Entity, l3Field);
  const emotionalWeatherRenderer = new EmotionalWeatherRenderer(l3Field);
  const emotionMasteryRenderer = new EmotionMasteryRenderer(l3Field, l2Entity);
  const fluidMasteryRenderer = new FluidMasteryRenderer(l3Field, particlePool);
  const memoryCorridorRenderer = new MemoryCorridorRenderer(l3Field, particlePool);
  const infiniteFoldRenderer = new InfiniteFoldRenderer(l3Field, particlePool);
  const botanicalPartyRenderer = new BotanicalPartyRenderer(l3Field, particlePool);
  const nanoRipperRenderer = new NanoRipperRenderer(l3Field, particlePool);
  const pursuitProtocolRenderer = new PursuitProtocolRenderer(l3Field, particlePool);
  const gravityWellRenderer = new GravityWellRenderer(l3Field, particlePool);
  const entropyDiffuserRenderer = new EntropyDiffuserRenderer(l3Field, particlePool);
  const bastionBuilderRenderer = new BastionBuilderRenderer(l3Field, particlePool);
  const circuitWeaverRenderer = new CircuitWeaverRenderer(l3Field, particlePool);
  const quantumRiftRenderer = new QuantumRiftRenderer(l3Field, particlePool);
  const sizeWarpRenderer = new SizeWarpRenderer(l3Field, particlePool);
  const ricochetCoreRenderer = new RicochetCoreRenderer(l3Field, particlePool);

  // 6. 活跃特效管理
  const activeEffects: ActiveEffect[] = [];

  const addEffect = (ef: ActiveEffect | ActiveEffect[] | null) => {
    if (!ef) return;
    if (Array.isArray(ef)) {
      for (const e of ef) activeEffects.push(e);
    } else {
      activeEffects.push(ef);
    }
  };

  const clearEffects = () => {
    // 清理 activeEffects 中的特效
    for (let i = activeEffects.length - 1; i >= 0; i--) {
      activeEffects[i].onDecay(activeEffects[i]);
    }
    activeEffects.length = 0;

    // 清理渲染器内部管理的特效
    airRepulsionRenderer.clear();
    entropicTouchRenderer.clear();
    drawingManifestRenderer.clear();
    dischargeCatRenderer.clear();
    emotionalWeatherRenderer.clear();
    emotionMasteryRenderer.clear();
    fluidMasteryRenderer.clear();
    memoryCorridorRenderer.clear();
    infiniteFoldRenderer.clear();
    botanicalPartyRenderer.clear();
    nanoRipperRenderer.clear();
    pursuitProtocolRenderer.clear();
    gravityWellRenderer.clear();
    entropyDiffuserRenderer.clear();
    bastionBuilderRenderer.clear();
    circuitWeaverRenderer.clear();
    quantumRiftRenderer.clear();
    sizeWarpRenderer.clear();
    ricochetCoreRenderer.clear();
  };

  // ═══════════════════════════════════════════════════
  //  坐标映射（与 CyberFishRenderer 一致）
  // ═══════════════════════════════════════════════════

  let canvasW = logicalW;
  let canvasH = logicalH;

  function getUniformScale(): number {
    return Math.min(canvasW / logicalW, canvasH / logicalH);
  }

  function offsetX(): number {
    return (canvasW - logicalW * getUniformScale()) / 2;
  }

  function offsetY(): number {
    return (canvasH - logicalH * getUniformScale()) / 2;
  }

  function mapX(lx: number): number {
    return lx * getUniformScale() + offsetX();
  }

  function mapY(ly: number): number {
    return ly * getUniformScale() + offsetY();
  }

  function applyScale(): void {
    const s = getUniformScale();
    shockwaveRenderer.setScale(s, canvasW, canvasH);
    firewallRenderer.setScale(s);
    hiveRenderer.setScale(s, canvasW, canvasH);
    opticalSlashRenderer.setScale(s, canvasW, canvasH);
    airRepulsionRenderer.setScale(s);
    entropicTouchRenderer.setScale(s);
    drawingManifestRenderer.setScale(s);
    dischargeCatRenderer.setScale(s);
    precognitiveLensRenderer.setScale(s);
    emotionalWeatherRenderer.setScale(s);
    emotionMasteryRenderer.setScale(s);
    fluidMasteryRenderer.setScale(s);
    memoryCorridorRenderer.setScale(s);
    infiniteFoldRenderer.setScale(s);
    botanicalPartyRenderer.setScale(s);
    nanoRipperRenderer.setScale(s);
    pursuitProtocolRenderer.setScale(s);
    gravityWellRenderer.setScale(s);
    entropyDiffuserRenderer.setScale(s);
    bastionBuilderRenderer.setScale(s);
    circuitWeaverRenderer.setScale(s);
    quantumRiftRenderer.setScale(s);
    sizeWarpRenderer.setScale(s);
    ricochetCoreRenderer.setScale(s);
  }

  function setArenaConfig(config: { width: number; height: number; arenaRadius: number; shape?: string; arenaHalfW?: number; arenaHalfH?: number }): void {
    logicalW = config.width;
    logicalH = config.height;
    updateArenaConfig({
      width: config.width,
      height: config.height,
      shape: config.shape as any,
      arenaRadius: config.arenaRadius,
      arenaHalfW: config.arenaHalfW,
      arenaHalfH: config.arenaHalfH,
      ballRadius: 36,
    });

    // 同步 canvas 尺寸
    canvasW = config.width;
    canvasH = config.height;
    app.renderer.resize(canvasW, canvasH);

    // 重建竞技场背景 + 同步缩放（force=true 确保形状切换时重绘）
    arenaRenderer.resize(canvasW, canvasH, true);
    applyScale();
  }

  // 初始缩放
  arenaRenderer.resize(canvasW, canvasH, true);
  applyScale();

  // 7. Ticker 驱动
  app.ticker.add((ticker: PIXI.Ticker) => {
    const dt = ticker.deltaMS;

    // 更新粒子
    particlePool.update(dt);

    // 更新新增渲染器内部状态（在活跃特效之前调用）
    fluidMasteryRenderer.update(dt);
    memoryCorridorRenderer.update(dt);
    infiniteFoldRenderer.update(dt);
    botanicalPartyRenderer.update(dt);
    nanoRipperRenderer.update(dt);
    pursuitProtocolRenderer.update(dt);
    gravityWellRenderer.update(dt);
    entropyDiffuserRenderer.update(dt);
    bastionBuilderRenderer.update(dt);
    circuitWeaverRenderer.update(dt);
    quantumRiftRenderer.update(dt);
    sizeWarpRenderer.update(dt);
    ricochetCoreRenderer.update(dt);

    // 更新活跃特效
    for (let i = activeEffects.length - 1; i >= 0; i--) {
      const ef = activeEffects[i];
      ef.life += dt;
      if (ef.life >= ef.maxLife) {
        ef.onDecay(ef);
        activeEffects.splice(i, 1);
      } else {
        ef.onUpdate(ef, dt);
      }
    }
  });

  const ctx: EffectTestContext = {
    app,
    stage,
    l2Entity,
    l3Field,
    l5Hologram,
    particlePool,
    arenaRenderer,
    shockwaveRenderer,
    firewallRenderer,
    hiveRenderer,
    opticalSlashRenderer,
    airRepulsionRenderer,
    entropicTouchRenderer,
    drawingManifestRenderer,
    dischargeCatRenderer,
    precognitiveLensRenderer,
    emotionalWeatherRenderer,
    emotionMasteryRenderer,
    fluidMasteryRenderer,
    memoryCorridorRenderer,
    infiniteFoldRenderer,
    botanicalPartyRenderer,
    nanoRipperRenderer,
    pursuitProtocolRenderer,
    gravityWellRenderer,
    entropyDiffuserRenderer,
    bastionBuilderRenderer,
    circuitWeaverRenderer,
    quantumRiftRenderer,
    sizeWarpRenderer,
    ricochetCoreRenderer,
    activeEffects,
    addEffect,
    clearEffects,
    getUniformScale,
    mapX,
    mapY,
    setArenaConfig,
    setWallStyle: (style: WallStyle) => arenaRenderer.setWallStyle(style),
    destroy: () => {
      app.ticker.stop();
      clearEffects();
      arenaRenderer.destroy();
      shockwaveRenderer.destroy();
      firewallRenderer.destroy();
      hiveRenderer.destroy();
      opticalSlashRenderer.destroy();
      airRepulsionRenderer.destroy();
      entropicTouchRenderer.destroy();
      drawingManifestRenderer.destroy();
      dischargeCatRenderer.destroy();
      precognitiveLensRenderer.destroy();
      emotionalWeatherRenderer.destroy();
      emotionMasteryRenderer.destroy();
      fluidMasteryRenderer.destroy();
      memoryCorridorRenderer.destroy();
      infiniteFoldRenderer.destroy();
      botanicalPartyRenderer.destroy();
      nanoRipperRenderer.destroy();
      pursuitProtocolRenderer.destroy();
      gravityWellRenderer.destroy();
      entropyDiffuserRenderer.destroy();
      bastionBuilderRenderer.destroy();
      circuitWeaverRenderer.destroy();
      quantumRiftRenderer.destroy();
      sizeWarpRenderer.destroy();
      ricochetCoreRenderer.destroy();
      particlePool.destroy();
      app.destroy(true, { children: true });
    },
  };

  return ctx;
}
