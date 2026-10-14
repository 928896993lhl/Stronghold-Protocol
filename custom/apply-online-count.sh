#!/bin/sh
# 在线人数徽标（本机定制功能）—— apply or re-apply over the official install.
#
# 五个文件：新增 public/js/ui/onlineCount.js，改 public/js/screens/title.js（引入 + 挂载）、
# public/css/screens/title.css（.onlc* 样式）、public/js/screens/lobby.js（匹配页顶栏挂载）、
# public/css/screens/lobby.css（顶栏内 align-self 覆盖）。
#
#   public/js/ui/onlineCount.js  —— 每 20 秒拉一次公开的 GET /healthz，显示「N 人在线」
#   public/js/screens/title.js   —— 在 .title-login 卡片顶部挂载 <OnlineCount/>
#   public/css/screens/title.css —— 胶囊样式与呼吸灯动画（onlc-pulse）
#   public/js/screens/lobby.js   —— 匹配页顶栏、ping 旁边挂同一个 <OnlineCount/>
#   public/css/screens/lobby.css —— .topbar .onlc { align-self: center; flex: none; }（横向顶栏适配）
#
# 注意 lobby.js 段的基线是上游原版（含快速匹配的改动在 quick-match.patch 里，顺序在本补丁之后），
# 全链条重放（wish → damage-board → 本补丁 → addr-limits → quick-match）已在 2026-10-14 验证过：
# 15 文件 + 2 新增与定制品逐字节一致。
#
# 安全前提：只读上游本来就公开的 /healthz（上游自己的 public/js/ui/buildGuard.js 每次页面
# 加载都在拉它），不碰 server/**，不改协议，不影响确定性模拟与联机同步。响应头是
# Cache-Control: no-store，实测 CDN 边缘每次都是 Cache Miss，不会缓存成过期数字。
#
# 口径（实测教训，别再改回 sessions）：在线数必须取 /healthz 的 sockets ——
# 断线后仍保留、可恢复的 sessions/rooms/matches 会长期虚高（实测无人连接时 sessions 停在 75、
# rooms/matches 也停在 75，而 sockets 是 0），拿它当在线数会差一个数量级。
#
# 看板与采样器（/stats/）不在这个补丁里：它们是游戏安装目录之外的旁路服务，
# 安装见 custom/stats/install.sh。
#
# 这些文件都在 MANIFEST.json 里，官方 update 包会覆盖它们 → 升级后按 apply-wish.sh 的顺序重跑本脚本。
# 回到官方原版：git checkout -- public/js/screens/title.js public/css/screens/title.css && rm -f public/js/ui/onlineCount.js

set -eu
ROOT=/opt/stronghold/Stronghold-Protocol
PATCH=/opt/stronghold/custom/online-count.patch
cd "$ROOT"
if patch -p1 --forward --no-backup-if-mismatch < "$PATCH"; then
  echo "[custom] 在线人数徽标 applied"
else
  echo "[custom] 在线人数徽标: nothing applied (already patched, or the files moved on — check by hand)"
fi
