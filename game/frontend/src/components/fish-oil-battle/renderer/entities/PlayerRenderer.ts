import * as PIXI from 'pixi.js';
import { BLEND_MODES, getPlayerBaseRadius } from '../constants';
import type { InterpolatedState } from '../systems/PhysicsSystem';
import { ParticlePool } from '../systems/ParticlePool';
import type { WeaponDecorator } from './decorators/WeaponDecorator';
import type { HitReaction } from '$/backend/src/games/fish-oil-battle/shared/protocol';

/** 流派色彩配置 */
export const FACTION_COLORS: Record<string, { primary: number; glow: number; dim: number }> = {
  aggressor:  { primary: 0xE850D0, glow: 0xFF66FF, dim: 0x990099 },
  controller: { primary: 0x30A5E0, glow: 0x66D9FF, dim: 0x006699 },
  engineer:  { primary: 0x32D63A, glow: 0x7FFF66, dim: 0x1B9900 },
  wildcard:   { primary: 0xE5C000, glow: 0xFFED66, dim: 0xB39600 },
};

export type Faction = keyof typeof FACTION_COLORS;

/** 浮动掉血数字 */
interface DamageFloat {
  text: PIXI.Text;
  life: number;
  maxLife: number;
  baseY: number;
}

/**
 * 小球实体渲染器 — 极简风格（无旋转、无光环）
 *
 * 视觉构成（从下到上）：
 * 1. 彗星拖尾（高速运动时基于位置历史绘制富尾迹）
 * 2. 头像精灵（圆形裁切 + 1px 白边）
 * 3. 浮动 ID 文字（带背景胶囊提升可读性）
 * 4. 掉血数字（浮起渐隐）
 * - 无旋转 ╳
 * - 无光环 ╳
 * - 无运动拉伸 ╳
 * - 无独立阴影 ╳
 */
export class PlayerRenderer {
  private parentContainer: PIXI.Container;
  private container: PIXI.Container;
  private playerId: string;

  // ─── 视觉子元素 ─────────────────────────────────────────
  private trailCanvas!: HTMLCanvasElement;    // 离屏 Canvas — 倒三角拖尾
  private trailCtx!: CanvasRenderingContext2D;
  private trailSprite!: PIXI.Sprite;          // Canvas 驱动纹理
  private avatar: PIXI.Sprite;              // 头像
  private idText: PIXI.Text;                // ID 文字
  private idBg: PIXI.Graphics;              // ID 背景胶囊
  private damageTexts: DamageFloat[] = [];   // 浮动掉血数字

  // ─── 拖尾 ─────────────────────────────────────────────
  private particlePool: ParticlePool;
  private lastX = 0;
  private lastY = 0;
  private trailTimer = 0;
  private trailColor: number;
  private hasRealAvatar = false;

  // ─── 拖尾系统 v2（年龄衰减） ─────────────────
  /** 拖尾采样点（[0] = 最新/球端, [last] = 最老/尾端） */
  private trailPoints: Array<{ x: number; y: number; age: number }> = [];
  /** 两点间最小采样距离（逻辑坐标，会随 scale 更新） */
  private trailSampleDist: number;
  /** 最大保留点数 */
  private readonly MAX_TRAIL_POINTS = 20;
  /** 拖尾能量 0~1：高速积累，低速衰减 */
  private trailEnergy = 0;

  // ─── 特效状态 ─────────────────────────────────────────
  private hitFlashTimer = 0;
  private burstScaleTimer = 0;
  private currentFaction: Faction = 'aggressor';

  // ─── 减速特效 ─────────────────────────────────────────
  private isSlowed = false;
  private slowEffectTimer = 0;

  // ─── 武器装饰器 ─────────────────────────────────────────
  private weaponDecorator?: WeaponDecorator;

  // ─── 受击反馈状态 ─────────────────────────────────────
  private shakeOffset = { x: 0, y: 0, magnitude: 0, duration: 0, elapsed: 0 };

