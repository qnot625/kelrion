import type { FastifyInstance } from "fastify";
import type { AuditLog } from "@adminops/audit";
import {
  AttendanceDomainError,
  AttendanceRecord,
  type AttendanceLocation,
  type AttendanceOperationOptions,
  type AttendanceRecordStore,
  type AttendanceSyncEngine,
  type AttendanceSyncItem,
} from "@adminops/workforce-core";
import { requirePermission } from "../plugins/require-permission.js";

interface ClockOperationBody {
  employeeId?: unknown;
  workDate?: unknown;
  timestamp?: unknown;
  idempotencyKey?: unknown;
  source?: unknown;
  location?: unknown;
  notes?: unknown;
}

interface SyncRequestBody {
  batchId?: unknown;
  submittedAt?: unknown;
  deviceId?: unknown;
  events?: unknown;
}

interface RangeQueryableRepository {
  findByTenantAndDateRange(tenantId: string, startDate: string, endDate: string): Promise<AttendanceRecord[]>;
}

function parseOperationOptions(body: ClockOperationBody): AttendanceOperationOptions {
  return {
    source: typeof body.source === "string" ? (body.source as AttendanceOperationOptions["source"]) : "web",
    idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
    location: body.location && typeof body.location === "object" ? (body.location as AttendanceLocation) : null,
    notes: typeof body.notes === "string" ? body.notes : undefined,
  };
}

function handleDomainError(error: unknown): { status: number; body: { error: string } } | undefined {
  if (error instanceof AttendanceDomainError) {
    if (error.message.includes("not found")) {
      return { status: 404, body: { error: error.message } };
    }
    if (error.message.includes("already") || error.message.includes("Conflict")) {
      return { status: 409, body: { error: error.message } };
    }
    return { status: 400, body: { error: error.message } };
  }
  return undefined;
}

