export type Role = "owner" | "admin" | "agent" | "member";

export type Permission =
  | "forms:create"
  | "forms:read"
  | "forms:update"
  | "forms:delete"
  | "forms:publish"
  | "forms:submit"
  | "workflows:create"
  | "workflows:read"
  | "workflows:update"
  | "workflows:delete"
  | "workflows:publish"
  | "workflows:execute"
  | "approvals:create"
  | "approvals:read"
  | "approvals:approve"
  | "approvals:reject"
  | "approvals:delegate"
  | "tickets:create"
  | "tickets:read"
  | "tickets:assign"
  | "tickets:status"
  | "tickets:comment"
  | "tickets:delete"
  | "users:manage"
  | "audit:read"
  | "security:manage";

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [
    "forms:create",
    "forms:read",
    "forms:update",
    "forms:delete",
    "forms:publish",
    "forms:submit",
    "workflows:create",
    "workflows:read",
    "workflows:update",
    "workflows:delete",
    "workflows:publish",
    "workflows:execute",
    "approvals:create",
    "approvals:read",
    "approvals:approve",
    "approvals:reject",
    "approvals:delegate",
    "tickets:create",
    "tickets:read",
    "tickets:assign",
    "tickets:status",
    "tickets:comment",
    "tickets:delete",
    "users:manage",
    "audit:read",
    "security:manage",
  ],
  admin: [
    "forms:create",
    "forms:read",
    "forms:update",
    "forms:delete",
    "forms:publish",
    "forms:submit",
    "workflows:create",
    "workflows:read",
    "workflows:update",
    "workflows:delete",
    "workflows:publish",
    "workflows:execute",
    "approvals:create",
    "approvals:read",
    "approvals:approve",
    "approvals:reject",
    "approvals:delegate",
    "tickets:create",
    "tickets:read",
    "tickets:assign",
    "tickets:status",
    "tickets:comment",
    "tickets:delete",
    "users:manage",
    "audit:read",
  ],
  agent: [
    "forms:read",
    "workflows:read",
    "workflows:execute",
    "approvals:read",
    "approvals:approve",
    "approvals:reject",
    "approvals:delegate",
    "tickets:create",
    "tickets:read",
    "tickets:assign",
    "tickets:status",
    "tickets:comment",
  ],
  member: [
    "forms:read",
    "forms:submit",
    "workflows:read",
    "approvals:read",
    "tickets:create",
    "tickets:read",
  ],
};

export interface SubjectContext {
  userId: string;
  tenantId: string;
  role: Role;
  permissions?: Permission[];
  department?: string;
}

export interface ResourceContext {
  tenantId: string;
  ownerId?: string;
  department?: string;
  isPublic?: boolean;
}

export class AuthorizationService {
  /**
   * Evaluates whether a subject has a specific permission.
   */
  public static hasPermission(subject: SubjectContext, permission: Permission): boolean {
    if (!subject || !subject.role) return false;
    const effectivePermissions = subject.permissions && subject.permissions.length > 0
      ? subject.permissions
      : ROLE_PERMISSIONS[subject.role] || [];
    return effectivePermissions.includes(permission);
  }

  /**
   * Evaluates Attribute-Based Access Control (ABAC) rules:
   * 1. Strict tenant match required (cross-tenant access DENIED unless resource is explicit public).
   * 2. Permission check or resource ownership match.
   */
  public static canAccessResource(
    subject: SubjectContext,
    resource: ResourceContext,
    requiredPermission?: Permission
  ): boolean {
    // Rule 1: Tenant isolation check
    if (resource.tenantId !== subject.tenantId && !resource.isPublic) {
      return false; // Strict tenant boundary breach prevention
    }

    // Rule 2: Owners & Admins can access all tenant resources
    if (subject.role === "owner" || subject.role === "admin") {
      return true;
    }

    // Rule 3: Resource Ownership check
    if (resource.ownerId && resource.ownerId === subject.userId) {
      return true;
    }

    // Rule 4: Required permission check
    if (requiredPermission) {
      return this.hasPermission(subject, requiredPermission);
    }

    return true;
  }
}
