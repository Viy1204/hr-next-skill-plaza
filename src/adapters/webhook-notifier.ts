import type { Notification, NotifierPort } from "@/ports";

// Feishu group custom-bot webhook. Outbound only — a custom bot cannot receive
// messages, and we deliberately do not listen to the group (ADR-0007).
export class WebhookNotifier implements NotifierPort {
  constructor(private readonly url: string) {}

  async send(notification: Notification) {
    const response = await fetch(this.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ msg_type: "text", content: { text: notification.text } }),
    });
    const body = (await response.json().catch(() => ({}))) as { code?: number; msg?: string };
    if (body.code && body.code !== 0) {
      throw new Error(`webhook send failed: ${body.code} ${body.msg}`);
    }
  }
}

/** Used when no webhook URL is configured — logs instead of throwing, so a missing
 *  operations channel never blocks someone from posting a 许愿. */
export class ConsoleNotifier implements NotifierPort {
  async send(notification: Notification) {
    console.info("[notifier:not-configured]", notification.kind, notification.text);
  }
}
