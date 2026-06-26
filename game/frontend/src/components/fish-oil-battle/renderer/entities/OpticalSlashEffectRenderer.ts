import * as PIXI from 'pixi.js';
import type { ActiveEffect, OpticalSlashVisualConfig } from './VisualEffectUtils';

/**
 * 光学斩击特效渲染器 - Liya（弧月飞行刀光）
 *
 * 视觉效果：
 * - 弧形弯月刀光从起点沿角度方向高速飞行
 * - 三层绘制：外层光晕(主题色虚化) → 中层(主题色) → 内核纯白
 * - 飞行尾部带残影拖尾 + 细小光粒
 * - 爆发模式：6道扇形刀光 + 十字准星锁定
 *
 * 数据驱动：所有视觉参数由 EffectRenderer.buildOpticalSlashVisualCfg() 提供，
 * 最终来源是 WeaponRangeConfig。本文件不包含硬编码常量。
 *
 * TODO: 人设彩蛋视觉
 * - 斩击时浮现"目标已标记"文字（0.3s）
 * - 斩击永远避开自身方向
 */

const SLASH_CORE_COLOR = 0xFFFFFF; // 内核纯白
const CROSSHAIR_COLOR = 0xFF4040;  // 十字准星红

export class OpticalSlashEffectRenderer {
  private pool: PIXI.Graphics[] = [];
  private active: Set<PIXI.Graphics> = new Set();
  private container: PIXI.Container;
  private scale = 1;
  private canvasW = 1280;
  private canvasH = 720;

  constructor(
    container: PIXI.Container,
    _hologramContainer: PIXI.Container,
    prePoolCount = 20,
  ) {
    this.container = container;

    for (let i = 0; i < prePoolCount; i++) {
      const g = new PIXI.Graphics();
      g.visible = false;
      container.addChild(g);
      this.pool.push(g);
    }
  }

  setScale(s: number, w: number, h: number): void {
    this.scale = s;
    this.canvasW = w;
    this.canvasH = h;
  }

  // ── 对象池 ──────────────────────────────────────────

  private acquire(): PIXI.Graphics | null {
    for (const g of this.pool) {
      if (!this.active.has(g)) {
        this.active.add(g);
        g.visible = true;
        return g;
      }
    }
    const g = new PIXI.Graphics();
    this.container.addChild(g);
    this.pool.push(g);
    this.active.add(g);
    return g;
  }

  private release(g: PIXI.Graphics): void {
    g.clear();
    g.visible = false;
    this.active.delete(g);
  }

  // ── 触发普通弧月斩击 ────────────────────────────────

  triggerSlash(
    x: number,
    y: number,
    angle: number,
    length: number,
    themeColor: number,
    isBurst = false,
    config?: OpticalSlashVisualConfig,
  ): ActiveEffect | null {
    const g = this.acquire();
    if (!g) return null;

    const s = this.scale;
    const maxDist = length * s;
    const maxLife = isBurst ? 1000 : 800;
    // 飞行阶段时长（到达终点后滞留渐隐）
    const flightDist = maxDist;
    const flightSpeed = config?.flightSpeed ?? 300;
    const flightDurMs = (flightDist / (flightSpeed * s)) * 1000;

    return {
      type: 'optical_slash',
      container: g as unknown as PIXI.Container,
      life: 0,
      maxLife,
      onUpdate: (ef, _dt) => {
        const t = Math.min(ef.life / ef.maxLife, 1);

        // 飞行进度 0→1，超过后停在终点
        const flightT = Math.min(ef.life / flightDurMs, 1);

        // 当前位置沿飞行方向
        const cx = x + Math.cos(angle) * flightDist * flightT;
        const cy = y + Math.sin(angle) * flightDist * flightT;

        // 透明度：飞行期间满，到达后渐隐
        let alpha: number;
        const fadeStart = flightDurMs / maxLife;
        if (t < fadeStart) {
          alpha = 0.9;
        } else {
          alpha = 0.9 * (1 - (t - fadeStart) / (1 - fadeStart));
        }

        // 飞行中 0→1，到达后保持在 1
        const growScale = Math.min(flightT * 1.5, 1);

        g.clear();

        // 距离缩放（刚出发时稍小，增加弹出感）
        const bow = (config?.arcBow ?? 28) * s * growScale * (0.85 + 0.15 * Math.sin(ef.life / 50));
        const halfW = (config?.bladeHalfWidth ?? 20) * s * growScale;

        this.drawArcCrescent(g, cx, cy, angle, bow, halfW, themeColor, alpha, s);

        // 尾部残影（飞行中显示）
        if (flightT < 0.95) {
          const trailDist = 12 * s;
          const trailX = cx - Math.cos(angle) * trailDist;
          const trailY = cy - Math.sin(angle) * trailDist;
          const trailBow = bow * 0.7;
          const trailHalfW = halfW * 0.55;
          this.drawArcCrescent(g, trailX, trailY, angle, trailBow, trailHalfW, themeColor, alpha * 0.22, s);
        }

        // 细小光粒（刀光两侧洒落）
        if (flightT < 0.9 && ef.life % 3 === 0) {
          const sparkCount = 2;
          for (let i = 0; i < sparkCount; i++) {
            const sparkAngle = angle + (Math.random() - 0.5) * Math.PI * 0.5;
            const sparkDist = halfW * (0.5 + Math.random() * 0.6);
            const sx2 = cx + Math.cos(sparkAngle) * sparkDist;
            const sy2 = cy + Math.sin(sparkAngle) * sparkDist;
            const sparkSize = 1.2 * s * (0.5 + Math.random() * 0.5);
            g.circle(sx2, sy2, sparkSize);
            g.fill({ color: themeColor, alpha: alpha * (0.3 + Math.random() * 0.3) });
          }
        }
      },
      onDecay: (_ef) => {
        this.release(g);
      },
    };
  }

