#!/usr/bin/env bash
# Recreate the 「HR NEXT 技能广场」Base from scratch in whichever Feishu tenant
# lark-cli is currently authenticated against.
#
# IMPORTANT: run `lark-cli auth status` first and confirm the identity is the
# community/test account, NOT a corporate tenant. Per ADR-0005 the Base must end
# up owned by the community (群主), never by an individual's employer tenant.
#
# Usage: bash scripts/setup-bitable.sh
# Prints the env lines to paste into .env.local when it finishes.

set -euo pipefail

FUNCTIONS='[{"name":"招聘"},{"name":"组织与人才发展"},{"name":"薪酬福利"},{"name":"绩效"},{"name":"培训"},{"name":"员工关系"},{"name":"HR 数据分析"},{"name":"HR 运营与共享服务"}]'
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "==> identity check"
lark-cli auth status --jq '.identities.user.userName' || true
read -r -p "Is this the right (non-corporate) account? [y/N] " confirm
[[ "$confirm" == "y" || "$confirm" == "Y" ]] || { echo "aborted"; exit 1; }

cat > "$WORK/packages.json" <<'JSON'
[
  {"type":"text","name":"名称","description":"技能包名称"},
  {"type":"text","name":"简介"},
  {"type":"select","name":"载体类型","multiple":false,"default_value":["github"],"options":[{"name":"github","hue":"Blue"},{"name":"zip","hue":"Green"}]},
  {"type":"text","name":"取得地址","style":{"type":"url"},"description":"github 载体填仓库 URL，zip 载体填文件直链。页面上不暴露裸链，一律经 /get 出口"},
  {"type":"text","name":"前置条件","description":"运行时、浏览器、平台登录态、API 凭证等使用者需自备的东西"},
  {"type":"text","name":"提报人昵称"},
  {"type":"select","name":"审核状态","multiple":false,"default_value":["待审"],"options":[{"name":"待审","hue":"Orange"},{"name":"已发布","hue":"Green"},{"name":"已下架","hue":"Gray"}]},
  {"type":"number","name":"取得数","style":{"type":"plain","precision":0},"default_value":0,"description":"被拿走的次数。不代表被使用，也不代表跑得起来"},
  {"type":"created_at","name":"创建时间","style":{"format":"yyyy-MM-dd HH:mm"}}
]
JSON

cat > "$WORK/wishes.json" <<JSON
[
  {"type":"text","name":"标题"},
  {"type":"text","name":"痛点场景","description":"谁、在什么时间、进行什么操作、需交付什么结果。不要求许愿人提技术方案"},
  {"type":"select","name":"适用职能","multiple":false,"options":$FUNCTIONS},
  {"type":"number","name":"痛点工时","style":{"type":"plain","precision":1},"description":"选填。仅作叙事佐证展示，不进入任何排序公式"},
  {"type":"text","name":"许愿人昵称"},
  {"type":"number","name":"附议数","style":{"type":"plain","precision":0},"default_value":0,"description":"唯一排序依据"},
  {"type":"select","name":"状态","multiple":false,"default_value":["收集中"],"options":[{"name":"收集中","hue":"Blue"},{"name":"待认领","hue":"Orange"},{"name":"已交付","hue":"Green"}],"description":"由数据推导：有技能包关联→已交付；附议数≥阈值→待认领；否则收集中"},
  {"type":"created_at","name":"创建时间","style":{"format":"yyyy-MM-dd HH:mm"}}
]
JSON

cat > "$WORK/entries.json" <<JSON
[
  {"type":"text","name":"名称"},
  {"type":"text","name":"说明"},
  {"type":"link","name":"所属技能包","link_table":"技能包","bidirectional":true,"bidirectional_link_field_name":"包含技能条目","description":"技能条目不可单独取得"},
  {"type":"select","name":"适用职能","multiple":false,"options":$FUNCTIONS},
  {"type":"number","name":"展示顺序","style":{"type":"plain","precision":0},"default_value":0}
]
JSON

cat > "$WORK/endorsements.json" <<'JSON'
[
  {"type":"text","name":"去重标识","description":"匿名 cookie 标识，仅用于去重，不参与聚合展示"},
  {"type":"link","name":"关联许愿","link_table":"许愿","bidirectional":true,"bidirectional_link_field_name":"附议明细"},
  {"type":"created_at","name":"创建时间","style":{"format":"yyyy-MM-dd HH:mm"}}
]
JSON

