import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import {
  AttendanceRecord,
  AttendanceSyncEngine,
  type IdempotencyRegistryEntry,
} from "@adminops/workforce-core";
import type { Database } from "../src/database.js";
import { splitSqlStatements } from "../src/connect.js";
import * as schema from "../src/schema.js";
import { PostgresAttendanceRepository } from "../src/postgres-attendance-repository.js";

async function freshDatabase(): Promise<Database> {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as unknown as Database;
  const migrationPath = fileURLToPath(
    new URL("../migrations/0001_initial.sql", import.meta.url)
  );
  for (const statement of splitSqlStatements(
    await readFile(migrationPath, "utf8")
  )) {
    await db.execute(sql.raw(statement));
  }
  return db;
}

async function createFixtureTenantAndEmployee(db: Database, suffix = "1") {
  const [tenant] = await db
    .insert(schema.tenants)
    .values({
      name: `Tenant ${suffix}`,
      slug: `tenant-${suffix}-${Date.now()}-${Math.random()}`,
    })
    .returning();

  const [employee] = await db
    .insert(schema.employees)
    .values({
      tenantId: tenant!.id,
      employeeNumber: `EMP-${suffix}`,
      firstName: `John${suffix}`,
      lastName: "Doe",
      email: `john${suffix}@acme.com`,
      hireDate: "2026-01-01",
    })
    .returning();

  return { tenantId: tenant!.id, employeeId: employee!.id };
}

test("PostgresAttendanceRepository: 1. Save and 2. Retrieve AttendanceRecord with matching state", async () => {
  const db = await freshDatabase();
  const repo = new PostgresAttendanceRepository(db);
  const { tenantId, employeeId } = await createFixtureTenantAndEmployee(db, "1");

  const record = AttendanceRecord.create({
    tenantId,
    employeeId,
    workDate: "2026-08-01",
    clockInTime: "2026-08-01T08:00:00Z",
  });

  await repo.save(record);

  const found = await repo.findByEmployeeAndDate(tenantId, employeeId, "2026-08-01");
  assert.ok(found);
  assert.equal(found.id, record.id);
  assert.equal(found.tenantId, tenantId);
  assert.equal(found.employeeId, employeeId);
  assert.equal(found.workDate, "2026-08-01");
  assert.equal(found.status, "CLOCKED_IN");
  assert.equal(new Date(found.clockInTime!).toISOString(), "2026-08-01T08:00:00.000Z");
});

test("PostgresAttendanceRepository: 3. Aggregate Reconstruction (timestamps, duration, exceptions)", async () => {
  const db = await freshDatabase();
  const repo = new PostgresAttendanceRepository(db);
  const { tenantId, employeeId } = await createFixtureTenantAndEmployee(db, "2");

  const record = AttendanceRecord.create({
    tenantId,
    employeeId,
    workDate: "2026-08-01",
    clockInTime: "2026-08-01T08:35:00Z",
  });

  // Late arrival exception detection
  record.detectExceptions("2026-08-01T08:00:00Z");
  record.clockOut("2026-08-01T17:00:00Z");

  await repo.save(record);

  const restored = await repo.findById(tenantId, record.id);
  assert.ok(restored);
  assert.equal(restored.status, "CLOCKED_OUT");
  assert.equal(new Date(restored.clockInTime!).toISOString(), "2026-08-01T08:35:00.000Z");
  assert.equal(new Date(restored.clockOutTime!).toISOString(), "2026-08-01T17:00:00.000Z");
  assert.ok(restored.exceptions.length >= 1);
  assert.equal(restored.exceptions[0]!.type, "LATE_ARRIVAL");
});

test("PostgresAttendanceRepository: 4. Break Interval Restoration across clock lifecycle", async () => {
  const db = await freshDatabase();
  const repo = new PostgresAttendanceRepository(db);
  const { tenantId, employeeId } = await createFixtureTenantAndEmployee(db, "3");

  const record = AttendanceRecord.create({
    tenantId,
    employeeId,
    workDate: "2026-08-01",
    clockInTime: "2026-08-01T08:00:00Z",
  });

  record.startBreak("2026-08-01T12:00:00Z");
  record.endBreak("2026-08-01T12:30:00Z");
  record.clockOut("2026-08-01T17:00:00Z");

  await repo.save(record);

  const restored = await repo.getRecord(tenantId, employeeId, "2026-08-01");
  assert.ok(restored);
  assert.equal(restored.status, "CLOCKED_OUT");
  assert.equal(restored.breaks.length, 1);
  assert.equal(new Date(restored.breaks[0]!.startTime).toISOString(), "2026-08-01T12:00:00.000Z");
  assert.equal(new Date(restored.breaks[0]!.endTime!).toISOString(), "2026-08-01T12:30:00.000Z");
  assert.equal(restored.totalBreakMinutes, 30);
  assert.equal(restored.activeDurationMinutes, 510);
});

