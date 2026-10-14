#!/bin/sh
# 快速匹配（本机定制）—— apply or re-apply over the official install.
#
# 两个文件：
#   server/lobby.js            新增 room.quickMatch / room.setOpen，Room.open 字段，开局清标记
#   public/js/screens/lobby.js 「快速匹配」按钮（仅同盟模式显示）
#
# 行为：选难度后点「快速匹配」→ 服务端找一个同 mode+difficulty、未开局、有空位的
# 开放房间直接 join；找不到就帮你 create 一间并标记为开放，别人点同样的按钮会进来。
# 独立模拟没有可撮合对象（solo 房只容 1 人），直接建，不开放。
#
# ⚠️ 顺序依赖：本补丁的上下文里带着「阵营许愿」的改动（wish 也改 lobby.js），
#    所以必须先跑过 apply-wish.sh 才能应用。拿纯净 v0.2.6 直接打会 fuzz 甚至错位。
#    重放基线是「v0.2.6 + 此前所有已应用的定制」，不是纯净上游。
#
# 安全：撮合发生在开局之前，与阵营许愿同一层 —— 不碰 server/sim/，不改种子、
# 不改 ban 池，不影响联机同步的确定性。create()/join() 全部复用上游实现，
# 房间码、席位规则、同 IP 建房上限、状态广播都与官方一致。
#
# 这两个文件都在 MANIFEST.json 里 → 官方 update 包会覆盖它们，升级后重跑本脚本。
# 因为是 server/ 改动，**必须重启 stronghold 才生效**（脚本不自动重启，避免打断对局）。
# 撤销：git checkout -- server/lobby.js public/js/screens/lobby.js

set -eu
ROOT=/opt/stronghold/Stronghold-Protocol
PATCH=/opt/stronghold/custom/quick-match.patch
cd "$ROOT"

if ! grep -q "room.wish" server/lobby.js; then
  echo "[custom] 中止：lobby.js 里没有阵营许愿的痕迹，请先跑 apply-wish.sh（本补丁依赖它的上下文）" >&2
  exit 1
fi

if patch -p1 --forward --no-backup-if-mismatch < "$PATCH"; then
  echo "[custom] 快速匹配 applied"
else
  echo "[custom] 快速匹配: nothing applied (already patched, or the files moved on — check by hand)"
  exit 0
fi

echo "[custom] server/ 有改动，生效需要重启：sudo systemctl restart stronghold"
