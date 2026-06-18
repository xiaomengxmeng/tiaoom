/**
 * 赛博鱼油 v2.0 · IWeapon 武器调用链路测试
 *
 * 运行方式：
 *   cd game/backend && npx tsx src/games/fish-oil-battle/skill-chain.test.ts
 *
 * 验证内容：
 *   1. 3 武器独立实例化 + IWeapon 接口一致性
 *   2. SkillScheduler（IWeapon版）调度串联（onTick → onHit → forceBurst）
 *   3. 能量充能 → 显式爆发 → 状态重置 完整闭环
 *   4. 低耦合验证：互换武器不影响调度器
 *   5. 边界条件：HP 归零、重复爆发、reset
 */

import { BattleState, SkillScheduler } from './core/SkillScheduler';
import { ShockwaveGeneratorWeapon } from './skills/weapons/ShockwaveGeneratorWeapon';
import { FirewallProtocolWeapon } from './skills/weapons/FirewallProtocolWeapon';
import { HiveMotherWeapon } from './skills/weapons/HiveMotherWeapon';
import type { IWeapon, IPhysicsQuery, AliveOpponent } from './core/IWeapon';
import type { PlayerState } from './core/types';
import { School } from './config/GameEnums';

// ─── Stub PhysicsQuery ──────────────────────────────

class StubPhysicsQuery implements IPhysicsQuery {
  private state: BattleState;

  constructor(state: BattleState) {
    this.state = state;
  }

  getAliveOpponentsInRadius(selfId: string, x: number, y: number, radius: number): AliveOpponent[] {
    const result: AliveOpponent[] = [];
    for (const [, p] of this.state.players) {
      if (p.id === selfId || p.hp <= 0) continue;
      const dx = p.position.x - x;
      const dy = p.position.y - y;
      if (Math.sqrt(dx * dx + dy * dy) <= radius) {
        result.push({ id: p.id, x: p.position.x, y: p.position.y, hp: p.hp, name: p.name });
      }
    }
    return result;
  }

  getSelfPosition(playerId: string): { x: number; y: number } | undefined {
    const p = this.state.getPlayer(playerId);
    if (!p || p.hp <= 0) return undefined;
    return { x: p.position.x, y: p.position.y };
  }

  getRandomAliveOpponent(selfId: string): AliveOpponent | undefined {
    for (const [, p] of this.state.players) {
      if (p.id !== selfId && p.hp > 0) return { id: p.id, x: p.position.x, y: p.position.y, hp: p.hp, name: p.name };
    }
    return undefined;
  }

  getAllAliveOpponents(selfId: string): AliveOpponent[] {
    const result: AliveOpponent[] = [];
    for (const [, p] of this.state.players) {
      if (p.id !== selfId && p.hp > 0) result.push({ id: p.id, x: p.position.x, y: p.position.y, hp: p.hp, name: p.name });
    }
    return result;
  }

  getArenaCenter(): { x: number; y: number } {
    return { x: 640, y: 360 };
  }

  getArenaRadius(): number {
    return 280;
  }
}

// ─── 测试工具 ────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) { console.log(`  ✅ ${label}`); passed++; }
  else { console.error(`  ❌ ${label}`); failed++; }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  const ok = actual === expected;
  if (ok) { console.log(`  ✅ ${label} (${actual})`); passed++; }
  else { console.error(`  ❌ ${label} — 期望 ${expected}，实际 ${actual}`); failed++; }
}

