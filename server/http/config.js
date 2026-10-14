// server/http/config.js — where the server's settings come from. startServer() options win over the environment:
//
//   * PORT (default 3000), HOST (default '::', one dual-stack socket for IPv6 and IPv4);
//   * TRUST_PROXY ('auto' default: honour CF-Connecting-IP / X-Real-IP / X-Forwarded-For only from loopback/private
//     peers such as a local cloudflared; '1' always; '0' never) → net.js trustProxy;
//   * DEBUG → the console logger's debug level;
//   * SP_ASSET_INDEX=0 (or the `assetIndex: false` option) → no content-hash index: plain asset URLs, size-mtime ETags
//     (assetIndex.js); the index of the default public/ persists in .cache/asset-hashes.json;
//   * the served directories (public/, data/, shared/ and the content packs' packs/ of this repository unless the
//     options name others), and which startServer() options are handed on to net.js Network and lobby.js Lobby.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository root. */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const noopLog = { info() {}, warn() {}, error() {}, debug() {} };

/** startServer() options handed on to net.js Network / lobby.js Lobby (an absent one keeps that module's default). */
const NET_OPTION_KEYS = ['reconnectWindowMs', 'heartbeatMs', 'helloTimeoutMs', 'ratePerSec', 'rateBurst', 'maxConnections', 'abuseDropsPerSec',
  'maxConnectionsPerAddr', 'heavyPerSec', 'heavyBurst', 'trustProxy'];
const LOBBY_OPTION_KEYS = ['lobbyGraceMs', 'maxRooms', 'maxRoomsPerAddr', 'maxMatchesPerAddr', 'resyncMinGapMs', 'soloReconnectWindowMs'];

/**
 * Bind address used when neither the `host` option nor `HOST` says otherwise: one dual-stack socket, so the server
 * answers IPv6 and IPv4 alike without a second listener (Node keeps `ipv6Only` off for `::`).
 * `HOST=0.0.0.0` still means IPv4 only, `HOST=127.0.0.1` still means loopback only (a reverse proxy in front).
 */
export const DEFAULT_BIND_HOST = '::';

/**
 * Where to listen: the `port` / `host` options, else PORT / HOST, else port 3000 on DEFAULT_BIND_HOST.
 * An empty host is treated as unset.
 * @param {{ port?: number, host?: string }} opts
 * @returns {{ port: number, host: string }}
 * @throws {RangeError} when the port is not an integer in 0…65535
 */
export function listenAddress(opts) {
  const port = opts.port ?? (process.env.PORT != null && process.env.PORT !== '' ? Number(process.env.PORT) : 3000);
  const host = (opts.host || process.env.HOST) || DEFAULT_BIND_HOST;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new RangeError(`invalid PORT ${port}`);
  return { port, host };
}

/**
 * The hosts to try, in order, for a bind. Only the default is retried: a host with IPv6 switched off refuses `::`
 * with EAFNOSUPPORT / EADDRNOTAVAIL / EINVAL, and falling back to IPv4 beats not booting. An explicit HOST is literal.
 * @param {string} host a host out of listenAddress()
 * @returns {string[]}
 */
export function bindCandidates(host) {
  return host === DEFAULT_BIND_HOST ? [DEFAULT_BIND_HOST, '0.0.0.0'] : [host];
}

/**
 * The directories the static server reads (packsDir: the pack folders, server/packs.js).
 * @param {{ publicDir?: string, dataDir?: string, sharedDir?: string, packsDir?: string }} opts
 */
export function serveDirs(opts) {
  return {
    publicDir: opts.publicDir || path.join(ROOT, 'public'),
    dataDir: opts.dataDir || path.join(ROOT, 'data'),
    sharedDir: opts.sharedDir || path.join(ROOT, 'shared'),
    packsDir: opts.packsDir || path.join(ROOT, 'packs'),
  };
}

