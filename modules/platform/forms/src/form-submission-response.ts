import type { FormDefinition } from "./form-definition.js";

export type FieldValue = unknown;

export interface FieldResponseProps {
  readonly fieldId: string;
  readonly value: FieldValue;
}

export class FieldResponse {
  readonly fieldId: string;
  readonly value: FieldValue;

  constructor(props: FieldResponseProps) {
    if (!props.fieldId?.trim()) throw new Error("FieldResponse fieldId cannot be empty");
    this.fieldId = props.fieldId.trim();
    this.value = structuredClone(props.value);
  }
}

export interface SubmissionMetadataProps {
  readonly submittedByUserId?: string | null;
  readonly sourceChannel?: string;
  readonly locale?: string;
  readonly tags?: readonly string[];
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
}

export class SubmissionMetadata {
  readonly submittedByUserId: string | null;
  readonly sourceChannel: string;
  readonly locale: string;
  readonly tags: readonly string[];
  readonly ipAddress: string | null;
  readonly userAgent: string | null;

  constructor(props: SubmissionMetadataProps = {}) {
    this.submittedByUserId = props.submittedByUserId ?? null;
    this.sourceChannel = props.sourceChannel?.trim() || "web";
    this.locale = props.locale?.trim() || "en";
    this.tags = Object.freeze([...(props.tags ?? [])]);
    this.ipAddress = props.ipAddress ?? null;
    this.userAgent = props.userAgent ?? null;
  }
}

export interface SubmissionValidationError {
  readonly fieldId: string;
  readonly message: string;
}

export function responsesToRecord(responses: readonly FieldResponse[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const response of responses) result[response.fieldId] = structuredClone(response.value);
  return result;
}

export function normalizeResponses(
  definition: FormDefinition,
  responses: readonly FieldResponse[],
): FieldResponse[] {
  const record = responsesToRecord(responses);
  for (const field of definition.fields) {
    if (field.type === "calculated") record[field.id] = field.calculate(record);
    else if (record[field.id] === undefined && field.defaultValue !== undefined) record[field.id] = structuredClone(field.defaultValue);
  }
  return Object.entries(record).map(([fieldId, value]) => new FieldResponse({ fieldId, value }));
}

export function validateFormResponses(
  definition: FormDefinition,
  responses: readonly FieldResponse[],
): SubmissionValidationError[] {
  const errors: SubmissionValidationError[] = [];
  const normalized = normalizeResponses(definition, responses);
  const record = responsesToRecord(normalized);
  const fields = new Map(definition.fields.map((field) => [field.id, field]));

  for (const response of normalized) {
    if (!fields.has(response.fieldId)) {
      errors.push({ fieldId: response.fieldId, message: `Field '${response.fieldId}' is not defined in form version ${definition.version}` });
    }
  }

  for (const field of definition.fields) {
    if (!field.evaluateVisibility(record)) continue;
    for (const message of field.validateValue(record[field.id])) errors.push({ fieldId: field.id, message });
  }
  return errors;
}
