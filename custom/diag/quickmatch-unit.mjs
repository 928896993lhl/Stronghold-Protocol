// 快速匹配的服务端逻辑用例：不开浏览器，直接把 Lobby 拉起来跑。
// 覆盖：撮合命中、难度分桶、solo 不参与、房主开关、房间满了另开一间。
import { Lobby } from '../../server/lobby.js';

const log = { info() {}, warn() {}, error() {}, debug() {} };
const sessions = new Map();

function mkSession(id, name) {
  const s = { playerId: id, name, connected: true, limitKey: null, addr: '1.2.3.4', roomCode: null, notice: null, pendingResult: null, ws: null };
  sessions.set(id, s);
  return s;
}

const lobby = new Lobby({
  registry: { byId: (id) => sessions.get(id) || null },
  log, MatchClass: null, getData: () => null, seedFn: () => 1, options: {},
});

const roomOf = (s) => lobby.rooms.get(s.roomCode);
let pass = 0, fail = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)); }
}

console.log('1) A 快速匹配 coop/FUNNY —— 没有开放房间，应开一间并置 open');
const a = mkSession('p1', '阿尔法');
check('A 返回 ok', lobby.quickMatch(a, { mode: 'coop', difficulty: 'FUNNY' }), { ok: true });
const roomA = roomOf(a);
check('A 房间 open=true', roomA.open, true);
check('A 是房主', roomA.hostId, 'p1');
check('A 房人类数', roomA.activeHumans().length, 1);

console.log('2) B 快速匹配同难度 —— 应落进 A 的房间');
const b = mkSession('p2', '布拉沃');
check('B 返回 ok', lobby.quickMatch(b, { mode: 'coop', difficulty: 'FUNNY' }), { ok: true });
check('B 与 A 同房', roomOf(b) === roomA, true);
check('A 房人类数=2', roomA.activeHumans().length, 2);

console.log('3) C 快速匹配不同难度 —— 难度分桶，应自己开一间');
const c = mkSession('p3', '查理');
check('C 返回 ok', lobby.quickMatch(c, { mode: 'coop', difficulty: 'HARD' }), { ok: true });
check('C 不在 A 房', roomOf(c) === roomA, false);
check('C 房间 open=true', roomOf(c).open, true);

console.log('4) D 快速匹配 solo —— 没有可撮合对象，直接建且不开放');
const d = mkSession('p4', '德尔塔');
check('D 返回 ok', lobby.quickMatch(d, { mode: 'solo', difficulty: 'FUNNY' }), { ok: true });
check('D 房间 mode=solo', roomOf(d).mode, 'solo');
check('D 房间 open=false', roomOf(d).open, false);
const e = mkSession('p5', '回声');
const r5 = lobby.quickMatch(e, { mode: 'solo', difficulty: 'FUNNY' });
check('E solo 也自己开一间', roomOf(e) === roomOf(d), false);
void r5;

console.log('5) setOpen 权限与规则');
check('非房主被拒', lobby.setOpen(b, { open: false }), { error: 'NOT_HOST' });
check('房主可关闭', lobby.setOpen(a, { open: false }), { ok: true });
check('关闭后 open=false', roomA.open, false);
const f = mkSession('p6', '狐');
check('F 不再撮合进 A 房', (lobby.quickMatch(f, { mode: 'coop', difficulty: 'FUNNY' }), roomOf(f) === roomA), false);

console.log('6) 房间坐满后另开一间');
const g = mkSession('p7', ' golf');
const h = mkSession('p8', '酒店');
lobby.setOpen(a, { open: true });
lobby.join(g, { code: roomA.code });
lobby.join(h, { code: roomA.code });
check('A 房满 4 人', roomA.activeHumans().length, 4);
const i = mkSession('p9', '印度');
lobby.quickMatch(i, { mode: 'coop', difficulty: 'FUNNY' });
check('满房后 I 另开一间', roomOf(i) === roomA, false);

console.log('7) 房间状态帧带 open 字段');
const st = roomA.toState();
check('toState 有 open', typeof st.open, 'boolean');
check('A 房 open 已关（第 5 步关掉后又被打开）', st.open, true);

console.log('\n' + (fail === 0 ? '全部通过' : fail + ' 条失败') + '（' + pass + '/' + (pass + fail) + '）');
process.exit(fail === 0 ? 0 : 1);
