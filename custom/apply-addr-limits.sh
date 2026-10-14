#!/bin/sh
# 放宽「同一出口 IP」的连接 / 房间 / 对局上限（本机定制）—— apply or re-apply.
#
# 做两件事：
#   1. 给 server/http/config.js 打补丁，让 LOBBY/NET_OPTION_KEYS 支持环境变量覆盖
#   2. 写一份 systemd drop-in，把具体数值设进去
#
# 为什么需要：上游这三个默认值（64 / 16 / 8）只能由代码传 opts 注入，
# 没有环境变量入口，等于改不动。服务器对外开放后，手机流量走 CGNAT 时
# 几百人共享一个出口 IP，会先撞到这三个值，症状是「有些人连不上、建不了房」，
# 而 maxRooms=1000 还远远没到 —— 很容易误判成服务器挂了。
#
# 补丁只碰 config.js 的 netOptionsFrom() / lobbyOptionsFrom()，加一层
# envNumber()：读不到环境变量就返回 null，沿用上游默认值；非数字型的键
# （trustProxy 这类）取不到值会自动跳过。代码里显式传的 opts 仍然优先。
#
# config.js 在 MANIFEST.json 里 → 官方 update 包会覆盖它，升级后重跑本脚本。
# drop-in 不在游戏目录里，升级碰不到。
# 撤销：git checkout -- server/http/config.js，并删掉 drop-in 后 daemon-reload。
#
# 生效需要重启：sudo systemctl restart stronghold（脚本不自动重启，避免打断对局）

set -eu
ROOT=/opt/stronghold/Stronghold-Protocol
CUSTOM=/opt/stronghold/custom
PATCH=$CUSTOM/addr-limits.patch
DROPIN_DIR=/etc/systemd/system/stronghold.service.d
DROPIN=$DROPIN_DIR/addr-limits.conf

cd "$ROOT"
if patch -p1 --forward --no-backup-if-mismatch < "$PATCH"; then
  echo "[custom] config.js: 环境变量覆盖层 applied"
else
  echo "[custom] config.js: nothing applied (already patched, or the file moved on — check by hand)"
fi

if [ ! -f "$DROPIN" ]; then
  sudo mkdir -p "$DROPIN_DIR"
  sudo cp "$CUSTOM/addr-limits.systemd.conf" "$DROPIN"
  sudo systemctl daemon-reload
  echo "[custom] systemd drop-in 已写入: $DROPIN"
else
  echo "[custom] systemd drop-in 已存在，未覆盖: $DROPIN"
fi

echo "[custom] 数值生效需要重启：sudo systemctl restart stronghold"
