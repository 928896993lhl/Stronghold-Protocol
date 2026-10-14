// How slow are the cross-border Google Fonts requests, versus same-origin assets?
const { chromium } = require('playwright');
const ORIGIN = process.env.SP_ORIGIN || 'https://sp.example.com';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(ORIGIN + '/', { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(8000);

  const entries = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((e) => ({
      url: e.name,
      ms: Math.round(e.duration),
      bytes: e.transferSize,
      proto: e.nextHopProtocol,
      start: Math.round(e.startTime),
    }))
  );

  const g = entries.filter((e) => /fonts\.(googleapis|gstatic)\.com/.test(e.url));
  const local = entries.filter((e) => e.url.startsWith(ORIGIN));

  const stat = (arr) => {
    if (!arr.length) return 'none';
    const d = arr.map((x) => x.ms).sort((a, b) => a - b);
    const sum = d.reduce((a, b) => a + b, 0);
    return `n=${arr.length} 合计=${sum}ms 中位=${d[Math.floor(d.length / 2)]}ms 最慢=${d[d.length - 1]}ms 平均=${Math.round(sum / d.length)}ms`;
  };

  console.log('Google Fonts :', stat(g));
  console.log('同源(local):', stat(local));

  const gBytes = g.reduce((a, b) => a + (b.bytes || 0), 0);
  const lBytes = local.reduce((a, b) => a + (b.bytes || 0), 0);
  console.log(`Google Fonts 字节: ${(gBytes / 1048576).toFixed(3)} MB / ${g.length} req`);
  console.log(`同源字节:          ${(lBytes / 1048576).toFixed(3)} MB / ${local.length} req`);

  console.log('\n--- 最慢的 18 个请求 ---');
  entries.slice().sort((a, b) => b.ms - a.ms).slice(0, 18)
    .forEach((e) => console.log(`  ${String(e.ms).padStart(6)} ms  ${String(e.bytes).padStart(7)} B  ${e.proto.padEnd(5)}  ${e.url.replace(ORIGIN, '').slice(0, 88)}`));

  console.log('\n--- Google Fonts 明细 ---');
  g.sort((a, b) => b.ms - a.ms).slice(0, 25)
    .forEach((e) => console.log(`  ${String(e.ms).padStart(6)} ms  ${String(e.bytes).padStart(7)} B  start=${String(e.start).padStart(5)}  ${e.url.slice(0, 90)}`));

  // is the page still usable if fonts never arrive?
  const blocked = await page.evaluate(() => document.fonts ? document.fonts.size : -1);
  console.log('\n已加载字体数:', blocked);

  await browser.close();
})().catch((e) => {
  console.error('FAILED', e.message);
  process.exit(1);
});
