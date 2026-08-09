import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import type { BillingInvoice } from "@adminops/control-plane";
import { createAppContext } from "../src/context.js";
import { buildServer } from "../src/server.js";
import {
  StripeBillingProvider,
  type BillingPaymentProvider,
  type StripeInvoicePaymentEvent,
} from "../src/billing/stripe-provider.js";

class FakeBillingProvider implements BillingPaymentProvider {
  readonly name = "stripe" as const;
  lastCheckout: {
    invoice: BillingInvoice;
    customerEmail?: string | null;
    successUrl: string;
    cancelUrl: string;
  } | null = null;

  async createInvoiceCheckout(input: {
    invoice: BillingInvoice;
    customerEmail?: string | null;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ sessionId: string; checkoutUrl: string }> {
    this.lastCheckout = input;
    return { sessionId: `cs_${input.invoice.id}`, checkoutUrl: "https://checkout.stripe.test/session" };
  }

  constructEvent(rawBody: Buffer, signature: string): unknown {
    if (signature !== "valid-signature") throw new Error("invalid signature");
    return JSON.parse(rawBody.toString("utf8")) as unknown;
  }

  invoicePaymentFromEvent(event: unknown): StripeInvoicePaymentEvent | null {
    if (!event || typeof event !== "object" || !("payment" in event)) return null;
    return (event as { payment: StripeInvoicePaymentEvent }).payment;
  }
}

async function signUp(
  app: ReturnType<typeof buildServer>,
  input: { slug: string; email: string; trialDays?: number; currency?: "NGN" | "USD" },
) {
  const response = await app.inject({
    method: "POST",
    url: "/organisations/signup",
    payload: {
      name: input.slug,
      slug: input.slug,
      ownerEmail: input.email,
      ownerPassword: "correct-horse",
      enabledModules: ["queue"],
      currency: input.currency ?? "USD",
      billingCycle: "monthly",
      trialDays: input.trialDays ?? 0,
    },
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json() as { tenant: { id: string }; token: string; userId: string };
}

async function invoicesFor(app: ReturnType<typeof buildServer>, slug: string, token: string) {
  const response = await app.inject({
    method: "GET",
    url: "/billing/invoices",
    headers: { "x-tenant-slug": slug, authorization: `Bearer ${token}` },
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json() as BillingInvoice[];
}

test("Stripe provider verifies signed raw payloads, rejects stale signatures and maps paid Checkout events", () => {
  const webhookSecret = "whsec_klerion_test";
  const provider = new StripeBillingProvider("rk_test", webhookSecret);
  const event = {
    id: "evt_signed",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_signed",
        currency: "usd",
        amount_total: 12500,
        payment_status: "paid",
        payment_intent: "pi_signed",
        metadata: {
          klerionTenantId: "tenant_signed",
          klerionInvoiceId: "invoice_signed",
        },
      },
    },
  };
  const rawBody = Buffer.from(JSON.stringify(event));
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", webhookSecret)
    .update(`${timestamp}.${rawBody.toString("utf8")}`, "utf8")
    .digest("hex");

  const parsed = provider.constructEvent(rawBody, `t=${timestamp},v1=${signature}`);
  assert.deepEqual(provider.invoicePaymentFromEvent(parsed), {
    eventId: "evt_signed",
    eventType: "checkout.session.completed",
    tenantId: "tenant_signed",
    invoiceId: "invoice_signed",
    sessionId: "cs_signed",
    paymentReference: "pi_signed",
    currency: "USD",
    amountTotal: 12500,
    paid: true,
  });
  assert.throws(() => provider.constructEvent(rawBody, `t=${timestamp},v1=${"0".repeat(64)}`));

  const staleTimestamp = timestamp - 601;
  const staleSignature = createHmac("sha256", webhookSecret)
    .update(`${staleTimestamp}.${rawBody.toString("utf8")}`, "utf8")
    .digest("hex");
  assert.throws(() => provider.constructEvent(rawBody, `t=${staleTimestamp},v1=${staleSignature}`));
});

test("billing checkout is owner-only, tenant-scoped and rejects non-payable invoices", async () => {
  const context = createAppContext();
  const provider = new FakeBillingProvider();
  const app = buildServer(context, { billingPaymentProvider: provider });

  const owner = await signUp(app, { slug: "payable-co", email: "owner@payable.test" });
  const [invoice] = await invoicesFor(app, "payable-co", owner.token);
  assert.ok(invoice);

  const checkout = await app.inject({
    method: "POST",
    url: `/billing/invoices/${invoice.id}/checkout`,
    headers: { "x-tenant-slug": "payable-co", authorization: `Bearer ${owner.token}`, host: "console.klerion.test" },
  });
  assert.equal(checkout.statusCode, 200, checkout.body);
  assert.equal(provider.lastCheckout?.invoice.id, invoice.id);
  assert.equal(provider.lastCheckout?.customerEmail, "owner@payable.test");
  assert.equal(provider.lastCheckout?.successUrl, "http://console.klerion.test/#billing?payment=success");
  assert.equal(provider.lastCheckout?.cancelUrl, "http://console.klerion.test/#billing?payment=cancelled");

  const member = await context.authService.signUp({ tenantId: owner.tenant.id, email: "member@payable.test", password: "correct-horse" });
  const forbidden = await app.inject({
    method: "POST",
    url: `/billing/invoices/${invoice.id}/checkout`,
    headers: { "x-tenant-slug": "payable-co", authorization: `Bearer ${member.token}` },
  });
  assert.equal(forbidden.statusCode, 403, forbidden.body);

  const other = await signUp(app, { slug: "other-co", email: "owner@other.test" });
  const [otherInvoice] = await invoicesFor(app, "other-co", other.token);
  assert.ok(otherInvoice);
  const crossTenant = await app.inject({
    method: "POST",
    url: `/billing/invoices/${otherInvoice.id}/checkout`,
    headers: { "x-tenant-slug": "payable-co", authorization: `Bearer ${owner.token}` },
  });
  assert.equal(crossTenant.statusCode, 404, crossTenant.body);

  const trial = await signUp(app, { slug: "trial-co", email: "owner@trial.test", trialDays: 14 });
  const [draftInvoice] = await invoicesFor(app, "trial-co", trial.token);
  assert.ok(draftInvoice);
  assert.equal(draftInvoice.status, "draft");
  const draftCheckout = await app.inject({
    method: "POST",
    url: `/billing/invoices/${draftInvoice.id}/checkout`,
    headers: { "x-tenant-slug": "trial-co", authorization: `Bearer ${trial.token}` },
  });
  assert.equal(draftCheckout.statusCode, 409, draftCheckout.body);

  await app.close();
  await context.close();
});

test("Stripe webhook requires a valid signature and exact invoice metadata, amount and currency", async () => {
  const context = createAppContext();
  const provider = new FakeBillingProvider();
  const app = buildServer(context, { billingPaymentProvider: provider });
  const owner = await signUp(app, { slug: "webhook-co", email: "owner@webhook.test", currency: "USD" });
  const [invoice] = await invoicesFor(app, "webhook-co", owner.token);
  assert.ok(invoice);

  const payment = (overrides: Partial<StripeInvoicePaymentEvent> = {}): StripeInvoicePaymentEvent => ({
    eventId: "evt_1",
    eventType: "checkout.session.completed",
    tenantId: owner.tenant.id,
    invoiceId: invoice.id,
    sessionId: "cs_1",
    paymentReference: "pi_1",
    currency: invoice.currency,
    amountTotal: invoice.amountDue - invoice.amountPaid,
    paid: true,
    ...overrides,
  });
  const webhook = (value: StripeInvoicePaymentEvent, signature?: string) => app.inject({
    method: "POST",
    url: "/billing/webhooks/stripe",
    headers: {
      "content-type": "application/json",
      ...(signature ? { "stripe-signature": signature } : {}),
    },
    payload: JSON.stringify({ payment: value }),
  });

  const missingSignature = await webhook(payment());
  assert.equal(missingSignature.statusCode, 400, missingSignature.body);

  const invalidSignature = await webhook(payment(), "wrong-signature");
  assert.equal(invalidSignature.statusCode, 400, invalidSignature.body);

  const wrongTenant = await webhook(payment({ tenantId: "another-tenant" }), "valid-signature");
  assert.equal(wrongTenant.statusCode, 400, wrongTenant.body);

  const wrongCurrency = await webhook(payment({ currency: "NGN" }), "valid-signature");
  assert.equal(wrongCurrency.statusCode, 400, wrongCurrency.body);
  assert.equal((await context.controlPlaneRepository.findInvoiceById(invoice.id))?.status, "open");

  const wrongAmount = await webhook(payment({ amountTotal: invoice.amountDue + 1 }), "valid-signature");
  assert.equal(wrongAmount.statusCode, 400, wrongAmount.body);
  assert.equal((await context.controlPlaneRepository.findInvoiceById(invoice.id))?.status, "open");

  const paid = await webhook(payment(), "valid-signature");
  assert.equal(paid.statusCode, 200, paid.body);
  assert.equal((await context.controlPlaneRepository.findInvoiceById(invoice.id))?.status, "paid");
  assert.equal((await context.controlPlaneRepository.findInvoiceById(invoice.id))?.paymentReference, "pi_1");

  const duplicate = await webhook(payment({ eventId: "evt_1_duplicate" }), "valid-signature");
  assert.equal(duplicate.statusCode, 200, duplicate.body);
  assert.equal((await context.controlPlaneRepository.findInvoiceById(invoice.id))?.status, "paid");

  const paidCheckout = await app.inject({
    method: "POST",
    url: `/billing/invoices/${invoice.id}/checkout`,
    headers: { "x-tenant-slug": "webhook-co", authorization: `Bearer ${owner.token}` },
  });
  assert.equal(paidCheckout.statusCode, 409, paidCheckout.body);

  await app.close();
  await context.close();
});
