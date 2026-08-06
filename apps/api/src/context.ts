import { InMemoryAuditLog, type AuditLog } from "@adminops/audit";
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
  authService: AuthService;
  appointmentService: AppointmentService;
  workforceLifecycleService: WorkforceLifecycleService;
  customerCaseService: CustomerCaseService;
  executiveSummaryService: ExecutiveSummaryService;
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
  workforceLifecycleRepository: WorkforceLifecycleRepository,
  customerIntelligenceRepository: CustomerIntelligenceRepository,
  auditLog: AuditLog,
  close: () => Promise<void>,
): AppContext {
  const appointmentService = new AppointmentService(appointmentRepository);
  return {
    tenantRepository,
    userRepository,
    authService: new AuthService(userRepository, resolveTokenSecret()),
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
