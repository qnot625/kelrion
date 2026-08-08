CREATE TABLE IF NOT EXISTS workflow_definitions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL,
  current_version integer NOT NULL,
  start_step_id text NOT NULL,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  triggers jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  published_at timestamptz,
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS workflow_definitions_tenant_status_idx
  ON workflow_definitions (tenant_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS workflow_definition_versions (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workflow_definition_id uuid NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  version integer NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  start_step_id text NOT NULL,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  triggers jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, workflow_definition_id, version)
);

CREATE INDEX IF NOT EXISTS workflow_definition_versions_latest_idx
  ON workflow_definition_versions (tenant_id, workflow_definition_id, version DESC);
CREATE INDEX IF NOT EXISTS workflow_definition_versions_triggers_gin_idx
  ON workflow_definition_versions USING gin (triggers);

CREATE TABLE IF NOT EXISTS workflow_instances (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workflow_definition_id uuid NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  workflow_version integer NOT NULL,
  status text NOT NULL,
  current_step_id text,
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  execution_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_by_user_id uuid NOT NULL,
  source_type text NOT NULL,
  source_reference_id text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  completed_at timestamptz,
  cancelled_at timestamptz,
  failed_at timestamptz,
  failure_reason text
);

CREATE INDEX IF NOT EXISTS workflow_instances_tenant_status_idx
  ON workflow_instances (tenant_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS workflow_instances_definition_idx
  ON workflow_instances (tenant_id, workflow_definition_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS workflow_instances_source_idx
  ON workflow_instances (tenant_id, source_type, source_reference_id)
  WHERE source_reference_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS workflow_human_tasks (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workflow_instance_id uuid NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  workflow_definition_id uuid NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  workflow_version integer NOT NULL,
  step_id text NOT NULL,
  kind text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL,
  assignee_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  candidate_user_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  candidate_roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  form_definition_id uuid REFERENCES form_definitions(id) ON DELETE SET NULL,
  due_at timestamptz,
  output jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS workflow_human_tasks_tenant_status_idx
  ON workflow_human_tasks (tenant_id, status, due_at);
CREATE INDEX IF NOT EXISTS workflow_human_tasks_instance_step_idx
  ON workflow_human_tasks (tenant_id, workflow_instance_id, step_id, status);
CREATE INDEX IF NOT EXISTS workflow_human_tasks_assignee_idx
  ON workflow_human_tasks (tenant_id, assignee_user_id, status)
  WHERE assignee_user_id IS NOT NULL;
