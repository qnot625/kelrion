export type Role = "owner" | "staff" | "member";

export type Permission =
  | "appointments:book"
  | "appointments:manage"
  | "appointments:view"
  | "tenant:manage"
  | "leave:request"
  | "leave:approve"
  | "lifecycle:view"
  | "lifecycle:manage"
  | "cases:create"
  | "cases:manage"
  | "analytics:view"
  | "employees:create"
  | "employees:read"
  | "employees:update"
  | "employees:delete"
  | "employees:manage_hierarchy"
  | "attendance:clock"
  | "attendance:read"
  | "attendance:sync"
  | "attendance:manage"
  | "forms:submit"
  | "forms:manage"
  | "workflow:view"
  | "workflow:start"
  | "workflow:task"
  | "workflow:manage"
  | "approvals:view"
  | "approvals:request"
  | "approvals:decide"
  | "approvals:manage"
  | "queue:view"
  | "queue:checkin"
  | "queue:serve"
  | "queue:manage"
  | "notifications:view"
  | "notifications:preferences"
  | "notifications:send"
  | "notifications:manage"
  | "service_desk:view"
  | "service_desk:create"
  | "service_desk:comment"
  | "service_desk:manage"
  | "service_desk:sla"
  | "service_desk:catalog";

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: [
    "appointments:book", "appointments:manage", "appointments:view", "tenant:manage",
    "leave:request", "leave:approve", "lifecycle:view", "lifecycle:manage",
    "cases:create", "cases:manage", "analytics:view",
    "employees:create", "employees:read", "employees:update", "employees:delete", "employees:manage_hierarchy",
    "attendance:clock", "attendance:read", "attendance:sync", "attendance:manage",
    "forms:submit", "forms:manage",
    "workflow:view", "workflow:start", "workflow:task", "workflow:manage",
    "approvals:view", "approvals:request", "approvals:decide", "approvals:manage",
    "queue:view", "queue:checkin", "queue:serve", "queue:manage",
    "notifications:view", "notifications:preferences", "notifications:send", "notifications:manage",
    "service_desk:view", "service_desk:create", "service_desk:comment", "service_desk:manage", "service_desk:sla", "service_desk:catalog",
  ],
  staff: [
    "appointments:book", "appointments:manage", "appointments:view",
    "leave:request", "leave:approve", "lifecycle:view", "lifecycle:manage",
    "cases:create", "cases:manage", "analytics:view",
    "employees:create", "employees:read", "employees:update", "employees:manage_hierarchy",
    "attendance:clock", "attendance:read", "attendance:sync", "attendance:manage",
    "forms:submit", "forms:manage",
    "workflow:view", "workflow:start", "workflow:task", "workflow:manage",
    "approvals:view", "approvals:request", "approvals:decide", "approvals:manage",
    "queue:view", "queue:checkin", "queue:serve", "queue:manage",
    "notifications:view", "notifications:preferences", "notifications:send", "notifications:manage",
    "service_desk:view", "service_desk:create", "service_desk:comment", "service_desk:manage", "service_desk:sla", "service_desk:catalog",
  ],
  member: [
    "appointments:book", "leave:request", "lifecycle:view", "cases:create",
    "employees:read", "attendance:clock", "attendance:read", "attendance:sync",
    "forms:submit",
    "workflow:view", "workflow:start", "workflow:task",
    "approvals:view", "approvals:request", "approvals:decide",
    "queue:view", "queue:checkin",
    "notifications:view", "notifications:preferences",
    "service_desk:view", "service_desk:create", "service_desk:comment",
  ],
};

function isKnownRole(role: string): role is Role {
  return role in ROLE_PERMISSIONS;
}

export function permissionsForRoles(roles: readonly string[]): Set<Permission> {
  const permissions = new Set<Permission>();
  for (const role of roles) {
    if (isKnownRole(role)) {
      for (const permission of ROLE_PERMISSIONS[role]) permissions.add(permission);
    }
  }
  return permissions;
}

export function hasPermission(roles: readonly string[], permission: Permission): boolean {
  return permissionsForRoles(roles).has(permission);
}
