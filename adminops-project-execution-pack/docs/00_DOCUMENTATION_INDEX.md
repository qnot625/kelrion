# Documentation Index

This folder is the implementation source of truth for AdminOps OS. Product decisions should be reflected here before they are converted into engineering work.

| Document | Purpose |
|---|---|
| [01_PRODUCT_VISION_AND_SCOPE.md](01_PRODUCT_VISION_AND_SCOPE.md) | Product category, principles, solution packs, scope boundaries and success definition. |
| [02_APPS_AND_DASHBOARDS.md](02_APPS_AND_DASHBOARDS.md) | Nine user experiences, five frontend deployments, dashboards, navigation and permissions. |
| [03_PRODUCT_REQUIREMENTS.md](03_PRODUCT_REQUIREMENTS.md) | Functional and non-functional requirements, roles, journeys and acceptance criteria. |
| [04_IMPLEMENTATION_PLAN.md](04_IMPLEMENTATION_PLAN.md) | Phases, workstreams, milestones, staffing, dependencies, governance and exit gates. |
| [05_ROADMAP_AND_RELEASES.md](05_ROADMAP_AND_RELEASES.md) | Release sequence from discovery through international enterprise scale. |
| [06_SYSTEM_ARCHITECTURE.md](06_SYSTEM_ARCHITECTURE.md) | Architecture, services, domain boundaries, data, real-time, offline and evolution strategy. |
| [07_DATA_MODEL.md](07_DATA_MODEL.md) | Canonical objects, relationships, tenant rules, lifecycle and event model. |
| [08_API_AND_INTEGRATIONS.md](08_API_AND_INTEGRATIONS.md) | API conventions, webhooks, events, connectors and provider abstraction. |
| [09_SECURITY_PRIVACY_COMPLIANCE.md](09_SECURITY_PRIVACY_COMPLIANCE.md) | Security baseline, privacy engineering, tenant isolation and compliance roadmap. |
| [10_AI_GOVERNANCE.md](10_AI_GOVERNANCE.md) | AI authority levels, prohibited uses, evaluation, recruitment safeguards and audit. |
| [11_TESTING_AND_QUALITY.md](11_TESTING_AND_QUALITY.md) | Test layers, quality gates, performance, accessibility, security and AI evaluation. |
| [12_DEPLOYMENT_AND_OPERATIONS.md](12_DEPLOYMENT_AND_OPERATIONS.md) | Environments, CI/CD, SLOs, monitoring, incident response, backups and DR. |
| [13_ENGINEERING_STANDARDS.md](13_ENGINEERING_STANDARDS.md) | Repository layout, coding, reviews, migrations, feature flags and documentation. |
| [14_TEAM_AND_GOVERNANCE.md](14_TEAM_AND_GOVERNANCE.md) | Team structure, decision rights, delivery cadence and RACI. |
| [15_BUSINESS_MODEL_AND_GTM.md](15_BUSINESS_MODEL_AND_GTM.md) | Packaging, onboarding, pilot design, implementation services and metrics. |
| [16_RISK_REGISTER.md](16_RISK_REGISTER.md) | Major product, engineering, compliance, commercial and operational risks. |
| [17_DEFINITION_OF_DONE.md](17_DEFINITION_OF_DONE.md) | Definition of ready/done and release gates. |
| [18_INITIAL_BACKLOG.md](18_INITIAL_BACKLOG.md) | Initial epics, priorities, dependencies and launch checklist. |
| [19_SOLUTION_MODULE_CATALOG.md](19_SOLUTION_MODULE_CATALOG.md) | Detailed catalogue of all 50 modules from the product blueprint. |
| [20_REFERENCES.md](20_REFERENCES.md) | Official technical, security, AI and Nigerian privacy references. |

## Decision records

Architecture decisions are stored in [`adr/`](adr/README.md). A decision that changes tenancy, security boundaries, application count, data ownership, workflow behavior or deployment model must have an ADR.

## Document ownership

| Area | Accountable owner |
|---|---|
| Product scope and roadmap | Product Lead / CEO |
| Architecture and data model | CTO / Principal Engineer |
| Security and privacy | Security Lead + Privacy/Legal Adviser |
| Delivery plan and backlog | Delivery Lead / Product Manager |
| Operations and reliability | Platform/SRE Lead |
| AI governance | AI Product Lead + Risk/Compliance |
| Business model and implementation | Commercial/Implementation Lead |

## Change rule

A feature is not approved merely because it appears in the 50-module catalogue. It must have:

1. A named customer problem and measurable outcome.
2. A release assignment and owner.
3. Clear dependency and data ownership.
4. Security/privacy classification.
5. Acceptance criteria and telemetry.
6. A reason it belongs in the shared platform rather than a customer-specific fork.
