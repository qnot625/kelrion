import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FormField,
  FormDefinition,
  InMemoryFormDefinitionRepository,
  FieldResponse,
  SubmissionMetadata,
  validateFormResponses,
  FormSubmission,
  InMemoryFormSubmissionRepository,
  SubmissionService,
  type AuditLogRecorder,
} from "../index.js";

describe("FRM-008: Form Submission Value Objects & Response Validation", () => {
  it("constructs immutable FieldResponse and SubmissionMetadata", () => {
    const response = new FieldResponse({ fieldId: "f1", value: "John Doe" });
    assert.equal(response.fieldId, "f1");
    assert.equal(response.value, "John Doe");

    const metadata = new SubmissionMetadata({
      ipAddress: "127.0.0.1",
      submittedByUserId: "usr-1",
      tags: ["urgent", "v1"],
    });
    assert.equal(metadata.ipAddress, "127.0.0.1");
    assert.equal(metadata.submittedByUserId, "usr-1");
    assert.deepEqual(metadata.tags, ["urgent", "v1"]);
  });

  it("validates payload against FormDefinition (required, regex, min_value, unknown fields)", () => {
    const formDef = new FormDefinition({
      id: "form-1",
      tenantId: "tenant-a",
      title: "Registration Form",
      status: "PUBLISHED",
      version: 1,
      fields: [
        new FormField({
          id: "email",
          label: "Email Address",
          type: "text",
          validationRules: [
            { type: "required", message: "Email is required" },
            { type: "regex", value: "^[^@]+@[^@]+\\.[^@]+$", message: "Invalid email" },
          ],
        }),
        new FormField({
          id: "age",
          label: "Age",
          type: "number",
          validationRules: [{ type: "min_value", value: 18, message: "Must be 18+" }],
        }),
      ],
    });

    // Case 1: Invalid payload (missing required, invalid regex, below min_value, unknown field)
    const invalidResponses = [
      new FieldResponse({ fieldId: "email", value: "not-an-email" }),
      new FieldResponse({ fieldId: "age", value: 16 }),
      new FieldResponse({ fieldId: "unknown_field", value: "hacker" }),
    ];

    const errors = validateFormResponses(formDef, invalidResponses);
    assert.equal(errors.length, 3);
    assert.ok(errors.some((e) => e.fieldId === "email" && e.message.includes("Invalid email")));
    assert.ok(errors.some((e) => e.fieldId === "age" && e.message.includes("Must be 18+")));
    assert.ok(errors.some((e) => e.fieldId === "unknown_field" && e.message.includes("not defined")));

    // Case 2: Valid payload
    const validResponses = [
      new FieldResponse({ fieldId: "email", value: "alice@example.com" }),
      new FieldResponse({ fieldId: "age", value: 25 }),
    ];
    const validErrors = validateFormResponses(formDef, validResponses);
    assert.equal(validErrors.length, 0);
  });

  it("skips validation for fields hidden by conditional visibility", () => {
    const formDef = new FormDefinition({
      id: "form-cond",
      tenantId: "tenant-a",
      title: "Conditional Form",
      status: "PUBLISHED",
      version: 1,
      fields: [
        new FormField({
          id: "hasVehicle",
          label: "Do you have a vehicle?",
          type: "boolean",
        }),
        new FormField({
          id: "licensePlate",
          label: "License Plate",
          type: "text",
          validationRules: [{ type: "required", message: "License plate is required" }],
          visibilityConditions: [
            { fieldId: "hasVehicle", operator: "equals", value: true },
          ],
        }),
      ],
    });

    // When hasVehicle is false, licensePlate is hidden -> required rule should NOT trigger
    const responsesNoVehicle = [
      new FieldResponse({ fieldId: "hasVehicle", value: false }),
    ];
    const errorsHidden = validateFormResponses(formDef, responsesNoVehicle);
    assert.equal(errorsHidden.length, 0);

    // When hasVehicle is true, licensePlate is visible -> missing required rule triggers
    const responsesWithVehicleMissing = [
      new FieldResponse({ fieldId: "hasVehicle", value: true }),
    ];
    const errorsVisible = validateFormResponses(formDef, responsesWithVehicleMissing);
    assert.equal(errorsVisible.length, 1);
    assert.equal(errorsVisible[0].fieldId, "licensePlate");
  });
});

