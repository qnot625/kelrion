import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  WorkflowDefinition,
  WorkflowInstance,
  InMemoryWorkflowDefinitionRepository,
  InMemoryWorkflowInstanceRepository,
  WorkflowExecutionService,
  DefaultConditionEvaluator,
  WorkflowStep,
  InMemoryHumanTaskRepository,
  HumanTaskService,
  InMemoryWorkflowExecutionHistoryRepository,
  WorkflowExecutionHistoryService,
} from '../index.js';

describe('WF-002 & WF-003: WorkflowDefinition Aggregate & Value Objects', () => {
  const startStep: WorkflowStep = {
    id: 'step_start',
    name: 'Start Step',
    type: 'START',
    transitions: [{ targetStepId: 'step_manual' }],
  };

  const manualStep: WorkflowStep = {
    id: 'step_manual',
    name: 'Manual Task',
    type: 'MANUAL_TASK',
    transitions: [{ targetStepId: 'step_end' }],
  };

  const endStep: WorkflowStep = {
    id: 'step_end',
    name: 'End Step',
    type: 'END',
    transitions: [],
  };

  test('creates a valid WorkflowDefinition aggregate in DRAFT status', () => {
    const wf = WorkflowDefinition.create({
      id: 'wf_001',
      tenantId: 'tenant_alpha',
      name: 'Onboarding Workflow',
      description: 'Employee onboarding process',
      steps: [startStep, manualStep, endStep],
    });

    assert.equal(wf.id, 'wf_001');
    assert.equal(wf.tenantId, 'tenant_alpha');
    assert.equal(wf.name, 'Onboarding Workflow');
    assert.equal(wf.version, 1);
    assert.equal(wf.status, 'DRAFT');
    assert.equal(wf.startStepId, 'step_start');
    assert.equal(wf.steps.length, 3);
  });

  test('throws error if required fields are missing', () => {
    assert.throws(
      () => new WorkflowDefinition({ id: '', tenantId: 't1', name: 'Name' }),
      /WorkflowDefinition ID is required/
    );
    assert.throws(
      () => new WorkflowDefinition({ id: 'w1', tenantId: '', name: 'Name' }),
      /Tenant ID is required/
    );
    assert.throws(
      () => new WorkflowDefinition({ id: 'w1', tenantId: 't1', name: '  ' }),
      /Workflow name is required/
    );
  });

  test('rejects duplicate step IDs upon creation or addition', () => {
    const dupStep: WorkflowStep = {
      id: 'step_start',
      name: 'Duplicate Step',
      type: 'MANUAL_TASK',
      transitions: [],
    };

    assert.throws(
      () =>
        new WorkflowDefinition({
          id: 'wf_dup',
          tenantId: 'tenant_alpha',
          name: 'Duplicate Test',
          steps: [startStep, dupStep],
        }),
      /Duplicate step ID: step_start/
    );

    const wf = WorkflowDefinition.create({
      id: 'wf_add_dup',
      tenantId: 'tenant_alpha',
      name: 'Add Duplicate',
      steps: [startStep],
    });

    assert.throws(
      () => wf.addStep(dupStep),
      /Duplicate step ID: step_start/
    );
  });

  test('validates graph structure before publishing', () => {
    // 1. Missing start step
    const noStartWf = WorkflowDefinition.create({
      id: 'wf_no_start',
      tenantId: 'tenant_alpha',
      name: 'No Start',
      steps: [manualStep, endStep],
    });
    assert.throws(
      () => noStartWf.publish(),
      /Invalid or missing start step ID/
    );

    // 2. Missing END step
    const noEndWf = WorkflowDefinition.create({
      id: 'wf_no_end',
      tenantId: 'tenant_alpha',
      name: 'No End',
      steps: [
        startStep,
        {
          id: 'step_manual',
          name: 'Manual',
          type: 'MANUAL_TASK',
          transitions: [{ targetStepId: 'step_start' }],
        },
      ],
    });
    assert.throws(
      () => noEndWf.publish(),
      /must contain at least one END step/
    );

    // 3. Transition to non-existent target step
    const badTargetWf = WorkflowDefinition.create({
      id: 'wf_bad_target',
      tenantId: 'tenant_alpha',
      name: 'Bad Target',
      steps: [
        {
          id: 'step_start',
          name: 'Start',
          type: 'START',
          transitions: [{ targetStepId: 'non_existent' }],
        },
        endStep,
      ],
    });
    assert.throws(
      () => badTargetWf.publish(),
      /references non-existent target step 'non_existent'/
    );

    // 4. END step with outgoing transitions
    const badEndWf = WorkflowDefinition.create({
      id: 'wf_bad_end',
      tenantId: 'tenant_alpha',
      name: 'Bad End',
      steps: [
        {
          id: 'step_start',
          name: 'Start',
          type: 'START',
          transitions: [{ targetStepId: 'step_end' }],
        },
        {
          id: 'step_end',
          name: 'End',
          type: 'END',
          transitions: [{ targetStepId: 'step_start' }],
        },
      ],
    });
    assert.throws(
      () => badEndWf.publish(),
      /END step 'step_end' cannot have outgoing transitions/
    );

    // 5. Unreachable END step (isolated island)
    const unreachableWf = WorkflowDefinition.create({
      id: 'wf_unreachable',
      tenantId: 'tenant_alpha',
      name: 'Unreachable',
      steps: [
        {
          id: 'step_start',
          name: 'Start',
          type: 'START',
          transitions: [{ targetStepId: 'step_loop' }],
        },
        {
          id: 'step_loop',
          name: 'Loop Step',
          type: 'AUTOMATIC_TASK',
          transitions: [{ targetStepId: 'step_loop' }],
        },
        endStep,
      ],
    });
    assert.throws(
      () => unreachableWf.publish(),
      /Start step 'step_start' cannot reach any END step/
    );
  });

  test('handles lifecycle: publish, archive, draft updates, and versioning', () => {
    const wf = WorkflowDefinition.create({
      id: 'wf_lifecycle',
      tenantId: 'tenant_alpha',
      name: 'Lifecycle App',
      steps: [startStep, manualStep, endStep],
    });

    assert.equal(wf.status, 'DRAFT');
    wf.publish();
    assert.equal(wf.status, 'PUBLISHED');
    assert.notEqual(wf.publishedAt, undefined);

    // Cannot modify non-draft definition
    assert.throws(
      () => wf.addStep({ id: 's2', name: 'S2', type: 'AUTOMATIC_TASK', transitions: [] }),
      /Cannot add steps to a non-draft workflow definition/
    );
    assert.throws(
      () => wf.updateDraft({ name: 'New Name' }),
      /Cannot edit non-draft workflow definition/
    );

    // Bumps version when creating new draft version
    const v2Draft = wf.createNewVersion();
    assert.equal(v2Draft.version, 2);
    assert.equal(v2Draft.status, 'DRAFT');
    assert.equal(v2Draft.id, wf.id);

    // Can archive original
    wf.archive();
    assert.equal(wf.status, 'ARCHIVED');
    assert.notEqual(wf.archivedAt, undefined);

    assert.throws(() => wf.publish(), /Cannot publish an archived workflow definition/);
    assert.throws(() => wf.archive(), /Workflow definition is already archived/);
  });
});

