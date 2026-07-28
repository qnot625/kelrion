# ADR-002: Use tiered multitenancy and isolation

- **Status:** Accepted
- **Date:** 2026-07-28
- **Owners:** CTO, Security Lead

## Context

SMEs need cost-efficient shared SaaS while banks and regulated enterprises may require stronger data, key, database or deployment isolation. Building a separate product for each tier would create forks.

## Decision

Use a consistent multi-tenant application model with three infrastructure tiers:

1. Standard shared deployment and shared database with tenant-scoped rows and row-level security.
2. Enhanced isolation using dedicated database/schema, storage or encryption resources for selected tenants.
3. Dedicated deployment stamp/data region managed through the same control plane.

## Mandatory rules

- Tenant context comes from trusted identity/routing.
- All data stores, caches, files, search and events are tenant-scoped.
- Cross-tenant tests run continuously.
- The control plane provisions and monitors every tier.
- Product/API behavior remains consistent across tiers.

## Consequences

The architecture carries tenant metadata everywhere and requires automated provisioning/migration, but it preserves SaaS economics while supporting enterprise requirements.