  /**
   * 绘制弧月弯刀刀光（填充版）
   *
   * 彻底重构：从描边线条 → 填充闭合月牙形状
   * 形状：外弧（向前弓弯）+ 内弧（向前少弓）→ 构成填充月牙
   * 6 层叠加：辉光 → 主体 → 内核 → 刀刃高亮 → 内缘线 → 尖端星光
   */
  private drawArcCrescent(
    g: PIXI.Graphics,
    cx: number, cy: number,
    angle: number,
    bow: number,
    halfWidth: number,
    themeColor: number,
    alpha: number,
    s: number,
  ): void {
    // 方向向量
    const px = -Math.sin(angle); // 垂直于飞行方向（刀身展开）
    const py = Math.cos(angle);
    const fx = Math.cos(angle);  // 飞行方向（刀刃向前）
    const fy = Math.sin(angle);

    // 月牙两端点（刀尖）
    const lx = cx - px * halfWidth;
    const ly = cy - py * halfWidth;
    const rx = cx + px * halfWidth;
    const ry = cy + py * halfWidth;

    // 外弧控制点（刀刃侧，向前弓弯最多）
    const outerBow = bow;
    const omx = cx + fx * outerBow;
    const omy = cy + fy * outerBow;

    // 内弧控制点（刀背侧，弓弯较小 → 形成月牙厚度）
    const innerBow = bow * 0.3;
    const imx = cx + fx * innerBow;
    const imy = cy + fy * innerBow;

    // 拆分主题色 RGB 分量
    const r = (themeColor >> 16) & 0xff;
    const gC = (themeColor >> 8) & 0xff;
    const b = themeColor & 0xff;

    // 辉光色（主题色 + 亮白偏移）
    const glowR = Math.min(255, r + 120);
    const glowG = Math.min(255, gC + 120);
    const glowB = Math.min(255, b + 120);
    const glowColor = (glowR << 16) | (glowG << 8) | glowB;

    // 内核高亮色（偏向纯白）
    const coreR = Math.min(255, r + 180);
    const coreG = Math.min(255, gC + 180);
    const coreB = Math.min(255, b + 180);
    const coreColor = (coreR << 16) | (coreG << 8) | coreB;

    // ═══ Layer 1: 外层辉光（放大一圈，高透明度） ═══
    const gBow = outerBow * 1.15;
    const gIB = innerBow * 0.2;
    const gHW = halfWidth * 1.12;
    g.moveTo(cx - px * gHW, cy - py * gHW);
    g.quadraticCurveTo(cx + fx * gBow, cy + fy * gBow, cx + px * gHW, cy + py * gHW);
    g.quadraticCurveTo(cx + fx * gIB, cy + fy * gIB, cx - px * gHW, cy - py * gHW);
    g.closePath();
    g.fill({ color: glowColor, alpha: alpha * 0.13 });

    // ═══ Layer 2: 月牙主体（填充色，中等透明度） ═══
    g.moveTo(lx, ly);
    g.quadraticCurveTo(omx, omy, rx, ry);
    g.quadraticCurveTo(imx, imy, lx, ly);
    g.closePath();
    g.fill({ color: themeColor, alpha: alpha * 0.5 });

    // ═══ Layer 3: 内核高亮（稍窄，更亮） ═══
    const coB = outerBow * 0.7;
    const ciB = innerBow * 2.2;
    const cHW = halfWidth * 0.58;
    g.moveTo(cx - px * cHW, cy - py * cHW);
    g.quadraticCurveTo(cx + fx * coB, cy + fy * coB, cx + px * cHW, cy + py * cHW);
    g.quadraticCurveTo(cx + fx * ciB, cy + fy * ciB, cx - px * cHW, cy - py * cHW);
    g.closePath();
    g.fill({ color: coreColor, alpha: alpha * 0.42 });

    // ═══ Layer 4: 刀刃高亮线（外弧白边） ═══
    g.moveTo(lx, ly);
    g.quadraticCurveTo(omx, omy, rx, ry);
    g.stroke({ color: SLASH_CORE_COLOR, width: 1.6 * s, alpha: alpha * 0.88 });

    // ═══ Layer 5: 内缘暗线（增加立体感） ═══
    g.moveTo(rx, ry);
    g.quadraticCurveTo(imx, imy, lx, ly);
    g.stroke({ color: themeColor, width: 0.7 * s, alpha: alpha * 0.22 });

    // ═══ Layer 6: 尖端星光（两端的白点） ═══
    const tipR = halfWidth * 0.11;
    g.circle(lx, ly, tipR);
    g.fill({ color: SLASH_CORE_COLOR, alpha: alpha * 0.95 });
    g.circle(rx, ry, tipR);
    g.fill({ color: SLASH_CORE_COLOR, alpha: alpha * 0.95 });
  }