describe('WF-004: WorkflowDefinition Repository & Tenant Isolation', () => {
  const startStep: WorkflowStep = {
    id: 'step_start',
    name: 'Start',
    type: 'START',
    transitions: [{ targetStepId: 'step_end' }],
  };
  const endStep: WorkflowStep = {
    id: 'step_end',
    name: 'End',
    type: 'END',
    transitions: [],
  };

  test('performs CRUD operations and enforces tenant isolation', async () => {
    const repo = new InMemoryWorkflowDefinitionRepository();

    const wfTenantA = WorkflowDefinition.create({
      id: 'wf_shared_id',
      tenantId: 'tenant_A',
      name: 'Tenant A Workflow',
      steps: [startStep, endStep],
    });

    const wfTenantB = WorkflowDefinition.create({
      id: 'wf_shared_id',
      tenantId: 'tenant_B',
      name: 'Tenant B Workflow',
      steps: [startStep, endStep],
    });

    await repo.save(wfTenantA);
    await repo.save(wfTenantB);

    // Find by ID and tenant
    const foundA = await repo.findById('wf_shared_id', 'tenant_A');
    assert.notEqual(foundA, null);
    assert.equal(foundA?.name, 'Tenant A Workflow');

    const foundB = await repo.findById('wf_shared_id', 'tenant_B');
    assert.notEqual(foundB, null);
    assert.equal(foundB?.name, 'Tenant B Workflow');

    // Tenant A cannot query non-existent ID for tenant A
    const crossQuery = await repo.findById('non_existent', 'tenant_A');
    assert.equal(crossQuery, null);

    // List by tenant
    const listA = await repo.list('tenant_A');
    assert.equal(listA.length, 1);
    assert.equal(listA[0].name, 'Tenant A Workflow');

    // Filter by search query
    const searchMatch = await repo.list('tenant_A', { search: 'Workflow' });
    assert.equal(searchMatch.length, 1);

    const searchNoMatch = await repo.list('tenant_A', { search: 'NonExistent' });
    assert.equal(searchNoMatch.length, 0);

    // Delete
    const deleted = await repo.delete('wf_shared_id', 'tenant_A');
    assert.equal(deleted, true);

    const postDeleteA = await repo.findById('wf_shared_id', 'tenant_A');
    assert.equal(postDeleteA, null);

    // Tenant B definition is unaffected by deletion of Tenant A definition
    const postDeleteB = await repo.findById('wf_shared_id', 'tenant_B');
    assert.notEqual(postDeleteB, null);
  });

  test('supports version-specific lookup in repository', async () => {
    const repo = new InMemoryWorkflowDefinitionRepository();

    const v1 = WorkflowDefinition.create({
      id: 'wf_versioned',
      tenantId: 'tenant_A',
      name: 'Versioned Workflow V1',
      steps: [startStep, endStep],
    });
    v1.publish();
    await repo.save(v1);

    const v2 = v1.createNewVersion();
    v2.updateDraft({ name: 'Versioned Workflow V2' });
    await repo.save(v2);

    const latest = await repo.findById('wf_versioned', 'tenant_A');
    assert.equal(latest?.version, 2);
    assert.equal(latest?.name, 'Versioned Workflow V2');

    const retrievedV1 = await repo.findByIdAndVersion('wf_versioned', 1, 'tenant_A');
    assert.equal(retrievedV1?.version, 1);
    assert.equal(retrievedV1?.name, 'Versioned Workflow V1');
  });
});

