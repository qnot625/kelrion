# Klerion Feature Porting Status

This document records the controlled integration sequence for preserved feature branches.

## Integration order

1. Platform control plane and organisation entitlements — completed
2. Branch and service foundation — completed; advanced scheduling and waitlists — completed
3. Employee records and attendance — completed
4. Workforce lifecycle reconciliation — completed
5. Forms platform — completed
6. Workflow and approvals — completed
7. Internal service desk — completed
8. Queue domain and persistence — pending
9. Notifications and real-time events — pending
10. Persona-specific queue interfaces — pending
11. Final entitlement-aware UI consolidation — pending

Each step is implemented on an isolated branch, validated by backend and Company Console CI, and merged before the next dependency layer begins.
