#!/usr/bin/env python3
"""每 60 秒抓一次本机的 /healthz，把在线人数摘要追加成 NDJSON（一天一个文件）。

由 systemd timer 调用（custom/stats/systemd/）。写出来的文件由 nginx 以 no-store
提供给看板（index.html 读 data/YYYY-MM-DD.ndjson）。

  STATS_HEALTHZ=http://127.0.0.1:3000/healthz   STATS_DATA_DIR=/opt/stronghold/custom/stats/data
  python3 sample.py

为什么要单独采样：/healthz 只给「此刻」的快照，历史曲线得自己存。每分钟一次、一行 JSON，
一天约 1440 行、几十 KB，保留 30 天。
"""
import glob
import json
import os
import time
import urllib.request

URL = os.environ.get("STATS_HEALTHZ", "http://127.0.0.1:3000/healthz")
DATA_DIR = os.environ.get("STATS_DATA_DIR", "/opt/stronghold/custom/stats/data")
RETAIN_DAYS = 30
KEEP = ("sessions", "humans", "bots", "rooms", "matches", "spectators", "sockets")


def main():
    try:
        with urllib.request.urlopen(URL, timeout=5) as r:
            j = json.load(r)
    except Exception as e:  # 服务器正在重启时采不到：打一行日志就走，不要挂住 timer
        print("sample failed: %s" % e)
        return 1

    ts = int(time.time())
    row = {"ts": ts}
    for k in KEEP:
        row[k] = j.get(k, 0)
    row["uptimeSec"] = j.get("uptimeSec", 0)

    os.makedirs(DATA_DIR, exist_ok=True)
    day = time.strftime("%Y-%m-%d", time.localtime(ts))
    with open(os.path.join(DATA_DIR, day + ".ndjson"), "a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")

    # 只留最近 RETAIN_DAYS 天（按文件 mtime，够用且不用解析文件名）
    cutoff = time.time() - RETAIN_DAYS * 86400
    for p in glob.glob(os.path.join(DATA_DIR, "*.ndjson")):
        try:
            if os.path.getmtime(p) < cutoff:
                os.remove(p)
        except OSError:
            pass

    print(json.dumps(row, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