describe('WF-005 & WF-006: WorkflowInstance Aggregate & State Machine', () => {
  const startStep: WorkflowStep = {
    id: 's_start',
    name: 'Start',
    type: 'START',
    transitions: [{ targetStepId: 's_manual' }],
  };
  const manualStep: WorkflowStep = {
    id: 's_manual',
    name: 'Manual Task',
    type: 'MANUAL_TASK',
    transitions: [{ targetStepId: 's_end' }],
  };
  const endStep: WorkflowStep = {
    id: 's_end',
    name: 'End',
    type: 'END',
    transitions: [],
  };

  const publishedDef = WorkflowDefinition.create({
    id: 'def_100',
    tenantId: 'tenant_X',
    name: 'Published Def',
    steps: [startStep, manualStep, endStep],
  });
  publishedDef.publish();

  test('verifies legal state machine transitions', () => {
    const inst = WorkflowInstance.create({
      id: 'inst_001',
      tenantId: 'tenant_X',
      workflowDefinitionId: 'def_100',
      workflowVersion: 1,
      startedBy: 'user_1',
    });

    assert.equal(inst.status, 'NOT_STARTED');

    // NOT_STARTED -> RUNNING
    inst.start(publishedDef, 'user_1');
    assert.equal(inst.status, 'RUNNING');
    assert.equal(inst.currentStepId, 's_start');

    // RUNNING -> WAITING
    inst.pauseWaiting('Awaiting approval');
    assert.equal(inst.status, 'WAITING');

    // WAITING -> RUNNING
    inst.resumeRunning();
    assert.equal(inst.status, 'RUNNING');

    // RUNNING -> COMPLETED (via transition to END step)
    inst.transitionToStep('s_end', publishedDef, 'user_1');
    assert.equal(inst.status, 'COMPLETED');
    assert.equal(inst.currentStepId, null);
  });

  test('verifies cancellation and failure state transitions', () => {
    // RUNNING -> CANCELLED
    const instCancel = WorkflowInstance.create({
      id: 'inst_cancel',
      tenantId: 'tenant_X',
      workflowDefinitionId: 'def_100',
      workflowVersion: 1,
      startedBy: 'user_1',
    });
    instCancel.start(publishedDef, 'user_1');
    instCancel.cancel('user_1', 'No longer needed');
    assert.equal(instCancel.status, 'CANCELLED');

    // WAITING -> FAILED
    const instFail = WorkflowInstance.create({
      id: 'inst_fail',
      tenantId: 'tenant_X',
      workflowDefinitionId: 'def_100',
      workflowVersion: 1,
      startedBy: 'user_1',
    });
    instFail.start(publishedDef, 'user_1');
    instFail.pauseWaiting('Waiting');
    instFail.fail('Timeout exceeded');
    assert.equal(instFail.status, 'FAILED');
    assert.equal(instFail.failureReason, 'Timeout exceeded');
  });

  test('rejects illegal state machine transitions', () => {
    // 1. Cannot start an already started instance
    const inst = WorkflowInstance.create({
      id: 'inst_illegal',
      tenantId: 'tenant_X',
      workflowDefinitionId: 'def_100',
      workflowVersion: 1,
      startedBy: 'user_1',
    });
    inst.start(publishedDef, 'user_1');

    assert.throws(
      () => inst.start(publishedDef, 'user_1'),
      /Cannot start workflow instance in state 'RUNNING'/
    );

    // 2. Complete terminal state cannot transition to any other state
    inst.cancel('user_1', 'Cancelled');
    assert.equal(inst.status, 'CANCELLED');

    assert.throws(
      () => inst.start(publishedDef, 'user_1'),
      /Cannot start workflow instance in state 'CANCELLED'/
    );
    assert.throws(
      () => inst.pauseWaiting(),
      /Cannot transition to WAITING state from 'CANCELLED'/
    );
    assert.throws(
      () => inst.resumeRunning(),
      /Cannot resume workflow instance from state 'CANCELLED'/
    );
    assert.throws(
      () => inst.transitionToStep('s_end', publishedDef),
      /Cannot transition step when workflow status is 'CANCELLED'/
    );
    assert.throws(
      () => inst.cancel('user_1'),
      /Cannot cancel workflow instance in state 'CANCELLED'/
    );
    assert.throws(
      () => inst.fail('Reason'),
      /Cannot fail workflow instance in state 'CANCELLED'/
    );
  });
});

