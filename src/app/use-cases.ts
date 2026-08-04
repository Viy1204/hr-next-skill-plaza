import { deriveWishStatus, type Claim, type HrFunction, type SkillEntry, type SkillPackage, type Wish } from "@/domain/types";
import type { BitablePort, Notification, NotifierPort, StoragePort } from "@/ports";

export interface Deps {
  bitable: BitablePort;
  notifier: NotifierPort;
  storage: StoragePort;
  baseUrl: string;
}

const THRESHOLD_KEY = "附议升级阈值";
const DEFAULT_THRESHOLD = 10;

function parseThreshold(raw: string | undefined): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_THRESHOLD;
}

async function threshold(bitable: BitablePort): Promise<number> {
  return parseThreshold((await bitable.getConfig())[THRESHOLD_KEY]);
}

/**
 * Group pushes are best-effort, same contract as the take counter: a dead or
 * keyword-rejecting webhook must never fail the write that preceded it — the
 * record is already in the table, and a 500 here makes the visitor retry and
 * duplicate it. Callers that keep an announce-once marker (the stored wish
 * status) must check the returned boolean and only advance the marker on a
 * successful send; otherwise a failed push is lost forever, because nothing
 * ever crosses that threshold again.
 */
async function notify(notifier: NotifierPort, notification: Notification): Promise<boolean> {
  try {
    await notifier.send(notification);
    return true;
  } catch (error) {
    console.error("group push failed", { kind: notification.kind, error });
    return false;
  }
}

function render(template: string | undefined, fallback: string, vars: Record<string, string | number>) {
  const text = template ?? fallback;
  return text.replace(/\{([^}]+)\}/g, (_, key: string) => String(vars[key] ?? ""));
}

function isVisible(pkg: SkillPackage) {
  return pkg.reviewStatus === "已发布";
}

export interface SkillEntryView extends SkillEntry {
  packageName: string;
  /** Always the owning package's count — never divided across entries. */
  packageTakeCount: number;
}

export async function listSkillEntries(
  deps: Deps,
  filter: { hrFunction?: HrFunction; query?: string } = {},
): Promise<SkillEntryView[]> {
  const [packages, entries] = await Promise.all([deps.bitable.listPackages(), deps.bitable.listEntries()]);
  const visible = new Map(packages.filter(isVisible).map((p) => [p.id, p]));
  const needle = filter.query?.trim().toLowerCase();

  return entries
    .flatMap((entry) => {
      const pkg = visible.get(entry.packageId);
      if (!pkg) return [];
      if (filter.hrFunction && entry.hrFunction !== filter.hrFunction) return [];
      if (needle) {
        const haystack = `${entry.name} ${entry.description}`.toLowerCase();
        if (!haystack.includes(needle)) return [];
      }
      return [{ ...entry, packageName: pkg.name, packageTakeCount: pkg.takeCount }];
    })
    .sort((a, b) => b.packageTakeCount - a.packageTakeCount || a.displayOrder - b.displayOrder);
}

export interface SkillPackageView extends SkillPackage {
  entries: SkillEntry[];
  deliveredWishes: Wish[];
}

export async function getSkillPackage(deps: Deps, id: string): Promise<SkillPackageView | null> {
  const pkg = await deps.bitable.getPackage(id);
  if (!pkg || !isVisible(pkg)) return null;
  const entries = (await deps.bitable.listEntries())
    .filter((e) => e.packageId === id)
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const wishes = await Promise.all(pkg.deliveredWishIds.map((wishId) => deps.bitable.getWish(wishId)));
  return { ...pkg, entries, deliveredWishes: wishes.filter((w): w is Wish => w !== null) };
}

export interface PackageSubmission {
  name: string;
  summary: string;
  carrier: SkillPackage["carrier"];
  /** github 载体填仓库地址；zip 载体二选一：填直链，或上传文件。 */
  takeUrl: string;
  upload: { fileName: string; bytes: Uint8Array } | null;
  prerequisites: string;
  submitterNickname: string;
  /** 作者声明这个技能包交付了哪条许愿；运营发布后同步才会认这条关联。 */
  deliveredWishId: string | null;
  entries: { name: string; description: string; hrFunction: HrFunction }[];
}

/**
 * 自助上架。站点没有登录，任何人都能提交，所以一律落成「待审」—— 运营在多维表格里
 * 改成「已发布」之前，它不出现在目录里，交付关联也不成立（syncDeliveries 只认已发布
 * 的技能包）。这就是 ADR-0004 那道审核闸口的实现位置。
 */
