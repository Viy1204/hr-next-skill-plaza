import { describe, expect, it } from "vitest";
import {
  asDateText,
  asLinkIds,
  asText,
  asUrl,
  claimFromRow,
  entryFromRow,
  packageFromRow,
  wishFromRow,
} from "@/adapters/feishu-bitable";

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

describe("数字与时间单元格", () => {
  it("数字单元格转成字符串而不是空串", () => {
    expect(asText(42)).toBe("42");
  });

  it("创建时间的 epoch 毫秒转成上海时区的可读时间", () => {
    expect(asDateText(1785801600000)).toBe("2026-08-04 08:00");
  });

  it("非数字走普通文本路径", () => {
    expect(asDateText("2026-08-03 12:00")).toBe("2026-08-03 12:00");
  });
});

// 三个真 bug（关联组、url 单元格、epoch 时间）全都发生在「线上行 → 领域对象」这一步，
// 而 HTTP 边界测试拦不住它们。这里用照着线上返回攒的整行 fixture 把形状钉死。
describe("整行转换", () => {
  it("技能包行", () => {
    expect(
      packageFromRow({
        record_id: "recPkg",
        fields: {
          名称: "feishu-roster",
          简介: [{ text: "实时拉取花名册", type: "text" }],
          载体类型: "github",
          取得地址: { text: "https://github.com/Viy1204/hr-skills", link: "https://github.com/Viy1204/hr-skills" },
          前置条件: "飞书自建应用凭证",
          提报人昵称: "Viy",
          审核状态: "已发布",
          取得数: 7,
          交付的许愿: [{ record_ids: ["recWish"], table_id: "tblW", text_arr: ["核对"], type: "text" }],
        },
      }),
    ).toEqual({
      id: "recPkg",
      name: "feishu-roster",
      summary: "实时拉取花名册",
      carrier: "github",
      takeUrl: "https://github.com/Viy1204/hr-skills",
      attachmentToken: null,
      prerequisites: "飞书自建应用凭证",
      submitterNickname: "Viy",
      reviewStatus: "已发布",
      takeCount: 7,
      deliveredWishIds: ["recWish"],
    });
  });

  it("技能条目行：关联组解出所属技能包", () => {
    const entry = entryFromRow({
      record_id: "recEntry",
      fields: {
        名称: "feishu-roster",
        说明: "导出花名册",
        所属技能包: [{ record_ids: ["recPkg"], table_id: "tblP", text_arr: ["feishu-roster"], type: "text" }],
        适用职能: "HR 运营与共享服务",
        展示顺序: 1,
      },
    });
    expect(entry.packageId).toBe("recPkg");
    expect(entry.displayOrder).toBe(1);
  });

  it("许愿行：创建时间不再读成空串", () => {
    const wish = wishFromRow({
      record_id: "recW",
      fields: {
        标题: "每月核对花名册",
        痛点场景: "HRBP 手工比对",
        适用职能: "HR 运营与共享服务",
        附议数: 5,
        状态: "收集中",
        创建时间: 1785801600000,
      },
    });
    expect(wish.endorsementCount).toBe(5);
    expect(wish.createdAt).toBe("2026-08-04 08:00");
  });

  it("认领行：从关联许愿解出 wishId", () => {
    const claim = claimFromRow({
      record_id: "recC",
      fields: {
        认领人昵称: "阿倩",
        说明: "试试",
        关联许愿: [{ record_ids: ["recW"], table_id: "tblW", text_arr: ["核对"], type: "text" }],
        创建时间: 1785801600000,
      },
    });
    expect(claim.wishId).toBe("recW");
    expect(claim.createdAt).toBe("2026-08-04 08:00");
  });
});
