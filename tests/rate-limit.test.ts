import { describe, expect, it } from "vitest";
import { handleCreateWish, handleSubmitPackage } from "@/http/handlers";
import { harness, BASE_URL } from "./support/harness";

// 两个无鉴权写入口的节流：许愿 10 次/小时/IP，技能包 5 次/小时/IP。
// 拦的是脚本刷屏（每条许愿都是一次群推送、每个包都是一个云空间文件），不是人。

const WISH = {
  title: "每月核对花名册要花一整天",
  painScenario: "HRBP 手工比对",
  hrFunction: "HR 运营与共享服务",
};

const SUBMISSION = {
  name: "feishu-roster",
  summary: "拉花名册",
  carrier: "github",
  takeUrl: "https://github.com/Viy1204/hr-skills",
  prerequisites: "飞书凭证",
  entries: [{ name: "feishu-roster", description: "导出", hrFunction: "HR 运营与共享服务" }],
};

function postFrom(ip: string, path: string, body: unknown) {
  return new Request(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

const HOUR = 60 * 60 * 1000;

describe("写接口节流", () => {
  it("同一 IP 一小时第 11 条许愿会被拒", async () => {
    const { deps } = harness();

    for (let i = 0; i < 10; i += 1) {
      expect((await handleCreateWish(postFrom("1.2.3.4", "/api/wishes", WISH), deps, i)).status).toBe(201);
    }
    const blocked = await handleCreateWish(postFrom("1.2.3.4", "/api/wishes", WISH), deps, 10);

    expect(blocked.status).toBe(429);
    expect(((await blocked.json()) as { code?: string }).code).toBe("rate-limited");
  });

  it("别的 IP 不受牵连", async () => {
    const { deps } = harness();

    for (let i = 0; i < 10; i += 1) await handleCreateWish(postFrom("1.2.3.4", "/api/wishes", WISH), deps, i);

    expect((await handleCreateWish(postFrom("5.6.7.8", "/api/wishes", WISH), deps, 10)).status).toBe(201);
  });

  it("窗口滑过之后恢复", async () => {
    const { deps } = harness();

    for (let i = 0; i < 10; i += 1) await handleCreateWish(postFrom("1.2.3.4", "/api/wishes", WISH), deps, i);

    expect((await handleCreateWish(postFrom("1.2.3.4", "/api/wishes", WISH), deps, HOUR + 11)).status).toBe(201);
  });

  it("技能包提交一小时第 6 个会被拒", async () => {
    const { deps } = harness();

    for (let i = 0; i < 5; i += 1) {
      expect((await handleSubmitPackage(postFrom("1.2.3.4", "/api/packages", SUBMISSION), deps, i)).status).toBe(201);
    }

    expect((await handleSubmitPackage(postFrom("1.2.3.4", "/api/packages", SUBMISSION), deps, 5)).status).toBe(429);
  });
});