describe('WF-007: WorkflowExecutionService & Condition Evaluation', () => {
  const evaluator = new DefaultConditionEvaluator();

  test('evaluates condition rules correctly across operators', () => {
    const vars = {
      amount: 5000,
      department: 'Engineering',
      tags: ['urgent', 'vip'],
      notes: 'Contains special code',
      optionalField: 'Active',
    };

    assert.equal(evaluator.evaluate({ field: 'amount', operator: 'EQUALS', value: 5000 }, vars), true);
    assert.equal(evaluator.evaluate({ field: 'amount', operator: 'NOT_EQUALS', value: 1000 }, vars), true);
    assert.equal(evaluator.evaluate({ field: 'amount', operator: 'GREATER_THAN', value: 1000 }, vars), true);
    assert.equal(evaluator.evaluate({ field: 'amount', operator: 'LESS_THAN', value: 10000 }, vars), true);
    assert.equal(evaluator.evaluate({ field: 'department', operator: 'CONTAINS', value: 'Engine' }, vars), true);
    assert.equal(evaluator.evaluate({ field: 'tags', operator: 'CONTAINS', value: 'urgent' }, vars), true);
    assert.equal(evaluator.evaluate({ field: 'department', operator: 'IN', value: ['Engineering', 'HR'] }, vars), true);
    assert.equal(evaluator.evaluate({ field: 'optionalField', operator: 'IS_SET' }, vars), true);
    assert.equal(evaluator.evaluate({ field: 'missingField', operator: 'IS_NOT_SET' }, vars), true);
    assert.equal(evaluator.evaluate({ field: 'any', operator: 'ALWAYS' }, vars), true);
  });

  test('executes workflow automatically through automatic steps to WAITING manual step', async () => {
    const defRepo = new InMemoryWorkflowDefinitionRepository();
    const instRepo = new InMemoryWorkflowInstanceRepository();

    const auditLogs: Array<{ action: string; payload: Record<string, any> }> = [];
    const auditLogger = async (action: string, payload: Record<string, any>) => {
      auditLogs.push({ action, payload });
    };

    const service = new WorkflowExecutionService(defRepo, instRepo, evaluator, auditLogger);

    const startNode: WorkflowStep = {
      id: 'step_start',
      name: 'Start',
      type: 'START',
      transitions: [{ targetStepId: 'step_auto_check' }],
    };

    const autoNode: WorkflowStep = {
      id: 'step_auto_check',
      name: 'Check Budget',
      type: 'AUTOMATIC_TASK',
      transitions: [
        {
          targetStepId: 'step_high_approval',
          condition: { field: 'amount', operator: 'GREATER_THAN', value: 1000 },
        },
        {
          targetStepId: 'step_low_approval',
          isDefault: true,
        },
      ],
    };

    const highApprovalNode: WorkflowStep = {
      id: 'step_high_approval',
      name: 'VP Approval Required',
      type: 'APPROVAL_TASK',
      transitions: [{ targetStepId: 'step_end' }],
    };

    const lowApprovalNode: WorkflowStep = {
      id: 'step_low_approval',
      name: 'Manager Approval Required',
      type: 'APPROVAL_TASK',
      transitions: [{ targetStepId: 'step_end' }],
    };

    const endNode: WorkflowStep = {
      id: 'step_end',
      name: 'End Workflow',
      type: 'END',
      transitions: [],
    };

    const def = WorkflowDefinition.create({
      id: 'budget_wf',
      tenantId: 'tenant_hq',
      name: 'Budget Approval Workflow',
      steps: [startNode, autoNode, highApprovalNode, lowApprovalNode, endNode],
    });
    def.publish();
    await defRepo.save(def);

    // Start workflow with amount = 5000 -> Should auto-advance to step_high_approval and pause in WAITING status
    const instance = await service.startWorkflow({
      definitionId: 'budget_wf',
      tenantId: 'tenant_hq',
      startedBy: 'employee_101',
      variables: { amount: 5000, reason: 'New laptops' },
    });

    assert.equal(instance.status, 'WAITING');
    assert.equal(instance.currentStepId, 'step_high_approval');
    assert.equal(instance.completedStepIds.includes('step_start'), true);
    assert.equal(instance.completedStepIds.includes('step_auto_check'), true);

    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].action, 'workflow.started');

    // Advance approval step -> Transitions to step_end and completes workflow
    const advancedInstance = await service.advanceWorkflow({
      instanceId: instance.id,
      tenantId: 'tenant_hq',
      executedBy: 'vp_user',
      stepOutput: { approved: true, comment: 'Approved for Q3' },
    });

    assert.equal(advancedInstance.status, 'COMPLETED');
    assert.equal(advancedInstance.variables.approved, true);
    assert.equal(advancedInstance.variables.comment, 'Approved for Q3');
    assert.notEqual(advancedInstance.completedAt, undefined);

    assert.equal(auditLogs.length, 2);
    assert.equal(auditLogs[1].action, 'workflow.advanced');
  });

  test('cancels a running workflow instance', async () => {
    const defRepo = new InMemoryWorkflowDefinitionRepository();
    const instRepo = new InMemoryWorkflowInstanceRepository();
    const service = new WorkflowExecutionService(defRepo, instRepo);

    const startNode: WorkflowStep = {
      id: 'step_start',
      name: 'Start',
      type: 'START',
      transitions: [{ targetStepId: 'step_manual' }],
    };
    const manualNode: WorkflowStep = {
      id: 'step_manual',
      name: 'Manual Task',
      type: 'MANUAL_TASK',
      transitions: [{ targetStepId: 'step_end' }],
    };
    const endNode: WorkflowStep = {
      id: 'step_end',
      name: 'End',
      type: 'END',
      transitions: [],
    };

    const def = WorkflowDefinition.create({
      id: 'cancel_wf',
      tenantId: 'tenant_hq',
      name: 'Cancel Test WF',
      steps: [startNode, manualNode, endNode],
    });
    def.publish();
    await defRepo.save(def);

    const instance = await service.startWorkflow({
      definitionId: 'cancel_wf',
      tenantId: 'tenant_hq',
      startedBy: 'user_1',
    });

    assert.equal(instance.status, 'WAITING');

    const cancelledInst = await service.cancelWorkflow({
      instanceId: instance.id,
      tenantId: 'tenant_hq',
      cancelledBy: 'admin_user',
      reason: 'Request withdrawn by employee',
    });

    assert.equal(cancelledInst.status, 'CANCELLED');
    assert.equal(cancelledInst.failureReason, 'Request withdrawn by employee');
  });

  test('fails workflow if no matching transition rule is found', async () => {
    const defRepo = new InMemoryWorkflowDefinitionRepository();
    const instRepo = new InMemoryWorkflowInstanceRepository();
    const service = new WorkflowExecutionService(defRepo, instRepo);

    const startNode: WorkflowStep = {
      id: 'step_start',
      name: 'Start',
      type: 'START',
      transitions: [{ targetStepId: 'step_auto' }],
    };
    const autoNode: WorkflowStep = {
      id: 'step_auto',
      name: 'Conditional Auto',
      type: 'AUTOMATIC_TASK',
      transitions: [
        {
          targetStepId: 'step_end',
          condition: { field: 'code', operator: 'EQUALS', value: 'MATCH' },
        },
      ],
    };
    const endNode: WorkflowStep = {
      id: 'step_end',
      name: 'End',
      type: 'END',
      transitions: [],
    };

    const def = WorkflowDefinition.create({
      id: 'fail_wf',
      tenantId: 'tenant_hq',
      name: 'Fail Test WF',
      steps: [startNode, autoNode, endNode],
    });
    def.publish();
    await defRepo.save(def);

    // Start workflow without 'code' variable set -> auto step condition fails with no default transition
    const instance = await service.startWorkflow({
      definitionId: 'fail_wf',
      tenantId: 'tenant_hq',
      startedBy: 'user_1',
      variables: { code: 'NO_MATCH' },
    });

    assert.equal(instance.status, 'FAILED');
    assert.equal(instance.failureReason?.includes('No matching transition'), true);
  });
});

