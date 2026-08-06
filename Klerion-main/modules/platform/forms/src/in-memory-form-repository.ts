import { FormDefinition } from "./form-definition.js";
import type { FormDefinitionRepository } from "./form-repository.js";

export class InMemoryFormDefinitionRepository implements FormDefinitionRepository {
  private readonly forms = new Map<string, FormDefinition>();

  async findById(tenantId: string, id: string): Promise<FormDefinition | null> {
    const key = this.buildKey(tenantId, id);
    const form = this.forms.get(key);
    if (!form || form.tenantId !== tenantId) {
      return null;
    }
    return this.clone(form);
  }

  async findByTenant(tenantId: string): Promise<FormDefinition[]> {
    const results: FormDefinition[] = [];
    for (const form of this.forms.values()) {
      if (form.tenantId === tenantId) {
        results.push(this.clone(form));
      }
    }
    return results;
  }

  async save(form: FormDefinition): Promise<void> {
    const key = this.buildKey(form.tenantId, form.id);
    this.forms.set(key, this.clone(form));
  }

  async delete(tenantId: string, id: string): Promise<boolean> {
    const key = this.buildKey(tenantId, id);
    const exists = this.forms.has(key);
    if (exists) {
      this.forms.delete(key);
      return true;
    }
    return false;
  }

  public clear(): void {
    this.forms.clear();
  }

  private buildKey(tenantId: string, id: string): string {
    return `${tenantId}:${id}`;
  }

  private clone(form: FormDefinition): FormDefinition {
    return new FormDefinition({
      id: form.id,
      tenantId: form.tenantId,
      title: form.title,
      description: form.description,
      status: form.status,
      version: form.version,
      fields: form.fields,
      createdAt: form.createdAt,
      updatedAt: form.updatedAt,
    });
  }
}
