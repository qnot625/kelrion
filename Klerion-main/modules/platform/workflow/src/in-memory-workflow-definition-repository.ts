import { WorkflowDefinition } from './workflow-definition.js';
import {
  WorkflowDefinitionRepository,
  WorkflowDefinitionFilter,
} from './workflow-definition-repository.js';

export class InMemoryWorkflowDefinitionRepository
  implements WorkflowDefinitionRepository
{
  // Map key: `${tenantId}:${id}:${version}`
  private definitions: Map<string, WorkflowDefinition> = new Map();

  private makeKey(tenantId: string, id: string, version: number): string {
    return `${tenantId}:${id}:${version}`;
  }

  private clone(def: WorkflowDefinition): WorkflowDefinition {
    const json = def.toJSON();
    return new WorkflowDefinition({
      id: json.id,
      tenantId: json.tenantId,
      name: json.name,
      description: json.description,
      version: json.version,
      status: json.status,
      startStepId: json.startStepId,
      steps: json.steps,
      triggers: json.triggers,
      metadata: json.metadata,
      createdAt: new Date(json.createdAt),
      updatedAt: new Date(json.updatedAt),
      publishedAt: json.publishedAt ? new Date(json.publishedAt) : undefined,
      archivedAt: json.archivedAt ? new Date(json.archivedAt) : undefined,
    });
  }

  public async save(definition: WorkflowDefinition): Promise<void> {
    const key = this.makeKey(
      definition.tenantId,
      definition.id,
      definition.version
    );
    this.definitions.set(key, this.clone(definition));
  }

  public async findById(
    id: string,
    tenantId: string
  ): Promise<WorkflowDefinition | null> {
    // Find highest version for this id and tenantId
    const matching: WorkflowDefinition[] = [];
    for (const def of this.definitions.values()) {
      if (def.id === id && def.tenantId === tenantId) {
        matching.push(def);
      }
    }

    if (matching.length === 0) return null;

    matching.sort((a, b) => b.version - a.version);
    return this.clone(matching[0]);
  }

  public async findByIdAndVersion(
    id: string,
    version: number,
    tenantId: string
  ): Promise<WorkflowDefinition | null> {
    const key = this.makeKey(tenantId, id, version);
    const def = this.definitions.get(key);
    if (!def) return null;
    return this.clone(def);
  }

  public async list(
    tenantId: string,
    filter?: WorkflowDefinitionFilter
  ): Promise<WorkflowDefinition[]> {
    let result: WorkflowDefinition[] = [];

    // Group by ID to take latest version per ID or match status
    const byIdMap = new Map<string, WorkflowDefinition[]>();

    for (const def of this.definitions.values()) {
      if (def.tenantId !== tenantId) continue;
      const list = byIdMap.get(def.id) || [];
      list.push(def);
      byIdMap.set(def.id, list);
    }

    for (const defs of byIdMap.values()) {
      defs.sort((a, b) => b.version - a.version);
      // Latest version of definition
      const latest = defs[0];
      result.push(latest);
    }

    if (filter?.status) {
      result = result.filter((d) => d.status === filter.status);
    }

    if (filter?.search) {
      const q = filter.search.toLowerCase();
      result = result.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          (d.description && d.description.toLowerCase().includes(q))
      );
    }

    return result.map((d) => this.clone(d));
  }

  public async delete(id: string, tenantId: string): Promise<boolean> {
    let deleted = false;
    for (const [key, def] of this.definitions.entries()) {
      if (def.id === id && def.tenantId === tenantId) {
        this.definitions.delete(key);
        deleted = true;
      }
    }
    return deleted;
  }

  public clear(): void {
    this.definitions.clear();
  }
}
