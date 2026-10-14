// 实时伤害统计（右侧面板 · 本机定制功能）
//
// 本局战斗中，按干员列出累计造成的伤害，数字随战斗实时跳动。它读的是本机浏览器里
// `unit.stats.dmg`（sim/damage.js 的纯记账字段），不上报服务端 —— 所以联机时每位玩家看到的
// 是自己这一侧视角的同一场战斗，数据不会跨端同步（也不需要：对局结果由官方的结算页负责）。
//
// 口径与官方结算页「造成伤害」一致：只计从敌方身上扣掉的 HP；自有伤害、友伤、流失都不计入。

import { html, Icon, useTicker } from './components.js';
import { useState } from '../../vendor/hooks.module.js';
import { battleRunner } from '../battle/runner.js';
import { t } from '../../../shared/i18n.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** 伤害数值：过万折成「x.xx万」，其余千分位。 */
const fmt = (n) => {
  const v = Math.max(0, Math.round(Number(n) || 0));
  return v >= 100000 ? `${Math.round(v / 1000) / 100}万` : v.toLocaleString('en-US');
};

/**
 * @param {{ fieldId?: string|null, myId?: string|null, shopOpen?: boolean, enabled?: boolean }} props
 *   fieldId: 当前显示的战场（只统计这一场，避免切到队友视角时混入别人的数字）
 *   myId:   用来标出自己的干员
 *   enabled: false 时完全不渲染（设置里关掉）
 */
export function DamageBoard({ fieldId = null, myId = null, shopOpen = false, enabled = true }) {
  const [open, setOpen] = useState(true);
  // 只在展开时按 400ms 重绘；折叠时（0）停止，避免空转
  useTicker(open ? 400 : 0);

  if (!enabled || !battleRunner) return null;

  let rows = [];
  try { rows = battleRunner.damageBoard(fieldId, myId, { min: 1, limit: 12 }); } catch { rows = []; }
  if (!rows.length && !open) return null;

  const total = rows.reduce((s, r) => s + r.dmg, 0);
  const mates = rows.some((r) => !r.self);

  return html`
    <div class=${cx('dmgb', open && 'is-open', shopOpen && 'is-shop')} role="region" aria-label=${t('伤害统计')}>
      <button type="button" class="dmgb__head" aria-expanded=${open ? 'true' : 'false'}
        onClick=${() => setOpen((v) => !v)}>
        <${Icon} name="chevronRight" class="dmgb__caret" />
        <span class="dmgb__title">${t('伤害统计')}<//>
        <b class="num">${fmt(total)}<//>
      <//>
      ${open ? (rows.length ? html`
        <ol class="dmgb__list">
          ${rows.map((r) => html`
            <li key=${r.id} class=${cx('dmgb__row', !r.self && 'is-mate', !r.alive && 'is-down')}
                title=${t('造成伤害 {d}', { d: fmt(r.dmg) })}>
              <span class="dmgb__name">${r.name || t('干员')}<//>
              <span class="num">${fmt(r.dmg)}<//>
            <//>`)}
        </ol>` : html`<p class="dmgb__empty">${t('尚无伤害记录')}<//>`) : null}
      ${open && mates ? html`<p class="dmgb__note">${t('含队友')}<//>` : null}
    </div>`;
}