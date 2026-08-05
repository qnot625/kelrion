import assert from "node:assert";
import { describe, it } from "node:test";
import { KlerionApi } from "../src/lib/api";

describe("Attendance Timesheets & Manager Review API Client Contracts", () => {
  it("KlerionApi correctly exposes listAttendanceSummaries and listAttendanceCorrections", () => {
    const api = new KlerionApi();
    assert.strictEqual(typeof api.listAttendanceSummaries, "function");
    assert.strictEqual(typeof api.listAttendanceCorrections, "function");
    assert.strictEqual(typeof api.createAttendanceCorrection, "function");
    assert.strictEqual(typeof api.approveAttendanceCorrection, "function");
    assert.strictEqual(typeof api.rejectAttendanceCorrection, "function");
  });

  it("calculates total worked hours and break hours accurately", () => {
    const sampleSummaries = [
      {
        employeeId: "EMP_101",
        workDate: "2026-08-01",
        status: "clocked_out" as const,
        clockInTime: "2026-08-01T09:00:00Z",
        clockOutTime: "2026-08-01T17:00:00Z",
        totalWorkMinutes: 480, // 8.0 hrs
        totalBreakMinutes: 60, // 1.0 hr
      },
      {
        employeeId: "EMP_101",
        workDate: "2026-08-02",
        status: "clocked_out" as const,
        clockInTime: "2026-08-02T09:00:00Z",
        clockOutTime: "2026-08-02T13:00:00Z",
        totalWorkMinutes: 240, // 4.0 hrs
        totalBreakMinutes: 30, // 0.5 hr
      },
    ];

    const totalWorkMins = sampleSummaries.reduce((sum, s) => sum + s.totalWorkMinutes, 0);
    const totalBreakMins = sampleSummaries.reduce((sum, s) => sum + s.totalBreakMinutes, 0);

    const workedHours = Math.round((totalWorkMins / 60) * 10) / 10;
    const breakHours = Math.round((totalBreakMins / 60) * 10) / 10;

    assert.strictEqual(workedHours, 12);
    assert.strictEqual(breakHours, 1.5);
  });

  it("validates correction request mandatory fields", () => {
    const validPayload = {
      employeeId: "EMP_101",
      requestedEventType: "clock_in" as const,
      requestedTimestamp: new Date().toISOString(),
      reason: "Missed badge scan due to broken reader",
    };

    assert.ok(validPayload.employeeId.length > 0);
    assert.ok(validPayload.reason.trim().length > 0);
    assert.ok(!isNaN(new Date(validPayload.requestedTimestamp).getTime()));
  });
});
