# ADR-001: Start with a modular monolith

- **Status:** Accepted
- **Date:** 2026-07-28
- **Owners:** CTO / Principal Engineer

## Context

The product has 50 possible modules but a new team must deliver a coherent MVP quickly. Starting with many microservices would multiply deployment, testing, observability, data consistency and security work before service boundaries and load profiles are proven.

## Decision

Build one backend deployment organized into strict platform and domain modules. Use internal application interfaces, transactional boundaries, an outbox/event mechanism and schema ownership. Extract services only when documented triggers are met.

## Consequences

### Positive

- Faster end-to-end development.
- Simpler transactions and debugging.
- Lower operating cost.
- Easier enforcement of shared tenant/security services.
- A deliberate path to later service extraction.

### Negative

- Requires discipline to prevent module coupling.
- A single deployment can have a broader blast radius.
- Some independently scaling workloads may need worker separation early.

## Extraction triggers

Different scaling, isolation, SLO, technology or team ownership; or repeated release coupling that cannot be solved within modules.

## Security/privacy

Authorization and tenant context remain centralized but domain-level checks are required. Worker processes use the same policies and trusted context.
