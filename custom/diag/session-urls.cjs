// What exactly are the heavy/plentiful requests? Needed to decide what to put behind a CDN.
const { chromium } = require('playwright');
const ORIGIN = process.env.SP_ORIGIN || 'https://sp.example.com';
const MB = (x) => (x / 1048576).toFixed(3) + ' MB';

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
    rows.push({ id: e.requestId, url: e.response.url, bytes: 0, status: e.response.status, proto: e.response.protocol })
  );

  await page.goto(ORIGIN + '/', { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(6000);

  const protos = {};
  let total = 0;
  for (const r of rows) {
    protos[r.proto] = (protos[r.proto] || 0) + 1;
    total += r.bytes || 0;
  }
  console.log(`首屏 ${rows.length} req, ${MB(total)}, 协议分布:`, JSON.stringify(protos));

  console.log('\n--- 按字节 Top 20 ---');
  rows.slice().sort((a, b) => (b.bytes || 0) - (a.bytes || 0)).slice(0, 20)
    .forEach((r) => console.log(`  ${MB(r.bytes || 0).padStart(10)}  ${r.url.replace(ORIGIN, '').slice(0, 110)}`));

  // group by directory depth 2
  console.log('\n--- 按目录归并 ---');
  const by = {};
  for (const r of rows) {
    const u = r.url.replace(ORIGIN, '').replace(/^\/+/, '');
    const parts = u.split('/');
    const k = parts.slice(0, parts.length > 1 ? 2 : 1).join('/').split('?')[0];
    by[k] = by[k] || { n: 0, b: 0 };
    by[k].n++;
    by[k].b += r.bytes || 0;
  }
  Object.entries(by).sort((a, b) => b[1].b - a[1].b).slice(0, 25)
    .forEach(([k, v]) => console.log(`  ${String(v.n).padStart(4)} req ${MB(v.b).padStart(10)}  ${k}`));

  await browser.close();
})().catch((e) => {
  console.error('FAILED', e.message);
  process.exit(1);
});