cat > "$WORK/claims.json" <<'JSON'
[
  {"type":"text","name":"认领人昵称"},
  {"type":"link","name":"关联许愿","link_table":"许愿","bidirectional":true,"bidirectional_link_field_name":"认领明细"},
  {"type":"text","name":"说明"},
  {"type":"created_at","name":"创建时间","style":{"format":"yyyy-MM-dd HH:mm"}}
]
JSON

cat > "$WORK/config.json" <<'JSON'
[
  {"type":"text","name":"配置项"},
  {"type":"text","name":"值"},
  {"type":"text","name":"说明"}
]
JSON

echo "==> creating base"
lark-cli base +base-create --as user --name "HR NEXT 技能广场" --time-zone Asia/Shanghai \
  --table-name "技能包" --fields "$(cat "$WORK/packages.json")" > "$WORK/base.json"
BASE=$(lark-cli drive +search --as user --query "HR NEXT 技能广场" --format json \
  | grep -oE '"token": "[^"]+"' | head -1 | cut -d'"' -f4)
echo "    base token: $BASE"

# 许愿 must exist before the tables that link to it.
for pair in "许愿:wishes" "技能条目:entries" "附议:endorsements" "认领:claims" "配置:config"; do
  name="${pair%%:*}"; file="${pair##*:}"
  echo "==> creating table $name"
  lark-cli base +table-create --as user --base-token "$BASE" --name "$name" \
    --fields "$(cat "$WORK/$file.json")" --jq '.ok'
done

echo "==> linking 技能包 → 许愿 (delivery)"
PKG=$(lark-cli base +table-list --as user --base-token "$BASE" --format json \
  | grep -B1 '"name": "技能包"' | grep -oE 'tbl[A-Za-z0-9]+' | head -1)
lark-cli base +field-create --as user --base-token "$BASE" --table-id "$PKG" \
  --json '{"type":"link","name":"交付的许愿","link_table":"许愿","bidirectional":true,"bidirectional_link_field_name":"交付的技能包","description":"关联即视为该许愿已交付；与认领无关"}' --jq '.ok'

echo "==> seeding 配置"
CFG=$(lark-cli base +table-list --as user --base-token "$BASE" --format json \
  | grep -B1 '"name": "配置"' | grep -oE 'tbl[A-Za-z0-9]+' | head -1)
cat > "$WORK/config-rows.json" <<'JSON'
{"create_records":[
 {"配置项":"附议升级阈值","值":"10","说明":"许愿附议数达到该值时升级为待认领任务并推群。百人社群下 10 可能偏高，上线两周后按真实分布调，做好调到 3 的准备"},
 {"配置项":"取得去重窗口小时","值":"24","说明":"同一匿名标识对同一技能包在该时长内只计一次取得"},
 {"配置项":"推送文案-新许愿","值":"🕯 新许愿：{标题}\n{适用职能} · 由 {许愿人昵称} 提出\n有同样痛点就去点「我也有这个痛点」：{链接}","说明":"占位符用 {字段名}"},
 {"配置项":"推送文案-开放认领","值":"📣 已有 {附议数} 人有同一个痛点：{标题}\n现在开放认领，有空想试试的来接：{链接}","说明":""},
 {"配置项":"推送文案-已交付","值":"✅ 许愿已交付：{标题}\n交付技能包：{技能包名称}\n去取得：{链接}","说明":""}
]}
JSON
lark-cli base +record-batch-create --as user --base-token "$BASE" --table-id "$CFG" \
  --json "$(cat "$WORK/config-rows.json")" --jq '.ok'

echo
echo "==> paste into .env.local"
echo "BITABLE_BASE_TOKEN=$BASE"
lark-cli base +table-list --as user --base-token "$BASE" --format json \
  | python3 -c '
import json, sys
mapping = {
    "技能包": "BITABLE_TABLE_PACKAGES",
    "技能条目": "BITABLE_TABLE_ENTRIES",
    "许愿": "BITABLE_TABLE_WISHES",
    "附议": "BITABLE_TABLE_ENDORSEMENTS",
    "认领": "BITABLE_TABLE_CLAIMS",
    "配置": "BITABLE_TABLE_CONFIG",
}
for table in json.load(sys.stdin)["data"]["tables"]:
    key = mapping.get(table["name"])
    if key:
        print(f"{key}={table[\"id\"]}")
'
