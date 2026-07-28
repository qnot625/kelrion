import assert from "node:assert/strict";
import { test } from "node:test";
import { DuplicateTenantSlugError } from "../src/tenant-repository.js";
import { InMemoryTenantRepository } from "../src/in-memory-tenant-repository.js";
import { getTenantContext, requireTenantContext, runWithTenantContext } from "../src/tenant-context.js";

test("creates a tenant and finds it by id and slug", async () => {
  const repo = new InMemoryTenantRepository();
  const tenant = await repo.create({ name: "Acme Clinics", slug: "acme-clinics" });

  assert.equal(tenant.status, "active");
  assert.ok(tenant.id);
  assert.deepEqual(await repo.findById(tenant.id), tenant);
  assert.deepEqual(await repo.findBySlug("acme-clinics"), tenant);
});

test("rejects a duplicate slug", async () => {
  const repo = new InMemoryTenantRepository();
  await repo.create({ name: "Acme Clinics", slug: "acme-clinics" });

  await assert.rejects(
    () => repo.create({ name: "Acme Clinics 2", slug: "acme-clinics" }),
    DuplicateTenantSlugError,
  );
});

test("rejects an invalid slug", async () => {
  const repo = new InMemoryTenantRepository();
  await assert.rejects(() => repo.create({ name: "Bad Slug", slug: "Not Valid!" }));
});

test("tenant context is isolated per async execution and required to read", () => {
  assert.equal(getTenantContext(), undefined);
  assert.throws(() => requireTenantContext());

  runWithTenantContext({ tenantId: "t1", tenantSlug: "acme-clinics" }, () => {
    assert.deepEqual(requireTenantContext(), { tenantId: "t1", tenantSlug: "acme-clinics" });
  });

  assert.equal(getTenantContext(), undefined);
});
