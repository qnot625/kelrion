import { ApprovalRequest, ApprovalStatus } from './approval-request.js';

export interface ApprovalRequestFilter {
  status?: ApprovalStatus;
  requesterUserId?: string;
  assigneeUserId?: string;
  workflowInstanceId?: string;
}

export interface ApprovalRequestRepository {
  save(request: ApprovalRequest): Promise<void>;
  findById(id: string, tenantId: string): Promise<ApprovalRequest | null>;
  findByTenantId(tenantId: string, filter?: ApprovalRequestFilter): Promise<ApprovalRequest[]>;
  findByWorkflowInstanceId(workflowInstanceId: string, tenantId: string): Promise<ApprovalRequest[]>;
  findByAssignee(userId: string, tenantId: string, status?: ApprovalStatus): Promise<ApprovalRequest[]>;
  delete(id: string, tenantId: string): Promise<boolean>;
}
