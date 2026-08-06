import type { FormField } from "./form-field.js";

export type FormStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export interface FormDefinitionProps {
  readonly id: string;
  readonly tenantId: string;
  readonly title: string;
  readonly description?: string;
  readonly status?: FormStatus;
  readonly version?: number;
  readonly fields?: readonly FormField[];
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

export class FormDefinition {
  readonly id: string;
  readonly tenantId: string;
  private _title: string;
  private _description: string;
  private _status: FormStatus;
  private _version: number;
  private _fields: FormField[];
  readonly createdAt: Date;
  private _updatedAt: Date;

  constructor(props: FormDefinitionProps) {
    if (!props.id || props.id.trim() === "") {
      throw new Error("FormDefinition ID cannot be empty");
    }
    if (!props.tenantId || props.tenantId.trim() === "") {
      throw new Error("FormDefinition tenantId cannot be empty");
    }
    if (!props.title || props.title.trim() === "") {
      throw new Error("FormDefinition title cannot be empty");
    }

    const version = props.version ?? 1;
    if (!Number.isInteger(version) || version < 1) {
      throw new Error("FormDefinition version must be a positive integer (>= 1)");
    }

    this.id = props.id.trim();
    this.tenantId = props.tenantId.trim();
    this._title = props.title.trim();
    this._description = props.description ? props.description.trim() : "";
    this._status = props.status ?? "DRAFT";
    this._version = version;
    this._fields = props.fields ? [...props.fields] : [];
    this.createdAt = props.createdAt ?? new Date();
    this._updatedAt = props.updatedAt ?? new Date();

    this.validateFieldInvariants(this._fields);
  }

  get title(): string {
    return this._title;
  }

  get description(): string {
    return this._description;
  }

  get status(): FormStatus {
    return this._status;
  }

  get version(): number {
    return this._version;
  }

  get fields(): readonly FormField[] {
    return Object.freeze([...this._fields]);
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  private validateFieldInvariants(fields: readonly FormField[]): void {
    const fieldIds = new Set<string>();
    for (const field of fields) {
      if (fieldIds.has(field.id)) {
        throw new Error(`Duplicate field ID '${field.id}' found in FormDefinition`);
      }
      fieldIds.add(field.id);
    }

    // Ensure visibility conditions refer to fields in the form
    for (const field of fields) {
      for (const cond of field.visibilityConditions) {
        if (!fieldIds.has(cond.fieldId)) {
          throw new Error(
            `Visibility condition in field '${field.id}' references non-existent field '${cond.fieldId}'`,
          );
        }
      }
    }
  }

  public updateDetails(title: string, description?: string): void {
    this.ensureNotArchived();
    if (!title || title.trim() === "") {
      throw new Error("Title cannot be empty");
    }
    this._title = title.trim();
    this._description = description ? description.trim() : "";
    this._updatedAt = new Date();
  }

  public setFields(fields: readonly FormField[]): void {
    this.ensureNotArchived();
    this.validateFieldInvariants(fields);
    this._fields = [...fields];
    this._updatedAt = new Date();
  }

  public publish(): void {
    this.ensureNotArchived();
    if (this._fields.length === 0) {
      throw new Error("Cannot publish a form definition with zero fields");
    }

    if (this._status === "PUBLISHED") {
      // Bumps version if already published and republished
      this._version += 1;
    } else {
      this._status = "PUBLISHED";
    }

    this._updatedAt = new Date();
  }

  public archive(): void {
    this.ensureNotArchived();
    this._status = "ARCHIVED";
    this._updatedAt = new Date();
  }

  private ensureNotArchived(): void {
    if (this._status === "ARCHIVED") {
      throw new Error(`Cannot modify FormDefinition '${this.id}' because it is ARCHIVED`);
    }
  }

  public toJSON() {
    return {
      id: this.id,
      tenantId: this.tenantId,
      title: this.title,
      description: this.description,
      status: this.status,
      version: this.version,
      fields: this.fields,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}
