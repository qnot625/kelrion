import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  AttendanceCorrectionNotFoundError,
  AttendanceIdempotencyConflictError,
  AttendanceStateError,
  EmployeeNotFoundError,
  WorkforceValidationError,
  type AttendanceAction,
  type AttendanceService,
  type AttendanceSource,
} from "@adminops/workforce-core";
import { requirePermission } from "../plugins/require-permission.js";

interface ClockBody {
  employeeId?: unknown;
  action?: unknown;
  timestamp?: unknown;
  idempotencyKey?: unknown;
  source?: unknown;
  location?: unknown;
  notes?: unknown;
}

interface SyncBody { events?: unknown; }
interface RecordsQuery { employeeId?: unknown; branchId?: unknown; startDate?: unknown; endDate?: unknown; limit?: unknown; offset?: unknown; }
interface CorrectionBody { employeeId?: unknown; requestedAction?: unknown; requestedAt?: unknown; reason?: unknown; }
interface CorrectionQuery { employeeId?: unknown; status?: unknown; limit?: unknown; offset?: unknown; }
interface ReviewBody { reviewNotes?: unknown; }

const ACTIONS = new Set<AttendanceAction>(["clock_in", "clock_out", "break_start", "break_end"]);
const SOURCES = new Set<AttendanceSource>(["web", "mobile", "kiosk", "manual", "system"]);

function isManager(request: FastifyRequest): boolean {
  return Boolean(request.auth?.roles.some((role) => role === "owner" || role === "staff"));
}

function dateValue(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function handleError(error: unknown, reply: FastifyReply) {
  if (error instanceof EmployeeNotFoundError || error instanceof AttendanceCorrectionNotFoundError) {
    return reply.code(404).send({ error: error.message });
  }
  if (error instanceof AttendanceIdempotencyConflictError || error instanceof AttendanceStateError) {
    return reply.code(409).send({ error: error.message });
  }
  if (error instanceof WorkforceValidationError) return reply.code(400).send({ error: error.message });
  throw error;
}

function parseLocation(value: unknown) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  if (input.latitude !== undefined && typeof input.latitude !== "number") return undefined;
  if (input.longitude !== undefined && typeof input.longitude !== "number") return undefined;
  if (input.address !== undefined && typeof input.address !== "string") return undefined;
  if (input.ipAddress !== undefined && typeof input.ipAddress !== "string") return undefined;
  return {
    latitude: typeof input.latitude === "number" ? input.latitude : undefined,
    longitude: typeof input.longitude === "number" ? input.longitude : undefined,
    address: typeof input.address === "string" ? input.address : undefined,
    ipAddress: typeof input.ipAddress === "string" ? input.ipAddress : undefined,
  };
}

async function resolveTargetEmployeeId(
  request: FastifyRequest,
  attendance: AttendanceService,
  requestedEmployeeId: unknown,
): Promise<string | null> {
  if (isManager(request) && typeof requestedEmployeeId === "string") return requestedEmployeeId;
  const own = await attendance.getEmployeeForUser(request.tenant!.tenantId, request.auth!.userId);
  return own?.id ?? null;
}

