ALTER TABLE appointments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS appointments_tenant_branch_window_idx
  ON appointments(tenant_id, branch_id, start_at, end_at);

CREATE TABLE IF NOT EXISTS appointment_waitlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  customer_email TEXT NOT NULL,
  customer_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  desired_start_at TIMESTAMPTZ,
  desired_end_at TIMESTAMPTZ,
  queue_position INTEGER NOT NULL CHECK (queue_position > 0),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'promoted', 'removed')),
  promoted_appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (desired_start_at IS NULL AND desired_end_at IS NULL)
    OR (desired_start_at IS NOT NULL AND desired_end_at IS NOT NULL AND desired_end_at > desired_start_at)
  )
);
CREATE INDEX IF NOT EXISTS appointment_waitlists_tenant_created_idx
  ON appointment_waitlists(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS appointment_waitlists_queue_idx
  ON appointment_waitlists(tenant_id, branch_id, service_id, status, queue_position);
CREATE UNIQUE INDEX IF NOT EXISTS appointment_waitlists_waiting_position_key
  ON appointment_waitlists(tenant_id, branch_id, service_id, queue_position)
  WHERE status = 'waiting';
