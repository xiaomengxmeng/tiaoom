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
import {
  ShockwaveEffectRenderer,
} from './ShockwaveEffectRenderer';
import {
  FirewallEffectRenderer,
} from './FirewallEffectRenderer';
import {
  HiveEffectRenderer,
} from './HiveEffectRenderer';
import type {
  ShockwaveVisualConfig,
  FirewallVisualConfig,
  HiveVisualConfig,
} from './VisualEffectUtils';

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
    this.shockwaveRenderer = new ShockwaveEffectRenderer(fieldContainer, this.canvasW, this.canvasH);
    this.firewallRenderer = new FirewallEffectRenderer(fieldContainer);
    this.hiveRenderer = new HiveEffectRenderer(
      entityContainer, hologramContainer, particlePool,
      this.canvasW, this.canvasH,
    );

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

  // ══════════════════════════════════════════════════════
  //  生命周期
  // ══════════════════════════════════════════════════════

  update(dt: number): void {
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
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this.clear();

    this.shockwaveRenderer.destroy();
    this.firewallRenderer.destroy();
    this.hiveRenderer.destroy();
    this.shapeEffectPool.destroy();
  }
}
