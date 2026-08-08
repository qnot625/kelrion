ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS requester_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL;

UPDATE leave_requests AS leave
SET requester_employee_id = employee.id
FROM employees AS employee
WHERE leave.requester_employee_id IS NULL
  AND employee.tenant_id = leave.tenant_id
  AND employee.user_id = leave.requester_user_id;

ALTER TABLE leave_requests
  ALTER COLUMN requester_user_id DROP NOT NULL;

ALTER TABLE leave_requests
  DROP CONSTRAINT IF EXISTS leave_requests_requester_user_id_fkey;

ALTER TABLE leave_requests
  ADD CONSTRAINT leave_requests_requester_user_id_fkey
  FOREIGN KEY (requester_user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS leave_requests_tenant_employee_idx
  ON leave_requests(tenant_id, requester_employee_id);

ALTER TABLE lifecycle_plans
  ADD COLUMN IF NOT EXISTS subject_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL;

ALTER TABLE lifecycle_plans
  ALTER COLUMN subject_user_id DROP NOT NULL;

UPDATE lifecycle_plans AS plan
SET subject_employee_id = employee.id
FROM employees AS employee
WHERE plan.subject_employee_id IS NULL
  AND plan.subject_user_id IS NOT NULL
  AND employee.tenant_id = plan.tenant_id
  AND employee.user_id = plan.subject_user_id;

ALTER TABLE lifecycle_plans
  DROP CONSTRAINT IF EXISTS lifecycle_plans_subject_user_id_fkey;

ALTER TABLE lifecycle_plans
  ADD CONSTRAINT lifecycle_plans_subject_user_id_fkey
  FOREIGN KEY (subject_user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS lifecycle_plans_tenant_employee_idx
  ON lifecycle_plans(tenant_id, subject_employee_id);
