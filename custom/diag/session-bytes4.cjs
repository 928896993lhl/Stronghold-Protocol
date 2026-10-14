// Deep walk: nickname -> 开始 -> 独立模拟 -> 创建 -> 出击, measuring wire bytes per step.
const { chromium } = require('playwright');
const ORIGIN = process.env.SP_ORIGIN || 'https://sp.example.com';

const bucket = (url) => {
  const u = url.replace(ORIGIN, '');
  const m = u.match(/^\/(assets|media)\/([^/]+)/);
  if (m) return `${m[1]}/${m[2]}`;
  if (u.startsWith('/js/')) return 'js';
  if (u.startsWith('/css/')) return 'css';
  return 'other';
};
const MB = (x) => (x / 1048576).toFixed(2) + ' MB';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  const rows = [];
  cdp.on('Network.loadingFinished', (e) => {
    const r = rows.find((x) => x.id === e.requestId);
    if (r) r.bytes = e.encodedDataLength;
  });
  cdp.on('Network.responseReceived', (e) =>
    rows.push({ id: e.requestId, url: e.response.url, bytes: 0, status: e.response.status })
  );
  const report = (label, from) => {
    const slice = rows.slice(from);
    const by = {};
    let total = 0;
    for (const r of slice) {
      const b = bucket(r.url);
      by[b] = by[b] || { n: 0, bytes: 0 };
      by[b].n++;
      by[b].bytes += r.bytes || 0;
      total += r.bytes || 0;
    }
    console.log(`\n=== ${label}: ${slice.length} req, ${MB(total)} ===`);
    Object.entries(by)
      .sort((a, b) => b[1].bytes - a[1].bytes)
      .slice(0, 10)
      .forEach(([k, v]) => console.log(`  ${k.padEnd(16)} ${String(v.n).padStart(5)} req ${MB(v.bytes).padStart(9)}`));
    return { n: slice.length, bytes: total };
  };
  const dump = async (tag) => {
    const els = await page.$$('button, a, input, [class*="btn"], [class*="Btn"]');
    const out = [];
    for (const e of els) {
      const t = (await e.innerText().catch(() => '')) || (await e.getAttribute('placeholder').catch(() => ''));
      const box = await e.boundingBox().catch(() => null);
      const dis = await e.isDisabled().catch(() => false);
      if (t && t.trim() && box) out.push((dis ? '× ' : '· ') + t.replace(/\s+/g, ' ').trim().slice(0, 26));
    }
    console.log(`[${tag}] ${JSON.stringify(out.slice(0, 26))}`);
  };
  const clickText = async (label, tag) => {
    const el = page.getByText(label, { exact: false }).first();
    if (!(await el.count().catch(() => 0))) return false;
    const ok = await el.click({ timeout: 6000 }).then(() => true).catch(() => false);
    if (ok) console.log(`  点击「${label}」(${tag})`);
    return ok;
  };

  await page.goto(ORIGIN + '/', { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(5000);
  const A = report('A 首屏', 0);
  let mark = rows.length;

  await page.locator('input').first().fill('CDNTest').catch(() => {});
  await page.waitForTimeout(500);
  await clickText('开始', 'nick');
  await page.waitForTimeout(6000);
  const B = report('B 大厅', mark);
  mark = rows.length;

  await clickText('独立模拟', 'solo-card');
  await page.waitForTimeout(1500);
  await dump('B2-solo');
  await clickText('开始独立模拟', 'create');
  await page.waitForTimeout(12000);
  const C = report('C 房间/调配', mark);
  mark = rows.length;
  await page.screenshot({ path: 's4-C.png' });
  await dump('C-room');

  // start the match from the room
  for (const l of ['出击', '开始模拟', '开始对局', '开始战斗', '准备完成', '开始']) {
    if (await clickText(l, 'start')) break;
  }
  await page.waitForTimeout(20000);
  const D = report('D 对局加载', mark);
  mark = rows.length;
  await page.screenshot({ path: 's4-D.png' });
  await dump('D-board');

  await page.waitForTimeout(25000);
  const E = report('E 对局内 +25s', mark);
  await page.screenshot({ path: 's4-E.png' });

  console.log('\n--- 汇总 ---');
  [['A 首屏', A], ['B 大厅', B], ['C 房间', C], ['D 对局加载', D], ['E +25s', E]].forEach(([k, v]) =>
    console.log(`${k.padEnd(24)} ${String(v.n).padStart(4)} req  ${MB(v.bytes).padStart(9)}`)
  );
  console.log(`累计 ${MB(A.bytes + B.bytes + C.bytes + D.bytes + E.bytes)} / ${A.n + B.n + C.n + D.n + E.n} req`);

  await browser.close();
})().catch((e) => {
  console.error('FAILED', e.message);
  process.exit(1);
});
