import { describe, expect, it } from "vitest";
import { getSkillPackage, listSkillEntries } from "@/app/use-cases";
import { harness } from "./support/harness";

const seed = {
  packages: [
    { id: "pkg-a", name: "hr-skills · 花名册", takeCount: 30 },
    { id: "pkg-b", name: "recruiting-copilot", takeCount: 5 },
    { id: "pkg-draft", name: "待审的包", takeCount: 99, reviewStatus: "待审" as const },
    { id: "pkg-gone", name: "已下架的包", takeCount: 99, reviewStatus: "已下架" as const },
  ],
  entries: [
    { id: "e-roster", name: "feishu-roster", description: "实时拉取花名册", packageId: "pkg-a", hrFunction: "HR 运营与共享服务" as const },
    { id: "e-daily", name: "recruit-daily", description: "每日招聘初筛", packageId: "pkg-b", hrFunction: "招聘" as const, displayOrder: 1 },
    { id: "e-mapping", name: "recruit-mapping", description: "市场人才盘点", packageId: "pkg-b", hrFunction: "招聘" as const, displayOrder: 2 },
    { id: "e-hidden", name: "隐藏条目", packageId: "pkg-draft" },
    { id: "e-delisted", name: "下架条目", packageId: "pkg-gone" },
  ],
};

describe("技能目录", () => {
  it("待审与已下架技能包的条目不出现在列表里", async () => {
    const { deps } = harness(seed);

    const names = (await listSkillEntries(deps)).map((e) => e.name);

    expect(names).not.toContain("隐藏条目");
    expect(names).not.toContain("下架条目");
  });

  it("待审的技能包详情页不可见", async () => {
    const { deps } = harness(seed);

    expect(await getSkillPackage(deps, "pkg-draft")).toBeNull();
  });

  it("已下架的技能包详情页不可见", async () => {
    const { deps } = harness(seed);

    expect(await getSkillPackage(deps, "pkg-gone")).toBeNull();
  });

  it("按适用职能筛选只返回该职能的条目", async () => {
    const { deps } = harness(seed);

    const names = (await listSkillEntries(deps, { hrFunction: "招聘" })).map((e) => e.name);

    expect(names).toEqual(["recruit-daily", "recruit-mapping"]);
  });

  it("关键词搜索同时匹配条目名称与说明", async () => {
    const { deps } = harness(seed);

    const byName = await listSkillEntries(deps, { query: "roster" });
    const byDescription = await listSkillEntries(deps, { query: "市场人才" });

    expect(byName.map((e) => e.name)).toEqual(["feishu-roster"]);
    expect(byDescription.map((e) => e.name)).toEqual(["recruit-mapping"]);
  });

  it("条目按所属技能包的取得数降序排列", async () => {
    const { deps } = harness(seed);

    const names = (await listSkillEntries(deps)).map((e) => e.name);

    expect(names).toEqual(["feishu-roster", "recruit-daily", "recruit-mapping"]);
  });

  it("同一技能包下的多个条目显示同一个取得数，不摊分", async () => {
    const { deps } = harness(seed);

    const counts = (await listSkillEntries(deps, { hrFunction: "招聘" })).map((e) => e.packageTakeCount);

    expect(counts).toEqual([5, 5]);
  });

  it("技能包详情列出它包含的全部条目与前置条件", async () => {
    const { deps } = harness({
      packages: [{ id: "pkg-b", name: "recruiting-copilot", prerequisites: "Node ≥ 20、Chrome/Edge、Boss 直聘登录态" }],
      entries: seed.entries.filter((e) => e.packageId === "pkg-b"),
    });

    const view = await getSkillPackage(deps, "pkg-b");

    expect(view?.entries.map((e) => e.name)).toEqual(["recruit-daily", "recruit-mapping"]);
    expect(view?.prerequisites).toContain("Node ≥ 20");
  });
});
