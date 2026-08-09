# Klerion platform billing operations

This runbook covers the production billing lifecycle, Stripe Checkout integration, reconciliation controls, and deployment requirements for Klerion.

## Source of truth

Klerion owns subscription state, module entitlements, invoices, billing periods, amounts, currencies, and overdue status. Stripe is a payment processor only.

A successful browser redirect from Stripe never marks an invoice paid. An invoice is reconciled only after Klerion receives a signed Stripe webhook and validates the tenant, invoice, currency, and exact outstanding amount against Klerion's own invoice record.

## Required production configuration

Set these values in the API deployment secret store. Never commit them to source control or expose them through the web application build.

- `STRIPE_RESTRICTED_KEY` — preferred Stripe API credential. Use the narrowest restricted-key permissions that allow the API to create Checkout Sessions for invoice payment.
- `STRIPE_SECRET_KEY` — supported fallback when a restricted key is not available. Prefer `STRIPE_RESTRICTED_KEY` for production.
- `STRIPE_WEBHOOK_SECRET` — signing secret for the Klerion Stripe webhook endpoint.
- `KLERION_PUBLIC_APP_URL` — public Company Console origin used for Checkout success/cancel redirects. In production it must be HTTPS, for example `https://app.example.com`.

Klerion reports Stripe as `not configured` until both an API key (`STRIPE_RESTRICTED_KEY` or `STRIPE_SECRET_KEY`) and `STRIPE_WEBHOOK_SECRET` are present.

Use separate Stripe test and live credentials for non-production and production environments. Rotate credentials through the deployment secret store and restart/redeploy the API after rotation.

## Stripe API behavior

Klerion creates Checkout Sessions with Stripe API version `2026-06-24.dahlia`.

For each payable Klerion invoice, the API sends:

- `mode=payment`
- the exact outstanding amount in the invoice currency
- one Klerion invoice line item
- the owner email when available
- Klerion tenant and invoice IDs in Checkout metadata
- Klerion tenant and invoice IDs in PaymentIntent metadata
- a stable idempotency key derived from the invoice ID and current outstanding balance

Klerion does not accept a client-supplied amount, currency, tenant ID, or payment reference for Stripe reconciliation.

## Webhook endpoint

The API route is:

`POST /billing/webhooks/stripe`

If the production gateway exposes the API under a prefix such as `/api`, configure Stripe with the externally reachable equivalent, for example:

`https://api-or-app.example.com/api/billing/webhooks/stripe`

Subscribe the endpoint to these events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`

The route intentionally consumes the raw JSON request body so the `Stripe-Signature` header can be verified before JSON is trusted.

Webhook reconciliation rejects a payment when any of the following is true:

- the signature is missing, malformed, expired, or invalid
- the event is not a supported successful Checkout event
- Checkout reports the payment as unpaid
- tenant metadata does not match the Klerion invoice
- invoice metadata does not resolve to a Klerion invoice
- currency differs from the Klerion invoice currency
- paid amount differs from the exact outstanding Klerion balance

Duplicate delivery is safe: an already-paid invoice remains paid and is not charged again by Klerion.

## Tenant owner payment flow

Organisation owners can open **Subscription & billing** and pay an `open` or `overdue` invoice when Stripe is configured.

1. The Company Console requests a Checkout Session from `POST /billing/invoices/:invoiceId/checkout`.
2. The API verifies tenant ownership and invoice state.
3. Stripe Checkout opens at the URL returned directly by Stripe.
4. Stripe redirects the browser to `#billing?payment=success` or `#billing?payment=cancelled`.
5. The Company Console reloads the billing workspace, but does not infer payment from the redirect.
6. The signed webhook is authoritative and updates the Klerion invoice.

Draft, void, already-paid, or cross-tenant invoices cannot create Checkout Sessions.

## Billing lifecycle automation

The API registers a billing lifecycle worker that reconciles on startup and then hourly.

Current rules:

- Trials can run for 0–90 days.
- An expired trial becomes active and its draft invoice becomes open.
- Open invoices receive a seven-day payment grace period.
- A past-due open invoice becomes `overdue`.
- An active subscription with an overdue invoice becomes `past_due`.
- A verified payment marks the invoice `paid` and reactivates a `past_due` subscription.
- When an active billing period ends, Klerion advances the period and creates the next renewal invoice.

The God-admin control plane also exposes **Reconcile billing now** as an operational fallback. This runs the same lifecycle reconciliation immediately.

## God-admin reporting

`GET /platform/reporting/overview` returns platform operational reporting for authorised platform billing administrators/God administrators:

- organisation health
- subscription status counts
- trials ending within 30 days
- renewals within 30 days
- invoice status counts
- module adoption
- recurring, invoiced, paid, outstanding, and overdue values

Financial metrics are reported separately for NGN, USD, GBP, and EUR. Klerion must never combine nominal amounts from different currencies into one total.

## Manual payment fallback

The God-admin invoice table retains **Mark paid** for externally verified payments that did not use the configured Stripe flow.

Only use it after independently verifying the payment. Record a real external payment reference. The same lifecycle service is used so a valid manual payment can reactivate a past-due subscription.

## Deployment verification checklist

Before enabling live payments:

1. Set production token/bootstrap secrets required by the wider Klerion deployment.
2. Set `STRIPE_RESTRICTED_KEY` (preferred) or `STRIPE_SECRET_KEY`.
3. Set `STRIPE_WEBHOOK_SECRET`.
4. Set HTTPS `KLERION_PUBLIC_APP_URL`.
5. Register the externally reachable webhook URL in Stripe.
6. Enable the two supported Checkout events.
7. Confirm the Company Console shows Stripe as configured.
8. Create a small live or test invoice and open Checkout from the organisation owner Billing view.
9. Confirm the browser redirect alone does not mark it paid.
10. Confirm the signed webhook marks the matching invoice paid.
11. Confirm a wrong amount/currency/signature is rejected in non-production verification.
12. Confirm the God-admin report keeps every currency separate.

## Incident handling

If Stripe is unavailable or credentials are removed, invoice generation and Klerion billing lifecycle processing continue. Online Checkout returns unavailable, while God-admin reporting and verified manual reconciliation remain available.

If webhook delivery is delayed, do not mark invoices paid based solely on the success redirect. Use Stripe's event delivery history to retry the signed webhook, or use the manual fallback only after independently verifying settlement.
