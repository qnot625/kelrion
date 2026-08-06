CREATE TABLE IF NOT EXISTS platform_administrators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_administrators_email_key ON platform_administrators (email);

CREATE TABLE IF NOT EXISTS organisation_subscriptions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  enabled_modules jsonb NOT NULL DEFAULT '[]'::jsonb,
  billing_cycle text NOT NULL,
  currency text NOT NULL,
  status text NOT NULL,
  trial_ends_at timestamptz,
  current_period_start timestamptz NOT NULL,
  current_period_end timestamptz NOT NULL,
  unit_amount integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS organisation_subscriptions_tenant_key ON organisation_subscriptions (tenant_id);
CREATE INDEX IF NOT EXISTS organisation_subscriptions_status_idx ON organisation_subscriptions (status);

CREATE TABLE IF NOT EXISTS billing_invoices (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number text NOT NULL,
  currency text NOT NULL,
  billing_cycle text NOT NULL,
  status text NOT NULL,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  amount_due integer NOT NULL,
  amount_paid integer NOT NULL DEFAULT 0,
  issued_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL,
  paid_at timestamptz,
  payment_reference text
);
CREATE UNIQUE INDEX IF NOT EXISTS billing_invoices_number_key ON billing_invoices (number);
CREATE INDEX IF NOT EXISTS billing_invoices_tenant_issued_idx ON billing_invoices (tenant_id, issued_at);
CREATE INDEX IF NOT EXISTS billing_invoices_status_due_idx ON billing_invoices (status, due_at);
