import type {
  ServiceDeskAttachmentReference,
  ServiceDeskComment,
  ServiceDeskCommentVisibility,
  ServiceDeskPriority,
  ServiceDeskRequester,
  ServiceDeskSlaPolicyData,
  ServiceDeskSlaSnapshot,
  ServiceDeskSource,
  ServiceDeskStatusEvent,
  ServiceDeskTicketData,
  ServiceDeskTicketStatus,
  ServiceDeskTicketType,
} from "./types.js";

const TRANSITIONS: Readonly<Record<ServiceDeskTicketStatus, readonly ServiceDeskTicketStatus[]>> = {
  OPEN: ["IN_PROGRESS", "PENDING_REQUESTER", "PENDING_THIRD_PARTY", "RESOLVED", "CANCELLED"],
  IN_PROGRESS: ["PENDING_REQUESTER", "PENDING_THIRD_PARTY", "RESOLVED", "CANCELLED"],
  PENDING_REQUESTER: ["IN_PROGRESS", "PENDING_THIRD_PARTY", "RESOLVED", "CANCELLED"],
  PENDING_THIRD_PARTY: ["IN_PROGRESS", "PENDING_REQUESTER", "RESOLVED", "CANCELLED"],
  RESOLVED: ["IN_PROGRESS", "CLOSED"],
  CLOSED: ["IN_PROGRESS"],
  CANCELLED: [],
};

function unique(values: readonly string[]): string[] { return [...new Set(values.map((value) => value.trim()).filter(Boolean))]; }
function clone<T>(value: T): T { return structuredClone(value); }

export class ServiceDeskTicket {
  private data: ServiceDeskTicketData;

  constructor(data: ServiceDeskTicketData) {
    this.data = {
      ...data,
      subject: data.subject.trim(),
      description: data.description.trim(),
      categoryKey: data.categoryKey?.trim() || null,
      requester: clone(data.requester),
      watcherUserIds: unique(data.watcherUserIds),
      tags: unique(data.tags),
      firstResponseDueAt: data.firstResponseDueAt ? new Date(data.firstResponseDueAt) : null,
      resolutionDueAt: data.resolutionDueAt ? new Date(data.resolutionDueAt) : null,
      firstRespondedAt: data.firstRespondedAt ? new Date(data.firstRespondedAt) : null,
      resolvedAt: data.resolvedAt ? new Date(data.resolvedAt) : null,
      closedAt: data.closedAt ? new Date(data.closedAt) : null,
      cancelledAt: data.cancelledAt ? new Date(data.cancelledAt) : null,
      pausedAt: data.pausedAt ? new Date(data.pausedAt) : null,
      comments: clone(data.comments).map((comment) => ({ ...comment, createdAt: new Date(comment.createdAt) })),
      statusHistory: clone(data.statusHistory).map((event) => ({ ...event, createdAt: new Date(event.createdAt) })),
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
    };
    if (!this.data.id.trim() || !this.data.tenantId.trim()) throw new Error("Ticket ID and tenant ID are required");
    if (!this.data.reference.trim()) throw new Error("Ticket reference is required");
    if (!this.data.subject) throw new Error("Ticket subject is required");
    if (!this.data.createdByUserId.trim()) throw new Error("createdByUserId is required");
  }

