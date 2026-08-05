CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tenants_slug_key ON tenants (slug);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  email text NOT NULL,
  password_hash text NOT NULL,
  roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_email_key ON users (tenant_id, email);

CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  customer_email text NOT NULL,
  service_name text NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'booked',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS appointments_tenant_start_idx ON appointments (tenant_id, start_at);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  actor_user_id uuid,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_hash text,
  hash text NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_events_tenant_occurred_idx ON audit_events (tenant_id, occurred_at);

CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  description text,
  manager_employee_id uuid,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS departments_tenant_code_key ON departments (tenant_id, code);
CREATE INDEX IF NOT EXISTS departments_tenant_status_idx ON departments (tenant_id, status);

CREATE TABLE IF NOT EXISTS positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  title text NOT NULL,
  code text NOT NULL,
  department_id uuid REFERENCES departments (id) ON DELETE SET NULL,
  description text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS positions_tenant_code_key ON positions (tenant_id, code);
CREATE INDEX IF NOT EXISTS positions_tenant_dept_idx ON positions (tenant_id, department_id);

CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  employee_number text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  phone text,
  department_id uuid REFERENCES departments (id) ON DELETE SET NULL,
  position_id uuid REFERENCES positions (id) ON DELETE SET NULL,
  manager_id uuid,
  branch_id text,
  employment_type text NOT NULL DEFAULT 'full_time',
  employment_status text NOT NULL DEFAULT 'active',
  hire_date text NOT NULL,
  termination_date text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS employees_tenant_number_key ON employees (tenant_id, employee_number);
CREATE UNIQUE INDEX IF NOT EXISTS employees_tenant_email_key ON employees (tenant_id, email);
CREATE INDEX IF NOT EXISTS employees_tenant_status_idx ON employees (tenant_id, employment_status);
CREATE INDEX IF NOT EXISTS employees_tenant_dept_idx ON employees (tenant_id, department_id);
CREATE INDEX IF NOT EXISTS employees_tenant_branch_idx ON employees (tenant_id, branch_id);

CREATE TABLE IF NOT EXISTS attendance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  timestamp timestamptz NOT NULL,
  idempotency_key text NOT NULL,
  source text NOT NULL DEFAULT 'web',
  location jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_events_tenant_idempotency_key ON attendance_events (tenant_id, idempotency_key);
CREATE INDEX IF NOT EXISTS attendance_events_tenant_employee_ts_idx ON attendance_events (tenant_id, employee_id, timestamp);

CREATE TABLE IF NOT EXISTS attendance_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  work_date text NOT NULL,
  first_clock_in timestamptz,
  last_clock_out timestamptz,
  total_work_minutes integer NOT NULL DEFAULT 0,
  total_break_minutes integer NOT NULL DEFAULT 0,
  overtime_minutes integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'present',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_summaries_tenant_emp_date_key ON attendance_summaries (tenant_id, employee_id, work_date);
CREATE INDEX IF NOT EXISTS attendance_summaries_tenant_date_idx ON attendance_summaries (tenant_id, work_date);

CREATE TABLE IF NOT EXISTS attendance_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  target_event_id uuid REFERENCES attendance_events (id) ON DELETE SET NULL,
  requested_event_type text NOT NULL,
  requested_timestamp timestamptz NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_corrections_tenant_status_idx ON attendance_corrections (tenant_id, status);
CREATE INDEX IF NOT EXISTS attendance_corrections_tenant_emp_idx ON attendance_corrections (tenant_id, employee_id);
