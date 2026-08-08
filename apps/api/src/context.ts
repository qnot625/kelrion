import { InMemoryAuditLog, type AuditLog } from "@adminops/audit";
import {
  ControlPlaneService,
  InMemoryControlPlaneRepository,
  PlatformAdminAuthService,
  type ControlPlaneRepository,
} from "@adminops/control-plane";
import {
  FormDefinitionService,
  InMemoryFormDefinitionRepository,
  InMemoryFormSubmissionRepository,
  SubmissionService,
  type FormDefinitionRepository,
  type FormSubmissionRepository,
} from "@adminops/forms";
import { AuthService, InMemoryUserRepository, type UserRepository } from "@adminops/identity";
import { InMemoryTenantRepository, type TenantRepository } from "@adminops/tenancy";
import {
  AppointmentService,
  InMemoryAppointmentRepository,
  InMemoryBranchRepository,
  InMemoryServiceRepository,
  InMemoryWaitlistRepository,
  type AppointmentRepository,
  type BranchRepository,
  type ServiceRepository,
  type WaitlistRepository,
} from "@adminops/branch-flow";
import {
  AttendanceService,
  EmployeeService,
  InMemoryAttendanceCorrectionRepository,
  InMemoryAttendanceRepository,
  InMemoryEmployeeRepository,
  type AttendanceCorrectionRepository,
  type AttendanceRepository,
  type EmployeeRepository,
} from "../../../modules/domains/workforce-core/src/index.js";
import {
  connectPostgres,
  PostgresAppointmentRepository,
  PostgresAttendanceCorrectionRepository,
  PostgresAttendanceRepository,
  PostgresAuditLog,
  PostgresBranchRepository,
  PostgresEmployeeRepository,
  PostgresFormDefinitionRepository,
  PostgresFormSubmissionRepository,
  PostgresServiceRepository,
  PostgresWaitlistRepository,
  PostgresControlPlaneRepository,
  PostgresTenantRepository,
  PostgresUserRepository,
  runMigrations,
} from "@adminops/persistence";
import {
  CustomerCaseService,
  ExecutiveSummaryService,
  InMemoryCustomerIntelligenceRepository,
  PostgresCustomerIntelligenceRepository,
  type CustomerIntelligenceRepository,
} from "./domains/customer-intelligence/index.js";
import {
  InMemoryWorkforceLifecycleRepository,
  PostgresWorkforceLifecycleRepository,
  WorkforceLifecycleService,
  type WorkforceLifecycleRepository,
} from "./domains/workforce-lifecycle/index.js";

export interface AppContext {
  tenantRepository: TenantRepository;
  userRepository: UserRepository;
  controlPlaneRepository: ControlPlaneRepository;
  authService: AuthService;
  platformAdminAuthService: PlatformAdminAuthService;
  controlPlaneService: ControlPlaneService;
  appointmentService: AppointmentService;
  branchRepository: BranchRepository;
  serviceRepository: ServiceRepository;
  waitlistRepository: WaitlistRepository;
  employeeRepository: EmployeeRepository;
  employeeService: EmployeeService;
  attendanceRepository: AttendanceRepository;
  attendanceCorrectionRepository: AttendanceCorrectionRepository;
  attendanceService: AttendanceService;
  workforceLifecycleService: WorkforceLifecycleService;
  formDefinitionRepository: FormDefinitionRepository;
  formSubmissionRepository: FormSubmissionRepository;
  formDefinitionService: FormDefinitionService;
  formSubmissionService: SubmissionService;
  customerCaseService: CustomerCaseService;
  executiveSummaryService: ExecutiveSummaryService;
  auditLog: AuditLog;
  close: () => Promise<void>;
}

function resolveTokenSecret(name: "SESSION_TOKEN_SECRET" | "PLATFORM_ADMIN_TOKEN_SECRET"): Uint8Array {
  const configured = process.env[name];
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error(`${name} must be set in production`);
  }
  return new TextEncoder().encode(configured ?? `dev-only-${name.toLowerCase()}-change-me`);
}

