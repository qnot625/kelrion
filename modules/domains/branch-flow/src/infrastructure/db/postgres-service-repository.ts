import { and, asc, eq } from "drizzle-orm";
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
} from "../../index.js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
type Database = PgDatabase<PgQueryResultHKT, any>;
import { services, serviceRequirements, branchServices } from "./schema.js";

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (typeof current === "object" && "code" in current && current.code === UNIQUE_VIOLATION) {
      return true;
    }
    current = typeof current === "object" && "cause" in current ? current.cause : undefined;
  }
  return false;
}

type ServiceRow = typeof services.$inferSelect;
type ServiceRequirementRow = typeof serviceRequirements.$inferSelect;
type BranchServiceRow = typeof branchServices.$inferSelect;

function toServiceRef(row: ServiceRow): ServiceRef {
  return {
    id: row.id,
    tenantId: row.tenantId,
    code: row.code,
    name: row.name,
    description: row.description ?? null,
    durationMinutes: row.durationMinutes,
    status: row.status as "active" | "inactive",
  };
}

function toServiceRequirement(row: ServiceRequirementRow): ServiceRequirement {
  return {
    id: row.id,
    tenantId: row.tenantId,
    serviceId: row.serviceId,
    photoIdRequired: row.photoIdRequired,
    minAge: row.minAge ?? null,
    maxAge: row.maxAge ?? null,
    requiredDocuments: Array.isArray(row.requiredDocuments) ? row.requiredDocuments : [],
    customNotes: row.customNotes ?? null,
  };
}

function toBranchServiceRef(row: BranchServiceRow): BranchServiceRef {
  return {
    id: row.id,
    tenantId: row.tenantId,
    branchId: row.branchId,
    serviceId: row.serviceId,
    status: row.status as "active" | "inactive",
  };
}

export class PostgresServiceRepository implements ServiceRepository {
  constructor(private readonly db: Database) {}

