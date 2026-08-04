import type { BitablePort } from "@/ports";
import { TenantToken } from "./tenant-token";
import { HR_FUNCTIONS, type Carrier, type Claim, type HrFunction, type ReviewStatus, type SkillEntry, type SkillPackage, type Wish, type WishStatus } from "@/domain/types";

// The real Feishu Bitable port. Everything Feishu-shaped — tokens, wire format,
// field-name strings — is confined to this file. Field names are the Chinese
// column names in the Base, which are the canonical vocabulary (see CONTEXT.md).

export interface BitableConfig {
  appId: string;
  appSecret: string;
  baseToken: string;
  tables: {
    packages: string;
    entries: string;
    wishes: string;
    endorsements: string;
    claims: string;
    config: string;
  };
  endpoint?: string;
}

type Fields = Record<string, unknown>;
interface Row {
  record_id: string;
  fields: Fields;
}

/** Bitable returns plain strings for plain text but {text, link} for url-styled
 *  text, and bare numbers for number/created-time cells. */
export function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(asText).join("");
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.link === "string") return record.link;
    if (typeof record.text === "string") return record.text;
  }
  return "";
}

/** 创建时间 cells come back as epoch milliseconds. Render them as a readable
 *  Asia/Shanghai timestamp — passing the raw number through asText produced an
 *  empty string and the field silently rendered blank. */
export function asDateText(value: unknown): string {
  if (typeof value !== "number") return asText(value);
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(value)
    .replace(/\//g, "-");
}

/**
 * A url-styled text cell comes back either as {text, link} or as a Markdown link
 * string. Feeding the Markdown form straight into a Location header produces a
 * broken redirect, so unwrap it here.
 */
export function asUrl(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const link = (value as { link?: unknown }).link;
    if (typeof link === "string") return link;
  }
  const text = asText(value).trim();
  const markdown = /^\[[^\]]*\]\((.+)\)$/.exec(text);
  return markdown?.[1] ?? text;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  const parsed = Number(asText(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function asHrFunction(value: unknown): HrFunction {
  const text = asText(value);
  if ((HR_FUNCTIONS as readonly string[]).includes(text)) return text as HrFunction;
  // 职能集合是代码写死的：表里冒出新选项（运营手册明令禁止但拦不住手滑）时，
  // 静默归并会把整批条目错分到共享服务下 —— 至少留下一行日志可查。
  if (text) console.warn("unknown 适用职能, falling back", { value: text });
  return "HR 运营与共享服务";
}

/**
 * Link cells are written as a bare id array but read back in three different
 * shapes: {link_record_ids: [...]}, a bare id array, and — what the live Base
 * actually returns — an array of {record_ids, text_arr, table_id} groups. Miss
 * that third one and every 技能条目 looks like it belongs to no 技能包, so the
 * whole catalogue renders empty with no error anywhere.
 */
export function asLinkIds(value: unknown): string[] {
  const strings = (input: unknown): string[] =>
    Array.isArray(input) ? input.filter((v): v is string => typeof v === "string") : [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === "string") return [item];
      if (item && typeof item === "object") return strings((item as { record_ids?: unknown }).record_ids);
      return [];
    });
  }
  if (value && typeof value === "object") return strings((value as { link_record_ids?: unknown }).link_record_ids);
  return [];
}

// Row-to-domain converters are exported pure functions so the live wire shapes
// can be pinned by fixture tests. All three field-shape bugs so far (link
// groups, url cells, epoch times) were invisible to the HTTP-boundary tests —
// this is the one layer that has to be tested against recorded Feishu JSON.

