// game/frontend/src/components/fish-oil-battle/renderer/entities/decorators/WeaponDecorators.ts
import * as PIXI from 'pixi.js';
import { WeaponId } from '$/backend/src/games/fish-oil-battle/config/GameEnums';
import { WeaponDecorator } from './WeaponDecorator';
import type { Palette } from '../BaseWeaponEffectRenderer';

// Vite 预加载所有装饰 PNG 资源 URL
const decoratorAssets = import.meta.glob<{ default: string }>('./assets/*.png', { eager: true, query: '?url', import: 'default' });
console.log('[WeaponDecorators] decoratorAssets keys:', Object.keys(decoratorAssets));
console.log('[WeaponDecorators] decoratorAssets values:', Object.values(decoratorAssets));

// ════════════════════════════════════════════════════════
// PNG Sprite 装饰器基类
// ════════════════════════════════════════════════════════

/**
 * 基于 PNG Sprite 的装饰器基类
 *
 * 子类通过构造函数传入 texturePath + yOffset + baseScale
 * burst 动画（放大+抖动+变色）已内置
 */
abstract class SpriteDecorator extends WeaponDecorator {
  protected sprite: PIXI.Sprite | null = null;
  protected phase = 0;
  protected readonly texturePath: string;
  /** y 偏移：负值=上移（球顶上方），正值=下移 */
  protected readonly yOffset: number;
  /** 基础缩放：PNG 640x640 → 实际显示大小 */
  protected readonly baseScale: number;

  constructor(parent: PIXI.Container, palette: Palette, texturePath: string, yOffset: number, baseScale: number) {
    super(parent, palette);
    this.texturePath = texturePath;
    this.yOffset = yOffset;
    this.baseScale = baseScale;
    this.loadSprite();
  }

  private loadSprite(): void {
    // 从 import.meta.glob 预加载映射中获取 URL
    const url = decoratorAssets[this.texturePath];
    console.log(`[WeaponDecorator] loadSprite: texturePath=${this.texturePath}, url=`, url);
    if (!url) {
      console.warn(`[WeaponDecorator] 装饰资源未找到: ${this.texturePath}`);
      return;
    }
    const tex = PIXI.Assets.get(url);
    if (tex) {
      console.log(`[WeaponDecorator] 缓存命中: ${this.texturePath}`);
      this.onTextureReady(tex);
    } else {
      console.log(`[WeaponDecorator] 异步加载: ${url}`);
      PIXI.Assets.load(url).then((t) => {
        console.log(`[WeaponDecorator] 加载成功: ${this.texturePath}, texture=`, t);
        if (!this.container.destroyed) {
          this.onTextureReady(t);
        }
      }).catch((err) => {
        console.error(`[WeaponDecorator] 加载失败: ${url}`, err);
      });
    }
  }

  protected onTextureReady(tex: PIXI.Texture): void {
    console.log(`[WeaponDecorator] onTextureReady: texture size=${tex.width}x${tex.height}`);
    this.sprite = new PIXI.Sprite(tex);
    this.sprite.anchor.set(0.5); // 居中锚点（PNG 已居中处理）
    this.sprite.scale.set(this.baseScale * this.scale);
    this.sprite.y = this.yOffset;
    this.container.addChild(this.sprite);
    console.log(`[WeaponDecorator] sprite added, scale=${this.baseScale * this.scale}, yOffset=${this.yOffset}, container.children=${this.container.children.length}`);
  }

  update(dt: number): void {
    if (!this.sprite) return;
    // 爆发态：抖动 + 轻微放大
    if (this.burstActive) {
      this.phase += dt * 0.02;
      this.sprite.y = this.yOffset + Math.sin(this.phase) * 1.5;
      this.sprite.scale.set(this.baseScale * this.scale * 1.15);
    } else {
      this.sprite.y = this.yOffset;
      this.sprite.scale.set(this.baseScale * this.scale);
    }
  }

  setScale(s: number): void {
    super.setScale(s);
    if (this.sprite) {
      this.sprite.scale.set(this.baseScale * s);
    }
  }

  setBurstMode(active: boolean): void {
    super.setBurstMode(active);
    if (this.sprite) {
      // 爆发时 tint 亮色
      this.sprite.tint = active ? 0xFFEE88 : 0xFFFFFF;
    }
  }
}

// ════════════════════════════════════════════════════════
// 12 个武器装饰器
// ════════════════════════════════════════════════════════

/** 放电猫猫 - 猫耳 */
export class CatEarDecorator extends SpriteDecorator {
  constructor(parent: PIXI.Container, palette: Palette) {
    super(parent, palette, './assets/cat-ear.png', -30, 0.44);
  }
}

/** 流体操控(KE) - 漂浮古籍 */
export class FloatingBookDecorator extends SpriteDecorator {
  constructor(parent: PIXI.Container, palette: Palette) {
    super(parent, palette, './assets/floating-book.png', -15, 0.48);
  }
}

/** 情绪天气(Carzeye) - 云朵+闪电 */
export class CloudDecorator extends SpriteDecorator {
  constructor(parent: PIXI.Container, palette: Palette) {
    super(parent, palette, './assets/cloud-bolt.png', -25, 0.44);
  }

  protected onTextureReady(tex: PIXI.Texture): void {
    super.onTextureReady(tex);
    if (this.sprite) {
      this.sprite.anchor.set(0.507, 0.435);
    }
  }
}

/** 光学斩击(Liya) - 3 把刀旋转 */
export class TripleBladeDecorator extends SpriteDecorator {
  constructor(parent: PIXI.Container, palette: Palette) {
    super(parent, palette, './assets/triple-blade.png', 0, 0.48);
  }

