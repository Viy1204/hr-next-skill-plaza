import type { ReactElement } from "react";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { listWishes } from "@/app/use-cases";
import { pageReadQueries } from "@/runtime";
import NewPackagePage from "../app/skills/new/page";
import { harness } from "./support/harness";

vi.mock("@/runtime", () => ({ pageReadQueries: vi.fn() }));

describe("new package page", () => {
  it("keeps the submission form available when wishes cannot be loaded", async () => {
    vi.stubGlobal("React", React);
    const test = harness();
    test.bitable.listPackages = vi.fn().mockRejectedValue(new Error("1254607 Data not ready"));
    vi.mocked(pageReadQueries).mockReturnValue({
      listSkillEntries: vi.fn().mockResolvedValue([]),
      listWishes: () => listWishes(test.deps),
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const page = (await NewPackagePage()) as ReactElement<{
      wishes: { id: string; title: string }[];
      wishesUnavailable: boolean;
    }>;

    expect(page.props).toMatchObject({ wishes: [], wishesUnavailable: true });
    expect(log).toHaveBeenCalledWith("failed to load wishes for package submission", {
      error: expect.any(Error),
    });
    log.mockRestore();
  });
});
