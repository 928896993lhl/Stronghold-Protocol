#!/bin/sh
# 阵营许愿 (remake option) — apply or re-apply the 阵营许愿 patch over the official install.
#
# Six files are patched: server/match/pool.js, server/match/Match.js, server/lobby.js,
# shared/protocol.js, public/js/screens/room.js, public/css/screens/room.css. All six are listed in
# MANIFEST.json, so an official update package overwrites them. To keep the feature after an update:
#
#   1. extract the official update package over /opt/stronghold/Stronghold-Protocol
#   2. start the server ONCE — it verifies the update and consumes UPDATE.json. Afterwards
#      server/update.js no longer verifies the install on start (applyUpdate returns 'none' when
#      UPDATE.json is absent), so the patched files no longer keep the server from starting.
#   3. stop the server, run this script, start it again.
#
# Running this BEFORE step 2 would make the update's own check fail (fatal) and refuse to start.
# To go back to a stock install: cp -a /opt/stronghold/custom/base/. /opt/stronghold/Stronghold-Protocol/

set -eu
ROOT=/opt/stronghold/Stronghold-Protocol
PATCH=/opt/stronghold/custom/wish.patch
cd "$ROOT"
if patch -p1 --forward --no-backup-if-mismatch < "$PATCH"; then
  echo "[custom] 阵营许愿 applied"
else
  echo "[custom] 阵营许愿: nothing applied (already patched, or the files moved on — check by hand)"
fi
