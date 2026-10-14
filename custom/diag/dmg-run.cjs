// 伤害统计面板端到端验证：进对局 → 部署干员 → 开战 → 采样面板数值增长。
const { chromium } = require('playwright');
const ORIGIN = process.env.SP_ORIGIN || 'https://sp.example.com';

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push('PE: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('CE: ' + m.text().slice(0, 150)); });

  const click = async (l, ms = 6000) => {
    const e = p.getByText(l, { exact: false }).first();
    if (!(await e.count().catch(() => 0))) return false;
    return e.click({ timeout: ms }).then(() => true).catch(() => false);
  };
  const snap = () => p.evaluate(async () => {
    const out = {};
    try {
      const R = (await import('/js/battle/runner.js')).battleRunner;
      const d = R._dbgAllies ? R._dbgAllies() : null;
      out.time = d ? d.time : null;
      out.finished = d ? d.finished : null;
      out.allyKinds = d ? d.units.map((u) => u.kind + ':' + (u.name || u.defId)) : null;
      out.rows = R.damageBoard(null, null, { min: 0, limit: 10 }).map((r) => (r.name || r.defId) + '=' + r.dmg);
    } catch (e) { out.err = e.message; }
    const el = document.querySelector('.dmgb');
    out.panel = !!el;
    out.panelText = (el ? (el.innerText || '') : '').replace(/\n+/g, ' | ').slice(0, 240);
    return out;
  });

  await p.goto(ORIGIN + '/', { waitUntil: 'load', timeout: 90000 });
  await p.waitForTimeout(4000);
  await p.locator('input').first().fill('伤害板验证').catch(() => {});
  await click('开始'); await p.waitForTimeout(6000);
  await click('独立模拟'); await p.waitForTimeout(1500);
  await click('开始独立模拟'); await p.waitForTimeout(12000);
  for (const l of ['出击', '开始模拟', '开始对局', '开始战斗']) { if (await click(l)) break; }
  await p.waitForTimeout(22000);
  console.log('[1 本局信息]', JSON.stringify(await snap()).slice(0, 200));

  await click('准备就绪'); await p.waitForTimeout(9000);
  for (const name of ['炎', '伊势', '维多利亚', '谢拉格', '拉特兰', '阿戈尔', '叙拉古', '卡西米尔']) {
    const el = p.getByText(name, { exact: true }).first();
    if (await el.count().catch(() => 0)) {
      if (await el.click({ timeout: 4000 }).then(() => true).catch(() => false)) { console.log('[2] 选中策略', name); break; }
    }
  }
  await p.waitForTimeout(2000);
  await click('确认选择'); await p.waitForTimeout(14000);
  console.log('[3 部署阶段]', JSON.stringify(await snap()).slice(0, 200));

  // 干员卡片：文本形如「2 / 跃跃 / 精准 / 回环射手」（首行是阶数）
  const cv = await p.$('canvas');
  const bb = cv ? await cv.boundingBox() : null;
  const cards = p.locator('button').filter({ hasText: /^\d+\s*\n/ });
  const nc = await cards.count().catch(() => 0);
  console.log('    首张卡片文本:', ((await cards.first().innerText().catch(() => '')) || '').replace(/s+/g, ' ').trim().slice(0, 30));
  for (let i = 0; i < Math.min(nc, 4); i++) {
    const txt = ((await cards.nth(i).innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    await cards.nth(i).click({ timeout: 4000 }).catch(() => {});
    await p.waitForTimeout(700);
    if (bb) {
      for (const [fx, fy] of [[0.5, 0.72], [0.43, 0.78], [0.57, 0.78], [0.5, 0.84]]) {
        await p.mouse.click(bb.x + bb.width * fx, bb.y + bb.height * fy, { delay: 50 });
        await p.waitForTimeout(600);
      }
    }
    console.log('    部署尝试:', txt.slice(0, 22));
  }
  await p.screenshot({ path: 'diag/dmg-deploy.png' });
  console.log('[5 部署后]', JSON.stringify(await snap()).slice(0, 320));

  await click('准备就绪'); await p.waitForTimeout(2600);
  if (await p.getByText('继续整备', { exact: false }).first().count().catch(() => 0)) {
    await p.locator('button').filter({ hasText: '准备就绪' }).last().click({ timeout: 5000 }).catch(() => {});
    console.log('[6] 已确认资金弹窗');
  }
  await p.waitForTimeout(6000);
  await p.screenshot({ path: 'diag/dmg-fight.png' });

  console.log('\n=== 战斗中采样 ===');
  let prev = '';
  for (let i = 0; i < 7; i++) {
    await p.waitForTimeout(7000);
    const s = await snap();
    const changed = s.panelText && s.panelText !== prev;
    console.log('  t+' + (i + 1) * 7 + 's panel=' + s.panel + ' time=' + s.time + ' finished=' + s.finished + (changed ? ' ↑' : ''));
    console.log('     面板: ' + (s.panelText || '(无)'));
    console.log('     数据: ' + ((s.rows || []).join(', ') || '(空)'));
    console.log('     单位: ' + ((s.allyKinds || []).slice(0, 6).join(' | ')));
    prev = s.panelText;
    if (s.finished) break;
  }
  await p.screenshot({ path: 'diag/dmg-board-live.png' });
  console.log('\n错误:', errs.length ? errs.slice(0, 5).join('\n') : '无');
  await b.close();
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });