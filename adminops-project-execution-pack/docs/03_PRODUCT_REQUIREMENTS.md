# Product Requirements

## Purpose

Define the cross-platform requirements that all modules must satisfy. Individual module PRDs may add detail but cannot weaken these requirements.

## User roles

- Customer / visitor
- Candidate
- Employee / contractor
- Supervisor / manager
- Branch operator / reception / service staff
- HR administrator
- Department fulfiller: IT, finance, facilities, legal, procurement
- Compliance / privacy / internal audit
- Tenant administrator
- Executive
- Implementation partner / developer
- Platform support operator
- Platform security/SRE operator
- Platform super administrator

## Functional requirements

### Organization and tenancy

- Support organizations, legal entities, subsidiaries, branches, departments, teams, locations and cost centres.
- Every business record must belong to a tenant; where relevant, it must also belong to an organization unit and location.
- Support tenant plans, feature entitlements, quotas, branding, locale and data-region metadata.
- Permit centralized organizations and delegated branch administration.

### Identity and access

- Support passwordless/passkey or password + MFA options through a standards-based identity provider.
- Support employee, customer, candidate, visitor, vendor, partner and service identities.
- Enforce role- and attribute-based authorization server-side.
- Support joiner/mover/leaver automation, delegated access and periodic access review.
- Record privileged and support access with purpose and duration.

### Forms and workflow

- Build versioned forms with conditional fields, validation, attachments, signatures and save/resume.
- Build versioned workflows with tasks, approvals, rules, timers, escalation, delegation and exception handling.
- Preserve the definition version used by each running workflow.
- Permit safe retries without duplicate actions.
- Provide full lifecycle history to authorized users.

### Customer flow

- Configure services, service duration, eligibility, required documents, branches, staff skills and capacity.
- Book, reschedule and cancel appointments.
- Support walk-ins, remote check-in, priority rules, transfers, recalls and no-shows.
- Show honest waiting-time ranges and branch/service availability.
- Continue basic branch operation during temporary connectivity problems.

### Workforce

- Maintain employee records, employment status, organization placement and manager relationships.
- Record clock-in/out events and corrections with evidence and approval.
- Support shifts, leave, availability, holidays and basic attendance calculations.
- Export payroll-ready records without implementing country payroll in the first release.

### Internal operations

- Provide request catalogues, case ownership, priority, SLA, tasks, approvals, communications and closure.
- Support service departments and cross-department transfers without creating disconnected tickets.
- Manage documents, policies, acknowledgement and retention.
- Support facilities requests and booking as a configurable service type.

### Communication

- Send email, SMS, WhatsApp, push and in-app messages through provider adapters.
- Store templates by locale, channel, tenant and version.
- Record delivery attempts, provider IDs, failures, opt-outs and retries.
- Apply quiet hours, channel preferences and lawful communication rules.

### Reporting and analytics

- Emit consistent operational events from every module.
- Provide role-specific dashboards and export controls.
- Allow tenant-specific KPI definitions without corrupting standard metrics.
- Separate operational reporting from analytical workloads as scale grows.

### Integration

- Provide versioned REST APIs, webhooks, bulk import/export and identity federation.
- Use idempotency keys for create/action endpoints where retries can duplicate work.
- Allow provider adapters for messaging, payments, calendars, video, maps, e-signature, payroll and accounting.
- Store external identifiers and synchronization status without making external systems the hidden database of record.

### Privacy and governance

- Capture purpose, lawful basis/consent where relevant, retention policy and data classification.
- Support access, correction, export, restriction and deletion workflows subject to legal obligations.
- Audit viewing, changing, exporting and deleting sensitive data.
- Keep AI actions and recommendations explainable, reviewable and attributable.

## Non-functional requirements

| Area | Requirement |
|---|---|
| Availability | Define tiered SLOs; core customer/branch operation targets at least 99.9% after commercial launch. |
| Performance | Common interactive operations should target p95 under 500 ms at the API layer, excluding third-party calls. |
| Scalability | Scale by tenant, region, branch peak and provider load; protect against noisy neighbours. |
| Security | Meet the project security baseline and pass tenant-isolation, authorization and secure-file tests. |
| Privacy | Data minimization, purpose limitation, retention and subject-right workflows are product capabilities. |
| Accessibility | Target WCAG 2.2 AA for supported web experiences. |
| Localization | Translatable UI, locale-aware dates/numbers, time zones, currencies, phone formats and templates. |
| Offline resilience | Attendance and branch check-in support controlled offline capture and reconciliation. |
| Observability | Traces, metrics, logs, audit events and tenant-aware operational dashboards. |
| Maintainability | Modular domains, documented APIs, automated tests, migration discipline and ADRs. |
| Portability | Avoid unnecessary cloud lock-in in the domain layer; use provider interfaces for external services. |
| Recoverability | Automated backups, tested restore, documented RPO/RTO and dependency failure procedures. |

## Cross-module acceptance criteria

A module cannot be released unless it:

1. Enforces tenant context on every data access path.
2. Uses shared identity, authorization, workflow, notifications, documents and audit services where applicable.
3. Emits documented domain and analytics events.
4. Handles retries and duplicate messages safely.
5. Has role and field-level permission tests.
6. Defines retention, export and deletion behavior.
7. Has operational dashboards, alerts and support runbooks.
8. Meets accessibility, performance and localization requirements.
9. Has a migration and rollback plan.
10. Has measurable product-success telemetry.
