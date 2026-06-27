/**
 * KE 流体操控 (Fluid Mastery) - 鱼油大战
 * 前端视觉渲染器（书海潮汐方案）
 *
 * 视觉设计（书生古籍人设 + 水系三态）：
 * - 水流尾迹 Trail：8 层径向渐变光环 + 漂浮古籍书页（3-5 片）+ 墨迹波纹（3 条）+ 墨迹箭头 + 水滴/书页碎片粒子
 * - 漩涡牵引 Vortex：漩涡核心（6 层）+ 中心古籍（翻开旋转）+ 书页飞舞螺旋臂（3 条×8-10 片）+ 翻书声波环 + 墨迹牵引线
 * - 水龙卷爆发 Burst：三阶段动画
 *   · 蓄压（0-15%T）：水流向心汇聚 + 古籍从地下浮现（scale 0→1）
 *   · 爆发（15-30%T）：水龙卷主体爆发 + 书页风暴（20-30 片带重力飘落）+ 翻书声波环扩散 + 中心古籍旋转
 *   · 扩散（30-100%T）：水龙卷消散 + 书页如落雨飘落 + 古籍核心残留淡出 + 余波涟漪
 *
 * 人设彩蛋：
 * - 漂浮书页用预渲染古籍文字纹理
 * - 翻书声波环（波浪起伏圆环，卷轴金色，区分水流）
 * - 书生愤怒态（hp<30%）：色系切换为深红，书页变焦黑
 *
 * 继承 BaseWeaponEffectRenderer：复用对象池/调色板派生/三阶段动画调度
 */

import * as PIXI from 'pixi.js';
import { ParticlePool } from '../systems/ParticlePool';
import { BaseWeaponEffectRenderer, type ActiveBurstBase, type Palette } from './BaseWeaponEffectRenderer';

// ══════════════════════════════════════════════════════
//  颜色常量（双轨：水系 + 古籍人设 + 愤怒态）
// ══════════════════════════════════════════════════════

// 水系基础色
const FLUID_DEEP = 0x0044aa;
const FLUID_MAIN = 0x0099ff;
const FLUID_LIGHT = 0x66ccff;
const FLUID_HIGHLIGHT = 0xaaeeff;
const FLUID_WHITE = 0xffffff;
const FLUID_FOAM = 0xe0f4ff;

// 古籍人设色
const PARCHMENT_OLD = 0xd4b896;
const INK_BLACK = 0x1a1a2e;
const SCROLL_GOLD = 0xc9a961;

// 书生愤怒态色
const ANGER_DEEP = 0x4a0a0a;
const ANGER_MAIN = 0xcc2200;
const ANGER_GLOW = 0xff6633;
const BURNED_PAGE = 0x2a2a2a;

const TRAIL_RIPPLE_MAX_LIFE = 1500;
const SOUND_WAVE_INTERVAL = 1500;

// ══════════════════════════════════════════════════════
//  数据结构
// ══════════════════════════════════════════════════════

interface BookPage {
  sprite: PIXI.Sprite;
  x: number;
  y: number;
  rotation: number;
  rotationSpeed: number;
  driftPhase: number;
  driftRadius: number;
  alpha: number;
  scale: number;
}

interface ActiveTrail {
  container: PIXI.Container;
  auraGraphics: PIXI.Graphics;
  rippleGraphics: PIXI.Graphics;
  arrowGraphics: PIXI.Graphics;
  bookPages: BookPage[];
  particleTimer: number;
  rippleLife: number[];
  rippleMaxLife: number;
  life: number;
  maxLife: number;
  x: number;
  y: number;
  radius: number;
  flowDir: number;
  palette: Palette;
  isAngry: boolean;
}

interface ActiveVortex {
  container: PIXI.Container;
  coreGraphics: PIXI.Graphics;
  armGraphics: PIXI.Graphics;
  pullGraphics: PIXI.Graphics;
  soundWaveGraphics: PIXI.Graphics;
  soundWaveTimer: number;
  soundWaveRings: Array<{ radius: number; alpha: number; life: number }>;
  life: number;
  maxLife: number;
  x: number;
  y: number;
  radius: number;
  pullForce: number;
  palette: Palette;
  isAngry: boolean;
}

interface ActiveFluidBurst extends ActiveBurstBase {
  columnGraphics: PIXI.Graphics;
  armGraphics: PIXI.Graphics;
  coreGraphics: PIXI.Graphics;
  splashGraphics: PIXI.Graphics;
  soundWaveGraphics: PIXI.Graphics;
  soundWaveTimer: number;
  stormPages: BookPage[];
  soundWaveRings: Array<{ radius: number; alpha: number; life: number }>;
  x: number;
  y: number;
  isAngry: boolean;
}

