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
  private trailCanvas!: HTMLCanvasElement;    // 离屏 Canvas — 倒三角拖尾
  private trailCtx!: CanvasRenderingContext2D;
  private trailSprite!: PIXI.Sprite;          // Canvas 驱动纹理
  private avatar: PIXI.Sprite;              // 头像
  private idText: PIXI.Text;                // ID 文字
  private idBg: PIXI.Graphics;              // ID 背景胶囊
  private damageTexts: DamageFloat[] = [];   // 浮动掉血数字

  // ─── 拖尾 ─────────────────────────────────────────────
  private readonly TRAIL_CANVAS_SIZE: number;
  private particlePool: ParticlePool;
  private lastX = 0;
  private lastY = 0;
  private trailTimer = 0;
  private trailColor: number;
  private hasRealAvatar = false;
  /** 彗星尾迹历史位置（世界坐标，用于绘制连续尾形） */
  private trailHistory: Array<{ x: number; y: number }> = [];
  /** 拖尾目标长度（px）—— 小球直径 × 2.5 */
  private get trailTarget(): number { return this.r * 2 * 2.5; }

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

    // L0: 倒三角拖尾 — Canvas 离屏渲染驱动 Sprite 纹理
    this.TRAIL_CANVAS_SIZE = Math.ceil(this.trailTarget + this.r + 40) * 2;
    this.trailCanvas = document.createElement('canvas');
    this.trailCanvas.width = this.TRAIL_CANVAS_SIZE;
    this.trailCanvas.height = this.TRAIL_CANVAS_SIZE;
    this.trailCtx = this.trailCanvas.getContext('2d')!;
    this.trailSprite = new PIXI.Sprite(PIXI.Texture.from(this.trailCanvas));
    this.trailSprite.anchor.set(0.5, 0.5);
    this.trailSprite.visible = false; // 静止时隐藏
    this.container.addChild(this.trailSprite);

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
      // 记录世界坐标位置历史，按目标长度（2.5球径）裁剪，最少保留3点
      this.trailHistory.push({ x, y });
      while (this.trailHistory.length > 3) {
        const head = this.trailHistory[0];
        const dx = head.x - x;
        const dy = head.y - y;
        if (Math.sqrt(dx * dx + dy * dy) > this.trailTarget) {
          this.trailHistory.shift();
        } else break;
      }

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
        this.trailSprite.visible = false;
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

    this.idText.y = -this.r - 18;
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
    this.trailSprite.texture.destroy(true);
    this.trailSprite.destroy(true);
    this.idBg.destroy(true);
    this.avatar.destroy(true);
    this.idText.destroy(true);
    this.container.destroy({ children: true });
  }

  getContainer(): PIXI.Container { return this.container; }

  // ═══════════════════════════════════════════════════
  //  视觉绘制
  // ═══════════════════════════════════════════════════

  /** 倒三角拖尾 — Canvas 2D 逐段四边形，尾部收尖，长度 = 2.5 球径 */
  private drawCometTail(): void {
    const hist = this.trailHistory;
    if (hist.length < 2) {
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
    const n = hist.length;
    // 颜色转 CSS hex
    const hex = '#' + this.trailColor.toString(16).padStart(6, '0');
    const bx = this.container.x;
    const by = this.container.y;

    // 将世界坐标轨迹点转为 canvas 相对坐标（球心 = canvas 中心）
    for (let i = 0; i < n - 1; i++) {
      const t0 = i / (n - 1);   // 尾端参数
      const t1 = (i + 1) / (n - 1);
      // 宽度三次方渐收：尾 ≈0 → 头 = r*0.85
      const w0 = r * t0 * t0 * t0 * 0.85;
      const w1 = r * t1 * t1 * t1 * 0.85;
      const alpha0 = 0.03 + t0 * 0.38;
      const alpha1 = 0.03 + t1 * 0.38;

      const p0 = hist[i];
      const p1 = hist[i + 1];
      const r0x = p0.x - bx + ccx;
      const r0y = p0.y - by + ccy;
      const r1x = p1.x - bx + ccx;
      const r1y = p1.y - by + ccy;

      // 段方向 & 法向
      const segX = p1.x - p0.x;
      const segY = p1.y - p0.y;
      const segLen = Math.sqrt(segX * segX + segY * segY) || 1;
      const nx = -segY / segLen;
      const ny = segX / segLen;

      // 四边形：左边缘向前 → 右边缘向后
      ctx.beginPath();
      ctx.moveTo(r0x - nx * w0, r0y - ny * w0);
      ctx.lineTo(r1x - nx * w1, r1y - ny * w1);
      ctx.lineTo(r1x + nx * w1, r1y + ny * w1);
      ctx.lineTo(r0x + nx * w0, r0y + ny * w0);
      ctx.closePath();

      ctx.fillStyle = hex;
      ctx.globalAlpha = (alpha0 + alpha1) / 2;
      ctx.fill();
    }
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
