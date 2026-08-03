import { describe, expect, it } from "vitest";
import { handleTake } from "@/http/handlers";
import { getSkillPackage } from "@/app/use-cases";
import { cookieFrom, get, harness } from "./support/harness";

const GITHUB_PKG = {
  id: "pkg-roster",
  name: "feishu-roster",
  carrier: "github" as const,
  takeUrl: "https://github.com/Viy1204/hr-skills",
};

const ZIP_PKG = {
  id: "pkg-zip",
  name: "考勤分析",
  carrier: "zip" as const,
  takeUrl: "https://files.plaza.test/attendance.zip",
};

describe("取得", () => {
  it("GitHub 载体的技能包跳转到仓库地址", async () => {
    const { deps } = harness({ packages: [GITHUB_PKG] });

    const response = await handleTake(get("/get/pkg-roster"), deps, "pkg-roster");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://github.com/Viy1204/hr-skills");
  });

  it("zip 载体的技能包跳转到文件地址", async () => {
    const { deps } = harness({ packages: [ZIP_PKG] });

    const response = await handleTake(get("/get/pkg-zip"), deps, "pkg-zip");

    expect(response.headers.get("location")).toBe("https://files.plaza.test/attendance.zip");
  });

  it("取得一次后取得数加一", async () => {
    const { deps } = harness({ packages: [GITHUB_PKG] });

    await handleTake(get("/get/pkg-roster"), deps, "pkg-roster");

    const view = await getSkillPackage(deps, "pkg-roster");
    expect(view?.takeCount).toBe(1);
  });

  it("同一访客在去重窗口内重复取得，取得数不变", async () => {
    const { deps } = harness({ packages: [GITHUB_PKG] });

    const first = await handleTake(get("/get/pkg-roster"), deps, "pkg-roster");
    const taken = cookieFrom(first, "taken");
    await handleTake(get("/get/pkg-roster", taken), deps, "pkg-roster");

    const view = await getSkillPackage(deps, "pkg-roster");
    expect(view?.takeCount).toBe(1);
  });

  it("去重窗口过期后再取得，取得数继续增加", async () => {
    const { deps } = harness({ packages: [GITHUB_PKG], config: { 取得去重窗口小时: "24" } });
    const start = Date.parse("2026-08-03T00:00:00Z");

    const first = await handleTake(get("/get/pkg-roster"), deps, "pkg-roster", start);
    const taken = cookieFrom(first, "taken");
    const later = start + 25 * 60 * 60 * 1000;
    await handleTake(get("/get/pkg-roster", taken), deps, "pkg-roster", later);

    const view = await getSkillPackage(deps, "pkg-roster");
    expect(view?.takeCount).toBe(2);
  });

  it("计数写入失败时依然把访客送到技能包", async () => {
    const { deps, bitable } = harness({ packages: [GITHUB_PKG] });
    bitable.writesFail = true;

    const response = await handleTake(get("/get/pkg-roster"), deps, "pkg-roster");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://github.com/Viy1204/hr-skills");
  });

  it("未发布的技能包不可取得", async () => {
    const { deps } = harness({ packages: [{ ...GITHUB_PKG, reviewStatus: "待审" }] });

    const response = await handleTake(get("/get/pkg-roster"), deps, "pkg-roster");

    expect(response.status).toBe(404);
  });
});
