"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HR_FUNCTIONS } from "@/domain/types";

export default function NewWishPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/wishes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        painScenario: form.get("painScenario"),
        hrFunction: form.get("hrFunction"),
        painHours: form.get("painHours"),
        wisherNickname: form.get("wisherNickname"),
      }),
    });
    if (!response.ok) {
      setPending(false);
      setError("提交失败，标题、痛点场景和适用职能都要填。");
      return;
    }
    const body = (await response.json()) as { id: string };
    router.push(`/wishes/${body.id}`);
  }

  return (
    <>
      <h1>我要许愿</h1>
      <p className="lede">
        只描述你卡在哪，不用想技术方案 —— 方案是认领人的事。描述得越具体，越容易有人接。
      </p>

      <form onSubmit={submit}>
        <label>
          一句话说清你想要什么
          <span className="hint">例如：每月核对花名册要花一整天</span>
          <input name="title" required maxLength={60} />
        </label>

        <label>
          痛点场景
          <span className="hint">谁、在什么时间、进行什么操作、需交付什么结果</span>
          <textarea
            name="painScenario"
            required
            placeholder="HRBP 每月初手工比对系统导出与本地台账，交付一份人员差异清单给业务负责人"
          />
        </label>

        <label>
          适用职能
          <select name="hrFunction" required defaultValue="">
            <option value="" disabled>
              选一个
            </option>
            {HR_FUNCTIONS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label>
          你每月为这件事花多少小时（选填）
          <span className="hint">只展示给可能来认领的人做判断，不进任何排序公式 —— 填小了不会没人看</span>
          <input name="painHours" type="number" min="0" step="0.5" />
        </label>

        <label>
          你的昵称（选填）
          <span className="hint">留了名，有人想细聊时能在群里找到你</span>
          <input name="wisherNickname" maxLength={20} />
        </label>

        <p style={{ marginTop: 20 }}>
          <button className="btn warm" type="submit" disabled={pending}>
            {pending ? "提交中…" : "许下这个愿"}
          </button>
        </p>

        {error ? <p className="note">{error}</p> : null}
      </form>
    </>
  );
}
