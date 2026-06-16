/**
 * 赛博鱼油 MVP · 技能调用链路测试
 *
 * 运行方式：
 *   cd game/backend && npx tsx src/games/fish-oil-battle/skill-chain.test.ts
 *
 * 验证内容：
 *   1. 3 技能独立实例化 + 接口一致性
 *   2. SkillScheduler 调度串联（onTick → onHit → checkDamageEnergy → forceBurst）
 *   3. 能量充能 → 显式爆发 → 状态重置 完整闭环
 *   4. 低耦合验证：互换技能不影响调度器
 *   5. 边界条件：HP 归零、重复爆发、reset
 */

import { BattleState, SkillScheduler } from './core/SkillScheduler';
import { ShockwaveGenerator } from './skills/ShockwaveGenerator';
import { FirewallProtocol } from './skills/FirewallProtocol';
import { HiveMother } from './skills/HiveMother';
import { ISkill, PlayerState } from './core/types';

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
//  测试 1：技能独立实例化 + 接口一致性
// ================================================================
headline('测试 1：技能独立实例化 + 接口完整性');

const skills: ISkill[] = [new ShockwaveGenerator(), new FirewallProtocol(), new HiveMother()];
for (const skill of skills) {
  assert(typeof skill.id === 'string', `${skill.name} id 合法`);
  assert(['aggressor', 'controller', 'engineer', 'wildcard'].includes(skill.school), `${skill.name} 流派: ${skill.school}`);
  assert(typeof skill.onTick === 'function', `${skill.name}.onTick ✓`);
  assert(typeof skill.onHitTarget === 'function', `${skill.name}.onHitTarget ✓`);
  assert(typeof skill.onHitByAttacker === 'function', `${skill.name}.onHitByAttacker ✓`);
  assert(typeof skill.isBurstReady === 'function', `${skill.name}.isBurstReady ✓`);
  assert(typeof skill.burst === 'function', `${skill.name}.burst ✓`);
  assert(typeof skill.reset === 'function', `${skill.name}.reset ✓`);
}
assertEqual(skills.length, 3, '共 3 个技能实例');
assert(new Set(skills.map(s => s.id)).size === 3, '技能 id 互不相同');

// ================================================================
//  测试 2：冲击波 → onHitTarget充能 → 显式爆发 → 能量归零
// ================================================================
headline('测试 2：ShockwaveGenerator 充能 + 显式爆发闭环');

const [p2a, p2b] = createPlayers('p1', 'p2');
const state2 = setupState(p2a, p2b);
const sched2 = new SkillScheduler();
const sw2 = new ShockwaveGenerator();
sched2.register('p1', sw2);
sched2.register('p2', new FirewallProtocol());

sched2.tick(state2);
assertEqual(state2.tick, 1, 'tick 递增');

// P1 → P2 碰撞 4 次
for (let i = 0; i < 4; i++) simulateHit(sched2, state2, 'p1', 'p2', 5);
// 4 × (5 基础 + 2 冲击波) = 28
assertEqual(p2b.hp, 72, 'P2 HP=72 (100-28)');
assertEqual(sw2.getEnergy(), 4, '冲击波能量=4');
assert(sw2.isBurstReady(), '冲击波爆发就绪');

// 显式触发爆发
const swBurstEff = sched2.forceBurst('p1', state2);
assert(swBurstEff.some(e => e.type === 'burst_damage'), '爆发产生 burst_damage');
assertEqual(sw2.getEnergy(), 0, '爆发后能量归零');
// burst 25 dmg + hp was 72 → 47
assertEqual(p2b.hp, 47, '爆发后 P2 HP=47');

// ================================================================
//  测试 3：防火墙 → 受击充能 → 显式爆发
// ================================================================
headline('测试 3：FirewallProtocol 受击充能 + 显式爆发');

const [p3a, p3b] = createPlayers('p1', 'p2');
p3b.maxHp = 300; p3b.hp = 300;
const state3 = setupState(p3a, p3b);
const sched3 = new SkillScheduler();
sched3.register('p1', new ShockwaveGenerator());
const fw3 = new FirewallProtocol();
sched3.register('p2', fw3);

