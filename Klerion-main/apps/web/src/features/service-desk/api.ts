import { useState, useEffect, useCallback } from "react";
import {
  ServiceTicket,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  SLAStatus,
  ServiceDeskMetrics,
} from "../../../../modules/domains/internal-services/src/index.js";

const AGENT_HEADERS = {
  "Content-Type": "application/json",
  "x-tenant-id": "tenant-default",
  "x-user-id": "agent-smith-1",
  "x-user-role": "agent",
};

export async function fetchAgentDashboard(): Promise<ServiceDeskMetrics> {
  const res = await fetch("/api/service-desk/dashboard", { headers: AGENT_HEADERS });
  if (!res.ok) {
    throw new Error(`Failed to fetch agent dashboard: ${res.statusText}`);
  }
  const data = await res.json();
  return data.metrics;
}

export async function fetchAgentTickets(params: {
  status?: TicketStatus;
  priority?: TicketPriority;
  category?: TicketCategory;
  assignedUserId?: string;
  slaStatus?: SLAStatus;
  search?: string;
  page?: number;
  limit?: number;
} = {}): Promise<{ items: ServiceTicket[]; total: number }> {
  const searchParams = new URLSearchParams();
  if (params.status) searchParams.set("status", params.status);
  if (params.priority) searchParams.set("priority", params.priority);
  if (params.category) searchParams.set("category", params.category);
  if (params.assignedUserId) searchParams.set("assignedUserId", params.assignedUserId);
  if (params.slaStatus) searchParams.set("slaStatus", params.slaStatus);
  if (params.search) searchParams.set("search", params.search);
  if (params.page) searchParams.set("page", String(params.page));
  if (params.limit) searchParams.set("limit", String(params.limit));

  const res = await fetch(`/api/service-desk/tickets?${searchParams.toString()}`, {
    headers: AGENT_HEADERS,
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch tickets: ${res.statusText}`);
  }
  const data = await res.json();
  return { items: data.items, total: data.total };
}

export async function fetchMyAssignedTickets(): Promise<{ items: ServiceTicket[]; total: number }> {
  const res = await fetch("/api/service-desk/tickets/my-assigned", { headers: AGENT_HEADERS });
  if (!res.ok) {
    throw new Error(`Failed to fetch my assigned tickets: ${res.statusText}`);
  }
  const data = await res.json();
  return { items: data.items, total: data.total };
}

export async function fetchTeamQueue(): Promise<{ items: ServiceTicket[]; total: number }> {
  const res = await fetch("/api/service-desk/tickets/team-queue", { headers: AGENT_HEADERS });
  if (!res.ok) {
    throw new Error(`Failed to fetch team queue: ${res.statusText}`);
  }
  const data = await res.json();
  return { items: data.items, total: data.total };
}

export async function fetchTicketDetail(id: string): Promise<ServiceTicket> {
  const res = await fetch(`/api/service-desk/tickets/${id}`, { headers: AGENT_HEADERS });
  if (!res.ok) {
    throw new Error(`Failed to fetch ticket ${id}: ${res.statusText}`);
  }
  const data = await res.json();
  return data.ticket;
}

export async function assignTicket(id: string, assigneeUserId?: string, teamId?: string): Promise<ServiceTicket> {
  const res = await fetch(`/api/service-desk/tickets/${id}/assign`, {
    method: "POST",
    headers: AGENT_HEADERS,
    body: JSON.stringify({ assigneeUserId, teamId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Failed to assign ticket");
  }
  const data = await res.json();
  return data.ticket;
}

export async function updateTicketStatus(
  id: string,
  status: TicketStatus,
  comment?: string,
  resolutionNotes?: string
): Promise<ServiceTicket> {
  const res = await fetch(`/api/service-desk/tickets/${id}/status`, {
    method: "POST",
    headers: AGENT_HEADERS,
    body: JSON.stringify({ status, comment, resolutionNotes }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Failed to update ticket status");
  }
  const data = await res.json();
  return data.ticket;
}

export async function updateTicketPriority(
  id: string,
  priority: TicketPriority,
  reason?: string
): Promise<ServiceTicket> {
  const res = await fetch(`/api/service-desk/tickets/${id}/priority`, {
    method: "POST",
    headers: AGENT_HEADERS,
    body: JSON.stringify({ priority, reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Failed to update priority");
  }
  const data = await res.json();
  return data.ticket;
}

export async function addAgentComment(
  id: string,
  content: string,
  isInternal: boolean = false
): Promise<ServiceTicket> {
  const res = await fetch(`/api/service-desk/tickets/${id}/comments`, {
    method: "POST",
    headers: AGENT_HEADERS,
    body: JSON.stringify({ content, isInternal, authorName: "Agent Smith" }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Failed to add comment");
  }
  const data = await res.json();
  return data.ticket;
}

export async function triggerSLACheck(): Promise<{ warningCount: number; breachedCount: number }> {
  const res = await fetch("/api/service-desk/sla/check", {
    method: "POST",
    headers: AGENT_HEADERS,
  });
  if (!res.ok) {
    throw new Error(`Failed to check SLA expirations: ${res.statusText}`);
  }
  return res.json();
}

// React Hooks for Agent Workspace
export function useAgentWorkspace(initialFilter: { status?: TicketStatus; priority?: TicketPriority; search?: string } = {}) {
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [metrics, setMetrics] = useState<ServiceDeskMetrics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ticketsRes, metricsData] = await Promise.all([
        fetchAgentTickets(initialFilter),
        fetchAgentDashboard(),
      ]);
      setTickets(ticketsRes.items);
      setMetrics(metricsData);
    } catch (err: any) {
      setError(err.message || "Failed to load agent workspace");
    } finally {
      setLoading(false);
    }
  }, [initialFilter.status, initialFilter.priority, initialFilter.search]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { tickets, metrics, loading, error, reload };
}
