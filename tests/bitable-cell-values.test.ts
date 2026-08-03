import { describe, expect, it } from "vitest";
import { asUrl } from "@/adapters/feishu-bitable";

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
