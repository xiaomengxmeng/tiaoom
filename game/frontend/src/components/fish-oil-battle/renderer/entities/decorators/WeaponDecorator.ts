// game/frontend/src/components/fish-oil-battle/renderer/entities/decorators/WeaponDecorator.ts
import * as PIXI from 'pixi.js';
import type { Palette } from '../BaseWeaponEffectRenderer';

/**
 * 武器装饰器抽象基类
 *
 * 装饰器挂在小球 avatar 圆形 mask 之外，随小球 scale/position 同步。
 * 不绘制球体本身（球体来自头像）。
 *
 * 子类按类型分为 4 种：
 * - TopDecorator（顶部装饰）
 * - OrbitDecorator（环绕旋转）
 * - OuterRingDecorator（外圈纹路）
 * - SideDecorator（侧挂缠绕）
 */
export abstract class WeaponDecorator {
  protected container: PIXI.Container;
  protected palette: Palette;
  protected scale = 1;
  protected burstActive = false;

  constructor(parentContainer: PIXI.Container, palette: Palette) {
    this.container = new PIXI.Container();
    this.palette = palette;
    // 确保装饰器在球体之上（球体由 PlayerRenderer.container 持有）
    this.container.zIndex = 100;
    parentContainer.addChild(this.container);
    // 启用父容器 sortableChildren，使 zIndex 生效
    // l1Player 默认未启用 sortableChildren，此处确保启用
    (parentContainer as PIXI.Container).sortableChildren = true;
  }

  /** 同步缩放（与 PlayerRenderer.setScale 联动） */
  setScale(s: number): void {
    this.scale = s;
    this.container.scale.set(s);
  }

  /** 同步位置（与 PlayerRenderer 位置联动） */
  setPosition(x: number, y: number): void {
    this.container.position.set(x, y);
  }

  /** 每帧更新（由 PlayerRenderer.update 驱动，用于公转/呼吸等动画） */
  abstract update(dt: number): void;

  /** 爆发态切换（部分装饰有变化，默认空实现） */
  setBurstMode(active: boolean): void {
    this.burstActive = active;
  }

  /** 销毁 */
  destroy(): void {
    if (!this.container.destroyed) {
      this.container.destroy({ children: true });
    }
  }
}
