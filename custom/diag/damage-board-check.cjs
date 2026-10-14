// 验证「实时伤害统计」面板：进对局 → 让战斗跑起来 → 采样 .dmgb 的内容，看伤害数字是否随战斗增长。
const { chromium } = require('playwright');
const ORIGIN = process.env.SP_ORIGIN || 'https://sp.example.com';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });

  const clickText = async (label) => {
    const el = page.getByText(label, { exact: false }).first();
    if (!(await el.count().catch(() => 0))) return false;
    return el.click({ timeout: 6000 }).then(() => true).catch(() => false);
  };

  await page.goto(ORIGIN + '/', { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(5000);

  await page.locator('input').first().fill('DMG测试').catch(() => {});
  await page.waitForTimeout(500);
  await clickText('开始');
  await page.waitForTimeout(6000);
  await clickText('独立模拟');
  await page.waitForTimeout(1500);
  await clickText('开始独立模拟');
  await page.waitForTimeout(12000);
  for (const l of ['出击', '开始模拟', '开始对局', '开始战斗']) { if (await clickText(l)) break; }
  await page.waitForTimeout(18000);
  const btns = await page.$$eval('button', (bs) =>
    bs.map((b) => (b.innerText || '').trim()).filter(Boolean).slice(0, 14)).catch(() => []);
  console.log('已进入对局，按钮:', JSON.stringify(btns));

  // 选择策略（开局策略）→ 确认选择 → 准备就绪
  const confirm = page.getByText('确认选择', { exact: false }).first();
  if (await confirm.count().catch(() => 0)) {
    await confirm.click({ timeout: 8000 }).catch(() => {});
    console.log('已确认开局策略');
    await page.waitForTimeout(6000);
  }
  const ready = page.getByText('准备就绪', { exact: false }).first();
  if (await ready.count().catch(() => 0)) {
    await ready.click({ timeout: 6000 }).catch(() => {});
    console.log('已点击「准备就绪」');
  }
  await page.waitForTimeout(6000);
  const btns2 = await page.$$eval('button', (bs) =>
    bs.map((b) => (b.innerText || '').trim()).filter(Boolean).slice(0, 14)).catch(() => []);
  console.log('当前按钮:', JSON.stringify(btns2));

  // 采样：每 6 秒读一次面板，看数字是否增长
  const read = () => page.evaluate(() => {
    const el = document.querySelector('.dmgb');
    if (!el) return { present: false };
    const rows = [...el.querySelectorAll('.dmgb__row')].map((r) => ({
      name: (r.querySelector('.dmgb__name')?.textContent || '').trim(),
      dmg: (r.querySelector('.num')?.textContent || '').trim(),
      cls: r.className,
    }));
    const b = el.getBoundingClientRect();
    return {
      present: true,
      open: el.className.includes('is-open'),
      head: (el.querySelector('.dmgb__title')?.textContent || '').trim(),
      total: (el.querySelector('.dmgb__head b')?.textContent || '').trim(),
      rows,
      box: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) },
    };
  });

  console.log('\n=== 采样 ===');
  let prev = null;
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(6000);
    const s = await read();
    if (!s.present) { console.log(`  t+${(i + 1) * 6}s  面板未出现`); continue; }
    const sum = s.rows.reduce((a, r) => a + (Number(String(r.dmg).replace(/[^\d]/g, '')) || 0), 0);
    const grew = prev != null && sum > prev;
    console.log(`  t+${(i + 1) * 6}s  面板=${s.present ? '在' : '无'} 展开=${s.open} 标题="${s.head}" 合计=${s.total} 行数=${s.rows.length}${grew ? ' ↑增长' : ''}`);
    console.log(`         位置 x=${s.box.x} y=${s.box.y} ${s.box.w}×${s.box.h}px`);
    for (const r of s.rows.slice(0, 5)) console.log(`           · ${r.name.padEnd(10)} ${r.dmg.padStart(8)}${r.cls.includes('is-mate') ? '  [队友]' : ''}${r.cls.includes('is-down') ? '  [已阵亡]' : ''}`);
    if (s.rows.length === 0) console.log('           （暂无伤害记录）');
    prev = sum;
  }

  await page.screenshot({ path: 'diag/damage-board.png' });
  console.log('\n截图: diag/damage-board.png');

  // 折叠 / 展开
  const head = page.locator('.dmgb__head').first();
  if (await head.count().catch(() => 0)) {
    await head.click().catch(() => {});
    await page.waitForTimeout(1200);
    const c = await read();
    console.log(`折叠后: open=${c.open} box=${c.box.w}×${c.box.h}`);
    await page.screenshot({ path: 'diag/damage-board-collapsed.png' });
    await head.click().catch(() => {});
    await page.waitForTimeout(1000);
    console.log('再点已恢复展开');
  }

  console.log('\n=== JS 错误 ===');
  console.log(errs.length ? errs.slice(0, 8).join('\n') : '  无');
  await browser.close();
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });