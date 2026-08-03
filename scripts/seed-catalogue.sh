#!/usr/bin/env bash
# Seed the first 12 技能条目 across 6 技能包 (Viy1204/hr-skills ×5, recruiting-copilot ×1).
# v1 has no upload flow, so the catalogue is populated by hand — this is that hand.
#
# Usage: BASE=<base_token> LARK_PROFILE=<profile> bash scripts/seed-catalogue.sh
# Requires lark-cli authenticated as the community/test account (see ADR-0005) —
# name that profile explicitly, the default one is whoever logged in last.

set -euo pipefail
: "${BASE:?set BASE to the Bitable base token}"

LARK=(lark-cli)
[[ -n "${LARK_PROFILE:-}" ]] && LARK+=(--profile "$LARK_PROFILE")

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Both ids in one pass. A per-name lookup would have to pass 技能包 / 技能条目 as
# argv, and Windows python does not get those bytes back intact — the match
# silently fails and the ids come out empty.
"${LARK[@]}" base +table-list --as user --base-token "$BASE" --format json > "$WORK/tables.json"
eval "$(python3 - "$WORK/tables.json" <<'PY'
import json, sys

wanted = {"技能包": "PKG", "技能条目": "ENTRY"}
for table in json.load(open(sys.argv[1], encoding="utf-8"))["data"]["tables"]:
    variable = wanted.get(table["name"])
    if variable:
        print(f"{variable}={table['id']}")
PY
)"
: "${PKG:?技能包 table not found in $BASE}"
: "${ENTRY:?技能条目 table not found in $BASE}"

cat > "$WORK/packages.json" <<'JSON'
{"create_records":[
 {"名称":"feishu-roster","简介":"从飞书人事(标准版)实时拉取员工花名册，含工号、人员类型、在职状态、入职/转正日期、试用期、部门、职级、直属上级，导出 Excel + JSON。","载体类型":"github","取得地址":"https://github.com/Viy1204/hr-skills/tree/main/skills/feishu-roster","前置条件":"飞书自建应用凭证（app_id / app_secret）；飞书人事（标准版）ehr 员工数据读取权限。薪资字段该接口不返回。","提报人昵称":"Viy","审核状态":"已发布","取得数":0},
 {"名称":"feishu-org-chart","简介":"从飞书通讯录实时拉取部门树与成员，用 dagre 自动布局在飞书画板上画出组织架构图，可叠加岗位、标注部门负责人。","载体类型":"github","取得地址":"https://github.com/Viy1204/hr-skills/tree/main/skills/feishu-org-chart","前置条件":"飞书自建应用凭证；通讯录（部门与成员）读取权限；画板节点写入权限。","提报人昵称":"Viy","审核状态":"已发布","取得数":0},
 {"名称":"feishu-attendance-analyzer","简介":"分析全组织飞书考勤数据：垫底排名、加班异常提醒、部门对比，输出终端、Excel、HTML 三种视图。","载体类型":"github","取得地址":"https://github.com/Viy1204/hr-skills/tree/main/skills/feishu-attendance-analyzer","前置条件":"飞书自建应用凭证；考勤数据读取权限。","提报人昵称":"Viy","审核状态":"已发布","取得数":0},
 {"名称":"boss-cli","简介":"用真实 Chrome/Edge 驱动 Boss 直聘：登录、聊天列表、打开候选人对话、在线简历截图，可选接百度 OCR。","载体类型":"github","取得地址":"https://github.com/Viy1204/hr-skills/tree/main/skills/boss-cli","前置条件":"Node ≥ 20；本机装 Chrome 或 Edge；Boss 直聘登录态需自己扫码；OCR 为可选，需百度 OCR 凭证。","提报人昵称":"Viy","审核状态":"已发布","取得数":0},
 {"名称":"liepin-cli","简介":"猎聘平台的人才搜索、简历查看、打招呼与对话。","载体类型":"github","取得地址":"https://github.com/Viy1204/hr-skills/tree/main/skills/liepin-cli","前置条件":"Node ≥ 20；本机装 Chrome 或 Edge；猎聘登录态需自己登录。","提报人昵称":"Viy","审核状态":"已发布","取得数":0},
 {"名称":"recruiting-copilot","简介":"一整套 AI 招聘工作流插件：岗位需求打磨、每日寻源初筛、市场人才盘点、简历评估、约面试、候选人台账与日报。7 个能力共用一套安装脚本和工作区，只能整包取得。","载体类型":"github","取得地址":"https://github.com/Viy1204/recruiting-copilot","前置条件":"Node ≥ 20；本机装 Chrome 或 Edge；需先跑仓库里的安装脚本初始化工作区；Boss 直聘与猎聘登录态；飞书云文档报告与日历功能为可选，需装 lark-cli。","提报人昵称":"Viy","审核状态":"已发布","取得数":0}
]}
JSON

