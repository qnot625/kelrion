import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import {
  DuplicateServiceCodeError,
  InvalidServiceCodeError,
  InvalidServiceDurationError,
  ServiceNotFoundError,
  DuplicateBranchServiceMappingError,
  validateServiceCode,
  validateServiceDuration,
} from "@adminops/branch-flow";
import type { Database } from "../src/database.js";
import { splitSqlStatements } from "../src/connect.js";
import * as schema from "../src/schema.js";
import { PostgresTenantRepository } from "../src/postgres-tenant-repository.js";
import { PostgresBranchRepository } from "../src/postgres-branch-repository.js";
import { PostgresServiceRepository } from "../src/postgres-service-repository.js";

async function freshDatabase(): Promise<Database> {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as unknown as Database;
  const migrationPath = fileURLToPath(new URL("../migrations/0001_initial.sql", import.meta.url));
  for (const statement of splitSqlStatements(await readFile(migrationPath, "utf8"))) {
    await db.execute(sql.raw(statement));
  }
  return db;
}

test("validates service code and duration constraints", () => {
  assert.throws(
    () => validateServiceCode("invalid code with spaces!"),
    InvalidServiceCodeError
  );
  assert.throws(() => validateServiceCode(""), InvalidServiceCodeError);
  assert.doesNotThrow(() => validateServiceCode("PASSPORT_RENEWAL_123"));

  assert.throws(
    () => validateServiceDuration(0),
    InvalidServiceDurationError
  );
  assert.throws(
    () => validateServiceDuration(500),
    InvalidServiceDurationError
  );
  assert.doesNotThrow(() => validateServiceDuration(30));
});

test("persists a service and enforces code uniqueness per tenant", async () => {
  const db = await freshDatabase();
  const tenants = new PostgresTenantRepository(db);
  const services = new PostgresServiceRepository(db);

  const t1 = await tenants.create({ name: "Tenant Alpha", slug: "tenant-alpha" });
  const t2 = await tenants.create({ name: "Tenant Beta", slug: "tenant-beta" });

  const { service, requirement } = await services.createService(
    {
      tenantId: t1.id,
      code: "PASSPORT-RENEW",
      name: "Passport Renewal",
      description: "Standard passport renewal",
      durationMinutes: 30,
      status: "active",
    },
    {
      photoIdRequired: true,
      minAge: 18,
      requiredDocuments: ["Birth Certificate", "Old Passport"],
      customNotes: "Bring physical copies",
    }
  );

  assert.ok(service.id);
  assert.equal(service.code, "PASSPORT-RENEW");
  assert.ok(requirement);
  assert.equal(requirement.photoIdRequired, true);
  assert.equal(requirement.minAge, 18);
  assert.deepEqual(requirement.requiredDocuments, ["Birth Certificate", "Old Passport"]);

  // Duplicate code in same tenant fails
  await assert.rejects(
    () =>
      services.createService({
        tenantId: t1.id,
        code: "PASSPORT-RENEW",
        name: "Passport Renewal Duplicate",
        durationMinutes: 45,
        status: "active",
      }),
    DuplicateServiceCodeError
  );

  // Same code allowed in different tenant
  const t2Service = await services.createService({
    tenantId: t2.id,
    code: "PASSPORT-RENEW",
    name: "Beta Passport Renewal",
    durationMinutes: 20,
    status: "active",
  });
  assert.ok(t2Service.service.id);
});

test("service retrieval and tenant isolation", async () => {
  const db = await freshDatabase();
  const tenants = new PostgresTenantRepository(db);
  const services = new PostgresServiceRepository(db);

  const t1 = await tenants.create({ name: "Tenant Alpha", slug: "tenant-alpha" });
  const t2 = await tenants.create({ name: "Tenant Beta", slug: "tenant-beta" });

  const created = await services.createService({
    tenantId: t1.id,
    code: "DRIVERS-LICENSE",
    name: "Driver's License Renewal",
    durationMinutes: 15,
    status: "active",
  });

  const found = await services.getServiceById(created.service.id, t1.id);
  assert.deepEqual(found, created.service);

  const byCode = await services.getServiceByCode("DRIVERS-LICENSE", t1.id);
  assert.deepEqual(byCode, created.service);

  // Cross-tenant access returns null
  assert.equal(await services.getServiceById(created.service.id, t2.id), null);
  assert.equal(await services.getServiceByCode("DRIVERS-LICENSE", t2.id), null);
  assert.deepEqual(await services.getServices(t2.id), []);
});

test("updates service and service requirements", async () => {
  const db = await freshDatabase();
  const tenants = new PostgresTenantRepository(db);
  const services = new PostgresServiceRepository(db);

  const t1 = await tenants.create({ name: "Tenant Alpha", slug: "tenant-alpha" });

  const { service } = await services.createService({
    tenantId: t1.id,
    code: "VISA-APP",
    name: "Visa Application",
    durationMinutes: 60,
    status: "active",
  });

  const updated = await services.updateService(service.id, t1.id, {
    name: "Express Visa Application",
    durationMinutes: 45,
  });
  assert.equal(updated.name, "Express Visa Application");
  assert.equal(updated.durationMinutes, 45);

  await assert.rejects(
    () => services.updateService("00000000-0000-0000-0000-000000000000", t1.id, { name: "Nonexistent" }),
    ServiceNotFoundError
  );

  const req = await services.setServiceRequirement(service.id, t1.id, {
    photoIdRequired: true,
    minAge: 16,
    maxAge: 80,
    requiredDocuments: ["Proof of Address"],
    customNotes: "Requires biometrics",
  });
  assert.equal(req.minAge, 16);
  assert.equal(req.maxAge, 80);

  const fetchedReq = await services.getServiceRequirement(service.id, t1.id);
  assert.deepEqual(fetchedReq, req);
});

test("assigns and lists branch services with tenant isolation", async () => {
  const db = await freshDatabase();
  const tenants = new PostgresTenantRepository(db);
  const branches = new PostgresBranchRepository(db);
  const services = new PostgresServiceRepository(db);

  const t1 = await tenants.create({ name: "Tenant Alpha", slug: "tenant-alpha" });
  const t2 = await tenants.create({ name: "Tenant Beta", slug: "tenant-beta" });

  const b1 = await branches.createBranch({
    tenantId: t1.id,
    slug: "main-hq",
    name: "Main HQ",
    status: "active",
    address: "100 Main St",
    latitude: 51.5,
    longitude: -0.12,
  });

  const s1 = await services.createService({
    tenantId: t1.id,
    code: "CHECKUP",
    name: "Health Checkup",
    durationMinutes: 30,
    status: "active",
  });

  const mapping = await services.assignServiceToBranch(t1.id, b1.id, s1.service.id);
  assert.equal(mapping.branchId, b1.id);
  assert.equal(mapping.serviceId, s1.service.id);

  // Duplicate mapping throws
  await assert.rejects(
    () => services.assignServiceToBranch(t1.id, b1.id, s1.service.id),
    DuplicateBranchServiceMappingError
  );

  const branchServicesList = await services.getBranchServices(b1.id, t1.id);
  assert.equal(branchServicesList.length, 1);
  assert.equal(branchServicesList[0]?.id, s1.service.id);

  // Cross tenant lookup returns empty array
  assert.deepEqual(await services.getBranchServices(b1.id, t2.id), []);

  await services.removeServiceFromBranch(t1.id, b1.id, s1.service.id);
  assert.deepEqual(await services.getBranchServices(b1.id, t1.id), []);
});
