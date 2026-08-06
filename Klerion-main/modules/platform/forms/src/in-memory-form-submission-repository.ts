import { FormSubmission, type SubmissionStatus } from "./form-submission.js";
import { FieldResponse, SubmissionMetadata } from "./form-submission-response.js";
import type { FormSubmissionRepository } from "./form-submission-repository.js";

export class InMemoryFormSubmissionRepository implements FormSubmissionRepository {
  private readonly submissions = new Map<string, FormSubmission>();

  private makeKey(tenantId: string, id: string): string {
    return `${tenantId}:${id}`;
  }

  private clone(submission: FormSubmission): FormSubmission {
    return new FormSubmission({
      id: submission.id,
      tenantId: submission.tenantId,
      formDefinitionId: submission.formDefinitionId,
      formVersion: submission.formVersion,
      status: submission.status,
      responses: submission.responses.map((r) => new FieldResponse(r)),
      metadata: new SubmissionMetadata(submission.metadata),
      createdAt: new Date(submission.createdAt),
      updatedAt: new Date(submission.updatedAt),
      submittedAt: submission.submittedAt ? new Date(submission.submittedAt) : null,
    });
  }

  async findById(tenantId: string, id: string): Promise<FormSubmission | null> {
    const key = this.makeKey(tenantId, id);
    const item = this.submissions.get(key);
    return item ? this.clone(item) : null;
  }

  async findByTenant(tenantId: string): Promise<FormSubmission[]> {
    const results: FormSubmission[] = [];
    for (const sub of this.submissions.values()) {
      if (sub.tenantId === tenantId) {
        results.push(this.clone(sub));
      }
    }
    return results;
  }

  async findByForm(tenantId: string, formDefinitionId: string): Promise<FormSubmission[]> {
    const results: FormSubmission[] = [];
    for (const sub of this.submissions.values()) {
      if (sub.tenantId === tenantId && sub.formDefinitionId === formDefinitionId) {
        results.push(this.clone(sub));
      }
    }
    return results;
  }

  async findByStatus(tenantId: string, status: SubmissionStatus): Promise<FormSubmission[]> {
    const results: FormSubmission[] = [];
    for (const sub of this.submissions.values()) {
      if (sub.tenantId === tenantId && sub.status === status) {
        results.push(this.clone(sub));
      }
    }
    return results;
  }

  async save(submission: FormSubmission): Promise<void> {
    const key = this.makeKey(submission.tenantId, submission.id);
    this.submissions.set(key, this.clone(submission));
  }

  async deleteDraft(tenantId: string, id: string): Promise<void> {
    const key = this.makeKey(tenantId, id);
    const existing = this.submissions.get(key);
    if (!existing) {
      throw new Error(`Submission '${id}' not found for tenant '${tenantId}'`);
    }

    if (existing.status !== "DRAFT") {
      throw new Error(
        `Cannot delete submission '${id}' because its status is '${existing.status}' (only DRAFT can be deleted)`,
      );
    }

    this.submissions.delete(key);
  }

  public clear(): void {
    this.submissions.clear();
  }
}
