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
} from "../src/index.js";

async function database(): Promise<Database> {
  const db = drizzle(new PGlite(), { schema }) as unknown as Database;
  await runMigrations(db);
  await runMigrations(db);
  return db;
}

test("Postgres forms repositories preserve published versions and submission ownership", async () => {
  const db = await database();
  const tenants = new PostgresTenantRepository(db);
  const users = new PostgresUserRepository(db);
  const definitions = new PostgresFormDefinitionRepository(db);
  const submissions = new PostgresFormSubmissionRepository(db);
  const forms = new FormDefinitionService(definitions);
  const submit = new SubmissionService(submissions, definitions);

  const tenant = await tenants.create({ name: "Forms Tenant", slug: "forms-tenant" });
  const user = await users.create({ tenantId: tenant.id, email: "forms@example.com", passwordHash: "test-hash", roles: ["member"] });

  const form = await forms.createForm({
    tenantId: tenant.id,
    title: "Equipment request",
    locale: "en-NG",
    templateKey: "equipment-request",
    fields: [{ id: "item", label: "Item", type: "text", validationRules: [{ type: "required", message: "Item is required" }] }],
  });
  await forms.publish({ tenantId: tenant.id, id: form.id });
  const draft = await submit.createDraft({
    tenantId: tenant.id,
    formDefinitionId: form.id,
    actorUserId: user.id,
    responses: [{ fieldId: "item", value: "Laptop" }],
  });

  await forms.updateDraft({
    tenantId: tenant.id,
    id: form.id,
    fields: [
      { id: "item", label: "Item", type: "text", validationRules: [{ type: "required", message: "Item is required" }] },
      { id: "reason", label: "Reason", type: "textarea", validationRules: [{ type: "required", message: "Reason is required" }] },
    ],
  });
  await forms.publish({ tenantId: tenant.id, id: form.id });

  const submitted = await submit.submit({ tenantId: tenant.id, id: draft.id, actorUserId: user.id });
  assert.equal(submitted.formVersion, 1);
  assert.equal(submitted.status, "SUBMITTED");
  assert.deepEqual((await definitions.listPublishedVersions(tenant.id, form.id)).map((item) => item.version), [2, 1]);
  assert.equal((await submissions.findByOwner(tenant.id, user.id))[0]?.id, draft.id);
  assert.equal(await definitions.findById("00000000-0000-0000-0000-000000000000", form.id), null);

  await runMigrations(db);
  assert.equal((await submissions.findById(tenant.id, draft.id))?.formVersion, 1);
});
