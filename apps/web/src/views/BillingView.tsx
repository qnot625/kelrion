import { CheckCircle2, Clock3, CreditCard, ReceiptText, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { klerionApi, type ApiInvoice, type ApiSubscription } from "../lib/api";
import type { KlerionSession } from "../lib/session";

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount / 100);
}

export function BillingView({ session }: { readonly session: KlerionSession }) {
  const [subscription, setSubscription] = useState<ApiSubscription | null>(null);
  const [invoices, setInvoices] = useState<ApiInvoice[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (session.mode === "demo") return;
    let active = true;
    void Promise.all([klerionApi.getSubscription(session), klerionApi.listBillingInvoices(session)])
      .then(([nextSubscription, nextInvoices]) => {
        if (!active) return;
        setSubscription(nextSubscription);
        setInvoices(nextInvoices);
      })
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : "Unable to load billing."));
    return () => { active = false; };
  }, [session]);

  if (session.mode === "demo") {
    return <section className="view"><header className="view-heading"><div><span className="eyebrow">Subscription & billing</span><h1>Commercial control for every organisation</h1><p>Live organisations can review entitlements, billing periods and invoice history here.</p></div></header><div className="foundation-card"><span><ReceiptText /></span><div><strong>Preview billing workspace</strong><p>Demo mode does not create invoices or payment records.</p></div></div></section>;
  }

  return (
    <section className="view billing-view">
      <header className="view-heading"><div><span className="eyebrow">Subscription & billing</span><h1>Manage enabled modules and commercial status</h1><p>Organisation owners can review the subscription. Module changes are currently controlled by the Klerion God admin.</p></div></header>
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
      <article className="panel invoice-panel"><header><div><h2>Invoice history</h2><p>Amounts are stored in minor currency units and linked to payment references.</p></div></header>{invoices.length === 0 ? <p className="panel-empty">No invoices are available.</p> : <div className="invoice-table"><div className="invoice-head"><span>Invoice</span><span>Status</span><span>Issued</span><span>Due</span><span>Amount</span></div>{invoices.map((invoice) => <div className="invoice-row" key={invoice.id}><span><strong>{invoice.number}</strong><small>{invoice.lineItems.length} module lines</small></span><em className={`invoice-status ${invoice.status}`}>{invoice.status}</em><span>{new Date(invoice.issuedAt).toLocaleDateString()}</span><span>{new Date(invoice.dueAt).toLocaleDateString()}</span><strong>{money(invoice.amountDue, invoice.currency)}</strong></div>)}</div>}</article>
    </section>
  );
}
