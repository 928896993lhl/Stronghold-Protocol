#!/usr/bin/env python3
"""certbot manual-auth-hook: 用 DNSPod API 添加 DNS-01 的 TXT 记录并等待传播。

certbot 对证书里的**每一个** SAN 域名都会各调用一次本脚本，所以必须按 CERTBOT_DOMAIN 推导记录名，
不能硬编码 —— 否则一张多域名证书（如 example.com + www.example.com）必然失败。

  sp.example.com     -> TXT _acme-challenge.sp.example.com     (sub_domain = _acme-challenge.sp)
  www.example.com    -> TXT _acme-challenge.www.example.com    (sub_domain = _acme-challenge.www)
  example.com        -> TXT _acme-challenge.example.com        (sub_domain = _acme-challenge)

certbot 注入的环境变量：CERTBOT_DOMAIN / CERTBOT_VALIDATION / CERTBOT_REMAINING_CHALLENGES。
凭据只在 /etc/letsencrypt/dns01/credentials（chmod 600），绝不写在本文件里。
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

API = "https://dnsapi.cn"
CRED = os.environ.get("DNS01_CRED") or "/etc/letsencrypt/dns01/credentials"
PARENT = os.environ.get("DNS01_PARENT") or ""
if not PARENT:
    raise SystemExit("FATAL: set DNS01_PARENT (e.g. example.com); this hook only performs DNS-01 for one parent domain")

# 传播检测走 DoH（纯 HTTP，不依赖 dig/nslookup）。
# 注意：DNSPod 的 http://119.29.29.29/d?...&type=TXT 对 TXT 一律返回 "0"，不能用它做检测。
DOH = [
    ("doh.pub", "https://doh.pub/resolve?name={q}&type=TXT"),
    ("alidns", "https://dns.alidns.com/resolve?name={q}&type=TXT"),
]

FIRST_SLEEP = 20
POLL_INTERVAL = 15
POLL_TIMES = 44                    # 20 + 44*15 ≈ 11 分钟，> DNSPod 最小 TTL 600s
GRACE_SLEEP = 150               # 传播确认后再等：CA 的验证节点（含境外二次验证）可能还持有 NXDOMAIN 负缓存
FALLBACK_SLEEP = 90                # 所有检测源都不可达时的退化等待


def log(*a):
    print("[dns01-auth]", *a, flush=True)


def load_cred():
    d = {}
    with open(CRED) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            d[k.strip()] = v.strip()
    for key in ("DNSPOD_ID", "DNSPOD_TOKEN"):
        if not d.get(key):
            raise SystemExit(f"FATAL: credentials 缺少 {key}")
    return d


def api(path, c, **params):
    data = {"login_token": f"{c['DNSPOD_ID']},{c['DNSPOD_TOKEN']}", "format": "json"}
    data.update(params)
    req = urllib.request.Request(API + path, data=urllib.parse.urlencode(data).encode())
    return json.load(urllib.request.urlopen(req, timeout=30))


def sub_for(domain):
    """域名 -> DNSPod 的 sub_domain（只影响 _acme-challenge 这一段的取值）。"""
    d = domain.strip().rstrip(".").lower()
    if d == PARENT:
        return "_acme-challenge"
    if d.endswith("." + PARENT):
        return "_acme-challenge." + d[: -(len(PARENT) + 1)]
    raise SystemExit(f"FATAL: {domain} 不属于 {PARENT}，本脚本的凭据无权为它做 DNS-01")


def fqdn_of(sub):
    return f"{sub}.{PARENT}"


def delete_all(c, sub):
    """只清本域名的残留（不能碰别的 SAN，否则多域名证书会互相抹掉）。"""
    r = api("/Record.List", c, domain=PARENT, sub_domain=sub)
    for x in (r.get("records") or []):
        if x.get("type") != "TXT":
            continue
        api("/Record.Remove", c, domain=PARENT, record_id=x["id"])
        log(f"已清理残留 TXT {sub} record_id={x['id']}")


def query_one(url):
    req = urllib.request.Request(url, headers={"accept": "application/dns-json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        j = json.load(r)
    for a in j.get("Answer") or []:
        if a.get("type") == 16:  # 16 = TXT
            return (a.get("data") or "").strip('"')
    return None


def resolves(fqdn, value):
    """多源 DoH 查询。所有成功返回的源都必须一致才算生效。"""
    got = {}
    for name, tpl in DOH:
        try:
            got[name] = query_one(tpl.format(q=urllib.parse.quote(fqdn)))
        except Exception as e:
            got[name] = None
            log(f"  [debug] {name} 查询失败: {e}")
    seen = [v for v in got.values() if v is not None]
    if not seen:
        return False, got
    return all(v == value for v in seen), got


def main():
    value = os.environ.get("CERTBOT_VALIDATION")
    domain = os.environ.get("CERTBOT_DOMAIN")
    remaining = os.environ.get("CERTBOT_REMAINING_CHALLENGES", "?")
    if not value:
        log("FATAL: CERTBOT_VALIDATION 未设置（不是由 certbot 调用的？）")
        return 1

    sub = sub_for(domain)
    fqdn = fqdn_of(sub)
    log(f"domain={domain} -> {fqdn} | token={value[:8]}... | 剩余挑战 {remaining}")

    c = load_cred()
    delete_all(c, sub)

    r = api("/Record.Create", c, domain=PARENT, sub_domain=sub,
            record_type="TXT", record_line="默认", value=value, ttl=600)
    st = r.get("status", {})
    if st.get("code") != "1":
        log("FATAL 创建 TXT 失败:", json.dumps(st, ensure_ascii=False))
        return 1
    rid = (r.get("record") or {}).get("id")
    log(f"已创建 TXT record_id={rid}，等待 DNS 传播...")

    time.sleep(FIRST_SLEEP)
    unreachable = 0
    for i in range(1, POLL_TIMES + 1):
        ok, got = resolves(fqdn, value)
        if ok:
            log(f"传播完成（约 {FIRST_SLEEP + i * POLL_INTERVAL} 秒）")
            log(f"再等 {GRACE_SLEEP} 秒，避开 CA 验证节点的负缓存/旧值")
            time.sleep(GRACE_SLEEP)
            return 0

        if all(v is None for v in got.values()):
            unreachable += 1
            log(f"  第 {i}/{POLL_TIMES} 次：所有检测源不可达（{unreachable}）")
            if unreachable >= 3:
                log(f"检测通道不可用，退化为固定等待 {FALLBACK_SLEEP} 秒后放行")
                time.sleep(FALLBACK_SLEEP)
                return 0
        else:
            stale = sorted({v for v in got.values() if v is not None and v != value})
            extra = f" 旧值仍在缓存(TTL=600): {stale}" if stale else ""
            log(f"  第 {i}/{POLL_TIMES} 次未生效 got={got}{extra}")
        time.sleep(POLL_INTERVAL)

    log("FATAL: 超时未传播，ACME 验证大概率会失败")
    return 1


if __name__ == "__main__":
    sys.exit(main())
