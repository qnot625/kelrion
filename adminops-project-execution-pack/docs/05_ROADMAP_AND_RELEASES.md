# Roadmap and Releases

## Release strategy

The roadmap uses vertical slices: every release must deliver a complete user outcome across frontend, workflow, data, permissions, audit, notifications and dashboards. Do not release isolated database screens that cannot complete a real process.

## Timeline

| Stage | Target | Main outcome |
|---|---|---|
| Discovery | Months 0–2 | Validated journeys, design partners, architecture and pilot measures |
| Foundation Alpha | Months 2–4 | Tenant, identity, forms, workflow, notifications, documents, audit and CI/CD |
| Pilot MVP | Months 4–7 | Customer visit, employee workday and internal request journeys |
| Live Pilot | Months 7–10 | Real branches/users, migrations, training, reliability and outcome validation |
| Commercial V1 | Months 10–12 | Repeatable onboarding, plans, support, kiosk, integrations and operational controls |
| Expansion Suite | Months 12–24 | Talent, procurement, vendors, assets, finance, contracts, CRM and communications |
| Enterprise Intelligence | Months 18–30 | AI assistant, forecasting, process mining, anomaly signals and advanced isolation |
| International Platform | Months 24–36 | Country packs, data regions, partner marketplace and governed agents |

## Release 0.1 — Foundation Alpha

### Included

- Organization/tenant structure
- Identity, roles, permissions and MFA
- Design system and application shells
- Forms and submissions
- Workflow/approval runtime
- Notification adapters
- Documents and audit
- Feature flags and entitlement checks
- Observability and deployment pipelines

### Demo

An administrator configures a leave-request form and approval workflow without code, assigns it to a branch, invites users and audits the completed decision.

## Release 0.5 — Pilot MVP

### Branch & customer

- Service catalogue
- Appointment booking
- Pre-visit forms
- Remote/branch check-in
- Live queue
- Notifications
- Customer case/status

### Workforce

- Employee records
- Clock-in/out
- Attendance exceptions
- Leave
- Basic shift view

### Internal operations

- Request catalogue
- Approvals
- Service desk/SLA
- Documents and policies

### Platform

- Operational dashboards
- APIs/webhooks needed for pilot
- Privacy controls and audit export
- Basic tenant support operations

## Release 1.0 — Commercial V1

- Multi-tenant provisioning and plan entitlements
- Kiosk and digital signage
- Branch/service routing
- Visitor/security check-in
- Better shift scheduling
- Onboarding/offboarding
- Facilities requests
- Knowledge base
- Feedback analytics
- Implementation templates
- Support, status and incident processes
- Security/privacy evidence package

## Release 1.5 — Operations Expansion

- Applicant tracking
- Skills assessments
- Performance/goals
- Meetings and action tracking
- Workboards/projects
- Procurement and vendors
- Assets and inventory
- Expenses/travel
- CRM and complaint management
- Contracts and billing/payments
- Omnichannel communications

## Release 2.0 — Enterprise Intelligence

- Enterprise search and AI assistant
- Forecasting/capacity optimization
- Process mining
- Fraud/anomaly signals
- Resilience/continuity suite
- Advanced tenant isolation
- White-label/partner administration
- Industry/localization packs

## Release 3.0 — Governed Autonomous Operations

- Tool-restricted AI agents
- Approval thresholds by risk and action type
- Agent evaluation and simulation
- Marketplace tools/connectors
- Regional deployments and country policy packs

## Module wave summary

| Wave | Number of modules | Intent |
|---|---:|---|
| Pilot MVP | 20 | Prove core platform and three north-star journeys. |
| Commercial V1 | 7 | Complete branch operations and repeatable customer onboarding. |
| Expansion | 16 | Broaden administrative coverage and revenue per customer. |
| Advanced | 7 | Add high-risk/high-data intelligence only after foundations mature. |

The module catalogue records each module’s delivery wave. A module marked “MVP” in the original strategic report may still be delivered partially; the first commercial product should expose only the portion needed for the validated journey.

## Release gates

No release advances without:

- Product acceptance and telemetry.
- Automated functional and tenant-isolation tests.
- Security/privacy review.
- Migration and rollback plan.
- Operational dashboards and alerts.
- Support documentation and runbooks.
- Accessibility and performance checks.
- Pilot/customer communication plan.
