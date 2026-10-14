// 快速匹配端到端：开三个独立浏览器上下文（三个"路人"），
//   玩家 1、2 选同一难度 → 应落进同一个房间（房间码相同，/healthz humans 变 2、rooms 仍 1）
//   玩家 3 换一个难度 → 应另开一间（rooms 变 2）
// 运行：SP_ORIGIN=https://你的站点 node diag/quick-match-e2e.cjs
const { chromium } = require('playwright');

const ORIGIN = process.env.SP_ORIGIN || 'https://sp.example.com';
const errors = [];

const healthz = (page) => page.evaluate(async () => (await fetch('/healthz', { cache: 'no-store' })).json());

async function player(browser, name, diffName) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name} console: ${m.text}`); });

  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
  // 冷加载偶发慢（刚重启 / CDN 回源 / 客户端发现 build 变了会自己重载一次），给标题页加载加重试
  let title = null;
  for (let i = 0; i < 3 && !title; i++) {
    title = await page.waitForSelector('input[placeholder*="代号"]', { timeout: 30000 }).catch(() => null);
    if (!title) { console.log(`  (${name} 标题页第 ${i + 1} 次没出来，重载重试)`); await page.reload({ waitUntil: 'domcontentloaded' }); }
  }
  if (!title) throw new Error(`${name} 标题页始终没渲染`);
  await page.fill('input[placeholder*="代号"]', name);
  await page.click('button:has-text("开始")');
  await page.waitForSelector('.lobby-screen', { timeout: 30000 });

  const quick = page.locator('button:has-text("快速匹配")');
  await quick.waitFor({ timeout: 10000 }); // 按钮只在同盟模式下出现，这本身就验证了渲染
  if (diffName) await page.click(`.diff-card:has(.diff-card__name:text-is("${diffName}"))`);
  await quick.click();
  await page.waitForSelector('.invite__code', { timeout: 30000 });

  const code = (await page.locator('.invite__code').textContent()).replace(/\s+/g, '');
  // 关键：匹配进房之后，阵营许愿的入口必须还在（席位卡上的 .wish__btn）。
  // 许愿是房间阶段的事，开打后再许只会存到下一局，所以这里必须能看见它。
  const wishBtns = await page.locator('.wish__btn').count();
  // 准备按钮也必须还在：房主开局要求每个非房主人类都 ready
  const readyBtns = await page.locator('.seat__ready, .ready-btn, [class*=ready]').count();
  return { name, code, page, ctx, wishBtns, readyBtns };
}

(async () => {
  const browser = await chromium.launch();
  // 基线：服务器可能已有别人（或上一轮测试）留下的房间，断言一律用增量而不是绝对值
  const probe = await browser.newContext();
  const probePage = await probe.newPage();
  await probePage.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
  const hb = await healthz(probePage);
  await probe.close();
  console.log(`— 基线：rooms=${hb.rooms} humans=${hb.humans} —\n`);

  console.log('— 玩家 1：标准模拟，没有开放房间，应自己开一间 —');
  const p1 = await player(browser, '路人甲', null);
  const h1 = await healthz(p1.page);
  console.log(`  房间码 ${p1.code} | rooms=${h1.rooms} humans=${h1.humans}`);

  console.log('— 玩家 2：同难度，应落进玩家 1 的房间 —');
  const p2 = await player(browser, '路人乙', null);
  const h2 = await healthz(p2.page);
  console.log(`  房间码 ${p2.code} | rooms=${h2.rooms} humans=${h2.humans}`);

  console.log('— 玩家 3：换成险境模拟，应另开一间 —');
  const p3 = await player(browser, '路人丙', '险境模拟');
  const h3 = await healthz(p3.page);
  console.log(`  房间码 ${p3.code} | rooms=${h3.rooms} humans=${h3.humans}`);

  const checks = [
    ['玩家 1 与玩家 2 同房（撮合命中）', p1.code === p2.code],
    ['玩家 2 没有另开房间', h2.rooms === h1.rooms],
    ['玩家 2 进房后 humans +1', h2.humans === h1.humans + 1],
    // 玩家 1 可能进了一个已经存在的开放房间（那正是撮合命中），也可能自己开一间 —— 两种都对
    ['玩家 1 拿到了 4 位房间码', /^[A-Z]{4}$/.test(p1.code)],
    ['玩家 1 之后房间数没有减少', h1.rooms >= hb.rooms],
    ['换难度后另开一间', p3.code !== p1.code],
    ['换难度后 rooms +1', h3.rooms === h2.rooms + 1],
    // 匹配进房后原有的两步必须都还在（不强制，但不能消失）
    ['匹配后阵营许愿入口仍在', p1.wishBtns > 0 && p2.wishBtns > 0],
    ['匹配后准备入口仍在', p1.readyBtns > 0],
  ];
  console.log(`\n  许愿按钮数：玩家1=${p1.wishBtns} 玩家2=${p2.wishBtns} | 准备相关元素：${p1.readyBtns}`);
  console.log('');
  let bad = 0;
  for (const [label, ok] of checks) { if (!ok) bad++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`); }
  console.log('');
  console.log('errors:', errors.length ? errors : '(none)');
  await p1.page.screenshot({ path: 'diag/quick-match-p1.png' });
  await browser.close();
  process.exit(bad === 0 && errors.length === 0 ? 0 : 1);
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
