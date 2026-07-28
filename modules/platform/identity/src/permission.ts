export type Role = "owner" | "staff" | "member";

export type Permission =
  | "appointments:book"
  | "appointments:manage"
  | "appointments:view"
  | "tenant:manage";

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: ["appointments:book", "appointments:manage", "appointments:view", "tenant:manage"],
  staff: ["appointments:book", "appointments:manage", "appointments:view"],
  member: ["appointments:book"],
};

function isKnownRole(role: string): role is Role {
  return role in ROLE_PERMISSIONS;
}

export function permissionsForRoles(roles: readonly string[]): Set<Permission> {
  const permissions = new Set<Permission>();
  for (const role of roles) {
    if (isKnownRole(role)) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        permissions.add(permission);
      }
    }
  }
  return permissions;
}

export function hasPermission(roles: readonly string[], permission: Permission): boolean {
  return permissionsForRoles(roles).has(permission);
}
