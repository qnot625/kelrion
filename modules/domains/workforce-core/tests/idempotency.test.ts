import assert from "node:assert";
import { test } from "node:test";
import {
  AttendanceSyncEngine,
  InMemoryAttendanceRecordStore,
  InMemoryIdempotencyRegistry,
} from "../src/idempotency.js";
import type { AttendanceSyncBatchRequest } from "../src/contracts.js";

const TENANT_1 = "11111111-1111-4111-a111-111111111111";
const TENANT_2 = "22222222-2222-4222-a222-222222222222";
const EMP_1 = "e1111111-1111-4111-a111-111111111111";
const EMP_2 = "e2222222-2222-4222-a222-222222222222";

test("AttendanceSyncEngine: processes valid batch and deduplicates duplicate submissions", async () => {
  const registry = new InMemoryIdempotencyRegistry();
  const recordStore = new InMemoryAttendanceRecordStore();
  const engine = new AttendanceSyncEngine({ idempotencyRegistry: registry, recordStore });

  const batch: AttendanceSyncBatchRequest = {
    batchId: "b1111111-1111-4111-a111-111111111111",
    tenantId: TENANT_1,
    submittedAt: "2026-08-01T12:00:00Z",
    events: [
      {
        eventId: "v1111111-1111-4111-a111-111111111111",
        tenantId: TENANT_1,
        employeeId: EMP_1,
        workDate: "2026-08-01",
        eventType: "clock_in",
        timestamp: "2026-08-01T09:00:00Z",
        idempotencyKey: "key_clock_in_emp1_001",
        source: "mobile",
      },
      {
        eventId: "v2222222-2222-4222-a222-222222222222",
        tenantId: TENANT_1,
        employeeId: EMP_1,
        workDate: "2026-08-01",
        eventType: "clock_out",
        timestamp: "2026-08-01T17:00:00Z",
        idempotencyKey: "key_clock_out_emp1_001",
        source: "mobile",
      },
    ],
  };

  const res1 = await engine.processBatch(batch, { now: new Date("2026-08-01T18:05:00Z") });
  assert.strictEqual(res1.totalReceived, 2);
  assert.strictEqual(res1.processedCount, 2);
  assert.strictEqual(res1.duplicateCount, 0);
  assert.strictEqual(res1.rejectedCount, 0);
  assert.strictEqual(res1.results[0].status, "PROCESSED_SUCCESS");
  assert.strictEqual(res1.results[1].status, "PROCESSED_SUCCESS");

  // Re-submit identical batch
  const res2 = await engine.processBatch(batch, { now: new Date("2026-08-01T18:06:00Z") });
  assert.strictEqual(res2.totalReceived, 2);
  assert.strictEqual(res2.processedCount, 0);
  assert.strictEqual(res2.duplicateCount, 2);
  assert.strictEqual(res2.rejectedCount, 0);
  assert.strictEqual(res2.results[0].status, "PROCESSED_DUPLICATE");
  assert.strictEqual(res2.results[1].status, "PROCESSED_DUPLICATE");
});

test("AttendanceSyncEngine: rejects conflicting payload for existing idempotency key", async () => {
  const engine = new AttendanceSyncEngine();

  const batch1: AttendanceSyncBatchRequest = {
    batchId: "b1111111-1111-4111-a111-111111111111",
    tenantId: TENANT_1,
    submittedAt: "2026-08-01T12:00:00Z",
    events: [
      {
        tenantId: TENANT_1,
        employeeId: EMP_1,
        workDate: "2026-08-01",
        eventType: "clock_in",
        timestamp: "2026-08-01T09:00:00Z",
        idempotencyKey: "shared_key_001",
        source: "mobile",
      },
    ],
  };

  await engine.processBatch(batch1, { now: new Date("2026-08-01T12:00:00Z") });

  // Conflicting batch with same idempotency key but different eventType
  const batch2: AttendanceSyncBatchRequest = {
    batchId: "b2222222-2222-4222-a222-222222222222",
    tenantId: TENANT_1,
    submittedAt: "2026-08-01T12:01:00Z",
    events: [
      {
        tenantId: TENANT_1,
        employeeId: EMP_1,
        workDate: "2026-08-01",
        eventType: "clock_out", // Conflicting event type
        timestamp: "2026-08-01T09:00:00Z",
        idempotencyKey: "shared_key_001",
        source: "mobile",
      },
    ],
  };

  const res2 = await engine.processBatch(batch2, { now: new Date("2026-08-01T12:01:00Z") });
  assert.strictEqual(res2.rejectedCount, 1);
  assert.strictEqual(res2.results[0].status, "REJECTED_PAYLOAD_MISMATCH");
});

