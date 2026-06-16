/**
 * 赛博鱼油 · 弹球物理引擎
 *
 * 职责：
 * - 管理双方小球的位置/速度
 * - 每 tick 按 dt 推进位移
 * - 圆形竞技场边界反弹（弹性碰撞）
 * - 两球碰撞检测与响应
 *
 * 参数（来自设计文档）：
 * - 基准速度：200 px/s
 * - 碰撞弹力系数：0.9
 * - 球半径：36px（视觉）→ 碰撞半径 40px（含光环）
 * - 竞技场半径：280（逻辑单位，圆心在画布中心）
 */

export interface BallPhysics {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;       // 碰撞半径
  speed: number;        // 当前速率
}

export interface PhysicsConfig {
  canvasWidth: number;
  canvasHeight: number;
  baseSpeed: number;    // 基准速率 px/s
  restitution: number;  // 弹性系数
  ballRadius: number;
  /** 圆形竞技场半径（逻辑单位），圆心固定在 (canvasWidth/2, canvasHeight/2） */
  arenaRadius: number;
}

const DEFAULT_CONFIG: PhysicsConfig = {
  canvasWidth: 1280,
  canvasHeight: 720,
  baseSpeed: 200,
  restitution: 0.9,
  ballRadius: 40,
  arenaRadius: 280,   // 直径 560 ≈ 占 1280×720 的中心圆形区域
};

export interface CollisionEvent {
  type: 'wall' | 'ball';
  ballIds: string[];          // 参与碰撞的球
  position: { x: number; y: number };  // 碰撞位置
}

export class PhysicsEngine {
  readonly config: PhysicsConfig;
  private balls = new Map<string, BallPhysics>();

  constructor(config?: Partial<PhysicsConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ═══════════════════════════════════════════════════
  //  公开方法
  // ═══════════════════════════════════════════════════

  /** 注册小球 */
  addBall(id: string, x: number, y: number, vx?: number, vy?: number): void {
    // 初始速度：随机方向 + 基准速率
    const angle = Math.random() * Math.PI * 2;
    const speed = this.config.baseSpeed;
    this.balls.set(id, {
      id,
      x, y,
      vx: vx ?? Math.cos(angle) * speed,
      vy: vy ?? Math.sin(angle) * speed,
      radius: this.config.ballRadius,
      speed: speed,
    });
  }

  /** 移除小球 */
  removeBall(id: string): void {
    this.balls.delete(id);
  }

  /** 获取小球状态 */
  getBall(id: string): BallPhysics | undefined {
    return this.balls.get(id);
  }

  /** 所有小球快照（只读副本） */
  getAllBalls(): BallPhysics[] {
    return Array.from(this.balls.values()).map(b => ({ ...b }));
  }

  /**
   * 推进一帧物理
   * @param dt 帧间隔（秒）
   * @returns 本帧发生的碰撞事件列表
   */
  tick(dt: number): CollisionEvent[] {
    const events: CollisionEvent[] = [];
    const { canvasWidth, canvasHeight, ballRadius } = this.config;

    // 1. 推进所有球的位置
    for (const [, ball] of this.balls) {
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      ball.speed = Math.sqrt(ball.vx ** 2 + ball.vy ** 2);
    }

    // 2. 圆形竞技场边界反弹（球在圆内弹跳）
    const cx = canvasWidth / 2;   // 圆心 X
    const cy = canvasHeight / 2;  // 圆心 Y
    const arenaR = this.config.arenaRadius;
    for (const [, ball] of this.balls) {
      // 球心到竞技场圆心的距离
      const dx = ball.x - cx;
      const dy = ball.y - cy;
      const distFromCenter = Math.sqrt(dx * dx + dy * dy);
      // 球碰到圆边界
      if (distFromCenter + ballRadius > arenaR) {
        // 法向量（从圆心指向球）
        const nx = dx / distFromCenter;
        const ny = dy / distFromCenter;
        // 将球推回圆内
        ball.x = cx + nx * (arenaR - ballRadius);
        ball.y = cy + ny * (arenaR - ballRadius);
        // 反射速度（v' = v - 2(v·n)n），只改方向不改速率
        const dot = ball.vx * nx + ball.vy * ny;
        ball.vx -= 2 * dot * nx;
        ball.vy -= 2 * dot * ny;
        // 碰撞只反射方向，速度大小仅由技能改变

        events.push({
          type: 'wall',
          ballIds: [ball.id],
          position: { x: ball.x, y: ball.y },
        });
      }
    }

    // 3. 球球碰撞检测
    const ballList = Array.from(this.balls.values());
    for (let i = 0; i < ballList.length; i++) {
      for (let j = i + 1; j < ballList.length; j++) {
        const a = ballList[i];
        const b = ballList[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = a.radius + b.radius;

        if (dist < minDist && dist > 0) {
          // 分离两球（避免重叠）
          const overlap = minDist - dist;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * (overlap / 2);
          a.y -= ny * (overlap / 2);
          b.x += nx * (overlap / 2);
          b.y += ny * (overlap / 2);

          // 弹性碰撞响应（法向分量交换），碰撞后恢复原速率
          const rest = this.config.restitution;
          const dvx = a.vx - b.vx;
          const dvy = a.vy - b.vy;
          const dvn = dvx * nx + dvy * ny;

          if (dvn > 0) {
            // 保存碰撞前速率
            const speedA = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
            const speedB = Math.sqrt(b.vx * b.vx + b.vy * b.vy);

            const impulse = dvn * (1 + rest) / 2;
            a.vx -= impulse * nx;
            a.vy -= impulse * ny;
            b.vx += impulse * nx;
            b.vy += impulse * ny;

            // 恢复原速率（只改方向不改速度大小，速度仅由技能改变）
            const newSpeedA = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
            const newSpeedB = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
            if (newSpeedA > 0) {
              a.vx = (a.vx / newSpeedA) * speedA;
              a.vy = (a.vy / newSpeedA) * speedA;
            }
            if (newSpeedB > 0) {
              b.vx = (b.vx / newSpeedB) * speedB;
              b.vy = (b.vy / newSpeedB) * speedB;
            }
          }

          a.speed = Math.sqrt(a.vx ** 2 + a.vy ** 2);
          b.speed = Math.sqrt(b.vx ** 2 + b.vy ** 2);

          events.push({
            type: 'ball',
            ballIds: [a.id, b.id],
            position: {
              x: (a.x + b.x) / 2,
              y: (a.y + b.y) / 2,
            },
          });
        }
      }
    }

    return events;
  }

  /** 清理所有小球 */
  clear(): void {
    this.balls.clear();
  }
}
