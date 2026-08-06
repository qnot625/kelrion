import {
  ApprovalRequest,
  ApprovalStepProps,
} from './approval-request.js';
import {
  ApprovalRequestRepository,
  ApprovalRequestFilter,
} from './approval-request-repository.js';

export interface CreateApprovalRequestParams {
  id?: string;
  tenantId: string;
  title: string;
  description?: string;
  workflowInstanceId?: string;
  workflowStepId?: string;
  requesterUserId: string;
  steps: {
    id?: string;
    name: string;
    assignedUserIds?: string[];
    assignedRoles?: string[];
    requiredApproversCount?: number;
    dueDurationMs?: number;
    escalationTargetUserId?: string;
  }[];
  metadata?: Record<string, unknown>;
}

export interface ActionApprovalParams {
  id: string;
  tenantId: string;
  stepId?: string;
  actorUserId: string;
  actorRole?: string;
  comment?: string;
  data?: Record<string, unknown>;
  reason?: string;
}

export interface DelegateApprovalParams {
  id: string;
  tenantId: string;
  stepId?: string;
  actorUserId: string;
  targetUserId: string;
  comment?: string;
}

export interface RequestMoreInfoParams {
  id: string;
  tenantId: string;
  stepId?: string;
  actorUserId: string;
  question: string;
  targetUserId?: string;
}

export interface ResumeApprovalParams {
  id: string;
  tenantId: string;
  actorUserId: string;
  comment?: string;
  responseData?: Record<string, unknown>;
}

export interface CancelApprovalParams {
  id: string;
  tenantId: string;
  actorUserId: string;
  reason?: string;
}

export interface TimeoutApprovalParams {
  id: string;
  tenantId: string;
  reason?: string;
}

export type ApprovalCompletedCallback = (
  approvalRequest: ApprovalRequest
) => Promise<void>;

export class ApprovalService {
  private completionCallback?: ApprovalCompletedCallback;

  constructor(
    private readonly repo: ApprovalRequestRepository,
    private readonly auditLogger?: (
      action: string,
      payload: Record<string, unknown>
    ) => Promise<void>,
    completionCallback?: ApprovalCompletedCallback
  ) {
    this.completionCallback = completionCallback;
  }

  public setCompletionCallback(callback: ApprovalCompletedCallback): void {
    this.completionCallback = callback;
  }

