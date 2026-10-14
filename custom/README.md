# 本机定制说明（custom/）

本仓库是 [sganggs/Stronghold-Protocol](https://github.com/sganggs/Stronghold-Protocol) 的个人部署复刻：
**上游 v0.2.6 + 下列 7 项本机定制**。定制全部以「补丁 + 应用脚本」的形式维护在 `custom/`，
官方升级后可无损重放；`server/sim/` 等主线代码零改动，联机同步的确定性不受影响。
（第 6、7 项动到 `server/`；第 6 项只碰 `http/config.js` 的两个选项装配函数，第 7 项改 `lobby.js` 与 `shared/protocol.js`。）

线上部署：`/opt/stronghold/Stronghold-Protocol`（systemd `stronghold.service`，Node 22，nginx 反代 + 腾讯云 CDN）。
本目录与服务器 `/opt/stronghold/custom/` 一一对应，差异见文末。

## 定制清单

| # | 功能 | 改动文件 | 应用方式 | 上线 |
|---|---|---|---|---|
| 1 | 阵营许愿：开局前每人选 1 个核心阵营，本局不被随机 ban（全队生效） | 7 个：room.css / board3d/load.js / room.js / lobby.js / Match.js / pool.js / protocol.js | `bash custom/apply-wish.sh`（wish.patch） | 2026-10-09 |
| 2 | Google Fonts 自托管：首屏消除 ~0.94 MB / 17 次跨站请求 | public/index.html + public/assets/fonts/ | `python3 custom/apply-fonts.py` | 2026-10-09 |
| 3 | v0.2.6 内容哈希 URL 剥离（`/assets/~<16hex>/...` 还原成真实路径） | nginx 配置 | `custom/nginx-hash.conf`（include） | 2026-10-13 |
| 4 | 实时伤害统计面板：右侧竖排显示每个干员本局累计伤害 / 击杀 / 承伤 | 4 个：game.css / runner.js / game.js / **damageBoard.js（新增）** | `bash custom/apply-damage-board.sh`（damage-board.patch） | 2026-10-14 |
| 5 | 在线人数汇总：标题页徽标 + 匹配页顶栏（20 s 轮询）+ 运营看板 `/stats/`（1 min 采样、24 h 曲线） | 5 个：title.js / title.css / screens/lobby.js / lobby.css / **ui/onlineCount.js（新增）** + `custom/stats/` 独立目录 | `bash custom/apply-online-count.sh` + `bash custom/stats/install.sh` | 2026-10-14 |

数据都来自上游公开的 `/healthz`（`server/http/routes.js`，上游自己的 `buildGuard.js` 也在拉），
零服务端改动。**在线数必须取 `sockets`**：`sessions` / `rooms` / `matches` 会把断线后仍保留、
等待恢复的房间一直算进去 —— 实测无人连接时这三项都停在 75 而 `sockets` 为 0，取错会虚高几十倍。
| 6 | 放开同 IP 上限：`maxConnectionsPerAddr` / `maxRoomsPerAddr` / `maxMatchesPerAddr` 支持环境变量覆盖 | 1 个：`server/http/config.js`（数值走 systemd drop-in，不在游戏目录内） | `sh custom/apply-addr-limits.sh` + **重启 stronghold** | 2026-10-14 |

上游这三个默认值（64 / 16 / 8）只能由代码传 `opts` 注入，没有环境变量入口。对外开放后
手机流量走 CGNAT 时几百人共享一个出口 IP，会先撞到它们，症状是「有些人连不上、建不了房」，
很像服务器挂了但其实是配额。**必须重启游戏服务才生效。**
| 7 | 快速匹配：选难度后自动进同难度的开放房间，没有就开一间等别人进来；房间页可看/切换「开放中·仅邀请」 | 5 个：server/lobby.js / shared/protocol.js / **screens/lobby.js** / screens/room.js / room.css | `sh custom/apply-quick-match.sh` + **重启 stronghold** | 2026-10-14 |

撮合只是 `create()` / `join()` 前面的一层查找，房间码、席位规则、同 IP 建房上限、
状态广播全部复用上游实现。**撮合发生在开局之前，与阵营许愿同一层，不碰 `server/sim/`。**
匹配进房后许愿与准备两步都原样保留（端到端已断言），只是不强制 —— 有人不许愿直接准备也能开局。

⚠️ **新增协议消息必须同时登记 `shared/protocol.js` 的 C2S 白名单**：`public/js/net.js`
的 `request()` / `send()` 会先跑 `validateC2S()`，未登记的 `t` 在浏览器本地就被拒
（控制台 `[net] refusing invalid …`），WebSocket 一个字节都不发，服务端日志完全没有痕迹。
当初阵营许愿的补丁带上 protocol.js 就是这个原因。

## 确定性三条铁律（为什么 sim/ 一个字节都没动）

服务端与客户端共用 `server/sim/` 同一份源码跑确定性模拟（固定 1/30s 步长 + 种子 PRNG），
`SP_COMBAT=client` 时战斗跑在玩家浏览器里。以下三项会破坏金样基线（`tools/golden.mjs`）
或联机同步，一律禁止：

1. **不读 `unit.s`** —— 惰性 getter，读它会触发 `_recalc()`，改变模拟结果；
2. **不调 `battle.rng` 的任何方法** —— `rng.shuffle` 会原地改数组；
3. **不新增 `_ev()` / `fx()` / `emit()`** —— golden 统计事件/特效计数，新增即移动基线；
   要加 snapshot 字段必须走 `ammoView` 旁挂列表模式，不能动 9 字段定长元组。

伤害面板因此只读 `unit.stats.dmg`（`sim/damage.js` 每击累加的纯记账字段，官方结算页已在用），
零 sim 改动；阵营许愿只改对局开始前的组队/匹配逻辑，不碰战斗模拟。

## 升级流程（0.2.x → 0.2.y）

1. 停服，`cp -a` 整目录备份；
2. 解压官方 update 包覆盖，启动一次让它按 MANIFEST 校验（不过会拒绝启动）；
3. **校验之前**，把「不在 update 包里、但被打过补丁」的文件还原成官方原版 —— 还原源必须用
   **目标版本 MANIFEST 的 sha256 反查**，绝不沿用上次升级的印象（曾因此连挂两次）；
4. 停服，依次重跑：`apply-wish.sh` → `apply-fonts.py` → `apply-damage-board.sh` →
   `apply-online-count.sh` → `apply-addr-limits.sh` → `apply-quick-match.sh`
   （后两个动 `server/`，必须重启 stronghold 才生效；
5. 启动，跑 `custom/diag/` 下的脚本回归（许愿 60 局、进对局、WebSocket、首屏流量、
   在线徽标、看板）。
   `custom/stats/` 是 nginx 旁路的独立目录（不在游戏目录内），**升级 update 包不会碰到它**，
   无需重装；只有 systemd 单元需要确认仍在 `/etc/systemd/system/`。

## 目录说明

```
custom/
├── wish.patch / apply-wish.sh              # 阵营许愿（7 文件）
├── damage-board.patch / apply-damage-board.sh   # 伤害统计面板（4 文件）
├── online-count.patch / apply-online-count.sh   # 在线人数徽标（5 文件）
├── addr-limits.patch / apply-addr-limits.sh     # 同 IP 上限可环境变量覆盖
├── quick-match.patch / apply-quick-match.sh      # 快速匹配（3 文件，含 protocol.js 白名单）
│   └── addr-limits.systemd.conf                 #   数值 drop-in（512 / 64 / 32）
├── stats/                                  # 运营看板（nginx 旁路，独立于游戏目录）
│   ├── index.html                          #   看板页面（4 卡片 + 今日统计 + 24h 曲线）
│   ├── sample.py                           #   每分钟采一次 /healthz，写 NDJSON（保留 30 天）
│   ├── install.sh                          #   一键安装：systemd timer + nginx include + 首采
│   ├── nginx-stats.conf                    #   location ^~ /stats/（含可选 IP 白名单段）
│   └── systemd/                            #   stronghold-stats.service + .timer
├── apply-fonts.py                          # 字体自托管（幂等；自动识别仓库/服务器布局）
├── fetch-fonts-bundle.py                   # 从 Google Fonts 再生字体包（woff2 + fonts.css）
├── fonts-bundle/fonts.css                  # 421 条 @font-face（woff2 二进制 10MB 不入库）
├── nginx-hash.conf                         # 内容哈希段剥离（两个坑见文件内注释）
├── nginx/stronghold.conf                   # 线上站点配置模板（域名已脱敏）
├── dns01/                                  # certbot DNS-01：auth/cleanup hook + 安装脚本
│   └── credentials.example                 #   凭据模板（真凭据只在服务器，600 权限，绝不入库）
├── dns/                                    # 一次性 DNS 记录脚本（DNSPod API）
├── diag/                                   # 验证脚本（来源见各文件头）
└── docs/                                   # 方案文档（CDN / 语音消息 / issue 分析）
```

## 部署要点

- **nginx**：`nginx-hash.conf` 必须 include 在 `server_name` 之后**第一行** —— 正则 location 按定义
  顺序取第一个匹配，且正则里不能写 `{16}`（花括号会被 nginx 当块分隔符，报
  `unknown directive "16}/"`）。
- **证书**：certbot DNS-01（80 端口境外不通，且 sp. 已被 CDN 强制 HTTPS，HTTP-01 不可用）。
  `dns01/install.sh` 一次性安装 hook 并改写 renewal 配置；之后 `certbot.timer` 自动续期。
  凭据文件格式见 `credentials.example`，只放服务器。
- **CDN（长期待办）**：CDN 证书**不**随 certbot 自动续期 —— 每次 certbot 签发后必须手动跑
  `node custom/diag/cdn-cert.js`（需先 scp 新证书到 `custom/diag/tmp/`）重新绑定到 CDN。
- **看板 `/stats/`**：`install.sh` 做三件事 —— 装 systemd timer（每分钟采样）、在站点配置的
  `nginx-hash.conf` include 之后插一行 `include .../stats/nginx-stats.conf`、`nginx -t` 通过后
  reload。**不重启 stronghold 服务**，进行中对局不受影响。`data/*.ndjson` 已 gitignore。
  `location ^~ /stats/` 用前缀匹配压过游戏侧那些 `/media/...` 正则 location，所以看板
  不会被游戏路由吃掉。看板默认公开，若要只在内网看，把 `nginx-stats.conf` 里的白名单段打开。
- **在线徽标**：纯客户端改动，靠 `buildTag.js` 的 size+mtime 短哈希触发玩家页面自动重载，
  部署后**不需要重启游戏服务**。
- **字体**：新 checkout 先 `python3 custom/fetch-fonts-bundle.py` 下载 woff2，再
  `python3 custom/apply-fonts.py`。Google 偶尔调整子集划分（数量可能不变、文件名会变），
  脚本内置 112/421 计数告警；再生得到的包自洽可用，但不保证与 2026-10-09 部署的二进制逐字节一致。

## 测试

```bash
# 需要本机 node_modules 里有 playwright / undici 等，NODE_PATH 指过去
NODE_PATH=<本机 node_modules> node custom/diag/session-urls.cjs      # 首屏请求构成
NODE_PATH=<本机 node_modules> node custom/diag/session-bytes4.cjs    # 整流程到进对局的流量
NODE_PATH=<本机 node_modules> node custom/diag/font-timing.cjs       # 字体相关耗时
NODE_PATH=<本机 node_modules> node custom/diag/ws-check.cjs          # WebSocket 是否活着
node custom/diag/dmg-run.cjs                                         # 伤害面板端到端（Playwright）
node custom/diag/online-check.cjs                                    # 在线徽标：/healthz 各字段 + 徽标文案
node custom/diag/stats-check.cjs                                     # 看板：/stats/ 200 + 四个数字 + 曲线

# CDN / 证书（腾讯云密钥走环境变量 TENCENT_SECRET_ID / TENCENT_SECRET_KEY）
CDN_DOMAIN=<加速域名> node custom/diag/cdn-verify.js
CDN_DOMAIN=<加速域名> node custom/diag/cdn-cert.js
```

脚本默认打 `https://sp.example.com`，用 `SP_ORIGIN` 指向实际地址。

## 安全与脱敏

- 本仓库**不含任何凭据**：DNSPod / 腾讯云密钥一律走环境变量或服务器本地文件；
  提交前以 `git grep -iE "password|secret|BEGIN .*KEY|AKIA|sk-|@2026"` 自查。
- 文档与脚本中的真实域名、服务器 IP 已脱敏为 `example.com` / `203.0.113.1`（RFC 5737）/
  `<源站IP>` 占位符；游戏访问地址不在任何提交里。

## 与服务器运行版的差异

| 文件 | 差异 | 原因 |
|---|---|---|
| `dns01/auth.py`、`cleanup.py` | 主域名改为 `DNS01_PARENT` 环境变量（无默认值，未设置即 FATAL） | 避免真实域名进入公开仓库；redeploy 时设一个变量即可，行为不变 |
| `apply-fonts.py` | 自动识别仓库/服务器布局；git checkout 内跳过 index.html 文件备份（tag 里有原版）；写文件锁定 `newline="\n"` | 服务器版在 Windows 下跑会把 LF 写成 CRLF |
| 字体 woff2 二进制 | 只在服务器 `custom/fonts-bundle/webfonts/`，不入库 | 10 MB 第三方二进制；`fetch-fonts-bundle.py` 可随时再生 |
| `diag/`、`dns/`、`nginx/`、`docs/` | 域名 / IP 脱敏为占位符 | 公开仓库不暴露部署信息 |
