import assert from "node:assert/strict";
import { test } from "node:test";
import { createAppContext } from "../src/context.js";
import { buildServer } from "../src/server.js";

test("self-service signup records selected modules and enforces entitlements", async () => {
  const app = buildServer(createAppContext());

  const catalogue = await app.inject({ method: "GET", url: "/module-catalogue" });
  assert.equal(catalogue.statusCode, 200);
  assert.ok((catalogue.json() as Array<{ key: string }>).some((item) => item.key === "cases"));

  const signup = await app.inject({
    method: "POST",
    url: "/organisations/signup",
    payload: {
      name: "Focused Support",
      slug: "focused-support",
      ownerEmail: "owner@focused.test",
      ownerPassword: "correct-horse",
      enabledModules: ["cases"],
      currency: "NGN",
      billingCycle: "monthly",
    },
  });
  assert.equal(signup.statusCode, 201, signup.body);
  const result = signup.json() as { token: string; subscription: { enabledModules: string[] } };
  assert.deepEqual(result.subscription.enabledModules, ["cases"]);

  const headers = {
    "x-tenant-slug": "focused-support",
    authorization: `Bearer ${result.token}`,
  };
  const entitlements = await app.inject({ method: "GET", url: "/entitlements", headers });
  assert.equal(entitlements.statusCode, 200, entitlements.body);
  assert.deepEqual((entitlements.json() as { enabledModules: string[] }).enabledModules, ["cases"]);

  const blockedAppointments = await app.inject({ method: "GET", url: "/appointments", headers });
  assert.equal(blockedAppointments.statusCode, 403, blockedAppointments.body);
  assert.equal((blockedAppointments.json() as { code: string }).code, "MODULE_NOT_ENABLED");

  const allowedCases = await app.inject({ method: "GET", url: "/cases", headers });
  assert.equal(allowedCases.statusCode, 200, allowedCases.body);
});

test("god administrator can manage organisations, subscriptions and invoices", async () => {
  const app = buildServer(createAppContext());
  const bootstrap = await app.inject({
    method: "POST",
    url: "/platform/auth/bootstrap",
    payload: { email: "root@klerion.test", password: "very-secure-password" },
  });
  assert.equal(bootstrap.statusCode, 201, bootstrap.body);
  const token = (bootstrap.json() as { token: string }).token;
  const headers = { authorization: `Bearer ${token}` };

  const create = await app.inject({
    method: "POST",
    url: "/platform/organisations",
    headers,
    payload: {
      name: "Acme Operations",
      slug: "acme-operations",
      ownerEmail: "owner@acme.test",
      ownerPassword: "correct-horse",
      enabledModules: ["attendance", "queue"],
      currency: "USD",
      billingCycle: "annual",
      trialDays: 0,
    },
  });
  assert.equal(create.statusCode, 201, create.body);
  const organisation = create.json() as { id: string; subscription: { enabledModules: string[] } };
  assert.deepEqual(organisation.subscription.enabledModules, ["employees", "attendance", "branches", "queue"]);

  const organisations = await app.inject({ method: "GET", url: "/platform/organisations", headers });
  assert.equal(organisations.statusCode, 200, organisations.body);
  assert.equal((organisations.json() as unknown[]).length, 1);

  const update = await app.inject({
    method: "PATCH",
    url: `/platform/organisations/${organisation.id}/subscription`,
    headers,
    payload: { enabledModules: ["forms", "approvals"], status: "active" },
  });
  assert.equal(update.statusCode, 200, update.body);
  assert.deepEqual((update.json() as { enabledModules: string[] }).enabledModules, ["forms", "workflow", "approvals"]);

  const invoices = await app.inject({ method: "GET", url: "/platform/invoices", headers });
  assert.equal(invoices.statusCode, 200, invoices.body);
  const invoice = (invoices.json() as Array<{ id: string; status: string }>)[0]!;
  assert.equal(invoice.status, "open");

  const paid = await app.inject({
    method: "POST",
    url: `/platform/invoices/${invoice.id}/mark-paid`,
    headers,
    payload: { paymentReference: "PAY-001" },
  });
  assert.equal(paid.statusCode, 200, paid.body);
  assert.equal((paid.json() as { status: string }).status, "paid");
});
