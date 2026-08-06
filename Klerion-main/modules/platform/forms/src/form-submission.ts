import type { FormDefinition } from "./form-definition.js";
import {
  FieldResponse,
  SubmissionMetadata,
  validateFormResponses,
  type SubmissionValidationError,
} from "./form-submission-response.js";

export type SubmissionStatus = "DRAFT" | "SUBMITTED" | "VALIDATED" | "ARCHIVED";

export interface FormSubmissionProps {
  readonly id: string;
  readonly tenantId: string;
  readonly formDefinitionId: string;
  readonly formVersion: number;
  readonly status?: SubmissionStatus;
  readonly responses?: readonly FieldResponse[];
  readonly metadata?: SubmissionMetadata;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
  readonly submittedAt?: Date | null;
}

export class FormSubmission {
  readonly id: string;
  readonly tenantId: string;
  readonly formDefinitionId: string;
  readonly formVersion: number;

  private _status: SubmissionStatus;
  private _responses: FieldResponse[];
  private _metadata: SubmissionMetadata;
  readonly createdAt: Date;
  private _updatedAt: Date;
  private _submittedAt: Date | null;

  constructor(props: FormSubmissionProps) {
    if (!props.id || props.id.trim() === "") {
      throw new Error("FormSubmission ID cannot be empty");
    }
    if (!props.tenantId || props.tenantId.trim() === "") {
      throw new Error("FormSubmission tenantId cannot be empty");
    }
    if (!props.formDefinitionId || props.formDefinitionId.trim() === "") {
      throw new Error("FormSubmission formDefinitionId cannot be empty");
    }
    if (!Number.isInteger(props.formVersion) || props.formVersion < 1) {
      throw new Error("FormSubmission formVersion must be a positive integer (>= 1)");
    }

    this.id = props.id.trim();
    this.tenantId = props.tenantId.trim();
    this.formDefinitionId = props.formDefinitionId.trim();
    this.formVersion = props.formVersion;
    this._status = props.status ?? "DRAFT";
    this._responses = props.responses ? props.responses.map((r) => new FieldResponse(r)) : [];
    this._metadata = props.metadata ?? new SubmissionMetadata();
    this.createdAt = props.createdAt ?? new Date();
    this._updatedAt = props.updatedAt ?? new Date();
    this._submittedAt = props.submittedAt ?? null;
  }

  get status(): SubmissionStatus {
    return this._status;
  }

  get responses(): readonly FieldResponse[] {
    return Object.freeze([...this._responses]);
  }

  get metadata(): SubmissionMetadata {
    return this._metadata;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  get submittedAt(): Date | null {
    return this._submittedAt;
  }

  public saveDraft(
    responses: readonly FieldResponse[],
    metadataUpdates?: Partial<SubmissionMetadata>,
  ): void {
    if (this._status !== "DRAFT") {
      throw new Error(
        `Cannot edit submission '${this.id}' because status is '${this._status}' (must be DRAFT)`,
      );
    }

    this._responses = responses.map((r) => new FieldResponse(r));
    if (metadataUpdates) {
      this._metadata = new SubmissionMetadata({
        ...this._metadata,
        ...metadataUpdates,
      });
    }
    this._updatedAt = new Date();
  }

  public submit(
    definition: FormDefinition,
    metadataUpdates?: Partial<SubmissionMetadata>,
  ): SubmissionValidationError[] {
    if (this._status !== "DRAFT") {
      throw new Error(
        `Cannot submit submission '${this.id}' because status is '${this._status}' (must be DRAFT)`,
      );
    }

    if (definition.id !== this.formDefinitionId) {
      throw new Error(
        `FormDefinition ID mismatch: expected '${this.formDefinitionId}', got '${definition.id}'`,
      );
    }

    if (definition.version !== this.formVersion) {
      throw new Error(
        `FormDefinition version mismatch: submission is bound to version ${this.formVersion}, but definition is version ${definition.version}`,
      );
    }

    if (definition.status !== "PUBLISHED") {
      throw new Error(
        `Cannot submit form definition '${definition.id}' because its status is '${definition.status}' (must be PUBLISHED)`,
      );
    }

    if (metadataUpdates) {
      this._metadata = new SubmissionMetadata({
        ...this._metadata,
        ...metadataUpdates,
      });
    }

    const validationErrors = validateFormResponses(definition, this._responses);
    if (validationErrors.length > 0) {
      const errorMsg = validationErrors.map((e) => `${e.fieldId}: ${e.message}`).join("; ");
      throw new Error(`Form submission payload validation failed: ${errorMsg}`);
    }

    this._status = "SUBMITTED";
    this._submittedAt = new Date();
    this._updatedAt = new Date();

    return validationErrors;
  }

  public validate(definition: FormDefinition): void {
    if (this._status !== "SUBMITTED") {
      throw new Error(
        `Cannot validate submission '${this.id}' because status is '${this._status}' (must be SUBMITTED)`,
      );
    }

    if (definition.id !== this.formDefinitionId || definition.version !== this.formVersion) {
      throw new Error(
        `FormDefinition mismatch: submission requires id '${this.formDefinitionId}' version ${this.formVersion}`,
      );
    }

    const validationErrors = validateFormResponses(definition, this._responses);
    if (validationErrors.length > 0) {
      const errorMsg = validationErrors.map((e) => `${e.fieldId}: ${e.message}`).join("; ");
      throw new Error(`Validation check failed: ${errorMsg}`);
    }

    this._status = "VALIDATED";
    this._updatedAt = new Date();
  }

  public archive(): void {
    if (this._status === "ARCHIVED") {
      throw new Error(`FormSubmission '${this.id}' is already ARCHIVED`);
    }
    this._status = "ARCHIVED";
    this._updatedAt = new Date();
  }

  public toJSON() {
    return {
      id: this.id,
      tenantId: this.tenantId,
      formDefinitionId: this.formDefinitionId,
      formVersion: this.formVersion,
      status: this.status,
      responses: this.responses,
      metadata: this.metadata,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      submittedAt: this.submittedAt ? this.submittedAt.toISOString() : null,
    };
  }
}