  private rot = 0;

  protected onTextureReady(tex: PIXI.Texture): void {
    super.onTextureReady(tex);
    if (this.sprite) {
      this.sprite.anchor.set(0.499, 0.611);
    }
  }

  update(dt: number): void {
    super.update(dt);
    if (this.sprite) {
      this.rot += dt * (this.burstActive ? 0.015 : 0.005);
      this.sprite.rotation = this.rot;
    }
  }
}

/** 无限折叠(陈厌孑) - 3 个三角形旋转 */
export class TripleTriangleDecorator extends SpriteDecorator {
  constructor(parent: PIXI.Container, palette: Palette) {
    super(parent, palette, './assets/triple-triangle.png', 0, 0.48);
  }

  private rot = 0;

  protected onTextureReady(tex: PIXI.Texture): void {
    super.onTextureReady(tex);
    if (this.sprite) {
      this.sprite.anchor.set(0.517, 0.574);
    }
  }

  update(dt: number): void {
    super.update(dt);
    if (this.sprite) {
      this.rot -= dt * (this.burstActive ? 0.012 : 0.004);
      this.sprite.rotation = this.rot;
    }
  }
}

/** 记忆回廊(梦) - 6 个六边形碎片环 */
export class HexShardRingDecorator extends SpriteDecorator {
  constructor(parent: PIXI.Container, palette: Palette) {
    super(parent, palette, './assets/hex-shard-ring.png', 0, 0.48);
  }

  private rot = 0;

  protected onTextureReady(tex: PIXI.Texture): void {
    super.onTextureReady(tex);
    if (this.sprite) {
      this.sprite.anchor.set(0.512, 0.436);
    }
  }

  update(dt: number): void {
    super.update(dt);
    if (this.sprite) {
      this.rot += dt * (this.burstActive ? 0.008 : 0.003);
      this.sprite.rotation = this.rot;
    }
  }
}

/** 空气斥力场(闲乘月) - 双圈虚线+气流弧 */
export class AirFieldDecorator extends SpriteDecorator {
  constructor(parent: PIXI.Container, palette: Palette) {
    super(parent, palette, './assets/air-field.png', 0, 0.55);
  }
}

/** 熵寂之触(闲乘月) - 月轮+放射纹 */
export class MoonHaloDecorator extends SpriteDecorator {
  constructor(parent: PIXI.Container, palette: Palette) {
    super(parent, palette, './assets/moon-halo.png', 0, 0.55);
  }
}

/** 预知透镜(风随) - 刻度环+准星 */
export class LensRingDecorator extends SpriteDecorator {
  constructor(parent: PIXI.Container, palette: Palette) {
    super(parent, palette, './assets/lens-crosshair.png', 0, 0.55);
  }
}

/** 情绪掌控(林澈) - 心境光环 */
export class MoodAuraDecorator extends SpriteDecorator {
  constructor(parent: PIXI.Container, palette: Palette) {
    super(parent, palette, './assets/mood-aura.png', 0, 0.55);
  }
}

/** 画作实体化(白猫) - 画板+画笔侧挂 */
export class PaletteSlingDecorator extends SpriteDecorator {
  constructor(parent: PIXI.Container, palette: Palette) {
    super(parent, palette, './assets/palette-brush.png', 0, 0.48);
  }

  protected onTextureReady(tex: PIXI.Texture): void {
    super.onTextureReady(tex);
    if (this.sprite) {
      this.sprite.anchor.set(0.443, 0.690);
    }
  }
}

/** 植物伙伴(沐里) - 藤蔓缠绕 */
export class VineWrapDecorator extends SpriteDecorator {
  constructor(parent: PIXI.Container, palette: Palette) {
    super(parent, palette, './assets/vine-bud.png', 0, 0.48);
  }
}

// ════════════════════════════════════════════════════════
// 工厂函数
// ════════════════════════════════════════════════════════

/**
 * 根据 weaponId 创建对应装饰器
 * @returns WeaponDecorator 或 undefined（9 个基础武器无装饰）
 */
export function createWeaponDecorator(
  weaponId: WeaponId,
  parentContainer: PIXI.Container,
  palette: Palette,
): WeaponDecorator | undefined {
  switch (weaponId) {
    case WeaponId.DISCHARGE_CAT:
      return new CatEarDecorator(parentContainer, palette);
    case WeaponId.FLUID_MASTERY:
      return new FloatingBookDecorator(parentContainer, palette);
    case WeaponId.EMOTIONAL_WEATHER:
      return new CloudDecorator(parentContainer, palette);
    case WeaponId.OPTICAL_SLASH:
      return new TripleBladeDecorator(parentContainer, palette);
    case WeaponId.INFINITE_FOLD:
      return new TripleTriangleDecorator(parentContainer, palette);
    case WeaponId.MEMORY_CORRIDOR:
      return new HexShardRingDecorator(parentContainer, palette);
    case WeaponId.AIR_REPULSION_FIELD:
      return new AirFieldDecorator(parentContainer, palette);
    case WeaponId.ENTROPIC_TOUCH:
      return new MoonHaloDecorator(parentContainer, palette);
    case WeaponId.PRECOGNITIVE_LENS:
      return new LensRingDecorator(parentContainer, palette);
    case WeaponId.EMOTION_MASTERY:
      return new MoodAuraDecorator(parentContainer, palette);
    case WeaponId.DRAWING_MANIFEST:
      return new PaletteSlingDecorator(parentContainer, palette);
    case WeaponId.BOTANICAL_CONTROL:
      return new VineWrapDecorator(parentContainer, palette);
    default:
      return undefined;
  }
}
