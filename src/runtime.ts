import { FeishuBitable } from "@/adapters/feishu-bitable";
import { ConsoleNotifier, WebhookNotifier } from "@/adapters/webhook-notifier";
import type { Deps } from "@/app/use-cases";

// Production wiring. Tests never import this file — they build their own Deps
// from tests/support/harness.ts with the in-memory ports.

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing environment variable: ${name}`);
  return value;
}

let cached: Deps | null = null;

export function deps(): Deps {
  if (cached) return cached;

  const webhookUrl = process.env.FEISHU_GROUP_WEBHOOK_URL;
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
    }),
    notifier: webhookUrl ? new WebhookNotifier(webhookUrl) : new ConsoleNotifier(),
    baseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:3000",
  };
  return cached;
}

export function syncSecret() {
  return process.env.DELIVERY_SYNC_SECRET;
}
