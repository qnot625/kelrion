export type ServiceDeskTicketType = "INCIDENT" | "SERVICE_REQUEST" | "PROBLEM" | "CHANGE_REQUEST";
export type ServiceDeskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type ServiceDeskTicketStatus = "OPEN" | "IN_PROGRESS" | "PENDING_REQUESTER" | "PENDING_THIRD_PARTY" | "RESOLVED" | "CLOSED" | "CANCELLED";
export type ServiceDeskSource = "WEB" | "EMAIL" | "API" | "FORM" | "WORKFLOW" | "IMPORT";
export type ServiceDeskCommentVisibility = "REQUESTER" | "INTERNAL";

export interface ServiceDeskRequester {
  readonly userId?: string | null;
  readonly employeeId?: string | null;
  readonly name?: string | null;
  readonly email?: string | null;
}

export interface ServiceDeskAttachmentReference {
  readonly id: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly storageKey: string;
  readonly sizeBytes?: number | null;
}

export interface ServiceDeskComment {
  readonly id: string;
  readonly authorUserId: string;
  readonly visibility: ServiceDeskCommentVisibility;
  readonly body: string;
  readonly attachments: readonly ServiceDeskAttachmentReference[];
  readonly createdAt: Date;
}

export interface ServiceDeskStatusEvent {
  readonly id: string;
  readonly fromStatus: ServiceDeskTicketStatus | null;
  readonly toStatus: ServiceDeskTicketStatus;
  readonly actorUserId: string;
  readonly reason: string;
  readonly createdAt: Date;
}

export interface ServiceDeskSlaPolicyData {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly ticketTypes: readonly ServiceDeskTicketType[];
  readonly priorities: readonly ServiceDeskPriority[];
  readonly categoryKeys: readonly string[];
  readonly firstResponseMinutes: number;
  readonly resolutionMinutes: number;
  readonly pauseStatuses: readonly ServiceDeskTicketStatus[];
  readonly escalationThresholds: readonly number[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ServiceDeskSlaSnapshot {
  readonly firstResponseDueAt: Date | null;
  readonly resolutionDueAt: Date | null;
  readonly firstResponseBreached: boolean;
  readonly resolutionBreached: boolean;
  readonly escalationLevel: number;
}

export interface ServiceDeskTicketData {
  readonly id: string;
  readonly tenantId: string;
  readonly reference: string;
  readonly type: ServiceDeskTicketType;
  readonly priority: ServiceDeskPriority;
  readonly status: ServiceDeskTicketStatus;
  readonly subject: string;
  readonly description: string;
  readonly categoryKey: string | null;
  readonly requester: ServiceDeskRequester;
  readonly source: ServiceDeskSource;
  readonly assignmentGroupId: string | null;
  readonly assigneeUserId: string | null;
  readonly watcherUserIds: readonly string[];
  readonly tags: readonly string[];
  readonly workflowInstanceId: string | null;
  readonly approvalRequestId: string | null;
  readonly slaPolicyId: string | null;
  readonly firstResponseDueAt: Date | null;
  readonly resolutionDueAt: Date | null;
  readonly firstRespondedAt: Date | null;
  readonly resolvedAt: Date | null;
  readonly closedAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly pausedAt: Date | null;
  readonly accumulatedPausedMs: number;
  readonly escalationLevel: number;
  readonly comments: readonly ServiceDeskComment[];
  readonly statusHistory: readonly ServiceDeskStatusEvent[];
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type ServiceDeskCatalogItemStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type ServiceDeskIntakeMode = "FREEFORM" | "FORM";

export interface ServiceDeskCatalogItemData {
  readonly id: string;
  readonly tenantId: string;
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly status: ServiceDeskCatalogItemStatus;
  readonly version: number;
  readonly intakeMode: ServiceDeskIntakeMode;
  readonly formDefinitionId: string | null;
  readonly workflowDefinitionId: string | null;
  readonly approvalPolicyId: string | null;
  readonly defaultTicketType: ServiceDeskTicketType;
  readonly defaultPriority: ServiceDeskPriority;
  readonly categoryKey: string | null;
  readonly assignmentGroupId: string | null;
  readonly tags: readonly string[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly publishedAt: Date | null;
  readonly archivedAt: Date | null;
}
