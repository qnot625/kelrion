import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ApprovalRequest } from '../approval-request.js';
import { InMemoryApprovalRequestRepository } from '../in-memory-approval-request-repository.js';
import { ApprovalService } from '../approval-service.js';
import { WorkflowApprovalAdapter } from '../workflow-approval-integration.js';
import {
  WorkflowDefinition,
  WorkflowExecutionService,
  InMemoryWorkflowDefinitionRepository,
  InMemoryWorkflowInstanceRepository,
} from '../../../../../platform/workflow/src/index.js';

describe('APR-001 & APR-002: ApprovalRequest Aggregate & State Machine', () => {
  it('creates a valid ApprovalRequest aggregate in PENDING/IN_PROGRESS status', () => {
    const request = ApprovalRequest.create({
      id: 'apr_1',
      tenantId: 'tenant_a',
      title: 'Expense Reimbursement',
      description: 'Travel expenses for conference',
      requesterUserId: 'user_alice',
      steps: [
        { id: 'step_1', name: 'Manager Approval', assignedUserIds: ['user_bob'] },
        { id: 'step_2', name: 'Finance Approval', assignedUserIds: ['user_charlie'] },
      ],
    });

    assert.equal(request.id, 'apr_1');
    assert.equal(request.tenantId, 'tenant_a');
    assert.equal(request.status, 'IN_PROGRESS');
    assert.equal(request.currentStepIndex, 0);
    assert.equal(request.steps.length, 2);
    assert.equal(request.steps[0].status, 'IN_PROGRESS');
    assert.equal(request.steps[1].status, 'PENDING');
  });

  it('throws error if required fields (tenantId, id, title, requesterUserId, steps) are missing', () => {
    assert.throws(
      () =>
        ApprovalRequest.create({
          id: '',
          tenantId: 'tenant_a',
          title: 'Test',
          requesterUserId: 'user_1',
          steps: [{ id: 's1', name: 'Step 1' }],
        }),
      /ApprovalRequest id is required/
    );

    assert.throws(
      () =>
        ApprovalRequest.create({
          id: 'apr_1',
          tenantId: '',
          title: 'Test',
          requesterUserId: 'user_1',
          steps: [{ id: 's1', name: 'Step 1' }],
        }),
      /ApprovalRequest tenantId is required/
    );

    assert.throws(
      () =>
        ApprovalRequest.create({
          id: 'apr_1',
          tenantId: 'tenant_a',
          title: 'Test',
          requesterUserId: 'user_1',
          steps: [],
        }),
      /must contain at least one step/
    );
  });

  it('handles multi-step approval workflow correctly', () => {
    const request = ApprovalRequest.create({
      id: 'apr_multi',
      tenantId: 'tenant_a',
      title: 'PO Approval',
      requesterUserId: 'user_alice',
      steps: [
        { id: 'step_1', name: 'Step 1', assignedUserIds: ['user_bob'] },
        { id: 'step_2', name: 'Step 2', assignedUserIds: ['user_charlie'] },
      ],
    });

    // Step 1 approval
    request.approve('step_1', 'user_bob', 'Approved step 1');
    assert.equal(request.currentStepIndex, 1);
    assert.equal(request.status, 'IN_PROGRESS');
    assert.equal(request.steps[0].status, 'APPROVED');
    assert.equal(request.steps[1].status, 'IN_PROGRESS');

    // Step 2 approval -> finishes aggregate
    request.approve('step_2', 'user_charlie', 'Final signoff');
    assert.equal(request.status, 'APPROVED');
    assert.ok(request.completedAt);
  });

  it('rejects approval request immediately on step rejection', () => {
    const request = ApprovalRequest.create({
      id: 'apr_reject',
      tenantId: 'tenant_a',
      title: 'Budget Request',
      requesterUserId: 'user_alice',
      steps: [{ id: 'step_1', name: 'Review', assignedUserIds: ['user_bob'] }],
    });

    request.reject('step_1', 'user_bob', 'Budget exceeds limit');
    assert.equal(request.status, 'REJECTED');
    assert.equal(request.steps[0].status, 'REJECTED');
    assert.ok(request.completedAt);
  });

  it('supports delegation and requesting more info with resume transition', () => {
    const request = ApprovalRequest.create({
      id: 'apr_info',
      tenantId: 'tenant_a',
      title: 'Software License',
      requesterUserId: 'user_alice',
      steps: [{ id: 'step_1', name: 'IT Review', assignedUserIds: ['user_bob'] }],
    });

    // Request more info
    request.requestMoreInfo('step_1', 'user_bob', 'Please attach quote PDF');
    assert.equal(request.status, 'MORE_INFO_REQUESTED');

    // Resume
    request.resume('user_alice', 'Attached quote PDF', { quoteRef: 'Q1234' });
    assert.equal(request.status, 'IN_PROGRESS');

    // Delegate
    request.delegate('step_1', 'user_bob', 'user_david', 'Delegating to security admin');
    assert.equal(request.status, 'DELEGATED');
    assert.ok(request.steps[0].assignedUserIds.includes('user_david'));
  });

  it('rejects illegal state transitions on terminal states', () => {
    const request = ApprovalRequest.create({
      id: 'apr_term',
      tenantId: 'tenant_a',
      title: 'Terminal Test',
      requesterUserId: 'user_alice',
      steps: [{ id: 'step_1', name: 'Step 1' }],
    });

    request.cancel('user_alice', 'No longer needed');
    assert.equal(request.status, 'CANCELLED');

    assert.throws(
      () => request.approve('step_1', 'user_bob'),
      /Cannot perform 'approve' on ApprovalRequest 'apr_term' in terminal state 'CANCELLED'/
    );
  });
});

