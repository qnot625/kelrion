import assert from "node:assert/strict";
import { test } from "node:test";
import { InMemoryUserRepository } from "@adminops/identity";
import { InMemoryTenantRepository } from "@adminops/tenancy";
import {
  BillingLifecycleService,
  ControlPlaneService,
  InMemoryControlPlaneRepository,
  buildPlatformOperationalReport,
} from "../src/index.js";

test("billing lifecycle activates expired trials, opens invoices with grace and marks overdue subscriptions past due", async () => {
  const tenants = new InMemoryTenantRepository();
  const users = new InMemoryUserRepository();
  const repository = new InMemoryControlPlaneRepository();
  const controlPlane = new ControlPlaneService(repository, tenants, users);
  const organisation = await controlPlane.createOrganisation({
    name: "Billing Trial",
    slug: "billing-trial",
    ownerEmail: "owner@billing.test",
    ownerPassword: "correct-horse",
    enabledModules: ["queue"],
    trialDays: 1,
  });
  const subscription = organisation.subscription!;
  const lifecycle = new BillingLifecycleService(repository);
  const trialEnd = new Date(subscription.trialEndsAt!.getTime() + 1);
  const activated = await lifecycle.reconcile(trialEnd);
  assert.equal(activated.trialsActivated, 1);
  const active = await repository.findSubscriptionByTenant(organisation.id);
  assert.equal(active?.status, "active");
  const [invoice] = await repository.listInvoices(organisation.id);
  assert.equal(invoice?.status, "open");
  assert.ok(invoice && invoice.dueAt.getTime() > trialEnd.getTime());

  const afterGrace = new Date(invoice!.dueAt.getTime() + 1);
  const overdue = await lifecycle.reconcile(afterGrace);
  assert.equal(overdue.invoicesOverdue, 1);
  assert.equal((await repository.findSubscriptionByTenant(organisation.id))?.status, "past_due");
  await lifecycle.markInvoicePaid(invoice!.id, "pi_test", afterGrace);
  assert.equal((await repository.findSubscriptionByTenant(organisation.id))?.status, "active");
  assert.equal((await repository.findInvoiceById(invoice!.id))?.status, "paid");
});

test("billing lifecycle creates a renewal invoice once per elapsed active period", async () => {
  const tenants = new InMemoryTenantRepository();
  const users = new InMemoryUserRepository();
  const repository = new InMemoryControlPlaneRepository();
  const controlPlane = new ControlPlaneService(repository, tenants, users);
  const organisation = await controlPlane.createOrganisation({
    name: "Renewal Co",
    slug: "renewal-co",
    ownerEmail: "owner@renewal.test",
    ownerPassword: "correct-horse",
    enabledModules: ["notifications"],
    trialDays: 0,
  });
  const subscription = organisation.subscription!;
  const lifecycle = new BillingLifecycleService(repository);
  const initialInvoice = (await repository.listInvoices(organisation.id))[0]!;
  assert.equal(initialInvoice.status, "open");
  assert.ok(initialInvoice.dueAt.getTime() > initialInvoice.issuedAt.getTime());
  await lifecycle.markInvoicePaid(initialInvoice.id, "pi_initial");
  const result = await lifecycle.reconcile(new Date(subscription.currentPeriodEnd.getTime() + 1));
  assert.equal(result.renewalsCreated, 1);
  assert.equal((await repository.listInvoices(organisation.id)).length, 2);
  const second = await lifecycle.reconcile(new Date(subscription.currentPeriodEnd.getTime() + 2));
  assert.equal(second.renewalsCreated, 0);
});

test("platform reporting keeps currencies separate and reports adoption", () => {
  const now = new Date("2026-08-09T12:00:00.000Z");
  const report = buildPlatformOperationalReport({
    now,
    organisationStatuses: ["active", "active", "suspended"],
    subscriptions: [
      {
        id: "sub-ngn", tenantId: "tenant-ngn", enabledModules: ["branches", "queue"], billingCycle: "monthly", currency: "NGN", status: "active",
        trialEndsAt: null, currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + 10 * 86400000), unitAmount: 100000, createdAt: now, updatedAt: now,
      },
      {
        id: "sub-usd", tenantId: "tenant-usd", enabledModules: ["notifications"], billingCycle: "annual", currency: "USD", status: "active",
        trialEndsAt: null, currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + 10 * 86400000), unitAmount: 12000, createdAt: now, updatedAt: now,
      },
    ],
    invoices: [
      { id: "inv-ngn", tenantId: "tenant-ngn", number: "N1", currency: "NGN", billingCycle: "monthly", status: "open", lineItems: [], amountDue: 100000, amountPaid: 0, issuedAt: now, dueAt: new Date(now.getTime() - 1000), paidAt: null, paymentReference: null },
      { id: "inv-usd", tenantId: "tenant-usd", number: "U1", currency: "USD", billingCycle: "annual", status: "paid", lineItems: [], amountDue: 12000, amountPaid: 12000, issuedAt: now, dueAt: now, paidAt: now, paymentReference: "pi" },
    ],
  });
  assert.equal(report.currencies.find((value) => value.currency === "NGN")?.overdue, 100000);
  assert.equal(report.currencies.find((value) => value.currency === "USD")?.paid, 12000);
  assert.equal(report.moduleAdoption.find((value) => value.key === "queue")?.enabledOrganisations, 1);
  assert.equal(report.organisations.suspended, 1);
});
