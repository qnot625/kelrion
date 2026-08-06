export interface CreateWorkflowApprovalParams {
  tenantId: string;
  workflowInstanceId: string;
  workflowDefinitionId: string;
  stepId: string;
  stepName: string;
  assigneeId?: string;
  candidateRoles?: string[];
  metadata?: Record<string, unknown>;
  actorUserId: string;
}

export interface ApprovalTaskHandler {
  createApprovalRequest(params: CreateWorkflowApprovalParams): Promise<{ approvalRequestId: string }>;
}
