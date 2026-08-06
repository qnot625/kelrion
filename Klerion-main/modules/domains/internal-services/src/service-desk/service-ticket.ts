import {
  TicketCategory,
  TicketPriority,
  TicketStatus,
  SLAStatus,
  TicketComment,
  TicketAttachment,
  TicketTimelineEvent,
} from './types.js';

export interface ServiceTicketProps {
  id: string;
  tenantId: string;
  ticketNumber?: string;
  title: string;
  description: string;
  category: TicketCategory;
  priority?: TicketPriority;
  status?: TicketStatus;
  requesterUserId: string;
  requesterName?: string;
  requesterEmail?: string;
  assignedUserId?: string;
  assignedTeamId?: string;
  formSubmissionId?: string;
  workflowInstanceId?: string;
  comments?: TicketComment[];
  attachments?: TicketAttachment[];
  timeline?: TicketTimelineEvent[];
  createdAt?: Date;
  updatedAt?: Date;
  firstRespondedAt?: Date;
  resolvedAt?: Date;
  closedAt?: Date;
  dueAt?: Date;
  responseDueAt?: Date;
  slaStatus?: SLAStatus;
  resolutionNotes?: string;
  cancellationReason?: string;
  customFields?: Record<string, unknown>;
}

// SLA duration defaults in ms:
// URGENT: response 1h, resolution 4h
// HIGH: response 4h, resolution 24h
// MEDIUM: response 12h, resolution 48h
// LOW: response 24h, resolution 72h
export const DEFAULT_SLA_TIMEOFFSETS: Record<TicketPriority, { responseMs: number; resolutionMs: number }> = {
  URGENT: { responseMs: 1 * 3600 * 1000, resolutionMs: 4 * 3600 * 1000 },
  HIGH: { responseMs: 4 * 3600 * 1000, resolutionMs: 24 * 3600 * 1000 },
  MEDIUM: { responseMs: 12 * 3600 * 1000, resolutionMs: 48 * 3600 * 1000 },
  LOW: { responseMs: 24 * 3600 * 1000, resolutionMs: 72 * 3600 * 1000 },
};

export class ServiceTicket {
  public readonly id: string;
  public readonly tenantId: string;
  public ticketNumber: string;
  public title: string;
  public description: string;
  public category: TicketCategory;
  public priority: TicketPriority;
  public status: TicketStatus;
  public requesterUserId: string;
  public requesterName?: string;
  public requesterEmail?: string;
  public assignedUserId?: string;
  public assignedTeamId?: string;
  public formSubmissionId?: string;
  public workflowInstanceId?: string;
  public comments: TicketComment[];
  public attachments: TicketAttachment[];
  public timeline: TicketTimelineEvent[];
  public createdAt: Date;
  public updatedAt: Date;
  public firstRespondedAt?: Date;
  public resolvedAt?: Date;
  public closedAt?: Date;
  public dueAt?: Date;
  public responseDueAt?: Date;
  public slaStatus: SLAStatus;
  public resolutionNotes?: string;
  public cancellationReason?: string;
  public customFields?: Record<string, unknown>;

  constructor(props: ServiceTicketProps) {
    if (!props.id || typeof props.id !== 'string' || !props.id.trim()) {
      throw new Error('ServiceTicket invariant failed: id is required');
    }
    if (!props.tenantId || typeof props.tenantId !== 'string' || !props.tenantId.trim()) {
      throw new Error('ServiceTicket invariant failed: tenantId is required');
    }
    if (!props.title || typeof props.title !== 'string' || !props.title.trim()) {
      throw new Error('ServiceTicket invariant failed: title is required');
    }
    if (!props.requesterUserId || typeof props.requesterUserId !== 'string' || !props.requesterUserId.trim()) {
      throw new Error('ServiceTicket invariant failed: requesterUserId is required');
    }
    if (!props.category) {
      throw new Error('ServiceTicket invariant failed: category is required');
    }

    this.id = props.id;
    this.tenantId = props.tenantId;
    this.ticketNumber = props.ticketNumber || `TCK-${Math.floor(1000 + Math.random() * 9000)}`;
    this.title = props.title.trim();
    this.description = props.description ? props.description.trim() : '';
    this.category = props.category;
    this.priority = props.priority || 'MEDIUM';
    this.status = props.status || 'NEW';
    this.requesterUserId = props.requesterUserId;
    this.requesterName = props.requesterName;
    this.requesterEmail = props.requesterEmail;
    this.assignedUserId = props.assignedUserId;
    this.assignedTeamId = props.assignedTeamId;
    this.formSubmissionId = props.formSubmissionId;
    this.workflowInstanceId = props.workflowInstanceId;
    this.comments = props.comments ? [...props.comments] : [];
    this.attachments = props.attachments ? [...props.attachments] : [];
    this.timeline = props.timeline ? [...props.timeline] : [];
    this.createdAt = props.createdAt || new Date();
    this.updatedAt = props.updatedAt || new Date();
    this.firstRespondedAt = props.firstRespondedAt;
    this.resolvedAt = props.resolvedAt;
    this.closedAt = props.closedAt;
    this.slaStatus = props.slaStatus || 'MET';
    this.resolutionNotes = props.resolutionNotes;
    this.cancellationReason = props.cancellationReason;
    this.customFields = props.customFields ? { ...props.customFields } : {};

    // Calculate default SLA deadlines if not explicit
    const slaOffsets = DEFAULT_SLA_TIMEOFFSETS[this.priority];
    this.responseDueAt = props.responseDueAt || new Date(this.createdAt.getTime() + slaOffsets.responseMs);
    this.dueAt = props.dueAt || new Date(this.createdAt.getTime() + slaOffsets.resolutionMs);

    // Initial timeline entry if timeline is empty
    if (this.timeline.length === 0) {
      this.addTimelineEvent('TICKET_CREATED', this.requesterUserId, 'Service ticket created');
    }
  }

