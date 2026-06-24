// /**
//  * [特效名称] 渲染器模板
//  *
//  * 使用方法：
//  * 1. 复制此文件到 renderer/entities/ 目录并重命名
//  * 2. 实现 TODO 标记的方法
//  * 3. 在 EffectRenderer.ts 中集成（添加成员变量、公开 API、clear/destroy 调用）
//  * 4. 在 EffectRenderer.ts 中添加 buildXxxVisualCfg() 私有方法（从 WEAPON_RANGE_CONFIG 构建配置）
//  *    公开 API 签名示例：
//  *      triggerXxx(x, y, ..., themeColor: number, visualCfg?: XxxVisualConfig): void {
//  *        const dataCfg = this.buildXxxVisualCfg();
//  *        const cfg: XxxVisualConfig = { ...dataCfg, ...visualCfg };
//  *        const ef = this.yourRenderer.trigger(x, y, ..., themeColor, cfg);
//  *        if (ef) this.activeEffects.push(ef);
//  *      }
//  * 5. 在 CyberFishRenderer.ts 的 triggerSkillEffect 中处理新事件类型
//  *    **重要**：始终传递 themeColor ?? config.factionColor
//  * 6. 在 useFishOilBattle.ts 的 onVisualEvent 中路由事件
//  *
//  * ⚠️ 数据驱动要求：
//  * - 所有视觉参数必须通过 config 参数传入，禁止文件顶部 const 硬编码
//  * - config 默认值来自 EffectRenderer.buildXxxVisualCfg()，不来自本文件
//  * - buildXxxVisualCfg() 从 WEAPON_RANGE_CONFIG 读取，与后端数值保持一致
//  *
//  * 常见特效模式：
//  * - 飞行弹道：特效从起点沿方向飞行，用 angle + speed + maxDist
//  * - 扩散圆环：从触发点向外扩散的圆环渐入渐出
//  * - 场地持续：固定位置持续绘制，需持久数据结构
//  * - 追踪实体：跟随玩家/投射物移动
//  */
//
// import * as PIXI from 'pixi.js';
// import type { ActiveEffect } from './VisualEffectUtils';
//
// /** 你的特效视觉配置（从 EffectRenderer.buildXxxVisualCfg 构建） */
// export interface YourEffectVisualConfig {
//   /** 主色（由 EffectRenderer 从 themeColor 传入） */
//   primaryColor?: number;
//   /** 发光色 */
//   glowColor?: number;
//   /** 特效最大半径（逻辑 px） */
//   maxRadius?: number;
//   /** 扩散/飞行持续时间（ms） */
//   expandDurationMs?: number;
//   /** 是否爆发模式 */
//   isBurst?: boolean;
//   // TODO: 添加武器特有视觉参数（从 WeaponRangeConfig 读取）
//   // 示例（飞行弹道）:
//   // flightSpeed?: number;
//   // arcBow?: number;
//   // bladeHalfWidth?: number;
// }
//
// export class YourEffectRenderer {
//   private container: PIXI.Container;
//   private scale = 1;
//   private canvasW: number;
//   private canvasH: number;
//
//   // ── 对象池 ────────────────────────────────────────────
//   private pool: PIXI.Graphics[] = [];
//   private active: Set<PIXI.Graphics> = new Set();
//
//   // TODO: 添加其他持久数据结构（如持续效果的 Map）
//
//   /**
//    * @param container 分层容器（entity/field/hologram）
//    * @param canvasW 画布宽度
//    * @param canvasH 画布高度
//    * @param prePoolCount 预创建对象数量
//    */
//   constructor(container: PIXI.Container, canvasW: number, canvasH: number, prePoolCount = 10) {
//     this.container = container;
//     this.canvasW = canvasW;
//     this.canvasH = canvasH;
//
//     // 初始化对象池
//     for (let i = 0; i < prePoolCount; i++) {
//       const g = new PIXI.Graphics();
//       g.visible = false;
//       container.addChild(g);
//       this.pool.push(g);
//     }
//   }
//
//   /**
//    * 同步缩放因子（由 EffectRenderer.setScale 驱动）
//    */
//   setScale(scale: number, canvasW: number, canvasH: number): void {
//     this.scale = scale;
//     this.canvasW = canvasW;
//     this.canvasH = canvasH;
//   }
//
//   // ── 对象池操作 ─────────────────────────────────────
//
//   /** 从对象池获取一个 Graphics */
//   private acquire(): PIXI.Graphics | null {
//     for (const g of this.pool) {
//       if (!this.active.has(g)) {
//         this.active.add(g);
//         g.visible = true;
//         return g;
//       }
//     }
//     // 池耗尽，创建新的
//     const g = new PIXI.Graphics();
//     this.container.addChild(g);
//     this.pool.push(g);
//     this.active.add(g);
//     return g;
//   }
//
//   /** 归还 Graphics 到对象池 */
//   private release(g: PIXI.Graphics): void {
//     g.clear();
//     g.visible = false;
//     this.active.delete(g);
//   }
//
//   /**
//    * 触发特效
//    * @param x, y 画布坐标（已由 CyberFishRenderer.toCanvas 转换）
//    * @param config 视觉配置（来自 EffectRenderer.buildXxxVisualCfg()）
//    * @param themeColor 玩家主题色
//    * @returns ActiveEffect[] 用于生命周期管理
//    *
//    * ⚠️ 所有视觉参数必须从 config 读取，不硬编码：
//    * const speed = config?.flightSpeed ?? 300;  ← 从 config 取
//    * // 而非: const FLIGHT_SPEED = 300;          ← 禁止
//    */
//   trigger(
//     x: number,
//     y: number,
//     config?: YourEffectVisualConfig,
//     themeColor?: number,
//   ): ActiveEffect[] {
//     const effects: ActiveEffect[] = [];
//
//     const s = this.scale;
//     const offsetX = (this.canvasW - this.canvasW * s) / 2;
//     const offsetY = (this.canvasH - this.canvasH * s) / 2;
//
//     // 从 config 读取所有参数（来自 buildXxxVisualCfg → WEAPON_RANGE_CONFIG）
//     const primary = themeColor ?? config?.primaryColor ?? 0xFFFFFF;
//     const maxRadius = (config?.maxRadius ?? 200) * s;
//     const duration = config?.expandDurationMs ?? 1500;
//     const isBurst = config?.isBurst ?? false;
//
//     // TODO: 实现特效逻辑
//     const count = isBurst ? 3 : 1;
//     for (let i = 0; i < count; i++) {
//       const g = this.acquire();
//       if (!g) continue;
//
//       const delayMs = isBurst ? i * 120 : 0;
//       const sx = x * s + offsetX;
//       const sy = y * s + offsetY;
//
//       const ef: ActiveEffect = {
//         type: 'your_effect',
//         container: g as unknown as PIXI.Container,
//         life: delayMs,
//         maxLife: duration + delayMs,
//         onUpdate: (ef, _dt) => {
//           if (ef.life < delayMs) return;
//           const localLife = ef.life - delayMs;
//           const localMax = ef.maxLife - delayMs;
//           const t = Math.min(localLife / localMax, 1);
//
//           // TODO: 根据进度绘制特效帧
//           this.drawFrame(g, t, sx, sy, maxRadius, primary);
//         },
//         onDecay: (_ef) => {
//           this.release(g);
//         },
//       };
//       ef.container.visible = true;
//       effects.push(ef);
//     }
//
//     return effects;
//   }
//
//   // ══════════════════════════════════════════════════════
//   //  飞行弹道绘制示例（如需飞行特效，参考光学斩击）
//   // ══════════════════════════════════════════════════════
//
//   /**
//    * 飞行弹道特效 - 数据驱动版本
//    *
//    * ⚠️ 所有参数从 config 读取，不硬编码
//    * config 由 EffectRenderer.buildXxxVisualCfg() 提供，最终来源是 WeaponRangeConfig
//    */
//   // triggerFlyingProjectile(
//   //   x: number, y: number,
//   //   angle: number, length: number,
//   //   themeColor: number,
//   //   isBurst: boolean,
//   //   config?: YourEffectVisualConfig,
//   // ): ActiveEffect | null {
//   //   const g = this.acquire();
//   //   if (!g) return null;
//   //
//   //   const s = this.scale;
//   //   const offsetX = (this.canvasW - this.canvasW * s) / 2;
//   //   const offsetY = (this.canvasH - this.canvasH * s) / 2;
//   //   const sx = x * s + offsetX;
//   //   const sy = y * s + offsetY;
//   //   const maxDist = length * s;
//   //
//   //   // 从 config 读取，默认值来自 WEAPON_RANGE_CONFIG
//   //   const flightSpeed = config?.flightSpeed ?? 300;
//   //   const trailLength = config?.trailLength ?? 12;
//   //
//   //   const flightDurMs = (maxDist / (flightSpeed * s)) * 1000;
//   //   const maxLife = isBurst ? 1000 : config?.expandDurationMs ?? 800;
//   //
//   //   return {
//   //     type: 'your_flying_effect',
//   //     container: g as unknown as PIXI.Container,
//   //     life: 0,
//   //     maxLife,
//   //     onUpdate: (ef, _dt) => {
//   //       const t = Math.min(ef.life / ef.maxLife, 1);
//   //       const flightT = Math.min(ef.life / flightDurMs, 1);
//   //       const cx = sx + Math.cos(angle) * maxDist * flightT;
//   //       const cy = sy + Math.sin(angle) * maxDist * flightT;
//   //
//   //       const fadeStart = flightDurMs / maxLife;
//   //       const alpha = t < fadeStart ? 0.9 : 0.9 * (1 - (t - fadeStart) / (1 - fadeStart));
//   //
//   //       g.clear();
//   //       this.drawFrame(g, t, cx, cy, angle, themeColor, alpha, config, s);
//   //     },
//   //     onDecay: () => this.release(g),
//   //   };
//   // }
//
//   // ── 绘制方法 ──────────────────────────────────────
//
//   private drawFrame(
//     g: PIXI.Graphics,
//     t: number,
//     x: number, y: number,
//     maxRadius: number,
//     color: number,
//   ): void {
//     // 透明度：前 20% 渐入，后 40% 渐出
//     let alpha: number;
//     if (t < 0.2) {
//       alpha = t / 0.2 * 0.9;
//     } else if (t > 0.6) {
//       alpha = (1 - (t - 0.6) / 0.4) * 0.9;
//     } else {
//       alpha = 0.9;
//     }
//
//     const radius = t * maxRadius;
//     const strokeWidth = 25 * this.scale;
//
//     g.clear();
//
//     // TODO: 绘制特效形状
//     g.circle(x, y, radius);
//     g.stroke({ color, width: strokeWidth, alpha });
//   }
//
//   // ── 资源清理 ──────────────────────────────────────
//
//   clear(): void {
//     for (const g of this.active) {
//       g.clear();
//       g.visible = false;
//     }
//     this.active.clear();
//     // TODO: 清理持久数据结构
//   }
//
//   destroy(): void {
//     this.clear();
//     for (const g of this.pool) {
//       g.destroy(true);
//     }
//     this.pool.length = 0;
//     // TODO: 销毁持久数据结构中的 Graphics
//   }
// }
