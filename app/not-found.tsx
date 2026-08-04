import Link from "next/link";

// 群里的推送链接是永久的，被指向的许愿或技能包却会被运营下架、删掉。旧消息随时可能
// 落到这里，所以这页要讲清楚「东西没了」而不是「你走错了」，并给回得去的路。
export default function NotFound() {
  return (
    <>
      <h1>这个页面不在了</h1>
      <p className="lede">
        你点的链接可能来自群里的旧消息 —— 那条许愿或技能包已经被删除或下架了。链接本身没错，东西不在了。
      </p>
      <p>
        <Link className="btn" href="/wishes">
          去许愿池看看
        </Link>
        <Link className="btn ghost" href="/skills">
          逛技能目录
        </Link>
      </p>
    </>
  );
}
