import {
  ApprovalTaskHandler,
  CreateWorkflowApprovalParams,
  WorkflowExecutionService,
} from '../../../../platform/workflow/src/index.js';
import { ApprovalService } from './approval-service.js';
import { ApprovalRequest } from './approval-request.js';

export class WorkflowApprovalAdapter implements ApprovalTaskHandler {
  constructor(
    private readonly approvalService: ApprovalService,
    private readonly workflowExecutionService: WorkflowExecutionService
  ) {}

  public async createApprovalRequest(
    params: CreateWorkflowApprovalParams
  ): Promise<{ approvalRequestId: string }> {
    const assignedUserIds: string[] = [];
    if (params.assigneeId) {
      assignedUserIds.push(params.assigneeId);
    }

    const approvalRequest = await this.approvalService.createApprovalRequest({
      tenantId: params.tenantId,
      title: `Approval Required: ${params.stepName}`,
      description: `Workflow Instance '${params.workflowInstanceId}' reached step '${params.stepId}' requiring approval.`,
      workflowInstanceId: params.workflowInstanceId,
      workflowStepId: params.stepId,
      requesterUserId: params.actorUserId,
      steps: [
        {
          id: params.stepId,
          name: params.stepName,
          assignedUserIds,
          assignedRoles: params.candidateRoles,
          requiredApproversCount: 1,
        },
      ],
      metadata: params.metadata,
    });

    return { approvalRequestId: approvalRequest.id };
  }

  public async onApprovalCompleted(
    approvalRequest: ApprovalRequest
  ): Promise<void> {
    if (!approvalRequest.workflowInstanceId) return;

    const outcome = approvalRequest.status; // APPROVED or REJECTED

    await this.workflowExecutionService.advanceWorkflow({
      instanceId: approvalRequest.workflowInstanceId,
      tenantId: approvalRequest.tenantId,
      executedBy: 'approval-engine',
      stepOutput: {
        approvalRequestId: approvalRequest.id,
        approvalStatus: outcome,
        approved: outcome === 'APPROVED',
        rejected: outcome === 'REJECTED',
        decisions: approvalRequest.steps.flatMap((s) => s.decisions),
      },
    });
  }
}
