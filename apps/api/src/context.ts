import { InMemoryAuditLog, type AuditLog } from "@adminops/audit";
import {
  ApprovalEngineService,
  InMemoryApprovalPolicyRepository,
  InMemoryApprovalRequestRepository,
  type ApprovalPolicyRepository,
  type ApprovalRequestRepository,
} from "@adminops/approvals";
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
import {
  InMemoryNotificationDeliveryRepository,
  InMemoryNotificationPreferenceRepository,
  InMemoryNotificationRepository,
  InMemoryNotificationTemplateRepository,
  NotificationService,
  type NotificationDeliveryRepository,
  type NotificationPreferenceRepository,
  type NotificationProviderMap,
  type NotificationRepository,
  type NotificationTemplateRepository,
} from "@adminops/notifications";
import {
  InMemoryServiceDeskCatalogRepository,
  InMemoryServiceDeskSlaPolicyRepository,
  InMemoryServiceDeskTicketRepository,
  ServiceDeskCatalogService,
  ServiceDeskService,
  type ServiceDeskCatalogRepository,
  type ServiceDeskSlaPolicyRepository,
  type ServiceDeskTicketRepository,
} from "@adminops/service-desk";
import {
  InMemoryHumanTaskRepository,
  InMemoryWorkflowDefinitionRepository,
  InMemoryWorkflowInstanceRepository,
  WorkflowEngineService,
  type HumanTaskRepository,
  type WorkflowDefinitionRepository,
  type WorkflowInstanceRepository,
} from "@adminops/workflow";
import {
  InMemoryQueueConfigurationRepository,
  InMemoryQueueEntryRepository,
  InMemoryQueueEventRepository,
  QueueCheckInService,
  QueueService,
  type QueueConfigurationRepository,
  type QueueEntryRepository,
  type QueueEventRepository,
} from "@adminops/queue";
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
  PostgresApprovalPolicyRepository,
  PostgresApprovalRequestRepository,
  PostgresAppointmentRepository,
  PostgresAttendanceCorrectionRepository,
  PostgresAttendanceRepository,
  PostgresAuditLog,
  PostgresBranchRepository,
  PostgresEmployeeRepository,
  PostgresFormDefinitionRepository,
  PostgresFormSubmissionRepository,
  PostgresHumanTaskRepository,
  PostgresNotificationDeliveryRepository,
  PostgresNotificationPreferenceRepository,
  PostgresNotificationRepository,
  PostgresNotificationTemplateRepository,
  PostgresQueueConfigurationRepository,
  PostgresQueueEntryRepository,
  PostgresQueueEventRepository,
  PostgresServiceDeskCatalogRepository,
  PostgresServiceDeskSlaPolicyRepository,
  PostgresServiceDeskTicketRepository,
  PostgresServiceRepository,
  PostgresWaitlistRepository,
  PostgresWorkflowDefinitionRepository,
  PostgresWorkflowInstanceRepository,
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
import { createNotificationProvidersFromEnv } from "./notifications/webhook-provider.js";

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
  workflowDefinitionRepository: WorkflowDefinitionRepository;
  workflowInstanceRepository: WorkflowInstanceRepository;
  humanTaskRepository: HumanTaskRepository;
  workflowEngineService: WorkflowEngineService;
  approvalPolicyRepository: ApprovalPolicyRepository;
  approvalRequestRepository: ApprovalRequestRepository;
  approvalEngineService: ApprovalEngineService;
  queueConfigurationRepository: QueueConfigurationRepository;
  queueEntryRepository: QueueEntryRepository;
  queueEventRepository: QueueEventRepository;
  queueService: QueueService;
  queueCheckInService: QueueCheckInService;
  notificationRepository: NotificationRepository;
  notificationPreferenceRepository: NotificationPreferenceRepository;
  notificationTemplateRepository: NotificationTemplateRepository;
  notificationDeliveryRepository: NotificationDeliveryRepository;
  notificationService: NotificationService;
  notificationProviders: NotificationProviderMap;
  serviceDeskCatalogRepository: ServiceDeskCatalogRepository;
  serviceDeskTicketRepository: ServiceDeskTicketRepository;
  serviceDeskSlaPolicyRepository: ServiceDeskSlaPolicyRepository;
  serviceDeskCatalogService: ServiceDeskCatalogService;
  serviceDeskService: ServiceDeskService;
  customerCaseService: CustomerCaseService;
  executiveSummaryService: ExecutiveSummaryService;
  auditLog: AuditLog;
  close: () => Promise<void>;
}