describe('APR-003: ApprovalRequestRepository & Tenant Isolation', () => {
  it('performs CRUD operations and enforces strict tenant isolation', async () => {
    const repo = new InMemoryApprovalRequestRepository();

    const reqA = ApprovalRequest.create({
      id: 'apr_a',
      tenantId: 'tenant_1',
      title: 'Tenant 1 Approval',
      requesterUserId: 'user_1',
      steps: [{ id: 's1', name: 'S1', assignedUserIds: ['user_x'] }],
    });

    const reqB = ApprovalRequest.create({
      id: 'apr_b',
      tenantId: 'tenant_2',
      title: 'Tenant 2 Approval',
      requesterUserId: 'user_2',
      steps: [{ id: 's1', name: 'S1', assignedUserIds: ['user_x'] }],
    });

    await repo.save(reqA);
    await repo.save(reqB);

    // Tenant 1 lookup
    const foundA = await repo.findById('apr_a', 'tenant_1');
    assert.ok(foundA);
    assert.equal(foundA.title, 'Tenant 1 Approval');

    // Tenant 1 searching for Tenant 2 request should return null
    const crossLook = await repo.findById('apr_b', 'tenant_1');
    assert.equal(crossLook, null);

    // Tenant query isolation
    const listTenant1 = await repo.findByTenantId('tenant_1');
    assert.equal(listTenant1.length, 1);
    assert.equal(listTenant1[0].id, 'apr_a');

    // Assignee query with tenant isolation
    const assigneeList = await repo.findByAssignee('user_x', 'tenant_2');
    assert.equal(assigneeList.length, 1);
    assert.equal(assigneeList[0].id, 'apr_b');

    // Missing tenantId throws
    await assert.rejects(
      () => repo.findById('apr_a', ''),
      /Tenant ID is required/
    );
  });
});

describe('APR-004: ApprovalService & Audit Logging', () => {
  it('executes full approval lifecycle with audit event emission', async () => {
    const repo = new InMemoryApprovalRequestRepository();
    const auditEvents: { action: string; payload: Record<string, unknown> }[] = [];

    const service = new ApprovalService(repo, async (action, payload) => {
      auditEvents.push({ action, payload });
    });

    // 1. Create approval
    const created = await service.createApprovalRequest({
      id: 'apr_svc_1',
      tenantId: 'tenant_alpha',
      title: 'Capital Expenditure',
      requesterUserId: 'user_requester',
      steps: [
        { id: 'step_mgr', name: 'Manager Review', assignedUserIds: ['user_mgr'] },
      ],
    });

    assert.equal(created.id, 'apr_svc_1');
    assert.equal(auditEvents.length, 1);
    assert.equal(auditEvents[0].action, 'approval.created');

    // 2. Request more info
    await service.requestMoreInfo({
      id: 'apr_svc_1',
      tenantId: 'tenant_alpha',
      actorUserId: 'user_mgr',
      question: 'Provide cost breakdown',
    });
    assert.equal(auditEvents.length, 2);
    assert.equal(auditEvents[1].action, 'approval.more_info_requested');

    // 3. Resume
    await service.resume({
      id: 'apr_svc_1',
      tenantId: 'tenant_alpha',
      actorUserId: 'user_requester',
      comment: 'Breakdown provided in PDF',
    });
    assert.equal(auditEvents.length, 3);
    assert.equal(auditEvents[2].action, 'approval.resumed');

    // 4. Approve
    const finalApp = await service.approve({
      id: 'apr_svc_1',
      tenantId: 'tenant_alpha',
      actorUserId: 'user_mgr',
      comment: 'Approved expense',
    });

    assert.equal(finalApp.status, 'APPROVED');
    assert.equal(auditEvents.length, 4);
    assert.equal(auditEvents[3].action, 'approval.approved');
  });

  it('handles automated SLA escalations and timeouts', async () => {
    const repo = new InMemoryApprovalRequestRepository();
    const auditEvents: { action: string; payload: Record<string, unknown> }[] = [];

    const service = new ApprovalService(repo, async (action, payload) => {
      auditEvents.push({ action, payload });
    });

    await service.createApprovalRequest({
      id: 'apr_sla',
      tenantId: 'tenant_alpha',
      title: 'Urgent Grant Access',
      requesterUserId: 'user_alice',
      steps: [
        {
          id: 'step_1',
          name: 'Access Review',
          assignedUserIds: ['user_bob'],
          dueDurationMs: -1000, // Overdue immediately
          escalationTargetUserId: 'user_lead',
        },
      ],
    });

    const escalatedCount = await service.checkEscalations('tenant_alpha');
    assert.equal(escalatedCount, 1);

    const updated = await repo.findById('apr_sla', 'tenant_alpha');
    assert.ok(updated);
    assert.equal(updated.status, 'DELEGATED');
    assert.ok(updated.steps[0].assignedUserIds.includes('user_lead'));
  });
});