  // ─── 尺寸 ─────────────────────────────────────────────
  private radiusScale = 1.0;
  private get r(): number { return getPlayerBaseRadius() * this.radiusScale; }

  constructor(
    parentContainer: PIXI.Container,
    playerId: string,
    faction: Faction,
    particlePool: ParticlePool,
  ) {
    this.parentContainer = parentContainer;
    this.playerId = playerId;
    this.currentFaction = faction;
    this.particlePool = particlePool;
    this.trailColor = FACTION_COLORS[faction].primary;
    this.trailSampleDist = getPlayerBaseRadius() * 0.45;

    this.container = new PIXI.Container();
    this.parentContainer.addChild(this.container);

    // L0: 倒三角拖尾 — Canvas 离屏渲染驱动 Sprite 纹理（动态尺寸）
    this.trailSprite = new PIXI.Sprite();
    this.trailSprite.anchor.set(0.5, 0.5);
    this.trailSprite.visible = false;
    this.container.addChild(this.trailSprite);
    this.resizeTrailCanvas();

    // L1: 头像
    this.avatar = new PIXI.Sprite();
    this.createAvatarPlaceholder(faction);
    this.container.addChild(this.avatar);

    // L2: ID 背景胶囊 + 文字（提升可读性）
    this.idBg = new PIXI.Graphics();
    this.container.addChild(this.idBg);

    this.idText = new PIXI.Text({
      text: playerId,
      style: {
        fontFamily: 'system-ui, -apple-system, "SF Pro Display", Inter, sans-serif',
        fontSize: 13,
        fill: 0xFFFFFF,
        fontWeight: '700',
        stroke: { color: 0x000000, width: 3, alpha: 0.55 },
        align: 'center',
        letterSpacing: 0.5,
      },
    });
    this.idText.anchor.set(0.5, 0.5);
    this.idText.y = -this.r - 18;
    this.container.addChild(this.idText);
  }

  // ═══════════════════════════════════════════════════
  //  公开方法
  // ═══════════════════════════════════════════════════

  update(state: InterpolatedState, dt: number): void {
    const { x, y, speed } = state;

    // 位置（不旋转，避免所有子元素一起高频翻转导致眩晕）
    this.container.x = x;
    this.container.y = y;

    // ═══ 拖尾系统：距离采样 + 年龄衰减 ═══

    // 能量平滑：高速积累，低速衰减（避免突然消失）
    if (speed > 30) {
      this.trailEnergy = Math.min(1, this.trailEnergy + dt / 180);
    } else {
      this.trailEnergy = Math.max(0, this.trailEnergy - dt / 350);
    }

    // 距离采样：仅当位移超过阈值才加入新点，保证密度恒定
    const lastPt = this.trailPoints[0];
    if (!lastPt || Math.hypot(x - lastPt.x, y - lastPt.y) >= this.trailSampleDist) {
      this.trailPoints.unshift({ x, y, age: 0 });
    }

    // 年龄推移 + 过期清理
    const maxAge = 200 + this.trailEnergy * 500; // 静止 200ms → 高速 700ms
    for (const p of this.trailPoints) p.age += dt;
    while (this.trailPoints.length > 0) {
      const oldest = this.trailPoints[this.trailPoints.length - 1];
      if (oldest.age > maxAge) this.trailPoints.pop();
      else break;
    }
    // 数量上限
    while (this.trailPoints.length > this.MAX_TRAIL_POINTS) {
      this.trailPoints.pop();
    }

    // 拖尾粒子（基于能量，非纯时间驱动）
    this.trailTimer += dt * (0.5 + 0.5 * this.trailEnergy);
    if (this.trailTimer > 40 && this.trailEnergy > 0.25) {
      this.trailTimer = 0;
      this.emitTrailParticle(x, y, speed);
    }

    // 绘制彗星尾形
    this.drawCometTail();

    // 受击闪白（仅 damage 触发，wall hit 不再走这里）
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= dt;
      const t = Math.max(0, this.hitFlashTimer / 150);
      this.avatar.alpha = 0.3 + 0.7 * (1 - t); // 闪白：30%→100%
    } else if (this.isSlowed) {
      this.avatar.alpha = 0.85; // 减速时略微变暗
    } else {
      this.avatar.alpha = 1;
    }

