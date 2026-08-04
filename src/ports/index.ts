import type { Claim, HrFunction, SkillEntry, SkillPackage, Wish } from "@/domain/types";

// The Feishu outbound boundary. This is the system's only test seam: tests
// supply in-memory implementations of these two ports and run every other line
// of production code for real. Nothing outside src/adapters may import the
// Feishu SDK or speak its wire format.

export interface BitablePort {
  listPackages(): Promise<SkillPackage[]>;
  getPackage(id: string): Promise<SkillPackage | null>;
  createPackage(input: Omit<SkillPackage, "id" | "takeCount">): Promise<SkillPackage>;
  incrementTakeCount(id: string): Promise<void>;

  listEntries(): Promise<SkillEntry[]>;
  createEntry(input: Omit<SkillEntry, "id">): Promise<SkillEntry>;

  listWishes(): Promise<Wish[]>;
  getWish(id: string): Promise<Wish | null>;
  createWish(input: {
    title: string;
    painScenario: string;
    hrFunction: HrFunction;
    painHours: number | null;
    wisherNickname: string;
  }): Promise<Wish>;
  setWishEndorsementCount(wishId: string, count: number): Promise<void>;
  setWishStatus(wishId: string, status: Wish["status"]): Promise<void>;

  findEndorsement(wishId: string, dedupeKey: string): Promise<{ id: string } | null>;
  createEndorsement(wishId: string, dedupeKey: string): Promise<void>;

  listClaims(wishId: string): Promise<Claim[]>;
  createClaim(input: { wishId: string; claimerNickname: string; note: string }): Promise<Claim>;

  getConfig(): Promise<Record<string, string>>;
}

export type NotificationKind = "wish-created" | "wish-open-for-claim" | "wish-delivered";

export interface Notification {
  kind: NotificationKind;
  text: string;
}

export interface NotifierPort {
  send(notification: Notification): Promise<void>;
}