describe('APR-005: Workflow Engine Approval Integration Hook', () => {
  it('integrates Workflow Engine with Approval Engine without circular dependencies', async () => {
    const defRepo = new InMemoryWorkflowDefinitionRepository();
    const instRepo = new InMemoryWorkflowInstanceRepository();

    const workflowService = new WorkflowExecutionService(defRepo, instRepo);

    const approvalRepo = new InMemoryApprovalRequestRepository();
    const holder: { instance?: ApprovalService } = {};

    const adapter = new WorkflowApprovalAdapter(
      new Proxy({} as ApprovalService, {
        get: (_target, prop: keyof ApprovalService) => {
          const fn = holder.instance?.[prop];
          return typeof fn === 'function' ? fn.bind(holder.instance) : fn;
        },
      }),
      workflowService
    );

    holder.instance = new ApprovalService(
      approvalRepo,
      undefined,
      async (request) => {
        await adapter.onApprovalCompleted(request);
      }
    );
    const approvalService = holder.instance;

    workflowService.setApprovalTaskHandler(adapter);

    // Publish a workflow definition containing an APPROVAL_TASK step
    const def = WorkflowDefinition.create({
      id: 'wf_approval_def',
      tenantId: 'tenant_wf',
      name: 'Vacation Request Workflow',
      version: 1,
      steps: [
        { id: 'start', name: 'Start', type: 'START', transitions: [{ targetStepId: 'approve_vacation' }] },
        {
          id: 'approve_vacation',
          name: 'Approve Vacation',
          type: 'APPROVAL_TASK',
          taskConfig: { assigneeId: 'manager_1' },
          transitions: [{ targetStepId: 'end' }],
        },
        { id: 'end', name: 'End', type: 'END' },
      ],
      initialStepId: 'start',
    });
    def.publish('admin');
    await defRepo.save(def);

    // Start workflow instance
    const inst = await workflowService.startWorkflow({
      definitionId: 'wf_approval_def',
      tenantId: 'tenant_wf',
      startedBy: 'employee_1',
    });

    // Instance should be in WAITING state at step 'approve_vacation'
    assert.equal(inst.status, 'WAITING');
    assert.equal(inst.currentStepId, 'approve_vacation');

    // Verify ApprovalRequest was created by adapter
    const approvals = await approvalRepo.findByWorkflowInstanceId(inst.id, 'tenant_wf');
    assert.equal(approvals.length, 1);
    assert.equal(approvals[0].title, 'Approval Required: Approve Vacation');
    assert.equal(approvals[0].status, 'IN_PROGRESS');

    // Approve the request via ApprovalService
    await approvalService.approve({
      id: approvals[0].id,
      tenantId: 'tenant_wf',
      actorUserId: 'manager_1',
      comment: 'Enjoy your vacation!',
    });

    // Check workflow instance resumed and completed
    const updatedInst = await workflowService.getInstance(inst.id, 'tenant_wf');
    assert.ok(updatedInst);
    assert.equal(updatedInst.status, 'COMPLETED');
    assert.equal(updatedInst.variables.approvalStatus, 'APPROVED');
  });
});
