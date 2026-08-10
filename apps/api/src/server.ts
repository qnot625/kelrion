import Fastify, { type FastifyInstance } from "fastify";
import { BillingLifecycleService } from "@adminops/control-plane";
import type { AppContext } from "./context.js";
import { createStripeBillingProviderFromEnv, type BillingPaymentProvider } from "./billing/stripe-provider.js";
import { registerBillingLifecycleWorker } from "./billing/worker.js";
import { registerNotificationDeliveryWorker } from "./notifications/worker.js";
import { registerAuthGuard } from "./plugins/auth-guard.js";
import { registerModuleEntitlementGuard } from "./plugins/module-entitlement-guard.js";
import { registerPlatformAdminGuard } from "./plugins/platform-admin-guard.js";
import { registerTenantContext } from "./plugins/tenant-context.js";
import { registerApprovalRoutes } from "./routes/approvals.js";
import { registerAppointmentRoutes, registerPublicAppointmentRoutes } from "./routes/appointments.js";
import { registerAttendanceRoutes } from "./routes/attendance.js";
import { registerAuditRoutes } from "./routes/audit.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerBillingPaymentRoutes, registerStripeBillingWebhookRoutes } from "./routes/billing-payments.js";
import { registerBranchRoutes, registerPublicBranchRoutes } from "./routes/branches.js";
import { registerControlPlanePublicRoutes } from "./routes/control-plane-public.js";
import { registerCustomerIntelligenceRoutes } from "./routes/customer-intelligence.js";
import { registerEmployeeRoutes } from "./routes/employees.js";
import { registerEntitlementRoutes } from "./routes/entitlements.js";
import { registerFormsRoutes } from "./routes/forms.js";
import { registerNotificationRoutes } from "./routes/notifications.js";
import { registerPlatformAdminRoutes } from "./routes/platform-admin.js";
import { registerQueueRealtimeRoutes } from "./routes/queue-realtime.js";
import { registerPublicQueueRoutes } from "./routes/queue-public.js";
import { registerQueueRoutes } from "./routes/queue.js";
import { registerPublicServiceRoutes, registerServiceRoutes } from "./routes/services.js";
import { registerServiceDeskCatalogRoutes } from "./routes/service-desk-catalog.js";
import { registerServiceDeskRoutes } from "./routes/service-desk.js";
import { registerTenantRoutes } from "./routes/tenants.js";
import { registerUserRoutes } from "./routes/users.js";
import { registerWorkforceLifecycleRoutes } from "./routes/workforce-lifecycle.js";
import { registerWorkflowRoutes } from "./routes/workflows.js";
import { registerPublicWaitlistRoutes, registerWaitlistRoutes } from "./routes/waitlists.js";

export interface BuildServerOptions {
  readonly billingPaymentProvider?: BillingPaymentProvider | null;
}

