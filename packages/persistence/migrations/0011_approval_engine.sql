CREATE TABLE IF NOT EXISTS approval_policies (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL,
  current_version integer NOT NULL,
  stages jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  published_at timestamptz,
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS approval_policies_tenant_status_idx
  ON approval_policies (tenant_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS approval_policy_versions (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  approval_policy_id uuid NOT NULL REFERENCES approval_policies(id) ON DELETE CASCADE,
  version integer NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  stages jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, approval_policy_id, version)
);

CREATE INDEX IF NOT EXISTS approval_policy_versions_latest_idx
  ON approval_policy_versions (tenant_id, approval_policy_id, version DESC);

CREATE TABLE IF NOT EXISTS approval_requests (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  approval_policy_id uuid NOT NULL REFERENCES approval_policies(id) ON DELETE CASCADE,
  policy_version integer NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  requested_by_user_id uuid NOT NULL,
  source_type text NOT NULL,
  source_reference_id text,
  workflow_task_id uuid,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL,
  current_stage_index integer NOT NULL DEFAULT 0,
  stage_started_at timestamptz NOT NULL,
  current_stage_due_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  decided_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text
);

CREATE INDEX IF NOT EXISTS approval_requests_tenant_status_idx
  ON approval_requests (tenant_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS approval_requests_requester_idx
  ON approval_requests (tenant_id, requested_by_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS approval_requests_policy_idx
  ON approval_requests (tenant_id, approval_policy_id, policy_version, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS approval_requests_source_unique_idx
  ON approval_requests (tenant_id, approval_policy_id, policy_version, source_type, source_reference_id)
  WHERE source_reference_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS approval_requests_workflow_task_unique_idx
  ON approval_requests (tenant_id, workflow_task_id)
  WHERE workflow_task_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS approval_decisions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  approval_request_id uuid NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  stage_id text NOT NULL,
  actor_user_id uuid NOT NULL,
  decision text NOT NULL,
  comment text NOT NULL DEFAULT '',
  decided_at timestamptz NOT NULL,
  UNIQUE (tenant_id, approval_request_id, stage_id, actor_user_id)
);

CREATE INDEX IF NOT EXISTS approval_decisions_request_idx
  ON approval_decisions (tenant_id, approval_request_id, decided_at ASC);
