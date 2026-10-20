import Link from "next/link";
import { HR_FUNCTIONS, type HrFunction } from "@/domain/types";
import { pageReadQueries } from "@/runtime";

export const dynamic = "force-dynamic";

function asHrFunction(value: string | undefined): HrFunction | undefined {
  return value && (HR_FUNCTIONS as readonly string[]).includes(value) ? (value as HrFunction) : undefined;
}

export default async function WishesPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const hrFunction = asHrFunction(f);
  // 走 pageReadQueries 的短缓存：直接调 listWishes 会让每次访问都打一轮飞书读，
  // 撞上并发上限就整页 500（实测 /wishes 比 /skills 慢且更容易挂，原因就在这）。
  const wishes = await pageReadQueries().listWishes({ hrFunction });

  return (
    <>
      <h1>许愿池</h1>
      <p className="lede">按附议数排序。附议的意思是「这个痛点我也有」，不是「这想法不错」。</p>

      <p>
        <Link className="btn" href="/wishes/new">
          我要许愿
        </Link>
      </p>

      <div className="filters">
        <Link className={`tag ${hrFunction ? "" : "on"}`} href="/wishes">
          全部
        </Link>
        {HR_FUNCTIONS.map((name) => (
          <Link
            key={name}
            className={`tag ${hrFunction === name ? "on" : ""}`}
            href={`/wishes?f=${encodeURIComponent(name)}`}
          >
            {name}
          </Link>
        ))}
      </div>

      {wishes.length === 0 ? (
        <p className="empty">还没有许愿。第一条可以由你来提。</p>
      ) : (
        wishes.map((wish) => (
          <div className="card hoverable" key={wish.id}>
            <h3>
              <Link href={`/wishes/${wish.id}`}>{wish.title}</Link>
            </h3>
            <div className="skill-foot">
              <span className="meta">
                <span className="tag">{wish.hrFunction}</span>
                <span className="tag status">{wish.status}</span>
                {wish.claimerNicknames.length > 0 ? <span>{wish.claimerNicknames.length} 人在做</span> : null}
                {wish.wisherNickname ? <span>由 {wish.wisherNickname} 提出</span> : null}
              </span>
              <span className="count">
                附议 <b>{wish.endorsementCount}</b>
              </span>
            </div>
          </div>
        ))
      )}
    </>
  );
}
