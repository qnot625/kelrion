import type { FormDefinition } from "./form-definition.js";
import {
  FieldResponse,
  SubmissionMetadata,
  normalizeResponses,
  validateFormResponses,
  type FieldResponseProps,
  type SubmissionMetadataProps,
} from "./form-submission-response.js";

export type SubmissionStatus = "DRAFT" | "SUBMITTED" | "VALIDATED" | "ARCHIVED";

export interface FormSubmissionProps {
  readonly id: string;
  readonly tenantId: string;
  readonly formDefinitionId: string;
  readonly formVersion: number;
  readonly status?: SubmissionStatus;
  readonly responses?: readonly (FieldResponse | FieldResponseProps)[];
  readonly metadata?: SubmissionMetadata | SubmissionMetadataProps;
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
    if (!props.id?.trim()) throw new Error("FormSubmission ID cannot be empty");
    if (!props.tenantId?.trim()) throw new Error("FormSubmission tenantId cannot be empty");
    if (!props.formDefinitionId?.trim()) throw new Error("FormSubmission formDefinitionId cannot be empty");
    if (!Number.isInteger(props.formVersion) || props.formVersion < 1) throw new Error("FormSubmission formVersion must be >= 1");
    this.id = props.id.trim();
    this.tenantId = props.tenantId.trim();
    this.formDefinitionId = props.formDefinitionId.trim();
    this.formVersion = props.formVersion;
    this._status = props.status ?? "DRAFT";
    this._responses = (props.responses ?? []).map((response) => response instanceof FieldResponse ? new FieldResponse(response) : new FieldResponse(response));
    this._metadata = props.metadata instanceof SubmissionMetadata ? new SubmissionMetadata(props.metadata) : new SubmissionMetadata(props.metadata);
    this.createdAt = props.createdAt ? new Date(props.createdAt) : new Date();
    this._updatedAt = props.updatedAt ? new Date(props.updatedAt) : new Date();
    this._submittedAt = props.submittedAt ? new Date(props.submittedAt) : null;
  }

  get status() { return this._status; }
  get responses(): readonly FieldResponse[] { return this._responses.map((response) => new FieldResponse(response)); }
  get metadata() { return new SubmissionMetadata(this._metadata); }
  get updatedAt() { return new Date(this._updatedAt); }
  get submittedAt() { return this._submittedAt ? new Date(this._submittedAt) : null; }

  saveDraft(
    responses: readonly (FieldResponse | FieldResponseProps)[],
    metadataUpdates?: Partial<SubmissionMetadataProps>,
  ): void {
    this.ensureDraft();
    this._responses = responses.map((response) => response instanceof FieldResponse ? new FieldResponse(response) : new FieldResponse(response));
    if (metadataUpdates) this._metadata = new SubmissionMetadata({ ...this._metadata, ...metadataUpdates });
    this._updatedAt = new Date();
  }

  submit(definition: FormDefinition, metadataUpdates?: Partial<SubmissionMetadataProps>): void {
    this.ensureDraft();
    this.ensureDefinition(definition);
    if (definition.status !== "PUBLISHED") throw new Error("Only a published form version can receive submissions");
    if (metadataUpdates) this._metadata = new SubmissionMetadata({ ...this._metadata, ...metadataUpdates });
    const normalized = normalizeResponses(definition, this._responses);
    const errors = validateFormResponses(definition, normalized);
    if (errors.length) throw new Error(errors.map((error) => `${error.fieldId}: ${error.message}`).join("; "));
    this._responses = normalized;
    this._status = "SUBMITTED";
    this._submittedAt = new Date();
    this._updatedAt = new Date();
  }

  validate(definition: FormDefinition): void {
    if (this._status !== "SUBMITTED") throw new Error("Only submitted forms can be validated");
    this.ensureDefinition(definition);
    const errors = validateFormResponses(definition, this._responses);
    if (errors.length) throw new Error(errors.map((error) => `${error.fieldId}: ${error.message}`).join("; "));
    this._status = "VALIDATED";
    this._updatedAt = new Date();
  }

  archive(): void {
    if (this._status === "ARCHIVED") return;
    this._status = "ARCHIVED";
    this._updatedAt = new Date();
  }

  clone(): FormSubmission {
    return new FormSubmission(this.toPersistence());
  }

  toPersistence(): FormSubmissionProps {
    return {
      id: this.id,
      tenantId: this.tenantId,
      formDefinitionId: this.formDefinitionId,
      formVersion: this.formVersion,
      status: this.status,
      responses: this.responses,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      submittedAt: this.submittedAt,
    };
  }

  toJSON() {
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
      submittedAt: this.submittedAt?.toISOString() ?? null,
    };
  }

  private ensureDraft(): void {
    if (this._status !== "DRAFT") throw new Error(`Submission '${this.id}' is locked because it is ${this._status}`);
  }

  private ensureDefinition(definition: FormDefinition): void {
    if (definition.id !== this.formDefinitionId || definition.version !== this.formVersion) {
      throw new Error(`Submission '${this.id}' requires form '${this.formDefinitionId}' version ${this.formVersion}`);
    }
  }
}
