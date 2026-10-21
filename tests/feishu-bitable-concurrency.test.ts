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

function okRecords() {
  return json({ code: 0, msg: "success", data: { items: [], has_more: false } });
}

function tokenResponse() {
  return json({ code: 0, msg: "ok", tenant_access_token: "token", expire: 7200 });
}

/**
 * 把表请求卡住，用来观察同一时刻有几个在途。
 * 每个调用各自造一个 Response —— 同一个 Response 读两次 body 会抛错。
 */
function blocker() {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { gate, release };
}

function tableCalls(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) {
  return fetchMock.mock.calls.filter(([input]) => String(input).includes("/tables/"));
}

describe("FeishuBitable concurrency gate", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("never lets more than three table reads be in flight at once", async () => {
    const { gate, release } = blocker();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      if (String(input).includes("tenant_access_token")) return tokenResponse();
      await gate;
      return okRecords();
    });
    vi.stubGlobal("fetch", fetchMock);

    const bitable = new FeishuBitable(config);
    const reads = [
      bitable.listPackages(),
      bitable.listEntries(),
      bitable.listWishes(),
      bitable.listClaims(),
      bitable.getConfig(),
      bitable.listEndorsements("wish-1"),
    ];

    // 三个读进闸后停下，后面三个在排队。
    await vi.waitFor(() => expect(tableCalls(fetchMock).length).toBe(3));
    expect(tableCalls(fetchMock)).toHaveLength(3);

    release();
    await expect(Promise.all(reads)).resolves.toHaveLength(6);

    // 六个读最终都发出，且没有因为重试而膨胀。
    expect(tableCalls(fetchMock)).toHaveLength(6);
  });

  it("coalesces concurrent reads of the same table into one request", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockImplementation(async () => okRecords());
    vi.stubGlobal("fetch", fetchMock);

    const bitable = new FeishuBitable(config);
    // 首页两个用例都要读技能包表，不该打飞书两次。
    await Promise.all([bitable.listPackages(), bitable.listPackages()]);

    expect(tableCalls(fetchMock)).toHaveLength(1);
  });

  it("reads the same table again once the earlier read settled", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockImplementation(async () => okRecords());
    vi.stubGlobal("fetch", fetchMock);

    const bitable = new FeishuBitable(config);
    await bitable.listPackages();
    await bitable.listPackages();

    expect(tableCalls(fetchMock)).toHaveLength(2);
  });

  it("holds a write behind the gate so it cannot trip the limit either", async () => {
    const { gate, release } = blocker();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      if (String(input).includes("tenant_access_token")) return tokenResponse();
      if (init?.method === "POST") {
        return json({ code: 0, msg: "success", data: { record: { record_id: "pkg-1", fields: {} } } });
      }
      await gate;
      return okRecords();
    });
    vi.stubGlobal("fetch", fetchMock);

    const bitable = new FeishuBitable(config);
    const reads = [bitable.listPackages(), bitable.listEntries(), bitable.listWishes()];
    await vi.waitFor(() => expect(tableCalls(fetchMock).length).toBe(3));

    // 写也排队：写不重试（可能已落库），让它超限就是直接失败。
    const write = bitable.createPackage({
      name: "名册助手",
      summary: "核对名册",
      carrier: "github",
      takeUrl: "https://github.com/example/roster",
      attachmentToken: null,
      prerequisites: "Node 20",
      submitterNickname: "Viy",
      reviewStatus: "待审",
      deliveredWishIds: [],
    });

    let settled = false;
    void write.then(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(settled).toBe(false);

    release();
    await expect(write).resolves.toBeTruthy();
    await Promise.all(reads);
  });

  it("retries a Data not ready read with the longer backoff", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
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
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("spreads retries apart with jitter instead of retrying in lockstep", async () => {
    vi.useFakeTimers();
    // 固定随机数，把抖动后的实际等待时刻钉死。
    vi.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValueOnce(0.9).mockReturnValue(0.5);
    const stamps: number[] = [];
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      if (String(input).includes("tenant_access_token")) return tokenResponse();
      stamps.push(Date.now());
      return json({ code: 1254607, msg: "Data not ready, please try again later" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = new FeishuBitable(config).listPackages();
    const assertion = expect(result).rejects.toThrow("1254607 Data not ready");
    await vi.runAllTimersAsync();
    await assertion;

    // 基础退避 500/1500/3000，抖动系数是 0.5 + random * 0.5：
    // 第一次重试 500 * 0.5 = 250ms，第二次 1500 * 0.95 = 1425ms，
    // 第三次 3000 * 0.75 = 2250ms。
    // 固定退避会让并发请求在同一毫秒一起重试，等于把限流失败再放大一次。
    const base = stamps[0] ?? 0;
    expect(stamps.map((s) => s - base)).toEqual([0, 250, 1675, 3925]);
  });

  it("gives a Data not ready read three retries before failing", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockImplementation(async () => json({ code: 1254607, msg: "Data not ready, please try again later" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = new FeishuBitable(config).listPackages();
    const assertion = expect(result).rejects.toThrow("1254607 Data not ready");
    await vi.runAllTimersAsync();
    await assertion;

    // 一次读 + 三次重试。
    expect(tableCalls(fetchMock)).toHaveLength(4);
  });
});
