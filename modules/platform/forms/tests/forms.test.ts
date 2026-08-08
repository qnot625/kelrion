import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FormDefinitionService,
  InMemoryFormDefinitionRepository,
  InMemoryFormSubmissionRepository,
  SubmissionService,
} from "../src/index.js";

test("published form versions are immutable while the current definition moves forward", async () => {
  const definitions = new InMemoryFormDefinitionRepository();
  const submissions = new InMemoryFormSubmissionRepository();
  const forms = new FormDefinitionService(definitions);
  const submit = new SubmissionService(submissions, definitions);

  const form = await forms.createForm({
    tenantId: "tenant-a",
    title: "Expense request",
    fields: [
      { id: "amount", label: "Amount", type: "number", validationRules: [{ type: "required", message: "Amount is required" }] },
      { id: "tax", label: "Tax", type: "number", defaultValue: 0 },
      { id: "total", label: "Total", type: "calculated", calculation: { operator: "sum", fieldIds: ["amount", "tax"] } },
    ],
  });
  await forms.publish({ tenantId: "tenant-a", id: form.id });

  const draftV1 = await submit.createDraft({
    tenantId: "tenant-a",
    formDefinitionId: form.id,
    actorUserId: "user-a",
    responses: [{ fieldId: "amount", value: 100 }, { fieldId: "tax", value: 10 }],
  });
  assert.equal(draftV1.formVersion, 1);

  const next = await forms.updateDraft({
    tenantId: "tenant-a",
    id: form.id,
    title: "Expense request v2",
    fields: [
      { id: "amount", label: "Amount", type: "number", validationRules: [{ type: "required", message: "Amount is required" }] },
      { id: "tax", label: "Tax", type: "number", defaultValue: 0 },
      { id: "project", label: "Project", type: "text", validationRules: [{ type: "required", message: "Project is required" }] },
      { id: "total", label: "Total", type: "calculated", calculation: { operator: "sum", fieldIds: ["amount", "tax"] } },
    ],
  });
  assert.equal(next.version, 2);
  assert.equal(next.status, "DRAFT");

  const submittedV1 = await submit.submit({
    tenantId: "tenant-a",
    id: draftV1.id,
    actorUserId: "user-a",
  });
  assert.equal(submittedV1.status, "SUBMITTED");
  assert.equal(submittedV1.formVersion, 1);
  assert.equal(submittedV1.responses.find((item) => item.fieldId === "total")?.value, 110);

  await forms.publish({ tenantId: "tenant-a", id: form.id });
  const draftV2 = await submit.createDraft({ tenantId: "tenant-a", formDefinitionId: form.id, actorUserId: "user-a" });
  assert.equal(draftV2.formVersion, 2);
  assert.deepEqual((await forms.listVersions("tenant-a", form.id)).map((item) => item.version), [2, 1]);
});

test("conditional required fields validate only while visible", async () => {
  const definitions = new InMemoryFormDefinitionRepository();
  const submissions = new InMemoryFormSubmissionRepository();
  const forms = new FormDefinitionService(definitions);
  const submit = new SubmissionService(submissions, definitions);
  const form = await forms.createForm({
    tenantId: "tenant-a",
    title: "Travel",
    fields: [
      { id: "travelling", label: "Travelling", type: "boolean" },
      {
        id: "destination",
        label: "Destination",
        type: "text",
        visibilityConditions: [{ fieldId: "travelling", operator: "equals", value: true }],
        validationRules: [{ type: "required", message: "Destination is required" }],
      },
    ],
  });
  await forms.publish({ tenantId: "tenant-a", id: form.id });
  const hidden = await submit.createDraft({
    tenantId: "tenant-a",
    formDefinitionId: form.id,
    actorUserId: "user-a",
    responses: [{ fieldId: "travelling", value: false }],
  });
  assert.equal((await submit.submit({ tenantId: "tenant-a", id: hidden.id, actorUserId: "user-a" })).status, "SUBMITTED");

  const visible = await submit.createDraft({
    tenantId: "tenant-a",
    formDefinitionId: form.id,
    actorUserId: "user-a",
    responses: [{ fieldId: "travelling", value: true }],
  });
  await assert.rejects(
    () => submit.submit({ tenantId: "tenant-a", id: visible.id, actorUserId: "user-a" }),
    /Destination is required/,
  );
});

test("form definitions and submissions are tenant isolated and owner scoped", async () => {
  const definitions = new InMemoryFormDefinitionRepository();
  const submissions = new InMemoryFormSubmissionRepository();
  const forms = new FormDefinitionService(definitions);
  const submit = new SubmissionService(submissions, definitions);
  const form = await forms.createForm({ tenantId: "tenant-a", title: "Private", fields: [{ id: "note", label: "Note", type: "text" }] });
  await forms.publish({ tenantId: "tenant-a", id: form.id });
  const draft = await submit.createDraft({ tenantId: "tenant-a", formDefinitionId: form.id, actorUserId: "user-a" });

  await assert.rejects(() => forms.get("tenant-b", form.id), /not found/i);
  await assert.rejects(
    () => submit.get({ tenantId: "tenant-a", id: draft.id, actorUserId: "other-user" }),
    /do not have access/i,
  );
  assert.equal(await submit.get({ tenantId: "tenant-a", id: draft.id, actorUserId: "admin", canManage: true }).then((item) => item.id), draft.id);
});
