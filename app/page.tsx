import Link from "next/link";
import { listSkillEntries, listWishes } from "@/app/use-cases";
import { deps } from "@/runtime";

export const dynamic = "force-dynamic";

export default async function Home() {
  const d = deps();
  const [entries, wishes] = await Promise.all([listSkillEntries(d), listWishes(d)]);
  const openForClaim = wishes.filter((w) => w.status === "待认领");

  return (
    <>
      <h1>把做出来的能力分出去，把还没人做的痛点提出来</h1>
      <p className="lede">
        HR NEXT 是跨公司社群。这里放两样东西：群友已经做出来的技能包，和大家还等着有人做的许愿。
      </p>

      <div className="card">
        <h3>技能目录 · {entries.length} 个技能条目</h3>
        <p className="meta">按取得数排序。取得数只代表有人想试，不代表好用 —— 也不代表你这台电脑跑得起来，取得前先看前置条件。</p>
        <p>
          <Link className="btn" href="/skills">
            去逛技能目录
          </Link>
        </p>
      </div>

      <div className="card">
        <h3>许愿池 · {wishes.length} 条许愿，{openForClaim.length} 条开放认领</h3>
        <p className="meta">只描述痛点，不用想技术方案。别人有同一个痛点就会来附议，附议多了就会有人来认领。</p>
        <p>
          <Link className="btn warm" href="/wishes/new">
            我要许愿
          </Link>{" "}
          <Link className="btn ghost" href="/wishes">
            看看别人在等什么
          </Link>
        </p>
      </div>
    </>
  );
}