  static create(input: {
    id: string;
    tenantId: string;
    reference: string;
    type: ServiceDeskTicketType;
    priority: ServiceDeskPriority;
    subject: string;
    description?: string;
    categoryKey?: string | null;
    requester: ServiceDeskRequester;
    source?: ServiceDeskSource;
    assignmentGroupId?: string | null;
    assigneeUserId?: string | null;
    watcherUserIds?: readonly string[];
    tags?: readonly string[];
    workflowInstanceId?: string | null;
    approvalRequestId?: string | null;
    createdByUserId: string;
    slaPolicy?: ServiceDeskSlaPolicyData | null;
    statusEventId: string;
  }): ServiceDeskTicket {
    const now = new Date();
    const policy = input.slaPolicy ?? null;
    return new ServiceDeskTicket({
      id: input.id,
      tenantId: input.tenantId,
      reference: input.reference,
      type: input.type,
      priority: input.priority,
      status: "OPEN",
      subject: input.subject,
      description: input.description ?? "",
      categoryKey: input.categoryKey ?? null,
      requester: clone(input.requester),
      source: input.source ?? "WEB",
      assignmentGroupId: input.assignmentGroupId ?? null,
      assigneeUserId: input.assigneeUserId ?? null,
      watcherUserIds: input.watcherUserIds ?? [],
      tags: input.tags ?? [],
      workflowInstanceId: input.workflowInstanceId ?? null,
      approvalRequestId: input.approvalRequestId ?? null,
      slaPolicyId: policy?.id ?? null,
      firstResponseDueAt: policy ? new Date(now.getTime() + policy.firstResponseMinutes * 60_000) : null,
      resolutionDueAt: policy ? new Date(now.getTime() + policy.resolutionMinutes * 60_000) : null,
      firstRespondedAt: null,
      resolvedAt: null,
      closedAt: null,
      cancelledAt: null,
      pausedAt: policy?.pauseStatuses.includes("OPEN") ? now : null,
      accumulatedPausedMs: 0,
      escalationLevel: 0,
      comments: [],
      statusHistory: [{ id: input.statusEventId, fromStatus: null, toStatus: "OPEN", actorUserId: input.createdByUserId, reason: "Ticket created", createdAt: now }],
      createdByUserId: input.createdByUserId,
      createdAt: now,
      updatedAt: now,
    });
  }

  get id() { return this.data.id; }
  get tenantId() { return this.data.tenantId; }
  get reference() { return this.data.reference; }
  get type() { return this.data.type; }
  get priority() { return this.data.priority; }
  get status() { return this.data.status; }
  get subject() { return this.data.subject; }
  get requester(): ServiceDeskRequester { return clone(this.data.requester); }
  get source() { return this.data.source; }
  get assignmentGroupId() { return this.data.assignmentGroupId; }
  get assigneeUserId() { return this.data.assigneeUserId; }
  get watcherUserIds() { return [...this.data.watcherUserIds]; }
  get slaPolicyId() { return this.data.slaPolicyId; }
  get firstResponseDueAt() { return this.data.firstResponseDueAt ? new Date(this.data.firstResponseDueAt) : null; }
  get resolutionDueAt() { return this.data.resolutionDueAt ? new Date(this.data.resolutionDueAt) : null; }
  get firstRespondedAt() { return this.data.firstRespondedAt ? new Date(this.data.firstRespondedAt) : null; }
  get escalationLevel() { return this.data.escalationLevel; }
  get comments(): readonly ServiceDeskComment[] { return clone(this.data.comments); }
  get updatedAt() { return new Date(this.data.updatedAt); }
  get createdByUserId() { return this.data.createdByUserId; }

  isRequester(userId: string): boolean { return this.data.requester.userId === userId || this.data.createdByUserId === userId; }
  isWatcher(userId: string): boolean { return this.data.watcherUserIds.includes(userId); }
  isAssigned(userId: string): boolean { return this.data.assigneeUserId === userId; }
  isTerminal(): boolean { return this.data.status === "CANCELLED"; }

  updateDetails(input: { subject?: string; description?: string; categoryKey?: string | null; priority?: ServiceDeskPriority; tags?: readonly string[]; workflowInstanceId?: string | null; approvalRequestId?: string | null }): void {
    if (this.isTerminal()) throw new Error("Cancelled tickets cannot be edited");
    const subject = input.subject === undefined ? this.data.subject : input.subject.trim();
    if (!subject) throw new Error("Ticket subject cannot be empty");
    this.data = {
      ...this.data,
      subject,
      description: input.description === undefined ? this.data.description : input.description.trim(),
      categoryKey: input.categoryKey === undefined ? this.data.categoryKey : input.categoryKey?.trim() || null,
      priority: input.priority ?? this.data.priority,
      tags: input.tags === undefined ? this.data.tags : unique(input.tags),
      workflowInstanceId: input.workflowInstanceId === undefined ? this.data.workflowInstanceId : input.workflowInstanceId,
      approvalRequestId: input.approvalRequestId === undefined ? this.data.approvalRequestId : input.approvalRequestId,
      updatedAt: new Date(),
    };
  }

