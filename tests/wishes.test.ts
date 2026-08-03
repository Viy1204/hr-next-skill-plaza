import { describe, expect, it } from "vitest";
import { handleClaim, handleCreateWish, handleEndorse } from "@/http/handlers";
import { getWish, listWishes } from "@/app/use-cases";
import { cookieFrom, harness, post } from "./support/harness";

const NEW_WISH = {
  title: "每月核对花名册要花一整天",
  painScenario: "HRBP 每月初手工比对系统与台账，交付一份差异清单",
  hrFunction: "HR 运营与共享服务",
  painHours: 8,
  wisherNickname: "阿倩",
};

describe("许愿与附议", () => {
  it("新建许愿后立即出现在许愿池里", async () => {
    const { deps } = harness();

    await handleCreateWish(post("/api/wishes", NEW_WISH), deps);

    expect((await listWishes(deps)).map((w) => w.title)).toEqual([NEW_WISH.title]);
  });

  it("新建许愿推送一条含标题的群消息", async () => {
    const { deps, notifier } = harness();

    await handleCreateWish(post("/api/wishes", NEW_WISH), deps);

    expect(notifier.of("wish-created")).toHaveLength(1);
    expect(notifier.of("wish-created")[0]?.text).toContain(NEW_WISH.title);
  });

  it("拒绝未知的适用职能", async () => {
    const { deps } = harness();

    const response = await handleCreateWish(post("/api/wishes", { ...NEW_WISH, hrFunction: "ASSC" }), deps);

    expect(response.status).toBe(400);
    expect(await listWishes(deps)).toHaveLength(0);
  });

  it("痛点工时可以不填", async () => {
    const { deps } = harness();

    const response = await handleCreateWish(post("/api/wishes", { ...NEW_WISH, painHours: null }), deps);

    expect(response.status).toBe(201);
    expect((await listWishes(deps))[0]?.painHours).toBeNull();
  });

  it("许愿池按附议数降序排列", async () => {
    const { deps } = harness({
      wishes: [
        { id: "w-low", title: "冷门痛点", endorsementCount: 1 },
        { id: "w-high", title: "热门痛点", endorsementCount: 7 },
        { id: "w-mid", title: "中等痛点", endorsementCount: 4 },
      ],
    });

    expect((await listWishes(deps)).map((w) => w.title)).toEqual(["热门痛点", "中等痛点", "冷门痛点"]);
  });

  it("按适用职能筛选许愿", async () => {
    const { deps } = harness({
      wishes: [
        { id: "w-1", title: "招聘的痛点", hrFunction: "招聘" },
        { id: "w-2", title: "薪酬的痛点", hrFunction: "薪酬福利" },
      ],
    });

    expect((await listWishes(deps, { hrFunction: "薪酬福利" })).map((w) => w.title)).toEqual(["薪酬的痛点"]);
  });

  it("附议后附议数加一", async () => {
    const { deps } = harness({ wishes: [{ id: "w-1", endorsementCount: 2 }] });

    await handleEndorse(post("/api/wishes/w-1/endorse"), deps, "w-1");

    expect((await getWish(deps, "w-1"))?.endorsementCount).toBe(3);
  });

  it("同一访客重复附议：返回成功但附议数不变", async () => {
    const { deps } = harness({ wishes: [{ id: "w-1", endorsementCount: 0 }] });

    const first = await handleEndorse(post("/api/wishes/w-1/endorse"), deps, "w-1");
    const aid = cookieFrom(first, "aid");
    const second = await handleEndorse(post("/api/wishes/w-1/endorse", undefined, { cookie: aid! }), deps, "w-1");

    expect(second.status).toBe(200);
    expect((await getWish(deps, "w-1"))?.endorsementCount).toBe(1);
  });

  it("不存在的许愿返回 404", async () => {
    const { deps } = harness();

    expect((await handleEndorse(post("/api/wishes/nope/endorse"), deps, "nope")).status).toBe(404);
  });
});

describe("阈值升级", () => {
  it("附议数跨过阈值：状态变为待认领并推送开放认领", async () => {
    const { deps, notifier } = harness({
      wishes: [{ id: "w-1", title: "热门痛点", endorsementCount: 9 }],
      config: { 附议升级阈值: "10" },
    });

    await handleEndorse(post("/api/wishes/w-1/endorse"), deps, "w-1");

    expect((await getWish(deps, "w-1"))?.status).toBe("待认领");
    expect(notifier.of("wish-open-for-claim")).toHaveLength(1);
  });

  it("达到阈值后继续附议不重复推送", async () => {
    const { deps, notifier } = harness({
      wishes: [{ id: "w-1", endorsementCount: 9 }],
      config: { 附议升级阈值: "10" },
    });

    await handleEndorse(post("/api/wishes/w-1/endorse"), deps, "w-1");
    await handleEndorse(post("/api/wishes/w-1/endorse"), deps, "w-1");
    await handleEndorse(post("/api/wishes/w-1/endorse"), deps, "w-1");

    expect(notifier.of("wish-open-for-claim")).toHaveLength(1);
  });

  it("阈值来自配置：改成 3 时第三次附议就升级", async () => {
    const { deps, notifier } = harness({ wishes: [{ id: "w-1" }], config: { 附议升级阈值: "3" } });

    await handleEndorse(post("/api/wishes/w-1/endorse"), deps, "w-1");
    await handleEndorse(post("/api/wishes/w-1/endorse"), deps, "w-1");
    expect((await getWish(deps, "w-1"))?.status).toBe("收集中");

    await handleEndorse(post("/api/wishes/w-1/endorse"), deps, "w-1");

    expect((await getWish(deps, "w-1"))?.status).toBe("待认领");
    expect(notifier.of("wish-open-for-claim")).toHaveLength(1);
  });
});

describe("认领", () => {
  it("同一条许愿可被多人认领，全部认领人都显示出来", async () => {
    const { deps } = harness({ wishes: [{ id: "w-1" }] });

    await handleClaim(post("/api/wishes/w-1/claim", { claimerNickname: "阿倩" }), deps, "w-1");
    await handleClaim(post("/api/wishes/w-1/claim", { claimerNickname: "Viy" }), deps, "w-1");

    expect((await getWish(deps, "w-1"))?.claimerNicknames).toEqual(["阿倩", "Viy"]);
  });

  it("认领不发送群消息", async () => {
    const { deps, notifier } = harness({ wishes: [{ id: "w-1" }] });

    await handleClaim(post("/api/wishes/w-1/claim", { claimerNickname: "阿倩" }), deps, "w-1");

    expect(notifier.sent).toHaveLength(0);
  });

  it("认领必须署名", async () => {
    const { deps } = harness({ wishes: [{ id: "w-1" }] });

    const response = await handleClaim(post("/api/wishes/w-1/claim", { claimerNickname: "  " }), deps, "w-1");

    expect(response.status).toBe(400);
  });
});
