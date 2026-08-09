CREATE TABLE IF NOT EXISTS queue_configurations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  prefix text NOT NULL,
  average_service_minutes integer NOT NULL,
  allow_walk_ins boolean NOT NULL DEFAULT true,
  allow_appointment_check_in boolean NOT NULL DEFAULT true,
  max_early_check_in_minutes integer,
  max_late_check_in_minutes integer,
  max_concurrent_serving integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS queue_configurations_default_unique_idx
  ON queue_configurations (tenant_id, branch_id, service_id)
  WHERE department_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS queue_configurations_department_unique_idx
  ON queue_configurations (tenant_id, branch_id, service_id, department_id)
  WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS queue_configurations_tenant_branch_idx
  ON queue_configurations (tenant_id, branch_id, service_id);

CREATE TABLE IF NOT EXISTS queue_entries (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  public_token uuid NOT NULL,
  ticket_number text NOT NULL,
  kind text NOT NULL,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  customer jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority text NOT NULL,
  priority_adjustment integer NOT NULL DEFAULT 0,
  priority_score integer NOT NULL,
  check_in_source text NOT NULL,
  status text NOT NULL,
  station_id text,
  serving_staff_user_id uuid,
  recall_count integer NOT NULL DEFAULT 0,
  checked_in_at timestamptz NOT NULL,
  called_at timestamptz,
  service_started_at timestamptz,
  completed_at timestamptz,
  no_show_at timestamptz,
  cancelled_at timestamptz,
  transferred_at timestamptz,
  idempotency_key text,
  transfer_from_entry_id uuid REFERENCES queue_entries(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (tenant_id, public_token)
);

CREATE UNIQUE INDEX IF NOT EXISTS queue_entries_idempotency_unique_idx
  ON queue_entries (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS queue_entries_waiting_idx
  ON queue_entries (tenant_id, branch_id, service_id, status, priority_score DESC, checked_in_at ASC);
CREATE INDEX IF NOT EXISTS queue_entries_branch_status_idx
  ON queue_entries (tenant_id, branch_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS queue_entries_appointment_idx
  ON queue_entries (tenant_id, appointment_id)
  WHERE appointment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS queue_events (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sequence bigint NOT NULL,
  id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES queue_entries(id) ON DELETE CASCADE,
  type text NOT NULL,
  actor_user_id uuid,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, sequence),
  UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS queue_events_entry_idx
  ON queue_events (tenant_id, entry_id, sequence ASC);
CREATE INDEX IF NOT EXISTS queue_events_branch_idx
  ON queue_events (tenant_id, branch_id, sequence ASC);

CREATE TABLE IF NOT EXISTS queue_event_sequences (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  last_sequence bigint NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS queue_ticket_sequences (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  bucket_date text NOT NULL,
  last_sequence integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, branch_id, service_id, bucket_date)
);
