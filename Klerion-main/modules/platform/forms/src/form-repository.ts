import type { FormDefinition } from "./form-definition.js";

export interface FormDefinitionRepository {
  findById(tenantId: string, id: string): Promise<FormDefinition | null>;
  findByTenant(tenantId: string): Promise<FormDefinition[]>;
  save(form: FormDefinition): Promise<void>;
  delete(tenantId: string, id: string): Promise<boolean>;
}