  assign(input: { assignmentGroupId?: string | null; assigneeUserId?: string | null }): void {
    if (this.isTerminal()) throw new Error("Cancelled tickets cannot be assigned");
    this.data = {
      ...this.data,
      assignmentGroupId: input.assignmentGroupId === undefined ? this.data.assignmentGroupId : input.assignmentGroupId?.trim() || null,
      assigneeUserId: input.assigneeUserId === undefined ? this.data.assigneeUserId : input.assigneeUserId?.trim() || null,
      updatedAt: new Date(),
    };
  }

  setWatchers(userIds: readonly string[]): void {
    this.data = { ...this.data, watcherUserIds: unique(userIds), updatedAt: new Date() };
  }

  addComment(input: { id: string; authorUserId: string; visibility: ServiceDeskCommentVisibility; body: string; attachments?: readonly ServiceDeskAttachmentReference[]; countsAsFirstResponse?: boolean }): ServiceDeskComment {
    if (this.isTerminal()) throw new Error("Cancelled tickets cannot receive comments");
    const body = input.body.trim();
    if (!body && (input.attachments?.length ?? 0) === 0) throw new Error("A comment requires text or an attachment");
    const now = new Date();
    const comment: ServiceDeskComment = { id: input.id, authorUserId: input.authorUserId, visibility: input.visibility, body, attachments: clone(input.attachments ?? []), createdAt: now };
    this.data = {
      ...this.data,
      comments: [...this.data.comments, comment],
      firstRespondedAt: input.countsAsFirstResponse && !this.data.firstRespondedAt ? now : this.data.firstRespondedAt,
      updatedAt: now,
    };
    return clone(comment);
  }

  transition(input: { toStatus: ServiceDeskTicketStatus; actorUserId: string; reason?: string; eventId: string; slaPolicy?: ServiceDeskSlaPolicyData | null }): void {
    const from = this.data.status;
    if (from === input.toStatus) return;
    if (!TRANSITIONS[from].includes(input.toStatus)) throw new Error(`Cannot transition service desk ticket from ${from} to ${input.toStatus}`);
    const now = new Date();
    const policy = input.slaPolicy ?? null;
    let firstResponseDueAt = this.data.firstResponseDueAt;
    let resolutionDueAt = this.data.resolutionDueAt;
    let pausedAt = this.data.pausedAt;
    let accumulatedPausedMs = this.data.accumulatedPausedMs;
    const wasPaused = Boolean(pausedAt);
    const shouldPause = Boolean(policy?.pauseStatuses.includes(input.toStatus));

    if (wasPaused && !shouldPause && pausedAt) {
      const pauseMs = Math.max(0, now.getTime() - pausedAt.getTime());
      accumulatedPausedMs += pauseMs;
      if (firstResponseDueAt && !this.data.firstRespondedAt) firstResponseDueAt = new Date(firstResponseDueAt.getTime() + pauseMs);
      if (resolutionDueAt && !this.data.resolvedAt) resolutionDueAt = new Date(resolutionDueAt.getTime() + pauseMs);
      pausedAt = null;
    } else if (!wasPaused && shouldPause) {
      pausedAt = now;
    }

    const event: ServiceDeskStatusEvent = {
      id: input.eventId,
      fromStatus: from,
      toStatus: input.toStatus,
      actorUserId: input.actorUserId,
      reason: input.reason?.trim() || "Status changed",
      createdAt: now,
    };
    this.data = {
      ...this.data,
      status: input.toStatus,
      firstResponseDueAt,
      resolutionDueAt,
      pausedAt,
      accumulatedPausedMs,
      resolvedAt: input.toStatus === "RESOLVED" ? now : input.toStatus === "IN_PROGRESS" && from === "RESOLVED" ? null : this.data.resolvedAt,
      closedAt: input.toStatus === "CLOSED" ? now : input.toStatus === "IN_PROGRESS" && from === "CLOSED" ? null : this.data.closedAt,
      cancelledAt: input.toStatus === "CANCELLED" ? now : this.data.cancelledAt,
      statusHistory: [...this.data.statusHistory, event],
      updatedAt: now,
    };
  }

