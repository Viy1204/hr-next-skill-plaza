import type { Seed } from "@/adapters/in-memory";

// The real first 12 技能条目, kept in sync with scripts/seed-catalogue.sh. Used
// only by the no-credentials local mode so the site is browsable before any
// Feishu account exists.
//
// 许愿 is deliberately empty: wish seeds have to come from real pain points in the
// HR NEXT group (with the original speaker's consent), and inventing them would be
// exactly the fake content the empty state is better than.
export const DEMO_SEED: Seed = {
  packages: [
    {
      id: "pkg-roster",
      name: "feishu-roster",
      summary:
        "从飞书人事(标准版)实时拉取员工花名册，含工号、人员类型、在职状态、入职/转正日期、试用期、部门、职级、直属上级，导出 Excel + JSON。",
      takeUrl: "https://github.com/Viy1204/hr-skills/tree/main/skills/feishu-roster",
      prerequisites:
        "飞书自建应用凭证（app_id / app_secret）；飞书人事（标准版）ehr 员工数据读取权限。薪资字段该接口不返回。",
      submitterNickname: "Viy",
    },
    {
      id: "pkg-org-chart",
      name: "feishu-org-chart",
      summary: "从飞书通讯录实时拉取部门树与成员，用 dagre 自动布局在飞书画板上画出组织架构图，可叠加岗位、标注部门负责人。",
      takeUrl: "https://github.com/Viy1204/hr-skills/tree/main/skills/feishu-org-chart",
      prerequisites: "飞书自建应用凭证；通讯录（部门与成员）读取权限；画板节点写入权限。",
      submitterNickname: "Viy",
    },
    {
      id: "pkg-attendance",
      name: "feishu-attendance-analyzer",
      summary: "分析全组织飞书考勤数据：垫底排名、加班异常提醒、部门对比，输出终端、Excel、HTML 三种视图。",
      takeUrl: "https://github.com/Viy1204/hr-skills/tree/main/skills/feishu-attendance-analyzer",
      prerequisites: "飞书自建应用凭证；考勤数据读取权限。",
      submitterNickname: "Viy",
    },
    {
      id: "pkg-boss",
      name: "boss-cli",
      summary: "用真实 Chrome/Edge 驱动 Boss 直聘：登录、聊天列表、打开候选人对话、在线简历截图，可选接百度 OCR。",
      takeUrl: "https://github.com/Viy1204/hr-skills/tree/main/skills/boss-cli",
      prerequisites: "Node ≥ 20；本机装 Chrome 或 Edge；Boss 直聘登录态需自己扫码；OCR 为可选，需百度 OCR 凭证。",
      submitterNickname: "Viy",
    },
    {
      id: "pkg-liepin",
      name: "liepin-cli",
      summary: "猎聘平台的人才搜索、简历查看、打招呼与对话。",
      takeUrl: "https://github.com/Viy1204/hr-skills/tree/main/skills/liepin-cli",
      prerequisites: "Node ≥ 20；本机装 Chrome 或 Edge；猎聘登录态需自己登录。",
      submitterNickname: "Viy",
    },
    {
      id: "pkg-copilot",
      name: "recruiting-copilot",
      summary:
        "一整套 AI 招聘工作流插件：岗位需求打磨、每日寻源初筛、市场人才盘点、简历评估、约面试、候选人台账与日报。7 个能力共用一套安装脚本和工作区，只能整包取得。",
      takeUrl: "https://github.com/Viy1204/recruiting-copilot",
      prerequisites:
        "Node ≥ 20；本机装 Chrome 或 Edge；需先跑仓库里的安装脚本初始化工作区；Boss 直聘与猎聘登录态；飞书云文档报告与日历功能为可选，需装 lark-cli。",
      submitterNickname: "Viy",
    },
  ],
  entries: [
    {
      name: "feishu-roster",
      description: "实时拉取花名册并导出 Excel + JSON，含入职、转正、试用期等人事字段。",
      packageId: "pkg-roster",
      hrFunction: "HR 运营与共享服务",
      displayOrder: 1,
    },
    {
      name: "feishu-org-chart",
      description: "把部门层级与成员画成组织架构图，交付到飞书云文档。",
      packageId: "pkg-org-chart",
      hrFunction: "组织与人才发展",
      displayOrder: 1,
    },
    {
      name: "feishu-attendance-analyzer",
      description: "全组织考勤分析：垫底排名、加班异常、部门对比。",
      packageId: "pkg-attendance",
      hrFunction: "HR 数据分析",
      displayOrder: 1,
    },
    {
      name: "boss-cli",
      description: "Boss 直聘自动化：聊天列表、候选人对话、在线简历截图。",
      packageId: "pkg-boss",
      hrFunction: "招聘",
      displayOrder: 1,
    },
    {
      name: "liepin-cli",
      description: "猎聘自动化：人才搜索、简历查看、打招呼。",
      packageId: "pkg-liepin",
      hrFunction: "招聘",
      displayOrder: 1,
    },
    { name: "recruit-init", description: "初始化招聘工作区：模板、候选人台账、流程文档。", packageId: "pkg-copilot", hrFunction: "招聘", displayOrder: 1 },
    { name: "recruit-grill", description: "反复追问把模糊的岗位需求打磨成可执行的筛选标准。", packageId: "pkg-copilot", hrFunction: "招聘", displayOrder: 2 },
    { name: "recruit-daily", description: "每日招聘处理：跨 Boss 直聘与猎聘寻源、初筛、打招呼。", packageId: "pkg-copilot", hrFunction: "招聘", displayOrder: 3 },
    { name: "recruit-mapping", description: "市场人才盘点：目标公司、薪资对标、招聘难度。", packageId: "pkg-copilot", hrFunction: "招聘", displayOrder: 4 },
    { name: "resume-review", description: "本地简历评估与邮箱收简历。", packageId: "pkg-copilot", hrFunction: "招聘", displayOrder: 5 },
    { name: "interview-schedule", description: "约面试：建日程、拉面试官、生成候选人邀约。", packageId: "pkg-copilot", hrFunction: "招聘", displayOrder: 6 },
    { name: "ask-viy", description: "这套招聘工具怎么用的总目录与流程指南。", packageId: "pkg-copilot", hrFunction: "招聘", displayOrder: 7 },
  ],
};
