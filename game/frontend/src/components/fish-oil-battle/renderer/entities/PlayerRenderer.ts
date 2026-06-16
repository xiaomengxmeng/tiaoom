import * as PIXI from 'pixi.js';
import { BLEND_MODES } from '../constants';
import type { InterpolatedState } from '../systems/PhysicsSystem';
import { ParticlePool } from '../systems/ParticlePool';

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
  private trailGfx: PIXI.Graphics;          // 彗星拖尾图形
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
  /** 彗星尾迹历史位置（世界坐标，用于绘制连续尾形） */
  private trailHistory: Array<{ x: number; y: number }> = [];
  /** 历史位置上限 */
  private readonly TRAIL_LENGTH = 16;

  // ─── 特效状态 ─────────────────────────────────────────
  private hitFlashTimer = 0;
  private burstScaleTimer = 0;
  private currentFaction: Faction = 'aggressor';

  // ─── 尺寸 ─────────────────────────────────────────────
  private readonly BASE_RADIUS = 36;
  private radiusScale = 1.0;
  private get r(): number { return this.BASE_RADIUS * this.radiusScale; }

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

    this.container = new PIXI.Container();
    this.parentContainer.addChild(this.container);

    // L0: 彗星拖尾图形（在世界坐标空间绘制，不跟随容器旋转）
    this.trailGfx = new PIXI.Graphics();
    this.container.addChild(this.trailGfx);

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

    // 速度阈值：低速不显示拖尾
    if (speed > 60) {
      // 记录世界坐标位置历史
      this.trailHistory.push({ x, y });
      if (this.trailHistory.length > this.TRAIL_LENGTH) this.trailHistory.shift();

      // 发射拖尾粒子（更高频率，丰富尾迹）
      this.trailTimer += dt;
      if (this.trailTimer > 30) {
        this.trailTimer = 0;
        this.emitTrailParticle(x, y, speed);
      }
    } else {
      // 减速/静止：逐渐清空
      if (this.trailHistory.length > 1) this.trailHistory.shift();
      else if (this.trailHistory.length === 1) {
        this.trailHistory.shift();
        this.trailGfx.clear();
      }
      this.trailTimer = 30; // 下次高速立即发射
    }

    // 绘制彗星尾形
    this.drawCometTail();

    // 受击闪白（仅 damage 触发，wall hit 不再走这里）
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= dt;
      const t = Math.max(0, this.hitFlashTimer / 150);
      this.avatar.alpha = 0.3 + 0.7 * (1 - t); // 闪白：30%→100%
    } else {
      this.avatar.alpha = 1;
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

  playHitEffect(): void { this.hitFlashTimer = 150; }

  /**
   * 显示掉血数字（浮起渐隐）
   */
  showDamageNumber(damage: number): void {
    const text = new PIXI.Text({
      text: `-${damage}`,
      style: {
        fontFamily: 'system-ui, -apple-system, "SF Pro Display", Inter, sans-serif',
        fontSize: damage >= 20 ? 22 : 16,
        fill: 0xFF3333,
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

  setScale(scale: number): void {
    if (this.radiusScale === scale) return;
    this.radiusScale = scale;

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

    this.idText.y = -this.r - 6;
  }

  setDisplayName(name: string): void { this.idText.text = name; }

  async setAvatar(avatarUrl: string): Promise<void> {
    if (!avatarUrl) return;
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
        await this.extractDominantColor(texture as PIXI.Texture);
      }
    } catch {
      console.warn(`[PlayerRenderer] 头像加载失败: ${avatarUrl}`);
    }
  }

  destroy(): void {
    for (const d of this.damageTexts) d.text.destroy(true);
    this.damageTexts.length = 0;
    this.trailGfx.destroy(true);
    this.idBg.destroy(true);
    this.avatar.destroy(true);
    this.idText.destroy(true);
    this.container.destroy({ children: true });
  }

  getContainer(): PIXI.Container { return this.container; }

  // ═══════════════════════════════════════════════════
  //  视觉绘制
  // ═══════════════════════════════════════════════════

  /** 倒三角拖尾 — 剧烈渐变的圆点串，尾部极细极暗 → 头端宽亮，视觉呈尖楔形 */
  private drawCometTail(): void {
    const g = this.trailGfx;
    g.clear();
    const hist = this.trailHistory;
    if (hist.length < 2) return;

    const r = this.r;
    const color = this.trailColor;
    const cx = this.container.x;
    const cy = this.container.y;
    const n = hist.length;

    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);                  // 0 (尾尖) → 1 (球体端)
      const t3 = t * t * t;                   // 三次方 — 尾部极度收窄
      const alpha = 0.015 + t3 * 0.42;         // 尾 ≈0.015, 头 ≈0.435
      const radius = r * (0.04 + t3 * 1.15);   // 尾 ≈1.4px, 头 ≈41px
      const pos = hist[i];

      g.circle(pos.x - cx, pos.y - cy, radius);
      g.fill({ color, alpha });
    }
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

  private async extractDominantColor(texture: PIXI.Texture): Promise<void> {
    try {
      const baseTex = texture.baseTexture || texture.source;
      const img = (baseTex as any)?.resource?.source ?? (baseTex as any)?.source;
      const canvas = document.createElement('canvas');
      const sampleSize = 16;
      canvas.width = sampleSize;
      canvas.height = sampleSize;
      const ctx = canvas.getContext('2d')!;
      if (img instanceof HTMLImageElement) {
        ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
        this.trailColor = this.sampleDominantColor(ctx, sampleSize, sampleSize);
      }
    } catch {
      // 保持默认
    }
  }

  private sampleDominantColor(ctx: CanvasRenderingContext2D, w: number, h: number): number {
    const data = ctx.getImageData(0, 0, w, h).data;
    const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const bri = (r + g + b) / 3;
      if (bri < 25 || bri > 235) continue;
      const key = `${r >> 3},${g >> 3},${b >> 3}`;
      const bucket = buckets.get(key);
      if (bucket) { bucket.r += r; bucket.g += g; bucket.b += b; bucket.count++; }
      else buckets.set(key, { r, g, b, count: 1 });
    }
    let best: { r: number; g: number; b: number; count: number } | null = null;
    let max = 0;
    for (const [, b] of buckets) { if (b.count > max) { max = b.count; best = b; } }
    if (best) return (Math.round(best.r / best.count) << 16) | (Math.round(best.g / best.count) << 8) | Math.round(best.b / best.count);
    return FACTION_COLORS[this.currentFaction].primary;
  }
}
