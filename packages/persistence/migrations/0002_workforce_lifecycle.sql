CREATE TABLE IF NOT EXISTS leave_requests (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  requester_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type text NOT NULL,
  start_date timestamptz NOT NULL,
  end_date timestamptz NOT NULL,
  working_days integer NOT NULL,
  reason text NOT NULL,
  status text NOT NULL,
  decided_by_user_id uuid,
  decision_note text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS leave_requests_tenant_requester_idx
  ON leave_requests (tenant_id, requester_user_id);

CREATE INDEX IF NOT EXISTS leave_requests_tenant_status_idx
  ON leave_requests (tenant_id, status);

CREATE TABLE IF NOT EXISTS lifecycle_plans (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  subject_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  due_at timestamptz,
  status text NOT NULL,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS lifecycle_plans_tenant_subject_idx
  ON lifecycle_plans (tenant_id, subject_user_id);

CREATE INDEX IF NOT EXISTS lifecycle_plans_tenant_status_idx
  ON lifecycle_plans (tenant_id, status);
