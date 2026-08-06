export type TicketCategory =
  | 'IT_SUPPORT'
  | 'HR_REQUEST'
  | 'FACILITIES'
  | 'FINANCE'
  | 'ACCESS_CONTROL'
  | 'GENERAL';

export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type TicketStatus =
  | 'DRAFT'
  | 'NEW'
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'PENDING_USER'
  | 'RESOLVED'
  | 'CLOSED'
  | 'CANCELLED';

export type SLAStatus = 'MET' | 'WARNING' | 'BREACHED';

export interface SLARule {
  id: string;
  name: string;
  priority: TicketPriority;
  responseSLATimeMs: number;
  resolutionSLATimeMs: number;
  warningThresholdPercentage?: number;
}

export interface TicketComment {
  id: string;
  authorUserId: string;
  authorName?: string;
  authorRole?: string;
  content: string;
  isInternal: boolean;
  createdAt: Date;
}

export interface TicketAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType?: string;
  uploadedByUserId: string;
  uploadedAt: Date;
}

export interface TicketTimelineEvent {
  id: string;
  eventType: string;
  actorUserId: string;
  description: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

export interface TicketFilterOptions {
  status?: TicketStatus | TicketStatus[];
  priority?: TicketPriority | TicketPriority[];
  category?: TicketCategory | TicketCategory[];
  requesterUserId?: string;
  assignedUserId?: string;
  assignedTeamId?: string;
  slaStatus?: SLAStatus;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ServiceDeskMetrics {
  totalTickets: number;
  openTickets: number;
  inProgressTickets: number;
  pendingUserTickets: number;
  resolvedTickets: number;
  closedTickets: number;
  urgentTickets: number;
  slaBreachedTickets: number;
  slaWarningTickets: number;
  unassignedTickets: number;
}
