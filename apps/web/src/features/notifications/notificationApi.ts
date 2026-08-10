import type { KlerionSession } from "../../lib/session";

const DEFAULT_API_BASE_URL = "/api";

export type ApiNotificationSeverity = "INFO" | "SUCCESS" | "WARNING" | "ERROR";
export type ApiNotificationChannel = "IN_APP" | "EMAIL" | "SMS" | "PUSH";
export type ApiNotificationDeliveryStatus = "PENDING" | "SENT" | "FAILED" | "SKIPPED" | "EXHAUSTED";

export interface ApiNotification {
  readonly id: string;
  readonly sequence: number;
  readonly tenantId: string;
  readonly recipientUserId: string | null;
  readonly kind: string;
  readonly title: string;
  readonly message: string;
  readonly severity: ApiNotificationSeverity;
  readonly entityType: string | null;
  readonly entityId: string | null;
  readonly data: Readonly<Record<string, unknown>>;
  readonly readAt: string | null;
  readonly createdAt: string;
}

export interface ApiNotificationPreferences {
  readonly tenantId: string;
  readonly userId: string;
  readonly emailEnabled: boolean;
  readonly smsEnabled: boolean;
  readonly pushEnabled: boolean;
  readonly emailAddress: string | null;
  readonly smsNumber: string | null;
  readonly pushEndpoint: string | null;
  readonly updatedAt: string;
}

export interface ApiNotificationTemplate {
  readonly id: string;
  readonly tenantId: string;
  readonly key: string;
  readonly channel: ApiNotificationChannel;
  readonly titleTemplate: string;
  readonly bodyTemplate: string;
  readonly status: "ACTIVE" | "INACTIVE";
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ApiNotificationDelivery {
  readonly id: string;
  readonly notificationId: string;
  readonly channel: ApiNotificationChannel;
  readonly destination: string | null;
  readonly status: ApiNotificationDeliveryStatus;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly providerReference: string | null;
  readonly nextAttemptAt: string | null;
  readonly sentAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

function baseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL;
  return configured.endsWith("/") ? configured.slice(0, -1) : configured;
}

async function request<T>(session: KlerionSession, path: string, init: RequestInit = {}): Promise<T> {
  if (!session.token) throw new Error("This action requires a live API session.");
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init.headers,
      Authorization: `Bearer ${session.token}`,
      "X-Tenant-Slug": session.tenantSlug,
    },
  });
  const body = await response.json().catch(() => null) as { error?: unknown } | T | null;
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error
      : `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

async function stream(
  session: KlerionSession,
  path: string,
  onEvent: (event: ApiNotification) => void,
  signal: AbortSignal,
): Promise<void> {
  if (!session.token) return;
  const response = await fetch(`${baseUrl()}${path}`, {
    headers: {
      Accept: "text/event-stream",
      Authorization: `Bearer ${session.token}`,
      "X-Tenant-Slug": session.tenantSlug,
    },
    signal,
  });
  if (!response.ok || !response.body) throw new Error(`Realtime stream failed with status ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (!signal.aborted) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = frame.split("\n").filter((line) => line.startsWith("data: ")).map((line) => line.slice(6)).join("\n");
      if (data) {
        try { onEvent(JSON.parse(data) as ApiNotification); } catch { /* ignore malformed server frames */ }
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
}

export const notificationApi = {
  list(session: KlerionSession, afterSequence = 0, unreadOnly = false): Promise<ApiNotification[]> {
    const query = new URLSearchParams({ afterSequence: String(afterSequence), limit: "200" });
    if (unreadOnly) query.set("unreadOnly", "true");
    return request(session, `/notifications?${query}`);
  },
  unreadCount(session: KlerionSession): Promise<{ unread: number }> { return request(session, "/notifications/unread-count"); },
  markRead(session: KlerionSession, id: string): Promise<ApiNotification> { return request(session, `/notifications/${id}/read`, { method: "POST" }); },
  markAllRead(session: KlerionSession): Promise<{ updated: number }> { return request(session, "/notifications/read-all", { method: "POST" }); },
  preferences(session: KlerionSession): Promise<ApiNotificationPreferences> { return request(session, "/notifications/preferences"); },
  updatePreferences(session: KlerionSession, input: Partial<Pick<ApiNotificationPreferences, "emailEnabled" | "smsEnabled" | "pushEnabled" | "emailAddress" | "smsNumber" | "pushEndpoint">>): Promise<ApiNotificationPreferences> {
    return request(session, "/notifications/preferences", { method: "PUT", body: JSON.stringify(input) });
  },
  listTemplates(session: KlerionSession): Promise<ApiNotificationTemplate[]> { return request(session, "/notifications/templates"); },
  createTemplate(session: KlerionSession, input: { key: string; channel: ApiNotificationChannel; titleTemplate: string; bodyTemplate: string }): Promise<ApiNotificationTemplate> {
    return request(session, "/notifications/templates", { method: "POST", body: JSON.stringify(input) });
  },
  updateTemplate(session: KlerionSession, id: string, input: Partial<Pick<ApiNotificationTemplate, "titleTemplate" | "bodyTemplate" | "status">>): Promise<ApiNotificationTemplate> {
    return request(session, `/notifications/templates/${id}`, { method: "PATCH", body: JSON.stringify(input) });
  },
  listDeliveries(session: KlerionSession): Promise<ApiNotificationDelivery[]> { return request(session, "/notifications/deliveries?limit=200"); },
  processDeliveries(session: KlerionSession): Promise<{ processed: number; deliveries: ApiNotificationDelivery[] }> {
    return request(session, "/notifications/deliveries/process", { method: "POST", body: JSON.stringify({ limit: 100 }) });
  },
  stream(session: KlerionSession, afterSequence: number, onEvent: (event: ApiNotification) => void, signal: AbortSignal): Promise<void> {
    return stream(session, `/notifications/stream?afterSequence=${afterSequence}`, onEvent, signal);
  },
};
