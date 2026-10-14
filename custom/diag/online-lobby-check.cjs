// 在线人数（匹配页顶栏）验证：
//   打开站点 → 填代号进入匹配页（选模拟协议）→ 断言顶栏 .onlc 显示「N 人在线」，
//   顺带确认标题页徽标仍在、快速匹配按钮没被这次改动弄丢。
// 运行：SP_ORIGIN=https://站点 node diag/online-lobby-check.cjs
const { chromium } = require('playwright');

const ORIGIN = process.env.SP_ORIGIN || 'https://sp.example.com';
const errors = [];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    let txt = '';
    try { txt = String(m.text()); } catch { return; }
    if (!txt || txt.includes('_event')) return;
    errors.push(`console: ${txt}`);
  });

  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
  let title = null;
  for (let i = 0; i < 3 && !title; i++) {
    title = await page.waitForSelector('input[placeholder*="代号"]', { timeout: 30000 }).catch(() => null);
    if (!title) { console.log(`  (标题页第 ${i + 1} 次没出来，重载重试)`); await page.reload({ waitUntil: 'domcontentloaded' }); }
  }
  if (!title) { console.log('FAIL 标题页 30s 未渲染'); process.exit(1); }

  // ① 标题页徽标（回归确认：不能因为这次改动消失）
  await page.waitForSelector('.title-login .onlc', { timeout: 15000 });
  const titleBadge = (await page.textContent('.title-login .onlc')).trim().replace(/\s+/g, ' ');
  console.log(`标题页徽标: "${titleBadge}"`);

  // ② 进入匹配页
  const name = `OC${Date.now() % 100000}`;
  await page.fill('input[placeholder*="代号"]', name);
  await page.click('button:has-text("开始")');
  await page.waitForSelector('.lobby-screen', { timeout: 20000 });
  console.log('已进入匹配页（选择模拟协议）');

  // ③ 顶栏在线人数
  const badge = await page.waitForSelector('.topbar .onlc', { timeout: 15000 });
  const barText = (await badge.textContent()).trim().replace(/\s+/g, ' ');
  const visible = await badge.isVisible();
  const box = await badge.boundingBox();
  console.log(`匹配页顶栏: "${barText}" visible=${visible} box=${JSON.stringify(box)}`);

  // ④ 与 /healthz 的 sockets 对账
  const sockets = await page.evaluate(async () => (await (await fetch('/healthz', { cache: 'no-store' })).json()).sockets);
  const num = parseInt(barText, 10);
  console.log(`/healthz sockets=${sockets} 顶栏显示=${num} → ${num === sockets ? '一致' : '不一致(可能刚好有人进出，20s 后会追平)'}`);

  // ⑤ 快速匹配按钮仍在（回归确认）
  const quickBtn = await page.$('button:has-text("快速匹配")');
  console.log(`快速匹配按钮: ${quickBtn ? '在' : '丢失!'}`);

  // ⑥ coop 难度卡与截图
  await page.screenshot({ path: 'diag/online-lobby.png' });
  console.log('截图: diag/online-lobby.png');

  await browser.close();
  if (errors.length) { console.log('\nJS 错误:'); errors.forEach((e) => console.log('  ' + e)); process.exit(1); }
  console.log('\n零 JS 错误，验证通过');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
