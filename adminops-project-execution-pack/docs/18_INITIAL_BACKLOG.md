# Initial Implementation Backlog

Priority: **P0** blocks the platform/pilot; **P1** required for pilot completeness; **P2** commercial hardening; **P3** later.

## Epic E00 — Discovery and design partners (P0)

- Interview administrators, branch managers, HR, employees and customers.
- Map current/future customer visit, attendance/leave and internal-request journeys.
- Define pilot baseline and success targets.
- Select two design partners.
- Produce clickable role prototypes.
- Confirm source-of-truth systems and integration constraints.

## Epic E01 — Monorepo, environments and delivery pipeline (P0)

- Create monorepo and application shells.
- Configure strict TypeScript, linting, testing and build cache.
- Provision development/staging infrastructure with IaC.
- Implement secrets, configuration and feature flags.
- Add OpenTelemetry instrumentation and baseline dashboards.
- Establish migration, preview and release pipelines.

## Epic E02 — Tenant and organization core (P0)

- Tenant provisioning and status.
- Organization/legal entity, branch, department, team and location.
- Locale, time zone, branding and plan metadata.
- Tenant context middleware and repository enforcement.
- Branch-delegated administration.
- Seed/demo tenant generation.

## Epic E03 — Identity and authorization (P0)

- OIDC identity provider integration.
- Invite/login/recovery/MFA flows.
- User, party, membership and role assignments.
- RBAC + ABAC authorization service.
- Field-level permission hooks.
- Joiner/mover/leaver lifecycle.
- Access-review and privileged support grants.
- Cross-tenant automated tests.

## Epic E04 — Design system and experience shells (P0)

- Accessible design tokens and components.
- Public, workforce, operations, admin and kiosk shells.
- Role navigation and route guards.
- Responsive/low-bandwidth patterns.
- Localization framework.
- Error, offline and empty states.

## Epic E05 — Forms and submissions (P0)

- Versioned form schema and renderer.
- Conditional logic, validation and calculated fields.
- Save/resume and draft.
- Attachments/camera capture.
- Submission permissions and status.
- Form templates and locale versions.
- Admin builder with preview/publish controls.

## Epic E06 — Workflow, tasks and approvals (P0)

- Versioned workflow definitions.
- State, rules, human tasks and approvals.
- Timers, SLA, escalation and delegation.
- Idempotent actions and external-call policy.
- Runtime history and admin diagnostics.
- Safe cancellation and compensation.
- Workflow builder for bounded patterns.

## Epic E07 — Notifications (P0)

- Provider adapter interface.
- Email and SMS first; WhatsApp when provider/commercial requirements are confirmed.
- Templates by tenant/channel/locale/version.
- Preferences, consent/opt-out and quiet hours.
- Durable delivery, retry, fallback and status.
- Provider health dashboard and cost metering.

## Epic E08 — Documents, audit and privacy (P0)

- Signed uploads/downloads and object-storage isolation.
- Classification, versions and malware scan.
- Document templates and policy acknowledgement.
- Audit event standard and tamper protection.
- Consent, retention and deletion rules.
- Data-subject request workflow foundation.
- Sensitive export controls.

## Epic E09 — Appointment and service catalogue (P1)

- Services, duration, requirements and eligibility.
- Branch/staff capability and operating calendar.
- Availability calculation and booking.
- Reschedule/cancel/waitlist/no-show.
- Calendar integration adapter.
- Appointment dashboard and events.

## Epic E10 — Queue and branch operations (P1)

- Queue definitions, priorities and stages.
- Remote/branch check-in.
- Ticket call, recall, transfer, skip and complete.
- Real-time updates and reconnect snapshots.
- Wait-range estimation.
- Branch staff status and manual override.
- Live-floor and branch-performance dashboards.

## Epic E11 — Customer portal and case status (P1)

- Public account/verification options.
- My visits and queue.
- Pre-visit forms/document readiness.
- Case/request status and messages.
- Feedback survey.
- Accessibility and assisted-service paths.

## Epic E12 — Workforce core (P1)

- Employee record, employment and organization placement.
- Employee directory.
- Clock-in/out and offline event capture.
- Attendance correction/approval.
- Leave types, balances and requests.
- Basic shift assignment/view.
- Employee and manager dashboards.

## Epic E13 — Internal service desk (P1)

- Request catalogue and dynamic forms.
- Case ownership, priority, SLA and status.
- Approval and fulfilment tasks.
- Department transfer with one history.
- Comments, attachments and notifications.
- Employee request and workflow/SLA dashboards.

## Epic E14 — Analytics and executive command centre (P1)

- Canonical event envelope and outbox.
- Metric dictionary and ownership.
- Operational read models.
- Sixteen MVP dashboards.
- Safe exports and scheduled reports.
- Executive cross-domain summary.

## Epic E15 — API and integration hub (P1)

- REST standards and API documentation.
- OAuth clients/scopes.
- Webhooks/signatures/retries/replay.
- Bulk import framework.
- External ID and sync status model.
- Connector SDK/pattern and monitoring.

## Epic E16 — SaaS control plane (P2)

- Tenant onboarding workflow.
- Plans, feature entitlements and quotas.
- Usage metering.
- Subscription/billing integration.
- Support cases and audited access.
- Deployment/data-region mapping.
- Global flags and provider configuration.

## Epic E17 — Pilot implementation and launch (P0/P1)

- Data mapping and migration dry run.
- Pilot tenant configuration.
- Administrator/employee/branch training.
- Baseline capture.
- Go-live checklist and hypercare.
- Daily metric/defect review.
- Outcome report and commercial decision.

## Dependency order

`E00 → E01/E02/E04 → E03/E05/E06/E07/E08 → E09/E10/E12/E13 → E11/E14/E15 → E16 → commercial launch`

## First 30 days

- Complete E00 discovery kickoff.
- Approve ADR-001 to ADR-003.
- Build technical spikes for tenant isolation, durable workflow, realtime queue and offline attendance.
- Create design system foundations and four journey prototypes.
- Define audit/event schemas.
- Agree pilot success measures and data-processing responsibilities.
