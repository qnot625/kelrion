import type { FormDefinition } from "./form-definition.js";

export interface FormDefinitionRepository {
  findById(tenantId: string, id: string): Promise<FormDefinition | null>;
  findByTenant(tenantId: string): Promise<FormDefinition[]>;
  findPublishedVersion(tenantId: string, id: string, version: number): Promise<FormDefinition | null>;
  findLatestPublishedVersion(tenantId: string, id: string): Promise<FormDefinition | null>;
  listPublishedVersions(tenantId: string, id: string): Promise<FormDefinition[]>;
  save(form: FormDefinition): Promise<void>;
  savePublishedVersion(form: FormDefinition): Promise<void>;
}
