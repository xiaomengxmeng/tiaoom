import * as PIXI from 'pixi.js';
import {
  updateArenaConfig, getLogicalW, getLogicalH,
  SHOCKWAVE_MAX_RADIUS, FIREWALL_HEX_RADIUS,
} from './constants';
import { PhysicsSystem, type InterpolatedState, type PhysicsState } from './systems/PhysicsSystem';
import { ParticlePool } from './systems/ParticlePool';
import { ArenaRenderer } from './systems/ArenaRenderer';
import { PlayerRenderer, type Faction } from './entities/PlayerRenderer';
import { EffectRenderer } from './entities/EffectRenderer';
import { GlobalEffectRenderer } from './GlobalEffectRenderer';
import { getWeaponPalette } from './entities/WeaponPalettes';
import type { ShapeDescriptor } from './systems/ShapeRenderer';
import type { ShapeEffectConfig } from './entities/ShapeEffect';
import type { VisualEventData, HitReaction } from '$/backend/src/games/fish-oil-battle/shared/protocol';
import { VisualEventType, WeaponId } from '$/backend/src/games/fish-oil-battle/config/GameEnums';
import { createWeaponDecorator } from './entities/decorators/WeaponDecorators';

/**
 * 赛博鱼油主渲染器（编排层）
 *
 * 坐标系统：
 * - 后端物理引擎使用固定 1280×720 逻辑坐标
 * - 前端 Pixi 画布尺寸 = 容器实际像素（响应式）
 * - 本类负责逻辑坐标 → 画布像素的映射（mapX / mapY）
 * - 所有视觉尺寸 = 逻辑尺寸 × uniformScale
 *
 * 视觉分层（从后到前）：
 * L5 全息舞台层 → L3 场地印记 → L2 实体投射 → L1 玩家本体
 * L4 DOM Overlay 层（Vue 管理，不在 Pixi 内）
 */

export class CyberFishRenderer {
  // ─── Pixi 核心 ─────────────────────────────────────
  public readonly app: PIXI.Application;
  public readonly stage: PIXI.Container;

  // ─── 视觉分层容器（直接挂在 stage 上） ────────────
  private l1Player!: PIXI.Container;   // 玩家本体
  private l2Entity!: PIXI.Container;   // 实体投射
  private l3Field!: PIXI.Container;    // 场地印记
  private l5Hologram!: PIXI.Container; // 全屏特效

  // ─── 子系统 ─────────────────────────────────────
  private physics: PhysicsSystem;
  private particlePool: ParticlePool;
  private effectRenderer: EffectRenderer;
  private globalEffectRenderer!: GlobalEffectRenderer;
  private arenaRenderer!: ArenaRenderer;
  private playerRenderers: Map<string, PlayerRenderer> = new Map();

  // ─── 战斗状态 ─────────────────────────────────────
  private battleActive = false;

  // ─── 蜂群渲染状态（蜂巢母体常驻） ──────────────────
  /** 活跃蜂群玩家：playerId → { beeCount, isBurst } */
  private hivePlayers = new Map<string, { beeCount: number; isBurst: boolean }>();

  // ─── 防火墙追踪（减速特效检测） ────────────────────
  /** 活跃防火墙 { 画布像素坐标 + 所有者 }，检测对手是否在范围内 */
  private activeFirewalls: Array<{ x: number; y: number; radius: number; ownerId: string; spawnedAt: number }> = [];
  private static readonly FIREWALL_MAX_LIFE_MS = 22000; // 18s 持续时间 + 4s 缓冲

  // ─── 渲染循环 ─────────────────────────────────────
  private rafId = 0;
  private lastTime = 0;

  /** 当前画布尺寸（用于坐标映射） */
  private canvasW = getLogicalW();
  private canvasH = getLogicalH();

  constructor(app: PIXI.Application) {
    this.app = app;
    this.stage = app.stage;

    console.log(`[CyberFish] constructor: app.screen=${app.screen.width}x${app.screen.height}`);

    // 1. 创建视觉分层容器
    this.createLayers();

    // 2. 初始化子系统
    this.physics = new PhysicsSystem();
    this.particlePool = new ParticlePool(this.l2Entity, 300);
    this.effectRenderer = new EffectRenderer(
      this.l2Entity,
      this.l3Field,
      this.l5Hologram,
      this.particlePool,
      this,
    );
    this.globalEffectRenderer = new GlobalEffectRenderer(
      this.l2Entity,
      this.l5Hologram,
      app.screen.width,
      app.screen.height,
    );

    // 3. 竞技场背景（最底层）
    this.arenaRenderer = new ArenaRenderer(this.stage);

    // 4. 初始尺寸适配
    this.canvasW = app.screen.width;
    this.canvasH = app.screen.height;
    console.log(`[CyberFish] init canvasW=${this.canvasW} canvasH=${this.canvasH} uniformScale=${this.getUniformScale().toFixed(3)}`);
    this.arenaRenderer.resize(this.canvasW, this.canvasH);

    // 5. 后处理滤镜
    this.applyPostProcessing();
  }

  // ═══════════════════════════════════════════════════
  //  公开方法
  // ═══════════════════════════════════════════════════

  /**
   * 注册一个玩家（创建 PlayerRenderer）。
   * 如果该玩家已存在（如重新开局），先销毁旧渲染器再创建新的。
   */
  addPlayer(playerId: string, faction: Faction, displayName: string): void {
    if (this.playerRenderers.has(playerId)) {
      console.log(`[CyberFish] addPlayer: id=${playerId} 已存在，先移除再重建`);
      this.removePlayer(playerId);
    }
    console.log(`[CyberFish] addPlayer: id=${playerId} faction=${faction} name=${displayName}`);
    const pr = new PlayerRenderer(this.l1Player, playerId, faction, this.particlePool);
    pr.setDisplayName(displayName);
    pr.setScale(this.getUniformScale());
    this.playerRenderers.set(playerId, pr);
  }