export function registerAttendanceRoutes(
  app: FastifyInstance,
  attendanceRepository: AttendanceRecordStore,
  syncEngine: AttendanceSyncEngine,
  auditLog: AuditLog,
): void {
  // POST /attendance/clock-in
  app.post(
    "/attendance/clock-in",
    { preHandler: requirePermission("attendance:clock") },
    async (request, reply) => {
      const body = (request.body as ClockOperationBody) ?? {};

      if (typeof body.employeeId !== "string" || body.employeeId.trim() === "") {
        return reply.code(400).send({ error: "employeeId is required and must be a non-empty string" });
      }

      const tenantId = request.tenant!.tenantId;
      const workDate = typeof body.workDate === "string" ? body.workDate : new Date().toISOString().slice(0, 10);
      const timestamp = typeof body.timestamp === "string" ? body.timestamp : new Date().toISOString();

      try {
        let record = await attendanceRepository.getRecord(tenantId, body.employeeId, workDate);
        if (!record) {
          record = AttendanceRecord.create({
            tenantId,
            employeeId: body.employeeId,
            workDate,
          });
        }

        record.clockIn(timestamp, parseOperationOptions(body));

        await attendanceRepository.saveRecord(record);

        await auditLog.record({
          tenantId,
          actorUserId: request.auth?.userId ?? null,
          action: "attendance.clock_in",
          targetType: "attendance_record",
          targetId: record.id,
          metadata: { employeeId: body.employeeId, workDate, timestamp },
        });

        return reply.code(201).send({
          message: "Clocked in successfully",
          record: record.toState(),
          summary: record.toSummary(),
        });
      } catch (err) {
        const handled = handleDomainError(err);
        if (handled) {
          return reply.code(handled.status).send(handled.body);
        }
        throw err;
      }
    },
  );

  // POST /attendance/clock-out
  app.post(
    "/attendance/clock-out",
    { preHandler: requirePermission("attendance:clock") },
    async (request, reply) => {
      const body = (request.body as ClockOperationBody) ?? {};

      if (typeof body.employeeId !== "string" || body.employeeId.trim() === "") {
        return reply.code(400).send({ error: "employeeId is required and must be a non-empty string" });
      }

      const tenantId = request.tenant!.tenantId;
      const workDate = typeof body.workDate === "string" ? body.workDate : new Date().toISOString().slice(0, 10);
      const timestamp = typeof body.timestamp === "string" ? body.timestamp : new Date().toISOString();

      try {
        const record = await attendanceRepository.getRecord(tenantId, body.employeeId, workDate);
        if (!record) {
          return reply.code(404).send({ error: "Attendance record not found for employee on specified date" });
        }

        record.clockOut(timestamp, parseOperationOptions(body));

        await attendanceRepository.saveRecord(record);

        await auditLog.record({
          tenantId,
          actorUserId: request.auth?.userId ?? null,
          action: "attendance.clock_out",
          targetType: "attendance_record",
          targetId: record.id,
          metadata: { employeeId: body.employeeId, workDate, timestamp },
        });

        return reply.code(200).send({
          message: "Clocked out successfully",
          record: record.toState(),
          summary: record.toSummary(),
        });
      } catch (err) {
        const handled = handleDomainError(err);
        if (handled) {
          return reply.code(handled.status).send(handled.body);
        }
        throw err;
      }
    },
  );

  // POST /attendance/break-start
  app.post(
    "/attendance/break-start",
    { preHandler: requirePermission("attendance:clock") },
    async (request, reply) => {
      const body = (request.body as ClockOperationBody) ?? {};

      if (typeof body.employeeId !== "string" || body.employeeId.trim() === "") {
        return reply.code(400).send({ error: "employeeId is required and must be a non-empty string" });
      }

      const tenantId = request.tenant!.tenantId;
      const workDate = typeof body.workDate === "string" ? body.workDate : new Date().toISOString().slice(0, 10);
      const timestamp = typeof body.timestamp === "string" ? body.timestamp : new Date().toISOString();

      try {
        const record = await attendanceRepository.getRecord(tenantId, body.employeeId, workDate);
        if (!record) {
          return reply.code(404).send({ error: "Attendance record not found for employee on specified date" });
        }

        record.startBreak(timestamp, parseOperationOptions(body));

        await attendanceRepository.saveRecord(record);

        await auditLog.record({
          tenantId,
          actorUserId: request.auth?.userId ?? null,
          action: "attendance.break_start",
          targetType: "attendance_record",
          targetId: record.id,
          metadata: { employeeId: body.employeeId, workDate, timestamp },
        });

        return reply.code(200).send({
          message: "Break started successfully",
          record: record.toState(),
          summary: record.toSummary(),
        });
      } catch (err) {
        const handled = handleDomainError(err);
        if (handled) {
          return reply.code(handled.status).send(handled.body);
        }
        throw err;
      }
    },
  );

  // POST /attendance/break-end
  app.post(
    "/attendance/break-end",
    { preHandler: requirePermission("attendance:clock") },
    async (request, reply) => {
      const body = (request.body as ClockOperationBody) ?? {};

      if (typeof body.employeeId !== "string" || body.employeeId.trim() === "") {
        return reply.code(400).send({ error: "employeeId is required and must be a non-empty string" });
      }

      const tenantId = request.tenant!.tenantId;
      const workDate = typeof body.workDate === "string" ? body.workDate : new Date().toISOString().slice(0, 10);
      const timestamp = typeof body.timestamp === "string" ? body.timestamp : new Date().toISOString();

      try {
        const record = await attendanceRepository.getRecord(tenantId, body.employeeId, workDate);
        if (!record) {
          return reply.code(404).send({ error: "Attendance record not found for employee on specified date" });
        }

        record.endBreak(timestamp, parseOperationOptions(body));

        await attendanceRepository.saveRecord(record);

        await auditLog.record({
          tenantId,
          actorUserId: request.auth?.userId ?? null,
          action: "attendance.break_end",
          targetType: "attendance_record",
          targetId: record.id,
          metadata: { employeeId: body.employeeId, workDate, timestamp },
        });

        return reply.code(200).send({
          message: "Break ended successfully",
          record: record.toState(),
          summary: record.toSummary(),
        });
      } catch (err) {
        const handled = handleDomainError(err);
        if (handled) {
          return reply.code(handled.status).send(handled.body);
        }
        throw err;
      }
    },
  );

  // POST /attendance/sync
  app.post(
    "/attendance/sync",
    { preHandler: requirePermission("attendance:sync") },
    async (request, reply) => {
      const tenantId = request.tenant!.tenantId;
      const body = (request.body as SyncRequestBody) ?? {};

      if (!body || !Array.isArray(body.events)) {
        return reply.code(400).send({ error: "Invalid sync request body: events array is required" });
      }

      const eventsList = body.events as AttendanceSyncItem[];

      // Validate tenant mismatch
      for (const item of eventsList) {
        if (item.tenantId && item.tenantId !== tenantId) {
          return reply.code(403).send({
            error: `Tenant mismatch: event tenant ${item.tenantId} does not match request tenant ${tenantId}`,
          });
        }
      }

      const batchId = typeof body.batchId === "string" ? body.batchId : crypto.randomUUID();
      const submittedAt = typeof body.submittedAt === "string" ? body.submittedAt : new Date().toISOString();
      const deviceId = typeof body.deviceId === "string" ? body.deviceId : undefined;

      const sanitizedEvents = eventsList.map((evt) => ({
        ...evt,
        tenantId,
      }));

      try {
        const batchResult = await syncEngine.processBatch({
          batchId,
          tenantId,
          submittedAt,
          deviceId,
          events: sanitizedEvents,
        });

        await auditLog.record({
          tenantId,
          actorUserId: request.auth?.userId ?? null,
          action: "attendance.sync_batch",
          targetType: "attendance_sync",
          targetId: batchId,
          metadata: {
            totalReceived: batchResult.totalReceived,
            processedCount: batchResult.processedCount,
            duplicateCount: batchResult.duplicateCount,
            rejectedCount: batchResult.rejectedCount,
          },
        });

        const statusCode = batchResult.rejectedCount > 0 ? (batchResult.processedCount > 0 ? 207 : 400) : 200;
        return reply.code(statusCode).send(batchResult);
      } catch (err) {
        const handled = handleDomainError(err);
        if (handled) {
          return reply.code(handled.status).send(handled.body);
        }
        throw err;
      }
    },
  );

  // GET /attendance/employee/:employeeId
  app.get(
    "/attendance/employee/:employeeId",
    { preHandler: requirePermission("attendance:read") },
    async (request, reply) => {
      const tenantId = request.tenant!.tenantId;
      const { employeeId } = request.params as { employeeId: string };
      const query = (request.query as { workDate?: string }) ?? {};
      const targetDate = query.workDate ?? new Date().toISOString().slice(0, 10);

      try {
        const record = await attendanceRepository.getRecord(tenantId, employeeId, targetDate);
        if (!record) {
          return reply.code(404).send({ error: "Attendance record not found for employee on specified date" });
        }

        return reply.code(200).send({
          record: record.toState(),
          summary: record.toSummary(),
        });
      } catch (err) {
        const handled = handleDomainError(err);
        if (handled) {
          return reply.code(handled.status).send(handled.body);
        }
        throw err;
      }
    },
  );

  // GET /attendance/summary
  app.get(
    "/attendance/summary",
    { preHandler: requirePermission("attendance:read") },
    async (request, reply) => {
      const tenantId = request.tenant!.tenantId;
      const query = (request.query as { startDate?: string; endDate?: string; employeeId?: string }) ?? {};

      try {
        if (query.employeeId) {
          const workDate = query.startDate ?? new Date().toISOString().slice(0, 10);
          const record = await attendanceRepository.getRecord(tenantId, query.employeeId, workDate);
          if (!record) {
            return reply.code(200).send({ summaries: [], count: 0 });
          }
          return reply.code(200).send({ summaries: [record.toSummary()], count: 1 });
        }

        const repoWithRange = attendanceRepository as unknown as RangeQueryableRepository;
        if (typeof repoWithRange.findByTenantAndDateRange === "function") {
          const startDate = query.startDate ?? new Date().toISOString().slice(0, 10);
          const endDate = query.endDate ?? startDate;
          const records = await repoWithRange.findByTenantAndDateRange(tenantId, startDate, endDate);
          const summaries = records.map((r: AttendanceRecord) => r.toSummary());
          return reply.code(200).send({ summaries, count: summaries.length });
        }

        return reply.code(200).send({ summaries: [], count: 0 });
      } catch (err) {
        const handled = handleDomainError(err);
        if (handled) {
          return reply.code(handled.status).send(handled.body);
        }
        throw err;
      }
    },
  );
}
