import { deriveWishStatus, type HrFunction, type SkillEntry, type SkillPackage, type Wish } from "@/domain/types";
import type { BitablePort, NotifierPort } from "@/ports";

export interface Deps {
  bitable: BitablePort;
  notifier: NotifierPort;
  baseUrl: string;
}

const THRESHOLD_KEY = "附议升级阈值";
const DEFAULT_THRESHOLD = 10;

async function threshold(bitable: BitablePort): Promise<number> {
  const raw = (await bitable.getConfig())[THRESHOLD_KEY];
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_THRESHOLD;
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
  takeUrl: string;
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

  const pkg = await deps.bitable.createPackage({
    name: input.name,
    summary: input.summary,
    carrier: input.carrier,
    takeUrl: input.takeUrl,
    prerequisites: input.prerequisites,
    submitterNickname: input.submitterNickname,
    reviewStatus: "待审",
    deliveredWishIds: input.deliveredWishId ? [input.deliveredWishId] : [],
  });

  // 顺序写：条目要挂到刚建出来的包上，而且展示顺序按提交顺序排。
  for (const [index, entry] of input.entries.entries()) {
    await deps.bitable.createEntry({ ...entry, packageId: pkg.id, displayOrder: index + 1 });
  }
  return pkg;
}

export interface TakeOutcome {
  redirectTo: string | null;
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

  if (!pkg.takeUrl) return null;
  const destination = pkg.takeUrl;

  let counted = false;
  if (!options.alreadyTaken) {
    try {
      await deps.bitable.incrementTakeCount(id);
      counted = true;
    } catch (error) {
      console.error("take count write failed", { packageId: id, error });
    }
  }
  return { redirectTo: destination, counted };
}

export interface WishView extends Wish {
  claimerNicknames: string[];
  deliveredByPackageIds: string[];
}

async function decorateWish(deps: Deps, wish: Wish, packages: SkillPackage[], limit: number): Promise<WishView> {
  const claims = await deps.bitable.listClaims(wish.id);
  const deliveredBy = packages.filter((p) => isVisible(p) && p.deliveredWishIds.includes(wish.id)).map((p) => p.id);
  return {
    ...wish,
    status: deriveWishStatus({
      hasDelivery: deliveredBy.length > 0,
      endorsementCount: wish.endorsementCount,
      threshold: limit,
    }),
    claimerNicknames: claims.map((c) => c.claimerNickname),
    deliveredByPackageIds: deliveredBy,
  };
}

export async function listWishes(deps: Deps, filter: { hrFunction?: HrFunction } = {}): Promise<WishView[]> {
  const [wishes, packages, limit] = await Promise.all([
    deps.bitable.listWishes(),
    deps.bitable.listPackages(),
    threshold(deps.bitable),
  ]);
  const filtered = filter.hrFunction ? wishes.filter((w) => w.hrFunction === filter.hrFunction) : wishes;
  const decorated = await Promise.all(filtered.map((w) => decorateWish(deps, w, packages, limit)));
  return decorated.sort((a, b) => b.endorsementCount - a.endorsementCount);
}

export async function getWish(deps: Deps, id: string): Promise<WishView | null> {
  const wish = await deps.bitable.getWish(id);
  if (!wish) return null;
  const [packages, limit] = await Promise.all([deps.bitable.listPackages(), threshold(deps.bitable)]);
  return decorateWish(deps, wish, packages, limit);
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
  await deps.notifier.send({
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

  const existing = await deps.bitable.findEndorsement(wishId, dedupeKey);
  if (existing) return { endorsementCount: wish.endorsementCount, upgraded: false };

  await deps.bitable.createEndorsement(wishId, dedupeKey);
  const count = wish.endorsementCount + 1;
  await deps.bitable.setWishEndorsementCount(wishId, count);

  const limit = await threshold(deps.bitable);
  const crossed = wish.endorsementCount < limit && count >= limit;
  if (!crossed || wish.status === "已交付") return { endorsementCount: count, upgraded: false };

  await deps.bitable.setWishStatus(wishId, "待认领");
  const config = await deps.bitable.getConfig();
  await deps.notifier.send({
    kind: "wish-open-for-claim",
    text: render(config["推送文案-开放认领"], "📣 已有 {附议数} 人有同一个痛点：{标题}\n现在开放认领：{链接}", {
      附议数: count,
      标题: wish.title,
      链接: `${deps.baseUrl}/wishes/${wishId}`,
    }),
  });
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
 * Delivery happens outside the app: an operator links a package to a wish in the
 * Bitable. Nothing in a request path can notice that, so this reconciles the
 * derived status and fires the one-off group message. Safe to run repeatedly.
 */
export async function syncDeliveries(deps: Deps): Promise<string[]> {
  const [wishes, packages, config] = await Promise.all([
    deps.bitable.listWishes(),
    deps.bitable.listPackages(),
    deps.bitable.getConfig(),
  ]);
  const announced: string[] = [];

  for (const wish of wishes) {
    if (wish.status === "已交付") continue;
    const pkg = packages.find((p) => isVisible(p) && p.deliveredWishIds.includes(wish.id));
    if (!pkg) continue;

    await deps.bitable.setWishStatus(wish.id, "已交付");
    await deps.notifier.send({
      kind: "wish-delivered",
      text: render(config["推送文案-已交付"], "✅ 许愿已交付：{标题}\n交付技能包：{技能包名称}\n{链接}", {
        标题: wish.title,
        技能包名称: pkg.name,
        链接: `${deps.baseUrl}/skills/${pkg.id}`,
      }),
    });
    announced.push(wish.id);
  }
  return announced;
}
