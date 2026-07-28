# Apps and Dashboards

## Required numbers

| Item | Recommended count | Meaning |
|---|---:|---|
| Role-based user experiences | 9 | Distinct navigation, permissions and workflows for major user groups. |
| Deployable frontend applications | 5 | Codebases/deployments to maintain initially. |
| Backend platforms | 1 | Shared modular backend, not one backend per module. |
| Core platform services | 13 | Reusable capabilities supporting all solution packs. |
| MVP dashboards | 16 | Minimum operational views for customers, employees, managers, tenants and platform operators. |
| Mature dashboard views | 28+ | Added with talent, procurement, finance, AI and advanced governance modules. |

## Nine role-based experiences


| # | User experience | Primary users | Main responsibility | Initial delivery |
|---:|---|---|---|---|
| 1 | Customer Portal & PWA | Customers, visitors, members | Appointments, queues, forms, cases, documents, payments, feedback | MVP |
| 2 | Candidate & Interview Portal | Applicants, assessors | Applications, scheduling, assessments, interviews, consent, status | Expansion |
| 3 | Employee App | Employees, contractors | Clock-in/out, shifts, leave, requests, tasks, knowledge, profile | MVP |
| 4 | Manager & Executive Workspace | Supervisors, managers, executives | Approvals, team capacity, SLA, performance, analytics, command centre | MVP |
| 5 | Branch Operations Console | Reception, tellers, service staff, security | Walk-ins, live queues, transfers, visitors, branch readiness | MVP |
| 6 | Kiosk & Digital Signage | Walk-in customers and visitors | Check-in, ticketing, wayfinding, queue display, accessibility | Commercial V1 |
| 7 | Organization Admin Studio | HR, operations, IT, compliance, tenant administrators | Organization setup, roles, workflows, forms, policies, reports, subscriptions | MVP |
| 8 | Platform Super Admin Control Plane | SaaS operations, support, security, finance | Tenants, plans, usage, incidents, provider health, support access, abuse controls | MVP |
| 9 | Partner & Developer Portal | Implementers, resellers, developers | APIs, webhooks, connectors, sandbox tenants, marketplace and certifications | Expansion |


## Five deployable frontend applications


| Deployable frontend | Experiences included | Recommended technology direction |
|---|---|---|
| Public Experience PWA | Customer Portal + Candidate Portal | Next.js/React/TypeScript PWA, responsive and low-bandwidth-first |
| Workforce App | Employee App | Expo/React Native with web support; offline attendance and request drafts |
| Operations Web | Manager/Executive Workspace + Branch Console | Next.js/React/TypeScript with real-time updates |
| Administration Web | Organization Admin + Platform Admin + Partner Portal | Next.js/React/TypeScript with strict permission boundaries and separate routes/deployments where required |
| Kiosk/Signage App | Kiosk + queue displays | Locked-down PWA first; managed Android/native shell only where device control requires it |


### Why experiences outnumber codebases

A “user experience” is a role-specific product surface. A “deployable application” is a maintained codebase and release unit. Combining related experiences reduces duplication while route-level authorization, separate navigation and deployment controls preserve security boundaries.

Do not combine tenant administration and SaaS super-administration merely through a hidden menu. Super-admin functions must use separate permissions, stronger authentication, just-in-time support access, approval and complete audit logging; a separate deployment may be introduced for regulated enterprise operation.

## MVP dashboard catalogue


