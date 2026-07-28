# Contributing

## Workflow

1. Create or select an issue with acceptance criteria.
2. Confirm product, security/privacy and data implications.
3. Create a short-lived branch.
4. Implement tests and documentation with the change.
5. Open a pull request using the template.
6. Obtain required reviews and pass automated gates.
7. Merge behind a feature flag where rollout risk warrants it.
8. Validate telemetry after deployment.

## Pull request expectations

- Small and focused.
- Links to issue and ADR where applicable.
- Explains user impact, permission/data changes and rollback.
- Includes screenshots for UI changes.
- Includes test evidence.
- Updates API/event/docs/runbooks when applicable.

## Architecture rules

- No new application or service without an ADR.
- No direct cross-domain writes.
- No tenant-owned query without tenant context.
- No provider-specific logic outside an adapter.
- No high-impact AI decision without governance approval.
- No production-sensitive data in test fixtures.

Read [Engineering Standards](docs/13_ENGINEERING_STANDARDS.md) and [Definition of Done](docs/17_DEFINITION_OF_DONE.md).