// P2 累计受击 12 × 7 = 84 → floor(84/15)=5 → capped 4 能量
for (let i = 0; i < 12; i++) simulateHit(sched3, state3, 'p1', 'p2', 5);
sched3.tick(state3);  // tick 触发 checkDamageEnergy
assert(fw3.isBurstReady(), '防火墙受击充能完毕→就绪');

// 显式爆发
const fwBurst = sched3.forceBurst('p2', state3);
assert(fwBurst.some(e => e.type === 'burst_damage'), '防火墙爆发成功');
assertEqual(fw3.getEnergy(), 0, '防火墙爆发后能量归零');

// ================================================================
//  测试 4：蜂巢 → 蜂刺自动充能 → 显式爆发 → 蜂群狂暴
// ================================================================
headline('测试 4：HiveMother 蜂刺充能 + 蜂群狂暴闭环');

const [p4a, p4b] = createPlayers('p1', 'p2');
p4b.maxHp = 300; p4b.hp = 300;
const state4 = setupState(p4a, p4b);
const sched4 = new SkillScheduler();
const hive4 = new HiveMother();
sched4.register('p1', hive4);

// 45 tick → 蜂刺每 5tick 发射 1 根 → 9 能量
for (let t = 0; t < 45; t++) sched4.tick(state4);
assertEqual(hive4.getEnergy(), 9, '蜂巢母体 45tick → 能量=9');
assert(hive4.isBurstReady(), '蜂巢母体爆发就绪');

// 显式爆发
const hiveBurst = sched4.forceBurst('p1', state4);
assert(hiveBurst.some(e => e.type === 'burst_damage'), '蜂巢母体爆发触发');
assertEqual(hive4.getEnergy(), 0, '蜂群狂暴后能量归零');

// 爆发期验证（6 只蜂，3tick 间隔，连续 5 tick）
let burstStings = 0;
for (let t = 0; t < 5; t++) {
  burstStings += sched4.tick(state4).filter(e => e.type === 'fire_sting').length;
}
assert(burstStings >= 2, `爆发期 5tick 蜂刺 ≥ 2（实际: ${burstStings}）`);

// ================================================================
//  测试 5：低耦合 — 任意技能组合
// ================================================================
headline('测试 5：低耦合 — 任意技能组合');

const base = createPlayers('a', 'b');
[ 
  ['A冲击波+B蜂巢', new ShockwaveGenerator(), new HiveMother()],
  ['A蜂巢+B防火墙', new HiveMother(), new FirewallProtocol()],
  ['A防火墙+B冲击波', new FirewallProtocol(), new ShockwaveGenerator()],
].forEach(([label, skillA, skillB]) => {
  const s = new SkillScheduler();
  s.register('a', skillA as ISkill);
  s.register('b', skillB as ISkill);
  s.tick(setupState({ ...base[0] }, { ...base[1] }));
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
const sc6a = new SkillScheduler();
sc6a.register('dead', new ShockwaveGenerator());
sc6a.register('alive', new HiveMother());
const deadFx = sc6a.tick(st6a).filter(e => e.sourceId === 'dead');
assertEqual(deadFx.length, 0, 'HP=0 玩家不产生效果');

// 6b. 充能→爆发→再充能闭环
const [p6b1, p6b2] = createPlayers('x', 'y');
const st6b = setupState(p6b1, p6b2);
const sc6b = new SkillScheduler();
const sw6b = new ShockwaveGenerator();
sc6b.register('x', sw6b);

for (let i = 0; i < 4; i++) simulateHit(sc6b, st6b, 'x', 'y', 5);
assert(sw6b.isBurstReady(), '命中4次→就绪');
sc6b.forceBurst('x', st6b);
assert(!sw6b.isBurstReady(), '爆发后→清除');

simulateHit(sc6b, st6b, 'x', 'y', 5);
assertEqual(sw6b.getEnergy(), 1, '爆发后可重新充能');

// 6c. reset
sw6b.onHitTarget(st6b); sw6b.onHitTarget(st6b);
assert(sw6b.getEnergy() > 0, 'reset 前有能量');
sw6b.reset();
assertEqual(sw6b.getEnergy(), 0, 'reset 后归零');

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
console.log(`\n  🎉 全部 ${total} 项测试通过！3 技能调用链路完整！`);
process.exit(0);
