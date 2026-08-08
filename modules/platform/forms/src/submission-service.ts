import { randomUUID } from "node:crypto";
import type { AuditLog } from "@adminops/audit";
import { FormAccessError, FormDefinitionNotFoundError, FormSubmissionNotFoundError, FormsValidationError } from "./errors.js";
import type { FormDefinitionRepository } from "./form-repository.js";
import { FormSubmission } from "./form-submission.js";
import type { FormSubmissionRepository } from "./form-submission-repository.js";
import { FieldResponse, SubmissionMetadata, type FieldResponseProps, type SubmissionMetadataProps } from "./form-submission-response.js";

export class SubmissionService {
  constructor(
    private readonly submissions: FormSubmissionRepository,
    private readonly forms: FormDefinitionRepository,
    private readonly auditLog?: AuditLog,
  ) {}

  async createDraft(input: {
    tenantId: string;
    formDefinitionId: string;
    actorUserId: string;
    id?: string;
    responses?: readonly FieldResponseProps[];
    metadata?: Omit<SubmissionMetadataProps, "submittedByUserId">;
  }): Promise<FormSubmission> {
    const form = await this.forms.findLatestPublishedVersion(input.tenantId, input.formDefinitionId);
    if (!form) throw new FormDefinitionNotFoundError(input.formDefinitionId);
    const id = input.id?.trim() || randomUUID();
    if (await this.submissions.findById(input.tenantId, id)) throw new FormsValidationError(`Form submission '${id}' already exists`);
    const submission = new FormSubmission({
      id,
      tenantId: input.tenantId,
      formDefinitionId: form.id,
      formVersion: form.version,
      responses: (input.responses ?? []).map((response) => new FieldResponse(response)),
      metadata: new SubmissionMetadata({ ...input.metadata, submittedByUserId: input.actorUserId, locale: input.metadata?.locale ?? form.locale }),
    });
    await this.submissions.save(submission);
    await this.audit("form_submission.draft_created", submission, input.actorUserId);
    return submission;
  }

  async saveDraft(input: {
    tenantId: string;
    id: string;
    actorUserId: string;
    canManage?: boolean;
    responses: readonly FieldResponseProps[];
    metadata?: Omit<SubmissionMetadataProps, "submittedByUserId">;
  }): Promise<FormSubmission> {
    const submission = await this.requireAccessible(input.tenantId, input.id, input.actorUserId, input.canManage);
    try {
      submission.saveDraft(
        input.responses.map((response) => new FieldResponse(response)),
        { ...input.metadata, submittedByUserId: submission.metadata.submittedByUserId },
      );
    } catch (error) { throw this.validation(error); }
    await this.submissions.save(submission);
    await this.audit("form_submission.draft_saved", submission, input.actorUserId);
    return submission;
  }

  async submit(input: {
    tenantId: string;
    id: string;
    actorUserId: string;
    canManage?: boolean;
    responses?: readonly FieldResponseProps[];
    metadata?: Omit<SubmissionMetadataProps, "submittedByUserId">;
  }): Promise<FormSubmission> {
    const submission = await this.requireAccessible(input.tenantId, input.id, input.actorUserId, input.canManage);
    const definition = await this.forms.findPublishedVersion(
      input.tenantId,
      submission.formDefinitionId,
      submission.formVersion,
    );
    if (!definition) throw new FormDefinitionNotFoundError(submission.formDefinitionId);
    try {
      if (input.responses) {
        submission.saveDraft(
          input.responses.map((response) => new FieldResponse(response)),
          { ...input.metadata, submittedByUserId: submission.metadata.submittedByUserId },
        );
      }
      submission.submit(definition, { ...input.metadata, submittedByUserId: submission.metadata.submittedByUserId });
    } catch (error) { throw this.validation(error); }
    await this.submissions.save(submission);
    await this.audit("form_submission.submitted", submission, input.actorUserId);
    return submission;
  }

  async validate(input: { tenantId: string; id: string; actorUserId: string }): Promise<FormSubmission> {
    const submission = await this.require(input.tenantId, input.id);
    const definition = await this.forms.findPublishedVersion(input.tenantId, submission.formDefinitionId, submission.formVersion);
    if (!definition) throw new FormDefinitionNotFoundError(submission.formDefinitionId);
    try { submission.validate(definition); } catch (error) { throw this.validation(error); }
    await this.submissions.save(submission);
    await this.audit("form_submission.validated", submission, input.actorUserId);
    return submission;
  }

  async get(input: { tenantId: string; id: string; actorUserId: string; canManage?: boolean }): Promise<FormSubmission> {
    return this.requireAccessible(input.tenantId, input.id, input.actorUserId, input.canManage);
  }

  async listOwn(tenantId: string, actorUserId: string): Promise<FormSubmission[]> {
    return this.submissions.findByOwner(tenantId, actorUserId);
  }

  async listForForm(tenantId: string, formDefinitionId: string): Promise<FormSubmission[]> {
    return this.submissions.findByForm(tenantId, formDefinitionId);
  }

  async deleteDraft(input: { tenantId: string; id: string; actorUserId: string; canManage?: boolean }): Promise<void> {
    const submission = await this.requireAccessible(input.tenantId, input.id, input.actorUserId, input.canManage);
    if (submission.status !== "DRAFT") throw new FormsValidationError("Only draft submissions can be deleted");
    await this.submissions.deleteDraft(input.tenantId, input.id);
    await this.audit("form_submission.draft_deleted", submission, input.actorUserId);
  }

  private async require(tenantId: string, id: string): Promise<FormSubmission> {
    const submission = await this.submissions.findById(tenantId, id);
    if (!submission) throw new FormSubmissionNotFoundError(id);
    return submission;
  }

  private async requireAccessible(tenantId: string, id: string, actorUserId: string, canManage = false): Promise<FormSubmission> {
    const submission = await this.require(tenantId, id);
    if (!canManage && submission.metadata.submittedByUserId !== actorUserId) throw new FormAccessError();
    return submission;
  }

  private validation(error: unknown) {
    return new FormsValidationError(error instanceof Error ? error.message : "Invalid form submission");
  }

  private async audit(action: string, submission: FormSubmission, actorUserId: string) {
    if (!this.auditLog) return;
    await this.auditLog.record({
      tenantId: submission.tenantId,
      actorUserId,
      action,
      targetType: "form_submission",
      targetId: submission.id,
      metadata: {
        formDefinitionId: submission.formDefinitionId,
        formVersion: submission.formVersion,
        status: submission.status,
      },
    });
  }
}