function resolveTokenSecret(name: "SESSION_TOKEN_SECRET" | "PLATFORM_ADMIN_TOKEN_SECRET"): Uint8Array {
  const configured = process.env[name];
  if (!configured && process.env.NODE_ENV === "production") throw new Error(`${name} must be set in production`);
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
  workflowDefinitionRepository: WorkflowDefinitionRepository,
  workflowInstanceRepository: WorkflowInstanceRepository,
  humanTaskRepository: HumanTaskRepository,
  approvalPolicyRepository: ApprovalPolicyRepository,
  approvalRequestRepository: ApprovalRequestRepository,
  queueConfigurationRepository: QueueConfigurationRepository,
  queueEntryRepository: QueueEntryRepository,
  queueEventRepository: QueueEventRepository,
  notificationRepository: NotificationRepository,
  notificationPreferenceRepository: NotificationPreferenceRepository,
  notificationTemplateRepository: NotificationTemplateRepository,
  notificationDeliveryRepository: NotificationDeliveryRepository,
  serviceDeskCatalogRepository: ServiceDeskCatalogRepository,
  serviceDeskTicketRepository: ServiceDeskTicketRepository,
  serviceDeskSlaPolicyRepository: ServiceDeskSlaPolicyRepository,
  customerIntelligenceRepository: CustomerIntelligenceRepository,
  controlPlaneRepository: ControlPlaneRepository,
  auditLog: AuditLog,
  close: () => Promise<void>,
): AppContext {
  const appointmentService = new AppointmentService(appointmentRepository, branchRepository, serviceRepository, waitlistRepository);
  const authService = new AuthService(userRepository, resolveTokenSecret("SESSION_TOKEN_SECRET"));
  const controlPlaneService = new ControlPlaneService(controlPlaneRepository, tenantRepository, userRepository);
  const employeeService = new EmployeeService(employeeRepository, auditLog);
  const attendanceService = new AttendanceService(employeeRepository, attendanceRepository, attendanceCorrectionRepository, auditLog);
  const formDefinitionService = new FormDefinitionService(formDefinitionRepository, auditLog);
  const formSubmissionService = new SubmissionService(formSubmissionRepository, formDefinitionRepository, auditLog);
  const workflowEngineService = new WorkflowEngineService(workflowDefinitionRepository, workflowInstanceRepository, humanTaskRepository, auditLog);
  const approvalEngineService = new ApprovalEngineService(approvalPolicyRepository, approvalRequestRepository, auditLog);
  const notificationService = new NotificationService(
    notificationRepository,
    notificationPreferenceRepository,
    notificationTemplateRepository,
    notificationDeliveryRepository,
    auditLog,
  );
  const notificationProviders = createNotificationProvidersFromEnv();
  const queueService = new QueueService(
    queueConfigurationRepository,
    queueEntryRepository,
    queueEventRepository,
    auditLog,
    async ({ entry, type, actorUserId, data }) => {
      try {
        const entitlements = await controlPlaneService.getEntitlements(entry.tenantId);
        const notificationsEnabled = entitlements.modules.some((module) => module.key === "notifications" && module.enabled);
        if (!notificationsEnabled) return;
        await notificationService.notifyQueueEvent({
          tenantId: entry.tenantId,
          entry: {
            id: entry.id,
            publicToken: entry.publicToken,
            ticketNumber: entry.ticketNumber,
            branchId: entry.branchId,
            serviceId: entry.serviceId,
            customer: entry.customer,
          },
          eventType: type,
          data,
          actorUserId,
        });
      } catch (error) {
        await auditLog.record({
          tenantId: entry.tenantId,
          actorUserId,
          action: "notification.queue_fanout_failed",
          targetType: "queue_entry",
          targetId: entry.id,
          metadata: { eventType: type, error: error instanceof Error ? error.message.slice(0, 500) : "Unknown notification failure" },
        });
      }
    },
  );
  const queueCheckInService = new QueueCheckInService(queueService, async (tenantId, appointmentId) => {
    const values = (await appointmentService.list(tenantId)).map((item) => item as unknown as Record<string, unknown>);
    const appointment = values.find((item) => item.id === appointmentId);
    if (!appointment) return null;
    const branchId = typeof appointment.branchId === "string" ? appointment.branchId : null;
    const serviceId = typeof appointment.serviceId === "string" ? appointment.serviceId : null;
    if (!branchId || !serviceId) return null;
    const startValue = appointment.startsAt ?? appointment.startAt ?? appointment.startTime;
    const startsAt = startValue instanceof Date ? startValue : typeof startValue === "string" ? new Date(startValue) : null;
    return {
      appointmentId,
      branchId,
      serviceId,
      departmentId: typeof appointment.departmentId === "string" ? appointment.departmentId : null,
      startsAt: startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt : null,
      status: typeof appointment.status === "string" ? appointment.status : null,
      customer: {
        userId: typeof appointment.customerUserId === "string" ? appointment.customerUserId : null,
        customerId: typeof appointment.customerId === "string" ? appointment.customerId : null,
        name: typeof appointment.customerName === "string" ? appointment.customerName : null,
        email: typeof appointment.customerEmail === "string" ? appointment.customerEmail : null,
        phone: typeof appointment.customerPhone === "string" ? appointment.customerPhone : null,
      },
    };
  });
  const serviceDeskCatalogService = new ServiceDeskCatalogService(serviceDeskCatalogRepository, auditLog);
  const serviceDeskService = new ServiceDeskService(serviceDeskTicketRepository, serviceDeskSlaPolicyRepository, auditLog);
  return {
    tenantRepository,
    userRepository,
    controlPlaneRepository,
    authService,
    platformAdminAuthService: new PlatformAdminAuthService(controlPlaneRepository, resolveTokenSecret("PLATFORM_ADMIN_TOKEN_SECRET")),
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
    workflowDefinitionRepository,
    workflowInstanceRepository,
    humanTaskRepository,
    workflowEngineService,
    approvalPolicyRepository,
    approvalRequestRepository,
    approvalEngineService,
    queueConfigurationRepository,
    queueEntryRepository,
    queueEventRepository,
    queueService,
    queueCheckInService,
    notificationRepository,
    notificationPreferenceRepository,
    notificationTemplateRepository,
    notificationDeliveryRepository,
    notificationService,
    notificationProviders,
    serviceDeskCatalogRepository,
    serviceDeskTicketRepository,
    serviceDeskSlaPolicyRepository,
    serviceDeskCatalogService,
    serviceDeskService,
    customerCaseService: new CustomerCaseService(customerIntelligenceRepository),
    executiveSummaryService: new ExecutiveSummaryService(customerIntelligenceRepository, appointmentService),
    auditLog,
    close,
  };
}

