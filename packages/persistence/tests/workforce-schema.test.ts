import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import type { Database } from "../src/database.js";
import { splitSqlStatements } from "../src/connect.js";
import { isUniqueViolation } from "../src/pg-errors.js";
import * as schema from "../src/schema.js";

async function freshDatabase(): Promise<Database> {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as unknown as Database;
  const migrationPath = fileURLToPath(new URL("../migrations/0001_initial.sql", import.meta.url));
  for (const statement of splitSqlStatements(await readFile(migrationPath, "utf8"))) {
    await db.execute(sql.raw(statement));
  }
  return db;
}

test("workforce schema: creates departments, positions, and employees with correct constraints", async () => {
  const db = await freshDatabase();

  // Create tenant
  const [tenant] = await db.insert(schema.tenants).values({
    name: "Acme Workforce",
    slug: "acme-workforce",
  }).returning();
  assert.ok(tenant?.id);

  // Create department
  const [dept] = await db.insert(schema.departments).values({
    tenantId: tenant.id,
    name: "Engineering",
    code: "ENG",
  }).returning();
  assert.ok(dept?.id);
  assert.equal(dept.code, "ENG");

  // Create position
  const [pos] = await db.insert(schema.positions).values({
    tenantId: tenant.id,
    title: "Software Engineer",
    code: "SWE-1",
    departmentId: dept.id,
  }).returning();
  assert.ok(pos?.id);

  // Create employee
  const [emp] = await db.insert(schema.employees).values({
    tenantId: tenant.id,
    employeeNumber: "EMP-001",
    firstName: "Alice",
    lastName: "Smith",
    email: "alice@acme.com",
    departmentId: dept.id,
    positionId: pos.id,
    hireDate: "2026-01-01",
  }).returning();
  assert.ok(emp?.id);
  assert.equal(emp.employeeNumber, "EMP-001");

  // Enforce unique employee number per tenant
  await assert.rejects(
    async () => {
      await db.insert(schema.employees).values({
        tenantId: tenant.id,
        employeeNumber: "EMP-001",
        firstName: "Bob",
        lastName: "Jones",
        email: "bob@acme.com",
        hireDate: "2026-01-01",
      });
    },
    (err: unknown) => isUniqueViolation(err) || (err instanceof Error && /duplicate|unique|failed query/i.test(err.message)),
    "Should reject duplicate employee number within same tenant",
  );
});

test("workforce schema: enforces idempotency key uniqueness on attendance_events", async () => {
  const db = await freshDatabase();

  const [tenant] = await db.insert(schema.tenants).values({
    name: "Beta Logistics",
    slug: "beta-logistics",
  }).returning();

  const [emp] = await db.insert(schema.employees).values({
    tenantId: tenant!.id,
    employeeNumber: "EMP-100",
    firstName: "Charlie",
    lastName: "Brown",
    email: "charlie@beta.com",
    hireDate: "2026-02-01",
  }).returning();

  const idempotencyKey = "uuid-key-12345";
  const now = new Date();

  // Insert attendance event
  const [event] = await db.insert(schema.attendanceEvents).values({
    tenantId: tenant!.id,
    employeeId: emp!.id,
    eventType: "clock_in",
    timestamp: now,
    idempotencyKey,
  }).returning();
  assert.ok(event?.id);

  // Re-insert with same idempotency key in same tenant must fail
  await assert.rejects(
    async () => {
      await db.insert(schema.attendanceEvents).values({
        tenantId: tenant!.id,
        employeeId: emp!.id,
        eventType: "clock_in",
        timestamp: now,
        idempotencyKey,
      });
    },
    (err: unknown) => isUniqueViolation(err) || (err instanceof Error && /duplicate|unique|failed query/i.test(err.message)),
    "Should reject duplicate idempotency key within same tenant",
  );
});

test("workforce schema: supports attendance summaries and corrections", async () => {
  const db = await freshDatabase();

  const [tenant] = await db.insert(schema.tenants).values({
    name: "Gamma Retail",
    slug: "gamma-retail",
  }).returning();

  const [emp] = await db.insert(schema.employees).values({
    tenantId: tenant!.id,
    employeeNumber: "EMP-200",
    firstName: "David",
    lastName: "Miller",
    email: "david@gamma.com",
    hireDate: "2026-03-01",
  }).returning();

  // Create attendance summary
  const [summary] = await db.insert(schema.attendanceSummaries).values({
    tenantId: tenant!.id,
    employeeId: emp!.id,
    workDate: "2026-07-30",
    totalWorkMinutes: 480,
    status: "present",
  }).returning();
  assert.ok(summary?.id);
  assert.equal(summary.totalWorkMinutes, 480);

  // Create attendance correction
  const [correction] = await db.insert(schema.attendanceCorrections).values({
    tenantId: tenant!.id,
    employeeId: emp!.id,
    requestedEventType: "clock_in",
    requestedTimestamp: new Date("2026-07-30T08:00:00Z"),
    reason: "Forgot to punch in",
    status: "pending",
  }).returning();
  assert.ok(correction?.id);
  assert.equal(correction.status, "pending");
});
