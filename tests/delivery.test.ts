import { describe, expect, it } from "vitest";
import { handleSyncDeliveries } from "@/http/handlers";
import { getWish } from "@/app/use-cases";
import { harness, post } from "./support/harness";

const SECRET = "s3cret";

function sync(deps: Parameters<typeof handleSyncDeliveries>[1], secret = SECRET) {
  return handleSyncDeliveries(post("/api/internal/deliveries/sync", undefined, { "x-sync-secret": secret }), deps, SECRET);
}

describe("交付", () => {
  it("技能包关联到许愿后，许愿状态变为已交付", async () => {
    const { deps, bitable } = harness({
      packages: [{ id: "pkg-1", name: "花名册核对" }],
      wishes: [{ id: "w-1", title: "每月核对花名册要花一整天" }],
    });
    bitable.deliver("pkg-1", "w-1");

    await sync(deps);

    expect((await getWish(deps, "w-1"))?.status).toBe("已交付");
  });

  it("交付后许愿详情给出交付它的技能包入口", async () => {
    const { deps, bitable } = harness({
      packages: [{ id: "pkg-1" }],
      wishes: [{ id: "w-1" }],
    });
    bitable.deliver("pkg-1", "w-1");

    expect((await getWish(deps, "w-1"))?.deliveredByPackageIds).toEqual(["pkg-1"]);
  });

  it("交付推送一条含技能包名称的群消息", async () => {
    const { deps, bitable, notifier } = harness({
      packages: [{ id: "pkg-1", name: "花名册核对" }],
      wishes: [{ id: "w-1" }],
    });
    bitable.deliver("pkg-1", "w-1");

    await sync(deps);

    expect(notifier.of("wish-delivered")).toHaveLength(1);
    expect(notifier.of("wish-delivered")[0]?.text).toContain("花名册核对");
  });

  it("重复同步不重复推送", async () => {
    const { deps, bitable, notifier } = harness({ packages: [{ id: "pkg-1" }], wishes: [{ id: "w-1" }] });
    bitable.deliver("pkg-1", "w-1");

    await sync(deps);
    await sync(deps);

    expect(notifier.of("wish-delivered")).toHaveLength(1);
  });

  it("无人认领也能因为有技能包关联而交付", async () => {
    const { deps, bitable } = harness({ packages: [{ id: "pkg-1" }], wishes: [{ id: "w-1" }] });
    bitable.deliver("pkg-1", "w-1");

    await sync(deps);

    const wish = await getWish(deps, "w-1");
    expect(wish?.claimerNicknames).toEqual([]);
    expect(wish?.status).toBe("已交付");
  });

  it("未发布的技能包不构成交付", async () => {
    const { deps, bitable } = harness({
      packages: [{ id: "pkg-1", reviewStatus: "待审" }],
      wishes: [{ id: "w-1" }],
    });
    bitable.deliver("pkg-1", "w-1");

    await sync(deps);

    expect((await getWish(deps, "w-1"))?.status).toBe("收集中");
  });

  it("交付状态压过阈值：已交付的许愿不会退回待认领", async () => {
    const { deps, bitable } = harness({
      packages: [{ id: "pkg-1" }],
      wishes: [{ id: "w-1", endorsementCount: 50 }],
      config: { 附议升级阈值: "10" },
    });
    bitable.deliver("pkg-1", "w-1");

    expect((await getWish(deps, "w-1"))?.status).toBe("已交付");
  });

  it("同步接口拒绝错误的密钥", async () => {
    const { deps } = harness();

    expect((await sync(deps, "wrong")).status).toBe(403);
  });
});
