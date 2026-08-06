# ADR-003: Deliver nine experiences through five frontend applications

- **Status:** Accepted
- **Date:** 2026-07-28
- **Owners:** Product Lead, Frontend Lead, Security Lead

## Context

Customers, candidates, employees, managers, branch staff, tenant administrators, platform operators and partners need different navigation and permissions. Nine independent codebases would duplicate design, authentication, forms and release work.

## Decision

Maintain five deployable frontends:

1. Public Experience PWA — customer and candidate experiences.
2. Workforce App — employee experience.
3. Operations Web — manager, executive and branch experiences.
4. Administration Web — organization admin, platform admin and partner routes with strict separation.
5. Kiosk/Signage App — locked-down check-in and displays.

## Consequences

- Shared components and faster maintenance.
- Role-specific shells and permission tests are mandatory.
- Platform-super-admin capabilities may move to a separate deployment as enterprise/security maturity grows.
- Shared code does not imply shared authorization; APIs enforce every permission.
