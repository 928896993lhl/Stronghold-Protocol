#!/bin/bash
# 通过 DNSPod API 为 example.com 添加子域名 A 记录
# 用法（密钥只走环境变量，绝不落盘、绝不入库）：
#   DNSPOD_ID=<ID> DNSPOD_TOKEN=<Token> bash dnspod-add-record.sh
set -u

: "${DNSPOD_ID:?需要 DNSPOD_ID}"
: "${DNSPOD_TOKEN:?需要 DNSPOD_TOKEN}"

DOMAIN=example.com
SUB="${DNS_SUB:-sp}"
VALUE="${DNS_VALUE:-203.0.113.1}"

echo "== 1. 查询是否已有 $SUB.$DOMAIN 记录 =="
EXIST=$(curl -s -X POST https://dnsapi.cn/Record.List \
  -d "login_token=${DNSPOD_ID},${DNSPOD_TOKEN}&format=json&domain=${DOMAIN}&sub_domain=${SUB}")
echo "$EXIST" | head -c 800
echo

echo
echo "== 2. 添加 A 记录 $SUB.$DOMAIN -> $VALUE =="
RESULT=$(curl -s -X POST https://dnsapi.cn/Record.Create \
  -d "login_token=${DNSPOD_ID},${DNSPOD_TOKEN}&format=json&domain=${DOMAIN}&sub_domain=${SUB}&record_type=A&record_line=默认&value=${VALUE}&ttl=600")
echo "$RESULT"
echo

echo "== 3. 复查解析 =="
for d in 119.29.29.29 223.5.5.5; do
  printf '%-14s ' "$d"
  dig +short A "${SUB}.${DOMAIN}" "@$d" | head -1
  echo
done
