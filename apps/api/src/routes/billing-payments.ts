import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AuditLog } from "@adminops/audit";
import type { BillingLifecycleService } from "@adminops/control-plane";
import type { UserRepository } from "@adminops/identity";
import { requirePermission } from "../plugins/require-permission.js";
import {
  stripeBillingConfiguration,
  type BillingPaymentProvider,
} from "../billing/stripe-provider.js";

function publicBaseUrl(request: FastifyRequest): string {
  const configured = process.env.KLERION_PUBLIC_APP_URL?.trim();
  if (configured) {
    const url = new URL(configured);
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
      throw new Error("KLERION_PUBLIC_APP_URL must use HTTPS in production");
    }
    return url.toString().replace(/\/$/, "");
  }
  if (process.env.NODE_ENV === "production") throw new Error("KLERION_PUBLIC_APP_URL must be set in production");
  const host = request.headers.host ?? "localhost:5173";
  return `${request.protocol}://${host}`;
}

export function registerBillingPaymentRoutes(
  app: FastifyInstance,
  billingLifecycle: BillingLifecycleService,
  users: UserRepository,
  provider: BillingPaymentProvider | null,
): void {
  app.get("/billing/payment-provider", { preHandler: requirePermission("tenant:manage") }, async () => stripeBillingConfiguration());

  app.post<{ Params: { invoiceId: string } }>("/billing/invoices/:invoiceId/checkout", { preHandler: requirePermission("tenant:manage") }, async (request, reply) => {
    if (!provider) return reply.code(503).send({ error: "Stripe billing is not configured", ...stripeBillingConfiguration() });
    const tenantId = request.tenant!.tenantId;
    const invoice = await billingLifecycle.getInvoice(request.params.invoiceId);
    if (!invoice || invoice.tenantId !== tenantId) return reply.code(404).send({ error: "Invoice not found" });
    if (invoice.status === "paid") return reply.code(409).send({ error: "Invoice is already paid" });
    if (invoice.status === "void" || invoice.status === "draft") {
      return reply.code(409).send({ error: `Invoice cannot be paid while it is ${invoice.status}` });
    }
    const user = await users.findById(tenantId, request.auth!.userId);
    try {
      const base = publicBaseUrl(request);
      const checkout = await provider.createInvoiceCheckout({
        invoice,
        customerEmail: user?.email ?? null,
        successUrl: `${base}/#billing?payment=success`,
        cancelUrl: `${base}/#billing?payment=cancelled`,
      });
      return reply.send({ provider: provider.name, ...checkout });
    } catch (error) {
      return reply.code(502).send({ error: error instanceof Error ? error.message : "Could not create payment checkout" });
    }
  });
}

export function registerStripeBillingWebhookRoutes(
  app: FastifyInstance,
  billingLifecycle: BillingLifecycleService,
  provider: BillingPaymentProvider | null,
  auditLog: AuditLog,
): void {
  app.post("/billing/webhooks/stripe", async (request, reply) => {
    if (!provider) return reply.code(503).send({ error: "Stripe billing is not configured" });
    const signature = typeof request.headers["stripe-signature"] === "string" ? request.headers["stripe-signature"] : "";
    if (!signature) return reply.code(400).send({ error: "Stripe-Signature header is required" });
    if (!Buffer.isBuffer(request.body)) return reply.code(400).send({ error: "Webhook body must be raw bytes" });
    let event: unknown;
    try {
      event = provider.constructEvent(request.body, signature);
    } catch {
      return reply.code(400).send({ error: "Invalid Stripe webhook signature" });
    }
    const payment = provider.invoicePaymentFromEvent(event);
    if (!payment || !payment.paid) return reply.send({ received: true, reconciled: false });
    const invoice = await billingLifecycle.getInvoice(payment.invoiceId);
    if (!invoice || invoice.tenantId !== payment.tenantId) return reply.code(400).send({ error: "Webhook invoice metadata is invalid" });
    const outstanding = Math.max(0, invoice.amountDue - invoice.amountPaid);
    if (invoice.status !== "paid" && (payment.currency !== invoice.currency || payment.amountTotal !== outstanding)) {
      return reply.code(400).send({ error: "Stripe payment amount or currency does not match the Klerion invoice" });
    }
    const reconciled = await billingLifecycle.markInvoicePaid(invoice.id, payment.paymentReference);
    await auditLog.record({
      tenantId: invoice.tenantId,
      actorUserId: null,
      action: "billing.stripe_payment_reconciled",
      targetType: "billing_invoice",
      targetId: invoice.id,
      metadata: {
        stripeEventId: payment.eventId,
        stripeSessionId: payment.sessionId,
        paymentReference: payment.paymentReference,
        amountTotal: payment.amountTotal,
        currency: payment.currency,
      },
    });
    return reply.send({ received: true, reconciled: Boolean(reconciled), invoiceId: invoice.id });
  });
}