// ══════════════════════════════════════════════════════
//  预渲染纹理
// ══════════════════════════════════════════════════════

let bookPageTexture: PIXI.Texture | null = null;
let bookPageBurnedTexture: PIXI.Texture | null = null;
let scrollTextTextures: PIXI.Texture[] = [];

function createBookPageTexture(burned = false): PIXI.Texture {
  const g = new PIXI.Graphics();
  g.rect(0, 0, 16, 16);
  g.fill({ color: burned ? BURNED_PAGE : PARCHMENT_OLD, alpha: 0.85 });
  g.rect(0, 0, 16, 1);
  g.fill({ color: burned ? 0x4a0a0a : SCROLL_GOLD, alpha: 0.6 });
  g.rect(0, 15, 16, 1);
  g.fill({ color: burned ? 0x4a0a0a : SCROLL_GOLD, alpha: 0.6 });
  const inkColor = burned ? 0x1a0a0a : INK_BLACK;
  for (let i = 2; i < 15; i += 2) {
    const w = 8 + Math.random() * 6;
    g.rect(2, i, w, 0.8);
    g.fill({ color: inkColor, alpha: 0.4 + Math.random() * 0.3 });
  }
  return g.texture;
}

function createScrollTextTextures(): PIXI.Texture[] {
  const texts = ['鱼排都市志', '潮生明月', '书海无涯', '卷舒云水', '墨染千秋'];
  return texts.map(() => {
    const g = new PIXI.Graphics();
    g.rect(0, 0, 16, 16);
    g.fill({ color: PARCHMENT_OLD, alpha: 0.3 });
    for (let i = 0; i < 5; i++) {
      g.rect(2 + i * 2, 2, 1, 12);
      g.fill({ color: INK_BLACK, alpha: 0.5 });
    }
    return g.texture;
  });
}

function ensureTextures(): void {
  if (!bookPageTexture) {
    bookPageTexture = createBookPageTexture(false);
    bookPageBurnedTexture = createBookPageTexture(true);
    scrollTextTextures = createScrollTextTextures();
  }
}

// ══════════════════════════════════════════════════════
//  渲染器
// ══════════════════════════════════════════════════════

export class FluidMasteryRenderer extends BaseWeaponEffectRenderer {
  private activeTrails: Map<string, ActiveTrail> = new Map();
  private activeVortices: Map<string, ActiveVortex> = new Map();
  private activeBursts: Map<string, ActiveFluidBurst> = new Map();
  private hpRatio = 1;
  private isAngry = false;

  constructor(fieldContainer: PIXI.Container, particlePool: ParticlePool) {
    super(fieldContainer, particlePool);
    ensureTextures();
  }

  setHpRatio(hpRatio: number): void {
    this.hpRatio = hpRatio;
    this.isAngry = hpRatio < 0.3;
  }

  // ═══ 水流尾迹 Trail ═══

  triggerTrail(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    flowDir: number,
    themeColor: number = FLUID_MAIN,
    isAngry: boolean = false,
  ): void {
    const existing = this.activeTrails.get(playerId);
    if (existing) {
      existing.x = x;
      existing.y = y;
      existing.radius = radius;
      existing.flowDir = flowDir;
      existing.container.position.set(x, y);
      this.drawTrailArrow(existing.arrowGraphics, radius, flowDir, existing.palette);
      return;
    }

    const palette = this.buildPalette(isAngry ? ANGER_MAIN : themeColor);
    const container = new PIXI.Container();
    container.position.set(x, y);
    container.scale.set(this.scale);
    this.container.addChild(container);

    const auraGraphics = new PIXI.Graphics();
    this.drawTrailAura(auraGraphics, radius, palette, isAngry);
    container.addChild(auraGraphics);

    const rippleGraphics = new PIXI.Graphics();
    container.addChild(rippleGraphics);

    const arrowGraphics = new PIXI.Graphics();
    this.drawTrailArrow(arrowGraphics, radius, flowDir, palette);
    container.addChild(arrowGraphics);

    const bookPages = this.createFloatingPages(radius, isAngry);
    for (const page of bookPages) {
      container.addChild(page.sprite);
    }

    this.activeTrails.set(playerId, {
      container,
      auraGraphics,
      rippleGraphics,
      arrowGraphics,
      bookPages,
      particleTimer: 0,
      rippleLife: [0, TRAIL_RIPPLE_MAX_LIFE / 3, (TRAIL_RIPPLE_MAX_LIFE * 2) / 3],
      rippleMaxLife: TRAIL_RIPPLE_MAX_LIFE,
      life: 0,
      maxLife: Number.POSITIVE_INFINITY,
      x,
      y,
      radius,
      flowDir,
      palette,
      isAngry,
    });

    this.spawnTrailParticles(x, y, radius, palette);
  }

