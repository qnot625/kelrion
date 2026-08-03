CREATE TABLE IF NOT EXISTS queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  branch_id uuid,
  name text NOT NULL,
  code text NOT NULL,
  prefix text NOT NULL,
  strategy text NOT NULL DEFAULT 'fifo',
  is_active boolean NOT NULL DEFAULT true,
  current_sequence integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS queues_tenant_code_key ON queues (tenant_id, code);
CREATE INDEX IF NOT EXISTS queues_tenant_branch_idx ON queues (tenant_id, branch_id);

CREATE TABLE IF NOT EXISTS queue_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  queue_id uuid NOT NULL REFERENCES queues (id) ON DELETE CASCADE,
  ticket_number integer NOT NULL,
  display_number text NOT NULL,
  priority_level text NOT NULL DEFAULT 'standard',
  status text NOT NULL DEFAULT 'waiting',
  customer_name text,
  customer_phone text,
  customer_email text,
  appointment_id uuid REFERENCES appointments (id) ON DELETE SET NULL,
  service_id uuid,
  counter_number text,
  idempotency_key text,
  joined_at timestamptz NOT NULL DEFAULT now(),
  called_at timestamptz,
  served_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS queue_tickets_queue_number_key ON queue_tickets (queue_id, ticket_number);
CREATE UNIQUE INDEX IF NOT EXISTS queue_tickets_tenant_idempotency_key ON queue_tickets (tenant_id, idempotency_key);
CREATE INDEX IF NOT EXISTS queue_tickets_tenant_queue_status_idx ON queue_tickets (tenant_id, queue_id, status);
CREATE INDEX IF NOT EXISTS queue_tickets_tenant_status_joined_idx ON queue_tickets (tenant_id, status, joined_at);

CREATE TABLE IF NOT EXISTS queue_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  queue_id uuid NOT NULL REFERENCES queues (id) ON DELETE CASCADE,
  active_tickets_count integer NOT NULL DEFAULT 0,
  average_wait_seconds integer NOT NULL DEFAULT 0,
  snapshot_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS queue_snapshots_tenant_queue_snapshot_idx ON queue_snapshots (tenant_id, queue_id, snapshot_at);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  recipient text NOT NULL,
  channel text NOT NULL,
  template_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  retry_count integer NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_tenant_status_created_idx ON notifications (tenant_id, status, created_at);
CREATE INDEX IF NOT EXISTS notifications_tenant_recipient_idx ON notifications (tenant_id, recipient);