describe('WF-008: Cross-Tenant Isolation Security Suite', () => {
  test('ensures Tenant A cannot start, retrieve, or advance Tenant B workflows or instances', async () => {
    const defRepo = new InMemoryWorkflowDefinitionRepository();
    const instRepo = new InMemoryWorkflowInstanceRepository();
    const service = new WorkflowExecutionService(defRepo, instRepo);

    const startNode: WorkflowStep = {
      id: 's_start',
      name: 'Start',
      type: 'START',
      transitions: [{ targetStepId: 's_manual' }],
    };
    const manualNode: WorkflowStep = {
      id: 's_manual',
      name: 'Manual',
      type: 'MANUAL_TASK',
      transitions: [{ targetStepId: 's_end' }],
    };
    const endNode: WorkflowStep = {
      id: 's_end',
      name: 'End',
      type: 'END',
      transitions: [],
    };

    const defB = WorkflowDefinition.create({
      id: 'wf_tenant_b_only',
      tenantId: 'Tenant_B',
      name: 'Secret Tenant B Workflow',
      steps: [startNode, manualNode, endNode],
    });
    defB.publish();
    await defRepo.save(defB);

    // Tenant A attempts to start Tenant B's workflow definition
    await assert.rejects(
      async () =>
        service.startWorkflow({
          definitionId: 'wf_tenant_b_only',
          tenantId: 'Tenant_A',
          startedBy: 'attacker_user',
        }),
      /Workflow definition 'wf_tenant_b_only' not found for tenant 'Tenant_A'/
    );

    // Tenant B starts workflow instance legally
    const instB = await service.startWorkflow({
      definitionId: 'wf_tenant_b_only',
      tenantId: 'Tenant_B',
      startedBy: 'user_b',
    });

    // Tenant A attempts to access Tenant B's workflow instance
    await assert.rejects(
      async () => service.getWorkflowInstance(instB.id, 'Tenant_A'),
      /Workflow instance '.*' not found for tenant 'Tenant_A'/
    );

    // Tenant A attempts to advance Tenant B's workflow instance
    await assert.rejects(
      async () =>
        service.advanceWorkflow({
          instanceId: instB.id,
          tenantId: 'Tenant_A',
          executedBy: 'attacker_user',
        }),
      /Workflow instance '.*' not found for tenant 'Tenant_A'/
    );

    // Tenant A attempts to cancel Tenant B's workflow instance
    await assert.rejects(
      async () =>
        service.cancelWorkflow({
          instanceId: instB.id,
          tenantId: 'Tenant_A',
          cancelledBy: 'attacker_user',
        }),
      /Workflow instance '.*' not found for tenant 'Tenant_A'/
    );
  });
});