/**
 * The asset index options out of the startServer() options and the environment, or null for none: `assetIndex: false`
 * or SP_ASSET_INDEX=0 / off / false / no switches it off; `assetIndex: { cacheFile, delayMs }` overrides the defaults.
 * The hashes persist in .cache/asset-hashes.json only for the repository's own public/ (a test's temporary folder keeps
 * them in memory).
 * @param {{ assetIndex?: boolean | { cacheFile?: string | null, delayMs?: number } }} opts
 * @param {string} publicDir
 * @returns {{ cacheFile: string | null, delayMs?: number } | null}
 */
export function assetIndexOptionsFrom(opts, publicDir) {
  if (opts.assetIndex === false) return null;
  const env = String(process.env.SP_ASSET_INDEX ?? '').trim().toLowerCase();
  if (opts.assetIndex == null && ['0', 'off', 'false', 'no'].includes(env)) return null;
  const o = typeof opts.assetIndex === 'object' && opts.assetIndex ? opts.assetIndex : {};
  const own = path.resolve(publicDir) === path.join(ROOT, 'public');
  const cacheFile = o.cacheFile !== undefined ? o.cacheFile : (own ? path.join(ROOT, '.cache', 'asset-hashes.json') : null);
  return { cacheFile, ...(Number.isFinite(o.delayMs) ? { delayMs: o.delayMs } : {}) };
}

// ── 本机定制：让 LOBBY/NET_OPTION_KEYS 可以用环境变量覆盖 ────────────────────
// 上游这两个函数只从 startServer() 的 opts 取值，没有环境变量入口，所以
// maxConnectionsPerAddr（64）/ maxRoomsPerAddr（16）/ maxMatchesPerAddr（8）
// 这类"同一出口 IP 的上限"只能改代码才能调。服务器准备对外开放：手机流量
// 走 CGNAT 时几百人共享一个出口 IP，默认值会先于 maxRooms=1000 被撞到，
// 症状是"有些人死活连不上/建不了房"，很难排查。
//
// 写法刻意保守：只接受非负数，读不到就返回 null（保持上游默认值），
// 非数字型的键（如 trustProxy）取不到值会自动跳过，不影响原有行为。
// 识别两种名字：SP_MAX_ROOMS_PER_ADDR 和原样的小驼峰键名。
function envNumber(key) {
  const snake = key.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
  for (const name of ['SP_' + snake.toUpperCase(), key]) {
    const raw = process.env[name];
    if (raw == null || String(raw).trim() === '') continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

/** net.js Network options out of the startServer() options; `trustProxy` falls back to TRUST_PROXY. */
export function netOptionsFrom(opts) {
  const netOptions = {};
  for (const k of NET_OPTION_KEYS) {
    if (opts[k] != null) netOptions[k] = opts[k];
    else {
      const v = envNumber(k);
      if (v != null) netOptions[k] = v;
    }
  }
  if (netOptions.trustProxy == null) netOptions.trustProxy = parseTrustProxy(process.env.TRUST_PROXY);
  return netOptions;
}

/** lobby.js Lobby options out of the startServer() options. */
export function lobbyOptionsFrom(opts) {
  const lobbyOptions = {};
  for (const k of LOBBY_OPTION_KEYS) {
    if (opts[k] != null) lobbyOptions[k] = opts[k];
    else {
      const v = envNumber(k);
      if (v != null) lobbyOptions[k] = v;
    }
  }
  return lobbyOptions;
}

/** TRUST_PROXY env → net.js trustProxy ('auto' unless explicitly on/off). @param {string | undefined} v */
export function parseTrustProxy(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'always'].includes(s)) return true;
  if (['0', 'false', 'no', 'off', 'never'].includes(s)) return false;
  return 'auto';
}

/** The console logger (`quiet` → silent; debug lines only with DEBUG set). */
export function makeLogger(quiet) {
  if (quiet) return noopLog;
  return {
    info: (...a) => console.log(...a),
    warn: (...a) => console.warn(...a),
    error: (...a) => console.error(...a),
    debug: process.env.DEBUG ? (...a) => console.debug(...a) : () => {},
  };
}
