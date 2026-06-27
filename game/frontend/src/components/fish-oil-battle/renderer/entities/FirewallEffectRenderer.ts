import * as PIXI from 'pixi.js';
import { FIREWALL_VISUAL_WIDTH, FIREWALL_VISUAL_HEIGHT } from '../constants';
import { ParticlePool } from '../systems/ParticlePool';
import {
  lighten,
  easeOutCubic,
  type ActiveEffect,
  type FirewallVisualConfig,
} from './VisualEffectUtils';

/**
 * 防火墙协议 (Firewall Protocol) - 控制者流派
 * 前端视觉渲染器（闲乘月质量标准）
 *
 * 视觉设计（控制者蓝紫）：
 * - 防火墙核心：10 层同心圆径向渐变（白→高亮浅蓝→浅蓝紫→主蓝紫→透明）
 * - 蜂巢纹理：多层叠加（外层发光 + 主色 + 核心高亮），增强发光感
 * - 数据流粒子：particlePool.emit 生成蓝色数据流粒子（编译内聚 / 运行数据流）
 * - 三阶段动画：编译(0-15%T) → 部署(15%-30%T) → 运行(30%-100%T)
 */

// ══════════════════════════════════════════════════════
//  颜色常量（控制者蓝紫）
// ══════════════════════════════════════════════════════

const FIREWALL_DEEP = 0x0a0a4a; // 深蓝黑
const FIREWALL_MAIN = 0x2200cc; // 主蓝紫
const FIREWALL_LIGHT = 0x5566ff; // 浅蓝紫
const FIREWALL_HIGHLIGHT = 0x99bbff; // 高亮浅蓝
const FIREWALL_WHITE = 0xffffff; // 白色
const FIREWALL_CYAN = 0x00ffcc; // 青绿（数据流色）

/** 防火墙调色板（6 色，可由主题色派生） */
interface FirewallPalette {
  deep: number;
  main: number;
  light: number;
  highlight: number;
  white: number;
  cyan: number;
}

export class FirewallEffectRenderer {
  /** 对象池 */
  private pool: PIXI.Graphics[] = [];
  /** 活跃中的防火墙 */
  private active: Set<PIXI.Graphics> = new Set();
  /** wallId → Graphics 映射 */
  private fieldEffects: Map<string, PIXI.Graphics> = new Map();
  /** 挂载容器 */
  private container: PIXI.Container;
  /** 粒子池（可选，用于数据流粒子） */
  private particlePool?: ParticlePool;

  /** 当前缩放因子 */
  private scale = 1;

  constructor(container: PIXI.Container, particlePool?: ParticlePool, prePoolCount = 8) {
    this.container = container;
    this.particlePool = particlePool;

    for (let i = 0; i < prePoolCount; i++) {
      const g = new PIXI.Graphics();
      g.visible = false;
      container.addChild(g);
      this.pool.push(g);
    }
  }

  /** 同步缩放 */
  setScale(scale: number): void {
    this.scale = scale;
  }

