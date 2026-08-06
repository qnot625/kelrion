import { FormDefinition } from "./form-definition.js";
import type { FormField } from "./form-field.js";
import type { FormDefinitionRepository } from "./form-repository.js";

export interface AuditLogRecorder {
  record(input: {
    tenantId: string;
    actorUserId?: string | null;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
  }): Promise<unknown>;
}

export class FormDefinitionService {
  constructor(
    private readonly formRepo: FormDefinitionRepository,
    private readonly auditLog?: AuditLogRecorder,
  ) {}

  public async createForm(params: {
    tenantId: string;
    id: string;
    title: string;
    description?: string;
    fields?: readonly FormField[];
    actorUserId?: string;
  }): Promise<FormDefinition> {
    const existing = await this.formRepo.findById(params.tenantId, params.id);
    if (existing) {
      throw new Error(
        `FormDefinition with ID '${params.id}' already exists for tenant '${params.tenantId}'`,
      );
    }

    const form = new FormDefinition({
      id: params.id,
      tenantId: params.tenantId,
      title: params.title,
      description: params.description,
      fields: params.fields,
      status: "DRAFT",
      version: 1,
    });

    await this.formRepo.save(form);

    if (this.auditLog) {
      await this.auditLog.record({
        tenantId: params.tenantId,
        actorUserId: params.actorUserId ?? null,
        action: "form.created",
        targetType: "form_definition",
        targetId: form.id,
        metadata: { title: form.title, version: form.version },
      });
    }

    return form;
  }

  public async updateFormDraft(params: {
    tenantId: string;
    id: string;
    title: string;
    description?: string;
    fields?: readonly FormField[];
    actorUserId?: string;
  }): Promise<FormDefinition> {
    const form = await this.getForm(params.tenantId, params.id);

    form.updateDetails(params.title, params.description);
    if (params.fields) {
      form.setFields(params.fields);
    }

    await this.formRepo.save(form);

    if (this.auditLog) {
      await this.auditLog.record({
        tenantId: params.tenantId,
        actorUserId: params.actorUserId ?? null,
        action: "form.updated",
        targetType: "form_definition",
        targetId: form.id,
        metadata: { title: form.title, fieldCount: form.fields.length },
      });
    }

    return form;
  }

  public async publishForm(params: {
    tenantId: string;
    id: string;
    actorUserId?: string;
  }): Promise<FormDefinition> {
    const form = await this.getForm(params.tenantId, params.id);

    form.publish();

    await this.formRepo.save(form);

    if (this.auditLog) {
      await this.auditLog.record({
        tenantId: params.tenantId,
        actorUserId: params.actorUserId ?? null,
        action: "form.published",
        targetType: "form_definition",
        targetId: form.id,
        metadata: { version: form.version },
      });
    }

    return form;
  }

  public async archiveForm(params: {
    tenantId: string;
    id: string;
    actorUserId?: string;
  }): Promise<FormDefinition> {
    const form = await this.getForm(params.tenantId, params.id);

    form.archive();

    await this.formRepo.save(form);

    if (this.auditLog) {
      await this.auditLog.record({
        tenantId: params.tenantId,
        actorUserId: params.actorUserId ?? null,
        action: "form.archived",
        targetType: "form_definition",
        targetId: form.id,
        metadata: { version: form.version },
      });
    }

    return form;
  }

  public async getForm(
    tenantId: string,
    id: string,
  ): Promise<FormDefinition> {
    const form = await this.formRepo.findById(tenantId, id);
    if (!form) {
      throw new Error(
        `FormDefinition with ID '${id}' not found for tenant '${tenantId}'`,
      );
    }
    return form;
  }

  public async listForms(tenantId: string): Promise<FormDefinition[]> {
    return this.formRepo.findByTenant(tenantId);
  }
}
