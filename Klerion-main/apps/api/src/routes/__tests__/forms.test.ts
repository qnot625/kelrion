import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../../server.js";
import { formDefinitionRepository, formSubmissionRepository } from "../forms.js";

describe("FRM-014: Fastify Forms API Integration Tests", () => {
  let app: ReturnType<typeof createServer>;

  beforeEach(() => {
    formDefinitionRepository.clear();
    formSubmissionRepository.clear();
    app = createServer();
  });

  it("POST /api/forms - creates a form definition (admin/owner only)", async () => {
    // Non-admin attempt -> 403
    const forbiddenRes = await app.inject({
      method: "POST",
      url: "/api/forms",
      headers: {
        "x-tenant-id": "tenant-test",
        "x-user-role": "member",
      },
      payload: { title: "Forbidden Form" },
    });
    assert.equal(forbiddenRes.statusCode, 403);

    // Admin attempt -> 201 Created
    const res = await app.inject({
      method: "POST",
      url: "/api/forms",
      headers: {
        "x-tenant-id": "tenant-test",
        "x-user-role": "admin",
      },
      payload: {
        id: "form-req-1",
        title: "Access Request Form",
        fields: [
          { id: "reason", label: "Reason for Access", type: "text", required: true },
        ],
      },
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.equal(body.form.id, "form-req-1");
    assert.equal(body.form.status, "DRAFT");
    assert.equal(body.form.fields.length, 1);
  });

  it("PUT /api/forms/:id & POST /api/forms/:id/publish - updates and publishes form", async () => {
    // 1. Create initial form
    await app.inject({
      method: "POST",
      url: "/api/forms",
      headers: { "x-tenant-id": "tenant-test", "x-user-role": "admin" },
      payload: {
        id: "form-pub-1",
        title: "Initial Title",
        fields: [{ id: "f1", label: "Field 1", type: "text" }],
      },
    });

    // 2. Update form draft
    const updateRes = await app.inject({
      method: "PUT",
      url: "/api/forms/form-pub-1",
      headers: { "x-tenant-id": "tenant-test", "x-user-role": "admin" },
      payload: { title: "Updated Title" },
    });
    assert.equal(updateRes.statusCode, 200);

    // 3. Publish form
    const pubRes = await app.inject({
      method: "POST",
      url: "/api/forms/form-pub-1/publish",
      headers: { "x-tenant-id": "tenant-test", "x-user-role": "admin" },
    });
    assert.equal(pubRes.statusCode, 200);
    const pubBody = JSON.parse(pubRes.payload);
    assert.equal(pubBody.form.status, "PUBLISHED");
    assert.equal(pubBody.form.version, 1);
  });

  it("GET /api/forms - lists forms and enforces tenant isolation", async () => {
    // Create form in tenant A
    await app.inject({
      method: "POST",
      url: "/api/forms",
      headers: { "x-tenant-id": "tenant-a", "x-user-role": "admin" },
      payload: { id: "form-a", title: "Tenant A Form", fields: [{ id: "x", label: "X", type: "text" }] },
    });

    // Create form in tenant B
    await app.inject({
      method: "POST",
      url: "/api/forms",
      headers: { "x-tenant-id": "tenant-b", "x-user-role": "admin" },
      payload: { id: "form-b", title: "Tenant B Form", fields: [{ id: "y", label: "Y", type: "text" }] },
    });

    // Query tenant A forms
    const listResA = await app.inject({
      method: "GET",
      url: "/api/forms",
      headers: { "x-tenant-id": "tenant-a" },
    });
    assert.equal(listResA.statusCode, 200);
    const bodyA = JSON.parse(listResA.payload);
    assert.equal(bodyA.forms.length, 1);
    assert.equal(bodyA.forms[0].id, "form-a");

    // Query tenant B forms
    const listResB = await app.inject({
      method: "GET",
      url: "/api/forms",
      headers: { "x-tenant-id": "tenant-b" },
    });
    assert.equal(listResB.statusCode, 200);
    const bodyB = JSON.parse(listResB.payload);
    assert.equal(bodyB.forms.length, 1);
    assert.equal(bodyB.forms[0].id, "form-b");
  });

  it("POST /api/forms/:id/drafts & submissions - save draft and submit form response", async () => {
    // Create and publish form
    await app.inject({
      method: "POST",
      url: "/api/forms",
      headers: { "x-tenant-id": "tenant-sub", "x-user-role": "admin" },
      payload: {
        id: "form-survey",
        title: "Customer Survey",
        fields: [{ id: "feedback", label: "Feedback", type: "text", required: true }],
      },
    });

    await app.inject({
      method: "POST",
      url: "/api/forms/form-survey/publish",
      headers: { "x-tenant-id": "tenant-sub", "x-user-role": "admin" },
    });

    // Save draft submission
    const draftRes = await app.inject({
      method: "POST",
      url: "/api/forms/form-survey/drafts",
      headers: { "x-tenant-id": "tenant-sub", "x-user-role": "member" },
      payload: {
        submissionId: "sub-1",
        responses: [{ fieldId: "feedback", value: "Great service!" }],
      },
    });

    assert.equal(draftRes.statusCode, 200);
    const draftBody = JSON.parse(draftRes.payload);
    assert.equal(draftBody.submission.status, "DRAFT");
    assert.equal(draftBody.submission.responses[0].value, "Great service!");

    // Submit form
    const subRes = await app.inject({
      method: "POST",
      url: "/api/forms/form-survey/submissions",
      headers: { "x-tenant-id": "tenant-sub", "x-user-role": "member" },
      payload: { submissionId: "sub-1" },
    });

    assert.equal(subRes.statusCode, 200);
    const subBody = JSON.parse(subRes.payload);
    assert.equal(subBody.submission.status, "SUBMITTED");
  });
});
