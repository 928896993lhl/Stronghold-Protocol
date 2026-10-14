// Does the real browser still get a working websocket through nginx + HTTP/2?
// curl forced onto HTTP/2 gets 404 (nginx cannot proxy an Upgrade over h2), but browsers open wss://
// on a separate HTTP/1.1 connection, so that curl result is not what a player sees. This is the decisive test.
const { chromium } = require('playwright');
const ORIGIN = process.env.SP_ORIGIN || 'https://sp.example.com';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.addInitScript(() => {
    window.__ws = [];
    const Orig = window.WebSocket;
    const Patched = function (...args) {
      const ws = new Orig(...args);
      window.__ws.push({ ev: 'created', url: String(args[0]) });
      ws.addEventListener('open', () => window.__ws.push({ ev: 'open', url: String(args[0]) }));
      ws.addEventListener('error', () => window.__ws.push({ ev: 'error', url: String(args[0]) }));
      ws.addEventListener('close', (e) => window.__ws.push({ ev: 'close', code: e.code, reason: e.reason }));
      return ws;
    };
    Patched.prototype = Orig.prototype;
    for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) Patched[k] = Orig[k];
    window.WebSocket = Patched;
  });

  page.on('console', (m) => {
    if (m.type() === 'error') console.log('  [page error]', m.text().slice(0, 160));
  });
  page.on('pageerror', (e) => console.log('  [page exception]', String(e).slice(0, 160)));

  await page.goto(ORIGIN + '/', { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(9000);

  const log = await page.evaluate(() => window.__ws);
  console.log('--- WebSocket 事件 ---');
  if (!log.length) console.log('  (none - the page never opened a socket)');
  for (const e of log) console.log('  ' + JSON.stringify(e));

  const protos = await page.evaluate(() =>
    performance.getEntriesByType('resource').reduce((acc, e) => {
      acc[e.nextHopProtocol] = (acc[e.nextHopProtocol] || 0) + 1;
      return acc;
    }, {})
  );
  console.log('--- 协商协议分布 ---', JSON.stringify(protos));

  await browser.close();
})().catch((e) => {
  console.error('FAILED', e.message);
  process.exit(1);
});
