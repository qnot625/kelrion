import type { FormDefinition } from "./form-definition.js";
import type { FormDefinitionRepository } from "./form-repository.js";

export class InMemoryFormDefinitionRepository implements FormDefinitionRepository {
  private readonly current = new Map<string, FormDefinition>();
  private readonly versions = new Map<string, FormDefinition>();

  async findById(tenantId: string, id: string): Promise<FormDefinition | null> {
    return this.cloneOrNull(this.current.get(this.key(tenantId, id)));
  }

  async findByTenant(tenantId: string): Promise<FormDefinition[]> {
    return [...this.current.values()]
      .filter((form) => form.tenantId === tenantId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((form) => form.clone());
  }

  async findPublishedVersion(tenantId: string, id: string, version: number): Promise<FormDefinition | null> {
    return this.cloneOrNull(this.versions.get(this.versionKey(tenantId, id, version)));
  }

  async findLatestPublishedVersion(tenantId: string, id: string): Promise<FormDefinition | null> {
    const versions = await this.listPublishedVersions(tenantId, id);
    return versions[0] ?? null;
  }

  async listPublishedVersions(tenantId: string, id: string): Promise<FormDefinition[]> {
    return [...this.versions.values()]
      .filter((form) => form.tenantId === tenantId && form.id === id && form.status === "PUBLISHED")
      .sort((a, b) => b.version - a.version)
      .map((form) => form.clone());
  }

  async save(form: FormDefinition): Promise<void> {
    this.current.set(this.key(form.tenantId, form.id), form.clone());
  }

  async savePublishedVersion(form: FormDefinition): Promise<void> {
    if (form.status !== "PUBLISHED") throw new Error("Only published form definitions can be version snapshots");
    this.versions.set(this.versionKey(form.tenantId, form.id, form.version), form.clone());
  }

  clear(): void {
    this.current.clear();
    this.versions.clear();
  }

  private key(tenantId: string, id: string) { return `${tenantId}:${id}`; }
  private versionKey(tenantId: string, id: string, version: number) { return `${tenantId}:${id}:${version}`; }
  private cloneOrNull(form?: FormDefinition) { return form ? form.clone() : null; }
}
