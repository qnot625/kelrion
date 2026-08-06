export type FieldType =
  | "text"
  | "number"
  | "boolean"
  | "select"
  | "multiselect"
  | "date"
  | "textarea";

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

export interface FormFieldProps {
  readonly id: string;
  readonly label: string;
  readonly type: FieldType;
  readonly defaultValue?: string | number | boolean | string[];
  readonly options?: readonly SelectOption[];
  readonly validationRules?: readonly ValidationRule[];
  readonly visibilityConditions?: readonly VisibilityCondition[];
}

export class FormField {
  readonly id: string;
  readonly label: string;
  readonly type: FieldType;
  readonly defaultValue?: string | number | boolean | string[];
  readonly options: readonly SelectOption[];
  readonly validationRules: readonly ValidationRule[];
  readonly visibilityConditions: readonly VisibilityCondition[];

  constructor(props: FormFieldProps) {
    if (!props.id || props.id.trim() === "") {
      throw new Error("FormField ID cannot be empty");
    }
    if (!props.label || props.label.trim() === "") {
      throw new Error("FormField label cannot be empty");
    }
    if (
      (props.type === "select" || props.type === "multiselect") &&
      (!props.options || props.options.length === 0)
    ) {
      throw new Error(
        `FormField of type '${props.type}' must specify at least one option`,
      );
    }

    this.id = props.id.trim();
    this.label = props.label.trim();
    this.type = props.type;
    this.defaultValue = props.defaultValue;
    this.options = Object.freeze(props.options ? [...props.options] : []);
    this.validationRules = Object.freeze(
      props.validationRules ? [...props.validationRules] : [],
    );
    this.visibilityConditions = Object.freeze(
      props.visibilityConditions ? [...props.visibilityConditions] : [],
    );

    Object.freeze(this);
  }

  public validateValue(value: unknown): string[] {
    const errors: string[] = [];

    const isRequired = this.validationRules.some((r) => r.type === "required");
    const isEmpty =
      value === undefined ||
      value === null ||
      value === "" ||
      (Array.isArray(value) && value.length === 0);

    if (isEmpty) {
      if (isRequired) {
        const reqRule = this.validationRules.find((r) => r.type === "required");
        errors.push(reqRule?.message || `${this.label} is required`);
      }
      return errors;
    }

    for (const rule of this.validationRules) {
      switch (rule.type) {
        case "min_length": {
          const min = Number(rule.value);
          if (typeof value === "string" && value.length < min) {
            errors.push(
              rule.message ||
                `${this.label} must be at least ${min} characters`,
            );
          }
          break;
        }
        case "max_length": {
          const max = Number(rule.value);
          if (typeof value === "string" && value.length > max) {
            errors.push(
              rule.message ||
                `${this.label} must be at most ${max} characters`,
            );
          }
          break;
        }
        case "min_value": {
          const min = Number(rule.value);
          if (typeof value === "number" && value < min) {
            errors.push(
              rule.message || `${this.label} must be at least ${min}`,
            );
          }
          break;
        }
        case "max_value": {
          const max = Number(rule.value);
          if (typeof value === "number" && value > max) {
            errors.push(
              rule.message || `${this.label} must be at most ${max}`,
            );
          }
          break;
        }
        case "regex": {
          if (typeof value === "string" && rule.value) {
            const re = new RegExp(String(rule.value));
            if (!re.test(value)) {
              errors.push(rule.message || `${this.label} format is invalid`);
            }
          }
          break;
        }
      }
    }

    return errors;
  }

  public evaluateVisibility(responses: Record<string, unknown>): boolean {
    if (this.visibilityConditions.length === 0) {
      return true;
    }

    return this.visibilityConditions.every((cond) => {
      const sourceValue = responses[cond.fieldId];
      switch (cond.operator) {
        case "equals":
          return String(sourceValue) === String(cond.value);
        case "not_equals":
          return String(sourceValue) !== String(cond.value);
        case "contains":
          if (Array.isArray(sourceValue)) {
            return sourceValue.includes(cond.value);
          }
          return String(sourceValue || "").includes(String(cond.value));
        case "greater_than":
          return Number(sourceValue) > Number(cond.value);
        case "less_than":
          return Number(sourceValue) < Number(cond.value);
        default:
          return true;
      }
    });
  }
}
