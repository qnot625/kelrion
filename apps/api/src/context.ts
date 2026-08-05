import { InMemoryAuditLog, type AuditLog } from "@adminops/audit";
import { AuthService, InMemoryUserRepository, type UserRepository } from "@adminops/identity";
import { InMemoryTenantRepository, type TenantRepository } from "@adminops/tenancy";
import {
  AppointmentService,
  InMemoryAppointmentRepository,
  type AppointmentRepository,
} from "@adminops/branch-flow";
import {
  EmployeeService,
  InMemoryEmployeeRepository,
  type EmployeeRepository,
  AttendanceSyncEngine,
  type AttendanceRecordStore,
  type IdempotencyRegistryStore,
  type AttendanceCorrectionRepository,
  InMemoryAttendanceRecordStore,
  InMemoryIdempotencyRegistry,
  InMemoryAttendanceCorrectionRepository,
} from "@adminops/workforce-core";
import {
  connectPostgres,
  PostgresAppointmentRepository,
  PostgresAttendanceRepository,
  PostgresAttendanceCorrectionRepository,
  PostgresAuditLog,
  PostgresEmployeeRepository,
  PostgresTenantRepository,
  PostgresUserRepository,
  runMigrations,
} from "@adminops/persistence";

export interface AppContext {
  tenantRepository: TenantRepository;
  userRepository: UserRepository;
  authService: AuthService;
  appointmentService: AppointmentService;
  employeeRepository: EmployeeRepository;
  employeeService: EmployeeService;
  attendanceRepository: AttendanceRecordStore;
  attendanceSyncEngine: AttendanceSyncEngine;
  attendanceCorrectionRepository: AttendanceCorrectionRepository;
  auditLog: AuditLog;
  close: () => Promise<void>;
}

function resolveTokenSecret(): Uint8Array {
  const configured = process.env.SESSION_TOKEN_SECRET;
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_TOKEN_SECRET must be set in production");
  }
  return new TextEncoder().encode(configured ?? "dev-only-insecure-secret-change-me");
}

function assemble(
  tenantRepository: TenantRepository,
  userRepository: UserRepository,
  appointmentRepository: AppointmentRepository,
  employeeRepository: EmployeeRepository,
  attendanceRecordStore: AttendanceRecordStore,
  idempotencyRegistryStore: IdempotencyRegistryStore,
  attendanceCorrectionRepository: AttendanceCorrectionRepository,
  auditLog: AuditLog,
  close: () => Promise<void>,
): AppContext {
  return {
    tenantRepository,
    userRepository,
    authService: new AuthService(userRepository, resolveTokenSecret()),
    appointmentService: new AppointmentService(appointmentRepository),
    employeeRepository,
    employeeService: new EmployeeService(employeeRepository, auditLog),
    attendanceRepository: attendanceRecordStore,
    attendanceSyncEngine: new AttendanceSyncEngine({
      recordStore: attendanceRecordStore,
      idempotencyRegistry: idempotencyRegistryStore,
    }),
    attendanceCorrectionRepository,
    auditLog,
    close,
  };
}

/** In-memory wiring; state lives only for the life of the process. */
export function createAppContext(): AppContext {
  const recordStore = new InMemoryAttendanceRecordStore();
  const idempotencyStore = new InMemoryIdempotencyRegistry();
  return assemble(
    new InMemoryTenantRepository(),
    new InMemoryUserRepository(),
    new InMemoryAppointmentRepository(),
    new InMemoryEmployeeRepository(),
    recordStore,
    idempotencyStore,
    new InMemoryAttendanceCorrectionRepository(),
    new InMemoryAuditLog(),
    async () => {},
  );
}

export async function createPostgresAppContext(connectionString: string): Promise<AppContext> {
  const { db, close } = connectPostgres(connectionString);
  await runMigrations(db);
  const attendanceRepo = new PostgresAttendanceRepository(db);
  return assemble(
    new PostgresTenantRepository(db),
    new PostgresUserRepository(db),
    new PostgresAppointmentRepository(db),
    new PostgresEmployeeRepository(db),
    attendanceRepo,
    attendanceRepo,
    new PostgresAttendanceCorrectionRepository(db),
    new PostgresAuditLog(db),
    close,
  );
}

/** Uses Postgres when DATABASE_URL is set, otherwise falls back to in-memory. */
export async function createAppContextFromEnv(): Promise<AppContext> {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    return createPostgresAppContext(connectionString);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL must be set in production");
  }
  return createAppContext();
}
