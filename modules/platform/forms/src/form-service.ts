import { randomUUID } from "node:crypto";
import type { AuditLog } from "@adminops/audit";
import { FormDefinition } from "./form-definition.js";
import type { FormFieldProps } from "./form-field.js";
import type { FormDefinitionRepository } from "./form-repository.js";
import { FormDefinitionNotFoundError, FormsValidationError } from "./errors.js";

export class FormDefinitionService {
  constructor(
    private readonly repository: FormDefinitionRepository,
    private readonly auditLog?: AuditLog,
  ) {}

  async createForm(input: {
    tenantId: string;
    id?: string;
    title: string;
    description?: string;
    fields?: readonly FormFieldProps[];
    locale?: string;
    templateKey?: string | null;
    actorUserId?: string | null;
  }): Promise<FormDefinition> {
    const id = input.id?.trim() || randomUUID();
    if (await this.repository.findById(input.tenantId, id)) {
      throw new FormsValidationError(`Form definition '${id}' already exists`);
    }
    let form: FormDefinition;
    try {
      form = new FormDefinition({
        id,
        tenantId: input.tenantId,
        title: input.title,
        description: input.description,
        fields: input.fields,
        locale: input.locale,
        templateKey: input.templateKey,
      });
    } catch (error) {
      throw this.validation(error);
    }
    await this.repository.save(form);
    await this.audit("form.created", form, input.actorUserId, { version: form.version });
    return form;
  }

  async updateDraft(input: {
    tenantId: string;
    id: string;
    title?: string;
    description?: string;
    fields?: readonly FormFieldProps[];
    locale?: string;
    templateKey?: string | null;
    actorUserId?: string | null;
  }): Promise<FormDefinition> {
    const form = await this.require(input.tenantId, input.id);
    try {
      form.prepareDraftRevision();
      form.updateDraft(input);
    } catch (error) {
      throw this.validation(error);
    }
    await this.repository.save(form);
    await this.audit("form.draft_updated", form, input.actorUserId, { version: form.version, fieldCount: form.fields.length });
    return form;
  }

  async publish(input: { tenantId: string; id: string; actorUserId?: string | null }): Promise<FormDefinition> {
    const form = await this.require(input.tenantId, input.id);
    try { form.publish(); } catch (error) { throw this.validation(error); }
    await this.repository.save(form);
    await this.repository.savePublishedVersion(form);
    await this.audit("form.published", form, input.actorUserId, { version: form.version });
    return form;
  }

  async archive(input: { tenantId: string; id: string; actorUserId?: string | null }): Promise<FormDefinition> {
    const form = await this.require(input.tenantId, input.id);
    try { form.archive(); } catch (error) { throw this.validation(error); }
    await this.repository.save(form);
    await this.audit("form.archived", form, input.actorUserId, { version: form.version });
    return form;
  }

  async get(tenantId: string, id: string): Promise<FormDefinition> {
    return this.require(tenantId, id);
  }

  async getPublished(tenantId: string, id: string, version?: number): Promise<FormDefinition> {
    const current = await this.require(tenantId, id);
    if (current.status === "ARCHIVED") throw new FormDefinitionNotFoundError(id);
    const form = version === undefined
      ? await this.repository.findLatestPublishedVersion(tenantId, id)
      : await this.repository.findPublishedVersion(tenantId, id, version);
    if (!form) throw new FormDefinitionNotFoundError(id);
    return form;
  }

  async list(tenantId: string): Promise<FormDefinition[]> {
    return this.repository.findByTenant(tenantId);
  }

  async listPublished(tenantId: string): Promise<FormDefinition[]> {
    const current = await this.repository.findByTenant(tenantId);
    const visible: FormDefinition[] = [];
    for (const form of current) {
      if (form.status === "ARCHIVED") continue;
      const published = await this.repository.findLatestPublishedVersion(tenantId, form.id);
      if (published) visible.push(published);
    }
    return visible.sort((a, b) => a.title.localeCompare(b.title));
  }

  async listVersions(tenantId: string, id: string): Promise<FormDefinition[]> {
    await this.require(tenantId, id);
    return this.repository.listPublishedVersions(tenantId, id);
  }

  private async require(tenantId: string, id: string): Promise<FormDefinition> {
    const form = await this.repository.findById(tenantId, id);
    if (!form) throw new FormDefinitionNotFoundError(id);
    return form;
  }

  private validation(error: unknown): FormsValidationError {
    return new FormsValidationError(error instanceof Error ? error.message : "Invalid form definition");
  }

  private async audit(
    action: string,
    form: FormDefinition,
    actorUserId: string | null | undefined,
    metadata: Record<string, unknown>,
  ) {
    if (!this.auditLog) return;
    await this.auditLog.record({
      tenantId: form.tenantId,
      actorUserId: actorUserId ?? null,
      action,
      targetType: "form_definition",
      targetId: form.id,
      metadata,
    });
  }
}
