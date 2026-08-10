import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthService, InMemoryUserRepository } from "@adminops/identity";
import { InMemoryTenantRepository } from "@adminops/tenancy";
import {
  ControlPlaneService,
  InMemoryControlPlaneRepository,
  ModuleNotEnabledError,
  PlatformAdminAuthService,
  assertLiveModuleSelection,
  expandModuleSelection,
} from "../src/index.js";

const secret = new TextEncoder().encode("control-plane-test-secret");

test("expands module dependencies deterministically", () => {
  assert.deepEqual(expandModuleSelection(["attendance", "approvals"]), ["employees", "attendance", "forms", "workflow", "approvals"]);
});

test("preview modules cannot be enabled on live subscriptions", async () => {
  assert.doesNotThrow(() => assertLiveModuleSelection(["queue", "notifications"]));
  assert.throws(() => assertLiveModuleSelection(["recruitment"]), /Preview modules cannot be enabled/);

  const tenants = new InMemoryTenantRepository();
  const users = new InMemoryUserRepository();
  const repository = new InMemoryControlPlaneRepository();
  const service = new ControlPlaneService(repository, tenants, users);
  await assert.rejects(() => service.createOrganisation({
    name: "Preview Co",
    slug: "preview-co",
    ownerEmail: "owner@preview.test",
    ownerPassword: "correct-horse",
    enabledModules: ["recruitment"],
    currency: "NGN",
    billingCycle: "monthly",
  }), /Preview modules cannot be enabled/);
});

test("provisions an organisation with owner, entitlements and invoice", async () => {
  const tenants = new InMemoryTenantRepository();
  const users = new InMemoryUserRepository();
  const repository = new InMemoryControlPlaneRepository();
  const service = new ControlPlaneService(repository, tenants, users);

  const organisation = await service.createOrganisation({
    name: "Acme Bank",
    slug: "acme-bank",
    ownerEmail: "owner@acme.test",
    ownerPassword: "correct-horse",
    enabledModules: ["attendance", "queue"],
    currency: "NGN",
    billingCycle: "monthly",
    trialDays: 14,
  });

  assert.equal(organisation.subscription?.status, "trialing");
  assert.deepEqual(organisation.subscription?.enabledModules, ["employees", "attendance", "branches", "queue"]);
  assert.equal((await users.listByTenant(organisation.id)).length, 1);
  assert.equal((await service.listInvoices(organisation.id)).length, 1);
  await service.assertModuleEnabled(organisation.id, "queue");
  await assert.rejects(() => service.assertModuleEnabled(organisation.id, "forms"), ModuleNotEnabledError);
  await assert.rejects(() => service.updateSubscription(organisation.id, { enabledModules: ["recruitment"] }), /Preview modules cannot be enabled/);
});

test("supports self-service signup and platform administrator authentication", async () => {
  const tenants = new InMemoryTenantRepository();
  const users = new InMemoryUserRepository();
  const repository = new InMemoryControlPlaneRepository();
  const service = new ControlPlaneService(repository, tenants, users);
  const auth = new AuthService(users, secret);
  const adminAuth = new PlatformAdminAuthService(repository, secret);

  const bootstrap = await adminAuth.bootstrap("root@klerion.test", "very-secure-password");
  assert.equal((await adminAuth.verifyToken(bootstrap.token)).roles[0], "god_admin");
  const login = await adminAuth.login("root@klerion.test", "very-secure-password");
  assert.ok(login.token);

  const signup = await service.selfServiceSignUp(auth, {
    name: "Beta Health",
    slug: "beta-health",
    ownerEmail: "owner@beta.test",
    ownerPassword: "strong-password",
    enabledModules: ["cases"],
  });
  assert.equal(signup.tenant.slug, "beta-health");
  assert.ok(signup.auth.token);
});
