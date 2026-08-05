import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  enqueueAttendanceItem,
  generateIdempotencyKey,
  getQueueStorageKey,
  loadQueueFromStorage,
  QueuedAttendanceItem,
  removeItemsFromQueue,
  saveQueueToStorage,
} from "../src/lib/attendance-queue.js";
import { formatDurationSeconds } from "../src/components/attendance/AttendanceTimer.js";
import { KlerionApi } from "../src/lib/api.js";
import type { KlerionSession } from "../src/lib/session.js";

// Mock localStorage setup for node environment
class MockLocalStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) || null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

const mockStorage = new MockLocalStorage();
(globalThis as unknown as { window: { localStorage: MockLocalStorage } }).window = {
  localStorage: mockStorage,
};

const MOCK_SESSION: KlerionSession = {
  mode: "demo",
  tenantSlug: "acme-corp",
  tenantName: "Acme Corporation",
  email: "employee@acme.com",
  userId: "EMP_101",
  roles: ["staff"],
  token: "mock-jwt-token",
};

describe("Attendance Widget & Local Queue Engine Tests", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it("generateIdempotencyKey creates deterministic keys", () => {
    const timestamp = "2026-08-03T09:00:00.000Z";
    const key1 = generateIdempotencyKey("EMP_101", "clock_in", timestamp);
    const key2 = generateIdempotencyKey("EMP_101", "clock_in", timestamp);
    assert.equal(key1, key2);
    assert.ok(key1.startsWith("clk_clock_in_EMP_101_"));
  });

  it("formatDurationSeconds formats seconds into HH:MM:SS format cleanly", () => {
    assert.equal(formatDurationSeconds(0), "00:00:00");
    assert.equal(formatDurationSeconds(65), "00:01:05");
    assert.equal(formatDurationSeconds(3665), "01:01:05");
    assert.equal(formatDurationSeconds(-10), "00:00:00");
  });

  it("enqueueAttendanceItem adds item and enforces chronological FIFO sorting", () => {
    const t1 = "2026-08-03T09:00:00.000Z";
    const t2 = "2026-08-03T12:00:00.000Z";
    const t3 = "2026-08-03T10:00:00.000Z"; // Out-of-order timestamp inserted second

    enqueueAttendanceItem("acme-corp", "EMP_101", {
      eventId: "evt_1",
      tenantId: "acme-corp",
      employeeId: "EMP_101",
      eventType: "clock_in",
      timestamp: t1,
      workDate: "2026-08-03",
      idempotencyKey: generateIdempotencyKey("EMP_101", "clock_in", t1),
      source: "web",
    });

    enqueueAttendanceItem("acme-corp", "EMP_101", {
      eventId: "evt_2",
      tenantId: "acme-corp",
      employeeId: "EMP_101",
      eventType: "clock_out",
      timestamp: t2,
      workDate: "2026-08-03",
      idempotencyKey: generateIdempotencyKey("EMP_101", "clock_out", t2),
      source: "web",
    });

    enqueueAttendanceItem("acme-corp", "EMP_101", {
      eventId: "evt_3",
      tenantId: "acme-corp",
      employeeId: "EMP_101",
      eventType: "break_start",
      timestamp: t3,
      workDate: "2026-08-03",
      idempotencyKey: generateIdempotencyKey("EMP_101", "break_start", t3),
      source: "web",
    });

    const queue = loadQueueFromStorage("acme-corp", "EMP_101");
    assert.equal(queue.length, 3);
    // Chronological order should be t1 (clock_in) -> t3 (break_start) -> t2 (clock_out)
    assert.equal(queue[0].eventType, "clock_in");
    assert.equal(queue[1].eventType, "break_start");
    assert.equal(queue[2].eventType, "clock_out");
  });

  it("enqueueAttendanceItem ignores duplicate idempotency keys", () => {
    const t1 = "2026-08-03T09:00:00.000Z";
    const idempotencyKey = generateIdempotencyKey("EMP_101", "clock_in", t1);

    enqueueAttendanceItem("acme-corp", "EMP_101", {
      eventId: "evt_1",
      tenantId: "acme-corp",
      employeeId: "EMP_101",
      eventType: "clock_in",
      timestamp: t1,
      workDate: "2026-08-03",
      idempotencyKey,
      source: "web",
    });

    enqueueAttendanceItem("acme-corp", "EMP_101", {
      eventId: "evt_1_dup",
      tenantId: "acme-corp",
      employeeId: "EMP_101",
      eventType: "clock_in",
      timestamp: t1,
      workDate: "2026-08-03",
      idempotencyKey,
      source: "web",
    });

    const queue = loadQueueFromStorage("acme-corp", "EMP_101");
    assert.equal(queue.length, 1);
  });

  it("removeItemsFromQueue purges processed items cleanly", () => {
    const t1 = "2026-08-03T09:00:00.000Z";
    const updated = enqueueAttendanceItem("acme-corp", "EMP_101", {
      eventId: "evt_1",
      tenantId: "acme-corp",
      employeeId: "EMP_101",
      eventType: "clock_in",
      timestamp: t1,
      workDate: "2026-08-03",
      idempotencyKey: generateIdempotencyKey("EMP_101", "clock_in", t1),
      source: "web",
    });

    const itemId = updated[0].id;
    const remaining = removeItemsFromQueue("acme-corp", "EMP_101", [itemId]);
    assert.equal(remaining.length, 0);
  });

  it("KlerionApi posts clockIn request with auth headers", async () => {
    const api = new KlerionApi();
    let capturedUrl = "";
    let capturedOptions: RequestInit | undefined;

    (globalThis as unknown as { fetch: typeof fetch }).fetch = async (url, options) => {
      capturedUrl = String(url);
      capturedOptions = options;
      return new Response(
        JSON.stringify({
          message: "Clocked in successfully",
          record: {
            id: "rec_1",
            tenantId: "acme-corp",
            employeeId: "EMP_101",
            workDate: "2026-08-03",
            status: "clocked_in",
            clockInTime: "2026-08-03T09:00:00.000Z",
            totalWorkMinutes: 0,
            totalBreakMinutes: 0,
            events: [],
          },
          summary: {
            employeeId: "EMP_101",
            workDate: "2026-08-03",
            status: "clocked_in",
            clockInTime: "2026-08-03T09:00:00.000Z",
            totalWorkMinutes: 0,
            totalBreakMinutes: 0,
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    };

    const res = await api.clockIn(MOCK_SESSION, {
      employeeId: "EMP_101",
      workDate: "2026-08-03",
      timestamp: "2026-08-03T09:00:00.000Z",
      idempotencyKey: "clk_clock_in_EMP_101_1",
      source: "web",
    });

    assert.equal(capturedUrl, "/api/attendance/clock-in");
    assert.equal((capturedOptions?.headers as Record<string, string>)["X-Tenant-Slug"], "acme-corp");
    assert.equal(res.summary.status, "clocked_in");
  });
});
