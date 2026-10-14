#!/bin/sh
# 实时伤害统计面板（本机定制功能）—— apply or re-apply over the official install.
#
# 四个文件：新增 public/js/ui/damageBoard.js，改 public/js/battle/runner.js（加只读聚合方法
# damageBoard / _dbgAllies）、public/js/screens/game.js（挂载）、public/css/screens/game.css（样式）。
#
#   public/js/ui/damageBoard.js  —— 新增面板组件
#   public/js/battle/runner.js   —— 加 damageBoard()：读本机模拟里的 unit.stats.dmg
#   public/js/screens/game.js    —— 在 div.gm__hud 里挂载 <DamageBoard/>
#   public/css/screens/game.css  —— .dmgb* 样式
#
# 安全前提（重要）：本功能**完全不碰 server/sim/**。数据源 unit.stats.dmg 是官方结算页
# （sim/battle/lifecycle.js compactResult 上报、js/screens/result.js 显示）已经在用的记账字段，
# 只读它不会消耗 battle.rng、不新增任何 _ev/fx/emit 调用，因此不影响确定性模拟与联机同步。
# 注意组件读的是 u.stats（普通数字字段），不是 u.s（getter，会触发 units.js 的 _recalc()）。
#
# 与阵营许愿 patch 同理：这些文件都在 MANIFEST.json 里，官方 update 包会覆盖它们。
# 升级后重新应用的顺序见 apply-wish.sh 的注释（必须先让服务器启动一次消耗掉 UPDATE.json，
# 否则本脚本的改动会让校验失败而拒绝启动）。
#
# 回到官方原版：cp -a /opt/stronghold/custom/base026/. <install>/

set -eu
ROOT=/opt/stronghold/Stronghold-Protocol
PATCH=/opt/stronghold/custom/damage-board.patch
cd "$ROOT"
if patch -p1 --forward --no-backup-if-mismatch < "$PATCH"; then
  echo "[custom] 实时伤害统计 applied"
else
  echo "[custom] 实时伤害统计: nothing applied (already patched, or the files moved on — check by hand)"
fi