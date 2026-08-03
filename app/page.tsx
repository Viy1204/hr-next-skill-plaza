import Link from "next/link";
import { listSkillEntries, listWishes } from "@/app/use-cases";
import { deps } from "@/runtime";

export const dynamic = "force-dynamic";

export default async function Home() {
  const d = deps();
  const [entries, wishes] = await Promise.all([listSkillEntries(d), listWishes(d)]);
  const openForClaim = wishes.filter((w) => w.status === "待认领");
  const topEntries = entries.slice(0, 3);
  const topWishes = wishes.slice(0, 2);

  return (
    <>
      <div className="hero">
        <div className="mesh" aria-hidden="true">
          <span className="m1" />
          <span className="m2" />
          <span className="m3" />
          <span className="m4" />
          <span className="m5" />
          <span className="m6" />
        </div>
        <div className="hero-fade" aria-hidden="true" />
        <div className="hero-inner">
          <span className="eyebrow">HR NEXT 社群小站</span>
          <h1>把做出来的能力分出去，把没人做的痛点提出来</h1>
          <p className="hero-sub">
            HR NEXT 是跨公司社群。这里放两样东西：群友已经做出来的技能包，和大家还等着有人做的许愿。
          </p>
          <p className="hero-cta">
            <Link className="btn" href="/skills">
              去逛技能目录
            </Link>
            <Link className="btn ghost" href="/wishes">
              看看许愿池
            </Link>
          </p>
        </div>
      </div>

      <section className="band band-soft">
        <p className="section-eyebrow">两个入口</p>
        <h2>取走现成的，或者许下想要的</h2>
        <div className="duo">
          <div className="duo-card">
            <div className="duo-num">{entries.length}</div>
            <div className="duo-label">个技能条目已上架</div>
            <p className="duo-desc">按取得数排序。取得数只代表有人想试，不代表好用 —— 取得前先看前置条件。</p>
            <p className="duo-actions">
              <Link className="btn" href="/skills">
                去逛技能目录
              </Link>
            </p>
          </div>
          <div className="duo-card dark">
            <div className="duo-num">{wishes.length}</div>
            <div className="duo-label">条许愿 · 其中 {openForClaim.length} 条待认领</div>
            <p className="duo-desc">只描述痛点，不用想技术方案。附议多了，就会有人来认领。</p>
            <p className="duo-actions">
              <Link className="btn" href="/wishes/new">
                我要许愿
              </Link>
              <Link className="btn ghost" href="/wishes">
                看看别人在等什么
              </Link>
            </p>
          </div>
        </div>
      </section>

      <section className="band">
        <p className="section-eyebrow">技能目录</p>
        <h2>群友已经做出来的技能包</h2>
        {topEntries.length === 0 ? (
          <p className="empty">还没有技能条目。</p>
        ) : (
          topEntries.map((entry) => (
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
                <Link className="skill-link" href={`/skills/${entry.packageId}`}>
                  查看 →
                </Link>
              </div>
            </div>
          ))
        )}
        <p className="more-row">
          <Link href="/skills">查看全部 {entries.length} 个技能条目 →</Link>
        </p>
      </section>

      <section className="band band-cream">
        <p className="section-eyebrow">许愿池</p>
        <h2>这些痛点还在等人来做</h2>
        {topWishes.length === 0 ? (
          <>
            <p className="section-desc">还没有许愿。第一条可以由你来提 —— 只描述痛点，不用想技术方案。</p>
            <p style={{ marginTop: 20 }}>
              <Link className="btn" href="/wishes/new">
                我要许愿
              </Link>
            </p>
          </>
        ) : (
          <>
            {topWishes.map((wish) => (
              <div className="card hoverable" key={wish.id}>
                <h3>
                  <Link href={`/wishes/${wish.id}`}>{wish.title}</Link>
                </h3>
                <div className="skill-foot">
                  <span className="meta">
                    <span className="tag">{wish.hrFunction}</span>
                    <span className="tag status">{wish.status}</span>
                  </span>
                  <span className="count">
                    附议 <b>{wish.endorsementCount}</b>
                  </span>
                </div>
              </div>
            ))}
            <p className="more-row">
              <Link href="/wishes">查看全部 {wishes.length} 条许愿 →</Link>
            </p>
          </>
        )}
      </section>
    </>
  );
}