echo "==> creating 技能包"
"${LARK[@]}" base +record-batch-create --as user --base-token "$BASE" --table-id "$PKG" \
  --json "$(cat "$WORK/packages.json")" --jq '.ok'

echo "==> resolving package record ids"
# A batch-create is not immediately visible to the next list call, and the entry
# build below indexes packages by name — an early read yields an empty index and
# a KeyError three lines later. Wait for all six to show up.
for attempt in 1 2 3 4 5; do
  "${LARK[@]}" base +record-list --as user --base-token "$BASE" --table-id "$PKG" --format json > "$WORK/pkg-rows.json"
  count=$(python3 -c "import json,sys;print(len(json.load(open(sys.argv[1],encoding='utf-8'))['data']['record_id_list']))" "$WORK/pkg-rows.json")
  [[ "$count" -ge 6 ]] && break
  echo "    only $count rows visible, retrying ($attempt)"
  sleep 2
done

# Each hr-skills capability is independently takeable (the repo supports shallow
# cloning a single skill), so each is its own package with one entry.
# recruiting-copilot is one package with seven entries: its slash commands share
# an install script and workspace and cannot be taken apart. See ADR-0006.
python3 - "$WORK/pkg-rows.json" > "$WORK/entries.json" <<'PY'
import json, sys

rows = json.load(open(sys.argv[1], encoding="utf-8"))["data"]
name_index = rows["fields"].index("名称")
ids = {row[name_index]: rid for rid, row in zip(rows["record_id_list"], rows["data"])}

singles = [
    ("feishu-roster", "实时拉取花名册并导出 Excel + JSON，含入职、转正、试用期等人事字段。", "HR 运营与共享服务"),
    ("feishu-org-chart", "把部门层级与成员画成组织架构图，交付到飞书云文档。", "组织与人才发展"),
    ("feishu-attendance-analyzer", "全组织考勤分析：垫底排名、加班异常、部门对比。", "HR 数据分析"),
    ("boss-cli", "Boss 直聘自动化：聊天列表、候选人对话、在线简历截图。", "招聘"),
    ("liepin-cli", "猎聘自动化：人才搜索、简历查看、打招呼。", "招聘"),
]

copilot = [
    ("recruit-init", "初始化招聘工作区：模板、候选人台账、流程文档。"),
    ("recruit-grill", "反复追问把模糊的岗位需求打磨成可执行的筛选标准。"),
    ("recruit-daily", "每日招聘处理：跨 Boss 直聘与猎聘寻源、初筛、打招呼。"),
    ("recruit-mapping", "市场人才盘点：目标公司、薪资对标、招聘难度。"),
    ("resume-review", "本地简历评估与邮箱收简历。"),
    ("interview-schedule", "约面试：建日程、拉面试官、生成候选人邀约。"),
    ("ask-viy", "这套招聘工具怎么用的总目录与流程指南。"),
]

records = [
    {"名称": name, "说明": description, "所属技能包": [ids[name]], "适用职能": hr_function, "展示顺序": 1}
    for name, description, hr_function in singles
]
records += [
    {
        "名称": name,
        "说明": description,
        "所属技能包": [ids["recruiting-copilot"]],
        "适用职能": "招聘",
        "展示顺序": order,
    }
    for order, (name, description) in enumerate(copilot, start=1)
]

json.dump({"create_records": records}, sys.stdout, ensure_ascii=False)
PY

echo "==> creating 技能条目"
"${LARK[@]}" base +record-batch-create --as user --base-token "$BASE" --table-id "$ENTRY" \
  --json "$(cat "$WORK/entries.json")" --jq '.ok'

echo "done: 6 技能包 / 12 技能条目"
