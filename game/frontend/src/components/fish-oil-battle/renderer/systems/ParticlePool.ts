import * as PIXI from 'pixi.js';
import { BLEND_MODES } from '../constants';
import { ShapeRenderer, type ShapeDescriptor } from './ShapeRenderer';

export interface PooledParticle {
  sprite: PIXI.Sprite | PIXI.Graphics;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  scaleStart: number;
  scaleEnd: number;
  alphaStart: number;
  alphaEnd: number;
  rotationSpeed: number;
  tint: number;
  active: boolean;
}

/**
 * 对象池化粒子系统
 * - 预分配固定容量，避免 GC
 * - 支持 Sprite 和 Graphics 两种粒子
 * - 与 EffectRenderer 解耦：只管理生命周期，不决策生成时机
 */
export class ParticlePool {
  private pool: PooledParticle[];
  private capacity: number;

  /**
   * @param container 粒子挂载的容器
   * @param capacity 最大粒子数（默认 300）
   */
  constructor(container: PIXI.Container, capacity = 300) {
    this.capacity = capacity;
    this.pool = new Array(capacity);
    for (let i = 0; i < capacity; i++) {
      // 预创建 Graphics 粒子（通用圆形）
      const g = new PIXI.Graphics();
      g.visible = false;
      g.alpha = 0;
      container.addChild(g);
      this.pool[i] = {
        sprite: g,
        vx: 0, vy: 0,
        life: 0, maxLife: 0,
        scaleStart: 1, scaleEnd: 1,
        alphaStart: 1, alphaEnd: 0,
        rotationSpeed: 0,
        tint: 0xffffff,
        active: false,
      };
    }
  }

  /** 同步全局缩放（由 CyberFishRenderer.resize 驱动，供外部 emit 时使用） */
  setScale(_scale: number): void {
    // 当前缩放由调用方在 emit 时自行应用（如 EffectRenderer 已乘 scale）
  }

  /**
   * 发射一个粒子
   * @returns 粒子对象，若池已满返回 null
   */
  emit(config: {
    x: number; y: number;
    vx?: number; vy?: number;
    life?: number;
    scaleStart?: number; scaleEnd?: number;
    alphaStart?: number; alphaEnd?: number;
    tint?: number;
    radius?: number;
    rotationSpeed?: number;
  }): PooledParticle | null {
    // 找第一个不活跃的粒子
    let p: PooledParticle | null = null;
    for (let i = 0; i < this.capacity; i++) {
      if (!this.pool[i].active) {
        p = this.pool[i];
        break;
      }
    }
    if (!p) {
      // 池已满：回收最旧的（简单策略：回收第一个）
      p = this.pool[0];
      p.active = false;
    }

    // 初始化 Graphics 为圆形
    const g = p.sprite as PIXI.Graphics;
    g.clear();
    g.circle(0, 0, config.radius ?? 3);
    g.fill({ color: config.tint ?? 0xffffff });
    g.x = config.x;
    g.y = config.y;
    g.visible = true;
    g.alpha = config.alphaStart ?? 1;
    g.blendMode = BLEND_MODES.ADD as unknown as PIXI.BLEND_MODES;
    g.rotation = 0;

    p.vx = config.vx ?? 0;
    p.vy = config.vy ?? 0;
    p.life = 0;
    p.maxLife = config.life ?? 1000;
    p.scaleStart = config.scaleStart ?? 1;
    p.scaleEnd = config.scaleEnd ?? 0;
    p.alphaStart = config.alphaStart ?? 1;
    p.alphaEnd = config.alphaEnd ?? 0;
    p.rotationSpeed = config.rotationSpeed ?? 0;
    p.tint = config.tint ?? 0xffffff;
    p.active = true;

    return p;
  }

