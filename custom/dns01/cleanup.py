#!/usr/bin/env python3
"""certbot manual-cleanup-hook: 验证结束后删掉本域名的 DNS-01 TXT 记录。

certbot 对每个 SAN 域名各调用一次，传各自的 CERTBOT_DOMAIN，所以同样按域名推导 sub_domain，
只删自己那条 —— 绝不能扫 `_acme-challenge` 前缀下的全部记录，多域名证书会互相抹掉。
"""
import json
import os
import sys
import urllib.parse
import urllib.request

API = "https://dnsapi.cn"
CRED = os.environ.get("DNS01_CRED") or "/etc/letsencrypt/dns01/credentials"
PARENT = os.environ.get("DNS01_PARENT") or ""
if not PARENT:
    raise SystemExit("FATAL: set DNS01_PARENT (e.g. example.com); this hook only performs DNS-01 for one parent domain")


def log(*a):
    print("[dns01-cleanup]", *a, flush=True)


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
    d = (domain or PARENT).strip().rstrip(".").lower()
    if d == PARENT:
        return "_acme-challenge"
    if d.endswith("." + PARENT):
        return "_acme-challenge." + d[: -(len(PARENT) + 1)]
    return "_acme-challenge"          # 拿不到 domain 时的兜底


def main():
    domain = os.environ.get("CERTBOT_DOMAIN", "(未提供)")
    sub = sub_for(domain)
    c = load_cred()
    r = api("/Record.List", c, domain=PARENT, sub_domain=sub)
    rows = [x for x in (r.get("records") or []) if x.get("type") == "TXT"]
    if not rows:
        log(f"{domain}: 无 TXT 记录，无需清理")
        return 0
    for x in rows:
        api("/Record.Remove", c, domain=PARENT, record_id=x["id"])
        log(f"{domain}: 已删除 TXT record_id={x['id']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
