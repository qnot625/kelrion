import assert from "node:assert/strict";
import { test } from "node:test";
import {
  InvalidServiceDurationError,
  InvalidServiceCodeError,
  DuplicateServiceCodeError,
  validateServiceDuration,
  validateServiceCode,
} from "../src/service-catalog.js";
import { InMemoryServiceRepository } from "../src/in-memory-service-repository.js";

test("validateServiceDuration enforces integer bounds (1 to 480 minutes)", () => {
  assert.doesNotThrow(() => validateServiceDuration(1));
  assert.doesNotThrow(() => validateServiceDuration(30));
  assert.doesNotThrow(() => validateServiceDuration(480));

  assert.throws(() => validateServiceDuration(0), InvalidServiceDurationError);
  assert.throws(() => validateServiceDuration(-15), InvalidServiceDurationError);
  assert.throws(() => validateServiceDuration(481), InvalidServiceDurationError);
  assert.throws(() => validateServiceDuration(30.5), InvalidServiceDurationError);
});

test("validateServiceCode enforces alphanumeric format", () => {
  assert.doesNotThrow(() => validateServiceCode("PASSPORT-RENEW"));
  assert.doesNotThrow(() => validateServiceCode("LICENSE_123"));

  assert.throws(() => validateServiceCode(""), InvalidServiceCodeError);
  assert.throws(() => validateServiceCode("INVALID CODE!"), InvalidServiceCodeError);
  assert.throws(() => validateServiceCode("CODE@123"), InvalidServiceCodeError);
});

test("InMemoryServiceRepository creates, retrieves, and isolates services per tenant", async () => {
  const repo = new InMemoryServiceRepository();

  const { service, requirement } = await repo.createService(
    {
      tenantId: "tenant-1",
      code: "NOTARY-01",
      name: "Notary Public Service",
      description: "Official document notarization",
      durationMinutes: 15,
      status: "active",
    },
    {
      photoIdRequired: true,
      minAge: 18,
      maxAge: null,
      requiredDocuments: ["State ID", "Unsigned Document"],
      customNotes: "Must sign in presence of notary",
    }
  );

  assert.equal(service.code, "NOTARY-01");
  assert.equal(service.tenantId, "tenant-1");
  assert.equal(requirement?.photoIdRequired, true);
  assert.equal(requirement?.minAge, 18);

  const foundByCode = await repo.getServiceByCode("NOTARY-01", "tenant-1");
  assert.equal(foundByCode?.id, service.id);

  // Tenant isolation
  const wrongTenant = await repo.getServiceByCode("NOTARY-01", "tenant-2");
  assert.equal(wrongTenant, null);

  const tenant1List = await repo.getServices("tenant-1");
  assert.equal(tenant1List.length, 1);

  const tenant2List = await repo.getServices("tenant-2");
  assert.equal(tenant2List.length, 0);
});

test("InMemoryServiceRepository rejects duplicate service code in same tenant", async () => {
  const repo = new InMemoryServiceRepository();

  await repo.createService({
    tenantId: "tenant-1",
    code: "DUPLICATE-CODE",
    name: "Service A",
    durationMinutes: 30,
    status: "active",
  });

  await assert.rejects(
    () =>
      repo.createService({
        tenantId: "tenant-1",
        code: "DUPLICATE-CODE",
        name: "Service B",
        durationMinutes: 45,
        status: "active",
      }),
    DuplicateServiceCodeError
  );

  // Same code in different tenant should succeed
  const otherTenant = await repo.createService({
    tenantId: "tenant-2",
    code: "DUPLICATE-CODE",
    name: "Service B",
    durationMinutes: 45,
    status: "active",
  });
  assert.equal(otherTenant.service.tenantId, "tenant-2");
});

test("InMemoryServiceRepository manages branch service mapping and tenant isolation", async () => {
  const repo = new InMemoryServiceRepository();

  const { service } = await repo.createService({
    tenantId: "tenant-1",
    code: "CHECKUP",
    name: "Health Checkup",
    durationMinutes: 20,
    status: "active",
  });

  const branchId = "branch-100";
  const mapped = await repo.assignServiceToBranch("tenant-1", branchId, service.id);
  assert.equal(mapped.branchId, branchId);
  assert.equal(mapped.serviceId, service.id);

  const branchServices = await repo.getBranchServices(branchId, "tenant-1");
  assert.equal(branchServices.length, 1);
  assert.equal(branchServices[0]?.id, service.id);

  // Tenant isolation on branch services
  const wrongTenantServices = await repo.getBranchServices(branchId, "tenant-2");
  assert.equal(wrongTenantServices.length, 0);

  // Remove assignment
  await repo.removeServiceFromBranch("tenant-1", branchId, service.id);
  const afterRemove = await repo.getBranchServices(branchId, "tenant-1");
  assert.equal(afterRemove.length, 0);
});
