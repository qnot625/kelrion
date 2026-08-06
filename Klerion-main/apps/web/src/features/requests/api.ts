import { useState, useEffect, useCallback } from "react";
import {
  ServiceTicket,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  TicketComment,
  TicketAttachment,
  TicketTimelineEvent,
} from "../../../../modules/domains/internal-services/src/index.js";

const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
  "x-tenant-id": "tenant-default",
  "x-user-id": "user-employee-1",
  "x-user-role": "employee",
};

export async function fetchMyRequests(params: {
  status?: TicketStatus;
  category?: TicketCategory;
  priority?: TicketPriority;
  search?: string;
  page?: number;
  limit?: number;
} = {}): Promise<{ items: ServiceTicket[]; total: number }> {
  const searchParams = new URLSearchParams();
  if (params.status) searchParams.set("status", params.status);
  if (params.category) searchParams.set("category", params.category);
  if (params.priority) searchParams.set("priority", params.priority);
  if (params.search) searchParams.set("search", params.search);
  if (params.page) searchParams.set("page", String(params.page));
  if (params.limit) searchParams.set("limit", String(params.limit));

  const url = `/api/requests?${searchParams.toString()}`;
  const res = await fetch(url, { headers: DEFAULT_HEADERS });
  if (!res.ok) {
    throw new Error(`Failed to fetch requests: ${res.statusText}`);
  }
  const data = await res.json();
  return { items: data.items, total: data.total };
}

export async function fetchRequestById(id: string): Promise<ServiceTicket> {
  const res = await fetch(`/api/requests/${id}`, { headers: DEFAULT_HEADERS });
  if (!res.ok) {
    throw new Error(`Failed to fetch request ${id}: ${res.statusText}`);
  }
  const data = await res.json();
  return data.ticket;
}

export async function createServiceRequest(payload: {
  title: string;
  description: string;
  category: TicketCategory;
  priority?: TicketPriority;
  requesterName?: string;
  customFields?: Record<string, unknown>;
}): Promise<ServiceTicket> {
  const res = await fetch("/api/requests", {
    method: "POST",
    headers: DEFAULT_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Failed to create request");
  }
  const data = await res.json();
  return data.ticket;
}

export async function saveDraftRequest(payload: {
  id?: string;
  title: string;
  description?: string;
  category?: TicketCategory;
  priority?: TicketPriority;
}): Promise<ServiceTicket> {
  const res = await fetch("/api/requests/draft", {
    method: "POST",
    headers: DEFAULT_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Failed to save draft");
  }
  const data = await res.json();
  return data.ticket;
}

export async function submitDraftRequest(id: string): Promise<ServiceTicket> {
  const res = await fetch(`/api/requests/${id}/submit`, {
    method: "POST",
    headers: DEFAULT_HEADERS,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Failed to submit draft");
  }
  const data = await res.json();
  return data.ticket;
}

export async function addPublicComment(id: string, content: string): Promise<ServiceTicket> {
  const res = await fetch(`/api/requests/${id}/comments`, {
    method: "POST",
    headers: DEFAULT_HEADERS,
    body: JSON.stringify({ content, authorName: "Alice Developer" }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Failed to add comment");
  }
  const data = await res.json();
  return data.ticket;
}

export async function addRequestAttachment(
  id: string,
  fileName: string,
  fileUrl: string,
  fileSize: number
): Promise<ServiceTicket> {
  const res = await fetch(`/api/requests/${id}/attachments`, {
    method: "POST",
    headers: DEFAULT_HEADERS,
    body: JSON.stringify({ fileName, fileUrl, fileSize }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Failed to add attachment");
  }
  const data = await res.json();
  return data.ticket;
}

export async function cancelServiceRequest(id: string, reason: string): Promise<ServiceTicket> {
  const res = await fetch(`/api/requests/${id}/cancel`, {
    method: "POST",
    headers: DEFAULT_HEADERS,
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Failed to cancel request");
  }
  const data = await res.json();
  return data.ticket;
}

// React Hooks
export function useMyRequests(filters: { status?: TicketStatus; category?: TicketCategory; search?: string } = {}) {
  const [requests, setRequests] = useState<ServiceTicket[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchMyRequests(filters);
      setRequests(res.items);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message || "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }, [filters.status, filters.category, filters.search]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { requests, total, loading, error, reload };
}
