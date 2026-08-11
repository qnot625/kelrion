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
};
