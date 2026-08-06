import type { FormSubmission, SubmissionStatus } from "./form-submission.js";

export interface FormSubmissionRepository {
  findById(tenantId: string, id: string): Promise<FormSubmission | null>;
  findByTenant(tenantId: string): Promise<FormSubmission[]>;
  findByForm(tenantId: string, formDefinitionId: string): Promise<FormSubmission[]>;
  findByStatus(tenantId: string, status: SubmissionStatus): Promise<FormSubmission[]>;
  save(submission: FormSubmission): Promise<void>;
  deleteDraft(tenantId: string, id: string): Promise<void>;
}
