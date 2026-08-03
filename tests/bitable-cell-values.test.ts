import { describe, expect, it } from "vitest";
import { asLinkIds, asUrl } from "@/adapters/feishu-bitable";

// Normally the adapter is only exercised through the ports, but the take URL is
// the one cell whose wire shape can silently break a redirect: Bitable returns a
// url-styled text cell as {text, link} in some paths and as a Markdown link in
// others, and the Markdown form produces a 302 to a nonsense Location.
describe("取得地址的单元格取值", () => {
  it("解开 {text, link} 形状", () => {
    expect(asUrl({ text: "hr-skills", link: "https://github.com/Viy1204/hr-skills" })).toBe(
      "https://github.com/Viy1204/hr-skills",
    );
  });

  it("解开 Markdown 链接形状", () => {
    expect(asUrl("[https://github.com/Viy1204/hr-skills](https://github.com/Viy1204/hr-skills)")).toBe(
      "https://github.com/Viy1204/hr-skills",
    );
  });

  it("裸 URL 原样返回", () => {
    expect(asUrl("https://github.com/Viy1204/hr-skills")).toBe("https://github.com/Viy1204/hr-skills");
  });

  it("空单元格返回空字符串", () => {
    expect(asUrl(null)).toBe("");
  });
});

// 所属技能包 decides which 技能包 a 技能条目 hangs off. The live Base returns it as
// an array of link groups, which used to read as "no package" and emptied the
// whole catalogue silently.
describe("关联字段的单元格取值", () => {
  it("解开 [{record_ids}] 形状", () => {
    expect(
      asLinkIds([{ record_ids: ["recA", "recB"], table_id: "tblX", text_arr: ["a", "b"], type: "text" }]),
    ).toEqual(["recA", "recB"]);
  });

  it("解开 {link_record_ids} 形状", () => {
    expect(asLinkIds({ link_record_ids: ["recA"] })).toEqual(["recA"]);
  });

  it("裸 id 数组原样返回", () => {
    expect(asLinkIds(["recA"])).toEqual(["recA"]);
  });

  it("空单元格返回空数组", () => {
    expect(asLinkIds(null)).toEqual([]);
  });
});