  async createService(
    service: Omit<ServiceRef, "id">,
    requirement?: Omit<ServiceRequirement, "id" | "tenantId" | "serviceId">
  ): Promise<{ service: ServiceRef; requirement: ServiceRequirement | null }> {
    validateServiceCode(service.code);
    validateServiceDuration(service.durationMinutes);

    return await this.db.transaction(async (tx) => {
      try {
        const [serviceRow] = await tx
          .insert(services)
          .values({
            tenantId: service.tenantId,
            code: service.code,
            name: service.name,
            description: service.description ?? null,
            durationMinutes: service.durationMinutes,
            status: service.status ?? "active",
          })
          .returning();

        if (!serviceRow) {
          throw new Error("Failed to create service: no row returned");
        }

        let requirementRef: ServiceRequirement | null = null;
        if (requirement) {
          const [reqRow] = await tx
            .insert(serviceRequirements)
            .values({
              tenantId: service.tenantId,
              serviceId: serviceRow.id,
              photoIdRequired: requirement.photoIdRequired ?? false,
              minAge: requirement.minAge ?? null,
              maxAge: requirement.maxAge ?? null,
              requiredDocuments: requirement.requiredDocuments ?? [],
              customNotes: requirement.customNotes ?? null,
            })
            .returning();
          if (reqRow) {
            requirementRef = toServiceRequirement(reqRow);
          }
        }

        return {
          service: toServiceRef(serviceRow),
          requirement: requirementRef,
        };
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new DuplicateServiceCodeError(
            `Service with code '${service.code}' already exists for this tenant.`
          );
        }
        throw error;
      }
    });
  }

  async getServiceById(id: string, tenantId: string): Promise<ServiceRef | null> {
    const [row] = await this.db
      .select()
      .from(services)
      .where(and(eq(services.id, id), eq(services.tenantId, tenantId)))
      .limit(1);
    return row ? toServiceRef(row) : null;
  }

  async getServiceByCode(code: string, tenantId: string): Promise<ServiceRef | null> {
    const [row] = await this.db
      .select()
      .from(services)
      .where(and(eq(services.code, code), eq(services.tenantId, tenantId)))
      .limit(1);
    return row ? toServiceRef(row) : null;
  }

  async getServices(tenantId: string): Promise<ServiceRef[]> {
    const rows = await this.db
      .select()
      .from(services)
      .where(eq(services.tenantId, tenantId))
      .orderBy(asc(services.name));
    return rows.map(toServiceRef);
  }

  async updateService(
    id: string,
    tenantId: string,
    updates: Partial<Omit<ServiceRef, "id" | "tenantId">>
  ): Promise<ServiceRef> {
    if (updates.code !== undefined) {
      validateServiceCode(updates.code);
    }
    if (updates.durationMinutes !== undefined) {
      validateServiceDuration(updates.durationMinutes);
    }

    const existing = await this.getServiceById(id, tenantId);
    if (!existing) {
      throw new ServiceNotFoundError("Service not found.");
    }

    try {
      const [row] = await this.db
        .update(services)
        .set({
          code: updates.code,
          name: updates.name,
          description: updates.description,
          durationMinutes: updates.durationMinutes,
          status: updates.status,
        })
        .where(and(eq(services.id, id), eq(services.tenantId, tenantId)))
        .returning();

      if (!row) {
        throw new ServiceNotFoundError("Service not found.");
      }
      return toServiceRef(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DuplicateServiceCodeError(
          `Service with code '${updates.code}' already exists for this tenant.`
        );
      }
      throw error;
    }
  }

  async getServiceRequirement(serviceId: string, tenantId: string): Promise<ServiceRequirement | null> {
    const [row] = await this.db
      .select()
      .from(serviceRequirements)
      .where(
        and(
          eq(serviceRequirements.serviceId, serviceId),
          eq(serviceRequirements.tenantId, tenantId)
        )
      )
      .limit(1);
    return row ? toServiceRequirement(row) : null;
  }

  async setServiceRequirement(
    serviceId: string,
    tenantId: string,
    requirement: Omit<ServiceRequirement, "id" | "tenantId" | "serviceId">
  ): Promise<ServiceRequirement> {
    const service = await this.getServiceById(serviceId, tenantId);
    if (!service) {
      throw new ServiceNotFoundError("Service not found.");
    }

    return await this.db.transaction(async (tx) => {
      await tx
        .delete(serviceRequirements)
        .where(
          and(
            eq(serviceRequirements.serviceId, serviceId),
            eq(serviceRequirements.tenantId, tenantId)
          )
        );

      const [row] = await tx
        .insert(serviceRequirements)
        .values({
          tenantId,
          serviceId,
          photoIdRequired: requirement.photoIdRequired ?? false,
          minAge: requirement.minAge ?? null,
          maxAge: requirement.maxAge ?? null,
          requiredDocuments: requirement.requiredDocuments ?? [],
          customNotes: requirement.customNotes ?? null,
        })
        .returning();

      if (!row) {
        throw new Error("Failed to set service requirement: no row returned");
      }
      return toServiceRequirement(row);
    });
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

    try {
      const [row] = await this.db
        .insert(branchServices)
        .values({
          tenantId,
          branchId,
          serviceId,
          status: "active",
        })
        .returning();

      if (!row) {
        throw new Error("Failed to assign service to branch: no row returned");
      }
      return toBranchServiceRef(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DuplicateBranchServiceMappingError(
          `Service is already assigned to this branch.`
        );
      }
      throw error;
    }
  }

  async removeServiceFromBranch(
    tenantId: string,
    branchId: string,
    serviceId: string
  ): Promise<void> {
    await this.db
      .delete(branchServices)
      .where(
        and(
          eq(branchServices.tenantId, tenantId),
          eq(branchServices.branchId, branchId),
          eq(branchServices.serviceId, serviceId)
        )
      );
  }

  async getBranchServices(branchId: string, tenantId: string): Promise<ServiceRef[]> {
    const rows = await this.db
      .select({
        id: services.id,
        tenantId: services.tenantId,
        code: services.code,
        name: services.name,
        description: services.description,
        durationMinutes: services.durationMinutes,
        status: services.status,
      })
      .from(branchServices)
      .innerJoin(services, eq(branchServices.serviceId, services.id))
      .where(
        and(
          eq(branchServices.branchId, branchId),
          eq(branchServices.tenantId, tenantId),
          eq(services.tenantId, tenantId)
        )
      )
      .orderBy(asc(services.name));

    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      code: r.code,
      name: r.name,
      description: r.description ?? null,
      durationMinutes: r.durationMinutes,
      status: r.status as "active" | "inactive",
    }));
  }
}
