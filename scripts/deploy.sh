#!/usr/bin/env bash
# Build here, ship the standalone bundle, restart the service there.
#
# Usage: HOST=viy bash scripts/deploy.sh
#   HOST 是 ~/.ssh/config 里的条目名（或 user@ip）。
#
# 构建绝不在服务器上跑：那台只有 1.9G 内存且已被别的服务占掉大半，next build
# 峰值一定 OOM。服务器只解包和重启，见 docs/adr/0008。
#
# 首次部署（服务器上跑一次）：
#   dnf install -y nodejs
#   useradd --system --home-dir /opt/hr-plaza --shell /sbin/nologin plaza
#   mkdir -p /opt/hr-plaza && chown plaza:plaza /opt/hr-plaza
#   scp .env.local $HOST:/etc/hr-plaza.env   # PUBLIC_BASE_URL 要改成公网地址
#   chown root:plaza /etc/hr-plaza.env && chmod 640 /etc/hr-plaza.env
#   scp deploy/hr-plaza.service $HOST:/etc/systemd/system/
#   systemctl daemon-reload && systemctl enable --now hr-plaza
#   dnf install -y caddy
#   scp deploy/Caddyfile $HOST:/etc/caddy/Caddyfile   # 域名改成你的
#   systemctl enable --now caddy                      # 安全组要放行 80 和 443

set -euo pipefail
: "${HOST:?set HOST to the ssh target, e.g. HOST=viy}"

REMOTE_DIR=/opt/hr-plaza
BUNDLE="$(mktemp -d)/plaza.tgz"
trap 'rm -rf "$(dirname "$BUNDLE")"' EXIT

echo "==> build"
npx next build

# standalone 不含 static 和 public，Next 要求手工并进去。
echo "==> pack"
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
[[ -d public ]] && cp -r public .next/standalone/public
tar czf "$BUNDLE" -C .next/standalone .
du -h "$BUNDLE" | cut -f1 | xargs echo "    bundle:"

echo "==> upload"
scp -q "$BUNDLE" "$HOST:/tmp/plaza.tgz"

# 解到旁边再原子替换：解包失败也不会留下一个跑不起来的半成品目录。
echo "==> swap in and restart"
ssh "$HOST" "set -e
  rm -rf $REMOTE_DIR/current.new
  mkdir -p $REMOTE_DIR/current.new
  tar xzf /tmp/plaza.tgz -C $REMOTE_DIR/current.new
  rm -f /tmp/plaza.tgz
  rm -rf $REMOTE_DIR/previous
  [[ -d $REMOTE_DIR/current ]] && mv $REMOTE_DIR/current $REMOTE_DIR/previous
  mv $REMOTE_DIR/current.new $REMOTE_DIR/current
  chown -R plaza:plaza $REMOTE_DIR
  systemctl restart hr-plaza"

echo "==> verify"
sleep 3
# 打 :3000 而不是 :80 —— 80 是 Caddy，Host 又对不上任何站点，只能证明 Caddy 活着，
# 证明不了刚部署的应用能出页面。
ssh "$HOST" 'systemctl is-active hr-plaza; curl -s -o /dev/null -w "    / %{http_code}\n" http://127.0.0.1:3000/'