  public async createApprovalRequest(
    params: CreateApprovalRequestParams
  ): Promise<ApprovalRequest> {
    const requestId =
      params.id ?? `apr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const steps: ApprovalStepProps[] = params.steps.map((s, idx) => ({
      id: s.id || `step_${idx}_${Math.random().toString(36).substring(2, 6)}`,
      name: s.name,
      stepOrder: idx,
      assignedUserIds: s.assignedUserIds || [],
      assignedRoles: s.assignedRoles || [],
      requiredApproversCount: s.requiredApproversCount || 1,
      dueAt: s.dueDurationMs ? new Date(Date.now() + s.dueDurationMs) : undefined,
      escalationTargetUserId: s.escalationTargetUserId,
    }));

    const approvalRequest = ApprovalRequest.create({
      id: requestId,
      tenantId: params.tenantId,
      title: params.title,
      description: params.description,
      workflowInstanceId: params.workflowInstanceId,
      workflowStepId: params.workflowStepId,
      requesterUserId: params.requesterUserId,
      steps,
      metadata: params.metadata,
    });

    await this.repo.save(approvalRequest);

    if (this.auditLogger) {
      await this.auditLogger('approval.created', {
        approvalRequestId: approvalRequest.id,
        tenantId: approvalRequest.tenantId,
        title: approvalRequest.title,
        requesterUserId: approvalRequest.requesterUserId,
        workflowInstanceId: approvalRequest.workflowInstanceId,
        stepCount: approvalRequest.steps.length,
      });
    }

    return approvalRequest;
  }

  public async approve(params: ActionApprovalParams): Promise<ApprovalRequest> {
    const request = await this.getExisting(params.id, params.tenantId);
    const stepId = params.stepId || request.currentStep?.id;
    if (!stepId) {
      throw new Error(`No active step found for ApprovalRequest '${params.id}'`);
    }

    request.approve(
      stepId,
      params.actorUserId,
      params.comment,
      params.data,
      params.actorRole
    );

    await this.repo.save(request);

    if (this.auditLogger) {
      await this.auditLogger('approval.approved', {
        approvalRequestId: request.id,
        tenantId: request.tenantId,
        stepId,
        actorUserId: params.actorUserId,
        status: request.status,
      });
    }

    if (
      (request.status === 'APPROVED' || request.status === 'REJECTED') &&
      this.completionCallback
    ) {
      await this.completionCallback(request);
    }

    return request;
  }

  public async reject(params: ActionApprovalParams): Promise<ApprovalRequest> {
    const request = await this.getExisting(params.id, params.tenantId);
    const stepId = params.stepId || request.currentStep?.id;
    if (!stepId) {
      throw new Error(`No active step found for ApprovalRequest '${params.id}'`);
    }

    request.reject(
      stepId,
      params.actorUserId,
      params.comment || params.reason,
      params.data,
      params.actorRole
    );

    await this.repo.save(request);

    if (this.auditLogger) {
      await this.auditLogger('approval.rejected', {
        approvalRequestId: request.id,
        tenantId: request.tenantId,
        stepId,
        actorUserId: params.actorUserId,
        reason: params.reason || params.comment,
        status: request.status,
      });
    }

    if (
      (request.status === 'APPROVED' || request.status === 'REJECTED') &&
      this.completionCallback
    ) {
      await this.completionCallback(request);
    }

    return request;
  }

  public async delegate(params: DelegateApprovalParams): Promise<ApprovalRequest> {
    const request = await this.getExisting(params.id, params.tenantId);
    const stepId = params.stepId || request.currentStep?.id;
    if (!stepId) {
      throw new Error(`No active step found for ApprovalRequest '${params.id}'`);
    }

    request.delegate(stepId, params.actorUserId, params.targetUserId, params.comment);
    await this.repo.save(request);

    if (this.auditLogger) {
      await this.auditLogger('approval.delegated', {
        approvalRequestId: request.id,
        tenantId: request.tenantId,
        stepId,
        actorUserId: params.actorUserId,
        targetUserId: params.targetUserId,
      });
    }

    return request;
  }

  public async requestMoreInfo(params: RequestMoreInfoParams): Promise<ApprovalRequest> {
    const request = await this.getExisting(params.id, params.tenantId);
    const stepId = params.stepId || request.currentStep?.id;
    if (!stepId) {
      throw new Error(`No active step found for ApprovalRequest '${params.id}'`);
    }

    request.requestMoreInfo(stepId, params.actorUserId, params.question, params.targetUserId);
    await this.repo.save(request);

    if (this.auditLogger) {
      await this.auditLogger('approval.more_info_requested', {
        approvalRequestId: request.id,
        tenantId: request.tenantId,
        stepId,
        actorUserId: params.actorUserId,
        question: params.question,
      });
    }

    return request;
  }

  public async resume(params: ResumeApprovalParams): Promise<ApprovalRequest> {
    const request = await this.getExisting(params.id, params.tenantId);
    request.resume(params.actorUserId, params.comment, params.responseData);
    await this.repo.save(request);

    if (this.auditLogger) {
      await this.auditLogger('approval.resumed', {
        approvalRequestId: request.id,
        tenantId: request.tenantId,
        actorUserId: params.actorUserId,
        status: request.status,
      });
    }

    return request;
  }

  public async cancel(params: CancelApprovalParams): Promise<ApprovalRequest> {
    const request = await this.getExisting(params.id, params.tenantId);
    request.cancel(params.actorUserId, params.reason);
    await this.repo.save(request);

    if (this.auditLogger) {
      await this.auditLogger('approval.cancelled', {
        approvalRequestId: request.id,
        tenantId: request.tenantId,
        actorUserId: params.actorUserId,
        reason: params.reason,
      });
    }

    return request;
  }

  public async timeout(params: TimeoutApprovalParams): Promise<ApprovalRequest> {
    const request = await this.getExisting(params.id, params.tenantId);
    request.timeout(params.reason);
    await this.repo.save(request);

    if (this.auditLogger) {
      await this.auditLogger('approval.timed_out', {
        approvalRequestId: request.id,
        tenantId: request.tenantId,
        reason: params.reason,
      });
    }

    return request;
  }

  public async checkEscalations(tenantId: string): Promise<number> {
    const requests = await this.repo.findByTenantId(tenantId);
    let escalatedCount = 0;
    const now = Date.now();

    for (const req of requests) {
      if (req.status !== 'IN_PROGRESS' && req.status !== 'DELEGATED') continue;

      const currentStep = req.currentStep;
      if (currentStep && currentStep.dueAt && currentStep.dueAt.getTime() < now) {
        if (currentStep.escalationTargetUserId) {
          req.delegate(
            currentStep.id,
            'system',
            currentStep.escalationTargetUserId,
            'Automated escalation: step SLA exceeded'
          );
          await this.repo.save(req);
          escalatedCount++;

          if (this.auditLogger) {
            await this.auditLogger('approval.escalated', {
              approvalRequestId: req.id,
              tenantId: req.tenantId,
              stepId: currentStep.id,
              targetUserId: currentStep.escalationTargetUserId,
            });
          }
        }
      }
    }

    return escalatedCount;
  }

  public async getApprovalRequest(
    id: string,
    tenantId: string
  ): Promise<ApprovalRequest | null> {
    return this.repo.findById(id, tenantId);
  }

  public async listApprovalRequests(
    tenantId: string,
    filter?: ApprovalRequestFilter
  ): Promise<ApprovalRequest[]> {
    return this.repo.findByTenantId(tenantId, filter);
  }

  private async getExisting(id: string, tenantId: string): Promise<ApprovalRequest> {
    const request = await this.repo.findById(id, tenantId);
    if (!request) {
      throw new Error(`ApprovalRequest '${id}' not found for tenant '${tenantId}'`);
    }
    return request;
  }
}