export function buildServer(context: AppContext, options: BuildServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const billingLifecycle = new BillingLifecycleService(context.controlPlaneRepository);
  const stripeBillingProvider = options.billingPaymentProvider === undefined
    ? createStripeBillingProviderFromEnv()
    : options.billingPaymentProvider;
  app.get("/health", async () => ({ status: "ok" }));

  registerBillingLifecycleWorker(app, billingLifecycle);
  app.register(async (stripeWebhookScope) => {
    stripeWebhookScope.removeContentTypeParser("application/json");
    stripeWebhookScope.addContentTypeParser("application/json", { parseAs: "buffer" }, (_request, body, done) => done(null, body));
    registerStripeBillingWebhookRoutes(stripeWebhookScope, billingLifecycle, stripeBillingProvider, context.auditLog);
  });

  registerNotificationDeliveryWorker(app, context);
  registerControlPlanePublicRoutes(app, context.controlPlaneService, context.authService, context.platformAdminAuthService, context.auditLog);
  registerTenantRoutes(app, context.controlPlaneService, context.auditLog);

  app.register(async (platformScope) => {
    registerPlatformAdminGuard(platformScope, context.platformAdminAuthService);
    registerPlatformAdminRoutes(platformScope, context.controlPlaneService, billingLifecycle);
  });

  app.register(async (tenantScope) => {
    registerTenantContext(tenantScope, context.tenantRepository);
    registerAuthRoutes(tenantScope, context.authService, context.auditLog);

    tenantScope.register(async (branchPublicScope) => {
      registerModuleEntitlementGuard(branchPublicScope, context.controlPlaneService, "branches");
      registerPublicBranchRoutes(branchPublicScope, context.branchRepository);
      registerPublicServiceRoutes(branchPublicScope, context.serviceRepository, context.branchRepository);
    });

    tenantScope.register(async (appointmentPublicScope) => {
      registerModuleEntitlementGuard(appointmentPublicScope, context.controlPlaneService, "appointments");
      registerPublicAppointmentRoutes(appointmentPublicScope, context.appointmentService, context.auditLog);
      registerPublicWaitlistRoutes(appointmentPublicScope, context.appointmentService, context.auditLog);
    });

    tenantScope.register(async (queuePublicScope) => {
      registerModuleEntitlementGuard(queuePublicScope, context.controlPlaneService, "queue");
      registerPublicQueueRoutes(queuePublicScope, context.queueService);
    });

    tenantScope.register(async (protectedScope) => {
      registerAuthGuard(protectedScope, context.authService);
      registerEntitlementRoutes(protectedScope, context.controlPlaneService, context.tenantRepository);
      registerBillingPaymentRoutes(protectedScope, billingLifecycle, context.userRepository, stripeBillingProvider);
      registerAuditRoutes(protectedScope, context.auditLog);
      registerUserRoutes(protectedScope, context.userRepository, context.auditLog);

      protectedScope.register(async (branchScope) => {
        registerModuleEntitlementGuard(branchScope, context.controlPlaneService, "branches");
        registerBranchRoutes(branchScope, context.branchRepository, context.auditLog);
        registerServiceRoutes(branchScope, context.serviceRepository, context.branchRepository, context.auditLog);
      });

      protectedScope.register(async (appointmentsScope) => {
        registerModuleEntitlementGuard(appointmentsScope, context.controlPlaneService, "appointments");
        registerAppointmentRoutes(appointmentsScope, context.appointmentService, context.auditLog);
        registerWaitlistRoutes(appointmentsScope, context.appointmentService, context.auditLog);
      });

      protectedScope.register(async (employeeScope) => {
        registerModuleEntitlementGuard(employeeScope, context.controlPlaneService, "employees");
        registerEmployeeRoutes(employeeScope, context.employeeService, context.branchRepository, context.userRepository);
      });

      protectedScope.register(async (attendanceScope) => {
        registerModuleEntitlementGuard(attendanceScope, context.controlPlaneService, "attendance");
        registerAttendanceRoutes(attendanceScope, context.attendanceService);
      });

      registerWorkforceLifecycleRoutes(protectedScope, context.workforceLifecycleService, context.controlPlaneService, context.auditLog);
      registerFormsRoutes(protectedScope, context.formDefinitionService, context.formSubmissionService, context.controlPlaneService, context.workflowEngineService);
      registerWorkflowRoutes(protectedScope, context.workflowEngineService, context.controlPlaneService);
      registerApprovalRoutes(protectedScope, context.approvalEngineService, context.workflowEngineService, context.controlPlaneService);
      registerQueueRoutes(protectedScope, context.queueService, context.queueCheckInService, context.controlPlaneService);
      registerQueueRealtimeRoutes(protectedScope, context.queueService, context.controlPlaneService);
      registerNotificationRoutes(protectedScope, context.notificationService, context.userRepository, context.controlPlaneService, context.notificationProviders);
      registerServiceDeskCatalogRoutes(
        protectedScope,
        context.serviceDeskCatalogService,
        context.serviceDeskService,
        context.formDefinitionService,
        context.formSubmissionService,
        context.workflowEngineService,
        context.approvalEngineService,
        context.controlPlaneService,
      );
      registerServiceDeskRoutes(protectedScope, context.serviceDeskService, context.controlPlaneService);
      registerCustomerIntelligenceRoutes(protectedScope, context.customerCaseService, context.executiveSummaryService, context.controlPlaneService, context.auditLog);
    });
  });

  return app;
}
