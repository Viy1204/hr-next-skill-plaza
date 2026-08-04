"use client";

import { useState } from "react";
import Link from "next/link";
import { HR_FUNCTIONS } from "@/domain/types";

interface EntryDraft {
  name: string;
  description: string;
  hrFunction: string;
}

const EMPTY_ENTRY: EntryDraft = { name: "", description: "", hrFunction: "" };
const MAX_ENTRIES = 12;

/** 后端返回稳定的错误 code，这里按 code 翻成填表人能照着改的话 —— 匹配英文
 *  message 文本的老做法在后端改一个词时就会静默失配。 */
function messageFor(code: string | undefined) {
  switch (code) {
    case "file-too-large":
      return "文件超过 20MB，太大了。放 GitHub 或者给个直链吧。";
    case "file-not-zip":
      return "只收 .zip 文件。";
    case "take-url-invalid":
      return "要么上传一个 zip，要么填一个 http(s) 开头的地址。";
    case "rate-limited":
      return "提交太频繁了，过一会儿再试。";
    default:
      return "提交失败：名称、简介、前置条件都要填，且至少要有一个技能条目。";
  }
}

export default function SubmitPackageForm({ wishes }: { wishes: { id: string; title: string }[] }) {
  const [entries, setEntries] = useState<EntryDraft[]>([{ ...EMPTY_ENTRY }]);
  const [carrier, setCarrier] = useState("github");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function updateEntry(index: number, patch: Partial<EntryDraft>) {
    setEntries((current) => current.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    // 带文件时必须走 multipart，条目列表塞成一段 JSON 文本随行。
    form.set("entries", JSON.stringify(entries));
    const response = await fetch("/api/packages", { method: "POST", body: form });
    setPending(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { code?: string } | null;
      setError(messageFor(body?.code));
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <>
        <h1>已提交，等运营上架</h1>
        <p className="lede">
          你的技能包已经进了目录的待审队列。运营核对完前置条件和取得地址就会上架，之后它才会出现在技能目录里。
        </p>
        <div className="note">
          审核前它对其他人不可见，所以现在还搜不到。如果急，去 HR NEXT 群里说一声。
        </div>
        <p style={{ marginTop: 20 }}>
          <Link className="btn" href="/skills">
            回技能目录
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1>上架技能包</h1>
      <p className="lede">
        做出来的东西放这儿给群友取。填完提交给运营审一遍就上架 —— 代码放你自己的 GitHub，平台只存一个取得地址。
      </p>

      <form onSubmit={submit}>
        <label>
          技能包名称
          <span className="hint">例如 feishu-roster</span>
          <input name="name" required maxLength={60} />
        </label>

        <label>
          简介
          <span className="hint">一两句说清它干什么</span>
          <textarea name="summary" required style={{ minHeight: 70 }} />
        </label>

        <label>
          载体类型
          <select name="carrier" required value={carrier} onChange={(event) => setCarrier(event.target.value)}>
            <option value="github">GitHub 仓库</option>
            <option value="zip">zip 包</option>
          </select>
        </label>

        {carrier === "github" ? (
          <label>
            仓库地址
            <span className="hint">作者往仓库推新版，取的人自动拿到最新的，这边不用改</span>
            <input name="takeUrl" type="url" required placeholder="https://github.com/..." />
          </label>
        ) : (
          <>
            <label>
              上传 zip 文件（选填）
              <span className="hint">最大 20MB。上传的文件存在飞书云空间，不公开，只能从本站的取得出口下载</span>
              <input name="file" type="file" accept=".zip,application/zip" />
            </label>
            <label>
              或者填一个直链
              <span className="hint">已经有能直接下载的地址就填这里，两者填一个即可</span>
              <input name="takeUrl" type="url" placeholder="https://..." />
            </label>
          </>
        )}

        <label>
          前置条件
          <span className="hint">
            使用者必须自备什么：运行时版本、要装的浏览器、要自己登录的平台、API 凭证。这栏写不清楚，别人取回去大概率装不上
          </span>
          <textarea name="prerequisites" required placeholder="Node ≥ 20；本机装 Chrome 或 Edge；Boss 直聘登录态需自己扫码" />
        </label>

        <label>
          你的昵称
          <span className="hint">群里认得出你就行</span>
          <input name="submitterNickname" maxLength={20} />
        </label>

        <label>
          它交付了哪条许愿（选填）
          <span className="hint">如果这个技能包是为了满足许愿池里的某条痛点，选上；运营上架后那条许愿会自动标记为已交付</span>
          <select name="deliveredWishId" defaultValue="">
            <option value="">不关联</option>
            {wishes.map((wish) => (
              <option key={wish.id} value={wish.id}>
                {wish.title}
              </option>
            ))}
          </select>
        </label>

        <h2>包含的技能条目</h2>
        <p className="section-desc">
          一个技能条目是一个具体能力。能各自独立取得的能力请分开提交成多个技能包；只有共用一套安装脚本、拆不开的，才放进同一个包。
        </p>

        {entries.map((entry, index) => (
          <div className="card" key={index}>
            <label style={{ marginTop: 0 }}>
              条目名称
              <input
                value={entry.name}
                onChange={(event) => updateEntry(index, { name: event.target.value })}
                required
                maxLength={60}
              />
            </label>
            <label>
              说明
              <input
                value={entry.description}
                onChange={(event) => updateEntry(index, { description: event.target.value })}
                required
              />
            </label>
            <label>
              适用职能
              <select
                value={entry.hrFunction}
                onChange={(event) => updateEntry(index, { hrFunction: event.target.value })}
                required
              >
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
            {entries.length > 1 ? (
              <p style={{ margin: "16px 0 0" }}>
                <button
                  className="btn ghost sm"
                  type="button"
                  onClick={() => setEntries((current) => current.filter((_, i) => i !== index))}
                >
                  删掉这条
                </button>
              </p>
            ) : null}
          </div>
        ))}

        {entries.length < MAX_ENTRIES ? (
          <p>
            <button
              className="btn ghost sm"
              type="button"
              onClick={() => setEntries((current) => [...current, { ...EMPTY_ENTRY }])}
            >
              再加一个条目
            </button>
          </p>
        ) : null}

        <p style={{ marginTop: 24 }}>
          <button className="btn" type="submit" disabled={pending}>
            {pending ? "提交中…" : "提交给运营审核"}
          </button>
        </p>

        {error ? <p className="note">{error}</p> : null}
      </form>
    </>
  );
}