  applySlaPolicy(policy: ServiceDeskSlaPolicyData, now = new Date()): void {
    if (this.data.firstRespondedAt || this.data.resolvedAt) throw new Error("SLA policy cannot be replaced after response or resolution milestones have been recorded");
    this.data = {
      ...this.data,
      slaPolicyId: policy.id,
      firstResponseDueAt: new Date(now.getTime() + policy.firstResponseMinutes * 60_000),
      resolutionDueAt: new Date(now.getTime() + policy.resolutionMinutes * 60_000),
      pausedAt: policy.pauseStatuses.includes(this.data.status) ? now : null,
      accumulatedPausedMs: 0,
      escalationLevel: 0,
      updatedAt: now,
    };
  }

  refreshSla(policy: ServiceDeskSlaPolicyData | null, now = new Date()): ServiceDeskSlaSnapshot {
    if (!policy || this.data.slaPolicyId !== policy.id) {
      return {
        firstResponseDueAt: this.firstResponseDueAt,
        resolutionDueAt: this.resolutionDueAt,
        firstResponseBreached: Boolean(this.data.firstResponseDueAt && !this.data.firstRespondedAt && now > this.data.firstResponseDueAt),
        resolutionBreached: Boolean(this.data.resolutionDueAt && !this.data.resolvedAt && now > this.data.resolutionDueAt),
        escalationLevel: this.data.escalationLevel,
      };
    }
    const clock = this.data.pausedAt ? this.data.pausedAt : now;
    const activeElapsedMs = Math.max(0, clock.getTime() - this.data.createdAt.getTime() - this.data.accumulatedPausedMs);
    const resolutionBudgetMs = policy.resolutionMinutes * 60_000;
    const percent = resolutionBudgetMs > 0 ? (activeElapsedMs / resolutionBudgetMs) * 100 : 0;
    const escalationLevel = policy.escalationThresholds.filter((threshold) => percent >= threshold).length;
    if (escalationLevel !== this.data.escalationLevel) this.data = { ...this.data, escalationLevel, updatedAt: now };
    return {
      firstResponseDueAt: this.firstResponseDueAt,
      resolutionDueAt: this.resolutionDueAt,
      firstResponseBreached: Boolean(this.data.firstResponseDueAt && !this.data.firstRespondedAt && now > this.data.firstResponseDueAt && !this.data.pausedAt),
      resolutionBreached: Boolean(this.data.resolutionDueAt && !this.data.resolvedAt && now > this.data.resolutionDueAt && !this.data.pausedAt),
      escalationLevel,
    };
  }

  clone() { return new ServiceDeskTicket(this.toPersistence()); }
  toPersistence(): ServiceDeskTicketData { return clone(this.data); }
  toJSON() {
    const data = this.toPersistence();
    return {
      ...data,
      firstResponseDueAt: data.firstResponseDueAt?.toISOString() ?? null,
      resolutionDueAt: data.resolutionDueAt?.toISOString() ?? null,
      firstRespondedAt: data.firstRespondedAt?.toISOString() ?? null,
      resolvedAt: data.resolvedAt?.toISOString() ?? null,
      closedAt: data.closedAt?.toISOString() ?? null,
      cancelledAt: data.cancelledAt?.toISOString() ?? null,
      pausedAt: data.pausedAt?.toISOString() ?? null,
      comments: data.comments.map((comment) => ({ ...comment, createdAt: comment.createdAt.toISOString() })),
      statusHistory: data.statusHistory.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
      createdAt: data.createdAt.toISOString(),
      updatedAt: data.updatedAt.toISOString(),
    };
  }
}
