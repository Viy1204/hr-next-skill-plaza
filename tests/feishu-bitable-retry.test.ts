import { afterEach, describe, expect, it, vi } from "vitest";
import { FeishuBitable } from "@/adapters/feishu-bitable";

const config = {
  appId: "app-id",
  appSecret: "app-secret",
  baseToken: "base-token",
  tables: {
    packages: "packages-table",
    entries: "entries-table",
    wishes: "wishes-table",
    endorsements: "endorsements-table",
    claims: "claims-table",
    config: "config-table",
  },
  endpoint: "https://feishu.test",
};

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

describe("FeishuBitable transient failures", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries Data not ready responses before returning rows", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ code: 0, msg: "ok", tenant_access_token: "token", expire: 7200 }))
      .mockResolvedValueOnce(json({ code: 1254607, msg: "Data not ready, please try again later" }))
      .mockResolvedValueOnce(json({ code: 1254607, msg: "Data not ready, please try again later" }))
      .mockResolvedValueOnce(
        json({
          code: 0,
          msg: "success",
          data: {
            items: [{ record_id: "pkg-1", fields: { 名称: "名册助手", 审核状态: "已发布" } }],
            has_more: false,
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = new FeishuBitable(config).listPackages();
    await vi.runAllTimersAsync();

    await expect(result).resolves.toEqual([
      expect.objectContaining({ id: "pkg-1", name: "名册助手", reviewStatus: "已发布" }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("does not retry permanent Bitable errors", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ code: 0, msg: "ok", tenant_access_token: "token", expire: 7200 }))
      .mockResolvedValueOnce(json({ code: 1254043, msg: "RecordNotFound" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new FeishuBitable(config).listPackages()).rejects.toThrow("1254043 RecordNotFound");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry writes that may already have reached Bitable", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ code: 0, msg: "ok", tenant_access_token: "token", expire: 7200 }))
      .mockResolvedValueOnce(json({ code: 1254607, msg: "Data not ready, please try again later" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new FeishuBitable(config).createPackage({
        name: "名册助手",
        summary: "核对名册",
        carrier: "github",
        takeUrl: "https://github.com/example/roster",
        attachmentToken: null,
        prerequisites: "Node 20",
        submitterNickname: "Viy",
        reviewStatus: "待审",
        deliveredWishIds: [],
      }),
    ).rejects.toThrow("1254607 Data not ready");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
