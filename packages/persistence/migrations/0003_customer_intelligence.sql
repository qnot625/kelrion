CREATE TABLE IF NOT EXISTS customer_cases (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  reference text NOT NULL,
  customer_email text NOT NULL,
  subject text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  priority text NOT NULL,
  status text NOT NULL,
  owner_user_id uuid,
  sla_due_at timestamptz NOT NULL,
  first_response_at timestamptz,
  resolved_at timestamptz,
  resolution text,
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_cases_tenant_reference_key ON customer_cases (tenant_id, reference);
CREATE INDEX IF NOT EXISTS customer_cases_tenant_status_idx ON customer_cases (tenant_id, status);
CREATE INDEX IF NOT EXISTS customer_cases_tenant_sla_idx ON customer_cases (tenant_id, sla_due_at);
CREATE INDEX IF NOT EXISTS customer_cases_tenant_customer_idx ON customer_cases (tenant_id, customer_email);

CREATE TABLE IF NOT EXISTS case_comments (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES customer_cases (id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL,
  body text NOT NULL,
  visibility text NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS case_comments_tenant_case_idx ON case_comments (tenant_id, case_id, created_at);
