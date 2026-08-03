import Link from "next/link";
import { notFound } from "next/navigation";
import { getSkillPackage } from "@/app/use-cases";
import { deps } from "@/runtime";

export const dynamic = "force-dynamic";

export default async function SkillPackagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pkg = await getSkillPackage(deps(), id);
  if (!pkg) notFound();

  return (
    <>
      <h1>{pkg.name}</h1>
      <p className="lede">{pkg.summary}</p>

      <p className="meta">
        <span className="tag">{pkg.carrier === "github" ? "GitHub 仓库" : "zip 包"}</span>
        {pkg.submitterNickname ? <span>提报人：{pkg.submitterNickname}</span> : null}
        <span>
          取得数 <span className="count">{pkg.takeCount}</span>
        </span>
      </p>

      <h2>前置条件</h2>
      {pkg.prerequisites ? (
        <div className="pre">{pkg.prerequisites}</div>
      ) : (
        <p className="empty">提报人没有填前置条件。取得后跑不起来的话，去群里问一声。</p>
      )}

      <p style={{ margin: "18px 0" }}>
        <a className="btn" href={`/get/${pkg.id}`} rel="nofollow">
          取得这个技能包
        </a>
      </p>
      <p className="note">
        取得数只代表有人想试，不代表这个技能包好用，也不代表在你的环境里跑得起来 —— 先把上面的前置条件对一遍。
      </p>

      <h2>包含的技能条目（{pkg.entries.length}）</h2>
      {pkg.entries.length === 0 ? (
        <p className="empty">还没有录入技能条目。</p>
      ) : (
        pkg.entries.map((entry) => (
          <div className="card" key={entry.id}>
            <h3>{entry.name}</h3>
            <p style={{ margin: "0 0 8px" }}>{entry.description}</p>
            <p className="meta">
              <span className="tag">{entry.hrFunction}</span>
            </p>
          </div>
        ))
      )}
      <p className="meta">技能条目不能单独取得 —— 取得动作永远发生在整个技能包上。</p>

      {pkg.deliveredWishes.length > 0 ? (
        <>
          <h2>源于这些许愿</h2>
          {pkg.deliveredWishes.map((wish) => (
            <div className="card" key={wish.id}>
              <h3>
                <Link href={`/wishes/${wish.id}`}>{wish.title}</Link>
              </h3>
              <p className="meta">
                <span className="tag">{wish.hrFunction}</span>
                <span>附议 {wish.endorsementCount}</span>
              </p>
            </div>
          ))}
        </>
      ) : null}
    </>
  );
}