  // ── 对象池操作 ──────────────────────────────────────────

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
    g.mask = null;
    this.active.delete(g);
  }

  // ── 触发接口 ──────────────────────────────────────────

  /**
   * 触发防火墙
   * @param x 中心逻辑坐标 X
   * @param y 中心逻辑坐标 Y
   * @param isHardened 是否硬化模式（满透明 + 红色警示）
   * @param wallId 墙体唯一 ID
   * @param themeColor 玩家主题色（覆盖默认主色，自动派生调色板）
   * @param visualCfg 数据驱动视觉配置（含 durationMs 路径 maxLifeMs / growDurationMs）
   * @returns 活跃特效与 wallId（由 EffectRenderer 统一驱动生命周期）
   */
  trigger(
    x: number,
    y: number,
    isHardened = false,
    wallId = `fw_${Date.now()}`,
    themeColor?: number,
    visualCfg?: FirewallVisualConfig,
  ): { effect: ActiveEffect | null; wallId: string } {
    const g = this.acquire();
    if (!g) return { effect: null, wallId };

    // 持续时间（数据驱动：visualCfg.maxLifeMs 即 durationMs）
    const defaultMaxLife = 18000;
    const maxLife = visualCfg?.maxLifeMs ?? defaultMaxLife;
    const s = this.scale;

    // 构建调色板：优先 visualCfg.primaryColor，其次 themeColor，最后控制者默认 / 硬化红
    const baseMain =
      visualCfg?.primaryColor ??
      themeColor ??
      (isHardened ? 0xff3333 : FIREWALL_MAIN);
    const palette = this.buildPalette(baseMain, isHardened);

    const innerColor = visualCfg?.innerColor ?? palette.light;

    // 视觉尺寸
    const visualW = (visualCfg?.visualWidth ?? FIREWALL_VISUAL_WIDTH) * s;
    const visualH = (visualCfg?.visualHeight ?? FIREWALL_VISUAL_HEIGHT) * s;
    const halfW = visualW / 2;
    const halfH = visualH / 2;

    const hexR = (visualCfg?.hexRadius ?? 24) * s;
    const hexLineWidth = visualCfg?.hexLineWidth;
    const hexLineAlpha = visualCfg?.hexLineAlpha;

    // 复用 mask Graphics（避免每帧分配）
    const mask = new PIXI.Graphics();
    g.mask = mask;

    // 初始帧
    g.clear();
    this.drawFirewallBody(
      g,
      x,
      y,
      halfW * 0.3,
      halfH * 0.3,
      hexR,
      palette,
      innerColor,
      isHardened ? 1.0 : 0.45,
      s,
      0,
      0,
      maxLife,
      hexLineWidth,
      hexLineAlpha,
      mask,
    );

    // 数据流粒子节流计时器
    let particleTimer = 0;

    const ef: ActiveEffect = {
      type: 'firewall',
      container: g as unknown as PIXI.Container,
      life: 0,
      maxLife,
      onUpdate: (_ef, dt) => {
        const life = _ef.life;
        const T = _ef.maxLife;
        if (life >= T) return;

        // 三阶段时间边界
        const phase1End = T * 0.15; // 编译
        const phase2End = T * 0.3; // 部署

        let growScale: number;
        let bodyAlpha: number;
        let coreIntensity: number;

        if (life < phase1End) {
          // 阶段1 编译：核心聚集，墙体生长 0.3→0.7（easeIn 加速）
          const p = life / phase1End;
          const eased = this.easeInCubic(p);
          growScale = 0.3 + 0.4 * eased;
          const baseA = isHardened ? 1.0 : 0.45;
          bodyAlpha = baseA * (0.4 + 0.6 * p);
          coreIntensity = p; // 0 → 1 核心渐显

          // 编译粒子：向中心汇聚的数据流
          particleTimer += dt;
          if (this.particlePool && particleTimer > 90) {
            particleTimer = 0;
            this.spawnCompileParticles(
              x,
              y,
              halfW * growScale,
              halfH * growScale,
              palette,
            );
          }
        } else if (life < phase2End) {
          // 阶段2 部署：墙体展开 0.7→1.0（easeOut 减速），边框闪现
          const p = (life - phase1End) / (phase2End - phase1End);
          const eased = easeOutCubic(p);
          growScale = 0.7 + 0.3 * eased;
          const baseA = isHardened ? 1.0 : 0.45;
          bodyAlpha = baseA;
          coreIntensity = 1.0 + 0.4 * Math.sin(p * Math.PI); // 部署时核心脉冲增强

          // 部署粒子：边框迸发
          particleTimer += dt;
          if (this.particlePool && particleTimer > 60) {
            particleTimer = 0;
            this.spawnDeployParticles(
              x,
              y,
              halfW * growScale,
              halfH * growScale,
              palette,
            );
          }
        } else {
          // 阶段3 运行：稳定显示 + 扫描线 + 缓慢衰减
          const p = (life - phase2End) / (T - phase2End);
          growScale = 1.0;
          const baseA = isHardened ? 1.0 : 0.45;
          bodyAlpha = baseA * (1 - p * 0.3); // 缓慢衰减
          coreIntensity = 1.0 - p * 0.3;

          // 运行粒子：数据流粒子沿墙体流动
          particleTimer += dt;
          if (this.particlePool && particleTimer > 130) {
            particleTimer = 0;
            this.spawnDataFlowParticles(
              x,
              y,
              halfW * growScale,
              halfH * growScale,
              palette,
            );
          }
        }

        g.clear();
        this.drawFirewallBody(
          g,
          x,
          y,
          halfW * growScale,
          halfH * growScale,
          hexR,
          palette,
          innerColor,
          bodyAlpha,
          s,
          life,
          T,
          maxLife,
          hexLineWidth,
          hexLineAlpha,
          mask,
        );

        // 动态扫描线（从上到下，2s 周期）—— 仅运行阶段完整显示
        const scanActive = life >= phase1End;
        if (scanActive) {
          const scanPhase = (life / 2000) % 1;
          const scanY = y - halfH * growScale + scanPhase * visualH * growScale;
          const scanHeight = 3 * s;
          g.rect(
            x - halfW * growScale,
            scanY - scanHeight / 2,
            visualW * growScale,
            scanHeight,
          );
          g.fill({ color: palette.cyan, alpha: 0.35 * coreIntensity });
        }
      },
      onDecay: () => {
        this.release(g);
        this.fieldEffects.delete(wallId);
        if (!mask.destroyed) mask.destroy(true);
      },
    };
    ef.container.visible = true;
    this.fieldEffects.set(wallId, g);
    return { effect: ef, wallId };
  }

  // ── 绘制方法 ──────────────────────────────────────────

  /**
   * 绘制防火墙主体：背景填充 + 双层描边 + 蜂巢纹理（多层叠加）+ 中心径向渐变核心
   */
  private drawFirewallBody(
    g: PIXI.Graphics,
    x: number,
    y: number,
    halfW: number,
    halfH: number,
    hexR: number,
    palette: FirewallPalette,
    innerColor: number,
    alpha: number,
    s: number,
    life: number,
    T: number,
    _maxLife: number,
    hexLineWidthOverride?: number,
    hexLineAlphaOverride?: number,
    mask?: PIXI.Graphics,
  ): void {
    const left = x - halfW;
    const top = y - halfH;
    const fullW = halfW * 2;
    const fullH = halfH * 2;

    // 1. 背景填充
    g.rect(left, top, fullW, fullH);
    g.fill({ color: palette.main, alpha: alpha * 0.12 });

    // 2. 双线描边（外粗 + 内细高亮）
    g.rect(left, top, fullW, fullH);
    g.stroke({ color: palette.main, width: 3 * s, alpha: alpha * 0.95 });
    g.rect(left + 2 * s, top + 2 * s, fullW - 4 * s, fullH - 4 * s);
    g.stroke({ color: innerColor, width: 1.5 * s, alpha: alpha * 0.5 });

    // 3. 蜂巢纹理（多层叠加：外层发光 + 主色 + 核心高亮）
    this.drawHoneycombMultiLayer(
      g,
      left,
      top,
      fullW,
      fullH,
      hexR,
      palette,
      alpha,
      s,
      hexLineWidthOverride,
      hexLineAlphaOverride,
    );

    // 更新 mask 裁剪区域（复用同一 Graphics，避免每帧分配）
    if (mask) {
      mask.clear();
      mask.rect(left, top, fullW, fullH);
      mask.fill({ color: 0xffffff });
    }

    // 4. 中心径向渐变核心（10 层同心圆）
    const coreR = Math.min(halfW, halfH) * 0.9;
    // 核心强度随阶段变化（编译期渐显，部署期峰值，运行期稳定）
    const phase1End = T * 0.15;
    const phase2End = T * 0.3;
    let coreIntensity: number;
    if (life < phase1End) {
      coreIntensity = life / phase1End;
    } else if (life < phase2End) {
      const p = (life - phase1End) / (phase2End - phase1End);
      coreIntensity = 1.0 + 0.4 * Math.sin(p * Math.PI);
    } else {
      const p = (life - phase2End) / (T - phase2End);
      coreIntensity = 1.0 - p * 0.3;
    }
    this.drawFirewallCore(g, x, y, coreR, coreIntensity * alpha, palette);

    // 5. 边角节点高亮（四角小光点，科技感）
    const cornerR = 2 * s;
    const corners = [
      [left, top],
      [left + fullW, top],
      [left, top + fullH],
      [left + fullW, top + fullH],
    ];
    for (const [cx, cy] of corners) {
      g.circle(cx, cy, cornerR);
      g.fill({ color: palette.cyan, alpha: alpha * 0.9 });
    }
  }

  /**
   * 绘制防火墙核心：10 层同心圆径向渐变
   * 白 → 高亮浅蓝 → 浅蓝紫 → 主蓝紫 → 深蓝黑（透明）
   */
  private drawFirewallCore(
    g: PIXI.Graphics,
    x: number,
    y: number,
    coreR: number,
    intensity: number,
    palette: FirewallPalette,
  ): void {
    for (let i = 0; i < 10; i++) {
      const t = i / 9; // 0 → 1
      const r = coreR * (0.1 + 0.9 * t);
      // 颜色分段：白 → 高亮 → 浅 → 主 → 深
      let color: number;
      if (t < 0.25) {
        color = this.interpolateColor(palette.white, palette.highlight, t / 0.25);
      } else if (t < 0.5) {
        color = this.interpolateColor(
          palette.highlight,
          palette.light,
          (t - 0.25) / 0.25,
        );
      } else if (t < 0.75) {
        color = this.interpolateColor(
          palette.light,
          palette.main,
          (t - 0.5) / 0.25,
        );
      } else {
        color = this.interpolateColor(
          palette.main,
          palette.deep,
          (t - 0.75) / 0.25,
        );
      }
      const alpha = (1 - t) * 0.3 * intensity;
      g.circle(x, y, r);
      g.fill({ color, alpha });
    }

    // 白色高亮内核
    g.circle(x, y, coreR * 0.12);
    g.fill({ color: palette.white, alpha: intensity });
  }

  /**
   * 绘制蜂巢纹理多层叠加（外层发光 + 主色 + 核心高亮）
   * 每层独立构建路径并描边，确保多色发光效果
   */
  private drawHoneycombMultiLayer(
    g: PIXI.Graphics,
    left: number,
    top: number,
    fullW: number,
    fullH: number,
    hexR: number,
    palette: FirewallPalette,
    alpha: number,
    s: number,
    lineWidthOverride?: number,
    lineAlphaOverride?: number,
  ): void {
    const hexH = hexR * Math.sqrt(3);
    const right = left + fullW;
    const bottom = top + fullH;

    // 三层配置：外层发光（深色宽线）+ 主色 + 核心高亮（细亮线）
    const layers = [
      {
        color: palette.deep,
        width: (lineWidthOverride ?? 2) * s + 2 * s,
        alpha: (lineAlphaOverride ?? alpha * 0.75) * 0.3,
      },
      {
        color: palette.main,
        width: (lineWidthOverride ?? 2) * s,
        alpha: (lineAlphaOverride ?? alpha * 0.75),
      },
      {
        color: palette.highlight,
        width: (lineWidthOverride ?? 2) * s * 0.5,
        alpha: (lineAlphaOverride ?? alpha * 0.75) * 0.5,
      },
    ];

    // flat-top 六边形顶点计算
    const hexVerts = (cx: number, cy: number): [number, number][] => {
      const verts: [number, number][] = [];
      for (let i = 0; i < 6; i++) {
        const angle = Math.PI / 6 + (Math.PI / 3) * i;
        verts.push([cx + hexR * Math.cos(angle), cy + hexR * Math.sin(angle)]);
      }
      return verts;
    };

    // 逐层构建路径 + 描边（确保多色发光层次）
    for (const layer of layers) {
      for (let row = 0; ; row++) {
        const cy = top + row * hexH * 0.5 + hexH * 0.25;
        if (cy > bottom + hexH) break;
        const isOddRow = row % 2 === 1;
        const xOff = isOddRow ? hexR * 1.5 : 0;
        for (let col = 0; ; col++) {
          const cx = left + xOff + col * hexR * 3;
          if (cx > right + hexR) break;
          // 跳过完全在矩形外的六边形
          if (
            cx + hexR < left ||
            cx - hexR > right ||
            cy + hexH * 0.5 < top ||
            cy - hexH * 0.5 > bottom
          )
            continue;

          const verts = hexVerts(cx, cy);
          g.moveTo(verts[0][0], verts[0][1]);
          for (let i = 1; i < 6; i++) g.lineTo(verts[i][0], verts[i][1]);
          g.closePath();
        }
      }
      g.stroke({
        color: layer.color,
        width: layer.width,
        alpha: layer.alpha,
      });
    }
  }

  // ══════════════════════════════════════════════════════
  //  粒子发射
  // ══════════════════════════════════════════════════════

  /** 编译阶段：向中心汇聚的数据流粒子 */
  private spawnCompileParticles(
    x: number,
    y: number,
    halfW: number,
    halfH: number,
    palette: FirewallPalette,
  ): void {
    const s = this.scale;
    for (let i = 0; i < 2; i++) {
      // 从墙体边缘随机点出发
      const edge = Math.floor(Math.random() * 4);
      let px: number, py: number;
      if (edge === 0) {
        px = x - halfW + Math.random() * halfW * 2;
        py = y - halfH;
      } else if (edge === 1) {
        px = x + halfW;
        py = y - halfH + Math.random() * halfH * 2;
      } else if (edge === 2) {
        px = x - halfW + Math.random() * halfW * 2;
        py = y + halfH;
      } else {
        px = x - halfW;
        py = y - halfH + Math.random() * halfH * 2;
      }
      // 朝中心汇聚
      const dx = x - px;
      const dy = y - py;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const speed = (50 + Math.random() * 30) * s;
      const vx = (dx / dist) * speed;
      const vy = (dy / dist) * speed;
      this.particlePool!.emit({
        x: px,
        y: py,
        vx,
        vy,
        life: 700,
        scaleStart: 1,
        scaleEnd: 0.2,
        alphaStart: 0.9,
        alphaEnd: 0,
        tint: palette.cyan,
        radius: (1.5 + Math.random() * 1.2) * s,
      });
    }
  }

  /** 部署阶段：边框迸发的数据粒子 */
  private spawnDeployParticles(
    x: number,
    y: number,
    halfW: number,
    halfH: number,
    palette: FirewallPalette,
  ): void {
    const s = this.scale;
    for (let i = 0; i < 3; i++) {
      // 从墙体边缘出发，向外迸发
      const edge = Math.floor(Math.random() * 4);
      let px: number, py: number, nx: number, ny: number;
      if (edge === 0) {
        px = x - halfW + Math.random() * halfW * 2;
        py = y - halfH;
        nx = 0;
        ny = -1;
      } else if (edge === 1) {
        px = x + halfW;
        py = y - halfH + Math.random() * halfH * 2;
        nx = 1;
        ny = 0;
      } else if (edge === 2) {
        px = x - halfW + Math.random() * halfW * 2;
        py = y + halfH;
        nx = 0;
        ny = 1;
      } else {
        px = x - halfW;
        py = y - halfH + Math.random() * halfH * 2;
        nx = -1;
        ny = 0;
      }
      const speed = (40 + Math.random() * 40) * s;
      const vx = nx * speed + (Math.random() - 0.5) * 20 * s;
      const vy = ny * speed + (Math.random() - 0.5) * 20 * s;
      const color = i % 2 === 0 ? palette.highlight : palette.light;
      this.particlePool!.emit({
        x: px,
        y: py,
        vx,
        vy,
        life: 600,
        scaleStart: 1.1,
        scaleEnd: 0,
        alphaStart: 1,
        alphaEnd: 0,
        tint: color,
        radius: (1.8 + Math.random() * 1.5) * s,
      });
    }
  }

  /** 运行阶段：沿墙体流动的数据流粒子 */
  private spawnDataFlowParticles(
    x: number,
    y: number,
    halfW: number,
    halfH: number,
    palette: FirewallPalette,
  ): void {
    const s = this.scale;
    for (let i = 0; i < 2; i++) {
      // 沿墙体边缘流动（顺时针方向）
      const perimeter = 2 * (halfW * 2 + halfH * 2);
      const t = Math.random();
      let px: number, py: number, vx: number, vy: number;
      const topLen = halfW * 2;
      const rightLen = halfH * 2;
      const bottomLen = halfW * 2;
      const pos = t * perimeter;
      const flowSpeed = (30 + Math.random() * 20) * s;
      if (pos < topLen) {
        // 上边，向右流
        px = x - halfW + pos;
        py = y - halfH;
        vx = flowSpeed;
        vy = 0;
      } else if (pos < topLen + rightLen) {
        // 右边，向下流
        px = x + halfW;
        py = y - halfH + (pos - topLen);
        vx = 0;
        vy = flowSpeed;
      } else if (pos < topLen + rightLen + bottomLen) {
        // 下边，向左流
        px = x + halfW - (pos - topLen - rightLen);
        py = y + halfH;
        vx = -flowSpeed;
        vy = 0;
      } else {
        // 左边，向上流
        px = x - halfW;
        py = y + halfH - (pos - topLen - rightLen - bottomLen);
        vx = 0;
        vy = -flowSpeed;
      }
      this.particlePool!.emit({
        x: px,
        y: py,
        vx,
        vy,
        life: 900,
        scaleStart: 0.9,
        scaleEnd: 0,
        alphaStart: 0.8,
        alphaEnd: 0,
        tint: palette.cyan,
        radius: (1.2 + Math.random() * 1.2) * s,
      });
    }
  }

  // ══════════════════════════════════════════════════════
  //  调色板与工具方法
  // ══════════════════════════════════════════════════════

  /** 由主色派生 6 色调色板（控制者蓝紫默认 / 硬化红警示） */
  private buildPalette(main: number, isHardened: boolean): FirewallPalette {
    // 默认控制者蓝紫：直接使用预设以保证流派辨识度
    if (main === FIREWALL_MAIN && !isHardened) {
      return {
        deep: FIREWALL_DEEP,
        main: FIREWALL_MAIN,
        light: FIREWALL_LIGHT,
        highlight: FIREWALL_HIGHLIGHT,
        white: FIREWALL_WHITE,
        cyan: FIREWALL_CYAN,
      };
    }
    // 主题色派生：保证玩家主题色覆盖时调色板协调
    return {
      deep: this.dimColor(main, 0.3),
      main,
      light: lighten(main, 50),
      highlight: this.interpolateColor(main, 0xffffff, 0.6),
      white: FIREWALL_WHITE,
      cyan: FIREWALL_CYAN,
    };
  }

  /** 颜色插值（from → to，t ∈ [0,1]） */
  private interpolateColor(from: number, to: number, t: number): number {
    const fr = (from >> 16) & 0xff;
    const fg = (from >> 8) & 0xff;
    const fb = from & 0xff;
    const tr = (to >> 16) & 0xff;
    const tg = (to >> 8) & 0xff;
    const tb = to & 0xff;
    const r = Math.round(fr + (tr - fr) * t);
    const g = Math.round(fg + (tg - fg) * t);
    const b = Math.round(fb + (tb - fb) * t);
    return (r << 16) | (g << 8) | b;
  }

  /** 降低颜色亮度（按因子） */
  private dimColor(color: number, factor: number): number {
    const r = Math.round(((color >> 16) & 0xff) * factor);
    const g = Math.round(((color >> 8) & 0xff) * factor);
    const b = Math.round((color & 0xff) * factor);
    return (r << 16) | (g << 8) | b;
  }

  /** easeInCubic: t^3 */
  private easeInCubic(t: number): number {
    return t * t * t;
  }

  // ── 资源清理 ──────────────────────────────────────────

  clear(): void {
    this.fieldEffects.clear();
    for (const g of this.active) {
      g.clear();
      g.visible = false;
      g.mask = null;
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
