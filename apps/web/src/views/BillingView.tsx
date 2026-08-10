import { CheckCircle2, Clock3, CreditCard, ExternalLink, ReceiptText, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { klerionApi, type ApiInvoice, type ApiSubscription } from "../lib/api";
import {
  createBillingCheckout,
  getBillingPaymentProvider,
  type ApiBillingPaymentProviderStatus,
} from "../lib/billing-ops-api";
import type { KlerionSession } from "../lib/session";

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount / 100);
}

export function BillingView({ session }: { readonly session: KlerionSession }) {
  const [subscription, setSubscription] = useState<ApiSubscription | null>(null);
  const [invoices, setInvoices] = useState<ApiInvoice[]>([]);
  const [provider, setProvider] = useState<ApiBillingPaymentProviderStatus | null>(null);
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const isOwner = session.roles.includes("owner");
  const paymentResult = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("payment");

  const loadBilling = useCallback(async () => {
    if (session.mode === "demo") return;
    const requests: [Promise<ApiSubscription>, Promise<ApiInvoice[]>, Promise<ApiBillingPaymentProviderStatus | null>] = [
      klerionApi.getSubscription(session),
      klerionApi.listBillingInvoices(session),
      isOwner ? getBillingPaymentProvider(session) : Promise.resolve(null),
    ];
    const [nextSubscription, nextInvoices, nextProvider] = await Promise.all(requests);
    setSubscription(nextSubscription);
    setInvoices(nextInvoices);
    setProvider(nextProvider);
  }, [session, isOwner]);

  useEffect(() => {
    if (session.mode === "demo") return;
    let active = true;
    void loadBilling().catch((cause) => active && setError(cause instanceof Error ? cause.message : "Unable to load billing."));
    return () => { active = false; };
  }, [session, loadBilling]);

  async function payInvoice(invoice: ApiInvoice) {
    setPayingInvoiceId(invoice.id);
    setError("");
    try {
      const checkout = await createBillingCheckout(session, invoice.id);
      window.location.assign(checkout.checkoutUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to open Stripe Checkout.");
      setPayingInvoiceId(null);
    }
  }

  if (session.mode === "demo") {
    return <section className="view"><header className="view-heading"><div><span className="eyebrow">Subscription & billing</span><h1>Commercial control for every organisation</h1><p>Live organisations can review entitlements, billing periods and invoice history here.</p></div></header><div className="foundation-card"><span><ReceiptText /></span><div><strong>Preview billing workspace</strong><p>Demo mode does not create invoices or payment records.</p></div></div></section>;
  }

  return (
    <section className="view billing-view">
      <header className="view-heading"><div><span className="eyebrow">Subscription & billing</span><h1>Manage enabled modules and commercial status</h1><p>Organisation owners can review the subscription and pay open invoices securely. Module changes remain controlled by the Klerion God admin.</p></div></header>
      {paymentResult === "success" && <div className="inline-alert">Stripe Checkout completed. Invoice status below is authoritative and updates only after Klerion verifies the signed Stripe webhook.</div>}
      {paymentResult === "cancelled" && <div className="inline-alert">Stripe Checkout was cancelled. No invoice status was changed.</div>}
      {error && <div className="inline-alert">{error}</div>}
      {subscription && <>
        <div className="billing-summary-grid">
          <article><ShieldCheck /><span><small>Status</small><strong>{subscription.status}</strong></span></article>
          <article><CreditCard /><span><small>{subscription.billingCycle} subscription</small><strong>{money(subscription.unitAmount, subscription.currency)}</strong></span></article>
          <article><Clock3 /><span><small>Current period ends</small><strong>{new Date(subscription.currentPeriodEnd).toLocaleDateString()}</strong></span></article>
          <article><CheckCircle2 /><span><small>Enabled modules</small><strong>{subscription.enabledModules.length}</strong></span></article>
        </div>
        <article className="panel subscription-modules"><header><div><h2>Enabled module entitlements</h2><p>Navigation and API access are generated from this list.</p></div></header><div>{subscription.enabledModules.map((module) => <span key={module}><CheckCircle2 size={14} />{module}</span>)}</div></article>
      </>}
      {isOwner && provider && <article className="panel"><header><div><h2>Online payments</h2><p>{provider.configured ? `Stripe is configured${provider.usingRestrictedKey ? " with a restricted API key" : ""}. Signed webhooks remain the source of truth for payment reconciliation.` : "Online payment is not configured for this Klerion deployment. Invoices remain visible and can be reconciled by a platform administrator."}</p></div><em className={`invoice-status ${provider.configured ? "paid" : "draft"}`}>{provider.configured ? "available" : "not configured"}</em></header>{!provider.configured && provider.missing.length > 0 && <small>Deployment configuration required: {provider.missing.join(", ")}</small>}</article>}
      <article className="panel invoice-panel"><header><div><h2>Invoice history</h2><p>Amounts are stored in minor currency units and linked to verified payment references.</p></div></header>{invoices.length === 0 ? <p className="panel-empty">No invoices are available.</p> : <div className="invoice-table"><div className="invoice-head"><span>Invoice</span><span>Status</span><span>Issued</span><span>Due</span><span>Amount</span><span>Payment</span></div>{invoices.map((invoice) => { const payable = isOwner && provider?.configured && (invoice.status === "open" || invoice.status === "overdue"); return <div className="invoice-row" key={invoice.id}><span><strong>{invoice.number}</strong><small>{invoice.lineItems.length} module lines</small></span><em className={`invoice-status ${invoice.status}`}>{invoice.status}</em><span>{new Date(invoice.issuedAt).toLocaleDateString()}</span><span>{new Date(invoice.dueAt).toLocaleDateString()}</span><strong>{money(invoice.amountDue, invoice.currency)}</strong><span>{payable ? <button className="primary" disabled={payingInvoiceId === invoice.id} onClick={() => void payInvoice(invoice)}>{payingInvoiceId === invoice.id ? "Opening…" : <><ExternalLink size={14} />Pay with Stripe</>}</button> : invoice.status === "paid" ? invoice.paymentReference ?? "Paid" : invoice.status === "draft" ? "Available after trial" : provider?.configured === false ? "Online payment unavailable" : "—"}</span></div>; })}</div>}</article>
    </section>
  );
}
