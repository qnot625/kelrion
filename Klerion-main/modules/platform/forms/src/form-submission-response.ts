import type { FormDefinition } from "./form-definition.js";

export type FieldValue = string | number | boolean | string[] | null | undefined;

export interface FieldResponseProps {
  readonly fieldId: string;
  readonly value: FieldValue;
}

export class FieldResponse {
  readonly fieldId: string;
  readonly value: FieldValue;

  constructor(props: FieldResponseProps) {
    if (!props.fieldId || props.fieldId.trim() === "") {
      throw new Error("FieldResponse fieldId cannot be empty");
    }
    this.fieldId = props.fieldId.trim();
    this.value = Array.isArray(props.value) ? Object.freeze([...props.value]) : props.value;
    Object.freeze(this);
  }
}

export interface SubmissionMetadataProps {
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly submittedByUserId?: string;
  readonly sourceChannel?: string;
  readonly tags?: readonly string[];
}

export class SubmissionMetadata {
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly submittedByUserId?: string;
  readonly sourceChannel?: string;
  readonly tags: readonly string[];

  constructor(props: SubmissionMetadataProps = {}) {
    this.ipAddress = props.ipAddress;
    this.userAgent = props.userAgent;
    this.submittedByUserId = props.submittedByUserId;
    this.sourceChannel = props.sourceChannel ?? "web";
    this.tags = Object.freeze(props.tags ? [...props.tags] : []);
    Object.freeze(this);
  }
}

export interface SubmissionValidationError {
  readonly fieldId: string;
  readonly message: string;
}

export function responsesToRecord(responses: readonly FieldResponse[]): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (const resp of responses) {
    map[resp.fieldId] = resp.value;
  }
  return map;
}

export function validateFormResponses(
  definition: FormDefinition,
  responses: readonly FieldResponse[],
): SubmissionValidationError[] {
  const errors: SubmissionValidationError[] = [];
  const responseRecord = responsesToRecord(responses);
  const definitionFieldMap = new Map(definition.fields.map((f) => [f.id, f]));

  // 1. Check for unknown fields in responses
  for (const resp of responses) {
    if (!definitionFieldMap.has(resp.fieldId)) {
      errors.push({
        fieldId: resp.fieldId,
        message: `Field '${resp.fieldId}' is not defined in FormDefinition version ${definition.version}`,
      });
    }
  }

  // 2. Validate defined fields against FormDefinition
  for (const field of definition.fields) {
    const isVisible = field.evaluateVisibility(responseRecord);

    // If field is hidden by conditional rules, ignore value validation
    if (!isVisible) {
      continue;
    }

    const value = responseRecord[field.id];

    // Additional select/multiselect option validation if options exist
    if (
      value !== undefined &&
      value !== null &&
      value !== "" &&
      !(Array.isArray(value) && value.length === 0)
    ) {
      if (field.type === "select") {
        const validValues = field.options.map((opt) => opt.value);
        if (typeof value === "string" && validValues.length > 0 && !validValues.includes(value)) {
          errors.push({
            fieldId: field.id,
            message: `Selected value '${value}' is not a valid option for field '${field.label}'`,
          });
        }
      } else if (field.type === "multiselect") {
        const validValues = field.options.map((opt) => opt.value);
        if (Array.isArray(value) && validValues.length > 0) {
          for (const item of value) {
            if (!validValues.includes(item)) {
              errors.push({
                fieldId: field.id,
                message: `Selected option '${item}' is not a valid option for field '${field.label}'`,
              });
            }
          }
        }
      }
    }

    // Call domain field validation logic
    const fieldErrors = field.validateValue(value);
    for (const msg of fieldErrors) {
      errors.push({
        fieldId: field.id,
        message: msg,
      });
    }
  }

  return errors;
}
