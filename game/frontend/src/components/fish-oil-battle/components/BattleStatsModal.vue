<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div class="bg-base-100 rounded-2xl shadow-2xl w-[720px] max-h-[85vh] flex flex-col overflow-hidden">
        <!-- 头部 -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-base-300">
          <h2 class="text-lg font-bold">测试报告</h2>
          <button class="btn btn-ghost btn-sm btn-circle" @click="$emit('close')">✕</button>
        </div>

        <!-- Tab 切换 -->
        <div class="tabs tabs-bordered px-6 pt-2">
          <button
            class="tab tab-sm"
            :class="{ 'tab-active': activeTab === 'current' }"
            @click="activeTab = 'current'"
          >本局报告</button>
          <button
            class="tab tab-sm"
            :class="{ 'tab-active': activeTab === 'history' }"
            @click="activeTab = 'history'"
          >历史汇总</button>
        </div>

        <!-- Tab 内容 -->
        <div class="flex-1 overflow-y-auto px-6 py-4">
          <!-- ─── 本局报告 ─── -->
          <div v-if="activeTab === 'current'">
            <!-- 对局信息 -->
            <div class="grid grid-cols-3 gap-3 mb-4 text-sm">
              <div class="bg-base-200 rounded-lg p-3 text-center">
                <div class="text-xs opacity-50">结果</div>
                <div class="font-bold" :class="winnerName ? 'text-success' : 'text-warning'">
                  {{ winnerName ? `${winnerName} 获胜` : '平局' }}
                </div>
              </div>
              <div class="bg-base-200 rounded-lg p-3 text-center">
                <div class="text-xs opacity-50">结束原因</div>
                <div class="font-mono">{{ endReasonText }}</div>
              </div>
              <div class="bg-base-200 rounded-lg p-3 text-center">
                <div class="text-xs opacity-50">玩家数</div>
                <div class="font-mono">{{ sortedPlayerEntries.length }}</div>
              </div>
            </div>

            <!-- 统计表格 -->
            <div class="overflow-x-auto">
              <table class="table table-xs table-zebra">
                <thead>
                  <tr>
                    <th>玩家</th>
                    <th>武器</th>
                    <th class="text-right">造成伤害</th>
                    <th class="text-right">受到伤害</th>
                    <th class="text-right">DPS</th>
                    <th class="text-right">击杀</th>
                    <th class="text-right">死亡</th>
                    <th class="text-right">存活</th>
                    <th class="text-right">技能</th>
                    <th class="text-right">爆发</th>
                    <th class="text-center">排名</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(entry, idx) in sortedPlayerEntries" :key="entry.id">
                    <td class="font-medium">
                      <span v-if="entry.id === winnerId" class="text-warning mr-1">🏆</span>
                      {{ entry.name }}
                    </td>
                    <td class="text-xs opacity-70">{{ entry.stats.weaponId }}</td>
                    <td class="text-right font-mono tabular-nums">
                      {{ formatNum(entry.stats.totalDamageDealt) }}
                    </td>
                    <td class="text-right font-mono tabular-nums text-error/70">
                      {{ formatNum(entry.stats.totalDamageTaken) }}
                    </td>
                    <td class="text-right font-mono tabular-nums">
                      {{ formatDps(entry.stats.totalDamageDealt, entry.stats.survivalTimeSec) }}
                    </td>
                    <td class="text-right font-mono tabular-nums text-success">
                      {{ entry.stats.kills }}
                    </td>
                    <td class="text-right font-mono tabular-nums text-error">
                      {{ entry.stats.deaths }}
                    </td>
                    <td class="text-right font-mono tabular-nums">
                      {{ formatTime(entry.stats.survivalTimeSec) }}
                    </td>
                    <td class="text-right font-mono tabular-nums">
                      {{ entry.stats.weaponTriggers }}
                    </td>
                    <td class="text-right font-mono tabular-nums">
                      {{ entry.stats.bursts }}
                    </td>
                    <td class="text-center">
                      <span class="badge badge-xs" :class="getRankBadgeClass(idx)">#{{ idx + 1 }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- 导出按钮 -->
            <div class="flex gap-2 mt-4 justify-end">
              <button class="btn btn-outline btn-xs" @click="copyAsText">复制文本</button>
              <button class="btn btn-outline btn-xs" @click="exportJson">导出 JSON</button>
            </div>
          </div>

          <!-- ─── 历史汇总 ─── -->
          <div v-else-if="activeTab === 'history'">
            <div v-if="historyEntries.length === 0" class="text-center py-8 opacity-40 text-sm">
              暂无历史记录，完成一局对局后自动保存
            </div>

            <template v-else>
              <!-- 汇总数字 -->
              <div class="grid grid-cols-4 gap-3 mb-4 text-sm">
                <div class="bg-base-200 rounded-lg p-3 text-center">
                  <div class="text-xs opacity-50">总场次</div>
                  <div class="font-bold font-mono">{{ historyEntries.length }}</div>
                </div>
                <div class="bg-base-200 rounded-lg p-3 text-center">
                  <div class="text-xs opacity-50">胜率</div>
                  <div class="font-bold font-mono">{{ winRateText }}</div>
                </div>
                <div class="bg-base-200 rounded-lg p-3 text-center">
                  <div class="text-xs opacity-50">平均 DPS</div>
                  <div class="font-bold font-mono">{{ formatNum(avgDps) }}</div>
                </div>
                <div class="bg-base-200 rounded-lg p-3 text-center">
                  <div class="text-xs opacity-50">常用武器</div>
                  <div class="font-bold font-mono text-xs">{{ topWeapon }}</div>
                </div>
              </div>

              <!-- 会话列表 -->
              <div class="space-y-2">
                <div
                  v-for="(entry, idx) in historyEntries"
                  :key="idx"
                  class="collapse collapse-arrow bg-base-200 rounded-lg"
                >
                  <input type="checkbox" />
                  <div class="collapse-title text-sm font-medium flex items-center gap-2 min-h-0 py-3">
                    <span class="opacity-50 text-xs">{{ formatTimestamp(entry.timestamp) }}</span>
                    <span class="badge badge-xs" :class="entry.winnerName ? 'badge-success' : 'badge-warning'">
                      {{ entry.winnerName ? '胜' : '平' }}
                    </span>
                    <span class="text-xs opacity-60">{{ entry.playerCount }}人</span>
                  </div>
                  <div class="collapse-content text-xs">
                    <table class="table table-xs">
                      <thead>
                        <tr>
                          <th>玩家</th>
                          <th class="text-right">伤害</th>
                          <th class="text-right">DPS</th>
                          <th class="text-right">击杀</th>
                          <th class="text-right">存活</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="p in entry.playerStats" :key="p.id">
                          <td>{{ p.name }}</td>
                          <td class="text-right font-mono tabular-nums">{{ formatNum(p.stats.totalDamageDealt) }}</td>
                          <td class="text-right font-mono tabular-nums">{{ formatDps(p.stats.totalDamageDealt, p.stats.survivalTimeSec) }}</td>
                          <td class="text-right font-mono tabular-nums">{{ p.stats.kills }}</td>
                          <td class="text-right font-mono tabular-nums">{{ formatTime(p.stats.survivalTimeSec) }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <!-- 导出全部 -->
              <div class="flex gap-2 mt-4 justify-end">
                <button class="btn btn-outline btn-xs" @click="copyHistoryAsText">复制全部</button>
                <button class="btn btn-outline btn-xs" @click="exportHistoryJson">导出全部 JSON</button>
                <button class="btn btn-ghost btn-xs text-error" @click="clearHistory">清空历史</button>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { PlayerStats } from '$/backend/src/games/fish-oil-battle/shared/protocol';

// ─── Props ─────────────────────────────────────────
const props = defineProps<{
  show: boolean;
  stats: Record<string, PlayerStats>;
  playerNameMap: Record<string, string>;
  winnerId: string;
  winnerName: string;
  endReason: string;
}>();

defineEmits<{
  close: [];
}>();

// ─── 本地状态 ──────────────────────────────────────
const activeTab = ref<'current' | 'history'>('current');

// ─── 本局报告计算 ──────────────────────────────────
interface PlayerEntry {
  id: string;
  name: string;
  stats: PlayerStats;
}

const sortedPlayerEntries = computed<PlayerEntry[]>(() => {
  const entries: PlayerEntry[] = [];
  for (const [id, stats] of Object.entries(props.stats)) {
    entries.push({
      id,
      name: props.playerNameMap[id] ?? id.slice(0, 6),
      stats,
    });
  }
  // 按存活 + HP + 击杀 排序（胜者第一）
  entries.sort((a, b) => {
    if (a.stats.survived !== b.stats.survived) return a.stats.survived ? -1 : 1;
    if (b.stats.kills !== a.stats.kills) return b.stats.kills - a.stats.kills;
    return b.stats.remainingHp - a.stats.remainingHp;
  });
  return entries;
});

const endReasonText = computed(() => {
  switch (props.endReason) {
    case 'last_stand': return '最后存活';
    case 'timeout': return '超时';
    default: return props.endReason || '-';
  }
});

// ─── 格式化工具 ────────────────────────────────────
function formatNum(n: number): string {
  if (n === undefined || n === null) return '0';
  return Math.round(n).toString();
}

function formatTime(sec: number): string {
  if (!sec || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDps(damage: number, sec: number): string {
  if (!sec || sec <= 0) return '0';
  return (damage / sec).toFixed(1);
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function getRankBadgeClass(idx: number): string {
  if (idx === 0) return 'badge-warning';
  if (idx === 1) return 'badge-info';
  if (idx === 2) return 'badge-accent';
  return 'badge-ghost';
}

// ─── 历史记录（localStorage） ───────────────────────
const LS_KEY = 'fish-oil-battle-test-history';

interface HistoryEntry {
  timestamp: number;
  playerCount: number;
  winnerId: string;
  winnerName: string;
  reason: string;
  playerStats: PlayerEntry[];
}

const historyEntries = ref<HistoryEntry[]>([]);

function loadHistory(): void {
  try {
    const raw = localStorage.getItem(LS_KEY);
    historyEntries.value = raw ? JSON.parse(raw) : [];
  } catch {
    historyEntries.value = [];
  }
}

function saveHistory(): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(historyEntries.value));
  } catch {
    // localStorage 满或不可用
  }
}

/** 将当前局添加到历史 */
function addCurrentToHistory(): void {
  if (!Object.keys(props.stats).length) return;

  const entry: HistoryEntry = {
    timestamp: Date.now(),
    playerCount: Object.keys(props.stats).length,
    winnerId: props.winnerId,
    winnerName: props.winnerName,
    reason: props.endReason,
    playerStats: sortedPlayerEntries.value,
  };

  historyEntries.value.unshift(entry);
  // 最多保留 50 局
  if (historyEntries.value.length > 50) {
    historyEntries.value = historyEntries.value.slice(0, 50);
  }
  saveHistory();
}

// show 变为 true 时：加载历史 + 自动保存当前局
watch(() => props.show, (val) => {
  if (val) {
    loadHistory();
    addCurrentToHistory();
  }
});

// ─── 历史汇总计算 ──────────────────────────────────
const winRateText = computed(() => {
  const total = historyEntries.value.length;
  if (!total) return '0%';
  const wins = historyEntries.value.filter(e => e.winnerName).length;
  return `${Math.round((wins / total) * 100)}%`;
});

const avgDps = computed(() => {
  const entries = historyEntries.value;
  if (!entries.length) return 0;
  let totalDps = 0;
  let count = 0;
  for (const entry of entries) {
    for (const p of entry.playerStats) {
      if (p.stats.survivalTimeSec > 0) {
        totalDps += p.stats.totalDamageDealt / p.stats.survivalTimeSec;
        count++;
      }
    }
  }
  return count > 0 ? totalDps / count : 0;
});

const topWeapon = computed(() => {
  const weaponCount: Record<string, number> = {};
  for (const entry of historyEntries.value) {
    for (const p of entry.playerStats) {
      const w = p.stats.weaponId || 'unknown';
      weaponCount[w] = (weaponCount[w] || 0) + 1;
    }
  }
  let top = '';
  let max = 0;
  for (const [w, c] of Object.entries(weaponCount)) {
    if (c > max) { max = c; top = w; }
  }
  return top || '-';
});

// ─── 导出功能 ──────────────────────────────────────
async function copyAsText(): Promise<void> {
  const lines: string[] = [
    `=== 赛博鱼油 · 测试报告 ===`,
    `结果: ${props.winnerName ? `${props.winnerName} 获胜` : '平局'}`,
    `原因: ${endReasonText.value}`,
    ``,
    `玩家          武器        造成伤害  受到伤害  DPS    击杀  存活时间`,
    `─`.repeat(70),
  ];
  for (const e of sortedPlayerEntries.value) {
    const tag = e.id === props.winnerId ? '🏆' : ' ';
    lines.push(
      `${tag}${e.name.padEnd(12)} ${(e.stats.weaponId || '-').padEnd(10)} ` +
      `${formatNum(e.stats.totalDamageDealt).padStart(8)}  ${formatNum(e.stats.totalDamageTaken).padStart(8)}  ` +
      `${formatDps(e.stats.totalDamageDealt, e.stats.survivalTimeSec).padStart(6)}  ${e.stats.kills.toString().padStart(4)}  ` +
      `${formatTime(e.stats.survivalTimeSec).padStart(7)}`
    );
  }
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
  } catch {
    // fallback
  }
}

