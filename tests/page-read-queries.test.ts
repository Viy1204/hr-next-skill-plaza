import { describe, expect, it, vi } from "vitest";
import { createPageReadQueries } from "@/app/page-read-queries";

describe("page read queries", () => {
  it("reuses a successful result for 60 seconds", async () => {
    let now = 1_000;
    const loadSkillEntries = vi.fn().mockResolvedValue([
      {
        id: "entry-1",
        name: "feishu-roster",
        description: "导出花名册",
        packageId: "pkg-1",
        hrFunction: "HR 运营与共享服务",
        displayOrder: 1,
        packageName: "飞书工具包",
        packageTakeCount: 3,
      },
    ]);
    const queries = createPageReadQueries({
      loadSkillEntries,
      loadWishes: vi.fn().mockResolvedValue([]),
      now: () => now,
    });

    await queries.listSkillEntries();
    now += 59_999;
    await queries.listSkillEntries({ query: "roster" });

    expect(loadSkillEntries).toHaveBeenCalledTimes(1);

    now += 2;
    await queries.listSkillEntries();

    expect(loadSkillEntries).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent reads for the same dataset", async () => {
    let resolveLoad: (value: never[]) => void = () => undefined;
    const loadSkillEntries = vi.fn(
      () =>
        new Promise<never[]>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const queries = createPageReadQueries({
      loadSkillEntries,
      loadWishes: vi.fn().mockResolvedValue([]),
    });

    const first = queries.listSkillEntries();
    const second = queries.listSkillEntries();
    resolveLoad([]);

    await expect(Promise.all([first, second])).resolves.toEqual([[], []]);
    expect(loadSkillEntries).toHaveBeenCalledTimes(1);
  });

  it("reuses wishes across page filters", async () => {
    const loadWishes = vi.fn().mockResolvedValue([
      {
        id: "wish-1",
        title: "自动核对花名册",
        painScenario: "每月手工核对",
        hrFunction: "HR 运营与共享服务",
        painHours: 4,
        wisherNickname: "Viy",
        endorsementCount: 2,
        status: "收集中",
        createdAt: "2026-08-06",
        claimerNicknames: [],
        deliveredByPackageIds: [],
      },
    ]);
    const queries = createPageReadQueries({
      loadSkillEntries: vi.fn().mockResolvedValue([]),
      loadWishes,
    });

    await queries.listWishes();
    const filtered = await queries.listWishes({ hrFunction: "招聘" });

    expect(filtered).toEqual([]);
    expect(loadWishes).toHaveBeenCalledTimes(1);
  });

  it("does not cache failed reads", async () => {
    const loadSkillEntries = vi
      .fn()
      .mockRejectedValueOnce(new Error("1254607 Data not ready"))
      .mockResolvedValueOnce([]);
    const queries = createPageReadQueries({
      loadSkillEntries,
      loadWishes: vi.fn().mockResolvedValue([]),
    });

    await expect(queries.listSkillEntries()).rejects.toThrow("1254607 Data not ready");
    await expect(queries.listSkillEntries()).resolves.toEqual([]);

    expect(loadSkillEntries).toHaveBeenCalledTimes(2);
  });

  it("serves the last good data when a later read fails", async () => {
    let now = 1_000;
    const entries = [
      {
        id: "entry-1",
        name: "feishu-roster",
        description: "导出花名册",
        packageId: "pkg-1",
        hrFunction: "HR 运营与共享服务" as const,
        displayOrder: 1,
        packageName: "飞书工具包",
        packageTakeCount: 3,
      },
    ];
    const loadSkillEntries = vi
      .fn()
      .mockResolvedValueOnce(entries)
      .mockRejectedValueOnce(new Error("1254607 Data not ready"));
    const queries = createPageReadQueries({
      loadSkillEntries,
      loadWishes: vi.fn().mockResolvedValue([]),
      now: () => now,
    });

    await expect(queries.listSkillEntries()).resolves.toEqual(entries);

    // 缓存过期后重新读，这一轮飞书挂了 —— 页面应退回上一次读到的数据，而不是整页报错。
    now += 61_000;
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(queries.listSkillEntries()).resolves.toEqual(entries);
  });

  it("gives up on the stale data once it is too old", async () => {
    let now = 1_000;
    const loadSkillEntries = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("1254607 Data not ready"));
    const queries = createPageReadQueries({
      loadSkillEntries,
      loadWishes: vi.fn().mockResolvedValue([]),
      now: () => now,
    });

    await queries.listSkillEntries();

    // 超过兜底窗口：宁可报错，也不拿十分钟前的数据糊墙。
    now += 11 * 60_000;
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(queries.listSkillEntries()).rejects.toThrow("1254607 Data not ready");
  });
});