function assemble(
  tenantRepository: TenantRepository,
  userRepository: UserRepository,
  appointmentRepository: AppointmentRepository,
  branchRepository: BranchRepository,
  serviceRepository: ServiceRepository,
  waitlistRepository: WaitlistRepository,
  employeeRepository: EmployeeRepository,
  attendanceRepository: AttendanceRepository,
  attendanceCorrectionRepository: AttendanceCorrectionRepository,
  workforceLifecycleRepository: WorkforceLifecycleRepository,
  formDefinitionRepository: FormDefinitionRepository,
  formSubmissionRepository: FormSubmissionRepository,
  customerIntelligenceRepository: CustomerIntelligenceRepository,
  controlPlaneRepository: ControlPlaneRepository,
  auditLog: AuditLog,
  close: () => Promise<void>,
): AppContext {
  const appointmentService = new AppointmentService(
    appointmentRepository,
    branchRepository,
    serviceRepository,
    waitlistRepository,
  );
  const authService = new AuthService(userRepository, resolveTokenSecret("SESSION_TOKEN_SECRET"));
  const controlPlaneService = new ControlPlaneService(controlPlaneRepository, tenantRepository, userRepository);
  const employeeService = new EmployeeService(employeeRepository, auditLog);
  const attendanceService = new AttendanceService(
    employeeRepository,
    attendanceRepository,
    attendanceCorrectionRepository,
    auditLog,
  );
  const formDefinitionService = new FormDefinitionService(formDefinitionRepository, auditLog);
  const formSubmissionService = new SubmissionService(formSubmissionRepository, formDefinitionRepository, auditLog);
  return {
    tenantRepository,
    userRepository,
    controlPlaneRepository,
    authService,
    platformAdminAuthService: new PlatformAdminAuthService(
      controlPlaneRepository,
      resolveTokenSecret("PLATFORM_ADMIN_TOKEN_SECRET"),
    ),
    controlPlaneService,
    appointmentService,
    branchRepository,
    serviceRepository,
    waitlistRepository,
    employeeRepository,
    employeeService,
    attendanceRepository,
    attendanceCorrectionRepository,
    attendanceService,
    workforceLifecycleService: new WorkforceLifecycleService(workforceLifecycleRepository, employeeRepository),
    formDefinitionRepository,
    formSubmissionRepository,
    formDefinitionService,
    formSubmissionService,
    customerCaseService: new CustomerCaseService(customerIntelligenceRepository),
    executiveSummaryService: new ExecutiveSummaryService(customerIntelligenceRepository, appointmentService),
    auditLog,
    close,
  };
}

/** In-memory wiring; state lives only for the life of the process. */
export function createAppContext(): AppContext {
  return assemble(
    new InMemoryTenantRepository(),
    new InMemoryUserRepository(),
    new InMemoryAppointmentRepository(),
    new InMemoryBranchRepository(),
    new InMemoryServiceRepository(),
    new InMemoryWaitlistRepository(),
    new InMemoryEmployeeRepository(),
    new InMemoryAttendanceRepository(),
    new InMemoryAttendanceCorrectionRepository(),
    new InMemoryWorkforceLifecycleRepository(),
    new InMemoryFormDefinitionRepository(),
    new InMemoryFormSubmissionRepository(),
    new InMemoryCustomerIntelligenceRepository(),
    new InMemoryControlPlaneRepository(),
    new InMemoryAuditLog(),
    async () => {},
  );
}

export async function createPostgresAppContext(connectionString: string): Promise<AppContext> {
  const { db, close } = connectPostgres(connectionString);
  await runMigrations(db);
  return assemble(
    new PostgresTenantRepository(db),
    new PostgresUserRepository(db),
    new PostgresAppointmentRepository(db),
    new PostgresBranchRepository(db),
    new PostgresServiceRepository(db),
    new PostgresWaitlistRepository(db),
    new PostgresEmployeeRepository(db),
    new PostgresAttendanceRepository(db),
    new PostgresAttendanceCorrectionRepository(db),
    new PostgresWorkforceLifecycleRepository(db),
    new PostgresFormDefinitionRepository(db),
    new PostgresFormSubmissionRepository(db),
    new PostgresCustomerIntelligenceRepository(db),
    new PostgresControlPlaneRepository(db),
    new PostgresAuditLog(db),
    close,
  );
}

/** Uses Postgres when DATABASE_URL is set, otherwise falls back to in-memory. */
export async function createAppContextFromEnv(): Promise<AppContext> {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) return createPostgresAppContext(connectionString);
  if (process.env.NODE_ENV === "production") throw new Error("DATABASE_URL must be set in production");
  return createAppContext();
}
