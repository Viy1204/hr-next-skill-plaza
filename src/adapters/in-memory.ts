import type { BitablePort, Notification, NotifierPort } from "@/ports";
import type { Claim, HrFunction, SkillEntry, SkillPackage, Wish } from "@/domain/types";

// In-memory implementations of the two Feishu ports. Used by every test; also
// handy for local dev before credentials are wired up.

export interface Seed {
  packages?: Partial<SkillPackage>[];
  entries?: Partial<SkillEntry>[];
  wishes?: Partial<Wish>[];
  config?: Record<string, string>;
}

export class InMemoryBitable implements BitablePort {
  private packages: SkillPackage[] = [];
  private entries: SkillEntry[] = [];
  private wishes: Wish[] = [];
  private endorsements: { id: string; wishId: string; dedupeKey: string }[] = [];
  private claims: Claim[] = [];
  private config: Record<string, string>;
  private seq = 0;
  /** Set to make the next write throw, to prove reads/redirects survive it. */
  writesFail = false;

  constructor(seed: Seed = {}) {
    this.config = { 附议升级阈值: "10", 取得去重窗口小时: "24", ...seed.config };
    for (const p of seed.packages ?? []) this.packages.push(this.fillPackage(p));
    for (const e of seed.entries ?? []) this.entries.push(this.fillEntry(e));
    for (const w of seed.wishes ?? []) this.wishes.push(this.fillWish(w));
  }

  private id(prefix: string) {
    this.seq += 1;
    return `${prefix}${this.seq}`;
  }

  private guardWrite() {
    if (this.writesFail) throw new Error("bitable write failed");
  }

  private fillPackage(p: Partial<SkillPackage>): SkillPackage {
    return {
      id: p.id ?? this.id("pkg"),
      name: p.name ?? "未命名技能包",
      summary: p.summary ?? "",
      carrier: p.carrier ?? "github",
      takeUrl: p.takeUrl ?? null,
      prerequisites: p.prerequisites ?? "",
      submitterNickname: p.submitterNickname ?? "",
      reviewStatus: p.reviewStatus ?? "已发布",
      takeCount: p.takeCount ?? 0,
      deliveredWishIds: p.deliveredWishIds ?? [],
    };
  }

  private fillEntry(e: Partial<SkillEntry>): SkillEntry {
    return {
      id: e.id ?? this.id("entry"),
      name: e.name ?? "未命名技能条目",
      description: e.description ?? "",
      packageId: e.packageId ?? "",
      hrFunction: e.hrFunction ?? "招聘",
      displayOrder: e.displayOrder ?? 0,
    };
  }

  private fillWish(w: Partial<Wish>): Wish {
    return {
      id: w.id ?? this.id("wish"),
      title: w.title ?? "未命名许愿",
      painScenario: w.painScenario ?? "",
      hrFunction: w.hrFunction ?? "招聘",
      painHours: w.painHours ?? null,
      wisherNickname: w.wisherNickname ?? "",
      endorsementCount: w.endorsementCount ?? 0,
      status: w.status ?? "收集中",
      createdAt: w.createdAt ?? "2026-08-03 12:00",
    };
  }

  async listPackages() {
    return this.packages.map((p) => ({ ...p }));
  }

  async getPackage(id: string) {
    const found = this.packages.find((p) => p.id === id);
    return found ? { ...found } : null;
  }

  async incrementTakeCount(id: string) {
    this.guardWrite();
    const found = this.packages.find((p) => p.id === id);
    if (found) found.takeCount += 1;
  }

  async listEntries() {
    return this.entries.map((e) => ({ ...e }));
  }

  async listWishes() {
    return this.wishes.map((w) => ({ ...w }));
  }

  async getWish(id: string) {
    const found = this.wishes.find((w) => w.id === id);
    return found ? { ...found } : null;
  }

  async createWish(input: {
    title: string;
    painScenario: string;
    hrFunction: HrFunction;
    painHours: number | null;
    wisherNickname: string;
  }) {
    this.guardWrite();
    const wish = this.fillWish(input);
    this.wishes.push(wish);
    return { ...wish };
  }

  async setWishEndorsementCount(wishId: string, count: number) {
    this.guardWrite();
    const found = this.wishes.find((w) => w.id === wishId);
    if (found) found.endorsementCount = count;
  }

  async setWishStatus(wishId: string, status: Wish["status"]) {
    this.guardWrite();
    const found = this.wishes.find((w) => w.id === wishId);
    if (found) found.status = status;
  }

  async findEndorsement(wishId: string, dedupeKey: string) {
    const found = this.endorsements.find((e) => e.wishId === wishId && e.dedupeKey === dedupeKey);
    return found ? { id: found.id } : null;
  }

  async createEndorsement(wishId: string, dedupeKey: string) {
    this.guardWrite();
    this.endorsements.push({ id: this.id("end"), wishId, dedupeKey });
  }

  async listClaims(wishId: string) {
    return this.claims.filter((c) => c.wishId === wishId).map((c) => ({ ...c }));
  }

  async createClaim(input: { wishId: string; claimerNickname: string; note: string }) {
    this.guardWrite();
    const claim: Claim = { id: this.id("claim"), createdAt: "2026-08-03 12:00", ...input };
    this.claims.push(claim);
    return { ...claim };
  }

  async getConfig() {
    return { ...this.config };
  }

  /** Link a package to a wish, i.e. deliver it. */
  deliver(packageId: string, wishId: string) {
    const pkg = this.packages.find((p) => p.id === packageId);
    if (pkg && !pkg.deliveredWishIds.includes(wishId)) pkg.deliveredWishIds.push(wishId);
  }

  setConfig(key: string, value: string) {
    this.config[key] = value;
  }
}

export class InMemoryNotifier implements NotifierPort {
  readonly sent: Notification[] = [];

  async send(notification: Notification) {
    this.sent.push(notification);
  }

  of(kind: Notification["kind"]) {
    return this.sent.filter((n) => n.kind === kind);
  }
}