  private addTimelineEvent(eventType: string, actorUserId: string, description: string, metadata?: Record<string, unknown>) {
    this.timeline.push({
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      eventType,
      actorUserId,
      description,
      metadata,
      timestamp: new Date(),
    });
  }

  public submit(actorUserId: string): void {
    if (this.status !== 'DRAFT') {
      throw new Error(`Cannot submit ticket in status ${this.status}`);
    }
    this.status = 'NEW';
    this.updatedAt = new Date();
    this.addTimelineEvent('TICKET_SUBMITTED', actorUserId, 'Ticket submitted from draft');
  }

  public updateDetails(
    actorUserId: string,
    updates: {
      title?: string;
      description?: string;
      category?: TicketCategory;
      customFields?: Record<string, unknown>;
    }
  ): void {
    if (this.status === 'CLOSED' || this.status === 'CANCELLED') {
      throw new Error(`Cannot update ticket details when ticket is ${this.status}`);
    }
    if (updates.title && updates.title.trim()) {
      this.title = updates.title.trim();
    }
    if (updates.description !== undefined) {
      this.description = updates.description.trim();
    }
    if (updates.category) {
      this.category = updates.category;
    }
    if (updates.customFields) {
      this.customFields = { ...this.customFields, ...updates.customFields };
    }
    this.updatedAt = new Date();
    this.addTimelineEvent('TICKET_UPDATED', actorUserId, 'Ticket details updated', updates);
  }

  public assign(actorUserId: string, assigneeUserId?: string, teamId?: string): void {
    if (this.status === 'CLOSED' || this.status === 'CANCELLED') {
      throw new Error(`Cannot assign ticket when ticket is ${this.status}`);
    }
    this.assignedUserId = assigneeUserId;
    if (teamId !== undefined) {
      this.assignedTeamId = teamId;
    }
    if (this.status === 'NEW') {
      this.status = 'OPEN';
    }
    this.updatedAt = new Date();
    const targetDesc = assigneeUserId
      ? `Assigned to user ${assigneeUserId}`
      : teamId
      ? `Assigned to team ${teamId}`
      : 'Unassigned ticket';
    this.addTimelineEvent('TICKET_ASSIGNED', actorUserId, targetDesc, { assigneeUserId, teamId });
  }

  public changeStatus(actorUserId: string, newStatus: TicketStatus, comment?: string): void {
    if (this.status === newStatus) return;
    if (this.status === 'CLOSED' || this.status === 'CANCELLED') {
      throw new Error(`Cannot change status of a ${this.status} ticket`);
    }

    const previousStatus = this.status;
    this.status = newStatus;
    this.updatedAt = new Date();

    if (newStatus === 'RESOLVED') {
      this.resolvedAt = new Date();
    } else if (newStatus === 'CLOSED') {
      this.closedAt = new Date();
    }

    if (comment) {
      this.addComment(actorUserId, comment, false);
    }

    this.addTimelineEvent('STATUS_CHANGED', actorUserId, `Status changed from ${previousStatus} to ${newStatus}`, {
      previousStatus,
      newStatus,
    });
  }

