import Link from "next/link";
import { notFound } from "next/navigation";
import { getWish } from "@/app/use-cases";
import { deps } from "@/runtime";
import WishActions from "./actions";

export const dynamic = "force-dynamic";

export default async function WishPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wish = await getWish(deps(), id);
  if (!wish) notFound();

  return (
    <>
      <h1>{wish.title}</h1>
      <p className="meta">
        <span className="tag">{wish.hrFunction}</span>
        <span className="tag">{wish.status}</span>
        {wish.wisherNickname ? <span>由 {wish.wisherNickname} 提出</span> : null}
      </p>

      <h2>痛点场景</h2>
      <div className="pre">{wish.painScenario}</div>

      {wish.painHours !== null ? (
        <p className="meta" style={{ marginTop: 12 }}>
          许愿人每月为这件事花约 {wish.painHours} 小时（仅作参考，不参与排序）
        </p>
      ) : null}

      <WishActions wishId={wish.id} endorsementCount={wish.endorsementCount} />

      <h2>认领（{wish.claimerNicknames.length} 人在做）</h2>
      {wish.claimerNicknames.length === 0 ? (
        <p className="empty">还没有人认领。认领只是「我想试试」，不是承诺 —— 做不完不用有压力。</p>
      ) : (
        <p className="meta">
          {wish.claimerNicknames.map((name) => (
            <span className="tag" key={name}>
              {name}
            </span>
          ))}
        </p>
      )}

      {wish.deliveredByPackageIds.length > 0 ? (
        <>
          <h2>已交付</h2>
          {wish.deliveredByPackageIds.map((packageId) => (
            <p key={packageId}>
              <Link className="btn" href={`/skills/${packageId}`}>
                去取得交付它的技能包
              </Link>
            </p>
          ))}
        </>
      ) : null}
    </>
  );
}
