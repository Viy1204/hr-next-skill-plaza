import { FeishuBitable } from "@/adapters/feishu-bitable";
import { DEMO_SEED } from "@/adapters/demo-seed";
import { InMemoryBitable, InMemoryNotifier, InMemoryStorage } from "@/adapters/in-memory";
import { FeishuDrive } from "@/adapters/feishu-drive";
import { TenantToken } from "@/adapters/tenant-token";
import { ConsoleNotifier, WebhookNotifier } from "@/adapters/webhook-notifier";
import type { Deps } from "@/app/use-cases";

// Production wiring. Tests never import this file — they build their own Deps
// from tests/support/harness.ts with the in-memory ports.

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing environment variable: ${name}`);
  return value;
}

// Next.js re-evaluates modules on recompile and across route workers, so a plain
// module-level variable loses the in-memory store between requests. Parking it on
// globalThis keeps local demo mode usable end to end.
const globalCache = globalThis as typeof globalThis & { __plazaDeps?: Deps };

let cached: Deps | null = globalCache.__plazaDeps ?? null;

export function deps(): Deps {
  if (cached) return cached;

  // No credentials yet? Run entirely in memory so the site is browsable before any
  // Feishu account exists. Data resets on restart — never deploy in this mode.
  if (!process.env.FEISHU_APP_ID) {
    console.warn(
      "[runtime] FEISHU_APP_ID not set — running in local demo mode with in-memory data. " +
        "Nothing is persisted. Run scripts/setup-bitable.sh against a dedicated community account to go real.",
    );
    cached = {
      bitable: new InMemoryBitable(DEMO_SEED),
      notifier: new InMemoryNotifier(),
      storage: new InMemoryStorage(),
      baseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:3000",
    };
    globalCache.__plazaDeps = cached;
    return cached;
  }

  const webhookUrl = process.env.FEISHU_GROUP_WEBHOOK_URL;
  const auth = new TenantToken({ appId: required("FEISHU_APP_ID"), appSecret: required("FEISHU_APP_SECRET") });
  cached = {
    bitable: new FeishuBitable({
      appId: required("FEISHU_APP_ID"),
      appSecret: required("FEISHU_APP_SECRET"),
      baseToken: required("BITABLE_BASE_TOKEN"),
      tables: {
        packages: required("BITABLE_TABLE_PACKAGES"),
        entries: required("BITABLE_TABLE_ENTRIES"),
        wishes: required("BITABLE_TABLE_WISHES"),
        endorsements: required("BITABLE_TABLE_ENDORSEMENTS"),
        claims: required("BITABLE_TABLE_CLAIMS"),
        config: required("BITABLE_TABLE_CONFIG"),
      },
    }, auth),
    storage: new FeishuDrive(auth, process.env.FEISHU_DRIVE_FOLDER_TOKEN, process.env.FEISHU_REVIEWER_OPEN_ID),
    notifier: webhookUrl ? new WebhookNotifier(webhookUrl) : new ConsoleNotifier(),
    baseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:3000",
  };
  globalCache.__plazaDeps = cached;
  return cached;
}

export function syncSecret() {
  return process.env.DELIVERY_SYNC_SECRET;
}
