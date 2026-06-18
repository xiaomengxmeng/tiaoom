import * as PIXI from 'pixi.js';
import { LOGICAL_W, LOGICAL_H, SHOCKWAVE_MAX_RADIUS, FIREWALL_HEX_RADIUS } from './constants';
import { PhysicsSystem, type InterpolatedState, type PhysicsState } from './systems/PhysicsSystem';
import { ParticlePool } from './systems/ParticlePool';
import { ArenaRenderer } from './systems/ArenaRenderer';
import { PlayerRenderer, type Faction } from './entities/PlayerRenderer';
import { EffectRenderer } from './entities/EffectRenderer';
import type { ShapeDescriptor } from './systems/ShapeRenderer';
import type { ShapeEffectConfig } from './entities/ShapeEffect';

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
  private canvasW = LOGICAL_W;
  private canvasH = LOGICAL_H;

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
   * 触发技能特效（坐标为后端 LOGICAL，自动映射）
   * @param config.playerId 发起技能的玩家 ID（用于获取头像主题色）
   * @param config.radius 后端传入的技能生效范围（逻辑 px），前端用此值绘特效
   */
  triggerSkillEffect(config: {
    type: 'shockwave' | 'shockwave_bounce' | 'shockwave_wavefront_trigger' | 'shockwave_wavefront_update' | 'shockwave_wavefront_remove' | 'firewall' | 'hive_sting' | 'hive_sting_bounce' | 'burst_flash' | 'shape' | 'sustained_shape';
    x?: number; y?: number;
    isBurst?: boolean;
    radius?: number;
    visualWidth?: number;
    visualHeight?: number;
    durationSec?: number;
    fromX?: number; fromY?: number;
    toX?: number; toY?: number;
    factionColor?: number;
    playerId?: string;
    /** 波前专用：唯一 ID */
    waveId?: string;
    /** 波前专用：射线端点数组 */
    rayEndpoints?: Array<{ x: number; y: number }>;
    /** 波前专用：透明度 */
    waveAlpha?: number;
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
  }): void {
    // 映射所有坐标参数
    const mapCfg: typeof config & Record<string, any> = { ...config };
    if (config.x !== undefined) mapCfg.x = this.mapX(config.x);
    if (config.y !== undefined) mapCfg.y = this.mapY(config.y);
    if (config.fromX !== undefined) mapCfg.fromX = this.mapX(config.fromX);
    if (config.fromY !== undefined) mapCfg.fromY = this.mapY(config.fromY);
    if (config.toX !== undefined) mapCfg.toX = this.mapX(config.toX);
    if (config.toY !== undefined) mapCfg.toY = this.mapY(config.toY);

    // 根据 playerId 获取头像主题色
    const themeColor = config.playerId
      ? this.playerRenderers.get(config.playerId)?.getTrailColor()
      : undefined;

    switch (config.type) {
      case 'shockwave':
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          const shockRadius = config.radius ?? SHOCKWAVE_MAX_RADIUS;
          this.effectRenderer.triggerShockwave(mapCfg.x, mapCfg.y, config.isBurst ?? false, -1, themeColor, shockRadius);
        }
        break;
      case 'shockwave_bounce':
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          const shockRadius = config.radius ?? SHOCKWAVE_MAX_RADIUS;
          this.effectRenderer.triggerShockwaveBounce(mapCfg.x, mapCfg.y, themeColor, shockRadius);
        }
        break;
      case 'shockwave_wavefront_trigger':
        if (config.waveId && mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerWavefront(
            config.waveId,
            mapCfg.x, mapCfg.y,
            config.isBurst ?? false,
            themeColor,
            config.rayEndpoints,
            config.waveAlpha,
          );
        }
        break;
      case 'shockwave_wavefront_update':
        if (config.waveId && config.rayEndpoints) {
          this.effectRenderer.updateWavefront(
            config.waveId,
            config.rayEndpoints,
            config.waveAlpha,
          );
        }
        break;
      case 'shockwave_wavefront_remove':
        if (config.waveId) {
          this.effectRenderer.removeWavefront(config.waveId);
        }
        break;
      case 'firewall':
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
      case 'hive_sting':
        if (mapCfg.fromX !== undefined && mapCfg.fromY !== undefined &&
            mapCfg.toX !== undefined && mapCfg.toY !== undefined) {
          this.effectRenderer.triggerHiveSting(
            mapCfg.fromX, mapCfg.fromY, mapCfg.toX, mapCfg.toY,
            themeColor,
          );
        }
        break;
      case 'hive_sting_bounce':
        if (mapCfg.x !== undefined && mapCfg.y !== undefined) {
          this.effectRenderer.triggerHiveStingBounce(mapCfg.x, mapCfg.y, themeColor);
        }
        break;
      case 'burst_flash':
        this.effectRenderer.triggerBurstFlash(themeColor ?? config.factionColor ?? 0xFF00FF);
        break;
      case 'shape':
        if (mapCfg.x !== undefined && mapCfg.y !== undefined && config.shapeDesc) {
          this.effectRenderer.triggerShapeEffect(
            config.shapeDesc,
            mapCfg.x, mapCfg.y,
            config.shapeAnimCfg,
          );
        }
        break;
      case 'sustained_shape':
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
    }
  }

  /**
   * 触发玩家受击效果（含拖尾截断防翻折）
   */
  playHitEffect(playerId: string): void {
    const pr = this.playerRenderers.get(playerId);
    pr?.playHitEffect();
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
  showDamageNumber(playerId: string, damage: number): void {
    this.playerRenderers.get(playerId)?.showDamageNumber(damage);
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
   * 销毁（释放所有资源）
   */
  private _destroyed = false;

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this.stop();
    this.arenaRenderer?.destroy();
    this.effectRenderer?.destroy();
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

    // 同步缩放：竞技场 → 特效 → 粒子池 → 玩家
    this.arenaRenderer.resize(w, h);
    this.effectRenderer.setScale(newScale, w, h);
    this.particlePool.setScale(newScale);

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
  getUniformScale(): number { return Math.min(this.canvasW / LOGICAL_W, this.canvasH / LOGICAL_H); }
  /** X 轴居中偏移（pillarbox/letterbox） */
  private get offsetX(): number { return (this.canvasW - LOGICAL_W * this.getUniformScale()) / 2; }
  /** Y 轴居中偏移 */
  private get offsetY(): number { return (this.canvasH - LOGICAL_H * this.getUniformScale()) / 2; }

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
