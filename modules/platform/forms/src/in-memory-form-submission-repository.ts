import type { FormSubmission, SubmissionStatus } from "./form-submission.js";
import type { FormSubmissionRepository } from "./form-submission-repository.js";

export class InMemoryFormSubmissionRepository implements FormSubmissionRepository {
  private readonly submissions = new Map<string, FormSubmission>();

  async findById(tenantId: string, id: string): Promise<FormSubmission | null> {
    const value = this.submissions.get(this.key(tenantId, id));
    return value?.tenantId === tenantId ? value.clone() : null;
  }

  async findByTenant(tenantId: string): Promise<FormSubmission[]> {
    return this.filter((submission) => submission.tenantId === tenantId);
  }

  async findByForm(tenantId: string, formDefinitionId: string): Promise<FormSubmission[]> {
    return this.filter((submission) => submission.tenantId === tenantId && submission.formDefinitionId === formDefinitionId);
  }

  async findByOwner(tenantId: string, userId: string): Promise<FormSubmission[]> {
    return this.filter((submission) => submission.tenantId === tenantId && submission.metadata.submittedByUserId === userId);
  }

  async findByStatus(tenantId: string, status: SubmissionStatus): Promise<FormSubmission[]> {
    return this.filter((submission) => submission.tenantId === tenantId && submission.status === status);
  }

  async save(submission: FormSubmission): Promise<void> {
    this.submissions.set(this.key(submission.tenantId, submission.id), submission.clone());
  }

  async deleteDraft(tenantId: string, id: string): Promise<void> {
    const submission = this.submissions.get(this.key(tenantId, id));
    if (!submission || submission.tenantId !== tenantId) return;
    if (submission.status !== "DRAFT") throw new Error("Only draft submissions can be deleted");
    this.submissions.delete(this.key(tenantId, id));
  }

  clear(): void { this.submissions.clear(); }

  private key(tenantId: string, id: string) { return `${tenantId}:${id}`; }
  private filter(predicate: (submission: FormSubmission) => boolean) {
    return [...this.submissions.values()]
      .filter(predicate)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((submission) => submission.clone());
  }
}
