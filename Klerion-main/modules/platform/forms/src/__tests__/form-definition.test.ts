import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  FormField,
  FormDefinition,
  InMemoryFormDefinitionRepository,
  FormDefinitionService,
  type AuditLogRecorder,
} from "../index.js";

describe("FRM-002: FormField Value Objects", () => {
  test("creates a valid FormField with validation rules", () => {
    const field = new FormField({
      id: "f1",
      label: "Full Name",
      type: "text",
      validationRules: [
        { type: "required", message: "Name is required" },
        { type: "min_length", value: 3, message: "Min 3 chars" },
      ],
    });

    assert.equal(field.id, "f1");
    assert.equal(field.label, "Full Name");
    assert.equal(field.type, "text");

    // Test validation
    const emptyErrors = field.validateValue("");
    assert.deepEqual(emptyErrors, ["Name is required"]);

    const shortErrors = field.validateValue("Ab");
    assert.deepEqual(shortErrors, ["Min 3 chars"]);

    const validErrors = field.validateValue("Alice");
    assert.deepEqual(validErrors, []);
  });

  test("throws error if FormField ID or Label is empty", () => {
    assert.throws(
      () => new FormField({ id: "", label: "Label", type: "text" }),
      /FormField ID cannot be empty/,
    );
    assert.throws(
      () => new FormField({ id: "f1", label: "  ", type: "text" }),
      /FormField label cannot be empty/,
    );
  });

  test("throws error if select field has no options", () => {
    assert.throws(
      () => new FormField({ id: "f1", label: "Role", type: "select" }),
      /FormField of type 'select' must specify at least one option/,
    );
  });

  test("evaluates visibility conditions correctly", () => {
    const deptField = new FormField({
      id: "dept",
      label: "Department",
      type: "select",
      options: [{ label: "IT", value: "it" }, { label: "HR", value: "hr" }],
    });

    const assetTagField = new FormField({
      id: "asset_tag",
      label: "Asset Tag",
      type: "text",
      visibilityConditions: [
        { fieldId: "dept", operator: "equals", value: "it" },
      ],
    });

    assert.equal(deptField.evaluateVisibility({}), true);
    assert.equal(assetTagField.evaluateVisibility({ dept: "hr" }), false);
    assert.equal(assetTagField.evaluateVisibility({ dept: "it" }), true);
  });
});

describe("FRM-003: FormDefinition Aggregate Root", () => {
  test("creates a valid FormDefinition aggregate root", () => {
    const field1 = new FormField({ id: "f1", label: "Name", type: "text" });
    const form = new FormDefinition({
      id: "form-101",
      tenantId: "tenant-a",
      title: "Employee Onboarding",
      fields: [field1],
    });

    assert.equal(form.id, "form-101");
    assert.equal(form.tenantId, "tenant-a");
    assert.equal(form.title, "Employee Onboarding");
    assert.equal(form.status, "DRAFT");
    assert.equal(form.version, 1);
    assert.equal(form.fields.length, 1);
  });

  test("rejects duplicate field IDs within a form", () => {
    const field1 = new FormField({ id: "f1", label: "Name", type: "text" });
    const field2 = new FormField({ id: "f1", label: "Email", type: "text" });

    assert.throws(
      () =>
        new FormDefinition({
          id: "form-dup",
          tenantId: "tenant-a",
          title: "Bad Form",
          fields: [field1, field2],
        }),
      /Duplicate field ID 'f1'/,
    );
  });

  test("rejects visibility conditions referencing non-existent fields", () => {
    const field = new FormField({
      id: "f1",
      label: "Notes",
      type: "text",
      visibilityConditions: [{ fieldId: "non_existent", operator: "equals", value: "yes" }],
    });

    assert.throws(
      () =>
        new FormDefinition({
          id: "form-bad-cond",
          tenantId: "tenant-a",
          title: "Bad Cond",
          fields: [field],
        }),
      /references non-existent field 'non_existent'/,
    );
  });

  test("publishes form, bumps version on republish, and enforces publish rules", () => {
    const field = new FormField({ id: "f1", label: "Title", type: "text" });
    const form = new FormDefinition({
      id: "form-pub",
      tenantId: "tenant-a",
      title: "Publish Test",
      fields: [field],
    });

    assert.equal(form.status, "DRAFT");
    assert.equal(form.version, 1);

    form.publish();
    assert.equal(form.status, "PUBLISHED");
    assert.equal(form.version, 1);

    // Republishing bumps version
    form.publish();
    assert.equal(form.version, 2);
  });

  test("cannot publish a form with zero fields", () => {
    const form = new FormDefinition({
      id: "form-empty",
      tenantId: "tenant-a",
      title: "Empty Form",
      fields: [],
    });

    assert.throws(() => form.publish(), /Cannot publish a form definition with zero fields/);
  });

  test("archives form and prevents modifications once archived", () => {
    const field = new FormField({ id: "f1", label: "Title", type: "text" });
    const form = new FormDefinition({
      id: "form-arch",
      tenantId: "tenant-a",
      title: "Archive Test",
      fields: [field],
    });

    form.archive();
    assert.equal(form.status, "ARCHIVED");

    assert.throws(
      () => form.updateDetails("New Title"),
      /Cannot modify FormDefinition 'form-arch' because it is ARCHIVED/,
    );
    assert.throws(
      () => form.setFields([field]),
      /Cannot modify FormDefinition 'form-arch' because it is ARCHIVED/,
    );
  });
});

