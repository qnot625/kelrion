import { tenants } from "@adminops/tenancy";
import { users } from "@adminops/identity";
import { platformAdministrators, organisationSubscriptions, billingInvoices } from "@adminops/control-plane";
import {
  appointments,
  appointmentWaitlists,
  branchHolidays,
  branchOperatingWindows,
  branches,
  branchServices,
  departments,
  serviceRequirements,
  services,
} from "@adminops/branch-flow";
import { auditEvents } from "@adminops/audit";
import { approvalPolicies, approvalRequests } from "@adminops/approvals";
import { formDefinitions, formSubmissions } from "@adminops/forms";
import {
  notifications,
  notificationPreferences,
  notificationTemplates,
  notificationDeliveries,
} from "@adminops/notifications";
import { employees, attendanceRecords, attendanceCorrections } from "@adminops/workforce-core";
import { queueConfigurations, queueEntries, queueEvents } from "@adminops/queue";
import {
  catalogItems,
  catalogVersions,
  serviceDeskSlaPolicies,
  serviceDeskTickets,
  serviceDeskComments,
  serviceDeskStatusEvents,
} from "@adminops/service-desk";
import {
  workflowDefinitions,
  workflowDefinitionVersions,
  workflowInstances,
  workflowHumanTasks,
} from "@adminops/workflow";

export { tenants } from "@adminops/tenancy";
export { users } from "@adminops/identity";
export { platformAdministrators, organisationSubscriptions, billingInvoices } from "@adminops/control-plane";
export {
  appointments,
  appointmentWaitlists,
  branchHolidays,
  branchOperatingWindows,
  branches,
  branchServices,
  departments,
  serviceRequirements,
  services,
} from "@adminops/branch-flow";
export { auditEvents } from "@adminops/audit";
<<<<<<< HEAD
=======
export { approvalPolicies, approvalRequests } from "@adminops/approvals";
export { formDefinitions, formSubmissions } from "@adminops/forms";
export {
  notifications,
  notificationPreferences,
  notificationTemplates,
  notificationDeliveries,
} from "@adminops/notifications";
export { employees, attendanceRecords, attendanceCorrections } from "@adminops/workforce-core";
export { queueConfigurations, queueEntries, queueEvents } from "@adminops/queue";
export {
  catalogItems,
  catalogVersions,
  serviceDeskSlaPolicies,
  serviceDeskTickets,
  serviceDeskComments,
  serviceDeskStatusEvents,
} from "@adminops/service-desk";
export {
  workflowDefinitions,
  workflowDefinitionVersions,
  workflowInstances,
  workflowHumanTasks,
} from "@adminops/workflow";
>>>>>>> 7e96c58 (organized)

export const schema = {
  tenants,
  users,
  platformAdministrators,
  organisationSubscriptions,
  billingInvoices,
  branches,
  branchOperatingWindows,
  branchHolidays,
  departments,
  services,
  serviceRequirements,
  branchServices,
  appointments,
  appointmentWaitlists,
  auditEvents,
<<<<<<< HEAD
=======
  approvalPolicies,
  approvalRequests,
  formDefinitions,
  formSubmissions,
  notifications,
  notificationPreferences,
  notificationTemplates,
  notificationDeliveries,
  employees,
  attendanceRecords,
  attendanceCorrections,
  queueConfigurations,
  queueEntries,
  queueEvents,
  catalogItems,
  catalogVersions,
  serviceDeskSlaPolicies,
  serviceDeskTickets,
  serviceDeskComments,
  serviceDeskStatusEvents,
  workflowDefinitions,
  workflowDefinitionVersions,
  workflowInstances,
  workflowHumanTasks,
>>>>>>> 7e96c58 (organized)
};
