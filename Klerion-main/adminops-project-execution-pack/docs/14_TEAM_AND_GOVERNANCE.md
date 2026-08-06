# Team and Delivery Governance

## Operating model

Use stable cross-functional teams aligned to customer outcomes, with shared platform specialists. Avoid assigning one engineer per module; modules depend on common platform capabilities and end-to-end journeys.

## Suggested team topology

### Platform team

Tenant, identity, authorization, forms, workflow, notifications, documents, audit, integrations, entitlements and developer tooling.

### Customer & branch squad

Customer portal, appointments, queue, check-in, branch console, status and feedback.

### Workforce & internal operations squad

Employee app, employee records, attendance, leave, requests, approvals, service desk and knowledge.

### Data, intelligence and trust group

Analytics/event model, dashboards, security, privacy, AI governance, reliability and compliance. Some members are embedded in squads.

### Implementation and customer success

Process mapping, configuration, migration, training, adoption, support and value measurement.

## Decision rights

| Decision | Accountable | Required consultation |
|---|---|---|
| Product scope and release priority | Product Lead | Engineering, design, implementation, commercial |
| Architecture and domain boundaries | CTO/Principal Engineer | Security, data, affected leads |
| Security/privacy risk acceptance | Security/Privacy accountable owner | Product, legal, engineering, executive sponsor |
| AI authority/use-case approval | AI governance owner | Product, security, privacy, domain expert |
| Production release | Engineering/Delivery Lead | Product, QA, SRE, security as required |
| Customer-specific customization | Product + Architecture | Commercial, implementation, domain owner |
| Incident command | On-call incident commander | SRE, security, product, communications/legal as required |

## RACI for MVP

| Deliverable | Product | Design | Engineering | Security/Privacy | Implementation | Executive |
|---|---|---|---|---|---|---|
| Discovery and process maps | A/R | R | C | C | R | I |
| MVP scope | A/R | C | C | C | C | I |
| Architecture | C | I | A/R | C | I | I |
| Threat/privacy model | C | C | R | A/R | C | I |
| Pilot setup | A | R | R | C | R | I |
| Release acceptance | A | C | R | C | C | I |
| Risk acceptance | C | I | C | R | I | A |
| Commercial launch | R | C | R | C | R | A |

## Meeting cadence

- Daily squad sync, limited to blockers and coordination.
- Weekly product/design/engineering triad.
- Weekly architecture/platform dependency review during foundation build.
- Fortnightly design-partner review.
- Monthly security/privacy and risk review.
- Monthly executive steering: outcomes, scope, risks, runway and decisions.
- Quarterly roadmap/architecture review.

## Product intake

Requests enter through one backlog and are classified as:

- Defect
- Compliance/security obligation
- Product capability
- Tenant configuration/template
- Integration
- Customer-specific request
- Operational/technical debt

A customer request becomes shared product only when it fits the target market, can be permissioned/configured safely and does not create an unmaintainable fork.

## Metrics for delivery governance

- Lead time from approved story to production.
- Deployment frequency and change-failure rate.
- Escaped defects and severity.
- Security remediation time.
- Pilot/adoption metrics.
- Support contacts per active tenant.
- Time to configure a new standard tenant.
- Percentage of requests solved through configuration versus custom code.
