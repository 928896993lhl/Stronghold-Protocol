#!/bin/bash
# 把 certbot 的 example.com 系证书从 HTTP-01（80 端口从境外连不通，且 sp. 已被 CDN 强制 HTTPS）改成 DNS-01。
#
# 用法（在本机执行；凭据经 stdin 注入，不进命令行、不进 history）：
#   scp auth.py cleanup.py install.sh <user>@<server>:/tmp/
#   ssh <user>@<server> 'bash /tmp/install.sh' < credentials
#
# 本脚本只安装，不签发、不 reload nginx —— 对正在进行的对局无影响。
set -eu

D=/etc/letsencrypt/dns01

echo "== 1. 安装 hook 脚本 =="
sudo mkdir -p "$D"
sudo install -m 700 /tmp/auth.py    "$D/auth.py"
sudo install -m 700 /tmp/cleanup.py "$D/cleanup.py"

echo "== 2. 写入凭据（chmod 600）=="
sudo tee "$D/credentials" > /dev/null
sudo chmod 600 "$D/credentials"
sudo chown root:root "$D/credentials"

echo "== 3. 备份并改写所有 renewal 配置 =="
sudo python3 - <<'PYEOF'
import glob, os, shutil, time

HOOKS = (
    "manual_auth_hook = /etc/letsencrypt/dns01/auth.py\n"
    "manual_cleanup_hook = /etc/letsencrypt/dns01/cleanup.py\n"
    # 必须写 dns-01：写 dns 不被 certbot 2.9 识别 —— hook 照常被调用，但 CA 收到的仍是
    # http-01 结果，报错极具迷惑性（"Invalid response from https://... 404"）。
    "pref_challenges = dns-01"
)

for path in sorted(glob.glob("/etc/letsencrypt/renewal/*.conf")):
    name = os.path.basename(path)
    s = open(path).read()
    if "manual_auth_hook" in s:
        print(f"  {name}: 已是 DNS-01，跳过")
        continue
    if "authenticator = nginx" not in s:
        print(f"  {name}: 不是 nginx authenticator，跳过（未改动）")
        continue
    shutil.copy2(path, f"{path}.bak.{time.strftime('%Y%m%d-%H%M%S')}")
    s = s.replace("authenticator = nginx", "authenticator = manual")
    lines = s.rstrip("\n").split("\n")
    lines.append(HOOKS)
    open(path, "w").write("\n".join(lines) + "\n")
    print(f"  {name}: 已改为 DNS-01（已备份）")
PYEOF

echo
echo "== 4. 复核 =="
sudo ls -la "$D"
for f in /etc/letsencrypt/renewal/*.conf; do
  echo "--- $f ---"
  sudo sed -n '/\[renewalparams\]/,$p' "$f"
done
echo
echo "安装完成。下一步："
echo "  sudo certbot renew --dry-run          # staging 验证，不签发真证书"
echo "  sudo certbot renew --force-renewal    # 验证通过后正式签发（会 reload nginx）"