  // ── 触发爆发无限剑制 ────────────────────────────────

  triggerBurst(
    x: number,
    y: number,
    themeColor: number,
    config?: OpticalSlashVisualConfig,
  ): ActiveEffect[] {
    const effects: ActiveEffect[] = [];
    const s = this.scale;
    const burstLength = config?.maxRadius ?? 150; // 逻辑 px，来源 WEAPON_RANGE_CONFIG.visualRadius
    const burstCount = 6;

    // 6道扇形刀光
    for (let i = 0; i < burstCount; i++) {
      const angle = (i / burstCount) * Math.PI * 2;
      const ef = this.triggerSlash(x, y, angle, burstLength, themeColor, true, config);
      if (ef) {
        ef.maxLife = 1000;
        effects.push(ef);
      }
    }

    // 十字准星锁定特效
    const crosshair = new PIXI.Graphics();
    const screenDiag = Math.sqrt(this.canvasW ** 2 + this.canvasH ** 2);

    return [
      ...effects,
      {
        type: 'optical_slash_burst',
        container: crosshair as unknown as PIXI.Container,
        life: 0,
        maxLife: 600,
        onUpdate: (ef, _dt) => {
          const t = Math.min(ef.life / ef.maxLife, 1);
          const alpha = t < 0.15
            ? t / 0.15 * 0.5
            : t > 0.5
              ? 0.5 * (1 - (t - 0.5) / 0.5)
              : 0.5;

          crosshair.clear();

          // 水平线
          crosshair.moveTo(x - screenDiag, y);
          crosshair.lineTo(x + screenDiag, y);
          crosshair.stroke({ color: CROSSHAIR_COLOR, width: 2, alpha: alpha * 0.3 });

          // 垂直线
          crosshair.moveTo(x, y - screenDiag);
          crosshair.lineTo(x, y + screenDiag);
          crosshair.stroke({ color: CROSSHAIR_COLOR, width: 2, alpha: alpha * 0.3 });

          // 中心十字
          const crossSize = 20 * s;
          crosshair.moveTo(x - crossSize, y);
          crosshair.lineTo(x - crossSize * 0.3, y);
          crosshair.stroke({ color: CROSSHAIR_COLOR, width: 3 * s, alpha });
          crosshair.moveTo(x + crossSize * 0.3, y);
          crosshair.lineTo(x + crossSize, y);
          crosshair.stroke({ color: CROSSHAIR_COLOR, width: 3 * s, alpha });
          crosshair.moveTo(x, y - crossSize);
          crosshair.lineTo(x, y - crossSize * 0.3);
          crosshair.stroke({ color: CROSSHAIR_COLOR, width: 3 * s, alpha });
          crosshair.moveTo(x, y + crossSize * 0.3);
          crosshair.lineTo(x, y + crossSize);
          crosshair.stroke({ color: CROSSHAIR_COLOR, width: 3 * s, alpha });

          // 中心锁环
          const ringRadius = 15 * s;
          crosshair.circle(x, y, ringRadius);
          crosshair.stroke({ color: CROSSHAIR_COLOR, width: 2 * s, alpha: alpha * 0.8 });
        },
        onDecay: () => {
          if (!crosshair.destroyed) crosshair.destroy();
        },
      } as ActiveEffect,
    ];
  }

  // ── 清理 ──────────────────────────────────────────

  clear(): void {
    for (const g of this.active) {
      g.clear();
      g.visible = false;
    }
    this.active.clear();
  }

  destroy(): void {
    this.clear();
    for (const g of this.pool) {
      if (!g.destroyed) g.destroy(true);
    }
    this.pool.length = 0;
  }
}
