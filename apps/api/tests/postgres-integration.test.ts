import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { ControlPlaneService, PlatformAdminAuthService } from "@adminops/control-plane";
import { AuthService } from "@adminops/identity";
import { AppointmentService } from "@adminops/branch-flow";
import {
  PostgresAppointmentRepository,
  PostgresAuditLog,
  PostgresControlPlaneRepository,
  PostgresBranchRepository,
  PostgresServiceRepository,
  PostgresWaitlistRepository,
  PostgresTenantRepository,
  PostgresUserRepository,
  runMigrations,
  schema,
  type Database,
} from "@adminops/persistence";
import {
  CustomerCaseService,
  ExecutiveSummaryService,
  PostgresCustomerIntelligenceRepository,
} from "../src/domains/customer-intelligence/index.js";
import {
  PostgresWorkforceLifecycleRepository,
  WorkforceLifecycleService,
} from "../src/domains/workforce-lifecycle/index.js";
import type { AppContext } from "../src/context.js";
import { buildServer } from "../src/server.js";

/** Same wiring as createPostgresAppContext, but against PGlite instead of a server. */
async function postgresBackedContext(): Promise<AppContext> {
  const db = drizzle(new PGlite(), { schema }) as unknown as Database;
  await runMigrations(db);

  const tenantRepository = new PostgresTenantRepository(db);
  const userRepository = new PostgresUserRepository(db);
  const controlPlaneRepository = new PostgresControlPlaneRepository(db);
  const branchRepository = new PostgresBranchRepository(db);
  const serviceRepository = new PostgresServiceRepository(db);
  const waitlistRepository = new PostgresWaitlistRepository(db);
  const appointmentService = new AppointmentService(
    new PostgresAppointmentRepository(db),
    branchRepository,
    serviceRepository,
    waitlistRepository,
  );
  const customerIntelligenceRepository = new PostgresCustomerIntelligenceRepository(db);

  return {
    tenantRepository,
    userRepository,
    controlPlaneRepository,
    authService: new AuthService(userRepository, new TextEncoder().encode("test-only-secret")),
    platformAdminAuthService: new PlatformAdminAuthService(
      controlPlaneRepository,
      new TextEncoder().encode("test-only-platform-secret"),
    ),
    controlPlaneService: new ControlPlaneService(
      controlPlaneRepository,
      tenantRepository,
      userRepository,
    ),
    appointmentService,
    branchRepository,
    serviceRepository,
    waitlistRepository,
    workforceLifecycleService: new WorkforceLifecycleService(
      new PostgresWorkforceLifecycleRepository(db),
    ),
    customerCaseService: new CustomerCaseService(customerIntelligenceRepository),
    executiveSummaryService: new ExecutiveSummaryService(
      customerIntelligenceRepository,
      appointmentService,
    ),
    auditLog: new PostgresAuditLog(db),
    close: async () => {},
  };
}

test("the full customer visit journey runs against real Postgres", async () => {
  const app = buildServer(await postgresBackedContext());

  const createTenant = await app.inject({
    method: "POST",
    url: "/tenants",
    payload: { name: "Acme Clinics", slug: "acme-clinics" },
  });
  assert.equal(createTenant.statusCode, 201, createTenant.body);

  const signUp = await app.inject({
    method: "POST",
    url: "/auth/signup",
    headers: { "x-tenant-slug": "acme-clinics" },
    payload: { email: "owner@acme.com", password: "correct-horse" },
  });
  assert.equal(signUp.statusCode, 201, signUp.body);
  const owner = signUp.json() as { token: string };

  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    headers: { "x-tenant-slug": "acme-clinics" },
    payload: { email: "owner@acme.com", password: "correct-horse" },
  });
  assert.equal(login.statusCode, 200, login.body);

  const book = await app.inject({
    method: "POST",
    url: "/appointments",
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` },
    payload: {
      customerEmail: "patient@example.com",
      serviceName: "General consultation",
      startAt: "2026-08-01T09:00:00Z",
      endAt: "2026-08-01T09:30:00Z",
    },
  });
  assert.equal(book.statusCode, 201, book.body);
  const appointment = book.json() as { id: string };

  const checkIn = await app.inject({
    method: "POST",
    url: `/appointments/${appointment.id}/check-in`,
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` },
  });
  assert.equal(checkIn.statusCode, 200, checkIn.body);

  const complete = await app.inject({
    method: "POST",
    url: `/appointments/${appointment.id}/complete`,
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` },
  });
  assert.equal((complete.json() as { status: string }).status, "completed");

  const audit = await app.inject({
    method: "GET",
    url: "/audit-events",
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` },
  });
  assert.deepEqual(
    (audit.json() as { action: string }[]).map((event) => event.action),
    [
      "tenant.created",
      "user.signed_up",
      "user.logged_in",
      "appointment.booked",
      "appointment.checked_in",
      "appointment.completed",
    ],
  );
});

test("tenant isolation holds when backed by real Postgres", async () => {
  const app = buildServer(await postgresBackedContext());

  for (const [name, slug] of [
    ["Acme Clinics", "acme-clinics"],
    ["Beta Health", "beta-health"],
  ]) {
    const created = await app.inject({ method: "POST", url: "/tenants", payload: { name, slug } });
    assert.equal(created.statusCode, 201, created.body);
  }

  const acmeOwner = (
    await app.inject({
      method: "POST",
      url: "/auth/signup",
      headers: { "x-tenant-slug": "acme-clinics" },
      payload: { email: "owner@acme.com", password: "correct-horse" },
    })
  ).json() as { token: string };

  const betaOwner = (
    await app.inject({
      method: "POST",
      url: "/auth/signup",
      headers: { "x-tenant-slug": "beta-health" },
      payload: { email: "owner@beta.com", password: "another-pass" },
    })
  ).json() as { token: string };

  const book = await app.inject({
    method: "POST",
    url: "/appointments",
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${acmeOwner.token}` },
    payload: {
      customerEmail: "patient@example.com",
      serviceName: "General consultation",
      startAt: "2026-08-01T09:00:00Z",
      endAt: "2026-08-01T09:30:00Z",
    },
  });
  const appointment = book.json() as { id: string };

  const crossTenantList = await app.inject({
    method: "GET",
    url: "/appointments",
    headers: { "x-tenant-slug": "beta-health", authorization: `Bearer ${betaOwner.token}` },
  });
  assert.deepEqual(crossTenantList.json(), []);

  const crossTenantCheckIn = await app.inject({
    method: "POST",
    url: `/appointments/${appointment.id}/check-in`,
    headers: { "x-tenant-slug": "beta-health", authorization: `Bearer ${betaOwner.token}` },
  });
  assert.equal(crossTenantCheckIn.statusCode, 404);

  const betaAudit = await app.inject({
    method: "GET",
    url: "/audit-events",
    headers: { "x-tenant-slug": "beta-health", authorization: `Bearer ${betaOwner.token}` },
  });
  assert.deepEqual(
    (betaAudit.json() as { action: string }[]).map((event) => event.action),
    ["tenant.created", "user.signed_up"],
  );
});