function exportJson(): void {
  const data = {
    type: 'fish-oil-battle-test-report',
    winnerId: props.winnerId,
    winnerName: props.winnerName,
    endReason: props.endReason,
    players: sortedPlayerEntries.value.map(e => ({
      id: e.id,
      name: e.name,
      stats: e.stats,
    })),
  };
  downloadJson(data, `battle-report-${Date.now()}.json`);
}

function copyHistoryAsText(): void {
  const lines: string[] = [
    `=== 赛博鱼油 · 历史测试报告 ===`,
    `总场次: ${historyEntries.value.length}  胜率: ${winRateText.value}  平均DPS: ${formatNum(avgDps.value)}  常用武器: ${topWeapon.value}`,
    ``,
  ];
  for (const entry of historyEntries.value) {
    lines.push(`[${formatTimestamp(entry.timestamp)}] ${entry.winnerName || '平局'} (${entry.playerCount}人)`);
    for (const p of entry.playerStats) {
      lines.push(`  ${p.name}: 伤害${formatNum(p.stats.totalDamageDealt)} DPS${formatDps(p.stats.totalDamageDealt, p.stats.survivalTimeSec)} 击杀${p.stats.kills} 存活${formatTime(p.stats.survivalTimeSec)}`);
    }
  }
  navigator.clipboard.writeText(lines.join('\n')).catch(() => {});
}

function exportHistoryJson(): void {
  downloadJson(historyEntries.value, `battle-history-${Date.now()}.json`);
}

function clearHistory(): void {
  historyEntries.value = [];
  saveHistory();
}

function downloadJson(data: any, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
</script>