  /**
   * 移除玩家
   */
  removePlayer(playerId: string): void {
    const pr = this.playerRenderers.get(playerId);
    if (pr) {
      pr.destroy();
      this.playerRenderers.delete(playerId);
    }
    this.physics.removePlayer(playerId);
    this.hivePlayers.delete(playerId);
    this.effectRenderer.removeHiveBees(playerId);
  }

  /**
   * 更新某玩家的后端物理状态（由 WebSocket 事件驱动）
   * 注意：x/y 是后端 LOGICAL 坐标（1280×720），会自动映射到画布像素
   */
  updatePlayerState(playerId: string, state: PhysicsState): void {
    // 将后端逻辑坐标映射为画布像素坐标
    const mappedX = this.mapX(state.x);
    const mappedY = this.mapY(state.y);
    console.log(
      `[CyberFish] updatePlayerState: id=${playerId} logical=(${state.x},${state.y}) → pixel=(${mappedX.toFixed(1)},${mappedY.toFixed(1)}) canvas=${this.canvasW}x${this.canvasH}`,
    );
    this.physics.updateState(playerId, {
      ...state,
      x: mappedX,
      y: mappedY,
      vx: state.vx * this.getUniformScale(),
      vy: state.vy * this.getUniformScale(),
    });
  }

  /**
   * 处理全局彩蛋视觉效果
   */
  handleGlobalEffect(event: VisualEventData): void {
    this.globalEffectRenderer.handleGlobalEvent(event, this.mapX.bind(this), this.mapY.bind(this));
  }