  /**
   * 从形状区域发射粒子（包围盒简化版）
   *
   * @param shape      形状描述符
   * @param count      粒子数量
   * @param pCfg       每个粒子的基础配置
   * @param offsetX    发射中心 X 偏移（世界坐标）
   * @param offsetY    发射中心 Y 偏移（世界坐标）
   */
  emitFromShape(
    shape: ShapeDescriptor,
    count: number,
    pCfg: {
      life?: number;
      scaleStart?: number; scaleEnd?: number;
      alphaStart?: number; alphaEnd?: number;
      tint?: number;
      speed?: number;
      speedSpread?: number;
      fromCenter?: boolean;
      rotationSpeed?: number;
      radius?: number;
    },
    offsetX = 0,
    offsetY = 0,
  ): void {
    const bounds = ShapeRenderer.getBounds(shape);
    const speed = pCfg.speed ?? 100;
    const spread = pCfg.speedSpread ?? 0;

    for (let i = 0; i < count; i++) {
      let px: number, py: number, nx: number, ny: number;

      if (pCfg.fromCenter) {
        // 从中心随机角度发射
        const a = Math.random() * Math.PI * 2;
        const distFactor = Math.random();
        // 在包围盒内随机取点（椭圆近似）
        const hw = (bounds.maxX - bounds.minX) / 2;
        const hh = (bounds.maxY - bounds.minY) / 2;
        px = Math.cos(a) * hw * distFactor;
        py = Math.sin(a) * hh * distFactor;
        nx = Math.cos(a);
        ny = Math.sin(a);
      } else {
        // 从包围盒边缘随机取点
        const hw = (bounds.maxX - bounds.minX) / 2;
        const hh = (bounds.maxY - bounds.minY) / 2;
        const perimeter = 2 * (hw + hh);

        // 按周长比例选择边
        const edgeRand = Math.random() * perimeter;
        if (edgeRand < hh) {
          // 左边
          px = bounds.minX;
          py = bounds.minY + edgeRand;
          nx = -1; ny = 0;
        } else if (edgeRand < hh + hw * 2) {
          // 上边
          px = bounds.minX + (edgeRand - hh);
          py = bounds.minY;
          nx = 0; ny = -1;
        } else if (edgeRand < hh * 2 + hw * 2) {
          // 右边
          px = bounds.maxX;
          py = bounds.minY + (edgeRand - hh - hw * 2);
          nx = 1; ny = 0;
        } else {
          // 下边
          px = bounds.minX + (edgeRand - hh * 2 - hw * 2);
          py = bounds.maxY;
          nx = 0; ny = 1;
        }

        // 添加微小的随机偏移让发射方向自然
        const angleJitter = (Math.random() - 0.5) * 0.4;
        const cosJ = Math.cos(angleJitter), sinJ = Math.sin(angleJitter);
        const rnx = nx * cosJ - ny * sinJ;
        const rny = nx * sinJ + ny * cosJ;
        nx = rnx; ny = rny;
      }

      const s = speed + (Math.random() - 0.5) * 2 * spread;

      this.emit({
        x: offsetX + px,
        y: offsetY + py,
        vx: nx * s,
        vy: ny * s,
        life: pCfg.life ?? 800,
        scaleStart: pCfg.scaleStart ?? 0.5,
        scaleEnd: pCfg.scaleEnd ?? 0,
        alphaStart: pCfg.alphaStart ?? 1,
        alphaEnd: pCfg.alphaEnd ?? 0,
        tint: pCfg.tint ?? 0xffffff,
        radius: pCfg.radius ?? 2,
        rotationSpeed: pCfg.rotationSpeed ?? 0,
      });
    }
  }

  /**
   * 每帧更新所有活跃粒子
   * @param dt 帧间隔（ms）
   */
  update(dt: number): void {
    for (let i = 0; i < this.capacity; i++) {
      const p = this.pool[i];
      if (!p.active) continue;

      p.life += dt;
      if (p.life >= p.maxLife) {
        // 生命周期结束 → 回收
        p.active = false;
        p.sprite.visible = false;
        p.sprite.alpha = 0;
        continue;
      }

      const t = p.life / p.maxLife;

      // 位置
      p.sprite.x += p.vx * dt / 1000;
      p.sprite.y += p.vy * dt / 1000;

      // 缩放
      const s = p.scaleStart + (p.scaleEnd - p.scaleStart) * t;
      p.sprite.scale.set(s);

      // 透明度
      p.sprite.alpha = p.alphaStart + (p.alphaEnd - p.alphaStart) * t;

      // 旋转
      p.sprite.rotation += p.rotationSpeed * dt / 1000;
    }
  }

  /** 清除所有活跃粒子 */
  clear(): void {
    for (let i = 0; i < this.capacity; i++) {
      if (this.pool[i].active) {
        this.pool[i].active = false;
        this.pool[i].sprite.visible = false;
        this.pool[i].sprite.alpha = 0;
      }
    }
  }

  /** 销毁（释放 Pixi.js 资源） */
  destroy(): void {
    for (let i = 0; i < this.capacity; i++) {
      this.pool[i].sprite.destroy(true);
    }
    this.pool.length = 0;
  }
}
