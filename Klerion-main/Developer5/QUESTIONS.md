# Developer 5 — Questions & Blockers

Record of open questions, missing requirements, team dependencies, and unresolved design topics.

---

## ❓ Active Architectural Questions Before Writing Code

1. **Q-002 (Discovery)**: What exact type signature does `req.tenantContext` take in Fastify requests, and is `tenantId` guaranteed on all authenticated requests?
2. **Q-003 (Audit Integration)**: Is the `AuditLogger` interface synchronous or asynchronous, and what structured event metadata keys are required by Developer 3's audit platform?
3. **Q-004 (Database ORM)**: For in-memory test doubles vs Drizzle ORM repositories, what is the exact pattern used in existing modules (`modules/domains/branch-flow` or `packages/persistence`)?

---

## 📋 Resolved Questions Log

| ID | Date | Topic | Question | Resolution | Resolved On |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Q-001 | 2026-07-30 | Workspace | How should Developer 5 track tasks and architecture? | Created dedicated `Developer5/` tracking directory. | 2026-07-30 |
