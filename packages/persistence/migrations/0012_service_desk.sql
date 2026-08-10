CREATE TABLE IF NOT EXISTS service_desk_catalog_items (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL,
  current_version integer NOT NULL,
  intake_mode text NOT NULL,
  form_definition_id uuid,
  workflow_definition_id uuid,
  approval_policy_id uuid,
  default_ticket_type text NOT NULL,
  default_priority text NOT NULL,
  category_key text,
  assignment_group_id text,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  published_at timestamptz,
  archived_at timestamptz,
  UNIQUE (tenant_id, key)
);

CREATE INDEX IF NOT EXISTS service_desk_catalog_items_tenant_status_idx
  ON service_desk_catalog_items (tenant_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS service_desk_catalog_item_versions (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  catalog_item_id uuid NOT NULL REFERENCES service_desk_catalog_items(id) ON DELETE CASCADE,
  version integer NOT NULL,
  key text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  intake_mode text NOT NULL,
  form_definition_id uuid,
  workflow_definition_id uuid,
  approval_policy_id uuid,
  default_ticket_type text NOT NULL,
  default_priority text NOT NULL,
  category_key text,
  assignment_group_id text,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  published_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, catalog_item_id, version)
);

CREATE INDEX IF NOT EXISTS service_desk_catalog_versions_latest_idx
  ON service_desk_catalog_item_versions (tenant_id, catalog_item_id, version DESC);

CREATE TABLE IF NOT EXISTS service_desk_sla_policies (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  ticket_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  priorities jsonb NOT NULL DEFAULT '[]'::jsonb,
  category_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  first_response_minutes integer NOT NULL,
  resolution_minutes integer NOT NULL,
  pause_statuses jsonb NOT NULL DEFAULT '[]'::jsonb,
  escalation_thresholds jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS service_desk_sla_policies_tenant_idx
  ON service_desk_sla_policies (tenant_id, enabled, updated_at DESC);

CREATE TABLE IF NOT EXISTS service_desk_tickets (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reference text NOT NULL,
  type text NOT NULL,
  priority text NOT NULL,
  status text NOT NULL,
  subject text NOT NULL,
  description text NOT NULL DEFAULT '',
  category_key text,
  requester jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL,
  assignment_group_id text,
  assignee_user_id uuid,
  watcher_user_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  workflow_instance_id uuid,
  approval_request_id uuid,
  sla_policy_id uuid REFERENCES service_desk_sla_policies(id) ON DELETE SET NULL,
  first_response_due_at timestamptz,
  resolution_due_at timestamptz,
  first_responded_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  cancelled_at timestamptz,
  paused_at timestamptz,
  accumulated_paused_ms bigint NOT NULL DEFAULT 0,
  escalation_level integer NOT NULL DEFAULT 0,
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (tenant_id, reference)
);

CREATE INDEX IF NOT EXISTS service_desk_tickets_tenant_status_idx
  ON service_desk_tickets (tenant_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS service_desk_tickets_assignee_idx
  ON service_desk_tickets (tenant_id, assignee_user_id, status, updated_at DESC)
  WHERE assignee_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS service_desk_tickets_sla_idx
  ON service_desk_tickets (tenant_id, resolution_due_at, status)
  WHERE resolution_due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS service_desk_tickets_workflow_idx
  ON service_desk_tickets (tenant_id, workflow_instance_id)
  WHERE workflow_instance_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS service_desk_tickets_approval_idx
  ON service_desk_tickets (tenant_id, approval_request_id)
  WHERE approval_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS service_desk_comments (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL REFERENCES service_desk_tickets(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL,
  visibility text NOT NULL,
  body text NOT NULL DEFAULT '',
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS service_desk_comments_ticket_idx
  ON service_desk_comments (tenant_id, ticket_id, created_at ASC);

CREATE TABLE IF NOT EXISTS service_desk_status_events (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL REFERENCES service_desk_tickets(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  actor_user_id uuid NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS service_desk_status_events_ticket_idx
  ON service_desk_status_events (tenant_id, ticket_id, created_at ASC);