describe('WF-009: Human Task Assignment, Delegation & Escalation Service', () => {
  test('manages complete human task lifecycle: create, assign, claim, release, delegate, start, complete', async () => {
    const taskRepo = new InMemoryHumanTaskRepository();
    const historyRepo = new InMemoryWorkflowExecutionHistoryRepository();
    const auditLogs: Array<{ action: string; payload: Record<string, any> }> = [];

    const taskService = new HumanTaskService(
      taskRepo,
      historyRepo,
      async (action, payload) => {
        auditLogs.push({ action, payload });
      }
    );

    // 1. Create task
    const task = await taskService.createTask({
      tenantId: 'tenant_1',
      workflowInstanceId: 'inst_100',
      stepId: 'step_review',
      name: 'Review Application',
      candidateUsers: ['user_reviewer_1', 'user_reviewer_2'],
      priority: 'HIGH',
      actorId: 'system',
    });

    assert.equal(task.status, 'PENDING');
    assert.equal(task.priority, 'HIGH');

    // 2. Claim task
    const claimedTask = await taskService.claimTask(
      task.id,
      'tenant_1',
      'user_reviewer_1'
    );
    assert.equal(claimedTask.status, 'CLAIMED');
    assert.equal(claimedTask.assigneeId, 'user_reviewer_1');

    // 3. Release task back to PENDING pool
    const releasedTask = await taskService.releaseTask(
      task.id,
      'tenant_1',
      'user_reviewer_1'
    );
    assert.equal(releasedTask.status, 'PENDING');
    assert.equal(releasedTask.assigneeId, undefined);

    // 4. Assign directly
    const assignedTask = await taskService.assignTask(
      task.id,
      'tenant_1',
      'user_reviewer_2',
      'manager_1'
    );
    assert.equal(assignedTask.status, 'ASSIGNED');
    assert.equal(assignedTask.assigneeId, 'user_reviewer_2');

    // 5. Delegate task
    const delegatedTask = await taskService.delegateTask(
      task.id,
      'tenant_1',
      'user_reviewer_2',
      'user_delegate_3',
      'Out on leave'
    );
    assert.equal(delegatedTask.status, 'ASSIGNED');
    assert.equal(delegatedTask.assigneeId, 'user_delegate_3');
    assert.equal(delegatedTask.originalAssigneeId, 'user_reviewer_1');
    assert.equal(delegatedTask.delegationHistory.length, 1);
    assert.equal(delegatedTask.delegationHistory[0].fromUserId, 'user_reviewer_2');
    assert.equal(delegatedTask.delegationHistory[0].toUserId, 'user_delegate_3');

    // 6. Start task
    const startedTask = await taskService.startTask(
      task.id,
      'tenant_1',
      'user_delegate_3'
    );
    assert.equal(startedTask.status, 'IN_PROGRESS');

    // 7. Complete task
    const completedTask = await taskService.completeTask(
      task.id,
      'tenant_1',
      'user_delegate_3',
      { approved: true, notes: 'Looks good' }
    );
    assert.equal(completedTask.status, 'COMPLETED');
    assert.equal(completedTask.formData?.approved, true);

    // 8. Rejects operations on completed task
    await assert.rejects(
      async () => taskService.startTask(task.id, 'tenant_1', 'user_delegate_3'),
      /Cannot perform operation on task in 'COMPLETED' state/
    );

    // 9. Verify audit logs were captured
    assert.equal(auditLogs.length > 5, true);
  });

  test('handles task cancellation and expiration', async () => {
    const taskRepo = new InMemoryHumanTaskRepository();
    const taskService = new HumanTaskService(taskRepo);

    // Cancel task
    const task1 = await taskService.createTask({
      tenantId: 'tenant_1',
      workflowInstanceId: 'inst_101',
      stepId: 'step_1',
      name: 'Task 1',
      actorId: 'user_1',
    });
    const cancelled = await taskService.cancelTask(
      task1.id,
      'tenant_1',
      'admin_1',
      'No longer relevant'
    );
    assert.equal(cancelled.status, 'CANCELLED');

    // Expire task
    const task2 = await taskService.createTask({
      tenantId: 'tenant_1',
      workflowInstanceId: 'inst_102',
      stepId: 'step_2',
      name: 'Task 2',
      actorId: 'user_1',
    });
    const expired = await taskService.expireTask(
      task2.id,
      'tenant_1',
      'SLA breached'
    );
    assert.equal(expired.status, 'EXPIRED');
  });

  test('evaluates escalation rules for overdue or SLA exceeded tasks', async () => {
    const taskRepo = new InMemoryHumanTaskRepository();
    const taskService = new HumanTaskService(taskRepo);

    const pastDate = new Date(Date.now() - 3600000); // 1 hour ago
    const overdueTask = await taskService.createTask({
      tenantId: 'tenant_1',
      workflowInstanceId: 'inst_103',
      stepId: 'step_approval',
      name: 'Escalation Test Task',
      assigneeId: 'junior_user',
      dueDate: pastDate,
      actorId: 'system',
    });

    const escalatedList = await taskService.checkAndProcessEscalations('tenant_1', [
      {
        id: 'rule_1',
        trigger: 'DUE_DATE_PASSED',
        action: 'REASSIGN',
        targetUserId: 'senior_user',
      },
    ]);

    assert.equal(escalatedList.length, 1);
    assert.equal(escalatedList[0].id, overdueTask.id);
    assert.equal(escalatedList[0].escalationCount, 1);
    assert.equal(escalatedList[0].assigneeId, 'senior_user');
  });
});

