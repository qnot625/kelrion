# Deployment and Operations

## Environments

| Environment | Purpose | Data policy |
|---|---|---|
| Local | Developer work | Synthetic data only |
| Preview | Pull-request validation | Synthetic/seeded data |
| Development | Shared integration | Synthetic data; controlled provider sandboxes |
| Staging | Production-like release verification | Masked/synthetic data; no uncontrolled production copy |
| Pilot | Isolated live pilot or production tier | Real data under pilot controls and support process |
| Production | Commercial service | Full controls, monitoring, backups and change management |

## CI/CD pipeline

1. Validate formatting, type checking and unit tests.
2. Build immutable artifacts.
3. Run SAST, dependency, secret and container scans.
4. Start preview environment and run integration/contract tests.
5. Review database migration plan.
6. Deploy to staging through infrastructure as code.
7. Run E2E, tenant-isolation and smoke tests.
8. Require approval for production promotion.
9. Deploy progressively using feature flags/canary where practical.
10. Verify telemetry and rollback automatically on critical health failure.

## Service-level objectives

Initial commercial targets should be formalized after pilot data:

- Core API availability: 99.9% monthly target.
- Queue/branch realtime update freshness: defined by branch operating need, typically seconds.
- Notification delivery: measured by accepted/delivered status and provider-specific targets.
- Recovery point objective: based on data class; transactional data should target minutes, not hours.
- Recovery time objective: tiered by customer-facing criticality.
- Support response: plan-based severity matrix.

Do not promise SLOs before architecture, provider dependencies and support staffing can meet them.

## Observability

Use correlated traces, metrics and logs. Required dimensions include service, environment, deployment, tenant pseudonymous ID, region, operation, outcome and correlation ID. Avoid personal/sensitive values in logs.

### Required dashboards

- API health and latency.
- Database/cache/broker/storage health.
- Queue realtime connections and lag.
- Workflow backlog, stuck instances and timer lag.
- Notification provider acceptance/failure/fallback.
- Webhook success and retry backlog.
- Tenant error/latency/usage outliers.
- Security signals and privileged access.
- Backup, restore and replication status.
- AI provider latency, errors, cost and policy blocks.

## Incident severity

| Severity | Example | Response |
|---|---|---|
| SEV-1 | Cross-tenant exposure, broad outage, unrecoverable queue/attendance corruption | Immediate incident command, containment, executive/legal/privacy involvement |
| SEV-2 | Major module unavailable for many tenants/branches, significant provider failure | Rapid response, workaround, frequent customer communication |
| SEV-3 | Degraded functionality or limited tenant impact | Normal on-call escalation and scheduled updates |
| SEV-4 | Minor defect without material operational impact | Backlog and release planning |

## Backup and recovery

- Automated encrypted database backups and point-in-time recovery.
- Object-storage versioning/lifecycle where appropriate.
- Configuration and infrastructure stored as code.
- Restore tests on a defined schedule.
- Tenant-level export/recovery procedure where architecture permits.
- Documented dependency recovery and provider substitution.
- Disaster-recovery exercise before enterprise commitments.

## Provider failure strategy

- Timeouts and circuit breakers.
- Durable retry with idempotency.
- Message fallback channels where lawful/configured.
- Local success not rolled back merely because a notification fails.
- Branch continuity procedures for internet or platform outage.
- Status page and tenant-specific impact communication.

## Support operations

- Support cases linked to tenant and incident.
- Read-only diagnostics by default.
- Elevated access requires approved, time-limited grant and reason.
- Customer-visible record of support access where contract requires it.
- Runbooks for common failures and data corrections.
- Product defects produce regression tests and knowledge updates.