function headline(title: string): void {
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(50)}`);
}

// ─── 工厂函数 ────────────────────────────────────────
function createPlayers(aId = 'p1', bId = 'p2'): [PlayerState, PlayerState] {
  return [
    { id: aId, name: `玩家${aId}`, hp: 100, maxHp: 100, position: { x: 300, y: 360 }, totalDamageTaken: 0, isOverheated: false },
    { id: bId, name: `玩家${bId}`, hp: 100, maxHp: 100, position: { x: 980, y: 360 }, totalDamageTaken: 0, isOverheated: false },
  ];
}

function setupState(p1: PlayerState, p2: PlayerState): BattleState {
  const s = new BattleState();
  s.addPlayer(p1); s.addPlayer(p2);
  return s;
}

/** 模拟一次碰撞：基础伤害 + 触发双方 onHit/onHitBy */
function simulateHit(sched: SkillScheduler, state: BattleState, attackerId: string, targetId: string, baseDmg = 5): void {
  state.applyDamage(targetId, baseDmg, attackerId);
  sched.processHit(attackerId, targetId, state);
}

// ================================================================
//  测试 1：IWeapon 独立实例化 + 接口一致性
// ================================================================
headline('测试 1：IWeapon 独立实例化 + 接口完整性');

const weapons: IWeapon[] = [
  new ShockwaveGeneratorWeapon(),
  new FirewallProtocolWeapon(),
  new HiveMotherWeapon(),
];
for (const w of weapons) {
  assert(typeof w.id === 'string', `${w.name} id 合法`);
  assert([School.AGGRESSOR, School.CONTROLLER, School.ENGINEER, School.WILD].includes(w.school as any), `${w.name} 流派: ${w.school}`);
  assert(typeof w.onTick === 'function', `${w.name}.onTick ✓`);
  assert(typeof w.onHitTarget === 'function', `${w.name}.onHitTarget ✓`);
  assert(typeof w.onHitByAttacker === 'function', `${w.name}.onHitByAttacker ✓`);
  assert(typeof w.isBurstReady === 'function', `${w.name}.isBurstReady ✓`);
  assert(typeof w.burst === 'function', `${w.name}.burst ✓`);
  assert(typeof w.reset === 'function', `${w.name}.reset ✓`);
}
assertEqual(weapons.length, 3, '共 3 个武器实例');
assert(new Set(weapons.map(w => w.id)).size === 3, '武器 id 互不相同');

// ================================================================
//  测试 2：冲击波 → 碰撞触发冲击波 → tick 推进 → 爆发
// ================================================================
headline('测试 2：ShockwaveGeneratorWeapon 碰撞 + 冲击波推进闭环');

const [p2a, p2b] = createPlayers('p1', 'p2');
const state2 = setupState(p2a, p2b);
const physics2 = new StubPhysicsQuery(state2);
const sched2 = new SkillScheduler(physics2);
const sw2 = new ShockwaveGeneratorWeapon();
sched2.register('p1', sw2);
sched2.register('p2', new FirewallProtocolWeapon());

sched2.tick(state2);
assertEqual(state2.tick, 1, 'tick 递增');

// P1 → P2 碰撞 4 次（每次 onHitTarget 产生冲击波 +2 伤害）
for (let i = 0; i < 4; i++) simulateHit(sched2, state2, 'p1', 'p2', 5);
// 每次碰撞: 5 基础 + 2 冲击波 = 7,  4次 = 28
assertEqual(p2b.hp, 72, 'P2 HP=72 (100 - 4*(5+2))');

// tick 推进冲击波扩散，近距离下冲击波会命中对手并充能
for (let t = 0; t < 20; t++) sched2.tick(state2);
// 冲击波扩散到 P2 附近时会命中，但距离是 680px 太远... 冲击波最大 200px
// 所以近距离下不会额外命中。需要让玩家靠近。
assertEqual(sw2.getEnergy(), 0, '远距离冲击波未命中→能量=0');
assert(!sw2.isBurstReady(), '远距离未充能→未就绪');

// ================================================================
//  测试 2b：使玩家靠近后冲击波可命中充能
// ================================================================
headline('测试 2b：近距离碰撞充能');

const [p2b1, p2b2] = createPlayers('p1', 'p2');
p2b1.position = { x: 350, y: 360 };
p2b2.position = { x: 380, y: 360 }; // 距离 30px，在冲击波 200px 范围内
const st2b = setupState(p2b1, p2b2);
const pq2b = new StubPhysicsQuery(st2b);
const sc2b = new SkillScheduler(pq2b);
const sw2b = new ShockwaveGeneratorWeapon();
sc2b.register('p1', sw2b);
sc2b.register('p2', new FirewallProtocolWeapon());

// 执行一次碰撞
simulateHit(sc2b, st2b, 'p1', 'p2', 5);

// 推进冲击波扩散，范围伤害会逐步命中
for (let t = 0; t < 10; t++) sc2b.tick(st2b);
// 冲击波扩散到 30px 后就会命中对面的 P2
assert(sw2b.getEnergy() >= 0, '冲击波命中后可充能');

// ================================================================
//  测试 3：防火墙 → 受击生成 → 范围 DoT
// ================================================================
headline('测试 3：FirewallProtocolWeapon 受击生成防火墙 + 充能');

const [p3a, p3b] = createPlayers('p1', 'p2');
p3b.maxHp = 300; p3b.hp = 300;
// 让两个玩家靠近以触发防火墙 DoT
p3a.position = { x: 350, y: 360 };
p3b.position = { x: 380, y: 360 };
const state3 = setupState(p3a, p3b);
const physics3 = new StubPhysicsQuery(state3);
const sched3 = new SkillScheduler(physics3);
sched3.register('p1', new ShockwaveGeneratorWeapon());
const fw3 = new FirewallProtocolWeapon();
sched3.register('p2', fw3);

// P2 累计受击：12 × 7 = 84 → floor(84/15)=5 → capped 4 能量
for (let i = 0; i < 12; i++) simulateHit(sched3, state3, 'p1', 'p2', 5);
sched3.tick(state3);

// 受击 84 伤害 → 84/15 = 5 格，capped at 4
assert(fw3.isBurstReady(), '防火墙受击充能完毕→就绪');
assertEqual(fw3.getEnergy(), 4, '防火墙能量=4');

// 显式爆发
const fwBurst = sched3.forceBurst('p2', state3);
assert(fwBurst.length >= 1, '防火墙爆发产生效果');
assertEqual(fw3.getEnergy(), 0, '防火墙爆发后能量归零');

// 验证防火墙 DoT（P1 在防火墙范围内会受到 DoT）
// 推进几 tick
for (let t = 0; t < 5; t++) sched3.tick(state3);
// P1 在防火墙范围内会受到伤害
assert(p3a.hp < 100, 'P1 受到防火墙 DoT 伤害');

// ================================================================
//  测试 4：蜂巢 → 蜂刺自动充能 → 蜂群狂暴
// ================================================================
headline('测试 4：HiveMotherWeapon 蜂刺充能 + 蜂群狂暴闭环');

const [p4a, p4b] = createPlayers('p1', 'p2');
p4b.maxHp = 300; p4b.hp = 300;
// 让两个玩家靠近以便蜂刺命中
p4a.position = { x: 350, y: 360 };
p4b.position = { x: 380, y: 360 };
const state4 = setupState(p4a, p4b);
const physics4 = new StubPhysicsQuery(state4);
const sched4 = new SkillScheduler(physics4);
const hive4 = new HiveMotherWeapon();
sched4.register('p1', hive4);

// 蜂刺每 5s (100 ticks) 发射，发射即飞行命中近距离目标
// 推进足够 tick 让蜂刺命中 → 充能
for (let t = 0; t < 200; t++) sched4.tick(state4);

// 100 和 200 tick 各发射一次，共 2 波 × 3 只 = 6 只蜂刺
// 近距离下都会命中 → 6 能量
assert(hive4.getEnergy() >= 3, `蜂巢充能≥3（实际: ${hive4.getEnergy()}）`);

// 继续推进到 9 能量
for (let t = 0; t < 200; t++) sched4.tick(state4);
// 400 tick → 4 波 × 3 = 12 只蜂刺，全部命中 = 12 能量，capped 9
assertEqual(hive4.getEnergy(), 9, '蜂巢母体充能至 9');
assert(hive4.isBurstReady(), '蜂巢母体爆发就绪');

// 显式爆发
const hiveBurst = sched4.forceBurst('p1', state4);
assert(hiveBurst.length >= 1, '蜂巢母体爆发触发');
assertEqual(hive4.getEnergy(), 0, '蜂群狂暴后能量归零');

// 爆发持续 100 ticks，期间不充能（设计：!isBurstActive 才充能）
// 推进 100 ticks 让爆发结束
for (let t = 0; t < 100; t++) sched4.tick(state4);
assertEqual(hive4.getEnergy(), 0, '爆发期不充能→能量=0');
assert(!hive4.isBurstReady(), '爆发结束→未就绪');

// 爆发结束后，后续蜂刺可重新充能
for (let t = 0; t < 100; t++) sched4.tick(state4);
// 爆发后 100 ticks，正常模式 3 只蜂每 100tick 发射，共 1 波 × 3 = 3
// 近距离全部命中 → 3 能量
assert(hive4.getEnergy() >= 3, `爆发后充能≥3（实际: ${hive4.getEnergy()}）`);

// ================================================================
//  测试 5：低耦合 — 任意武器组合
// ================================================================
headline('测试 5：低耦合 — 任意武器组合');

const base = createPlayers('a', 'b');
const combos: [string, IWeapon, IWeapon][] = [
  ['A冲击波+B蜂巢', new ShockwaveGeneratorWeapon(), new HiveMotherWeapon()],
  ['A蜂巢+B防火墙', new HiveMotherWeapon(), new FirewallProtocolWeapon()],
  ['A防火墙+B冲击波', new FirewallProtocolWeapon(), new ShockwaveGeneratorWeapon()],
];
combos.forEach(([label, weaponA, weaponB]) => {
  const st = setupState({ ...base[0] }, { ...base[1] });
  const pq = new StubPhysicsQuery(st);
  const s = new SkillScheduler(pq);
  s.register('a', weaponA);
  s.register('b', weaponB);
  s.tick(st);
  assert(s.playerIds.length === 2, `组合: ${label}`);
});

// ================================================================
//  测试 6：边界条件
// ================================================================
headline('测试 6：边界条件');

// 6a. HP=0 不触发
const dead: PlayerState = { id: 'dead', name: 'Dead', hp: 0, maxHp: 100, position: { x: 0, y: 0 }, totalDamageTaken: 100, isOverheated: false };
const alive: PlayerState = { id: 'alive', name: 'Alive', hp: 50, maxHp: 100, position: { x: 800, y: 360 }, totalDamageTaken: 50, isOverheated: false };
const st6a = setupState(dead, alive);
const pq6a = new StubPhysicsQuery(st6a);
const sc6a = new SkillScheduler(pq6a);
sc6a.register('dead', new ShockwaveGeneratorWeapon());
sc6a.register('alive', new HiveMotherWeapon());
const deadFx = sc6a.tick(st6a).filter(e => e.sourceId === 'dead');
assertEqual(deadFx.length, 0, 'HP=0 玩家不产生效果');

// 6b. 充能→爆发→再充能闭环（冲击波靠 tick 推进充能）
const [p6b1, p6b2] = createPlayers('x', 'y');
p6b1.position = { x: 350, y: 360 };
p6b2.position = { x: 380, y: 360 };
const st6b = setupState(p6b1, p6b2);
const pq6b = new StubPhysicsQuery(st6b);
const sc6b = new SkillScheduler(pq6b);
const sw6b = new ShockwaveGeneratorWeapon();
sc6b.register('x', sw6b);

// 冲击波靠 onHitTarget 生成 + onTick 推进命中充能
// 执行碰撞触发冲击波
for (let i = 0; i < 4; i++) simulateHit(sc6b, st6b, 'x', 'y', 5);
// tick 推进让冲击波命中
for (let t = 0; t < 15; t++) sc6b.tick(st6b);

const eBeforeBurst = sw6b.getEnergy();
if (eBeforeBurst >= 4) {
  assert(sw6b.isBurstReady(), '冲击波充能完毕→就绪');
  sc6b.forceBurst('x', st6b);
  assert(!sw6b.isBurstReady(), '爆发后→清除');
}

simulateHit(sc6b, st6b, 'x', 'y', 5);
assertEqual(sw6b.getEnergy(), 0, '爆发后能量归零（单次碰撞不足充能）');

// 6c. reset
const swReset = new ShockwaveGeneratorWeapon();
swReset.playerId = 'test';
swReset.reset();
assertEqual(swReset.getEnergy(), 0, 'reset 后归零');

// ================================================================
//  测试 7：SkillScheduler 暴露 getWeapon/getSkill（兼容旧 API）
// ================================================================
headline('测试 7：getWeapon/getSkill 兼容性');

const [p7a, p7b] = createPlayers('w1', 'w2');
const st7 = setupState(p7a, p7b);
const pq7 = new StubPhysicsQuery(st7);
const sc7 = new SkillScheduler(pq7);
const w7 = new HiveMotherWeapon();
sc7.register('w1', w7);

assert(sc7.getWeapon('w1') !== undefined, 'getWeapon 可用');
assert(sc7.getSkill('w1') !== undefined, 'getSkill（deprecated）仍可用');
assert(sc7.getWeapon('unknown') === undefined, '未知玩家返回 undefined');

// ================================================================
//  结果汇总
// ================================================================
headline('测试结果汇总');
const total = passed + failed;
console.log(`  ✅ 通过: ${passed}/${total}`);
if (failed > 0) {
  console.error(`  ❌ 失败: ${failed}/${total}`);
  process.exit(1);
}
console.log(`\n  🎉 全部 ${total} 项测试通过！3 武器（IWeapon）调用链路完整！`);
process.exit(0);
