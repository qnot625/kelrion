import { InMemoryAuditLog, type AuditLog } from "@adminops/audit";
import {
  ControlPlaneService,
  InMemoryControlPlaneRepository,
  PlatformAdminAuthService,
  type ControlPlaneRepository,
} from "@adminops/control-plane";
import { AuthService, InMemoryUserRepository, type UserRepository } from "@adminops/identity";
import { InMemoryTenantRepository, type TenantRepository } from "@adminops/tenancy";
import {
  AppointmentService,
  InMemoryAppointmentRepository,
  type AppointmentRepository,
} from "@adminops/branch-flow";
import {
  connectPostgres,
  PostgresAppointmentRepository,
  PostgresAuditLog,
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
  workforceLifecycleService: WorkforceLifecycleService;
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
  workforceLifecycleRepository: WorkforceLifecycleRepository,
  customerIntelligenceRepository: CustomerIntelligenceRepository,
  controlPlaneRepository: ControlPlaneRepository,
  auditLog: AuditLog,
  close: () => Promise<void>,
): AppContext {
  const appointmentService = new AppointmentService(appointmentRepository);
  const authService = new AuthService(userRepository, resolveTokenSecret("SESSION_TOKEN_SECRET"));
  const controlPlaneService = new ControlPlaneService(controlPlaneRepository, tenantRepository, userRepository);
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
    workforceLifecycleService: new WorkforceLifecycleService(workforceLifecycleRepository),
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
    new InMemoryWorkforceLifecycleRepository(),
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
    new PostgresWorkforceLifecycleRepository(db),
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
