import { describe, expect, it } from "vitest";
import { handleSubmitPackage, handleSyncDeliveries } from "@/http/handlers";
import { getSkillPackage, listSkillEntries, listWishes } from "@/app/use-cases";
import { harness, post } from "./support/harness";

const submission = {
  name: "feishu-roster",
  summary: "实时拉取花名册并导出 Excel + JSON",
  carrier: "github",
  takeUrl: "https://github.com/Viy1204/hr-skills",
  prerequisites: "飞书自建应用凭证；ehr 员工数据读取权限",
  submitterNickname: "Viy",
  entries: [{ name: "feishu-roster", description: "导出花名册", hrFunction: "HR 运营与共享服务" }],
};

async function submit(deps: ReturnType<typeof harness>["deps"], body: unknown) {
  return handleSubmitPackage(post("/api/packages", body), deps);
}

describe("自助上架技能包", () => {
  it("提交后不出现在目录里，等运营发布", async () => {
    const { deps } = harness();

    const response = await submit(deps, submission);
    expect(response.status).toBe(201);

    expect(await listSkillEntries(deps)).toEqual([]);
  });

  it("运营发布后条目连同所属技能包一起可见", async () => {
    const { deps, bitable } = harness();
    const { id } = (await (await submit(deps, submission)).json()) as { id: string };

    await bitable.setReviewStatus(id, "已发布");

    const entries = await listSkillEntries(deps);
    expect(entries.map((e) => e.name)).toEqual(["feishu-roster"]);
    expect(entries[0]?.packageName).toBe("feishu-roster");
  });

  it("多个条目按提交顺序展示", async () => {
    const { deps, bitable } = harness();
    const { id } = (await (
      await submit(deps, {
        ...submission,
        entries: [
          { name: "recruit-init", description: "初始化工作区", hrFunction: "招聘" },
          { name: "recruit-daily", description: "每日初筛", hrFunction: "招聘" },
        ],
      })
    ).json()) as { id: string };

    await bitable.setReviewStatus(id, "已发布");

    const pkg = await getSkillPackage(deps, id);
    expect(pkg?.entries.map((e) => e.name)).toEqual(["recruit-init", "recruit-daily"]);
  });

  it("作者声明的交付关联在发布前不算数", async () => {
    const { deps, notifier } = harness({ wishes: [{ id: "wish-1", title: "花名册核对" }] });

    await submit(deps, { ...submission, deliveredWishId: "wish-1" });
    await handleSyncDeliveries(post("/sync", undefined, { "x-sync-secret": "s3cret" }), deps, "s3cret");

    expect((await listWishes(deps))[0]?.status).toBe("收集中");
    expect(notifier.of("wish-delivered")).toEqual([]);
  });

  it("运营发布后，交付关联才让许愿变成已交付并推群", async () => {
    const { deps, bitable, notifier } = harness({ wishes: [{ id: "wish-1", title: "花名册核对" }] });
    const { id } = (await (await submit(deps, { ...submission, deliveredWishId: "wish-1" })).json()) as {
      id: string;
    };

    await bitable.setReviewStatus(id, "已发布");
    await handleSyncDeliveries(post("/sync", undefined, { "x-sync-secret": "s3cret" }), deps, "s3cret");

    expect((await listWishes(deps))[0]?.status).toBe("已交付");
    expect(notifier.of("wish-delivered")).toHaveLength(1);
  });

  it("关联到不存在的许愿会被拒绝", async () => {
    const { deps } = harness();

    const response = await submit(deps, { ...submission, deliveredWishId: "wish-nope" });

    expect(response.status).toBe(400);
    expect(await listSkillEntries(deps)).toEqual([]);
  });

  it("缺前置条件、缺条目、地址不是链接都会被拒绝", async () => {
    const { deps } = harness();

    const cases = [
      { ...submission, prerequisites: "  " },
      { ...submission, entries: [] },
      { ...submission, takeUrl: "github.com/Viy1204/hr-skills" },
      { ...submission, entries: [{ name: "x", description: "y", hrFunction: "招聘运营" }] },
    ];

    for (const body of cases) {
      expect((await submit(deps, body)).status).toBe(400);
    }
  });
});