    this.updateShake(dt);
    this.weaponDecorator?.update(dt);

    // 减速特效：蓝色粒子拖尾
    if (this.slowEffectTimer > 0) {
      this.slowEffectTimer -= dt;
      if (Math.random() < 0.3) {
        this.particlePool.emit({
          x: this.container.x + (Math.random() - 0.5) * this.r * 2,
          y: this.container.y + (Math.random() - 0.5) * this.r * 2,
          vx: (Math.random() - 0.5) * 20,
          vy: (Math.random() - 0.5) * 20,
          life: 500,
          radius: 3,
          alphaStart: 0.5,
          alphaEnd: 0,
          tint: 0x66CCFF,
        });
      }
    } else if (this.isSlowed) {
      this.isSlowed = false;
    }

    // 爆发放大
    if (this.burstScaleTimer > 0) {
      this.burstScaleTimer -= dt;
      const s = 1 + 0.15 * (this.burstScaleTimer / 400);
      this.container.scale.set(s);
    } else {
      this.container.scale.set(1);
    }

    // 浮动掉血数字动画
    this.updateDamageTexts(dt);

    // 更新 ID 背景胶囊
    this.drawIdBackground();

    this.lastX = x;
    this.lastY = y;
  }

  setFaction(faction: Faction): void {
    this.currentFaction = faction;
    this.trailColor = FACTION_COLORS[faction].primary;
    this.createAvatarPlaceholder(faction);
  }

  playHitEffect(reaction: HitReaction = 'flash'): void {
    this.hitFlashTimer = 200;
    switch (reaction) {
      case 'freeze':
        this.avatar.tint = 0x88CCFF;
        this.shakeOffset = { x: 0, y: 0, magnitude: 1, duration: 200, elapsed: 0 };
        break;
      case 'shock':
        this.avatar.tint = 0xFFEE88;
        this.shakeOffset = { x: 0, y: 0, magnitude: 3, duration: 250, elapsed: 0 };
        break;
      case 'burn':
        this.avatar.tint = 0xFF8800;
        this.hitFlashTimer = 300;
        break;
      case 'slash':
        this.avatar.tint = 0xDDDDDD;
        break;
      case 'pull':
        this.avatar.tint = 0xCC99FF;
        this.shakeOffset = { x: 0, y: 0, magnitude: 2, duration: 200, elapsed: 0 };
        break;
      default:
        this.avatar.alpha = 0.3;
    }
  }

  /**
   * 显示掉血数字（浮起渐隐）
   */
  showDamageNumber(damage: number, color?: number): void {
    // 格式化伤害值：显示整数，避免浮点数精度问题（如 4.2000000000000）
    const formattedDamage = Math.round(damage);
    const text = new PIXI.Text({
      text: `-${formattedDamage}`,
      style: {
        fontFamily: 'system-ui, -apple-system, "SF Pro Display", Inter, sans-serif',
        fontSize: damage >= 20 ? 22 : 16,
        fill: color ?? 0xFF3333,
        fontWeight: '800',
        stroke: { color: 0x000000, width: 3, alpha: 0.6 },
        align: 'center',
      },
    });
    text.anchor.set(0.5);
    text.y = -this.r - 20;
    text.zIndex = 999;
    this.container.addChild(text);

    this.damageTexts.push({
      text,
      life: 0,
      maxLife: 800,
      baseY: text.y,
    });

    // 上限清理旧数字
    while (this.damageTexts.length > 4) {
      const old = this.damageTexts.shift()!;
      old.text.destroy(true);
    }
  }

  playBurstEffect(): void { this.burstScaleTimer = 400; }

  setWeaponDecorator(decorator?: WeaponDecorator): void {
    if (this.weaponDecorator) {
      this.weaponDecorator.destroy();
      this.weaponDecorator = undefined;
    }
    this.weaponDecorator = decorator;
    if (decorator) {
      decorator.setScale(this.radiusScale);
      decorator.setPosition(this.container.x, this.container.y);
    }
  }

  setBurstMode(active: boolean): void {
    this.weaponDecorator?.setBurstMode(active);
  }

  setStatusEffect(type: 'slow' | 'freeze' | 'burn' | 'pull' | 'shock', duration: number): void {
    // 复用 slowEffectTimer 字段，按 type 设置不同 tint
    this.isSlowed = true;
    this.slowEffectTimer = duration;
    switch (type) {
      case 'slow': this.avatar.tint = 0x88CCFF; break;
      case 'freeze': this.avatar.tint = 0x88CCFF; break;
      case 'burn': this.avatar.tint = 0xFF8800; break;
      case 'pull': this.avatar.tint = 0xCC99FF; break;
      case 'shock': this.avatar.tint = 0xFFEE88; break;
    }
  }

  private updateShake(dt: number): void {
    if (this.shakeOffset.duration === 0) return;
    this.shakeOffset.elapsed += dt;
    if (this.shakeOffset.elapsed >= this.shakeOffset.duration) {
      this.shakeOffset.x = 0;
      this.shakeOffset.y = 0;
      this.shakeOffset.duration = 0;
      this.avatar.tint = 0xFFFFFF;
    } else {
      this.shakeOffset.x = (Math.random() - 0.5) * this.shakeOffset.magnitude * 2;
      this.shakeOffset.y = (Math.random() - 0.5) * this.shakeOffset.magnitude * 2;
    }
    this.avatar.position.set(this.shakeOffset.x, this.shakeOffset.y);
  }

  setScale(scale: number): void {
    if (this.radiusScale === scale) return;
    this.radiusScale = scale;

    // 同步拖尾尺寸（采样距离 + Canvas 纹理大小）
    this.trailSampleDist = getPlayerBaseRadius() * 0.45 * scale;
    this.resizeTrailCanvas();

    if (!this.hasRealAvatar) {
      this.avatar.texture.destroy(true);
      this.avatar.texture = this.graphicsToTexture(this.currentFaction);
    } else {
      this.avatar.width = this.r * 2;
      this.avatar.height = this.r * 2;
    }

    if (this.avatar.mask) {
      this.container.removeChild(this.avatar.mask as PIXI.Container);
      this.avatar.mask = this.createCircleMask();
    }

    this.idText.y = -this.r - 18;
    this.weaponDecorator?.setScale(scale);
  }

  setDisplayName(name: string): void { this.idText.text = name; }

  /** 设置可见性（大逃杀：死亡后隐藏球体） */
  setVisible(visible: boolean): void {
    this.container.visible = visible;
  }

  async setAvatar(avatarUrl: string): Promise<void> {
    if (!avatarUrl) return;

    // 优先：直接用 Image() 从 URL 提取主色（不依赖 PixiJS 内部纹理 API）
    const colorFromUrl = await this.extractColorFromUrl(avatarUrl);
    if (colorFromUrl !== undefined) {
      this.trailColor = colorFromUrl;
      console.log(`[PlayerRenderer] ${this.playerId} 头像主题色(直接提取): #${colorFromUrl.toString(16).padStart(6, '0')}`);
    }

    // 然后加载 PixiJS 纹理渲染头像
    try {
      const texture = await PIXI.Assets.load({
        src: avatarUrl,
        loadParser: 'loadTextures',
      });
      if (texture) {
        this.avatar.texture = texture as PIXI.Texture;
        this.avatar.anchor.set(0.5);
        this.avatar.width = this.r * 2;
        this.avatar.height = this.r * 2;
        this.avatar.mask = this.createCircleMask();
        this.hasRealAvatar = true;

        // 如果直接提取失败，回退到 PixiJS 纹理方式重试
        if (colorFromUrl === undefined) {
          await this.extractDominantColor(texture as PIXI.Texture);
        }
      }
    } catch {
      console.warn(`[PlayerRenderer] 头像纹理加载失败: ${avatarUrl}`);
    }
  }

  destroy(): void {
    for (const d of this.damageTexts) {
      if (!d.text.destroyed) d.text.destroy(true);
    }
    this.damageTexts.length = 0;
    if (!this.trailSprite.texture.destroyed) this.trailSprite.texture.destroy(true);
    if (!this.trailSprite.destroyed) this.trailSprite.destroy(true);
    if (!this.idBg.destroyed) this.idBg.destroy(true);
    if (!this.avatar.destroyed) this.avatar.destroy(true);
    if (!this.idText.destroyed) this.idText.destroy(true);
    if (!this.container.destroyed) this.container.destroy({ children: true });
    this.weaponDecorator?.destroy();
  }

  getContainer(): PIXI.Container { return this.container; }

  /** 获取当前拖尾颜色（头像提取的主色或流派默认色） */
  getTrailColor(): number { return this.trailColor; }

  /**
   * 设置减速状态（防火墙范围内时调用）
   * @param slowed true=进入减速范围，false=离开范围
   */
  setSlowed(slowed: boolean): void {
    if (this.isSlowed === slowed) return;
    this.isSlowed = slowed;
    if (slowed) {
      this.slowEffectTimer = 1000;
    } else {
      this.slowEffectTimer = 0;
    }
  }

  // ═══════════════════════════════════════════════════
  //  视觉绘制
  // ═══════════════════════════════════════════════════

  /**
   * 按当前 r 重建离屏拖尾 Canvas 及 PIXI 纹理（setScale / resize 时调用）
   */
  private resizeTrailCanvas(): void {
    const r = this.r;
    const maxTrailExtent = r * 2 + this.trailSampleDist * this.MAX_TRAIL_POINTS + 40;
    const size = Math.ceil(maxTrailExtent * 2);

    // 销毁旧纹理
    if (this.trailSprite.texture) {
      this.trailSprite.texture.destroy(true);
    }

    // 创建新 Canvas
    this.trailCanvas = document.createElement('canvas');
    this.trailCanvas.width = size;
    this.trailCanvas.height = size;
    this.trailCtx = this.trailCanvas.getContext('2d')!;

    this.trailSprite.texture = PIXI.Texture.from(this.trailCanvas);
  }

  /**
   * 倒三角拖尾 — 构建单一连续外轮廓路径，一次 fill() 消除段间接缝
   * 宽度二次方衰减（比三次方更饱满），alpha 随能量缩放
   */
  private drawCometTail(): void {
    const pts = this.trailPoints;
    if (pts.length < 2) {
      this.trailSprite.visible = false;
      return;
    }
    this.trailSprite.visible = true;

    const ctx = this.trailCtx;
    const cw = this.trailCanvas.width;
    const ch = this.trailCanvas.height;
    const ccx = cw / 2;
    const ccy = ch / 2;
    ctx.clearRect(0, 0, cw, ch);

    const r = this.r;
    const n = pts.length;
    const bx = this.container.x;
    const by = this.container.y;

    // 计算每个采样点的法向（前后平均方向，过渡平滑）
    const normals: Array<{ nx: number; ny: number }> = [];
    for (let i = 0; i < n; i++) {
      let dx = 0, dy = 0;
      if (i === 0 && n > 1) {
        dx = pts[i].x - pts[i + 1].x;
        dy = pts[i].y - pts[i + 1].y;
      } else if (i === n - 1 && n > 1) {
        dx = pts[i - 1].x - pts[i].x;
        dy = pts[i - 1].y - pts[i].y;
      } else if (n > 2) {
        dx = pts[i - 1].x - pts[i + 1].x;
        dy = pts[i - 1].y - pts[i + 1].y;
      }
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      normals.push({ nx: -dy / len, ny: dx / len });
    }

    // 构建连续外轮廓：先走右侧（球端→尾端），再走左侧（尾端→球端）
    ctx.beginPath();

    // 右边缘
    for (let i = 0; i < n; i++) {
      const t = 1 - i / (n - 1); // 球端=1, 尾端=0
      const w = r * t * t * 1.0; // 二次方衰减，比三次方更饱满
      const pt = pts[i];
      const px = pt.x - bx + ccx;
      const py = pt.y - by + ccy;
      const { nx, ny } = normals[i];
      if (i === 0) ctx.moveTo(px + nx * w, py + ny * w);
      else ctx.lineTo(px + nx * w, py + ny * w);
    }

    // 左边缘（逆序）
    for (let i = n - 1; i >= 0; i--) {
      const t = 1 - i / (n - 1);
      const w = r * t * t * 1.0;
      const pt = pts[i];
      const px = pt.x - bx + ccx;
      const py = pt.y - by + ccy;
      const { nx, ny } = normals[i];
      ctx.lineTo(px - nx * w, py - ny * w);
    }

    ctx.closePath();

    // 整体半透明填充（宽度收尖自带渐隐，alpha 随能量变化）
    const energyFade = 0.3 + 0.7 * this.trailEnergy;
    ctx.globalAlpha = 0.45 * energyFade;
    ctx.fillStyle = '#' + this.trailColor.toString(16).padStart(6, '0');
    ctx.fill();
    ctx.globalAlpha = 1;

    // 推纹理到 GPU
    this.trailSprite.texture.source.update();
  }

  /** 粒子拖尾 — 适配倒三角尾形，粒子沿边缘飘散 */
  private emitTrailParticle(x: number, y: number, speed: number): void {
    const speedFactor = Math.min(speed / 350, 1);
    const lifeMs = 350 + Math.round(150 * speedFactor);
    const particleR = Math.round(2.5 + 3.5 * speedFactor);
    const alphaStart = 0.16 + 0.12 * speedFactor;

    const dx = x - this.lastX;
    const dy = y - this.lastY;

    this.particlePool.emit({
      x: x - dx * 0.25,
      y: y - dy * 0.25,
      vx: -dx * 0.08 + (Math.random() - 0.5) * 1.0,
      vy: -dy * 0.08 + (Math.random() - 0.5) * 1.0,
      life: lifeMs,
      scaleStart: 0.7 + 0.2 * speedFactor,
      scaleEnd: 0,
      alphaStart,
      alphaEnd: 0,
      tint: this.trailColor,
      radius: particleR,
    });
  }

  /** 浮动掉血数字动画 */
  private updateDamageTexts(dt: number): void {
    for (let i = this.damageTexts.length - 1; i >= 0; i--) {
      const d = this.damageTexts[i];
      d.life += dt;
      const t = d.life / d.maxLife; // 0→1
      if (t >= 1) {
        d.text.destroy(true);
        this.damageTexts.splice(i, 1);
        continue;
      }
      // 上浮 + 渐隐
      d.text.y = d.baseY - t * 28;
      d.text.alpha = 1 - t * t; // 先快后慢的减速淡出
    }
  }

  /** ID 背景胶囊 */
  private drawIdBackground(): void {
    const g = this.idBg;
    g.clear();
    const w = this.idText.width + 14;
    const h = this.idText.height + 6;
    const bx = -w / 2;
    const by = this.idText.y - h / 2;
    // 半透明黑色胶囊
    g.roundRect(bx, by, w, h, h / 2);
    g.fill({ color: 0x000000, alpha: 0.4 });
  }

  /** 渐变球体占位符纹理 */
  private createAvatarPlaceholder(faction: Faction): void {
    this.avatar.destroy(true);
    this.avatar = new PIXI.Sprite();
    this.avatar.texture = this.graphicsToTexture(faction);
    this.avatar.anchor.set(0.5);
    this.avatar.blendMode = BLEND_MODES.NORMAL as unknown as PIXI.BLEND_MODES;
    this.hasRealAvatar = false;
    this.container.addChild(this.avatar);
  }

  /** Canvas 绘制渐变球体 + 白边 + 高光 + 首字母 — 简洁版 */
  private graphicsToTexture(faction: Faction): PIXI.Texture {
    const r = this.r;
    const padding = 2;
    const size = Math.ceil(r * 2 + padding * 2);
    const cx = size / 2;
    const cy = size / 2;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const colors = FACTION_COLORS[faction];
    const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

    // 1. 径向渐变球体
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    const grad = ctx.createRadialGradient(
      cx - r * 0.3, cy - r * 0.3, r * 0.05,
      cx, cy, r,
    );
    grad.addColorStop(0, '#fafaff');
    grad.addColorStop(0.35, hex(colors.glow));
    grad.addColorStop(0.75, hex(colors.primary));
    grad.addColorStop(1, hex(colors.dim));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    ctx.restore();

    // 2. 1px 半透明白边
    ctx.beginPath();
    ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 3. 镜面高光
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.3, cy - r * 0.35, r * 0.3, r * 0.18, -Math.PI / 6, 0, Math.PI * 2);
    ctx.clip();
    const specGrad = ctx.createLinearGradient(
      cx - r * 0.5, cy - r * 0.5,
      cx - r * 0.1, cy - r * 0.2,
    );
    specGrad.addColorStop(0, 'rgba(255,255,255,0.3)');
    specGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = specGrad;
    ctx.fill();
    ctx.restore();

    // 4. 球心首字母
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.round(r * 0.5)}px system-ui, -apple-system, "SF Pro Display", Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.playerId.charAt(0).toUpperCase(), cx, cy + 1);

    return PIXI.Texture.from(canvas);
  }

  private createCircleMask(): PIXI.Graphics {
    if (this.avatar.mask) {
      this.container.removeChild(this.avatar.mask as PIXI.Container);
    }
    const mask = new PIXI.Graphics();
    mask.circle(0, 0, this.r - 1);
    mask.fill({ color: 0xFFFFFF });
    this.container.addChild(mask);
    return mask;
  }

  // ═══════════════════════════════════════════════════
  //  头像主色提取
  // ═══════════════════════════════════════════════════

  /**
   * 直接用 Image() 加载头像 URL 并提取主色
   * 不依赖 PixiJS 内部纹理 API，兼容性更好，且可在战斗开始前就绪
   * @returns 提取到的颜色，失败时返回 undefined
   */
  private extractColorFromUrl(avatarUrl: string): Promise<number | undefined> {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      const cleanup = () => {
        img.onload = null;
        img.onerror = null;
      };

      img.onload = () => {
        cleanup();
        try {
          const canvas = document.createElement('canvas');
          const sampleSize = 64;
          canvas.width = sampleSize;
          canvas.height = sampleSize;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
          const raw = this.sampleDominantColor(ctx, sampleSize, sampleSize);
          // 对提取色做饱和度+亮度增强，使特效色更鲜艳
          resolve(this.vibrantize(raw));
        } catch {
          resolve(undefined);
        }
      };

      img.onerror = () => {
        cleanup();
        resolve(undefined);
      };

      // 超时 3 秒
      setTimeout(() => {
        cleanup();
        resolve(undefined);
      }, 3000);

      img.src = avatarUrl;
    });
  }

  private async extractDominantColor(texture: PIXI.Texture): Promise<void> {
    try {
      const baseTex = texture.baseTexture || texture.source;
      const img = (baseTex as any)?.resource?.source ?? (baseTex as any)?.source;
      const canvas = document.createElement('canvas');
      const sampleSize = 64;
      canvas.width = sampleSize;
      canvas.height = sampleSize;
      const ctx = canvas.getContext('2d')!;
      if (img instanceof HTMLImageElement) {
        ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
        const raw = this.sampleDominantColor(ctx, sampleSize, sampleSize);
        this.trailColor = this.vibrantize(raw);
      }
    } catch {
      // 保持默认
    }
  }

  private sampleDominantColor(ctx: CanvasRenderingContext2D, w: number, h: number): number {
    const data = ctx.getImageData(0, 0, w, h).data;
    type Bucket = { r: number; g: number; b: number; weight: number };
    const buckets = new Map<string, Bucket>();

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue; // 跳过透明像素
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const bri = (r + g + b) / 3;
      // 放宽亮度范围，只排除极端黑白
      if (bri < 15 || bri > 245) continue;

      // 饱和度加权：颜色越鲜艳，权重越高（最大值 1.0 → 权重倍增）
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const saturation = maxC > 0 ? (maxC - minC) / maxC : 0;
      const weight = 1 + saturation * 2; // 鲜艳色权重最高 3 倍

      const key = `${r >> 4},${g >> 4},${b >> 4}`; // 16 级/通道 → 4096 桶
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.r += r * weight;
        bucket.g += g * weight;
        bucket.b += b * weight;
        bucket.weight += weight;
      } else {
        buckets.set(key, { r: r * weight, g: g * weight, b: b * weight, weight });
      }
    }

    if (buckets.size === 0) return FACTION_COLORS[this.currentFaction].primary;

    let best: Bucket | null = null;
    let maxW = 0;
    for (const [, b] of buckets) {
      if (b.weight > maxW) { maxW = b.weight; best = b; }
    }
    if (best && best.weight > 0) {
      return (Math.round(best.r / best.weight) << 16)
           | (Math.round(best.g / best.weight) << 8)
           | Math.round(best.b / best.weight);
    }
    return FACTION_COLORS[this.currentFaction].primary;
  }

  /**
   * 增强颜色鲜艳度：提升饱和度 + 亮度，使特效更醒目
   * 对低饱和色（如灰紫灰蓝）效果显著
   */
  private vibrantize(color: number): number {
    let r = (color >> 16) & 0xff;
    let g = (color >> 8) & 0xff;
    let b = color & 0xff;

    // 转 HSL，提升饱和度 + 亮度
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const l = (maxC + minC) / 2 / 255; // 亮度 0~1

    // 饱和度增强因子：原低饱和度时增强更多
    const origSat = maxC > minC ? (maxC - minC) / (255 - Math.abs(maxC + minC - 255)) : 0;
    const satBoost = 1 - origSat; // 越灰增强越多
    const targetSat = Math.min(1, origSat + satBoost * 0.7);

    // 亮度提升 20%，确保特效可见
    const targetLight = Math.min(0.85, l * 1.2 + 0.1);

    // 计算灰值
    const gray = (r + g + b) / 3;

    // 向饱和方向推动
    const blend = targetSat / Math.max(0.01, origSat || 1);
    r = Math.round(gray + (r - gray) * Math.min(blend, 2.5));
    g = Math.round(gray + (g - gray) * Math.min(blend, 2.5));
    b = Math.round(gray + (b - gray) * Math.min(blend, 2.5));

    // 亮度调整
    const curLight = (r + g + b) / 3 / 255;
    const lightScale = targetLight / Math.max(0.01, curLight);
    r = Math.min(255, Math.round(r * lightScale));
    g = Math.min(255, Math.round(g * lightScale));
    b = Math.min(255, Math.round(b * lightScale));

    return (r << 16) | (g << 8) | b;
  }
}
