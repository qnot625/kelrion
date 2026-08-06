import type { FormDefinitionRepository } from "./form-repository.js";
import { FormSubmission, type SubmissionStatus } from "./form-submission.js";
import type { FormSubmissionRepository } from "./form-submission-repository.js";
import {
  FieldResponse,
  SubmissionMetadata,
  validateFormResponses,
  type SubmissionValidationError,
} from "./form-submission-response.js";
import type { AuditLogRecorder } from "./form-service.js";

export interface CreateDraftInput {
  readonly id: string;
  readonly tenantId: string;
  readonly formDefinitionId: string;
  readonly formVersion?: number;
  readonly responses?: readonly FieldResponse[];
  readonly metadata?: SubmissionMetadata;
  readonly actorId?: string;
}

export interface SaveDraftInput {
  readonly id: string;
  readonly tenantId: string;
  readonly responses: readonly FieldResponse[];
  readonly metadataUpdates?: Partial<SubmissionMetadata>;
  readonly actorId?: string;
}

export interface SubmitFormInput {
  readonly id: string;
  readonly tenantId: string;
  readonly responses?: readonly FieldResponse[];
  readonly metadataUpdates?: Partial<SubmissionMetadata>;
  readonly actorId?: string;
}

export class SubmissionService {
  constructor(
    private readonly submissionRepo: FormSubmissionRepository,
    private readonly formRepo: FormDefinitionRepository,
    private readonly auditRecorder?: AuditLogRecorder,
  ) {}

  public async createDraft(input: CreateDraftInput): Promise<FormSubmission> {
    const existing = await this.submissionRepo.findById(input.tenantId, input.id);
    if (existing) {
      throw new Error(
        `FormSubmission with ID '${input.id}' already exists for tenant '${input.tenantId}'`,
      );
    }

    const formDef = await this.formRepo.findById(input.tenantId, input.formDefinitionId);
    if (!formDef) {
      throw new Error(
        `FormDefinition '${input.formDefinitionId}' not found for tenant '${input.tenantId}'`,
      );
    }

    const versionToUse = input.formVersion ?? formDef.version;
    if (versionToUse !== formDef.version) {
      throw new Error(
        `Cannot create draft for form '${input.formDefinitionId}' with version ${versionToUse} because latest version is ${formDef.version}`,
      );
    }

    const submission = new FormSubmission({
      id: input.id,
      tenantId: input.tenantId,
      formDefinitionId: input.formDefinitionId,
      formVersion: versionToUse,
      status: "DRAFT",
      responses: input.responses,
      metadata: input.metadata,
    });

    await this.submissionRepo.save(submission);

    if (this.auditRecorder) {
      await this.auditRecorder.record({
        tenantId: input.tenantId,
        action: "FORM_SUBMISSION_DRAFT_CREATED",
        actorId: input.actorId,
        targetId: submission.id,
        details: {
          formDefinitionId: submission.formDefinitionId,
          formVersion: submission.formVersion,
        },
      });
    }

    return submission;
  }

  public async saveDraft(input: SaveDraftInput): Promise<FormSubmission> {
    const submission = await this.submissionRepo.findById(input.tenantId, input.id);
    if (!submission) {
      throw new Error(
        `FormSubmission '${input.id}' not found for tenant '${input.tenantId}'`,
      );
    }

    submission.saveDraft(input.responses, input.metadataUpdates);
    await this.submissionRepo.save(submission);

    if (this.auditRecorder) {
      await this.auditRecorder.record({
        tenantId: input.tenantId,
        action: "FORM_SUBMISSION_DRAFT_UPDATED",
        actorId: input.actorId,
        targetId: submission.id,
        details: {
          fieldCount: input.responses.length,
        },
      });
    }

    return submission;
  }

  public async validateSubmission(
    tenantId: string,
    submissionId: string,
  ): Promise<{ isValid: boolean; errors: SubmissionValidationError[] }> {
    const submission = await this.submissionRepo.findById(tenantId, submissionId);
    if (!submission) {
      throw new Error(`FormSubmission '${submissionId}' not found for tenant '${tenantId}'`);
    }

    const formDef = await this.formRepo.findById(tenantId, submission.formDefinitionId);
    if (!formDef) {
      throw new Error(
        `FormDefinition '${submission.formDefinitionId}' not found for tenant '${tenantId}'`,
      );
    }

    if (formDef.version !== submission.formVersion) {
      return {
        isValid: false,
        errors: [
          {
            fieldId: "_formVersion",
            message: `FormDefinition version mismatch: submission bound to v${submission.formVersion}, current is v${formDef.version}`,
          },
        ],
      };
    }

    const errors = validateFormResponses(formDef, submission.responses);
    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  public async submitForm(input: SubmitFormInput): Promise<FormSubmission> {
    const submission = await this.submissionRepo.findById(input.tenantId, input.id);
    if (!submission) {
      throw new Error(`FormSubmission '${input.id}' not found for tenant '${input.tenantId}'`);
    }

    if (input.responses) {
      submission.saveDraft(input.responses, input.metadataUpdates);
    }

    const formDef = await this.formRepo.findById(input.tenantId, submission.formDefinitionId);
    if (!formDef) {
      throw new Error(
        `FormDefinition '${submission.formDefinitionId}' not found for tenant '${input.tenantId}'`,
      );
    }

    submission.submit(formDef, input.metadataUpdates);
    await this.submissionRepo.save(submission);

    if (this.auditRecorder) {
      await this.auditRecorder.record({
        tenantId: input.tenantId,
        action: "FORM_SUBMISSION_SUBMITTED",
        actorId: input.actorId,
        targetId: submission.id,
        details: {
          formDefinitionId: submission.formDefinitionId,
          formVersion: submission.formVersion,
          submittedAt: submission.submittedAt?.toISOString(),
        },
      });
    }

    return submission;
  }

  public async deleteDraft(tenantId: string, submissionId: string, actorId?: string): Promise<void> {
    await this.submissionRepo.deleteDraft(tenantId, submissionId);

    if (this.auditRecorder) {
      await this.auditRecorder.record({
        tenantId,
        action: "FORM_SUBMISSION_DRAFT_DELETED",
        actorId,
        targetId: submissionId,
      });
    }
  }

  public async getSubmission(tenantId: string, submissionId: string): Promise<FormSubmission | null> {
    return this.submissionRepo.findById(tenantId, submissionId);
  }

  public async listSubmissions(
    tenantId: string,
    filters?: { formDefinitionId?: string; status?: SubmissionStatus },
  ): Promise<FormSubmission[]> {
    if (filters?.formDefinitionId) {
      const formList = await this.submissionRepo.findByForm(tenantId, filters.formDefinitionId);
      if (filters.status) {
        return formList.filter((s) => s.status === filters.status);
      }
      return formList;
    }

    if (filters?.status) {
      return this.submissionRepo.findByStatus(tenantId, filters.status);
    }

    return this.submissionRepo.findByTenant(tenantId);
  }
}
