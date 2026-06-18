import * as PIXI from 'pixi.js';
import { ShapeEffect, type ShapeEffectConfig } from '../entities/ShapeEffect';

/**
 * ShapeEffect 对象池
 *
 * - 预分配 PIXI.Graphics，避免运行时 GC
 * - 支持按 id 查找/更新/移除持续特效
 * - 与 EffectRenderer 解耦
 */
export class ShapeEffectPool {
  private pool: ShapeEffect[] = [];
  private nextId = 1;

  /** 活跃特效索引（id → ShapeEffect） */
  private activeById: Map<number, ShapeEffect> = new Map();

  /**
   * @param container 形状挂载的容器
   * @param preloadCount 预创建数量
   */
  constructor(container: PIXI.Container, preloadCount = 20) {
    for (let i = 0; i < preloadCount; i++) {
      const g = new PIXI.Graphics();
      g.visible = false;
      container.addChild(g);
      const ef = new ShapeEffect(g, {
        shape: { type: 'circle' },
        x: 0, y: 0,
        sustained: false,
      });
      this.pool.push(ef);
    }
  }

  /**
   * 获取一个 ShapeEffect（从池里取或自动扩展）
   */
  acquire(config: ShapeEffectConfig, scaleFactor: number): ShapeEffect | null {
    let ef: ShapeEffect | undefined;

    for (const e of this.pool) {
      if (!e.active) { ef = e; break; }
    }

    if (!ef) {
      const g = new PIXI.Graphics();
      const parent = this.pool[0]?.g.parent;
      parent?.addChild(g);
      ef = new ShapeEffect(g, {
        shape: { type: 'circle' },
        x: 0, y: 0,
        sustained: false,
      });
      this.pool.push(ef);
    }

    // 先设置 config 再 activate（因为 activate 会读取 config）
    ef.config = config;
    ef.activate(this.nextId++, scaleFactor);

    this.activeById.set(ef.id, ef);
    return ef;
  }

  /**
   * 获取一个持续在场的形状特效
   * @returns 特效 id（供后续 updateSustained / removeSustained 使用）
   */
  acquireSustained(config: ShapeEffectConfig, scaleFactor: number): number {
    const ef = this.acquire(config, scaleFactor);
    return ef?.id ?? -1;
  }

  /**
   * 按 id 更新持续特效的配置（位置、颜色、形状等）
   */
  updateSustained(id: number, partial: Partial<ShapeEffectConfig>, scaleFactor: number): void {
    const ef = this.activeById.get(id);
    if (!ef) return;

    // 合并配置
    Object.assign(ef.config, partial);

    // 位置变化立即应用
    if (partial.x !== undefined || partial.y !== undefined) {
      ef.g.x = partial.x ?? ef.config.x;
      ef.g.y = partial.y ?? ef.config.y;
    }

    // 形状/颜色变化 → 重绘
    if (partial.shape !== undefined) {
      ef.redraw(scaleFactor);
    }
  }

  /**
   * 按 id 移除持续特效
   */
  removeSustained(id: number): void {
    const ef = this.activeById.get(id);
    if (!ef) return;
    ef.destroy();
    this.activeById.delete(id);
  }

  /**
   * 每帧更新所有活跃特效
   */
  tick(dt: number): void {
    for (const [id, ef] of this.activeById) {
      ef.tick(dt);
      if (!ef.active) {
        this.activeById.delete(id);
      }
    }
  }

  /** 清除所有 */
  clear(): void {
    for (const [, ef] of this.activeById) {
      ef.destroy();
    }
    this.activeById.clear();
  }

  /** 获取活跃特效数量 */
  get activeCount(): number {
    return this.activeById.size;
  }

  /** 销毁（释放 Pixi 资源） */
  destroy(): void {
    this.clear();
    for (const ef of this.pool) {
      ef.g.destroy(true);
    }
    this.pool.length = 0;
  }
}
