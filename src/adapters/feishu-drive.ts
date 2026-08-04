import type { StoragePort } from "@/ports";
import { TenantToken } from "./tenant-token";

// 自助上传的 zip 落在飞书云空间里，不公开分享。文件标识写进多维表格，取得时由
// /get 出口用应用身份把文件取回来转给访客 —— 所以未发布的技能包下载不到，
// 审核这道闸对附件同样成立。

export class FeishuDrive implements StoragePort {
  private folder: string | null;

  constructor(
    private readonly auth: TenantToken,
    folderToken?: string,
    /** 运营的 open_id。上传后把文件的查看权限给他，否则文件只在应用自己的云空间里，
     *  运营在审核时根本打不开要审的那个 zip。 */
    private readonly reviewerOpenId?: string,
  ) {
    this.folder = folderToken ?? null;
  }

  /** 没指定文件夹就传到应用自己的云空间根目录。 */
  private async parentFolder(): Promise<string> {
    if (this.folder) return this.folder;
    const token = await this.auth.value();
    const response = await fetch(`${this.auth.endpoint}/open-apis/drive/explorer/v2/root_folder/meta`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const body = (await response.json()) as { code: number; msg: string; data?: { token?: string } };
    if (body.code !== 0 || !body.data?.token) throw new Error(`root folder lookup failed: ${body.code} ${body.msg}`);
    this.folder = body.data.token;
    return this.folder;
  }

  async upload({ fileName, bytes }: { fileName: string; bytes: Uint8Array }): Promise<string> {
    const [token, parent] = await Promise.all([this.auth.value(), this.parentFolder()]);

    const form = new FormData();
    form.set("file_name", fileName);
    form.set("parent_type", "explorer");
    form.set("parent_node", parent);
    form.set("size", String(bytes.byteLength));
    form.set("file", new Blob([bytes as BlobPart], { type: "application/zip" }), fileName);

    const response = await fetch(`${this.auth.endpoint}/open-apis/drive/v1/files/upload_all`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: form,
    });
    const body = (await response.json()) as { code: number; msg: string; data?: { file_token?: string } };
    if (body.code !== 0 || !body.data?.file_token) throw new Error(`drive upload failed: ${body.code} ${body.msg}`);

    await this.shareWithReviewer(body.data.file_token, token);
    return body.data.file_token;
  }

  /** 分享失败不该让上架失败：文件已经传上去了，运营大不了在群里找作者要一份。 */
  private async shareWithReviewer(fileToken: string, token: string) {
    if (!this.reviewerOpenId) return;
    try {
      const response = await fetch(
        `${this.auth.endpoint}/open-apis/drive/v1/permissions/${fileToken}/members?type=file`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ member_type: "openid", member_id: this.reviewerOpenId, perm: "view", type: "user" }),
        },
      );
      const body = (await response.json()) as { code: number; msg: string };
      if (body.code !== 0) console.error("drive share failed", { fileToken, code: body.code, msg: body.msg });
    } catch (error) {
      console.error("drive share failed", { fileToken, error });
    }
  }

  async open(fileToken: string) {
    const token = await this.auth.value();
    const response = await fetch(`${this.auth.endpoint}/open-apis/drive/v1/files/${fileToken}/download`, {
      headers: { authorization: `Bearer ${token}` },
    });
    // 成功时是二进制流，失败时才是 JSON —— 用 content-type 分辨，别去 .json() 一个 zip。
    if (!response.ok || !response.body || response.headers.get("content-type")?.includes("application/json")) {
      return null;
    }
    return { fileName: fileNameFrom(response.headers.get("content-disposition")), body: response.body };
  }
}

function fileNameFrom(disposition: string | null): string {
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) return decodeURIComponent(encoded);
  return disposition?.match(/filename="?([^";]+)"?/i)?.[1] ?? "skill-package.zip";
}
