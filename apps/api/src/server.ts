import Fastify, { type FastifyInstance } from "fastify";
import type { AppContext } from "./context.js";
import { registerAuthGuard } from "./plugins/auth-guard.js";
import { registerModuleEntitlementGuard } from "./plugins/module-entitlement-guard.js";
import { registerPlatformAdminGuard } from "./plugins/platform-admin-guard.js";
import { registerTenantContext } from "./plugins/tenant-context.js";
import { registerAppointmentRoutes, registerPublicAppointmentRoutes } from "./routes/appointments.js";
import { registerAttendanceRoutes } from "./routes/attendance.js";
import { registerAuditRoutes } from "./routes/audit.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerBranchRoutes, registerPublicBranchRoutes } from "./routes/branches.js";
import { registerControlPlanePublicRoutes } from "./routes/control-plane-public.js";
import { registerCustomerIntelligenceRoutes } from "./routes/customer-intelligence.js";
import { registerEmployeeRoutes } from "./routes/employees.js";
import { registerEntitlementRoutes } from "./routes/entitlements.js";
import { registerFormsRoutes } from "./routes/forms.js";
import { registerPlatformAdminRoutes } from "./routes/platform-admin.js";
import { registerPublicServiceRoutes, registerServiceRoutes } from "./routes/services.js";
import { registerTenantRoutes } from "./routes/tenants.js";
import { registerUserRoutes } from "./routes/users.js";
import { registerWorkforceLifecycleRoutes } from "./routes/workforce-lifecycle.js";
import { registerWorkflowRoutes } from "./routes/workflows.js";
import { registerPublicWaitlistRoutes, registerWaitlistRoutes } from "./routes/waitlists.js";

export function buildServer(context: AppContext): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get("/health", async () => ({ status: "ok" }));

  registerControlPlanePublicRoutes(
    app,
    context.controlPlaneService,
    context.authService,
    context.platformAdminAuthService,
    context.auditLog,
  );
  registerTenantRoutes(app, context.controlPlaneService, context.auditLog);

  app.register(async (platformScope) => {
    registerPlatformAdminGuard(platformScope, context.platformAdminAuthService);
    registerPlatformAdminRoutes(platformScope, context.controlPlaneService);
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

    tenantScope.register(async (protectedScope) => {
      registerAuthGuard(protectedScope, context.authService);
      registerEntitlementRoutes(protectedScope, context.controlPlaneService, context.tenantRepository);
      registerAuditRoutes(protectedScope, context.auditLog);
      registerUserRoutes(protectedScope, context.userRepository, context.auditLog);

      protectedScope.register(async (branchScope) => {
        registerModuleEntitlementGuard(branchScope, context.controlPlaneService, "branches");
        registerBranchRoutes(branchScope, context.branchRepository, context.auditLog);
        registerServiceRoutes(
          branchScope,
          context.serviceRepository,
          context.branchRepository,
          context.auditLog,
        );
      });

      protectedScope.register(async (appointmentsScope) => {
        registerModuleEntitlementGuard(appointmentsScope, context.controlPlaneService, "appointments");
        registerAppointmentRoutes(appointmentsScope, context.appointmentService, context.auditLog);
        registerWaitlistRoutes(appointmentsScope, context.appointmentService, context.auditLog);
      });

      protectedScope.register(async (employeeScope) => {
        registerModuleEntitlementGuard(employeeScope, context.controlPlaneService, "employees");
        registerEmployeeRoutes(
          employeeScope,
          context.employeeService,
          context.branchRepository,
          context.userRepository,
        );
      });

      protectedScope.register(async (attendanceScope) => {
        registerModuleEntitlementGuard(attendanceScope, context.controlPlaneService, "attendance");
        registerAttendanceRoutes(attendanceScope, context.attendanceService);
      });

      registerWorkforceLifecycleRoutes(
        protectedScope,
        context.workforceLifecycleService,
        context.controlPlaneService,
        context.auditLog,
      );
      registerFormsRoutes(
        protectedScope,
        context.formDefinitionService,
        context.formSubmissionService,
        context.controlPlaneService,
        context.workflowEngineService,
      );
      registerWorkflowRoutes(
        protectedScope,
        context.workflowEngineService,
        context.controlPlaneService,
      );
      registerCustomerIntelligenceRoutes(
        protectedScope,
        context.customerCaseService,
        context.executiveSummaryService,
        context.controlPlaneService,
        context.auditLog,
      );
    });
  });

  return app;
}
