import type { KlerionSession } from "../../lib/session";

const DEFAULT_API_BASE_URL = "/api";

export type ApiServiceDeskTicketType = "INCIDENT" | "SERVICE_REQUEST" | "PROBLEM" | "CHANGE_REQUEST";
export type ApiServiceDeskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type ApiServiceDeskStatus = "OPEN" | "IN_PROGRESS" | "PENDING_REQUESTER" | "PENDING_THIRD_PARTY" | "RESOLVED" | "CLOSED" | "CANCELLED";
export type ApiServiceDeskCatalogStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export interface ApiServiceDeskCatalogItem {
  readonly id: string;
  readonly tenantId: string;
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly status: ApiServiceDeskCatalogStatus;
  readonly version: number;
  readonly intakeMode: "FREEFORM" | "FORM";
  readonly formDefinitionId: string | null;
  readonly workflowDefinitionId: string | null;
  readonly approvalPolicyId: string | null;
  readonly defaultTicketType: ApiServiceDeskTicketType;
  readonly defaultPriority: ApiServiceDeskPriority;
  readonly categoryKey: string | null;
  readonly assignmentGroupId: string | null;
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly publishedAt: string | null;
}

export interface ApiServiceDeskComment {
  readonly id: string;
  readonly authorUserId: string;
  readonly visibility: "REQUESTER" | "INTERNAL";
  readonly body: string;
  readonly attachments: readonly { id: string; fileName: string; contentType: string; sizeBytes?: number | null; storageKey: string }[];
  readonly createdAt: string;
}

export interface ApiServiceDeskStatusEvent {
  readonly id: string;
  readonly fromStatus: ApiServiceDeskStatus | null;
  readonly toStatus: ApiServiceDeskStatus;
  readonly actorUserId: string;
  readonly reason: string;
  readonly createdAt: string;
}

