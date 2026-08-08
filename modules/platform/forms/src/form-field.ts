export type FieldType =
  | "text"
  | "number"
  | "boolean"
  | "select"
  | "multiselect"
  | "date"
  | "textarea"
  | "file"
  | "signature"
  | "calculated";

export type ValidationRuleType =
  | "required"
  | "min_length"
  | "max_length"
  | "min_value"
  | "max_value"
  | "regex";

export interface ValidationRule {
  readonly type: ValidationRuleType;
  readonly value?: string | number;
  readonly message: string;
}

export type VisibilityOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "greater_than"
  | "less_than";

export interface VisibilityCondition {
  readonly fieldId: string;
  readonly operator: VisibilityOperator;
  readonly value: string | number | boolean;
}

export interface SelectOption {
  readonly label: string;
  readonly value: string;
}

export interface FormFileReference {
  readonly id: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly storageKey?: string | null;
  readonly capturedAt?: string | null;
}

export type CalculationOperator = "sum" | "difference" | "product" | "quotient" | "concat";

export interface CalculationRule {
  readonly operator: CalculationOperator;
  readonly fieldIds: readonly string[];
  readonly separator?: string;
}

export interface FormFieldProps {
  readonly id: string;
  readonly label: string;
  readonly type: FieldType;
  readonly helpText?: string;
  readonly placeholder?: string;
  readonly defaultValue?: unknown;
  readonly options?: readonly SelectOption[];
  readonly validationRules?: readonly ValidationRule[];
  readonly visibilityConditions?: readonly VisibilityCondition[];
  readonly calculation?: CalculationRule | null;
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

export class FormField {
  readonly id: string;
  readonly label: string;
  readonly type: FieldType;
  readonly helpText: string;
  readonly placeholder: string;
  readonly defaultValue?: unknown;
  readonly options: readonly SelectOption[];
  readonly validationRules: readonly ValidationRule[];
  readonly visibilityConditions: readonly VisibilityCondition[];
  readonly calculation: CalculationRule | null;

  constructor(props: FormFieldProps) {
    if (!props.id?.trim()) throw new Error("FormField ID cannot be empty");
    if (!props.label?.trim()) throw new Error("FormField label cannot be empty");
    if ((props.type === "select" || props.type === "multiselect") && !props.options?.length) {
      throw new Error(`FormField of type '${props.type}' must specify at least one option`);
    }
    if (props.type === "calculated" && (!props.calculation || props.calculation.fieldIds.length === 0)) {
      throw new Error("Calculated fields require a calculation rule with at least one source field");
    }

    this.id = props.id.trim();
    this.label = props.label.trim();
    this.type = props.type;
    this.helpText = props.helpText?.trim() ?? "";
    this.placeholder = props.placeholder?.trim() ?? "";
    this.defaultValue = props.defaultValue;
    this.options = Object.freeze((props.options ?? []).map((option) => Object.freeze({ ...option })));
    this.validationRules = Object.freeze((props.validationRules ?? []).map((rule) => Object.freeze({ ...rule })));
    this.visibilityConditions = Object.freeze(
      (props.visibilityConditions ?? []).map((condition) => Object.freeze({ ...condition })),
    );
    this.calculation = props.calculation
      ? Object.freeze({ ...props.calculation, fieldIds: Object.freeze([...props.calculation.fieldIds]) })
      : null;
  }

  validateValue(value: unknown): string[] {
    const errors: string[] = [];
    const required = this.validationRules.find((rule) => rule.type === "required");
    if (isEmpty(value)) {
      if (required) errors.push(required.message || `${this.label} is required`);
      return errors;
    }

    if (this.type === "number" || (this.type === "calculated" && this.calculation?.operator !== "concat")) {
      if (typeof value !== "number" || !Number.isFinite(value)) errors.push(`${this.label} must be a number`);
    }
    if (this.type === "boolean" && typeof value !== "boolean") errors.push(`${this.label} must be true or false`);
    if (this.type === "multiselect" && !Array.isArray(value)) errors.push(`${this.label} must contain multiple selections`);
    if (this.type === "file" && !isFormFileReference(value)) errors.push(`${this.label} must contain a file reference`);

    if (this.type === "select" && typeof value === "string" && !this.options.some((option) => option.value === value)) {
      errors.push(`Selected value '${value}' is not valid for ${this.label}`);
    }
    if (this.type === "multiselect" && Array.isArray(value)) {
      const valid = new Set(this.options.map((option) => option.value));
      if (value.some((item) => typeof item !== "string" || !valid.has(item))) errors.push(`${this.label} contains an invalid option`);
    }

    for (const rule of this.validationRules) {
      switch (rule.type) {
        case "required": break;
        case "min_length":
          if (typeof value === "string" && value.length < Number(rule.value)) errors.push(rule.message);
          break;
        case "max_length":
          if (typeof value === "string" && value.length > Number(rule.value)) errors.push(rule.message);
          break;
        case "min_value":
          if (typeof value === "number" && value < Number(rule.value)) errors.push(rule.message);
          break;
        case "max_value":
          if (typeof value === "number" && value > Number(rule.value)) errors.push(rule.message);
          break;
        case "regex":
          if (typeof value === "string" && rule.value !== undefined && !new RegExp(String(rule.value)).test(value)) errors.push(rule.message);
          break;
      }
    }
    return errors;
  }

  evaluateVisibility(responses: Readonly<Record<string, unknown>>): boolean {
    return this.visibilityConditions.every((condition) => {
      const source = responses[condition.fieldId];
      switch (condition.operator) {
        case "equals": return String(source) === String(condition.value);
        case "not_equals": return String(source) !== String(condition.value);
        case "contains": return Array.isArray(source)
          ? source.some((item) => String(item) === String(condition.value))
          : String(source ?? "").includes(String(condition.value));
        case "greater_than": return Number(source) > Number(condition.value);
        case "less_than": return Number(source) < Number(condition.value);
      }
    });
  }

  calculate(responses: Readonly<Record<string, unknown>>): unknown {
    if (this.type !== "calculated" || !this.calculation) return responses[this.id];
    const values = this.calculation.fieldIds.map((fieldId) => responses[fieldId]);
    switch (this.calculation.operator) {
      case "concat": return values.map((value) => String(value ?? "")).join(this.calculation.separator ?? " ");
      case "sum": return values.reduce<number>((total, value) => total + Number(value ?? 0), 0);
      case "difference": return values.slice(1).reduce<number>((total, value) => total - Number(value ?? 0), Number(values[0] ?? 0));
      case "product": return values.reduce<number>((total, value) => total * Number(value ?? 0), 1);
      case "quotient": return values.slice(1).reduce<number>((total, value) => {
        const divisor = Number(value ?? 0);
        return divisor === 0 ? Number.NaN : total / divisor;
      }, Number(values[0] ?? 0));
    }
  }
}

export function isFormFileReference(value: unknown): value is FormFileReference {
  if (!value || typeof value !== "object") return false;
  const file = value as Partial<FormFileReference>;
  return Boolean(file.id && file.fileName && file.mimeType && Number.isFinite(file.sizeBytes));
}
