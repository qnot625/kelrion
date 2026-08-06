# Risk Register

| ID | Risk | Likelihood | Impact | Primary mitigation | Owner |
|---|---|---|---|---|---|
| R-01 | Fifty-module scope overwhelms delivery | High | Critical | Three north-star journeys, release gates, explicit exclusions and change budget | Product Lead |
| R-02 | Separate apps/backends create duplication | Medium | High | Nine experiences on five frontends and one modular backend | CTO |
| R-03 | Cross-tenant data exposure | Medium | Critical | Trusted tenant context, RLS/authorization, negative tests, support-access controls | Security/CTO |
| R-04 | Customer-specific forks destroy SaaS model | High | High | Configuration-first policy, extension contracts and architecture review | Product/CTO |
| R-05 | Poor connectivity breaks attendance/branch use | High | High | Low-bandwidth UX, controlled offline capture, reconciliation and branch runbooks | Product/Engineering |
| R-06 | Messaging/payment provider failure disrupts workflows | High | Medium | Adapters, durable retries, fallback, circuit breakers and local transaction independence | Integration/SRE |
| R-07 | Workflow engine becomes unsafe or unmanageable | Medium | High | Versioned definitions, validation, bounded actions, idempotency and admin guardrails | Platform Lead |
| R-08 | AI interview feature creates discrimination/privacy risk | Medium | Critical | Delay scoring, prohibit emotion inference, job-related evidence, human review and evaluation | AI/Privacy/Product |
| R-09 | Enterprise sales cycles delay learning/revenue | High | High | Pilot with faster-moving multi-branch sectors while remaining enterprise-ready | Commercial Lead |
| R-10 | Implementation effort is underestimated | High | High | Treat migration/configuration/training as a product and paid service | Implementation Lead |
| R-11 | Premature microservices slow development | Medium | High | Modular monolith and evidence-based extraction triggers | CTO |
| R-12 | Weak event/data definitions make dashboards unreliable | Medium | High | Canonical events, metric ownership, data contracts and reconciliation | Data Lead |
| R-13 | Biometric/location attendance causes worker distrust | Medium | High | Optional proportionate verification, notices, alternatives and no continuous tracking | Product/Privacy |
| R-14 | Security/compliance added too late | Medium | Critical | Security/privacy workstream from discovery; ASVS and NDPA controls in release gates | Security/Privacy |
| R-15 | Operational support cannot handle customer growth | Medium | High | Tenant-aware telemetry, runbooks, controlled support tooling and partner model | Operations Lead |
| R-16 | Noisy neighbour affects other tenants | Medium | High | Quotas, throttling, tenant metrics and enhanced/dedicated isolation tiers | SRE/Architecture |
| R-17 | Data migration errors damage trust | Medium | High | Dry runs, validation reports, reconciliation, sign-off and rollback | Implementation/Data |
| R-18 | Offline synchronization produces fraud/duplicates | Medium | High | Event IDs, idempotency, device metadata, conflict workflow and anomaly rules | Workforce/Branch Lead |
| R-19 | Pricing does not match cost drivers | Medium | High | Meter variable providers/AI/storage and separate implementation fees | Commercial/Finance |
| R-20 | Product appears generic and loses differentiation | Medium | High | Nigeria-first operational resilience, strong packs, industry templates and outcome selling | Product/Marketing |

## Risk review process

- Review monthly and before major release gates.
- Record trigger indicators and active mitigation tasks.
- Critical risks require an executive owner and tested contingency.
- Accepted risks have a written expiry/review date.
- Product metrics and incidents update likelihood/impact assessments.