  public updatePriority(actorUserId: string, newPriority: TicketPriority, reason?: string): void {
    if (this.priority === newPriority) return;
    if (this.status === 'CLOSED' || this.status === 'CANCELLED') {
      throw new Error(`Cannot update priority of a ${this.status} ticket`);
    }

    const prevPriority = this.priority;
    this.priority = newPriority;
    this.updatedAt = new Date();

    // Recalculate resolution SLA offset if not yet resolved
    if (!this.resolvedAt) {
      const slaOffsets = DEFAULT_SLA_TIMEOFFSETS[newPriority];
      this.dueAt = new Date(this.createdAt.getTime() + slaOffsets.resolutionMs);
    }

    this.addTimelineEvent(
      'PRIORITY_CHANGED',
      actorUserId,
      `Priority updated from ${prevPriority} to ${newPriority}${reason ? `: ${reason}` : ''}`,
      { prevPriority, newPriority, reason }
    );
  }

  public addComment(
    actorUserId: string,
    content: string,
    isInternal: boolean = false,
    authorName?: string,
    authorRole?: string
  ): TicketComment {
    if (!content || !content.trim()) {
      throw new Error('Comment content cannot be empty');
    }
    const comment: TicketComment = {
      id: `cmt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      authorUserId: actorUserId,
      authorName,
      authorRole,
      content: content.trim(),
      isInternal,
      createdAt: new Date(),
    };
    this.comments.push(comment);
    this.updatedAt = new Date();

    // Set first responded at if agent/internal comment and not set
    if (!this.firstRespondedAt && (isInternal || actorUserId !== this.requesterUserId)) {
      this.firstRespondedAt = new Date();
    }

    this.addTimelineEvent(
      isInternal ? 'INTERNAL_NOTE_ADDED' : 'PUBLIC_COMMENT_ADDED',
      actorUserId,
      isInternal ? 'Added an internal note' : 'Added a public comment'
    );

    return comment;
  }

  public addAttachment(
    actorUserId: string,
    fileName: string,
    fileUrl: string,
    fileSize: number,
    mimeType?: string
  ): TicketAttachment {
    if (!fileName || !fileUrl) {
      throw new Error('Attachment fileName and fileUrl are required');
    }
    const attachment: TicketAttachment = {
      id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      fileName,
      fileUrl,
      fileSize,
      mimeType,
      uploadedByUserId: actorUserId,
      uploadedAt: new Date(),
    };
    this.attachments.push(attachment);
    this.updatedAt = new Date();

    this.addTimelineEvent('ATTACHMENT_ADDED', actorUserId, `Uploaded attachment: ${fileName}`);
    return attachment;
  }

  public resolve(actorUserId: string, resolutionNotes: string): void {
    if (this.status === 'CLOSED' || this.status === 'CANCELLED') {
      throw new Error(`Cannot resolve ticket in ${this.status} status`);
    }
    if (!resolutionNotes || !resolutionNotes.trim()) {
      throw new Error('Resolution notes are required when resolving a ticket');
    }
    this.status = 'RESOLVED';
    this.resolutionNotes = resolutionNotes.trim();
    this.resolvedAt = new Date();
    this.updatedAt = new Date();

    this.addTimelineEvent('TICKET_RESOLVED', actorUserId, `Ticket resolved: ${resolutionNotes}`);
  }

  public close(actorUserId: string): void {
    if (this.status === 'CLOSED') return;
    this.status = 'CLOSED';
    this.closedAt = new Date();
    this.updatedAt = new Date();

    this.addTimelineEvent('TICKET_CLOSED', actorUserId, 'Ticket closed');
  }

  public cancel(actorUserId: string, reason: string): void {
    if (this.status === 'CLOSED' || this.status === 'CANCELLED') {
      throw new Error(`Cannot cancel ticket in ${this.status} status`);
    }
    this.status = 'CANCELLED';
    this.cancellationReason = reason ? reason.trim() : 'Cancelled by user';
    this.updatedAt = new Date();

    this.addTimelineEvent('TICKET_CANCELLED', actorUserId, `Ticket cancelled: ${this.cancellationReason}`);
  }

  public evaluateSLA(now: Date = new Date()): { isWarning: boolean; isBreached: boolean } {
    if (this.status === 'RESOLVED' || this.status === 'CLOSED' || this.status === 'CANCELLED') {
      return { isWarning: false, isBreached: this.slaStatus === 'BREACHED' };
    }

    let isBreached = false;
    let isWarning = false;

    // Check resolution dueAt
    if (this.dueAt) {
      const totalTime = this.dueAt.getTime() - this.createdAt.getTime();
      const timeRemaining = this.dueAt.getTime() - now.getTime();

      if (timeRemaining <= 0) {
        isBreached = true;
      } else if (totalTime > 0 && (totalTime - timeRemaining) / totalTime >= 0.8) {
        isWarning = true;
      }
    }

    if (isBreached) {
      this.slaStatus = 'BREACHED';
    } else if (isWarning) {
      this.slaStatus = 'WARNING';
    } else {
      this.slaStatus = 'MET';
    }

    return { isWarning, isBreached };
  }
}