describe("FRM-009: FormSubmission Aggregate Root", () => {
  it("creates draft submission and manages status lifecycle", () => {
    const submission = new FormSubmission({
      id: "sub-1",
      tenantId: "tenant-a",
      formDefinitionId: "form-1",
      formVersion: 1,
    });

    assert.equal(submission.status, "DRAFT");
    assert.equal(submission.formVersion, 1);
    assert.equal(submission.responses.length, 0);

    // Save draft
    submission.saveDraft([new FieldResponse({ fieldId: "name", value: "Alice" })]);
    assert.equal(submission.responses.length, 1);

    // Submit against valid definition
    const formDef = new FormDefinition({
      id: "form-1",
      tenantId: "tenant-a",
      title: "Test Form",
      status: "PUBLISHED",
      version: 1,
      fields: [new FormField({ id: "name", label: "Name", type: "text" })],
    });

    submission.submit(formDef);
    assert.equal(submission.status, "SUBMITTED");
    assert.ok(submission.submittedAt instanceof Date);

    // Validate submission
    submission.validate(formDef);
    assert.equal(submission.status, "VALIDATED");

    // Archive submission
    submission.archive();
    assert.equal(submission.status, "ARCHIVED");
  });

  it("enforces version lock and throws on version mismatch", () => {
    const submission = new FormSubmission({
      id: "sub-2",
      tenantId: "tenant-a",
      formDefinitionId: "form-1",
      formVersion: 1,
    });

    const newerDef = new FormDefinition({
      id: "form-1",
      tenantId: "tenant-a",
      title: "Test Form v2",
      status: "PUBLISHED",
      version: 2,
      fields: [new FormField({ id: "name", label: "Name", type: "text" })],
    });

    assert.throws(
      () => submission.submit(newerDef),
      /FormDefinition version mismatch: submission is bound to version 1, but definition is version 2/,
    );
  });

  it("prevents editing responses after submission", () => {
    const submission = new FormSubmission({
      id: "sub-3",
      tenantId: "tenant-a",
      formDefinitionId: "form-1",
      formVersion: 1,
    });

    const formDef = new FormDefinition({
      id: "form-1",
      tenantId: "tenant-a",
      title: "Test Form",
      status: "PUBLISHED",
      version: 1,
      fields: [],
    });

    submission.submit(formDef);

    assert.throws(
      () => submission.saveDraft([new FieldResponse({ fieldId: "x", value: "y" })]),
      /Cannot edit submission 'sub-3' because status is 'SUBMITTED'/,
    );
  });
});

describe("FRM-010: InMemoryFormSubmissionRepository", () => {
  it("persists, queries, and enforces tenant isolation for submissions", async () => {
    const repo = new InMemoryFormSubmissionRepository();

    const subTenantA = new FormSubmission({
      id: "sub-a",
      tenantId: "tenant-a",
      formDefinitionId: "form-1",
      formVersion: 1,
    });

    const subTenantB = new FormSubmission({
      id: "sub-b",
      tenantId: "tenant-b",
      formDefinitionId: "form-1",
      formVersion: 1,
    });

    await repo.save(subTenantA);
    await repo.save(subTenantB);

    // Tenant A queries
    const tenantASubs = await repo.findByTenant("tenant-a");
    assert.equal(tenantASubs.length, 1);
    assert.equal(tenantASubs[0].id, "sub-a");

    // Cross-tenant lookup returns null
    const crossLookup = await repo.findById("tenant-a", "sub-b");
    assert.equal(crossLookup, null);

    // Delete draft
    await repo.deleteDraft("tenant-a", "sub-a");
    const afterDelete = await repo.findById("tenant-a", "sub-a");
    assert.equal(afterDelete, null);
  });
});

describe("FRM-011: SubmissionService & Integration", () => {
  it("orchestrates draft creation, updates, submission, and audit logs", async () => {
    const formRepo = new InMemoryFormDefinitionRepository();
    const subRepo = new InMemoryFormSubmissionRepository();

    const auditLogs: Array<{ action: string; targetId: string }> = [];
    const auditRecorder: AuditLogRecorder = {
      record: async (input) => {
        auditLogs.push({ action: input.action, targetId: input.targetId });
      },
    };

    const formDef = new FormDefinition({
      id: "form-1",
      tenantId: "tenant-a",
      title: "Employee Survey",
      status: "PUBLISHED",
      version: 1,
      fields: [
        new FormField({
          id: "rating",
          label: "Overall Rating",
          type: "number",
          validationRules: [{ type: "required", message: "Rating is required" }],
        }),
      ],
    });

    await formRepo.save(formDef);

    const service = new SubmissionService(subRepo, formRepo, auditRecorder);

    // 1. Create Draft
    const draft = await service.createDraft({
      id: "sub-100",
      tenantId: "tenant-a",
      formDefinitionId: "form-1",
      actorId: "usr-1",
    });

    assert.equal(draft.status, "DRAFT");

    // 2. Save Draft responses
    await service.saveDraft({
      id: "sub-100",
      tenantId: "tenant-a",
      responses: [new FieldResponse({ fieldId: "rating", value: 5 })],
      actorId: "usr-1",
    });

    // 3. Validate Submission
    const validationResult = await service.validateSubmission("tenant-a", "sub-100");
    assert.equal(validationResult.isValid, true);

    // 4. Submit Form
    const submitted = await service.submitForm({
      id: "sub-100",
      tenantId: "tenant-a",
      actorId: "usr-1",
    });

    assert.equal(submitted.status, "SUBMITTED");

    // Check Audit Logs
    assert.equal(auditLogs.length, 3);
    assert.equal(auditLogs[0].action, "FORM_SUBMISSION_DRAFT_CREATED");
    assert.equal(auditLogs[1].action, "FORM_SUBMISSION_DRAFT_UPDATED");
    assert.equal(auditLogs[2].action, "FORM_SUBMISSION_SUBMITTED");
  });
});
