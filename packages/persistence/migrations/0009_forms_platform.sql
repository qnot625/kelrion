CREATE TABLE IF NOT EXISTS form_definitions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL,
  current_version integer NOT NULL,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  locale text NOT NULL DEFAULT 'en',
  template_key text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  published_at timestamptz
);

CREATE INDEX IF NOT EXISTS form_definitions_tenant_status_idx
  ON form_definitions (tenant_id, status);
CREATE INDEX IF NOT EXISTS form_definitions_tenant_updated_idx
  ON form_definitions (tenant_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS form_definitions_template_idx
  ON form_definitions (tenant_id, template_key)
  WHERE template_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS form_definition_versions (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  form_definition_id uuid NOT NULL REFERENCES form_definitions(id) ON DELETE CASCADE,
  version integer NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  locale text NOT NULL DEFAULT 'en',
  template_key text,
  published_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, form_definition_id, version)
);

CREATE INDEX IF NOT EXISTS form_definition_versions_latest_idx
  ON form_definition_versions (tenant_id, form_definition_id, version DESC);

CREATE TABLE IF NOT EXISTS form_submissions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  form_definition_id uuid NOT NULL REFERENCES form_definitions(id) ON DELETE CASCADE,
  form_version integer NOT NULL,
  submitter_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL,
  responses jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  submitted_at timestamptz
);

CREATE INDEX IF NOT EXISTS form_submissions_tenant_form_idx
  ON form_submissions (tenant_id, form_definition_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS form_submissions_tenant_submitter_idx
  ON form_submissions (tenant_id, submitter_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS form_submissions_tenant_status_idx
  ON form_submissions (tenant_id, status, updated_at DESC);
