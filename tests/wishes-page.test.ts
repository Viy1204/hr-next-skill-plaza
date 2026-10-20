import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pageReadQueries } from "@/runtime";
import WishesPage from "../app/wishes/page";

vi.mock("@/runtime", () => ({ pageReadQueries: vi.fn() }));

describe("wishes page", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reads wishes through the cached page queries", async () => {
    vi.stubGlobal("React", React);
    const listWishes = vi.fn().mockResolvedValue([]);
    vi.mocked(pageReadQueries).mockReturnValue({
      listSkillEntries: vi.fn().mockResolvedValue([]),
      listWishes,
    } as unknown as ReturnType<typeof pageReadQueries>);

    await WishesPage({ searchParams: Promise.resolve({}) });

    // 走缓存而不是每次直接打飞书 —— 直接读会撞并发上限，整页 500。
    expect(listWishes).toHaveBeenCalledTimes(1);
    expect(listWishes).toHaveBeenCalledWith({ hrFunction: undefined });
  });

  it("renders the wish list when the cached read succeeds", async () => {
    vi.stubGlobal("React", React);
    vi.mocked(pageReadQueries).mockReturnValue({
      listSkillEntries: vi.fn().mockResolvedValue([]),
      listWishes: vi.fn().mockResolvedValue([
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
      ]),
    } as unknown as ReturnType<typeof pageReadQueries>);

    const markup = renderToStaticMarkup(await WishesPage({ searchParams: Promise.resolve({}) }));

    expect(markup).toContain("许愿池");
    expect(markup).toContain("自动核对花名册");
  });
});
