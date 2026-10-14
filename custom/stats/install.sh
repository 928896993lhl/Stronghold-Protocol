#!/bin/sh
# 在线人数看板 + 每分钟采样 —— 安装或更新（本机定制的旁路服务）。
#
# 与其它定制不同，这套东西活在游戏安装目录**之外**，所以完全不碰 MANIFEST、
# 官方升级包也覆盖不到它：
#   /opt/stronghold/custom/stats/index.html                    看板页（nginx 以 /stats/ 提供，no-store）
#   /opt/stronghold/custom/stats/sample.py                     采样脚本（systemd 定时器每分钟一次）
#   /opt/stronghold/custom/stats/data/YYYY-MM-DD.ndjson        历史，每分钟一行，保留 30 天
#   stronghold-stats.{service,timer}                           systemd 单元
#
# 用法：sudo sh /opt/stronghold/custom/stats/install.sh
#
# 它做三件事：装 systemd 单元并起定时器 → 确保 nginx include 了 stats 配置 → 立刻采一次样。
# **不重启 stronghold 服务**（只 reload nginx），正在进行的对局不受影响。
#
# 数据口径：在线数只认 /healthz 的 sockets。sessions/rooms/matches 会把断线后等待恢复的
# 房间一直算进去（实测无人连接时三者都停在 75），已经在看板文案里标明。
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
SITE=/etc/nginx/sites-available/stronghold

echo "== 1. systemd 单元与定时器 =="
install -m 644 "$HERE/systemd/stronghold-stats.service" /etc/systemd/system/stronghold-stats.service
install -m 644 "$HERE/systemd/stronghold-stats.timer" /etc/systemd/system/stronghold-stats.timer
systemctl daemon-reload
systemctl enable --now stronghold-stats.timer

echo "== 2. nginx：把 /stats/ 挂上 =="
if grep -q "custom/stats/nginx-stats.conf" "$SITE"; then
  echo "  已有 include，跳过"
else
  cp -a "$SITE" "$SITE.bak.$(date +%Y%m%d-%H%M%S)"
  sed -i 's|^\( *\)include /opt/stronghold/custom/nginx-hash.conf;|\1include /opt/stronghold/custom/nginx-hash.conf;\n\1include /opt/stronghold/custom/stats/nginx-stats.conf;|' "$SITE"
  if grep -q "custom/stats/nginx-stats.conf" "$SITE"; then
    echo "  已插入 include（原配置已备份）"
  else
    echo "  !! 没找到 nginx-hash.conf 那行，请手工把下面这段加进 server 块："
    sed 's/^/     /' "$HERE/nginx-stats.conf"
  fi
fi
nginx -t && systemctl reload nginx

echo "== 3. 立刻采一次样 =="
systemctl start stronghold-stats.service || true
tail -n 1 "$HERE/data/$(date +%Y-%m-%d).ndjson" 2>/dev/null || echo "  （还没写出数据，等一分钟再看）"

echo
echo "看板：https://<你的域名>/stats/    数据目录：$HERE/data/"