  updateTrail(playerId: string, x: number, y: number, flowDir: number): void {
    const trail = this.activeTrails.get(playerId);
    if (!trail) return;
    trail.x = x;
    trail.y = y;
    trail.flowDir = flowDir;
    trail.container.position.set(x, y);
    this.drawTrailArrow(trail.arrowGraphics, trail.radius, flowDir, trail.palette);
  }

  removeTrail(playerId: string): void {
    const trail = this.activeTrails.get(playerId);
    if (trail) {
      this.container.removeChild(trail.container);
      trail.container.destroy({ children: true });
      this.activeTrails.delete(playerId);
    }
  }

  private drawTrailAura(g: PIXI.Graphics, radius: number, palette: Palette, isAngry: boolean): void {
    g.clear();
    const deepColor = isAngry ? ANGER_DEEP : FLUID_DEEP;
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const r = radius * (0.15 + 0.85 * t);
      const color = t < 0.5 ? this.interpolateColor(palette.primary, deepColor, t * 2) : deepColor;
      const alpha = (1 - t) * 0.22;
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }
    g.circle(0, 0, radius);
    g.stroke({ color: palette.highlight, width: 1, alpha: 0.7 });
    g.circle(0, 0, radius * 0.95);
    g.stroke({ color: FLUID_FOAM, width: 0.4, alpha: 0.5 });
    if (isAngry) {
      g.circle(0, 0, radius * 1.05);
      g.stroke({ color: ANGER_GLOW, width: 1.5, alpha: 0.4 });
    }
    g.circle(0, 0, 6);
    g.stroke({ color: palette.primary, width: 1, alpha: 0.8 });
    g.circle(0, 0, 4);
    g.fill({ color: FLUID_WHITE, alpha: 1 });
  }

  private drawTrailRipple(g: PIXI.Graphics, radius: number, life: number, maxLife: number, palette: Palette): void {
    const t = life / maxLife;
    const r = radius * (0.5 + 1.0 * t);
    const alpha = 0.8 * (1 - t);
    const segments = 16;
    g.moveTo(Math.cos(0) * r, Math.sin(0) * r);
    for (let s = 1; s <= segments; s++) {
      const angle = (s / segments) * Math.PI * 2;
      const jitter = 1 + (Math.random() - 0.5) * 0.05;
      g.lineTo(Math.cos(angle) * r * jitter, Math.sin(angle) * r * jitter);
    }
    g.stroke({ color: palette.glow, width: 1.2, alpha });
  }

  private drawTrailArrow(g: PIXI.Graphics, radius: number, flowDir: number, palette: Palette): void {
    g.clear();
    const innerR = radius * 0.4;
    const outerR = radius * 0.95;
    const tipX = Math.cos(flowDir) * outerR;
    const tipY = Math.sin(flowDir) * outerR;
    const tailX = Math.cos(flowDir) * innerR;
    const tailY = Math.sin(flowDir) * innerR;
    for (let i = 0; i < 3; i++) {
      const offset = (i - 1) * 0.5;
      g.moveTo(tailX + offset, tailY + offset);
      g.lineTo(tipX + offset, tipY + offset);
      g.stroke({ color: palette.highlight, width: 0.6, alpha: 0.4 });
    }
    const arrowSize = 5;
    const leftA = flowDir + Math.PI - Math.PI / 6;
    const rightA = flowDir + Math.PI + Math.PI / 6;
    g.moveTo(tipX, tipY);
    g.lineTo(tipX + Math.cos(leftA) * arrowSize, tipY + Math.sin(leftA) * arrowSize);
    g.moveTo(tipX, tipY);
    g.lineTo(tipX + Math.cos(rightA) * arrowSize, tipY + Math.sin(rightA) * arrowSize);
    g.stroke({ color: palette.highlight, width: 1, alpha: 0.6 });
  }

  private createFloatingPages(radius: number, isAngry: boolean): BookPage[] {
    const count = 3 + Math.floor(Math.random() * 3);
    const pages: BookPage[] = [];
    const texture = isAngry ? bookPageBurnedTexture! : (scrollTextTextures[Math.floor(Math.random() * scrollTextTextures.length)] ?? bookPageTexture!);
    for (let i = 0; i < count; i++) {
      const sprite = new PIXI.Sprite(texture);
      const angle = Math.random() * Math.PI * 2;
      const dist = radius * (0.3 + Math.random() * 0.5);
      sprite.anchor.set(0.5);
      sprite.position.set(Math.cos(angle) * dist, Math.sin(angle) * dist);
      sprite.scale.set(0.5 + Math.random() * 0.4);
      sprite.alpha = 0.3 + Math.random() * 0.2;
      pages.push({
        sprite,
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 1.5,
        driftPhase: Math.random() * Math.PI * 2,
        driftRadius: 3 + Math.random() * 5,
        alpha: sprite.alpha,
        scale: sprite.scale.x,
      });
    }
    return pages;
  }

  private spawnTrailParticles(x: number, y: number, radius: number, palette: Palette): void {
    const s = this.scale;
    const count = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const startDist = radius * s * (0.3 + Math.random() * 0.2);
      const px = x + Math.cos(angle) * startDist;
      const py = y + Math.sin(angle) * startDist;
      const speed = (25 + Math.random() * 20) * s;
      const isPageFragment = Math.random() < 0.3;
      this.particlePool.emit({
        x: px,
        y: py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1500,
        scaleStart: isPageFragment ? 1.2 : 1,
        scaleEnd: 0,
        alphaStart: 0.8,
        alphaEnd: 0,
        tint: isPageFragment ? PARCHMENT_OLD : palette.glow,
        tintStart: isPageFragment ? SCROLL_GOLD : palette.highlight,
        tintEnd: isPageFragment ? INK_BLACK : palette.shadow,
        radius: (1.5 + Math.random() * 1.5) * s,
        rotationSpeed: isPageFragment ? (Math.random() - 0.5) * 8 : 0,
      });
    }
  }

  // ═══ 漩涡牵引 Vortex ═══

  triggerVortex(
    targetId: string,
    x: number,
    y: number,
    radius: number,
    pullForce: number,
    themeColor: number = FLUID_MAIN,
    isAngry: boolean = false,
  ): void {
    const old = this.activeVortices.get(targetId);
    if (old) {
      this.container.removeChild(old.container);
      old.container.destroy({ children: true });
    }

    const palette = this.buildPalette(isAngry ? ANGER_MAIN : themeColor);
    const container = new PIXI.Container();
    container.position.set(x, y);
    container.scale.set(this.scale);
    this.container.addChild(container);

    const coreGraphics = new PIXI.Graphics();
    this.drawVortexCore(coreGraphics, radius, palette, isAngry);
    container.addChild(coreGraphics);

    const armGraphics = new PIXI.Graphics();
    this.drawVortexArms(armGraphics, radius, palette, isAngry);
    container.addChild(armGraphics);

    const pullGraphics = new PIXI.Graphics();
    this.drawVortexPull(pullGraphics, radius, pullForce, palette);
    container.addChild(pullGraphics);

    const soundWaveGraphics = new PIXI.Graphics();
    container.addChild(soundWaveGraphics);

    this.activeVortices.set(targetId, {
      container,
      coreGraphics,
      armGraphics,
      pullGraphics,
      soundWaveGraphics,
      soundWaveTimer: 0,
      soundWaveRings: [],
      life: 0,
      maxLife: 6000,
      x,
      y,
      radius,
      pullForce,
      palette,
      isAngry,
    });
  }

  removeVortex(targetId: string): void {
    const vortex = this.activeVortices.get(targetId);
    if (vortex) {
      this.container.removeChild(vortex.container);
      vortex.container.destroy({ children: true });
      this.activeVortices.delete(targetId);
    }
  }

  private drawVortexCore(g: PIXI.Graphics, radius: number, palette: Palette, isAngry: boolean): void {
    g.clear();
    const deepColor = isAngry ? ANGER_DEEP : FLUID_DEEP;
    const coreR = radius * 0.7;
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const r = coreR * (0.15 + 0.85 * t);
      const color = t < 0.5 ? this.interpolateColor(palette.primary, deepColor, t * 2) : deepColor;
      const alpha = (1 - t) * 0.25;
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }
    const pageColor = isAngry ? BURNED_PAGE : PARCHMENT_OLD;
    const inkColor = isAngry ? 0x4a0a0a : SCROLL_GOLD;
    g.moveTo(-4, -5);
    g.lineTo(-0.5, -5);
    g.lineTo(-0.5, 5);
    g.lineTo(-4, 5);
    g.fill({ color: pageColor, alpha: 0.9 });
    g.moveTo(0.5, -5);
    g.lineTo(4, -5);
    g.lineTo(4, 5);
    g.lineTo(0.5, 5);
    g.fill({ color: pageColor, alpha: 0.9 });
    g.moveTo(-0.5, -5);
    g.lineTo(-0.5, 5);
    g.stroke({ color: inkColor, width: 0.8, alpha: 0.8 });
    for (let i = -3; i <= 3; i += 2) {
      g.moveTo(-3, i);
      g.lineTo(-1, i);
      g.stroke({ color: inkColor, width: 0.4, alpha: 0.5 });
      g.moveTo(1, i);
      g.lineTo(3, i);
      g.stroke({ color: inkColor, width: 0.4, alpha: 0.5 });
    }
  }

  private drawVortexArms(g: PIXI.Graphics, radius: number, palette: Palette, isAngry: boolean): void {
    g.clear();
    const steps = 8;
    const turns = 1.5;
    const pageColor = isAngry ? BURNED_PAGE : PARCHMENT_OLD;
    for (let i = 0; i < 3; i++) {
      const baseAngle = (i * 2 * Math.PI) / 3;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const theta = t * Math.PI * 2 * turns;
        const r = t * radius;
        const angle = baseAngle + theta;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        const size = 2 + t * 4;
        g.moveTo(x - size / 2, y - size / 2);
        g.lineTo(x + size / 2, y - size / 2);
        g.lineTo(x + size / 2, y + size / 2);
        g.lineTo(x - size / 2, y + size / 2);
        g.fill({ color: pageColor, alpha: 0.6 * (1 - t * 0.5) });
        if (s > 1) {
          const prevT = (s - 1) / steps;
          const prevTheta = prevT * Math.PI * 2 * turns;
          const prevR = prevT * radius;
          const prevAngle = baseAngle + prevTheta;
          const prevX = Math.cos(prevAngle) * prevR;
          const prevY = Math.sin(prevAngle) * prevR;
          g.moveTo(prevX, prevY);
          g.lineTo(x, y);
          g.stroke({ color: palette.glow, width: 0.8, alpha: 0.5 });
        }
      }
    }
  }

  private drawVortexPull(g: PIXI.Graphics, radius: number, pullForce: number, palette: Palette): void {
    g.clear();
    const baseAlpha = 0.4 + 0.4 * pullForce;
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2 + Math.PI / 4;
      const startX = Math.cos(angle) * radius;
      const startY = Math.sin(angle) * radius;
      const ctrlAngle = angle + Math.PI / 6;
      const ctrlX = Math.cos(ctrlAngle) * radius * 0.6;
      const ctrlY = Math.sin(ctrlAngle) * radius * 0.6;
      g.moveTo(startX, startY);
      g.quadraticCurveTo(ctrlX, ctrlY, 0, 0);
      g.stroke({ color: palette.highlight, width: 1, alpha: baseAlpha });
      g.circle(startX, startY, 1.5);
      g.fill({ color: palette.primary, alpha: baseAlpha });
    }
  }

  private drawSoundWaveRing(g: PIXI.Graphics, radius: number, alpha: number, isAngry: boolean): void {
    const segments = 32;
    const waveAmp = 2;
    const color = isAngry ? ANGER_GLOW : SCROLL_GOLD;
    g.moveTo(Math.cos(0) * (radius + waveAmp), Math.sin(0) * (radius + waveAmp));
    for (let s = 1; s <= segments; s++) {
      const angle = (s / segments) * Math.PI * 2;
      const wave = Math.sin(angle * 8) * waveAmp;
      g.lineTo(Math.cos(angle) * (radius + wave), Math.sin(angle) * (radius + wave));
    }
    g.stroke({ color, width: 1.2, alpha });
  }

  // ═══ 水龙卷爆发 Burst ═══

  triggerBurst(
    playerId: string,
    x: number,
    y: number,
    radius: number,
    themeColor: number = FLUID_MAIN,
    durationMs?: number,
    isAngry: boolean = false,
  ): void {
    const existing = this.activeBursts.get(playerId);
    if (existing) {
      this.removeBurstInstance(existing);
    }

    const palette = this.buildPalette(isAngry ? ANGER_MAIN : themeColor);
    const container = new PIXI.Container();
    container.position.set(x, y);
    container.scale.set(this.scale);
    this.container.addChild(container);

    const columnGraphics = new PIXI.Graphics();
    const armGraphics = new PIXI.Graphics();
    const coreGraphics = new PIXI.Graphics();
    const splashGraphics = new PIXI.Graphics();
    const soundWaveGraphics = new PIXI.Graphics();
    container.addChild(columnGraphics, armGraphics, coreGraphics, splashGraphics, soundWaveGraphics);

    const stormPages = this.createStormPages(radius, isAngry);
    for (const page of stormPages) {
      container.addChild(page.sprite);
    }

    this.activeBursts.set(playerId, {
      container,
      life: 0,
      maxLife: durationMs ?? 4000,
      themeColor,
      radius,
      particleTimer: 0,
      palette,
      columnGraphics,
      armGraphics,
      coreGraphics,
      splashGraphics,
      soundWaveGraphics,
      soundWaveTimer: 0,
      stormPages,
      soundWaveRings: [],
      x,
      y,
      isAngry,
    });
  }

  private createStormPages(radius: number, isAngry: boolean): BookPage[] {
    const count = 20 + Math.floor(Math.random() * 11);
    const pages: BookPage[] = [];
    const texture = isAngry ? bookPageBurnedTexture! : bookPageTexture!;
    for (let i = 0; i < count; i++) {
      const sprite = new PIXI.Sprite(texture);
      const angle = Math.random() * Math.PI * 2;
      const dist = radius * (0.2 + Math.random() * 0.8);
      sprite.anchor.set(0.5);
      sprite.position.set(Math.cos(angle) * dist, Math.sin(angle) * dist);
      sprite.scale.set(0.4 + Math.random() * 0.6);
      sprite.alpha = 0.5 + Math.random() * 0.3;
      pages.push({
        sprite,
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 6,
        driftPhase: Math.random() * Math.PI * 2,
        driftRadius: 5 + Math.random() * 15,
        alpha: sprite.alpha,
        scale: sprite.scale.x,
      });
    }
    return pages;
  }

  private drawBurstColumn(g: PIXI.Graphics, radius: number, palette: Palette, progress: number, isAngry: boolean): void {
    g.clear();
    const deepColor = isAngry ? ANGER_DEEP : FLUID_DEEP;
    for (let i = 0; i < 10; i++) {
      const t = i / 9;
      const r = radius * (0.1 + 0.9 * t) * progress;
      const color = t < 0.5 ? this.interpolateColor(palette.primary, deepColor, t * 2) : deepColor;
      const alpha = (1 - t) * 0.2 * progress;
      g.circle(0, 0, r);
      g.fill({ color, alpha });
    }
    for (let i = 0; i < 4; i++) {
      const t = i / 3;
      g.ellipse(0, 0, radius * progress * (0.3 + t * 0.2), radius * progress * (0.1 + t * 0.05));
      g.stroke({ color: palette.glow, width: 0.8, alpha: 0.4 * progress });
    }
  }

  private drawBurstArms(g: PIXI.Graphics, radius: number, palette: Palette, progress: number): void {
    g.clear();
    const steps = 24;
    const turns = 1.5;
    for (let i = 0; i < 4; i++) {
      const baseAngle = (i * Math.PI) / 2;
      g.moveTo(0, 0);
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const theta = t * Math.PI * 2 * turns;
        const r = t * radius * progress;
        const angle = baseAngle + theta;
        g.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
      }
      g.stroke({ color: palette.glow, width: 1.5, alpha: 0.7 * progress });
    }
  }

  private drawBurstCore(g: PIXI.Graphics, radius: number, palette: Palette, progress: number, isAngry: boolean): void {
    g.clear();
    const pageColor = isAngry ? BURNED_PAGE : PARCHMENT_OLD;
    const inkColor = isAngry ? 0x4a0a0a : SCROLL_GOLD;
    const size = radius * 0.15 * progress;
    g.moveTo(-size, -size * 0.8);
    g.lineTo(-size * 0.1, -size);
    g.lineTo(-size * 0.1, size);
    g.lineTo(-size, size * 0.8);
    g.fill({ color: pageColor, alpha: 0.85 });
    g.moveTo(size * 0.1, -size);
    g.lineTo(size, -size * 0.8);
    g.lineTo(size, size * 0.8);
    g.lineTo(size * 0.1, size);
    g.fill({ color: pageColor, alpha: 0.85 });
    g.moveTo(-size * 0.1, -size);
    g.lineTo(-size * 0.1, size);
    g.stroke({ color: inkColor, width: 1, alpha: 0.8 });
    for (let i = -2; i <= 2; i++) {
      g.moveTo(-size * 0.8, i * size * 0.3);
      g.lineTo(-size * 0.2, i * size * 0.3);
      g.stroke({ color: inkColor, width: 0.3, alpha: 0.5 });
      g.moveTo(size * 0.2, i * size * 0.3);
      g.lineTo(size * 0.8, i * size * 0.3);
      g.stroke({ color: inkColor, width: 0.3, alpha: 0.5 });
    }
  }

  private drawBurstSplash(g: PIXI.Graphics, radius: number, palette: Palette, progress: number): void {
    g.clear();
    g.circle(0, 0, radius * progress);
    g.stroke({ color: palette.highlight, width: 2, alpha: 0.5 * (1 - progress) });
  }

  // ═══ 三阶段动画钩子 ═══

  protected phase1Charge(burst: ActiveBurstBase, t: number): void {
    const b = burst as ActiveFluidBurst;
    const ease = this.easeOutCubic(t);
    b.columnGraphics.clear();
    const shrinkR = b.radius * (1 - ease * 0.7);
    for (let i = 0; i < 8; i++) {
      const layerT = i / 7;
      const r = shrinkR * (0.15 + 0.85 * layerT);
      b.columnGraphics.circle(0, 0, r);
      b.columnGraphics.fill({ color: b.palette.primary, alpha: 0.15 * (1 - layerT) });
    }
    this.drawBurstCore(b.coreGraphics, b.radius * 0.5, b.palette, ease, b.isAngry);
    b.coreGraphics.alpha = ease;
    b.particleTimer += 16;
    if (b.particleTimer > 40) {
      b.particleTimer = 0;
      this.spawnConvergeParticles(b, 2);
    }
    b.armGraphics.alpha = 0;
    b.splashGraphics.alpha = 0;
  }

  protected phase2Burst(burst: ActiveBurstBase, t: number): void {
    const b = burst as ActiveFluidBurst;
    const ease = this.easeOutCubic(t);
    this.drawBurstColumn(b.columnGraphics, b.radius, b.palette, ease, b.isAngry);
    b.columnGraphics.alpha = 1;
    this.drawBurstArms(b.armGraphics, b.radius, b.palette, ease);
    b.armGraphics.alpha = 1;
    b.coreGraphics.rotation = ease * Math.PI * 2;
    this.drawBurstSplash(b.splashGraphics, b.radius, b.palette, ease);
    b.splashGraphics.alpha = 1;
    b.soundWaveTimer += 16;
    if (b.soundWaveTimer > 200) {
      b.soundWaveTimer = 0;
      b.soundWaveRings.push({ radius: 0, alpha: 0.8, life: 0 });
    }
    this.updateSoundWaves(b);
    b.particleTimer += 16;
    if (b.particleTimer > 50) {
      b.particleTimer = 0;
      this.spawnStormParticles(b, 3);
    }
  }

  protected phase3Diffuse(burst: ActiveBurstBase, t: number): void {
    const b = burst as ActiveFluidBurst;
    const ease = this.easeOutCubic(t);
    b.columnGraphics.scale.set(1 + ease * 0.5);
    b.columnGraphics.alpha = 1 - ease;
    b.armGraphics.alpha = (1 - ease) * 0.6;
    b.coreGraphics.alpha = (1 - ease) * 0.7;
    b.splashGraphics.clear();
    for (let i = 0; i < 4; i++) {
      const ringT = (ease + i * 0.25) % 1;
      const r = b.radius * (0.5 + ringT * 1.5);
      b.splashGraphics.circle(0, 0, r);
      b.splashGraphics.stroke({ color: b.palette.glow, width: 0.8, alpha: 0.4 * (1 - ringT) });
    }
    b.splashGraphics.alpha = 1;
    this.updateSoundWaves(b);
    b.particleTimer += 16;
    if (b.particleTimer > 80) {
      b.particleTimer = 0;
      this.spawnStormParticles(b, 1);
    }
  }

  private updateSoundWaves(b: ActiveFluidBurst): void {
    b.soundWaveGraphics.clear();
    const alive: typeof b.soundWaveRings = [];
    for (const ring of b.soundWaveRings) {
      ring.life += 16;
      const t = ring.life / 1500;
      if (t >= 1) continue;
      ring.radius = b.radius * 1.5 * t;
      ring.alpha = 0.8 * (1 - t);
      this.drawSoundWaveRing(b.soundWaveGraphics, ring.radius, ring.alpha, b.isAngry);
      alive.push(ring);
    }
    b.soundWaveRings = alive;
  }

  private spawnConvergeParticles(b: ActiveFluidBurst, count: number): void {
    const s = this.scale;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = b.radius * s * 0.8;
      const px = b.x + Math.cos(angle) * dist;
      const py = b.y + Math.sin(angle) * dist;
      this.particlePool.emit({
        x: px,
        y: py,
        vx: -Math.cos(angle) * 60,
        vy: -Math.sin(angle) * 60,
        life: 600,
        scaleStart: 1,
        scaleEnd: 0,
        alphaStart: 0.8,
        alphaEnd: 0,
        tint: b.palette.glow,
        radius: 1.5 * s,
        drag: 0.5,
      });
    }
  }

  private spawnStormParticles(b: ActiveFluidBurst, count: number): void {
    const s = this.scale;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (40 + Math.random() * 60) * s;
      const isPage = Math.random() < 0.5;
      this.particlePool.emit({
        x: b.x,
        y: b.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 30,
        ax: 0,
        ay: 150,
        drag: 0.3,
        life: 1000 + Math.random() * 800,
        scaleStart: isPage ? 1.5 : 1,
        scaleEnd: 0,
        alphaStart: 0.9,
        alphaEnd: 0,
        tint: isPage ? (b.isAngry ? BURNED_PAGE : PARCHMENT_OLD) : b.palette.glow,
        tintStart: isPage ? (b.isAngry ? 0x4a0a0a : SCROLL_GOLD) : b.palette.highlight,
        tintEnd: isPage ? (b.isAngry ? 0x1a0a0a : INK_BLACK) : b.palette.shadow,
        radius: (1.5 + Math.random() * 2) * s,
        rotationSpeed: (Math.random() - 0.5) * 10,
      });
    }
  }

  // ═══ 生命周期 ═══

  update(dt: number): void {
    this.activeTrails.forEach((trail) => {
      if (trail.container.destroyed) return;
      trail.life += dt;
      const breath = 1 + 0.05 * Math.sin(trail.life * 0.002 * Math.PI);
      trail.auraGraphics.scale.set(breath);
      trail.rippleGraphics.clear();
      for (let i = 0; i < 3; i++) {
        trail.rippleLife[i] += dt;
        if (trail.rippleLife[i] > trail.rippleMaxLife) {
          trail.rippleLife[i] -= trail.rippleMaxLife;
        }
        this.drawTrailRipple(trail.rippleGraphics, trail.radius, trail.rippleLife[i], trail.rippleMaxLife, trail.palette);
      }
      for (const page of trail.bookPages) {
        page.rotation += page.rotationSpeed * (dt / 1000);
        page.driftPhase += dt * 0.001;
        const driftX = Math.cos(page.driftPhase) * page.driftRadius;
        const driftY = Math.sin(page.driftPhase) * page.driftRadius;
        page.sprite.position.set(page.x + driftX, page.y + driftY);
        page.sprite.rotation = page.rotation;
      }
      trail.particleTimer += dt;
      if (trail.particleTimer > 800) {
        trail.particleTimer = 0;
        this.spawnTrailParticles(trail.x, trail.y, trail.radius, trail.palette);
      }
    });

    this.activeVortices.forEach((vortex) => {
      if (vortex.container.destroyed) return;
      vortex.life += dt;
      vortex.coreGraphics.rotation = vortex.life * 0.001 * Math.PI;
      vortex.armGraphics.rotation = -vortex.life * 0.0008 * Math.PI;
      vortex.soundWaveTimer += dt;
      if (vortex.soundWaveTimer > SOUND_WAVE_INTERVAL) {
        vortex.soundWaveTimer = 0;
        vortex.soundWaveRings.push({ radius: 0, alpha: 0.8, life: 0 });
      }
      vortex.soundWaveGraphics.clear();
      const aliveRings: typeof vortex.soundWaveRings = [];
      for (const ring of vortex.soundWaveRings) {
        ring.life += dt;
        const t = ring.life / 1500;
        if (t >= 1) continue;
        ring.radius = vortex.radius * 1.5 * t;
        ring.alpha = 0.8 * (1 - t);
        this.drawSoundWaveRing(vortex.soundWaveGraphics, ring.radius, ring.alpha, vortex.isAngry);
        aliveRings.push(ring);
      }
      vortex.soundWaveRings = aliveRings;
    });

    const expired: string[] = [];
    this.activeBursts.forEach((burst, key) => {
      if (burst.container.destroyed) {
        expired.push(key);
        return;
      }
      for (const page of burst.stormPages) {
        page.rotation += page.rotationSpeed * (dt / 1000);
        page.driftPhase += dt * 0.001;
        const driftX = Math.cos(page.driftPhase) * page.driftRadius;
        const driftY = Math.sin(page.driftPhase) * page.driftRadius;
        page.sprite.position.set(page.x + driftX, page.y + driftY);
        page.sprite.rotation = page.rotation;
      }
      const isExpired = this.runBurstAnimation(burst, dt);
      if (isExpired) {
        expired.push(key);
      }
    });
    for (const key of expired) {
      const b = this.activeBursts.get(key);
      if (b) this.removeBurstInstance(b);
      this.activeBursts.delete(key);
    }
  }

  private removeBurstInstance(b: ActiveFluidBurst): void {
    this.container.removeChild(b.container);
    b.container.destroy({ children: true });
  }

  protected onScaleChange(scale: number): void {
    this.activeTrails.forEach((t) => {
      if (!t.container.destroyed) t.container.scale.set(scale);
    });
    this.activeVortices.forEach((v) => {
      if (!v.container.destroyed) v.container.scale.set(scale);
    });
    this.activeBursts.forEach((b) => {
      if (!b.container.destroyed) b.container.scale.set(scale);
    });
  }

  clear(): void {
    this.activeTrails.forEach((t) => {
      this.container.removeChild(t.container);
      t.container.destroy({ children: true });
    });
    this.activeTrails.clear();
    this.activeVortices.forEach((v) => {
      this.container.removeChild(v.container);
      v.container.destroy({ children: true });
    });
    this.activeVortices.clear();
    this.activeBursts.forEach((b) => {
      this.container.removeChild(b.container);
      b.container.destroy({ children: true });
    });
    this.activeBursts.clear();
  }
}
