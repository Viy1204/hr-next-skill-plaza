import { describe, expect, it } from "vitest";
import { handleSubmitPackage, handleSyncDeliveries, handleTake } from "@/http/handlers";
import { getSkillPackage, listSkillEntries, listWishes } from "@/app/use-cases";
import { harness, post, get, BASE_URL } from "./support/harness";

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

const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x0a, 0x00, 0x00, 0x00]);

function multipart(fields: Record<string, string>, file?: { name: string; bytes: Uint8Array }) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  if (file) form.set("file", new Blob([file.bytes as BlobPart], { type: "application/zip" }), file.name);
  return new Request(`${BASE_URL}/api/packages`, { method: "POST", body: form });
}

const zipFields = {
  name: "考勤分析工具",
  summary: "一个打包好的考勤分析脚本",
  carrier: "zip",
  prerequisites: "Python 3.11",
  entries: JSON.stringify([{ name: "考勤分析", description: "跑一遍出报表", hrFunction: "HR 数据分析" }]),
};

describe("上传 zip 上架", () => {
  it("上传的文件在发布后能从取得出口下载到", async () => {
    const { deps, bitable } = harness();

    const created = await handleSubmitPackage(multipart(zipFields, { name: "attendance.zip", bytes: ZIP_BYTES }), deps);
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    await bitable.setReviewStatus(id, "已发布");

    const response = await handleTake(get(`/get/${id}`), deps, id);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toContain("attendance.zip");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(ZIP_BYTES);
  });

  it("待审期间下载不到 —— 审核这道闸对附件同样成立", async () => {
    const { deps } = harness();
    const { id } = (await (
      await handleSubmitPackage(multipart(zipFields, { name: "attendance.zip", bytes: ZIP_BYTES }), deps)
    ).json()) as { id: string };

    expect((await handleTake(get(`/get/${id}`), deps, id)).status).toBe(404);
  });

  it("取得数照常累加", async () => {
    const { deps, bitable } = harness();
    const { id } = (await (
      await handleSubmitPackage(multipart(zipFields, { name: "attendance.zip", bytes: ZIP_BYTES }), deps)
    ).json()) as { id: string };
    await bitable.setReviewStatus(id, "已发布");

    await handleTake(get(`/get/${id}`), deps, id);

    expect((await bitable.getPackage(id))?.takeCount).toBe(1);
  });

  it("不是 zip 的文件会被拒，且不会留下半截记录", async () => {
    const { deps, storage } = harness();
    const notZip = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);

    const response = await handleSubmitPackage(multipart(zipFields, { name: "tool.zip", bytes: notZip }), deps);

    expect(response.status).toBe(400);
    expect(await deps.bitable.listPackages()).toEqual([]);
    expect(storage.count).toBe(0);
  });

  it("github 载体不接受上传的文件", async () => {
    const { deps } = harness();

    const response = await handleSubmitPackage(
      multipart({ ...zipFields, carrier: "github", takeUrl: "https://github.com/a/b" }, { name: "x.zip", bytes: ZIP_BYTES }),
      deps,
    );

    expect(response.status).toBe(400);
  });

  it("zip 载体既没上传也没填地址会被拒", async () => {
    const { deps } = harness();

    expect((await handleSubmitPackage(multipart(zipFields), deps)).status).toBe(400);
  });

  it("上传失败就不建记录，目录里不会出现一个下不来的包", async () => {
    const { deps, storage } = harness();
    storage.uploadsFail = true;

    await expect(
      handleSubmitPackage(multipart(zipFields, { name: "attendance.zip", bytes: ZIP_BYTES }), deps),
    ).rejects.toThrow();
    expect(await deps.bitable.listPackages()).toEqual([]);
  });
});
