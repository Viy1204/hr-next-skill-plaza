import Link from "next/link";
import { HR_FUNCTIONS, type HrFunction } from "@/domain/types";
import { listSkillEntries } from "@/app/use-cases";
import { deps } from "@/runtime";

export const dynamic = "force-dynamic";

function asHrFunction(value: string | undefined): HrFunction | undefined {
  return value && (HR_FUNCTIONS as readonly string[]).includes(value) ? (value as HrFunction) : undefined;
}

export default async function SkillsPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; q?: string }>;
}) {
  const { f, q } = await searchParams;
  const hrFunction = asHrFunction(f);
  const entries = await listSkillEntries(deps(), { hrFunction, query: q });

  return (
    <>
      <h1>技能目录</h1>
      <p className="lede">按所属技能包的取得数排序。取得数只代表有人想试。</p>

      <p>
        <Link className="btn ghost" href="/skills/new">
          上架技能包
        </Link>
      </p>

      <form className="search" action="/skills">
        {hrFunction ? <input type="hidden" name="f" value={hrFunction} /> : null}
        <input name="q" defaultValue={q ?? ""} placeholder="搜技能条目名称或说明，例如「花名册」" />
      </form>

      <div className="filters">
        <Link className={`tag ${hrFunction ? "" : "on"}`} href={q ? `/skills?q=${encodeURIComponent(q)}` : "/skills"}>
          全部
        </Link>
        {HR_FUNCTIONS.map((name) => {
          const query = new URLSearchParams({ f: name });
          if (q) query.set("q", q);
          return (
            <Link key={name} className={`tag ${hrFunction === name ? "on" : ""}`} href={`/skills?${query}`}>
              {name}
            </Link>
          );
        })}
      </div>

      {entries.length === 0 ? (
        <p className="empty">这个条件下还没有技能条目。</p>
      ) : (
        entries.map((entry) => (
          <div className="card hoverable" key={entry.id}>
            <div className="skill-head">
              <Link className="skill-name" href={`/skills/${entry.packageId}`}>
                {entry.name}
              </Link>
              <span className="count">
                取得数 <b>{entry.packageTakeCount}</b>
              </span>
            </div>
            <p className="skill-desc">{entry.description}</p>
            <div className="skill-foot">
              <span className="tag">{entry.hrFunction}</span>
              <span className="meta">
                所属技能包：
                <Link className="mono" href={`/skills/${entry.packageId}`}>
                  {entry.packageName}
                </Link>
              </span>
            </div>
          </div>
        ))
      )}
    </>
  );
}
