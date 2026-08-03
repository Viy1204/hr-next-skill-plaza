"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function WishActions({
  wishId,
  endorsementCount,
}: {
  wishId: string;
  endorsementCount: number;
}) {
  const router = useRouter();
  const [count, setCount] = useState(endorsementCount);
  const [endorsed, setEndorsed] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [nickname, setNickname] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function endorse() {
    setError(null);
    const response = await fetch(`/api/wishes/${wishId}/endorse`, { method: "POST" });
    if (!response.ok) {
      setError("附议失败，稍后再试");
      return;
    }
    const body = (await response.json()) as { endorsementCount: number };
    setCount(body.endorsementCount);
    setEndorsed(true);
    router.refresh();
  }

  async function claim(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const response = await fetch(`/api/wishes/${wishId}/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ claimerNickname: nickname, note }),
    });
    if (!response.ok) {
      setError("认领失败，昵称填了吗？");
      return;
    }
    setClaiming(false);
    setNickname("");
    setNote("");
    router.refresh();
  }

  return (
    <div style={{ margin: "20px 0" }}>
      <p className="meta">
        附议 <span className="count">{count}</span>
      </p>
      <p>
        <button className="btn warm" onClick={endorse} disabled={endorsed}>
          {endorsed ? "已记下你的痛点" : "我也有这个痛点"}
        </button>{" "}
        <button className="btn ghost" onClick={() => setClaiming((value) => !value)}>
          我想试着做
        </button>
      </p>

      {claiming ? (
        <form className="card" onSubmit={claim}>
          <label>
            你的昵称
            <span className="hint">群里认得出你就行</span>
            <input value={nickname} onChange={(event) => setNickname(event.target.value)} required />
          </label>
          <label>
            想怎么做（选填）
            <textarea value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          <p className="meta">认领不排他 —— 别人也在做同一条也没关系，多个版本可以互相比。</p>
          <button className="btn" type="submit">
            提交认领
          </button>
        </form>
      ) : null}

      {error ? <p className="note">{error}</p> : null}
    </div>
  );
}
