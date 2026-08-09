import type { NotificationChannel, NotificationProvider, NotificationProviderMap } from "@adminops/notifications";

class WebhookNotificationProvider implements NotificationProvider {
  constructor(
    readonly channel: Exclude<NotificationChannel, "IN_APP">,
    private readonly url: string,
    private readonly bearerToken: string | null,
  ) {}

  async send({ notification, delivery }: Parameters<NotificationProvider["send"]>[0]) {
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.bearerToken ? { authorization: `Bearer ${this.bearerToken}` } : {}),
      },
      body: JSON.stringify({
        channel: this.channel,
        destination: delivery.destination,
        notificationId: notification.id,
        tenantId: notification.tenantId,
        kind: notification.kind,
        title: notification.title,
        message: notification.message,
        data: notification.data,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Notification webhook returned HTTP ${response.status}`);
    let providerReference = response.headers.get("x-provider-reference");
    if (!providerReference) {
      const body = await response.json().catch(() => null) as { reference?: unknown; id?: unknown } | null;
      const candidate = body?.reference ?? body?.id;
      if (typeof candidate === "string") providerReference = candidate;
    }
    return { providerReference };
  }
}

function configured(channel: Exclude<NotificationChannel, "IN_APP">, variable: string): NotificationProvider | undefined {
  const url = process.env[variable]?.trim();
  if (!url) return undefined;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new Error(`${variable} must use HTTPS in production`);
  }
  return new WebhookNotificationProvider(channel, parsed.toString(), process.env.NOTIFICATION_WEBHOOK_BEARER_TOKEN?.trim() || null);
}

export function createNotificationProvidersFromEnv(): NotificationProviderMap {
  return {
    EMAIL: configured("EMAIL", "NOTIFICATION_EMAIL_WEBHOOK_URL"),
    SMS: configured("SMS", "NOTIFICATION_SMS_WEBHOOK_URL"),
    PUSH: configured("PUSH", "NOTIFICATION_PUSH_WEBHOOK_URL"),
  };
}
