import { FormField, type FormFieldProps } from "./form-field.js";

export type FormStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export interface FormDefinitionProps {
  readonly id: string;
  readonly tenantId: string;
  readonly title: string;
  readonly description?: string;
  readonly status?: FormStatus;
  readonly version?: number;
  readonly fields?: readonly (FormField | FormFieldProps)[];
  readonly locale?: string;
  readonly templateKey?: string | null;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
  readonly publishedAt?: Date | null;
}

export class FormDefinition {
  readonly id: string;
  readonly tenantId: string;
  private _title: string;
  private _description: string;
  private _status: FormStatus;
  private _version: number;
  private _fields: FormField[];
  private _locale: string;
  private _templateKey: string | null;
  readonly createdAt: Date;
  private _updatedAt: Date;
  private _publishedAt: Date | null;

  constructor(props: FormDefinitionProps) {
    if (!props.id?.trim()) throw new Error("FormDefinition ID cannot be empty");
    if (!props.tenantId?.trim()) throw new Error("FormDefinition tenantId cannot be empty");
    if (!props.title?.trim()) throw new Error("FormDefinition title cannot be empty");
    const version = props.version ?? 1;
    if (!Number.isInteger(version) || version < 1) throw new Error("FormDefinition version must be >= 1");

    this.id = props.id.trim();
    this.tenantId = props.tenantId.trim();
    this._title = props.title.trim();
    this._description = props.description?.trim() ?? "";
    this._status = props.status ?? "DRAFT";
    this._version = version;
    this._fields = (props.fields ?? []).map((field) => field instanceof FormField ? field : new FormField(field));
    this._locale = props.locale?.trim() || "en";
    this._templateKey = props.templateKey?.trim() || null;
    this.createdAt = props.createdAt ? new Date(props.createdAt) : new Date();
    this._updatedAt = props.updatedAt ? new Date(props.updatedAt) : new Date();
    this._publishedAt = props.publishedAt ? new Date(props.publishedAt) : null;
    this.validateFieldInvariants(this._fields);
  }

  get title() { return this._title; }
  get description() { return this._description; }
  get status() { return this._status; }
  get version() { return this._version; }
  get fields(): readonly FormField[] { return [...this._fields]; }
  get locale() { return this._locale; }
  get templateKey() { return this._templateKey; }
  get updatedAt() { return new Date(this._updatedAt); }
  get publishedAt() { return this._publishedAt ? new Date(this._publishedAt) : null; }

  prepareDraftRevision(): void {
    this.ensureNotArchived();
    if (this._status === "PUBLISHED") {
      this._version += 1;
      this._status = "DRAFT";
      this._publishedAt = null;
      this._updatedAt = new Date();
    }
  }

  updateDraft(input: {
    title?: string;
    description?: string;
    fields?: readonly (FormField | FormFieldProps)[];
    locale?: string;
    templateKey?: string | null;
  }): void {
    this.ensureDraft();
    if (input.title !== undefined) {
      if (!input.title.trim()) throw new Error("Form title cannot be empty");
      this._title = input.title.trim();
    }
    if (input.description !== undefined) this._description = input.description.trim();
    if (input.locale !== undefined) this._locale = input.locale.trim() || "en";
    if (input.templateKey !== undefined) this._templateKey = input.templateKey?.trim() || null;
    if (input.fields !== undefined) {
      const fields = input.fields.map((field) => field instanceof FormField ? field : new FormField(field));
      this.validateFieldInvariants(fields);
      this._fields = fields;
    }
    this._updatedAt = new Date();
  }

  publish(): void {
    this.ensureDraft();
    if (this._fields.length === 0) throw new Error("Cannot publish a form definition with zero fields");
    this._status = "PUBLISHED";
    this._publishedAt = new Date();
    this._updatedAt = new Date();
  }

  archive(): void {
    this.ensureNotArchived();
    this._status = "ARCHIVED";
    this._updatedAt = new Date();
  }

  clone(): FormDefinition {
    return new FormDefinition(this.toPersistence());
  }

  toPersistence(): FormDefinitionProps {
    return {
      id: this.id,
      tenantId: this.tenantId,
      title: this.title,
      description: this.description,
      status: this.status,
      version: this.version,
      fields: this.fields.map((field) => ({
        id: field.id,
        label: field.label,
        type: field.type,
        helpText: field.helpText,
        placeholder: field.placeholder,
        defaultValue: field.defaultValue,
        options: field.options,
        validationRules: field.validationRules,
        visibilityConditions: field.visibilityConditions,
        calculation: field.calculation,
      })),
      locale: this.locale,
      templateKey: this.templateKey,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      publishedAt: this.publishedAt,
    };
  }

  toJSON() {
    return {
      ...this.toPersistence(),
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      publishedAt: this.publishedAt?.toISOString() ?? null,
    };
  }

  private validateFieldInvariants(fields: readonly FormField[]): void {
    const ids = new Set<string>();
    for (const field of fields) {
      if (ids.has(field.id)) throw new Error(`Duplicate field ID '${field.id}' found in FormDefinition`);
      ids.add(field.id);
    }
    for (const field of fields) {
      for (const condition of field.visibilityConditions) {
        if (!ids.has(condition.fieldId)) {
          throw new Error(`Visibility condition in field '${field.id}' references missing field '${condition.fieldId}'`);
        }
        if (condition.fieldId === field.id) throw new Error(`Field '${field.id}' cannot control its own visibility`);
      }
      for (const sourceId of field.calculation?.fieldIds ?? []) {
        if (!ids.has(sourceId)) throw new Error(`Calculation in field '${field.id}' references missing field '${sourceId}'`);
        if (sourceId === field.id) throw new Error(`Calculated field '${field.id}' cannot reference itself`);
      }
    }
  }

  private ensureDraft(): void {
    if (this._status !== "DRAFT") throw new Error(`FormDefinition '${this.id}' must be DRAFT to modify or publish`);
  }

  private ensureNotArchived(): void {
    if (this._status === "ARCHIVED") throw new Error(`FormDefinition '${this.id}' is archived`);
  }
}
