// Glossary mapping (see CONTEXT.md — Chinese is the canonical vocabulary):
//   SkillPackage   技能包      the only takeable unit; takeCount lives here
//   SkillEntry     技能条目    one capability inside a package; never takeable alone
//   prerequisites  前置条件
//   takeCount      取得数      "someone wanted to try", not usage
//   Wish           许愿
//   Endorsement    附议        "I have this same pain", not a like
//   painHours      痛点工时    narrative evidence only, never in a ranking formula
//   Claim          认领        soft intent, never exclusive
//   delivery       交付        a package linked to a wish
//   hrFunction     适用职能

export const HR_FUNCTIONS = [
  "招聘",
  "组织与人才发展",
  "薪酬福利",
  "绩效",
  "培训",
  "员工关系",
  "HR 数据分析",
  "HR 运营与共享服务",
] as const;

export type HrFunction = (typeof HR_FUNCTIONS)[number];

export type Carrier = "github" | "zip";

export type ReviewStatus = "待审" | "已发布" | "已下架";

export type WishStatus = "收集中" | "待认领" | "已交付";

export interface SkillPackage {
  id: string;
  name: string;
  summary: string;
  carrier: Carrier;
  /** Repo URL for the github carrier, file URL for zip. Never shown raw — the
   *  page only ever links to the /get outlet so the take gets counted. */
  takeUrl: string | null;
  /** zip 载体走自助上传时，文件存在飞书云空间，这里只记文件标识。文件不公开，
   *  取得时由 /get 出口用应用身份取回再转给访客 —— 待审的包因此下载不到。 */
  attachmentToken: string | null;
  prerequisites: string;
  submitterNickname: string;
  reviewStatus: ReviewStatus;
  takeCount: number;
  deliveredWishIds: string[];
}

export interface SkillEntry {
  id: string;
  name: string;
  description: string;
  packageId: string;
  hrFunction: HrFunction;
  displayOrder: number;
}

export interface Wish {
  id: string;
  title: string;
  painScenario: string;
  hrFunction: HrFunction;
  painHours: number | null;
  wisherNickname: string;
  endorsementCount: number;
  status: WishStatus;
  createdAt: string;
}

export interface Claim {
  id: string;
  wishId: string;
  claimerNickname: string;
  note: string;
  createdAt: string;
}

// A wish's status is derived, never hand-maintained. Delivery wins over the
// threshold: a wish that already has a package is done, however many people
// endorsed it afterwards.
export function deriveWishStatus(args: {
  hasDelivery: boolean;
  endorsementCount: number;
  threshold: number;
}): WishStatus {
  if (args.hasDelivery) return "已交付";
  if (args.endorsementCount >= args.threshold) return "待认领";
  return "收集中";
}
