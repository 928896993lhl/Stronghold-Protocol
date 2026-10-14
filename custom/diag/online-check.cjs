// 在线人数徽标端到端验证：开一个真实浏览器连上服务器，看
//   1) /healthz 每个字段在「只有我一个人」时到底是什么值（决定徽标该读哪个字段）
//   2) .onlc 徽标有没有渲染、文案是什么
//   3) 有没有 JS 报错
//
// 关键结论（实测）：在线数只能取 sockets。sessions / rooms / matches 会把
// 断线后仍保留、等待恢复的房间一直算进去，无人连接时也能停在几十，会严重虚高。
//
// 运行：SP_ORIGIN=https://你的站点 node custom/diag/online-check.cjs
const { chromium } = require('playwright');

const ORIGIN = process.env.SP_ORIGIN || 'https://sp.example.com';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const before = await page.evaluate(async () => (await fetch('/healthz', { cache: 'no-store' })).json())
    .catch(() => null);
  console.log('before open :', JSON.stringify(before));

  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000); // 等 WS 握手 + 徽标第一次轮询

  const after = await page.evaluate(async () => (await fetch('/healthz', { cache: 'no-store' })).json());
  const badge = await page.evaluate(() => {
    const el = document.querySelector('.onlc');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { text: el.textContent.replace(/\s+/g, ' ').trim(), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  });
  const status = await page.evaluate(() => {
    const el = document.querySelector('.title-conn');
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
  });

  await page.screenshot({ path: 'diag/online-title.png' });
  console.log('after  open :', JSON.stringify(after));
  console.log('badge       :', JSON.stringify(badge));
  console.log('conn row    :', JSON.stringify(status));
  console.log('errors      :', errors.length ? errors : '(none)');
  await browser.close();
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