export async function submitPackage(deps: Deps, input: PackageSubmission): Promise<SkillPackage | null> {
  if (input.deliveredWishId && !(await deps.bitable.getWish(input.deliveredWishId))) return null;

  // 先传文件再建行：上传失败就没有那一行，不会在目录里留一个点了下不来的包。
  const attachmentToken = input.upload ? await deps.storage.upload(input.upload) : null;

  const pkg = await deps.bitable.createPackage({
    name: input.name,
    summary: input.summary,
    carrier: input.carrier,
    takeUrl: input.takeUrl,
    attachmentToken,
    prerequisites: input.prerequisites,
    submitterNickname: input.submitterNickname,
    reviewStatus: "待审",
    deliveredWishIds: input.deliveredWishId ? [input.deliveredWishId] : [],
  });

  // 顺序写：条目要挂到刚建出来的包上，而且展示顺序按提交顺序排。
  for (const [index, entry] of input.entries.entries()) {
    await deps.bitable.createEntry({ ...entry, packageId: pkg.id, displayOrder: index + 1 });
  }

  // 提交即推群：既是给运营的到货铃（待审队列没有别的通知渠道），也是作者的
  // 公开署名 —— 取得数不作激励，群里露名是唯一的供给侧激励。
  const config = await deps.bitable.getConfig();
  await notify(deps.notifier, {
    kind: "package-submitted",
    text: render(
      config["推送文案-新技能包待审"],
      "📦 新技能包已提交待审：{名称}（by {提报人昵称}）\n运营核对前置条件与取得地址后上架",
      { 名称: pkg.name, 提报人昵称: input.submitterNickname || "匿名" },
    ),
  });
  return pkg;
}

export interface TakeOutcome {
  /** github 载体和填了直链的 zip 走这里。 */
  redirectTo: string | null;
  /** 自助上传的 zip 走这里：文件不公开，出口用应用身份取回再转给访客。 */
  attachmentToken: string | null;
  counted: boolean;
}

/**
 * The take endpoint's contract: the visitor always gets the package. Counting is
 * best-effort — a failing counter must never cost someone the file they came
 * for. `alreadyTaken` comes from the caller's dedupe cookie.
 */
export async function takePackage(
  deps: Deps,
  id: string,
  options: { alreadyTaken: boolean },
): Promise<TakeOutcome | null> {
  const pkg = await deps.bitable.getPackage(id);
  if (!pkg || !isVisible(pkg)) return null;

  if (!pkg.takeUrl && !pkg.attachmentToken) return null;

  let counted = false;
  if (!options.alreadyTaken) {
    try {
      await deps.bitable.incrementTakeCount(id);
      counted = true;
    } catch (error) {
      console.error("take count write failed", { packageId: id, error });
    }
  }
  return { redirectTo: pkg.takeUrl, attachmentToken: pkg.attachmentToken, counted };
}

export interface WishView extends Wish {
  claimerNicknames: string[];
  deliveredByPackageIds: string[];
}

// Claims arrive as one full list, fetched once per request — a per-wish fetch
// here turns every wish-list render into N table scans, which is exactly the
// burst that hits Bitable's rate limit the moment a link lands in the group.
function decorateWish(wish: Wish, packages: SkillPackage[], claims: Claim[], limit: number): WishView {
  const deliveredBy = packages.filter((p) => isVisible(p) && p.deliveredWishIds.includes(wish.id)).map((p) => p.id);
  return {
    ...wish,
    status: deriveWishStatus({
      hasDelivery: deliveredBy.length > 0,
      endorsementCount: wish.endorsementCount,
      threshold: limit,
    }),
    claimerNicknames: claims.filter((c) => c.wishId === wish.id).map((c) => c.claimerNickname),
    deliveredByPackageIds: deliveredBy,
  };
}

export async function listWishes(deps: Deps, filter: { hrFunction?: HrFunction } = {}): Promise<WishView[]> {
  const [wishes, packages, claims, limit] = await Promise.all([
    deps.bitable.listWishes(),
    deps.bitable.listPackages(),
    deps.bitable.listClaims(),
    threshold(deps.bitable),
  ]);
  const filtered = filter.hrFunction ? wishes.filter((w) => w.hrFunction === filter.hrFunction) : wishes;
  return filtered
    .map((w) => decorateWish(w, packages, claims, limit))
    .sort((a, b) => b.endorsementCount - a.endorsementCount);
}

export async function getWish(deps: Deps, id: string): Promise<WishView | null> {
  const wish = await deps.bitable.getWish(id);
  if (!wish) return null;
  const [packages, claims, limit] = await Promise.all([
    deps.bitable.listPackages(),
    deps.bitable.listClaims(),
    threshold(deps.bitable),
  ]);
  return decorateWish(wish, packages, claims, limit);
}

export async function createWish(
  deps: Deps,
  input: {
    title: string;
    painScenario: string;
    hrFunction: HrFunction;
    painHours: number | null;
    wisherNickname: string;
  },
): Promise<Wish> {
  const wish = await deps.bitable.createWish(input);
  const config = await deps.bitable.getConfig();
  await notify(deps.notifier, {
    kind: "wish-created",
    text: render(config["推送文案-新许愿"], "🕯 新许愿：{标题}\n{适用职能} · 由 {许愿人昵称} 提出\n{链接}", {
      标题: wish.title,
      适用职能: wish.hrFunction,
      许愿人昵称: wish.wisherNickname,
      链接: `${deps.baseUrl}/wishes/${wish.id}`,
    }),
  });
  return wish;
}