| # | Dashboard | Audience | Minimum information |
|---:|---|---|---|
| 1 | Customer Journey | Customer | Upcoming visit, queue position/range, required documents, status and actions |
| 2 | Customer Cases | Customer | Open requests, SLA/status, messages, documents and resolution history |
| 3 | My Workday | Employee | Clock status, shift, attendance exceptions, leave balance and today’s tasks |
| 4 | My Requests | Employee | Submitted requests, approvals, service tickets and required actions |
| 5 | Team Operations | Manager | Presence, shift coverage, workload, absences, exceptions and service demand |
| 6 | Approval Centre | Manager | Pending approvals, ageing, policy warnings, delegation and escalation |
| 7 | Workforce Coverage | Manager/HR | Staffing against demand, lateness, overtime risk and schedule gaps |
| 8 | Live Branch Floor | Branch staff | Active queue, waiting ranges, counters, transfers, no-shows and priority tickets |
| 9 | Branch Service Performance | Branch manager | Wait time, service time, abandonment, throughput, SLA and customer feedback |
| 10 | Organization Operations | Tenant admin | Adoption, active users, module health, branches, workflow volume and exceptions |
| 11 | Workflow & SLA | Operations admin | Request volume, cycle time, bottlenecks, breaches, rework and escalation |
| 12 | Workforce Administration | HR admin | Headcount, attendance corrections, leave, shifts, onboarding and records completeness |
| 13 | Compliance & Audit | Compliance/security | Privileged activity, access reviews, consent, retention, exports and incidents |
| 14 | Executive Command Centre | Executives | Customer flow, workforce, internal operations, risk, trends and outcomes |
| 15 | Tenant Operations | Platform admin | Tenant provisioning, entitlements, usage, support cases and billing state |
| 16 | Platform Reliability & Security | Platform/SRE/security | Availability, latency, errors, queues, provider health, suspicious activity and recovery status |


## Mature dashboard additions

| Dashboard | Primary audience | Release |
|---|---|---|
| Candidate Pipeline | Recruiters/hiring managers | Expansion |
| Interview Quality & Fairness | Recruitment/compliance | Advanced |
| Performance & Goals | Employees/managers/HR | Expansion |
| Procurement Control | Procurement/finance | Expansion |
| Vendor Risk & Performance | Procurement/risk | Expansion |
| Asset & Inventory | IT/facilities/finance | Expansion |
| Expense & Travel | Finance/managers | Expansion |
| CRM & Relationship Health | Sales/service | Expansion |
| Revenue, Invoice & Subscription | Finance/commercial | Expansion |
| Contact Centre Operations | Service supervisors | Expansion |
| Knowledge Health | Knowledge owners/compliance | Expansion |
| Process Mining | Operations excellence | Advanced |
| AI Quality & Cost | AI operations/risk | Advanced |
| Fraud & Anomaly Review | Security/audit/finance | Advanced |
| Resilience & Incident Command | Executives/SRE/security | Expansion |

## Navigation by experience

### Customer Portal

- Home
- Book a service
- Join/check a queue
- My visits
- My requests/cases
- Forms and documents
- Messages
- Payments, where enabled
- Feedback
- Privacy and consent

### Employee App

- Today / My Workday
- Clock in/out
- Schedule
- Leave and availability
- Requests and approvals
- Tasks
- Service desk
- Documents and policies
- Directory
- Profile and security

### Manager & Executive Workspace

- Team operations
- Approvals
- Workforce coverage
- Service performance
- Workboard/actions
- Exceptions and escalations
- Reports
- Executive command centre, role-controlled

### Branch Operations Console

- Live queue
- Appointments/check-ins
- Walk-ins
- Counter/staff status
- Ticket transfer and recall
- Visitor/security check-in
- Branch readiness and incidents
- Daily performance

### Organization Admin Studio

- Organization and branches
- Users, roles and access
- Services and catalogues
- Forms
- Workflows and approvals
- Notifications and templates
- Documents and retention
- Integrations
- Dashboards/reports
- Plans, usage and billing
- Audit, privacy and security

### Platform Super Admin

- Tenant lifecycle
- Plans and entitlements
- Provider health and quotas
- Usage and billing operations
- Support cases
- Controlled support access
- Security/abuse monitoring
- Global feature flags
- Deployment/data-region mapping
- Platform incidents and status

## Permission model

Use **RBAC plus ABAC**:

- RBAC gives baseline roles such as employee, manager, branch operator, HR admin and tenant admin.
- ABAC evaluates tenant, branch, department, ownership, record sensitivity, employment relationship, region, purpose and time.
- Every request carries tenant context.
- Sensitive fields have separate permissions from the record itself.
- Delegation and support impersonation are explicit, time-limited and audited.

## Dashboard design rules

1. Every metric has an owner, definition, data source and refresh expectation.
2. Dashboards show actions and exceptions, not decorative charts only.
3. Users see only authorized aggregates; small-group privacy thresholds apply where needed.
4. Operational dashboards are near-real-time; executive trends may be warehouse-backed.
5. Every KPI links to underlying cases/events where the user has permission.
6. AI-generated summaries identify their data period and permit verification.