test("AttendanceSyncEngine: sorts out-of-order events chronologically before replay", async () => {
  const engine = new AttendanceSyncEngine();

  // Out-of-order events in payload (clock_out before clock_in, break_start before clock_in)
  const batch: AttendanceSyncBatchRequest = {
    batchId: "b1111111-1111-4111-a111-111111111111",
    tenantId: TENANT_1,
    submittedAt: "2026-08-01T18:00:00Z",
    events: [
      {
        tenantId: TENANT_1,
        employeeId: EMP_1,
        workDate: "2026-08-01",
        eventType: "clock_out",
        timestamp: "2026-08-01T17:00:00Z",
        idempotencyKey: "key_out_ooo",
        source: "mobile",
      },
      {
        tenantId: TENANT_1,
        employeeId: EMP_1,
        workDate: "2026-08-01",
        eventType: "clock_in",
        timestamp: "2026-08-01T09:00:00Z",
        idempotencyKey: "key_in_ooo",
        source: "mobile",
      },
      {
        tenantId: TENANT_1,
        employeeId: EMP_1,
        workDate: "2026-08-01",
        eventType: "break_start",
        timestamp: "2026-08-01T12:00:00Z",
        idempotencyKey: "key_bstart_ooo",
        source: "mobile",
      },
      {
        tenantId: TENANT_1,
        employeeId: EMP_1,
        workDate: "2026-08-01",
        eventType: "break_end",
        timestamp: "2026-08-01T12:30:00Z",
        idempotencyKey: "key_bend_ooo",
        source: "mobile",
      },
    ],
  };

  const res = await engine.processBatch(batch, { now: new Date("2026-08-01T18:05:00Z") });
  assert.strictEqual(res.processedCount, 4);
  assert.strictEqual(res.rejectedCount, 0);

  // Check all four succeeded
  for (const r of res.results) {
    assert.strictEqual(r.status, "PROCESSED_SUCCESS");
  }
});

test("AttendanceSyncEngine: rejects timestamps exceeding future clock drift threshold", async () => {
  const engine = new AttendanceSyncEngine({ clockDriftThresholdMs: 15 * 60 * 1000 });

  const serverTime = new Date("2026-08-01T12:00:00Z");

  const batch: AttendanceSyncBatchRequest = {
    batchId: "b1111111-1111-4111-a111-111111111111",
    tenantId: TENANT_1,
    submittedAt: "2026-08-01T12:00:00Z",
    events: [
      {
        tenantId: TENANT_1,
        employeeId: EMP_1,
        workDate: "2026-08-01",
        eventType: "clock_in",
        timestamp: "2026-08-01T12:20:00Z", // +20 mins in future (>15m limit)
        idempotencyKey: "key_future_drift",
        source: "mobile",
      },
    ],
  };

  const res = await engine.processBatch(batch, { now: serverTime });
  assert.strictEqual(res.rejectedCount, 1);
  assert.strictEqual(res.results[0].status, "REJECTED_FUTURE_TIMESTAMP");
});

test("AttendanceSyncEngine: enforces multi-tenant boundary isolation", async () => {
  const engine = new AttendanceSyncEngine();

  const batch: AttendanceSyncBatchRequest = {
    batchId: "b1111111-1111-4111-a111-111111111111",
    tenantId: TENANT_1,
    submittedAt: "2026-08-01T12:00:00Z",
    events: [
      {
        tenantId: TENANT_2, // Mismatched tenant
        employeeId: EMP_1,
        workDate: "2026-08-01",
        eventType: "clock_in",
        timestamp: "2026-08-01T09:00:00Z",
        idempotencyKey: "key_cross_tenant",
        source: "mobile",
      },
    ],
  };

  const res = await engine.processBatch(batch, { now: new Date("2026-08-01T12:05:00Z") });
  assert.strictEqual(res.rejectedCount, 1);
  assert.strictEqual(res.results[0].status, "REJECTED_TENANT_MISMATCH");
});

test("AttendanceSyncEngine: handles invalid state transitions during replay", async () => {
  const engine = new AttendanceSyncEngine();

  // Try to start break without clocking in first
  const batch: AttendanceSyncBatchRequest = {
    batchId: "b1111111-1111-4111-a111-111111111111",
    tenantId: TENANT_1,
    submittedAt: "2026-08-01T12:00:00Z",
    events: [
      {
        tenantId: TENANT_1,
        employeeId: EMP_2,
        workDate: "2026-08-01",
        eventType: "break_start",
        timestamp: "2026-08-01T10:00:00Z",
        idempotencyKey: "key_break_noclockin",
        source: "mobile",
      },
    ],
  };

  const res = await engine.processBatch(batch, { now: new Date("2026-08-01T12:05:00Z") });
  assert.strictEqual(res.rejectedCount, 1);
  assert.strictEqual(res.results[0].status, "REJECTED_INVALID_STATE");
  assert.ok(res.results[0].message?.includes("clocked in"));
});
