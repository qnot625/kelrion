import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { WorkflowEngineService, type WorkflowStep } from "@adminops/workflow";
import {
  PostgresHumanTaskRepository,
  PostgresTenantRepository,
  PostgresUserRepository,
  PostgresWorkflowDefinitionRepository,
  PostgresWorkflowInstanceRepository,
  runMigrations,
  schema,
  type Database,
} from "../src/index.js";

async function database(): Promise<Database> {
  const db = drizzle(new PGlite(), { schema }) as unknown as Database;
  await runMigrations(db);
  await runMigrations(db);
  return db;
}

function steps(): WorkflowStep[] {
  return [
    { id: "start", name: "Start", type: "START", transitions: [{ targetStepId: "review" }] },
    { id: "review", name: "Review", type: "MANUAL_TASK", taskConfig: { candidateRoles: ["staff"] }, transitions: [{ targetStepId: "end" }] },
    { id: "end", name: "End", type: "END", transitions: [] },
  ];
}

test("Postgres workflow repositories preserve versions, instances and human tasks", async () => {
  const db = await database();
  const tenants = new PostgresTenantRepository(db);
  const users = new PostgresUserRepository(db);
  const definitions = new PostgresWorkflowDefinitionRepository(db);
  const instances = new PostgresWorkflowInstanceRepository(db);
  const tasks = new PostgresHumanTaskRepository(db);
  const service = new WorkflowEngineService(definitions, instances, tasks);
  const tenant = await tenants.create({ name: "Workflow DB", slug: "workflow-db" });
  const owner = await users.create({ tenantId: tenant.id, email: "owner@workflow.db", passwordHash: "test", roles: ["owner"] });
  const starter = await users.create({ tenantId: tenant.id, email: "starter@workflow.db", passwordHash: "test", roles: ["member"] });
  const staff = await users.create({ tenantId: tenant.id, email: "staff@workflow.db", passwordHash: "test", roles: ["staff"] });

  const definition = await service.createDefinition({ tenantId: tenant.id, name: "Persistent review", steps: steps(), actorUserId: owner.id });
  await service.publishDefinition(tenant.id, definition.id, owner.id);
  const instance = await service.startWorkflow({ tenantId: tenant.id, definitionId: definition.id, actorUserId: starter.id });
  assert.equal(instance.status, "WAITING");
  assert.equal((await instances.findById(tenant.id, instance.id))?.workflowVersion, 1);
  const task = (await tasks.listForUser(tenant.id, staff.id, ["staff"]))[0];
  assert.ok(task);

  const updated = await service.updateDefinition({ tenantId: tenant.id, id: definition.id, name: "Persistent review v2", steps: steps(), actorUserId: owner.id });
  assert.equal(updated.version, 2);
  await service.publishDefinition(tenant.id, definition.id, owner.id);
  assert.deepEqual((await definitions.listPublishedVersions(tenant.id, definition.id)).map((item) => item.version), [2, 1]);

  const result = await service.completeTask({ tenantId: tenant.id, id: task!.id, actorUserId: staff.id, actorRoles: ["staff"] });
  assert.equal(result.instance.workflowVersion, 1);
  assert.equal(result.instance.status, "COMPLETED");

  await runMigrations(db);
  assert.equal((await instances.findById(tenant.id, instance.id))?.status, "COMPLETED");
  assert.equal(await definitions.findById("00000000-0000-0000-0000-000000000000", definition.id), null);
});