export interface EndorseOutcome {
  endorsementCount: number;
  /** True only on the transition into 待认领, so the group is pinged once. */
  upgraded: boolean;
}

export async function endorseWish(deps: Deps, wishId: string, dedupeKey: string): Promise<EndorseOutcome | null> {
  const wish = await deps.bitable.getWish(wishId);
  if (!wish) return null;

  // 附议数以附议表的行数为准：两个并发附议各自 read-modify-write 存储的计数会
  // 互相覆盖，按行数写回则每次都自愈到真值。
  const existing = await deps.bitable.listEndorsements(wishId);
  if (existing.some((e) => e.dedupeKey === dedupeKey)) {
    return { endorsementCount: existing.length, upgraded: false };
  }

  await deps.bitable.createEndorsement(wishId, dedupeKey);
  const count = existing.length + 1;
  await deps.bitable.setWishEndorsementCount(wishId, count);

  const limit = await threshold(deps.bitable);
  const crossed = existing.length < limit && count >= limit;
  if (!crossed || wish.status === "已交付") return { endorsementCount: count, upgraded: false };

  // 先推送、成功才落状态：状态是「已通知过」的标记，推送失败时留在收集中，
  // 交给定时对账（syncDeliveries）重试 —— 否则这条招人推送永久丢失。
  const config = await deps.bitable.getConfig();
  const sent = await notify(deps.notifier, {
    kind: "wish-open-for-claim",
    text: render(config["推送文案-开放认领"], "📣 已有 {附议数} 人有同一个痛点：{标题}\n现在开放认领：{链接}", {
      附议数: count,
      标题: wish.title,
      链接: `${deps.baseUrl}/wishes/${wishId}`,
    }),
  });
  if (sent) await deps.bitable.setWishStatus(wishId, "待认领");
  return { endorsementCount: count, upgraded: true };
}

/** Claiming is a soft intent: never exclusive, never notified. See ADR-0003. */
export async function claimWish(
  deps: Deps,
  wishId: string,
  input: { claimerNickname: string; note: string },
) {
  const wish = await deps.bitable.getWish(wishId);
  if (!wish) return null;
  return deps.bitable.createClaim({ wishId, ...input });
}

/**
 * Reconciles everything that changes in the Bitable outside a request path, and
 * fires the matching one-off group message. Two cases:
 *
 * 1. Delivery: an operator linked a package to a wish.
 * 2. Threshold upgrades the endorse flow can no longer trigger: when the
 *    operator lowers 附议升级阈值, wishes already sitting between the new and
 *    old value never see another "crossing" endorsement — without this pass
 *    their recruitment push silently never happens while the page shows 待认领.
 *
 * The stored status is the announce-once marker, advanced only after the push
 * went out: a failed push leaves the status behind and this job retries it next
 * run. Safe to run repeatedly; a duplicate message needs the rarer failure of
 * the status write after a successful send.
 */
export async function syncDeliveries(deps: Deps): Promise<{ delivered: string[]; opened: string[] }> {
  const [wishes, packages, config] = await Promise.all([
    deps.bitable.listWishes(),
    deps.bitable.listPackages(),
    deps.bitable.getConfig(),
  ]);
  const limit = parseThreshold(config[THRESHOLD_KEY]);
  const delivered: string[] = [];
  const opened: string[] = [];

  for (const wish of wishes) {
    if (wish.status === "已交付") continue;

    const pkg = packages.find((p) => isVisible(p) && p.deliveredWishIds.includes(wish.id));
    if (pkg) {
      const sent = await notify(deps.notifier, {
        kind: "wish-delivered",
        text: render(config["推送文案-已交付"], "✅ 许愿已交付：{标题}\n交付技能包：{技能包名称}\n{链接}", {
          标题: wish.title,
          技能包名称: pkg.name,
          链接: `${deps.baseUrl}/skills/${pkg.id}`,
        }),
      });
      if (!sent) continue;
      await deps.bitable.setWishStatus(wish.id, "已交付");
      delivered.push(wish.id);
      continue;
    }

    if (wish.status === "收集中" && wish.endorsementCount >= limit) {
      const sent = await notify(deps.notifier, {
        kind: "wish-open-for-claim",
        text: render(config["推送文案-开放认领"], "📣 已有 {附议数} 人有同一个痛点：{标题}\n现在开放认领：{链接}", {
          附议数: wish.endorsementCount,
          标题: wish.title,
          链接: `${deps.baseUrl}/wishes/${wish.id}`,
        }),
      });
      if (!sent) continue;
      await deps.bitable.setWishStatus(wish.id, "待认领");
      opened.push(wish.id);
    }
  }
  return { delivered, opened };
}
