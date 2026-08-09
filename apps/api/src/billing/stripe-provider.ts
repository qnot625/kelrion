import { createHmac, timingSafeEqual } from "node:crypto";
import type { BillingInvoice } from "@adminops/control-plane";

const STRIPE_API_VERSION = "2026-06-24.dahlia";
const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;

interface StripeCheckoutSession {
  readonly id: string;
  readonly url?: string | null;
  readonly currency?: string | null;
  readonly amount_total?: number | null;
  readonly payment_status?: string | null;
  readonly payment_intent?: string | null | { readonly id?: string };
  readonly metadata?: Readonly<Record<string, string>> | null;
}

interface StripeEvent {
  readonly id: string;
  readonly type: string;
  readonly data: { readonly object: StripeCheckoutSession };
}

export interface StripeInvoicePaymentEvent {
  readonly eventId: string;
  readonly eventType: string;
  readonly tenantId: string;
  readonly invoiceId: string;
  readonly sessionId: string;
  readonly paymentReference: string;
  readonly currency: string;
  readonly amountTotal: number;
  readonly paid: boolean;
}

export interface BillingPaymentProvider {
  readonly name: "stripe";
  createInvoiceCheckout(input: {
    invoice: BillingInvoice;
    customerEmail?: string | null;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ sessionId: string; checkoutUrl: string }>;
  constructEvent(rawBody: Buffer, signature: string): unknown;
  invoicePaymentFromEvent(event: unknown): StripeInvoicePaymentEvent | null;
}

function appendCheckoutParameters(
  body: URLSearchParams,
  input: {
    invoice: BillingInvoice;
    customerEmail?: string | null;
    successUrl: string;
    cancelUrl: string;
  },
  outstanding: number,
): void {
  body.set("mode", "payment");
  body.set("client_reference_id", input.invoice.id);
  body.set("success_url", input.successUrl);
  body.set("cancel_url", input.cancelUrl);
  if (input.customerEmail?.trim()) body.set("customer_email", input.customerEmail.trim());
  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price_data][currency]", input.invoice.currency.toLowerCase());
  body.set("line_items[0][price_data][unit_amount]", String(outstanding));
  body.set("line_items[0][price_data][product_data][name]", `Klerion invoice ${input.invoice.number}`);
  body.set(
    "line_items[0][price_data][product_data][description]",
    `${input.invoice.billingCycle === "annual" ? "Annual" : "Monthly"} Klerion subscription`,
  );
  body.set("metadata[klerionInvoiceId]", input.invoice.id);
  body.set("metadata[klerionTenantId]", input.invoice.tenantId);
  body.set("metadata[klerionInvoiceNumber]", input.invoice.number);
  body.set("payment_intent_data[metadata][klerionInvoiceId]", input.invoice.id);
  body.set("payment_intent_data[metadata][klerionTenantId]", input.invoice.tenantId);
}

function signatureParts(header: string): { timestamp: number; signatures: string[] } {
  let timestamp = Number.NaN;
  const signatures: string[] = [];
  for (const value of header.split(",")) {
    const [key, raw] = value.trim().split("=", 2);
    if (key === "t") timestamp = Number(raw);
    if (key === "v1" && raw) signatures.push(raw);
  }
  if (!Number.isFinite(timestamp) || signatures.length === 0) throw new Error("Malformed Stripe signature");
  return { timestamp, signatures };
}

function secureHexEquals(expectedHex: string, suppliedHex: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(suppliedHex)) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const supplied = Buffer.from(suppliedHex, "hex");
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export class StripeBillingProvider implements BillingPaymentProvider {
  readonly name = "stripe" as const;

  constructor(
    private readonly apiKey: string,
    private readonly webhookSecret: string,
    private readonly webhookToleranceSeconds = DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
  ) {}

  async createInvoiceCheckout(input: {
    invoice: BillingInvoice;
    customerEmail?: string | null;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ sessionId: string; checkoutUrl: string }> {
    const outstanding = Math.max(0, input.invoice.amountDue - input.invoice.amountPaid);
    if (outstanding < 1) throw new Error("Invoice has no outstanding balance");

    const body = new URLSearchParams();
    appendCheckoutParameters(body, input, outstanding);
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Version": STRIPE_API_VERSION,
        "Idempotency-Key": `klerion-invoice-${input.invoice.id}-balance-${outstanding}`,
      },
      body,
    });
    const payload = await response.json() as StripeCheckoutSession & { readonly error?: { readonly message?: string } };
    if (!response.ok) throw new Error(payload.error?.message ?? `Stripe Checkout failed with HTTP ${response.status}`);
    if (!payload.id || !payload.url) throw new Error("Stripe did not return a Checkout URL");
    return { sessionId: payload.id, checkoutUrl: payload.url };
  }

  constructEvent(rawBody: Buffer, signature: string): StripeEvent {
    const { timestamp, signatures } = signatureParts(signature);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - timestamp) > this.webhookToleranceSeconds) throw new Error("Stripe webhook timestamp is outside tolerance");
    const signedPayload = `${timestamp}.${rawBody.toString("utf8")}`;
    const expected = createHmac("sha256", this.webhookSecret).update(signedPayload, "utf8").digest("hex");
    if (!signatures.some((candidate) => secureHexEquals(expected, candidate))) throw new Error("Invalid Stripe signature");
    return JSON.parse(rawBody.toString("utf8")) as StripeEvent;
  }

  invoicePaymentFromEvent(value: unknown): StripeInvoicePaymentEvent | null {
    if (!value || typeof value !== "object") return null;
    const event = value as StripeEvent;
    if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") return null;
    const session = event.data?.object;
    if (!session?.id) return null;
    const tenantId = session.metadata?.klerionTenantId?.trim();
    const invoiceId = session.metadata?.klerionInvoiceId?.trim();
    if (!tenantId || !invoiceId) return null;
    const paymentReference = typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? session.id;
    return {
      eventId: event.id,
      eventType: event.type,
      tenantId,
      invoiceId,
      sessionId: session.id,
      paymentReference,
      currency: session.currency?.toUpperCase() ?? "",
      amountTotal: session.amount_total ?? 0,
      paid: session.payment_status === "paid",
    };
  }
}

export function stripeBillingConfiguration() {
  const apiKey = process.env.STRIPE_RESTRICTED_KEY?.trim() || process.env.STRIPE_SECRET_KEY?.trim() || "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || "";
  return {
    provider: "stripe" as const,
    configured: Boolean(apiKey && webhookSecret),
    usingRestrictedKey: Boolean(process.env.STRIPE_RESTRICTED_KEY?.trim()),
    missing: [
      !apiKey ? "STRIPE_RESTRICTED_KEY (or STRIPE_SECRET_KEY)" : null,
      !webhookSecret ? "STRIPE_WEBHOOK_SECRET" : null,
    ].filter((value): value is string => Boolean(value)),
  };
}

export function createStripeBillingProviderFromEnv(): StripeBillingProvider | null {
  const apiKey = process.env.STRIPE_RESTRICTED_KEY?.trim() || process.env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!apiKey || !webhookSecret) return null;
  return new StripeBillingProvider(apiKey, webhookSecret);
}
