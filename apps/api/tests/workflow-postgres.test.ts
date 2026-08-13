import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { WorkflowEngineService } from "@adminops/workflow";
import {
  PostgresHumanTaskRepository,
  PostgresWorkflowDefinitionRepository,
  PostgresWorkflowInstanceRepository,
} from "@adminops/workflow";
import { PostgresTenantRepository } from "@adminops/tenancy";
import { runMigrations, schema, type Database } from "@adminops/persistence";

test("workflow engine runs against real PGlite/PostgreSQL tables", async () => {
  const db = drizzle(new PGlite(), { schema }) as unknown as Database;
  await runMigrations(db);
  const tenants = new PostgresTenantRepository(db);
  const definitions = new PostgresWorkflowDefinitionRepository(db);
  const instances = new PostgresWorkflowInstanceRepository(db);
  const tasks = new PostgresHumanTaskRepository(db);
  const service = new WorkflowEngineService(definitions, instances, tasks);
  const tenant = await tenants.create({ name: "Workflow API DB", slug: "workflow-api-db" });

  const definition = await service.createDefinition({
    tenantId: tenant.id,
    name: "Database workflow",
    steps: [
      { id: "start", name: "Start", type: "START", transitions: [{ targetStepId: "auto" }] },
      { id: "auto", name: "Set state", type: "AUTOMATIC_TASK", automaticConfig: { operation: "SET_VARIABLES", values: { persisted: true } }, transitions: [{ targetStepId: "end" }] },
      { id: "end", name: "End", type: "END", transitions: [] },
    ],
    actorUserId: "00000000-0000-4000-8000-000000000001",
  });
  await service.publishDefinition(tenant.id, definition.id, "00000000-0000-4000-8000-000000000001");
  const instance = await service.startWorkflow({ tenantId: tenant.id, definitionId: definition.id, actorUserId: "00000000-0000-4000-8000-000000000002" });
  assert.equal(instance.status, "COMPLETED");
  assert.equal(instance.variables.persisted, true);
  assert.equal((await instances.findById(tenant.id, instance.id))?.status, "COMPLETED");
  await runMigrations(db);
});
