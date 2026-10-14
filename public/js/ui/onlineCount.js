// public/js/ui/onlineCount.js — 服务器在线人数（本机定制，见 custom/online-count.patch）
//
// 数据源是上游本来就公开的 GET /healthz：
//   sockets    活着的 WebSocket 连接数 —— 这才是「在线」：实测开 1 个标签页就是 1
//   sessions   会话数（含断线后仍保留、可恢复的那些，会长期虚高，不能当在线数）
//   matches    进行中的对局数（同样含断线残留）
//   rooms      房间数
//   spectators 观战人数
// 上游自己的 public/js/ui/buildGuard.js 就在拉同一个接口，所以这里不需要任何服务端改动：
// 响应头是 Cache-Control: no-store，实测 CDN 边缘每次都是 Cache Miss（Age: 0），
// 拿到的永远是当时的值，不会被缓存成过期数字。
//
// 拉不到就什么都不显示 —— 在线人数是装饰，不能让它给标题页带来报错或抖动。

import { html } from './components.js';
import { useEffect, useState } from '../../vendor/hooks.module.js';
import { t } from '../../../shared/i18n.js';

const POLL_MS = 20000;    // 20 s：比玩家进出的节奏快，对 /healthz 又几乎白给
const MAX_WAIT_MS = 4000; // 服务端卡住时不要让请求一直吊着

/**
 * @param {{ pollMs?: number }} props
 */
export function OnlineCount({ pollMs = POLL_MS } = {}) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let alive = true;
    let timer = null;
    const read = async () => {
      const ctrl = new AbortController();
      const stop = setTimeout(() => ctrl.abort(), MAX_WAIT_MS);
      try {
        const res = await fetch('/healthz', { cache: 'no-store', signal: ctrl.signal });
        const j = res.ok ? await res.json() : null;
        // 只信 sockets：sessions/rooms/matches 会把断线后等待恢复的房间一直算进去
        // （实测：无人连接时 sessions 仍长期停在 75，sockets 是 0）。
        if (alive && j) setStats({ online: j.sockets | 0 });
      } catch {
        /* 拉不到就保留上一次的值：服务器抖动时不要闪 */
      } finally {
        clearTimeout(stop);
      }
    };
    read();
    timer = setInterval(read, pollMs);
    return () => { alive = false; if (timer) clearInterval(timer); };
  }, [pollMs]);

  if (!stats) return null;
  return html`<div class="onlc" role="note" title=${t('当前连着服务器的玩家数')}>
    <span class="onlc__dot"></span>
    <span><b>${stats.online}</b> ${t('人在线')}</span>
  </div>`;
}
