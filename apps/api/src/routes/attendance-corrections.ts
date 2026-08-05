import type { FastifyInstance } from "fastify";
import type { AuditLog } from "@adminops/audit";
import {
  AttendanceDomainError,
  AttendanceRecord,
  type AttendanceCorrectionRepository,
  type AttendanceRecordStore,
  type EmployeeRepository,
} from "@adminops/workforce-core";
import { requirePermission } from "../plugins/require-permission.js";

interface CreateCorrectionBody {
  employeeId?: unknown;
  targetEventId?: unknown;
  requestedEventType?: unknown;
  requestedTimestamp?: unknown;
  reason?: unknown;
}

interface ReviewCorrectionBody {
  reviewNotes?: unknown;
}

interface ListCorrectionsQuery {
  employeeId?: unknown;
  status?: unknown;
  limit?: unknown;
  offset?: unknown;
}

const VALID_EVENT_TYPES = ["clock_in", "clock_out", "break_start", "break_end"];

export function registerAttendanceCorrectionRoutes(
  app: FastifyInstance,
  attendanceCorrectionRepository: AttendanceCorrectionRepository,
  attendanceRepository: AttendanceRecordStore,
  employeeRepository: EmployeeRepository,
  auditLog: AuditLog,
): void {
  // POST /attendance/corrections
  app.post(
    "/attendance/corrections",
    { preHandler: requirePermission("attendance:clock") },
    async (request, reply) => {
      const body = (request.body as CreateCorrectionBody) ?? {};

      if (typeof body.employeeId !== "string" || body.employeeId.trim() === "") {
        return reply.code(400).send({ error: "employeeId is required and must be a non-empty string" });
      }

      if (
        typeof body.requestedEventType !== "string" ||
        !VALID_EVENT_TYPES.includes(body.requestedEventType)
      ) {
        return reply.code(400).send({
          error: `requestedEventType must be one of: ${VALID_EVENT_TYPES.join(", ")}`,
        });
      }

      if (typeof body.requestedTimestamp !== "string" || body.requestedTimestamp.trim() === "") {
        return reply.code(400).send({ error: "requestedTimestamp is required and must be a valid date string" });
      }

      if (typeof body.reason !== "string" || body.reason.trim() === "") {
        return reply.code(400).send({ error: "reason is required and must be a non-empty string" });
      }

      const tenantId = request.tenant!.tenantId;

      // Verify employee existence
      const employeeExists = await employeeRepository.exists(tenantId, body.employeeId);
      if (!employeeExists) {
        return reply.code(404).send({ error: `Employee [${body.employeeId}] not found` });
      }

      const correction = await attendanceCorrectionRepository.create({
        tenantId,
        employeeId: body.employeeId,
        targetEventId: typeof body.targetEventId === "string" ? body.targetEventId : undefined,
        requestedEventType: body.requestedEventType as
          | "clock_in"
          | "clock_out"
          | "break_start"
          | "break_end",
        requestedTimestamp: body.requestedTimestamp,
        reason: body.reason,
      });

      await auditLog.record({
        tenantId,
        actorUserId: request.auth?.userId ?? null,
        action: "attendance.correction_submitted",
        targetType: "attendance_correction",
        targetId: correction.id,
        metadata: {
          employeeId: correction.employeeId,
          requestedEventType: correction.requestedEventType,
          requestedTimestamp: correction.requestedTimestamp,
          reason: correction.reason,
        },
      });

      return reply.code(201).send({
        message: "Attendance correction request submitted successfully",
        correction,
      });
    },
  );

  // GET /attendance/corrections
  app.get(
    "/attendance/corrections",
    { preHandler: requirePermission("attendance:read") },
    async (request, reply) => {
      const query = (request.query as ListCorrectionsQuery) ?? {};
      const tenantId = request.tenant!.tenantId;

      const employeeId = typeof query.employeeId === "string" ? query.employeeId : undefined;
      const status =
        typeof query.status === "string" && ["pending", "approved", "rejected"].includes(query.status)
          ? (query.status as "pending" | "approved" | "rejected")
          : undefined;

      const limit = typeof query.limit === "string" ? parseInt(query.limit, 10) : 50;
      const offset = typeof query.offset === "string" ? parseInt(query.offset, 10) : 0;

      const filterOptions = {
        employeeId,
        status,
        limit: isNaN(limit) ? 50 : limit,
        offset: isNaN(offset) ? 0 : offset,
      };

      const corrections = await attendanceCorrectionRepository.list(tenantId, filterOptions);
      const total = await attendanceCorrectionRepository.count(tenantId, { employeeId, status });

      return reply.code(200).send({
        corrections,
        total,
        limit: filterOptions.limit,
        offset: filterOptions.offset,
      });
    },
  );

  // GET /attendance/corrections/:id
  app.get(
    "/attendance/corrections/:id",
    { preHandler: requirePermission("attendance:read") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const tenantId = request.tenant!.tenantId;

      const correction = await attendanceCorrectionRepository.findById(tenantId, id);
      if (!correction) {
        return reply.code(404).send({ error: `Attendance correction [${id}] not found` });
      }

      return reply.code(200).send({ correction });
    },
  );

  // POST /attendance/corrections/:id/approve
  app.post(
    "/attendance/corrections/:id/approve",
    { preHandler: requirePermission("attendance:manage") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = (request.body as ReviewCorrectionBody) ?? {};
      const tenantId = request.tenant!.tenantId;
      const reviewerId = request.auth?.userId ?? "system";
      const reviewNotes = typeof body.reviewNotes === "string" ? body.reviewNotes : undefined;

      const correction = await attendanceCorrectionRepository.findById(tenantId, id);
      if (!correction) {
        return reply.code(404).send({ error: `Attendance correction [${id}] not found` });
      }

      if (correction.status !== "pending") {
        return reply
          .code(409)
          .send({ error: `Attendance correction [${id}] is already ${correction.status}` });
      }

      const workDate = correction.requestedTimestamp.slice(0, 10);

      try {
        let record = await attendanceRepository.getRecord(tenantId, correction.employeeId, workDate);
        if (!record) {
          record = AttendanceRecord.create({
            tenantId,
            employeeId: correction.employeeId,
            workDate,
          });
        }

        const operationOptions = {
          source: "manual" as const,
          idempotencyKey: `corr_appr_${correction.id}`,
          notes: `Correction #${correction.id}: ${correction.reason}`,
        };

        switch (correction.requestedEventType) {
          case "clock_in":
            record.clockIn(correction.requestedTimestamp, operationOptions);
            break;
          case "clock_out":
            record.clockOut(correction.requestedTimestamp, operationOptions);
            break;
          case "break_start":
            record.startBreak(correction.requestedTimestamp, operationOptions);
            break;
          case "break_end":
            record.endBreak(correction.requestedTimestamp, operationOptions);
            break;
        }

        await attendanceRepository.saveRecord(record);

        const updatedCorrection = await attendanceCorrectionRepository.updateStatus(
          tenantId,
          id,
          "approved",
          reviewerId,
          reviewNotes,
        );

        await auditLog.record({
          tenantId,
          actorUserId: request.auth?.userId ?? null,
          action: "attendance.correction_approved",
          targetType: "attendance_correction",
          targetId: id,
          metadata: {
            employeeId: correction.employeeId,
            reviewedByUserId: reviewerId,
            reviewNotes,
            workDate,
          },
        });

        return reply.code(200).send({
          message: "Attendance correction approved successfully",
          correction: updatedCorrection,
          attendanceRecord: record.toState(),
        });
      } catch (err: unknown) {
        if (err instanceof AttendanceDomainError) {
          return reply.code(400).send({ error: err.message });
        }
        if (err instanceof Error && err.message.includes("already")) {
          return reply.code(409).send({ error: err.message });
        }
        throw err;
      }
    },
  );

  // POST /attendance/corrections/:id/reject
  app.post(
    "/attendance/corrections/:id/reject",
    { preHandler: requirePermission("attendance:manage") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = (request.body as ReviewCorrectionBody) ?? {};
      const tenantId = request.tenant!.tenantId;
      const reviewerId = request.auth?.userId ?? "system";
      const reviewNotes = typeof body.reviewNotes === "string" ? body.reviewNotes : undefined;

      const correction = await attendanceCorrectionRepository.findById(tenantId, id);
      if (!correction) {
        return reply.code(404).send({ error: `Attendance correction [${id}] not found` });
      }

      if (correction.status !== "pending") {
        return reply
          .code(409)
          .send({ error: `Attendance correction [${id}] is already ${correction.status}` });
      }

      const updatedCorrection = await attendanceCorrectionRepository.updateStatus(
        tenantId,
        id,
        "rejected",
        reviewerId,
        reviewNotes,
      );

      await auditLog.record({
        tenantId,
        actorUserId: request.auth?.userId ?? null,
        action: "attendance.correction_rejected",
        targetType: "attendance_correction",
        targetId: id,
        metadata: {
          employeeId: correction.employeeId,
          reviewedByUserId: reviewerId,
          reviewNotes,
        },
      });

      return reply.code(200).send({
        message: "Attendance correction rejected successfully",
        correction: updatedCorrection,
      });
    },
  );
}
