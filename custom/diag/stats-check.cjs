// 看板端到端验证：/stats/ 能打开、四个数字都取到了、图表有内容、没有 JS 报错。
// 运行：SP_ORIGIN=https://你的站点 node custom/diag/stats-check.cjs
const { chromium } = require('playwright');

const ORIGIN = process.env.SP_ORIGIN || 'https://sp.example.com';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const res = await page.goto(ORIGIN + '/stats/', { waitUntil: 'domcontentloaded' });
  console.log('HTTP /stats/ =', res.status());
  await page.waitForTimeout(3500); // 等 /healthz 和历史文件都取回来

  const vals = await page.evaluate(() => {
    const g = (id) => (document.getElementById(id) || {}).textContent;
    return {
      online: g('v-online'), rooms: g('v-rooms'), matches: g('v-matches'), sessions: g('v-sessions'),
      peak: g('t-peak'), avg: g('t-avg'), samples: g('t-samples'), maxMatches: g('t-matches'),
      live: g('liveText'), chartNodes: (document.getElementById('chart') || {}).childElementCount,
      hint: g('histHint'),
    };
  });
  console.log(JSON.stringify(vals, null, 1));
  await page.screenshot({ path: 'diag/stats-board.png', fullPage: true });
  console.log('errors:', errors.length ? errors : '(none)');
  await browser.close();
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