describe("FRM-005: InMemoryFormDefinitionRepository & Tenant Isolation", () => {
  test("persists, retrieves, and enforces tenant isolation", async () => {
    const repo = new InMemoryFormDefinitionRepository();
    const field = new FormField({ id: "f1", label: "Name", type: "text" });

    const formA = new FormDefinition({
      id: "form-1",
      tenantId: "tenant-alpha",
      title: "Alpha Form",
      fields: [field],
    });

    const formB = new FormDefinition({
      id: "form-1", // Same ID, different tenant
      tenantId: "tenant-beta",
      title: "Beta Form",
      fields: [field],
    });

    await repo.save(formA);
    await repo.save(formB);

    // Query tenant alpha
    const retrievedA = await repo.findById("tenant-alpha", "form-1");
    assert.notEqual(retrievedA, null);
    assert.equal(retrievedA?.title, "Alpha Form");

    // Cross-tenant query MUST fail (return null)
    const crossTenantQuery = await repo.findById("tenant-beta", "non-existent");
    assert.equal(crossTenantQuery, null);

    // List by tenant
    const alphaList = await repo.findByTenant("tenant-alpha");
    assert.equal(alphaList.length, 1);
    assert.equal(alphaList[0].title, "Alpha Form");

    const betaList = await repo.findByTenant("tenant-beta");
    assert.equal(betaList.length, 1);
    assert.equal(betaList[0].title, "Beta Form");
  });
});

describe("FRM-006: FormDefinitionService & Audit Integration", () => {
  test("creates, updates, publishes, and archives forms with audit logs", async () => {
    const repo = new InMemoryFormDefinitionRepository();
    const auditEvents: Array<Record<string, unknown>> = [];
    const mockAuditLog: AuditLogRecorder = {
      async record(input) {
        auditEvents.push(input as Record<string, unknown>);
        return { id: "evt-1" };
      },
    };

    const service = new FormDefinitionService(repo, mockAuditLog);

    // Create Form
    const field = new FormField({ id: "f1", label: "Email", type: "text" });
    const created = await service.createForm({
      tenantId: "tenant-1",
      id: "form-serv-1",
      title: "Service Form",
      description: "Desc",
      fields: [field],
      actorUserId: "user-100",
    });

    assert.equal(created.id, "form-serv-1");
    assert.equal(auditEvents.length, 1);
    assert.equal(auditEvents[0].action, "form.created");
    assert.equal(auditEvents[0].tenantId, "tenant-1");

    // Update Form Draft
    const updated = await service.updateFormDraft({
      tenantId: "tenant-1",
      id: "form-serv-1",
      title: "Updated Service Form",
      actorUserId: "user-100",
    });

    assert.equal(updated.title, "Updated Service Form");
    assert.equal(auditEvents.length, 2);
    assert.equal(auditEvents[1].action, "form.updated");

    // Publish Form
    const published = await service.publishForm({
      tenantId: "tenant-1",
      id: "form-serv-1",
      actorUserId: "user-100",
    });

    assert.equal(published.status, "PUBLISHED");
    assert.equal(auditEvents.length, 3);
    assert.equal(auditEvents[2].action, "form.published");

    // Archive Form
    const archived = await service.archiveForm({
      tenantId: "tenant-1",
      id: "form-serv-1",
      actorUserId: "user-100",
    });

    assert.equal(archived.status, "ARCHIVED");
    assert.equal(auditEvents.length, 4);
    assert.equal(auditEvents[3].action, "form.archived");
  });

  test("throws error when creating a duplicate form ID for same tenant", async () => {
    const repo = new InMemoryFormDefinitionRepository();
    const service = new FormDefinitionService(repo);

    await service.createForm({
      tenantId: "tenant-1",
      id: "form-dup",
      title: "Form 1",
    });

    await assert.rejects(
      async () =>
        service.createForm({
          tenantId: "tenant-1",
          id: "form-dup",
          title: "Form Duplicate",
        }),
      /already exists for tenant 'tenant-1'/,
    );
  });
});
