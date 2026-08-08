import assert from "node:assert/strict";
import { test } from "node:test";
import {
  InMemoryHumanTaskRepository,
  InMemoryWorkflowDefinitionRepository,
  InMemoryWorkflowInstanceRepository,
  WorkflowEngineService,
  evaluateWorkflowCondition,
  type WorkflowStep,
} from "../src/index.js";

function engine() {
  const definitions = new InMemoryWorkflowDefinitionRepository();
  const instances = new InMemoryWorkflowInstanceRepository();
  const tasks = new InMemoryHumanTaskRepository();
  return { definitions, instances, tasks, service: new WorkflowEngineService(definitions, instances, tasks) };
}

function reviewSteps(label = "Manager review"): WorkflowStep[] {
  return [
    { id: "start", name: "Start", type: "START", transitions: [{ targetStepId: "prepare" }] },
    {
      id: "prepare",
      name: "Prepare variables",
      type: "AUTOMATIC_TASK",
      automaticConfig: { operation: "SET_VARIABLES", values: { prepared: true } },
      transitions: [
        { targetStepId: "review", condition: { field: "amount", operator: "GREATER_THAN", value: 1000 } },
        { targetStepId: "end", isDefault: true },
      ],
    },
    {
      id: "review",
      name: label,
      type: "MANUAL_TASK",
      taskConfig: { candidateRoles: ["staff", "owner"], dueInMinutes: 60 },
      transitions: [{ targetStepId: "end" }],
    },
    { id: "end", name: "End", type: "END", transitions: [] },
  ];
}

test("conditions support deterministic nested and collection comparisons", () => {
  const variables = { amount: 1500, request: { region: "NG" }, tags: ["finance", "urgent"] };
  assert.equal(evaluateWorkflowCondition({ field: "amount", operator: "GREATER_THAN", value: 1000 }, variables), true);
  assert.equal(evaluateWorkflowCondition({ field: "request.region", operator: "EQUALS", value: "NG" }, variables), true);
  assert.equal(evaluateWorkflowCondition({ field: "tags", operator: "CONTAINS", value: "urgent" }, variables), true);
  assert.equal(evaluateWorkflowCondition({ field: "missing", operator: "IS_NOT_SET" }, variables), true);
});

test("workflow pauses for a human task and resumes to completion", async () => {
  const { service } = engine();
  const definition = await service.createDefinition({ tenantId: "tenant-a", name: "Expense review", steps: reviewSteps(), actorUserId: "owner-a" });
  await service.publishDefinition("tenant-a", definition.id, "owner-a");

  const instance = await service.startWorkflow({ tenantId: "tenant-a", definitionId: definition.id, actorUserId: "member-a", variables: { amount: 2000 } });
  assert.equal(instance.status, "WAITING");
  assert.equal(instance.currentStepId, "review");
  assert.equal(instance.variables.prepared, true);

  const tasks = await service.listTasksForUser("tenant-a", "staff-a", ["staff"]);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]?.name, "Manager review");

  const completed = await service.completeTask({ tenantId: "tenant-a", id: tasks[0]!.id, actorUserId: "staff-a", actorRoles: ["staff"], output: { reviewed: true } });
  assert.equal(completed.task.status, "COMPLETED");
  assert.equal(completed.instance.status, "COMPLETED");
  assert.equal(completed.instance.variables.reviewed, true);
});

test("running instances remain bound to their published workflow version", async () => {
  const { service } = engine();
  const definition = await service.createDefinition({ tenantId: "tenant-a", name: "Versioned review", steps: reviewSteps("Version one review"), actorUserId: "owner-a" });
  await service.publishDefinition("tenant-a", definition.id, "owner-a");
  const v1 = await service.startWorkflow({ tenantId: "tenant-a", definitionId: definition.id, actorUserId: "member-a", variables: { amount: 5000 } });
  assert.equal(v1.workflowVersion, 1);

  const updated = await service.updateDefinition({ tenantId: "tenant-a", id: definition.id, steps: reviewSteps("Version two review"), actorUserId: "owner-a" });
  assert.equal(updated.version, 2);
  await service.publishDefinition("tenant-a", definition.id, "owner-a");

  const oldTasks = await service.listTasksForUser("tenant-a", "staff-a", ["staff"]);
  assert.equal(oldTasks[0]?.name, "Version one review");
  const next = await service.startWorkflow({ tenantId: "tenant-a", definitionId: definition.id, actorUserId: "member-b", variables: { amount: 5000 } });
  assert.equal(next.workflowVersion, 2);
  assert.ok((await service.listTasksForUser("tenant-a", "staff-a", ["staff"])).some((task) => task.name === "Version two review"));
});

test("form-submission triggers are source-idempotent", async () => {
  const { service } = engine();
  const steps: WorkflowStep[] = [
    { id: "start", name: "Start", type: "START", transitions: [{ targetStepId: "end" }] },
    { id: "end", name: "End", type: "END", transitions: [] },
  ];
  const definition = await service.createDefinition({
    tenantId: "tenant-a",
    name: "Form automation",
    steps,
    triggers: [{ type: "FORM_SUBMISSION", formDefinitionId: "form-a" }],
    actorUserId: "owner-a",
  });
  await service.publishDefinition("tenant-a", definition.id, "owner-a");

  const first = await service.triggerFormSubmission({ tenantId: "tenant-a", formDefinitionId: "form-a", formSubmissionId: "submission-a", actorUserId: "member-a", variables: { amount: 20 } });
  const second = await service.triggerFormSubmission({ tenantId: "tenant-a", formDefinitionId: "form-a", formSubmissionId: "submission-a", actorUserId: "member-a", variables: { amount: 20 } });
  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.equal(first[0]?.id, second[0]?.id);
  assert.equal(first[0]?.status, "COMPLETED");
});
