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

/** 动态障碍物（硬化防火墙等场地装置） */
export interface PhysicsObstacle {
  x: number;
  y: number;
  /** 碰撞半径（逻辑 px） */
  radius: number;
  /** 碰撞矩形宽度（逻辑 px），方案 B */
  width?: number;
  /** 碰撞矩形高度（逻辑 px） */
  height?: number;
  /** 障碍物所属玩家 ID（用于碰撞时追溯伤害来源 + 跳过创造者自己的碰撞） */
  sourceId: string;
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
  type: 'wall' | 'ball' | 'obstacle';
  ballIds: string[];          // 参与碰撞的球
  position: { x: number; y: number };  // 碰撞位置
  /** obstacle 碰撞时：障碍物所属玩家 ID（用于伤害追溯） */
  sourceId?: string;
}

export class PhysicsEngine {
  readonly config: PhysicsConfig;
  private balls = new Map<string, BallPhysics>();
  /** 每帧刷新一次的动态障碍物（由 WeaponScheduler 通过 setObstacles 注入） */
  private obstacles: PhysicsObstacle[] = [];

  constructor(config?: Partial<PhysicsConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 设置本帧的活跃障碍物（每次 tick 前调用） */
  setObstacles(obs: PhysicsObstacle[]): void {
    this.obstacles = obs;
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

    // 1.5 动态障碍物碰撞（硬化防火墙等场地装置反弹角色）
    for (const obs of this.obstacles) {
      for (const [, ball] of this.balls) {
        // 创造者不碰撞自己的障碍物
        if (ball.id === obs.sourceId) continue;

        // 矩形碰撞检测（方案 B：width/height 存在时使用 AABB）
        if (obs.width !== undefined && obs.height !== undefined && obs.width > 0 && obs.height > 0) {
          const halfW = obs.width / 2;
          const halfH = obs.height / 2;
          const closestX = Math.max(obs.x - halfW, Math.min(ball.x, obs.x + halfW));
          const closestY = Math.max(obs.y - halfH, Math.min(ball.y, obs.y + halfH));
          const dx = ball.x - closestX;
          const dy = ball.y - closestY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < ball.radius && dist > 0) {
            // 法向量（从最近点指向球心）
            const nx = dx / dist;
            const ny = dy / dist;
            // 将球推出障碍物
            ball.x = closestX + nx * ball.radius;
            ball.y = closestY + ny * ball.radius;
            // 反射速度
            const dot = ball.vx * nx + ball.vy * ny;
            ball.vx -= 2 * dot * nx;
            ball.vy -= 2 * dot * ny;

            events.push({
              type: 'obstacle',
              ballIds: [ball.id],
              position: { x: ball.x, y: ball.y },
              sourceId: obs.sourceId,
            });
          }
        } else {
          // 原有圆形碰撞检测
          const dx = ball.x - obs.x;
          const dy = ball.y - obs.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const collisionDist = ball.radius + obs.radius;

          if (dist < collisionDist && dist > 0) {
            // 法向量（从障碍物圆心指向球）
            const nx = dx / dist;
            const ny = dy / dist;
            // 将球推出障碍物
            ball.x = obs.x + nx * collisionDist;
            ball.y = obs.y + ny * collisionDist;
            // 反射速度（v' = v - 2(v·n)n），只改方向不改速率
            const dot = ball.vx * nx + ball.vy * ny;
            ball.vx -= 2 * dot * nx;
            ball.vy -= 2 * dot * ny;

            events.push({
              type: 'obstacle',
              ballIds: [ball.id],
              position: { x: ball.x, y: ball.y },
              sourceId: obs.sourceId,
            });
          }
        }
      }
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
