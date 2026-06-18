/**
 * 赛博鱼油 · 物理查询适配器
 *
 * 将 PhysicsEngine + BattleState 适配为 IPhysicsQuery，
 * 让武器代码完全不依赖 PhysicsEngine 的具体实现。
 */

import type { AliveOpponent, IPhysicsQuery } from '../core/IWeapon';
import type { PlayerState } from '../core/types';

export interface PhysicsQueryDeps {
  /** 获取所有球的快照（来自 PhysicsEngine.getAllBalls()） */
  getAllBalls(): Array<{ id: string; x: number; y: number }>;
  /** 获取玩家状态 */
  getPlayer(id: string): PlayerState | undefined;
  /** 获取所有存活对手 */
  getAllAliveOpponents(selfId: string): PlayerState[];
  /** 竞技场信息 */
  getArenaCenter(): { x: number; y: number };
  getArenaRadius(): number;
}

export class PhysicsAdapter implements IPhysicsQuery {
  constructor(private deps: PhysicsQueryDeps) {}

  getAliveOpponentsInRadius(
    selfId: string,
    x: number,
    y: number,
    radius: number,
  ): AliveOpponent[] {
    const result: AliveOpponent[] = [];
    const balls = this.deps.getAllBalls();
    for (const ball of balls) {
      if (ball.id === selfId) continue;
      const dx = ball.x - x;
      const dy = ball.y - y;
      if (Math.sqrt(dx * dx + dy * dy) <= radius) {
        const ps = this.deps.getPlayer(ball.id);
        if (ps && ps.hp > 0) {
          result.push({ id: ball.id, x: ball.x, y: ball.y, hp: ps.hp, name: ps.name });
        }
      }
    }
    return result;
  }

  getSelfPosition(playerId: string): { x: number; y: number } | undefined {
    const balls = this.deps.getAllBalls();
    const ball = balls.find(b => b.id === playerId);
    return ball ? { x: ball.x, y: ball.y } : undefined;
  }

  getRandomAliveOpponent(selfId: string): AliveOpponent | undefined {
    const opponents = this.getAllAliveOpponents(selfId);
    if (opponents.length === 0) return undefined;
    return opponents[Math.floor(Math.random() * opponents.length)];
  }

  getAllAliveOpponents(selfId: string): AliveOpponent[] {
    const balls = this.deps.getAllBalls();
    const result: AliveOpponent[] = [];
    for (const ball of balls) {
      if (ball.id === selfId) continue;
      const ps = this.deps.getPlayer(ball.id);
      if (ps && ps.hp > 0) {
        result.push({ id: ball.id, x: ball.x, y: ball.y, hp: ps.hp, name: ps.name });
      }
    }
    return result;
  }

  getArenaCenter(): { x: number; y: number } {
    return this.deps.getArenaCenter();
  }

  getArenaRadius(): number {
    return this.deps.getArenaRadius();
  }
}
