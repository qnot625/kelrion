# Security, Privacy and Compliance

## Security objectives

- Prevent cross-tenant access.
- Protect sensitive customer, employee, applicant, visitor and financial information.
- Make privileged actions attributable and reviewable.
- Continue essential operation during provider or infrastructure failure.
- Produce evidence suitable for enterprise security review.

## Baseline control areas

### Identity and access

- MFA for administrators and privileged users.
- Passkeys/passwordless support where the identity provider permits.
- Secure session lifetime, rotation and revocation.
- Least privilege, scoped roles and field-level permissions.
- Just-in-time/time-limited platform support access.
- Access reviews and joiner/mover/leaver automation.

### Tenant isolation

- Trusted tenant resolution.
- Tenant-scoped repositories and database policies.
- Tenant-aware caches, files, search and events.
- Cross-tenant negative tests in CI.
- Dedicated tiers for customers with stronger contractual/regulatory needs.

### Application security

- Threat modelling for new domains and high-risk workflows.
- OWASP ASVS-based requirements and verification.
- Code review, dependency scanning, secret scanning and SAST.
- DAST and penetration testing before commercial launch and major changes.
- Safe file uploads: type validation, size limits, malware scanning and isolated processing.
- Rate limiting, anti-automation and abuse detection.
- Output encoding, input validation and secure defaults.

### Data security

- Encryption in transit and at rest.
- Managed key and secret rotation.
- Restricted production access.
- No production data in development/test unless formally controlled and minimized.
- Export controls, watermarking or approval for sensitive bulk exports where appropriate.
- Tamper-evident audit storage and protected retention.

### Secure operations

- Environment separation.
- Infrastructure as code and change review.
- Centralized observability and security alerts.
- Vulnerability management with severity-based remediation targets.
- Incident response, forensics readiness and customer notification process.
- Tested backups, restore and disaster recovery.

## Privacy engineering

### Data inventory

Every field/record class must have:

- Owner and domain.
- Data subject category.
- Purpose.
- Lawful basis or consent requirement.
- Sensitivity/classification.
- Retention trigger and duration.
- Access roles.
- Export/deletion rules.
- Storage region and processor/provider.

### Product capabilities

- Point-of-collection privacy notices.
- Consent and withdrawal records where consent is appropriate.
- Purpose-specific communication preferences.
- Data-subject access, correction, export, restriction and deletion workflows.
- Legal hold and retention exceptions.
- Configurable regional retention and residency.
- Privacy-aware logs that avoid sensitive payloads.
- Data minimization in analytics and AI prompts.

## Nigeria launch compliance work

The launch programme must be reviewed against the **Nigeria Data Protection Act 2023** and current Nigeria Data Protection Commission guidance. Product engineering should include data mapping, notices, processor contracts, retention, rights workflows, security controls, breach response and cross-border-transfer governance. Legal advice is required for sector-specific banking, employment, payments, communications and identity requirements.

## Compliance maturity roadmap

| Stage | Target |
|---|---|
| Pilot | Data map, privacy notices, processor inventory, access controls, audit, retention baseline, incident plan and pilot agreements |
| Commercial Nigeria | NDPA/NDPC operating programme, DPO/privacy ownership, vendor risk, subject-right process, security testing and documented SDLC |
| Enterprise | SOC 2-style control evidence, ISO 27001 roadmap, formal business continuity, access certification and change control |
| International | Country/industry compliance matrix, GDPR and EU AI Act assessment where applicable, employment-AI localization, data-region strategy |

## Sensitive-feature rules

- Biometrics are optional, separately justified, protected and never the default attendance method.
- Do not infer emotion, honesty, personality, health or protected traits from face, voice or body language.
- Employment and disciplinary decisions require accountable humans.
- Credit/lending decisions are outside initial scope.
- Location tracking is limited to an explicit event and purpose; no continuous surveillance by default.

## Security release gates

- Threat model reviewed.
- Authorization matrix and tests complete.
- Cross-tenant test suite passes.
- No unresolved critical/high vulnerability without approved exception.
- Secrets and logging review complete.
- Backup/restore and incident runbooks tested.
- Privacy data classification and retention documented.
- Third-party provider risk reviewed.
