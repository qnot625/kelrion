CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  employee_number text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  hire_date date NOT NULL,
  employment_type text NOT NULL,
  employment_status text NOT NULL DEFAULT 'active',
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  position_id uuid,
  manager_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  termination_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employees_employment_type_check CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'intern', 'temporary')),
  CONSTRAINT employees_employment_status_check CHECK (employment_status IN ('active', 'on_leave', 'suspended', 'terminated')),
  CONSTRAINT employees_manager_not_self_check CHECK (manager_id IS NULL OR manager_id <> id),
  CONSTRAINT employees_tenant_number_key UNIQUE (tenant_id, employee_number),
  CONSTRAINT employees_tenant_email_key UNIQUE (tenant_id, email)
);

CREATE UNIQUE INDEX IF NOT EXISTS employees_tenant_user_key
  ON employees(tenant_id, user_id)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS employees_tenant_status_idx ON employees(tenant_id, employment_status);
CREATE INDEX IF NOT EXISTS employees_tenant_department_idx ON employees(tenant_id, department_id);
CREATE INDEX IF NOT EXISTS employees_tenant_branch_idx ON employees(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS employees_tenant_manager_idx ON employees(tenant_id, manager_id);

CREATE TABLE IF NOT EXISTS attendance_records (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  status text NOT NULL DEFAULT 'idle',
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  breaks jsonb NOT NULL DEFAULT '[]'::jsonb,
  active_duration_minutes integer NOT NULL DEFAULT 0,
  total_break_minutes integer NOT NULL DEFAULT 0,
  exceptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_records_status_check CHECK (status IN ('idle', 'clocked_in', 'on_break', 'clocked_out')),
  CONSTRAINT attendance_records_duration_check CHECK (active_duration_minutes >= 0 AND total_break_minutes >= 0),
  CONSTRAINT attendance_records_tenant_employee_date_key UNIQUE (tenant_id, employee_id, work_date)
);

CREATE INDEX IF NOT EXISTS attendance_records_tenant_date_idx ON attendance_records(tenant_id, work_date DESC);
CREATE INDEX IF NOT EXISTS attendance_records_tenant_employee_idx ON attendance_records(tenant_id, employee_id, work_date DESC);

CREATE TABLE IF NOT EXISTS attendance_idempotency (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  payload_hash text NOT NULL,
  record_id uuid NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS attendance_corrections (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  requested_action text NOT NULL,
  requested_at timestamptz NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_corrections_action_check CHECK (requested_action IN ('clock_in', 'clock_out', 'break_start', 'break_end')),
  CONSTRAINT attendance_corrections_status_check CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS attendance_corrections_tenant_status_idx ON attendance_corrections(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS attendance_corrections_tenant_employee_idx ON attendance_corrections(tenant_id, employee_id, created_at DESC);
