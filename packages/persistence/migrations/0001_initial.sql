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

CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  address text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS branches_tenant_slug_key ON branches (tenant_id, slug);
CREATE INDEX IF NOT EXISTS branches_tenant_status_idx ON branches (tenant_id, status);

CREATE TABLE IF NOT EXISTS branch_operating_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches (id) ON DELETE CASCADE,
  day_of_week integer NOT NULL,
  open_minutes integer NOT NULL,
  close_minutes integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS branch_operating_windows_branch_id_idx ON branch_operating_windows (branch_id);

CREATE TABLE IF NOT EXISTS branch_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches (id) ON DELETE CASCADE,
  name text NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS branch_holidays_tenant_branch_idx ON branch_holidays (tenant_id, branch_id);

CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches (id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  capacity integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS departments_branch_slug_key ON departments (branch_id, slug);
CREATE INDEX IF NOT EXISTS departments_tenant_branch_idx ON departments (tenant_id, branch_id);

CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  duration_minutes integer NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS services_tenant_code_key ON services (tenant_id, code);
CREATE INDEX IF NOT EXISTS services_tenant_idx ON services (tenant_id);

CREATE TABLE IF NOT EXISTS service_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES services (id) ON DELETE CASCADE,
  photo_id_required boolean NOT NULL DEFAULT false,
  min_age integer,
  max_age integer,
  required_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  custom_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS service_requirements_service_key ON service_requirements (service_id);
CREATE INDEX IF NOT EXISTS service_requirements_tenant_service_idx ON service_requirements (tenant_id, service_id);

CREATE TABLE IF NOT EXISTS branch_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches (id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES services (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS branch_services_branch_service_key ON branch_services (branch_id, service_id);
CREATE INDEX IF NOT EXISTS branch_services_tenant_branch_idx ON branch_services (tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS branch_services_tenant_service_idx ON branch_services (tenant_id, service_id);
CREATE INDEX IF NOT EXISTS branch_services_tenant_service_status_idx ON branch_services (tenant_id, service_id, status);

CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches (id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES services (id) ON DELETE CASCADE,
  customer_email text NOT NULL,
  customer_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'booked',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS appointments_tenant_start_idx ON appointments (tenant_id, start_at);
CREATE INDEX IF NOT EXISTS appointments_tenant_status_idx ON appointments (tenant_id, status);
CREATE INDEX IF NOT EXISTS appointments_tenant_branch_idx ON appointments (tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS appointments_tenant_service_idx ON appointments (tenant_id, service_id);

CREATE TABLE IF NOT EXISTS waitlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES appointments (id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches (id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES services (id) ON DELETE CASCADE,
  customer_email text NOT NULL,
  customer_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  queue_position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS waitlists_tenant_idx ON waitlists (tenant_id);
CREATE INDEX IF NOT EXISTS waitlists_tenant_branch_idx ON waitlists (tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS waitlists_tenant_service_idx ON waitlists (tenant_id, service_id);
CREATE INDEX IF NOT EXISTS waitlists_tenant_queue_position_idx ON waitlists (tenant_id, queue_position);
