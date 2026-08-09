import type { KlerionSession } from "../../lib/session";

const DEFAULT_API_BASE_URL = "/api";

export type QueueStatus = "WAITING" | "CALLED" | "SERVING" | "COMPLETED" | "NO_SHOW" | "CANCELLED" | "TRANSFERRED";
export type QueuePriority = "STANDARD" | "PRIORITY" | "URGENT";
export type QueueSource = "PUBLIC" | "STAFF" | "KIOSK" | "QR" | "API";

export interface QueueConfiguration {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly serviceId: string;
  readonly departmentId: string | null;
  readonly prefix: string;
  readonly averageServiceMinutes: number;
  readonly allowWalkIns: boolean;
  readonly allowAppointmentCheckIn: boolean;
  readonly maxEarlyCheckInMinutes: number | null;
  readonly maxLateCheckInMinutes: number | null;
  readonly maxConcurrentServing: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface QueueCustomer {
  readonly userId?: string | null;
  readonly employeeId?: string | null;
  readonly customerId?: string | null;
  readonly name?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly externalReference?: string | null;
}

export interface QueueEntry {
  readonly id: string;
  readonly tenantId: string;
  readonly publicToken: string;
  readonly ticketNumber: string;
  readonly kind: "WALK_IN" | "APPOINTMENT";
  readonly branchId: string;
  readonly serviceId: string;
  readonly departmentId: string | null;
  readonly appointmentId: string | null;
  readonly customer: QueueCustomer;
  readonly priority: QueuePriority;
  readonly priorityAdjustment: number;
  readonly priorityScore: number;
  readonly checkInSource: QueueSource;
  readonly status: QueueStatus;
  readonly stationId: string | null;
  readonly servingStaffUserId: string | null;
  readonly recallCount: number;
  readonly checkedInAt: string;
  readonly calledAt: string | null;
  readonly serviceStartedAt: string | null;
  readonly completedAt: string | null;
  readonly noShowAt: string | null;
  readonly cancelledAt: string | null;
  readonly transferredAt: string | null;
  readonly transferFromEntryId: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface QueueEvent {
  readonly id: string;
  readonly sequence: number;
  readonly tenantId: string;
  readonly branchId: string;
  readonly serviceId: string;
  readonly entryId: string;
  readonly type: string;
  readonly actorUserId: string | null;
  readonly data: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface PublicQueueStatus {
  readonly publicToken: string;
  readonly ticketNumber: string;
  readonly branchId: string;
  readonly serviceId: string;
  readonly departmentId: string | null;
  readonly status: QueueStatus;
  readonly priority: QueuePriority;
  readonly stationId: string | null;
  readonly recallCount: number;
  readonly checkedInAt: string;
  readonly calledAt: string | null;
  readonly serviceStartedAt: string | null;
  readonly completedAt: string | null;
  readonly cancelledAt: string | null;
  readonly noShowAt: string | null;
}

export interface PublicQueueDisplay {
  readonly generatedAt: string;
  readonly branchId: string;
  readonly serviceId: string | null;
  readonly waiting: number;
  readonly active: readonly {
    ticketNumber: string;
    branchId: string;
    serviceId: string;
    status: "CALLED" | "SERVING";
    stationId: string | null;
    calledAt: string | null;
    serviceStartedAt: string | null;
  }[];
}

function baseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL;
  return configured.endsWith("/") ? configured.slice(0, -1) : configured;
}

async function authorized<T>(session: KlerionSession, path: string, init: RequestInit = {}): Promise<T> {
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
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

async function tenantPublic<T>(tenantSlug: string, path: string): Promise<T> {
  const response = await fetch(`${baseUrl()}${path}`, { headers: { Accept: "application/json", "X-Tenant-Slug": tenantSlug } });
  const body = await response.json().catch(() => null) as { error?: unknown } | T | null;
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

async function streamQueue(
  session: KlerionSession,
  afterSequence: number,
  filters: { branchId?: string; serviceId?: string },
  onEvent: (event: QueueEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  if (!session.token) return;
  const query = new URLSearchParams({ afterSequence: String(afterSequence) });
  if (filters.branchId) query.set("branchId", filters.branchId);
  if (filters.serviceId) query.set("serviceId", filters.serviceId);
  const response = await fetch(`${baseUrl()}/queue/events/stream?${query}`, {
    headers: { Accept: "text/event-stream", Authorization: `Bearer ${session.token}`, "X-Tenant-Slug": session.tenantSlug }, signal,
  });
  if (!response.ok || !response.body) throw new Error(`Queue realtime stream failed with status ${response.status}`);
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
      if (data) { try { onEvent(JSON.parse(data) as QueueEvent); } catch { /* ignore malformed frames */ } }
      boundary = buffer.indexOf("\n\n");
    }
  }
}

export const queueApi = {
  configurations(session: KlerionSession, branchId?: string): Promise<QueueConfiguration[]> {
    return authorized(session, `/queue/configurations${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ""}`);
  },
  createConfiguration(session: KlerionSession, input: {
    branchId: string; serviceId: string; departmentId?: string | null; prefix: string; averageServiceMinutes?: number;
    allowWalkIns?: boolean; allowAppointmentCheckIn?: boolean; maxEarlyCheckInMinutes?: number | null; maxLateCheckInMinutes?: number | null; maxConcurrentServing?: number;
  }): Promise<QueueConfiguration> { return authorized(session, "/queue/configurations", { method: "POST", body: JSON.stringify(input) }); },
  updateConfiguration(session: KlerionSession, id: string, input: Partial<Omit<QueueConfiguration, "id" | "tenantId" | "branchId" | "serviceId" | "createdAt" | "updatedAt">>): Promise<QueueConfiguration> {
    return authorized(session, `/queue/configurations/${id}`, { method: "PATCH", body: JSON.stringify(input) });
  },
  checkInWalkIn(session: KlerionSession, input: { branchId: string; serviceId: string; departmentId?: string | null; customer?: QueueCustomer; source?: QueueSource; idempotencyKey?: string }): Promise<QueueEntry> {
    return authorized(session, "/queue/check-in/walk-in", { method: "POST", body: JSON.stringify(input) });
  },
  checkInAppointment(session: KlerionSession, appointmentId: string, source: QueueSource = "PUBLIC"): Promise<QueueEntry> {
    return authorized(session, `/queue/check-in/appointments/${encodeURIComponent(appointmentId)}`, { method: "POST", body: JSON.stringify({ source }) });
  },
  entries(session: KlerionSession, branchId: string, serviceId?: string): Promise<QueueEntry[]> {
    const query = new URLSearchParams({ branchId }); if (serviceId) query.set("serviceId", serviceId);
    return authorized(session, `/queue/entries?${query}`);
  },
  callNext(session: KlerionSession, input: { branchId: string; serviceId: string; stationId: string }): Promise<QueueEntry | null> {
    return authorized(session, "/queue/call-next", { method: "POST", body: JSON.stringify(input) });
  },
  recall(session: KlerionSession, id: string, stationId?: string): Promise<QueueEntry> { return authorized(session, `/queue/entries/${id}/recall`, { method: "POST", body: JSON.stringify({ stationId }) }); },
  start(session: KlerionSession, id: string, stationId?: string): Promise<QueueEntry> { return authorized(session, `/queue/entries/${id}/start`, { method: "POST", body: JSON.stringify({ stationId }) }); },
  complete(session: KlerionSession, id: string): Promise<QueueEntry> { return authorized(session, `/queue/entries/${id}/complete`, { method: "POST" }); },
  noShow(session: KlerionSession, id: string): Promise<QueueEntry> { return authorized(session, `/queue/entries/${id}/no-show`, { method: "POST" }); },
  cancel(session: KlerionSession, id: string, reason?: string): Promise<QueueEntry> { return authorized(session, `/queue/entries/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }); },
  priority(session: KlerionSession, id: string, priority: QueuePriority, adjustment = 0): Promise<QueueEntry> { return authorized(session, `/queue/entries/${id}/priority`, { method: "POST", body: JSON.stringify({ priority, adjustment }) }); },
  transfer(session: KlerionSession, id: string, input: { branchId: string; serviceId: string; departmentId?: string | null }): Promise<{ from: QueueEntry; to: QueueEntry }> {
    return authorized(session, `/queue/entries/${id}/transfer`, { method: "POST", body: JSON.stringify(input) });
  },
  events(session: KlerionSession, afterSequence = 0, branchId?: string, serviceId?: string): Promise<QueueEvent[]> {
    const query = new URLSearchParams({ afterSequence: String(afterSequence), limit: "500" }); if (branchId) query.set("branchId", branchId); if (serviceId) query.set("serviceId", serviceId);
    return authorized(session, `/queue/events?${query}`);
  },
  stream(session: KlerionSession, afterSequence: number, filters: { branchId?: string; serviceId?: string }, onEvent: (event: QueueEvent) => void, signal: AbortSignal) {
    return streamQueue(session, afterSequence, filters, onEvent, signal);
  },
  publicStatus(tenantSlug: string, publicToken: string): Promise<PublicQueueStatus> { return tenantPublic(tenantSlug, `/public/queue/status/${encodeURIComponent(publicToken)}`); },
  publicDisplay(tenantSlug: string, branchId: string, serviceId?: string): Promise<PublicQueueDisplay> {
    const query = new URLSearchParams({ branchId }); if (serviceId) query.set("serviceId", serviceId);
    return tenantPublic(tenantSlug, `/public/queue/display?${query}`);
  },
};
