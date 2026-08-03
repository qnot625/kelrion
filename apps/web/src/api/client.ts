import { Queue, QueueSnapshot, Ticket, UserContext } from "../types/queue";
import { NotificationListResponse } from "../types/notification";

const API_BASE = "";

function getHeaders(userContext: UserContext): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-tenant-id": userContext.tenantId,
    "x-user-id": userContext.userId,
    "x-user-role": userContext.role,
  };
}

export async function fetchQueues(userContext: UserContext): Promise<Queue[]> {
  const res = await fetch(`${API_BASE}/api/queues`, {
    headers: getHeaders(userContext),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Failed to fetch queues" }));
    throw new Error(error.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.queues;
}

export async function fetchQueueSnapshot(
  queueId: string,
  userContext: UserContext
): Promise<QueueSnapshot> {
  const res = await fetch(`${API_BASE}/api/queues/${queueId}/snapshot`, {
    headers: getHeaders(userContext),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Failed to fetch queue snapshot" }));
    throw new Error(error.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.snapshot;
}

export async function callNextTicket(
  queueId: string,
  counterId: string,
  userContext: UserContext
): Promise<Ticket | null> {
  const res = await fetch(`${API_BASE}/api/queues/${queueId}/tickets/call-next`, {
    method: "POST",
    headers: getHeaders(userContext),
    body: JSON.stringify({ counterId }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Failed to call next ticket" }));
    throw new Error(error.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.ticket;
}

export async function recallTicket(
  ticketId: string,
  userContext: UserContext
): Promise<Ticket> {
  const res = await fetch(`${API_BASE}/api/tickets/${ticketId}/recall`, {
    method: "POST",
    headers: getHeaders(userContext),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Failed to recall ticket" }));
    throw new Error(error.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.ticket;
}

export async function skipTicket(
  ticketId: string,
  userContext: UserContext
): Promise<Ticket> {
  const res = await fetch(`${API_BASE}/api/tickets/${ticketId}/skip`, {
    method: "POST",
    headers: getHeaders(userContext),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Failed to skip ticket" }));
    throw new Error(error.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.ticket;
}

export async function completeTicket(
  ticketId: string,
  userContext: UserContext
): Promise<Ticket> {
  const res = await fetch(`${API_BASE}/api/tickets/${ticketId}/complete`, {
    method: "POST",
    headers: getHeaders(userContext),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Failed to complete ticket" }));
    throw new Error(error.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.ticket;
}

export async function transferTicket(
  ticketId: string,
  targetQueueId: string,
  userContext: UserContext
): Promise<Ticket> {
  const res = await fetch(`${API_BASE}/api/tickets/${ticketId}/transfer`, {
    method: "POST",
    headers: getHeaders(userContext),
    body: JSON.stringify({ targetQueueId }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Failed to transfer ticket" }));
    throw new Error(error.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.ticket;
}

export async function joinQueue(
  queueId: string,
  payload: { customerName?: string; customerPhone?: string; priority?: string },
  userContext: UserContext
): Promise<Ticket> {
  const res = await fetch(`${API_BASE}/api/check-in/remote`, {
    method: "POST",
    headers: getHeaders(userContext),
    body: JSON.stringify({ queueId, ...payload }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Failed to join queue" }));
    throw new Error(error.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.ticket;
}

export async function checkInRemote(
  queueId: string,
  payload: { customerName?: string; customerPhone?: string; priority?: string; serviceId?: string },
  userContext: UserContext
): Promise<Ticket> {
  return joinQueue(queueId, payload, userContext);
}

export async function checkInWalkIn(
  queueId: string,
  payload: { customerName?: string; customerPhone?: string; serviceId?: string },
  userContext: UserContext
): Promise<Ticket> {
  const res = await fetch(`${API_BASE}/api/check-in/walk-in`, {
    method: "POST",
    headers: getHeaders(userContext),
    body: JSON.stringify({ queueId, ...payload }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Failed walk-in check-in" }));
    throw new Error(error.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.ticket;
}

export async function checkInAppointment(
  queueId: string,
  payload: { appointmentId?: string; customerName?: string; customerPhone?: string; serviceId?: string },
  userContext: UserContext
): Promise<Ticket> {
  const res = await fetch(`${API_BASE}/api/check-in/appointment`, {
    method: "POST",
    headers: getHeaders(userContext),
    body: JSON.stringify({ queueId, ...payload }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Failed appointment check-in" }));
    throw new Error(error.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.ticket;
}

export async function fetchNotifications(
  userContext: UserContext,
  params?: { status?: string; recipient?: string; limit?: number; offset?: number }
): Promise<NotificationListResponse> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.recipient) query.set("recipient", params.recipient);
  if (params?.limit) query.set("limit", params.limit.toString());
  if (params?.offset) query.set("offset", params.offset.toString());

  const queryString = query.toString() ? `?${query.toString()}` : "";
  const res = await fetch(`${API_BASE}/api/notifications${queryString}`, {
    headers: getHeaders(userContext),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Failed to fetch notifications" }));
    throw new Error(error.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function retryNotification(
  notificationId: string,
  userContext: UserContext
): Promise<any> {
  const res = await fetch(`${API_BASE}/api/notifications/${notificationId}/retry`, {
    method: "POST",
    headers: getHeaders(userContext),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Failed to retry notification" }));
    throw new Error(error.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function sendTestNotification(
  userContext: UserContext,
  payload: { recipient: string; channel: string; templateId?: string; variables?: Record<string, unknown> }
): Promise<any> {
  const res = await fetch(`${API_BASE}/api/notifications/test`, {
    method: "POST",
    headers: getHeaders(userContext),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Failed to send test notification" }));
    throw new Error(error.message || `HTTP ${res.status}`);
  }
  return res.json();
}

