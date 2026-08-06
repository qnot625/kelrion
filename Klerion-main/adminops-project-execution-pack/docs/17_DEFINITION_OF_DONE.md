# Definition of Ready and Done

## Story ready

A story is ready when it has:

- Named persona and problem.
- Business outcome and scope.
- Acceptance criteria and unhappy paths.
- Design or interaction decision where required.
- Role/permission matrix.
- Data objects and sensitivity classification.
- API/event impact.
- Dependencies and rollout flag.
- Telemetry definition.
- Test approach.

## Engineering done

- Code meets standards and review is complete.
- Unit/integration/component tests pass.
- Authorization and tenant-scoping tests pass.
- API/event schemas updated and compatible.
- Database migration is safe and rehearsed.
- Logs/metrics/traces added without sensitive data.
- Feature flag and rollback path exist where needed.
- Accessibility/localization requirements are addressed.
- Documentation and runbook are updated.

## Product done

- Acceptance criteria pass in staging.
- Analytics confirm the journey and outcome can be measured.
- Empty, error, offline and permission-denied states are designed.
- Notifications and copy are reviewed.
- Support and implementation teams can explain/configure the feature.

## Security/privacy done

- Threat/privacy review complete for the change risk.
- Data purpose, access, retention and deletion behavior documented.
- Sensitive fields and exports protected.
- No unresolved critical/high issue without formal exception.
- AI changes have evaluation and authority controls.

## Release done

- Regression, tenant-isolation and smoke tests pass.
- Operational dashboards and alerts are active.
- Migration, backup and rollback steps are approved.
- Customer/internal release notes are ready.
- On-call/support is prepared.
- Post-release validation owner and monitoring period are named.

## Pilot complete

- Baseline and target outcome are compared.
- User adoption and journey completion are reviewed.
- Data corrections and support load are acceptable.
- Security/privacy incidents are resolved.
- Conversion, iteration or stop decision is documented.