describe('WF-010: Workflow Execution History & Audit Integration', () => {
  test('logs execution history records and exposes history query API', async () => {
    const historyRepo = new InMemoryWorkflowExecutionHistoryRepository();
    const auditLogs: Array<{ action: string; payload: Record<string, any> }> = [];

    const historyService = new WorkflowExecutionHistoryService(
      historyRepo,
      async (action, payload) => {
        auditLogs.push({ action, payload });
      }
    );

    await historyService.logEvent({
      tenantId: 'tenant_audit',
      workflowInstanceId: 'inst_500',
      workflowDefinitionId: 'def_500',
      stepId: 'step_start',
      eventType: 'WORKFLOW_STARTED',
      actorId: 'user_starter',
    });

    await historyService.logEvent({
      tenantId: 'tenant_audit',
      workflowInstanceId: 'inst_500',
      workflowDefinitionId: 'def_500',
      stepId: 'step_approval',
      taskId: 'task_999',
      eventType: 'TASK_CREATED',
      actorId: 'system',
    });

    const history = await historyService.getHistoryForInstance(
      'inst_500',
      'tenant_audit'
    );

    assert.equal(history.length, 2);
    assert.equal(history[0].eventType, 'WORKFLOW_STARTED');
    assert.equal(history[1].eventType, 'TASK_CREATED');

    assert.equal(auditLogs.length, 2);
    assert.equal(auditLogs[0].action, 'workflow.history.workflow_started');
  });

  test('enforces cross-tenant isolation on HumanTasks and Execution History', async () => {
    const taskRepo = new InMemoryHumanTaskRepository();
    const historyRepo = new InMemoryWorkflowExecutionHistoryRepository();
    const taskService = new HumanTaskService(taskRepo, historyRepo);
    const historyService = new WorkflowExecutionHistoryService(historyRepo);

    const taskB = await taskService.createTask({
      tenantId: 'Tenant_B',
      workflowInstanceId: 'inst_B',
      stepId: 'step_B',
      name: 'Tenant B Task',
      actorId: 'user_B',
    });

    // Tenant A attempts to get Tenant B's task
    await assert.rejects(
      async () => taskService.getTask(taskB.id, 'Tenant_A'),
      /HumanTask '.*' not found for tenant 'Tenant_A'/
    );

    // Tenant A lists tasks - receives empty list
    const tasksA = await taskService.listTasks('Tenant_A');
    assert.equal(tasksA.length, 0);

    // Tenant A attempts to get history of Tenant B instance
    const historyA = await historyService.getHistoryForInstance(
      'inst_B',
      'Tenant_A'
    );
    assert.equal(historyA.length, 0);
  });
});
