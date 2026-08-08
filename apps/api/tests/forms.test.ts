import assert from "node:assert/strict";
import { test } from "node:test";
import { createAppContext } from "../src/context.js";
import { buildServer } from "../src/server.js";

async function setup(name: string, slug: string, withForms = true) {
  const context = createAppContext();
  await context.controlPlaneService.provisionTenant({
    name,
    slug,
    enabledModules: withForms ? ["forms"] : ["cases"],
  });
  return buildServer(context);
}

async function signup(app: ReturnType<typeof buildServer>, slug: string, email: string) {
  const response = await app.inject({
    method: "POST",
    url: "/auth/signup",
    headers: { "x-tenant-slug": slug },
    payload: { email, password: "test-password" },
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json() as { userId: string; token: string };
}

function headers(slug: string, token: string) {
  return { "x-tenant-slug": slug, authorization: `Bearer ${token}` };
}

async function publishedForm(app: ReturnType<typeof buildServer>, slug: string, token: string) {
  const create = await app.inject({
    method: "POST",
    url: "/forms",
    headers: headers(slug, token),
    payload: {
      title: "Expense request",
      fields: [
        { id: "amount", label: "Amount", type: "number", validationRules: [{ type: "required", message: "Amount is required" }] },
        { id: "total", label: "Total", type: "calculated", calculation: { operator: "sum", fieldIds: ["amount"] } },
      ],
    },
  });
  assert.equal(create.statusCode, 201, create.body);
  const form = create.json() as { id: string };
  const publish = await app.inject({ method: "POST", url: `/forms/${form.id}/publish`, headers: headers(slug, token) });
  assert.equal(publish.statusCode, 200, publish.body);
  return form.id;
}

test("forms API enforces RBAC and exposes published definitions to members", async () => {
  const app = await setup("Forms Co", "forms-co");
  const owner = await signup(app, "forms-co", "owner@forms.co");
  const member = await signup(app, "forms-co", "member@forms.co");
  const formId = await publishedForm(app, "forms-co", owner.token);

  const forbidden = await app.inject({
    method: "POST",
    url: "/forms",
    headers: headers("forms-co", member.token),
    payload: { title: "Nope" },
  });
  assert.equal(forbidden.statusCode, 403, forbidden.body);

  const list = await app.inject({ method: "GET", url: "/forms", headers: headers("forms-co", member.token) });
  assert.equal(list.statusCode, 200, list.body);
  const forms = list.json() as Array<{ id: string; status: string; version: number }>;
  assert.equal(forms.length, 1);
  assert.equal(forms[0]?.id, formId);
  assert.equal(forms[0]?.status, "PUBLISHED");
  assert.equal(forms[0]?.version, 1);
});

test("a draft submission remains valid against its original published version", async () => {
  const app = await setup("Version Co", "version-co");
  const owner = await signup(app, "version-co", "owner@version.co");
  const member = await signup(app, "version-co", "member@version.co");
  const formId = await publishedForm(app, "version-co", owner.token);

  const draft = await app.inject({
    method: "POST",
    url: `/forms/${formId}/drafts`,
    headers: headers("version-co", member.token),
    payload: { responses: [{ fieldId: "amount", value: 250 }] },
  });
  assert.equal(draft.statusCode, 201, draft.body);
  const submission = draft.json() as { id: string; formVersion: number };
  assert.equal(submission.formVersion, 1);

  const update = await app.inject({
    method: "PATCH",
    url: `/forms/${formId}`,
    headers: headers("version-co", owner.token),
    payload: {
      fields: [
        { id: "amount", label: "Amount", type: "number", validationRules: [{ type: "required", message: "Amount is required" }] },
        { id: "reason", label: "Reason", type: "text", validationRules: [{ type: "required", message: "Reason is required" }] },
      ],
    },
  });
  assert.equal(update.statusCode, 200, update.body);
  assert.equal((update.json() as { version: number; status: string }).version, 2);
  assert.equal((update.json() as { version: number; status: string }).status, "DRAFT");

  const publish = await app.inject({ method: "POST", url: `/forms/${formId}/publish`, headers: headers("version-co", owner.token) });
  assert.equal(publish.statusCode, 200, publish.body);

  const submit = await app.inject({
    method: "POST",
    url: `/form-submissions/${submission.id}/submit`,
    headers: headers("version-co", member.token),
    payload: {},
  });
  assert.equal(submit.statusCode, 200, submit.body);
  assert.equal((submit.json() as { formVersion: number; status: string }).formVersion, 1);
  assert.equal((submit.json() as { formVersion: number; status: string }).status, "SUBMITTED");

  const nextDraft = await app.inject({ method: "POST", url: `/forms/${formId}/drafts`, headers: headers("version-co", member.token), payload: {} });
  assert.equal(nextDraft.statusCode, 201, nextDraft.body);
  assert.equal((nextDraft.json() as { formVersion: number }).formVersion, 2);
});

test("forms API isolates tenants, submission owners and module entitlements", async () => {
  const context = createAppContext();
  await context.controlPlaneService.provisionTenant({ name: "Alpha", slug: "alpha-forms", enabledModules: ["forms"] });
  await context.controlPlaneService.provisionTenant({ name: "Beta", slug: "beta-forms", enabledModules: ["forms"] });
  await context.controlPlaneService.provisionTenant({ name: "No Forms", slug: "no-forms", enabledModules: ["cases"] });
  const app = buildServer(context);
  const alpha = await signup(app, "alpha-forms", "owner@alpha.test");
  const alphaMember = await signup(app, "alpha-forms", "member@alpha.test");
  const beta = await signup(app, "beta-forms", "owner@beta.test");
  const noForms = await signup(app, "no-forms", "owner@noforms.test");
  const formId = await publishedForm(app, "alpha-forms", alpha.token);

  const crossTenant = await app.inject({ method: "GET", url: `/forms/${formId}`, headers: headers("beta-forms", beta.token) });
  assert.equal(crossTenant.statusCode, 404, crossTenant.body);

  const disabled = await app.inject({ method: "GET", url: "/forms", headers: headers("no-forms", noForms.token) });
  assert.equal(disabled.statusCode, 403, disabled.body);

  const draft = await app.inject({ method: "POST", url: `/forms/${formId}/drafts`, headers: headers("alpha-forms", alphaMember.token), payload: {} });
  assert.equal(draft.statusCode, 201, draft.body);
  const draftId = (draft.json() as { id: string }).id;

  const otherMember = await signup(app, "alpha-forms", "other@alpha.test");
  const privateDraft = await app.inject({ method: "GET", url: `/form-submissions/${draftId}`, headers: headers("alpha-forms", otherMember.token) });
  assert.equal(privateDraft.statusCode, 403, privateDraft.body);

  const ownerCanRead = await app.inject({ method: "GET", url: `/form-submissions/${draftId}`, headers: headers("alpha-forms", alpha.token) });
  assert.equal(ownerCanRead.statusCode, 200, ownerCanRead.body);
});