test("PostgresAttendanceRepository: 5. Tenant Isolation Protection", async () => {
  const db = await freshDatabase();
  const repo = new PostgresAttendanceRepository(db);
  const tenantA = await createFixtureTenantAndEmployee(db, "TenantA");
  const tenantB = await createFixtureTenantAndEmployee(db, "TenantB");

  const recordA = AttendanceRecord.create({
    tenantId: tenantA.tenantId,
    employeeId: tenantA.employeeId,
    workDate: "2026-08-01",
    clockInTime: "2026-08-01T08:00:00Z",
  });
  await repo.save(recordA);

  const resultAsTenantB = await repo.findByEmployeeAndDate(tenantB.tenantId, tenantA.employeeId, "2026-08-01");
  assert.equal(resultAsTenantB, null);

  const findByIdAsTenantB = await repo.findById(tenantB.tenantId, recordA.id);
  assert.equal(findByIdAsTenantB, null);
});

test("PostgresAttendanceRepository: 6. Duplicate Idempotency Protection", async () => {
  const db = await freshDatabase();
  const repo = new PostgresAttendanceRepository(db);
  const { tenantId, employeeId } = await createFixtureTenantAndEmployee(db, "4");

  const idempotencyKey = "key-unique-777";

  const hasBefore = await repo.has(tenantId, idempotencyKey);
  assert.equal(hasBefore, false);

  const entry: IdempotencyRegistryEntry = {
    tenantId,
    idempotencyKey,
    employeeId,
    eventType: "clock_in",
    processedAt: new Date().toISOString(),
    recordId: crypto.randomUUID(),
    resultStatus: "PROCESSED_SUCCESS",
  };

  await repo.save(entry);

  const hasAfter = await repo.has(tenantId, idempotencyKey);
  assert.equal(hasAfter, true);

  const fetched = await repo.get(tenantId, idempotencyKey);
  assert.ok(fetched);
  assert.equal(fetched.idempotencyKey, idempotencyKey);
  assert.equal(fetched.resultStatus, "PROCESSED_SUCCESS");

  await repo.save(entry);
  const fetchedAgain = await repo.get(tenantId, idempotencyKey);
  assert.equal(fetchedAgain?.idempotencyKey, idempotencyKey);
});

test("PostgresAttendanceRepository: 7. Integration with AttendanceSyncEngine for offline batch sync", async () => {
  const db = await freshDatabase();
  const repo = new PostgresAttendanceRepository(db);
  const { tenantId, employeeId } = await createFixtureTenantAndEmployee(db, "Sync");

  const syncEngine = new AttendanceSyncEngine({
    recordStore: repo,
    idempotencyRegistry: repo,
  });

  const syncBatch = {
    tenantId,
    deviceId: "device-kiosk-1",
    batchId: crypto.randomUUID(),
    submittedAt: new Date().toISOString(),
    events: [
      {
        eventId: crypto.randomUUID(),
        tenantId,
        employeeId,
        eventType: "clock_in" as const,
        timestamp: "2026-08-01T08:00:00Z",
        workDate: "2026-08-01",
        idempotencyKey: "sync_clk_in_001",
        source: "kiosk" as const,
      },
    ],
  };

  const result = await syncEngine.processBatch(syncBatch);
  assert.equal(result.processedCount, 1);
  assert.equal(result.results[0]!.status, "PROCESSED_SUCCESS");

  const recordInDb = await repo.getRecord(tenantId, employeeId, "2026-08-01");
  assert.ok(recordInDb);
  assert.equal(recordInDb.status, "CLOCKED_IN");

  const duplicateResult = await syncEngine.processBatch(syncBatch);
  assert.equal(duplicateResult.duplicateCount, 1);
  assert.equal(duplicateResult.results[0]!.status, "PROCESSED_DUPLICATE");
});

test("PostgresAttendanceRepository: 8. Transaction Rollback Safety on DB failure", async () => {
  const db = await freshDatabase();
  const repo = new PostgresAttendanceRepository(db);

  const recordInvalid = AttendanceRecord.create({
    tenantId: "00000000-0000-4000-8000-000000000000",
    employeeId: "00000000-0000-4000-8000-000000000001",
    workDate: "2026-08-01",
    clockInTime: "2026-08-01T08:00:00Z",
  });

  await assert.rejects(
    async () => {
      await repo.save(recordInvalid);
    },
    (err: unknown) => err instanceof Error
  );

  assert.ok(recordInvalid.uncommittedEvents.length > 0);
});
