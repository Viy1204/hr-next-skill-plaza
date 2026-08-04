import { describe, expect, it } from "vitest";
import { handleCreateWish, handleEndorse, handleSubmitPackage, handleSyncDeliveries } from "@/http/handlers";
import { listWishes } from "@/app/use-cases";
import { harness, post } from "./support/harness";

// 这批测试盯的是同一类事故：群推送失败或阈值被调低时，消息静默丢失、状态静默错位。
// 契约是「至少一次」：推送失败绝不拖垮主操作，也绝不永久丢 —— 定时对账会补。

const SECRET = "s3cret";

function sync(deps: Parameters<typeof handleSyncDeliveries>[1]) {
  return handleSyncDeliveries(post("/api/internal/deliveries/sync", undefined, { "x-sync-secret": SECRET }), deps, SECRET);
}

const NEW_WISH = {
  title: "每月核对花名册要花一整天",
  painScenario: "HRBP 每月初手工比对系统与台账",
  hrFunction: "HR 运营与共享服务",
  wisherNickname: "阿倩",
};

const SUBMISSION = {
  name: "feishu-roster",
  summary: "实时拉取花名册并导出",
  carrier: "github",
  takeUrl: "https://github.com/Viy1204/hr-skills",
  prerequisites: "飞书自建应用凭证",
  submitterNickname: "Viy",
  entries: [{ name: "feishu-roster", description: "导出花名册", hrFunction: "HR 运营与共享服务" }],
};

describe("阈值调低后的对账", () => {
  it("存量许愿够到新阈值：定时同步补升级并推群", async () => {
    const { deps, bitable, notifier } = harness({
      wishes: [{ id: "w-1", title: "存量痛点", endorsementCount: 5 }],
      config: { 附议升级阈值: "10" },
    });

    bitable.setConfig("附议升级阈值", "3");
    await sync(deps);

    expect((await bitable.getWish("w-1"))?.status).toBe("待认领");
    expect(notifier.of("wish-open-for-claim")).toHaveLength(1);
  });

  it("补推只发一次，重复同步不刷屏", async () => {
    const { deps, bitable, notifier } = harness({
      wishes: [{ id: "w-1", endorsementCount: 5 }],
      config: { 附议升级阈值: "10" },
    });
    bitable.setConfig("附议升级阈值", "3");

    await sync(deps);
    await sync(deps);

    expect(notifier.of("wish-open-for-claim")).toHaveLength(1);
  });

  it("没够到阈值的不动", async () => {
    const { deps, bitable, notifier } = harness({
      wishes: [{ id: "w-1", endorsementCount: 2 }],
      config: { 附议升级阈值: "3" },
    });

    await sync(deps);

    expect((await bitable.getWish("w-1"))?.status).toBe("收集中");
    expect(notifier.of("wish-open-for-claim")).toHaveLength(0);
  });

  it("已有交付的许愿走交付分支，不再招人", async () => {
    const { deps, bitable, notifier } = harness({
      packages: [{ id: "pkg-1" }],
      wishes: [{ id: "w-1", endorsementCount: 50 }],
      config: { 附议升级阈值: "10" },
    });
    bitable.deliver("pkg-1", "w-1");

    await sync(deps);

    expect(notifier.of("wish-delivered")).toHaveLength(1);
    expect(notifier.of("wish-open-for-claim")).toHaveLength(0);
  });
});

describe("推送失败不丢消息、不拖垮主操作", () => {
  it("webhook 挂了，许愿照常创建成功", async () => {
    const { deps, notifier } = harness();
    notifier.sendsFail = true;

    const response = await handleCreateWish(post("/api/wishes", NEW_WISH), deps);

    expect(response.status).toBe(201);
    expect(await listWishes(deps)).toHaveLength(1);
  });

  it("webhook 挂了，技能包照常提交成功", async () => {
    const { deps, notifier } = harness();
    notifier.sendsFail = true;

    expect((await handleSubmitPackage(post("/api/packages", SUBMISSION), deps)).status).toBe(201);
  });

  it("交付推送失败：状态不动，下一轮同步补推", async () => {
    const { deps, bitable, notifier } = harness({ packages: [{ id: "pkg-1" }], wishes: [{ id: "w-1" }] });
    bitable.deliver("pkg-1", "w-1");

    notifier.sendsFail = true;
    await sync(deps);
    expect((await bitable.getWish("w-1"))?.status).toBe("收集中");

    notifier.sendsFail = false;
    await sync(deps);

    expect(notifier.of("wish-delivered")).toHaveLength(1);
    expect((await bitable.getWish("w-1"))?.status).toBe("已交付");
  });

  it("附议跨线但推送失败：附议已计入，招人推送由同步补发", async () => {
    const { deps, bitable, notifier } = harness({
      wishes: [{ id: "w-1", endorsementCount: 9 }],
      config: { 附议升级阈值: "10" },
    });

    notifier.sendsFail = true;
    const response = await handleEndorse(post("/api/wishes/w-1/endorse"), deps, "w-1");
    expect(response.status).toBe(200);
    expect((await bitable.getWish("w-1"))?.endorsementCount).toBe(10);
    expect((await bitable.getWish("w-1"))?.status).toBe("收集中");

    notifier.sendsFail = false;
    await sync(deps);

    expect(notifier.of("wish-open-for-claim")).toHaveLength(1);
    expect((await bitable.getWish("w-1"))?.status).toBe("待认领");
  });
});

describe("提交技能包的群通知", () => {
  it("提交即推「新技能包待审」，带包名和提报人", async () => {
    const { deps, notifier } = harness();

    await handleSubmitPackage(post("/api/packages", SUBMISSION), deps);

    const pushes = notifier.of("package-submitted");
    expect(pushes).toHaveLength(1);
    expect(pushes[0]?.text).toContain("feishu-roster");
    expect(pushes[0]?.text).toContain("Viy");
  });

  it("没留昵称按匿名署名", async () => {
    const { deps, notifier } = harness();

    await handleSubmitPackage(post("/api/packages", { ...SUBMISSION, submitterNickname: "" }), deps);

    expect(notifier.of("package-submitted")[0]?.text).toContain("匿名");
  });
});

describe("附议数自愈", () => {
  it("存储的附议数漂移后，下一次附议把它拉回行数", async () => {
    const { deps, bitable } = harness({ wishes: [{ id: "w-1", endorsementCount: 3 }] });
    await bitable.setWishEndorsementCount("w-1", 40);

    await handleEndorse(post("/api/wishes/w-1/endorse"), deps, "w-1");

    expect((await bitable.getWish("w-1"))?.endorsementCount).toBe(4);
  });
});
