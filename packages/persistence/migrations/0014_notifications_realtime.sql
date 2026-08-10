CREATE TABLE IF NOT EXISTS notification_sequences (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  last_sequence bigint NOT NULL DEFAULT 0 CHECK (last_sequence >= 0)
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sequence bigint NOT NULL,
  recipient_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  kind text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  severity text NOT NULL,
  entity_type text,
  entity_id text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sequence)
);

CREATE INDEX IF NOT EXISTS notifications_user_sequence_idx
  ON notifications (tenant_id, recipient_user_id, sequence);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON notifications (tenant_id, recipient_user_id, sequence)
  WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_entity_idx
  ON notifications (tenant_id, entity_type, entity_id);

CREATE TABLE IF NOT EXISTS notification_preferences (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_enabled boolean NOT NULL DEFAULT false,
  sms_enabled boolean NOT NULL DEFAULT false,
  push_enabled boolean NOT NULL DEFAULT false,
  email_address text,
  sms_number text,
  push_endpoint text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS notification_templates (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key text NOT NULL,
  channel text NOT NULL,
  title_template text NOT NULL,
  body_template text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key, channel)
);

CREATE INDEX IF NOT EXISTS notification_templates_tenant_status_idx
  ON notification_templates (tenant_id, status, key);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel text NOT NULL,
  destination text,
  status text NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  provider_reference text,
  next_attempt_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_deliveries_pending_idx
  ON notification_deliveries (tenant_id, status, next_attempt_at, created_at);
CREATE INDEX IF NOT EXISTS notification_deliveries_notification_idx
  ON notification_deliveries (tenant_id, notification_id, created_at);
