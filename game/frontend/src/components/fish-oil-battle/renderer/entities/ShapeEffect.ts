import * as PIXI from 'pixi.js';
import { ShapeRenderer, type ShapeDescriptor } from '../systems/ShapeRenderer';

/**
 * 形状特效配置
 */
export interface ShapeEffectConfig {
  /** 形状描述 */
  shape: ShapeDescriptor;
  /** 中心点（逻辑坐标） */
  x: number;
  y: number;
  /** 是否可持续（false = 一次性播放后自动回收） */
  sustained: boolean;
  /** 总生命周期（ms），sustained=false 时有效 */
  life?: number;
  /** 每 tick 回调 (self, t, dt)，t∈[0,1] */
  onTick?: (self: ShapeEffect, t: number, dt: number) => void;
  /** 被销毁时回调 */
  onDestroy?: (self: ShapeEffect) => void;
}

/**
 * 可持续存在的形状特效实体
 *
 * 与 ActiveEffect 不同：
 * - sustained=true 时持续在场地上存在（直到主动移除）
 * - 支持每 tick 回调（脉动、旋转、颜色变化）
 * - 对象池化（避免频繁创建/销毁 Graphics）
 */
export class ShapeEffect {
  /** 唯一 ID（由池分配） */
  id: number = 0;
  /** 挂载的 Graphics 实例 */
  g: PIXI.Graphics;
  /** 配置 */
  config: ShapeEffectConfig;

  /** 已过去时间（ms） */
  life = 0;
  /** 是否活跃 */
  active = false;
  /** 缩放（由外部/缓动驱动） */
  scale = 1;
  /** 透明度（由外部/缓动驱动） */
  alpha = 1;
  /** 旋转（rad，由外部/缓动驱动） */
  rotation = 0;

  constructor(g: PIXI.Graphics, config: ShapeEffectConfig) {
    this.g = g;
    this.config = config;
  }

  /** 初始化（池回收后重新激活时调用） */
  activate(id: number, scaleFactor: number): void {
    this.id = id;
    this.active = true;
    this.life = 0;
    this.scale = 1;
    this.alpha = 1;
    this.rotation = 0;

    const s = scaleFactor;
    const { shape, x, y } = this.config;

    const scaledShape: ShapeDescriptor = {
      ...shape,
      radius: shape.radius !== undefined ? shape.radius * s : undefined,
      width: shape.width !== undefined ? shape.width * s : undefined,
      height: shape.height !== undefined ? shape.height * s : undefined,
      strokeWidth: shape.strokeWidth !== undefined ? shape.strokeWidth * s : undefined,
      cornerRadius: shape.cornerRadius !== undefined ? shape.cornerRadius * s : undefined,
      innerRadius: shape.innerRadius !== undefined ? shape.innerRadius * s : undefined,
      x1: shape.x1 !== undefined ? shape.x1 * s : undefined,
      y1: shape.y1 !== undefined ? shape.y1 * s : undefined,
      x2: shape.x2 !== undefined ? shape.x2 * s : undefined,
      y2: shape.y2 !== undefined ? shape.y2 * s : undefined,
    };

    // 缩放多边形点
    if (shape.points) {
      const raw = shape.points;
      if (Array.isArray(raw[0])) {
        scaledShape.points = (raw as [number, number][]).map(([px, py]) => [px * s, py * s]);
      } else {
        scaledShape.points = (raw as number[]).map(v => v * s);
      }
    }

    this.g.clear();
    this.g.x = x;
    this.g.y = y;
    ShapeRenderer.drawShape(this.g, scaledShape);
    this.g.visible = true;
  }

  /** 重新绘制（用于 updateSustainedShape 更新形状参数） */
  redraw(scaleFactor: number): void {
    const s = scaleFactor;
    const { shape, x, y } = this.config;

    const scaledShape: ShapeDescriptor = {
      ...shape,
      radius: shape.radius !== undefined ? shape.radius * s : undefined,
      width: shape.width !== undefined ? shape.width * s : undefined,
      height: shape.height !== undefined ? shape.height * s : undefined,
      strokeWidth: shape.strokeWidth !== undefined ? shape.strokeWidth * s : undefined,
      cornerRadius: shape.cornerRadius !== undefined ? shape.cornerRadius * s : undefined,
      innerRadius: shape.innerRadius !== undefined ? shape.innerRadius * s : undefined,
      x1: shape.x1 !== undefined ? shape.x1 * s : undefined,
      y1: shape.y1 !== undefined ? shape.y1 * s : undefined,
      x2: shape.x2 !== undefined ? shape.x2 * s : undefined,
      y2: shape.y2 !== undefined ? shape.y2 * s : undefined,
    };

    if (shape.points) {
      const raw = shape.points;
      if (Array.isArray(raw[0])) {
        scaledShape.points = (raw as [number, number][]).map(([px, py]) => [px * s, py * s]);
      } else {
        scaledShape.points = (raw as number[]).map(v => v * s);
      }
    }

    this.g.clear();
    this.g.x = x;
    this.g.y = y;
    ShapeRenderer.drawShape(this.g, scaledShape);
  }

  /** 每帧更新 */
  tick(dt: number): void {
    if (!this.active) return;
    this.life += dt;

    // 一次性特效：超时自动回收
    if (!this.config.sustained && this.config.life && this.life >= this.config.life) {
      this.destroy();
      return;
    }

    const t = this.config.life ? this.life / this.config.life : this.life;
    this.g.scale.set(this.scale);
    this.g.alpha = this.alpha;
    this.g.rotation = this.rotation;

    this.config.onTick?.(this, t, dt);
  }

  /** 销毁（回池，不销毁 Graphics） */
  destroy(): void {
    if (!this.active) return;
    this.active = false;
    this.g.visible = false;
    this.g.clear();
    this.config.onDestroy?.(this);
  }
}
