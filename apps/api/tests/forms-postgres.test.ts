import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { FormDefinitionService, SubmissionService } from "@adminops/forms";
import {
  PostgresFormDefinitionRepository,
  PostgresFormSubmissionRepository,
  PostgresTenantRepository,
  PostgresUserRepository,
  runMigrations,
  schema,
  type Database,
} from "@adminops/persistence";

test("forms services run against real PGlite/PostgreSQL tables", async () => {
  const db = drizzle(new PGlite(), { schema }) as unknown as Database;
  await runMigrations(db);
  const tenants = new PostgresTenantRepository(db);
  const users = new PostgresUserRepository(db);
  const formRepository = new PostgresFormDefinitionRepository(db);
  const submissionRepository = new PostgresFormSubmissionRepository(db);
  const forms = new FormDefinitionService(formRepository);
  const submissions = new SubmissionService(submissionRepository, formRepository);

  const tenant = await tenants.create({ name: "API Forms DB", slug: "api-forms-db" });
  const user = await users.create({ tenantId: tenant.id, email: "member@db.test", passwordHash: "test-hash", roles: ["member"] });
  const form = await forms.createForm({
    tenantId: tenant.id,
    title: "Database form",
    fields: [{ id: "answer", label: "Answer", type: "text", validationRules: [{ type: "required", message: "Answer required" }] }],
  });
  await forms.publish({ tenantId: tenant.id, id: form.id });
  const draft = await submissions.createDraft({
    tenantId: tenant.id,
    formDefinitionId: form.id,
    actorUserId: user.id,
    responses: [{ fieldId: "answer", value: "Yes" }],
  });
  const submitted = await submissions.submit({ tenantId: tenant.id, id: draft.id, actorUserId: user.id });
  assert.equal(submitted.status, "SUBMITTED");
  assert.equal((await submissionRepository.findById(tenant.id, draft.id))?.metadata.submittedByUserId, user.id);
  await runMigrations(db);
});