export function packageFromRow(row: Row): SkillPackage {
  const carrier = asText(row.fields["载体类型"]);
  const takeUrl = asUrl(row.fields["取得地址"]);
  return {
    id: row.record_id,
    name: asText(row.fields["名称"]),
    summary: asText(row.fields["简介"]),
    carrier: (carrier === "zip" ? "zip" : "github") as Carrier,
    takeUrl: takeUrl || null,
    attachmentToken: asText(row.fields["附件文件标识"]) || null,
    prerequisites: asText(row.fields["前置条件"]),
    submitterNickname: asText(row.fields["提报人昵称"]),
    reviewStatus: (asText(row.fields["审核状态"]) || "待审") as ReviewStatus,
    takeCount: asNumber(row.fields["取得数"]) ?? 0,
    deliveredWishIds: asLinkIds(row.fields["交付的许愿"]),
  };
}

export function entryFromRow(row: Row): SkillEntry {
  return {
    id: row.record_id,
    name: asText(row.fields["名称"]),
    description: asText(row.fields["说明"]),
    packageId: asLinkIds(row.fields["所属技能包"])[0] ?? "",
    hrFunction: asHrFunction(row.fields["适用职能"]),
    displayOrder: asNumber(row.fields["展示顺序"]) ?? 0,
  };
}

export function wishFromRow(row: Row): Wish {
  return {
    id: row.record_id,
    title: asText(row.fields["标题"]),
    painScenario: asText(row.fields["痛点场景"]),
    hrFunction: asHrFunction(row.fields["适用职能"]),
    painHours: asNumber(row.fields["痛点工时"]),
    wisherNickname: asText(row.fields["许愿人昵称"]),
    endorsementCount: asNumber(row.fields["附议数"]) ?? 0,
    status: (asText(row.fields["状态"]) || "收集中") as WishStatus,
    createdAt: asDateText(row.fields["创建时间"]),
  };
}

export function claimFromRow(row: Row): Claim {
  return {
    id: row.record_id,
    wishId: asLinkIds(row.fields["关联许愿"])[0] ?? "",
    claimerNickname: asText(row.fields["认领人昵称"]),
    note: asText(row.fields["说明"]),
    createdAt: asDateText(row.fields["创建时间"]),
  };
}

export class FeishuBitable implements BitablePort {
  private readonly endpoint: string;