  /**
   * 触发技能特效（坐标为后端 LOGICAL，自动映射）
   * @param config.playerId 发起技能的玩家 ID（用于获取头像主题色）
   * @param config.radius 后端传入的技能生效范围（逻辑 px），前端用此值绘特效
   */
  triggerSkillEffect(config: {
    type: VisualEventType;
    x?: number; y?: number;
    isBurst?: boolean;
    radius?: number;
    visualWidth?: number;
    visualHeight?: number;
    durationSec?: number;
    fromX?: number; fromY?: number;
    toX?: number; toY?: number;
    angle?: number;
    factionColor?: number;
    playerId?: string;
    /** shape/sustained_shape 专用：形状描述 */
    shapeDesc?: ShapeDescriptor;
    /** shape 专用：动画配置 */
    shapeAnimCfg?: {
      life?: number;
      scaleStart?: number; scaleEnd?: number;
      alphaStart?: number; alphaEnd?: number;
      rotationSpeed?: number;
      ease?: 'linear' | 'easeOut' | 'easeIn' | 'easeInOut';
    };
    /** sustained_shape 专用：唯一标识键 */
    sustainedKey?: string;
    /** sustained_shape 专用：脉冲/旋转配置 */
    sustainedCfg?: {
      pulseSpeed?: number;
      rotationSpeed?: number;
      alphaPulse?: boolean;
    };
    /** sustained_shape 专用：部分更新（用于 updateSustained） */
    sustainedPartial?: Partial<ShapeEffectConfig>;
    /** sustained_shape 专用：移除操作 */
    sustainedRemove?: boolean;
    /** 空气斥力场锚点 ID，air_anchor/air_burst 专用 */
    anchorId?: string;
    /** 空气斥力场锚点列表（含真实坐标，由后端周期同步事件携带） */
    airAnchors?: Array<{ id: string; x: number; y: number; radius: number; secondsLeft?: number }>;
    /** 空气斥力场气罩位置 X（玩家自身位置） */
    shieldX?: number;
    /** 空气斥力场气罩位置 Y（玩家自身位置） */
    shieldY?: number;
    /** 空气斥力场气罩半径 */
    shieldRadius?: number;
    /** 目标玩家 ID，entropic_frostbite 等效果专用 */
    targetId?: string;
    /** 熵寂之触冻伤层数，entropic_frostbite 专用 */
    frostbiteStacks?: number;
    /** 白猫：灵感墨水层数 */
    inkStacks?: number;
    /** 白猫：是否为肌肉兔形态 */
    isMuscleRabbit?: boolean;
    /** 白猫：小兔/肌肉兔位置 X */
    rabbitX?: number;
    /** 白猫：小兔/肌肉兔位置 Y */
    rabbitY?: number;
    /** 小金喵：电弧弹射次数 */
    bounceCount?: number;
    /** 小金喵：放电猫虚影位置 X */
    catX?: number;
    /** 小金喵：放电猫虚影位置 Y */
    catY?: number;
    /** 小金喵：电弧弹射链节点 */
    arcNodes?: Array<{ x: number; y: number }>;
    /** 风随：先见层数 */
    foresightStacks?: number;
    /** 风随：猫灵回响 ID */
    echoId?: string;
    /** Carzeye：落雷颜色阶段 */
    weatherPhase?: number;
    /** Carzeye：落雷颜色 */
    weatherColor?: number;
    /** 林澈：当前心境 */
    currentMood?: string;
    /** KE：流体方向（弧度） */
    flowDir?: number;
    /** KE：漩涡牵引力 */
    pullForce?: number;
    /** 梦：回响数量 */
    echoCount?: number;
    /** 梦：记忆碎片 ID */
    shardId?: string;
    /** 梦：原始伤害值 */
    originalDamage?: number;
    /** 梦：共振层数 */
    resonanceStacks?: number;
    /** 陈厌孑：折叠层数 */
    foldLayer?: number;
    /** 陈厌孑：闪避是否成功 */
    dodgeSuccess?: boolean;
    /** 陈厌孑：折叠次数 */
    foldCount?: number;
    /** 沐里：植物 ID（BOTANICAL_PLANT_SPAWN/DECAY 专用） */
    plantId?: string;
    /** 沐里：植物性格（gentle/fierce/curious） */
    personality?: string;
    /** 沐里：植物数量（BOTANICAL_BURST 专用） */
    plantCount?: number;
    /** 沐里：爆发持续时间（ms） */
    durationMs?: number;
    /** 追猎协议：追猎者位置 X（PURSUIT_PROTOCOL_MARK 专用，追踪线起点） */
    hunterX?: number;
    /** 追猎协议：追猎者位置 Y（PURSUIT_PROTOCOL_MARK 专用，追踪线起点） */
    hunterY?: number;
    /** KE：书生愤怒态（hp<30% 时触发，色系切换为深红） */
    isAngry?: boolean;
  }): void {
    // 映射所有坐标参数
    const mapCfg: typeof config & Record<string, any> = { ...config };
    if (config.x !== undefined) mapCfg.x = this.mapX(config.x);
    if (config.y !== undefined) mapCfg.y = this.mapY(config.y);
    if (config.fromX !== undefined) mapCfg.fromX = this.mapX(config.fromX);
    if (config.fromY !== undefined) mapCfg.fromY = this.mapY(config.fromY);
    if (config.toX !== undefined) mapCfg.toX = this.mapX(config.toX);
    if (config.toY !== undefined) mapCfg.toY = this.mapY(config.toY);
    if (config.hunterX !== undefined) mapCfg.hunterX = this.mapX(config.hunterX);
    if (config.hunterY !== undefined) mapCfg.hunterY = this.mapY(config.hunterY);

    // 根据 playerId 获取头像主题色
    const themeColor = config.playerId
      ? this.playerRenderers.get(config.playerId)?.getTrailColor()
      : undefined;

    switch (config.type) {
      case VisualEventType.HIT_FEEDBACK: {
        const reaction = (config as any).hitReaction ?? 'flash';
        const targetId = (config as any).targetId;
        const damage = (config as any).hitDamage;
        const sourceId = (config as any).hitSourceId;
        if (targetId) {
          const pr = this.playerRenderers.get(targetId);
          if (pr) {
            pr.playHitEffect(reaction as HitReaction);
            // 优先使用攻击者主题色，回退到 reaction 颜色
            const sourceColor = sourceId
              ? this.playerRenderers.get(sourceId)?.getTrailColor()
              : undefined;
            const dmgColor = sourceColor ?? this.getDamageColor(reaction as HitReaction);
            if (damage !== undefined) pr.showDamageNumber(damage, dmgColor);
          }
        }
        break;
      }
      case VisualEventType.SHOCKWAVE_TRIGGER:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          const shockRadius = config.radius ?? SHOCKWAVE_MAX_RADIUS;
          this.effectRenderer.triggerShockwave(mapCfg.x, mapCfg.y, config.isBurst ?? false, -1, themeColor, shockRadius);
        }
        break;
      case VisualEventType.FIREWALL_SPAWN:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          const fwRadius = config.radius ?? FIREWALL_HEX_RADIUS;
          this.effectRenderer.triggerFirewall(
            mapCfg.x, mapCfg.y, config.isBurst ?? false, undefined, themeColor, fwRadius,
            config.visualWidth, config.visualHeight, config.durationSec,
          );
          // 追踪防火墙位置用于减速特效检测
          if (config.playerId) {
            this.activeFirewalls.push({
              x: mapCfg.x,
              y: mapCfg.y,
              radius: fwRadius * this.getUniformScale(),
              ownerId: config.playerId,
              spawnedAt: performance.now(),
            });
          }
        }
        break;
      case VisualEventType.HIVE_STING:
        if (mapCfg.fromX !== undefined && mapCfg.fromY !== undefined &&
            mapCfg.toX !== undefined && mapCfg.toY !== undefined) {
          this.effectRenderer.triggerHiveSting(
            mapCfg.fromX, mapCfg.fromY, mapCfg.toX, mapCfg.toY,
            themeColor,
          );
        }
        break;
      case VisualEventType.HIVE_STING_BOUNCE:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerHiveStingBounce(mapCfg.x, mapCfg.y, themeColor);
        }
        break;
      case VisualEventType.BURST_TRIGGER:
        this.effectRenderer.triggerBurstFlash(themeColor ?? config.factionColor ?? 0xFF00FF);
        if (config.playerId) {
          this.playerRenderers.get(config.playerId)?.setBurstMode(true);
          // 4 秒后关闭爆发态（由 burstDurationSec 决定）
          // 简化：使用 setTimeout，后续可改为事件驱动
          setTimeout(() => {
            this.playerRenderers.get(config.playerId ?? '')?.setBurstMode(false);
          }, ((config as any).durationMs ?? 4000) as number);
        }
        break;
      case VisualEventType.OPTICAL_SLASH_TRIGGER:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined && config.radius !== undefined) {
          this.effectRenderer.triggerOpticalSlash(
            mapCfg.x, mapCfg.y,
            (config as any).angle ?? 0, config.radius,
            themeColor ?? config.factionColor ?? 0x00BFFF,
            false,
            undefined,
            getWeaponPalette(WeaponId.OPTICAL_SLASH),
          );
        }
        break;
      case VisualEventType.OPTICAL_SLASH_BURST:
        // 无限剑制三阶段：浮动 → 锁定 → 突进追踪
        {
          const phase = (mapCfg.metadata?.phase as string) ?? 'float';
          if (phase === 'float') {
            // 浮动阶段：启动动画
            if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
              this.effectRenderer.triggerOpticalBurst(
                mapCfg.x, mapCfg.y,
                themeColor ?? config.factionColor ?? 0x00BFFF,
                config.radius,
                undefined,
                getWeaponPalette(WeaponId.OPTICAL_SLASH),
              );
            }
          } else if (phase === 'lock') {
            // 锁定阶段：更新刀刃信息（转换逻辑坐标为画布坐标）
            const rawBlades = (mapCfg.metadata?.burstBlades as Array<{
              targetId: string; startX: number; startY: number;
              endX: number; endY: number;
            }>) ?? [];
            const blades = rawBlades.map(b => ({
              targetId: b.targetId,
              startX: this.mapX(b.startX),
              startY: this.mapY(b.startY),
            }));
            this.effectRenderer.updateOpticalBurstBlades(blades);
          }
        }
        break;
      case VisualEventType.SHAPE_EFFECT:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined && config.shapeDesc) {
          this.effectRenderer.triggerShapeEffect(
            config.shapeDesc,
            mapCfg.x, mapCfg.y,
            config.shapeAnimCfg,
          );
        }
        break;
      case VisualEventType.SUSTAINED_SHAPE:
        if (config.sustainedRemove && config.sustainedKey) {
          // 移除操作
          this.effectRenderer.removeSustainedShape(config.sustainedKey);
        } else if (config.sustainedPartial && config.sustainedKey) {
          // 更新操作
          this.effectRenderer.updateSustainedShape(config.sustainedKey, config.sustainedPartial);
        } else if (mapCfg.x !== undefined && mapCfg.y !== undefined && config.shapeDesc && config.sustainedKey) {
          // 创建操作
          this.effectRenderer.triggerSustainedShape(
            config.sustainedKey,
            config.shapeDesc,
            mapCfg.x, mapCfg.y,
            config.sustainedCfg,
          );
        }
        break;
      case VisualEventType.AIR_REPULSION_ANCHOR: {
        // 修复：读取后端 metadata.anchors 数组（含真实锚点坐标），对每个锚点分别调用
        const anchorPalette = getWeaponPalette(WeaponId.AIR_REPULSION_FIELD);
        const anchors = config.airAnchors;

        if (anchors && anchors.length > 0) {
          // 有锚点列表：对每个锚点分别调用（用真实坐标）
          for (const anchor of anchors) {
            const ax = this.mapX(anchor.x);
            const ay = this.mapY(anchor.y);
            this.effectRenderer.triggerAirAnchor(
              ax, ay,
              anchor.id ?? `anchor_${Date.now()}_${Math.random()}`,
              themeColor,
              undefined,
              anchorPalette,
            );
          }
        } else if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          // 无锚点列表（首次创建）：用事件坐标
          this.effectRenderer.triggerAirAnchor(
            mapCfg.x, mapCfg.y,
            config.anchorId ?? `anchor_${Date.now()}`,
            themeColor,
            undefined,
            anchorPalette,
          );
        }

        // 气罩（shieldX/Y/radius）——由 AirRepulsionFieldRenderer.updateShield 渲染
        const shieldX = config.shieldX;
        const shieldY = config.shieldY;
        const shieldRadius = config.shieldRadius;
        if (shieldX !== undefined && shieldY !== undefined && shieldRadius !== undefined) {
          this.effectRenderer.updateAirShield(
            config.playerId ?? '',
            this.mapX(shieldX), this.mapY(shieldY),
            shieldRadius,
            themeColor,
            anchorPalette,
          );
        }
        break;
      }
      case VisualEventType.AIR_REPULSION_BURST:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerAirBurst(
            mapCfg.x, mapCfg.y,
            config.radius,
            themeColor,
            undefined,
            getWeaponPalette(WeaponId.AIR_REPULSION_FIELD),
          );
        }
        break;
      case VisualEventType.ENTROPIC_TOUCH_AURA:
        // 低温场 aura 已移除（靠装饰器月轮表示，避免视觉杂乱）
        break;
      case VisualEventType.ENTROPIC_TOUCH_FROSTBITE:
        // 冻伤叠加视觉效果
        if (config.targetId && mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerEntropicFrostbite(
            config.targetId,
            config.frostbiteStacks ?? 1,
            mapCfg.x, mapCfg.y,
            themeColor,
            getWeaponPalette(WeaponId.ENTROPIC_TOUCH),
          );
        }
        break;
      case VisualEventType.ENTROPIC_TOUCH_BURST:
        // 爆发视觉效果（热力学奇点）
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerEntropicBurst(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.radius ?? 200,
            themeColor,
            undefined,
            getWeaponPalette(WeaponId.ENTROPIC_TOUCH),
          );
        }
        break;
      case VisualEventType.DRAWING_MANIFEST_INK:
        // 小兔/肌肉兔虚影已移除（靠装饰器画板表示，避免视觉杂乱）
        break;
      case VisualEventType.DRAWING_MANIFEST_BURST:
        // 肌肉兔降临爆发
        {
          const bx = config.rabbitX !== undefined ? this.mapX(config.rabbitX) : mapCfg.x;
          const by = config.rabbitY !== undefined ? this.mapY(config.rabbitY) : mapCfg.y;
          if (bx !== undefined && by !== undefined) {
            this.effectRenderer.triggerDrawingBurst(
              config.playerId ?? 'unknown',
              bx, by,
              config.radius ?? 50,
              themeColor,
              getWeaponPalette(WeaponId.DRAWING_MANIFEST),
            );
          }
        }
        break;
      case VisualEventType.DRAWING_MANIFEST_DASH:
        // 肌肉兔冲刺撞击
        {
          const isHit = (config as any).isHit ?? false;
          if (mapCfg.x !== undefined && mapCfg.y !== undefined &&
              config.toX !== undefined && config.toY !== undefined) {
            this.effectRenderer.triggerDrawingDash(
              mapCfg.x, mapCfg.y,
              this.mapX(config.toX), this.mapY(config.toY),
              isHit,
              themeColor,
              getWeaponPalette(WeaponId.DRAWING_MANIFEST),
            );
          }
        }
        break;
      case VisualEventType.DISCHARGE_CAT_ARC:
        // 电弧链接（小金喵 → 对手球，实时跟随）
        {
          const isBurst = config.isBurst ?? false;
          const sourceId = config.playerId ?? '';
          const targetId = config.targetId ?? '';
          if (sourceId && targetId) {
            this.effectRenderer.triggerDischargeArc(
              sourceId, targetId, isBurst,
              themeColor,
              getWeaponPalette(WeaponId.DISCHARGE_CAT),
            );
          }
        }
        break;
      case VisualEventType.DISCHARGE_CAT_BURST:
        // 雷霆万钧爆发
        {
          const bx = config.catX !== undefined ? this.mapX(config.catX) : mapCfg.x;
          const by = config.catY !== undefined ? this.mapY(config.catY) : mapCfg.y;
          if (bx !== undefined && by !== undefined) {
            this.effectRenderer.triggerDischargeBurst(
              config.playerId ?? 'unknown',
              bx, by,
              config.radius ?? 120,
              themeColor,
              getWeaponPalette(WeaponId.DISCHARGE_CAT),
            );
          }
        }
        break;
      case VisualEventType.PRECOGNITIVE_LENS_FORESIGHT:
        // 先见光环已移除（靠装饰器透镜刻度环表示，避免视觉杂乱）
        break;
      case VisualEventType.PRECOGNITIVE_LENS_ECHO:
        // 猫灵回响投射物
        if (mapCfg.x !== undefined && mapCfg.y !== undefined &&
            config.toX !== undefined && config.toY !== undefined) {
          this.effectRenderer.triggerPrecognitiveEcho(
            mapCfg.x, mapCfg.y,
            this.mapX(config.toX), this.mapY(config.toY),
            config.isBurst ?? false,
            themeColor,
            getWeaponPalette(WeaponId.PRECOGNITIVE_LENS),
          );
        }
        break;
      case VisualEventType.PRECOGNITIVE_LENS_BURST:
        // 无限洞察爆发
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerPrecognitiveBurst(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            themeColor,
            getWeaponPalette(WeaponId.PRECOGNITIVE_LENS),
          );
        }
        break;
      case VisualEventType.EMOTIONAL_WEATHER_LIGHTNING:
        // 落雷
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerWeatherLightning(
            mapCfg.x, mapCfg.y,
            config.radius ?? 40,
            config.weatherColor ?? 0x4DA6FF,
            getWeaponPalette(WeaponId.EMOTIONAL_WEATHER),
          );
        }
        break;
      case VisualEventType.EMOTIONAL_WEATHER_HAIL:
        // 冰雹
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerWeatherHail(
            mapCfg.x, mapCfg.y,
            config.radius ?? 30,
            getWeaponPalette(WeaponId.EMOTIONAL_WEATHER),
          );
        }
        break;
      case VisualEventType.EMOTIONAL_WEATHER_BURST:
        // 极端气候爆发
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerWeatherBurst(
            mapCfg.x, mapCfg.y,
            config.radius ?? 200,
            getWeaponPalette(WeaponId.EMOTIONAL_WEATHER),
          );
        }
        break;
      case VisualEventType.EMOTION_MASTERY_MOOD:
        // 心境轮转光环已移除（靠装饰器心境光环表示，避免视觉杂乱）
        break;
      case VisualEventType.EMOTION_MASTERY_BURST:
        // 情绪实体化爆发
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerEmotionBurst(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            themeColor,
            getWeaponPalette(WeaponId.EMOTION_MASTERY),
          );
        }
        break;
      case VisualEventType.FLUID_MASTERY_TRAIL:
        // 水流尾迹已移除（靠装饰器漂浮古籍表示，避免视觉杂乱）
        break;
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
            getWeaponPalette(WeaponId.FLUID_MASTERY),
          );
        }
        break;
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
            getWeaponPalette(WeaponId.FLUID_MASTERY),
          );
        }
        break;
      case VisualEventType.MEMORY_CORRIDOR_ECHO:
        // 梦回响光环已移除（靠装饰器六边形碎片环表示，避免视觉杂乱）
        break;
      case VisualEventType.MEMORY_CORRIDOR_RESONANCE:
        // 梦历史共振
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerMemoryResonance(
            config.targetId ?? '',
            mapCfg.x, mapCfg.y,
            config.resonanceStacks ?? 1,
            themeColor ?? config.factionColor,
            getWeaponPalette(WeaponId.MEMORY_CORRIDOR),
          );
        }
        break;
      case VisualEventType.MEMORY_CORRIDOR_BURST:
        // 梦记忆洪流爆发
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerMemoryBurst(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.radius ?? 200,
            config.echoCount ?? 0,
            themeColor ?? config.factionColor,
            undefined,
            getWeaponPalette(WeaponId.MEMORY_CORRIDOR),
          );
        }
        break;
      case VisualEventType.INFINITE_FOLD_DODGE:
        // 陈厌孑空间闪避
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerFoldDodge(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.radius ?? 40,
            config.foldLayer ?? 1,
            config.dodgeSuccess ?? false,
            themeColor ?? config.factionColor,
            getWeaponPalette(WeaponId.INFINITE_FOLD),
          );
        }
        break;
      case VisualEventType.INFINITE_FOLD_REASSEMBLE:
        // 陈厌孑空间重组
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerFoldReassemble(
            config.targetId ?? '',
            mapCfg.x, mapCfg.y,
            config.foldCount ?? 1,
            themeColor ?? config.factionColor,
            getWeaponPalette(WeaponId.INFINITE_FOLD),
          );
        }
        break;
      case VisualEventType.INFINITE_FOLD_BURST:
        // 陈厌孑维度坍缩爆发
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerFoldBurst(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.radius ?? 180,
            themeColor ?? config.factionColor,
            undefined,
            getWeaponPalette(WeaponId.INFINITE_FOLD),
          );
        }
        break;
      case VisualEventType.BOTANICAL_PLANT_SPAWN:
        // 沐里植物生成
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerPlantSpawn(
            config.plantId ?? `plant_${Date.now()}`,
            mapCfg.x, mapCfg.y,
            (config.personality ?? 'gentle') as 'gentle' | 'fierce' | 'curious',
            config.radius ?? 40,
            themeColor,
            getWeaponPalette(WeaponId.BOTANICAL_CONTROL),
          );
        }
        break;
      case VisualEventType.BOTANICAL_PLANT_DECAY:
        // 沐里植物枯萎
        this.effectRenderer.triggerPlantDecay(
          config.plantId ?? `plant_${Date.now()}`,
        );
        break;
      case VisualEventType.BOTANICAL_BURST:
        // 沐里植物派对爆发
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerBotanicalBurst(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.radius ?? 60,
            config.plantCount ?? 0,
            themeColor,
            config.durationMs,
            getWeaponPalette(WeaponId.BOTANICAL_CONTROL),
          );
        }
        break;
      // ── 基础武器扩展（9 个，场 + 爆发） ──────────────
      case VisualEventType.NANO_RIPPER_FIELD:
        // 纳米撕裂者 - 撕裂场
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerNanoRipperField(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.radius ?? 60,
            themeColor,
          );
        }
        break;
      case VisualEventType.NANO_RIPPER_BURST:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerNanoRipperBurst(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.radius ?? 200,
            themeColor,
          );
        }
        break;
      case VisualEventType.PURSUIT_PROTOCOL_MARK:
        // 追猎协议 - 追猎标记（x/y=目标位置，hunterX/hunterY=追猎者位置）
        if (config.targetId && mapCfg.x !== undefined && mapCfg.y !== undefined &&
            mapCfg.hunterX !== undefined && mapCfg.hunterY !== undefined) {
          this.effectRenderer.triggerPursuitMark(
            config.targetId,
            mapCfg.x, mapCfg.y,
            mapCfg.hunterX, mapCfg.hunterY,
            config.radius ?? 60,
            themeColor,
          );
        }
        break;
      case VisualEventType.PURSUIT_PROTOCOL_BURST:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerPursuitBurst(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.radius ?? 200,
            themeColor,
          );
        }
        break;
      case VisualEventType.GRAVITY_WELL_CORE:
        // 重力阱 - 重力核心
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerGravityCore(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.radius ?? 60,
            themeColor,
          );
        }
        break;
      case VisualEventType.GRAVITY_WELL_BURST:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerGravityBurst(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.radius ?? 200,
            themeColor,
          );
        }
        break;
      case VisualEventType.ENTROPY_DIFFUSER_FIELD:
        // 熵增扩散器 - 熵增场
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerEntropyDiffuserField(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.radius ?? 60,
            themeColor,
          );
        }
        break;
      case VisualEventType.ENTROPY_DIFFUSER_BURST:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerEntropyDiffuserBurst(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.radius ?? 200,
            themeColor,
          );
        }
        break;
      case VisualEventType.BASTION_BUILDER_SHIELD:
        // 堡垒构筑者 - 堡垒护盾
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerBastionShield(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.radius ?? 60,
            themeColor,
          );
        }
        break;
      case VisualEventType.BASTION_BUILDER_BURST:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerBastionBurst(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.radius ?? 200,
            themeColor,
          );
        }
        break;
      case VisualEventType.CIRCUIT_WEAVER_NETWORK:
        // 电路编织者 - 电路网络
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerCircuitNetwork(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.radius ?? 60,
            themeColor,
          );
        }
        break;
      case VisualEventType.CIRCUIT_WEAVER_BURST:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerCircuitBurst(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.radius ?? 200,
            themeColor,
          );
        }
        break;
      case VisualEventType.QUANTUM_RIFT_FISSURE:
        // 量子裂隙 - 裂隙
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerQuantumRift(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.radius ?? 60,
            themeColor,
          );
        }
        break;
      case VisualEventType.QUANTUM_RIFT_BURST:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerQuantumBurst(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.radius ?? 200,
            themeColor,
          );
        }
        break;
      case VisualEventType.SIZE_WARP_FIELD:
        // 体积扭曲 - 扭曲场
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerSizeWarpField(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.radius ?? 60,
            themeColor,
          );
        }
        break;
      case VisualEventType.SIZE_WARP_BURST:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerSizeWarpBurst(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.radius ?? 200,
            themeColor,
          );
        }
        break;
      case VisualEventType.RICOCHET_CORE_TRAIL:
        // 弹射核心 - 弹射轨迹
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerRicochetTrail(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.radius ?? 60,
            themeColor,
          );
        }
        break;
      case VisualEventType.RICOCHET_CORE_BURST:
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerRicochetBurst(
            config.playerId ?? 'unknown',
            mapCfg.x, mapCfg.y,
            config.radius ?? 200,
            themeColor,
          );
        }
        break;
      default:
        console.warn('[CyberFishRenderer] 未处理的 VisualEventType:', config.type);
        break;
    }
  }

  /**
   * 触发玩家受击效果（含拖尾截断防翻折）
   */
  playHitEffect(playerId: string, reaction?: HitReaction): void {
    const pr = this.playerRenderers.get(playerId);
    pr?.playHitEffect(reaction);
    // pr?.onCollision(); // 碰撞时截断旧拖尾，避免方向突变导致翻折
  }

  /**
   * 触发玩家爆发效果
   */
  playBurstEffect(playerId: string): void {
    this.playerRenderers.get(playerId)?.playBurstEffect();
  }

  /**
   * 在指定玩家上方显示掉血数字
   */
  showDamageNumber(playerId: string, damage: number, color?: number): void {
    this.playerRenderers.get(playerId)?.showDamageNumber(damage, color);
  }

  /**
   * 获取玩家拖尾主题色（用于伤害数字着色）
   */
  getPlayerTrailColor(playerId: string): number | undefined {
    return this.playerRenderers.get(playerId)?.getTrailColor();
  }

  /**
   * 设置玩家的武器装饰器（按 weaponId 创建对应装饰）
   */
  setWeaponDecorator(playerId: string, weaponId: WeaponId): void {
    const pr = this.playerRenderers.get(playerId);
    if (!pr) return;
    const palette = getWeaponPalette(weaponId);
    if (!palette) return;
    // 修复：装饰器改挂到 l1Player（与 PlayerRenderer.container 同层），避免被球体遮挡
    const decorator = createWeaponDecorator(weaponId, this.l1Player, palette);
    pr.setWeaponDecorator(decorator);
  }

  /**
   * 根据受击反应类型返回对应的伤害数字颜色
   */
  private getDamageColor(reaction: HitReaction): number {
    switch (reaction) {
      case 'freeze': return 0x88CCFF;
      case 'shock': return 0xFFEE88;
      case 'burn': return 0xFF8800;
      case 'slash': return 0xDDDDDD;
      case 'pull': return 0xCC99FF;
      default: return 0xFF3333;
    }
  }

  /**
   * 设置战斗是否激活
   */
  setBattleActive(active: boolean): void {
    this.battleActive = active;
    if (!active) {
      this.activeFirewalls = [];
    }
  }

  /**
   * 设置玩家存活状态（大逃杀模式，死亡后隐藏球体）
   */
  setPlayerAlive(playerId: string, alive: boolean): void {
    const pr = this.playerRenderers.get(playerId);
    if (pr) {
      pr.setVisible(alive);
      if (!alive) {
        pr.setWeaponDecorator(undefined);
      }
    }
    if (!alive) {
      this.physics.removePlayer(playerId);
      // 清理蜂群
      this.hivePlayers.delete(playerId);
      this.effectRenderer.removeHiveBees(playerId);
    }
  }

  /**
   * 设置玩家蜂群渲染（蜂巢母体常驻特效）
   * @param playerId 玩家 ID
   * @param beeCount 蜂数量（3 常态 / 6 爆发）
   * @param isBurst 是否爆发状态
   */
  setPlayerHiveActive(playerId: string, beeCount: number, isBurst: boolean): void {
    this.hivePlayers.set(playerId, { beeCount, isBurst });
  }

  /**
   * 移除玩家蜂群渲染
   */
  removePlayerHive(playerId: string): void {
    this.hivePlayers.delete(playerId);
    this.effectRenderer.removeHiveBees(playerId);
  }

  /**
   * 启动渲染循环
   */
  start(): void {
    if (this.rafId) return;
    this.lastTime = performance.now();
    const loop = (now: number) => {
      this.rafId = requestAnimationFrame(loop);
      const dt = now - this.lastTime;
      if (dt > 0) this.renderFrame(dt);
      this.lastTime = now;
    };
    this.rafId = requestAnimationFrame(loop);
  }

  /**
   * 停止渲染循环
   */
  stop(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  /**
   * 设置竞技场配置（由后端 battle_start 消息驱动）
   */
  setArenaConfig(config: { width: number; height: number; arenaRadius: number; ballRadius: number; shape?: string; arenaHalfW?: number; arenaHalfH?: number; wallColor?: number }): void {
    // 更新 constants.ts 中的动态配置（传递 shape）
    updateArenaConfig({
      width: config.width,
      height: config.height,
      arenaRadius: config.arenaRadius,
      ballRadius: config.ballRadius,
      shape: config.shape as any,
      arenaHalfW: config.arenaHalfW,
      arenaHalfH: config.arenaHalfH,
    });

    // 同步后端墙壁颜色（保证所有玩家一致）
    this.arenaRenderer.setWallColor(config.wallColor);

    // 更新画布尺寸
    this.canvasW = this.app.screen.width;
    this.canvasH = this.app.screen.height;

    // 重新调整竞技场渲染器
    this.arenaRenderer.resize(this.canvasW, this.canvasH);

    // 同步特效缩放
    const scale = this.getUniformScale();
    this.effectRenderer.setScale(scale, this.canvasW, this.canvasH);
    this.particlePool.setScale(scale);
    this.globalEffectRenderer.resize(this.canvasW, this.canvasH);

    // 同步玩家缩放
    for (const [, pr] of this.playerRenderers) {
      pr.setScale(scale);
    }

    console.log(`[CyberFish] setArenaConfig: ${config.width}x${config.height}, radius=${config.arenaRadius}, ballRadius=${config.ballRadius}, uniformScale=${scale.toFixed(3)}`);
  }

  /**
   * 销毁（释放所有资源）
   */
  private _destroyed = false;

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this.stop();
    this.arenaRenderer?.destroy();
    this.effectRenderer?.destroy();
    this.globalEffectRenderer?.destroy();
    this.particlePool?.destroy();
    this.physics.clear();
    for (const [, pr] of this.playerRenderers) {
      pr.destroy();
    }
    this.playerRenderers.clear();
    this.activeFirewalls = [];
    this.l1Player?.destroy({ children: true });
    this.l2Entity?.destroy({ children: true });
    this.l3Field?.destroy({ children: true });
    this.l5Hologram?.destroy({ children: true });
  }

  /**
   * 通知画布尺寸变化 → 重算坐标映射（uniformScale + 偏移）+ 已存状态修正 + 小球尺寸同步
   */
  resize(w: number, h: number): void {
    const oldScale = this.getUniformScale();
    const oldOX = this.offsetX;
    const oldOY = this.offsetY;

    this.canvasW = w;
    this.canvasH = h;

    const newScale = this.getUniformScale();
    const newOX = this.offsetX;
    const newOY = this.offsetY;
    const scaleRatio = newScale / oldScale;

    console.log(`[CyberFish] resize: oldScale=${oldScale.toFixed(3)} → newScale=${newScale.toFixed(3)}, offset=(${newOX.toFixed(0)},${newOY.toFixed(0)})`);

    // 对已存的物理状态做 offset-aware 重映射（避免位置跳变）
    if (oldScale > 0) {
      this.physics.rescaleWithOffset(oldOX, oldOY, scaleRatio, newOX, newOY);
    }

    // 同步缩放：竞技场 → 特效 → 粒子池 → 全局特效 → 玩家
    this.arenaRenderer.resize(w, h);
    this.effectRenderer.setScale(newScale, w, h);
    this.particlePool.setScale(newScale);
    this.globalEffectRenderer.resize(w, h);

    const uniformScale = newScale;
    for (const [, pr] of this.playerRenderers) {
      pr.setScale(uniformScale);
    }
  }

  // ═══════════════════════════════════════════════════
  //  坐标映射：后端 LOGICAL (1280×720) → 画布像素
  //  使用 uniformScale + 居中偏移，保证竞技场边界和玩家位置在同一坐标空间
  // ═══════════════════════════════════════════════════

  /** 统一缩放因子（等比缩放，X/Y 取小保证不超出边界），暴露给 HUD 适配用 */
  getUniformScale(): number {
    const logicalW = getLogicalW();
    const logicalH = getLogicalH();
    return Math.min(this.canvasW / logicalW, this.canvasH / logicalH);
  }
  /** X 轴居中偏移（pillarbox/letterbox） */
  private get offsetX(): number { return (this.canvasW - getLogicalW() * this.getUniformScale()) / 2; }
  /** Y 轴居中偏移 */
  private get offsetY(): number { return (this.canvasH - getLogicalH() * this.getUniformScale()) / 2; }

  /** 逻辑 X → 画布 X（等比 + 居中） */
  private mapX(logicalX: number): number { return logicalX * this.getUniformScale() + this.offsetX; }
  /** 逻辑 Y → 画布 Y（等比 + 居中） */
  private mapY(logicalY: number): number { return logicalY * this.getUniformScale() + this.offsetY; }

  // ═══════════════════════════════════════════════════
  //  私有方法
  // ═══════════════════════════════════════════════════

  private createLayers(): void {
    // L5: 全息舞台层（最底层，全屏效果）
    this.l5Hologram = new PIXI.Container();
    this.l5Hologram.zIndex = -100;
    this.stage.addChild(this.l5Hologram);

    // L3: 场地印记层
    this.l3Field = new PIXI.Container();
    this.l3Field.zIndex = 10;
    this.stage.addChild(this.l3Field);

    // L2: 实体投射层
    this.l2Entity = new PIXI.Container();
    this.l2Entity.zIndex = 20;
    this.stage.addChild(this.l2Entity);

    // L1: 玩家本体层（最上层）
    this.l1Player = new PIXI.Container();
    this.l1Player.zIndex = 30;
    this.stage.addChild(this.l1Player);

    this.stage.sortableChildren = true;
  }

  private renderFrame(dt: number): void {
    if (this.battleActive) {
      // 1. 推进物理插值时间
      this.physics.advanceRenderTime(dt);

      // 清理过期防火墙记录（防止无限增长）
      const now = performance.now();
      this.activeFirewalls = this.activeFirewalls.filter(
        fw => now - fw.spawnedAt < CyberFishRenderer.FIREWALL_MAX_LIFE_MS,
      );

      // 2. 更新所有 PlayerRenderer（插值后的画布像素状态）
      for (const [playerId, pr] of this.playerRenderers) {
        const state = this.physics.interpolate(playerId, performance.now());
        if (state) {
          pr.update(state, dt);
          // 防火墙减速检测
          let slowed = false;
          for (const fw of this.activeFirewalls) {
            if (fw.ownerId === playerId) continue; // 不减速自己
            const dx = state.x - fw.x;
            const dy = state.y - fw.y;
            if (Math.sqrt(dx * dx + dy * dy) < fw.radius) {
              slowed = true;
              break;
            }
          }
          pr.setSlowed(slowed);
        }
      }

      // 2.5 更新蜂群绕球公转（蜂巢母体常驻特效）
      for (const [playerId, hv] of this.hivePlayers) {
        const state = this.physics.interpolate(playerId, performance.now());
        if (state) {
          const themeColor = this.playerRenderers.get(playerId)?.getTrailColor();
          this.effectRenderer.updateHiveBees(
            playerId, state.x, state.y,
            hv.beeCount, hv.isBurst, dt,
            themeColor,
          );
        }
      }
    } else {
      // 非战斗阶段（武器选择）：也渲染玩家（用最后设置的位置）
      for (const [playerId, pr] of this.playerRenderers) {
        const state = this.physics.getLastState(playerId);
        if (state) {
          // 构造一个静态 InterpolatedState 用于渲染
          pr.update({
            x: state.x,
            y: state.y,
            vx: 0, vy: 0,
            speed: 0,
            rotation: 0,
          } as InterpolatedState, dt);
        }
      }
    }

    // 3. 更新粒子系统
    this.particlePool.update(dt);

    // 4. 更新特效系统
    this.effectRenderer.update(dt);

    // 5. 更新全局彩蛋特效（闪白/马赛克/牵引线）
    this.globalEffectRenderer.update(dt * 1000); // 转为毫秒
  }

  private applyPostProcessing(): void {
    try {
      const alphaFilter = new PIXI.AlphaFilter({ alpha: 0.98 } as any);
      this.stage.filters = [alphaFilter];
    } catch {
      // 滤镜不可用，忽略
    }
  }

  // ─── Getter ───────────────────────────────────────────
  getPhysicsSystem(): PhysicsSystem { return this.physics; }
  getEffectRenderer(): EffectRenderer { return this.effectRenderer; }
  getPlayerRenderer(playerId: string): PlayerRenderer | undefined {
    return this.playerRenderers.get(playerId);
  }
}
