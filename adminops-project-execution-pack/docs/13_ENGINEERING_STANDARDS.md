# Engineering Standards

## Proposed monorepo layout

```text
apps/
  public-web/
  workforce-app/
  operations-web/
  administration-web/
  kiosk-web/
  api/
  workers/
packages/
  design-system/
  api-contracts/
  event-contracts/
  authz/
  observability/
  configuration/
  testing/
  eslint-config/
  tsconfig/
modules/
  platform/
    tenancy/
    organization/
    forms/
    workflow/
    notifications/
    documents/
    audit/
    privacy/
    integrations/
    entitlements/
    ai-gateway/
  domains/
    branch-flow/
    workforce/
    internal-services/
    talent/
    procurement-resources/
    customer-revenue/
    governance-intelligence/
infrastructure/
  environments/
  modules/
docs/
```

## Coding rules

- TypeScript strict mode.
- Explicit domain types; avoid unvalidated `any` at boundaries.
- Validate all external input at runtime.
- Business rules live in domain/application services, not UI components or controllers.
- Server-side authorization before data access or mutation.
- No direct access to another domain’s write tables.
- All tenant-owned queries require tenant context.
- External calls use adapters, timeouts, retries and idempotency.
- Structured errors and correlation IDs.
- Sensitive values never logged.

## Branching and commits

- Short-lived branches or trunk-based delivery.
- Protected main branch.
- Conventional commit format preferred.
- Pull request links to issue/decision and includes test evidence.
- At least one engineering review; security/domain-owner review for sensitive changes.
- Small, reversible changes behind feature flags.

## Database migrations

- Forward-compatible expand/migrate/contract pattern.
- No destructive production migration in the same release that stops old code reading data.
- Backfill jobs are restartable, observable and tenant-aware.
- Migration performance tested on production-like volume.
- Rollback or safe-forward plan documented.

## API and event changes

- Schema-first contracts.
- Backward compatible additions by default.
- Breaking changes require versioning, migration guide and deprecation period.
- Consumers have contract tests.
- Events are immutable facts; corrections use new events, not silent history edits.

## Feature flags

- Flags have owner, purpose, environments and removal date.
- Tenant entitlements are separate from temporary release flags.
- Security controls cannot be disabled through ordinary tenant flags.
- Flag states are audited for high-impact features.

## Documentation

Update documentation when a change affects:

- User behavior or workflow.
- Permissions or sensitive data.
- API/event contract.
- Domain ownership.
- Deployment or operational procedure.
- Product scope or roadmap.
- AI model, prompt, data or tool behavior.

## Architecture decisions

Use an ADR for consequential choices. ADRs are immutable after acceptance; superseding decisions create a new ADR linking the old one.