  constructor(
    private readonly config: BitableConfig,
    private readonly auth: TenantToken = new TenantToken(config),
  ) {
    this.endpoint = config.endpoint ?? "https://open.feishu.cn";
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.auth.value();
    const response = await fetch(`${this.endpoint}/open-apis/bitable/v1/apps/${this.config.baseToken}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers },
      cache: "no-store",
    });
    const body = (await response.json()) as { code: number; msg: string; data?: T };
    if (body.code !== 0) throw new Error(`bitable ${path} failed: ${body.code} ${body.msg}`);
    return body.data as T;
  }

  private async rows(tableId: string): Promise<Row[]> {
    const collected: Row[] = [];
    let pageToken: string | undefined;
    do {
      const query = new URLSearchParams({ page_size: "500" });
      if (pageToken) query.set("page_token", pageToken);
      const data = await this.call<{ items?: Row[]; page_token?: string; has_more?: boolean }>(
        `/tables/${tableId}/records?${query}`,
      );
      collected.push(...(data.items ?? []));
      pageToken = data.has_more ? data.page_token : undefined;
    } while (pageToken);
    return collected;
  }

  private create(tableId: string, fields: Fields) {
    return this.call<{ record: Row }>(`/tables/${tableId}/records`, {
      method: "POST",
      body: JSON.stringify({ fields }),
    });
  }

  private update(tableId: string, recordId: string, fields: Fields) {
    return this.call(`/tables/${tableId}/records/${recordId}`, {
      method: "PUT",
      body: JSON.stringify({ fields }),
    });
  }

  async listPackages() {
    return (await this.rows(this.config.tables.packages)).map(packageFromRow);
  }

  async getPackage(id: string) {
    return (await this.listPackages()).find((p) => p.id === id) ?? null;
  }

  async createPackage(input: Omit<SkillPackage, "id" | "takeCount">) {
    const fields: Fields = {
      名称: input.name,
      简介: input.summary,
      载体类型: input.carrier,
      前置条件: input.prerequisites,
      提报人昵称: input.submitterNickname,
      审核状态: input.reviewStatus,
      取得数: 0,
    };
    // 取得地址是 url 样式的文本列：读回来是 {text, link}，写进去也必须是这个形状，
    // 给裸字符串会被拒（1254068 URLFieldConvFail）。
    if (input.takeUrl) fields["取得地址"] = { text: input.takeUrl, link: input.takeUrl };
    if (input.attachmentToken) fields["附件文件标识"] = input.attachmentToken;
    if (input.deliveredWishIds.length > 0) fields["交付的许愿"] = input.deliveredWishIds;
    const { record } = await this.create(this.config.tables.packages, fields);
    return packageFromRow(record);
  }

  async incrementTakeCount(id: string) {
    const current = await this.getPackage(id);
    if (!current) return;
    await this.update(this.config.tables.packages, id, { 取得数: current.takeCount + 1 });
  }

  async createEntry(input: Omit<SkillEntry, "id">): Promise<SkillEntry> {
    const { record } = await this.create(this.config.tables.entries, {
      名称: input.name,
      说明: input.description,
      所属技能包: [input.packageId],
      适用职能: input.hrFunction,
      展示顺序: input.displayOrder,
    });
    return { ...input, id: record.record_id };
  }

  async listEntries(): Promise<SkillEntry[]> {
    return (await this.rows(this.config.tables.entries)).map(entryFromRow);
  }

  async listWishes() {
    return (await this.rows(this.config.tables.wishes)).map(wishFromRow);
  }

  async getWish(id: string) {
    return (await this.listWishes()).find((w) => w.id === id) ?? null;
  }

  async createWish(input: {
    title: string;
    painScenario: string;
    hrFunction: HrFunction;
    painHours: number | null;
    wisherNickname: string;
  }) {
    const fields: Fields = {
      标题: input.title,
      痛点场景: input.painScenario,
      适用职能: input.hrFunction,
      许愿人昵称: input.wisherNickname,
      附议数: 0,
      状态: "收集中",
    };
    if (input.painHours !== null) fields["痛点工时"] = input.painHours;
    const { record } = await this.create(this.config.tables.wishes, fields);
    return wishFromRow(record);
  }

  async setWishEndorsementCount(wishId: string, count: number) {
    await this.update(this.config.tables.wishes, wishId, { 附议数: count });
  }

  async setWishStatus(wishId: string, status: WishStatus) {
    await this.update(this.config.tables.wishes, wishId, { 状态: status });
  }

  async listEndorsements(wishId: string) {
    return (await this.rows(this.config.tables.endorsements))
      .filter((row) => asLinkIds(row.fields["关联许愿"]).includes(wishId))
      .map((row) => ({ id: row.record_id, dedupeKey: asText(row.fields["去重标识"]) }));
  }

  async createEndorsement(wishId: string, dedupeKey: string) {
    await this.create(this.config.tables.endorsements, { 去重标识: dedupeKey, 关联许愿: [wishId] });
  }

  async listClaims(): Promise<Claim[]> {
    return (await this.rows(this.config.tables.claims)).map(claimFromRow);
  }

  async createClaim(input: { wishId: string; claimerNickname: string; note: string }) {
    const { record } = await this.create(this.config.tables.claims, {
      认领人昵称: input.claimerNickname,
      说明: input.note,
      关联许愿: [input.wishId],
    });
    return {
      id: record.record_id,
      wishId: input.wishId,
      claimerNickname: input.claimerNickname,
      note: input.note,
      createdAt: asDateText(record.fields["创建时间"]),
    };
  }

  async getConfig() {
    const entries = (await this.rows(this.config.tables.config)).map(
      (row) => [asText(row.fields["配置项"]), asText(row.fields["值"])] as const,
    );
    return Object.fromEntries(entries.filter(([key]) => key));
  }
}
