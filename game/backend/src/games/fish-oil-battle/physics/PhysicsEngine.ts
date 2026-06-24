/**
 * 赛博鱼油 · 弹球物理引擎
 *
 * 职责：
 * - 管理双方小球的位置/速度
 * - 每 tick 按 dt 推进位移
 * - 圆形/矩形/六边形竞技场边界反弹（弹性碰撞）
 * - 两球碰撞检测与响应
 *
 * 参数（来自设计文档）：
 * - 基准速度：200 px/s
 * - 碰撞弹力系数：0.9
 * - 球半径：36px（视觉）→ 碰撞半径 40px（含光环）
 * - 竞技场半径：280（逻辑单位，圆心在画布中心）
 */

import { ArenaShape } from '../config/GameEnums';

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
  /** 竞技场形状 */
  arenaShape: ArenaShape;
  /** 圆形/六边形：竞技场半径（逻辑单位），圆心固定在 (canvasWidth/2, canvasHeight/2） */
  arenaRadius: number;
  /** 矩形：半宽（逻辑单位） */
  arenaHalfW?: number;
  /** 矩形：半高（逻辑单位） */
  arenaHalfH?: number;
}

const DEFAULT_CONFIG: PhysicsConfig = {
  canvasWidth: 1280,
  canvasHeight: 720,
  baseSpeed: 200,
  restitution: 0.9,
  ballRadius: 40,
  arenaShape: ArenaShape.CIRCLE,
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

    // 2. 竞技场边界反弹（根据形状分派） */
    const cx = canvasWidth / 2;
    const cy = canvasHeight / 2;
    const shape = this.config.arenaShape;

    for (const [, ball] of this.balls) {
      const collided = shape === ArenaShape.RECT
        ? this.resolveRectWall(ball, cx, cy, ballRadius, events)
        : shape === ArenaShape.HEXAGON
          ? this.resolveHexagonWall(ball, cx, cy, ballRadius, events)
          : this.resolveCircleWall(ball, cx, cy, ballRadius, events);
      // collided 已经通过 resolve* 方法 push 了事件
      void collided;
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

  // ═══════════════════════════════════════════════════
  //  边界碰撞子方法（按形状分派）
  // ═══════════════════════════════════════════════════

  /** 圆形边界反弹 */
  private resolveCircleWall(
    ball: BallPhysics, cx: number, cy: number,
    ballRadius: number, events: CollisionEvent[],
  ): boolean {
    const arenaR = this.config.arenaRadius;
    const dx = ball.x - cx;
    const dy = ball.y - cy;
    const distFromCenter = Math.sqrt(dx * dx + dy * dy);
    if (distFromCenter + ballRadius > arenaR) {
      const nx = dx / distFromCenter;
      const ny = dy / distFromCenter;
      ball.x = cx + nx * (arenaR - ballRadius);
      ball.y = cy + ny * (arenaR - ballRadius);
      const dot = ball.vx * nx + ball.vy * ny;
      ball.vx -= 2 * dot * nx;
      ball.vy -= 2 * dot * ny;
      events.push({ type: 'wall', ballIds: [ball.id], position: { x: ball.x, y: ball.y } });
      return true;
    }
    return false;
  }

  /** 矩形边界反弹（AABB 边界，法线沿坐标轴） */
  private resolveRectWall(
    ball: BallPhysics, cx: number, cy: number,
    ballRadius: number, events: CollisionEvent[],
  ): boolean {
    const hw = this.config.arenaHalfW ?? this.config.arenaRadius;
    const hh = this.config.arenaHalfH ?? this.config.arenaRadius;
    const left = cx - hw + ballRadius;
    const right = cx + hw - ballRadius;
    const top = cy - hh + ballRadius;
    const bottom = cy + hh - ballRadius;

    let hit = false;
    if (ball.x < left) { ball.x = left; ball.vx = Math.abs(ball.vx); hit = true; }
    if (ball.x > right) { ball.x = right; ball.vx = -Math.abs(ball.vx); hit = true; }
    if (ball.y < top) { ball.y = top; ball.vy = Math.abs(ball.vy); hit = true; }
    if (ball.y > bottom) { ball.y = bottom; ball.vy = -Math.abs(ball.vy); hit = true; }

    if (hit) {
      events.push({ type: 'wall', ballIds: [ball.id], position: { x: ball.x, y: ball.y } });
    }
    return hit;
  }

  /** 正六边形边界反弹（6 条边，法向量分别为 0°/60°/120°/180°/240°/300°） */
  private resolveHexagonWall(
    ball: BallPhysics, cx: number, cy: number,
    ballRadius: number, events: CollisionEvent[],
  ): boolean {
    const r = this.config.arenaRadius;
    // 六边形内切圆半径 = r * cos(30°) = r * sqrt(3)/2
    const innerR = r * Math.sqrt(3) / 2;

    // 六边形 6 条边的外法线（从中心指向外，30° 间隔，起始 0° 即右侧）
    const edgeNormals = [
      { nx: 1, ny: 0 },                           // 0°   右
      { nx: 0.5, ny: Math.sqrt(3) / 2 },           // 60°  右下
      { nx: -0.5, ny: Math.sqrt(3) / 2 },          // 120° 左下
      { nx: -1, ny: 0 },                           // 180° 左
      { nx: -0.5, ny: -Math.sqrt(3) / 2 },         // 240° 左上
      { nx: 0.5, ny: -Math.sqrt(3) / 2 },          // 300° 右上
    ];
    // 每条边到中心的距离 = innerR（正六边形的边到中心垂直距离）
    const edgeDist = innerR - ballRadius;

    // 将球心转换到中心坐标系
    const dx = ball.x - cx;
    const dy = ball.y - cy;

    let hit = false;
    let deepestIdx = -1;
    let deepestPenetration = -Infinity;

    // 检查每条边：球心沿法线方向的投影超过边距即越界
    for (let i = 0; i < 6; i++) {
      const { nx, ny } = edgeNormals[i];
      const proj = dx * nx + dy * ny; // 球心沿法线的投影距离
      if (proj > edgeDist) {
        const pen = proj - edgeDist;
        if (pen > deepestPenetration) {
          deepestPenetration = pen;
          deepestIdx = i;
        }
        hit = true;
      }
    }

    if (hit && deepestIdx >= 0) {
      // 沿最深穿透边的法线推回
      const { nx, ny } = edgeNormals[deepestIdx];
      ball.x -= nx * deepestPenetration;
      ball.y -= ny * deepestPenetration;
      // 反射速度
      const dot = ball.vx * nx + ball.vy * ny;
      if (dot > 0) {
        ball.vx -= 2 * dot * nx;
        ball.vy -= 2 * dot * ny;
      }
      events.push({ type: 'wall', ballIds: [ball.id], position: { x: ball.x, y: ball.y } });
    }
    return hit;
  }

  /**
   * 修改指定球的速度（外部系统调用，如全局彩蛋效果）
   * @param playerId 玩家/球 ID
   * @param newSpeed 新的速率
   * @param newAngle 新的角度（弧度，可选；不传则保持原方向）
   */
  modifyBallSpeed(playerId: string, newSpeed: number, newAngle?: number): void {
    const ball = this.balls.get(playerId);
    if (!ball) return;

    if (newAngle !== undefined) {
      ball.vx = Math.cos(newAngle) * newSpeed;
      ball.vy = Math.sin(newAngle) * newSpeed;
    } else {
      const oldSpeed = ball.speed;
      if (oldSpeed > 0) {
        const ratio = newSpeed / oldSpeed;
        ball.vx *= ratio;
        ball.vy *= ratio;
      }
    }
    ball.speed = newSpeed;
  }

  /** 清理所有小球 */
  clear(): void {
    this.balls.clear();
  }
}
