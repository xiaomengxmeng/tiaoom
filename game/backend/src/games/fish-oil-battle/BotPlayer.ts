/**
 * BotPlayer - 测试模式中的 AI 玩家
 *
 * 继承 RoomPlayer，但重写 emit 为空实现（bot 没有真实 WebSocket 连接）。
 * Bot 玩家会自动选择武器，技能由后端能量满自动触发。
 */

import { RoomPlayer, PlayerRole, PlayerStatus } from 'tiaoom';

export class BotPlayer extends RoomPlayer {
  constructor(index: number) {
    super({
      id: `bot_${index}`,
      name: `Bot ${index}`,
      role: PlayerRole.player,
    });
    this.isReady = true;
    this.status = PlayerStatus.online;
  }

  /**
   * 重写 emit：Bot 不发送 WebSocket 消息
   * 只记录关键事件到控制台用于调试
   */
  emit(type: string, data?: any): boolean {
    if (type === 'command' && data?.type === 'weapon_confirmed') {
      console.log(`[Bot] ${this.name} 武器确认: ${data.data?.weaponName}`);
    }
    if (type === 'status') {
      console.log(`[Bot] ${this.name} 状态变更: ${data}`);
    }
    return false;
  }
}
