// 多维表格和云空间两个适配器共用同一个应用身份令牌。缓存到快过期前一分钟，
// 两小时的有效期不值得为每次请求换一次。

export interface TenantAuth {
  appId: string;
  appSecret: string;
  endpoint?: string;
}

export class TenantToken {
  private cached: { value: string; expiresAt: number } | null = null;
  readonly endpoint: string;

  constructor(private readonly auth: TenantAuth) {
    this.endpoint = auth.endpoint ?? "https://open.feishu.cn";
  }

  async value(): Promise<string> {
    if (this.cached && this.cached.expiresAt > Date.now() + 60_000) return this.cached.value;

    const response = await fetch(`${this.endpoint}/open-apis/auth/v3/tenant_access_token/internal`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ app_id: this.auth.appId, app_secret: this.auth.appSecret }),
    });
    const body = (await response.json()) as {
      code: number;
      msg: string;
      tenant_access_token?: string;
      expire?: number;
    };
    if (body.code !== 0 || !body.tenant_access_token) {
      throw new Error(`tenant_access_token failed: ${body.code} ${body.msg}`);
    }
    this.cached = { value: body.tenant_access_token, expiresAt: Date.now() + (body.expire ?? 7200) * 1000 };
    return this.cached.value;
  }
}