export function registerAttendanceRoutes(app: FastifyInstance, attendance: AttendanceService): void {
  app.get<{ Querystring: { date?: string } }>(
    "/attendance/me",
    { preHandler: requirePermission("attendance:read") },
    async (request, reply) => {
      const employee = await attendance.getEmployeeForUser(request.tenant!.tenantId, request.auth!.userId);
      if (!employee) return reply.send({ employee: null, record: null });
      const date = typeof request.query.date === "string" ? request.query.date : new Date().toISOString().slice(0, 10);
      const record = await attendance.getForUser(request.tenant!.tenantId, request.auth!.userId, date);
      return reply.send({ employee, record });
    },
  );

  app.post("/attendance/clock", { preHandler: requirePermission("attendance:clock") }, async (request, reply) => {
    const body = (request.body as ClockBody) ?? {};
    if (typeof body.action !== "string" || !ACTIONS.has(body.action as AttendanceAction)) {
      return reply.code(400).send({ error: "A valid attendance action is required" });
    }
    const timestamp = dateValue(body.timestamp);
    if (!timestamp) return reply.code(400).send({ error: "A valid timestamp is required" });
    const location = parseLocation(body.location);
    if (location === undefined) return reply.code(400).send({ error: "Invalid attendance location" });
    const employeeId = await resolveTargetEmployeeId(request, attendance, body.employeeId);
    if (!employeeId) return reply.code(404).send({ error: "No employee record could be resolved" });
    if (!isManager(request) && typeof body.employeeId === "string" && body.employeeId !== employeeId) {
      return reply.code(403).send({ error: "Members can only record attendance for themselves" });
    }
    const source = typeof body.source === "string" && SOURCES.has(body.source as AttendanceSource)
      ? body.source as AttendanceSource
      : "web";
    try {
      return reply.send(await attendance.apply({
        tenantId: request.tenant!.tenantId,
        employeeId,
        action: body.action as AttendanceAction,
        timestamp,
        idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
        source,
        location,
        notes: typeof body.notes === "string" ? body.notes : undefined,
      }, request.auth!.userId));
    } catch (error) {
      return handleError(error, reply);
    }
  });

  app.post("/attendance/sync", { preHandler: requirePermission("attendance:sync") }, async (request, reply) => {
    const body = (request.body as SyncBody) ?? {};
    if (!Array.isArray(body.events) || body.events.length === 0 || body.events.length > 100) {
      return reply.code(400).send({ error: "events must contain between 1 and 100 attendance events" });
    }
    const own = isManager(request) ? null : await attendance.getEmployeeForUser(request.tenant!.tenantId, request.auth!.userId);
    if (!isManager(request) && !own) return reply.code(404).send({ error: "No employee record is linked to this user" });

    const events = [];
    for (const raw of body.events) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return reply.code(400).send({ error: "Invalid sync event" });
      const item = raw as Record<string, unknown>;
      if (
        typeof item.employeeId !== "string" ||
        typeof item.action !== "string" ||
        !ACTIONS.has(item.action as AttendanceAction) ||
        typeof item.idempotencyKey !== "string"
      ) return reply.code(400).send({ error: "Each sync event requires employeeId, action and idempotencyKey" });
      const timestamp = dateValue(item.timestamp);
      if (!timestamp) return reply.code(400).send({ error: "Each sync event requires a valid timestamp" });
      if (own && item.employeeId !== own.id) return reply.code(403).send({ error: "Members can only sync their own attendance" });
      const location = parseLocation(item.location);
      if (location === undefined) return reply.code(400).send({ error: "Invalid sync event location" });
      const source = typeof item.source === "string" && SOURCES.has(item.source as AttendanceSource)
        ? item.source as AttendanceSource
        : "mobile";
      events.push({
        employeeId: item.employeeId,
        action: item.action as AttendanceAction,
        timestamp,
        idempotencyKey: item.idempotencyKey,
        source,
        location,
        notes: typeof item.notes === "string" ? item.notes : undefined,
      });
    }
    return reply.send({ results: await attendance.sync(request.tenant!.tenantId, events, request.auth!.userId) });
  });

  app.get<{ Querystring: RecordsQuery }>(
    "/attendance/records",
    { preHandler: requirePermission("attendance:read") },
    async (request, reply) => {
      const query = request.query;
      const limit = query.limit === undefined ? undefined : Number(query.limit);
      const offset = query.offset === undefined ? undefined : Number(query.offset);
      if ((limit !== undefined && !Number.isInteger(limit)) || (offset !== undefined && !Number.isInteger(offset))) {
        return reply.code(400).send({ error: "limit and offset must be integers" });
      }
      let employeeId = typeof query.employeeId === "string" ? query.employeeId : undefined;
      if (!isManager(request)) {
        const own = await attendance.getEmployeeForUser(request.tenant!.tenantId, request.auth!.userId);
        if (!own) return reply.send([]);
        if (employeeId && employeeId !== own.id) return reply.code(403).send({ error: "Members can only read their own attendance" });
        employeeId = own.id;
      }
      return reply.send(await attendance.list(request.tenant!.tenantId, {
        employeeId,
        branchId: isManager(request) && typeof query.branchId === "string" ? query.branchId : undefined,
        startDate: typeof query.startDate === "string" ? query.startDate : undefined,
        endDate: typeof query.endDate === "string" ? query.endDate : undefined,
        limit,
        offset,
      }));
    },
  );

  app.post("/attendance/corrections", { preHandler: requirePermission("attendance:clock") }, async (request, reply) => {
    const body = (request.body as CorrectionBody) ?? {};
    if (typeof body.requestedAction !== "string" || !ACTIONS.has(body.requestedAction as AttendanceAction)) {
      return reply.code(400).send({ error: "A valid requestedAction is required" });
    }
    const requestedAt = dateValue(body.requestedAt);
    if (!requestedAt || typeof body.reason !== "string") return reply.code(400).send({ error: "requestedAt and reason are required" });
    const employeeId = await resolveTargetEmployeeId(request, attendance, body.employeeId);
    if (!employeeId) return reply.code(404).send({ error: "No employee record could be resolved" });
    if (!isManager(request) && typeof body.employeeId === "string" && body.employeeId !== employeeId) {
      return reply.code(403).send({ error: "Members can only request corrections for themselves" });
    }
    try {
      return reply.code(201).send(await attendance.requestCorrection(request.tenant!.tenantId, request.auth!.userId, {
        employeeId,
        requestedAction: body.requestedAction as AttendanceAction,
        requestedAt,
        reason: body.reason,
      }));
    } catch (error) {
      return handleError(error, reply);
    }
  });

  app.get<{ Querystring: CorrectionQuery }>(
    "/attendance/corrections",
    { preHandler: requirePermission("attendance:read") },
    async (request, reply) => {
      const query = request.query;
      const status = typeof query.status === "string" && ["pending", "approved", "rejected"].includes(query.status)
        ? query.status as "pending" | "approved" | "rejected"
        : undefined;
      if (query.status !== undefined && !status) return reply.code(400).send({ error: "Invalid correction status" });
      const limit = query.limit === undefined ? undefined : Number(query.limit);
      const offset = query.offset === undefined ? undefined : Number(query.offset);
      if ((limit !== undefined && !Number.isInteger(limit)) || (offset !== undefined && !Number.isInteger(offset))) {
        return reply.code(400).send({ error: "limit and offset must be integers" });
      }
      let employeeId = typeof query.employeeId === "string" ? query.employeeId : undefined;
      if (!isManager(request)) {
        const own = await attendance.getEmployeeForUser(request.tenant!.tenantId, request.auth!.userId);
        if (!own) return reply.send({ data: [], total: 0 });
        if (employeeId && employeeId !== own.id) return reply.code(403).send({ error: "Members can only read their own corrections" });
        employeeId = own.id;
      }
      return reply.send(await attendance.listCorrections(request.tenant!.tenantId, { employeeId, status, limit, offset }));
    },
  );

  for (const [path, approved] of [["approve", true], ["reject", false]] as const) {
    app.post<{ Params: { id: string }; Body: ReviewBody }>(
      `/attendance/corrections/:id/${path}`,
      { preHandler: requirePermission("attendance:manage") },
      async (request, reply) => {
        try {
          return reply.send(await attendance.reviewCorrection(
            request.tenant!.tenantId,
            request.auth!.userId,
            request.params.id,
            approved,
            typeof request.body?.reviewNotes === "string" ? request.body.reviewNotes : undefined,
          ));
        } catch (error) {
          return handleError(error, reply);
        }
      },
    );
  }
}
