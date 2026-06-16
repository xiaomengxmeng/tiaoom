/** 从后端接收的单帧物理状态 */
export interface PhysicsState {
  tick: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
}

/** 插值后的平滑状态（用于渲染） */
export interface InterpolatedState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 当前速度大小（用于拉伸变形） */
  speed: number;
  /** 移动方向角度（弧度） */
  rotation: number;
}

/**
 * 前端物理插值系统
 * - 接收后端 20fps 广播状态
 * - 线性插值到 60fps 渲染帧
 * - 支持速度外推 + 新状态到达时修正
 */
export class PhysicsSystem {
  private states: Map<string, PhysicsState[]> = new Map();
  private renderTimeOffset = 0; // 渲染时间相对于最新 tick 的偏移（ms）

  /** 后端广播频率（ms），20fps = 50ms */
  private readonly TICK_INTERVAL = 50;

  /**
   * 更新某玩家的后端状态（由 WebSocket 事件驱动）
   */
  updateState(playerId: string, state: PhysicsState): void {
    let buf = this.states.get(playerId);
    if (!buf) {
      buf = [];
      this.states.set(playerId, buf);
    }
    buf.push(state);
    // 只保留最近 4 帧（200ms 内）
    if (buf.length > 4) buf.splice(0, buf.length - 4);
  }

  /**
   * 插值获取某玩家当前渲染帧的平滑状态
   * @param playerId 玩家 ID
   * @param renderTime 当前渲染时间戳（performance.now()）
   * @returns 插值后的状态，若无可用的状态则返回 null
   */
  interpolate(playerId: string, _renderTime: number): InterpolatedState | null {
    const buf = this.states.get(playerId);
    if (!buf || buf.length === 0) return null;

    // 单帧情况：直接返回
    if (buf.length === 1) {
      const s = buf[0];
      return this.buildInterpolated(s, s);
    }

    // 双帧插值
    const newest = buf[buf.length - 1];
    const oldest = buf[buf.length - 2];

    // 用 tick 差计算插值因子 t ∈ [0, 1]
    const tickDiff = newest.tick - oldest.tick;
    if (tickDiff <= 0) {
      return this.buildInterpolated(newest, newest);
    }

    // 假设渲染时间在两个 tick 之间
    // 用 renderTimeOffset 追踪插值进度
    const alpha = this.clamp(this.renderTimeOffset / this.TICK_INTERVAL, 0, 1);

    const x = this.lerp(oldest.x, newest.x, alpha);
    const y = this.lerp(oldest.y, newest.y, alpha);
    const vx = this.lerp(oldest.vx, newest.vx, alpha);
    const vy = this.lerp(oldest.vy, newest.vy, alpha);

    return {
      x, y,
      vx, vy,
      speed: Math.sqrt(vx * vx + vy * vy),
      rotation: Math.atan2(vy, vx),
    };
  }

  /**
   * 基于真实时间戳的插值（推荐用于生产）
   * 需要在 updateState 时记录 timestamp
   */
  interpolateByTime(playerId: string, now: number): InterpolatedState | null {
    const buf = this.states.get(playerId);
    if (!buf || buf.length < 2) {
      if (buf && buf.length === 1) {
        const s = buf[0];
        return this.buildInterpolated(s, s);
      }
      return null;
    }

    // 找到 now 所在的两帧之间
    let older = buf[0];
    let newer = buf[buf.length - 1];
    for (let i = buf.length - 1; i >= 0; i--) {
      if (buf[i].tick * this.TICK_INTERVAL <= now) {
        older = buf[i];
        if (i + 1 < buf.length) newer = buf[i + 1];
        break;
      }
    }

    const olderTime = older.tick * this.TICK_INTERVAL;
    const newerTime = newer.tick * this.TICK_INTERVAL;
    const duration = newerTime - olderTime;
    if (duration <= 0) return this.buildInterpolated(newer, newer);

    const alpha = this.clamp((now - olderTime) / duration, 0, 1);
    const x = this.lerp(older.x, newer.x, alpha);
    const y = this.lerp(older.y, newer.y, alpha);
    const vx = this.lerp(older.vx, newer.vx, alpha);
    const vy = this.lerp(older.vy, newer.vy, alpha);

    return {
      x, y, vx, vy,
      speed: Math.sqrt(vx * vx + vy * vy),
      rotation: Math.atan2(vy, vx),
    };
  }

  /** 推进渲染时间（每渲染帧调用） */
  advanceRenderTime(dtMs: number): void {
    this.renderTimeOffset += dtMs;
  }

  /** 重置渲染时间偏移 */
  resetRenderTime(): void {
    this.renderTimeOffset = 0;
  }

  /** 获取某玩家最新一帧的原始状态（用于非战斗阶段的静态渲染） */
  getLastState(playerId: string): PhysicsState | null {
    const buf = this.states.get(playerId);
    if (!buf || buf.length === 0) return null;
    return buf[buf.length - 1];
  }

  /**
   * 对所有已存储的物理状态按偏移感知方式重新映射（canvas resize 时调用）
   * 公式: newPos = (oldPos - oldOffset) * scaleRatio + newOffset
   */
  rescaleWithOffset(oldOX: number, oldOY: number, scaleRatio: number, newOX: number, newOY: number): void {
    for (const [, buf] of this.states) {
      for (const state of buf) {
        state.x = (state.x - oldOX) * scaleRatio + newOX;
        state.y = (state.y - oldOY) * scaleRatio + newOY;
        state.vx *= scaleRatio;
        state.vy *= scaleRatio;
      }
    }
  }

  /** 清除某玩家状态 */
  removePlayer(playerId: string): void {
    this.states.delete(playerId);
  }

  /** 清除所有状态 */
  clear(): void {
    this.states.clear();
    this.renderTimeOffset = 0;
  }

  // ─── 工具方法 ───────────────────────────────────────

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
  }

  private buildInterpolated(_a: PhysicsState, b: PhysicsState): InterpolatedState {
    return {
      x: b.x, y: b.y,
      vx: b.vx, vy: b.vy,
      speed: Math.sqrt(b.vx * b.vx + b.vy * b.vy),
      rotation: Math.atan2(b.vy, b.vx),
    };
  }
}
