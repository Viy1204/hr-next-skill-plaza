import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deps } from "@/runtime";
import Home from "../app/page";
import { harness } from "./support/harness";

vi.mock("@/runtime", () => ({ deps: vi.fn() }));

describe("home page", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("still renders useful navigation when Bitable data is unavailable", async () => {
    vi.stubGlobal("React", React);
    const test = harness();
    test.bitable.listPackages = vi.fn().mockRejectedValue(new Error("1254607 Data not ready"));
    vi.mocked(deps).mockReturnValue(test.deps);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const markup = renderToStaticMarkup(await Home());

    expect(markup).toContain("HR NEXT 社群小站");
    expect(markup).toContain("部分数据暂时没加载出来");
    expect(markup).toContain("技能目录暂时没加载出来");
    expect(markup).toContain("许愿池暂时没加载出来");
    expect(markup).not.toContain("还没有技能条目");
  });

  it("keeps available wishes when only the skill catalogue fails", async () => {
    vi.stubGlobal("React", React);
    const test = harness({ wishes: [{ id: "wish-1", title: "每月自动核对花名册" }] });
    test.bitable.listEntries = vi.fn().mockRejectedValue(new Error("1254607 Data not ready"));
    vi.mocked(deps).mockReturnValue(test.deps);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const markup = renderToStaticMarkup(await Home());

    expect(markup).toContain("技能目录暂时没加载出来");
    expect(markup).toContain("每月自动核对花名册");
    expect(markup).not.toContain("许愿池暂时没加载出来");
  });
});
