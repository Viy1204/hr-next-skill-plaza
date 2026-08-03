import Link from "next/link";
import { HR_FUNCTIONS, type HrFunction } from "@/domain/types";
import { listWishes } from "@/app/use-cases";
import { deps } from "@/runtime";

export const dynamic = "force-dynamic";

function asHrFunction(value: string | undefined): HrFunction | undefined {
  return value && (HR_FUNCTIONS as readonly string[]).includes(value) ? (value as HrFunction) : undefined;
}

export default async function WishesPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const hrFunction = asHrFunction(f);
  const wishes = await listWishes(deps(), { hrFunction });

  return (
    <>
      <h1>许愿池</h1>
      <p className="lede">按附议数排序。附议的意思是「这个痛点我也有」，不是「这想法不错」。</p>

      <p>
        <Link className="btn warm" href="/wishes/new">
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
          <div className="card" key={wish.id}>
            <h3>
              <Link href={`/wishes/${wish.id}`}>{wish.title}</Link>
            </h3>
            <p className="meta">
              <span className="tag">{wish.hrFunction}</span>
              <span className="tag">{wish.status}</span>
              <span>
                附议 <span className="count">{wish.endorsementCount}</span>
              </span>
              {wish.claimerNicknames.length > 0 ? <span>{wish.claimerNicknames.length} 人在做</span> : null}
              {wish.wisherNickname ? <span>由 {wish.wisherNickname} 提出</span> : null}
            </p>
          </div>
        ))
      )}
    </>
  );
}