export function createAppContext(): AppContext {
  return assemble(
    new InMemoryTenantRepository(), new InMemoryUserRepository(), new InMemoryAppointmentRepository(),
    new InMemoryBranchRepository(), new InMemoryServiceRepository(), new InMemoryWaitlistRepository(),
    new InMemoryEmployeeRepository(), new InMemoryAttendanceRepository(), new InMemoryAttendanceCorrectionRepository(),
    new InMemoryWorkforceLifecycleRepository(), new InMemoryFormDefinitionRepository(), new InMemoryFormSubmissionRepository(),
    new InMemoryWorkflowDefinitionRepository(), new InMemoryWorkflowInstanceRepository(), new InMemoryHumanTaskRepository(),
    new InMemoryApprovalPolicyRepository(), new InMemoryApprovalRequestRepository(),
    new InMemoryQueueConfigurationRepository(), new InMemoryQueueEntryRepository(), new InMemoryQueueEventRepository(),
    new InMemoryNotificationRepository(), new InMemoryNotificationPreferenceRepository(), new InMemoryNotificationTemplateRepository(), new InMemoryNotificationDeliveryRepository(),
    new InMemoryServiceDeskCatalogRepository(), new InMemoryServiceDeskTicketRepository(), new InMemoryServiceDeskSlaPolicyRepository(),
    new InMemoryCustomerIntelligenceRepository(), new InMemoryControlPlaneRepository(), new InMemoryAuditLog(), async () => {},
  );
}

export async function createPostgresAppContext(connectionString: string): Promise<AppContext> {
  const { db, close } = connectPostgres(connectionString);
  await runMigrations(db);
  return assemble(
    new PostgresTenantRepository(db), new PostgresUserRepository(db), new PostgresAppointmentRepository(db),
    new PostgresBranchRepository(db), new PostgresServiceRepository(db), new PostgresWaitlistRepository(db),
    new PostgresEmployeeRepository(db), new PostgresAttendanceRepository(db), new PostgresAttendanceCorrectionRepository(db),
    new PostgresWorkforceLifecycleRepository(db), new PostgresFormDefinitionRepository(db), new PostgresFormSubmissionRepository(db),
    new PostgresWorkflowDefinitionRepository(db), new PostgresWorkflowInstanceRepository(db), new PostgresHumanTaskRepository(db),
    new PostgresApprovalPolicyRepository(db), new PostgresApprovalRequestRepository(db),
    new PostgresQueueConfigurationRepository(db), new PostgresQueueEntryRepository(db), new PostgresQueueEventRepository(db),
    new PostgresNotificationRepository(db), new PostgresNotificationPreferenceRepository(db), new PostgresNotificationTemplateRepository(db), new PostgresNotificationDeliveryRepository(db),
    new PostgresServiceDeskCatalogRepository(db), new PostgresServiceDeskTicketRepository(db), new PostgresServiceDeskSlaPolicyRepository(db),
    new PostgresCustomerIntelligenceRepository(db), new PostgresControlPlaneRepository(db), new PostgresAuditLog(db), close,
  );
}

export async function createAppContextFromEnv(): Promise<AppContext> {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) return createPostgresAppContext(connectionString);
  if (process.env.NODE_ENV === "production") throw new Error("DATABASE_URL must be set in production");
  return createAppContext();
}
