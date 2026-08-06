import {
  type ServiceRef,
  type ServiceRequirement,
  type BranchServiceRef,
  type ServiceRepository,
  DuplicateServiceCodeError,
  ServiceNotFoundError,
  DuplicateBranchServiceMappingError,
  validateServiceCode,
  validateServiceDuration,
} from "./service-catalog.js";

export class InMemoryServiceRepository implements ServiceRepository {
  private readonly services = new Map<string, ServiceRef>();
  private readonly requirements = new Map<string, ServiceRequirement>(); // key: serviceId
  private readonly branchServices = new Map<string, BranchServiceRef>(); // key: id

  async createService(
    serviceInput: Omit<ServiceRef, "id">,
    requirementInput?: Omit<ServiceRequirement, "id" | "tenantId" | "serviceId">
  ): Promise<{ service: ServiceRef; requirement: ServiceRequirement | null }> {
    validateServiceCode(serviceInput.code);
    validateServiceDuration(serviceInput.durationMinutes);

    const exists = [...this.services.values()].some(
      (s) => s.tenantId === serviceInput.tenantId && s.code === serviceInput.code
    );
    if (exists) {
      throw new DuplicateServiceCodeError(
        `Service with code '${serviceInput.code}' already exists for this tenant.`
      );
    }

    const id = `service-${Math.random().toString(36).substring(2, 11)}`;
    const service: ServiceRef = {
      id,
      ...serviceInput,
      description: serviceInput.description ?? null,
      status: serviceInput.status ?? "active",
    };
    this.services.set(id, service);

    let requirement: ServiceRequirement | null = null;
    if (requirementInput) {
      const reqId = `req-${Math.random().toString(36).substring(2, 11)}`;
      requirement = {
        id: reqId,
        tenantId: service.tenantId,
        serviceId: id,
        photoIdRequired: requirementInput.photoIdRequired ?? false,
        minAge: requirementInput.minAge ?? null,
        maxAge: requirementInput.maxAge ?? null,
        requiredDocuments: requirementInput.requiredDocuments ?? [],
        customNotes: requirementInput.customNotes ?? null,
      };
      this.requirements.set(id, requirement);
    }

    return { service, requirement };
  }

  async getServiceById(id: string, tenantId: string): Promise<ServiceRef | null> {
    const service = this.services.get(id);
    if (service && service.tenantId === tenantId) {
      return service;
    }
    return null;
  }

  async getServiceByCode(code: string, tenantId: string): Promise<ServiceRef | null> {
    const service = [...this.services.values()].find(
      (s) => s.tenantId === tenantId && s.code === code
    );
    return service || null;
  }

  async getServices(tenantId: string): Promise<ServiceRef[]> {
    return [...this.services.values()]
      .filter((s) => s.tenantId === tenantId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async updateService(
    id: string,
    tenantId: string,
    updates: Partial<Omit<ServiceRef, "id" | "tenantId">>
  ): Promise<ServiceRef> {
    const existing = await this.getServiceById(id, tenantId);
    if (!existing) {
      throw new ServiceNotFoundError("Service not found.");
    }

    if (updates.code !== undefined) {
      validateServiceCode(updates.code);
      if (updates.code !== existing.code) {
        const codeExists = [...this.services.values()].some(
          (s) => s.tenantId === tenantId && s.code === updates.code && s.id !== id
        );
        if (codeExists) {
          throw new DuplicateServiceCodeError(
            `Service with code '${updates.code}' already exists for this tenant.`
          );
        }
      }
    }

    if (updates.durationMinutes !== undefined) {
      validateServiceDuration(updates.durationMinutes);
    }

    const updated: ServiceRef = {
      ...existing,
      ...updates,
    };
    this.services.set(id, updated);
    return updated;
  }

  async getServiceRequirement(serviceId: string, tenantId: string): Promise<ServiceRequirement | null> {
    const service = await this.getServiceById(serviceId, tenantId);
    if (!service) return null;
    return this.requirements.get(serviceId) || null;
  }

  async setServiceRequirement(
    serviceId: string,
    tenantId: string,
    requirementInput: Omit<ServiceRequirement, "id" | "tenantId" | "serviceId">
  ): Promise<ServiceRequirement> {
    const service = await this.getServiceById(serviceId, tenantId);
    if (!service) {
      throw new ServiceNotFoundError("Service not found.");
    }

    const reqId = `req-${Math.random().toString(36).substring(2, 11)}`;
    const requirement: ServiceRequirement = {
      id: reqId,
      tenantId,
      serviceId,
      photoIdRequired: requirementInput.photoIdRequired ?? false,
      minAge: requirementInput.minAge ?? null,
      maxAge: requirementInput.maxAge ?? null,
      requiredDocuments: requirementInput.requiredDocuments ?? [],
      customNotes: requirementInput.customNotes ?? null,
    };
    this.requirements.set(serviceId, requirement);
    return requirement;
  }

  async assignServiceToBranch(
    tenantId: string,
    branchId: string,
    serviceId: string
  ): Promise<BranchServiceRef> {
    const service = await this.getServiceById(serviceId, tenantId);
    if (!service) {
      throw new ServiceNotFoundError("Service not found.");
    }

    const exists = [...this.branchServices.values()].some(
      (bs) => bs.tenantId === tenantId && bs.branchId === branchId && bs.serviceId === serviceId
    );
    if (exists) {
      throw new DuplicateBranchServiceMappingError("Service is already assigned to this branch.");
    }

    const id = `bs-${Math.random().toString(36).substring(2, 11)}`;
    const ref: BranchServiceRef = {
      id,
      tenantId,
      branchId,
      serviceId,
      status: "active",
    };
    this.branchServices.set(id, ref);
    return ref;
  }

  async removeServiceFromBranch(
    tenantId: string,
    branchId: string,
    serviceId: string
  ): Promise<void> {
    for (const [id, bs] of this.branchServices.entries()) {
      if (bs.tenantId === tenantId && bs.branchId === branchId && bs.serviceId === serviceId) {
        this.branchServices.delete(id);
      }
    }
  }

  async getBranchServices(branchId: string, tenantId: string): Promise<ServiceRef[]> {
    const mappings = [...this.branchServices.values()].filter(
      (bs) => bs.tenantId === tenantId && bs.branchId === branchId
    );
    const result: ServiceRef[] = [];
    for (const m of mappings) {
      const s = this.services.get(m.serviceId);
      if (s && s.tenantId === tenantId) {
        result.push(s);
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }
}