export interface ApiServiceDeskTicket {
  readonly id: string;
  readonly tenantId: string;
  readonly reference: string;
  readonly type: ApiServiceDeskTicketType;
  readonly priority: ApiServiceDeskPriority;
  readonly status: ApiServiceDeskStatus;
  readonly subject: string;
  readonly description: string;
  readonly categoryKey: string | null;
  readonly requester: { readonly userId?: string | null; readonly employeeId?: string | null; readonly name?: string | null; readonly email?: string | null };
  readonly source: string;
  readonly assignmentGroupId: string | null;
  readonly assigneeUserId: string | null;
  readonly watcherUserIds: readonly string[];
  readonly tags: readonly string[];
  readonly workflowInstanceId: string | null;
  readonly approvalRequestId: string | null;
  readonly slaPolicyId: string | null;
  readonly firstResponseDueAt: string | null;
  readonly resolutionDueAt: string | null;
  readonly firstRespondedAt: string | null;
  readonly resolvedAt: string | null;
  readonly closedAt: string | null;
  readonly cancelledAt: string | null;
  readonly pausedAt: string | null;
  readonly escalationLevel: number;
  readonly comments: readonly ApiServiceDeskComment[];
  readonly statusHistory: readonly ApiServiceDeskStatusEvent[];
  readonly createdByUserId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ApiServiceDeskSlaPolicy {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly ticketTypes: readonly ApiServiceDeskTicketType[];
  readonly priorities: readonly ApiServiceDeskPriority[];
  readonly categoryKeys: readonly string[];
  readonly firstResponseMinutes: number;
  readonly resolutionMinutes: number;
  readonly pauseStatuses: readonly ApiServiceDeskStatus[];
  readonly escalationThresholds: readonly number[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

function baseUrl() {
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
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

export const serviceDeskApi = {
  listCatalog(session: KlerionSession): Promise<ApiServiceDeskCatalogItem[]> { return request(session, "/service-desk/catalog"); },
  createCatalogItem(session: KlerionSession, input: { key: string; name: string; description?: string; intakeMode?: "FREEFORM" | "FORM"; formDefinitionId?: string | null; workflowDefinitionId?: string | null; approvalPolicyId?: string | null; defaultTicketType?: ApiServiceDeskTicketType; defaultPriority?: ApiServiceDeskPriority; categoryKey?: string | null; assignmentGroupId?: string | null; tags?: readonly string[] }): Promise<ApiServiceDeskCatalogItem> { return request(session, "/service-desk/catalog", { method: "POST", body: JSON.stringify(input) }); },
  updateCatalogItem(session: KlerionSession, id: string, input: Partial<Omit<ApiServiceDeskCatalogItem, "id" | "tenantId" | "status" | "version" | "createdAt" | "updatedAt" | "publishedAt">>): Promise<ApiServiceDeskCatalogItem> { return request(session, `/service-desk/catalog/${id}`, { method: "PATCH", body: JSON.stringify(input) }); },
  publishCatalogItem(session: KlerionSession, id: string): Promise<ApiServiceDeskCatalogItem> { return request(session, `/service-desk/catalog/${id}/publish`, { method: "POST" }); },
  archiveCatalogItem(session: KlerionSession, id: string): Promise<ApiServiceDeskCatalogItem> { return request(session, `/service-desk/catalog/${id}/archive`, { method: "POST" }); },
  requestCatalogItem(session: KlerionSession, id: string, input: { subject?: string; description?: string; formSubmissionId?: string; context?: Record<string, unknown> }): Promise<{ ticket: ApiServiceDeskTicket; workflowInstance: unknown; approvalRequest: unknown }> { return request(session, `/service-desk/catalog/${id}/request`, { method: "POST", body: JSON.stringify(input) }); },
  listTickets(session: KlerionSession, scope?: "mine" | "assigned" | "all", status?: ApiServiceDeskStatus): Promise<ApiServiceDeskTicket[]> {
    const query = new URLSearchParams();
    if (scope) query.set("scope", scope);
    if (status) query.set("status", status);
    return request(session, `/service-desk/tickets${query.size ? `?${query}` : ""}`);
  },
  getTicket(session: KlerionSession, id: string): Promise<ApiServiceDeskTicket> { return request(session, `/service-desk/tickets/${id}`); },
  createTicket(session: KlerionSession, input: { type: ApiServiceDeskTicketType; priority: ApiServiceDeskPriority; subject: string; description?: string; categoryKey?: string | null; tags?: readonly string[] }): Promise<ApiServiceDeskTicket> { return request(session, "/service-desk/tickets", { method: "POST", body: JSON.stringify(input) }); },
  updateTicket(session: KlerionSession, id: string, input: Partial<{ subject: string; description: string; categoryKey: string | null; priority: ApiServiceDeskPriority; tags: readonly string[]; workflowInstanceId: string | null; approvalRequestId: string | null }>): Promise<ApiServiceDeskTicket> { return request(session, `/service-desk/tickets/${id}`, { method: "PATCH", body: JSON.stringify(input) }); },
  assignTicket(session: KlerionSession, id: string, input: { assignmentGroupId?: string | null; assigneeUserId?: string | null }): Promise<ApiServiceDeskTicket> { return request(session, `/service-desk/tickets/${id}/assign`, { method: "POST", body: JSON.stringify(input) }); },
  transitionTicket(session: KlerionSession, id: string, status: ApiServiceDeskStatus, reason?: string): Promise<ApiServiceDeskTicket> { return request(session, `/service-desk/tickets/${id}/transition`, { method: "POST", body: JSON.stringify({ status, reason }) }); },
  addComment(session: KlerionSession, id: string, body: string, visibility: "REQUESTER" | "INTERNAL" = "REQUESTER"): Promise<ApiServiceDeskTicket> { return request(session, `/service-desk/tickets/${id}/comments`, { method: "POST", body: JSON.stringify({ body, visibility }) }); },
  listSlaPolicies(session: KlerionSession): Promise<ApiServiceDeskSlaPolicy[]> { return request(session, "/service-desk/sla-policies"); },
  createSlaPolicy(session: KlerionSession, input: { name: string; description?: string; enabled?: boolean; ticketTypes?: readonly ApiServiceDeskTicketType[]; priorities?: readonly ApiServiceDeskPriority[]; categoryKeys?: readonly string[]; firstResponseMinutes: number; resolutionMinutes: number; pauseStatuses?: readonly ApiServiceDeskStatus[]; escalationThresholds?: readonly number[] }): Promise<ApiServiceDeskSlaPolicy> { return request(session, "/service-desk/sla-policies", { method: "POST", body: JSON.stringify(input) }); },
  updateSlaPolicy(session: KlerionSession, id: string, input: Partial<Omit<ApiServiceDeskSlaPolicy, "id" | "tenantId" | "createdAt" | "updatedAt">>): Promise<ApiServiceDeskSlaPolicy> { return request(session, `/service-desk/sla-policies/${id}`, { method: "PATCH", body: JSON.stringify(input) }); },
  deleteSlaPolicy(session: KlerionSession, id: string): Promise<void> { return request(session, `/service-desk/sla-policies/${id}`, { method: "DELETE" }); },
};
