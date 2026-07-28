export type TenantStatus = "provisioning" | "active" | "suspended";

export interface Tenant {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly status: TenantStatus;
  readonly createdAt: Date;
}

export interface CreateTenantInput {
  name: string;
  slug: string;
}

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function assertValidSlug(slug: string): void {
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(
      `Invalid tenant slug "${slug}": must be lowercase alphanumeric with single hyphens`,
    );
  }
}
